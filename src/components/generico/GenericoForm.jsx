/**
 * GenericoForm — formulário determinístico genérico para qualquer template tokenizado.
 *
 * Props:
 *   templateDocxUrl  : URL do .docx para extração de tokens
 *   templateId       : ID do PetitionTemplate
 *   templateName     : Nome do template
 *   documentUrls     : URLs dos documentos anexados (para IA)
 *   onGerar          : fn(dados: Record<string,string|bool>) => void — chamado ao gerar
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { extractTokensFromUrl, groupTokens } from "@/lib/extractDocxTokens.js";
import { ChevronDown, ChevronRight, Save, Download, Upload, Loader2, Wand2, FileDown, AlertTriangle, Paperclip, X, FileText, Image, File } from "lucide-react";
import { toast } from "sonner";

// Entidade de persistência de casos genéricos (reutilizamos CasoVigilante com campo titulo)
// Diferenciamos pelo campo template_used (armazenado em valores_pedidos._templateId)

// ---------- sub-componentes simples ----------

function Section({ title, open, onToggle, children }) {
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
      >
        <span className="font-semibold text-sm text-foreground">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {children}
        </div>
      )}
    </div>
  );
}

function FieldText({ label, token, value, onChange, full }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs text-muted-foreground mb-1">
        <span className="font-mono text-primary/70 mr-1">{token}</span>
        {label !== token ? `— ${label}` : ""}
      </label>
      <input
        type="text"
        value={value || ""}
        onChange={e => onChange(token, e.target.value)}
        className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

function FieldBool({ label, token, value, onChange }) {
  return (
    <div className="sm:col-span-2 flex items-center gap-3 py-1">
      <input
        type="checkbox"
        id={`chk_${token}`}
        checked={value === true || value === "true" || value === "Sim"}
        onChange={e => onChange(token, e.target.checked)}
        className="w-4 h-4 accent-primary"
      />
      <label htmlFor={`chk_${token}`} className="text-sm text-foreground cursor-pointer">
        <span className="font-mono text-primary/70 mr-1">{token}</span>
        {label !== token ? `— ${label}` : ""}
      </label>
    </div>
  );
}

// ---------- componente principal ----------

export default function GenericoForm({ templateDocxUrl, templateId, templateName, documentUrls = [], onGerar }) {
  const [tokens, setTokens] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [dados, setDados] = useState({});
  const [titulo, setTitulo] = useState("");
  const [openSections, setOpenSections] = useState({});
  const [casos, setCasos] = useState([]);
  const [casoId, setCasoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [extraindoIA, setExtraindoIA] = useState(false);
  // Documentos internos ao formulário (upload próprio)
  const [arquivosIA, setArquivosIA] = useState([]);
  const [uploadingIA, setUploadingIA] = useState(false);
  const fileInputIARef = useRef(null);

  // 1. Extrai tokens do DOCX ao montar (ou quando URL mudar)
  useEffect(() => {
    if (!templateDocxUrl) return;
    setLoadingTokens(true);
    setTokenError("");
    extractTokensFromUrl(templateDocxUrl)
      .then(toks => {
        setTokens(toks);
        const grps = groupTokens(toks);
        setGrupos(grps);
        // Abre o primeiro grupo por padrão
        if (grps.length > 0) {
          setOpenSections({ [grps[0].grupo]: true });
        }
      })
      .catch(err => setTokenError(err.message))
      .finally(() => setLoadingTokens(false));
  }, [templateDocxUrl]);

  // 2. Carrega casos salvos para este template
  useEffect(() => {
    if (!templateId) return;
    base44.entities.CasoVigilante.list()
      .then(list => {
        // Filtra pelo campo valores_pedidos._templateId
        const filtrados = (list || []).filter(c => {
          const vp = c.valores_pedidos || {};
          return vp._templateId === templateId;
        });
        setCasos(filtrados);
      })
      .catch(() => {});
  }, [templateId]);

  const handleChange = useCallback((token, val) => {
    setDados(prev => ({ ...prev, [token]: val }));
  }, []);

  const toggleSection = (g) => setOpenSections(prev => ({ ...prev, [g]: !prev[g] }));

  const handleCarregar = (id) => {
    setCasoId(id);
    if (!id) { setDados({}); setTitulo(""); return; }
    const found = casos.find(c => c.id === id);
    if (!found) return;
    const { valores_pedidos, titulo: t, ...rest } = found;
    // dados salvos estão em valores_pedidos (exceto _templateId)
    const { _templateId, ...savedDados } = valores_pedidos || {};
    setDados(savedDados);
    setTitulo(t || "");
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const payload = {
        titulo: titulo || `${templateName} — ${new Date().toLocaleDateString("pt-BR")}`,
        status: "preenchido",
        valores_pedidos: { ...dados, _templateId: templateId },
        // Copia campos de identidade para facilitar busca
        RECL_NOME: dados.RECL_NOME || "",
        RECL1_NOME: dados.RECL1_NOME || "",
      };
      if (casoId) {
        await base44.entities.CasoVigilante.update(casoId, payload);
        toast.success("Caso atualizado!");
      } else {
        const saved = await base44.entities.CasoVigilante.create(payload);
        setCasoId(saved.id);
        setCasos(prev => [...prev, saved]);
        toast.success("Caso salvo!");
      }
    } catch (e) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleBaixarJson = () => {
    const json = { templateId, templateName, dados, titulo };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dados.RECL_NOME || templateName || "caso"}_dados.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("dados.json baixado!");
  };

  const getFileIcon = (type) => {
    if (type?.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
    if (type?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  const handleAddArquivosIA = async (files) => {
    const lista = Array.from(files);
    setUploadingIA(true);
    for (const file of lista) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setArquivosIA(prev => [...prev, { name: file.name, url: file_url, type: file.type }]);
      } catch (e) {
        toast.error(`Erro ao enviar ${file.name}: ` + e.message);
      }
    }
    setUploadingIA(false);
    if (fileInputIARef.current) fileInputIARef.current.value = "";
  };

  const handleCarregarJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed.dados) {
          setDados(parsed.dados);
          if (parsed.titulo) setTitulo(parsed.titulo);
          toast.success("Dados carregados do JSON!");
        }
      } catch (err) {
        toast.error("Erro ao ler JSON: " + err.message);
      }
    };
    input.click();
  };

  // Extração IA: preenche campos curtos deterministicamente, narrativos via IA
  const handleExtrairIA = async () => {
    // Combina documentos internos com os externos passados pelo pai
    const todasUrls = [
      ...arquivosIA.map(a => a.url),
      ...(documentUrls || []),
    ];
    if (todasUrls.length === 0) {
      // Se não há documentos, abre o seletor de arquivos primeiro
      fileInputIARef.current?.click();
      return;
    }
    setExtraindoIA(true);
    try {
      // Separa visuais de texto
      const isVisual = (url) => {
        const l = url.toLowerCase().split("?")[0];
        return l.endsWith(".pdf") || l.endsWith(".png") || l.endsWith(".jpg") || l.endsWith(".jpeg") || l.endsWith(".webp");
      };
      const urlsVisuais = todasUrls.filter(isVisual);
      const urlsTexto = todasUrls.filter(u => !isVisual(u));
      const textos = [];
      for (const url of urlsTexto) {
        try {
          const r = await fetch(url);
          if (r.ok) textos.push((await r.text()).slice(0, 8000));
        } catch (_) {}
      }

      // Identifica tokens narrativos (longos) vs. curtos
      const NARRATIVOS = new Set([
        "descricao_assedio", "condicoes_laborais_lesivas", "fatos_adicionais",
        "historico_contratual", "descricao_dano_moral", "contexto_caso",
      ]);
      const tokensCurtos = tokens.filter(t => !NARRATIVOS.has(t.toLowerCase()));
      const tokensNarrativos = tokens.filter(t => NARRATIVOS.has(t.toLowerCase()));

      const promptExtracao = `Você é um extrator de dados jurídicos.

TOKENS DO MODELO (${templateName}): ${tokensCurtos.join(", ")}

${textos.length > 0 ? `DOCUMENTOS (texto):\n${textos.join("\n\n").slice(0, 8000)}\n\n` : ""}
${urlsVisuais.length > 0 ? `${urlsVisuais.length} arquivo(s) visual(is) em anexo.\n\n` : ""}

REGRAS:
1. Retorne SOMENTE JSON puro.
2. Para cada token listado, extraia o valor CURTO e OBJETIVO dos documentos (datas, nomes, CNPJs, valores monetários, horários).
3. PROIBIDO texto narrativo longo. Máximo 1 linha por token.
4. Para tokens não encontrados nos documentos, NÃO inclua no JSON.
5. Datas no formato "DD de MÊS de AAAA". Valores monetários: "R$ X.XXX,XX".
6. Campos booleanos (tem_subsidiaria, JUSTICA_GRATUITA, JUIZO_DIGITAL): true ou false.`;

      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt: promptExtracao,
        model: "claude_opus_4_8",
        file_urls: urlsVisuais.length > 0 ? urlsVisuais : undefined,
        response_json_schema: {
          type: "object",
          additionalProperties: true,
        },
      });

      // Preenche narrativos com IA se houver
      const dadosNarrativos = {};
      if (tokensNarrativos.length > 0) {
        for (const t of tokensNarrativos) {
          try {
            const promptNarrativo = `Com base nos documentos do caso, redija um parágrafo objetivo (máximo 3 frases) para o campo "${t}" de uma petição trabalhista. Baseie-se nos fatos reais dos documentos. Retorne apenas o texto do parágrafo, sem títulos.`;
            const txt = await base44.integrations.Core.InvokeLLM({
              prompt: promptNarrativo,
              file_urls: urlsVisuais.length > 0 ? urlsVisuais : undefined,
            });
            if (txt && typeof txt === "string") dadosNarrativos[t] = txt.trim();
          } catch (_) {}
        }
      }

      const merged = { ...dados, ...resultado, ...dadosNarrativos };
      setDados(merged);
      toast.success("Campos preenchidos! Revise antes de gerar.");
      // Abre todas as seções para revisão
      const allOpen = {};
      grupos.forEach(g => { allOpen[g.grupo] = true; });
      setOpenSections(allOpen);
    } catch (err) {
      toast.error("Erro na extração: " + err.message);
    } finally {
      setExtraindoIA(false);
    }
  };

  const handleGerar = () => {
    onGerar({ ...dados, titulo });
  };

  if (loadingTokens) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Lendo tokens do modelo...
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex items-start gap-2 p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Erro ao ler tokens do modelo</p>
          <p className="text-muted-foreground">{tokenError}</p>
        </div>
      </div>
    );
  }

  if (tokens.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Carregar caso salvo / JSON */}
      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Carregar caso salvo</label>
          <select
            value={casoId}
            onChange={e => handleCarregar(e.target.value)}
            className="w-full bg-input border border-border text-foreground rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— Novo caso —</option>
            {casos.map(c => (
              <option key={c.id} value={c.id}>
                {c.titulo || c.RECL_NOME || c.id}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleBaixarJson}
          title="Baixar dados como JSON"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> JSON
        </button>
        <button
          type="button"
          onClick={handleCarregarJson}
          title="Carregar dados de arquivo JSON"
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold transition-colors"
        >
          <Upload className="w-3.5 h-3.5" /> Importar
        </button>
      </div>

      {/* Seção: extrair com IA (upload interno + botão) */}
      <div className="rounded-xl border border-dashed border-primary/40 bg-primary/3 p-3 space-y-2">
        {/* Input file oculto */}
        <input
          ref={fileInputIARef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc,.txt"
          className="hidden"
          onChange={e => handleAddArquivosIA(e.target.files)}
        />

        {/* Área de drop / clique para upload */}
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => fileInputIARef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleAddArquivosIA(e.dataTransfer.files); }}
        >
          <Paperclip className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-primary font-semibold">
            {uploadingIA ? "Enviando..." : "Anexar documentos para a IA (PDFs, imagens, CTPS, holerites...)"}
          </span>
          {uploadingIA && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
        </div>

        {/* Lista de arquivos carregados */}
        {arquivosIA.length > 0 && (
          <div className="space-y-1">
            {arquivosIA.map((arq, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-background border border-border">
                {getFileIcon(arq.type)}
                <span className="text-xs text-foreground flex-1 truncate">{arq.name}</span>
                <button
                  type="button"
                  onClick={() => setArquivosIA(prev => prev.filter((_, idx) => idx !== i))}
                  className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Botão extrair */}
        <button
          type="button"
          onClick={handleExtrairIA}
          disabled={extraindoIA || uploadingIA}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {extraindoIA
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Extraindo dados com IA...</>
            : <><Wand2 className="w-4 h-4" /> Extrair dados dos documentos com IA</>}
        </button>
      </div>

      {/* Título do caso */}
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Título / Identificação do caso</label>
        <input
          type="text"
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          placeholder={`Ex: ${templateName} — João x Empresa`}
          className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Grupos de campos */}
      {grupos.map(({ grupo, tokens: toks }) => (
        <Section
          key={grupo}
          title={grupo}
          open={!!openSections[grupo]}
          onToggle={() => toggleSection(grupo)}
        >
          {toks.map(({ token, label, full, tipo }) =>
            tipo === "bool" ? (
              <FieldBool
                key={token}
                token={token}
                label={label}
                value={dados[token]}
                onChange={handleChange}
              />
            ) : (
              <FieldText
                key={token}
                token={token}
                label={label}
                full={full}
                value={dados[token]}
                onChange={handleChange}
              />
            )
          )}
        </Section>
      ))}

      {/* Ações */}
      <div className="flex gap-2 flex-wrap pt-1">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvando}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {salvando ? "Salvando..." : "Salvar caso"}
        </button>

        <button
          type="button"
          onClick={handleGerar}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors"
        >
          <FileDown className="w-4 h-4" /> Gerar DOCX
        </button>
      </div>
    </div>
  );
}