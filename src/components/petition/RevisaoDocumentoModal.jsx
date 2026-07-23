import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { Plus, Eye, Pencil, ListChecks, Variable, Loader2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import PetitionRenderer from "@/components/petition/PetitionRenderer";
import { LetterheadHeader, LetterheadFooter } from "@/components/petition/PetitionLetterhead";
import PetitionCorrectionChat from "@/components/petition/PetitionCorrectionChat";

/**
 * Extrai todos os placeholders (tokens entre [colchetes]) do documento,
 * com uma descrição limpa (sem prefixos "A PREENCHER:" / "PENDÊNCIA:").
 */
function extrairPlaceholders(texto) {
  if (!texto) return [];
  const re = /\[([^\]]+)\]/g;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(texto))) {
    const token = m[0];
    if (seen.has(token)) continue;
    seen.add(token);
    const inner = m[1].trim();
    const desc = inner
      .replace(/^A PREENCHER:?\s*/i, "")
      .replace(/^PEND[ÊE]NCIA:?\s*/i, "")
      .replace(/^A PREENCHER\s+/i, "")
      .trim() || inner;
    out.push({ token, desc });
  }
  return out;
}

/**
 * Modal de revisão pós-geração por IA:
 *  - Documento editável (correção local) ou visualização com timbre
 *  - Chat lateral com IA (embutido, reaproveita aprendizado de regras)
 *  - Lista de placeholders com descrição + preenchimento local
 *  - Análise por IA: revela o que a IA capturou para cada placeholder
 *  - Inserção de novos placeholders direto no texto do documento
 */
export default function RevisaoDocumentoModal({ open, onOpenChange, texto, onTextoChange, petition, learningTarget, petitionConfig }) {
  const [modo, setModo] = useState("editar");
  const [novoPlaceholder, setNovoPlaceholder] = useState("");
  const [contextoCaso, setContextoCaso] = useState("");
  const [valoresIA, setValoresIA] = useState({});
  const [analisando, setAnalisando] = useState(false);
  const textareaRef = useRef(null);

  const placeholders = useMemo(() => extrairPlaceholders(texto), [texto]);

  // Carrega o contexto do caso (additional_facts) da petição salva
  useEffect(() => {
    if (!open || !petition?.id) return;
    base44.entities.Petition.filter({ id: petition.id })
      .then((r) => setContextoCaso(r?.[0]?.additional_facts || ""))
      .catch(() => {});
  }, [open, petition?.id]);

  const atualizarTexto = (novo) => onTextoChange?.(novo);

  const preencherPlaceholder = (token, valor) => {
    if (!valor || !valor.trim()) return;
    const novo = texto.split(token).join(valor.trim());
    atualizarTexto(novo);
    toast.success("Placeholder preenchido no documento.");
  };

  const inserirPlaceholder = () => {
    const desc = novoPlaceholder.trim();
    if (!desc) return;
    const token = `[A PREENCHER: ${desc}]`;
    const ta = textareaRef.current;
    let novo;
    if (ta && modo === "editar") {
      const start = ta.selectionStart ?? texto.length;
      const end = ta.selectionEnd ?? texto.length;
      novo = texto.slice(0, start) + token + texto.slice(end);
      setTimeout(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + token.length;
      }, 0);
    } else {
      novo = texto + "\n" + token;
    }
    atualizarTexto(novo);
    setNovoPlaceholder("");
    toast.success("Placeholder adicionado ao documento.");
  };

  // Pede à IA o valor que ela capturou para cada placeholder, com base no contexto do caso
  const handleAnalisarPlaceholders = async () => {
    if (placeholders.length === 0) {
      toast.info("Nenhum placeholder encontrado no documento.");
      return;
    }
    setAnalisando(true);
    try {
      const lista = placeholders.map((p) => p.token).join("\n");
      const prompt = `Você é um assistente jurídico. Um documento jurídico foi gerado por IA e ainda contém placeholders entre colchetes (ex: [NOME DO RECLAMANTE]).
Para CADA placeholder, determine qual valor deve preenchê-lo com base nos dados do caso e no contexto do documento gerado.
- Use exclusivamente dados reais presentes no contexto/dados do caso. Nunca invente valores.
- Se o valor não estiver disponível, retorne string vazia "".

DADOS DO CASO (contexto fornecido pelo advogado):
${contextoCaso || "(não disponível)"}

DOCUMENTO GERADO:
${texto}

PLACEHOLDERS A PREENCHER (token exato, incluindo colchetes):
${lista}

Retorne um JSON no formato:
{ "preenchimentos": [ { "token": "<token exato>", "valor": "<valor a preencher ou string vazia>" } ] }
Inclua uma entrada para cada placeholder listado.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            preenchimentos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  token: { type: "string" },
                  valor: { type: "string" },
                },
              },
            },
          },
          required: ["preenchimentos"],
        },
      });

      const map = {};
      (result?.preenchimentos || []).forEach((p) => {
        map[p.token] = (p.valor || "").trim();
      });
      setValoresIA(map);
      const identificados = Object.values(map).filter((v) => v).length;
      toast.success(`IA analisou ${placeholders.length} placeholder(s) — ${identificados} com valor identificado.`);
    } catch (e) {
      toast.error("Erro ao analisar placeholders: " + e.message);
    } finally {
      setAnalisando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1400px] w-[95vw] h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-border flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-primary" /> Revisão do Documento — Correção e Placeholders
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={modo === "editar" ? "default" : "outline"} onClick={() => setModo("editar")}>
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Button>
            <Button size="sm" variant={modo === "visualizar" ? "default" : "outline"} onClick={() => setModo("visualizar")}>
              <Eye className="w-3.5 h-3.5" /> Visualizar
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] overflow-hidden">
          {/* Documento */}
          <div className="border-r border-border overflow-hidden flex flex-col min-h-0">
            {modo === "editar" ? (
              <textarea
                ref={textareaRef}
                value={texto}
                onChange={(e) => atualizarTexto(e.target.value)}
                className="flex-1 w-full resize-none bg-background text-foreground p-6 text-sm font-mono leading-relaxed overflow-y-auto focus:outline-none min-h-0"
                placeholder="Documento gerado..."
              />
            ) : (
              <div className="flex-1 overflow-y-auto p-6 bg-card min-h-0">
                <LetterheadHeader config={petitionConfig} />
                <PetitionRenderer content={texto} />
                <LetterheadFooter config={petitionConfig} />
              </div>
            )}
          </div>

          {/* Lateral: chat + placeholders */}
          <div className="flex flex-col overflow-hidden bg-background min-h-0">
            {/* Chat embutido */}
            <div className="h-[55%] border-b border-border overflow-hidden min-h-0">
              <PetitionCorrectionChat
                petition={petition}
                learningTarget={learningTarget}
                petitionConfig={petitionConfig}
                embedded
                onFieldsUpdated={(fields) => {
                  if (fields.generated_content) atualizarTexto(fields.generated_content);
                }}
              />
            </div>

            {/* Placeholders */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Variable className="w-3.5 h-3.5 text-primary" />
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Placeholders ({placeholders.length})
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAnalisarPlaceholders}
                  disabled={analisando || placeholders.length === 0}
                  className="h-7 px-2 text-xs"
                >
                  {analisando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {analisando ? "Analisando..." : "Analisar com IA"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/80 -mt-1">
                A IA revela o que capturou para cada placeholder. Confirme, corrija ou preencha localmente.
              </p>

              {placeholders.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2">Nenhum placeholder encontrado no documento.</p>
              ) : (
                placeholders.map((p, i) => {
                  const valorIA = valoresIA[p.token];
                  const analisado = p.token in valoresIA;
                  return (
                    <div key={`${p.token}-${i}`} className="p-2.5 rounded-xl bg-muted/40 border border-border/60 space-y-1.5">
                      <p className="text-xs text-foreground font-medium break-words">{p.desc}</p>

                      {/* Valor capturado pela IA */}
                      {analisado && (
                        <div className={`flex items-start gap-1.5 p-1.5 rounded-md text-xs ${valorIA ? "bg-green-50 border border-green-200 text-green-800" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                          <span className="font-semibold shrink-0">IA:</span>
                          <span className="flex-1 break-words">{valorIA || "(não identificado nos dados do caso)"}</span>
                          {valorIA && (
                            <button
                              onClick={() => preencherPlaceholder(p.token, valorIA)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors shrink-0 font-medium"
                              title="Aplicar valor da IA no documento"
                            >
                              <Check className="w-3 h-3" /> Aplicar
                            </button>
                          )}
                        </div>
                      )}

                      <Input
                        placeholder={`Preencher: ${p.desc}`}
                        onBlur={(e) => {
                          if (e.target.value.trim()) {
                            preencherPlaceholder(p.token, e.target.value);
                            e.target.value = "";
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = e.target.value;
                            if (val.trim()) {
                              preencherPlaceholder(p.token, val);
                              e.target.value = "";
                            }
                          }
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                  );
                })
              )}

              {/* Adicionar placeholder */}
              <div className="pt-2 mt-1 border-t border-border space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Adicionar placeholder</p>
                <div className="flex gap-2">
                  <Input
                    value={novoPlaceholder}
                    onChange={(e) => setNovoPlaceholder(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") inserirPlaceholder(); }}
                    placeholder="Descrição do campo"
                    className="h-8 text-xs"
                  />
                  <Button size="sm" onClick={inserirPlaceholder} disabled={!novoPlaceholder.trim()} className="h-8 px-2.5">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}