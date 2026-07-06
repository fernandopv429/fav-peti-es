import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * auditarPeticao — Auditoria estruturada de petições iniciais trabalhistas
 * usando o Especialista #58 (auditor-iniciais-trabalhistas).
 *
 * Lê a Petition + documentos anexados + CCTs ativas + PetitionTemplates ativos
 * + CasoVigilante vinculado, invoca a IA com o prompt_sistema do Especialista 58
 * e um response_json_schema estruturado, grava o JSON em analise_documentos,
 * atualiza analise_status para "concluida" e registra no GenerationLog.
 *
 * NÃO altera o pipeline de geração determinística do Vigilante.
 */

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    classificacao: {
      type: "object",
      properties: {
        template_sugerido: { type: "string", description: "Nome exato do PetitionTemplate sugerido" },
        confianca: { type: "number", description: "Confiança de 0.0 a 1.0" },
        categoria: { type: "string", description: "Categoria profissional (vigilante, porteiro, limpeza, etc.)" },
        justificativa: { type: "string" },
      },
    },
    documentos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tipo: { type: "string" },
          presente: { type: "boolean" },
          periodo: { type: "string" },
          valores_extraidos: { type: "string" },
        },
      },
    },
    tokens: { type: "object", description: "Tokens {{TOKEN}} extraídos para o modelo" },
    valores_pedidos: { type: "object", description: "Valores P01-P87" },
    teses_incluidas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tese: { type: "string" },
          fundamento: { type: "string" },
          evidencia: { type: "string" },
        },
      },
    },
    teses_excluidas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tese: { type: "string" },
          motivo: { type: "string" },
        },
      },
    },
    inconsistencias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severidade: { type: "string", enum: ["BLOQUEANTE", "ATENCAO", "INFO"] },
          descricao: { type: "string" },
          campo: { type: "string" },
          sugestao: { type: "string" },
        },
      },
    },
    pendencias: { type: "array", items: { type: "string" } },
    valor_causa: { type: "string" },
    status_final: { type: "string", enum: ["bloqueado", "revisar", "aprovado"] },
    resumo_para_advogado: { type: "string" },
  },
  required: ["classificacao", "inconsistencias", "pendencias", "status_final", "resumo_para_advogado"],
};

function isVisualFile(url) {
  const lower = (url || "").toLowerCase().split("?")[0];
  return lower.endsWith(".pdf") || lower.endsWith(".png") || lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".gif");
}

Deno.serve(async (req) => {
  const startTime = Date.now();
  let petitionId = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    petitionId = body.petitionId;
    if (!petitionId) return Response.json({ error: 'petitionId é obrigatório' }, { status: 400 });

    // 1. Lê a Petition
    const petList = await base44.asServiceRole.entities.Petition.filter({ id: petitionId });
    const petition = petList[0];
    if (!petition) return Response.json({ error: 'Petição não encontrada' }, { status: 404 });

    const docUrls = petition.document_urls || [];
    const docNames = petition.document_names || [];

    if (docUrls.length === 0) {
      await base44.asServiceRole.entities.Petition.update(petitionId, { analise_status: "sem_documentos" });
      return Response.json({ error: 'Sem documentos para auditar' }, { status: 400 });
    }

    await base44.asServiceRole.entities.Petition.update(petitionId, { analise_status: "em_analise" });

    // 2. Carrega Especialista #58 (prompt_sistema)
    let promptSistema = "";
    let modeloEsp = "claude_sonnet_4_6";
    try {
      const especialistas = await base44.asServiceRole.entities.Especialista.filter({ numero: "58", ativo: true });
      const esp = especialistas[0];
      if (esp?.prompt_sistema) promptSistema = esp.prompt_sistema;
      if (esp?.modelo_ia === "sonnet") modeloEsp = "claude_sonnet_4_6";
      else if (esp?.modelo_ia) modeloEsp = esp.modelo_ia;
    } catch (_) {}

    // 3. Carrega PetitionConfig ativo (modelo_ia + threshold_confianca)
    let cfg = {};
    let threshold = 0.6;
    let modeloIA = modeloEsp;
    try {
      const configs = await base44.asServiceRole.entities.PetitionConfig.filter({ ativo: true });
      cfg = configs[0] || {};
      if (cfg.modelo_ia) modeloIA = cfg.modelo_ia;
      if (typeof cfg.threshold_confianca === "number") threshold = cfg.threshold_confianca;
    } catch (_) {}

    // 4. Carrega CCTs ativas (para cruzamento de pisos/adicionais)
    let cctContext = "Nenhuma CCT cadastrada.";
    try {
      const ccts = await base44.asServiceRole.entities.CCT.filter({ ativo: true });
      if (ccts.length > 0) {
        cctContext = ccts.map(c => {
          const pisos = c.pisos ? JSON.stringify(c.pisos).slice(0, 500) : "—";
          const adicionais = c.adicionais ? JSON.stringify(c.adicionais).slice(0, 500) : "—";
          return `• ${c.nome} (categoria: ${c.categoria}, vigência: ${c.vigencia_inicio || "?"} a ${c.vigencia_fim_economicas || "?"})\n  Pisos: ${pisos}\n  Adicionais: ${adicionais}\n  Cláusulas-chave: ${(c.clausulas_chave || "").slice(0, 400)}`;
        }).join("\n\n");
      }
    } catch (_) {}

    // 5. Carrega PetitionTemplates ativos (para classificação/seleção)
    let templateContext = "Nenhum modelo cadastrado.";
    try {
      const templates = await base44.asServiceRole.entities.PetitionTemplate.filter({ is_active: true });
      if (templates.length > 0) {
        templateContext = templates.map(t => {
          const tags = Array.isArray(t.tags) ? t.tags.join(", ") : "—";
          const temDocx = t.modelo_docx_url ? "SIM" : "NAO";
          return `• ${t.name} (id: ${t.id}, case_type: ${t.case_type}, tags: ${tags}, modelo_docx: ${temDocx})`;
        }).join("\n");
      }
    } catch (_) {}

    // 6. Carrega CasoVigilante vinculado (dados estruturados)
    let casoContext = "Nenhum CasoVigilante vinculado.";
    try {
      const casos = await base44.asServiceRole.entities.CasoVigilante.filter({ petition_id: petitionId });
      const caso = casos[0];
      if (caso) {
        const campos = [
          "RECL_NOME","RECL_CPF","RECL1_NOME","RECL1_CNPJ","RECL2_NOME","RECL2_CNPJ","RECL3_NOME",
          "DATA_ADMISSAO","DATA_RESCISAO","SALARIO","JORNADA_HORARIO","JORNADA_EXTRAPOLA",
          "JORNADA_FREQ_EXTRA","INTERVALO_GOZADO","VAL_FT","FT_QTD_MEDIA","COMARCA_UF","REGIAO_TRT",
          "DANO_SUPERVISOR","DANO_FATOS","tipo_dispensa","acumulo_funcao","tem_insalubridade",
          "tem_periculosidade","tem_adic_noturno","dano_sem_estrutura",
        ];
        const partes = campos.filter(k => caso[k] !== undefined && caso[k] !== null && caso[k] !== "")
          .map(k => `  ${k}: ${caso[k]}`);
        casoContext = partes.length > 0 ? partes.join("\n") : "CasoVigilante vinculado mas sem campos preenchidos.";
      }
    } catch (_) {}

    // 7. Processa documentos: visuais via file_urls, textos extraídos
    const fileUrlsParaIA = [];
    const textosDocs = [];
    for (let i = 0; i < docUrls.length; i++) {
      const url = docUrls[i];
      const name = docNames[i] || `Documento ${i + 1}`;
      if (isVisualFile(url)) {
        fileUrlsParaIA.push(url);
      } else {
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            const txt = (await resp.text()).slice(0, 6000).trim();
            if (txt) textosDocs.push(`=== ${name} ===\n${txt}`);
          }
        } catch (_) {}
      }
    }

    // 8. Monta contexto de dados da Petition
    const contextoCaso = [
      petition.title && `Título: ${petition.title}`,
      petition.claimant_name && `Reclamante: ${petition.claimant_name}`,
      petition.claimant_cpf && `CPF: ${petition.claimant_cpf}`,
      petition.claimant_role && `Função: ${petition.claimant_role}`,
      petition.defendant_name && `Reclamada: ${petition.defendant_name}`,
      petition.defendant_cnpj && `CNPJ: ${petition.defendant_cnpj}`,
      petition.contract_start && `Admissão: ${petition.contract_start}`,
      petition.contract_end && `Demissão: ${petition.contract_end}`,
      petition.salary && `Salário: R$ ${petition.salary}`,
      petition.work_schedule && `Jornada alegada: ${petition.work_schedule}`,
      petition.irregularities && `Irregularidades alegadas: ${petition.irregularities}`,
      petition.additional_facts && `Contexto adicional: ${petition.additional_facts}`,
      petition.jurisdiction && `Jurisdição: ${petition.jurisdiction}`,
    ].filter(Boolean).join("\n");

    const extraDef = Array.isArray(petition.extra_defendants) ? petition.extra_defendants : [];
    const extraDefTxt = extraDef.length > 0
      ? extraDef.map((d, i) => `  ${i + 2}ª Reclamada: ${d.name || "—"} (CNPJ: ${d.cnpj || "—"})`).join("\n")
      : "Nenhuma reclamada adicional.";

    // 9. Monta prompt final
    const promptFinal = `${promptSistema}

---

DADOS DA PETIÇÃO (Petition):
${contextoCaso}
Reclamadas adicionais:
${extraDefTxt}

DADOS ESTRUTURADOS DO CASO (CasoVigilante vinculado):
${casoContext}

CCTs APLICÁVEIS (para cruzamento de pisos, adicionais e cláusulas):
${cctContext}

MODELOS DISPONÍVEIS (PetitionTemplate ativos — use o NOME exato em classificacao.template_sugerido):
${templateContext}

THRESHOLD DE CONFIANÇA DO ESCRITÓRIO: ${threshold}. Acima deste valor, a seleção de template é automática; abaixo, exige revisão humana.

${textosDocs.length > 0 ? `CONTEÚDO EXTRAÍDO DOS DOCUMENTOS (texto):\n${textosDocs.join("\n\n")}` : ""}
${fileUrlsParaIA.length > 0 ? `\nDOCUMENTOS VISUAIS/PDF ANEXADOS: ${fileUrlsParaIA.length} arquivo(s) enviados para análise visual.` : ""}

---

INSTRUÇÃO FINAL:
Aplique TODO o seu método (classificação, leitura documental, extração de tokens, auditoria cruzada, gestão de teses) e devolva APENAS o JSON estruturado conforme o schema. Seja rigoroso: campo sem fonte documental = pendência, nunca valor inventado. Classifique cada inconsistência com severidade BLOQUEANTE, ATENCAO ou INFO. O status_final deve ser "bloqueado" se houver qualquer inconsistência BLOQUEANTE, "revisar" se houver apenas ATENCAO, ou "aprovado" se não houver inconsistências.`;

    // 10. Invoca a IA com response_json_schema
    const auditResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: promptFinal,
      model: modeloIA,
      file_urls: fileUrlsParaIA.length > 0 ? fileUrlsParaIA : undefined,
      response_json_schema: RESPONSE_SCHEMA,
    });

    // 11. Garante campos mínimos e deriva status_final das inconsistências
    const result = auditResult && typeof auditResult === "object" ? auditResult : {};
    if (!result.inconsistencias) result.inconsistencias = [];
    if (!result.pendencias) result.pendencias = [];
    if (!result.status_final) {
      const temBloqueante = (result.inconsistencias || []).some(i => i.severidade === "BLOQUEANTE");
      const temAtencao = (result.inconsistencias || []).some(i => i.severidade === "ATENCAO");
      result.status_final = temBloqueante ? "bloqueado" : (temAtencao ? "revisar" : "aprovado");
    }
    result.auditoria_em = new Date().toISOString();
    result.threshold_confianca = threshold;

    // 12. Grava JSON em analise_documentos e atualiza analise_status
    await base44.asServiceRole.entities.Petition.update(petitionId, {
      analise_documentos: JSON.stringify(result),
      analise_status: "concluida",
    });

    // 13. Registra no GenerationLog
    const duration = Math.round((Date.now() - startTime) / 1000);
    try {
      await base44.asServiceRole.entities.GenerationLog.create({
        petition_id: petitionId,
        petition_title: petition.title || "",
        status: "concluido",
        model_used: `auditoria_esp58_${modeloIA}`,
        duration_seconds: duration,
        generated_at: new Date().toISOString(),
        generated_by: user.email || "",
      });
    } catch (_) {}

    return Response.json(result);

  } catch (error) {
    // Registra erro e reseta status
    if (petitionId) {
      try {
        const fb = createClientFromRequest(req);
        await fb.asServiceRole.entities.Petition.update(petitionId, { analise_status: "pendente" });
      } catch (_) {}
      try {
        const fb2 = createClientFromRequest(req);
        await fb2.asServiceRole.entities.GenerationLog.create({
          petition_id: petitionId,
          status: "erro",
          model_used: "auditoria_esp58",
          error_message: error.message,
          generated_at: new Date().toISOString(),
        });
      } catch (_) {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});