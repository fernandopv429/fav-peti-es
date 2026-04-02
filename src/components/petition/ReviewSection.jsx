import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, CheckCircle2, XCircle, Clock, Send, Loader2, AlertTriangle, PackageCheck } from "lucide-react";
import { toast } from "sonner";

const TYPE_CONFIG = {
  comentario: { label: "Comentário", color: "bg-blue-100 text-blue-700", icon: MessageSquare },
  edicao: { label: "Edição sugerida", color: "bg-amber-100 text-amber-700", icon: Clock },
  aprovacao: { label: "Aprovação", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  rejeicao: { label: "Revisão solicitada", color: "bg-red-100 text-red-700", icon: XCircle },
};

export const STATUS_CONFIG = {
  rascunho: { label: "Rascunho", color: "bg-muted text-muted-foreground", icon: Clock },
  em_geracao: { label: "Em Geração", color: "bg-amber-100 text-amber-700", icon: Loader2 },
  concluida: { label: "Gerada — Aguardando Revisão", color: "bg-blue-100 text-blue-700", icon: MessageSquare },
  revisao_necessaria: { label: "Revisão Necessária", color: "bg-red-100 text-red-700", icon: AlertTriangle },
  pronto_para_protocolo: { label: "Pronto para Protocolo", color: "bg-green-100 text-green-700", icon: PackageCheck },
};

export default function ReviewSection({ petition, onStatusChange }) {
  const [reviews, setReviews] = useState([]);
  const [comment, setComment] = useState("");
  const [commentType, setCommentType] = useState("comentario");
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadReviews();
  }, [petition.id]);

  const loadReviews = async () => {
    const data = await base44.entities.PetitionReview.filter({ petition_id: petition.id }, "-created_date");
    setReviews(data);
  };

  const changeStatus = async (newStatus, autoComment, type) => {
    await base44.entities.Petition.update(petition.id, { status: newStatus });
    await base44.entities.PetitionReview.create({
      petition_id: petition.id,
      comment: autoComment,
      type,
    });
    onStatusChange(newStatus);
    loadReviews();
  };

  const handleSendToReview = () =>
    changeStatus("revisao_necessaria", "Petição marcada como 'Revisão Necessária'.", "rejeicao").then(() =>
      toast.success("Status atualizado: Revisão Necessária")
    );

  const handleApprove = () =>
    changeStatus("pronto_para_protocolo", "Petição aprovada e marcada como 'Pronto para Protocolo'.", "aprovacao").then(() =>
      toast.success("Petição pronta para protocolo!")
    );

  const handleReturnToReview = () =>
    changeStatus("revisao_necessaria", "Petição retornada para revisão.", "rejeicao").then(() =>
      toast.success("Status atualizado: Revisão Necessária")
    );

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    await base44.entities.PetitionReview.create({
      petition_id: petition.id,
      comment: comment.trim(),
      type: commentType,
    });
    setComment("");
    toast.success("Comentário adicionado!");
    loadReviews();
    setSaving(false);
  };

  const status = petition.status;
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.rascunho;
  const StatusIcon = statusCfg.icon;

  // Actions available per status
  const canRequestRevision = ["concluida"].includes(status);
  const canApprove = ["concluida", "revisao_necessaria"].includes(status);
  const canReturnToRevision = status === "pronto_para_protocolo";
  const canComment = !["rascunho", "em_geracao"].includes(status);

  return (
    <Card className="p-6 space-y-5">
      {/* Header + Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Revisão & Aprovação</h3>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${statusCfg.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {statusCfg.label}
        </span>
      </div>

      {/* Workflow Actions */}
      {(canRequestRevision || canApprove || canReturnToRevision) && (
        <div className="flex flex-wrap gap-2 p-4 rounded-xl bg-muted/40 border border-border">
          <p className="w-full text-xs text-muted-foreground mb-1 font-medium">Ações de fluxo:</p>
          {canRequestRevision && (
            <Button variant="outline" size="sm" onClick={handleSendToReview} className="gap-2 border-red-200 text-red-600 hover:bg-red-50">
              <AlertTriangle className="w-3.5 h-3.5" /> Solicitar Revisão
            </Button>
          )}
          {canApprove && (
            <Button size="sm" onClick={handleApprove} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
              <PackageCheck className="w-3.5 h-3.5" /> Aprovar — Pronto para Protocolo
            </Button>
          )}
          {canReturnToRevision && (
            <Button variant="outline" size="sm" onClick={handleReturnToReview} className="gap-2 border-amber-200 text-amber-600 hover:bg-amber-50">
              <AlertTriangle className="w-3.5 h-3.5" /> Retornar para Revisão
            </Button>
          )}
        </div>
      )}

      {/* Add Comment */}
      {canComment && (
        <div className="space-y-2 p-4 rounded-xl bg-muted/50">
          <p className="text-xs font-medium text-muted-foreground">Adicionar comentário:</p>
          <div className="flex gap-2">
            {Object.entries({ comentario: "Comentário", edicao: "Edição sugerida" }).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setCommentType(val)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${commentType === val ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Descreva sua observação, sugestão de edição ou nota..."
            className="min-h-[80px] bg-background"
          />
          <Button size="sm" onClick={handleAddComment} disabled={saving || !comment.trim()} className="gap-2">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Enviar
          </Button>
        </div>
      )}

      {/* History */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-3">Histórico ({reviews.length})</p>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma anotação ainda.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => {
              const cfg = TYPE_CONFIG[r.type] || TYPE_CONFIG.comentario;
              const Icon = cfg.icon;
              return (
                <div key={r.id} className="flex gap-3 items-start">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                      <span className="text-xs text-muted-foreground">{r.created_by}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_date).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80">{r.comment}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}