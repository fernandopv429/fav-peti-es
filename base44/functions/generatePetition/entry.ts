import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { petitionId, prompt, templateName, templateId } = await req.json();
    if (!petitionId || !prompt) {
      return Response.json({ error: 'petitionId e prompt são obrigatórios' }, { status: 400 });
    }

    // Dispara a geração sem await — responde imediatamente
    (async () => {
      const startTime = Date.now();
      try {
        const result = await base44.integrations.Core.InvokeLLM({
          prompt,
          model: "claude_sonnet_4_6",
        });

        // Detectar pendências
        const pendencias = [...new Set((result.match(/\[A PREENCHER:[^\]]+\]/g) || []))];
        const hasPendencias = pendencias.length > 0;
        const finalStatus = hasPendencias ? "revisao_necessaria" : "concluida";

        // Salvar conteúdo como arquivo
        const blob = new Blob([result], { type: "text/plain" });
        const file = new File([blob], "peticao.txt", { type: "text/plain" });
        const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file });

        await base44.asServiceRole.entities.Petition.update(petitionId, {
          generated_content: contentUrl,
          template_used: templateName || "",
          status: finalStatus,
        });

        // Incrementar use_count do template
        if (templateId) {
          try {
            const templates = await base44.asServiceRole.entities.PetitionTemplate.filter({ id: templateId });
            if (templates[0]) {
              await base44.asServiceRole.entities.PetitionTemplate.update(templateId, {
                use_count: (templates[0].use_count || 0) + 1,
              });
            }
          } catch (_) {}
        }

        // Log de sucesso
        try {
          await base44.asServiceRole.entities.GenerationLog.create({
            petition_id: petitionId,
            status: "concluido",
            model_used: "claude_sonnet_4_6",
            template_id: templateId || "",
            duration_seconds: Math.round((Date.now() - startTime) / 1000),
            generated_at: new Date().toISOString(),
          });
        } catch (_) {}

      } catch (err) {
        // Em caso de falha: reverter status para rascunho
        try {
          await base44.asServiceRole.entities.Petition.update(petitionId, { status: "rascunho" });
        } catch (_) {}

        try {
          await base44.asServiceRole.entities.GenerationLog.create({
            petition_id: petitionId,
            status: "erro",
            error_message: err.message,
            model_used: "claude_sonnet_4_6",
            duration_seconds: Math.round((Date.now() - startTime) / 1000),
            generated_at: new Date().toISOString(),
          });
        } catch (_) {}
      }
    })();

    // Responde imediatamente — a geração continua em background
    return Response.json({ ok: true, petitionId });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});