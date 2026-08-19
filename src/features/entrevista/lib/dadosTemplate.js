import { formatBRL, round2, brlComExtenso, temDanoMoralConcreto } from './mathUtils';
import { limparTravessoesDosDados } from '../../../../base44/shared/texto.js';

// ============================================================
// FONTE ÚNICA DE DADOS DA PETIÇÃO
// Alinhado ao MODELO-MESTRE (.docx docxtemplater) do escritório.
// Alimenta o PREVIEW e a EXPORTAÇÃO (docxtemplater). A IA NÃO gera
// o documento: valores são determinísticos (mathUtils); partes/contrato
// vêm do parser; textos livres do caso são poucos (dano moral etc.);
// as FLAGS ligam/desligam as seções {{#flag}}...{{/flag}} do .docx.
// ============================================================

// Rótulo do item calculado (mathUtils) -> campo {{VALOR_*}} do template
const CALC_CAMPO = {
  'Aviso prévio indenizado': 'VALOR_AVISO_PREVIO',
  'Saldo de salário': 'VALOR_SALDO_SALARIO',
  'Multa do art. 467 da CLT': 'VALOR_MULTA_467',
  '13º proporcional': 'VALOR_13',
  'Férias proporcionais + 1/3': 'VALOR_FERIAS',
  'FGTS do período (8%)': 'VALOR_FGTS',
  'Multa de 40% do FGTS': 'VALOR_MULTA_40',
  'Multa de 20% do FGTS (acordo)': 'VALOR_MULTA_40',
  'Dano moral (10x remuneração)': 'VALOR_DANO_MORAL_10X',
  'Folgas trabalhadas (100%)': 'VALOR_FT',
  'Reflexo DSR sobre FT (1/6)': 'VALOR_DSR',
  // As folgas e a integração passaram a levar a matriz inteira de reflexos
  // (mathUtils), como no rol da especialista — antes as folgas tinham só DSR a
  // 1/6 e a integração saía sem reflexo nenhum.
  'Reflexos de Folgas trabalhadas (100%)': 'VALOR_FT_REFLEXOS',
  'Reflexos de Integração de valores por fora': 'VALOR_INTEGRACAO_REFLEXOS',
  'Acúmulo de função (20%)': 'VALOR_ACUMULO',
  'Bonificação de assiduidade (diferença)': 'VALOR_ASSIDUIDADE',
  'Integração de valores por fora': 'VALOR_INTEGRACAO',
  'Auxílio-alimentação nas folgas': 'VALOR_AUX_ALIM_TOTAL',
  'Vale-transporte nas folgas': 'VALOR_VT_TOTAL',
  'Gratificação de função (10%)': 'VALOR_GRATIFICACAO',
  'Gratificação/bônus de função': 'VALOR_GRATIFICACAO',
  'Desvio de função (50%)': 'VALOR_DESVIO',
  'Multa do art. 477 da CLT': 'VALOR_MULTA_477',
  'Salários em aberto': 'VALOR_SALARIOS_ABERTO',
  'Honorários advocatícios (15%)': 'VALOR_HONORARIOS',
  // Verbas por hora, agora estimadas (mathUtils) em vez de "a apurar em
  // liquidação". As tags abaixo ainda NÃO existem no .docx-mestre: os valores
  // já entram no VALOR_CAUSA_TOTAL e aparecem na tela, mas para saírem no rol
  // de pedidos o modelo precisa ser tokenizado com elas.
  'Horas extras — prorrogação da jornada': 'VALOR_HE_PRORROGACAO',
  'Reflexos de Horas extras — prorrogação da jornada': 'VALOR_HE_PRORROGACAO_REFLEXOS',
  'Intervalo intrajornada (art. 71 da CLT)': 'VALOR_ART71',
  'Reflexos de Intervalo intrajornada (art. 71 da CLT)': 'VALOR_ART71_REFLEXOS',
  'Adicional noturno e hora noturna reduzida': 'VALOR_NOTURNO',
  'Reflexos de Adicional noturno e hora noturna reduzida': 'VALOR_NOTURNO_REFLEXOS',
  '10 minutos de descanso (cláusula 33º da CCT)': 'VALOR_DEZ_MINUTOS',
  'Reflexos de 10 minutos de descanso (cláusula 33º da CCT)': 'VALOR_DEZ_MINUTOS_REFLEXOS',
  'Adicional de periculosidade sobre as horas extras': 'VALOR_PERICULOSIDADE_HE',
  'Reflexos de Adicional de periculosidade sobre as horas extras': 'VALOR_PERICULOSIDADE_HE_REFLEXOS',
};

// Mesma tabela, com o percentual do fim do rótulo removido — usada como
// segunda tentativa quando a CCT do caso traz percentual diferente do padrão.
const semPercentual = (rotulo) => String(rotulo || '').replace(/\s*\(\d{1,3}%\)\s*$/, '').trim();
const CALC_CAMPO_SEM_PCT = Object.fromEntries(
  Object.entries(CALC_CAMPO).map(([chave, campo]) => [semPercentual(chave), campo]),
);

// Contrato de tags do .docx (documentação viva).
export const CAMPOS_TEMPLATE = [
  'VARA_CIDADE_REGIAO', 'RITO',
  'RECL_NOME', 'RECL_NACIONALIDADE', 'RECL_ESTADO_CIVIL', 'RECL_FUNCAO', 'RECL_RG', 'RECL_CPF',
  'RECL_PIS', 'RECL_CTPS', 'RECL_SERIE', 'RECL_NASCIMENTO', 'RECL_FILIACAO', 'RECL_ENDERECO', 'RECL_EMAIL',
  'RECLAMADA1_RAZAO', 'RECLAMADA1_CNPJ', 'RECLAMADA1_ENDERECO',
  'RECLAMADA2_RAZAO', 'RECLAMADA2_CNPJ', 'RECLAMADA2_ENDERECO',
  'RECLAMADA3_RAZAO', 'RECLAMADA3_CNPJ', 'RECLAMADA3_ENDERECO',
  'RECLAMADA4_RAZAO', 'RECLAMADA4_CNPJ', 'RECLAMADA4_ENDERECO',
  'RECLAMADA1_TEMPO_LABORADO', 'RECLAMADA2_TEMPO_LABORADO',
  'RECLAMADA3_TEMPO_LABORADO', 'RECLAMADA4_TEMPO_LABORADO', 'DESCONTO_DESCRICAO',
  'LOCAL_PRESTACAO_ENDERECO', 'DATA_ADMISSAO', 'DATA_RESCISAO', 'SALARIO',
  'MODO_RESCISAO', 'MOTIVO_SAIDA_RESUMIDO', 'DANO_MORAL_FATO_ESPECIFICO',
  'JORNADA_HORARIOS', 'ESCALA', 'INTERVALO_USUFRUIDO', 'PRORROGACAO_JORNADA', 'FOLGAS_LABORADAS_MES',
  'ACUMULO_ATIVIDADES', 'ASSIDUIDADE_PROMETIDO', 'ASSIDUIDADE_PAGO', 'ASSIDUIDADE_DIFERENCA',
  'DOENCA_DESCRICAO', 'VALOR_POR_FORA', 'VALOR_AUX_ALIMENTACAO',
  'CCT_ANO', 'CCT_CLAUSULAS', 'CCT_CLAUSULA_MULTA',
  'PERIODO_FERIAS_PROP', 'PERIODO_13', 'PERIODO_FERIAS_VENCIDAS',
  'VALOR_SALDO_SALARIO', 'VALOR_MULTA_467',
  'VALOR_AVISO_PREVIO', 'VALOR_13', 'VALOR_FERIAS', 'VALOR_FGTS', 'VALOR_MULTA_40',
  'VALOR_FT', 'VALOR_DSR', 'VALOR_DANO_MORAL_10X', 'VALOR_CAUSA_TOTAL', 'DATA_PECA',
  'VALOR_MULTA_477', 'VALOR_SALARIOS_ABERTO', 'VALOR_HONORARIOS', 'FT_100',
  'VALOR_HE_PRORROGACAO', 'VALOR_HE_PRORROGACAO_REFLEXOS',
  'VALOR_ART71', 'VALOR_ART71_REFLEXOS',
  'VALOR_NOTURNO', 'VALOR_NOTURNO_REFLEXOS',
  'VALOR_DEZ_MINUTOS', 'VALOR_DEZ_MINUTOS_REFLEXOS',
  'VALOR_PERICULOSIDADE_HE', 'VALOR_PERICULOSIDADE_HE_REFLEXOS',
  // Reflexos discriminados (rubrica por rubrica) e valor das multas da CCT.
  'VALOR_HE_PRORROGACAO_REFLEXOS_TEXTO', 'VALOR_ART71_REFLEXOS_TEXTO',
  'VALOR_NOTURNO_REFLEXOS_TEXTO', 'VALOR_DEZ_MINUTOS_REFLEXOS_TEXTO',
  'VALOR_PERICULOSIDADE_HE_REFLEXOS_TEXTO', 'VALOR_MULTAS_CONV',
  'VALOR_FT_REFLEXOS', 'VALOR_FT_REFLEXOS_TEXTO',
  'VALOR_INTEGRACAO_REFLEXOS', 'VALOR_INTEGRACAO_REFLEXOS_TEXTO',
];

export const FLAGS_TEMPLATE = [
  'tem_tomadora', 'tem_reclamada3', 'tem_reclamada4', 'desconto_indevido', 'sem_justa_causa', 'rescisao_indireta', 'coacao_demissao', 'reversao_justa_causa',
  'tem_capitulo_rescisao', 'aviso_reversao', 'aviso_normal', 'acumulo_funcao', 'escala_12x36',
  'escala_4x2', 'adicional_noturno', 'integracao_por_fora', 'periculosidade', 'assiduidade',
  'vale_transporte', 'auxilio_alimentacao', 'doenca_ocupacional', 'estabilidade_doenca',
  'pensao_vitalicia', 'folgas_trabalhadas', 'tem_ferias_vencidas',
];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function dataExtenso(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, ano, mes, dia] = m;
  return `${Number(dia)} de ${MESES[Number(mes) - 1]} de ${ano}`;
}

const TRT_POR_UF = {
  SP: 'SEGUNDA REGIÃO', RJ: 'PRIMEIRA REGIÃO', MG: 'TERCEIRA REGIÃO', RS: 'QUARTA REGIÃO',
  BA: 'QUINTA REGIÃO', PE: 'SEXTA REGIÃO', CE: 'SÉTIMA REGIÃO', PA: 'OITAVA REGIÃO',
  PR: 'NONA REGIÃO', DF: 'DÉCIMA REGIÃO', AM: 'DÉCIMA PRIMEIRA REGIÃO', SC: 'DÉCIMA SEGUNDA REGIÃO',
  GO: 'DÉCIMA OITAVA REGIÃO',
};

const MODO_RESCISAO = {
  sem_justa_causa: 'sem justa causa',
  rescisao_indireta: 'rescisão indireta',
  nulidade_pedido_demissao: 'pedido de demissão coagido',
  reversao_justa_causa: 'justa causa (a reverter)',
  acordo: 'acordo (art. 484-A da CLT)',
};

const MOTIVO_SAIDA = {
  sem_justa_causa: 'sido dispensado sem justa causa',
  rescisao_indireta: 'requerido a rescisão indireta do contrato',
  nulidade_pedido_demissao: 'sido coagido e ameaçado a pedir demissão',
  reversao_justa_causa: 'sido dispensado por justa causa',
  acordo: 'encerrado o contrato por acordo',
};

const flag = (v) => !!v;
const soDigitos = (s) => (s || '').replace(/\D/g, '');
// 0/ausente vira undefined (nunca string vazia): o nullGetter do
// docxtemplater (preencherDocxTemplate.js) só detecta valor faltando quando
// é undefined/null, nunca quando é ''. Com '' o tag some em silêncio, deixando
// parênteses/frases vazias na peça final (ex.: "por fora ()"); com undefined,
// vira o marcador visível [A PREENCHER: TAG] que o advogado precisa ver.
const valorOuTexto = (v) => (v == null || v === '' || v === 0 ? undefined : typeof v === 'number' ? formatBRL(v) : String(v));

// Correções de grafia de municípios recorrentes (erros de digitação/OCR do template e da IA)
const CORRECOES_MUNICIPIO = {
  'ITAPECERICA DA TERRA': 'ITAPECERICA DA SERRA',
  'ITAPECERICA DA TERRA/SP': 'ITAPECERICA DA SERRA/SP',
  'SAO PAULO/SP': 'SÃO PAULO/SP',
};
function corrigirMunicipio(nome) {
  if (!nome) return nome;
  return CORRECOES_MUNICIPIO[String(nome).toUpperCase()] || nome;
}

// Aceita "04902-170", "04902170" e "04.902-170" — este último não casava com
// `\d{5}` e fazia a comparação com o CEP consultado falhar (mesma correção
// aplicada às regex de base44/shared/consultas.js).
function cepDoEndereco(end) {
  const m = /(\d{2})\.?(\d{3})-?(\d{3})/.exec(String(end || ''));
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

// Competência = local da PRESTAÇÃO DE SERVIÇOS (art. 651 CLT), NÃO a residência
// do empregado. Preferência: endereço da tomadora (recl2_logradouro) > local de
// prestação informado > endereço da empregadora. Rejeita o endereço residencial.
function localPrestacao(caso, dadosCep = []) {
  const resid = (caso?.recl_endereco || '').trim();
  const cand = [caso?.recl2_logradouro, caso?.local_prestacao, caso?.recl1_logradouro]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter((s) => s !== resid);
  for (const end of cand) {
    const cep = cepDoEndereco(end);
    const v = (dadosCep || []).find(
      (d) => d && !d.erro && d.municipio && (!cep || String(d.cep || '').replace(/\D/g, '') === cep)
    );
    if (v) return { municipio: corrigirMunicipio(v.municipio), uf: v.uf };
  }
  return null;
}

// `comarca_uf` é gravado por mapearWebhook.extrairUF, que devolve "Cidade/UF"
// quando consegue identificar a cidade e só a UF quando não — os dois formatos
// têm de ser aceitos. Antes o código fazia
// `comarca_uf.replace(/[^A-Za-z]/g,'').slice(0,2)`, que em "São Paulo/SP"
// devolvia "SO" (e "IT" em "Itapecerica da Serra/SP"): UF errada e, como
// TRT_POR_UF["SO"] não existe, a peça saía sem a região do TRT.
function partesComarca(valor) {
  const s = String(valor || '').trim();
  if (!s) return { municipio: '', uf: '' };
  const m = /^(.*?)\s*\/\s*([A-Za-z]{2})$/.exec(s);
  if (m) return { municipio: m[1].trim(), uf: m[2].toUpperCase() };
  if (/^[A-Za-z]{2}$/.test(s)) return { municipio: '', uf: s.toUpperCase() };
  return { municipio: s, uf: '' };
}

// Último recurso: lê "Cidade/UF" ou "Cidade - UF" de dentro de um endereço.
function cidadeUfDoEndereco(end) {
  const m = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.\s']{2,40})\s*[-/]\s*([A-Z]{2})\b/.exec(String(end || ''));
  return m ? { municipio: m[1].trim(), uf: m[2].toUpperCase() } : { municipio: '', uf: '' };
}

// O município da vara vinha SÓ da consulta de CEP (`local`) ou de `caso.comarca`
// — campo que NÃO EXISTE no contrato do caso (o campo é `comarca_uf`). Quando a
// consulta de CEP não resolvia, ou quando o endereço da tomadora veio da Receita
// em vez do parser (e por isso não está em recl2_logradouro/local_prestacao), o
// município saía vazio e a peça imprimia "[VARA / CIDADE / REGIÃO]" no
// endereçamento E no capítulo da competência — visto na peça do Carlos Gabriel,
// que trazia o endereço completo da tomadora em São Paulo/SP logo abaixo.
// Agora há cadeia de fallback: CEP consultado → comarca_uf → endereço do caso.
function montarVaraCidadeRegiao(caso, local) {
  const daComarca = partesComarca(caso.comarca_uf);
  const doEndereco = cidadeUfDoEndereco(
    caso.local_prestacao || caso.recl2_logradouro || caso.recl1_logradouro || ''
  );
  const municipio = corrigirMunicipio(local?.municipio || daComarca.municipio || doEndereco.municipio || '');
  const uf = String(local?.uf || daComarca.uf || doEndereco.uf || '').toUpperCase().slice(0, 2);
  if (!municipio) return '';
  const regiao = TRT_POR_UF[uf];
  return `${municipio.toUpperCase()}${uf ? `/${uf}` : ''}${regiao ? ` – ${regiao}` : ''}`;
}

// Deduz se o horário informado cruza o período noturno legal (22h–05h) —
// sem isso, `adicional_noturno` só ligava se a entrevista marcasse o campo
// explicitamente, e casos claros (ex.: 18h30 às 07h30) saiam sem a seção
// "DO ADICIONAL NOTURNO", que a mesma jornada exige. Mesma lógica duplicada
// em base44/shared/redacao.js (computeFlags) — mudou aqui, mudar lá também.
function jornadaCruzaNoturno(jornadaTxt) {
  const m = /(\d{1,2})[:h]?(\d{2})?\s*(?:[àa]s?|-)\s*(\d{1,2})[:h]?(\d{2})?/i.exec(jornadaTxt || '');
  if (!m) return false;
  const inicio = Number(m[1]);
  const fim = Number(m[3]);
  const dentroDaJanela = (h) => h >= 22 || h < 5;
  if (dentroDaJanela(inicio) || dentroDaJanela(fim)) return true;
  return fim < inicio; // turno que atravessa a meia-noite passa pela janela
}

// Período aquisitivo de férias vigente na rescisão: começa no último
// aniversário de admissão. Ex.: admissão 14/04/2025 e rescisão 07/12/2025 →
// "2025/2026"; admissão 12/09/2025 e rescisão 16/03/2026 → também "2025/2026".
// Confere com as três peças de referência da especialista.
function periodoAquisitivo(caso = {}) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(caso.data_admissao || '');
  const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(caso.data_rescisao || '');
  if (!a || !r) return '';
  let ano = Number(r[1]);
  if (`${r[2]}-${r[3]}` < `${a[2]}-${a[3]}`) ano -= 1; // rescisão antes do aniversário
  return `${ano}/${ano + 1}`;
}

function hojeExtenso() {
  const d = new Date();
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Narrativa CONCRETA do dano moral — determinística e coerente. Quando o
// parser devolve apenas um fragmento (ex.: "direitos lesados.") ou a IA de
// redação está desligada, constrói um parágrafo articulado a partir dos fatos
// do caso (desvio sem contraprestação, folgas via PIX/dinheiro, etc.). A IA,
// quando ativa, sobrescreve via BLOCO_DANO_MORAL (geracao.js).
export function narrativaDanoMoral(caso) {
  const raw = (caso.dano_fatos || caso.dano_supervisor || '').trim();
  if (raw.length >= 80) return raw; // narrativa real do parser — usa como está
  const fatos = [];
  if (caso.tem_desvio && caso.desvio_atividades) {
    const atv = String(caso.desvio_atividades).replace(/[.\s]+$/, '').toLowerCase().slice(0, 140);
    fatos.push(`compelido a exercer, de forma habitual, atribuições alheias à função contratada (desvio de função: ${atv}) sem qualquer contraprestação pecuniária`);
  }
  if (caso.tem_ft && (caso.tem_integracao_por_fora || /pix|dinheiro/i.test(raw))) {
    fatos.push(`laborado em dias de folga mediante pagamento informal (via PIX/dinheiro), à margem da folha salarial e dos recolhimentos previdenciários`);
  }
  if (!fatos.length && caso.tem_integracao_por_fora) {
    fatos.push('submetido a pagamentos por fora, sem os devidos recolhimentos previdenciários e fiscais');
  }
  const corpus = fatos.length
    ? `Durante todo o pacto contratual, o reclamante foi ${fatos.join(', ')}. `
    : (raw ? `${raw} ` : '');
  return `${corpus}Tais condutas ilícitas da reclamada violaram a dignidade pessoal e os valores morais do autor, gerando angústia, sofrimento e indignação, a ensejar a devida reparação moral.`;
}

export function montarDadosTemplate({ caso = {}, calculos = [], attrs = {}, dadosReceita = [], dadosCep = [] } = {}) {
  const dados = {};

  // 1) Valores determinísticos
  // INVARIANTE: o valor da causa soma apenas o que a peça efetivamente PEDE.
  // A peça do Jonathan cobrou R$ 5.300,66 na alçada (saldo de salário, multa do
  // art. 467 e multa do art. 477) sem que esses itens constassem do rol de
  // pedidos. Verba sem token mapeado não é impressa — logo, não entra na soma;
  // fica registrada em _itensSemToken para o modelo .docx ser corrigido.
  let somaCausa = 0;
  const itensSemToken = [];
  for (const c of calculos || []) {
    if (c.valor == null) continue;
    // O rótulo do item embute o percentual REAL da CCT ("Acúmulo de função
    // (25%)"), mas as chaves aqui são fixas no percentual padrão. Quando a
    // convenção do caso traz outro percentual, a busca falhava: a verba ficava
    // sem token, saía do valor da causa e o pedido virava "a apurar". Ficou mais
    // provável depois de a leitura de cláusula da CCT passar a funcionar — então
    // a comparação ignora o percentual entre parênteses no fim do rótulo.
    const campo = CALC_CAMPO[c.item] || CALC_CAMPO_SEM_PCT[semPercentual(c.item)];
    if (campo) dados[campo] = formatBRL(c.valor);
    // Reflexos: além do valor somado, o item traz a frase com as cinco rubricas
    // abertas (mathUtils.reflexosSobre). Vira a tag {{CAMPO_TEXTO}} usada no rol.
    if (campo && c.texto) dados[`${campo}_TEXTO`] = c.texto;
    // Honorários são calculados À PARTE (15% sobre o valor da causa, art. 85
    // CPC) — padrão do escritório. Não compõem o valor da causa (o rol de
    // pedidos não os lista como valor), senão o fecho fica maior que a soma
    // do rol. VALOR_HONORARIOS continua disponível para o tópico de honorários.
    if (c.item === 'Honorários advocatícios (15%)') continue;
    if (!campo) { itensSemToken.push(`${c.item} (${formatBRL(c.valor)})`); continue; }
    somaCausa += Number(c.valor) || 0;
  }
  // Chave com underscore: não é tag do template, só diagnóstico para a UI/gate.
  dados._itensSemToken = itensSemToken;
  // O modelo-mestre pede {{FT_100}} numa única linha do rol (principal + reflexo
  // de DSR). A tag é montada mais abaixo, junto dos fallbacks "a apurar" — havia
  // DUAS atribuições de FT_100 e a de baixo vencia, deixando a de cima morta.
  const valorCausa = brlComExtenso(round2(somaCausa));
  dados.VALOR_CAUSA_TOTAL = valorCausa;
  // Aliases — algumas versões do template usam tags diferentes para o mesmo valor
  dados.VALOR_CAUSA = valorCausa;
  dados.VALOR_TOTAL_PEDIDOS = valorCausa;

  // Avos/dias para placeholders do template (frações de 13º/férias e dias de aviso)
  for (const c of calculos || []) {
    if (c.item === '13º proporcional') {
      const m = /(\d+)\/12/.exec(c.memoria || '');
      if (m) { dados.AVOS_13 = m[1]; dados.AVOS_13_FRACAO = `${m[1]}/12`; }
    }
    if (c.item === 'Férias proporcionais + 1/3') {
      const m = /(\d+)\/12/.exec(c.memoria || '');
      if (m) { dados.AVOS_FERIAS = m[1]; dados.AVOS_FERIAS_FRACAO = `${m[1]}/12`; }
    }
    if (c.item === 'Aviso prévio indenizado') {
      const m = /(\d+)\s*dias/.exec(c.memoria || '');
      if (m) dados.DIAS_AVISO_PREVIO = m[1];
    }
  }

  // 2) CNPJ oficial (BrasilAPI)
  const receita = (cnpj) => (dadosReceita || []).find((d) => d && !d.erro && soDigitos(d.cnpj) === soDigitos(cnpj));
  const r1 = receita(caso.recl1_cnpj);
  const r2 = receita(caso.recl2_cnpj);

  // 3) Competência
  const local = localPrestacao(caso, dadosCep);
  dados.VARA_CIDADE_REGIAO = montarVaraCidadeRegiao(caso, local) || '[VARA / CIDADE / REGIÃO]';
  // LOCAL DE PRESTAÇÃO: nunca o endereço residencial do reclamante. Preferência:
  // tomadora (recl2) > local informado > empregadora (recl1/receita). Rejeita o
  // endereço residencial em qualquer posição (o parser pode tê-lo gravado em
  // local_prestacao/recl2_logradouro por erro); se houver 2ª reclamada, usa o
  // endereço da tomadora vindo da Receita (r2.endereco) quando o parser não o
  // extraiu da entrevista.
  // Rejeita a residência do reclamante por CEP (robusto a correções de
  // grafia/acento feitas pelo parser ou ViaCEP) — a comparação por string
  // exata falhava quando a residência vinha normalizada e vazava como local
  // de prestação. Preferência: tomadora (recl2) > local informado > empregadora.
  const residEnd = (caso.recl_endereco || '').trim().toLowerCase();
  const cepResid = cepDoEndereco(caso.recl_endereco);
  const rejeitarResid = (s) => {
    if (!s) return true;
    if (String(s).trim().toLowerCase() === residEnd) return true;
    const cep = cepDoEndereco(s);
    return Boolean(cepResid && cep && cep === cepResid);
  };
  const localInformado = caso.local_prestacao && !rejeitarResid(caso.local_prestacao) ? caso.local_prestacao : null;
  const candLocal = [
    localInformado, caso.recl2_logradouro, (r2 && r2.endereco), caso.recl1_logradouro, (r1 && r1.endereco),
  ].filter(Boolean).map((s) => String(s).trim()).filter((s) => !rejeitarResid(s));
  dados.LOCAL_PRESTACAO_ENDERECO = candLocal[0] || '[LOCAL DE PRESTAÇÃO]';
  dados.RITO = attrs.rito === 'sumarissimo' ? 'sumaríssimo' : 'ordinário';

  // 4) Reclamante
  dados.RECL_NOME = (caso.recl_nome || '[NOME DO RECLAMANTE]').toUpperCase();
  const _genNac = (caso.recl_genero || 'M').toUpperCase() === 'F' ? 'F' : 'M';
  dados.RECL_NACIONALIDADE = caso.recl_nacionalidade || (_genNac === 'F' ? 'brasileira' : 'brasileiro');
  dados.RECL_ESTADO_CIVIL = caso.recl_estado_civil || '[ESTADO CIVIL]';
  dados.RECL_FUNCAO = caso.funcao || attrs.funcao || '[FUNÇÃO]';
  dados.RECL_RG = caso.recl_rg || '[RG]';
  dados.RECL_CPF = caso.recl_cpf || '[CPF]';
  dados.RECL_PIS = caso.recl_pis || '[PIS]';
  dados.RECL_CTPS = caso.recl_ctps || '[CTPS]';
  dados.RECL_SERIE = caso.recl_serie || '[SÉRIE]';
  dados.RECL_NASCIMENTO = dataExtenso(caso.recl_nascimento) || '[DATA DE NASCIMENTO]';
  dados.RECL_FILIACAO = caso.recl_filiacao || '[FILIAÇÃO]';
  dados.RECL_ENDERECO = caso.recl_endereco || '[ENDEREÇO DO RECLAMANTE]';
  dados.RECL_EMAIL = caso.recl_email || '';

  // 5) Reclamadas
  // Nome da reclamada vem da ENTREVISTA (fonte primária); o CNPJ oficial só
  // confirma endereço e número. Nunca substituir o nome informado pelo cliente
  // por uma razão social retornada pela Receita (pode ser entidade diversa).
  dados.RECLAMADA1_RAZAO = caso.recl1_nome || (r1 && r1.razao_social) || '[RAZÃO SOCIAL 1ª RECLAMADA]';
  dados.RECLAMADA1_CNPJ = (r1 && r1.cnpj) || caso.recl1_cnpj || '[CNPJ - confirmar]';
  dados.RECLAMADA1_ENDERECO = (r1 && r1.endereco) || caso.recl1_logradouro || '[ENDEREÇO - confirmar]';
  dados.RECLAMADA2_RAZAO = caso.recl2_nome || (r2 && r2.razao_social) || '';
  dados.RECLAMADA2_CNPJ = (r2 && r2.cnpj) || caso.recl2_cnpj || '';
  dados.RECLAMADA2_ENDERECO = caso.recl2_logradouro || (r2 && r2.endereco) || '';
  // 3ª RECLAMADA. O mapeamento do webhook já gravava recl3_nome/cnpj/logradouro
  // (mapearWebhook.js), mas aqui não havia token nenhum e o modelo não tinha
  // parágrafo: a parte era lida do payload e descartada em silêncio — o caso do
  // José Carlos entrou com três reclamadas e a peça saiu com duas.
  const r3 = receita(caso.recl3_cnpj);
  dados.RECLAMADA3_RAZAO = caso.recl3_nome || (r3 && r3.razao_social) || '';
  dados.RECLAMADA3_CNPJ = (r3 && r3.cnpj) || caso.recl3_cnpj || '';
  dados.RECLAMADA3_ENDERECO = caso.recl3_logradouro || (r3 && r3.endereco) || '';
  // 4ª RECLAMADA — mesma situação da 3ª: o formulário passou a enviar uma quarta
  // tomadora (RECL4_*) e sem estes tokens a parte não chegava ao documento.
  const r4 = receita(caso.recl4_cnpj);
  dados.RECLAMADA4_RAZAO = caso.recl4_nome || (r4 && r4.razao_social) || '';
  dados.RECLAMADA4_CNPJ = (r4 && r4.cnpj) || caso.recl4_cnpj || '';
  dados.RECLAMADA4_ENDERECO = caso.recl4_logradouro || (r4 && r4.endereco) || '';
  // Tempo laborado em cada reclamada (campo novo do formulário) — delimita o
  // período de responsabilidade de cada tomadora na qualificação.
  for (const n of [1, 2, 3, 4]) {
    dados[`RECLAMADA${n}_TEMPO_LABORADO`] = caso[`recl${n}_tempo_laborado`] || '';
  }

  // 6) Contrato / rescisão
  const tipo = caso.tipo_dispensa || attrs.tipo_dispensa || 'sem_justa_causa';
  dados.DATA_ADMISSAO = dataExtenso(caso.data_admissao) || '[DATA DE ADMISSÃO]';
  dados.DATA_RESCISAO = dataExtenso(caso.data_rescisao) || '[DATA DE RESCISÃO]';
  dados.SALARIO = caso.salario != null ? brlComExtenso(caso.salario) : '[SALÁRIO]';
  dados.RECL_GENERO = (caso.recl_genero || 'M').toUpperCase() === 'F' ? 'F' : 'M';
  dados.MODO_RESCISAO = MODO_RESCISAO[tipo] || 'sem justa causa';
  dados.MOTIVO_SAIDA_RESUMIDO = MOTIVO_SAIDA[tipo] || 'foi dispensado sem justa causa';

  // 7) Textos livres do caso concreto (parser)
  // A seção DO DANO MORAL é sempre presente no template (sem condicional),
  // então a narrativa deve sempre ter conteúdo — nunca o placeholder em
  // colchetes (que entra em loop circular com o mapeamento de brackets).
  dados.DANO_MORAL_FATO_ESPECIFICO = narrativaDanoMoral(caso);

  // 8) Jornada
  dados.JORNADA_HORARIOS = caso.jornada_horario || '[HORÁRIOS]';
  dados.ESCALA = caso.escala || '[ESCALA]';
  // O formulário do MARCOS chegou com INTERVALO_USUFRUIDO e INTERVALO_GOZADO
  // VAZIOS (a entrevistadora só marcou "intervalo suprimido"), então o token
  // saía em branco na peça. Sem duração declarada, entra a redação padrão do
  // intervalo parcial — o pedido do art. 71 já é integral de qualquer forma.
  dados.INTERVALO_USUFRUIDO = caso.intervalo_usufruido
    || (caso.intervalo_gozado === false ? 'período inferior a 1 (uma) hora' : '');
  dados.PRORROGACAO_JORNADA = caso.prorrogacao_jornada || '';
  // Texto declarado na entrevista ("5 a 6 vezes por mês") tem preferência sobre
  // a média numérica: imprimir a média gerava "em média de 5.5 vezes por mês"
  // no documento, apontado como incorreto na revisão. A média só serve ao
  // cálculo (mathUtils); a peça repete o intervalo tal como declarado.
  dados.FOLGAS_LABORADAS_MES = caso.ft_qtd_texto
    || caso.folgas_laboradas_mes
    || (caso.ft_qtd_media != null ? String(caso.ft_qtd_media).replace('.', ',') : '');

  // 9) Teses (dados de apoio)
  dados.ACUMULO_ATIVIDADES = caso.acumulo_atividades || caso.acumulo_funcao || '';
  // Desvio: se a flag acendeu mas o parser não descreveu as atividades, evita o
  // placeholder vazio (que gera "funções de VIGILANTE, , não recebeu" no template).
  dados.DESVIO_ATIVIDADES = caso.desvio_atividades || (caso.tem_desvio ? 'atividades diversas da função contratada' : '');
  dados.SALARIOS_ABERTO = caso.salarios_aberto || '';
  dados.ASSIDUIDADE_PROMETIDO = valorOuTexto(caso.assiduidade_prometido);
  dados.ASSIDUIDADE_PAGO = valorOuTexto(caso.assiduidade_pago);
  dados.ASSIDUIDADE_DIFERENCA = valorOuTexto(caso.assiduidade_diferenca);
  dados.DOENCA_DESCRICAO = caso.doenca_descricao || '';
  // O valor pago "por fora" É o valor da FT quitada em PIX/dinheiro. A regra
  // existia só no mapeamento do WEBHOOK; a mesma peça gerada pela tela de
  // entrevista (parser/extração) continuava saindo com
  // "[A PREENCHER: VALOR_POR_FORA]" — dois caminhos de geração com resultados
  // diferentes para o mesmo caso. Aqui, na camada que preenche o template,
  // vale para os dois.
  dados.VALOR_POR_FORA = valorOuTexto(caso.valor_por_fora || (caso.tem_integracao_por_fora ? caso.val_ft : null));
  dados.VALOR_AUX_ALIMENTACAO = valorOuTexto(caso.valor_aux_alimentacao);

  // 10) CCT
  dados.CCT_ANO = caso.cct_ano || '';
  dados.CCT_CLAUSULAS = caso.cct_clausulas || '';
  // Cláusula da multa convencional: se não extraída, string vazia — o bloco
  // BLOCO_MULTAS_CONVENCIONAIS (fallback ou IA) já trata a ausência do número
  // no texto, evitando [A PREENCHER: CCT_CLAUSULA_MULTA] no documento final.
  dados.CCT_CLAUSULA_MULTA = caso.cct_clausula_multa || '';

  // 11) Verbas rescisórias — períodos. Antes só vinham do caso (que nunca os
  // traz pelo webhook) e ficavam em branco; o modelo, por isso, mantinha fixos
  // os períodos do caso de origem ("2025/2026 – 11/12", "de 2025 – 12/12"), que
  // a revisora marcou como incorretos. Agora são deduzidos das datas.
  dados.PERIODO_FERIAS_PROP = caso.periodo_ferias_prop || periodoAquisitivo(caso);
  dados.PERIODO_13 = caso.periodo_13 || (/^(\d{4})/.exec(caso.data_rescisao || '') ? `de ${/^(\d{4})/.exec(caso.data_rescisao)[1]}` : '');
  dados.PERIODO_FERIAS_VENCIDAS = caso.periodo_ferias_vencidas || '';

  // 12) Data da peça
  dados.DATA_PECA = `São Paulo, ${hojeExtenso()}`;

  // 13) FLAGS — seções condicionais
  const temTomadora = flag(caso.recl2_nome || r2 || attrs.tem_tomadora);
  const escalaTxt = `${caso.escala || ''} ${caso.jornada_horario || ''}`;
  const ehVigilante = /vigilante/i.test(caso.funcao || attrs.funcao || '');
  // Percentuais que divergem por categoria (confirmado com peça real da
  // especialista, CCT Vigilância 2026): Vigilante usa 60% convencional
  // (cláusula 12ª) tanto nas HE quanto no intervalo do art. 71; demais
  // categorias (SIEMACO/SINDEEPRES) usam 50% do art. 71, §4º, da CLT. Multa
  // convencional: Vigilante 3% sobre o salário normativo; demais, 20% por
  // cláusula descumprida.
  dados.PERC_ART71 = ehVigilante
    ? '60% (sessenta por cento), conforme a cláusula 12ª da Convenção Coletiva da Categoria'
    : '50% (cinquenta por cento), conforme o artigo 71, §4º, da CLT';
  dados.PERC_MULTA_CONV = ehVigilante
    ? '3% (três por cento) sobre o salário normativo da categoria'
    : '20% (vinte por cento) por cláusula descumprida';
  dados.tem_tomadora = temTomadora;
  // Acende o parágrafo da 3ª reclamada na qualificação.
  dados.tem_reclamada3 = flag(dados.RECLAMADA3_RAZAO);
  dados.tem_reclamada4 = flag(dados.RECLAMADA4_RAZAO);
  // Descontos indevidos (campo novo): acende o capítulo/pedido de restituição.
  dados.desconto_indevido = flag(caso.tem_desconto_indevido);
  dados.DESCONTO_DESCRICAO = caso.desconto_descricao || '';
  dados.sem_justa_causa = tipo === 'sem_justa_causa';
  dados.rescisao_indireta = tipo === 'rescisao_indireta';
  dados.coacao_demissao = tipo === 'nulidade_pedido_demissao';
  dados.reversao_justa_causa = tipo === 'reversao_justa_causa';
  dados.tem_capitulo_rescisao = ['rescisao_indireta', 'nulidade_pedido_demissao', 'reversao_justa_causa'].includes(tipo);
  dados.aviso_reversao = tipo === 'rescisao_indireta' || tipo === 'reversao_justa_causa';
  dados.aviso_normal = tipo === 'sem_justa_causa' || tipo === 'nulidade_pedido_demissao';
  // Acúmulo só ativa com atividades PRÓPRIAS descritas; se coincide com o desvio
  // (mesmos fatos de Prevenção de Perdas), fica só desvio — evita bis in idem.
  const mesmoFatoDesvio =
    caso.tem_desvio && caso.acumulo_atividades && caso.desvio_atividades &&
    String(caso.acumulo_atividades).toLowerCase() === String(caso.desvio_atividades).toLowerCase();
  dados.acumulo_funcao = flag(caso.tem_acumulo && caso.acumulo_atividades && !mesmoFatoDesvio);
  dados.desvio_funcao = flag(caso.tem_desvio);
  dados.gratificacao_funcao = flag(caso.tem_gratificacao);
  dados.escala_12x36 = /12\s*x\s*36/i.test(escalaTxt);
  dados.escala_4x2 = /\b(4\s*x\s*2|6\s*x\s*2)\b/i.test(escalaTxt);
  dados.adicional_noturno = flag(caso.tem_adic_noturno) || jornadaCruzaNoturno(caso.jornada_horario || caso.escala || '');
  dados.integracao_por_fora = flag(caso.tem_integracao_por_fora);
  // Vigilância: 10 min (cláusula 33ª) e periculosidade nas HE são padrão da categoria.
  dados.periculosidade = flag(caso.tem_periculosidade) || ehVigilante;
  dados.dez_minutos_cct = flag(caso.tem_dez_min_cct) || ehVigilante;
  dados.salarios_em_aberto = flag(caso.tem_salarios_aberto);
  dados.assiduidade = flag(caso.tem_assiduidade);
  dados.vale_transporte = flag(caso.tem_vale_transporte);
  dados.auxilio_alimentacao = flag(caso.tem_auxilio_alimentacao);
  dados.doenca_ocupacional = flag(caso.tem_doenca);
  dados.estabilidade_doenca = flag(caso.tem_estabilidade || caso.tem_doenca);
  dados.pensao_vitalicia = flag(caso.tem_pensao);
  dados.insalubridade = flag(caso.tem_insalubridade);
  dados.folgas_trabalhadas = flag(caso.tem_ft || caso.val_ft || caso.ft_qtd_media);
  dados.tem_ferias_vencidas = flag(caso.tem_ferias_vencidas);

  // Fallback dos pedidos: tese ligada mas valor não calculado -> "a apurar em liquidação"
  // (evita pedido em branco, ex.: folgas sem valor por folga informado).
  const APURAR = 'a apurar em liquidação';
  // Folgas/feriados: mesma abertura das demais verbas do rol, para o pedido ser
  // conferível (era "R$ 79.288,00 + R$ 13.214,67", dois números sem rubrica).
  // ATENÇÃO: aqui o reflexo é SÓ o DSR e a 1/6, critério atual do cálculo,
  // enquanto as outras verbas por hora levam a matriz de 34,75% — na peça da
  // especialista as folgas levam a matriz inteira. Discriminado, o critério
  // usado fica à vista em vez de sair embutido num número solto.
  const itFt = (calculos || []).find((c) => CALC_CAMPO[c.item] === 'VALOR_FT');
  const vFt = Number(itFt && itFt.valor) || 0;
  if (vFt > 0 && dados.VALOR_FT_REFLEXOS_TEXTO) {
    // Matriz inteira, no mesmo formato das demais verbas do rol.
    dados.FT_100 = `valor principal estimado de ${formatBRL(vFt)}, ${dados.VALOR_FT_REFLEXOS_TEXTO}`;
  } else if (dados.VALOR_FT || dados.VALOR_DSR) {
    dados.FT_100 = `valor estimado de ${[dados.VALOR_FT, dados.VALOR_DSR].filter(Boolean).join(' + ')}`;
  } else {
    dados.FT_100 = APURAR;
  }
  for (const [fl, cp] of [
    ['acumulo_funcao', 'VALOR_ACUMULO'], ['gratificacao_funcao', 'VALOR_GRATIFICACAO'],
    ['desvio_funcao', 'VALOR_DESVIO'], ['assiduidade', 'VALOR_ASSIDUIDADE'],
    ['integracao_por_fora', 'VALOR_INTEGRACAO'], ['auxilio_alimentacao', 'VALOR_AUX_ALIM_TOTAL'],
    ['vale_transporte', 'VALOR_VT_TOTAL'],
  ]) {
    if (dados[fl] && !dados[cp]) dados[cp] = APURAR;
  }

  // Fallback do capítulo de enquadramento (desvio): se a IA não redigir
  // (redigirIA false ou falha), o marcador {{BLOCO_ENQUADRAMENTO}} do
  // template ainda recebe um texto rico determinístico (não fica vazio).
  // Quando a IA roda com sucesso, geracao.js sobrescreve pelo capítulo
  // sob medida da especialista de IA.
  if (dados.desvio_funcao) {
    const atv = caso.desvio_atividades || 'atividades diversas da função contratada';
    const clausulaDesvio = caso.cct_clausula_multa ? `cláusula ${caso.cct_clausula_multa}` : 'cláusula de desvio de função';
    dados.BLOCO_ENQUADRAMENTO =
      `Não obstante contratado para exercer a função de ${(caso.funcao || '[FUNÇÃO]').toUpperCase()}, o reclamante era compelido, por determinação da 1ª reclamada${dados.tem_tomadora ? ' e no interesse da 2ª reclamada' : ''}, a exercer, de forma habitual, ${atv}, funções de maior complexidade e responsabilidade que extrapolam as tarefas típicas da função contratada, em flagrante desvio funcional, vedado pela ${clausulaDesvio} da Convenção Coletiva de Trabalho da Categoria. ` +
      `Portanto, requer a condenação da reclamada ao pagamento da multa convencional de 50% (cinquenta por cento) do piso salarial da categoria por mês laborado, durante todo o período contratual, com reflexos em DSR, aviso prévio, férias acrescidas de 1/3, 13º salários e FGTS + 40%.`;
  }

  // Fallback da seção "DAS MULTAS CONVENCIONAIS": abertura coerente quando a
  // IA não redigir (ou está desativada). Substitui a frase fixa do template
  // (que dependia de {{CCT_CLAUSULA_MULTA}} em branco) por um parágrafo
  // completo; a IA sobrescreve quando ativa (redacaoTeses).
  {
    const anoCct = caso.cct_ano || '';
    const clMulta = caso.cct_clausula_multa ? ` (cláusula ${caso.cct_clausula_multa})` : '';
    dados.BLOCO_MULTAS_CONVENCIONAIS =
      `O reclamante requer a aplicação da multa convencional prevista na Convenção Coletiva de Trabalho da categoria${anoCct ? ` – ${anoCct} e as anteriores` : ''}${clMulta}, por descumprimento, pela reclamada, das obrigações convencionais a seguir elencadas, nos termos da cláusula de penalidade da referida convenção:`;
  }

  // Fallback da seção "DA JORNADA DE TRABALHO": narrativa fática coerente
  // quando a IA não redigir o BLOCO_JORNADA (desativada ou retorno vazio).
  // Constrói o parágrafo a partir dos campos do caso (jornada_horario,
  // escala, prorrogacao_jornada) — SEM a tag crua {{PRORROGACAO_JORNADA}},
  // que aparecia no template quando o parser não extraía o campo. A IA
  // sobrescreve via BLOCO_JORNADA (geracao.js) quando ativa.
  {
    const hor = caso.jornada_horario || '[HORÁRIOS]';
    const esc = caso.escala || (dados.escala_12x36 ? '12x36' : dados.escala_4x2 ? '4x2' : '[ESCALA]');
    const prorrog = caso.prorrogacao_jornada ? `, prorrogando a jornada em ${caso.prorrogacao_jornada}` : '';
    // O campo pode ser DURAÇÃO ("15 minutos") ou CONDIÇÃO ("sempre à disposição
    // com rádio HT ligado") — a preposição muda, senão sai "de sempre à
    // disposição...".
    const iv = caso.intervalo_usufruido;
    const ivDuracao = iv && /\d|minut|hora|meia/i.test(iv);
    const intervaloTxt = iv
      ? (ivDuracao
        ? `concessão parcial do intervalo para refeição e descanso de ${iv}`
        : `concessão parcial do intervalo para refeição e descanso, uma vez que ${iv.charAt(0).toLowerCase()}${iv.slice(1)}`)
      : 'concessão parcial do intervalo intrajornada';
    dados.BLOCO_JORNADA =
      `Para elucidação dos direitos aqui pleiteados, o reclamante laborou no seguinte horário: ${hor}, dependendo das necessidades dos serviços${prorrog}, sob pena de advertência, ou até mesmo justa causa, em escala ${esc}, com a ${intervaloTxt}. ` +
      `Cumpre ressaltar que o obreiro pode ter feito outras escalas e horários que serão devidamente apreciados em audiência inaugural e, posteriormente, em sede de réplica.`;
  }

  // ESPINHA DA RESCISÃO: NÃO HÁ MAIS FALLBACK — e é de propósito.
  //
  // Aqui existia um parágrafo determinístico montado para rescisão indireta,
  // coação e reversão de justa causa. Só que o modelo .docx JÁ tem o texto do
  // escritório para cada uma dessas modalidades, em ramos condicionais dentro de
  // "DO CONTRATO DE TRABALHO":
  //
  //   {{#sem_justa_causa}} … {{#rescisao_indireta}} …
  //   {{#reversao_justa_causa}} … {{#coacao_demissao}} (3 parágrafos)
  //
  // Resultado: nas três modalidades o capítulo saía com os mesmos fatos duas
  // vezes — este bloco e, logo abaixo, o ramo do modelo. Visto na peça de
  // 13/08 (Porteiro, coação): "admitido … em 11 de setembro de 2024 … coagido e
  // ameaçado a pedir demissão em 19 de fevereiro de 2025" apareceu no parágrafo
  // sem numeração (este bloco) e de novo no item 1 (ramo do modelo).
  //
  // O texto do modelo é o melhor dos dois: o da coação cita o art. 171, II, do
  // Código Civil e enumera os títulos rescisórios, que este parágrafo não trazia.
  // A tag {{BLOCO_ESPINHA_RESCISAO}} continua no modelo e simplesmente não
  // renderiza — disponível caso o escritório queira voltar a usá-la.

  // Fallback do DANO MORAL: narrativa concreta determinística (mesma do
  // DANO_MORAL_FATO_ESPECIFICO). A IA sobrescreve via BLOCO_DANO_MORAL.
  // Usa a MESMA condição do cálculo do valor (temDanoMoralConcreto) — antes
  // só checava caso.tem_dano_moral, deixando o parágrafo vazio em casos onde
  // o VALOR já tinha sido calculado (ex.: por desvio de função).
  if (!dados.BLOCO_DANO_MORAL && temDanoMoralConcreto(caso)) {
    dados.BLOCO_DANO_MORAL = dados.DANO_MORAL_FATO_ESPECIFICO || narrativaDanoMoral(caso);
  }

  // Fallback da INSALUBRIDADE: narrativa determinística do ambiente insalubre.
  // A IA sobrescreve via BLOCO_INSALUBRIDADE quando ativa.
  if (!dados.BLOCO_INSALUBRIDADE && dados.insalubridade) {
    dados.BLOCO_INSALUBRIDADE = caso.insalubridade_descricao ||
      'O reclamante laborava em ambiente insalubre, sem a observância das normas de saúde, segurança e higiene do trabalho, e sem o fornecimento de equipamentos de proteção individual adequados, configurando violação aos arts. 189 e 192 da CLT.';
  }

  // Fallback da SÚMULA 331 (responsabilidade subsidiária): parágrafo padrão.
  // A IA sobrescreve via BLOCO_SUMULA_331 quando ativa.
  if (!dados.BLOCO_SUMULA_331 && dados.tem_tomadora) {
    dados.BLOCO_SUMULA_331 =
      `A 2ª reclamada, na qualidade de tomadora dos serviços, responde subsidiariamente pelas obrigações trabalhistas contraídas pela 1ª reclamada em relação ao reclamante, com fundamento na Súmula 331 do Tribunal Superior do Trabalho e nos artigos 4º e 5º do Decreto-Lei nº 200/1967, eis que o obreiro desempenhava suas atividades integrado à atividade-fim da tomadora, exercendo funções essenciais e permanentes, o que atrai a responsabilidade subsidiária da contratante pelos créditos deferidos nesta ação.`;
  }

  // Fallback do rol de MULTAS CONVENCIONAIS: lista individualizada por caso
  // (substitui a antiga lista fixa do template, sempre igual em toda peça).
  // A IA sobrescreve via `pedidos_multas` (redacaoTeses.js) quando ativa,
  // citando o número real da cláusula da CCT; este fallback determinístico
  // só roda quando a redação por IA está desligada ou falha — nunca deixa o
  // laço {{#pedidos_multas}} vazio.
  if (!dados.pedidos_multas) {
    const clMulta = caso.cct_clausula_multa ? `, cláusula ${caso.cct_clausula_multa}` : '';
    const itensMulta = [];
    if (caso.jornada_horario || dados.escala_12x36 || dados.escala_4x2) {
      itensMulta.push('Não remunera corretamente as horas extraordinárias, com o adicional convencional previsto na CCT;');
    }
    if (dados.folgas_trabalhadas) {
      itensMulta.push('Não remunera corretamente as horas extras de 100% relativas às folgas e feriados trabalhados;');
    }
    if (dados.periculosidade) {
      itensMulta.push('Não remunera corretamente o adicional de periculosidade sobre as horas extraordinárias;');
    }
    if (dados.dez_minutos_cct) {
      itensMulta.push(`Não concessão dos 10 (dez) minutos de descanso a cada hora trabalhada${clMulta};`);
    }
    if (dados.vale_transporte) itensMulta.push('Não concede o vale-transporte nas folgas trabalhadas;');
    if (dados.auxilio_alimentacao) itensMulta.push('Não concede o auxílio-alimentação nas folgas trabalhadas;');
    if (dados.desvio_funcao || dados.acumulo_funcao) {
      itensMulta.push(`Não remunera corretamente o desvio/acúmulo de função${clMulta};`);
    }
    itensMulta.push('Não remunera o FGTS corretamente;');
    itensMulta.push('Não remunera corretamente os seus DSR´s;');
    if (temDanoMoralConcreto(caso)) itensMulta.push('Incorre em dano moral em virtude das condições supramencionadas;');
    dados.pedidos_multas = itensMulta;
  }

  // No rol, a linha das multas convencionais saía "a apurar em liquidação", sem
  // valor — parte do "pedidos incompletos" apontado pela especialista. O
  // critério é o da própria CCT (percentual por cláusula descumprida) e a
  // quantidade é a da lista que a peça imprime no capítulo, em pedidos_multas:
  // nada é estimado por fora, e a conta fica no próprio pedido para auditoria.
  const pctMultaConv = ehVigilante ? 0.03 : 0.20;
  const baseMultaConv = Number(caso.salario) || 0;
  const qtdMultas = Array.isArray(dados.pedidos_multas) ? dados.pedidos_multas.length : 0;
  if (qtdMultas > 0 && baseMultaConv > 0) {
    const totalMultas = round2(qtdMultas * pctMultaConv * baseMultaConv);
    const plural = qtdMultas > 1 ? 's' : '';
    dados.VALOR_MULTAS_CONV = `valor estimado de ${formatBRL(totalMultas)} (${qtdMultas} cláusula${plural} descumprida${plural} × ${(pctMultaConv * 100).toFixed(0)}% de ${formatBRL(baseMultaConv)})`;
    // A verba passa a ter valor: entra na alçada, senão o rol pede um valor que
    // o fecho da peça não cobra (a mesma incoerência do caso do Jonathan).
    somaCausa += totalMultas;
    dados.VALOR_CAUSA_TOTAL = brlComExtenso(round2(somaCausa));
  } else {
    dados.VALOR_MULTAS_CONV = 'a apurar em liquidação';
  }

  // REDE FINAL do travessão: o relato da entrevista e campos como
  // DESVIO_ATIVIDADES entram na peça literalmente, sem passar pelo
  // sanitizador da IA. Limpar aqui pega todos os tokens de uma vez.
  limparTravessoesDosDados(dados);
  return dados;
}