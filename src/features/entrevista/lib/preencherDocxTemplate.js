import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

// ============================================================
// Concordância de gênero (quando a reclamante é mulher)
// Passe CURADO e conservador: só troca termos que inequivocamente
// se referem à reclamante. NÃO mexe em "autor" (aparece em citações
// doutrinárias). Melhor-esforço — a revisão humana continua obrigatória.
// ============================================================
const GENERO_FEM = [
  [/\bo reclamante\b/g, 'a reclamante'],
  [/\bdo reclamante\b/g, 'da reclamante'],
  [/\bao reclamante\b/g, 'à reclamante'],
  [/\bpelo reclamante\b/g, 'pela reclamante'],
  [/\bo obreiro\b/g, 'a obreira'],
  [/\bdo obreiro\b/g, 'da obreira'],
  [/\bao obreiro\b/g, 'à obreira'],
  [/\bobreiro\b/g, 'obreira'],
  [/\bportador\b/g, 'portadora'],
  [/\binscrito\b/g, 'inscrita'],
  [/\bnascido\b/g, 'nascida'],
  [/\bfilho de\b/g, 'filha de'],
  [/\bresidente e domiciliado\b/g, 'residente e domiciliada'],
  [/\bdomiciliado\b/g, 'domiciliada'],
  [/\badmitido\b/g, 'admitida'],
  [/\bdispensado\b/g, 'dispensada'],
  [/\bcoagido\b/g, 'coagida'],
  [/\bameaçado\b/g, 'ameaçada'],
  [/\bcompelido\b/g, 'compelida'],
  [/\bsubmetido\b/g, 'submetida'],
  [/\bcontratado\b/g, 'contratada'],
  [/\bprejudicado\b/g, 'prejudicado(a)'],
  [/\bregistrado\b/g, 'registrada'],
  [/\bbrasileiro\b/g, 'brasileira'],
  [/\bcasado\b/g, 'casada'],
  [/\bsolteiro\b/g, 'solteira'],
  [/\bdivorciado\b/g, 'divorciada'],
  [/\bviúvo\b/g, 'viúva'],
  [/\bseparado\b/g, 'separada'],
];

function aplicarGenero(zip) {
  const alvo = 'word/document.xml';
  const file = zip.file(alvo);
  if (!file) return;
  let xml = file.asText();
  for (const [re, sub] of GENERO_FEM) xml = xml.replace(re, sub);
  zip.file(alvo, xml);
}

// Concordância de gênero MASCULINA: o template-mestre veio com adjetivos no
// feminino (copiados de um modelo de reclamante mulher). Quando o reclamante é
// homem, masculiniza SÓ os termos que se referem inequivocamente ao autor/
// obreiro (frase a frase, seguro — nunca toca em "reclamada", que é a empresa).
const FRASES_MASC = [
  // Qualificação (template-mestre veio no feminino — masculiniza o reclamante)
  ['brasileira,', 'brasileiro,'],
  ['casada,', 'casado,'],
  ['solteira,', 'solteiro,'],
  ['divorciada,', 'divorciado,'],
  ['viúva,', 'viúvo,'],
  ['separada judicialmente,', 'separado judicialmente,'],
  ['portadora do RG', 'portador do RG'],
  ['portadora do CPF', 'portador do CPF'],
  ['filha de', 'filho de'],
  ['nascida em', 'nascido em'],
  ['residente e domiciliada', 'residente e domiciliado'],
  ['domiciliada na', 'domiciliado na'],
  // CPF (NUNCA CNPJ — "inscrita no CNPJ" refere-se à empresa e NÃO é tocado)
  ['e inscrita no CPF', 'e inscrito no CPF'],
  ['inscrita no CPF', 'inscrito no CPF'],
  // Contrato / rescisão
  ['admitida pela', 'admitido pela'],
  ['admitida em', 'admitido em'],
  ['ter sido contratada pela', 'ter sido contratado pela'],
  ['ter sido contratada', 'ter sido contratado'],
  ['contratada pela', 'contratado pela'],
  ['foi a mesma dispensada', 'foi o mesmo dispensado'],
  ['a mesma dispensada', 'o mesmo dispensado'],
  ['dispensada sem justa causa', 'dispensado sem justa causa'],
  ['dispensada do', 'dispensado do'],
  ['coagida a', 'coagido a'],
  ['ameaçada de', 'ameaçado de'],
  ['compelida a', 'compelido a'],
  ['submetida a', 'submetido a'],
  ['foi prejudicada de forma', 'foi prejudicado de forma'],
  ['foi prejudicada', 'foi prejudicado'],
  ['registrada na', 'registrado na'],
  // Artigo + reclamante/obreiro (a empresa é "reclamada" — nunca tocada)
  ['à reclamante', 'ao reclamante'],
  ['da reclamante', 'do reclamante'],
  ['pela reclamante', 'pelo reclamante'],
  ['a reclamante', 'o reclamante'],
  ['à obreira', 'ao obreiro'],
  ['da obreira', 'do obreiro'],
  ['a obreira', 'o obreiro'],
  ['obreira', 'obreiro'],
  // Dano moral — particípios/adjetivos que a IA redigiu no feminino e se
  // referem inequivocamente ao reclamante (homem). Só roda para M, então o
  // risco de atingir substantivos femininos (humilhação, situação) é baixo.
  ['estava diretamente ligada', 'estava diretamente ligado'],
  ['diretamente ligada', 'diretamente ligado'],
  ['rendê-la', 'rendê-lo'],
  ['humilhada', 'humilhado'],
  ['constrangida', 'constrangido'],
  ['envergonhada', 'envergonhado'],
  ['acuada', 'acuado'],
  ['menosprezada', 'menosprezado'],
];
function aplicarGeneroMasc(zip) {
  const alvo = 'word/document.xml';
  const file = zip.file(alvo);
  if (!file) return;
  let xml = file.asText();
  for (const [a, b] of FRASES_MASC) {
    if (a !== b) xml = substituirFraseTagTolerant(xml, a, b);
  }
  zip.file(alvo, xml);
}

// Escapa texto para uso em regex
function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Substitui uma frase no XML permitindo tags XML entre as palavras (preserva o resto)
function substituirFraseTagTolerant(xml, frase, destino) {
  const partes = frase.split(/\s+/).map(escaparRegex);
  const pattern = partes.join('\\s*(?:<[^>]+>)*\\s*');
  return xml.replace(new RegExp(pattern, 'gi'), destino);
}

// Correções pós-preenchimento do .docx:
// 1) Duplicação de palavras consecutivas idênticas (artifact do docxtemplater/paragraphLoop)
// 2) Erros recorrentes de redação do template (Súmula 425, grafia de município)
function corrigirTextoFinal(zip) {
  const alvo = 'word/document.xml';
  const file = zip.file(alvo);
  if (!file) return;
  let xml = file.asText();
  // 1) Remove duplicação "palavra palavra" dentro de cada nó de texto <w:t>
  xml = xml.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (m, open, text, close) => {
    const corrigido = text.replace(/\b([\wÀ-ÿ][\wÀ-ÿ-]*)\s+\1\b/gi, '$1');
    return open + corrigido + close;
  });
  // 2) Correções de redação (tolerante a tags entre palavras)
  // A troca da Súmula 425 pelo art. 791-A tem de levar a PREPOSIÇÃO junto. O
  // modelo diz "nos termos DA Súmula 425 do Tribunal Superior do Trabalho" e a
  // substituição só do miolo produzia "nos termos da artigo 791-A da CLT" — o erro
  // de concordância que saiu nas TRÊS peças e foi apontado na revisão e na
  // auditoria. As formas com preposição vêm primeiro; a genérica é a rede.
  xml = substituirFraseTagTolerant(xml, 'da Súmula 425 do Tribunal Superior do Trabalho', 'do artigo 791-A da CLT');
  xml = substituirFraseTagTolerant(xml, 'na Súmula 425 do Tribunal Superior do Trabalho', 'no artigo 791-A da CLT');
  xml = substituirFraseTagTolerant(xml, 'da Súmula 425 do C. TST', 'do artigo 791-A da CLT');
  xml = substituirFraseTagTolerant(xml, 'da Súmula 425 do TST', 'do artigo 791-A da CLT');
  xml = substituirFraseTagTolerant(xml, 'Súmula 425 do Tribunal Superior do Trabalho', 'artigo 791-A da CLT');
  xml = substituirFraseTagTolerant(xml, 'Súmula 425 TST', 'artigo 791-A da CLT');
  xml = substituirFraseTagTolerant(xml, 'Itapecerica da Terra', 'Itapecerica da Serra');
  // MOTIVO_SAIDA_RESUMIDO vale "sido dispensado sem justa causa" (feito para
  // "tendo {{MOTIVO}}"), mas o modelo também o usa em "o reclamante {{MOTIVO}}
  // em <data>" — e aí sai "o reclamante sido dispensado", sem o verbo. Saiu
  // assim nas três peças. Corrige a regência sem mexer no token.
  xml = xml.replace(/(<w:t[^>]*>)([^<]*?\b(?:reclamante|obreiro|autor)\s+)sido\b/gi, '$1$2foi ');
  xml = substituirFraseTagTolerant(xml, 'reclamante sido', 'reclamante foi');
  xml = substituirFraseTagTolerant(xml, 'obreiro sido', 'obreiro foi');
  zip.file(alvo, xml);
}

// ============================================================
// PARÁGRAFOS E NUMERAÇÃO DOS CAPÍTULOS ESCRITOS PELA IA
// O modelo do escritório usa numeração automática do Word (w:numPr) — na peça
// do Marcos, 82 dos 304 parágrafos. O texto da IA entra pelo parágrafo que
// hospeda a tag {{BLOCO_*}}, que NÃO tem numeração, e com linebreaks: true o
// texto de vários parágrafos vira <w:br/> DENTRO de um parágrafo só. Daí os
// apontamentos da revisora: "tópico correto, apenas sem numeração" e "sem
// estrutura, fora da sequência da numeração" — e o único parágrafo do documento
// com <w:br/> era justamente o bloco da IA (6 quebras num parágrafo).
// Aqui, depois do render: cada quebra passa a ser um <w:p> de verdade e, quando
// o parágrafo hospedeiro não é numerado, herda o w:pPr do último parágrafo
// numerado do corpo — o texto da IA entra na sequência como qualquer outro.
// ============================================================
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function quebrarParagrafo(doc, p, pPrModelo) {
  const grupos = [[]];
  for (const filho of Array.from(p.childNodes)) {
    if (filho.nodeType !== 1) continue;
    if (filho.localName === 'pPr') continue;
    if (filho.localName !== 'r') {
      grupos[grupos.length - 1].push(filho.cloneNode(true));
      continue;
    }
    // Um <w:r> pode conter texto e quebras juntos: divide o próprio run,
    // replicando o w:rPr para preservar a formatação de cada pedaço.
    const rPr = filho.getElementsByTagNameNS(NS_W, 'rPr')[0] || null;
    let run = null;
    for (const n of Array.from(filho.childNodes)) {
      if (n.nodeType !== 1 || n.localName === 'rPr') continue;
      if (n.localName === 'br') {
        if (run) { grupos[grupos.length - 1].push(run); run = null; }
        grupos.push([]);
        continue;
      }
      if (!run) {
        run = doc.createElementNS(NS_W, 'w:r');
        if (rPr) run.appendChild(rPr.cloneNode(true));
      }
      run.appendChild(n.cloneNode(true));
    }
    if (run) grupos[grupos.length - 1].push(run);
  }
  const novos = grupos.filter((g) => g.length).map((g) => {
    const np = doc.createElementNS(NS_W, 'w:p');
    if (pPrModelo) np.appendChild(pPrModelo.cloneNode(true));
    g.forEach((n) => np.appendChild(n));
    return np;
  });
  if (novos.length < 2) return 0;
  const pai = p.parentNode;
  novos.forEach((np) => pai.insertBefore(np, p));
  pai.removeChild(p);
  return novos.length;
}

export function dividirParagrafosInjetados(zip) {
  const alvo = 'word/document.xml';
  const file = zip.file(alvo);
  if (!file) return 0;
  const xmlStr = file.asText();
  if (!/<w:br\s*\/>/.test(xmlStr)) return 0;
  try {
    const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return 0;
    let pPrNumerado = null;
    let criados = 0;
    for (const p of Array.from(doc.getElementsByTagNameNS(NS_W, 'p'))) {
      const pPr = p.getElementsByTagNameNS(NS_W, 'pPr')[0] || null;
      const numerado = !!(pPr && pPr.getElementsByTagNameNS(NS_W, 'numPr').length);
      if (p.getElementsByTagNameNS(NS_W, 'br').length) {
        criados += quebrarParagrafo(doc, p, numerado ? pPr : (pPrNumerado || pPr));
      }
      if (numerado) pPrNumerado = pPr;
    }
    if (criados) zip.file(alvo, new XMLSerializer().serializeToString(doc));
    return criados;
  } catch (e) {
    // Parse/serialização falhou: mantém o documento exatamente como estava.
    console.warn('Não foi possível dividir os parágrafos da IA:', e?.message || e);
    return 0;
  }
}

// Mapeamento de marcadores [ENTRE COLCHETES] -> campos de dados (mesma tabela do previewTemplate)
const MARCADORES_COLCHETES = {
  'VARA / CIDADE / REGIÃO': 'VARA_CIDADE_REGIAO',
  'NOME DO RECLAMANTE': 'RECL_NOME',
  'ESTADO CIVIL': 'RECL_ESTADO_CIVIL',
  'FUNÇÃO': 'RECL_FUNCAO',
  'RG': 'RECL_RG',
  'CPF': 'RECL_CPF',
  'PIS': 'RECL_PIS',
  'SÉRIE': 'RECL_SERIE',
  'CTPS': 'RECL_CTPS',
  'DATA DE NASCIMENTO': 'RECL_NASCIMENTO',
  'FILIAÇÃO': 'RECL_FILIACAO',
  'ENDEREÇO DO RECLAMANTE': 'RECL_ENDERECO',
  'RAZÃO SOCIAL 1ª RECLAMADA': 'RECLAMADA1_RAZAO',
  'CNPJ - confirmar': 'RECLAMADA1_CNPJ',
  'ENDEREÇO - confirmar': 'RECLAMADA1_ENDERECO',
  'LOCAL DE PRESTAÇÃO': 'LOCAL_PRESTACAO_ENDERECO',
  'DATA DE ADMISSÃO': 'DATA_ADMISSAO',
  'DATA DE RESCISÃO': 'DATA_RESCISAO',
  'SALÁRIO': 'SALARIO',
  'DESCREVER O FATO CONCRETO DO DANO MORAL': 'DANO_MORAL_FATO_ESPECIFICO',
  'HORÁRIOS': 'JORNADA_HORARIOS',
  'ESCALA': 'ESCALA',
};

// Remove tags XML internas para unir texto fragmentado (ex.: [NOME<b>...</b>] -> [NOME])
function unirTextosFragmentados(xml) {
  // Une texto dentro de colchetes que pode estar quebrado por tags <w:r>/<w:t>
  // Estratégia: remove tags XML dentro de padrões [...] mantendo os colchetes
  return xml.replace(/\[([^\]]*)\]/g, (match) => {
    const texto = match.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return `[${texto}]`;
  });
}

// Substitui marcadores [ENTRE COLCHETES] no XML do docx pelos valores reais.
function substituirColchetesNoXml(xml, dados) {
  // 1) Une fragmentos para evitar que tags XML quebrem o match
  let out = unirTextosFragmentados(xml);
  // 2) Substitui pelo valor
  out = out.replace(/\[([^\]]+)\]/g, (match, conteudo) => {
    const campo = MARCADORES_COLCHETES[conteudo.trim()];
    const v = campo ? dados[campo] : undefined;
    return (v != null && v !== '') ? String(v) : match;
  });
  return out;
}

// ============================================================
// CONFERÊNCIA FINAL — o último ponto por onde toda peça passa.
// Motivo: peças reais saíram do sistema com '[A PREENCHER: VALOR_POR_FORA]'
// no corpo E no rol de pedidos, e com o envelope JSON de um capítulo da IA
// ('{ "BLOCO_SUMULA_331": "...\\n\\n..." }') impresso no meio do texto. Nada
// no fluxo avisava. Agora avisa — mas NÃO decide: quem chama recebe a lista em
// err.achados e pergunta ao advogado se quer baixar assim mesmo
// ({ permitirPendencias: true }). Travar o download seria pior que o problema:
// a minuta com pendência ainda é útil para trabalhar em cima dela.
// ============================================================
const PADROES_BLOQUEIO = [
  [/\[A PREENCHER[^\]]*\]/g, 'campo não preenchido'],
  [/\[CONFIRMAR:[^\]]*\]/g, 'pendência [CONFIRMAR: ...] deixada pela IA'],
  [/\{\s*"(?:BLOCO_|PEDIDOS_)[A-Z_0-9]*"/g, 'envelope JSON cru de capítulo da IA'],
  [/\\n|\\r/g, 'quebra de linha literal (\\n) vinda do JSON da IA'],
  [/\{\{[#/^]?[A-Za-z_0-9]+\}\}/g, 'tag do modelo não substituída'],
  [/```/g, 'cerca de código markdown (```)'],
];

// Texto corrido do documento: remove as tags XML para que uma frase quebrada
// em vários <w:r>/<w:t> (o Word fragmenta por revisão/corretor) seja encontrada.
function textoCorridoDoDocx(zip) {
  const f = zip.file('word/document.xml');
  if (!f) return '';
  return f.asText().replace(/<[^>]+>/g, '');
}

// Valores que existem no `dados` mas cuja ausência no texto NÃO caracteriza
// pedido não formulado: agregados e valores unitários do corpo da peça.
const VALORES_FORA_DO_ROL = new Set([
  'VALOR_CAUSA', 'VALOR_CAUSA_TOTAL', 'VALOR_TOTAL_PEDIDOS',
  'VALOR_HONORARIOS', 'VALOR_POR_FORA', 'VALOR_AUX_ALIMENTACAO',
]);

export function conferirDocumentoFinal(zip, dados = {}) {
  const texto = textoCorridoDoDocx(zip);
  const achados = [];
  for (const [re, descricao] of PADROES_BLOQUEIO) {
    const ms = texto.match(re);
    if (ms && ms.length) {
      const amostra = [...new Set(ms)].slice(0, 5).join(' · ');
      achados.push(`${descricao} (${ms.length}×): ${amostra}`);
    }
  }
  // [MARCADORES] do modelo antigo que não receberam valor (a tabela
  // MARCADORES_COLCHETES dá a lista exata, sem falso positivo em "[...]").
  const naoSubstituidos = Object.keys(MARCADORES_COLCHETES).filter((k) => texto.includes(`[${k}]`));
  if (naoSubstituidos.length) {
    achados.push(`marcador do modelo sem valor (${naoSubstituidos.length}×): ${naoSubstituidos.slice(0, 5).join(' · ')}`);
  }
  // INVARIANTE: valor da causa = soma do rol de pedidos. Toda verba que entrou
  // na soma TEM de aparecer impressa. A peça do Jonathan cobrou R$ 5.300,66 na
  // alçada — saldo de salário (R$ 623,05), multa do art. 467 (R$ 2.978,38) e
  // multa do art. 477 (R$ 1.699,23) — sem que constassem do rol: valores
  // calculados, somados e nunca impressos pelo modelo. Isto barra a repetição.
  // formatBRL usa espaço inquebrável entre "R$" e o número — normaliza os dois
  // lados e compara só a parte numérica, que é o que sai impresso no rol.
  const norm = texto.replace(/\u00a0/g, ' ');
  const naoImpressos = Object.entries(dados || {})
    .filter(([k, v]) => /^VALOR_/.test(k) && !VALORES_FORA_DO_ROL.has(k)
      && typeof v === 'string' && /\d,\d{2}/.test(v))
    .filter(([, v]) => !norm.includes(String(v).replace(/\u00a0/g, ' ').replace(/^R\$\s*/, '')))
    .map(([k, v]) => `${k} = ${v}`);
  if (naoImpressos.length) {
    achados.push(
      `verba somada no valor da causa e AUSENTE do rol de pedidos (${naoImpressos.length}): ${naoImpressos.slice(0, 6).join(' · ')}`
    );
  }
  return achados;
}

// Preenche um TEMPLATE .docx (marcado com {{campos}}/{{#flags}} OU [MARCADORES])
// usando docxtemplater + substituição direta de colchetes. Preserva 100% da formatação.
export function preencherDocxTemplate(arrayBuffer, dados, { permitirPendencias = false } = {}) {
  const zip = new PizZip(arrayBuffer);

  // Substituição direta de [MARCADORES] no XML antes do docxtemplater
  const alvoXml = 'word/document.xml';
  const xmlFile = zip.file(alvoXml);
  if (xmlFile) {
    let xml = xmlFile.asText();
    xml = substituirColchetesNoXml(xml, dados);
    // E-mail do reclamante ausente → redação padrão do escritório (evita o
    // placeholder vazio ": ," na seção do Juízo 100% Digital).
    if (!dados?.RECL_EMAIL) {
      xml = substituirFraseTagTolerant(xml, 'O autor possui endereço de e-mail pessoal: {{RECL_EMAIL}}', 'O autor não possui correio eletrônico');
    }
    zip.file(alvoXml, xml);
  }

  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' }, // mantém suporte a {{campo}} e {{#flag}}...{{/flag}}
    paragraphLoop: true,
    linebreaks: true,
    // NUNCA deixar placeholder vazio: tags {{CAMPO}} sem valor viram um
    // marcador visível [A PREENCHER: TAG] para o advogado localizar e preencher
    // (ex.: capítulo da IA que não veio, campo não extraído da entrevista).
    nullGetter: (part) => {
      // Seções e loops ({{#TAG}} / {{^TAG}} / {{#lista}}) precisam de valor VAZIO
      // quando a tag não existe — são condições, não texto. Devolvendo o marcador
      // aqui, a condição virava "verdadeira" (string não vazia) e o bloco saía na
      // peça: foi assim que as linhas de 10 minutos e periculosidade apareceram
      // como "[A PREENCHER: ...]" num caso em que essas verbas nem existem.
      if (part && typeof part === 'object' && part.module) return '';
      const tag = (part && typeof part === 'object' && part.value) ? part.value : (typeof part === 'string' ? part : '');
      return tag ? `[A PREENCHER: ${tag}]` : '[A PREENCHER]';
    },
  });
  doc.render(dados || {});
  const outZip = doc.getZip();
  // Quebras de linha dos blocos da IA -> parágrafos reais, herdando a numeração
  // do corpo (antes o capítulo inteiro saía como um parágrafo sem número).
  dividirParagrafosInjetados(outZip);
  // Correções pós-preenchimento (erros recorrentes do template e duplicações do docxtemplater)
  corrigirTextoFinal(outZip);
  // Concordância de gênero após o preenchimento. O template-mestre veio com
  // adjetivos no feminino (modelo de reclamante mulher): para homem, masculiniza
  // os termos que se referem ao autor/obreiro; para mulher, aplica a feminilização.
  const generoRecl = (dados?.RECL_GENERO || '').toUpperCase();
  if (generoRecl === 'F') aplicarGenero(outZip);
  else aplicarGeneroMasc(outZip);
  // Conferência final: peça com defeito não é gerada.
  if (!permitirPendencias) {
    const achados = conferirDocumentoFinal(outZip, dados);
    if (achados.length) {
      const err = new Error(
        `Esta peça tem ${achados.length} pendência(s) que não deveriam ir para o processo:\n\n• ${achados.join('\n• ')}`
      );
      err.achados = achados;
      throw err;
    }
  }
  return outZip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

// Busca o template hospedado, preenche com os dados e dispara o download do .docx.
export async function exportarDocxTemplate(templateUrl, dados, titulo, opcoes = {}) {
  const resp = await fetch(templateUrl);
  if (!resp.ok) throw new Error(`Não foi possível carregar o template (HTTP ${resp.status}).`);
  const buf = await resp.arrayBuffer();
  const blob = preencherDocxTemplate(buf, dados, opcoes);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${titulo || 'peticao'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}