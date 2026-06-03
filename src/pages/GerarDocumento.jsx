import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Wand2, Copy, Loader2, AlertTriangle, CheckCircle2, Paperclip, X,
  FileText, Image, File, ExternalLink, Download
} from "lucide-react";
import { toast } from "sonner";
import ExportButtons from "../components/petition/ExportButtons";
import { LetterheadHeader, LetterheadFooter } from "../components/petition/PetitionLetterhead";
import ReactMarkdown from "react-markdown";
import VigilanteForm from "../components/vigilante/VigilanteForm";

const AREAS_ORDER = [
  "Gestão & Prazos", "Atendimento & Clientes", "Pesquisa Jurídica", "Cível",
  "Recursos", "Trabalhista", "Família & Sucessões", "Criminal", "Tributário",
  "Empresarial & Contratos", "Imobiliário & Locação", "Previdenciário", "Execução & Cálculo",
];

const CASE_TYPE_MAP = {
  "Trabalhista": "trabalhista", "Cível": "civel", "Previdenciário": "previdenciario",
  "Criminal": "outro", "Tributário": "outro", "Empresarial & Contratos": "civel",
  "Família & Sucessões": "civel", "Imobiliário & Locação": "civel", "Execução & Cálculo": "trabalhista",
};

const AVISO = "Rascunho profissional — revisão final por advogado é obrigatória antes de protocolar.";

// Verifica se o template selecionado é o modelo Vigilante
function isModeloVigilante(template) {
  if (!template) return false;
  return template.name?.toLowerCase().includes("vigilante") && template.case_type === "trabalhista";
}

// Monta o texto da petição substituindo tokens do modelo pelos dados do formulário
function montarPeticaoDeterministica(templateContent, dados) {
  if (!templateContent || !dados) return templateContent || "";

  const vp = dados.valores_pedidos || {};

  // Mapa de tokens para valores
  const tokens = {
    "[VARA DO TRABALHO COMPETENTE]": dados.COMARCA_UF || "[VARA DO TRABALHO COMPETENTE]",
    "[REGIÃO]": dados.REGIAO_TRT || "[REGIÃO]",
    "[NOME DO RECLAMANTE]": dados.RECL_NOME || "[NOME DO RECLAMANTE]",
    "[nacionalidade]": dados.RECL_NACIONALIDADE || "brasileiro",
    "[estado civil]": dados.RECL_ESTADOCIVIL || "[estado civil]",
    "[RG]": dados.RECL_RG || "[RG]",
    "[UF]": (dados.RECL_RG || "").split(" ").pop() || "[UF]",
    "[PIS]": dados.RECL_PIS || "[PIS]",
    "[CTPS]": dados.RECL_CTPS || "[CTPS]",
    "[CPF]": dados.RECL_CPF || "[CPF]",
    "[data nascimento]": dados.RECL_NASC || "[data nascimento]",
    "[filiação]": dados.RECL_FILIACAO || "[filiação]",
    "[endereço completo]": dados.RECL_ENDERECO || "[endereço completo]",
    "[RAZÃO SOCIAL]": dados.RECL1_NOME || "[RAZÃO SOCIAL]",
    "[CNPJ]": dados.RECL1_CNPJ || "[CNPJ]",
    "[endereço]": dados.RECL1_ENDCOMPL || dados.RECL1_LOGRADOURO || "[endereço]",
    "[local da prestação de serviços]": dados.FORO_COMPETENCIA || "[local da prestação de serviços]",
    "[endereço do posto]": dados.LOCAL_PRESTACAO_COMPL || dados.LOCAL_PRESTACAO || "[endereço do posto]",
    "[data admissão]": dados.DATA_ADMISSAO || "[data admissão]",
    "[função]": dados.FUNCAO || "Vigilante",
    "[data]": dados.DATA_RESCISAO || "[data]",
    "[salário]": dados.SALARIO || "[salário]",
    "[horário, ex.: das 18:30 às 07:30]": dados.JORNADA_HORARIO || "[horário]",
    "[hora]": dados.JORNADA_EXTRAPOLA || "[hora]",
    "[x] vezes/mês": dados.JORNADA_FREQ_EXTRA || "[x] vezes/mês",
    "[x] vezes por mês": dados.JORNADA_FREQ_EXTRA || "[x] vezes por mês",
    "10 a 15 min": dados.INTERVALO_GOZADO || "10 a 15 min",
    "[CCT vigência]": dados.CCT_VIGENCIA || "2024/2025",
    "2024/2025": dados.CCT_VIGENCIA || "2024/2025",
    "[adicional convencional]": dados.ADIC_CONV || "60%",
    "60%": dados.ADIC_CONV || "60%",
    "[valor]/dia": dados.VAL_FT || "[valor]/dia",
    "[valor da condução]": dados.VAL_CONDUCAO || "[valor da condução]",
    "[valor alimentação]": dados.VAL_ALIMENTACAO || "[valor alimentação]",
    "[VALOR DA CAUSA]": dados.VALOR_CAUSA || "[VALOR DA CAUSA]",
    "[local e data]": dados.LOCAL_DATA_ASSINATURA || "[local e data]",
  };

  let texto = templateContent;

  // Substitui tokens simples
  Object.entries(tokens).forEach(([token, valor]) => {
    texto = texto.split(token).join(valor);
  });

  // Substitui P01..P87 no rol de pedidos
  for (let i = 1; i <= 87; i++) {
    const key = `P${String(i).padStart(2, "0")}`;
    const val = vp[key];
    if (val) {
      // Substitui referências como "R$ [valor P01]" ou simplesmente marca o valor
      texto = texto.split(`[${key}]`).join(val);
    }
  }

  // Injeta bloco de Valor da Causa se presente
  if (dados.VALOR_CAUSA) {
    texto = texto.replace(/R\$\s*\[VALOR DA CAUSA\]/gi, dados.VALOR_CAUSA);
    texto = texto.replace(/\[VALOR DA CAUSA\]/gi, dados.VALOR_CAUSA);
  }

  return texto;
}

export default function GerarDocumento() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(search);
  const preArea = params.get("area") || "";
  const preEspId = params.get("especialista") || "";

  const [todos, setTodos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [petitionConfig, setPetitionConfig] = useState(null);
  const [area, setArea] = useState(preArea);
  const [espId, setEspId] = useState(preEspId);
  const [templateId, setTemplateId] = useState("");
  const [contexto, setContexto] = useState("");
  const [resultado, setResultado] = useState("");
  const [gerando, setGerando] = useState(false);
  const [gerandoStep, setGerandoStep] = useState("");
  const [savedPetitionId, setSavedPetitionId] = useState(null);
  const [arquivos, setArquivos] = useState([]);
  const [uploadingIdx, setUploadingIdx] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    Promise.all([
      base44.entities.Especialista.filter({ ativo: true }).catch(() => []),
      base44.entities.PetitionTemplate.filter({ is_active: true }).catch(() => []),
      base44.entities.PetitionConfig.filter({ ativo: true }).catch(() => []),
    ]).then(([especialistas, tmpl, configs]) => {
      const sorted = especialistas.sort((a, b) => Number(a.numero) - Number(b.numero));
      setTodos(sorted);
      if (preEspId && !preArea) {
        const found = sorted.find(e => e.id === preEspId);
        if (found) setArea(found.area);
      }
      setTemplates(tmpl);
      setPetitionConfig(configs[0] || null);
    });
  }, []);

  const espDaArea = todos.filter(e => !area || e.area === area);
  const espSelecionado = todos.find(e => e.id === espId);
  const templateSelecionado = templates.find(t => t.id === templateId) || null;
  const modoVigilante = isModeloVigilante(templateSelecionado);

  const handleAreaChange = (val) => { setArea(val); setEspId(""); };

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

  const handleRemoverArquivo = (idx) => setArquivos(prev => prev.filter((_, i) => i !== idx));

  const getFileIcon = (type) => {
    if (type?.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
    if (type?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  const extractDocumentContents = async () => {
    const conteudosTexto = [], urlsVisuais = [], naoPudeLer = [];
    for (const arq of arquivos) {
      const lower = arq.url.toLowerCase().split("?")[0];
      const isVisual = arq.type?.startsWith("image/") || arq.type?.includes("pdf") ||
        lower.endsWith(".pdf") || lower.endsWith(".png") || lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") || lower.endsWith(".webp");
      if (isVisual) {
        urlsVisuais.push(arq.url);
      } else {
        try {
          const extracted = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url: arq.url,
            json_schema: { type: "object", properties: { conteudo: { type: "string" } } }
          });
          if (extracted?.status === "success" && extracted?.output?.conteudo) {
            conteudosTexto.push(`=== ${arq.name} ===\n${extracted.output.conteudo}`);
          } else {
            try {
              const resp = await fetch(arq.url);
              if (resp.ok) {
                const txt = (await resp.text()).slice(0, 12000).trim();
                txt ? conteudosTexto.push(`=== ${arq.name} ===\n${txt}`) : naoPudeLer.push(arq.name);
              } else naoPudeLer.push(arq.name);
            } catch (_) { naoPudeLer.push(arq.name); }
          }
        } catch (_) { naoPudeLer.push(arq.name); }
      }
    }
    return { conteudosTexto, urlsVisuais, naoPudeLer };
  };

  // ── GERAÇÃO MODO VIGILANTE (determinística) ───────────────────────────────
  const handleGerarVigilante = async (dadosVigilante) => {
    if (!templateSelecionado?.content) {
      toast.error("Modelo Vigilante sem conteúdo. Verifique em Modelos.");
      return;
    }

    setGerando(true);
    setResultado("");
    setSavedPetitionId(null);

    const titulo = dadosVigilante.titulo || `${dadosVigilante.RECL_NOME || "Vigilante"} — ${new Date().toLocaleDateString("pt-BR")}`;

    // PASSO 1: Cria registro Petition
    let petitionId = null;
    try {
      setGerandoStep("Criando registro...");
      const created = await base44.entities.Petition.create({
        title: titulo, case_type: "trabalhista",
        claimant_name: dadosVigilante.RECL_NOME || "—",
        defendant_name: dadosVigilante.RECL1_NOME || "—",
        status: "em_geracao", template_used: templateSelecionado.id,
        document_urls: arquivos.map(a => a.url),
        document_names: arquivos.map(a => a.name),
        salary: parseFloat((dadosVigilante.SALARIO || "0").replace(/[^\d,]/g, "").replace(",", ".")) || undefined,
      });
      petitionId = created.id;
      setSavedPetitionId(petitionId);
    } catch (e) {
      toast.error("Erro ao criar registro: " + e.message);
      setGerando(false);
      return;
    }

    // PASSO 2: Substitui tokens deterministicamente
    setGerandoStep("Preenchendo modelo com dados do formulário...");
    let textoBase = montarPeticaoDeterministica(templateSelecionado.content, dadosVigilante);

    // PASSO 3: IA redige apenas a narrativa fática + analisa documentos
    let textoFinal = textoBase;
    let statusFinal = "concluida";

    try {
      setGerandoStep("Extraindo dados dos documentos...");
      let conteudosTexto = [], urlsVisuais = [], naoPudeLer = [];
      if (arquivos.length > 0) {
        const extracted = await extractDocumentContents();
        conteudosTexto = extracted.conteudosTexto;
        urlsVisuais = extracted.urlsVisuais;
        naoPudeLer = extracted.naoPudeLer;
      }

      const docBlock = conteudosTexto.length > 0
        ? `\n\nDOCUMENTOS ANEXADOS:\n${conteudosTexto.join("\n\n")}` : "";
      const docVisual = urlsVisuais.length > 0
        ? `\n\nAnálise os ${urlsVisuais.length} arquivo(s) PDF/imagem em anexo e extraia TODOS os fatos concretos.` : "";
      const pendencias = naoPudeLer.length > 0
        ? `\n\nDOCUMENTOS NÃO LIDOS (registre como PENDÊNCIA no documento): ${naoPudeLer.join(", ")}` : "";

      setGerandoStep("IA completando narrativa fática...");

      // A IA só completa trechos que ficaram em [colchetes] e redige narrativa fática
      const promptIA = `Você é um advogado trabalhista. Abaixo está uma petição já montada deterministicamente com dados do formulário.
Sua tarefa: APENAS preencher os campos que ainda estão entre [colchetes] usando os dados fornecidos abaixo, e expandir com linguagem jurídica formal as seções descritivas de fatos (DO DANO MORAL, DA RESCISÃO INDIRETA, DA JORNADA) com base nos dados concretos do caso.

REGRAS:
- NÃO altere nenhum valor monetário (P01 a P87, VALOR_CAUSA, SALARIO). Eles já estão corretos.
- NÃO altere qualificação das partes, datas, fundamentos legais, súmulas ou artigos.
- APENAS expanda narrativa fática descritiva e preencha [colchetes] restantes.
- Mantenha estrutura e títulos exatamente como estão.
${docBlock}${docVisual}${pendencias}

DADOS DO CASO:
- Reclamante: ${dadosVigilante.RECL_NOME}
- Reclamada: ${dadosVigilante.RECL1_NOME}
- Admissão: ${dadosVigilante.DATA_ADMISSAO}
- Rescisão: ${dadosVigilante.DATA_RESCISAO}
- Salário: ${dadosVigilante.SALARIO}
- Jornada: ${dadosVigilante.JORNADA_HORARIO}
- Intervalo gozado: ${dadosVigilante.INTERVALO_GOZADO}
- Extrapolação: ${dadosVigilante.JORNADA_EXTRAPOLA} em média ${dadosVigilante.JORNADA_FREQ_EXTRA}
- Local prestação: ${dadosVigilante.LOCAL_PRESTACAO}, ${dadosVigilante.LOCAL_PRESTACAO_COMPL}
- Valor da causa: ${dadosVigilante.VALOR_CAUSA}

PETIÇÃO A COMPLETAR:
${textoBase}

Retorne a petição completa e corrigida, sem comentários adicionais.`;

      textoFinal = await base44.integrations.Core.InvokeLLM({
        prompt: promptIA,
        model: "claude_sonnet_4_6",
        file_urls: urlsVisuais.length > 0 ? urlsVisuais : undefined,
      });

      if (/\[A PREENCHER|\[PENDÊNCIA/i.test(textoFinal)) statusFinal = "revisao_necessaria";

    } catch (e) {
      // Falha na IA: usa texto determinístico puro
      textoFinal = textoBase;
      statusFinal = "revisao_necessaria";
      toast.warning("IA indisponível — petição gerada com dados do formulário apenas.");
    }

    // PASSO 4: Persiste Petition
    try {
      setGerandoStep("Salvando...");
      const blob = new Blob([textoFinal], { type: "text/plain" });
      const fileObj = new File([blob], "peticao.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file: fileObj });
      await base44.entities.Petition.update(petitionId, {
        generated_content: contentUrl, status: statusFinal,
        claimant_name: dadosVigilante.RECL_NOME || "—",
        defendant_name: dadosVigilante.RECL1_NOME || "—",
      });
      // Atualiza petition_id no CasoVigilante se salvo
      if (dadosVigilante.id) {
        base44.entities.CasoVigilante.update(dadosVigilante.id, { petition_id: petitionId, status: "gerado" }).catch(() => {});
      }
      // Incrementa use_count
      base44.entities.PetitionTemplate.update(templateSelecionado.id, {
        use_count: (templateSelecionado.use_count || 0) + 1,
      }).catch(() => {});
    } catch (saveErr) {
      try {
        await base44.entities.Petition.update(petitionId, {
          generated_content: textoFinal.slice(0, 50000), status: statusFinal,
        });
      } catch (_) {}
      toast.error("Aviso: problema ao salvar arquivo.");
    }

    setResultado(textoFinal);
    setGerando(false);
    setGerandoStep("");

    if (statusFinal === "revisao_necessaria") {
      toast.warning("Petição gerada com pendências — revise antes de protocolar.");
    } else {
      toast.success("Petição gerada e salva com sucesso!");
    }
  };

  // ── GERAÇÃO MODO LIVRE / COM TEMPLATE ────────────────────────────────────
  const handleGerar = async () => {
    if (!espSelecionado) { toast.error("Selecione um especialista."); return; }
    if (!contexto.trim()) { toast.error("Descreva o contexto do caso."); return; }

    setGerando(true);
    setResultado("");
    setSavedPetitionId(null);

    const titulo = `${espSelecionado.titulo || espSelecionado.name} — ${new Date().toLocaleDateString("pt-BR")}`;
    const caseType = CASE_TYPE_MAP[area] || "outro";

    let petitionId = null;
    try {
      setGerandoStep("Criando registro...");
      const created = await base44.entities.Petition.create({
        title: titulo, case_type: caseType, claimant_name: "—", defendant_name: "—",
        status: "em_geracao", additional_facts: contexto,
        template_used: templateSelecionado?.id || "",
        document_urls: arquivos.map(a => a.url),
        document_names: arquivos.map(a => a.name),
      });
      petitionId = created.id;
      setSavedPetitionId(petitionId);
    } catch (e) {
      toast.error("Erro ao criar registro: " + e.message);
      setGerando(false);
      return;
    }

    let conteudosTexto = [], urlsVisuais = [], naoPudeLer = [];
    if (arquivos.length > 0) {
      setGerandoStep(`Lendo ${arquivos.length} documento(s)...`);
      try {
        const extracted = await extractDocumentContents();
        conteudosTexto = extracted.conteudosTexto;
        urlsVisuais = extracted.urlsVisuais;
        naoPudeLer = extracted.naoPudeLer;
      } catch (_) {}
    }

    const nomeEsp = espSelecionado.titulo || espSelecionado.name;
    const baseSystemPrompt = espSelecionado.prompt_sistema ||
      `Você é ${nomeEsp}, especialista em ${espSelecionado.area}. Elabore o documento jurídico solicitado com precisão técnica.`;

    const docTextBlock = conteudosTexto.length > 0
      ? `\n\n${"═".repeat(60)}\nCONTEÚDO DOS DOCUMENTOS:\n${"═".repeat(60)}\n\n${conteudosTexto.join("\n\n")}` : "";
    const docVisualNote = urlsVisuais.length > 0
      ? `\n\nAnalise os ${urlsVisuais.length} arquivo(s) em anexo e use os dados concretos.` : "";
    const naoLidosNote = naoPudeLer.length > 0
      ? `\n\nDOCUMENTOS NÃO LIDOS: ${naoPudeLer.join(", ")}` : "";

    const docAnalysisInstructions = arquivos.length > 0
      ? `\n\nPROTOCOLO OBRIGATÓRIO: 1) Extraia todos os dados dos documentos. 2) Use exclusivamente dados reais, nunca hipotéticos.` : "";

    let systemPrompt, userPrompt;
    if (templateSelecionado?.content) {
      systemPrompt = `Você é um redator jurídico.${docAnalysisInstructions}`;
      userPrompt = `INSTRUÇÕES: Reproduza o modelo INTEGRALMENTE, substituindo [colchetes] pelos dados do caso.\n\nREGRAS:\n1. Copie o modelo linha por linha.\n2. Substitua cada [campo] pelo dado correspondente.\n3. NUNCA omita, resuma ou reordene seções.\n4. Se não houver dado: [A PREENCHER: nome do campo]\n5. Mantenha intactos: fundamentos legais, súmulas, artigos.\n\n${"═".repeat(60)}\nDADOS DO CASO:\n${"═".repeat(60)}\n${contexto}${docTextBlock}${docVisualNote}${naoLidosNote}\n\n${"═".repeat(60)}\nMODELO A REPRODUZIR:\n${"═".repeat(60)}\n\n${templateSelecionado.content}\n\n${"═".repeat(60)}\nReproduz o modelo acima do início ao fim, substituindo os [colchetes].`;
    } else {
      systemPrompt = baseSystemPrompt + docAnalysisInstructions;
      userPrompt = `Especialista: ${nomeEsp} | Área: ${espSelecionado.area}\n\nCONTEXTO DO CASO:\n${contexto}${docTextBlock}${docVisualNote}${naoLidosNote}\n\nElaore o documento jurídico completo.`;
    }

    let textoGerado = "", statusFinal = "concluida";
    try {
      setGerandoStep("IA elaborando o documento...");
      const model = espSelecionado.modelo_ia === "sonnet"
        ? "claude_sonnet_4_6" : (espSelecionado.modelo_ia || "claude_sonnet_4_6");
      textoGerado = await base44.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        model,
        file_urls: urlsVisuais.length > 0 ? urlsVisuais : undefined,
      });
      if (/\[A PREENCHER|\[PENDÊNCIA/i.test(textoGerado)) statusFinal = "revisao_necessaria";
    } catch (e) {
      statusFinal = "revisao_necessaria";
      textoGerado = `[ERRO NA GERAÇÃO: ${e.message}]\n\nContexto do caso:\n${contexto}`;
      toast.error("Erro ao gerar: " + e.message);
    }

    try {
      setGerandoStep("Salvando documento...");
      const blob = new Blob([textoGerado], { type: "text/plain" });
      const fileObj = new File([blob], "documento.txt", { type: "text/plain" });
      const { file_url: contentUrl } = await base44.integrations.Core.UploadFile({ file: fileObj });
      await base44.entities.Petition.update(petitionId, { generated_content: contentUrl, status: statusFinal, template_used: templateSelecionado?.id || "" });
      if (templateSelecionado?.id) {
        base44.entities.PetitionTemplate.update(templateSelecionado.id, { use_count: (templateSelecionado.use_count || 0) + 1 }).catch(() => {});
      }
    } catch (_) {
      try { await base44.entities.Petition.update(petitionId, { generated_content: textoGerado.slice(0, 50000), status: statusFinal }); } catch (_) {}
      toast.error("Aviso: problema ao salvar arquivo.");
    }

    setResultado(textoGerado);
    setGerando(false);
    setGerandoStep("");
    if (statusFinal === "revisao_necessaria") toast.warning("Documento gerado com pendências.");
    else toast.success("Documento gerado e salvo com sucesso!");
  };

  const handleCopiar = () => { navigator.clipboard.writeText(resultado); toast.success("Copiado!"); };

  const petitionForExport = savedPetitionId ? {
    id: savedPetitionId,
    title: `${espSelecionado?.titulo || "Documento"} — ${new Date().toLocaleDateString("pt-BR")}`,
    generated_content: resultado, claimant_name: "—", defendant_name: "—",
  } : null;

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
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">1. Área do Direito</label>
            <select value={area} onChange={e => handleAreaChange(e.target.value)}
              className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors">
              <option value="">Selecione a área...</option>
              {AREAS_ORDER.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Step 2: Especialista */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">2. Especialista</label>
            <select value={espId} onChange={e => setEspId(e.target.value)} disabled={!area}
              className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors disabled:opacity-40">
              <option value="">{area ? "Selecione o especialista..." : "Selecione a área primeiro"}</option>
              {espDaArea.map(e => <option key={e.id} value={e.id}>#{e.numero} — {e.titulo || e.name}</option>)}
            </select>
            {espSelecionado && (
              <div className="mt-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{espSelecionado.icone || "⚖️"}</span>
                  <p className="text-foreground font-semibold text-sm">{espSelecionado.titulo || espSelecionado.name}</p>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">{espSelecionado.descricao}</p>
              </div>
            )}
          </div>

          {/* Step 3: Modelo */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              3. Modelo a seguir <span className="normal-case font-normal text-muted-foreground/70">(opcional)</span>
            </label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)}
              className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors">
              <option value="">Sem modelo — IA decide a estrutura</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.case_type})</option>)}
            </select>
            {templateSelecionado && (
              <div className="mt-2 flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{templateSelecionado.name}</p>
                  {modoVigilante && <p className="text-xs text-green-600 font-semibold mt-0.5">⚙️ Modo determinístico ativo — formulário estruturado</p>}
                </div>
                <span className="text-xs bg-primary/15 text-primary font-semibold px-2 py-0.5 rounded-full shrink-0">Obrigatório</span>
              </div>
            )}
          </div>

          {/* MODO VIGILANTE: Formulário estruturado */}
          {modoVigilante ? (
            <>
              <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-800 font-medium">
                ⚙️ <strong>Modo Vigilante ativo:</strong> Preencha o formulário abaixo. Os valores monetários e dados das partes serão inseridos deterministicamente — a IA só redige a narrativa fática.
              </div>

              {/* Documentos para análise */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Documentos para análise <span className="normal-case font-normal text-muted-foreground/70">(opcional)</span>
                </label>
                <div className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleAddArquivos(e.dataTransfer.files); }}>
                  <Paperclip className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">Clique ou arraste arquivos aqui</p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx"
                    className="hidden" onChange={e => handleAddArquivos(e.target.files)} />
                </div>
                {uploadingIdx !== null && <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</div>}
                {arquivos.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {arquivos.map((arq, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                        {getFileIcon(arq.type)}
                        <span className="text-xs text-foreground flex-1 truncate">{arq.name}</span>
                        <button onClick={() => handleRemoverArquivo(i)} className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <VigilanteForm onGerarComDados={handleGerarVigilante} />
            </>
          ) : (
            <>
              {/* MODO NORMAL */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">4. Contexto do caso</label>
                <textarea value={contexto} onChange={e => setContexto(e.target.value)}
                  placeholder="Descreva detalhadamente o caso, as partes envolvidas, os fatos relevantes..."
                  className="w-full bg-input border border-border text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors min-h-[200px] resize-y leading-relaxed" />
                <p className="text-muted-foreground text-xs mt-1">{contexto.length} caracteres</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  5. Documentos para análise <span className="normal-case font-normal text-muted-foreground/70">(opcional)</span>
                </label>
                <div className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleAddArquivos(e.dataTransfer.files); }}>
                  <Paperclip className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Clique ou arraste arquivos aqui</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">PDF, imagens, Word — a IA lerá e extrairá o conteúdo integral</p>
                  <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx"
                    className="hidden" onChange={e => handleAddArquivos(e.target.files)} />
                </div>
                {uploadingIdx !== null && <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando arquivo...</div>}
                {arquivos.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {arquivos.map((arq, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
                        {getFileIcon(arq.type)}
                        <span className="text-sm text-foreground flex-1 truncate">{arq.name}</span>
                        <button onClick={() => handleRemoverArquivo(i)} className="p-1 rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                    <p className="text-xs text-primary font-medium">✓ {arquivos.length} documento(s) serão analisados</p>
                  </div>
                )}
              </div>

              <button onClick={handleGerar} disabled={gerando || !espSelecionado || !contexto.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground font-bold text-sm transition-colors">
                {gerando ? <><Loader2 className="w-4 h-4 animate-spin" /> {gerandoStep || "Processando..."}</> : <><Wand2 className="w-4 h-4" /> Gerar Documento com IA</>}
              </button>
            </>
          )}
        </div>

        {/* Right — Result */}
        <div>
          {gerando && (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-20">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
              <p className="text-foreground font-semibold">Gerando com IA...</p>
              <p className="text-muted-foreground text-sm text-center max-w-xs">{gerandoStep || "Processando..."}</p>
            </div>
          )}

          {!gerando && !resultado && (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20 border border-dashed border-border rounded-2xl">
              <Wand2 className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm text-center">O documento gerado aparecerá aqui</p>
            </div>
          )}

          {resultado && !gerando && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-foreground font-semibold text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" /> Documento gerado e salvo
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={handleCopiar} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-medium transition-colors">
                    <Copy className="w-3.5 h-3.5" /> Copiar
                  </button>
                  {savedPetitionId && (
                    <button onClick={() => navigate(`/peticoes/${savedPetitionId}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/25 text-primary text-xs font-medium transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" /> Ver em Petições
                    </button>
                  )}
                  {petitionForExport && <ExportButtons petition={petitionForExport} petitionConfig={petitionConfig} />}
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-6 max-h-[600px] overflow-y-auto" id="gerar-doc-print-area">
                <LetterheadHeader config={petitionConfig} />
                <div className="prose prose-sm prose-slate max-w-none text-card-foreground">
                  <ReactMarkdown components={{
                    p: ({ children }) => <p style={{ textAlign: "justify", marginBottom: "0.5em" }}>{children}</p>,
                    h1: ({ children }) => <h1 style={{ textAlign: "center", fontWeight: "bold", textTransform: "uppercase", margin: "1.2em 0 0.4em" }}>{children}</h1>,
                    h2: ({ children }) => <h2 style={{ textAlign: "center", fontWeight: "bold", textTransform: "uppercase", margin: "1em 0 0.4em" }}>{children}</h2>,
                    h3: ({ children }) => <h3 style={{ fontWeight: "bold", margin: "0.8em 0 0.3em" }}>{children}</h3>,
                  }}>{resultado}</ReactMarkdown>
                </div>
                <LetterheadFooter config={petitionConfig} />
              </div>

              {savedPetitionId && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Salvo em <strong>Minhas Petições</strong> — não se perderá ao recarregar.</span>
                </div>
              )}
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