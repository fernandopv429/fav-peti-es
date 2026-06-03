import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ENTIDADES = [
  "CasoVigilante", "Petition", "PetitionConfig", "PetitionTemplate",
  "Precedent", "PrecedentV2", "Defesa", "DefesaConfig",
  "VerbaRescisoriaCalculo", "AtualizacaoCalculo", "Client", "Defendant", "Especialista"
];

const CAMPOS_INTERNOS = ["id", "created_date", "updated_date", "created_by_id"];

function limparRegistro(registro) {
  const limpo = { ...registro };
  for (const campo of CAMPOS_INTERNOS) delete limpo[campo];
  return limpo;
}

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
  const { backup_id, snapshot_json } = body;

  if (!backup_id && !snapshot_json) {
    return Response.json({ error: 'backup_id ou snapshot_json obrigatório' }, { status: 400 });
  }

  // Carrega snapshot
  let snapshot;
  try {
    if (snapshot_json) {
      // Importação direta de objeto/string
      snapshot = typeof snapshot_json === "string" ? JSON.parse(snapshot_json) : snapshot_json;
    } else {
      // Busca o registro de backup e baixa o arquivo
      const backup = await base44.asServiceRole.entities.Backup.get(backup_id);
      if (!backup) return Response.json({ error: 'Backup não encontrado' }, { status: 404 });

      if (!backup.file_url) {
        return Response.json({ error: 'Backup sem arquivo associado (file_url ausente)' }, { status: 400 });
      }

      const resp = await fetch(backup.file_url);
      if (!resp.ok) throw new Error(`Falha ao baixar snapshot do arquivo: HTTP ${resp.status}`);
      snapshot = await resp.json();
    }
  } catch (e) {
    const errMsg = `Falha ao carregar snapshot: ${e.message}`;
    await base44.asServiceRole.entities.ErrorLog.create({
      context: "Backup",
      error_type: "api",
      message: errMsg,
    }).catch(() => {});
    return Response.json({ error: errMsg }, { status: 500 });
  }

  let totalRestaurado = 0;
  const erros = [];

  for (const entidade of ENTIDADES) {
    const registros = snapshot[entidade];
    if (!Array.isArray(registros)) continue;

    try {
      // Remove registros atuais
      const atuais = await base44.asServiceRole.entities[entidade].list();
      for (const reg of (atuais || [])) {
        await base44.asServiceRole.entities[entidade].delete(reg.id);
      }

      // Recria a partir do snapshot
      for (const reg of registros) {
        const limpo = limparRegistro(reg);
        await base44.asServiceRole.entities[entidade].create(limpo);
        totalRestaurado++;
      }
    } catch (e) {
      erros.push(`${entidade}: ${e.message}`);
    }
  }

  if (erros.length > 0) {
    await base44.asServiceRole.entities.ErrorLog.create({
      context: "Backup",
      error_type: "api",
      message: `Restauração com erros: ${erros.join(" | ")}`,
    }).catch(() => {});
  }

  return Response.json({ success: true, total_restaurado: totalRestaurado, erros });
});