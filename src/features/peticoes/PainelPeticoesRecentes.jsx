import { Link } from "react-router-dom";
import { Search, FileText, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatarDataHora } from "@/lib/formatarData";

const STATUS = {
  rascunho:              { label: "Rascunho",            dot: "bg-muted-foreground/50" },
  em_geracao:            { label: "Em geração",          dot: "bg-warning" },
  concluida:             { label: "Aguardando revisão",  dot: "bg-primary" },
  revisao_necessaria:    { label: "Revisão necessária",  dot: "bg-destructive" },
  pronto_para_protocolo: { label: "Pronto p/ protocolo", dot: "bg-success" },
};

/**
 * Trilha lateral da tela Início: as últimas petições e um aviso do que precisa
 * de atenção. Puramente apresentacional — quem busca os dados é a página.
 */
export default function PainelPeticoesRecentes({ petitions = [], loading = false }) {
  const recentes = petitions.slice(0, 6);
  const emRevisao = petitions.filter((p) => p.status === "revisao_necessaria").length;

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold text-foreground">Petições recentes</h2>
        <Link
          to="/peticoes"
          aria-label="Buscar em todas as petições"
          className="w-9 h-9 rounded-full bg-card card-soft flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
        >
          <Search className="w-4 h-4" />
        </Link>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        {loading ? "Carregando…" : `${petitions.length} no total`}
      </p>

      {/* Lista */}
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar -mx-1 px-1">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 rounded-2xl bg-card/60 animate-pulse" />
            ))}
          </div>
        ) : recentes.length === 0 ? (
          <div className="text-center py-10">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma petição ainda.</p>
            <Link to="/nova-peticao" className="text-sm text-primary font-medium hover:underline mt-1 inline-block">
              Criar a primeira
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {recentes.map((p) => {
              const st = STATUS[p.status] || STATUS.rascunho;
              return (
                <Link
                  key={p.id}
                  to={`/peticoes/${p.id}`}
                  className="flex items-center gap-3 p-2 rounded-2xl hover:bg-card transition-colors group"
                >
                  <div className="w-10 h-10 shrink-0 rounded-full bg-card card-soft flex items-center justify-center">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate leading-tight">
                      {p.claimant_name || p.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                      <span className="text-[11px] text-muted-foreground truncate">{st.label}</span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground/70 shrink-0 hidden group-hover:block">
                    {formatarDataHora(p.created_date)?.split(" ")[0]}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Aviso do que precisa de atenção */}
      {!loading && (
        <div className="mt-5 pt-5 border-t border-border/70">
          {emRevisao > 0 ? (
            <>
              <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center mb-3">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <p className="text-sm font-bold text-foreground leading-snug">
                {emRevisao} petição{emRevisao > 1 ? "ões" : ""} precisa
                {emRevisao > 1 ? "m" : ""} de revisão
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Corrija as pendências antes de protocolar.
              </p>
              <Link
                to="/peticoes"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:gap-3 transition-all"
              >
                Revisar agora
                <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            </>
          ) : (
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 shrink-0 rounded-xl bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground leading-snug">Nada pendente</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nenhuma petição aguardando correção.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
