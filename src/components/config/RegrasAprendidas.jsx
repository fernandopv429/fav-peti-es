import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, Trash2, ScrollText } from "lucide-react";

const SECTION_HEADER = "## Regras aprendidas com correções";

/**
 * Seção reutilizável que lista as regras aprendidas automaticamente
 * (parseadas da seção "## Regras aprendidas com correções" do prompt_sistema
 * de PetitionConfig ou DefesaConfig) e permite remover regras individuais.
 */
export default function RegrasAprendidas({ configEntityName, title }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [removingIdx, setRemovingIdx] = useState(null);

  useEffect(() => {
    load();
  }, [configEntityName]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities[configEntityName].filter({ ativo: true });
      setConfig(list[0] || null);
    } catch (e) {
      toast.error("Erro ao carregar regras: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const parseRegras = (prompt) => {
    if (!prompt || !prompt.includes(SECTION_HEADER)) return [];
    const afterHeader = prompt.split(SECTION_HEADER)[1] || "";
    const lines = afterHeader.split("\n");
    const regras = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) {
        if (regras.length > 0) break;
        continue;
      }
      if (t.startsWith("## ")) break; // próxima seção
      if (t.startsWith("- ")) {
        regras.push(t.slice(2).trim());
      } else if (regras.length > 0) {
        break;
      }
    }
    return regras;
  };

  const handleRemove = async (idx) => {
    if (!config) return;
    setRemovingIdx(idx);
    try {
      const prompt = config.prompt_sistema || "";
      const parts = prompt.split(SECTION_HEADER);
      const before = parts[0];
      let rulesSection = parts.slice(1).join(SECTION_HEADER) || "";
      const ruleLines = rulesSection.split("\n");
      let removed = 0;
      const newLines = ruleLines.filter((line) => {
        if (line.trim().startsWith("- ")) {
          if (removed === idx) {
            removed++;
            return false;
          }
          removed++;
        }
        return true;
      });
      const newRulesSection = newLines.join("\n").trimEnd();
      let newPrompt;
      if (newRulesSection) {
        newPrompt = before.trimEnd() + "\n\n" + SECTION_HEADER + "\n" + newRulesSection;
      } else {
        // Sem regras restantes — remove a seção inteira
        newPrompt = before.trimEnd();
      }
      await base44.entities[configEntityName].update(config.id, { prompt_sistema: newPrompt });
      setConfig((prev) => ({ ...prev, prompt_sistema: newPrompt }));
      toast.success("Regra removida.");
    } catch (e) {
      toast.error("Erro ao remover regra: " + e.message);
    } finally {
      setRemovingIdx(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const regras = config ? parseRegras(config.prompt_sistema) : [];

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-primary" /> {title}
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Regras aprendidas automaticamente nas correções. Revise e remova regras antigas ou redundantes para manter o prompt enxuto.
      </p>
      {!config ? (
        <p className="text-sm text-muted-foreground">Nenhuma configuração ativa encontrada.</p>
      ) : regras.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Nenhuma regra aprendida ainda.</p>
      ) : (
        <ul className="space-y-2">
          {regras.map((r, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/40 border border-border/60"
            >
              <span className="text-sm text-foreground flex-1">{r}</span>
              <button
                onClick={() => handleRemove(i)}
                disabled={removingIdx === i}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="Remover regra"
              >
                {removingIdx === i ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}