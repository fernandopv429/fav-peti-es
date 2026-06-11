/**
 * cleanDocxXml — limpeza universal do document.xml de templates tokenizados FAV.
 *
 * Remove do XML:
 *  1. Tudo antes e inclusive o marcador "INÍCIO DA PEÇA" (preâmbulo de instruções)
 *  2. Parágrafos de instrução: iniciados com "▸" (alternativas, marcadores de bloco)
 *  3. Notas internas: iniciadas com "ℹ" ou contendo "NÃO copiar para a peça"
 *  4. Blocos condicionais inativos (baseado nos tokens finais passados)
 *  5. Remove shading/highlight dos parágrafos mantidos (faixas coloridas de instrução)
 *
 * Se o modelo NÃO contiver "INÍCIO DA PEÇA", retorna o XML intacto (Vigilante sem preâmbulo).
 *
 * @param {string} xmlContent — conteúdo de word/document.xml
 * @param {object} finalTokens — tokens finais (flags booleanas + dados do caso)
 * @returns {string} — XML limpo
 */
export function cleanDocxXml(xmlContent, finalTokens) {
  const INICIO_MARKER  = /INÍCIO DA PEÇA/i;
  const BLOCO_OPEN_RE  = /^\s*▸\s*\[SE\s+/i;      // ▸ [SE TOKEN]
  const BLOCO_CLOSE_RE = /^\s*▸\s*\[FIM\s+(SE|BLOCO)/i; // ▸ [FIM SE] / ▸ [FIM BLOCO]
  // Qualquer parágrafo que começa com ▸ é marcador de instrução — remover sempre
  const MARCADOR_RE    = /^\s*▸/;
  // Notas internas ℹ ou "NÃO copiar para a peça"
  const NOTA_RE        = /^\s*ℹ/;
  const NAO_COPIAR_RE  = /NÃO\s+cop[i]?ar\s+para\s+a\s+pe[çc]/i;

  // Se não tem marcador INÍCIO DA PEÇA, não há preâmbulo de instruções — retorna intacto
  if (!INICIO_MARKER.test(xmlContent)) return xmlContent;

  // ── Extrai parágrafos ────────────────────────────────────────────────────
  const paraRE = /(<w:p[ >][\s\S]*?<\/w:p>)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = paraRE.exec(xmlContent)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "raw", content: xmlContent.slice(lastIndex, match.index) });
    }
    parts.push({ type: "para", content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < xmlContent.length) {
    parts.push({ type: "raw", content: xmlContent.slice(lastIndex) });
  }

  // ── Fase 1: encontra e remove tudo até "INÍCIO DA PEÇA" (inclusive) ─────
  let inicioIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type === "para" && INICIO_MARKER.test(extractParaText(parts[i].content))) {
      inicioIdx = i;
      break;
    }
  }
  const workParts = inicioIdx >= 0 ? parts.slice(inicioIdx + 1) : parts;

  // ── Fase 2: filtra marcadores, notas e blocos condicionais ───────────────
  const result = [];
  const blocoStack = []; // stack de bool: true=ativo, false=inativo

  for (const part of workParts) {
    if (part.type === "raw") {
      result.push(part.content);
      continue;
    }

    const text = extractParaText(part.content);

    // Remove notas internas ℹ
    if (NOTA_RE.test(text)) continue;
    // Remove "NÃO copiar para a peça"
    if (NAO_COPIAR_RE.test(text)) continue;

    // Detecta abertura de bloco condicional: ▸ [SE TOKEN] ou ▸ [SE TOKEN = valor]
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

    // Detecta fechamento: ▸ [FIM SE] ou ▸ [FIM BLOCO]
    if (BLOCO_CLOSE_RE.test(text)) {
      blocoStack.pop();
      continue; // remove o marcador ▸ em si
    }

    // Qualquer outro parágrafo que começa com ▸ é instrução — remover
    if (MARCADOR_RE.test(text)) continue;

    // Dentro de bloco inativo: descarta
    if (blocoStack.length > 0 && !blocoStack[blocoStack.length - 1]) continue;

    // ── Remove shading/highlight do parágrafo (faixas coloridas de instrução)
    // Apenas remove w:shd dos runs e do parágrafo, preserva negrito, fonte, numeração
    const paraLimpo = removeParaShadingAndHighlight(part.content);
    result.push(paraLimpo);
  }

  return result.join("");
}

/**
 * Extrai o texto puro de um nó XML <w:p>.
 */
function extractParaText(paraXml) {
  const matches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  return matches.map(m => m.replace(/<[^>]+>/g, "")).join("").trim();
}

/**
 * Remove w:shd (shading/background color) e w:highlight dos elementos
 * de um parágrafo XML, preservando demais formatações.
 * Isso elimina as faixas vermelhas/azuis dos blocos de instrução.
 */
function removeParaShadingAndHighlight(paraXml) {
  // Remove tags <w:shd .../> (self-closing e com conteúdo)
  let cleaned = paraXml.replace(/<w:shd[^>]*\/>/g, "");
  cleaned = cleaned.replace(/<w:shd[^>]*>[\s\S]*?<\/w:shd>/g, "");
  // Remove tags <w:highlight .../> 
  cleaned = cleaned.replace(/<w:highlight[^>]*\/>/g, "");
  cleaned = cleaned.replace(/<w:highlight[^>]*>[\s\S]*?<\/w:highlight>/g, "");
  return cleaned;
}

/**
 * Aplica cleanDocxXml diretamente num objeto PizZip.
 * Modifica word/document.xml in-place e retorna um log.
 *
 * @param {object} zip — instância PizZip já carregada
 * @param {object} finalTokens — tokens finais (flags booleanas + dados)
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
 * Valida o documento final: verifica se ainda contém artefatos proibidos
 * ou tokens essenciais vazios após a geração.
 *
 * @param {object} zip — instância PizZip após render
 * @param {object} tokens — tokens finais usados
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFinalDocx(zip, tokens) {
  const errors = [];

  try {
    const docXml = zip.file("word/document.xml")?.asText() || "";

    // Extrai todo o texto do documento para validação
    const allText = (docXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map(m => m.replace(/<[^>]+>/g, ""))
      .join(" ");

    // Artefatos proibidos
    const ARTEFATOS = [
      { re: /▸/, msg: "Documento contém marcadores de bloco condicional (▸)" },
      { re: /ℹ/, msg: "Documento contém notas internas (ℹ)" },
      { re: /INÍCIO DA PEÇA/i, msg: "Documento contém marcador INÍCIO DA PEÇA" },
      { re: /COMO USAR ESTE MODELO/i, msg: "Documento contém instruções internas do modelo" },
    ];
    for (const { re, msg } of ARTEFATOS) {
      if (re.test(allText)) errors.push(msg);
    }

    // Tokens essenciais não podem estar vazios
    const ESSENCIAIS = [
      { key: "RECL_NOME", label: "Nome do reclamante" },
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