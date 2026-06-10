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
import ImageModule from 'npm:docxtemplater-image-module-free@1.1.1';

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
 * Baixa uma URL e retorna ArrayBuffer. Funciona com URLs remotas.
 */
async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch (_) {
    return null;
  }
}

/**
 * Substitui tokens {{CHAVE}} no docx e retorna buffer.
 * Suporta token especial {{LOGO_IMG}} para embutir imagem do logo.
 * tokens: objeto { CHAVE: valor, ... }
 * Tokens ausentes → string vazia, nunca lança erro.
 */
async function renderDocx(buffer, tokens, logoBuffer) {
  const tokensFaltando = [];
  const zip = new PizZip(buffer);

  // Módulo de imagem para o token {{LOGO_IMG}} — se o modelo o utilizar
  const opts = {
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
  };

  if (logoBuffer) {
    try {
      opts.modules = [new ImageModule({
        centered: true,
        fileType: "docx",
        getImage: (tagValue) => {
          // Retorna o buffer do logo para o token LOGO_IMG
          if (tagValue === "LOGO_IMG") return logoBuffer;
          return null;
        },
        getSize: () => [200, 60], // largura x altura em px (aprox 7cm × 2cm)
      })];
    } catch (_) {
      // ImageModule não disponível — continua sem módulo de imagem
    }
  }

  const doc = new Docxtemplater(zip, opts);

  // Injeta logo como dado de imagem se o token existir no modelo
  const renderData = { ...tokens };
  if (logoBuffer) renderData["LOGO_IMG"] = "LOGO_IMG";

  doc.render(renderData);
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

      // ── 4. Usa IA para extrair tokens adicionais dos documentos ──────────
      let aiTokens = {};
      try {
        const iaModel = modeloIA || cfg.modelo_ia || "claude_sonnet_4_6";
        const tokenList = Object.keys(baseTokens).join(", ");

        let promptIA = `Você é um assistente jurídico. Analise os documentos do caso trabalhista abaixo e preencha APENAS os tokens JSON para o modelo de petição.

DADOS JÁ PREENCHIDOS (não repita estes):
${JSON.stringify(baseTokens, null, 2)}

${laudoAnalise ? `LAUDO DE ANÁLISE DOS DOCUMENTOS:\n${laudoAnalise}\n\n` : ""}
${docTexts.length > 0 ? `CONTEÚDO DOS DOCUMENTOS (texto):\n${docTexts.join("\n\n")}\n\n` : ""}
${imageOrPdfUrls.length > 0 ? `${imageOrPdfUrls.length} arquivo(s) PDF/imagem em anexo — analise-os.\n\n` : ""}

REGRAS ABSOLUTAS — VIOLAÇÃO INVALIDA O DOCUMENTO:
1. Retorne SOMENTE um objeto JSON puro. Sem markdown, sem comentários, sem texto fora do JSON.
2. Para tokens de texto livre (narrativas, fundamentação, pedidos), o valor deve ser TEXTO PURO — proibido qualquer pipe (|), backtick (\`), cercar de código, cabeçalho Markdown (#), tabela markdown ou lista com traço (---).
3. A peça termina no fecho/assinatura previsto no modelo. PROIBIDO incluir, em qualquer token: "Memória de Cálculo", "ANEXO III", "Rol de Testemunhas", "Nota Técnica", "[Fim da Peça]" ou qualquer seção que não exista no modelo original.
4. Material de apoio (memória de cálculo, notas técnicas, rol expandido de testemunhas) NÃO vai em nenhum token — será salvo separadamente.
5. Extraia dos documentos os valores faltantes: DATA_ADMISSAO (da CTPS), DATA_RESCISAO e tipo de rescisão (do TRCT/entrevista), SALARIO (do holerite), JORNADA_HORARIO (dos cartões de ponto), COMARCA_UF/FORO_COMPETENCIA (da entrevista).
6. Inclua tokens específicos do modelo (ex: CCT_VIGENCIA, ADIC_CONV, VALOR_CAUSA, LOCAL_DATA_ASSINATURA, REGIAO_TRT) se identificados.
7. Para reclamadas extras identificadas na entrevista e não cobertas pelos dados base, preencha RECL2_* ou RECL3_*.
8. Para campos não encontrados, NÃO inclua no JSON.`;

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
        // Continua sem tokens da IA — os tokens base ainda serão usados
      }

      // Merge: aiTokens sobrescreve baseTokens quando IA encontrou dado melhor
      // Sanitiza TODOS os valores para eliminar markdown cru e seções proibidas
      const finalTokens = sanitizeTokens({ ...baseTokens, ...aiTokens });

      // ── 5. Baixa modelo e logo em paralelo ───────────────────────────────
      const [modelBuffer, logoBuffer] = await Promise.all([
        fetchDocx(modeloDocxUrl),
        fetchImageBuffer(cfg.logo_url || ""),
      ]);

      const { buffer: docxBuffer, tokensFaltando } = await renderDocx(modelBuffer, finalTokens, logoBuffer);

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