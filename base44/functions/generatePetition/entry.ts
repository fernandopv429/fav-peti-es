import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { petitionId, aiPrompt, templateParts, templateContent, templateName, templateId, modeloIA, petitionConfig } = await req.json();
    if (!petitionId || !templateParts) {
      return Response.json({ error: 'petitionId e templateParts são obrigatórios' }, { status: 400 });
    }

    // Responde imediatamente — processa em background
    (async () => {
      const startTime = Date.now();

      /**
       * Monta o documento final.
       * - Se templateContent fornecido: a IA retorna o documento completo preenchido.
       * - Se não: usa layout fallback padrão com os blocos de parts.
       */
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

      // ── Lê documentos anexados à petição ────────────────────────────────
      // Busca a petição para obter document_urls e document_names
      let docFileUrls = [];
      let docNames = [];
      let docsNaoLidos = [];

      try {
        const petList = await base44.asServiceRole.entities.Petition.filter({ id: petitionId });
        const pet = petList[0];
        if (pet && Array.isArray(pet.document_urls) && pet.document_urls.length > 0) {
          docFileUrls = pet.document_urls;
          docNames = pet.document_names || pet.document_urls.map((_, i) => `Documento ${i + 1}`);
        }
      } catch (_) {}

      // Tenta ler o texto de documentos de texto plano/HTML.
      // Imagens e PDFs são passados diretamente como file_urls para a IA (suporte nativo).
      const docTexts = [];
      const imageOrPdfUrls = [];

      for (let i = 0; i < docFileUrls.length; i++) {
        const url = docFileUrls[i];
        const name = docNames[i] || `Documento ${i + 1}`;
        const lower = url.toLowerCase().split("?")[0];
        const isImageOrPdf =
          lower.endsWith(".pdf") ||
          lower.endsWith(".png") ||
          lower.endsWith(".jpg") ||
          lower.endsWith(".jpeg") ||
          lower.endsWith(".webp") ||
          lower.endsWith(".gif");

        if (isImageOrPdf) {
          // Passa direto para a IA via file_urls
          imageOrPdfUrls.push(url);
        } else {
          // Tenta ler como texto
          try {
            const resp = await fetch(url, { headers: { Accept: "text/plain, text/html, */*" } });
            if (resp.ok) {
              const text = await resp.text();
              const snippet = text.slice(0, 8000).trim();
              if (snippet) {
                docTexts.push(`=== ${name} ===\n${snippet}`);
              } else {
                docsNaoLidos.push(name);
              }
            } else {
              docsNaoLidos.push(name);
            }
          } catch (_) {
            docsNaoLidos.push(name);
          }
        }
      }

      // ── Monta prompt final com instruções para documentos ─────────────
      let finalPrompt = aiPrompt || "";

      // Injeta conteúdo textual dos documentos no prompt
      if (docTexts.length > 0) {
        finalPrompt += `\n\n${"═".repeat(60)}\nCONTEÚDO EXTRAÍDO DOS DOCUMENTOS ANEXADOS — USE ESTES DADOS:\n${"═".repeat(60)}\n\n${docTexts.join("\n\n")}`;
      }

      // Adiciona pendências de docs não lidos
      if (docsNaoLidos.length > 0) {
        finalPrompt += `\n\nDOCUMENTOS NÃO LIDOS (adicione como PENDÊNCIA ao final da peça): ${docsNaoLidos.join(", ")}`;
      }

      // Instrução OBRIGATÓRIA: não suprimir tópicos do modelo
      if (templateContent && templateContent.trim().length >= 50) {
        finalPrompt += `\n\n${"═".repeat(60)}\nINSTRUÇÃO OBRIGATÓRIA — PRESERVAÇÃO DO MODELO:\nVocê DEVE preservar TODOS os tópicos, títulos, seções e subtítulos do modelo abaixo, sem exceção. Nenhum tópico pode ser omitido ou fundido com outro. Preencha cada seção com os dados reais do caso e dos documentos. Campos sem informação: [A PREENCHER: descrição].\n\nMODELO OBRIGATÓRIO:\n${templateContent}`;
      }

      // ── PADRÃO DE FORMATAÇÃO FAV — OBRIGATÓRIO PARA TODA PEÇA ────────────
      // Aplica-se APENAS à formatação/tipografia. O conteúdo e os títulos
      // continuam vindo exclusivamente do template/caso selecionado.
      finalPrompt += `\n\n${"═".repeat(60)}\nREGRAS DE FORMATAÇÃO OBRIGATÓRIAS — PADRÃO FAV (aplicar a TODA peça, sem exceção):\n${"═".repeat(60)}\n\n1. CORPO: Arial 12pt, entrelinhas 1,5, texto justificado, recuo de primeira linha 3,0 cm. Blocos separados por parágrafo vazio.\n2. NUMERAÇÃO: tópicos em decimal contínuo (1., 2., 2.1, etc.). O NÚMERO deve aparecer em negrito antes do título.\n3. TÍTULOS DE TÓPICOS: em CAIXA ALTA, negrito e sublinhado. Exemplo: **1. DOS FATOS**\n4. PEDIDOS: em letras minúsculas, em negrito, na ordem do modelo. Exemplo: **a) pagamento das horas extras...**\n5. EMENTAS/JURISPRUDÊNCIA: recuadas 4,0 cm, sem itálico, ênfase em negrito, com identificação completa do tribunal/número e "(g.n.)" ao final.\n6. FECHO: centralizado, sem travessão. Exemplo: "Nestes termos, pede deferimento."\n7. ASSINATURA: bloco centralizado ao final — local/data, nome do advogado, OAB.\n8. NÃO use itálico no corpo. NÃO use travessão (—) como separador de seções.\n9. NÃO copie títulos específicos do Vigilante (ex.: "DA DESCARACTERIZAÇÃO DA JORNADA 12x36") para outras peças. Use os títulos do template/caso selecionado, formatados neste padrão.\n10. Para ementas: marque com ">" no início da linha para que o renderizador aplique o recuo correto.`;

      // Instrução de análise de documentos visuais/PDF
      if (imageOrPdfUrls.length > 0) {
        finalPrompt += `\n\nALEM DO TEXTO ACIMA, analise também os ${imageOrPdfUrls.length} arquivo(s) PDF/imagem enviados como anexo. Extraia TODOS os dados: valores, datas, horários, nomes, divergências entre cartão de ponto e holerites, salários, verbas, etc. Use esses dados concretos na peça.`;
      }

      let aiResponse = null;
      let finalStatus = "concluida";
      let usedAI = false;

      // ── Chama a IA ──────────────────────────────────────────────────────
      if (finalPrompt) {
        try {
          aiResponse = await base44.integrations.Core.InvokeLLM({
            prompt: finalPrompt,
            model: modeloIA || "claude_sonnet_4_6",
            // Passa PDFs e imagens diretamente para a IA quando houver
            file_urls: imageOrPdfUrls.length > 0 ? imageOrPdfUrls : undefined,
          });
          usedAI = true;
        } catch (aiErr) {
          console.error("IA falhou, salvando template parcial:", aiErr.message);
          finalStatus = "revisao_necessaria";
        }
      }

      // Monta o documento final
      const fullText = assemblePetition(templateParts, aiResponse, templateContent);

      // Verifica pendências/placeholders
      const hasPendencias = /\[A PREENCHER|\[PENDÊNCIA/i.test(fullText);
      if (hasPendencias && finalStatus !== "revisao_necessaria") {
        finalStatus = "revisao_necessaria";
      }

      // ── Aplica padrão obrigatório do escritório (PetitionConfig) ─────────
      // Cabeçalho e rodapé são injetados como blocos de texto estruturado.
      // Logo/imagem é referenciada por URL para ser usada nos exportadores (PDF/DOCX).
      // Este bloco é OBRIGATÓRIO — toda petição sai com este padrão.
      const cfg = petitionConfig || {};
      const linhasCabecalho = [
        cfg.escritorio       && `ESCRITÓRIO: ${cfg.escritorio}`,
        cfg.advogado_principal && `Advogado: ${cfg.advogado_principal}`,
        cfg.oab              && `OAB: ${cfg.oab}${cfg.uf_oab ? `/${cfg.uf_oab}` : ""}`,
        cfg.cabecalho_texto  && cfg.cabecalho_texto,
        cfg.logo_url         && `[LOGO: ${cfg.logo_url}]`,
      ].filter(Boolean);

      const linhasRodape = [
        cfg.rodape_texto     && cfg.rodape_texto,
        cfg.papel_timbrado_url && `[PAPEL_TIMBRADO: ${cfg.papel_timbrado_url}]`,
        cfg.email_contato    && `E-mail: ${cfg.email_contato}`,
        cfg.telefone         && `Tel.: ${cfg.telefone}`,
        cfg.site             && cfg.site,
      ].filter(Boolean);

      const cabecalhoBloco = linhasCabecalho.length > 0
        ? linhasCabecalho.join("\n") + "\n\n" + "─".repeat(60) + "\n\n"
        : "";
      const rodapeBloco = linhasRodape.length > 0
        ? "\n\n" + "─".repeat(60) + "\n\n" + linhasRodape.join("\n")
        : "";

      // ── Salva o documento (SEMPRE persiste, mesmo com pendências) ────────
      let savedContent = cabecalhoBloco + fullText + rodapeBloco;

      // Se a IA falhou e não há conteúdo útil, salva ao menos o esqueleto do template
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

      console.log(`Petição ${petitionId} salva com status: ${finalStatus}`);

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

      // Log
      try {
        await base44.asServiceRole.entities.GenerationLog.create({
          petition_id: petitionId,
          status: "concluido",
          model_used: usedAI ? "claude_sonnet_4_6" : "template_only",
          template_id: templateId || "",
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          generated_at: new Date().toISOString(),
        });
      } catch (_) {}

    })().catch(async (fatalErr) => {
      console.error("Erro fatal no background:", fatalErr.message);
      // Garante que a petição saia do status em_geracao mesmo em caso de erro fatal
      try {
        await base44.asServiceRole.entities.Petition.update(petitionId, {
          status: "revisao_necessaria",
        });
      } catch (_) {}
    });

    return Response.json({ ok: true, petitionId });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});