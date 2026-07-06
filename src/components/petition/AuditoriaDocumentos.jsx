/**
 * AuditoriaDocumentos — integra o Especialista #58 (auditor-iniciais-trabalhistas)
 * ao fluxo de criação de petições trabalhistas.
 *
 * Oferece o botão "Auditar documentos", invoca o backend auditarPeticao, exibe o
 * resultado estruturado (resumo, inconsistências por severidade, teses, pendências)
 * e gerencia o bloqueio de geração quando status_final === "bloqueado".
 *
 * NÃO altera o pipeline de geração determinística — atua como camada de auditoria.
 */
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck, Loader2, AlertOctagon, AlertTriangle, Info,
  CheckCircle2, XCircle, RefreshCw, Lock, Unlock, FileSearch, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

const SEVERITY_CONFIG = {
  BLOQUEANTE: {
    icon: AlertOctagon,
    badge: "bg-red-100 text-red-700 border-red-200",
    box: "bg-red-50 border-red-200",
    label: "Bloqueante",
  },
  ATENCAO: {
    icon: AlertTriangle,
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    box: "bg-amber-50 border-amber-200",
    label: "Atenção",
  },
  INFO: {
    icon: Info,
    badge: "bg-blue-100 text-blue-700 border-blue-200",
    box: "bg-blue-50 border-blue-200",
    label: "Info",
  },
};

const STATUS_CONFIG = {
  bloqueado: { label: "Bloqueado", cls: "bg-red-100 text-red-700 border-red-300", icon: Lock },
  revisar: { label: "Revisar", cls: "bg-amber-100 text-amber-700 border-amber-300", icon: AlertTriangle },
  aprovado: { label: "Aprovado", cls: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle2 },
};

function parseAuditResult(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.status_final ? parsed : null;
  } catch (_) {
    return null;
  }
}

export default function AuditoriaDocumentos({
  petitionId,
  documentUrls = [],
  documentNames = [],
  caseType,
  threshold = 0.6,
  templates = [],
  onAuditComplete,
}) {
  const [auditing, setAuditing] = useState(false);
  const [result, setResult] = useState(null);
  const [forcado, setForcado] = useState(false);
  const [forcarOpen, setForcarOpen] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  // Carrega auditoria existente ao montar
  useEffect(() => {
    if (!petitionId) { setResult(null); return; }
    base44.entities.Petition.filter({ id: petitionId }).then((r) => {
      const p = r[0];
      if (!p) return;
      const parsed = parseAuditResult(p.analise_documentos);
      if (parsed) {
        setResult(parsed);
        notifyParent(parsed, false);
      }
    }).catch(() => {});
  }, [petitionId]);

  const notifyParent = (auditResult, isForced) => {
    if (!onAuditComplete) return;
    const classif = auditResult.classificacao || {};
    const confianca = typeof classif.confianca === "number" ? classif.confianca : 0;
    const tmplSugerido = classif.template_sugerido || "";
    const matchedTemplate = tmplSugerido
      ? templates.find(t => t.name === tmplSugerido || t.id === tmplSugerido)
      : null;
    const autoSelect = matchedTemplate && confianca >= threshold;
    onAuditComplete({
      status_final: auditResult.status_final,
      bloqueado: auditResult.status_final === "bloqueado" && !isForced,
      forcado: isForced,
      template_sugerido: matchedTemplate?.id || "",
      confianca,
      autoSelect: !!autoSelect,
    });
  };

  const handleAuditar = async () => {
    if (!petitionId) {
      toast.error("Salve o rascunho antes de auditar.");
      return;
    }
    if (documentUrls.length === 0) {
      toast.info("Nenhum documento anexado para auditar.");
      return;
    }
    setAuditing(true);
    setForcado(false);
    setForcarOpen(false);
    setJustificativa("");
    try {
      const response = await base44.functions.invoke("auditarPeticao", { petitionId });
      const auditResult = response.data || response;
      setResult(auditResult);
      notifyParent(auditResult, false);
      toast.success("Auditoria concluída! Revise o resultado abaixo.");
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || String(err);
      toast.error("Erro na auditoria: " + msg);
    } finally {
      setAuditing(false);
    }
  };

  const handleForcar = async () => {
    if (!justificativa.trim() || justificativa.trim().length < 10) {
      toast.error("Informe uma justificativa (mín. 10 caracteres).");
      return;
    }
    try {
      await base44.entities.PetitionReview.create({
        petition_id: petitionId,
        comment: `Geração forçada pelo advogado após bloqueio da auditoria.\nJustificativa: ${justificativa.trim()}`,
        type: "aprovacao",
      });
      setForcado(true);
      setForcarOpen(false);
      notifyParent(result, true);
      toast.success("Bloqueio sobreposto. Você pode gerar a petição.");
    } catch (err) {
      toast.error("Erro ao registrar justificativa: " + err.message);
    }
  };

  // Só exibe para petições trabalhistas com documentos
  if (caseType !== "trabalhista") return null;
  if (documentUrls.length === 0 && !result) return null;

  const inconsistencias = result?.inconsistencias || [];
  const porSeveridade = {
    BLOQUEANTE: inconsistencias.filter(i => i.severidade === "BLOQUEANTE"),
    ATENCAO: inconsistencias.filter(i => i.severidade === "ATENCAO"),
    INFO: inconsistencias.filter(i => i.severidade === "INFO"),
  };
  const tesasIncluidas = result?.teses_incluidas || [];
  const tesasExcluidas = result?.teses_excluidas || [];
  const pendencias = result?.pendencias || [];
  const classif = result?.classificacao || {};
  const statusInfo = result?.status_final ? STATUS_CONFIG[result.status_final] : null;
  const StatusIcon = statusInfo?.icon;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          Auditoria de Petição Inicial (Especialista 58)
        </h3>
        <p className="text-sm text-muted-foreground">
          Auditoria estruturada: classifica o caso, extrai tokens, audita inconsistências e decide quais teses entram ou saem.
          {" "}Documentos anexados: <strong>{documentUrls.length}</strong>.
        </p>
      </div>

      {/* Lista de documentos */}
      {documentUrls.length > 0 && (
        <div className="p-3 rounded-xl border bg-muted/20 space-y-1.5">
          {documentNames.map((name, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <FileSearch className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Botão auditar */}
      <Button onClick={handleAuditar} disabled={auditing} className="gap-2 w-full sm:w-auto">
        {auditing ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Auditando documentos...</>
        ) : (
          <><ShieldCheck className="w-4 h-4" /> {result ? "Reauditar" : "Auditar documentos"}</>
        )}
      </Button>

      {/* Loading */}
      {auditing && (
        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
          <p className="font-medium">Auditoria em andamento...</p>
          <p className="text-muted-foreground text-xs">
            A IA está lendo os documentos, classificando o caso, extraindo tokens e cruzando inconsistências.
          </p>
        </div>
      )}

      {/* Resultado */}
      {result && !auditing && (
        <div className="space-y-4">
          {/* Status badge + reauditar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {statusInfo && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-semibold ${statusInfo.cls}`}>
                  {StatusIcon && <StatusIcon className="w-4 h-4" />}
                  {statusInfo.label}
                </span>
              )}
              {forcado && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-semibold bg-purple-100 text-purple-700 border-purple-200">
                  <Unlock className="w-3.5 h-3.5" /> Forçado pelo advogado
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleAuditar} disabled={auditing}>
              <RefreshCw className="w-3.5 h-3.5" /> Reauditar
            </Button>
          </div>

          {/* Resumo para o advogado */}
          {result.resumo_para_advogado && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" /> Resumo para o advogado
              </p>
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{result.resumo_para_advogado}</p>
            </div>
          )}

          {/* Classificação + valor da causa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {classif.template_sugerido && (
              <div className="p-3 rounded-xl border bg-card">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Template sugerido</p>
                <p className="text-sm font-semibold text-foreground">{classif.template_sugerido}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold ${classif.confianca >= threshold ? "text-green-600" : "text-amber-600"}`}>
                    Confiança: {(classif.confianca * 100).toFixed(0)}%
                  </span>
                  {classif.confianca >= threshold ? (
                    <span className="text-xs text-green-600">→ pré-selecionado automaticamente</span>
                  ) : (
                    <span className="text-xs text-amber-600">→ seleção manual necessária</span>
                  )}
                </div>
                {classif.justificativa && <p className="text-xs text-muted-foreground mt-1">{classif.justificativa}</p>}
              </div>
            )}
            {result.valor_causa && (
              <div className="p-3 rounded-xl border bg-card">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Valor da causa</p>
                <p className="text-sm font-semibold text-foreground">{result.valor_causa}</p>
              </div>
            )}
          </div>

          {/* Inconsistências por severidade */}
          {inconsistencias.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Inconsistências detectadas</p>
              {["BLOQUEANTE", "ATENCAO", "INFO"].map(sev => {
                const items = porSeveridade[sev];
                if (items.length === 0) return null;
                const cfg = SEVERITY_CONFIG[sev];
                const Icon = cfg.icon;
                return (
                  <div key={sev} className={`rounded-xl border p-4 space-y-2 ${cfg.box}`}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                        {cfg.label} ({items.length})
                      </span>
                    </div>
                    {items.map((inc, i) => (
                      <div key={i} className="text-sm pl-6">
                        <p className="text-foreground"><strong>{inc.campo || "—"}:</strong> {inc.descricao}</p>
                        {inc.sugestao && <p className="text-xs text-muted-foreground mt-0.5">💡 {inc.sugestao}</p>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Teses incluídas e excluídas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tesasIncluidas.length > 0 && (
              <div className="p-4 rounded-xl border bg-green-50/50 border-green-200">
                <p className="text-xs font-bold uppercase tracking-wider text-green-700 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Teses incluídas ({tesasIncluidas.length})
                </p>
                <div className="space-y-2">
                  {tesasIncluidas.map((t, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium text-foreground">{t.tese}</p>
                      {t.fundamento && <p className="text-xs text-muted-foreground">{t.fundamento}</p>}
                      {t.evidencia && <p className="text-xs text-muted-foreground">📄 {t.evidencia}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tesasExcluidas.length > 0 && (
              <div className="p-4 rounded-xl border bg-red-50/50 border-red-200">
                <p className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2 flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> Teses excluídas ({tesasExcluidas.length})
                </p>
                <div className="space-y-2">
                  {tesasExcluidas.map((t, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium text-foreground">{t.tese}</p>
                      {t.motivo && <p className="text-xs text-muted-foreground">Motivo: {t.motivo}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pendências */}
          {pendencias.length > 0 && (
            <div className="p-4 rounded-xl border bg-amber-50/50 border-amber-200">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Pendências ({pendencias.length})
              </p>
              <ul className="space-y-1">
                {pendencias.map((p, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5">•</span> {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Bloqueio de geração */}
          {result.status_final === "bloqueado" && !forcado && (
            <div className="p-4 rounded-xl border-2 border-red-300 bg-red-50">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-700">Geração bloqueada</p>
                  <p className="text-sm text-red-600 mt-0.5 mb-3">
                    Há inconsistências bloqueantes. Resolva-as ou force a geração com justificativa (registrada no histórico).
                  </p>
                  {!forcarOpen ? (
                    <Button variant="outline" size="sm" className="gap-2 border-red-300 text-red-700 hover:bg-red-100" onClick={() => setForcarOpen(true)}>
                      <Unlock className="w-3.5 h-3.5" /> Forçar geração com justificativa
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        value={justificativa}
                        onChange={(e) => setJustificativa(e.target.value)}
                        placeholder="Justifique por que está forçando a geração apesar do bloqueio (mín. 10 caracteres)..."
                        className="min-h-[80px] text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" className="gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={handleForcar}>
                          <Unlock className="w-3.5 h-3.5" /> Confirmar e desbloquear
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setForcarOpen(false); setJustificativa(""); }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Aviso gate humano */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border text-sm">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p className="text-muted-foreground">
              Auditoria de apoio — não substitui validação humana. Confira todos os achados antes de protocolar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}