import { useState } from "react";
import Templates from "@/pages/Templates";
import ModelosReferencia from "@/pages/ModelosReferencia";

/**
 * Página única de modelos: reúne os modelos de petição (DOCX tokenizados)
 * e os modelos de referência/integrações em abas, evitando dois itens de menu.
 */
const ABAS = [
  { id: "peticao", label: "Modelos de Petição" },
  { id: "referencia", label: "Referências e Integrações" },
];

export default function Modelos() {
  const [aba, setAba] = useState("peticao");

  return (
    <div className="h-full flex flex-col">
      <div className="border-b bg-card/60 px-6 lg:px-8 pt-5">
        <div className="max-w-6xl mx-auto flex gap-1">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                aba === a.id
                  ? "border-primary text-primary-ink bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {aba === "peticao" ? <Templates /> : <ModelosReferencia />}
      </div>
    </div>
  );
}