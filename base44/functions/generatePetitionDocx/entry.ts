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

  // ── Preserva o envelope XML intacto ─────────────────────────────────────
  // Localiza APENAS o interior de <w:body>…</w:body> para manipulação.
  const bodyMatch = xmlContent.match(/(<w:body[^>]*>)([\s\S]*)(<\/w:body>)/);
  if (!bodyMatch) return xmlContent;

  const bodyOpen    = bodyMatch[1];
  const bodyContent = bodyMatch[2];
  const bodyClose   = bodyMatch[3];

  // Coleta parágrafos e outros elementos do body
  const ITEM_RE = /(<w:p[ >][\s\S]*?<\/w:p>|<w:tbl[\s\S]*?<\/w:tbl>|<w:sectPr[\s\S]*?<\/w:sectPr>)/g;
  const items = [];
  let lastIdx = 0;
  let m;
  while ((m = ITEM_RE.exec(bodyContent)) !== null) {
    if (m.index > lastIdx) {
      const between = bodyContent.slice(lastIdx, m.index);
      if (between.trim()) items.push({ type: "other", xml: between });
    }
    items.push({ type: m[0].startsWith("<w:p") ? "para" : "other", xml: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < bodyContent.length) {
    const tail = bodyContent.slice(lastIdx);
    if (tail.trim()) items.push({ type: "other", xml: tail });
  }

  // Filtra os parágrafos
  const paraXmls = items.filter(i => i.type === "para").map(i => i.xml);

  // Fase 1: encontra "INÍCIO DA PEÇA" e descarta tudo antes (inclusive)
  let startIdx = 0;
  for (let i = 0; i < paraXmls.length; i++) {
    if (INICIO_MARKER.test(extractParaText(paraXmls[i]))) { startIdx = i + 1; break; }
  }
  const workParas = startIdx > 0 ? paraXmls.slice(startIdx) : paraXmls;

  // Fase 2: filtra marcadores, notas, blocos condicionais
  const filtered = [];
  const blocoStack = [];
  for (const para of workParas) {
    const text = extractParaText(para);
    if (NOTA_RE.test(text)) continue;
    if (NAO_COPIAR_RE.test(text)) continue;
    if (BLOCO_OPEN_RE.test(text)) {
      const tokenMatch = text.match(/\[SE\s+([A-Z0-9_]+)\s*(?:=\s*["']?([^"'\]]+)["']?)?\]/i);
      let ativo = false;
      if (tokenMatch) {
        const nome = tokenMatch[1].toUpperCase();
        const val  = tokenMatch[2]?.trim().toLowerCase();
        const data = finalTokens[nome];
        ativo = val !== undefined
          ? String(data || "").toLowerCase() === val
          : !!data && data !== false && data !== "false" && data !== "0" && data !== "Não";
      }
      blocoStack.push(ativo);
      continue;
    }
    if (BLOCO_CLOSE_RE.test(text)) { blocoStack.pop(); continue; }
    if (MARCADOR_RE.test(text)) continue;
    if (blocoStack.length > 0 && !blocoStack[blocoStack.length - 1]) continue;
    filtered.push(removeParaShading(para));
  }

  // Reconstrói body preservando outros elementos (tabelas, sectPr)
  // substituindo cada <w:p> (na ordem original) pelo filtrado correspondente
  let filtIdx = 0;
  const rebuiltParts = [];
  for (const item of items) {
    if (item.type === "other") {
      rebuiltParts.push(item.xml);
    } else {
      // Emite placeholder; substituímos depois em ordem
      rebuiltParts.push(`\x00PARA${filtIdx++}\x00`);
    }
  }
  let fi = 0;
  const rebuiltBody = rebuiltParts.map(p => {
    if (p.startsWith("\x00PARA")) { return filtered[fi++] || ""; }
    return p;
  }).join("");

  // Substitui o interior do body no XML original — envelope intacto
  return xmlContent.replace(/(<w:body[^>]*>)([\s\S]*)(<\/w:body>)/,
    bodyOpen + rebuiltBody + bodyClose);
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

async function fetchDocx(url, base44) {
  // Usa o endpoint interno de proxy para evitar CORS no app publicado
  try {
    const result = await base44.asServiceRole.functions.invoke("fetchDocxTemplate", { url });
    const b64 = result?.base64 || result?.data?.base64;
    if (b64) {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
  } catch (_) {}
  // Fallback: fetch direto (funciona em ambiente local/dev)
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

    const { petitionId, templateId, modeloIA, formTokens, casoVigilanteId } = await req.json();
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

      // ── 3. Carrega dados do CasoVigilante (quando disponível) ────────────
      // O CasoVigilante tem os campos estruturados do formulário (RECL_NOME, RECL1_NOME,
      // jornada, salário, etc.) preenchidos pelo advogado — máxima confiança.
      const casoId = casoVigilanteId || formTokens?._casoVigilanteId;
      // ABORT GUARD: sem casoId E sem nome na Petition → aborta imediatamente
      if (!casoId && !petition.claimant_name?.trim()) {
        throw new Error("casoVigilanteId ausente e Petition sem claimant_name — abortando para evitar DOCX vazio");
      }
      let casoTokens = {};
      if (casoId) {
        try {
          const casos = await base44.asServiceRole.entities.CasoVigilante.filter({ id: casoId });
          const caso = casos?.[0];
          if (caso) {
            // Extrai todos os campos relevantes diretamente da entidade
            const CAMPOS_CASO = [
              "RECL_NOME","RECL_NACIONALIDADE","RECL_ESTADOCIVIL","RECL_RG","RECL_PIS",
              "RECL_SERIE","RECL_CTPS","RECL_CPF","RECL_NASC","RECL_FILIACAO","RECL_ENDERECO","RECL_CEP",
              "RECL1_NOME","RECL1_CNPJ","RECL1_LOGRADOURO","RECL1_ENDCOMPL",
              "RECL2_NOME","RECL2_CNPJ","RECL2_LOGRADOURO","RECL2_ENDCOMPL",
              "RECL3_NOME","RECL3_CNPJ","RECL3_LOGRADOURO","RECL3_ENDCOMPL",
              "COMARCA_UF","REGIAO_TRT","FORO_COMPETENCIA","LOCAL_PRESTACAO","LOCAL_PRESTACAO_COMPL",
              "DATA_ADMISSAO","FUNCAO","DATA_RESCISAO","SALARIO","JORNADA_HORARIO",
              "JORNADA_EXTRAPOLA","JORNADA_FREQ_EXTRA","INTERVALO_GOZADO","LOCAL_DATA_ASSINATURA",
              "CCT_VIGENCIA","ADIC_CONV","VAL_FT","VAL_CONDUCAO","VAL_ALIMENTACAO","VALOR_CAUSA",
            ];
            for (const k of CAMPOS_CASO) {
              if (caso[k] !== undefined && caso[k] !== null && caso[k] !== "") {
                casoTokens[k] = String(caso[k]);
              }
            }
            // Expande valores_pedidos (P01..P87)
            const vp = caso.valores_pedidos || {};
            for (let i = 1; i <= 87; i++) {
              const key = `P${String(i).padStart(2, "0")}`;
              if (vp[key]) casoTokens[key] = String(vp[key]);
            }
            // Flags de rescisão e teses (booleanas)
            const RESCISAO_FLAGS = ["t_dispensa","t_indireta","t_reversao","t_demissao","t_coacao"];
            for (const f of RESCISAO_FLAGS) {
              if (caso[f] !== undefined) casoTokens[f] = !!caso[f];
            }
            // Mapeia tipo_dispensa → flags de rescisão se ainda não houver flag direta
            if (!RESCISAO_FLAGS.some(f => casoTokens[f]) && caso.tipo_dispensa) {
              const MAP = {
                sem_justa_causa: "t_dispensa", rescisao_indireta: "t_indireta",
                nulidade_pedido_demissao: "t_coacao", reversao_justa_causa: "t_reversao",
              };
              const flag = MAP[caso.tipo_dispensa];
              if (flag) casoTokens[flag] = true;
            }
            // Jornada
            if (caso.jornada_12x36 !== undefined) casoTokens.jornada_12x36 = !!caso.jornada_12x36;
            if (caso.jornada_5x2 !== undefined)   casoTokens.jornada_5x2   = !!caso.jornada_5x2;
            // Flags opcionais
            const FLAGS_OPT = ["tem_subsidiaria","tem_desvio","tem_adic_noturno","tem_acumulo","tem_insalubridade","tem_periculosidade"];
            for (const f of FLAGS_OPT) {
              if (caso[f] !== undefined) casoTokens[f] = !!caso[f];
            }
            // Derivação determinística REGIAO_TRT dentro do casoTokens
            if (casoTokens.COMARCA_UF && !casoTokens.REGIAO_TRT) {
              const UF_TRT_INLINE = {
                SP: "SEGUNDA REGIÃO", RJ: "PRIMEIRA REGIÃO", MG: "TERCEIRA REGIÃO",
                RS: "QUARTA REGIÃO", BA: "QUINTA REGIÃO", CE: "SÉTIMA REGIÃO",
                PA: "OITAVA REGIÃO", AM: "OITAVA REGIÃO", PR: "NONA REGIÃO",
                DF: "DÉCIMA REGIÃO", SC: "DÉCIMA SEGUNDA REGIÃO", GO: "DÉCIMA OITAVA REGIÃO",
                PE: "SEXTA REGIÃO", ES: "DÉCIMA SÉTIMA REGIÃO", MS: "VIGÉSIMA QUARTA REGIÃO",
              };
              const ufM = casoTokens.COMARCA_UF.toUpperCase().match(/\b([A-Z]{2})$/);
              const uf2 = ufM?.[1];
              if (uf2 && UF_TRT_INLINE[uf2]) casoTokens.REGIAO_TRT = UF_TRT_INLINE[uf2];
            }
            console.log(`CasoVigilante ${casoId} carregado: ${Object.keys(casoTokens).length} tokens, REGIAO_TRT="${casoTokens.REGIAO_TRT || "(derivado depois)"}"`);
          }
        } catch (casoErr) {
          console.error("Erro ao carregar CasoVigilante:", casoErr.message);
        }
      }

      // ── 4. Monta tokens base a partir dos dados da Petition ───────────────
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

          const iaResp = await base44.asServiceRole.integrations.Core.InvokeLLM({
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
          let iaErrMsg;
          if (iaErr.response) {
            const data = iaErr.response.data;
            const dataStr = data
              ? (data.message || data.error || (typeof data === "string" ? data : JSON.stringify(data)))
              : "(sem corpo)";
            iaErrMsg = `HTTP ${iaErr.response.status}: ${dataStr} | original: ${iaErr.message}`;
          } else {
            iaErrMsg = `${iaErr.message}${iaErr.stack ? `\nStack: ${iaErr.stack.slice(0, 600)}` : ""}`;
          }
          console.error("IA falhou na extração de tokens:", iaErrMsg);
          await base44.asServiceRole.entities.ErrorLog.create({
            context: "generatePetitionDocx — IA tokens",
            error_type: "api",
            message: iaErrMsg,
            petition_id: petitionId,
            resolved: false,
            occurred_at: new Date().toISOString(),
          }).catch(() => {});
        }
      }

      // Merge com prioridade: casoTokens (entidade, máxima confiança)
      //   > formTokens (formulário revisado pelo advogado)
      //   > aiTokens (extração IA de documentos)
      //   > baseTokens (campos Petition — mínima confiança)
      const safeFormTokens = {};
      if (formTokens && typeof formTokens === "object") {
        for (const [k, v] of Object.entries(formTokens)) {
          if (k === "titulo" || k === "id" || k === "status" || k === "_casoVigilanteId") continue;
          if (typeof v === "boolean") { safeFormTokens[k] = v; continue; }
          if (v !== null && v !== undefined && v !== "") safeFormTokens[k] = String(v);
        }
      }
      const merged = { ...baseTokens, ...aiTokens, ...safeFormTokens, ...casoTokens };
      // Sanitiza strings longas (remove markdown, pipes, cabeçalhos)
      const finalTokens = {};
      for (const [k, v] of Object.entries(merged)) {
        finalTokens[k] = typeof v === "string" ? sanitizeTokenValue(v) : v;
      }

      // ── Derivação determinística REGIAO_TRT ──────────────────────────────
      // Se REGIAO_TRT estiver vazio mas COMARCA_UF tiver UF conhecida, preenche via tabela.
      if (finalTokens.COMARCA_UF && !finalTokens.REGIAO_TRT) {
        const UF_TRT_MAP = {
          SP: "SEGUNDA REGIÃO", RJ: "PRIMEIRA REGIÃO", MG: "TERCEIRA REGIÃO",
          RS: "QUARTA REGIÃO", BA: "QUINTA REGIÃO", CE: "SÉTIMA REGIÃO",
          PA: "OITAVA REGIÃO", AM: "OITAVA REGIÃO", PR: "NONA REGIÃO",
          DF: "DÉCIMA REGIÃO", SC: "DÉCIMA SEGUNDA REGIÃO", GO: "DÉCIMA OITAVA REGIÃO",
          PE: "SEXTA REGIÃO", ES: "DÉCIMA SÉTIMA REGIÃO", MS: "VIGÉSIMA QUARTA REGIÃO",
          AL: "DÉCIMA NONA REGIÃO", RN: "VIGÉSIMA PRIMEIRA REGIÃO", PI: "VIGÉSIMA SEGUNDA REGIÃO",
          MA: "DÉCIMA SEXTA REGIÃO", RO: "DÉCIMA QUARTA REGIÃO", AC: "DÉCIMA QUARTA REGIÃO",
          PB: "DÉCIMA TERCEIRA REGIÃO", SE: "VIGÉSIMA REGIÃO", AP: "OITAVA REGIÃO",
          TO: "VIGÉSIMA SÉTIMA REGIÃO",
        };
        const ufMatch = finalTokens.COMARCA_UF.toUpperCase().match(/\b([A-Z]{2})$/);
        const uf = ufMatch?.[1];
        if (uf && UF_TRT_MAP[uf]) {
          finalTokens.REGIAO_TRT = UF_TRT_MAP[uf];
          if (!finalTokens.FORO_COMPETENCIA) finalTokens.FORO_COMPETENCIA = finalTokens.COMARCA_UF;
        }
      }

      // ── 5. Valida tokens essenciais APÓS merge — guard definitivo ────────
      // Verifica RECL_NOME/RECL1_NOME/RECL1_CNPJ no finalTokens resultante.
      // Nunca entrega/salva DOCX se os campos essenciais estiverem vazios.
      const ESSENCIAIS_PRE = [
        { key: "RECL_NOME",  label: "Nome do reclamante" },
        { key: "RECL1_NOME", label: "Nome da 1ª reclamada" },
        { key: "RECL1_CNPJ", label: "CNPJ da 1ª reclamada" },
      ];
      const errosPre = ESSENCIAIS_PRE.filter(e => !String(finalTokens[e.key] || "").trim()).map(e => e.label);
      if (errosPre.length > 0) {
        // Diagnóstico detalhado: quais fontes tinham o campo, o que chegou
        const diag = {
          erros: errosPre,
          casoId: casoId || null,
          tinha_casoId: !!casoId,
          casoTokens_keys: Object.keys(casoTokens),
          formTokens_keys: Object.keys(safeFormTokens),
          RECL_NOME_sources: {
            casoTokens: casoTokens.RECL_NOME || null,
            formTokens: safeFormTokens.RECL_NOME || null,
            baseTokens: baseTokens.RECL_NOME || null,
            aiTokens: aiTokens.RECL_NOME || null,
          },
        };
        await base44.asServiceRole.entities.ErrorLog.create({
          context: "generatePetitionDocx — guard_tokens_vazios",
          error_type: "geracao",
          message: `Tokens essenciais vazios após merge: ${errosPre.join(", ")}. Diagnóstico: ${JSON.stringify(diag)}`,
          petition_id: petitionId,
          resolved: false,
          occurred_at: new Date().toISOString(),
        }).catch(() => {});
        throw new Error(`DOCX abortado — tokens essenciais vazios: ${errosPre.join(", ")}. casoId=${casoId || "N/A"} tinha_casoId=${!!casoId} casoTokens_keys=${Object.keys(casoTokens).length}`);
      }

      // ── 6. Baixa e preenche o modelo DOCX ───────────────────────────────
      // O logo e layout ficam no header nativo do .docx (igual ao Vigilante).
      // cleanupLog rastreia se a limpeza de instruções foi executada e se houve erro.
      const modelBuffer = await fetchDocx(modeloDocxUrl, base44);
      const cleanupLog = {};
      const { buffer: docxBuffer, tokensFaltando } = renderDocx(modelBuffer, finalTokens, cleanupLog);
      console.log(`Merge final: ${Object.keys(finalTokens).length} tokens, RECL_NOME="${finalTokens.RECL_NOME}", RECL1_NOME="${finalTokens.RECL1_NOME}"`);

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
      const { file_url: docxUrl } = await base44.asServiceRole.integrations.Core.UploadFile({ file: docxFile });

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
      // Monta mensagem detalhada: inclui corpo da resposta HTTP quando disponível
      let fatalMsg;
      if (fatalErr.response) {
        const data = fatalErr.response.data;
        const dataStr = data
          ? (data.message || data.error || (typeof data === "string" ? data : JSON.stringify(data)))
          : "(sem corpo)";
        fatalMsg = `HTTP ${fatalErr.response.status}: ${dataStr} | original: ${fatalErr.message}`;
      } else {
        fatalMsg = `${fatalErr.message}${fatalErr.stack ? `\nStack: ${fatalErr.stack.slice(0, 800)}` : ""}`;
      }
      console.error("Erro fatal generatePetitionDocx:", fatalMsg);

      try {
        await base44.asServiceRole.entities.ErrorLog.create({
          context: "generatePetitionDocx — fatal",
          error_type: "geracao",
          message: fatalMsg,
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