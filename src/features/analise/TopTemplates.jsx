import { Card } from "@/components/ui/card";
import { FileText, FolderOpen } from "lucide-react";
import { Link } from "react-router-dom";

const CASE_TYPE_COLORS = {
  trabalhista: "bg-blue-100 text-blue-700",
  civel: "bg-purple-100 text-purple-700",
  previdenciario: "bg-green-100 text-green-700",
  consumidor: "bg-orange-100 text-orange-700",
  outro: "bg-gray-100 text-gray-700",
};

export default function TopTemplates({ templates }) {
  const active = templates.filter(t => t.is_active).slice(0, 6);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Modelos de Petição</h3>
        <Link to="/modelos" className="text-sm text-primary hover:underline">
          Ver todos
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum modelo ativo</p>
          <Link to="/modelos" className="text-primary text-xs hover:underline mt-1 inline-block">
            Adicionar modelo
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.name}</p>
                {(t.tags || []).length > 0 && (
                  <p className="text-xs text-muted-foreground truncate">{t.tags.join(", ")}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${CASE_TYPE_COLORS[t.case_type] || CASE_TYPE_COLORS.outro}`}>
                {t.case_type}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}