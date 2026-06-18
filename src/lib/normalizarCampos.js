/**
 * normalizarCampos — normaliza COMARCA_UF, REGIAO_TRT e sanitiza nulos
 * antes da injeção nos templates DOCX.
 *
 * Usado por gerarDocxVigilante.js e gerarDocxPorteiro.js.
 */

import { derivarFlags } from "./derivarFlags.js";

// Tabela UF → nome por extenso do TRT
const UF_TRT = {
  SP: "SEGUNDA REGIÃO", RJ: "PRIMEIRA REGIÃO", MG: "TERCEIRA REGIÃO",
  RS: "QUARTA REGIÃO", BA: "QUINTA REGIÃO", PE: "SEXTA REGIÃO",
  CE: "SÉTIMA REGIÃO", PA: "OITAVA REGIÃO", AM: "OITAVA REGIÃO",
  PR: "NONA REGIÃO", DF: "DÉCIMA REGIÃO", SC: "DÉCIMA SEGUNDA REGIÃO",
  PB: "DÉCIMA TERCEIRA REGIÃO", RO: "DÉCIMA QUARTA REGIÃO",
  AC: "DÉCIMA QUARTA REGIÃO", MA: "DÉCIMA SEXTA REGIÃO",
  ES: "DÉCIMA SÉTIMA REGIÃO", GO: "DÉCIMA OITAVA REGIÃO",
  AL: "DÉCIMA NONA REGIÃO", SE: "VIGÉSIMA REGIÃO",
  RN: "VIGÉSIMA PRIMEIRA REGIÃO", PI: "VIGÉSIMA SEGUNDA REGIÃO",
  MS: "VIGÉSIMA QUARTA REGIÃO", TO: "VIGÉSIMA SÉTIMA REGIÃO",
  AP: "OITAVA REGIÃO", RR: "DÉCIMA PRIMEIRA REGIÃO",
  MT: "VIGÉSIMA TERCEIRA REGIÃO",
};

// Número do TRT → nome por extenso
const NUM_TRT = {
  "1": "PRIMEIRA REGIÃO",       "2": "SEGUNDA REGIÃO",
  "3": "TERCEIRA REGIÃO",       "4": "QUARTA REGIÃO",
  "5": "QUINTA REGIÃO",         "6": "SEXTA REGIÃO",
  "7": "SÉTIMA REGIÃO",         "8": "OITAVA REGIÃO",
  "9": "NONA REGIÃO",           "10": "DÉCIMA REGIÃO",
  "11": "DÉCIMA PRIMEIRA REGIÃO","12": "DÉCIMA SEGUNDA REGIÃO",
  "13": "DÉCIMA TERCEIRA REGIÃO","14": "DÉCIMA QUARTA REGIÃO",
  "15": "DÉCIMA QUINTA REGIÃO",  "16": "DÉCIMA SEXTA REGIÃO",
  "17": "DÉCIMA SÉTIMA REGIÃO",  "18": "DÉCIMA OITAVA REGIÃO",
  "19": "DÉCIMA NONA REGIÃO",    "20": "VIGÉSIMA REGIÃO",
  "21": "VIGÉSIMA PRIMEIRA REGIÃO","22": "VIGÉSIMA SEGUNDA REGIÃO",
  "23": "VIGÉSIMA TERCEIRA REGIÃO","24": "VIGÉSIMA QUARTA REGIÃO",
  "27": "VIGÉSIMA SÉTIMA REGIÃO",
};

/**
 * Sanitiza um valor: null / undefined / "null" / "undefined" → ""
 */
export function sanitizar(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "boolean") return val;
  const s = String(val).trim();
  return (s === "null" || s === "undefined") ? "" : s;
}

/**
 * Sanitiza TODOS os valores string de um objeto de campos.
 * Booleans e objetos reais (não null) são mantidos.
 */
export function sanitizarCampos(campos) {
  for (const key of Object.keys(campos)) {
    const v = campos[key];
    if (typeof v === "boolean") continue;
    if (v !== null && v !== undefined && typeof v === "object") continue;
    campos[key] = sanitizar(v);
  }
  return campos;
}

// Municípios de SP capital / Grande SP → TRT-2 (SEGUNDA REGIÃO)
const MUNICIPIOS_TRT2 = new Set([
  "SÃO PAULO", "SAO PAULO", "GUARULHOS", "OSASCO", "SANTO ANDRÉ", "SÃO BERNARDO DO CAMPO",
  "SAO BERNARDO DO CAMPO", "SÃO CAETANO DO SUL", "SAO CAETANO DO SUL", "DIADEMA", "MAUÁ", "MAUA",
  "RIBEIRÃO PIRES", "RIBEIRAO PIRES", "RIO GRANDE DA SERRA", "CARAPICUÍBA", "CARAPICUIBA",
  "BARUERI", "SANTANA DE PARNAÍBA", "SANTANA DE PARNAIBA", "PIRAPORA DO BOM JESUS",
  "COTIA", "VARGEM GRANDE PAULISTA", "EMBU DAS ARTES", "EMBU-GUAÇU", "EMBU GUACU",
  "ITAPECERICA DA SERRA", "JUQUITIBA", "SÃO LOURENÇO DA SERRA", "SAO LOURENCO DA SERRA",
  "MOGI DAS CRUZES", "SUZANO", "POÁ", "POA", "FERRAZ DE VASCONCELOS", "ITAQUAQUECETUBA",
  "ARUJÁ", "ARUJA", "BIRITIBA-MIRIM", "BIRITIBA MIRIM", "SALESÓPOLIS", "SALESOPOLIS",
  "GUARAREMA", "CAIEIRAS", "CAJAMAR", "FRANCO DA ROCHA", "FRANCISCO MORATO",
  "MAIRIPORÃ", "MAIRIPORA", "JANDIRA", "ITAPEVI", "São ROQUE", "SAO ROQUE",
  "VÁRZEA PAULISTA", "VARZEA PAULISTA", "CAMPO LIMPO PAULISTA", "JUNDIAÍ", "JUNDIAI",
  "TABOÃO DA SERRA", "ITAIM PAULISTA",
]);

// Municípios de SP interior → TRT-15 (DÉCIMA QUINTA REGIÃO)
const MUNICIPIOS_TRT15 = new Set([
  "CAMPINAS", "SOROCABA", "RIBEIRÃO PRETO", "RIBEIRAO PRETO", "SÃO JOSÉ DOS CAMPOS",
  "SAO JOSE DOS CAMPOS", "TAUBATÉ", "TAUBATE", "PIRACICABA", "AMERICANA",
  "LIMEIRA", "ARARAQUARA", "SÃO CARLOS", "SAO CARLOS", "SÃO JOSÉ DO RIO PRETO",
  "SAO JOSE DO RIO PRETO", "BAURU", "MARÍLIA", "MARILIA", "PRESIDENTE PRUDENTE",
  "ARAÇATUBA", "ARACATUBA", "BOTUCATU", "SÃO JOÃO DA BOA VISTA", "SAO JOAO DA BOA VISTA",
  "FRANCA", "OURINHOS", "JABOTICABAL", "JAÚ", "JAU", "INDAIATUBA", "SUMARÉ", "SUMARE",
  "HORTOLÂNDIA", "HORTOLANDIA", "NOVA ODESSA", "SANTA BÁRBARA D'OESTE", "SANTA BARBARA D OESTE",
  "PAULÍNIA", "PAULINIA", "VALINHOS", "VINHEDO", "ITUPEVA",
]);

/**
 * Extrai a UF de qualquer string (busca 2 letras maiúsculas no padrão esperado).
 */
function extrairUF(str) {
  if (!str) return null;
  const s = str.toUpperCase().trim();
  // "CIDADE/UF"
  const m1 = s.match(/\/([A-Z]{2})$/);
  if (m1) return m1[1];
  // "CIDADE - UF" ou "CIDADE – UF"
  const m2 = s.match(/[-–]\s*([A-Z]{2})$/);
  if (m2) return m2[1];
  // "CIDADE, UF"
  const m3 = s.match(/,\s*([A-Z]{2})$/);
  if (m3) return m3[1];
  // Só UF
  if (/^[A-Z]{2}$/.test(s)) return s;
  return null;
}

// Prefixos de logradouro — qualquer valor que comece com esses tokens é um endereço, não cidade
const LOGRADOURO_PREFIXOS = [
  "RUA ", "R. ", "R ", "AV ", "AV. ", "AVENIDA ", "ALAMEDA ", "AL. ",
  "TRAVESSA ", "TV. ", "ESTRADA ", "ROD. ", "RODOVIA ", "LARGO ",
  "PRAÇA ", "PRACA ", "PCA. ", "VIELA ", "BECO ", "CONJ ", "CONJUNTO ",
];

/**
 * Retorna true se a string parece ser um logradouro (rua, avenida, etc.)
 * e portanto NÃO deve ser usada como comarca.
 */
function ehLogradouro(str) {
  if (!str) return false;
  const s = str.toUpperCase().trim();
  // Começa com prefixo de logradouro
  if (LOGRADOURO_PREFIXOS.some(p => s.startsWith(p))) return true;
  // Contém número de porta (padrão: texto seguido de espaço e dígitos, ex: "MARCHINI 32")
  if (/\b\d{1,6}\b/.test(s) && !/^\d{5}-?\d{3}$/.test(s.replace(/\s/g, ""))) {
    // Ignora se parece CEP puro; caso contrário, com número embutido é logradouro
    if (!/^(SÃO|SAO|RIO|BELO|PORTO|CAMPO|SANTO|SANTA|MOGI|NOVA|VILA|GUARULHOS|CAMPINAS|SOROCABA|FRANCA|BAURU|MARILIA|JUNDIAI|OSASCO|DIADEMA|ARAÇATUBA|ARARAQUARA|TAUBATE|LIMEIRA|PIRACICABA|AMERICANA|PRESIDENTE|SÃO BERNARDO|SAO BERNARDO)/i.test(s)) {
      return true;
    }
  }
  return false;
}

/**
 * Extrai a cidade (parte antes do separador) de uma string.
 * Rejeita a string inteira se parecer logradouro.
 */
function extrairCidade(str) {
  if (!str) return null;
  const s = str.toUpperCase().trim();
  // Rejeita imediatamente se for logradouro
  if (ehLogradouro(s)) return null;
  const m = s.match(/^([^/,\-–]+)/);
  if (m) {
    const cidade = m[1].trim();
    // Rejeita se o pedaço extraído também parecer logradouro
    if (ehLogradouro(cidade)) return null;
    if (cidade.length > 1) return cidade;
  }
  return null;
}

/**
 * Normaliza COMARCA_UF para formato "CIDADE/UF" em caixa alta.
 * SEMPRE garante que o resultado termine com "/UF" de 2 letras.
 * Se a UF não estiver explícita, infere das fontes auxiliares ou do contexto.
 */
export function normalizarComarcaUF(comarcaUf, localPrestacao, foroCompetencia) {
  let raw = sanitizar(comarcaUf);
  if (typeof raw !== "string") raw = "";
  raw = raw.toUpperCase().trim();

  // Se o valor de COMARCA_UF parecer logradouro, descarta — nunca usar rua como comarca
  if (ehLogradouro(raw)) raw = "";

  // Coleta fontes; exclui qualquer fonte que seja logradouro
  const fontes = [raw, foroCompetencia, localPrestacao].map(f => {
    const s = sanitizar(f);
    return typeof s === "string" ? s.toUpperCase().trim() : "";
  }).filter(f => f && !ehLogradouro(f));

  // Extrai UF de qualquer fonte disponível
  let uf = null;
  for (const fonte of fontes) {
    uf = extrairUF(fonte);
    if (uf) break;
  }

  // Se ainda não temos UF, tenta identificar cidade em qualquer fonte e mapeá-la
  let cidade = null;
  for (const fonte of fontes) {
    const c = extrairCidade(fonte);
    if (c && c.length > 2) {
      cidade = c;
      break;
    }
  }

  // Se não há UF, inferir de SP pela cidade (caso mais comum)
  if (!uf && cidade) {
    if (MUNICIPIOS_TRT2.has(cidade) || MUNICIPIOS_TRT15.has(cidade)) uf = "SP";
  }

  // Fallback: maioria dos casos é SP
  if (!uf) uf = "SP";

  // Se temos cidade e UF → montar "CIDADE/UF"
  if (cidade && uf) return `${cidade}/${uf}`;

  // raw já tem "/" → preservar mas garantir UF
  if (raw.includes("/")) {
    const partes = raw.split("/");
    const cidadeRaw = partes[0].trim();
    const ufRaw = partes[partes.length - 1].trim();
    if (/^[A-Z]{2}$/.test(ufRaw) && cidadeRaw.length > 1) return `${cidadeRaw}/${ufRaw}`;
    if (cidadeRaw.length > 1) return `${cidadeRaw}/${uf}`;
  }

  // Se só temos UF
  if (/^[A-Z]{2}$/.test(raw)) return `${raw}/${uf === raw ? uf : uf}`;

  // raw com cidade sem UF → acrescentar UF
  if (raw.length > 2) return `${raw}/${uf}`;

  return `SÃO PAULO/${uf}`;
}

/**
 * Normaliza REGIAO_TRT para nome POR EXTENSO em caixa alta.
 * NUNCA retorna string vazia — fallback é "SEGUNDA REGIÃO".
 *
 * Aceita: número ("2"), "TRT-2", "TRT 2", "2ª REGIÃO", já por extenso, ou vazio.
 * Fallback: derivar da UF de COMARCA_UF → se SP, distingue TRT-2 vs TRT-15 pela cidade.
 */
export function normalizarRegiaoTRT(regiaoTrt, comarcaUf) {
  let raw = sanitizar(regiaoTrt);
  if (typeof raw !== "string") raw = "";
  raw = raw.toUpperCase().trim();

  // Já contém "REGIÃO" → provavelmente está por extenso
  if (raw.includes("REGIÃO")) return raw;

  // Extrai número de "2", "TRT-2", "TRT 2", "2ª REGIÃO", etc.
  const numMatch = raw.match(/(\d+)/);
  if (numMatch) {
    const nome = NUM_TRT[numMatch[1]];
    if (nome) return nome;
  }

  // Vazio ou não reconhecido → derivar da comarca
  const ufStr = sanitizar(comarcaUf);
  if (typeof ufStr === "string") {
    const up = ufStr.toUpperCase();

    // Para SP: distinguir capital/grande SP (TRT-2) vs interior (TRT-15)
    const ufMatch = up.match(/\/([A-Z]{2})$/);
    if (ufMatch && ufMatch[1] === "SP") {
      const cidade = extrairCidade(up) || "";
      if (MUNICIPIOS_TRT15.has(cidade)) return "DÉCIMA QUINTA REGIÃO";
      return "SEGUNDA REGIÃO"; // capital, grande SP, ou SP indeterminado
    }

    // Outros estados: lookup direto
    if (ufMatch && UF_TRT[ufMatch[1]]) return UF_TRT[ufMatch[1]];

    // Fallback sem "/UF" — tenta extrair UF de qualquer forma
    const ufAny = extrairUF(up);
    if (ufAny && UF_TRT[ufAny]) return UF_TRT[ufAny];
  }

  // Fallback final: nunca deixar vazio
  return "SEGUNDA REGIÃO";
}

/**
 * Aplica normalizarComarcaUF + normalizarRegiaoTRT e devolve ambos
 * já resolvidos, garantindo que REGIAO_TRT nunca fique vazio.
 * Use esta função nos montarDadosTemplate de todos os geradores.
 */
export function normalizarEndereçamento(dados) {
  const comarca = normalizarComarcaUF(
    dados.COMARCA_UF,
    dados.LOCAL_PRESTACAO,
    dados.FORO_COMPETENCIA,
  );
  const regiao = normalizarRegiaoTRT(dados.REGIAO_TRT, comarca);
  return { COMARCA_UF: comarca, REGIAO_TRT: regiao };
}

/**
 * Classificação automática (sem modal): aplica derivarFlags e, se o tipo de
 * rescisão estiver indeterminado, escolhe a melhor hipótese com alerta.
 * Retorna o objeto dados enriquecido com flags + TIPO_RESCISAO.
 *
 * @param {object} dados  — CasoVigilante
 * @param {string} perfil — "vigilante" | "porteiro" | etc.
 * @returns {object} dados + flags + TIPO_RESCISAO + _alertaClassificacao (se houver)
 */
export function autoClassificar(dados, perfil) {
  const flags = derivarFlags(dados, perfil);

  const RESCISAO_FLAGS = ["t_dispensa", "t_coacao", "t_indireta", "t_reversao"];
  let _alertaClassificacao = "";

  if (!RESCISAO_FLAGS.some(f => flags[f])) {
    // Nenhum tipo de rescisão determinado — default seguro
    flags.t_dispensa = true;
    flags.t_demissao = false;
    _alertaClassificacao =
      "⚠️ Tipo de rescisão não identificado nos dados — classificado como 'dispensa sem justa causa' por padrão. REVISAR a peça antes de protocolar.";
  }

  const FLAG_TO_TIPO = {
    t_dispensa: "dispensa_sem_justa_causa",
    t_indireta: "rescisao_indireta",
    t_coacao:   "pedido_demissao",
    t_reversao: "reversao_justa_causa",
  };
  const tipoAtivo = RESCISAO_FLAGS.find(f => flags[f]);
  const TIPO_RESCISAO = FLAG_TO_TIPO[tipoAtivo] || "dispensa_sem_justa_causa";

  return { ...dados, ...flags, TIPO_RESCISAO, _alertaClassificacao };
}

/**
 * Gera o nome do arquivo da petição: "RECLAMANTE x RECLAMADA.docx".
 * Remove caracteres inválidos para nomes de arquivo.
 */
export function nomeArquivoPeticao(reclNome, recl1Nome) {
  const parts = [reclNome, recl1Nome].map(p => sanitizar(p)).filter(Boolean);
  let nome;
  if (parts.length === 2) {
    nome = `${parts[0]} x ${parts[1]}`;
  } else if (parts.length === 1) {
    nome = parts[0];
  } else {
    nome = "peticao";
  }
  return nome.replace(/[/\\:*?"<>|]/g, " ").replace(/\s{2,}/g, " ").trim() + ".docx";
}

/**
 * Limpa separadores órfãos no XML do documento renderizado.
 * Ex.: ", ;" → ";" quando um complemento de endereço está vazio.
 */
export function limparSeparadoresOrfaos(zip) {
  const docFile = zip.file("word/document.xml");
  if (!docFile) return;
  let xml = docFile.asText();
  xml = xml.replace(/(<w:t[^>]*>)([^<]+)(<\/w:t>)/g, (m, open, text, close) => {
    let cleaned = text;
    cleaned = cleaned.replace(/,\s*;/g, ";");
    cleaned = cleaned.replace(/;\s*;/g, ";");
    cleaned = cleaned.replace(/,\s*,/g, ",");
    // Remove traço/hífen solto no final (ex.: "SÃO PAULO –" ou "SÃO PAULO -")
    cleaned = cleaned.replace(/\s*[–\-]\s*$/, "");
    // Remove traço/hífen no início (ex.: "– SEGUNDA REGIÃO" quando comarca ficou vazia)
    cleaned = cleaned.replace(/^\s*[–\-]\s*/, "");
    return open + cleaned + close;
  });
  zip.file("word/document.xml", xml);
}