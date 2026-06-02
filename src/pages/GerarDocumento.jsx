import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Wand2, Copy, Save, Loader2, AlertTriangle, CheckCircle2, Paperclip, X, FileText, Image, File } from "lucide-react";
import { toast } from "sonner";

const AREAS_ORDER = [
  "Gestão & Prazos", "Atendimento & Clientes", "Pesquisa Jurídica", "Cível",
  "Recursos", "Trabalhista", "Família & Sucessões", "Criminal", "Tributário",
  "Empresarial & Contratos", "Imobiliário & Locação", "Previdenciário", "Execução & Cálculo",
];

const AVISO = "Rascunho profissional — revisão final por advogado é obrigatória antes de protocolar.";

export default function GerarDocumento() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const preArea = params.get("area") || "";
  const preEspId = params.get("especialista") || "";

  const [todos, setTodos] = useState([]);
  const [area, setArea] = useState(preArea);
  const [espId, setEspId] = useState(preEspId);
  const [contexto, setContexto] = useState("");
  const [resultado, setResultado] = useState("");
  const [gerando, setGerando] = useState(false);
  const [saved, setSaved] = useState(false);
  const [arquivos, setArquivos] = useState([]); // { name, url, type }
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    base44.entities.Especialista.filter({ ativo: true })
      .then(data => {
        setTodos(data.sort((a, b) => Number(a.numero) - Number(b.numero)));
        if (preEspId && !preArea) {
          const found = data.find(e => e.id === preEspId);
          if (found) setArea(found.area);
        }
      })
      .catch(() => {});
  }, []);

  const espDaArea = todos.filter(e => !area || e.area === area);
  const espSelecionado = todos.find(e => e.id === espId);

  const handleAreaChange = (val) => {
    setArea(val);
    setEspId("");
  };

  const handleAddArquivos = async (files) => {
    const lista = Array.from(files);
    for (let i = 0; i < lista.length; i++) {
      const file = lista[i];
      setUploadingIdx(arquivos.length + i);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setArquivos(prev => [...prev, { name: file.name, url: file_url, type: file.type }]);
      } catch (e) {
        toast.error(`Erro ao enviar ${file.name}: ` + e.message);
      }
    }
    setUploadingIdx(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoverArquivo = (idx) => {
    setArquivos(prev => prev.filter((_, i) => i !== idx));
  };

  const getFileIcon = (type) => {
    if (type?.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
    if (type?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  const handleGerar = async () => {
    if (!espSelecionado) { toast.error("Selecione um especialista."); return; }
    if (!contexto.trim()) { toast.error("Descreva o contexto do caso."); return; }

    setGerando(true);
    setResultado("");
    setSaved(false);

    const systemPrompt = espSelecionado.prompt_sistema || `Você é ${espSelecionado.titulo || espSelecionado.name}, especialista em ${espSelecionado.area}. Com base no contexto fornecido, elabore o documento jurídico solicitado com precisão técnica, linguagem formal e fundamentação adequada.`;

    const userPrompt = `Especialista acionado: ${espSelecionado.titulo || espSelecionado.name}
Área: ${espSelecionado.area}

CONTEXTO DO CASO:
${contexto}
${arquivos.length > 0 ? `\nDOCUMENTOS ANEXADOS (${arquivos.length}):\n${arquivos.map((a, i) => `${i + 1}. ${a.name}`).join("\n")}\n\nAnalise os documentos anexados junto com o contexto acima.` : ""}

Com base no contexto acima, elabore o documento jurídico conforme sua especialidade. Seja completo, técnico e preciso.`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        model: espSelecionado.modelo_ia === "sonnet" ? "claude_sonnet_4_6" : (espSelecionado.modelo_ia || "claude_sonnet_4_6"),
        file_urls: arquivos.length > 0 ? arquivos.map(a => a.url) : undefined,
      });
      setResultado(result);
    } catch (e) {
      toast.error("Erro ao gerar: " + e.message);
    } finally {
      setGerando(false);
    }
  };

  const handleCopiar = () => {
    navigator.clipboard.writeText(resultado);
    toast.success("Copiado!");
  };

  const handleSalvar = async () => {
    if (!resultado) return;
    try {
      await base44.entities.Petition.create({
        title: `${espSelecionado?.titulo || "Documento"} — ${new Date().toLocaleDateString("pt-BR")}`,
        case_type: "outro",
        claimant_name: "—",
        defendant_name: "—",
        generated_content: resultado,
        status: "concluida",
        additional_facts: contexto,
      });
      setSaved(true);
      toast.success("Salvo em Minhas Petições!");
    } catch (e) {
      toast.error("Erro ao salvar: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-8 pb-6 border-b border-border">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <Wand2 className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-foreground font-bold text-xl">Gerar Documento</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-12">Selecione o especialista ideal para o seu caso e forneça o contexto</p>
      </div>

      <div className="px-6 lg:px-10 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl">
        {/* Left — Form */}
        <div className="space-y-5">
          {/* Step 1: Área */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              1. Área do Direito
            </label>
            <select
              value={area}
              onChange={e => handleAreaChange(e.target.value)}
              className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            >
              <option value="">Selecione a área...</option>
              {AREAS_ORDER.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Step 2: Especialista */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              2. Especialista
            </label>
            <select
              value={espId}
              onChange={e => setEspId(e.target.value)}
              disabled={!area}
              className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-40"
            >
              <option value="">{area ? "Selecione o especialista..." : "Selecione a área primeiro"}</option>
              {espDaArea.map(e => (
                <option key={e.id} value={e.id}>#{e.numero} — {e.titulo || e.name}</option>
              ))}
            </select>

            {espSelecionado && (
              <div className="mt-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{espSelecionado.icone || "⚖️"}</span>
                  <p className="text-foreground font-semibold text-sm">{espSelecionado.titulo || espSelecionado.name}</p>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">{espSelecionado.descricao}</p>
                {espSelecionado.tools && (
                  <p className="text-primary text-xs mt-2 opacity-70"><span className="font-semibold">Ferramentas:</span> {espSelecionado.tools}</p>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Contexto */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              3. Contexto do caso
            </label>
            <textarea
              value={contexto}
              onChange={e => setContexto(e.target.value)}
              placeholder="Descreva detalhadamente o caso, as partes envolvidas, os fatos relevantes, documentos disponíveis e o que você precisa que seja elaborado..."
              className="w-full bg-input border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors min-h-[220px] resize-y leading-relaxed"
            />
            <p className="text-muted-foreground text-xs mt-1">{contexto.length} caracteres — quanto mais detalhado, melhor o resultado</p>
          </div>

          {/* Step 4: Documentos */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              4. Documentos para análise <span className="normal-case font-normal text-muted-foreground/70">(opcional)</span>
            </label>

            <div
              className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleAddArquivos(e.dataTransfer.files); }}
            >
              <Paperclip className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Clique ou arraste arquivos aqui</p>
              <p className="text-xs text-muted-foreground/60 mt-1">PDF, imagens, Word — a IA lerá o conteúdo</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt"
                className="hidden"
                onChange={e => handleAddArquivos(e.target.files)}
              />
            </div>

            {uploadingIdx !== null && (
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando arquivo...
              </div>
            )}

            {arquivos.length > 0 && (
              <div className="mt-3 space-y-2">
                {arquivos.map((arq, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                    {getFileIcon(arq.type)}
                    <span className="text-sm text-foreground flex-1 truncate">{arq.name}</span>
                    <button
                      onClick={() => handleRemoverArquivo(i)}
                      className="p-1 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">{arquivos.length} documento(s) serão analisados pela IA</p>
              </div>
            )}
          </div>

          <button
            onClick={handleGerar}
            disabled={gerando || !espSelecionado || !contexto.trim()}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground font-bold text-sm transition-colors"
          >
            {gerando ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando documento...</> : <><Wand2 className="w-4 h-4" /> Gerar Documento com IA</>}
          </button>
        </div>

        {/* Right — Result */}
        <div>
          {gerando && (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <p className="text-foreground font-semibold">Gerando com IA...</p>
              <p className="text-muted-foreground text-sm text-center max-w-xs">O especialista está elaborando o documento. Isso pode levar alguns minutos.</p>
            </div>
          )}

          {!gerando && !resultado && (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20 border border-dashed border-border rounded-2xl">
              <Wand2 className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm text-center">O documento gerado aparecerá aqui</p>
            </div>
          )}

          {resultado && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-foreground font-semibold text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" style={{ color: "hsl(var(--success))" }} /> Documento gerado
                </p>
                <div className="flex gap-2">
                  <button onClick={handleCopiar} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition-colors">
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                  <button onClick={handleSalvar} disabled={saved} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-xs font-medium transition-colors disabled:opacity-50">
                    <Save className="w-3.5 h-3.5" /> {saved ? "Salvo!" : "Salvar"}
                  </button>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6 max-h-[600px] overflow-y-auto">
                <pre className="text-sm text-card-foreground whitespace-pre-wrap font-sans leading-relaxed">{resultado}</pre>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl border text-xs" style={{ background: "hsl(var(--warning) / 0.1)", borderColor: "hsl(var(--warning) / 0.3)", color: "hsl(var(--foreground))" }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "hsl(var(--warning))" }} />
                <p>{AVISO}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}