import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Cartao } from "@/features/painel/Graficos";
import { lerData, DIAS_ALERTA, DIAS_CRITICO, PERIODOS } from "@/features/painel/indicadores";

// CARTÃO "POR USUÁRIO" (nov/2026). Para cada pessoa com acesso:
//  - Feitas: casos que ELA confirmou como revisados no período (campo revisado_por, gravado
//    no "Confirmar revisão" a partir de 23/11/2026 — antes disso o sistema não guardava quem fez).
//  - Paradas: casos da fila dela (pelos grupos de função liberados; gerente vê todos) que ainda
//    não foram revisados. "Aguardando dados" fica de fora, porque ninguém consegue agir nele.
// Um caso na fila conta para todos que enxergam aquele grupo.

const DIA = 86400000;
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

  const semRegistro = casos.filter((c) => c.status === "pronto" && !c.revisado_por).length;

  return (
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
  );
}
