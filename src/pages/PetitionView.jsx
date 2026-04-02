import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Clock, FileText } from "lucide-react";
import ExportButtons from "../components/petition/ExportButtons";
import ReviewSectionPanel from "../components/petition/ReviewSection";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

export default function PetitionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [petition, setPetition] = useState(null);
  const [petitionContent, setPetitionContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Petition.filter({ id }).then(async (data) => {
      const p = data[0];
      setPetition(p);
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
        <div className="flex gap-2">
          <button onClick={handleCopy} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-transparent text-sm hover:bg-muted transition-colors">
            <Copy className="w-4 h-4" /> Copiar
          </button>
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
            <ExportButtons petition={{...petition, generated_content: petitionContent}} />
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

      {/* Content */}
      <Card className="p-8 lg:p-12">
        {petitionContent ? (
          <div className="prose prose-slate max-w-none petition-content">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="text-sm leading-7 mb-4 text-justify">{children}</p>,
                h1: ({ children }) => <h1 className="text-xl font-bold mt-8 mb-4 uppercase">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-bold mt-6 mb-3 uppercase">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-bold mt-4 mb-2 uppercase">{children}</h3>,
                strong: ({ children }) => <strong className="font-bold">{children}</strong>,
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