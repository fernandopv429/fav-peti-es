import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Wand2, Copy, Save, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
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

  useEffect(() => {
    base44.entities.Especialista.filter({ ativo: true })
      .then(data => {
        setTodos(data.sort((a, b) => Number(a.numero) - Number(b.numero)));
        // If pre-selected esp but no area, infer area
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

Com base no contexto acima, elabore o documento jurídico conforme sua especialidade. Seja completo, técnico e preciso.`;

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        model: espSelecionado.modelo_ia === "sonnet" ? "claude_sonnet_4_6" : (espSelecionado.modelo_ia || "claude_sonnet_4_6"),
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
    <div className="min-h-screen bg-[#0d1526]">
      {/* Header */}
      <div className="px-6 lg:px-10 pt-8 pb-6 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Wand2 className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <h1 className="text-white font-bold text-xl">Gerar Documento</h1>
        </div>
        <p className="text-slate-500 text-sm ml-12">Selecione o especialista ideal para o seu caso e forneça o contexto</p>
      </div>

      <div className="px-6 lg:px-10 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl">
        {/* Left — Form */}
        <div className="space-y-5">
          {/* Step 1: Área */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              1. Área do Direito
            </label>
            <select
              value={area}
              onChange={e => handleAreaChange(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
            >
              <option value="" className="bg-slate-900">Selecione a área...</option>
              {AREAS_ORDER.map(a => <option key={a} value={a} className="bg-slate-900">{a}</option>)}
            </select>
          </div>

          {/* Step 2: Especialista */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              2. Especialista
            </label>
            <select
              value={espId}
              onChange={e => setEspId(e.target.value)}
              disabled={!area}
              className="w-full bg-white/[0.06] border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-colors disabled:opacity-40"
            >
              <option value="" className="bg-slate-900">{area ? "Selecione o especialista..." : "Selecione a área primeiro"}</option>
              {espDaArea.map(e => (
                <option key={e.id} value={e.id} className="bg-slate-900">#{e.numero} — {e.titulo || e.name}</option>
              ))}
            </select>

            {/* Esp card preview */}
            {espSelecionado && (
              <div className="mt-3 p-4 rounded-xl bg-white/[0.04] border border-amber-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{espSelecionado.icone || "⚖️"}</span>
                  <p className="text-white font-semibold text-sm">{espSelecionado.titulo || espSelecionado.name}</p>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">{espSelecionado.descricao}</p>
                {espSelecionado.tools && (
                  <p className="text-amber-400/60 text-xs mt-2"><span className="font-semibold">Ferramentas:</span> {espSelecionado.tools}</p>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Contexto */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
              3. Contexto do caso
            </label>
            <textarea
              value={contexto}
              onChange={e => setContexto(e.target.value)}
              placeholder="Descreva detalhadamente o caso, as partes envolvidas, os fatos relevantes, documentos disponíveis e o que você precisa que seja elaborado..."
              className="w-full bg-white/[0.06] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 transition-colors min-h-[220px] resize-y leading-relaxed"
            />
            <p className="text-slate-600 text-xs mt-1">{contexto.length} caracteres — quanto mais detalhado, melhor o resultado</p>
          </div>

          <button
            onClick={handleGerar}
            disabled={gerando || !espSelecionado || !contexto.trim()}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-bold text-sm transition-colors"
          >
            {gerando ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando documento...</> : <><Wand2 className="w-4 h-4" /> Gerar Documento com IA</>}
          </button>
        </div>

        {/* Right — Result */}
        <div>
          {gerando && (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              </div>
              <p className="text-white font-semibold">Gerando com IA...</p>
              <p className="text-slate-500 text-sm text-center max-w-xs">O especialista está elaborando o documento. Isso pode levar alguns minutos.</p>
            </div>
          )}

          {!gerando && !resultado && (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20 border border-dashed border-white/[0.08] rounded-2xl">
              <Wand2 className="w-12 h-12 text-slate-700" />
              <p className="text-slate-500 text-sm text-center">O documento gerado aparecerá aqui</p>
            </div>
          )}

          {resultado && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-white font-semibold text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Documento gerado
                </p>
                <div className="flex gap-2">
                  <button onClick={handleCopiar} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-white/70 hover:text-white text-xs font-medium transition-colors">
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                  <button onClick={handleSalvar} disabled={saved} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-medium transition-colors disabled:opacity-50">
                    <Save className="w-3.5 h-3.5" /> {saved ? "Salvo!" : "Salvar"}
                  </button>
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 max-h-[600px] overflow-y-auto">
                <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{resultado}</pre>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300/80 text-xs">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                <p>{AVISO}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}