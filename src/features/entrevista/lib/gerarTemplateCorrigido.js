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
// Título de capítulo: parágrafo curto, todo em maiúsculas, começando por DO/DA/DOS/DAS/AO.
function _tituloCapitulo(s) {
  const t = (s || '').trim();
  return t.length > 3 && t.length < 85 && t === t.toUpperCase() && /^(D[AEO]S? |AO )/.test(t) ? t : null;
}
function _soTags(s) { return /^(\{\{[#^/][A-Za-z_0-9.]*\}\})+$/.test((s || '').trim()); }
function _soTagsAbertura(s) { return _soTags(s) && !/\{\{\//.test(s); }

// Move um capítulo INTEIRO para imediatamente antes de outro.
//
// Dois cuidados que fazem a diferença entre reordenar e quebrar a peça:
//  (1) o bloco movido NÃO leva as tags que abrem/fecham as seções vizinhas — o
//      corte recua enquanto o parágrafo for só tag;
//  (2) a inserção acontece ANTES das tags que ABREM a seção do capítulo de
//      destino. Sem isso, o capítulo movido cairia DENTRO da condicional do
//      vizinho: o dano moral, por exemplo, só sairia em peça com tomadora,
//      porque a Súmula 331 é precedida de {{#tem_tomadora}}.
function _moverCapituloAntesDe(xml, tituloMover, tituloAntesDe) {
  const ehTitulo = (p, titulo) => {
    const t = _textoPara(p.raw).trim();
    return !!_tituloCapitulo(t) && t.startsWith(titulo);
  };
  const ps = _paras(xml);
  const ini = ps.findIndex((p) => ehTitulo(p, tituloMover));
  const destinoAtual = ps.findIndex((p) => ehTitulo(p, tituloAntesDe));
  if (ini < 0 || destinoAtual < 0) return { xml, movido: false, motivo: 'capítulo não encontrado' };
  if (ini < destinoAtual) return { xml, movido: false, motivo: 'já está na posição' };

  let prox = -1;
  for (let i = ini + 1; i < ps.length; i++) {
    if (_tituloCapitulo(_textoPara(ps[i].raw))) { prox = i; break; }
  }
  if (prox < 0) return { xml, movido: false, motivo: 'sem capítulo seguinte' };
  let fim = prox - 1;
  while (fim > ini && _soTags(_textoPara(ps[fim].raw))) fim--;
  if (fim <= ini) return { xml, movido: false, motivo: 'bloco vazio' };

  const bloco = xml.slice(ps[ini].start, ps[fim].end);
  const resto = xml.slice(0, ps[ini].start) + xml.slice(ps[fim].end);

  const ps2 = _paras(resto);
  let alvo = ps2.findIndex((p) => ehTitulo(p, tituloAntesDe));
  if (alvo < 0) return { xml, movido: false, motivo: 'destino perdido após o corte' };
  while (alvo > 0 && _soTagsAbertura(_textoPara(ps2[alvo - 1].raw))) alvo--;
  return { xml: resto.slice(0, ps2[alvo].start) + bloco + resto.slice(ps2[alvo].start), movido: true };
}
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
function _removerParagrafosTag(xml, textos, { apenasUltimo = null, regex = null } = {}) {
  const ps = _paras(xml);
  const alvos = ps.filter((p) => {
    const t = _textoPara(p.raw).trim();
    return regex ? regex.test(t) : textos.includes(t);
  });
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

// Desativa um bloco de IA por completo, deixando o texto determinístico solto.
// ATENÇÃO: no modelo real as tags de abertura vivem TODAS NO MESMO parágrafo
// ("{{#BLOCO_X}}{{BLOCO_X}}{{/BLOCO_X}}"), e só o {{^BLOCO_X}} e o fechamento
// final ficam sozinhos. Comparar por texto exato removia apenas esses dois e
// deixava o bloco da IA vivo — com o {{^}} fora, a peça sairia com o capítulo da
// IA E o determinístico, duplicados. Por isso o alvo é qualquer parágrafo
// composto SÓ por tags deste bloco.
function _desativarBloco(xml, bloco) {
  return _removerParagrafosTag(xml, [], {
    regex: new RegExp(`^(?:\\{\\{[#^/]?${bloco}\\}\\})+$`),
  });
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
// apontou "pedidos incompletos, fora da estrutura": o rol saía com bullet
// literal enquanto a peça dela numera cada pedido.
function _numerarRol(xml, numId) {
  const ps = _paras(xml);
  const idxInicio = ps.findIndex((p) => _textoPara(p.raw).includes('passa a expor seus pedidos'));
  if (idxInicio < 0) return { xml, alterados: 0 };
  // Fim do rol: o parágrafo de fecho da peça. Tudo entre a abertura e ele é item.
  let idxFim = ps.findIndex((p, i) => i > idxInicio && _textoPara(p.raw).trim().startsWith('Diante do exposto'));
  if (idxFim < 0) idxFim = ps.length;
  // A indentação TEM de vir de um parágrafo que já renderiza certo. Montar um
  // pPr do zero (só pStyle + numPr) deixava o recuo por conta da definição da
  // lista nova e o rol saiu numa coluna estreita no canto da página — conferido
  // renderizando o modelo. Então clonamos o pPr do parágrafo numerado que abre o
  // rol ("Assim, o reclamante passa a expor seus pedidos:") e só trocamos o
  // numId, para o rol ter contador próprio começando em 1 — como na peça da
  // especialista, em que o corpo usa uma lista e o rol usa outra.
  const pPrAbertura = _pPr(ps[idxInicio].raw);
  const pPrNovo = /<w:numId\s+w:val="\d+"\s*\/>/.test(pPrAbertura)
    ? pPrAbertura.replace(/<w:numId\s+w:val="\d+"\s*\/>/, `<w:numId w:val="${numId}"/>`)
    : `<w:pPr><w:pStyle w:val="PargrafodaLista"/>` +
      `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`;
  // TODO item do rol entra na MESMA lista. A versão anterior só convertia
  // parágrafo com bullet "•" literal — e os cinco últimos pedidos (custas e
  // honorários, juros, IR, INSS, ofícios) nunca tiveram bullet: já vinham
  // numerados por OUTRA lista do modelo. Resultado: a contagem reiniciava em 1
  // no meio do rol, que é a "sequência da numeração incorreta" da revisão.
  const SO_TAG = /^(\{\{[#^/][^}]*\}\})+$/;
  let out = xml;
  let alterados = 0;
  for (let i = idxFim - 1; i > idxInicio; i--) {
    const raw = ps[i].raw;
    const txt = _textoPara(raw).trim();
    if (!txt || SO_TAG.test(txt)) continue;
    // "Dos pedidos acima apontados, deverão ser apurados..." é fecho de texto
    // corrido, não pedido — na peça da especialista ele fica na lista do corpo.
    if (txt.startsWith('Dos pedidos acima apontados')) continue;
    // remove o bullet literal, quando houver, onde ele estiver
    let novo = raw.replace(/•\s*/, '');
    if (/<w:pPr>[\s\S]*?<\/w:pPr>/.test(novo)) novo = novo.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, pPrNovo);
    else if (/<w:pPr\s*\/>/.test(novo)) novo = novo.replace(/<w:pPr\s*\/>/, pPrNovo);
    else novo = novo.replace(/^<w:p([^>]*)>/, `<w:p$1>${pPrNovo}`);
    out = out.slice(0, ps[i].start) + novo + out.slice(ps[i].end);
    alterados++;
  }
  // A linha de abertura ("Assim, o reclamante passa a expor seus pedidos:")
  // estava numerada pela lista do CORPO, consumindo um número da sequência da
  // peça. Na peça da especialista ela não é numerada. É o último ajuste porque
  // tem o menor offset — os cortes acima não o invalidam.
  const semNumero = ps[idxInicio].raw.replace(/<w:numPr>[\s\S]*?<\/w:numPr>/, '');
  out = out.slice(0, ps[idxInicio].start) + semNumero + out.slice(ps[idxInicio].end);
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
  // valores do caso SINDEEPRES de origem — a peça de um vigilante saía pedindo
  // "2% por cláusula" onde a especialista pede 3% sobre o salário normativo.
  let percentuaisTokenizados = false;
  // A multa convencional está num <w:t> único (replace literal). Já a frase do
  // art. 71 vem fragmentada em vários runs no modelo — conferido no XML real —
  // então exige a substituição tolerante a tags, senão falha em silêncio.
  if (xml.includes('2% (dois por cento) por cláusula descumprida')) {
    xml = xml.split('2% (dois por cento) por cláusula descumprida').join('{{PERC_MULTA_CONV}}');
    percentuaisTokenizados = true;
  }
  // Sem pré-teste de distância: a primeira versão exigia "50%" e "artigo 71" a
  // menos de 80 caracteres um do outro e a substituição nunca rodava — no modelo
  // real há centenas de caracteres de tags XML entre as duas palavras (a frase
  // está partida em vários runs). Basta tentar e ver se mudou.
  if (!xml.includes('{{PERC_ART71}}')) {
    const antes = xml;
    xml = _substituirFraseTagTolerant(xml, '50% conforme artigo 71, §4º, da CLT', '{{PERC_ART71}}');
    if (xml !== antes) percentuaisTokenizados = true;
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
  // saíam todas como "a apurar em liquidação", sem valor). Cada linha é
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

  // 18c) DUPLICIDADE NO ROL. As verbas por hora passaram a ter linha PRÓPRIA com
  // valor (etapa 18), mas o modelo já tinha, para as mesmas verbas, linhas "a
  // apurar em liquidação". A peça saiu pedindo art. 71, noturno, 10 minutos e
  // periculosidade DUAS VEZES — uma com valor e outra sem. Aqui removemos as
  // linhas sem valor cuja verba agora está quantificada. As de horas extras
  // (descaracterização da 12x36 e excedentes da 8ª/44ª) e o DSR autônomo FICAM:
  // são teses próprias na peça da especialista e a decisão de fundi-las é do
  // escritório, não minha.
  const ROL_DUPLICADOS = [
    'intervalo intrajornada (art. 71 da CLT) e reflexos, a apurar em liquidação',
    'adicional noturno (20%) e hora noturna reduzida e reflexos, a apurar em liquidação',
    '10 (dez) minutos de descanso (cláusula 33ª) como hora extra e reflexos, a apurar em liquidação',
    'diferenças do adicional de periculosidade nas horas extras e reflexos, a apurar em liquidação',
    'minutos que antecedem/sucedem a jornada e reflexos, a apurar em liquidação',
  ];
  let rolDuplicadosRemovidos = 0;
  {
    const ps = _paras(xml);
    for (let i = ps.length - 1; i >= 0; i--) {
      const texto = _textoPara(ps[i].raw);
      if (!ROL_DUPLICADOS.some((d) => texto.includes(d))) continue;
      xml = xml.slice(0, ps[i].start) + xml.slice(ps[i].end);
      rolDuplicadosRemovidos++;
    }
  }

  // 18d) A linha das multas no ROL ainda trazia o "2%" fixo do caso de origem —
  // o capítulo já tinha sido tokenizado, o rol não.
  let rolMultaTokenizada = false;
  if (xml.includes('multas convencionais (2% por cláusula descumprida)')) {
    xml = xml.split('multas convencionais (2% por cláusula descumprida)')
      .join('multas convencionais ({{PERC_MULTA_CONV}})');
    rolMultaTokenizada = true;
  }

  // 18a) LISTA DAS MULTAS CONVENCIONAIS, um item por parágrafo. As três tags do
  // loop estão no MESMO parágrafo ("{{#pedidos_multas}}{{.}}{{/pedidos_multas}}"),
  // e aí o docxtemplater repete inline: as infrações saem todas emendadas num
  // parágrafo único separadas por ";" — foi como saiu na peça revisada. Com as
  // tags em parágrafos separados, o paragraphLoop repete o parágrafo do meio e
  // cada infração vira um item numerado.
  let multasEmItens = false;
  {
    const ps = _paras(xml);
    const i = ps.findIndex((p) => _textoPara(p.raw).trim() === '{{#pedidos_multas}}{{.}}{{/pedidos_multas}}');
    if (i >= 0) {
      const pPr = _pPr(ps[i].raw);
      const novo = _paraTx('{{#pedidos_multas}}') + _paraTx('{{.}}', pPr) + _paraTx('{{/pedidos_multas}}');
      xml = xml.slice(0, ps[i].start) + novo + xml.slice(ps[i].end);
      multasEmItens = true;
    }
  }

  // 18b) CONTRATO DE TRABALHO na numeração. Os parágrafos das modalidades
  // (aqueles com {{DATA_ADMISSAO}} e {{SALARIO}}) não têm numeração, e agora que
  // o contrato sempre aparece ele ficaria sem número entre parágrafos numerados
  // — a outra metade do "fora da estrutura" apontado na revisão. Recebem o pPr
  // do primeiro parágrafo numerado do corpo (mesma lista, mesma indentação).
  let contratoNumerado = 0;
  {
    const ps = _paras(xml);
    const pPrCorpo = _pPr((ps.find((p) => /<w:numPr>/.test(p.raw)) || {}).raw || '');
    if (pPrCorpo) {
      for (let i = ps.length - 1; i >= 0; i--) {
        const raw = ps[i].raw;
        if (/<w:numPr>/.test(raw)) continue;
        const t = _textoPara(raw);
        if (!(t.includes('{{DATA_ADMISSAO}}') && t.includes('{{SALARIO}}'))) continue;
        const novo = /<w:pPr>[\s\S]*?<\/w:pPr>/.test(raw)
          ? raw.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, pPrCorpo)
          : raw.replace(/^<w:p([^>]*)>/, `<w:p$1>${pPrCorpo}`);
        xml = xml.slice(0, ps[i].start) + novo + xml.slice(ps[i].end);
        contratoNumerado++;
      }
    }
  }

  // 18f) PEDIDOS EM DUPLICIDADE no rol. Estes quatro itens genéricos repetem
  // verbas que JÁ constam do rol com valor próprio, logo acima:
  //   • "verbas rescisórias (saldo, férias vencidas...)" repete saldo, aviso,
  //     13º, férias e FGTS, todos já pedidos com valor;
  //   • "multa do art. 477 e multa do art. 467" repete os dois itens anteriores;
  //   • "honorários; juros; IR; INSS; ofícios" amontoa num item só o que o rol
  //     pede individualmente nos cinco itens finais;
  //   • "salários em aberto (...) e reflexos" repete o item de salários em aberto.
  // A peça da especialista não tem nenhum deles.
  const ROL_GENERICOS = [
    'verbas rescisórias (saldo de salário, férias vencidas se houver, e demais diferenças), a apurar em liquidação',
    'multa do art. 477 e multa do art. 467 da CLT',
    'honorários advocatícios sucumbenciais de 15%; juros de mora e correção monetária',
    'salários em aberto ({{SALARIOS_ABERTO}}) e reflexos',
  ];
  let rolGenericosRemovidos = 0;
  {
    const ps = _paras(xml);
    for (let i = ps.length - 1; i >= 0; i--) {
      const txt = _textoPara(ps[i].raw);
      if (!ROL_GENERICOS.some((g) => txt.includes(g))) continue;
      xml = xml.slice(0, ps[i].start) + xml.slice(ps[i].end);
      rolGenericosRemovidos++;
    }
  }

  // 18e) ORDEM DOS CAPÍTULOS — conferida título a título contra a peça da
  // especialista no caso Marcos ("Feita pela especialista.docx", 32 capítulos).
  // A ordem da peça é a ordem das tags no .docx; não havia array de
  // sequenciamento. Duas divergências, e só duas:
  //
  //   dela:    CONTRATO → DANO MORAL → SÚMULA 331 → DESVIO → JORNADA
  //   modelo:  CONTRATO → SÚMULA 331 → DESVIO → … → VT → VA → DANO MORAL
  //
  // O pedido foi: a Súmula 331 depois do dano moral e antes da jornada. Antes da
  // jornada ela já estava; o que estava fora de lugar era o dano moral, lá
  // embaixo. Movido o dano moral para antes da Súmula 331, a sequência se forma.
  //
  // ATENÇÃO: isto REVERTE a etapa anterior, que levava o dano moral para
  // imediatamente antes das multas convencionais. A peça da especialista traz o
  // dano moral logo depois do contrato de trabalho — é ela o padrão.
  //
  // O dano moral entra depois do bloco de doença/estabilidade/pensão (que a peça
  // dela não tem) e imediatamente antes da Súmula 331: assim os fatos da doença,
  // quando existem, já estão narrados quando o dano moral os invoca.
  //
  // OUTRA DIVERGÊNCIA DE ORDEM, CONHECIDA E NÃO APLICADA (fora do que foi
  // pedido): na peça dela o DSR vem entre o adicional noturno e os 10 minutos
  // (NOTURNO → DSR → 10 MINUTOS → PERICULOSIDADE); no modelo ele está depois da
  // insalubridade. Para corrigir, basta acrescentar a linha abaixo:
  //   ['DO DESCANSO SEMANAL REMUNERADO', 'DOS 10 (DEZ) MINUTOS DE DESCANSO'],
  const ORDEM_CAPITULOS = [
    ['DO DANO MORAL', 'DA SÚMULA 331 DO C. TST'],
  ];
  let capitulosReordenados = 0;
  const ordemPendente = [];
  for (const [mover, antesDe] of ORDEM_CAPITULOS) {
    const r = _moverCapituloAntesDe(xml, mover, antesDe);
    if (r.movido) { xml = r.xml; capitulosReordenados++; }
    else if (r.motivo !== 'já está na posição') ordemPendente.push(`${mover}: ${r.motivo}`);
  }

  // 18g) ROL — REFLEXOS DISCRIMINADOS. A especialista apontou "pedidos sem
  // reflexos": eles ESTAVAM lá, mas como um valor único ("{{VALOR_ART71}} +
  // reflexos de {{VALOR_ART71_REFLEXOS}}"), impossível de conferir rubrica por
  // rubrica. No rol dela cada verba abre DSR, aviso prévio, 13º, férias + 1/3 e
  // FGTS + 40%, e só depois totaliza. A frase pronta vem do cálculo
  // (mathUtils.reflexosSobre → tag {{TAG_REFLEXOS_TEXTO}}); aqui só se troca o
  // formato da linha. Nenhum valor muda: a soma das rubricas é o mesmo 34,75%.
  const RE_REFLEXO_SOMADO = /^(\s*•?\s*)(.+?):\s*\{\{(VALOR_[A-Z0-9_]+)\}\}\s*\+\s*reflexos?\s+de\s*\{\{\3_REFLEXOS\}\}\s*;?\s*$/;
  let reflexosDiscriminados = 0;
  let ftDiscriminada = false;
  let rolMultaComValor = false;
  {
    const ps = _paras(xml);
    // De trás para frente: reescrever um parágrafo desloca os offsets seguintes.
    for (let i = ps.length - 1; i >= 0; i--) {
      const txt = _textoPara(ps[i].raw);
      const pPr = _pPr(ps[i].raw);
      const m = RE_REFLEXO_SOMADO.exec(txt);
      if (m) {
        const nova = _paraTx(
          `${m[1]}${m[2]}: valor principal estimado de {{${m[3]}}}, {{${m[3]}_REFLEXOS_TEXTO}};`,
          pPr,
        );
        xml = xml.slice(0, ps[i].start) + nova + xml.slice(ps[i].end);
        reflexosDiscriminados++;
        continue;
      }
      // Folgas/feriados: o rótulo do modelo já anunciava "e reflexo de DSR", e
      // agora a própria {{FT_100}} traz a rubrica aberta — senão sai duplicado.
      if (txt.includes('{{FT_100}}') && /e\s+reflexos?\s+de\s+DSR\s*:/i.test(txt)) {
        const nova = _paraTx(txt.replace(/\s*e\s+reflexos?\s+de\s+DSR\s*:/i, ':'), pPr);
        xml = xml.slice(0, ps[i].start) + nova + xml.slice(ps[i].end);
        ftDiscriminada = true;
        continue;
      }
      // Multas convencionais: a linha pedia a multa "a apurar em liquidação",
      // sem valor, enquanto a peça da especialista traz valor estimado. O
      // cálculo agora entrega {{VALOR_MULTAS_CONV}} (qtd. de cláusulas × % ×
      // salário normativo) e cai de volta em "a apurar" se não houver base.
      if (/multas convencionais/i.test(txt) && /a apurar em liquidação/i.test(txt)) {
        const nova = _paraTx(txt.replace(/,?\s*a apurar em liquidação/i, ': {{VALOR_MULTAS_CONV}}'), pPr);
        xml = xml.slice(0, ps[i].start) + nova + xml.slice(ps[i].end);
        rolMultaComValor = true;
        continue;
      }
    }
  }

  // 18h) DANO MORAL — narrativa com MARCADOR e em NEGRITO, como na peça da
  // especialista: lá são 8 parágrafos em numId 3 / ilvl 3 / PargrafodaLista,
  // negrito e sem sublinhado no texto, entre o parágrafo do art. 5º da CF e o
  // "Em razão dos fatos acima expostos". Dois defeitos no mesmo lugar:
  //
  //  (a) o parágrafo que recebe {{BLOCO_DANO_MORAL}} vinha com <w:pPr/> VAZIO.
  //      Sem numPr próprio, dividirParagrafosInjetados cai no pPr do último
  //      parágrafo numerado do corpo (numId 26) e a narrativa saía numerada em
  //      prosa, não com marcador.
  //
  //  (b) o capítulo trazia CINCO parágrafos FIXOS com marcador afirmando fatos do
  //      caso de origem do modelo ("O FGTS do obreiro nunca foi remunerado
  //      corretamente", "intervalo em torno de 10 a 15 minutos diariamente",
  //      "jamais pode efetuar a correta marcação nos cartões de ponto"). Saíam em
  //      TODA peça, ao lado da narrativa real: a do Marcos recebeu as duas
  //      coisas. A narrativa da IA ocupa o lugar deles.
  //
  // Cada fixo sai junto com o parágrafo vazio que o segue, senão ficam cinco
  // linhas em branco no meio do capítulo.
  const RPR_NARRATIVA = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
  let danoMoralFormatado = false;
  let danoMoralFixosRemovidos = 0;
  {
    const ps = _paras(xml);
    const ini = ps.findIndex((p) => _textoPara(p.raw).trim() === 'DO DANO MORAL');
    if (ini >= 0) {
      let fim = ps.length;
      for (let i = ini + 1; i < ps.length; i++) {
        if (_tituloCapitulo(_textoPara(ps[i].raw))) { fim = i; break; }
      }
      const comMarcador = (raw) => /<w:numId\s+w:val="3"\s*\/>/.test(raw) && /<w:ilvl\s+w:val="3"\s*\/>/.test(raw);
      const modelo = ps.slice(ini, fim).find((p) => comMarcador(p.raw));
      const pPrMarcador = modelo ? _pPr(modelo.raw) : '';
      let narrativa = null;
      const remover = [];
      for (let i = ini + 1; i < fim; i++) {
        const raw = ps[i].raw;
        const txt = _textoPara(raw).trim();
        if (txt.includes('{{BLOCO_DANO_MORAL}}')) { narrativa = ps[i]; continue; }
        if (comMarcador(raw) && txt && !txt.includes('{{')) {
          const vazioSeguinte = i + 1 < fim && !_textoPara(ps[i + 1].raw).trim() ? ps[i + 1] : null;
          remover.push([ps[i].start, vazioSeguinte ? vazioSeguinte.end : ps[i].end]);
          if (vazioSeguinte) i++;
        }
      }
      // Remove de trás para frente; o parágrafo da narrativa vem ANTES de todos
      // os fixos, então os offsets dele seguem válidos depois das remoções.
      for (const [a, b] of remover.reverse()) {
        xml = xml.slice(0, a) + xml.slice(b);
        danoMoralFixosRemovidos++;
      }
      if (narrativa && pPrMarcador) {
        let novo = narrativa.raw.replace(/<w:pPr\s*\/>|<w:pPr>[\s\S]*?<\/w:pPr>/, '');
        novo = novo.replace(/<w:p\b([^>]*)>/, `<w:p$1>${pPrMarcador}`);
        // quebrarParagrafo replica o w:rPr do run em cada parágrafo que cria,
        // então o negrito posto aqui vale para a narrativa inteira.
        novo = novo.replace(/<w:r\b([^>]*)>(?!<w:rPr)/g, `<w:r$1>${RPR_NARRATIVA}`);
        xml = xml.slice(0, narrativa.start) + novo + xml.slice(narrativa.end);
        danoMoralFormatado = true;
      }
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
    contratoNumerado,
    multasEmItens,
    rolDuplicadosRemovidos,
    rolMultaTokenizada,
    capitulosReordenados,
    ordemPendente,
    rolGenericosRemovidos,
    reflexosDiscriminados,
    ftDiscriminada,
    rolMultaComValor,
    danoMoralFormatado,
    danoMoralFixosRemovidos,
  };
}