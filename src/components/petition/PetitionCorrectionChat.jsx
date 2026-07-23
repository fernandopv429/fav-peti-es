import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, Send, X, MessageSquare, BookmarkCheck, Wand2 } from "lucide-react";
import { appendRuleToPrompt, salvarRegraAprendida } from "@/lib/regraAprendida.js";

const PETITION_FIELDS = new Set([
  "title", "status", "case_type", "rite", "claimant_name", "claimant_cpf", "claimant_rg",
  "claimant_birth_date", "claimant_ctps", "claimant_pis", "claimant_address", "claimant_role",
  "defendant_name", "defendant_cnpj", "defendant_address", "extra_defendants", "contract_start",
  "contract_end", "salary", "work_schedule", "irregularities", "additional_facts", "claims",
  "estimated_value", "generated_content", "template_used", "document_urls", "document_names",
  "jurisdiction", "free_justice", "digital_court", "analise_documentos", "analise_status",
]);

function filtrarCamposPeticao(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (PETITION_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Chat de correção de petições por comando em linguagem natural.
 *
 * Modos:
 *  - floating (padrão): botão fixo + painel flutuante, com abertura controlável.
 *  - embedded: renderizado embutido num container (ex.: lateral de um modal),
 *    sem botão flutuante e sempre aberto.
 *
 * Regras aprendidas são salvas no `learningTarget` (ex.: Especialista que gerou)
 * quando informado; caso contrário, no PetitionConfig.
 */
export default function PetitionCorrectionChat({ petition, petitionConfig, learningTarget, onFieldsUpdated, open: controlledOpen, onOpenChange, embedded = false }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef(null);
  const errorLogIds = useRef(new Map());

  const petitionId = petition?.id;
  const isOpen = embedded ? true : (controlledOpen !== undefined ? controlledOpen : open);
  const setOpenState = (v) => { setOpen(v); onOpenChange?.(v); };

  useEffect(() => {
    if (!isOpen || !petitionId) return;
    loadHistory();
  }, [isOpen, petitionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const loadHistory = async () => {
    if (!petitionId) return;
    setLoadingHistory(true);
    try {
      const history = await base44.entities.PetitionChatMessage.filter(
        { petition_id: petitionId },
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
    const p = petition || {};
    return [
      `Título: ${p.title || "—"}`,
      `Reclamante: ${p.claimant_name || "—"}`,
      `CPF: ${p.claimant_cpf || "—"}`,
      `RG: ${p.claimant_rg || "—"}`,
      `PIS: ${p.claimant_pis || "—"}`,
      `CTPS: ${p.claimant_ctps || "—"}`,
      `Endereço: ${p.claimant_address || "—"}`,
      `Função: ${p.claimant_role || "—"}`,
      `Reclamada: ${p.defendant_name || "—"}`,
      `CNPJ Reclamada: ${p.defendant_cnpj || "—"}`,
      `Endereço Reclamada: ${p.defendant_address || "—"}`,
      p.extra_defendants?.length ? `Reclamadas adicionais: ${JSON.stringify(p.extra_defendants)}` : "",
      `Admissão: ${p.contract_start || "—"}`,
      `Demissão: ${p.contract_end || "—"}`,
      `Salário: ${p.salary ?? "—"}`,
      `Jornada: ${p.work_schedule || "—"}`,
      `Irregularidades: ${p.irregularities || "—"}`,
      p.claims?.length ? `Pedidos: ${p.claims.join("; ")}` : "",
      `Valor estimado: ${p.estimated_value ?? "—"}`,
      `Jurisdição: ${p.jurisdiction || "—"}`,
      `Tipo de caso: ${p.case_type || "—"}`,
      `Rito: ${p.rite || "—"}`,
    ].filter(Boolean).join("\n");
  };

  const buildPrompt = (instrucao) => {
    const configPrompt = petitionConfig?.prompt_sistema || (learningTarget ? "(prompt do especialista)" : "(config não disponível)");
    return `Você é um assistente jurídico que corrige petições trabalhistas com base em instruções do advogado.

DADOS ATUAIS DA PETIÇÃO:
${buildContexto()}

${learningTarget ? "PROMPT DE SISTEMA DO ESPECIALISTA QUE GEROU A PEÇA:" : "PROMPT DE SISTEMA ATUAL DO ESCRITÓRIO (PetitionConfig.prompt_sistema):"}
${configPrompt}

INSTRUÇÃO DE CORREÇÃO DO ADVOGADO:
${instrucao}

Analise a instrução e determine quais campos da Petition devem ser corrigidos. Devolva:
- "reply": explicação curta e direta do que foi alterado e por quê.
- "corrected_fields": objeto com APENAS os campos que devem mudar e seus novos valores. Use os nomes exatos dos campos da entidade Petition (ex: claimant_name, defendant_cnpj, salary, contract_start, contract_end, work_schedule, irregularities, estimated_value, claims [array], jurisdiction, rite, free_justice, digital_court, additional_facts). Se a correção envolver o texto gerado (generated_content), inclua o novo texto completo. Se nenhum campo estruturado mudar (ex: só um esclarecimento), devolva {}.
- "rule_suggestion": uma regra curta, genérica e reutilizável que evitaria esse erro em gerações futuras (ex: "Sempre validar se a data de admissão da CTPS bate com o contrato antes de gerar a peça"). Se a instrução for um caso único sem regra aplicável, devolva string vazia.`;
  };

  const handleSend = async () => {
    const instrucao = input.trim();
    if (!instrucao || loading) return;

    const userMsg = { petition_id: petitionId, role: "user", text: instrucao, created_date: new Date().toISOString() };
    const optimistic = [...messages, userMsg];
    setMessages(optimistic);
    setInput("");
    setLoading(true);

    try {
      const savedUser = await base44.entities.PetitionChatMessage.create({
        petition_id: petitionId,
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

      let errorLogId = null;
      try {
        const log = await base44.entities.ErrorLog.create({
          context: "chat_correcao_peticao",
          error_type: "outro",
          message: instrucao,
          petition_id: petitionId,
          resolved: false,
          occurred_at: new Date().toISOString(),
        });
        errorLogId = log?.id || null;
      } catch (_) {}

      const camposValidos = filtrarCamposPeticao(correctedFields);
      if (Object.keys(camposValidos).length > 0) {
        await base44.entities.Petition.update(petitionId, camposValidos);
        onFieldsUpdated?.(camposValidos);
      }

      const savedAssistant = await base44.entities.PetitionChatMessage.create({
        petition_id: petitionId,
        role: "assistant",
        text: reply,
        corrected_fields: correctedFields,
        rule_suggestion: ruleSuggestion,
      });
      if (errorLogId) errorLogIds.current.set(savedAssistant.id, errorLogId);
      setMessages(prev => [...prev, savedAssistant]);

      if (Object.keys(camposValidos).length > 0) {
        toast.success("Correção aplicada na petição!");
      }
    } catch (e) {
      toast.error("Erro ao processar correção: " + e.message);
      setMessages(prev => prev.filter(m => m !== userMsg));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRule = async (message) => {
    if (!message.rule_suggestion) return;
    if (learningTarget) {
      try {
        const { alreadyExists } = await salvarRegraAprendida(learningTarget, message.rule_suggestion);
        const logId = errorLogIds.current.get(message.id);
        if (logId) {
          try {
            await base44.entities.ErrorLog.update(logId, { resolved: true, resolution: message.rule_suggestion });
          } catch (_) {}
        }
        await base44.entities.PetitionChatMessage.update(message.id, { rule_saved: true });
        setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, rule_saved: true } : m)));
        toast.success(alreadyExists ? "Regra já estava salva no prompt." : "Regra salva no prompt do especialista!");
      } catch (e) {
        toast.error("Erro ao salvar regra: " + e.message);
      }
      return;
    }
    if (!petitionConfig) return;
    try {
      const currentPrompt = petitionConfig.prompt_sistema || "";
      const { newPrompt, alreadyExists } = appendRuleToPrompt(currentPrompt, message.rule_suggestion.trim());
      if (!alreadyExists) {
        await base44.entities.PetitionConfig.update(petitionConfig.id, { prompt_sistema: newPrompt });
      }
      const logId = errorLogIds.current.get(message.id);
      if (logId) {
        try {
          await base44.entities.ErrorLog.update(logId, { resolved: true, resolution: message.rule_suggestion });
        } catch (_) {}
      }
      await base44.entities.PetitionChatMessage.update(message.id, { rule_saved: true });
      setMessages(prev => prev.map(m => (m.id === message.id ? { ...m, rule_saved: true } : m)));
      toast.success(alreadyExists ? "Regra já estava salva no prompt." : "Regra salva no prompt do escritório!");
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

  const panelInner = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          <span className="font-semibold text-sm">Corrigir com IA</span>
        </div>
        {!embedded && (
          <button onClick={() => setOpenState(false)} className="hover:bg-primary-foreground/20 rounded p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-muted/30 min-h-0">
        {loadingHistory ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8 px-4">
            <Wand2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Digite uma instrução de correção em linguagem natural.
            <br />
            Ex: "a data de admissão está errada" ou "o valor da causa deve somar as horas extras".
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

      {/* Input */}
      <div className="p-3 border-t border-border bg-card shrink-0">
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
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full bg-card border border-border overflow-hidden">
        {panelInner}
      </div>
    );
  }

  return (
    <>
      {/* Botão flutuante */}
      {!isOpen && (
        <button
          onClick={() => setOpenState(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all hover:scale-105 font-semibold text-sm"
        >
          <Wand2 className="w-5 h-5" />
          Corrigir com IA
        </button>
      )}

      {/* Painel de chat flutuante */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-3rem)] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {panelInner}
        </div>
      )}
    </>
  );
}