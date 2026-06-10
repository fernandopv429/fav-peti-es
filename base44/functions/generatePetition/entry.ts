import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Autenticação via createClientFromRequest já garante o contexto do usuário

    const { petitionId, aiPrompt, templateParts, templateContent, templateName, templateId, modeloIA, petitionConfig } = await req.json();
    if (!petitionId || !templateParts) {
      return Response.json({ error: 'petitionId e templateParts são obrigatórios' }, { status: 400 });
    }

    // Responde imediatamente — processa em background
    (async () => {
      const startTime = Date.now();

      const assemblePetition = (parts, aiResponse, tmplContent) => {
        if (tmplContent && tmplContent.trim().length >= 50 && aiResponse) {
          return aiResponse.trim();
        }
        let narrativa = "";
        let fundamentacao = "";
        if (aiResponse) {
          const split = aiResponse.split(/---FUNDAMENTACAO---/i);
          narrativa = split[0]?.trim() || "";
          fundamentacao = split[1]?.trim() || "";
        }
        return `${parts.qualificacao}

──────────────────────────────────────────────────────────────

I – DOS FATOS

${narrativa || "[A PREENCHER: narrativa dos fatos]"}

──────────────────────────────────────────────────────────────

II – DO CONTRATO DE TRABALHO

${parts.contrato}

──────────────────────────────────────────────────────────────

III – DO DIREITO

${fundamentacao || "[A PREENCHER: fundamentação jurídica]"}

──────────────────────────────────────────────────────────────

IV – DOS PEDIDOS

${parts.requerimentos}

──────────────────────────────────────────────────────────────

V – DOS CÁLCULOS

${parts.calculos}

──────────────────────────────────────────────────────────────

VI – DO VALOR DA CAUSA

${parts.valor_causa}

──────────────────────────────────────────────────────────────

${parts.beneficios ? `VII – DA JUSTIÇA GRATUITA / JUÍZO DIGITAL\n\n${parts.beneficios}\n\n──────────────────────────────────────────────────────────────\n\n` : ""}${parts.fecho}`;
      };

      // ── Lê a petição + PetitionConfig ativo no backend ──────────────────
      let docFileUrls = [];
      let docNames = [];
      let laudoAnalise = "";
      let extraDefendants = [];
      let petitionData = null;
      // Lê config ativo do backend — NÃO depende do petitionConfig passado pelo frontend
      let cfgAtivo = petitionConfig || {};
      try {
        const cfgList = await base44.asServiceRole.entities.PetitionConfig.filter({ ativo: true });
        if (cfgList[0]) cfgAtivo = cfgList[0];
      } catch (_) {}

      try {
        const petList = await base44.asServiceRole.entities.Petition.filter({ id: petitionId });
        const pet = petList[0];
        if (pet) {
          petitionData = pet;
          if (Array.isArray(pet.document_urls) && pet.document_urls.length > 0) {
            docFileUrls = pet.document_urls;
            docNames = pet.document_names || pet.document_urls.map((_, i) => `Documento ${i + 1}`);
          }
          // Injeta laudo de análise caso já exista e esteja concluído
          if (pet.analise_documentos && pet.analise_status === "concluida") {
            laudoAnalise = pet.analise_documentos;
          }
          // Recupera reclamadas extras salvas na entidade
          if (Array.isArray(pet.extra_defendants) && pet.extra_defendants.length > 0) {
            extraDefendants = pet.extra_defendants;
          }
        }
      } catch (_) {}

      // ── Processa documentos ─────────────────────────────────────────────
      const docTexts = [];
      const imageOrPdfUrls = [];
      const docsNaoLidos = [];

      for (let i = 0; i < docFileUrls.length; i++) {
        const url = docFileUrls[i];
        const name = docNames[i] || `Documento ${i + 1}`;
        const lower = url.toLowerCase().split("?")[0];
        const isVisual = lower.endsWith(".pdf") || lower.endsWith(".png") ||
          lower.endsWith(".jpg") || lower.endsWith(".jpeg") ||
          lower.endsWith(".webp") || lower.endsWith(".gif");

        if (isVisual) {
          imageOrPdfUrls.push(url);
        } else {
          try {
            const resp = await fetch(url, { headers: { Accept: "text/plain, text/html, */*" } });
            if (resp.ok) {
              const text = await resp.text();
              const snippet = text.slice(0, 8000).trim();
              if (snippet) docTexts.push(`=== ${name} ===\n${snippet}`);
              else docsNaoLidos.push(name);
            } else {
              docsNaoLidos.push(name);
            }
          } catch (_) {
            docsNaoLidos.push(name);
          }
        }
      }

      // ── Monta prompt final ────────────────────────────────────────────────
      let finalPrompt = aiPrompt || "";

      // ── INSTRUÇÕES OBRIGATÓRIAS — EXTRAÇÃO DE DADOS DOS DOCUMENTOS ───────
      finalPrompt += `\n\n${"═".repeat(60)}\nINSTRUÇÕES OBRIGATÓRIAS DE EXTRAÇÃO — LEIA ANTES DE REDIGIR:\n${"═".repeat(60)}\n
A. DATA DE ADMISSÃO: leia a CTPS (Carteira de Trabalho) ou contrato de trabalho nos documentos anexados e use a data de admissão real encontrada. Só use "[A PREENCHER: data de admissão]" se a CTPS/contrato não estiver entre os documentos.

B. MODALIDADE E DATA DE RESCISÃO: leia o documento de entrevista/relato do reclamante e o TRCT/Termo de Rescisão nos documentos. Use a modalidade de rescisão expressa (ex.: rescisão indireta, sem justa causa, pedido de demissão) e a data de parada/rescisão real que constar nesses documentos. Só use "[A PREENCHER]" se o dado realmente não constar de nenhum documento.

C. RECLAMADAS: leia o documento de entrevista/relato para identificar TODAS as empresas envolvidas (empregadora e tomadoras de serviço). Se houver 2ª ou 3ª reclamada tomadora de serviço, inclua-as na qualificação das partes COM SEUS DADOS (nome, CNPJ, endereço conforme constarem dos documentos ou do campo extra_defendants abaixo). NUNCA omita reclamadas listadas na entrevista.

D. RESPONSABILIDADE SUBSIDIÁRIA: se houver tomadora(s) de serviço (2ª reclamada em diante), INCLUA OBRIGATORIAMENTE um tópico específico "DA RESPONSABILIDADE SUBSIDIÁRIA DA TOMADORA DE SERVIÇOS" fundamentado na Súmula 331, IV e V, do TST. Este tópico é OBRIGATÓRIO sempre que houver terceirização ou prestação de serviços a tomadora.`;

      // Injeta reclamadas extras no prompt
      if (extraDefendants.length > 0) {
        const listaExtra = extraDefendants.map((d, i) =>
          `${i + 2}ª Reclamada (tomadora): ${d.name || "[A PREENCHER]"}, CNPJ: ${d.cnpj || "[A PREENCHER]"}, Endereço: ${d.address || "[A PREENCHER]"}`
        ).join("\n");
        finalPrompt += `\n\n${"═".repeat(60)}\nRECLAMADAS ADICIONAIS — INCLUIR NA QUALIFICAÇÃO E RESPONSABILIDADE SUBSIDIÁRIA (Súmula 331 TST):\n${listaExtra}`;
      }

      // Injeta laudo de análise de documentos (issue-spotting)
      if (laudoAnalise) {
        finalPrompt += `\n\n${"═".repeat(60)}\nLAUDO DE ANÁLISE DE DOCUMENTOS — USE ESTES ACHADOS NA REDAÇÃO DA PEÇA:\n${"═".repeat(60)}\n\n${laudoAnalise}\n\n${"═".repeat(60)}\nFIM DO LAUDO — os achados acima devem embasar os tópicos de fatos, direito e pedidos.`;
      }

      if (docTexts.length > 0) {
        finalPrompt += `\n\n${"═".repeat(60)}\nCONTEÚDO EXTRAÍDO DOS DOCUMENTOS ANEXADOS — USE ESTES DADOS:\n${"═".repeat(60)}\n\n${docTexts.join("\n\n")}`;
      }

      if (docsNaoLidos.length > 0) {
        finalPrompt += `\n\nDOCUMENTOS NÃO LIDOS (adicione como PENDÊNCIA ao final da peça): ${docsNaoLidos.join(", ")}`;
      }

      if (templateContent && templateContent.trim().length >= 50) {
        finalPrompt += `\n\n${"═".repeat(60)}\nINSTRUÇÃO OBRIGATÓRIA — PRESERVAÇÃO DO MODELO:\nVocê DEVE preservar TODOS os tópicos, títulos, seções e subtítulos do modelo abaixo, sem exceção. Nenhum tópico pode ser omitido ou fundido com outro. Preencha cada seção com os dados reais do caso e dos documentos. Campos sem informação: [A PREENCHER: descrição].\n\nMODELO OBRIGATÓRIO:\n${templateContent}`;
      }

      // Padrão de formatação FAV
      finalPrompt += `\n\n${"═".repeat(60)}\nREGRAS DE FORMATAÇÃO OBRIGATÓRIAS — PADRÃO FAV (aplicar a TODA peça, sem exceção):\n${"═".repeat(60)}\n\n1. CORPO: Arial 12pt, entrelinhas 1,5, texto justificado, recuo de primeira linha 3,0 cm. Blocos separados por parágrafo vazio.\n2. NUMERAÇÃO: tópicos em decimal contínuo (1., 2., 2.1, etc.). O NÚMERO deve aparecer em negrito antes do título.\n3. TÍTULOS DE TÓPICOS: em CAIXA ALTA, negrito e sublinhado. Exemplo: **1. DOS FATOS**\n4. PEDIDOS: em letras minúsculas, em negrito, na ordem do modelo. Exemplo: **a) pagamento das horas extras...**\n5. EMENTAS/JURISPRUDÊNCIA: recuadas 4,0 cm, sem itálico, ênfase em negrito, com identificação completa do tribunal/número e "(g.n.)" ao final.\n6. FECHO: centralizado, sem travessão. Exemplo: "Nestes termos, pede deferimento."\n7. ASSINATURA: bloco centralizado ao final — local/data, nome do advogado, OAB.\n8. NÃO use itálico no corpo. NÃO use travessão (—) como separador de seções.\n9. NÃO copie títulos específicos do Vigilante (ex.: "DA DESCARACTERIZAÇÃO DA JORNADA 12x36") para outras peças. Use os títulos do template/caso selecionado, formatados neste padrão.\n10. Para ementas: marque com ">" no início da linha para que o renderizador aplique o recuo correto.`;

      if (imageOrPdfUrls.length > 0) {
        finalPrompt += `\n\nALÉM DO TEXTO ACIMA, analise também os ${imageOrPdfUrls.length} arquivo(s) PDF/imagem enviados como anexo. Extraia TODOS os dados: valores, datas, horários, nomes, divergências entre cartão de ponto e holerites, salários, verbas, etc. Use esses dados concretos na peça.`;
      }

      let aiResponse = null;
      let finalStatus = "concluida";
      let usedAI = false;

      if (finalPrompt) {
        try {
          // Normaliza modelo: substitui modelos Claude antigos/inválidos
          let modeloRaw = modeloIA || cfgAtivo.modelo_ia || "claude_sonnet_4_6";
          const modeloNormalizado = modeloRaw
            .replace(/claude-sonnet-4-20250514/g, "claude_sonnet_4_6")
            .replace(/claude-3-5-sonnet/g, "claude_sonnet_4_6");
          
          aiResponse = await base44.integrations.Core.InvokeLLM({
            prompt: finalPrompt,
            model: modeloNormalizado,
            file_urls: imageOrPdfUrls.length > 0 ? imageOrPdfUrls : undefined,
          });
          usedAI = true;
        } catch (aiErr) {
          console.error("IA falhou:", aiErr.message);
          finalStatus = "revisao_necessaria";
          // Loga erro de IA
          try {
            await base44.asServiceRole.entities.ErrorLog.create({
              context: "generatePetition — IA",
              error_type: "api",
              message: aiErr.message,
              petition_id: petitionId,
              resolved: false,
              occurred_at: new Date().toISOString(),
            });
          } catch (_) {}
        }
      }

      const fullText = assemblePetition(templateParts, aiResponse, templateContent);

      const hasPendencias = /\[A PREENCHER|\[PENDÊNCIA/i.test(fullText);
      if (hasPendencias && finalStatus !== "revisao_necessaria") {
        finalStatus = "revisao_necessaria";
      }

      // ── Aplica padrão obrigatório do escritório (PetitionConfig) ─────────
      // Usa cfgAtivo lido do banco (garante logo mesmo se petitionConfig do frontend vier null)
      const cfg = cfgAtivo;

      const logoMarcador = cfg.logo_url ? `__LOGO__:${cfg.logo_url}` : "";

      const linhasCabecalho = [
        logoMarcador,
        cfg.cabecalho_texto && cfg.cabecalho_texto,
        cfg.escritorio && `${cfg.escritorio}`,
        cfg.advogado_principal && `${cfg.advogado_principal}`,
        cfg.oab && `OAB/${cfg.uf_oab || ""} ${cfg.oab}`,
      ].filter(Boolean);

      const linhasRodape = [
        cfg.rodape_texto && cfg.rodape_texto,
        cfg.email_contato && `E-mail: ${cfg.email_contato}`,
        cfg.telefone && `Tel.: ${cfg.telefone}`,
        cfg.site && cfg.site,
        cfg.papel_timbrado_url && `__RODAPE_IMG__:${cfg.papel_timbrado_url}`,
      ].filter(Boolean);

      const cabecalhoBloco = linhasCabecalho.length > 0
        ? linhasCabecalho.join("\n") + "\n\n" + "─".repeat(60) + "\n\n"
        : "";
      const rodapeBloco = linhasRodape.length > 0
        ? "\n\n" + "─".repeat(60) + "\n\n" + linhasRodape.join("\n")
        : "";

      let savedContent = cabecalhoBloco + fullText + rodapeBloco;

      if (!aiResponse && templateContent && templateContent.trim().length >= 50) {
        savedContent = cabecalhoBloco + templateContent + rodapeBloco;
        finalStatus = "revisao_necessaria";
      }

      const blob = new Blob([savedContent], { type: "text/plain" });
      const file = new File([blob], "peticao.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file });

      await base44.asServiceRole.entities.Petition.update(petitionId, {
        generated_content: contentUrl,
        template_used: templateName || "",
        status: finalStatus,
      });

      console.log(`Petição ${petitionId} salva — status: ${finalStatus}, IA: ${usedAI}`);

      // Incrementa use_count do template
      if (templateId) {
        try {
          const tmpl = await base44.asServiceRole.entities.PetitionTemplate.filter({ id: templateId });
          if (tmpl[0]) {
            await base44.asServiceRole.entities.PetitionTemplate.update(templateId, {
              use_count: (tmpl[0].use_count || 0) + 1,
            });
          }
        } catch (_) {}
      }

      // GenerationLog
      try {
        const modeloLog = usedAI ? (modeloIA || cfgAtivo.modelo_ia || "claude_sonnet_4_6")
          .replace(/claude-sonnet-4-20250514/g, "claude_sonnet_4_6")
          .replace(/claude-3-5-sonnet/g, "claude_sonnet_4_6") : "template_only";
        await base44.asServiceRole.entities.GenerationLog.create({
          petition_id: petitionId,
          status: "concluido",
          model_used: modeloLog,
          template_id: templateId || "",
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          generated_at: new Date().toISOString(),
        });
      } catch (_) {}

    })().catch(async (fatalErr) => {
      console.error("Erro fatal no background:", fatalErr.message);
      // Registra no ErrorLog
      try {
        await base44.asServiceRole.entities.ErrorLog.create({
          context: "generatePetition — fatal background",
          error_type: "geracao",
          message: fatalErr.message,
          petition_id: petitionId,
          resolved: false,
          occurred_at: new Date().toISOString(),
        });
      } catch (_) {}
      // Garante que a petição saia de "em_geracao"
      try {
        await base44.asServiceRole.entities.Petition.update(petitionId, { status: "revisao_necessaria" });
      } catch (_) {}
      // GenerationLog de erro
      try {
        await base44.asServiceRole.entities.GenerationLog.create({
          petition_id: petitionId,
          status: "erro",
          error_message: fatalErr.message,
          generated_at: new Date().toISOString(),
        });
      } catch (_) {}
    });

    return Response.json({ ok: true, petitionId });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});