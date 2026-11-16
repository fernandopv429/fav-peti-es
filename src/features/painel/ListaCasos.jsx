import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { valorCausaEstimado, brlCompacto, lerData, nomeCurto } from "@/features/painel/indicadores";

function situacao(c) {
  if (c.status === "pronto") return { rotulo: "Revisada", cls: "bg-success/10 text-success", dot: "bg-success" };
  if (c.status === "em_analise") return { rotulo: "Gerando", cls: "bg-secondary text-muted-foreground", dot: "bg-muted-foreground animate-pulse" };
  return { rotulo: "Nova", cls: "bg-primary/15 text-primary-ink", dot: "bg-primary" };
}

/**
 * Detalhamento de um indicador: lista os casos por trás do número/barra
 * clicado. Cada linha abre o caso direto na tela de Entrevistas.
 * `alvo` = { titulo, descricao?, casos: [], mostrarValor? } | null
 */
export default function ListaCasos({ alvo, onFechar, pendencias }) {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const aberto = !!alvo;
  const termo = busca.trim().toLowerCase();
  const casos = (alvo?.casos || []).filter((c) =>
    !termo || `${c.recl_nome || ""} ${c.titulo || ""} ${c.recl1_nome || ""}`.toLowerCase().includes(termo),
  );

  const abrir = (c) => {
    onFechar();
    navigate(`/entrevista?caso=${encodeURIComponent(c.id)}`);
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) { setBusca(""); onFechar(); } }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border text-left">
          <DialogTitle className="text-base">{alvo?.titulo}</DialogTitle>
          <DialogDescription className="text-xs">
            {alvo?.descricao ? `${alvo.descricao} · ` : ""}{alvo?.casos?.length || 0} {alvo?.casos?.length === 1 ? "caso" : "casos"} · clique para abrir
          </DialogDescription>
          {(alvo?.casos?.length || 0) > 6 && (
            <div className="relative mt-3">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Filtrar por reclamante ou reclamada"
                className="w-full h-9 pl-8 pr-3 text-sm rounded-lg border border-border bg-card focus:outline-none focus:border-primary"
              />
            </div>
          )}
        </DialogHeader>

        <ul className="max-h-[60vh] overflow-y-auto">
          {casos.length === 0 ? (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum caso encontrado</li>
          ) : casos.map((c) => {
            const s = situacao(c);
            const valor = valorCausaEstimado(c);
            const pend = pendencias?.get(c.id) || 0;
            const data = lerData(c.created_date);
            return (
              <li key={c.id}>
                <button
                  onClick={() => abrir(c)}
                  className="w-full flex items-center gap-3 px-5 py-3 border-t border-border first:border-t-0 text-left hover:bg-[hsl(45_14%_98%)] transition-colors group"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground truncate">{c.recl_nome || c.titulo || "(sem nome)"}</span>
                    <span className="block text-[11.5px] text-muted-foreground truncate">
                      {c.recl1_nome ? nomeCurto(c.recl1_nome) : "—"}
                      {!isNaN(data) && ` · ${data.toLocaleDateString("pt-BR")}`}
                      {pend > 0 && c.status !== "pronto" && <span className="text-primary-ink"> · {pend} {pend === 1 ? "pendência" : "pendências"}</span>}
                    </span>
                  </span>
                  {alvo?.mostrarValor !== false && (
                    <span className={`text-[12.5px] tabular-nums whitespace-nowrap ${valor >= 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {valor >= 1 ? brlCompacto(valor) : "a apurar"}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${s.cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.rotulo}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
