import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ENTIDADES = [
  "CasoVigilante", "Petition", "PetitionConfig", "PetitionTemplate",
  "Precedent", "PrecedentV2", "Defesa", "DefesaConfig",
  "VerbaRescisoriaCalculo", "AtualizacaoCalculo", "Client", "Defendant", "Especialista"
];

Deno.serve(async (req) => {
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
  const entidadesIncluidas = [];

  for (const entidade of ENTIDADES) {
    try {
      const registros = await base44.asServiceRole.entities[entidade].list();
      snapshot[entidade] = registros || [];
      totalRegistros += (registros || []).length;
      entidadesIncluidas.push(entidade);
    } catch (e) {
      snapshot[entidade] = [];
    }
  }

  const jsonStr = JSON.stringify(snapshot);
  const tamanhoBytes = new TextEncoder().encode(jsonStr).length;

  // Upload SEMPRE como arquivo via multipart/form-data
  let fileUrl;
  try {
    const blob = new Blob([jsonStr], { type: "application/json" });
    const form = new FormData();
    form.append("file", blob, "backup.json");
    const result = await base44.asServiceRole.integrations.Core.UploadFile({ file: form.get("file") });
    fileUrl = result.file_url;
  } catch (e) {
    await base44.asServiceRole.entities.ErrorLog.create({
      context: "Backup",
      error_type: "api",
      message: `Backup agendado falhou no upload (${(tamanhoBytes / 1024).toFixed(0)} KB): ${e.message}`,
    }).catch(() => {});
    return Response.json({ error: e.message }, { status: 500 });
  }

  const backup = await base44.asServiceRole.entities.Backup.create({
    tipo: "automatico",
    total_registros: totalRegistros,
    tamanho_bytes: tamanhoBytes,
    file_url: fileUrl,
    conteudo_json: null,
    entidades_incluidas: entidadesIncluidas,
  });

  return Response.json({ success: true, backup_id: backup.id, total_registros: totalRegistros });
});