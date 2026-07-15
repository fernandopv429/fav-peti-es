/**
 * gerarPeticaoDireta — geração DOCX 100% determinística, SEM IA.
 *
 * Recebe TODOS os tokens estruturados do caso diretamente no body do POST,
 * baixa o modelo .docx, substitui via docxtemplater, valida e salva na Petition.
 *
 * Pipeline:
 *   1. Valida payload (templateId OU template_docx_url + tokens mínimos)
 *   2. Baixa modelo .docx
 *   3. Limpa XML (remove instruções, blocos inativos, shading)
 *   4. Substitui tokens {{CHAVE}} via docxtemplater
 *   5. Valida artefatos proibidos e tokens essenciais
 *   6. Faz upload do DOCX gerado
 *   7. Cria/atualiza Petition + CasoVigilante (se informado)
 *   8. Retorna URL do DOCX + status
 *
 * NENHUMA chamada de IA é feita — máxima velocidade e previsibilidade.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';
import PizZip from 'npm:pizzip@3.2.0';
import Docxtemplater from 'npm:docxtemplater@3.68.7';

// ── helpers de limpeza (inline — sem imports locais no Deno) ──────────────

function extractParaText(paraXml) {
  const matches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  return matches.map(m => m.replace(/<[^>]+>/g, "")).join("").trim();
}

function removeParaShading(paraXml) {
  let c = paraXml.replace(/<w:shd[^>]*\/>/g, "");
  c = c.replace(/<w:shd[^>]*>[\s\S]*?<\/w:shd>/g, "");
  c = c.replace(/<w:highlight[^>]*\/>/g, "");
  c = c.replace(/<w:highlight[^>]*>[\s\S]*?<\/w:highlight>/g, "");
  return c;
}

function cleanDocxXml(xmlContent, finalTokens) {
  const INICIO_MARKER  = /INÍCIO DA PEÇA/i;
  const BLOCO_OPEN_RE  = /^\s*▸\s*\[SE\s+/i;
  const BLOCO_CLOSE_RE = /^\s*▸\s*\[FIM\s+(SE|BLOCO)/i;
  const MARCADOR_RE    = /^\s*▸/;
  const NOTA_RE        = /^\s*ℹ/;
  const NAO_COPIAR_RE  = /NÃO\s+cop[i]?ar\s+para\s+a\s+pe[çc]/i;

  if (!INICIO_MARKER.test(xmlContent)) return xmlContent;

  const bodyMatch = xmlContent.match(/(<w:body[^>]*>)([\s\S]*)(<\/w:body>)/);
  if (!bodyMatch) return xmlContent;

  const bodyOpen    = bodyMatch[1];
  const bodyContent = bodyMatch[2];
  const bodyClose   = bodyMatch[3];

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

  const paraXmls = items.filter(i => i.type === "para").map(i => i.xml);

  let startIdx = 0;
  for (let i = 0; i < paraXmls.length; i++) {
    if (INICIO_MARKER.test(extractParaText(paraXmls[i]))) { startIdx = i + 1; break; }
  }
  const workParas = startIdx > 0 ? paraXmls.slice(startIdx) : paraXmls;

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

  let filtIdx = 0;
  const rebuiltParts = [];
  for (const item of items) {
    if (item.type === "other") {
      rebuiltParts.push(item.xml);
    } else {
      rebuiltParts.push(`\x00PARA${filtIdx++}\x00`);
    }
  }
  let fi = 0;
  const rebuiltBody = rebuiltParts.map(p => {
    if (p.startsWith("\x00PARA")) { return filtered[fi++] || ""; }
    return p;
  }).join("");

  return xmlContent.replace(/(<w:body[^>]*>)([\s\S]*)(<\/w:body>)/,
    bodyOpen + rebuiltBody + bodyClose);
}

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

async function fetchDocx(url, base44) {
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
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao baixar modelo DOCX (${resp.status}): ${url}`);
  const ab = await resp.arrayBuffer();
  return new Uint8Array(ab);
}

function renderDocx(buffer, tokens) {
  const tokensFaltando = [];
  const zip = new PizZip(buffer);

  try {
    const docXmlKey = "word/document.xml";
    const original = zip.file(docXmlKey)?.asText();
    if (original) {
      const cleaned = cleanDocxXml(original, tokens);
      zip.file(docXmlKey, cleaned);
    }
  } catch (_) {}

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

// ── sanitização de tokens recebidos via POST ──────────────────────────────

const INVALIDOS = new Set([
  "SIM","NÃO","NAO","N/A","NÃO INFORMADO","NAO INFORMADO",
  "NÃO SE APLICA","NAO SE APLICA","HABITUAL","FREQUENTE","NÃO TEM","NAO TEM",
]);

const VALOR_TOKENS = new Set([
  "VAL_FT","VAL_CONDUCAO","VAL_ALIMENTACAO","SALARIO","VALOR_CAUSA",
]);

function normalizePostedTokens(rawTokens) {
  const out = {};
  if (!rawTokens || typeof rawTokens !== "object") return out;
  for (const [k, v] of Object.entries(rawTokens)) {
    // Ignora chaves internas
    if (["titulo","id","status","_casoVigilanteId","petition_id","created_date","updated_date","created_by_id"].includes(k)) continue;
    if (typeof v === "boolean") { out[k] = v; continue; }
    if (v === null || v === undefined || v === "") continue;
    const s = String(v).trim();
    if (!s) continue;
    // Regra: "Sim"/"Não"/"N/A" nunca são injetados literalmente
    if (INVALIDOS.has(s.toUpperCase())) continue;
    // Tokens de valor: exigem dígito
    if (VALOR_TOKENS.has(k) && !/\d/.test(s)) continue;
    out[k] = sanitizeTokenValue(s);
  }
  return out;
}

// ── main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    // ── Autenticação dupla ─────────────────────────────────────────────
    // 1) API key externa (header x-api-key) → usa service role
    // 2) Token do usuário logado (createClientFromRequest) → app interno
    const apiKey = req.headers.get("x-api-key");
    const expectedKey = Deno.env.get("API_KEY_EXTERNA");
    let base44;

    if (apiKey && expectedKey && apiKey === expectedKey) {
      // Chamada externa autenticada por API key — service role
      base44 = createClientFromRequest(req);
    } else if (apiKey && (!expectedKey || apiKey !== expectedKey)) {
      return Response.json({ error: "API key inválida" }, { status: 401 });
    } else {
      // Sem API key — exige token do usuário (app interno)
      base44 = createClientFromRequest(req);
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // ── Campos do payload ──────────────────────────────────────────────
    // Obrigatórios: templateId OU template_docx_url + tokens (com RECL_NOME, RECL1_NOME, RECL1_CNPJ)
    // Opcionais: petitionId, casoVigilanteId, salvar_petition, salvar_caso, titulo_peticao
    const {
      templateId,
      template_docx_url,
      template_name,
      tokens: rawTokens = {},
      petitionId,
      casoVigilanteId,
      salvar_petition = true,
      salvar_caso = false,
      titulo_peticao,
    } = body;

    // ── Validações de entrada ──────────────────────────────────────────
    if (!templateId && !template_docx_url) {
      return Response.json(
        { error: "Informe templateId ou template_docx_url" },
        { status: 400 }
      );
    }

    const tokens = normalizePostedTokens(rawTokens);

    // Guard: tokens essenciais obrigatórios
    const essenciais = [
      { key: "RECL_NOME",  label: "Nome do reclamante" },
      { key: "RECL1_NOME", label: "Nome da 1ª reclamada" },
      { key: "RECL1_CNPJ", label: "CNPJ da 1ª reclamada" },
    ];
    const faltam = essenciais.filter(e => !String(tokens[e.key] || "").trim());
    if (faltam.length > 0) {
      return Response.json(
        { error: `Tokens essenciais ausentes: ${faltam.map(f => f.label).join(", ")}`, tokens_recebidos: Object.keys(tokens) },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // ── 1. Resolve a URL do modelo DOCX ────────────────────────────────
    let modeloDocxUrl = template_docx_url;
    let template = null;
    let resolvedTemplateId = templateId;

    if (!modeloDocxUrl && templateId) {
      const tmplList = await base44.asServiceRole.entities.PetitionTemplate.filter({ id: templateId });
      template = tmplList[0];
      if (!template) {
        return Response.json({ error: `Template ${templateId} não encontrado` }, { status: 404 });
      }
      modeloDocxUrl = template.modelo_docx_url;
      if (!modeloDocxUrl) {
        return Response.json(
          { error: `Template "${template.name}" não possui modelo_docx_url` },
          { status: 400 }
        );
      }
    }

    // ── 2. Derivação determinística: REGIAO_TRT ────────────────────────
    if (tokens.COMARCA_UF && !tokens.REGIAO_TRT) {
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
      const ufMatch = String(tokens.COMARCA_UF).toUpperCase().match(/\b([A-Z]{2})$/);
      const uf = ufMatch?.[1];
      if (uf && UF_TRT_MAP[uf]) {
        tokens.REGIAO_TRT = UF_TRT_MAP[uf];
        if (!tokens.FORO_COMPETENCIA) tokens.FORO_COMPETENCIA = tokens.COMARCA_UF;
      }
    }

    // ── 3. Deriva flags de rescisão a partir de tipo_dispensa ──────────
    if (tokens.tipo_dispensa && !tokens.t_dispensa && !tokens.t_indireta && !tokens.t_coacao && !tokens.t_reversao) {
      const MAP = {
        sem_justa_causa: "t_dispensa",
        rescisao_indireta: "t_indireta",
        nulidade_pedido_demissao: "t_coacao",
        reversao_justa_causa: "t_reversao",
      };
      const flag = MAP[tokens.tipo_dispensa];
      if (flag) tokens[flag] = true;
    }

    // ── 4. Deriva tem_dano_moral e tem_desvio ──────────────────────────
    if (tokens.tem_dano_moral === undefined) {
      tokens.tem_dano_moral = !!(tokens.DANO_FATOS || tokens.DANO_SUPERVISOR || tokens.dano_sem_estrutura);
    }
    if (tokens.acumulo_funcao && !tokens.tem_desvio && !tokens.tem_acumulo) {
      tokens.tem_desvio = true;
      tokens.tem_acumulo = true;
    }

    // ── 5. Sanitiza strings finais ─────────────────────────────────────
    const finalTokens = sanitizeTokens(tokens);

    // ── 6. Baixa e preenche o modelo DOCX ──────────────────────────────
    const modelBuffer = await fetchDocx(modeloDocxUrl, base44);
    const { buffer: docxBuffer, tokensFaltando } = renderDocx(modelBuffer, finalTokens);

    // ── 7. Upload do DOCX ──────────────────────────────────────────────
    const nomeReclamante = (finalTokens.RECL_NOME || "peticao").replace(/\s+/g, "_");
    const nomeReclamada = (finalTokens.RECL1_NOME || "").replace(/\s+/g, "_").slice(0, 30);
    const nomeTemplate = (template_name || template?.name || "modelo").replace(/\s+/g, "_").slice(0, 30);
    const nomeArquivo = `${nomeReclamante}_${nomeReclamada}_${nomeTemplate}.docx`;

    const docxBlob = new Blob([docxBuffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const docxFile = new File([docxBlob], nomeArquivo, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const { file_url: docxUrl } = await base44.asServiceRole.integrations.Core.UploadFile({ file: docxFile });

    // ── 8. Validações para status final ────────────────────────────────
    const pendencias = [];
    if (!finalTokens.COMARCA_UF) pendencias.push("COMARCA_UF não preenchida");
    if (!finalTokens.REGIAO_TRT) pendencias.push("REGIAO_TRT não preenchida");
    const hasDispensa = finalTokens.tipo_dispensa || finalTokens.t_dispensa || finalTokens.t_indireta || finalTokens.t_coacao || finalTokens.t_reversao;
    if (!hasDispensa) pendencias.push("Modalidade de dispensa não enquadrada");
    if (finalTokens.VAL_FT && !/R\$|\d/.test(String(finalTokens.VAL_FT))) {
      pendencias.push("VAL_FT não é valor monetário válido");
    }
    if ((finalTokens.tem_ft || finalTokens.VAL_FT) && !finalTokens.FT_QTD_MEDIA) {
      pendencias.push("FT_QTD_MEDIA não informada");
    }
    const finalStatus = (tokensFaltando.length > 0 || pendencias.length > 0)
      ? "revisao_necessaria"
      : "concluida";

    // ── 9. Salva na Petition (se solicitado) ───────────────────────────
    let resolvedPetitionId = petitionId;
    if (salvar_petition) {
      const titulo = titulo_peticao ||
        `${finalTokens.RECL_NOME || "Reclamante"} × ${finalTokens.RECL1_NOME || "Reclamada"} — ${new Date().toLocaleDateString("pt-BR")}`;

      const petitionPayload = {
        title: titulo,
        case_type: "trabalhista",
        claimant_name: finalTokens.RECL_NOME || "—",
        claimant_cpf: finalTokens.RECL_CPF || "",
        claimant_rg: finalTokens.RECL_RG || "",
        claimant_pis: finalTokens.RECL_PIS || "",
        claimant_ctps: finalTokens.RECL_CTPS || "",
        claimant_address: finalTokens.RECL_ENDERECO || "",
        claimant_role: finalTokens.FUNCAO || "",
        defendant_name: finalTokens.RECL1_NOME || "—",
        defendant_cnpj: finalTokens.RECL1_CNPJ || "",
        defendant_address: finalTokens.RECL1_LOGRADOURO || finalTokens.RECL1_ENDCOMPL || "",
        status: finalStatus,
        document_urls: [docxUrl],
        document_names: [nomeArquivo],
        template_used: template_name || template?.name || resolvedTemplateId || "direto",
        ...(pendencias.length > 0
          ? { additional_facts: "Pendências de validação: " + pendencias.join("; ") }
          : {}),
      };

      // Reclamadas adicionais (2ª e 3ª)
      const extras = [];
      if (finalTokens.RECL2_NOME) {
        extras.push({
          name: finalTokens.RECL2_NOME,
          cnpj: finalTokens.RECL2_CNPJ || "",
          address: finalTokens.RECL2_LOGRADOURO || finalTokens.RECL2_ENDCOMPL || "",
        });
      }
      if (finalTokens.RECL3_NOME) {
        extras.push({
          name: finalTokens.RECL3_NOME,
          cnpj: finalTokens.RECL3_CNPJ || "",
          address: finalTokens.RECL3_LOGRADOURO || finalTokens.RECL3_ENDCOMPL || "",
        });
      }
      if (extras.length > 0) petitionPayload.extra_defendants = extras;

      if (resolvedPetitionId) {
        // Atualiza petição existente — anexa o novo DOCX
        const existing = await base44.asServiceRole.entities.Petition.filter({ id: resolvedPetitionId });
        const pet = existing[0];
        if (pet) {
          const existingUrls = Array.isArray(pet.document_urls) ? pet.document_urls : [];
          const existingNames = Array.isArray(pet.document_names) ? pet.document_names : [];
          await base44.asServiceRole.entities.Petition.update(resolvedPetitionId, {
            ...petitionPayload,
            document_urls: [...existingUrls, docxUrl],
            document_names: [...existingNames, nomeArquivo],
          });
        } else {
          const criada = await base44.asServiceRole.entities.Petition.create(petitionPayload);
          resolvedPetitionId = criada.id;
        }
      } else {
        const criada = await base44.asServiceRole.entities.Petition.create(petitionPayload);
        resolvedPetitionId = criada.id;
      }
    }

    // ── 10. Vincula no CasoVigilante (se solicitado) ───────────────────
    if (salvar_caso && casoVigilanteId && resolvedPetitionId) {
      try {
        await base44.asServiceRole.entities.CasoVigilante.update(casoVigilanteId, {
          petition_id: resolvedPetitionId,
          status: "gerado",
        });
      } catch (_) {}
    }

    // ── 11. Incrementa use_count do template ───────────────────────────
    if (resolvedTemplateId) {
      try {
        const t = template || (await base44.asServiceRole.entities.PetitionTemplate.filter({ id: resolvedTemplateId }))[0];
        if (t) {
          await base44.asServiceRole.entities.PetitionTemplate.update(resolvedTemplateId, {
            use_count: (t.use_count || 0) + 1,
          });
        }
      } catch (_) {}
    }

    // ── 12. GenerationLog ──────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.GenerationLog.create({
        petition_id: resolvedPetitionId || "",
        petition_title: titulo_peticao || finalTokens.RECL_NOME || "direto",
        status: "concluido",
        model_used: "gerarPeticaoDireta (sem IA)",
        template_id: resolvedTemplateId || "",
        duration_seconds: Math.round((Date.now() - startTime) / 1000),
        generated_at: new Date().toISOString(),
      });
    } catch (_) {}

    return Response.json({
      ok: true,
      pipeline: "direto_sem_ia",
      petition_id: resolvedPetitionId || null,
      docx_url: docxUrl,
      docx_name: nomeArquivo,
      status: finalStatus,
      tokens_usados: Object.keys(finalTokens).length,
      tokens_faltando: tokensFaltando,
      pendencias: pendencias,
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
    });

  } catch (error) {
    // Loga erro fatal
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.ErrorLog.create({
        context: "gerarPeticaoDireta — fatal",
        error_type: "geracao",
        message: error.message + (error.stack ? `\nStack: ${error.stack.slice(0, 800)}` : ""),
        resolved: false,
        occurred_at: new Date().toISOString(),
      }).catch(() => {});
    } catch (_) {}

    return Response.json(
      { error: error.message, pipeline: "direto_sem_ia" },
      { status: 500 }
    );
  }
});