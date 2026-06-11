/**
 * cleanDocxXml — limpeza segura do document.xml de templates tokenizados FAV.
 *
 * PRINCÍPIO: opera como manipulação de árvore XML — localiza e remove <w:p> DENTRO
 * de <w:body>, nunca corta strings fora dos parágrafos. O envelope completo
 * (<?xml ...?>, <w:document ...namespaces...>, <w:body>, </w:body></w:document>)
 * é SEMPRE preservado intacto.
 *
 * Remove do corpo:
 *  1. Parágrafos do preâmbulo (tudo até e inclusive "INÍCIO DA PEÇA")
 *  2. Parágrafos iniciados com "▸" (marcadores de bloco e alternativas)
 *  3. Notas internas "ℹ" / "NÃO copiar para a peça"
 *  4. Blocos condicionais inativos ▸ [SE TOKEN] … ▸ [FIM SE]
 *  5. Shading/highlight dos parágrafos mantidos
 *
 * Se o modelo NÃO contiver "INÍCIO DA PEÇA", retorna o XML intacto.
 */

// ── Helpers XML de baixo nível ──────────────────────────────────────────────

/** Extrai o texto puro de um <w:p> (concatenando todos os <w:t>) */
function extractParaText(paraXml) {
  const matches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  return matches.map(m => m.replace(/<[^>]+>/g, "")).join("").trim();
}

/** Remove shading e highlight de um parágrafo XML */
function removeParaShading(paraXml) {
  let c = paraXml.replace(/<w:shd[^>]*\/>/g, "");
  c = c.replace(/<w:shd[^>]*>[\s\S]*?<\/w:shd>/g, "");
  c = c.replace(/<w:highlight[^>]*\/>/g, "");
  c = c.replace(/<w:highlight[^>]*>[\s\S]*?<\/w:highlight>/g, "");
  return c;
}

// ── Lógica de filtragem de parágrafos ───────────────────────────────────────

const INICIO_MARKER  = /INÍCIO DA PEÇA/i;
const BLOCO_OPEN_RE  = /^\s*▸\s*\[SE\s+/i;
const BLOCO_CLOSE_RE = /^\s*▸\s*\[FIM\s+(SE|BLOCO)/i;
const MARCADOR_RE    = /^\s*▸/;
const NOTA_RE        = /^\s*ℹ/;
const NAO_COPIAR_RE  = /NÃO\s+cop[i]?ar\s+para\s+a\s+pe[çc]/i;

/**
 * Recebe um array de strings de parágrafos (cada item = XML de um <w:p>)
 * e retorna o subarray filtrado de acordo com os tokens.
 */
function filterParagraphs(paras, finalTokens) {
  // Fase 1: encontra "INÍCIO DA PEÇA" e descarta tudo antes (inclusive)
  let startIdx = 0;
  for (let i = 0; i < paras.length; i++) {
    if (INICIO_MARKER.test(extractParaText(paras[i]))) {
      startIdx = i + 1;
      break;
    }
  }
  const workParas = startIdx > 0 ? paras.slice(startIdx) : paras;

  // Fase 2: filtra marcadores, notas e blocos condicionais
  const result = [];
  const blocoStack = []; // true = bloco ativo (manter), false = inativo (descartar)

  for (const para of workParas) {
    const text = extractParaText(para);

    // Notas internas
    if (NOTA_RE.test(text)) continue;
    if (NAO_COPIAR_RE.test(text)) continue;

    // Abertura de bloco condicional: ▸ [SE TOKEN] ou ▸ [SE TOKEN = valor]
    if (BLOCO_OPEN_RE.test(text)) {
      const tokenMatch = text.match(/\[SE\s+([A-Z0-9_]+)\s*(?:=\s*["']?([^"'\]]+)["']?)?\]/i);
      let blocoAtivo = false;
      if (tokenMatch) {
        const tokenNome = tokenMatch[1].toUpperCase();
        const tokenValor = tokenMatch[2]?.trim().toLowerCase();
        const tokenData = finalTokens[tokenNome];
        if (tokenValor !== undefined) {
          blocoAtivo = String(tokenData || "").toLowerCase() === tokenValor;
        } else {
          blocoAtivo = !!tokenData && tokenData !== false && tokenData !== "false" && tokenData !== "0" && tokenData !== "Não";
        }
      }
      blocoStack.push(blocoAtivo);
      continue; // remove o marcador ▸ em si
    }

    // Fechamento: ▸ [FIM SE] / ▸ [FIM BLOCO]
    if (BLOCO_CLOSE_RE.test(text)) {
      blocoStack.pop();
      continue; // remove o marcador ▸ em si
    }

    // Qualquer outro ▸ é instrução
    if (MARCADOR_RE.test(text)) continue;

    // Dentro de bloco inativo: descarta
    if (blocoStack.length > 0 && !blocoStack[blocoStack.length - 1]) continue;

    // Remove shading do parágrafo mantido
    result.push(removeParaShading(para));
  }

  return result;
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Limpa o document.xml preservando o envelope XML intacto.
 *
 * Estratégia:
 *  1. Extrai o bloco <w:body>…</w:body> por regex (preserva tudo fora)
 *  2. Dentro do body, coleta todos os <w:p> e itens não-parágrafo
 *  3. Filtra os <w:p> com filterParagraphs
 *  4. Reconstrói o body substituindo apenas o seu conteúdo interno
 *  5. Retorna o XML original com apenas o interior do body modificado
 *
 * @param {string} xmlContent — conteúdo de word/document.xml
 * @param {object} finalTokens — tokens finais (flags booleanas + dados)
 * @returns {string} — XML limpo (envelope intacto)
 */
export function cleanDocxXml(xmlContent, finalTokens) {
  // Sem marcador de início: retorna intacto (ex: Vigilante sem preâmbulo)
  if (!INICIO_MARKER.test(xmlContent)) return xmlContent;

  // Localiza o bloco <w:body>...</w:body>
  const bodyMatch = xmlContent.match(/(<w:body[^>]*>)([\s\S]*)(<\/w:body>)/);
  if (!bodyMatch) return xmlContent; // formato inesperado — devolve intacto

  const bodyOpenTag  = bodyMatch[1];  // "<w:body>" ou "<w:body ...>"
  const bodyContent  = bodyMatch[2];  // tudo entre as tags
  const bodyCloseTag = bodyMatch[3];  // "</w:body>"

  // Divide o interior do body em parágrafos (<w:p>) e outros elementos
  // Outros elementos (tabelas <w:tbl>, sectPr <w:sectPr>, etc.) são preservados
  const ITEM_RE = /(<w:p[ >][\s\S]*?<\/w:p>|<w:tbl[\s\S]*?<\/w:tbl>|<w:sectPr[\s\S]*?<\/w:sectPr>|<[^/][^>]*\/>)/g;
  const items = [];
  let lastIdx = 0;
  let m;
  while ((m = ITEM_RE.exec(bodyContent)) !== null) {
    if (m.index > lastIdx) {
      // Texto entre elementos (whitespace, etc.) — preserva
      const between = bodyContent.slice(lastIdx, m.index);
      if (between.trim()) items.push({ type: "other", xml: between });
    }
    if (m[0].startsWith("<w:p")) {
      items.push({ type: "para", xml: m[0] });
    } else {
      items.push({ type: "other", xml: m[0] });
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < bodyContent.length) {
    const tail = bodyContent.slice(lastIdx);
    if (tail.trim()) items.push({ type: "other", xml: tail });
  }

  // Separa parágrafos dos outros para filtrar
  const paraXmls  = items.filter(i => i.type === "para").map(i => i.xml);
  const filtered  = filterParagraphs(paraXmls, finalTokens);

  // Reconstrói o body: substitui cada parágrafo (na ordem) pelos filtrados,
  // preservando outros elementos (tabelas, sectPr) no lugar original.
  let paraIdx = 0;
  const rebuiltParts = [];
  for (const item of items) {
    if (item.type === "other") {
      rebuiltParts.push(item.xml);
    } else {
      // type === "para": pega do array filtrado se ainda houver
      // Se o parágrafo foi removido na filtragem, não emite nada.
      // Para manter a ordem correta, calculamos se este parágrafo específico sobreviveu.
      // Como filterParagraphs pode pular parágrafos, precisamos de um approach diferente:
      // simplesmente emitimos os filtrados em sequência depois dos outros itens.
      // => Abordagem: marcadores de posição.
      rebuiltParts.push(`__PARA_PLACEHOLDER_${paraIdx++}__`);
    }
  }

  // Substitui os placeholders pelos parágrafos filtrados (em ordem)
  let filteredIdx = 0;
  const rebuiltBody = rebuiltParts.map(part => {
    if (/__PARA_PLACEHOLDER_\d+__/.test(part)) {
      const p = filtered[filteredIdx];
      filteredIdx++;
      return p || ""; // se foi filtrado, emite string vazia
    }
    return part;
  }).join("");

  // Reconstrói o XML completo: substitui apenas o interior do <w:body>
  const newBodyBlock = bodyOpenTag + rebuiltBody + bodyCloseTag;
  return xmlContent.replace(/(<w:body[^>]*>)([\s\S]*)(<\/w:body>)/, newBodyBlock);
}

/**
 * Aplica cleanDocxXml diretamente num objeto PizZip.
 * @param {object} zip — instância PizZip já carregada
 * @param {object} finalTokens — tokens finais
 * @returns {{ cleaned: boolean, error: string|null }}
 */
export function applyCleanToZip(zip, finalTokens) {
  const log = { cleaned: false, error: null };
  try {
    const docXmlKey = "word/document.xml";
    const original = zip.file(docXmlKey)?.asText();
    if (original) {
      const cleaned = cleanDocxXml(original, finalTokens);
      zip.file(docXmlKey, cleaned);
      log.cleaned = cleaned !== original;
    }
  } catch (err) {
    log.error = err.message;
  }
  return log;
}

/**
 * Valida o documento final: artefatos proibidos + tokens essenciais + XML bem formado.
 * @param {object} zip — instância PizZip após render
 * @param {object} tokens — tokens finais usados
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFinalDocx(zip, tokens) {
  const errors = [];

  try {
    const docXml = zip.file("word/document.xml")?.asText() || "";

    // 1. Verifica se o envelope XML está presente (bem formado no mínimo)
    if (!docXml.includes("<w:document") || !docXml.includes("<w:body")) {
      errors.push("document.xml está corrompido: envelope <w:document>/<w:body> ausente");
    }
    if (!docXml.includes("</w:body>") || !docXml.includes("</w:document>")) {
      errors.push("document.xml está corrompido: tags de fechamento </w:body></w:document> ausentes");
    }

    // 2. Extrai texto para checar artefatos
    const allText = (docXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map(m => m.replace(/<[^>]+>/g, ""))
      .join(" ");

    const ARTEFATOS = [
      { re: /▸/, msg: "Documento contém marcadores de bloco condicional (▸)" },
      { re: /ℹ/, msg: "Documento contém notas internas (ℹ)" },
      { re: /INÍCIO DA PEÇA/i, msg: "Documento contém marcador INÍCIO DA PEÇA" },
      { re: /COMO USAR ESTE MODELO/i, msg: "Documento contém instruções internas do modelo" },
    ];
    for (const { re, msg } of ARTEFATOS) {
      if (re.test(allText)) errors.push(msg);
    }

    // 3. Tokens essenciais não podem estar vazios
    const ESSENCIAIS = [
      { key: "RECL_NOME",  label: "Nome do reclamante" },
      { key: "RECL1_NOME", label: "Nome da 1ª reclamada" },
      { key: "RECL1_CNPJ", label: "CNPJ da 1ª reclamada" },
    ];
    for (const { key, label } of ESSENCIAIS) {
      const val = tokens[key];
      if (!val || String(val).trim() === "") {
        errors.push(`Token essencial vazio: ${label} (${key})`);
      }
    }
  } catch (err) {
    errors.push("Erro na validação: " + err.message);
  }

  return { valid: errors.length === 0, errors };
}