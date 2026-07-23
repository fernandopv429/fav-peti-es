import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, Trash2, ScrollText } from "lucide-react";
import { parseRegras, removeRuleFromPrompt } from "@/lib/regraAprendida.js";

/**
 * Seção reutilizável que lista/remove regras aprendidas automaticamente.
 *
 * Modos (mutuamente exclusivos):
 *  - configEntityName: carrega o registro ativo de PetitionConfig/DefesaConfig
 *  - especialistaNumero: carrega um Especialista específico pelo número
 *  - todosEspecialistas: varre todos os Especialistas que possuem regras aprendidas
 *    (cobre o Especialista #32 da Defesa e os usados em "Gerar Documento por IA")
 */
export default function RegrasAprendidas({ configEntityName, especialistaNumero, todosEspecialistas, title }) {
  const [sources, setSources] = useState([]); // [{ label, entityName, id, prompt }]
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null); // `${entityName}:${id}:${idx}`

  useEffect(() => {
    load();
  }, [configEntityName, especialistaNumero, todosEspecialistas]);

  const load = async () => {
    setLoading(true);
    try {
      let list = [];
      if (todosEspecialistas) {
        const all = await base44.entities.Especialista.list("-numero", 200);
        list = (all || [])
          .filter((e) => e.prompt_sistema && e.prompt_sistema.includes("## Regras aprendidas com correções"))
          .map((e) => ({
            label: `#${e.numero} — ${e.titulo || e.name}`,
            entityName: "Especialista",
            id: e.id,
            prompt: e.prompt_sistema,
          }));
      } else if (especialistaNumero) {
        const found = await base44.entities.Especialista.filter({ numero: String(especialistaNumero) });
        const e = found?.[0];
        list = e
          ? [{ label: `#${e.numero} — ${e.titulo || e.name}`, entityName: "Especialista", id: e.id, prompt: e.prompt_sistema || "" }]
          : [];
      } else if (configEntityName) {
        const cfgs = await base44.entities[configEntityName].filter({ ativo: true });
        const c = cfgs?.[0];
        list = c ? [{ label: title || configEntityName, entityName: configEntityName, id: c.id, prompt: c.prompt_sistema || "" }] : [];
      }
      setSources(list);
    } catch (e) {
      toast.error("Erro ao carregar regras: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (source, idx) => {
    const key = `${source.entityName}:${source.id}:${idx}`;
    setRemoving(key);
    try {
      // Busca o prompt mais recente antes de remover (evita stale)
      const list = await base44.entities[source.entityName].filter({ id: source.id });
      const rec = list?.[0];
      if (!rec) throw new Error("Registro não encontrado");
      const newPrompt = removeRuleFromPrompt(rec.prompt_sistema || "", idx);
      await base44.entities[source.entityName].update(source.id, { prompt_sistema: newPrompt });
      setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, prompt: newPrompt } : s)));
      toast.success("Regra removida.");
    } catch (e) {
      toast.error("Erro ao remover regra: " + e.message);
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAnyRule = sources.some((s) => parseRegras(s.prompt).length > 0);

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h2 className="font-semibold text-foreground mb-1 flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-primary" /> {title}
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Regras aprendidas automaticamente nas correções. Revise e remova regras antigas ou redundantes para manter os prompts enxutos.
      </p>
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma fonte de regras encontrada.</p>
      ) : !hasAnyRule ? (
        <p className="text-sm text-muted-foreground italic">Nenhuma regra aprendida ainda.</p>
      ) : (
        <div className="space-y-5">
          {sources.map((source) => {
            const regras = parseRegras(source.prompt);
            if (regras.length === 0) return null;
            return (
              <div key={`${source.entityName}:${source.id}`}>
                {todosEspecialistas && (
                  <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2">{source.label}</p>
                )}
                <ul className="space-y-2">
                  {regras.map((r, i) => {
                    const key = `${source.entityName}:${source.id}:${i}`;
                    return (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-3 p-3 rounded-xl bg-muted/40 border border-border/60"
                      >
                        <span className="text-sm text-foreground flex-1">{r}</span>
                        <button
                          onClick={() => handleRemove(source, i)}
                          disabled={removing === key}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          title="Remover regra"
                        >
                          {removing === key ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}