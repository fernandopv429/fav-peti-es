import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ENTIDADES = [
  "CasoVigilante", "Petition", "PetitionConfig", "PetitionTemplate",
  "Precedent", "PrecedentV2", "Defesa", "DefesaConfig",
  "VerbaRescisoriaCalculo", "AtualizacaoCalculo", "Client", "Defendant", "Especialista"
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Verifica se backup automático está ativo
    const configs = await base44.asServiceRole.entities.BackupConfig.list();
    const config = configs?.[0];
    if (!config?.ativo) {
      return Response.json({ skipped: true, reason: "Backup automático desativado" });
    }

    // Coleta dados
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

    if (tamanhoBytes > 400000) {
      const blob = new Blob([jsonStr], { type: "application/json" });
      const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
      fileUrl = file_url;
    } else {
      conteudoJson = jsonStr;
    }

    const backup = await base44.asServiceRole.entities.Backup.create({
      tipo: "automatico",
      total_registros: totalRegistros,
      tamanho_bytes: tamanhoBytes,
      file_url: fileUrl,
      conteudo_json: conteudoJson,
      entidades_incluidas: ENTIDADES,
    });

    return Response.json({ success: true, backup_id: backup.id, total_registros: totalRegistros });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});