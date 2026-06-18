/**
 * normalizarCampos — normaliza COMARCA_UF, REGIAO_TRT e sanitiza nulos
 * antes da injeção nos templates DOCX.
 *
 * Usado por gerarDocxVigilante.js e gerarDocxPorteiro.js.
 */

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

/**
 * Normaliza COMARCA_UF para formato "CIDADE/UF" em caixa alta.
 *
 * Se vier só a UF (2 letras), tenta derivar a cidade
 * de FORO_COMPETENCIA ou LOCAL_PRESTACAO.
 */
export function normalizarComarcaUF(comarcaUf, localPrestacao, foroCompetencia) {
  let raw = sanitizar(comarcaUf);
  if (typeof raw !== "string") raw = "";
  raw = raw.toUpperCase().trim();
  if (!raw) return "";

  // Já contém "/" e mais de 3 chars → formato CIDADE/UF, preservar
  if (raw.includes("/") && raw.length > 3) return raw;

  // Formato "CIDADE - UF" → normaliza para CIDADE/UF
  const dashM = raw.match(/^(.+?)\s*[-–]\s*([A-Z]{2})$/);
  if (dashM) return `${dashM[1].trim()}/${dashM[2]}`;

  // Apenas UF (2 letras) → derivar cidade de fontes auxiliares
  if (/^[A-Z]{2}$/.test(raw)) {
    const uf = raw;
    const fontes = [foroCompetencia, localPrestacao].map(f => {
      const s = sanitizar(f);
      return typeof s === "string" ? s.toUpperCase().trim() : "";
    });

    for (const fonte of fontes) {
      if (!fonte) continue;
      // "CIDADE/UF"
      const m1 = fonte.match(/^([^/]+)\/[A-Z]{2}$/);
      if (m1 && m1[1].trim().length > 1) return `${m1[1].trim()}/${uf}`;
      // "CIDADE - UF"
      const m2 = fonte.match(/^(.+?)\s*[-–]\s*[A-Z]{2}$/);
      if (m2 && m2[1].trim().length > 1) return `${m2[1].trim()}/${uf}`;
      // "CIDADE, UF"
      const m3 = fonte.match(/^(.+?),\s*[A-Z]{2}$/);
      if (m3 && m3[1].trim().length > 1) return `${m3[1].trim()}/${uf}`;
      // Nome puro de cidade (só letras, sem números/vírgulas)
      if (/^[A-ZÀ-Ú\s]+$/.test(fonte) && fonte.length > 2 && fonte.length < 50) {
        return `${fonte}/${uf}`;
      }
    }
    return uf; // fallback: só UF
  }

  return raw;
}

/**
 * Normaliza REGIAO_TRT para nome POR EXTENSO em caixa alta.
 *
 * Aceita: número ("2"), "TRT-2", "TRT da 2ª Região", ou já por extenso.
 * Fallback: derivar da UF de COMARCA_UF.
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

  // Vazio ou não reconhecido → derivar da UF (fallback)
  const ufStr = sanitizar(comarcaUf);
  if (typeof ufStr === "string") {
    const ufMatch = ufStr.toUpperCase().match(/([A-Z]{2})$/);
    if (ufMatch && UF_TRT[ufMatch[1]]) {
      return UF_TRT[ufMatch[1]];
    }
  }

  return raw;
}