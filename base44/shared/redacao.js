// Redação por IA dos capítulos da petição — porta backend de
// src/lib/trabalhista/redacaoTeses.js + módulos de contexto. Recebe
// `invokeLLM` por injeção (backend: base44.asServiceRole.integrations.Core.InvokeLLM)
// e `configs` (EspecialistaConfig) já carregados pelo orquestrador.

import { formatBRL, temDanoMoralConcreto } from './mathUtils.js';
import { BLOCO_ENGENHARIA_JURIDICA } from './engenhariaJuridica.js';
import { BLOCO_REGRAS_QUALIDADE } from './regrasQualidadeFav.js';
import { BLOCO_MATRIZ_TOPICOS } from './matrizTopicos.js';
import { blocoRegrasCriticas } from './regrasCriticas.js';
import { blocoReferencias, attrsDoCaso } from './referencias.js';

// Remove valores em R$ dos capítulos (o dinheiro é determinístico e só figura
// no rol de pedidos). PRESERVA as quebras de parágrafo: o colapso anterior de
// /\s{2,}/ engolia também os \n\n e todo capítulo da IA saía como um bloco
// único de texto — as peças geradas ficavam com parágrafos de 30 linhas,
// enquanto as da especialista têm parágrafos curtos. O docxtemplater já está
// com linebreaks: true, então a quebra preservada aqui chega ao .docx.
function sanitizarValoresIA(texto) {
  if (!texto) return texto;
  return texto
    // Valor COM o extenso entre parênteses tratado como UMA unidade. Sem isto
    // o numeral saía e o extenso ficava órfão no meio da frase
    // ("... (vinte e um mil quatrocentos e oitenta e dois reais) ...").
    .replace(/R\$\s*\d[\d.\s]*,\d{2}\s*\((?:[^()]*?reais[^()]*?)\)/gi, '')
    .replace(/R\$\s*\d[\d.\s]*,\d{2}/gi, '')
    .replace(/R\$\s*\d[\d.,]*/gi, '')
    // PREPOSIÇÃO ÓRFÃ. A remoção do valor deixava a regência pendurada: na
    // peça do Marcos saiu "no montante apurado de, correspondente a dez vezes
    // a maior remuneração" — com o "de" solto antes da vírgula. Só age quando a
    // preposição encostou na pontuação, situação que já é agramatical.
    .replace(/\b(?:de|em|por|a)\s*(?=[,;.])/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:])/g, '$1')
    .replace(/([,;])\s*\1+/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Rede de segurança para a regra "não repita o título do capítulo". A instrução
// no prompt é a correção principal; esta função existe porque, neste projeto,
// instrução sozinha já falhou várias vezes (o histórico do arquivo registra JSON
// cru e subtítulos numerados chegando à peça apesar da proibição expressa).
//
// Só remove a PRIMEIRA linha e apenas quando ela é inequivocamente um
// cabeçalho: começa por DO/DA/DOS/DAS/DE, não tem NENHUMA minúscula e é curta.
// Um parágrafo de verdade sempre tem minúsculas, então não é alcançado.
function removerTituloRepetido(texto) {
  if (!texto) return texto;
  const linhas = String(texto).split('\n');
  let i = 0;
  while (i < linhas.length && !linhas[i].trim()) i++;
  if (i >= linhas.length) return texto;
  const primeira = linhas[i].trim();
  const ehCabecalho = primeira.length <= 90
    && /^(?:DO|DA|DOS|DAS|DE)\s+\S/.test(primeira)
    && !/[a-zà-ÿ]/.test(primeira);
  if (!ehCabecalho) return texto;
  return linhas.slice(i + 1).join('\n').replace(/^\n+/, '');
}

const flag = (v) => !!v;
const soDigitos = (s) => (s || '').replace(/\D/g, '');

// Mesma lógica de src/features/entrevista/lib/dadosTemplate.js
// (jornadaCruzaNoturno) — mudou lá, mudar aqui também.
function jornadaCruzaNoturno(jornadaTxt) {
  const m = /(\d{1,2})[:h]?(\d{2})?\s*(?:[àa]s?|-)\s*(\d{1,2})[:h]?(\d{2})?/i.exec(jornadaTxt || '');
  if (!m) return false;
  const inicio = Number(m[1]);
  const fim = Number(m[3]);
  const dentroDaJanela = (h) => h >= 22 || h < 5;
  if (dentroDaJanela(inicio) || dentroDaJanela(fim)) return true;
  return fim < inicio;
}

export function computeFlags(caso = {}, attrs = {}, dadosReceita = []) {
  const d = {};
  const receita = (cnpj) => (dadosReceita || []).find((r) => r && !r.erro && soDigitos(r.cnpj) === soDigitos(cnpj));
  const r2 = receita(caso.recl2_cnpj);
  const tipo = caso.tipo_dispensa || attrs.tipo_dispensa || 'sem_justa_causa';
  const escalaTxt = `${caso.escala || ''} ${caso.jornada_horario || ''}`;
  const ehVigilante = /vigilante|vigil/i.test(caso.funcao || attrs.funcao || '');
  const mesmoFatoDesvio =
    caso.tem_desvio && caso.acumulo_atividades && caso.desvio_atividades &&
    String(caso.acumulo_atividades).toLowerCase() === String(caso.desvio_atividades).toLowerCase();

  d.tem_tomadora = flag(caso.recl2_nome || r2 || attrs.tem_tomadora);
  d.sem_justa_causa = tipo === 'sem_justa_causa';
  d.rescisao_indireta = tipo === 'rescisao_indireta';
  d.coacao_demissao = tipo === 'nulidade_pedido_demissao';
  d.reversao_justa_causa = tipo === 'reversao_justa_causa';
  d.tem_capitulo_rescisao = ['rescisao_indireta', 'nulidade_pedido_demissao', 'reversao_justa_causa'].includes(tipo);
  d.acumulo_funcao = flag(caso.tem_acumulo && caso.acumulo_atividades && !mesmoFatoDesvio);
  d.desvio_funcao = flag(caso.tem_desvio);
  d.gratificacao_funcao = flag(caso.tem_gratificacao);
  d.escala_12x36 = /12\s*x\s*36/i.test(escalaTxt);
  d.escala_4x2 = /\b(4\s*x\s*2|6\s*x\s*2)\b/i.test(escalaTxt);
  d.adicional_noturno = flag(caso.tem_adic_noturno) || jornadaCruzaNoturno(caso.jornada_horario || caso.escala || '');
  d.integracao_por_fora = flag(caso.tem_integracao_por_fora);
  d.periculosidade = flag(caso.tem_periculosidade) || ehVigilante;
  d.dez_minutos_cct = flag(caso.tem_dez_min_cct) || ehVigilante;
  d.salarios_em_aberto = flag(caso.tem_salarios_aberto);
  d.assiduidade = flag(caso.tem_assiduidade);
  d.vale_transporte = flag(caso.tem_vale_transporte);
  d.auxilio_alimentacao = flag(caso.tem_auxilio_alimentacao);
  d.doenca_ocupacional = flag(caso.tem_doenca);
  d.insalubridade = flag(caso.tem_insalubridade);
  d.folgas_trabalhadas = flag(caso.tem_ft || caso.val_ft || caso.ft_qtd_media);
  d.tem_ferias_vencidas = flag(caso.tem_ferias_vencidas);
  d.cct_ano = caso.cct_ano || '';
  d.sindicato = caso.sindicato || '';
  return d;
}

export const ESPECIALISTAS = [
  // Só há tese rescisória a redigir quando a modalidade PRECISA ser construída
  // (rescisão indireta, nulidade do pedido de demissão, reversão de justa causa).
  // Na dispensa sem justa causa o modelo já traz o parágrafo determinístico do
  // contrato — com o salário — e o capítulo da IA saía junto, repetindo os mesmos
  // fatos logo abaixo. Duplicidade vista na peça gerada em 08/2026.
  // DESATIVADO (ago/2026), pelo mesmo motivo de jornada e Súmula 331: o modelo
  // .docx já traz o texto do escritório para as QUATRO modalidades, em ramos
  // condicionais dentro de "DO CONTRATO DE TRABALHO" ({{#sem_justa_causa}},
  // {{#rescisao_indireta}}, {{#reversao_justa_causa}}, {{#coacao_demissao}}).
  // Com o capítulo da IA ligado, as três modalidades que exigem tese saíam com
  // os mesmos fatos duas vezes. Espelha src/features/entrevista/lib/redacaoTeses.js.
  { numero: 'espinha', nome: 'Espinha da rescisão', campo: 'BLOCO_ESPINHA_RESCISAO', ativo: () => false,
    ativoOriginal: (d) => !!d.tem_capitulo_rescisao,
    instrucao: 'Escreva o capítulo COMPLETO da modalidade de rescisão aplicável (conforme tipo_dispensa), em prosa jurídica fluida e SUBSTANCIAL: (1) FATOS — narre a situação que configura a modalidade; (2) FUNDAMENTO LEGAL/NORMATIVO — dispositivos da CLT (art. 482, 483, 484-A, 165 etc.); (3) JURISPRUDÊNCIA — quando relevante; (4) PEDIDO/CONCLUSÃO — requerimento com os reflexos cabíveis. NÃO escreva jornada, dano moral nem verbas calculadas.',
    promptPadrao: 'Você é advogado(a) trabalhista especialista em teses rescisórias. Redija o capítulo COMPLETO em prosa jurídica fluida e argumentativa.' },
  // jornada e sumula331 DESATIVADOS (revisão da especialista, ago/2026): o
  // modelo já tem o texto padrão do escritório para os dois. A jornada dela tem
  // 54 palavras e foi aprovada; a IA entregava 988 ("fora da estrutura"). O
  // capítulo da Súmula 331 é idêntico nas três peças de referência. Espelha
  // src/features/entrevista/lib/redacaoTeses.js.
  { numero: 'jornada', nome: 'Jornada e horas extras', campo: 'BLOCO_JORNADA', ativo: () => false,
    instrucao: 'Escreva o capítulo COMPLETO de "DA JORNADA DE TRABALHO / DAS HORAS EXTRAS": (1) narre horário/escala efetivos e a prorrogação habitual sem contraprestação; (2) fundamente horas extras excedentes da 8ª diária/44ª semanal (art. 59 CLT; adicional convencional real da CCT — nunca presuma; na falta use [adicional conforme CCT]; Súmula 85); (3) jurisprudência; (4) pedido de diferenças de horas extras COM reflexos (DSR, aviso, férias+1/3, 13º, FGTS+40%) de forma qualitativa, SEM R$. NÃO escreva descaracterização da escala, art. 71, noturno, 10 minutos, periculosidade nem DSR autônomo (seções fixas do template).',
    promptPadrao: 'Você é advogado(a) trabalhista especialista em jornada e horas extras. Redija o capítulo COMPLETO em prosa argumentativa.' },
  { numero: 'dano_moral', nome: 'Dano moral', campo: 'BLOCO_DANO_MORAL', ativo: (d, c) => temDanoMoralConcreto(c),
    instrucao: 'Escreva a narrativa COMPLETA dos fatos do dano moral em parágrafos articulados e coerentes. Conecte TODOS os abusos concretos (desvio/acúmulo exaustivo, supressão de intervalos, pagamentos por fora, descontos indevidos, perseguição/humilhação), o contexto, a habitualidade e o impacto sobre a dignidade do autor. NÃO escreva a fundamentação constitucional/doutrinária (já no template). NÃO trate jornada/rescisão/verbas. NÃO cite R$.',
    promptPadrao: 'Você é advogado(a) trabalhista especialista em dano moral. Redija a narrativa concreta em prosa articulada, sem fundamentação doutrinária nem valores.' },
  { numero: 'enquadramento', nome: 'Enquadramento funcional', campo: 'BLOCO_ENQUADRAMENTO', ativo: (d) => !!(d.desvio_funcao || d.acumulo_funcao || d.gratificacao_funcao),
    instrucao: 'Escreva o capítulo COMPLETO de enquadramento funcional em prosa SUBSTANCIAL: (1) FATOS — atividades que configuram desvio/acúmulo/gratificação; (2) FUNDAMENTO — CLT e multa/adicional convencional da CCT; (3) JURISPRUDÊNCIA; (4) PEDIDO — adicional/multa com reflexos. Desvio/acúmulo/gratificação são ALTERNATIVOS — nunca cumule desvio com acúmulo (bis in idem). NÃO trate jornada/dano/rescisão.',
    promptPadrao: 'Você é advogado(a) trabalhista especialista em desvio, acúmulo e gratificação. Redija o capítulo COMPLETO em prosa argumentativa.' },
  { numero: 'sumula331', nome: 'Responsabilidade subsidiária (Súmula 331)', campo: 'BLOCO_SUMULA_331', ativo: () => false,
    instrucao: 'Escreva o capítulo COMPLETO de responsabilidade subsidiária da 2ª reclamada (tomadora): (1) FATOS — terceirização e inserção na atividade-fim; (2) FUNDAMENTO — Súmula 331 TST e arts. 4º/5º DL 200/1967; (3) JURISPRUDÊNCIA; (4) PEDIDO — condenação subsidiária. USE SEMPRE "subsidiariamente" — nunca "solidária". NÃO trate outros tópicos.',
    promptPadrao: 'Você é advogado(a) trabalhista especialista em terceirização e Súmula 331. Redija o capítulo COMPLETO em prosa argumentativa.' },
  { numero: 'insalubridade', nome: 'Insalubridade / ambiente de trabalho', campo: 'BLOCO_INSALUBRIDADE', ativo: (d) => !!d.insalubridade,
    instrucao: 'Escreva o capítulo COMPLETO de insalubridade: (1) FATOS — condições insalubres e impacto na saúde; (2) FUNDAMENTO — arts. 189/192 CLT e NR-15; (3) JURISPRUDÊNCIA; (4) PEDIDO — adicional (10/20/40% do salário mínimo) com reflexos. NÃO cite R$. NÃO trate dano moral/jornada/rescisão.',
    promptPadrao: 'Você é advogado(a) trabalhista especialista em insalubridade. Redija o capítulo COMPLETO em prosa argumentativa.' },
  { numero: 'multas_convencionais', nome: 'Multas convencionais', campo: 'BLOCO_MULTAS_CONVENCIONAIS', ativo: (d, c) => !!(c.cct_ano || c.sindicato || d.periculosidade || d.assiduidade || d.folgas_trabalhadas || d.desvio_funcao || d.acumulo_funcao || d.dez_minutos_cct),
    instrucao: (d, c) =>
      'Escreva o capítulo COMPLETO de "DAS MULTAS CONVENCIONAIS", fundamentando a aplicação da multa convencional por descumprimento das obrigações da CCT' +
      (c.cct_ano ? ` (vigência ${c.cct_ano} e anteriores)` : '') +
      (c.cct_clausula_multa ? `, nos termos da cláusula ${c.cct_clausula_multa}` : ', nos termos da cláusula de penalidade') +
      '. Desenvolva em parágrafos coesos (natureza sancionatória/protetiva, irrelevância da culpa). Encerre introduzindo a lista de infrações ("...a seguir elencadas:"). NÃO escreva a lista (já no template). NÃO cite R$.',
    promptPadrao: 'Você é advogado(a) trabalhista especialista em direito coletivo e multas convencionais. Redija o capítulo COMPLETO sem R$ e sem a lista de infrações.' },
];

const MODELOS_VALIDOS = { claude_opus_4_6: 'claude_opus_4_6', claude_sonnet_4_6: 'claude_sonnet_4_6', gemini_3_1_pro: 'gemini_3_1_pro' };
function modeloUnico(configs) {
  for (const cfg of configs || []) {
    if (MODELOS_VALIDOS[cfg?.modelo_ia]) return MODELOS_VALIDOS[cfg.modelo_ia];
  }
  return 'claude_sonnet_4_6';
}

function resumoCalculos(calculos) {
  const linhas = (calculos || []).filter((c) => c.valor != null).map((c) => `- ${c.item}: ${formatBRL(c.valor)} (${c.memoria})`);
  return linhas.length ? linhas.join('\n') : '(sem valores calculados disponíveis)';
}

// Linhas de grounding a partir da CCT CADASTRADA (entidade CCT). Os campos
// `adicionais` e `beneficios` são curados à mão e já trazem o número da cláusula
// no próprio texto ("(Cl. 17ª)"), que é exatamente o que faltava à IA.
function linhasCctCadastrada(cctCadastrada) {
  if (!cctCadastrada) return [];
  const out = [];
  for (const grupo of ['adicionais', 'beneficios']) {
    const obj = cctCadastrada[grupo];
    if (!obj || typeof obj !== 'object') continue;
    for (const [chave, valor] of Object.entries(obj)) {
      const texto = String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
      if (!texto || /^OBS/i.test(chave)) continue;
      const m = /\(\s*Cl\.?\s*([\dºª]+[^)]*)\)/i.exec(texto);
      const ref = m ? `Cl. ${m[1].trim()}` : '(sem número — NÃO cite número para este item)';
      out.push(`- ${ref} — ${chave}: ${texto.slice(0, 240)}`);
    }
  }
  return out;
}

// O grounding sai de DUAS fontes: a base cadastrada (curada, prioritária) e as
// cláusulas devolvidas pela API. Antes vinha SÓ da API — e quando ela não
// trazia o tema, a IA preenchia a lacuna INVENTANDO: na peça do Marcos citou
// "cláusula sexta do Termo Aditivo CCT Vigilância SP 2025", documento que não
// existe na base, e pôs a 40ª (intervalo) no lugar da 41ª (folgas 12x36).
function resumoCct(dadosCct, cctCadastrada) {
  const daBase = linhasCctCadastrada(cctCadastrada);
  const cl = dadosCct?.clausulas || [];
  const daApi = cl.slice(0, 12).map((c) => {
    const ref = c.clausula_ref || '(cláusula)';
    const tit = c.titulo || '';
    const corpo = (c.ementa || c.texto || c.conteudo || '').replace(/\s+/g, ' ').slice(0, 240);
    return `- ${ref} — ${tit}: ${corpo}`;
  });
  if (!daBase.length && !daApi.length) {
    return '(nenhuma cláusula de CCT disponível — NÃO cite número de cláusula; use apenas dispositivos legais e Súmulas.)';
  }
  const partes = [];
  if (daBase.length) {
    partes.push(`CONVENÇÃO CADASTRADA E CONFERIDA${cctCadastrada?.nome ? ` (${cctCadastrada.nome})` : ''} — fonte PRIORITÁRIA:`);
    partes.push(daBase.join('\n'));
  }
  if (daApi.length) {
    if (daBase.length) partes.push('');
    partes.push('CLÁUSULAS RETORNADAS PELA CONSULTA À CCT:');
    partes.push(daApi.join('\n'));
  }
  return partes.join('\n');
}

const CAMPOS_CASO = ['recl_nome', 'recl_genero', 'funcao', 'tipo_dispensa', 'data_admissao', 'data_rescisao', 'salario', 'maior_remuneracao', 'escala', 'jornada_horario', 'intervalo_usufruido', 'prorrogacao_jornada', 'ft_qtd_media', 'acumulo_atividades', 'desvio_atividades', 'dano_fatos', 'dano_supervisor', 'recl1_nome', 'recl2_nome', 'sindicato', 'cct_ano', 'comarca_uf', 'local_prestacao'];
function resumoCaso(caso) {
  const obj = {};
  for (const k of CAMPOS_CASO) if (caso[k] != null && caso[k] !== '') obj[k] = caso[k];
  return JSON.stringify(obj, null, 2);
}

function municipiosDoCaso(caso) {
  const out = [];
  // caso.comarca NÃO EXISTE: o mapeamento do webhook grava `comarca_uf`
  // ("Cidade/UF" ou só a UF). A lista saía vazia sempre que o endereço de
  // prestação não casasse com o regex abaixo, e a orientação de competir ao
  // TRT-2 — a trava que existe para não mandar processo de São Paulo para
  // Campinas — simplesmente não entrava no prompt.
  const daComarca = String(caso.comarca_uf || caso.comarca || '').split('/')[0].trim();
  if (daComarca.length > 2) out.push(daComarca);
  const m = /([A-Za-zÀ-ÿ\s'.-]+?)\s*[-/]\s*[A-Z]{2}\b/.exec(caso.local_prestacao || '');
  if (m) out.push(m[1].trim());
  // comarca_uf e local_prestacao costumam apontar a mesma cidade: sem o dedupe
  // a instrução saía como "(Itapecerica da Serra, Itapecerica da Serra)".
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))];
}

function montarContextoCompartilhado({ caso, calculos, dadosCct, cctCadastrada, blocosAtivos, referenciasTexto = '' }) {
  return [
    'CONTEXTO COMPLETO DO CASO (leia tudo; você escreverá TODOS os capítulos ativos em uma única resposta JSON).',
    BLOCO_ENGENHARIA_JURIDICA,
    BLOCO_REGRAS_QUALIDADE,
    BLOCO_MATRIZ_TOPICOS,
    blocoRegrasCriticas({ municipios: municipiosDoCaso(caso) }),
    '',
    'REGRAS DE SEGURANÇA (obrigatórias):',
    '- Argumente SOMENTE sobre fatos presentes no caso. Se faltar essencial, use [CONFIRMAR: ...].',
    '- PROIBIÇÃO DE CÁLCULO FINAL: não calcule nem some o valor da causa; não escreva "Dá-se à causa o valor de...", "Pede deferimento", data nem assinatura — tudo determinístico.',
    '- NÃO cite R$ nos capítulos. Valores são calculados por código e figuram APENAS no rol de pedidos. Mencione reflexos de forma qualitativa.',
    '- VEDAÇÃO A PLACEHOLDERS: nunca lacunas "[A PREENCHER]"; se faltar dado, use [CONFIRMAR: ...].',
    '- CAUSA DE PEDIR ALINHADA: use EXCLUSIVAMENTE o endereço de prestação da Tomadora (local_prestacao) na Competência; NUNCA o residencial do autor.',
    '- Cite SOMENTE cláusulas listadas em CLÁUSULAS DA CCT, com o número EXATO que aparece ali. Nunca invente número, nunca cite instrumento coletivo (CCT ou termo aditivo) que não esteja listado, e nunca reaproveite numeração de outra categoria ou de outro ano. Se o tema não constar da lista, descreva a violação SEM citar cláusula.',
    '- Escreva APENAS os capítulos solicitados. NÃO escreva endereçamento, qualificação, valor da causa, honorários, data ou fecho.',
    // Esta regra MANDAVA o oposto do padrão do escritório. O modelo de
    // referência "PADRÃO OURO" (entidade ModeloReferencia) diz: "capítulos curtos
    // e objetivos — 2 a 6 parágrafos por tópico, SEM subdivisão numerada em
    // FATOS/FUNDAMENTO/JURISPRUDÊNCIA/PEDIDO, prosa corrida e direta". A IA
    // obedecia ao prompt e imprimia "1. DOS FATOS", "2. FUNDAMENTO LEGAL" como
    // subtítulos — foi o que a revisão apontou como "fora da estrutura".
    '- SEM SUBTÍTULOS E SEM SUBDIVISÃO NUMERADA: o capítulo é PROSA CORRIDA de 2 a 6 parágrafos. Cubra, nessa ordem e SEM rotular, os fatos do caso, o fundamento (CLT, Súmulas e cláusula da CCT citados em linha, sem transcrever ementas longas) e o pedido com os reflexos. NUNCA escreva "1. DOS FATOS", "2. FUNDAMENTO LEGAL", "3. JURISPRUDÊNCIA" nem qualquer título dentro do capítulo — o padrão do escritório proíbe expressamente essa subdivisão.',
    // A regra acima proibia "qualquer título dentro do capítulo" e a IA entendeu
    // como subtítulo interno: seguiu abrindo o texto repetindo o CABEÇALHO do
    // capítulo. Na peça do Marcos "DO DANO MORAL", "DO DESVIO DE FUNÇÃO" e "DAS
    // MULTAS CONVENCIONAIS" saíram DUAS vezes cada — uma do modelo, uma da IA.
    '- NÃO REPITA O TÍTULO DO CAPÍTULO: o modelo .docx JÁ imprime o cabeçalho (ex.: "DO DANO MORAL", "DO DESVIO DE FUNÇÃO", "DAS MULTAS CONVENCIONAIS"). Comece a resposta DIRETO no primeiro parágrafo do texto corrido. Escrever o título de novo faz o cabeçalho aparecer duplicado na peça.',
    '- REDAÇÃO NATURAL: parágrafos jurídicos coesos e fluídos, não enlatados; cada capítulo SUBSTANCIAL e COMPLETO.',
    '- CONCORDÂNCIA DE GÊNERO (STRICT): recl_genero "M" ou "F" — concordância PERFEITA em todo o texto. M → "o reclamante" (proibido feminino); F → o inverso. "reclamada" (empresa) nunca troca. "seu advogado" sempre masculino.',
    '',
    'DADOS DO CASO:', resumoCaso(caso), '',
    'VALORES CALCULADOS (determinísticos — USE ESTES, NÃO RECALCULE):', resumoCalculos(calculos), '',
    'CLÁUSULAS DA CCT (grounding — só cite estas):', resumoCct(dadosCct, cctCadastrada), '',
    // Este caminho (webhook) NÃO mandava referência nenhuma: a IA escrevia sem
    // nunca ter visto uma peça do escritório, enquanto a tela mandava um resumo.
    // Era a maior diferença de qualidade entre os dois caminhos.
    ...(referenciasTexto ? [referenciasTexto, ''] : []),
    `CAPÍTULOS ATIVOS NESTA PEÇA: ${blocosAtivos.join(', ')}.`,
  ].join('\n');
}

// InvokeLLM no backend envelopa o resultado em { response: ... }, às vezes
// como string JSON, às vezes como objeto. Desembrulha para chegar aos campos.
// Remove cercas de código (```json ... ```) que alguns modelos põem em volta
// do JSON — sem isso o parse falha e o envelope inteiro vaza como texto.
function limparCercas(s) {
  return String(s).replace(/^\s*```[a-z]*\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function desembrulhar(r) {
  let obj = (r && typeof r === 'object' && !Array.isArray(r)) ? r : {};
  if (obj.response != null) {
    if (typeof obj.response === 'string') {
      try { obj = JSON.parse(limparCercas(obj.response)); } catch (e) { /* mantém obj */ }
    } else if (typeof obj.response === 'object' && !Array.isArray(obj.response)) {
      obj = obj.response;
    }
  }
  if (typeof obj === 'string') {
    try { obj = JSON.parse(limparCercas(obj)); } catch (e) { obj = {}; }
  }
  return obj && typeof obj === 'object' ? obj : {};
}

// Desescapa sequências que só fazem sentido DENTRO de JSON. Sem isto, um
// capítulo resgatado do envelope sai com "\\n" impresso como texto na peça.
function desescapar(s) {
  return String(s)
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

// Último desembrulho: se o texto do capítulo ainda for um JSON cru
// ('{ "BLOCO_X": "..." }'), extrai o valor de dentro em vez de deixar o
// envelope vazar para a peça — foi exatamente o que aconteceu numa geração.
function desempacotarTexto(texto, campo) {
  const t = String(texto || '').trim();
  if (!(t.startsWith('{') && t.includes('"'))) return desescapar(t);
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj === 'object') {
      const direto = obj[campo];
      if (typeof direto === 'string' && direto.trim()) return direto.trim();
      const str = Object.values(obj).find((v) => typeof v === 'string' && v.trim().length > 80);
      if (str) return str.trim();
    }
  } catch (e) { /* JSON inválido — cai no resgate por regex abaixo */ }
  // RESGATE. O JSON.parse acima falha quando o modelo deixa aspas internas sem
  // escape no meio do capítulo (ex.: cláusula `intitulada "PRAZOS E OUTRAS
  // MULTAS"`). Antes, esta função devolvia o texto cru e o envelope INTEIRO ia
  // para a peça: foi o que aconteceu no caso Luciano, em que BLOCO_SUMULA_331 e
  // BLOCO_MULTAS_CONVENCIONAIS saíram como '{ "BLOCO_X": "...\\n\\n..." }'
  // dentro do .docx. Aqui extraímos o valor entre o primeiro `"campo":` e o
  // fecho, e desescapamos as sequências.
  const fechado = /^\{\s*"[A-Za-z0-9_]+"\s*:\s*"([\s\S]*)"\s*\}$/.exec(t);
  if (fechado) return desescapar(fechado[1]).trim();
  // Envelope truncado (o modelo estourou o limite de saída no meio do texto).
  const aberto = /^\{\s*"[A-Za-z0-9_]+"\s*:\s*"([\s\S]*)$/.exec(t);
  if (aberto) return desescapar(aberto[1].replace(/"\s*\}?\s*$/, '')).trim();
  return desescapar(t);
}

// Defeitos que NUNCA podem chegar ao documento final. Quem chama usa isto para
// mandar a peça para revisão explícita em vez de marcá-la como concluída.
const PADROES_DEFEITO = [
  [/\{\s*"(BLOCO_|PEDIDOS_)/, 'envelope JSON cru no texto do capítulo'],
  [/\\n|\\r/, 'quebra de linha literal (\\n) no texto'],
  [/```/, 'cerca de código markdown (```) no texto'],
  [/\[A PREENCHER/i, 'marcador [A PREENCHER] não resolvido'],
  [/\[CONFIRMAR:/i, 'pendência [CONFIRMAR: ...] não resolvida'],
  [/\[(INSERIR|A COMPLETAR)/i, 'placeholder de redação não resolvido'],
  // TEXTO TRUNCADO. O capítulo de desvio da peça do Marcos terminou em
  // "...(SEEVISSP x SESVESP), intitulada" e foi protocolado assim. Capítulo
  // íntegro fecha em pontuação terminal — ponto, ponto e vírgula, dois-pontos
  // (o capítulo de multas encerra em "a seguir elencadas:"), interrogação,
  // exclamação, fecha-parênteses ou fecha-aspas. Terminar em letra, dígito ou
  // vírgula denuncia corte no meio da frase.
  [/[A-Za-zÀ-ÿ0-9,]\s*$/, 'capítulo termina sem pontuação final (texto truncado)'],
];

export function problemasNosBlocos(blocos = {}) {
  const out = [];
  for (const [campo, valor] of Object.entries(blocos || {})) {
    const txt = Array.isArray(valor) ? valor.join(' ') : String(valor == null ? '' : valor);
    if (!txt) continue;
    for (const [re, descricao] of PADROES_DEFEITO) {
      if (re.test(txt)) out.push(`${campo}: ${descricao}`);
    }
  }
  return out;
}

// Pega o valor do capítulo pedido; se o modelo nomeou a chave de outro jeito,
// aceita o único valor útil da resposta (string longa ou array).
function extrairCampo(obj, campo) {
  const direto = obj?.[campo];
  if (typeof direto === 'string' && direto.trim()) return direto.trim();
  if (Array.isArray(direto) && direto.length) return direto;
  const valores = Object.values(obj || {});
  const arr = valores.find((v) => Array.isArray(v) && v.length);
  if (campo === 'PEDIDOS_MULTAS' && arr) return arr;
  const str = valores.find((v) => typeof v === 'string' && v.trim().length > 80);
  return str ? str.trim() : null;
}

export async function redigirTesesIA({ caso, calculos, dadosCct, cctCadastrada, dados, configs = [], modelos = [], attrs = null, invokeLLM }) {
  const ativos = ESPECIALISTAS.filter((e) => { try { return e.ativo(dados, caso); } catch { return false; } });
  if (!ativos.length) return { blocos: {}, especialistasUsados: [] };

  const cfgPorNumero = new Map((configs || []).map((c) => [String(c.numero), c]));
  const blocosAtivos = ativos.map((e) => e.nome);
  // Exemplo real do capítulo correspondente nas peças revisadas, só para os
  // capítulos que esta peça vai escrever — mandar a peça inteira afogaria o
  // exemplo no texto padrão que o modelo .docx já imprime.
  let referenciasTexto = '';
  try {
    referenciasTexto = blocoReferencias({
      modelos,
      attrs: attrs || attrsDoCaso(caso, dados),
      campos: ativos.map((e) => e.campo),
    });
  } catch (e) {
    referenciasTexto = '';
  }
  const contexto = montarContextoCompartilhado({ caso, calculos, dadosCct, cctCadastrada, blocosAtivos, referenciasTexto });

  const properties = {};
  const tarefaPorCampo = {};
  const tarefas = ativos.map((e) => {
    const cfg = cfgPorNumero.get(e.numero);
    const promptSistema = cfg?.prompt_sistema || e.promptPadrao;
    const instrucao = typeof e.instrucao === 'function' ? e.instrucao(dados, caso) : e.instrucao;
    properties[e.campo] = { type: 'string', description: `Capítulo: ${e.nome}. ${instrucao} Papel: ${promptSistema}` };
    const tarefa = `### ${e.campo} — ${e.nome}\nPapel: ${promptSistema}\nTarefa: ${instrucao}`;
    tarefaPorCampo[e.campo] = tarefa;
    return tarefa;
  });

  const multasAtivo = ativos.some((e) => e.numero === 'multas_convencionais');
  if (multasAtivo) {
    properties.PEDIDOS_MULTAS = {
      type: 'array', items: { type: 'string' },
      description: 'Lista de violações convencionais específicas, uma frase curta por item terminando em ";". Cite o número da cláusula APENAS quando grounded em CLÁUSULAS DA CCT. Sem cláusula, descreva a violação legal. 3 a 10 itens. Sem R$.',
    };
    tarefaPorCampo.PEDIDOS_MULTAS = '### PEDIDOS_MULTAS — Lista individualizada de multas convencionais\nPapel: Especialista em direito coletivo.\nTarefa: Liste em array de strings as violações convencionais específicas deste caso (cite cláusula só quando grounded; sem cláusula, descreva sem número). Adapte às teses ativas.';
    tarefas.push('### PEDIDOS_MULTAS — Lista individualizada de multas convencionais\nPapel: Especialista em direito coletivo.\nTarefa: Liste em array de strings as violações convencionais específicas deste caso (cite cláusula só quando grounded; sem cláusula, descreva sem número). Adapte às teses ativas.');
  }

  const model = modeloUnico(configs);

  // Uma chamada por capítulo, em paralelo. Uma única chamada com todos os
  // capítulos estourava o limite de tempo do backend (120s).
  const campos = Object.keys(properties);
  const erros = [];
  const respostas = await Promise.all(campos.map(async (campo) => {
    const prompt = [
      contexto, '',
      '=============================',
      `TAREFA: escreva SOMENTE o capítulo "${campo}" e devolva um JSON com essa única chave.`,
      'O valor é o texto do capítulo em português jurídico, sem rótulo e sem comentários.',
      'Não inclua texto fora do JSON. Sem informação suficiente: string vazia.',
      '', tarefaPorCampo[campo] || '',
    ].join('\n');
    const schema = { type: 'object', properties: { [campo]: properties[campo] } };
    // Duas tentativas: modelos ocasionalmente devolvem a chave com outro nome
    // ou vazia — sem isso o capítulo simplesmente some da peça.
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        const bruto = desembrulhar(await invokeLLM({ prompt, model, response_json_schema: schema }));
        const valor = extrairCampo(bruto, campo);
        if (valor) return { [campo]: valor };
      } catch (e) {
        if (tentativa === 1) erros.push(`${campo}: ${e?.message || 'falha InvokeLLM'}`);
      }
    }
    if (!erros.some((x) => x.startsWith(`${campo}:`))) erros.push(`${campo}: capítulo veio vazio`);
    return {};
  }));
  const obj = Object.assign({}, ...respostas);

  const blocos = {};
  for (const e of ativos) {
    const texto = typeof obj[e.campo] === 'string' ? desempacotarTexto(obj[e.campo], e.campo) : '';
    if (texto) blocos[e.campo] = sanitizarValoresIA(removerTituloRepetido(texto));
  }
  if (multasAtivo && Array.isArray(obj.PEDIDOS_MULTAS)) {
    const lista = obj.PEDIDOS_MULTAS.map((s) => (typeof s === 'string' ? sanitizarValoresIA(s.trim()) : '')).filter(Boolean);
    if (lista.length) blocos.pedidos_multas = lista;
  }
  return {
    blocos,
    especialistasUsados: blocosAtivos,
    erro: erros.length ? erros.join(' | ') : null,
    objKeys: Object.keys(obj || {}),
  };
}