import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight, Inbox, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/app/auth/AuthContext";
import { useCasosWebhook } from "@/features/entrevista/useCasosWebhook";
import {
  PERIODOS, DIAS_ALERTA, DIAS_CRITICO, calcularIndicadores, brlCompacto,
} from "@/features/painel/indicadores";
import { Cartao, Sparkline, LinhasFluxo, LegendaFluxo, Funil, BarraSegmentada } from "@/features/painel/Graficos";
import ListaCasos from "@/features/painel/ListaCasos";

const CHAVE_PERIODO = "fav.inicio.periodo";
function periodoSalvo() {
  try { return localStorage.getItem(CHAVE_PERIODO) || "30d"; } catch { return "30d"; }
}

function saudacao(nome) {
  const h = new Date().getHours();
  const parte = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const primeiro = nome?.trim().split(" ")[0];
  return primeiro ? `${parte}, ${primeiro}.` : `${parte}.`;
}

function dataExtenso() {
  const s = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const iniciais = (nome = "") =>
  nome.trim().split(/\s+/).filter(Boolean).map((p) => p[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase();

function situacao(c) {
  if (c.status === "pronto") return { rotulo: "Revisada", cls: "bg-success/10 text-success", dot: "bg-success" };
  if (c.status === "em_analise") return { rotulo: "Gerando", cls: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground animate-pulse" };
  return { rotulo: "Nova", cls: "bg-primary/15 text-primary-ink", dot: "bg-primary" };
}

const Esqueleto = ({ h = "h-40" }) => <div className={`${h} rounded-lg bg-secondary animate-pulse`} />;

/**
 * Painel inicial (dashboard). Somente leitura: tudo vem dos casos recebidos
 * por webhook, agregados em features/painel/indicadores.js.
 */
export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { casos, loading } = useCasosWebhook();
  const [periodoId, setPeriodoId] = useState(periodoSalvo);
  const escolherPeriodo = (id) => {
    setPeriodoId(id);
    try { localStorage.setItem(CHAVE_PERIODO, id); } catch { /* sem armazenamento: só nesta visita */ }
  };
  const ind = useMemo(() => calcularIndicadores(casos, periodoId), [casos, periodoId]);
  const rotuloPeriodo = ind.periodo.id === "7d" ? "últimos 7 dias" : ind.periodo.id === "30d" ? "últimos 30 dias" : "últimos 12 meses";
  const abrirFila = () => navigate("/entrevista?fila=pendentes");
  const abrirCaso = (id) => navigate(`/entrevista?caso=${encodeURIComponent(id)}`);
  // Detalhamento: janela com os casos por trás do número/barra clicado.
  const [alvo, setAlvo] = useState(null);
  const ver = (titulo, casosLista, descricao = rotuloPeriodo) => setAlvo({ titulo, casos: casosLista || [], descricao });

  const kpis = [
    {
      rotulo: "Na fila", valor: ind.naFila, spark: ind.serie.map((s) => s.fila), cor: "#f2a900",
      abrir: () => ver("Casos na fila", ind.listas.naFila, "aguardando revisão, do mais antigo ao mais novo"),
      selo: ind.atrasados > 0
        ? <span className="px-1.5 py-px rounded-full bg-primary/15 text-primary-ink font-semibold">{ind.atrasados} há +{DIAS_ALERTA} dias</span>
        : <span>nenhuma atrasada</span>,
    },
    {
      rotulo: "Recebidas", valor: ind.recebidas, spark: ind.serie.map((s) => s.recebidas), cor: "#141414",
      abrir: () => ver("Entrevistas recebidas", ind.listas.recebidas),
      selo: (
        <>
          <span className={`px-1.5 py-px rounded-full font-semibold ${ind.variacao >= 0 ? "bg-success/10 text-success" : "bg-secondary text-muted-foreground"}`}>
            {ind.variacao >= 0 ? "▲" : "▼"} {Math.abs(ind.variacao)}
          </span>{" "}vs. período anterior
        </>
      ),
    },
    {
      rotulo: "Revisadas", valor: ind.revisadas, spark: ind.serie.map((s) => s.revisadas), cor: "#141414",
      abrir: () => ver("Revisadas", ind.listas.revisadas),
      selo: <span>{ind.taxaRevisao}% das recebidas</span>,
    },
    {
      rotulo: "Valor das causas", valor: brlCompacto(ind.valorTotal), spark: ind.serie.map((s) => s.valor), cor: "#141414",
      abrir: () => ver("Casos por valor da causa", ind.listas.porValor, `${rotuloPeriodo} · do maior para o menor`),
      selo: <span>estimado{ind.valorMedio ? ` · média ${brlCompacto(ind.valorMedio)}` : ""}</span>,
    },
  ];
  const recentes = casos.slice(0, 6);

  return (
    <div>
      {/* Faixa preta */}
      <section className="bg-[#0f0f0f] text-white">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-6 pb-16 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="label-caps !text-white/45">{dataExtenso()}</p>
            <h1 className="font-playfair text-3xl lg:text-[34px] leading-tight mt-1 tracking-tight">{saudacao(user?.full_name)}</h1>
            {!loading && (
              <p className="text-[13px] text-white/60 mt-1">
                {ind.atrasados > 0 ? (
                  <>
                    <button
                      onClick={() => ver(`Na fila há mais de ${DIAS_ALERTA} dias`, ind.listas.atrasados, "do mais antigo ao mais novo")}
                      className="text-primary font-medium underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                    >
                      {ind.atrasados} {ind.atrasados === 1 ? "caso está" : "casos estão"}
                    </button>{" "}
                    na fila há mais de {DIAS_ALERTA} dias.
                  </>
                ) : ind.naFila > 0 ? (
                  <>{ind.naFila} {ind.naFila === 1 ? "caso aguarda" : "casos aguardam"} revisão. Nenhum atrasado.</>
                ) : "Fila em dia. Nenhum caso aguardando revisão."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-0.5 p-1 rounded-full bg-white/10" role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => escolherPeriodo(p.id)}
                  aria-pressed={periodoId === p.id}
                  className={`px-3 h-7 rounded-full text-xs font-medium transition-colors ${
                    periodoId === p.id ? "bg-primary text-primary-foreground" : "text-white/65 hover:text-white"
                  }`}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
            <button
              onClick={abrirFila}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-white text-[#0f0f0f] text-sm font-semibold hover:bg-white/90 transition"
            >
              Gerar petição <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 pb-10">
        {/* Números com tendência */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 -mt-10">
          {kpis.map((k) => (
            <button
              key={k.rotulo}
              type="button"
              onClick={k.abrir}
              disabled={loading}
              className="text-left bg-card border border-border rounded-xl px-4 py-3.5 card-soft hover:border-foreground/25 hover:card-soft-lg transition-all group"
            >
              <p className="label-caps">{k.rotulo}</p>
              <div className="flex items-end justify-between gap-2 mt-1.5">
                <p className="text-[24px] lg:text-[26px] font-medium text-foreground leading-none tabular-nums whitespace-nowrap">
                  {loading ? "—" : k.valor}
                </p>
                {!loading && <Sparkline valores={k.spark} cor={k.cor} largura={72} altura={24} />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 flex items-center">
                <span className="flex-1">{loading ? " " : k.selo}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-foreground transition-colors" />
              </p>
            </button>
          ))}
        </div>

        {/* Fluxo + andamento */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-3 mt-3">
          <Cartao titulo="Fluxo de entrevistas" subtitulo={ind.periodo.id === "7d" ? "por dia" : ind.periodo.id === "30d" ? "por semana · 8 semanas" : "por mês · 12 meses"} extra={<LegendaFluxo />}>
            {loading ? <Esqueleto h="h-48" /> : <LinhasFluxo dados={ind.serie} onSelecionar={(d) => ver(`Recebidas · ${d.titulo.charAt(0).toUpperCase() + d.titulo.slice(1)}`, d.casos, "")} />}
          </Cartao>
          <Cartao titulo="Andamento" subtitulo={`das ${ind.recebidas} recebidas · ${rotuloPeriodo}`}>
            {loading ? <Esqueleto h="h-36" /> : (
              <>
                <Funil etapas={ind.funil} onSelecionar={(e) => ver(e.rotulo, e.lista)} />
                {ind.comPendencias > 0 && (
                  <button onClick={() => ver("Peças com campos pendentes", ind.listas.pendentes)} className="mt-4 w-full flex items-center gap-2 text-left text-xs text-primary-ink bg-primary/10 hover:bg-primary/15 rounded-lg px-3 py-2 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {ind.comPendencias} {ind.comPendencias === 1 ? "peça com campos pendentes" : "peças com campos pendentes"}
                    <ChevronRight className="w-3.5 h-3.5 ml-auto" />
                  </button>
                )}
              </>
            )}
          </Cartao>
        </div>

        {/* Atenção + pedidos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
          <Cartao
            titulo="Precisa de atenção"
            subtitulo="casos há mais tempo na fila"
            extra={<button onClick={abrirFila} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center">Abrir fila <ChevronRight className="w-3.5 h-3.5" /></button>}
          >
            {loading ? <Esqueleto h="h-40" /> : ind.atencao.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Fila vazia. Bom trabalho.</p>
            ) : (
              <ul>
                {ind.atencao.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => abrirCaso(a.id)} className="w-full flex items-center gap-3 py-2 border-t border-border first:border-t-0 text-left hover:bg-[hsl(45_14%_98%)] -mx-1 px-1 rounded-md transition-colors">
                      <span className="w-7 h-7 rounded-full bg-secondary text-muted-foreground text-[10.5px] font-semibold flex items-center justify-center shrink-0">{iniciais(a.nome)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-foreground truncate">{a.nome}</span>
                        <span className="block text-[11.5px] text-muted-foreground truncate">
                          {a.reclamada}{a.pendencias > 0 && <span className="text-primary-ink"> · {a.pendencias} {a.pendencias === 1 ? "pendência" : "pendências"}</span>}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        a.gerando ? "bg-secondary text-muted-foreground"
                          : a.dias >= DIAS_CRITICO ? "bg-destructive/10 text-destructive"
                          : a.dias >= DIAS_ALERTA ? "bg-primary/15 text-primary-ink"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {a.gerando ? "gerando" : a.dias === 0 ? "hoje" : `${a.dias} ${a.dias === 1 ? "dia" : "dias"}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao titulo="Pedidos mais frequentes" subtitulo={rotuloPeriodo} extra={<span className="label-caps">casos · valor</span>}>
            {loading ? <Esqueleto h="h-40" /> : ind.pedidos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem pedidos no período</p>
            ) : (
              <ol>
                {ind.pedidos.map((p, i) => (
                  <li key={p.rotulo} className="border-t border-border first:border-t-0">
                  <button onClick={() => ver(`Pedido: ${p.rotulo}`, p.lista)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-[hsl(45_14%_98%)] -mx-1 px-1 rounded-md transition-colors">
                    <span className="w-4 text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] text-foreground truncate">{p.rotulo}</span>
                        <span className="text-[11.5px] text-muted-foreground whitespace-nowrap tabular-nums">
                          {p.casos} · <span className="font-semibold text-foreground">{p.valor >= 1 ? brlCompacto(p.valor) : "a apurar"}</span>
                        </span>
                      </span>
                      <span className="block h-1 mt-1.5 bg-secondary rounded-full overflow-hidden">
                        <span className="block h-full bg-foreground rounded-full" style={{ width: `${ind.recebidas ? (p.casos / ind.recebidas) * 100 : 0}%` }} />
                      </span>
                    </span>
                  </button>
                  </li>
                ))}
              </ol>
            )}
          </Cartao>
        </div>

        {/* Categoria/dispensa + reclamadas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
          <Cartao titulo="Categoria (CCT)" subtitulo={rotuloPeriodo}>
            {loading ? <Esqueleto h="h-28" /> : (
              <>
                <BarraSegmentada itens={ind.categorias} onSelecionar={(c) => ver(`Categoria: ${c.rotulo}`, c.lista)} />
                <div className="border-t border-border mt-4 pt-3">
                  <h3 className="text-[13px] font-semibold text-foreground mb-2">Tipo de dispensa</h3>
                  {ind.dispensas.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem dados no período</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ind.dispensas.map((d) => (
                        <button
                          key={d.rotulo}
                          onClick={() => ver(`Dispensa: ${d.rotulo}`, d.lista)}
                          className="inline-flex items-center gap-1.5 bg-secondary hover:bg-foreground hover:text-background rounded-full px-2.5 py-1 text-xs text-foreground/85 transition-colors group"
                        >
                          {d.rotulo} <span className="font-semibold text-foreground group-hover:text-background tabular-nums">{d.valor}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </Cartao>

          <Cartao titulo="Reclamadas recorrentes" subtitulo={rotuloPeriodo} extra={<span className="label-caps">casos · valor</span>}>
            {loading ? <Esqueleto h="h-40" /> : ind.reclamadas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem dados no período</p>
            ) : (
              <ul>
                {ind.reclamadas.map((r) => (
                  <li key={r.rotulo} className="border-t border-border first:border-t-0">
                  <button onClick={() => ver(r.rotulo, r.lista)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-[hsl(45_14%_98%)] -mx-1 px-1 rounded-md transition-colors">
                    <span className="w-7 h-7 rounded-full bg-[#0f0f0f] text-primary text-[10.5px] font-semibold flex items-center justify-center shrink-0">{iniciais(r.rotulo)}</span>
                    <span className="flex-1 min-w-0 text-[13px] font-medium text-foreground truncate" title={r.rotulo}>{r.rotulo}</span>
                    <span className="text-[11.5px] text-muted-foreground whitespace-nowrap">{r.casos} {r.casos === 1 ? "caso" : "casos"}</span>
                    <span className={`w-[72px] text-right text-[13px] tabular-nums ${r.valor >= 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{r.valor >= 1 ? brlCompacto(r.valor) : "a apurar"}</span>
                  </button>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        {/* Últimas entrevistas */}
        <div className="mt-3 bg-card border border-border rounded-xl overflow-hidden card-soft">
          <div className="flex items-center justify-between px-4 lg:px-5 py-3.5">
            <h2 className="text-[13px] font-semibold text-foreground">Últimas entrevistas</h2>
            <button onClick={abrirFila} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
              Abrir fila <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="hidden sm:grid grid-cols-[1.4fr_1.4fr_.8fr_.7fr_20px] gap-3 px-4 lg:px-5 py-2 bg-[hsl(45_14%_98%)] border-y border-border label-caps">
            <span>Reclamante</span><span>Reclamada</span><span>Recebida em</span><span>Situação</span><span />
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : recentes.length === 0 ? (
            <div className="text-center py-10 px-4">
              <Inbox className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-foreground">Nenhuma entrevista recebida ainda</p>
              <p className="text-xs text-muted-foreground mt-1">As entrevistas do Fav Sales aparecem aqui assim que chegam.</p>
            </div>
          ) : (
            <ul>
              {recentes.map((c) => {
                const s = situacao(c);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => abrirCaso(c.id)}
                      className="w-full text-left grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1.4fr_.8fr_.7fr_20px] gap-x-3 gap-y-0.5 items-center px-4 lg:px-5 py-3 border-t border-border first:border-t-0 hover:bg-[hsl(45_14%_98%)] transition-colors group"
                    >
                      <span className="text-[13px] font-medium text-foreground truncate">{c.recl_nome || c.titulo || "(sem nome)"}</span>
                      <span className="text-[13px] text-muted-foreground truncate hidden sm:block">{c.recl1_nome || "—"}</span>
                      <span className="text-xs text-muted-foreground hidden sm:block tabular-nums">
                        {c.created_date ? new Date(c.created_date).toLocaleDateString("pt-BR") : "—"}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 w-max px-2 py-0.5 rounded-full text-[11px] font-medium ${s.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {s.rotulo}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground hidden sm:block" />
                      <span className="text-xs text-muted-foreground truncate sm:hidden col-span-2">{c.recl1_nome || "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ListaCasos alvo={alvo} onFechar={() => setAlvo(null)} pendencias={ind.pendencias} />
    </div>
  );
}
