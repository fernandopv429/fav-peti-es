import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { carregarGrupos, classificarGrupo } from '../../shared/grupoFuncao.js';

// Classifica no grupo de função os casos (CasoTrabalhista) e petições (Petition) sem grupo.
// Body opcional: { reclassificar: true } refaz todos. Só administradores.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me || me.role !== 'admin') return Response.json({ error: 'Apenas administradores.' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const grupos = await carregarGrupos(base44);
    const cache = {};
    const grupoDe = async (f) => {
      const k = String(f || '');
      if (!(k in cache)) cache[k] = await classificarGrupo(base44, f, grupos);
      return cache[k];
    };

    const resumo = { casos: 0, peticoes: 0 };
    const casos = await base44.asServiceRole.entities.CasoTrabalhista.list('-created_date', 2000);
    for (const c of casos) {
      if (c.grupo_funcao && !body.reclassificar) continue;
      await base44.asServiceRole.entities.CasoTrabalhista.update(c.id, { grupo_funcao: await grupoDe(c.funcao) });
      resumo.casos++;
    }
    const peticoes = await base44.asServiceRole.entities.Petition.list('-created_date', 2000);
    for (const p of peticoes) {
      if (p.grupo_funcao && !body.reclassificar) continue;
      await base44.asServiceRole.entities.Petition.update(p.id, { grupo_funcao: await grupoDe(p.claimant_role) });
      resumo.peticoes++;
    }
    return Response.json({ ok: true, ...resumo, funcoes: cache });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
