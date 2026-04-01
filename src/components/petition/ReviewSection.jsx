import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, CheckCircle2, XCircle, Clock, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TYPE_CONFIG = {
  comentario: { label: "Comentário", color: "bg-blue-100 text-blue-700", icon: MessageSquare },
  edicao: { label: "Edição", color: "bg-amber-100 text-amber-700", icon: Clock },
  aprovacao: { label: "Aprovação", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  rejeicao: { label: "Rejeição", color: "bg-red-100 text-red-700", icon: XCircle },
};

export default function ReviewSection({ petition, onStatusChange }) {
  const [reviews, setReviews] = useState([]);
  const [comment, setComment] = useState("");
  const [type, setType] = useState("comentario");
  const [saving, setSaving] = useState(false);
  const [sendingToReview, setSendingToReview] = useState(false);

  const loadReviews = async () => {
    const data = await base44.entities.PetitionReview.filter({ petition_id: petition.id }, "-created_date");
    setReviews(data);
  };

  useEffect(() => { loadReviews(); }, [petition.id]);

  const handleSendToReview = async () => {
    setSendingToReview(true);
    await base44.entities.Petition.update(petition.id, { status: "revisao" });
    await base44.entities.PetitionReview.create({
      petition_id: petition.id,
      comment: "Petição enviada para revisão pendente.",
      type: "edicao",
    });
    toast.success("Petição enviada para revisão!");
    onStatusChange("revisao");
    loadReviews();
    setSendingToReview(false);
  };

  const handleApprove = async () => {
    await base44.entities.Petition.update(petition.id, { status: "concluida" });
    await base44.entities.PetitionReview.create({
      petition_id: petition.id,
      comment: "Petição aprovada para download.",
      type: "aprovacao",
    });
    toast.success("Petição aprovada!");
    onStatusChange("concluida");
    loadReviews();
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    await base44.entities.PetitionReview.create({
      petition_id: petition.id,
      comment: comment.trim(),
      type,
    });
    setComment("");
    toast.success("Anotação adicionada!");
    loadReviews();
    setSaving(false);
  };

  const status = petition.status;

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Revisão & Histórico</h3>
        </div>
        <div className="flex gap-2">
          {status === "concluida" && (
            <Button variant="outline" size="sm" onClick={handleSendToReview} disabled={sendingToReview} className="gap-2">
              {sendingToReview ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
              Enviar para Revisão
            </Button>
          )}
          {status === "revisao" && (
            <Button size="sm" onClick={handleApprove} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle2 className="w-3 h-3" /> Aprovar
            </Button>
          )}
        </div>
      </div>

      {/* Add comment */}
      {(status === "revisao" || status === "concluida") && (
        <div className="space-y-3 p-4 rounded-xl bg-muted/50">
          <div className="flex gap-3">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-40 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comentario">Comentário</SelectItem>
                <SelectItem value="edicao">Edição</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Adicione uma anotação, comentário ou nota de edição..."
            className="min-h-[80px] bg-background"
          />
          <Button size="sm" onClick={handleAddComment} disabled={saving || !comment.trim()} className="gap-2">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Adicionar
          </Button>
        </div>
      )}

      {/* History */}
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
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
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
    </Card>
  );
}