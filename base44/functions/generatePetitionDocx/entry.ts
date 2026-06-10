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

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Remove markdown cru dos valores de token antes de injetar no DOCX.
 * Proibido: pipes de tabela, backticks, linhas "---", cabeçalhos "#", seções extras após o fecho.
 */
function sanitizeTokenValue(val) {
  if (typeof val !== "string") return val;

  const lines = val.split("\n");
  const cleanLines = [];
  const FECHO_RE = /^(nestes termos|pede deferimento|e\.e\.d\.|termos em que|a\.e\.d\.|nesses termos)/i;
  const EXTRA_SECTION_RE = /^(memória de cálculo|anexo|nota técnica|rol de testemunhas|\[fim da peça|\[fim do documento)/i;

  let fechoFound = false;
  for (const line of lines) {
    const t = line.trim();

    // Parar ao encontrar seções proibidas pós-fecho
    if (fechoFound && EXTRA_SECTION_RE.test(t)) break;
    if (FECHO_RE.test(t)) fechoFound = true;

    // Remove linhas com markdown de tabela (pipe) ou cerca de código
    if (/^\|/.test(t)) continue;           // linhas de tabela markdown
    if (/^\s*\|/.test(t)) continue;        // idem com espaço
    if (/^`{1,3}/.test(t)) continue;       // cerca de código
    if (/^#{1,6}\s/.test(t)) continue;     // cabeçalhos markdown #
    if (/^[-]{3,}$/.test(t)) continue;     // linhas divisórias ---
    if (/^\[Fim/.test(t)) continue;        // [Fim da Peça...]
    if (/^NOTA TÉCNICA/i.test(t)) continue;

    cleanLines.push(line);
  }

  return cleanLines.join("\n").trim();
}

/**
 * Sanitiza todos os valores de um objeto de tokens.
 */
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
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Falha ao baixar modelo DOCX (${resp.status}): ${url}`);
  const ab = await resp.arrayBuffer();
  return new Uint8Array(ab);
}

/**
 * Substitui tokens {{CHAVE}} no docx e retorna buffer.
 * O logo e o layout de páginas ficam no HEADER NATIVO do .docx — igual ao Vigilante.
 * Tokens ausentes → string vazia, nunca lança erro nem cria páginas extras.
 */
function renderDocx(buffer, tokens) {
  const tokensFaltando = [];
  const zip = new PizZip(buffer);
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
  const out = doc.getZip().generate({
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
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { petitionId, templateId, modeloIA } = await req.json();
    if (!petitionId || !templateId) {
      return Response.json({ error: 'petitionId e templateId são obrigatórios' }, { status: 400 });
    }

    // Responde imediatamente — processa em background
    (async () => {
      const startTime = Date.now();

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
          const iaModel = modeloIA || cfg.modelo_ia || "claude_sonnet_4_6";

          const promptIA = `Você é um extrator de dados jurídicos. Analise os documentos do caso abaixo e retorne APENAS um JSON com dados CURTOS e OBJETIVOS extraídos.

DADOS JÁ PREENCHIDOS (não retorne estes):
${JSON.stringify(baseTokens, null, 2)}

${laudoAnalise ? `LAUDO:\n${laudoAnalise.slice(0, 3000)}\n\n` : ""}
${docTexts.length > 0 ? `DOCUMENTOS (texto):\n${docTexts.join("\n\n").slice(0, 6000)}\n\n` : ""}
${imageOrPdfUrls.length > 0 ? `${imageOrPdfUrls.length} arquivo(s) PDF/imagem em anexo — extraia APENAS dados estruturados.\n\n` : ""}

REGRAS ABSOLUTAS:
1. Retorne SOMENTE JSON puro, sem markdown, sem comentários.
2. Extraia APENAS valores CURTOS e OBJETIVOS: datas (ex: "04 de junho de 2012"), valores monetários (ex: "R$ 2.148,22"), horários (ex: "18:30 às 07:30"), nomes, CNPJs, endereços, cidades.
3. PROIBIDO retornar texto narrativo longo, parágrafos, fundamentação jurídica, ou qualquer texto com mais de 2 linhas num token.
4. NÃO transcreva nem descreva imagens (cartões de ponto, holerites) — extraia apenas os NÚMEROS/VALORES presentes nelas.
5. Tokens permitidos: DATA_ADMISSAO, DATA_RESCISAO, SALARIO, JORNADA_HORARIO, JORNADA_EXTRAPOLA, JORNADA_FREQ_EXTRA, INTERVALO_GOZADO, COMARCA_UF, FORO_COMPETENCIA, REGIAO_TRT, LOCAL_PRESTACAO, LOCAL_DATA_ASSINATURA, CCT_VIGENCIA, ADIC_CONV, VAL_FT, VAL_CONDUCAO, VAL_ALIMENTACAO, VALOR_CAUSA, RECL_SERIE, RECL_CEP, RECL_FILIACAO, RECL_ESTADOCIVIL, RECL2_NOME, RECL2_CNPJ, RECL2_LOGRADOURO, RECL3_NOME, RECL3_CNPJ, RECL3_LOGRADOURO, P01 até P87 (apenas valores monetários, ex: "R$ 21.482,20").
6. Para campos não encontrados nos documentos, NÃO inclua no JSON.
7. TIPO_RESCISAO deve ser um destes valores exatos: "dispensa_sem_justa_causa", "rescisao_indireta", "reversao_justa_causa", "pedido_demissao".`;

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

      // Merge: aiTokens sobrescreve baseTokens quando IA encontrou dado melhor
      // Sanitiza TODOS os valores para eliminar markdown cru e seções proibidas
      const finalTokens = sanitizeTokens({ ...baseTokens, ...aiTokens });

      // ── 5. Baixa e preenche o modelo DOCX ───────────────────────────────
      // O logo e layout ficam no header nativo do .docx (igual ao Vigilante).
      const modelBuffer = await fetchDocx(modeloDocxUrl);
      const { buffer: docxBuffer, tokensFaltando } = renderDocx(modelBuffer, finalTokens);

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
        await base44.asServiceRole.entities.GenerationLog.create({
          petition_id: petitionId,
          petition_title: petition.title,
          status: "concluido",
          model_used: "docxtemplater+" + (modeloIA || cfg.modelo_ia || "claude_sonnet_4_6"),
          template_id: templateId,
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          generated_at: new Date().toISOString(),
        });
      } catch (_) {}

      console.log(`Petição DOCX ${petitionId} gerada — status: ${finalStatus}, tokens faltando: ${tokensFaltando.length}`);

    })().catch(async (fatalErr) => {
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