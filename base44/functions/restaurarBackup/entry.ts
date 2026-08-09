import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// CasoTrabalhista entrou na lista: é ONDE VIVEM as peças geradas pelo webhook
// (analise_json com caso, cálculos, cláusulas da CCT e capítulos redigidos) e
// estava de fora — o backup protegia o legado (CasoVigilante) e não o que está
// em produção. Junto vieram ModeloReferencia (o "PADRÃO OURO" e as referências
// de estilo), CCT (as convenções cadastradas à mão) e as duas configurações que
// governam a geração.
const ENTIDADES = [
  "CasoTrabalhista", "CasoVigilante", "Petition", "PetitionConfig", "PetitionTemplate",
  "ModeloReferencia", "CCT", "IntegracaoConfig", "EspecialistaConfig",
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
  // Esta função APAGA todos os registros das entidades listadas antes de
  // recriar. Bastava estar logado: qualquer usuário podia zerar a base — e
  // mandando { snapshot_json: { "Petition": [] } } apagava sem nem precisar de
  // um backup existente. Restaurar é operação de administrador.
  if (user.role !== 'admin') {
    return Response.json({ error: 'Apenas administradores podem restaurar backup.' }, { status: 403 });
  }

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

  // REDE DE SEGURANÇA: snapshot do estado ATUAL antes de apagar qualquer coisa.
  // A entidade Backup já previa o tipo 'pre_restauracao' e nada o criava; uma
  // restauração errada era irreversível.
  let backupPrevio = null;
  try {
    const atual = {};
    let total = 0;
    for (const entidade of ENTIDADES) {
      const regs = await base44.asServiceRole.entities[entidade].list().catch(() => []);
      atual[entidade] = regs || [];
      total += (regs || []).length;
    }
    const json = JSON.stringify(atual);
    const file = new File([json], 'backup-pre-restauracao.json', { type: 'application/json' });
    const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    backupPrevio = await base44.asServiceRole.entities.Backup.create({
      tipo: 'pre_restauracao',
      total_registros: total,
      tamanho_bytes: new TextEncoder().encode(json).length,
      file_url,
      entidades_incluidas: ENTIDADES,
      observacao: `Snapshot automático antes da restauração feita por ${user.email || user.id}`,
    });
  } catch (e) {
    // Sem rede de segurança não se apaga nada.
    return Response.json(
      { error: `Não foi possível criar o backup pré-restauração — restauração cancelada: ${e.message}` },
      { status: 500 },
    );
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

  return Response.json({
    success: true,
    total_restaurado: totalRestaurado,
    erros,
    backup_pre_restauracao_id: backupPrevio?.id || null,
  });
});