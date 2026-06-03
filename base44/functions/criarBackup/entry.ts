import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ENTIDADES = [
  "CasoVigilante", "Petition", "PetitionConfig", "PetitionTemplate",
  "Precedent", "PrecedentV2", "Defesa", "DefesaConfig",
  "VerbaRescisoriaCalculo", "AtualizacaoCalculo", "Client", "Defendant", "Especialista"
];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  let user;
  try {
    user = await base44.auth.me();
  } catch (e) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tipo = body.tipo || "manual";
  const observacao = body.observacao || null;

  const snapshot = {};
  let totalRegistros = 0;
  const entidadesIncluidas = [];
  const errosColeta = [];

  // Coleta dados de todas as entidades
  for (const entidade of ENTIDADES) {
    try {
      const registros = await base44.asServiceRole.entities[entidade].list();
      snapshot[entidade] = registros || [];
      totalRegistros += (registros || []).length;
      entidadesIncluidas.push(entidade);
    } catch (e) {
      errosColeta.push(`${entidade}: ${e.message}`);
      snapshot[entidade] = [];
    }
  }

  // Serializa — SEMPRE salva como arquivo para evitar estouro de campo de texto
  let jsonStr;
  try {
    jsonStr = JSON.stringify(snapshot);
  } catch (e) {
    const errMsg = `Falha ao serializar snapshot: ${e.message}`;
    await base44.asServiceRole.entities.ErrorLog.create({
      context: "Backup",
      error_type: "api",
      message: errMsg,
    }).catch(() => {});
    return Response.json({ error: errMsg }, { status: 500 });
  }

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
    const errMsg = `Falha no upload do snapshot (${(tamanhoBytes / 1024).toFixed(0)} KB): ${e.message}`;
    await base44.asServiceRole.entities.ErrorLog.create({
      context: "Backup",
      error_type: "api",
      message: errMsg,
    }).catch(() => {});
    return Response.json({ error: errMsg }, { status: 500 });
  }

  // Persiste registro de Backup
  let backup;
  try {
    backup = await base44.asServiceRole.entities.Backup.create({
      tipo,
      total_registros: totalRegistros,
      tamanho_bytes: tamanhoBytes,
      file_url: fileUrl,
      conteudo_json: null,
      entidades_incluidas: entidadesIncluidas,
      observacao,
    });
  } catch (e) {
    const errMsg = `Falha ao salvar registro Backup: ${e.message}`;
    await base44.asServiceRole.entities.ErrorLog.create({
      context: "Backup",
      error_type: "api",
      message: errMsg,
    }).catch(() => {});
    return Response.json({ error: errMsg }, { status: 500 });
  }

  return Response.json({
    success: true,
    backup_id: backup.id,
    total_registros: totalRegistros,
    tamanho_bytes: tamanhoBytes,
    entidades_incluidas: entidadesIncluidas,
    erros_coleta: errosColeta,
  });
});