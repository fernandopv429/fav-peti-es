import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { FileText, ArrowRight } from "lucide-react";

const STATUS_BADGE = {
  rascunho: "bg-muted text-muted-foreground",
  em_geracao: "bg-amber-100 text-amber-700",
  concluida: "bg-green-100 text-green-700",
  revisao: "bg-purple-100 text-purple-700",
};

const STATUS_LABELS = {
  rascunho: "Rascunho",
  em_geracao: "Em Geração",
  concluida: "Concluída",
  revisao: "Em Revisão",
};

export default function RecentPetitions({ petitions }) {
  const recent = petitions.slice(0, 5);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Petições Recentes</h3>
        <Link to="/peticoes" className="text-sm text-primary hover:underline flex items-center gap-1">
          Ver todas <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
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
              className="flex items-center justify-between p-4 rounded-xl border hover:bg-muted/50 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.claimant_name} vs {p.defendant_name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_BADGE[p.status]}`}>
                  {STATUS_LABELS[p.status]}
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