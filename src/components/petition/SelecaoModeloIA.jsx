import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Sparkles, Loader2, CheckCircle2, AlertTriangle, RotateCcw,
  ShieldCheck, ShieldAlert, FileText
} from "lucide-react";

/**
 * Seleção automática de modelo com IA — totalmente dinâmica.
 * Considera TODOS os templates ativos passados via props.
 * Regras de confiança:
 *   - Alta → seleção automática (pré-seleciona o template)
 *   - Baixa → revisão humana (mostra candidatos para o usuário escolher)
 *
 * Props:
 *   form             — dados do formulário NewPetition
 *   templates        — lista de PetitionTemplate ativos (todos, sem filtro externo)
 *   selectedTemplateId — ID selecionado atualmente
 *   onSelect(id)     — callback ao escolher um template
 *   threshold        — limiar de confiança de PetitionConfig (default 0.6, reservado para uso futuro)
 */
export default function SelecaoModeloIA({ form, templates, selectedTemplateId, onSelect, threshold = 0.6 }) {
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [jaRodou, setJaRodou] = useState(false);

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

    try {
      // Lista todos os templates com seus metadados relevantes para a IA
      const listaModelos = templates.map((t, i) =>
        `${i + 1}. ID: "${t.id}" | Nome: "${t.name}" | Tipo: "${t.case_type || ""}" | Tags: [${(t.tags || []).join(", ")}] | Descrição: "${t.description || ""}"`
      ).join("\n");

      const contexto = [
        form.claimant_role    && `Função do reclamante: ${form.claimant_role}`,
        form.defendant_name   && `Reclamada: ${form.defendant_name}`,
        form.work_schedule    && `Jornada: ${form.work_schedule.slice(0, 200)}`,
        form.irregularities   && `Irregularidades: ${form.irregularities.slice(0, 500)}`,
        form.additional_facts && `Contexto: ${form.additional_facts.slice(0, 400)}`,
        form.case_type        && `Tipo de ação: ${form.case_type}`,
      ].filter(Boolean).join("\n");

      const prompt = `Você é um sistema de triagem jurídica trabalhista. Com base nos dados do caso abaixo e nos modelos disponíveis, determine qual modelo é o mais adequado.

DADOS DO CASO:
${contexto}

MODELOS DISPONÍVEIS (analise tags, nome e descrição de cada um):
${listaModelos}

Regras de classificação:
- "alta" confiança: há correspondência clara e objetiva entre os dados do caso e o modelo (função, tipo de ação, tags explícitas como "auto_selecionavel"). Neste caso, selecione automaticamente.
- "baixa" confiança: há ambiguidade, mais de um modelo candidato igualmente válido, ou a função não está claramente mapeada (ex: porteiro com tag "enquadramento_pendente" — sindicato ainda não definido). Neste caso, apresente os candidatos para o advogado escolher.
- candidatos_ids: liste os 2-3 modelos mais adequados (incluindo o escolhido quando alta confiança).
- Se nenhum modelo for adequado, retorne templateId null e confianca "baixa".
- NÃO invente dados. Use apenas o que foi fornecido.

Responda SOMENTE com JSON válido:
{
  "templateId": "<ID do modelo ou null>",
  "confianca": "alta",
  "justificativa": "<1-2 linhas explicando a escolha com base nos dados reais>",
  "candidatos_ids": ["<id1>", "<id2>"],
  "aviso_enquadramento": false
}`;

      const ia = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
        response_json_schema: {
          type: "object",
          properties: {
            templateId:          { type: ["string", "null"] },
            confianca:           { type: "string" },
            justificativa:       { type: "string" },
            candidatos_ids:      { type: "array", items: { type: "string" } },
            aviso_enquadramento: { type: "boolean" },
          }
        }
      });

      const candidatos = (ia.candidatos_ids || [])
        .map(id => templates.find(t => t.id === id))
        .filter(Boolean);

      const isAlta = ia.confianca === "alta" && !!ia.templateId;

      const res = {
        templateId: isAlta ? ia.templateId : null,
        confianca: isAlta ? "alta" : "baixa",
        modo: isAlta ? "automatico" : "revisao_humana",
        justificativa: ia.justificativa || "IA não encontrou correspondência clara.",
        candidatos,
        avisoEnquadramento: !!ia.aviso_enquadramento,
      };

      setResultado(res);
      if (isAlta) onSelect(res.templateId);

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

      {/* Aviso de enquadramento pendente (sinalizado pela IA) */}
      {resultado.avisoEnquadramento && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-100/60 border border-amber-200 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span><strong>Enquadramento pendente.</strong> A regra de sindicato/CCT para esta função ainda não foi configurada. Quando definida em PetitionConfig, a seleção poderá ser automática.</span>
        </div>
      )}

      {/* Candidatos para revisão humana */}
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

      {/* Confirmação alta confiança */}
      {isAlta && resultado.templateId && (
        <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Modelo pré-selecionado abaixo. Você pode alterar se necessário.</span>
        </div>
      )}
    </div>
  );
}