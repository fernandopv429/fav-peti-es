import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Só administradores definem quais grupos de função cada usuário enxerga.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me || me.role !== 'admin') return Response.json({ error: 'Apenas administradores.' }, { status: 403 });

    const { user_id, grupos } = await req.json().catch(() => ({}));
    if (!user_id || !Array.isArray(grupos)) return Response.json({ error: 'user_id e grupos são obrigatórios.' }, { status: 400 });

    const validos = (await base44.asServiceRole.entities.GrupoFuncao.list()).map((g) => g.nome);
    const lista = grupos.filter((g) => validos.includes(g));
    await base44.asServiceRole.entities.User.update(user_id, {
      grupos_visiveis: lista,
      ve_sem_categoria: lista.includes('Sem categoria'),
    });
    return Response.json({ ok: true, grupos_visiveis: lista });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
