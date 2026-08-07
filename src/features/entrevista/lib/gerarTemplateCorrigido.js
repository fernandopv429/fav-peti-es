import PizZip from 'pizzip';

// ============================================================
// Gera uma cópia CORRIGIDA do template .docx oficial do escritório,
// adicionando ao "DOS PEDIDOS" as verbas que o código calcula mas
// o template original não exibia (saldo de salário, multa art. 467,
// multa art. 477 §8º e salários em aberto) — assim o valor da causa
// bate com a soma dos pedidos listados.
//
// Roda 100% no navegador: baixa o .docx, edita o document.xml,
// reempacota com PizZip e dispara o download. Sem upload, sem backend.
// ============================================================

const SALDO =
  '<w:p><w:pPr/><w:r><w:t>{{#sem_justa_causa}}</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/></w:pPr><w:r><w:t>\u2022 saldo de sal\u00e1rio (dias trabalhados no m\u00eas da rescis\u00e3o): {{VALOR_SALDO_SALARIO}};</w:t></w:r></w:p>' +
  '<w:p><w:pPr/><w:r><w:t>{{/sem_justa_causa}}</w:t></w:r></w:p>';

const AVISO =
  '<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/></w:pPr><w:r><w:t>\u2022 aviso pr\u00e9vio indenizado: {{VALOR_AVISO_PREVIO}};</w:t></w:r></w:p>';

const MULTAS =
  '<w:p><w:pPr/><w:r><w:t>{{#sem_justa_causa}}</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/></w:pPr><w:r><w:t>\u2022 multa do art. 467 da CLT (pagamento intempestivo das verbas rescis\u00f3rias): {{VALOR_MULTA_467}};</w:t></w:r></w:p>' +
  '<w:p><w:pPr/><w:r><w:t>{{/sem_justa_causa}}</w:t></w:r></w:p>' +
  '<w:p><w:pPr/><w:r><w:t>{{#sem_justa_causa}}</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/></w:pPr><w:r><w:t>\u2022 multa do art. 477, \u00a78\u00ba, da CLT (pagamento intempestivo das verbas rescis\u00f3rias): {{VALOR_MULTA_477}};</w:t></w:r></w:p>' +
  '<w:p><w:pPr/><w:r><w:t>{{/sem_justa_causa}}</w:t></w:r></w:p>' +
  '<w:p><w:pPr/><w:r><w:t>{{#salarios_em_aberto}}</w:t></w:r></w:p>' +
  '<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/></w:pPr><w:r><w:t>\u2022 sal\u00e1rios em aberto: {{VALOR_SALARIOS_ABERTO}};</w:t></w:r></w:p>' +
  '<w:p><w:pPr/><w:r><w:t>{{/salarios_em_aberto}}</w:t></w:r></w:p>';

const FGTS =
  '<w:p><w:pPr><w:pStyle w:val="PargrafodaLista"/></w:pPr><w:r><w:t>\u2022 FGTS + multa de 40%: {{VALOR_FGTS}} + {{VALOR_MULTA_40}};</w:t></w:r></w:p>';

// ------------------------------------------------------------
// Helpers para abrir tópicos à redação da IA sem quebrar o determinístico:
// inserem parágrafos novos com seção invertida — {{#BLOCO}} usa o texto da IA
// quando presente; {{^BLOCO}} mantém a prosa ORIGINAL do template como fallback.
// Operam por índice de parágrafo (robusto à fragmentação em vários <w:t>).
// ------------------------------------------------------------
function _paras(xml) {
  const out = []; const re = /<w:p\b[\s\S]*?<\/w:p>/g; let m;
  while ((m = re.exec(xml))) out.push({ raw: m[0], start: m.index, end: m.index + m[0].length });
  return out;
}
function _textoPara(raw) {
  return (raw.match(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g) || []).map((t) => t.replace(/<[^>]*>/g, '')).join('');
}
function _pPr(raw) { const m = raw.match(/<w:pPr>[\s\S]*?<\/w:pPr>/); return m ? m[0] : ''; }
function _paraTx(conteudo, pPr = '') {
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${conteudo}</w:t></w:r></w:p>`;
}
// Insere, DEPOIS da posição `posDepois` e ANTES da posição `posAntes`, os tags de
// abertura/fechamento do fallback invertido, com o bloco de IA no topo.
// Substitui uma frase no XML permitindo tags XML entre as palavras (preserva o resto).
function _substituirFraseTagTolerant(xml, frase, destino) {
  const partes = frase.split(/\s+/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = partes.join('\\s*(?:<[^>]+>)*\\s*');
  return xml.replace(new RegExp(pattern, 'gi'), destino);
}

// Remove os parágrafos cujo texto É exatamente uma das tags dadas. Usado para
// desativar um bloco de IA sem tocar no texto determinístico que estava dentro
// do fallback invertido. Percorre de trás para frente para os offsets de
// _paras() continuarem válidos.
function _removerParagrafosTag(xml, textos, { apenasUltimo = null } = {}) {
  const ps = _paras(xml);
  const alvos = ps.filter((p) => textos.includes(_textoPara(p.raw).trim()));
  const selecionados = apenasUltimo
    ? alvos.filter((p) => _textoPara(p.raw).trim() !== apenasUltimo)
      .concat(alvos.filter((p) => _textoPara(p.raw).trim() === apenasUltimo).slice(-1))
    : alvos;
  selecionados.sort((a, b) => a.start - b.start);
  let out = xml;
  for (let i = selecionados.length - 1; i >= 0; i--) {
    out = out.slice(0, selecionados[i].start) + out.slice(selecionados[i].end);
  }
  return { xml: out, removidos: selecionados.length };
}

// Desativa um bloco de IA por completo: apaga as 4 tags de abertura e o
// fechamento do fallback, deixando o texto determinístico do escritório solto.
function _desativarBloco(xml, bloco) {
  return _removerParagrafosTag(xml, [`{{#${bloco}}}`, `{{${bloco}}}`, `{{/${bloco}}}`, `{{^${bloco}}}`]);
}

// numId decimal ainda NÃO usado no documento: dá ao rol uma lista própria, que
// reinicia em 1 (é assim na peça da especialista — corpo numId 5, rol numId 4).
function _numIdDecimalLivre(zip, xmlDoc) {
  const numbering = zip.file('word/numbering.xml');
  if (!numbering) return null;
  const xmlNum = numbering.asText();
  const usados = new Set(
    [...xmlDoc.matchAll(/<w:numId\s+w:val="(\d+)"/g)].map((m) => m[1])
  );
  const decimais = new Set(
    [...xmlNum.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[\s\S]*?<\/w:abstractNum>/g)]
      .filter((m) => /<w:numFmt\s+w:val="decimal"/.test(m[0]))
      .map((m) => m[1])
  );
  for (const m of xmlNum.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[\s\S]*?<w:abstractNumId\s+w:val="(\d+)"/g)) {
    if (!usados.has(m[1]) && decimais.has(m[2])) return m[1];
  }
  return null;
}

// Converte os itens do rol de "• texto" para parágrafos NUMERADOS. A revisora
// apontou "pedidos incompletos, fora da estrutura": o rol saa com bullet
// literal enquanto a peça dela numera cada pedido.
function _numerarRol(xml, numId) {
  const ps = _paras(xml);
  const idxInicio = ps.findIndex((p) => _textoPara(p.raw).includes('passa a expor seus pedidos'));
  if (idxInicio < 0) return { xml, alterados: 0 };
  const pPrNovo =
    `<w:pPr><w:pStyle w:val="PargrafodaLista"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`;
  let out = xml;
  let alterados = 0;
  for (let i = ps.length - 1; i > idxInicio; i--) {
    const raw = ps[i].raw;
    if (!/^\s*•\s/.test(_textoPara(raw))) continue;
    let novo = raw.replace(/(<w:t\b[^>]*>)\s*•\s*/, '$1');
    if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(novo)) novo = novo.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, pPrNovo);
    else if (/<w:pPr\s*\/>/.test(novo)) novo = novo.replace(/<w:pPr\s*\/>/, pPrNovo);
    else novo = novo.replace(/^<w:p([^>]*)>/, `<w:p$1>${pPrNovo}`);
    out = out.slice(0, ps[i].start) + novo + out.slice(ps[i].end);
    alterados++;
  }
  return { xml: out, alterados };
}

function _envolver(xml, posAntes_ini, posDepois_fim, bloco, pPr) {
  // Cada tag em parágrafo SEPARADO — com paragraphLoop:true do docxtemplater,
  // {{#BLOCO}}/{{BLOCO}}/{{/BLOCO}} no mesmo <w:t> não reconhece a seção
  // condicional e trata {{BLOCO}} como tag solta (dispara o nullGetter).
  const antes =
    _paraTx(`{{#${bloco}}}`, pPr) +
    _paraTx(`{{${bloco}}}`, pPr) +
    _paraTx(`{{/${bloco}}}`, pPr) +
    _paraTx(`{{^${bloco}}}`);
  const fim = _paraTx(`{{/${bloco}}}`);
  let novo = xml.slice(0, posDepois_fim) + fim + xml.slice(posDepois_fim); // fim primeiro (posição maior)
  novo = novo.slice(0, posAntes_ini) + antes + novo.slice(posAntes_ini);
  return novo;
}

export async function baixarTemplateCorrigido(url, nomeArquivo = 'MODELO_PRINCIPAL_template_corrigido.docx') {
  if (!url) throw new Error('URL do template não informada.');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Não foi possível baixar o template (HTTP ${resp.status}).`);
  const ab = await resp.arrayBuffer();
  const zip = new PizZip(ab);
  let xml = zip.file('word/document.xml').asText();
  if (!xml) throw new Error('document.xml não encontrado no .docx.');

  const jaTemSaldo = xml.includes('VALOR_SALDO_SALARIO');
  const jaTem467 = xml.includes('VALOR_MULTA_467');
  const jaTem477 = xml.includes('VALOR_MULTA_477');
  const jaTemSalarios = xml.includes('VALOR_SALARIOS_ABERTO');

  // 1) Saldo de salário entra antes do aviso prévio (rescisórias)
  if (!jaTemSaldo && xml.includes(AVISO)) {
    xml = xml.replace(AVISO, SALDO + AVISO);
  }
  // 2) Multas 467/477 + salários em aberto entram após o FGTS+40%
  if ((!jaTem467 || !jaTem477 || !jaTemSalarios) && xml.includes(FGTS)) {
    xml = xml.replace(FGTS, FGTS + MULTAS);
  }
  // 3) E-mail pessoal do reclamante: substitui o texto fixo "O autor não possui
  // correio eletrônico" por um campo {{RECL_EMAIL}} preenchido pelo parser.
  if (xml.includes('O autor n\u00e3o possui correio eletr\u00f4nico')) {
    xml = xml.replace(
      'O autor n\u00e3o possui correio eletr\u00f4nico',
      '{{#RECL_EMAIL}}O autor possui endere\u00e7o de e-mail pessoal: {{RECL_EMAIL}}{{/RECL_EMAIL}}{{^RECL_EMAIL}}O autor n\u00e3o possui correio eletr\u00f4nico{{/RECL_EMAIL}}'
    );
  }

  // 4) Desvio de função: substitui a narrativa FIXA do template por um
  // marcador {{BLOCO_ENQUADRAMENTO}} preenchido pela IA (capítulo rico e
  // sob medida). Fallback determinístico em dadosTemplate garante texto
  // mesmo se a IA não rodar. Mantém o título "DO DESVIO DE FUNÇÃO" e o
  // wrapper condicional {{#desvio_funcao}}...{{/desvio_funcao}}.
  const NARRATIVA_DESVIO =
    'Embora o reclamante tenha informado habitualmente à reclamada sobre o desvio de função, prática vedada pela Convenção Coletiva de Trabalho da Categoria (cláusula 64ª), uma vez que executava, além das funções de {{RECL_FUNCAO}}, {{DESVIO_ATIVIDADES}}, não recebeu qualquer compensação pecuniária a esse título. Portanto, a reclamada deve ser condenada ao pagamento da multa convencional de 50% por mês laborado, com reflexos nos DSRs, férias acrescidas de 1/3, 13º salários e FGTS + 40%.';
  if (!xml.includes('BLOCO_ENQUADRAMENTO') && xml.includes(NARRATIVA_DESVIO)) {
    xml = xml.replace(NARRATIVA_DESVIO, '{{BLOCO_ENQUADRAMENTO}}');
  }

  // 5) Multas convencionais: substitui a frase fixa de abertura (que deixava
  // o número da cláusula {{CCT_CLAUSULA_MULTA}} em branco quando não extraído)
  // por {{BLOCO_MULTAS_CONVENCIONAIS}} — bloco redigido pela IA (parágrafo
  // rico e coerente) ou pelo fallback determinístico de dadosTemplate. A
  // frase inteira está em uma única <w:t>, então a substituição é literal e
  // segura. A lista de infrações que se segue no template é preservada.
  const FRASE_MULTAS = 'O reclamante requer a aplica\u00e7\u00e3o da multa da cl\u00e1usula {{CCT_CLAUSULA_MULTA}} da CCT \u2013 {{CCT_ANO}} e as anteriores, eis que a reclamada n\u00e3o cumpriu com as obriga\u00e7\u00f5es convencionais, onde passamos a discorrer as infra\u00e7\u00f5es infra:';
  if (!xml.includes('BLOCO_MULTAS_CONVENCIONAIS') && xml.includes(FRASE_MULTAS)) {
    xml = xml.replace(FRASE_MULTAS, '{{BLOCO_MULTAS_CONVENCIONAIS}}');
  }

  // 6) DANO MORAL: o corpo do capítulo é o campo {{DANO_MORAL_FATO_ESPECIFICO}}
  // (parágrafo único, não fragmentado). Troca por bloco de IA com fallback ao
  // próprio campo determinístico.
  if (!xml.includes('BLOCO_DANO_MORAL')) {
    xml = xml.replace(
      '{{DANO_MORAL_FATO_ESPECIFICO}}',
      '{{#BLOCO_DANO_MORAL}}{{BLOCO_DANO_MORAL}}{{/BLOCO_DANO_MORAL}}{{^BLOCO_DANO_MORAL}}{{DANO_MORAL_FATO_ESPECIFICO}}{{/BLOCO_DANO_MORAL}}'
    );
  }

  // 7) ESPINHA DA RESCISÃO: envolve os parágrafos das modalidades (do
  // {{#sem_justa_causa}}“O reclamante foi admitido…” até o {{/coacao_demissao}})
  // com {{^BLOCO_ESPINHA_RESCISAO}} — a IA sobrescreve a tese quando redige.
  if (!xml.includes('BLOCO_ESPINHA_RESCISAO')) {
    const ps = _paras(xml);
    const ini = ps.findIndex((p) => { const t = _textoPara(p.raw); return t.includes('{{#sem_justa_causa}}') && t.includes('O reclamante foi admitido'); });
    const fim = ini < 0 ? -1 : ps.findIndex((p, i) => i >= ini && _textoPara(p.raw).includes('{{/coacao_demissao}}'));
    if (ini >= 0 && fim >= 0) xml = _envolver(xml, ps[ini].start, ps[fim].end, 'BLOCO_ESPINHA_RESCISAO', _pPr(ps[ini].raw));
  }

  // 8) SÚMULA 331 e 9) JORNADA voltam a ser 100% DETERMINÍSTICAS.
  // Estas duas etapas antes ABRIAM os capítulos à redação da IA. Decisão
  // revertida com a revisão da especialista: o modelo já tem o texto padrão do
  // escritório para os dois, e o da jornada é exatamente o parágrafo curto que
  // ela aprova (54 palavras) — a IA o substituía por 988 palavras "fora da
  // estrutura". O texto da Súmula 331 é idêntico nas três peças de referência,
  // ou seja, não varia com o caso. Aqui as tags são REMOVIDAS de modelos que já
  // as tenham, deixando a prosa determinística solta.
  const jornadaDesativada = _desativarBloco(xml, 'BLOCO_JORNADA');
  xml = jornadaDesativada.xml;
  const sumula331Desativada = _desativarBloco(xml, 'BLOCO_SUMULA_331');
  xml = sumula331Desativada.xml;

  // 10) GÊNERO: troca "o autor" fixo do template por "o reclamante" — a flexão
  // de exportação (preencherDocxTemplate.aplicarGenero) já converte "o
  // reclamante" → "a reclamante" quando o reclamante é mulher. "a parte autora"
  // (a parte = feminino gramatical para ambos os gêneros) é preservada. Assim o
  // template novo sai já estruturado para o gênero correto, sem edição manual.
  const FRASES_AUTOR = [
    ['O autor opta pela tramitação', 'O reclamante opta pela tramitação'],
    ['O autor possui endereço de e-mail pessoal', 'O reclamante possui endereço de e-mail pessoal'],
    ['o autor prestou serviços', 'o reclamante prestou serviços'],
    ['patrono do autor', 'patrono do reclamante'],
    ['O autor, nos termos da inclusa declaração', 'O reclamante, nos termos da inclusa declaração'],
  ];
  let autorCorrigido = false;
  for (const [a, b] of FRASES_AUTOR) {
    if (xml.includes(a)) { xml = _substituirFraseTagTolerant(xml, a, b); autorCorrigido = true; }
  }

  // 11) E-MAIL NO PREÂMBULO: garante que a qualificação do reclamante tenha
  // o campo {{RECL_EMAIL}} (e-mail pessoal do cliente). Se o template original
  // não o incluir após o endereço, insere ", com correio eletrônico
  // {{RECL_EMAIL}}" logo após {{RECL_ENDERECO}}. Não duplica se já existir.
  let emailPreambuloAdicionado = false;
  if (xml.includes('{{RECL_ENDERECO}}') && !/{{RECL_EMAIL}}/.test(xml.slice(xml.indexOf('{{RECL_ENDERECO}}'), xml.indexOf('{{RECL_ENDERECO}}') + 300))) {
    xml = xml.replace(/(\{\{RECL_ENDERECO\}\})/, '$1, com correio eletrônico {{RECL_EMAIL}}');
    emailPreambuloAdicionado = true;
  }

  // 12) ROL DE PEDIDOS — remove os valores UNITÁRIOS informativos (entre
  // parênteses) que aparecem ao lado do TOTAL e estavam sendo somados
  // manualmente, inflando o rol em relação ao fecho (valor da causa
  // determinístico). Agora cada linha mostra só o valor total do pedido.
  // (Tags em <w:t> único no template — replace literal seguro.)
  let rolValoresUnitariosRemovidos = false;
  const ROL_UNITARIOS = [
    '({{VALOR_POR_FORA}}) ',
    '({{VALOR_AUX_ALIMENTACAO}}/dia) ',
    '({{ASSIDUIDADE_DIFERENCA}}/mês) ',
  ];
  for (const frag of ROL_UNITARIOS) {
    if (xml.includes(frag)) { xml = xml.split(frag).join(''); rolValoresUnitariosRemovidos = true; }
  }

  // 13) HONORÁRIOS — substitui o valor hardcodeado "R$ 10.012,79" (relicto
  // do modelo original) pela tag dinâmica {{VALOR_CAUSA_TOTAL}}. O "R$" e o
  // número podem estar em runs separados, por isso o replace é tag-tolerant.
  let honorariosCorrigido = false;
  if (xml.includes('10.012,79')) {
    xml = _substituirFraseTagTolerant(xml, 'R$ 10.012,79', '{{VALOR_CAUSA_TOTAL}}');
    honorariosCorrigido = true;
  }

  // 14) CONTRATO DE TRABALHO sempre presente. O parágrafo determinístico com o
  // salário ({{SALARIO}}) está dentro de {{^BLOCO_ESPINHA_RESCISAO}}, ou seja,
  // só aparece quando a IA NÃO escreve. Quando escrevia, o resumo do contrato
  // desaparecia inteiro — "fora da estrutura e não foi incluído o salário do
  // reclamante" na revisão. Removendo o {{^…}} e o seu fechamento, o contrato
  // sempre sai e a tese da IA vira capítulo próprio, logo acima.
  let contratoSempreVisivel = false;
  if (xml.includes('{{^BLOCO_ESPINHA_RESCISAO}}')) {
    const r = _removerParagrafosTag(
      xml,
      ['{{^BLOCO_ESPINHA_RESCISAO}}', '{{/BLOCO_ESPINHA_RESCISAO}}'],
      { apenasUltimo: '{{/BLOCO_ESPINHA_RESCISAO}}' }
    );
    xml = r.xml;
    contratoSempreVisivel = r.removidos > 0;
  }

  // 15) Percentuais que variam por categoria e o código já calcula
  // (dadosTemplate: PERC_MULTA_CONV = 3% vigilância / 20% demais; PERC_ART71 =
  // 60% cl. 12º vigilância / 50% art. 71 §4º). Estavam FIXOS no modelo com os
  // valores do caso SINDEEPRES de origem — a peça de um vigilante saa pedindo
  // "2% por cláusula" onde a especialista pede 3% sobre o salário normativo.
  let percentuaisTokenizados = false;
  const PERCENTUAIS = [
    ['2% (dois por cento) por cláusula descumprida', '{{PERC_MULTA_CONV}}'],
    ['50% conforme artigo 71, §4º, da CLT', '{{PERC_ART71}}'],
  ];
  for (const [de, para] of PERCENTUAIS) {
    if (xml.includes(de)) { xml = xml.split(de).join(para); percentuaisTokenizados = true; }
  }

  // 16) AVISO PRÉVIO: o modelo trazia a narrativa do caso de origem (redução do
  // art. 488 da CLT, "reduzindo o aviso prévio para 23 dias"), aplicada a
  // qualquer modalidade — inclusive dispensa sem justa causa, onde não cabe.
  // Fica a redução fora e os dias passam a vir de {{DIAS_AVISO_PREVIO}}.
  let avisoCorrigido = false;
  const AVISO_23 = ', não tendo no período de 30 dias anteriores a sua demissão, saído 2 horas mais cedo e nem mesmo ter deixado de comparecer ao trabalho por 7 dias seguidos, reduzindo o aviso prévio para 23 dias, como prevê a legislação trabalhista,';
  if (xml.includes(AVISO_23)) {
    xml = xml.split(AVISO_23).join(', fazendo jus ao aviso prévio indenizado de {{DIAS_AVISO_PREVIO}} dias, nos termos da Lei 12.506/11,');
    avisoCorrigido = true;
  }

  // 17) VERBAS RESCISÓRIAS: avos e períodos estavam fixos com os do caso de
  // origem ("2025/2026 – 11/12" e "de 2025 – 12/12") e contradiziam o próprio
  // rol da peça. O código já calcula AVOS_FERIAS_FRACAO/AVOS_13_FRACAO.
  let avosTokenizados = false;
  const AVOS = [
    ['Férias proporcionais + 1/3 2025/2026 – 11/12;', 'Férias proporcionais + 1/3 {{PERIODO_FERIAS_PROP}} – {{AVOS_FERIAS_FRACAO}};'],
    ['13º salário proporcional de 2025 – 12/12;', '13º salário proporcional {{PERIODO_13}} – {{AVOS_13_FRACAO}};'],
  ];
  for (const [de, para] of AVOS) {
    if (xml.includes(de)) { xml = xml.split(de).join(para); avosTokenizados = true; }
  }

  // 18) ROL: entram as verbas por hora que passaram a ser estimadas (antes
  // saam todas como "a apurar em liquidação", sem valor). Cada linha é
  // condicional ao próprio valor, com principal + reflexos discriminados.
  const ROL_HORAS = [
    ['VALOR_HE_PRORROGACAO', 'horas extras pela prorrogação da jornada'],
    ['VALOR_ART71', 'intervalo intrajornada suprimido (art. 71 da CLT)'],
    ['VALOR_NOTURNO', 'adicional noturno e hora noturna reduzida'],
    ['VALOR_DEZ_MINUTOS', '10 (dez) minutos de descanso a cada hora trabalhada'],
    ['VALOR_PERICULOSIDADE_HE', 'adicional de periculosidade sobre as horas extras'],
  ];
  let rolHorasAdicionado = false;
  if (!xml.includes('{{VALOR_ART71}}')) {
    const ps = _paras(xml);
    const ancora = ps.findIndex((p) => _textoPara(p.raw).includes('{{VALOR_DESVIO}}'));
    if (ancora >= 0) {
      const pPr = _pPr(ps[ancora].raw);
      const novas = ROL_HORAS.map(([tag, rotulo]) =>
        _paraTx(`{{#${tag}}}`) +
        _paraTx(`• ${rotulo}: {{${tag}}} + reflexos de {{${tag}_REFLEXOS}};`, pPr) +
        _paraTx(`{{/${tag}}}`)
      ).join('');
      xml = xml.slice(0, ps[ancora].end) + novas + xml.slice(ps[ancora].end);
      rolHorasAdicionado = true;
    }
  }

  // 19) ROL NUMERADO: troca o bullet literal "•" por lista numerada própria,
  // como na peça da especialista ("pedidos incompletos, fora da estrutura").
  let rolNumerado = 0;
  const numIdRol = _numIdDecimalLivre(zip, xml);
  if (numIdRol) {
    const r = _numerarRol(xml, numIdRol);
    xml = r.xml;
    rolNumerado = r.alterados;
  }

  zip.file('word/document.xml', xml);
  const blob = zip.generate({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

  return {
    saldoAdicionado: !jaTemSaldo,
    multa467Adicionada: !jaTem467,
    multa477Adicionada: !jaTem477,
    salariosAbertoAdicionado: !jaTemSalarios,
    autorCorrigido,
    emailPreambuloAdicionado,
    rolValoresUnitariosRemovidos,
    honorariosCorrigido,
    jornadaDeterministica: jornadaDesativada.removidos > 0,
    sumula331Deterministica: sumula331Desativada.removidos > 0,
    contratoSempreVisivel,
    percentuaisTokenizados,
    avisoCorrigido,
    avosTokenizados,
    rolHorasAdicionado,
    rolNumerado,
  };
}