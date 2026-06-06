import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Clock, FileText, Pencil, Check, X, Sparkles, Loader2, AlertTriangle, Download, FileDown } from "lucide-react";
import ExportButtons from "../components/petition/ExportButtons";
import ReviewSectionPanel from "../components/petition/ReviewSection";
import { LetterheadHeader, LetterheadFooter } from "../components/petition/PetitionLetterhead";
import { getPetitionViewStyle } from "@/hooks/usePetitionFormat.js";
import { buildPetitionTemplate, buildShortAIPrompt } from "@/lib/petitionBuilder.js";
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
  const [generating, setGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState("");
  const generatingRef = useRef(false);

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

  // Polling após disparo de geração
  const startPolling = () => {
    generatingRef.current = true;
    const interval = setInterval(async () => {
      try {
        const results = await base44.entities.Petition.filter({ id });
        const p = results[0];
        if (!p || p.status === "em_geracao") {
          setGeneratingStep("IA processando...");
          return;
        }
        clearInterval(interval);
        generatingRef.current = false;
        setGenerating(false);
        setPetition(p);
        if (p.generated_content) {
          let text = p.generated_content;
          if (text.startsWith("http")) {
            const res = await fetch(text);
            text = await res.text();
          }
          setPetitionContent(text);
          toast.success("Petição gerada com sucesso!");
        } else {
          toast.error("A geração falhou. Tente novamente.");
        }
      } catch (_) {}
    }, 4000);
    // Timeout de 10 minutos
    setTimeout(() => {
      if (!generatingRef.current) return;
      clearInterval(interval);
      generatingRef.current = false;
      setGenerating(false);
      toast.error("Tempo esgotado. Verifique em alguns instantes.");
    }, 10 * 60 * 1000);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratingStep("Montando estrutura...");
    try {
      // Marca como em_geracao
      await base44.entities.Petition.update(id, { status: "em_geracao" });

      // Monta template por código + prompt curto
      const templateParts = buildPetitionTemplate(petition, petitionConfig);
      const aiPrompt = buildShortAIPrompt(petition, petitionConfig, null);

      await base44.functions.invoke("generatePetition", {
        petitionId: id,
        aiPrompt,
        templateParts,
        templateName: petition.template_used || "",
        templateId: "",
      });

      setGeneratingStep("IA gerando narrativa...");
      startPolling();
    } catch (err) {
      setGenerating(false);
      toast.error("Erro ao iniciar geração: " + err.message);
      await base44.entities.Petition.update(id, { status: "rascunho" }).catch(() => {});
    }
  };

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
          {/* Botão Editar dados do rascunho */}
          {(petition.status === "rascunho" || !petitionContent) && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/nova-peticao?draftId=${id}`)}
            >
              <Pencil className="w-4 h-4" /> Editar dados
            </Button>
          )}

          {/* Botão Gerar Petição — para rascunhos sem conteúdo */}
          {!petitionContent && !generating && (
            <Button
              size="sm"
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleGenerate}
            >
              <Sparkles className="w-4 h-4" /> Gerar Petição
            </Button>
          )}

          {generating && (
            <span className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> {generatingStep}
            </span>
          )}

          {petitionContent && !editing && (
            <>
              <button onClick={handleCopy} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-transparent text-sm hover:bg-muted transition-colors">
                <Copy className="w-4 h-4" /> Copiar
              </button>
              <button onClick={handleStartEdit} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-amber-300 bg-amber-50 text-amber-700 text-sm hover:bg-amber-100 transition-colors">
                <Pencil className="w-4 h-4" /> Editar
              </button>
            </>
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
          {/* Botão download DOCX — se houver arquivo .docx salvo */}
          {petition.document_urls?.length > 0 && petition.document_urls.some(u => u?.endsWith(".docx")) && (
            <a
              href={petition.document_urls.find(u => u?.endsWith(".docx"))}
              download={petition.document_names?.find(n => n?.endsWith(".docx")) || "peticao.docx"}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-blue-300 bg-blue-50 text-blue-700 text-sm hover:bg-blue-100 transition-colors font-medium"
            >
              <FileDown className="w-4 h-4" /> Baixar DOCX
            </a>
          )}
          {petitionContent && (
            <>
              <ExportButtons petition={{...petition, generated_content: petitionContent}} petitionConfig={petitionConfig} />
            </>
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
          <div style={{ fontFamily: "Arial, sans-serif", fontSize: "12pt", lineHeight: 1.5, textAlign: "justify" }} className="petition-content">
            {petitionContent.split("\n").map((line, idx) => {
              const t = line.trim();
              if (!t) return <br key={idx} />;
              const noMd = t.replace(/\*\*(.*?)\*\*/g, "$1").replace(/^#{1,6}\s/, "");
              const isHeading = noMd === noMd.toUpperCase() && noMd.length > 3 && !/^[a-z]/.test(noMd) && !t.startsWith(">");
              const isEmenta = t.startsWith(">");
              const isFecho = /^(nestes termos|pede deferimento|e\.e\.d\.|termos em que|a\.e\.d\.)/i.test(t);
              const isPedido = /^[a-z]\)|^\d+\.\s|^[ivxlc]+\)/i.test(noMd);

              const renderInline = (raw) => {
                const parts = raw.split(/(\*\*.*?\*\*)/g);
                return parts.map((p, i) =>
                  p.startsWith("**") && p.endsWith("**")
                    ? <strong key={i}>{p.slice(2, -2)}</strong>
                    : <span key={i}>{p}</span>
                );
              };

              if (isHeading) return (
                <p key={idx} style={{ textAlign: "center", fontWeight: "bold", textTransform: "uppercase", textDecoration: "underline", margin: "1em 0 0.4em" }}>
                  {noMd}
                </p>
              );
              if (isEmenta) return (
                <p key={idx} style={{ marginLeft: "4cm", textAlign: "justify", marginBottom: "0.4em" }}>
                  {renderInline(t.slice(1).trim())}
                </p>
              );
              if (isFecho) return (
                <p key={idx} style={{ textAlign: "center", marginTop: "1em", marginBottom: "0.4em" }}>
                  {renderInline(noMd)}
                </p>
              );
              if (isPedido) return (
                <p key={idx} style={{ textAlign: "justify", textIndent: "3cm", fontWeight: "bold", marginBottom: "0.3em" }}>
                  {noMd.toLowerCase()}
                </p>
              );
              return (
                <p key={idx} style={{ textAlign: "justify", textIndent: "3cm", marginBottom: "0.3em" }}>
                  {renderInline(noMd)}
                </p>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground space-y-4">
            <FileText className="w-14 h-14 mx-auto opacity-30" />
            <div>
              <p className="font-semibold text-foreground">Petição ainda não gerada</p>
              <p className="text-sm mt-1">Este rascunho ainda não possui conteúdo. Gere a petição ou edite os dados.</p>
            </div>
            {!generating ? (
              <div className="flex gap-3 justify-center flex-wrap">
                <Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleGenerate}>
                  <Sparkles className="w-4 h-4" /> Gerar Petição
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => navigate(`/nova-peticao?draftId=${id}`)}>
                  <Pencil className="w-4 h-4" /> Editar dados
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 justify-center text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> {generatingStep}
              </div>
            )}
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