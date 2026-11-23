// Classifica a função registrada (CTPS) num grupo de função (entidade GrupoFuncao).
// 1) Sinônimos (sem acento/maiúsculas, exato ou contido)  2) IA, só com alta confiança  3) "Sem categoria".

export const SEM_CATEGORIA = 'Sem categoria';

export function normalizarFuncao(t) {
  return String(t || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function grupoPorSinonimo(funcao, grupos) {
  const f = normalizarFuncao(funcao);
  if (!f) return null;
  for (const g of grupos) {
    for (const s of g.sinonimos || []) if (normalizarFuncao(s) === f) return g.nome;
  }
  let melhor = null, tam = 0;
  for (const g of grupos) {
    for (const s of g.sinonimos || []) {
      const n = normalizarFuncao(s);
      if (n && f.includes(n) && n.length > tam) { melhor = g.nome; tam = n.length; }
    }
  }
  return melhor;
}

export async function carregarGrupos(base44) {
  const gs = await base44.asServiceRole.entities.GrupoFuncao.filter({ ativo: true });
  return gs.filter((g) => g.nome !== SEM_CATEGORIA);
}

async function grupoPorIA(base44, funcao, grupos) {
  try {
    const r = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Função registrada na carteira de trabalho: "${funcao}".\n` +
        `Grupos possíveis: ${grupos.map((g) => `${g.nome} (${(g.sinonimos || []).join(', ')})`).join('; ')}.\n` +
        `Indique o grupo que corresponde a essa função e sua confiança de 0 a 1. ` +
        `Se nenhum grupo corresponder claramente, responda grupo "${SEM_CATEGORIA}".`,
      response_json_schema: {
        type: 'object',
        properties: { grupo: { type: 'string' }, confianca: { type: 'number' } },
        required: ['grupo', 'confianca'],
      },
    });
    if (r && grupos.some((g) => g.nome === r.grupo) && Number(r.confianca) >= 0.85) return r.grupo;
  } catch (_) { /* sem IA => sem categoria */ }
  return null;
}

export async function classificarGrupo(base44, funcao, grupos) {
  try {
    const lista = grupos || await carregarGrupos(base44);
    return grupoPorSinonimo(funcao, lista)
      || (funcao ? await grupoPorIA(base44, funcao, lista) : null)
      || SEM_CATEGORIA;
  } catch (_) {
    return SEM_CATEGORIA;
  }
}
