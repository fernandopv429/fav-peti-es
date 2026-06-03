import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ENTIDADES = [
  "CasoVigilante", "Petition", "PetitionConfig", "PetitionTemplate",
  "Precedent", "PrecedentV2", "Defesa", "DefesaConfig",
  "VerbaRescisoriaCalculo", "AtualizacaoCalculo", "Client", "Defendant", "Especialista"
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const tipo = body.tipo || "manual";

    // Coleta dados de todas as entidades
    const snapshot = {};
    let totalRegistros = 0;

    for (const entidade of ENTIDADES) {
      try {
        const registros = await base44.asServiceRole.entities[entidade].list();
        snapshot[entidade] = registros || [];
        totalRegistros += (registros || []).length;
      } catch (_) {
        snapshot[entidade] = [];
      }
    }

    const jsonStr = JSON.stringify(snapshot, null, 2);
    const tamanhoBytes = new TextEncoder().encode(jsonStr).length;

    let fileUrl = null;
    let conteudoJson = null;

    // Se maior que 400KB, salva como arquivo
    if (tamanhoBytes > 400000) {
      const blob = new Blob([jsonStr], { type: "application/json" });
      const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
      fileUrl = file_url;
    } else {
      conteudoJson = jsonStr;
    }

    const backup = await base44.asServiceRole.entities.Backup.create({
      tipo,
      total_registros: totalRegistros,
      tamanho_bytes: tamanhoBytes,
      file_url: fileUrl,
      conteudo_json: conteudoJson,
      entidades_incluidas: ENTIDADES,
      observacao: body.observacao || null,
    });

    return Response.json({ success: true, backup_id: backup.id, total_registros: totalRegistros, tamanho_bytes: tamanhoBytes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});