import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { petitionId, aiPrompt, templateParts, templateName, templateId } = await req.json();
    if (!petitionId || !templateParts) {
      return Response.json({ error: 'petitionId e templateParts são obrigatórios' }, { status: 400 });
    }

    // Dispara em background — responde imediatamente
    (async () => {
      const startTime = Date.now();

      // ── Monta o documento final ──────────────────────────────────────
      const assemblePetition = (parts, aiResponse) => {
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

      let aiResponse = null;
      let finalStatus = "concluida";
      let usedAI = false;

      // ── Tenta chamar a IA (apenas narrativa + fundamentação) ─────────
      if (aiPrompt) {
        try {
          aiResponse = await base44.integrations.Core.InvokeLLM({
            prompt: aiPrompt,
            model: "claude_sonnet_4_6",
          });
          usedAI = true;
        } catch (aiErr) {
          // IA falhou/timeout → salva template parcial com revisao_necessaria
          console.error("IA falhou, salvando template parcial:", aiErr.message);
          finalStatus = "revisao_necessaria";
        }
      }

      // Verifica pendências
      const fullText = assemblePetition(templateParts, aiResponse);
      const hasPendencias = /\[A PREENCHER/i.test(fullText);
      if (hasPendencias && finalStatus !== "revisao_necessaria") {
        finalStatus = "revisao_necessaria";
      }

      // ── Salva o documento ────────────────────────────────────────────
      const blob = new Blob([fullText], { type: "text/plain" });
      const file = new File([blob], "peticao.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file });

      await base44.asServiceRole.entities.Petition.update(petitionId, {
        generated_content: contentUrl,
        template_used: templateName || "",
        status: finalStatus,
      });

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
          status: finalStatus === "revisao_necessaria" ? "concluido" : "concluido",
          model_used: usedAI ? "claude_sonnet_4_6" : "template_only",
          template_id: templateId || "",
          duration_seconds: Math.round((Date.now() - startTime) / 1000),
          generated_at: new Date().toISOString(),
        });
      } catch (_) {}

    })();

    return Response.json({ ok: true, petitionId });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});