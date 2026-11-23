import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Cartao, Sparkline } from "@/features/painel/Graficos";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { lerData, DIAS_ALERTA, DIAS_CRITICO, PERIODOS } from "@/features/painel/indicadores";

// CARTÃO "POR USUÁRIO" (nov/2026). Para cada pessoa com acesso:
//  - Feitas: casos que ELA confirmou como revisados no período (campo revisado_por, gravado
//    no "Confirmar revisão" a partir de 23/11/2026 — antes disso o sistema não guardava quem fez).
//  - Paradas: casos da fila dela (pelos grupos de função liberados; gerente vê todos) que ainda
//    não foram revisados. "Aguardando dados" fica de fora, porque ninguém consegue agir nele.
// Um caso na fila conta para todos que enxergam aquele grupo.

const DIA = 86400000;
const CORES = ["#16a34a", "#2563eb", "#f2a900", "#db2777", "#0891b2", "#7c3aed", "#ea580c", "#141414"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Faixas de tempo do período: dia a dia (7d e 30d) ou mês a mês (ano). */
function faixasDoPeriodo(periodoId, agora) {
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  if (periodoId === "ano") {
    return Array.from({ length: 12 }, (_, i) => {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1);
      const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 1);
      return { ini, fim, rotulo: MESES[ini.getMonth()] };
    });
  }
  const n = periodoId === "7d" ? 7 : 30;
  return Array.from({ length: n }, (_, i) => {
    const ini = new Date(hoje.getTime() - (n - 1 - i) * DIA);
    return { ini, fim: new Date(ini.getTime() + DIA), rotulo: `${String(ini.getDate()).padStart(2, "0")}/${String(ini.getMonth() + 1).padStart(2, "0")}` };
  });
}

function Kpi({ rotulo, valor, spark, cor, selo, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-left rounded-xl border border-border bg-card px-4 py-3 card-soft hover:border-foreground/25 disabled:cursor-default disabled:hover:border-border">
      <p className="label-caps">{rotulo}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="text-[24px] font-medium leading-none text-foreground tabular-nums">{valor}</p>
        <Sparkline valores={spark} cor={cor} largura={72} altura={24} />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{selo}</p>
    </button>
  );
}

const diasDesde = (c, agora) => Math.max(0, Math.floor((agora - lerData(c.created_date)) / DIA));

export default function PorUsuario({ casos, periodoId, onVer }) {
  const [acessos, setAcessos] = useState(null);

  useEffect(() => {
    let vivo = true;
    base44.entities.AcessoUsuario.list("-created_date", 500)
      .then((r) => vivo && setAcessos((r || []).filter((a) => a.ativo !== false)))
      .catch(() => vivo && setAcessos([]));
    return () => { vivo = false; };
  }, []);

  const linhas = useMemo(() => {
    if (!acessos) return [];
    const agora = new Date();
    const periodo = PERIODOS.find((p) => p.id === periodoId) || PERIODOS[1];
    const inicio = new Date(agora.getTime() - periodo.dias * DIA);
    const fila = casos.filter((c) => c.status !== "pronto" && c.status !== "aguardando_dados");

    const porEmail = new Map();
    for (const a of acessos) {
      const email = String(a.user_email || "").toLowerCase();
      if (!email) continue;
      const grupos = new Set(a.grupos || []);
      const paradas = fila
        .filter((c) => a.gerente || grupos.has(c.grupo_funcao || "Sem categoria"))
        .map((c) => ({ caso: c, dias: diasDesde(c, agora) }))
        .sort((x, y) => y.dias - x.dias);
      porEmail.set(email, { email, nome: a.user_nome || email.split("@")[0], gerente: !!a.gerente, grupos: [...grupos], feitas: [], paradas });
    }
    // Feitas no período, inclusive por quem não está na lista de acessos (ex.: diretoria)
    for (const c of casos) {
      if (c.status !== "pronto" || !c.revisado_por || !c.revisado_em) continue;
      if (lerData(c.revisado_em) < inicio) continue;
      const email = String(c.revisado_por).toLowerCase();
      if (!porEmail.has(email)) porEmail.set(email, { email, nome: c.revisado_por_nome || email.split("@")[0], gerente: false, grupos: [], feitas: [], paradas: [], semFila: true });
      porEmail.get(email).feitas.push(c);
    }
    return [...porEmail.values()].sort((a, b) => b.feitas.length - a.feitas.length || b.paradas.length - a.paradas.length || a.nome.localeCompare(b.nome));
  }, [acessos, casos, periodoId]);

  const graf = useMemo(() => {
    const agora = new Date();
    const faixas = faixasDoPeriodo(periodoId, agora);
    const feitasTodas = casos.filter((c) => c.status === "pronto" && c.revisado_por && c.revisado_em);
    const pessoas = linhas.filter((l) => l.feitas.length).slice(0, 8);
    const serie = faixas.map((f) => {
      const ponto = { rotulo: f.rotulo, feitas: 0, paradas: 0, criticas: 0 };
      for (const c of feitasTodas) {
        const d = lerData(c.revisado_em);
        if (d >= f.ini && d < f.fim) {
          ponto.feitas += 1;
          const p = String(c.revisado_por).toLowerCase();
          ponto[p] = (ponto[p] || 0) + 1;
        }
      }
      // Fila no fim da faixa: já recebido e ainda não revisado naquele momento
      for (const c of casos) {
        if (c.status === "aguardando_dados") continue;
        const criado = lerData(c.created_date);
        if (criado >= f.fim) continue;
        const revisado = c.status === "pronto" ? lerData(c.revisado_em || c.updated_date) : null;
        if (revisado && revisado < f.fim) continue;
        ponto.paradas += 1;
        if ((f.fim - criado) / DIA >= DIAS_CRITICO) ponto.criticas += 1;
      }
      return ponto;
    });
    const totalFeitas = serie.reduce((s, p) => s + p.feitas, 0);
    const ativos = (acessos || []).length || 1;
    const fila = casos.filter((c) => c.status !== "pronto" && c.status !== "aguardando_dados");
    const criticas = fila.filter((c) => diasDesde(c, agora) >= DIAS_CRITICO);
    const barras = linhas.filter((l) => !l.semFila || l.feitas.length).map((l) => ({ nome: l.nome.split(" ")[0], email: l.email, feitas: l.feitas.length, paradas: l.paradas.length }));
    return { serie, pessoas, totalFeitas, media: totalFeitas / ativos, ativos, fila, criticas, barras, feitasTodas };
  }, [linhas, casos, periodoId, acessos]);

  const linhaDe = (email) => linhas.find((l) => l.email === email);

  const semRegistro = casos.filter((c) => c.status === "pronto" && !c.revisado_por).length;

  const fmt = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Feitas no período" valor={graf.totalFeitas} spark={graf.serie.map((p) => p.feitas)} cor="#16a34a"
          selo="revisadas pelo time" onClick={graf.totalFeitas ? () => onVer("Feitas no período", graf.feitasTodas) : null} />
        <Kpi rotulo="Média por pessoa" valor={fmt(graf.media)} spark={graf.serie.map((p) => p.feitas / graf.ativos)} cor="#2563eb"
          selo={`${graf.ativos} ${graf.ativos === 1 ? "usuário ativo" : "usuários ativos"}`} />
        <Kpi rotulo="Paradas" valor={graf.fila.length} spark={graf.serie.map((p) => p.paradas)} cor="#f2a900"
          selo="na fila, sem revisão" onClick={graf.fila.length ? () => onVer("Paradas na fila", graf.fila, "da mais antiga para a mais nova") : null} />
        <Kpi rotulo={`Paradas há +${DIAS_CRITICO} dias`} valor={graf.criticas.length} spark={graf.serie.map((p) => p.criticas)} cor="#dc2626"
          selo={graf.criticas.length ? "precisam de atenção" : "nenhuma crítica"} onClick={graf.criticas.length ? () => onVer(`Paradas há +${DIAS_CRITICO} dias`, graf.criticas) : null} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Cartao titulo="Feitas × paradas por usuário" subtitulo="clique na barra para ver os casos">
          {graf.barras.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Sem usuários ainda.</p> : (
            <div style={{ height: Math.max(180, graf.barras.length * 34 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={graf.barras} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nome" width={84} tick={{ fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="feitas" name="Feitas" fill="#16a34a" radius={[0, 4, 4, 0]} cursor="pointer"
                    onClick={(d) => { const l = linhaDe(d?.email); if (l?.feitas.length) onVer(`Feitas por ${l.nome}`, l.feitas); }} />
                  <Bar dataKey="paradas" name="Paradas" fill="#a8a29e" radius={[0, 4, 4, 0]} cursor="pointer"
                    onClick={(d) => { const l = linhaDe(d?.email); if (l?.paradas.length) onVer(`Paradas na fila de ${l.nome}`, l.paradas.map((p) => p.caso), "da mais antiga para a mais nova"); }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Cartao>

        <Cartao titulo="Produção no tempo" subtitulo={periodoId === "ano" ? "feitas por mês, por pessoa" : "feitas por dia, por pessoa"}>
          {graf.pessoas.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">As linhas aparecem conforme as revisões forem confirmadas.</p>
          ) : (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={graf.serie} margin={{ left: -16, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {graf.pessoas.map((l, i) => (
                    <Line key={l.email} type="monotone" dataKey={(p) => p[l.email] || 0} name={l.nome.split(" ")[0]} stroke={CORES[i % CORES.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Cartao>
      </div>

    <Cartao titulo="Por usuário" subtitulo="feitas no período · paradas na fila de cada um" extra={<span className="label-caps">feitas · paradas</span>}>
      {acessos === null ? (
        <div className="h-32 rounded-lg bg-secondary animate-pulse" />
      ) : linhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum usuário com acesso ainda. Convide em Usuários.</p>
      ) : (
        <ul className="divide-y divide-border">
          {linhas.map((l) => {
            const velhas = l.paradas.filter((p) => p.dias >= DIAS_ALERTA).length;
            const criticas = l.paradas.filter((p) => p.dias >= DIAS_CRITICO).length;
            return (
              <li key={l.email} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground" title={l.email}>{l.nome}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {l.semFila ? "sem fila definida" : l.gerente ? "todas as categorias" : (l.grupos.join(", ") || "sem grupo liberado")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!l.feitas.length}
                  onClick={() => onVer(`Feitas por ${l.nome}`, l.feitas)}
                  className="w-14 rounded-lg px-2 py-1 text-right tabular-nums hover:bg-secondary disabled:cursor-default disabled:hover:bg-transparent"
                  title="Revisadas no período"
                >
                  <span className={`text-[15px] font-semibold ${l.feitas.length ? "text-success" : "text-muted-foreground/60"}`}>{l.feitas.length}</span>
                </button>
                <button
                  type="button"
                  disabled={l.semFila || !l.paradas.length}
                  onClick={() => onVer(`Paradas na fila de ${l.nome}`, l.paradas.map((p) => p.caso), "da mais antiga para a mais nova")}
                  className="w-24 rounded-lg px-2 py-1 text-right tabular-nums hover:bg-secondary disabled:cursor-default disabled:hover:bg-transparent"
                  title="Na fila, ainda não revisadas"
                >
                  <span className="text-[15px] font-semibold text-foreground">{l.semFila ? "—" : l.paradas.length}</span>
                  {criticas > 0 ? (
                    <span className="ml-1 rounded-full bg-destructive/10 px-1.5 py-px text-[10px] font-semibold text-destructive">{criticas} +{DIAS_CRITICO}d</span>
                  ) : velhas > 0 ? (
                    <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary-ink">{velhas} +{DIAS_ALERTA}d</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {semRegistro > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {semRegistro} {semRegistro === 1 ? "revisada antiga não tem" : "revisadas antigas não têm"} o responsável registrado (o sistema passou a guardar quem revisou em 23/11/2026).
        </p>
      )}
    </Cartao>
    </div>
  );
}
