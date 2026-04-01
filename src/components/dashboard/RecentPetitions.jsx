import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { FileText, ArrowRight } from "lucide-react";

const STATUS_BADGE = {
  rascunho: "bg-muted text-muted-foreground",
  em_geracao: "bg-amber-100 text-amber-700",
  concluida: "bg-blue-100 text-blue-700",
  revisao_necessaria: "bg-red-100 text-red-700",
  pronto_para_protocolo: "bg-green-100 text-green-700",
};

const STATUS_LABELS = {
  rascunho: "Rascunho",
  em_geracao: "Em Geração",
  concluida: "Aguard. Revisão",
  revisao_necessaria: "Revisão Necessária",
  pronto_para_protocolo: "Pronto p/ Protocolo",
};

export default function RecentPetitions({ petitions }) {
  const recent = petitions;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Petições Recentes</h3>
        <Link to="/peticoes" className="text-sm text-primary hover:underline flex items-center gap-1">
          Ver todas <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma petição criada ainda</p>
          <Link to="/nova-peticao" className="text-primary text-sm hover:underline mt-1 inline-block">
            Criar primeira petição
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {recent.map((p) => (
            <Link
              key={p.id}
              to={`/peticoes/${p.id}`}
              className="flex items-center justify-between p-3.5 rounded-xl border hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.claimant_name} vs {p.defendant_name} • {new Date(p.created_date).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${STATUS_BADGE[p.status] || "bg-muted text-muted-foreground"}`}>
                  {STATUS_LABELS[p.status] || p.status}
                </span>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}