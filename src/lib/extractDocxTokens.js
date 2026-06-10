/**
 * extractDocxTokens.js
 * Extrai todos os tokens {{SNAKE_CASE}} do body (document.xml) de um arquivo .docx.
 * Roda no browser usando pizzip (já instalado).
 * Retorna array de strings únicas, ordenadas.
 */
import PizZip from "pizzip";
import { fetchDocxViaBackend } from "./fetchDocxViaBackend.js";

/**
 * Dado um ArrayBuffer de um .docx, retorna a lista de tokens únicos encontrados.
 * Tokens esperados: {{NOME_MAIUSCULO}}, {{snake_case}}, etc.
 */
export function extractTokensFromBuffer(arrayBuffer) {
  const zip = new PizZip(arrayBuffer);
  const docXml = zip.file("word/document.xml")?.asText() || "";
  // Docxtemplater usa {{ e }} como delimitadores
  const re = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
  const found = new Set();
  let m;
  while ((m = re.exec(docXml)) !== null) {
    found.add(m[1]);
  }
  return Array.from(found).sort();
}

/**
 * Baixa o .docx a partir de uma URL e retorna a lista de tokens.
 * Usa backend proxy para evitar bloqueio CORS no app publicado.
 */
export async function extractTokensFromUrl(url) {
  const ab = await fetchDocxViaBackend(url);
  return extractTokensFromBuffer(ab);
}

/**
 * Metadados estáticos para tokens conhecidos — label amigável e grupo de seção.
 * Qualquer token não listado aqui cai em "Dados Adicionais" com label = token.
 */
const TOKEN_META = {
  // Reclamante
  RECL_NOME:           { label: "Nome completo",           grupo: "👤 Reclamante" },
  RECL_NACIONALIDADE:  { label: "Nacionalidade",           grupo: "👤 Reclamante" },
  RECL_ESTADOCIVIL:    { label: "Estado civil",            grupo: "👤 Reclamante" },
  RECL_RG:             { label: "RG",                      grupo: "👤 Reclamante" },
  RECL_PIS:            { label: "PIS/PASEP",               grupo: "👤 Reclamante" },
  RECL_CTPS:           { label: "CTPS",                    grupo: "👤 Reclamante" },
  RECL_SERIE:          { label: "Série CTPS",              grupo: "👤 Reclamante" },
  RECL_CPF:            { label: "CPF",                     grupo: "👤 Reclamante" },
  RECL_NASC:           { label: "Data de nascimento (por extenso)", grupo: "👤 Reclamante" },
  RECL_FILIACAO:       { label: "Filiação",                grupo: "👤 Reclamante" },
  RECL_ENDERECO:       { label: "Endereço",                grupo: "👤 Reclamante", full: true },
  RECL_CEP:            { label: "CEP",                     grupo: "👤 Reclamante" },
  FUNCAO:              { label: "Função / Cargo",          grupo: "👤 Reclamante" },
  // 1ª Reclamada
  RECL1_NOME:          { label: "Razão social",            grupo: "🏢 1ª Reclamada" },
  RECL1_CNPJ:          { label: "CNPJ",                    grupo: "🏢 1ª Reclamada" },
  RECL1_LOGRADOURO:    { label: "Logradouro",              grupo: "🏢 1ª Reclamada" },
  RECL1_ENDCOMPL:      { label: "Complemento",             grupo: "🏢 1ª Reclamada", full: true },
  // 2ª Reclamada
  RECL2_NOME:          { label: "Razão social",            grupo: "🏢 2ª Reclamada (tomadora)" },
  RECL2_CNPJ:          { label: "CNPJ",                    grupo: "🏢 2ª Reclamada (tomadora)" },
  RECL2_LOGRADOURO:    { label: "Logradouro",              grupo: "🏢 2ª Reclamada (tomadora)" },
  RECL2_ENDCOMPL:      { label: "Complemento",             grupo: "🏢 2ª Reclamada (tomadora)", full: true },
  // 3ª Reclamada
  RECL3_NOME:          { label: "Razão social",            grupo: "🏢 3ª Reclamada" },
  RECL3_CNPJ:          { label: "CNPJ",                    grupo: "🏢 3ª Reclamada" },
  RECL3_LOGRADOURO:    { label: "Logradouro",              grupo: "🏢 3ª Reclamada" },
  RECL3_ENDCOMPL:      { label: "Complemento",             grupo: "🏢 3ª Reclamada", full: true },
  // Foro
  COMARCA_UF:          { label: "Comarca/UF",              grupo: "📍 Foro e Local" },
  REGIAO_TRT:          { label: "Região TRT",              grupo: "📍 Foro e Local" },
  FORO_COMPETENCIA:    { label: "Foro de competência",     grupo: "📍 Foro e Local" },
  LOCAL_PRESTACAO:     { label: "Local de prestação",      grupo: "📍 Foro e Local" },
  LOCAL_PRESTACAO_COMPL: { label: "Complemento local",    grupo: "📍 Foro e Local", full: true },
  // Contrato
  DATA_ADMISSAO:       { label: "Data de admissão (por extenso)", grupo: "📋 Contrato e Jornada" },
  DATA_RESCISAO:       { label: "Data de rescisão (por extenso)", grupo: "📋 Contrato e Jornada" },
  SALARIO:             { label: "Salário (ex: R$ 2.148,22)", grupo: "📋 Contrato e Jornada" },
  JORNADA_HORARIO:     { label: "Jornada (ex: 08:00 às 18:00)", grupo: "📋 Contrato e Jornada" },
  JORNADA_EXTRAPOLA:   { label: "Extrapolação horária",   grupo: "📋 Contrato e Jornada" },
  JORNADA_FREQ_EXTRA:  { label: "Frequência de extras",   grupo: "📋 Contrato e Jornada" },
  INTERVALO_GOZADO:    { label: "Intervalo gozado",       grupo: "📋 Contrato e Jornada" },
  LOCAL_DATA_ASSINATURA: { label: "Local e data de assinatura", grupo: "📋 Contrato e Jornada", full: true },
  TIPO_RESCISAO:       { label: "Tipo de rescisão",       grupo: "📋 Contrato e Jornada" },
  // CCT / Valores
  CCT_VIGENCIA:        { label: "Vigência CCT",            grupo: "⚖️ CCT e Valores" },
  ADIC_CONV:           { label: "Adicional convencional HE", grupo: "⚖️ CCT e Valores" },
  VAL_FT:              { label: "Valor FT/folga",          grupo: "⚖️ CCT e Valores" },
  VAL_CONDUCAO:        { label: "Valor condução/dia",      grupo: "⚖️ CCT e Valores" },
  VAL_ALIMENTACAO:     { label: "Valor alimentação/dia",   grupo: "⚖️ CCT e Valores" },
  VALOR_CAUSA:         { label: "Valor da causa",          grupo: "⚖️ CCT e Valores" },
  // Flags booleanas (renderizadas como checkbox)
  tem_subsidiaria:     { label: "Possui responsabilidade subsidiária (2ª+ reclamada)", grupo: "🔀 Flags e Blocos", tipo: "bool" },
  JUSTICA_GRATUITA:    { label: "Requer justiça gratuita", grupo: "🔀 Flags e Blocos", tipo: "bool" },
  JUIZO_DIGITAL:       { label: "Juízo 100% digital",      grupo: "🔀 Flags e Blocos", tipo: "bool" },
};

/**
 * Dado um array de tokens (strings), retorna array de grupos:
 * [{ grupo: "...", tokens: [{ token, label, full, tipo }] }]
 * Tokens desconhecidos vão para "📝 Dados Adicionais".
 */
export function groupTokens(tokens) {
  const gruposMap = new Map();

  for (const token of tokens) {
    const meta = TOKEN_META[token];
    const grupo = meta?.grupo || "📝 Dados Adicionais";
    if (!gruposMap.has(grupo)) gruposMap.set(grupo, []);
    gruposMap.get(grupo).push({
      token,
      label: meta?.label || token,
      full: meta?.full || false,
      tipo: meta?.tipo || "text",
    });
  }

  // Ordem preferencial dos grupos
  const ORDER = [
    "👤 Reclamante",
    "🏢 1ª Reclamada",
    "🏢 2ª Reclamada (tomadora)",
    "🏢 3ª Reclamada",
    "📍 Foro e Local",
    "📋 Contrato e Jornada",
    "⚖️ CCT e Valores",
    "🔀 Flags e Blocos",
    "📝 Dados Adicionais",
  ];

  const result = [];
  for (const g of ORDER) {
    if (gruposMap.has(g)) {
      result.push({ grupo: g, tokens: gruposMap.get(g) });
      gruposMap.delete(g);
    }
  }
  // Grupos restantes (não mapeados)
  for (const [g, toks] of gruposMap) {
    result.push({ grupo: g, tokens: toks });
  }

  return result;
}