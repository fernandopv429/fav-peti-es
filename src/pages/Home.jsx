import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight, Inbox, Loader2 } from "lucide-react";
import { useAuth } from "@/app/auth/AuthContext";
import { useCasosWebhook } from "@/features/entrevista/useCasosWebhook";
import { PERIODOS, calcularIndicadores, brlCompacto } from "@/features/painel/indicadores";
import { Cartao, Colunas, Barras } from "@/features/painel/Graficos";

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

function situacao(c) {
  if (c.status === "pronto") return { rotulo: "Revisada", cls: "bg-success/10 text-success", dot: "bg-success" };
  if (c.status === "em_analise") return { rotulo: "Gerando", cls: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground animate-pulse" };
  return { rotulo: "Nova", cls: "bg-primary/15 text-primary-ink", dot: "bg-primary" };
}

/**
 * Painel inicial (dashboard): saudação e filtro de período na faixa preta,
 * quatro números, gráficos do fluxo de entrevistas e a fila mais recente.
 * Somente leitura.
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
  const rotuloPeriodo = ind.periodo.id === "ano" ? "últimos 12 meses" : `últimos ${ind.periodo.dias} dias`;

  const numeros = [
    {
      rotulo: "Na fila", valor: ind.naFila,
      nota: ind.diasMaisAntiga == null ? "nenhuma pendente" : ind.diasMaisAntiga === 0 ? "mais antiga de hoje" : `mais antiga há ${ind.diasMaisAntiga} ${ind.diasMaisAntiga === 1 ? "dia" : "dias"}`,
      notaCls: "text-primary-ink",
    },
    { rotulo: "Recebidas", valor: ind.recebidas, nota: `${ind.variacao >= 0 ? "+" : "−"}${Math.abs(ind.variacao)} vs. período anterior`, notaCls: "text-muted-foreground" },
    { rotulo: "Revisadas", valor: ind.revisadas, nota: "das recebidas no período", notaCls: "text-success" },
    { rotulo: "Valor das causas", valor: brlCompacto(ind.valorTotal), nota: ind.valorMedio ? `estimado · média ${brlCompacto(ind.valorMedio)}` : "estimado", notaCls: "text-muted-foreground" },
  ];
  const recentes = casos.slice(0, 8);

  return (
    <div>
      {/* Faixa preta: continuação da barra superior */}
      <section className="bg-[#0f0f0f] text-white">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-6 pb-16 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="label-caps !text-white/45">{dataExtenso()}</p>
            <h1 className="font-playfair text-3xl lg:text-[34px] leading-tight mt-1 tracking-tight">
              {saudacao(user?.full_name)}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 rounded-full bg-white/10" role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => escolherPeriodo(p.id)}
                  aria-pressed={periodoId === p.id}
                  className={`px-3 h-7 rounded-full text-xs font-medium transition-colors ${
                    periodoId === p.id ? "bg-primary text-primary-foreground" : "text-white/70 hover:text-white"
                  }`}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
            <button
              onClick={() => navigate("/entrevista")}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-white text-[#0f0f0f] text-sm font-semibold hover:bg-white/90 transition"
            >
              Gerar petição <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 pb-10">
        {/* Números (sobrepostos à faixa) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 -mt-10">
          {numeros.map((n) => (
            <div key={n.rotulo} className="bg-card border border-border rounded-xl px-4 py-3.5 card-soft">
              <p className="label-caps">{n.rotulo}</p>
              <p className="text-[24px] lg:text-[26px] font-medium text-foreground mt-1.5 leading-none tabular-nums whitespace-nowrap">
                {loading ? "—" : n.valor}
              </p>
              <p className={`text-xs mt-1.5 ${n.notaCls}`}>{n.nota}</p>
            </div>
          ))}
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3 mt-3">
          <Cartao titulo="Entrevistas recebidas" extra={ind.periodo.id === "7d" ? "por dia" : ind.periodo.id === "30d" ? "por semana · 8 semanas" : "por mês · 12 meses"}>
            {loading ? <div className="h-44 rounded-lg bg-secondary animate-pulse" /> : <Colunas dados={ind.serie} />}
          </Cartao>
          <Cartao titulo="Pedidos mais frequentes" extra={rotuloPeriodo}>
            {loading ? <div className="h-44 rounded-lg bg-secondary animate-pulse" /> : <Barras dados={ind.pedidos} />}
          </Cartao>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <Cartao titulo="Por categoria (CCT)">
            {loading ? <div className="h-28 rounded-lg bg-secondary animate-pulse" /> : <Barras dados={ind.categorias} />}
          </Cartao>
          <Cartao titulo="Tipo de dispensa">
            {loading ? <div className="h-28 rounded-lg bg-secondary animate-pulse" /> : <Barras dados={ind.dispensas} />}
          </Cartao>
          <Cartao titulo="Reclamadas recorrentes">
            {loading ? <div className="h-28 rounded-lg bg-secondary animate-pulse" /> : <Barras dados={ind.reclamadas} />}
          </Cartao>
        </div>

        {/* Fila de entrevistas */}
        <div className="mt-3 bg-card border border-border rounded-xl overflow-hidden card-soft">
          <div className="flex items-center justify-between px-4 lg:px-5 py-3.5">
            <h2 className="text-sm font-semibold text-foreground">Últimas entrevistas</h2>
            <button
              onClick={() => navigate("/entrevista")}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
            >
              Abrir fila <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="hidden sm:grid grid-cols-[1.4fr_1.4fr_.8fr_.7fr_20px] gap-3 px-4 lg:px-5 py-2 bg-[hsl(45_14%_98%)] border-y border-border label-caps">
            <span>Reclamante</span><span>Reclamada</span><span>Recebida em</span><span>Situação</span><span />
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          ) : recentes.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Inbox className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-foreground">Nenhuma entrevista recebida ainda</p>
              <p className="text-xs text-muted-foreground mt-1">
                As entrevistas do Fav Sales aparecem aqui assim que chegam.
              </p>
            </div>
          ) : (
            <ul>
              {recentes.map((c) => {
                const s = situacao(c);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => navigate("/entrevista")}
                      className="w-full text-left grid grid-cols-[1fr_auto] sm:grid-cols-[1.4fr_1.4fr_.8fr_.7fr_20px] gap-x-3 gap-y-0.5 items-center px-4 lg:px-5 py-3 border-t border-border first:border-t-0 sm:first:border-t-0 hover:bg-[hsl(45_14%_98%)] transition-colors group"
                    >
                      <span className="text-sm font-medium text-foreground truncate">
                        {c.recl_nome || c.titulo || "(sem nome)"}
                      </span>
                      <span className="text-sm text-muted-foreground truncate hidden sm:block">{c.recl1_nome || "—"}</span>
                      <span className="text-xs text-muted-foreground hidden sm:block tabular-nums">
                        {c.created_date ? new Date(c.created_date).toLocaleDateString("pt-BR") : "—"}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 w-max px-2 py-0.5 rounded-full text-[11px] font-medium ${s.cls}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                        {s.rotulo}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground hidden sm:block" />
                      <span className="text-xs text-muted-foreground truncate sm:hidden col-span-2">
                        {c.recl1_nome || "—"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
