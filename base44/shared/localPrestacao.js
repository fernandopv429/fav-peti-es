// Competência (art. 651 CLT) — REGRA FAV (decisão 24/11/2026): quando o
// reclamante passou por mais de uma tomadora, vale o endereço da ÚLTIMA
// tomadora em que prestou serviço. "Última" = a de período final mais recente
// (RECLn_TEMPO_LABORADO); período em aberto ("atual") conta como o mais recente;
// empate ou sem período → a de maior número (3ª depois da 2ª etc.).
// Sem nenhuma tomadora, devolve '' e quem chama cai na empregadora (1ª).

function fimDoPeriodo(texto) {
  const s = String(texto || '').trim();
  if (!s) return null;
  const partes = s.split(/\s+(?:-|–|—|a|até)\s+/i);
  const fim = partes.length > 1 ? partes[partes.length - 1] : '';
  if (!fim.trim() || /atual|hoje|presente|em curso|até o momento/i.test(fim)) return Infinity;
  let m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(fim);
  if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  m = /(\d{1,2})\/(\d{4})/.exec(fim);
  if (m) return Number(m[2]) * 10000 + Number(m[1]) * 100 + 31;
  m = /(\d{4})/.exec(fim);
  if (m) return Number(m[1]) * 10000 + 1231;
  return null;
}

export function ultimaTomadora(caso) {
  const lista = [2, 3, 4]
    .map((n) => ({
      n,
      endereco: String(caso?.[`recl${n}_logradouro`] || '').trim(),
      fim: fimDoPeriodo(caso?.[`recl${n}_tempo_laborado`]),
    }))
    .filter((t) => t.endereco);
  if (!lista.length) return null;
  const chave = (t) => (t.fim == null ? -1 : t.fim);
  lista.sort((a, b) => {
    const ka = chave(a), kb = chave(b);
    if (ka !== kb) return kb > ka ? 1 : -1;
    return b.n - a.n;
  });
  return lista[0];
}

export function enderecoUltimaTomadora(caso) {
  return ultimaTomadora(caso)?.endereco || '';
}
