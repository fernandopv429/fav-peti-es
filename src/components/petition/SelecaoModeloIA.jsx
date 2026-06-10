import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, RotateCcw,
  ShieldCheck, ShieldAlert, Users, FileText
} from "lucide-react";

/**
 * Componente de seleção automática de modelo com IA.
 *
 * Props:
 *   form             — dados do formulário NewPetition
 *   templates        — lista de PetitionTemplate ativos compatíveis
 *   selectedTemplateId — ID selecionado atualmente
 *   onSelect(id)     — callback ao escolher um template
 *   threshold        — limiar de confiança configurado em PetitionConfig (default 0.6)
 */
export default function SelecaoModeloIA({ form, templates, selectedTemplateId, onSelect, threshold = 0.6 }) {
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState(null); // { templateId, confianca, justificativa, candidatos, modo }
  const [erro, setErro] = useState("");
  const [jaRodou, setJaRodou] = useState(false);

  // Roda automaticamente quando os templates estiverem disponíveis e ainda não rodou
  useEffect(() => {
    if (!jaRodou && templates.length > 0 && (form.claimant_role || form.additional_facts || form.irregularities)) {
      analisar();
    }
  }, [templates.length]);

  const analisar = async () => {
    if (templates.length === 0) return;
    setAnalisando(true);
    setErro("");
    setResultado(null);
    setJaRodou(true);

    // ── Regras locais (sem IA) para casos com tag conhecida ──────────────
    const funcao = (form.claimant_role || "").toLowerCase();
    const isVigilante = /vigilant|agente de segur|vigil[aâ]/i.test(funcao);
    const isPorteiro  = /porteiro|controlador de acesso|portaria/i.test(funcao);

    const autoSelecionaveis   = templates.filter(t => (t.tags || []).includes("auto_selecionavel"));
    const enquadramentoPendente = templates.filter(t => (t.tags || []).includes("enquadramento_pendente"));

    // ALTA CONFIANÇA — vigilante + template auto_selecionavel
    if (isVigilante && autoSelecionaveis.length > 0) {
      const melhor = autoSelecionaveis[0];
      const res = {
        templateId: melhor.id,
        confianca: "alta",
        modo: "automatico",
        justificativa: `Função "${form.claimant_role}" identificada como vigilante/agente de segurança. Modelo "${melhor.name}" (tag auto_selecionavel) selecionado automaticamente.`,
        candidatos: [],
      };
      setResultado(res);
      onSelect(melhor.id);
      setAnalisando(false);
      return;
    }

    // BAIXA CONFIANÇA — porteiro + enquadramento_pendente
    if (isPorteiro && enquadramentoPendente.length > 0) {
      const res = {
        templateId: null,
        confianca: "baixa",
        modo: "revisao_humana",
        justificativa: `Função "${form.claimant_role}" identificada como porteiro/controlador de acesso. A regra de enquadramento SINDEEPRES × SIEMACO ainda não foi configurada — escolha manualmente o modelo adequado.`,
        candidatos: enquadramentoPendente,
        avisoEnquadramento: true,
      };
      setResultado(res);
      setAnalisando(false);
      return;
    }

    // ── Sem regra local clara: usa IA para pontuar ────────────────────────
    try {
      const listaModelos = templates.map((t, i) =>
        `${i + 1}. ID: "${t.id}" | Nome: "${t.name}" | Tags: [${(t.tags || []).join(", ")}] | Descrição: "${t.description || ""}"`
      ).join("\n");

      const contexto = [
        form.claimant_role && `Função do reclamante: ${form.claimant_role}`,
        form.irregularities && `Irregularidades: ${form.irregularities.slice(0, 400)}`,
        form.additional_facts && `Contexto: ${form.additional_facts.slice(0, 400)}`,
        form.work_schedule && `Jornada: ${form.work_schedule.slice(0, 200)}`,
        form.defendant_name && `Reclamada: ${form.defendant_name}`,
      ].filter(Boolean).join("\n");

      const prompt = `Você é um sistema de triagem jurídica trabalhista. Com base nos dados do caso e nos modelos disponíveis, indique qual modelo melhor se adequa.

DADOS DO CASO:
${contexto}

MODELOS DISPONÍVEIS:
${listaModelos}

Responda SOMENTE com JSON:
{
  "templateId": "<ID do modelo mais adequado ou null se nenhum for claro>",
  "confianca": "alta" ou "baixa",
  "justificativa": "<1-2 linhas explicando a escolha com base nos dados reais do caso>",
  "candidatos_ids": ["<id1>", "<id2>"]
}

Regras:
- "alta" somente se houver correspondência clara entre função/fatos e o modelo.
- "baixa" se houver dúvida ou ambiguidade.
- candidatos_ids: lista dos 2-3 modelos mais próximos (incluindo o escolhido).
- NÃO invente dados. Use apenas o que foi fornecido.`;

      const ia = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
        response_json_schema: {
          type: "object",
          properties: {
            templateId:     { type: ["string", "null"] },
            confianca:      { type: "string" },
            justificativa:  { type: "string" },
            candidatos_ids: { type: "array", items: { type: "string" } },
          }
        }
      });

      const candidatos = (ia.candidatos_ids || [])
        .map(id => templates.find(t => t.id === id))
        .filter(Boolean);

      const confiancaEfetiva = ia.confianca === "alta" && parseFloat(threshold) <= 0.5 ? "alta"
        : ia.confianca === "alta" ? "alta"
        : "baixa";

      const res = {
        templateId: ia.confianca === "alta" ? ia.templateId : null,
        confianca: confiancaEfetiva,
        modo: ia.confianca === "alta" ? "automatico" : "revisao_humana",
        justificativa: ia.justificativa || "IA não encontrou correspondência clara.",
        candidatos,
      };

      setResultado(res);
      if (res.templateId && ia.confianca === "alta") {
        onSelect(res.templateId);
      }
    } catch (e) {
      setErro("Não foi possível analisar automaticamente: " + (e.message || String(e)));
    } finally {
      setAnalisando(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (analisando) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 mb-4">
        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
        <p className="text-sm text-primary font-medium">Analisando caso e selecionando modelo automaticamente...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50/50 border border-red-200 dark:bg-red-950/20 mb-4">
        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
        <p className="text-xs text-red-700 dark:text-red-400 flex-1">{erro}</p>
        <button onClick={analisar} className="p-1 rounded hover:bg-red-100 text-red-500" title="Tentar novamente">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (!resultado) return null;

  const isAlta = resultado.confianca === "alta";

  return (
    <div className={`rounded-xl border p-4 mb-4 space-y-3 ${isAlta ? "bg-green-50/50 border-green-200 dark:bg-green-950/20" : "bg-amber-50/50 border-amber-200 dark:bg-amber-950/20"}`}>
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isAlta ? "bg-green-100" : "bg-amber-100"}`}>
          {isAlta
            ? <ShieldCheck className="w-4 h-4 text-green-600" />
            : <ShieldAlert className="w-4 h-4 text-amber-600" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-sm font-semibold ${isAlta ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
              {isAlta ? "Seleção automática — Alta confiança" : "Revisão necessária — Baixa confiança"}
            </p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${isAlta ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              <Sparkles className="w-2.5 h-2.5" /> IA
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{resultado.justificativa}</p>
        </div>
        <button onClick={analisar} className="p-1.5 rounded-lg hover:bg-black/10 text-muted-foreground shrink-0" title="Re-analisar">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Aviso de enquadramento pendente */}
      {resultado.avisoEnquadramento && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-100/60 border border-amber-200 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <Users className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span><strong>Regra SINDEEPRES × SIEMACO não configurada.</strong> Quando o enquadramento for definido em PetitionConfig, a seleção será automática.</span>
        </div>
      )}

      {/* Candidatos (revisão humana) */}
      {!isAlta && resultado.candidatos?.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Modelos candidatos — escolha um:</p>
          {resultado.candidatos.map(t => {
            const isSel = selectedTemplateId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
                  isSel ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
              >
                <FileText className={`w-4 h-4 shrink-0 ${isSel ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                  {t.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {t.tags.map(tag => <span key={tag} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">{tag}</span>)}
                    </div>
                  )}
                </div>
                {isSel && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      {/* Confirmação seleção automática */}
      {isAlta && resultado.templateId && (
        <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Modelo pré-selecionado abaixo. Você pode alterar se necessário.</span>
        </div>
      )}
    </div>
  );
}