import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, Send, X, MessageSquare, BookmarkCheck, Wand2 } from "lucide-react";

/**
 * Chat flutuante de correção de defesas/contestações por comando em linguagem natural.
 * Análogo ao PetitionCorrectionChat, mas operando sobre a entidade Defesa e DefesaConfig.
 *
 * Histórico é persistido em DefesaChatMessage vinculado ao defesa_id.
 * Correções são registradas em ErrorLog (context: "chat_correcao_defesa") para auditoria.
 */
export default function DefesaCorrectionChat({ defesa, defesaConfig, onFieldsUpdated }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef(null);
  const errorLogIds = useRef(new Map());

  const defesaId = defesa?.id;

  useEffect(() => {
    if (!open || !defesaId) return;
    loadHistory();
  }, [open, defesaId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const loadHistory = async () => {
    if (!defesaId) return;
    setLoadingHistory(true);
    try {
      const history = await base44.entities.DefesaChatMessage.filter(
        { defesa_id: defesaId },
        "created_date"
      );
      setMessages(history || []);
    } catch (e) {
      toast.error("Erro ao carregar histórico: " + e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const buildContexto = () => {
    const p = defesa || {};
    return [
      `Título: ${p.title || "—"}`,
      `Processo: ${p.process_number || "—"}`,
      `Reclamante: ${p.reclamante_name || "—"}`,
      `CPF: ${p.reclamante_cpf || "—"}`,
      `Reclamada: ${p.reclamada_name || "—"}`,
      `CNPJ: ${p.reclamada_cnpj || "—"}`,
      `Setor/ramo: ${p.reclamada_setor || "—"}`,
      `Posição processual: ${p.posicao_processual || "—"}`,
      `Admissão: ${p.contract_start || "—"}`,
      `Demissão: ${p.contract_end || "—"}`,
      `Função: ${p.funcao || "—"}`,
      `Salário: ${p.salario ?? "—"}`,
      `Jornada: ${p.jornada || "—"}`,
      `Valor da causa: ${p.valor_causa ?? "—"}`,
      Array.isArray(p.pedidos_identificados) && p.pedidos_identificados.length
        ? `Pedidos identificados: ${p.pedidos_identificados.join("; ")}`
        : "",
      `Status: ${p.status || "—"}`,
    ].filter(Boolean).join("\n");
  };

  const buildPrompt = (instrucao) => {
    const configPrompt = defesaConfig?.prompt_sistema || "(config não disponível)";
    return `Você é um assistente jurídico que corrige defesas/contestações trabalhistas com base em instruções do advogado.

DADOS ATUAIS DA DEFESA:
${buildContexto()}

PROMPT DE SISTEMA ATUAL DO ESCRITÓRIO (DefesaConfig.prompt_sistema):
${configPrompt}

INSTRUÇÃO DE CORREÇÃO DO ADVOGADO:
${instrucao}

Analise a instrução e determine quais campos da Defesa devem ser corrigidos. Devolva:
- "reply": explicação curta e direta do que foi alterado e por quê.
- "corrected_fields": objeto com APENAS os campos que devem mudar e seus novos valores. Use os nomes exatos dos campos da entidade Defesa (title, process_number, reclamante_name, reclamante_cpf, reclamada_name, reclamada_cnpj, reclamada_setor, posicao_processual, contract_start, contract_end, funcao, salario [number], jornada, valor_causa [number], inicial_texto, generated_content, pedidos_identificados [array de strings], status). Se a correção envolver o texto gerado (generated_content), inclua o novo texto completo. Se nenhum campo estruturado mudar (ex: só um esclarecimento), devolva {}.
- "rule_suggestion": uma regra curta, genérica e reutilizável que evitaria esse erro em gerações futuras (ex: "Sempre verificar se a prescrição quinquenal foi corretamente calculada na contestação"). Se a instrução for um caso único sem regra aplicável, devolva string vazia.`;
  };

  const handleSend = async () => {
    const instrucao = input.trim();
    if (!instrucao || loading) return;

    const userMsg = { defesa_id: defesaId, role: "user", text: instrucao, created_date: new Date().toISOString() };
    const optimistic = [...messages, userMsg];
    setMessages(optimistic);
    setInput("");
    setLoading(true);

    try {
      const savedUser = await base44.entities.DefesaChatMessage.create({
        defesa_id: defesaId,
        role: "user",
        text: instrucao,
      });
      setMessages(prev => prev.map(m => (m === userMsg ? savedUser : m)));

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: buildPrompt(instrucao),
        response_json_schema: {
          type: "object",
          properties: {
            reply: { type: "string" },
            corrected_fields: { type: "object", additionalProperties: true },
            rule_suggestion: { type: "string" },
          },
          required: ["reply", "corrected_fields", "rule_suggestion"],
        },
      });

      const correctedFields = result?.corrected_fields || {};
      const ruleSuggestion = result?.rule_suggestion || "";
      const reply = result?.reply || "Correção processada.";

      // Registra no ErrorLog para auditoria de erros comuns
      let errorLogId = null;
      try {
        const log = await base44.entities.ErrorLog.create({
          context: "chat_correcao_defesa",
          error_type: "outro",
          message: instrucao,
          resolved: false,
          occurred_at: new Date().toISOString(),
        });
        errorLogId = log?.id || null;
      } catch (_) {}

      if (Object.keys(correctedFields).length > 0) {
        await base44.entities.Defesa.update(defesaId, correctedFields);
        onFieldsUpdated?.(correctedFields);
      }

      const savedAssistant = await base44.entities.DefesaChatMessage.create({
        defesa_id: defesaId,
        role: "assistant",
        text: reply,
        corrected_fields: correctedFields,
        rule_suggestion: ruleSuggestion,
      });
      if (errorLogId) errorLogIds.current.set(savedAssistant.id, errorLogId);
      setMessages(prev => [...prev, savedAssistant]);

      if (Object.keys(correctedFields).length > 0) {
        toast.success("Correção aplicada na defesa!");
      }
    } catch (e) {
      toast.error("Erro ao processar correção: " + e.message);
      setMessages(prev => prev.filter(m => m !== userMsg));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRule = async (message) => {
    if (!defesaConfig || !message.rule_suggestion) return;
    try {
      const currentPrompt = defesaConfig.prompt_sistema || "";
      const SECTION_HEADER = "## Regras aprendidas com correções";
      const rule = message.rule_suggestion.trim();

      let newPrompt;
      if (currentPrompt.includes(SECTION_HEADER)) {
        const parts = currentPrompt.split(SECTION_HEADER);
        const before = parts[0];
        let rulesSection = parts.slice(1).join(SECTION_HEADER) || "";
        const normalizedRules = rulesSection.replace(/\s+/g, " ").toLowerCase();
        const normalizedRule = rule.replace(/\s+/g, " ").toLowerCase();
        if (normalizedRules.includes(normalizedRule)) {
          toast.info("Essa regra já está salva no prompt.");
          await base44.entities.DefesaChatMessage.update(message.id, { rule_saved: true });
          setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, rule_saved: true } : m)));
          return;
        }
        rulesSection = rulesSection.trimEnd();
        rulesSection = rulesSection + (rulesSection ? "\n" : "") + `- ${rule}`;
        newPrompt = before.trimEnd() + "\n\n" + SECTION_HEADER + "\n" + rulesSection;
      } else {
        newPrompt = currentPrompt.trimEnd() + "\n\n" + SECTION_HEADER + "\n" + `- ${rule}`;
      }

      await base44.entities.DefesaConfig.update(defesaConfig.id, { prompt_sistema: newPrompt });

      // Marca o ErrorLog como resolvido com a regra salva
      const logId = errorLogIds.current.get(message.id);
      if (logId) {
        try {
          await base44.entities.ErrorLog.update(logId, { resolved: true, resolution: message.rule_suggestion });
        } catch (_) {}
      }

      await base44.entities.DefesaChatMessage.update(message.id, { rule_saved: true });
      setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, rule_saved: true } : m)));
      toast.success("Regra salva no prompt do escritório!");
    } catch (e) {
      toast.error("Erro ao salvar regra: " + e.message);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 font-semibold text-sm"
        >
          <Wand2 className="w-5 h-5" />
          Corrigir com IA
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-3rem)] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span className="font-semibold text-sm">Corrigir Defesa com IA</span>
            </div>
            <button onClick={() => setOpen(false)} className="hover:bg-primary-foreground/20 rounded p-1 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-muted/30">
            {loadingHistory ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8 px-4">
                <Wand2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Digite uma instrução de correção em linguagem natural.
                <br />
                Ex: "a data de demissão está errada" ou "incluir preliminar de prescrição".
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card border border-border rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>

                    {m.role === "assistant" && m.rule_suggestion && !m.rule_saved && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-xs text-muted-foreground mb-1.5">
                          <strong>Regra sugerida:</strong> {m.rule_suggestion}
                        </p>
                        <button
                          onClick={() => handleSaveRule(m)}
                          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors font-medium"
                        >
                          <BookmarkCheck className="w-3 h-3" /> Salvar regra no prompt
                        </button>
                      </div>
                    )}
                    {m.role === "assistant" && m.rule_saved && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-green-600 font-medium">
                        <BookmarkCheck className="w-3 h-3" /> Regra salva no prompt
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border bg-card">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite a correção..."
                rows={1}
                disabled={loading}
                className="flex-1 resize-none bg-input border border-border text-foreground rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring max-h-24"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}