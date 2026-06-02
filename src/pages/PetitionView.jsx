import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Clock, FileText, Pencil, Check, X } from "lucide-react";
import ExportButtons from "../components/petition/ExportButtons";
import ReviewSectionPanel from "../components/petition/ReviewSection";
import { LetterheadHeader, LetterheadFooter } from "../components/petition/PetitionLetterhead";
import { getPetitionViewStyle } from "@/hooks/usePetitionFormat.js";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export default function PetitionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [petition, setPetition] = useState(null);
  const [petitionContent, setPetitionContent] = useState("");
  const [petitionConfig, setPetitionConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Petition.filter({ id }),
      base44.entities.PetitionConfig.filter({ ativo: true }).catch(() => []),
    ]).then(async ([data, configs]) => {
      const p = data[0];
      setPetition(p);
      setPetitionConfig(configs[0] || null);
      if (p?.generated_content) {
        if (p.generated_content.startsWith("http")) {
          const res = await fetch(p.generated_content);
          const text = await res.text();
          setPetitionContent(text);
        } else {
          setPetitionContent(p.generated_content);
        }
      }
      setLoading(false);
    });
  }, [id]);

  const handleCopy = () => {
    navigator.clipboard.writeText(petitionContent || "");
    toast.success("Conteúdo copiado!");
  };

  const handleStartEdit = () => {
    setEditContent(petitionContent);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditContent("");
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const blob = new Blob([editContent], { type: "text/plain" });
      const file = new File([blob], "peticao.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Petition.update(id, { generated_content: contentUrl });
      setPetitionContent(editContent);
      setEditing(false);
      setEditContent("");
      toast.success("Petição salva com sucesso!");
    } catch (err) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!petition) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Petição não encontrada</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-3">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <h1 className="text-2xl lg:text-3xl font-playfair font-bold">{petition.title}</h1>
          <p className="text-muted-foreground mt-1">
            {petition.claimant_name} vs {petition.defendant_name} • {new Date(petition.created_date).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleCopy} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-transparent text-sm hover:bg-muted transition-colors">
            <Copy className="w-4 h-4" /> Copiar
          </button>
          {petitionContent && !editing && (
            <button onClick={handleStartEdit} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-amber-700 text-sm hover:bg-amber-100 transition-colors">
              <Pencil className="w-4 h-4" /> Editar
            </button>
          )}
          {petition.status === "revisao_necessaria" && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-red-100 text-red-700 text-sm font-medium">
              <Clock className="w-4 h-4" /> Revisão Necessária
            </span>
          )}
          {petition.status === "pronto_para_protocolo" && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-green-100 text-green-700 text-sm font-medium">
              <Clock className="w-4 h-4" /> Pronto para Protocolo
            </span>
          )}
          {petitionContent && (
            <ExportButtons petition={{...petition, generated_content: petitionContent}} petitionConfig={petitionConfig} />
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard label="Tipo" value={petition.case_type} />
        <InfoCard label="Rito" value={petition.rite} />
        <InfoCard label="Salário" value={petition.salary ? `R$ ${petition.salary.toLocaleString("pt-BR")}` : "N/A"} />
        <InfoCard label="Documentos" value={`${petition.document_urls?.length || 0} arquivo(s)`} />
      </div>

      {/* Content — papel timbrado */}
      <Card className="p-8 lg:p-12" id="petition-print-area">
        <LetterheadHeader config={petitionConfig} />
        {editing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-amber-700 flex items-center gap-2">
                <Pencil className="w-4 h-4" /> Modo de edição ativo
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={saving} className="gap-1.5">
                  <X className="w-3.5 h-3.5" /> Cancelar
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={saving} className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                  {saving ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : <Check className="w-3.5 h-3.5" />}
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </div>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full min-h-[600px] p-4 rounded-lg border border-amber-300 bg-amber-50/20 text-sm font-mono leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 resize-y"
            />
          </div>
        ) : petitionContent ? (
          <div style={getPetitionViewStyle(petitionConfig)} className="petition-content">
            <ReactMarkdown
              components={{
                p: ({ children }) => (
                  <p style={{ textAlign: "justify", textIndent: "1.25cm", marginBottom: "0.5em" }}>{children}</p>
                ),
                h1: ({ children }) => <h1 style={{ textAlign: "center", fontWeight: "bold", textTransform: "uppercase", margin: "1.5em 0 0.5em" }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ textAlign: "center", fontWeight: "bold", textTransform: "uppercase", margin: "1.2em 0 0.4em" }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ fontWeight: "bold", textTransform: "uppercase", margin: "1em 0 0.3em" }}>{children}</h3>,
                strong: ({ children }) => <strong style={{ fontWeight: "bold" }}>{children}</strong>,
              }}
            >
              {petitionContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>Conteúdo da petição não disponível</p>
          </div>
        )}
        <LetterheadFooter config={petitionConfig} />
      </Card>

      {/* Review Section */}
      <ReviewSectionPanel
        petition={petition}
        onStatusChange={(newStatus) => setPetition(prev => ({ ...prev, status: newStatus }))}
      />
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5 capitalize">{value}</p>
    </Card>
  );
}