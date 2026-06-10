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

/**
 * Extrai texto puro de um nó XML <w:p> (parágrafo Word).
 * Concatena todos os <w:t> dentro do parágrafo.
 */
function extractParaText(paraXml) {
  const matches = paraXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  return matches.map(m => m.replace(/<[^>]+>/g, "")).join("").trim();
}

/**
 * Limpa o XML do document.xml de um DOCX tokenizado (porteiro/SINDEEPRES/SIEMACO).
 * Operações:
 *  1. Remove tudo desde o início até (e inclusive) o marcador "INÍCIO DA PEÇA".
 *  2. Remove parágrafos que contenham "NOTA" + "NÃO copiar" (faixas azuis de instrução).
 *  3. Remove parágrafos de marcação de bloco condicional NÃO aplicável ao caso
 *     e seus delimitadores, mantendo o conteúdo dos blocos aplicáveis.
 *
 * finalTokens é usado para decidir quais blocos condicionais estão ativos.
 * Se o modelo NÃO contiver "INÍCIO DA PEÇA", retorna o XML sem alteração (Vigilante).
 */
function cleanDocxXml(xmlContent, finalTokens) {
  // Divide em parágrafos preservando tudo mais (estilos, tabelas, etc.)
  // Usamos split em <w:p[ >] e reagrupamos para não quebrar estrutura.
  // Abordagem: trabalhar na string XML identificando blocos <w:p>...</w:p>.

  const INICIO_MARKER = /INÍCIO DA PEÇA/i;
  const NOTA_MARKER   = /NÃO\s+cop[i]?ar\s+para\s+a\s+pe[çc]/i;  // "NÃO copiar para a peça"
  // Marcadores de bloco condicional: "[SE ...]" ou "[FIM SE]" ou "[BLOCO ...]"
  const BLOCO_OPEN_RE  = /\[SE\s+/i;
  const BLOCO_CLOSE_RE = /\[FIM\s+SE\b|\[FIM\s+BLOCO\b/i;
  const BLOCO_ANY_RE   = /\[SE\s+|\[FIM\s+SE\b|\[FIM\s+BLOCO\b/i;

  // Se não tem marcador INÍCIO DA PEÇA, não é modelo tokenizado com instruções — retorna intacto
  if (!INICIO_MARKER.test(xmlContent)) return xmlContent;

  // Separa os parágrafos — cada item inclui o <w:p ...>...</w:p> completo
  const paraRE = /(<w:p[ >][\s\S]*?<\/w:p>)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = paraRE.exec(xmlContent)) !== null) {
    // Texto antes do primeiro parágrafo (namespace, body tag, etc.)
    if (match.index > lastIndex) {
      parts.push({ type: "raw", content: xmlContent.slice(lastIndex, match.index) });
    }
    parts.push({ type: "para", content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < xmlContent.length) {
    parts.push({ type: "raw", content: xmlContent.slice(lastIndex) });
  }

  // Fase 1: encontrar índice do parágrafo marcador "INÍCIO DA PEÇA"
  let inicioIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type === "para" && INICIO_MARKER.test(extractParaText(parts[i].content))) {
      inicioIdx = i;
      break;
    }
  }

  // Remover tudo até e inclusive o marcador
  const workParts = inicioIdx >= 0 ? parts.slice(inicioIdx + 1) : parts;

  // Fase 2 e 3: filtrar NOTAs e blocos condicionais não aplicáveis
  const result = [];
  let inBlocoAtivo = null;   // null = fora de bloco, true = bloco ativo, false = bloco inativo
  const blocoStack = [];     // suporte a blocos aninhados

  for (const part of workParts) {
    if (part.type === "raw") {
      result.push(part.content);
      continue;
    }

    const text = extractParaText(part.content);

    // Remove NOTAs (faixas azuis de instrução interna)
    if (NOTA_MARKER.test(text)) continue;
    // Remove linha com só "NOTA" seguida de número/texto de instrução
    if (/^NOTA\s*\d*[\s\-:]/i.test(text) && /NÃO|instrução|modelo|IA/i.test(text)) continue;

    // Detecta abertura de bloco condicional [SE TOKEN]
    if (BLOCO_OPEN_RE.test(text)) {
      // Extrai o nome do token de controle: [SE NOME_TOKEN] ou [SE NOME_TOKEN = valor]
      const tokenMatch = text.match(/\[SE\s+([A-Z_]+)\s*(?:=\s*["']?([^"'\]]+)["']?)?\]/i);
      let blocoAtivo = false;
      if (tokenMatch) {
        const tokenNome = tokenMatch[1].toUpperCase();
        const tokenValor = tokenMatch[2]?.trim().toLowerCase();
        const tokenData = finalTokens[tokenNome];
        if (tokenValor !== undefined) {
          // Compara valor
          blocoAtivo = String(tokenData || "").toLowerCase() === tokenValor;
        } else {
          // Só verifica se é truthy
          blocoAtivo = !!tokenData && tokenData !== "false" && tokenData !== "0" && tokenData !== "Não";
        }
      }
      blocoStack.push(blocoAtivo);
      inBlocoAtivo = blocoStack[blocoStack.length - 1];
      // Remove o parágrafo marcador em si
      continue;
    }

    // Detecta fechamento de bloco [FIM SE] / [FIM BLOCO]
    if (BLOCO_CLOSE_RE.test(text)) {
      blocoStack.pop();
      inBlocoAtivo = blocoStack.length > 0 ? blocoStack[blocoStack.length - 1] : null;
      // Remove o parágrafo marcador em si
      continue;
    }

    // Dentro de bloco inativo: descarta o parágrafo
    if (blocoStack.length > 0 && !inBlocoAtivo) continue;

    result.push(part.content);
  }

  return result.join("");
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
 * Antes da substituição, limpa instruções internas e blocos condicionais inaplicáveis.
 * Tokens ausentes → string vazia, nunca lança erro nem cria páginas extras.
 */
function renderDocx(buffer, tokens, cleanupLog) {
  const tokensFaltando = [];
  const zip = new PizZip(buffer);

  // Limpa o document.xml (remove seção de instruções, NOTAs e blocos inativos)
  // Preserva header.xml, footer.xml, styles.xml intactos — não toca no logo/rodapé.
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
    // Não interrompe — continua com o XML original
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
      // Sanitiza TODOS os valores para eliminar markdown cru e seções proibidas
      const finalTokens = sanitizeTokens({ ...baseTokens, ...aiTokens, ...safeFormTokens });

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