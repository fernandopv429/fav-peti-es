/**
 * PorteiroForm — Formulário determinístico para modelos SINDEEPRES e SIEMACO.
 *
 * Funciona como o VigilanteForm: carrega tokens reais do .docx (via GenericoForm/extractDocxTokens),
 * oferece "Salvar caso", "Gerar DOCX Idêntico" (determinístico via docxtemplater) e
 * "Gerar Petição com IA", com modal ConfirmarTesesPorteiro antes de gerar.
 *
 * Props:
 *   templateDocxUrl  — URL do .docx tokenizado do template
 *   templateId       — ID do PetitionTemplate
 *   templateName     — nome do template para exibição
 *   documentUrls     — URLs de documentos já carregados pelo pai
 *   onGerarComDados  — fn(dados) => void — chamado para geração IA (pipeline GerarDocumento)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { extractTokensFromUrl, groupTokens } from "@/lib/extractDocxTokens.js";
import {
  ChevronDown, ChevronRight, Save, Download, Upload, Loader2,
  Wand2, FileDown, AlertTriangle, Paperclip, X, FileText, Image, File
} from "lucide-react";
import { toast } from "sonner";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ConfirmarTesesPorteiro from "./ConfirmarTesesPorteiro.jsx";

// ---------- sub-componentes ----------

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
        <span className="font-mono text-primary/70 mr-1 text-[10px]">{token}</span>
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
        id={`chk_porteiro_${token}`}
        checked={value === true || value === "true" || value === "Sim"}
        onChange={e => onChange(token, e.target.checked)}
        className="w-4 h-4 accent-primary"
      />
      <label htmlFor={`chk_porteiro_${token}`} className="text-sm text-foreground cursor-pointer">
        <span className="font-mono text-primary/70 mr-1 text-[10px]">{token}</span>
        {label !== token ? `— ${label}` : ""}
      </label>
    </div>
  );
}

// ---------- helper: gerar DOCX determinístico ----------

async function gerarDocxPorteiro(templateDocxUrl, dados) {
  const resp = await fetch(templateDocxUrl);
  if (!resp.ok) throw new Error(`Falha ao baixar modelo (${resp.status})`);
  const ab = await resp.arrayBuffer();
  const buffer = new Uint8Array(ab);

  const tokensFaltando = [];
  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => {
      if (part?.module === undefined && part?.value) tokensFaltando.push(part.value);
      return "";
    },
    errorLogging: false,
  });
  doc.render(dados);
  const out = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
  return { blob: out, tokensFaltando };
}

// ---------- componente principal ----------

export default function PorteiroForm({ templateDocxUrl, templateId, templateName, documentUrls = [], onGerarComDados }) {
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
  const [gerandoDocx, setGerandoDocx] = useState(false);
  const [extraindoIA, setExtraindoIA] = useState(false);
  const [confirmandoTeses, setConfirmandoTeses] = useState(null); // null | "docx" | "ia"
  // Upload de documentos interno
  const [arquivosIA, setArquivosIA] = useState([]);
  const [uploadingIA, setUploadingIA] = useState(false);
  const fileInputRef = useRef(null);

  // 1. Extrai tokens do DOCX
  useEffect(() => {
    if (!templateDocxUrl) return;
    setLoadingTokens(true);
    setTokenError("");
    extractTokensFromUrl(templateDocxUrl)
      .then(toks => {
        setTokens(toks);
        const grps = groupTokens(toks);
        setGrupos(grps);
        if (grps.length > 0) setOpenSections({ [grps[0].grupo]: true });
      })
      .catch(err => setTokenError(err.message))
      .finally(() => setLoadingTokens(false));
  }, [templateDocxUrl]);

  // 2. Carrega casos salvos para este template
  useEffect(() => {
    if (!templateId) return;
    base44.entities.CasoVigilante.list()
      .then(list => {
        const filtrados = (list || []).filter(c => (c.valores_pedidos || {})._templateId === templateId);
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
    const { _templateId, ...savedDados } = found.valores_pedidos || {};
    setDados(savedDados);
    setTitulo(found.titulo || "");
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const payload = {
        titulo: titulo || `${templateName} — ${new Date().toLocaleDateString("pt-BR")}`,
        status: "preenchido",
        valores_pedidos: { ...dados, _templateId: templateId },
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

  const handleCarregarJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (parsed.dados) { setDados(parsed.dados); if (parsed.titulo) setTitulo(parsed.titulo); }
        toast.success("Dados carregados!");
      } catch (err) {
        toast.error("Erro ao ler JSON: " + err.message);
      }
    };
    input.click();
  };

  // Upload de documentos para extração IA
  const getFileIcon = (type) => {
    if (type?.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
    if (type?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  const handleAddArquivos = async (files) => {
    setUploadingIA(true);
    for (const file of Array.from(files)) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setArquivosIA(prev => [...prev, { name: file.name, url: file_url, type: file.type }]);
      } catch (e) {
        toast.error(`Erro ao enviar ${file.name}: ` + e.message);
      }
    }
    setUploadingIA(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Extração IA
  const handleExtrairIA = async () => {
    const todasUrls = [...arquivosIA.map(a => a.url), ...(documentUrls || [])];
    if (todasUrls.length === 0) { fileInputRef.current?.click(); return; }

    setExtraindoIA(true);
    try {
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

      const prompt = `Você é um extrator de dados jurídicos para petições trabalhistas de porteiro/controlador de acesso.

TOKENS DO MODELO (${templateName}): ${tokens.join(", ")}

${textos.length > 0 ? `DOCUMENTOS (texto):\n${textos.join("\n\n").slice(0, 8000)}\n\n` : ""}
${urlsVisuais.length > 0 ? `${urlsVisuais.length} arquivo(s) visual(is) em anexo.\n\n` : ""}

REGRAS:
1. Retorne SOMENTE JSON puro.
2. Para cada token, extraia valor CURTO e OBJETIVO (datas, nomes, CNPJs, valores, horários). Máx 1 linha.
3. Datas: "DD de MÊS de AAAA". Valores monetários: "R$ X.XXX,XX".
4. Campos booleanos (tem_subsidiaria, etc.): true ou false.
5. Para tokens não encontrados, NÃO inclua no JSON.`;

      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_opus_4_8",
        file_urls: urlsVisuais.length > 0 ? urlsVisuais : undefined,
        response_json_schema: { type: "object", additionalProperties: true },
      });

      if (resultado && typeof resultado === "object") {
        setDados(prev => ({ ...prev, ...resultado }));
        const allOpen = {};
        grupos.forEach(g => { allOpen[g.grupo] = true; });
        setOpenSections(allOpen);
        toast.success("Campos preenchidos! Revise antes de gerar.");
      }
    } catch (err) {
      toast.error("Erro na extração: " + err.message);
    } finally {
      setExtraindoIA(false);
    }
  };

  // Gerar DOCX determinístico (após confirmação de teses)
  const handleGerarDocxIdêntico = async (dadosConfirmados) => {
    setGerandoDocx(true);
    try {
      const { blob, tokensFaltando } = await gerarDocxPorteiro(templateDocxUrl, dadosConfirmados);
      const nomeArquivo = `${dadosConfirmados.RECL_NOME || "porteiro"}_${templateName.replace(/\s+/g, "_")}.docx`;

      // Download imediato
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nomeArquivo; a.click();
      URL.revokeObjectURL(url);

      // Persiste na entidade Petition
      try {
        const file = new File([blob], nomeArquivo, {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        const { file_url: docxUrl } = await base44.integrations.Core.UploadFile({ file });
        const tituloPet = titulo || `${dadosConfirmados.RECL_NOME || "Porteiro"} × ${dadosConfirmados.RECL1_NOME || "Reclamada"} — ${new Date().toLocaleDateString("pt-BR")}`;
        const petitionPayload = {
          title: tituloPet,
          case_type: "trabalhista",
          claimant_name: dadosConfirmados.RECL_NOME || "—",
          defendant_name: dadosConfirmados.RECL1_NOME || "—",
          defendant_cnpj: dadosConfirmados.RECL1_CNPJ || "",
          status: "revisao_necessaria",
          document_urls: [docxUrl],
          document_names: [nomeArquivo],
          template_used: templateId,
        };
        const existingPetId = dadosConfirmados.petition_id || null;
        let petId = existingPetId;
        if (petId) {
          await base44.entities.Petition.update(petId, petitionPayload).catch(() => {});
        } else {
          const criada = await base44.entities.Petition.create(petitionPayload).catch(() => null);
          petId = criada?.id;
        }
        if (petId && casoId) {
          base44.entities.CasoVigilante.update(casoId, { petition_id: petId, status: "gerado" }).catch(() => {});
          setDados(prev => ({ ...prev, petition_id: petId }));
        }
        if (tokensFaltando.length > 0) {
          toast.warning(`DOCX salvo! Tokens em branco: ${tokensFaltando.slice(0, 6).join(", ")}${tokensFaltando.length > 6 ? "..." : ""}`);
        } else {
          toast.success(`DOCX gerado e salvo em Minhas Petições!`);
        }
      } catch (uploadErr) {
        toast.warning("Download OK, mas falha ao salvar na petição: " + uploadErr.message);
      }
    } catch (e) {
      const detalhe = e?.properties?.errors?.map(er => er.message).join("; ") || e.message || String(e);
      toast.error("Erro ao gerar DOCX: " + detalhe, { duration: 8000 });
      base44.entities.ErrorLog.create({ context: `Geração DOCX ${templateName}`, error_type: "template", message: detalhe }).catch(() => {});
    } finally {
      setGerandoDocx(false);
    }
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

  const todasUrlsDocs = [...arquivosIA.map(a => a.url), ...(documentUrls || [])];

  return (
    <div className="space-y-4">
      {/* Modal de confirmação de teses */}
      {confirmandoTeses && (
        <ConfirmarTesesPorteiro
          dadosIniciais={{ ...dados, titulo }}
          documentUrls={todasUrlsDocs}
          templateId={templateId}
          templateName={templateName}
          onCancelar={() => setConfirmandoTeses(null)}
          onConfirmar={(dadosConfirmados) => {
            setDados(dadosConfirmados);
            setConfirmandoTeses(null);
            if (confirmandoTeses === "docx") {
              handleGerarDocxIdêntico(dadosConfirmados);
            } else {
              onGerarComDados({ ...dadosConfirmados, titulo });
            }
          }}
        />
      )}

      {/* input file oculto para upload IA */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc,.txt"
        className="hidden"
        onChange={e => handleAddArquivos(e.target.files)}
      />

      {/* Carregar caso / JSON */}
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
              <option key={c.id} value={c.id}>{c.titulo || c.RECL_NOME || c.id}</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={handleBaixarJson}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold transition-colors">
          <Download className="w-3.5 h-3.5" /> JSON
        </button>
        <button type="button" onClick={handleCarregarJson}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold transition-colors">
          <Upload className="w-3.5 h-3.5" /> Importar
        </button>
      </div>

      {/* Upload de documentos + Extrair com IA */}
      <div className="rounded-xl border border-dashed border-primary/40 bg-primary/3 p-3 space-y-2">
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleAddArquivos(e.dataTransfer.files); }}
        >
          <Paperclip className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-primary font-semibold">
            {uploadingIA ? "Enviando..." : "Anexar documentos (PDFs, imagens, CTPS, holerites...)"}
          </span>
          {uploadingIA && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
        </div>
        {arquivosIA.length > 0 && (
          <div className="space-y-1">
            {arquivosIA.map((arq, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-background border border-border">
                {getFileIcon(arq.type)}
                <span className="text-xs text-foreground flex-1 truncate">{arq.name}</span>
                <button type="button" onClick={() => setArquivosIA(prev => prev.filter((_, idx) => idx !== i))}
                  className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
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
          placeholder="Ex: Fernando x Belfort"
          className="w-full bg-input border border-border text-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Grupos de campos dinâmicos */}
      {grupos.map(({ grupo, tokens: toks }) => (
        <Section
          key={grupo}
          title={grupo}
          open={!!openSections[grupo]}
          onToggle={() => toggleSection(grupo)}
        >
          {toks.map(({ token, label, full, tipo }) =>
            tipo === "bool" ? (
              <FieldBool key={token} token={token} label={label} value={dados[token]} onChange={handleChange} />
            ) : (
              <FieldText key={token} token={token} label={label} full={full} value={dados[token]} onChange={handleChange} />
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

        {templateDocxUrl && (
          <button
            type="button"
            onClick={() => setConfirmandoTeses("docx")}
            disabled={gerandoDocx}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {gerandoDocx ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {gerandoDocx ? "Gerando DOCX..." : "Gerar DOCX Idêntico ao Modelo"}
          </button>
        )}

        <button
          type="button"
          onClick={() => setConfirmandoTeses("ia")}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold transition-colors"
        >
          <Wand2 className="w-4 h-4" /> Gerar Petição com IA →
        </button>
      </div>
    </div>
  );
}