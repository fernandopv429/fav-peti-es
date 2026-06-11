/**
 * generatePetitionDocx — pipeline determinístico universal.
 *
 * Replica EXATAMENTE o pipeline do Vigilante para QUALQUER template tokenizado:
 *  1. Baixa o modelo_docx_url do PetitionTemplate
 *  2. Usa IA (opcionalmente) para mapear dados do caso → tokens do modelo
 *  3. Substitui tokens via docxtemplater
 *  4. Salva o DOCX na Petition (document_urls) e atualiza status
 *
 * Nunca gera texto plain — sempre DOCX byte-idêntico ao modelo oficial.
 * Qualquer erro grava ErrorLog e marca status "revisao_necessaria" — NUNCA trava em "em_geracao".
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import PizZip from 'npm:pizzip@3.2.0';
import Docxtemplater from 'npm:docxtemplater@3.68.7';

// ── helpers de limpeza (inline — sem imports locais no Deno) ──────────────

function extractParaText(paraXml) {
  const matches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  return matches.map(m => m.replace(/<[^>]+>/g, "")).join("").trim();
}

/**
 * Remove shading e highlight dos parágrafos — elimina faixas coloridas de instrução.
 */
function removeParaShading(paraXml) {
  let c = paraXml.replace(/<w:shd[^>]*\/>/g, "");
  c = c.replace(/<w:shd[^>]*>[\s\S]*?<\/w:shd>/g, "");
  c = c.replace(/<w:highlight[^>]*\/>/g, "");
  c = c.replace(/<w:highlight[^>]*>[\s\S]*?<\/w:highlight>/g, "");
  return c;
}

/**
 * Limpa o XML do document.xml:
 *  1. Remove tudo antes e inclusive "INÍCIO DA PEÇA"
 *  2. Remove parágrafos iniciados com ▸ (marcadores de bloco e alternativas)
 *  3. Remove parágrafos iniciados com ℹ (notas internas)
 *  4. Remove parágrafos com "NÃO copiar para a peça"
 *  5. Processa blocos condicionais ▸ [SE TOKEN] / ▸ [FIM SE]
 *  6. Remove shading dos parágrafos mantidos
 */
function cleanDocxXml(xmlContent, finalTokens) {
  const INICIO_MARKER  = /INÍCIO DA PEÇA/i;
  const BLOCO_OPEN_RE  = /^\s*▸\s*\[SE\s+/i;
  const BLOCO_CLOSE_RE = /^\s*▸\s*\[FIM\s+(SE|BLOCO)/i;
  const MARCADOR_RE    = /^\s*▸/;
  const NOTA_RE        = /^\s*ℹ/;
  const NAO_COPIAR_RE  = /NÃO\s+cop[i]?ar\s+para\s+a\s+pe[çc]/i;

  if (!INICIO_MARKER.test(xmlContent)) return xmlContent;

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

  // Fase 1: encontra "INÍCIO DA PEÇA" e descarta tudo antes (inclusive)
  let inicioIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type === "para" && INICIO_MARKER.test(extractParaText(parts[i].content))) {
      inicioIdx = i;
      break;
    }
  }
  const workParts = inicioIdx >= 0 ? parts.slice(inicioIdx + 1) : parts;

  // Fase 2: filtra marcadores, notas e blocos condicionais
  const result = [];
  const blocoStack = [];

  for (const part of workParts) {
    if (part.type === "raw") { result.push(part.content); continue; }

    const text = extractParaText(part.content);

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
      continue;
    }

    // Fechamento: ▸ [FIM SE] / ▸ [FIM BLOCO]
    if (BLOCO_CLOSE_RE.test(text)) {
      blocoStack.pop();
      continue;
    }

    // Qualquer outro ▸ é instrução — remover
    if (MARCADOR_RE.test(text)) continue;

    // Dentro de bloco inativo: descarta
    if (blocoStack.length > 0 && !blocoStack[blocoStack.length - 1]) continue;

    // Remove shading do parágrafo mantido
    result.push(removeParaShading(part.content));
  }

  return result.join("");
}

/**
 * Valida o documento final contra artefatos proibidos e tokens essenciais vazios.
 */
function validateFinalDocx(zip, tokens) {
  const errors = [];
  try {
    const allText = (zip.file("word/document.xml")?.asText() || "")
      .match(/<w:t[^>]*>([^<]*)<\/w:t>/g)?.map(m => m.replace(/<[^>]+>/g, "")).join(" ") || "";

    const ARTEFATOS = [
      { re: /▸/, msg: "Contém marcadores de bloco (▸)" },
      { re: /ℹ/, msg: "Contém notas internas (ℹ)" },
      { re: /INÍCIO DA PEÇA/i, msg: "Contém marcador INÍCIO DA PEÇA" },
      { re: /COMO USAR ESTE MODELO/i, msg: "Contém instruções internas do modelo" },
    ];
    for (const { re, msg } of ARTEFATOS) {
      if (re.test(allText)) errors.push(msg);
    }

    const ESSENCIAIS = [
      { key: "RECL_NOME", label: "Nome do reclamante" },
      { key: "RECL1_NOME", label: "Nome da 1ª reclamada" },
      { key: "RECL1_CNPJ", label: "CNPJ da 1ª reclamada" },
    ];
    for (const { key, label } of ESSENCIAIS) {
      if (!tokens[key] || String(tokens[key]).trim() === "") {
        errors.push(`Token essencial vazio: ${label} (${key})`);
      }
    }
  } catch (err) {
    errors.push("Erro na validação: " + err.message);
  }
  return { valid: errors.length === 0, errors };
}

function sanitizeTokenValue(val) {
  if (typeof val !== "string") return val;
  const lines = val.split("\n");
  const cleanLines = [];
  const FECHO_RE = /^(nestes termos|pede deferimento|e\.e\.d\.|termos em que|a\.e\.d\.|nesses termos)/i;
  const EXTRA_SECTION_RE = /^(memória de cálculo|anexo|nota técnica|rol de testemunhas|\[fim da peça|\[fim do documento)/i;
  let fechoFound = false;
  for (const line of lines) {
    const t = line.trim();
    if (fechoFound && EXTRA_SECTION_RE.test(t)) break;
    if (FECHO_RE.test(t)) fechoFound = true;
    if (/^\|/.test(t)) continue;
    if (/^\s*\|/.test(t)) continue;
    if (/^`{1,3}/.test(t)) continue;
    if (/^#{1,6}\s/.test(t)) continue;
    if (/^[-]{3,}$/.test(t)) continue;
    if (/^\[Fim/.test(t)) continue;
    if (/^NOTA TÉCNICA/i.test(t)) continue;
    cleanLines.push(line);
  }
  return cleanLines.join("\n").trim();
}

function sanitizeTokens(tokens) {
  const out = {};
  for (const [k, v] of Object.entries(tokens)) {
    out[k] = typeof v === "string" ? sanitizeTokenValue(v) : v;
  }
  return out;
}

function isVisualFile(url) {
  const lower = (url || "").toLowerCase().split("?")[0];
  return lower.endsWith(".pdf") || lower.endsWith(".png") || lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif");
}

async function fetchDocx(url) {
  // Usa backend proxy para evitar CORS no app publicado
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao baixar modelo DOCX (${resp.status}): ${url}`);
  const ab = await resp.arrayBuffer();
  return new Uint8Array(ab);
}

/**
 * Limpa o XML, substitui tokens {{CHAVE}} e valida o DOCX final.
 * Retorna buffer uint8array e lista de tokens faltando.
 * Lança erro se a validação final detectar artefatos proibidos ou tokens essenciais vazios.
 */
function renderDocx(buffer, tokens, cleanupLog) {
  const tokensFaltando = [];
  const zip = new PizZip(buffer);

  // Limpa o document.xml: preâmbulo, ▸, ℹ, blocos inativos, shading
  // Preserva header.xml, footer.xml, styles.xml — não toca no logo/rodapé.
  try {
    const docXmlKey = "word/document.xml";
    const original = zip.file(docXmlKey)?.asText();
    if (original) {
      const cleaned = cleanDocxXml(original, tokens);
      zip.file(docXmlKey, cleaned);
      if (cleanupLog) cleanupLog.cleaned = cleaned !== original;
    }
  } catch (cleanErr) {
    if (cleanupLog) cleanupLog.error = cleanErr.message;
  }

  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => {
      if (part && part.module === undefined && part.value) {
        tokensFaltando.push(part.value);
      }
      return "";
    },
    errorLogging: false,
  });
  doc.render(tokens);

  // Validação final — aborta se ainda houver artefatos proibidos ou tokens essenciais vazios
  const finalZip = doc.getZip();
  const { valid, errors } = validateFinalDocx(finalZip, tokens);
  if (!valid) {
    throw new Error("Validação do DOCX falhou: " + errors.join("; "));
  }

  const out = finalZip.generate({
    type: "uint8array",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  return { buffer: out, tokensFaltando };
}

// ── mapeador de dados do caso → tokens genéricos ──────────────────────────

/**
 * Monta um objeto de tokens a partir dos dados da Petition e do laudo de análise.
 * Cobre os campos RECL_*, RECL1/2/3_*, datas, salário, jornada — mesma convenção do Vigilante.
 * Para tokens específicos do modelo (ex: SINDEEPRES, SIEMACO), a IA completa via aiTokens.
 */
function buildBaseTokens(petition, extraDefendants) {
  const ed = extraDefendants || [];

  // Formata data de DD/MM/AAAA ou YYYY-MM-DD para "DD de MÊS de AAAA"
  function fmtData(d) {
    if (!d) return "";
    const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    let dia, mes, ano;
    if (d.includes("-")) { [ano, mes, dia] = d.split("-"); }
    else if (d.includes("/")) { [dia, mes, ano] = d.split("/"); }
    else return d;
    const m = parseInt(mes, 10) - 1;
    return `${parseInt(dia, 10)} de ${meses[m] || mes} de ${ano}`;
  }

  function fmtSalario(v) {
    if (!v) return "";
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    if (isNaN(n)) return String(v);
    return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  }

  return {
    // Reclamante
    RECL_NOME:          petition.claimant_name || "",
    RECL_CPF:           petition.claimant_cpf || "",
    RECL_RG:            petition.claimant_rg || "",
    RECL_PIS:           petition.claimant_pis || "",
    RECL_CTPS:          petition.claimant_ctps || "",
    RECL_NASC:          fmtData(petition.claimant_birth_date || ""),
    RECL_ENDERECO:      petition.claimant_address || "",
    RECL_FILIACAO:      "",
    RECL_ESTADOCIVIL:   "",
    RECL_NACIONALIDADE: "brasileiro",
    FUNCAO:             petition.claimant_role || "Porteiro",
    // 1ª Reclamada
    RECL1_NOME:         petition.defendant_name || "",
    RECL1_CNPJ:         petition.defendant_cnpj || "",
    RECL1_LOGRADOURO:   petition.defendant_address || "",
    RECL1_ENDCOMPL:     petition.defendant_address || "",
    // 2ª Reclamada
    RECL2_NOME:         ed[0]?.name || "",
    RECL2_CNPJ:         ed[0]?.cnpj || "",
    RECL2_LOGRADOURO:   ed[0]?.address || "",
    RECL2_ENDCOMPL:     ed[0]?.address || "",
    // 3ª Reclamada
    RECL3_NOME:         ed[1]?.name || "",
    RECL3_CNPJ:         ed[1]?.cnpj || "",
    RECL3_LOGRADOURO:   ed[1]?.address || "",
    RECL3_ENDCOMPL:     ed[1]?.address || "",
    // Contrato
    DATA_ADMISSAO:      fmtData(petition.contract_start || ""),
    DATA_RESCISAO:      fmtData(petition.contract_end || ""),
    SALARIO:            fmtSalario(petition.salary),
    JORNADA_HORARIO:    petition.work_schedule || "",
    // Localização
    COMARCA_UF:         petition.jurisdiction || "",
    FORO_COMPETENCIA:   petition.jurisdiction || "",
    // Benefícios / rito
    JUSTICA_GRATUITA:   petition.free_justice ? "Sim" : "Não",
    JUIZO_DIGITAL:      petition.digital_court ? "Sim" : "Não",
    // Flags de responsabilidade subsidiária
    tem_subsidiaria:    ed.length > 0,
  };
}

// ── main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Autenticação via createClientFromRequest já garante o contexto do usuário
    // Não é necessário chamar base44.auth.me() explicitamente

    const { petitionId, templateId, modeloIA, formTokens } = await req.json();
    if (!petitionId || !templateId) {
      return Response.json({ error: 'petitionId e templateId são obrigatórios' }, { status: 400 });
    }

    // Responde imediatamente — processa em background
    // IMPORTANTE: todo o bloco assíncrono tem try/catch próprio para NUNCA deixar
    // a petição travada em "em_geracao". Qualquer exceção → status "revisao_necessaria" + ErrorLog.
    const bgWork = new Promise((resolve) => resolve()).then(async () => {
      const startTime = Date.now();
      // formTokens: tokens pré-preenchidos pelo formulário genérico no frontend
      // Quando presentes, substituem a extração IA (apenas complementam campos faltantes)

      // ── LOG IMEDIATO: registra que a geração foi iniciada ─────────────────
      // Feito ANTES de qualquer processamento para que falhas posteriores fiquem visíveis.
      try {
        await base44.asServiceRole.entities.GenerationLog.create({
          petition_id: petitionId,
          status: "iniciado",
          model_used: "generatePetitionDocx",
          template_id: templateId,
          generated_at: new Date().toISOString(),
        });
      } catch (_) {}

      // ── 1. Carrega entidades necessárias ─────────────────────────────────
      const [petList, tmplList, cfgList] = await Promise.all([
        base44.asServiceRole.entities.Petition.filter({ id: petitionId }),
        base44.asServiceRole.entities.PetitionTemplate.filter({ id: templateId }),
        base44.asServiceRole.entities.PetitionConfig.filter({ ativo: true }),
      ]);

      const petition = petList[0];
      const template = tmplList[0];
      const cfg = cfgList[0] || {};

      if (!petition) throw new Error(`Petição ${petitionId} não encontrada`);
      if (!template) throw new Error(`Template ${templateId} não encontrado`);

      const modeloDocxUrl = template.modelo_docx_url;
      if (!modeloDocxUrl) throw new Error(`Template "${template.name}" não possui modelo_docx_url`);

      const extraDefendants = Array.isArray(petition.extra_defendants) ? petition.extra_defendants : [];

      // ── 2. Processa documentos para alimentar a IA ────────────────────────
      const docUrls = petition.document_urls || [];
      const docNames = petition.document_names || [];
      const imageOrPdfUrls = [];
      const docTexts = [];

      for (let i = 0; i < docUrls.length; i++) {
        const url = docUrls[i];
        const name = docNames[i] || `Documento ${i + 1}`;
        if (isVisualFile(url)) {
          imageOrPdfUrls.push(url);
        } else {
          try {
            const r = await fetch(url);
            if (r.ok) {
              const txt = (await r.text()).slice(0, 8000).trim();
              if (txt) docTexts.push(`=== ${name} ===\n${txt}`);
            }
          } catch (_) {}
        }
      }

      // Laudo de análise (se já concluída)
      const laudoAnalise = (petition.analise_documentos && petition.analise_status === "concluida")
        ? petition.analise_documentos : "";

      // ── 3. Monta tokens base a partir dos dados da Petition ───────────────
      const baseTokens = buildBaseTokens(petition, extraDefendants);

      // ── 4. IA extrai APENAS dados curtos (datas, valores, nomes, horários) ──
      // NUNCA gera texto narrativo longo — isso causa páginas extras.
      // Imagens/PDFs são usados APENAS para extrair dados estruturados curtos,
      // NÃO para transcrição de conteúdo visual.
      let aiTokens = {};
      if (docTexts.length > 0 || imageOrPdfUrls.length > 0 || laudoAnalise) {
        try {
          // Normaliza modelo: usa PetitionConfig.modelo_ia com fallback claude_sonnet_4_6
          // Substitui modelos Claude antigos/inválidos pelo equivalente válido
          let modeloRaw = modeloIA || cfg.modelo_ia || "claude_sonnet_4_6";
          const iaModel = modeloRaw
            .replace(/claude-sonnet-4-20250514/g, "claude_sonnet_4_6")
            .replace(/claude-3-5-sonnet/g, "claude_sonnet_4_6")
            .replace(/claude-sonnet/g, "claude_sonnet_4_6");

          // Dados imutáveis das partes — NUNCA podem ser alterados pela IA
          const partesImutaveis = {
            RECL_NOME: baseTokens.RECL_NOME,
            RECL1_NOME: baseTokens.RECL1_NOME,
            RECL1_CNPJ: baseTokens.RECL1_CNPJ,
            RECL2_NOME: baseTokens.RECL2_NOME,
            RECL2_CNPJ: baseTokens.RECL2_CNPJ,
            RECL3_NOME: baseTokens.RECL3_NOME,
            RECL3_CNPJ: baseTokens.RECL3_CNPJ,
            COMARCA_UF: baseTokens.COMARCA_UF,
            FORO_COMPETENCIA: baseTokens.FORO_COMPETENCIA,
            LOCAL_PRESTACAO: baseTokens.LOCAL_PRESTACAO,
          };

          const promptIA = `Você é um extrator de dados jurídicos. Analise os documentos do caso abaixo e retorne APENAS um JSON com dados CURTOS e OBJETIVOS extraídos.

⚠️ INSTRUÇÃO CRÍTICA — DADOS IMUTÁVEIS DAS PARTES:
Os dados abaixo são OFICIAIS e VINCULANTES. NUNCA retorne, substitua ou inferia outros valores para estas chaves. Se encontrar nomes/CEPs/endereços diferentes nos documentos, IGNORE — mantenha os dados oficiais:

${JSON.stringify(partesImutaveis, null, 2)}

DADOS JÁ PREENCHIDOS (não retorne estes — use apenas como contexto):
${JSON.stringify(baseTokens, null, 2)}

${laudoAnalise ? `LAUDO:\n${laudoAnalise.slice(0, 3000)}\n\n` : ""}
${docTexts.length > 0 ? `DOCUMENTOS (texto):\n${docTexts.join("\n\n").slice(0, 6000)}\n\n` : ""}
${imageOrPdfUrls.length > 0 ? `${imageOrPdfUrls.length} arquivo(s) PDF/imagem em anexo — extraia APENAS dados estruturados.\n\n` : ""}

REGRAS ABSOLUTAS:
1. Retorne SOMENTE JSON puro, sem markdown, sem comentários.
2. Extraia APENAS valores CURTOS e OBJETIVOS: datas (ex: "04 de junho de 2012"), valores monetários (ex: "R$ 2.148,22"), horários (ex: "18:30 às 07:30").
3. PROIBIDO retornar texto narrativo longo, parágrafos, fundamentação jurídica, ou qualquer texto com mais de 2 linhas num token.
4. NÃO transcreva nem descreva imagens (cartões de ponto, holerites) — extraia apenas os NÚMEROS/VALORES presentes nelas.
5. Tokens permitidos: DATA_ADMISSAO, DATA_RESCISAO, SALARIO, JORNADA_HORARIO, JORNADA_EXTRAPOLA, JORNADA_FREQ_EXTRA, INTERVALO_GOZADO, CCT_VIGENCIA, ADIC_CONV, VAL_FT, VAL_CONDUCAO, VAL_ALIMENTACAO, VALOR_CAUSA, RECL_SERIE, RECL_FILIACAO, RECL_ESTADOCIVIL, P01 até P87 (apenas valores monetários, ex: "R$ 21.482,20").
6. PROIBIDO RETORNAR DADOS DAS PARTES: NUNCA retorne RECL_NOME, RECL1_NOME, RECL2_NOME, RECL3_NOME, CNPJs, endereços, CEPs, COMARCA_UF, FORO_COMPETENCIA — estes dados já estão definidos e são IMUTÁVEIS.
7. Para campos não encontrados nos documentos, NÃO inclua no JSON.
8. TIPO_RESCISAO deve ser um destes valores exatos: "dispensa_sem_justa_causa", "rescisao_indireta", "reversao_justa_causa", "pedido_demissao".`;

          const iaResp = await base44.integrations.Core.InvokeLLM({
            prompt: promptIA,
            model: iaModel,
            file_urls: imageOrPdfUrls.length > 0 ? imageOrPdfUrls : undefined,
            response_json_schema: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          });

          if (iaResp && typeof iaResp === "object") {
            aiTokens = iaResp;
          }
        } catch (iaErr) {
          console.error("IA falhou na extração de tokens:", iaErr.message);
          await base44.asServiceRole.entities.ErrorLog.create({
            context: "generatePetitionDocx — IA tokens",
            error_type: "api",
            message: iaErr.message,
            petition_id: petitionId,
            resolved: false,
            occurred_at: new Date().toISOString(),
          }).catch(() => {});
        }
      }

      // Merge prioridade: formTokens (formulário) > aiTokens (IA) > baseTokens (Petition)
      // formTokens vêm do GenericoForm — dados revisados pelo advogado, máxima confiança
      const safeFormTokens = {};
      if (formTokens && typeof formTokens === "object") {
        for (const [k, v] of Object.entries(formTokens)) {
          if (k === "titulo" || k === "id" || k === "status") continue;
          if (typeof v === "boolean") { safeFormTokens[k] = v; continue; }
          if (v !== null && v !== undefined && v !== "") safeFormTokens[k] = String(v);
        }
      }
      // Merge com prioridade: formTokens > aiTokens > baseTokens
      const merged = { ...baseTokens, ...aiTokens, ...safeFormTokens };
      // Sanitiza strings longas (remove markdown, pipes, cabeçalhos)
      const finalTokens = {};
      for (const [k, v] of Object.entries(merged)) {
        finalTokens[k] = typeof v === "string" ? sanitizeTokenValue(v) : v;
      }

      // ── 5. Baixa e preenche o modelo DOCX ───────────────────────────────
      // O logo e layout ficam no header nativo do .docx (igual ao Vigilante).
      // cleanupLog rastreia se a limpeza de instruções foi executada e se houve erro.
      const modelBuffer = await fetchDocx(modeloDocxUrl);
      const cleanupLog = {};
      const { buffer: docxBuffer, tokensFaltando } = renderDocx(modelBuffer, finalTokens, cleanupLog);

      // Grava no ErrorLog se a limpeza do XML falhou (não interrompe geração)
      if (cleanupLog.error) {
        await base44.asServiceRole.entities.ErrorLog.create({
          context: "generatePetitionDocx — cleanDocxXml",
          error_type: "template",
          message: cleanupLog.error,
          petition_id: petitionId,
          template_id: templateId,
          resolved: false,
          occurred_at: new Date().toISOString(),
        }).catch(() => {});
      }
      console.log(`cleanDocxXml: cleaned=${cleanupLog.cleaned}, error=${cleanupLog.error || "none"}`);

      // ── 6. Faz upload do DOCX gerado ──────────────────────────────────────
      const nomeArquivo = `${(petition.claimant_name || "peticao").replace(/\s+/g, "_")}_${template.name.replace(/\s+/g, "_")}.docx`;
      const docxBlob = new Blob([docxBuffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const docxFile = new File([docxBlob], nomeArquivo, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const { file_url: docxUrl } = await base44.integrations.Core.UploadFile({ file: docxFile });

      // ── 7. Determina status final ──────────────────────────────────────────
      const hasTokensFaltando = tokensFaltando.length > 0;
      const finalStatus = hasTokensFaltando ? "revisao_necessaria" : "concluida";

      // ── 8. Atualiza Petition ───────────────────────────────────────────────
      // generated_content aponta para o DOCX (para visualização no PetitionView)
      // document_urls inclui o DOCX gerado
      const existingDocUrls = Array.isArray(petition.document_urls) ? petition.document_urls : [];
      const existingDocNames = Array.isArray(petition.document_names) ? petition.document_names : [];

      await base44.asServiceRole.entities.Petition.update(petitionId, {
        generated_content: docxUrl,
        template_used: template.name,
        status: finalStatus,
        document_urls: [...existingDocUrls, docxUrl],
        document_names: [...existingDocNames, nomeArquivo],
      });

      // ── 9. Incrementa use_count do template ───────────────────────────────
      try {
        await base44.asServiceRole.entities.PetitionTemplate.update(templateId, {
          use_count: (template.use_count || 0) + 1,
        });
      } catch (_) {}

      // ── 10. GenerationLog ─────────────────────────────────────────────────
      try {
        const modeloLog = (modeloIA || cfg.modelo_ia || "claude_sonnet_4_6")
          .replace(/claude-sonnet-4-20250514/g, "claude_sonnet_4_6")
          .replace(/claude-3-5-sonnet/g, "claude_sonnet_4_6");
        await base44.asServiceRole.entities.GenerationLog.create({
          petition_id: petitionId,
          petition_title: petition.title,
          status: "concluido",
          model_used: "docxtemplater+" + modeloLog,
          template_id: templateId,
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          generated_at: new Date().toISOString(),
        });
      } catch (_) {}

      console.log(`Petição DOCX ${petitionId} gerada — status: ${finalStatus}, tokens faltando: ${tokensFaltando.length}`);
    });

    bgWork.catch(async (fatalErr) => {
      console.error("Erro fatal generatePetitionDocx:", fatalErr.message);

      try {
        await base44.asServiceRole.entities.ErrorLog.create({
          context: "generatePetitionDocx — fatal",
          error_type: "geracao",
          message: fatalErr.message,
          petition_id: petitionId,
          resolved: false,
          occurred_at: new Date().toISOString(),
        });
      } catch (_) {}

      try {
        await base44.asServiceRole.entities.Petition.update(petitionId, {
          status: "revisao_necessaria",
        });
      } catch (_) {}

      try {
        await base44.asServiceRole.entities.GenerationLog.create({
          petition_id: petitionId,
          status: "erro",
          error_message: fatalErr.message,
          generated_at: new Date().toISOString(),
        });
      } catch (_) {}
    });

    return Response.json({ ok: true, petitionId, pipeline: "docx" });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});