/**
 * Modal de extração de dados de documentos com IA — por lotes com progresso real.
 * NÃO preenche valores de pedidos (P01..P87) nem VALOR_CAUSA.
 *
 * Props:
 *   casoVigilanteId  — ID do CasoVigilante existente (usa ele; se null cria UM novo)
 *   petitionId       — ID da Petition vinculada (gravado na ficha ao criar)
 *   documentUrls     — URLs já anexadas à petição
 *   onConfirmar(dados, casoId) — chamado após revisão humana
 *   onFechar()
 */
import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Upload, X, FileText, Image, File, CheckCircle2, AlertTriangle, Wand2 } from "lucide-react";
import { toast } from "sonner";

const CAMPOS_EXTRAIVEIS = [
  { key: "RECL_NOME",             label: "Nome completo" },
  { key: "RECL_NACIONALIDADE",    label: "Nacionalidade" },
  { key: "RECL_ESTADOCIVIL",      label: "Estado civil" },
  { key: "RECL_RG",               label: "RG" },
  { key: "RECL_PIS",              label: "PIS" },
  { key: "RECL_CTPS",             label: "CTPS" },
  { key: "RECL_SERIE",            label: "Série CTPS" },
  { key: "RECL_CPF",              label: "CPF" },
  { key: "RECL_NASC",             label: "Data de nascimento" },
  { key: "RECL_FILIACAO",         label: "Filiação" },
  { key: "RECL_ENDERECO",         label: "Endereço" },
  { key: "RECL_CEP",              label: "CEP" },
  { key: "RECL1_NOME",            label: "1ª Reclamada — Razão social" },
  { key: "RECL1_CNPJ",            label: "1ª Reclamada — CNPJ" },
  { key: "RECL1_LOGRADOURO",      label: "1ª Reclamada — Logradouro" },
  { key: "RECL1_ENDCOMPL",        label: "1ª Reclamada — Complemento" },
  { key: "RECL2_NOME",            label: "2ª Reclamada — Razão social" },
  { key: "RECL2_CNPJ",            label: "2ª Reclamada — CNPJ" },
  { key: "RECL2_LOGRADOURO",      label: "2ª Reclamada — Logradouro" },
  { key: "RECL2_ENDCOMPL",        label: "2ª Reclamada — Complemento" },
  { key: "RECL3_NOME",            label: "3ª Reclamada — Razão social" },
  { key: "RECL3_CNPJ",            label: "3ª Reclamada — CNPJ" },
  { key: "RECL3_LOGRADOURO",      label: "3ª Reclamada — Logradouro" },
  { key: "RECL3_ENDCOMPL",        label: "3ª Reclamada — Complemento" },
  { key: "COMARCA_UF",            label: "Comarca/UF" },
  { key: "REGIAO_TRT",            label: "Região TRT" },
  { key: "FORO_COMPETENCIA",      label: "Foro de competência" },
  { key: "LOCAL_PRESTACAO",       label: "Local de prestação" },
  { key: "LOCAL_PRESTACAO_COMPL", label: "Complemento local prestação" },
  { key: "DATA_ADMISSAO",         label: "Data de admissão (por extenso)" },
  { key: "FUNCAO",                label: "Função" },
  { key: "DATA_RESCISAO",         label: "Data de rescisão (por extenso)" },
  { key: "SALARIO",               label: "Salário (ex: R$ 2.148,22)" },
  { key: "JORNADA_HORARIO",       label: "Jornada (ex: 18:30 às 07:30)" },
  { key: "JORNADA_EXTRAPOLA",     label: "Extrapolação de jornada" },
  { key: "JORNADA_FREQ_EXTRA",    label: "Frequência de extras" },
  { key: "INTERVALO_GOZADO",      label: "Intervalo gozado" },
  { key: "CCT_VIGENCIA",          label: "Vigência CCT" },
  { key: "ADIC_CONV",             label: "Adicional convencional HE" },
  { key: "VAL_FT",                label: "Valor FT/folga trabalhada" },
  { key: "VAL_CONDUCAO",          label: "Valor condução/dia" },
  { key: "VAL_ALIMENTACAO",       label: "Valor alimentação/dia" },
];

const LOTE_SIZE = 2;

function getFileIcon(type) {
  if (type?.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
  if (type?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

export default function ExtrairDadosIA({ casoVigilanteId, petitionId, documentUrls = [], onConfirmar, onFechar }) {
  const [arquivosExtras, setArquivosExtras] = useState([]);
  const [uploadando, setUploadando] = useState(false);
  const [fase, setFase] = useState("inicio"); // "inicio" | "extraindo" | "revisao"
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, pct: 0, msg: "" });
  const [dadosExtraidos, setDadosExtraidos] = useState(null);
  const [dadosEditados, setDadosEditados] = useState({});
  // ID da ficha — nunca muda após o primeiro clique em "Extrair"
  const [fichaId, setFichaId] = useState(casoVigilanteId || null);
  const fileInputRef = useRef(null);

  const handleAddArquivos = async (files) => {
    setUploadando(true);
    for (const file of Array.from(files)) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setArquivosExtras(prev => [...prev, { name: file.name, url: file_url, type: file.type }]);
      } catch (e) {
        toast.error(`Erro ao enviar ${file.name}: ` + e.message);
      }
    }
    setUploadando(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExtrair = async () => {
    const todasUrls = [...documentUrls, ...arquivosExtras.map(a => a.url)];
    if (todasUrls.length === 0) {
      toast.error("Nenhum documento disponível. Adicione arquivos ou anexe documentos à petição.");
      return;
    }

    setFase("extraindo");
    setDadosExtraidos(null);
    setDadosEditados({});

    // ── PASSO 1: Garantir UMA ficha única ──────────────────────────────────
    let idFicha = fichaId;
    if (!idFicha) {
      try {
        setProgresso({ atual: 0, total: todasUrls.length, pct: 0, msg: "Criando ficha do caso..." });
        const novaFicha = await base44.entities.CasoVigilante.create({
          titulo: `Caso Vigilante — ${new Date().toLocaleDateString("pt-BR")}`,
          status: "rascunho",
          ...(petitionId ? { petition_id: petitionId } : {}),
        });
        idFicha = novaFicha.id;
        setFichaId(idFicha);
      } catch (e) {
        toast.error("Erro ao criar ficha: " + e.message);
        setFase("inicio");
        return;
      }
    }

    // ── PASSO 2: Lotes de 2 docs com progresso ────────────────────────────
    const totalDocs = todasUrls.length;
    const lotes = [];
    for (let i = 0; i < totalDocs; i += LOTE_SIZE) {
      lotes.push(todasUrls.slice(i, i + LOTE_SIZE));
    }

    let camposMerged = {};
    let docsProcessados = 0;

    for (let li = 0; li < lotes.length; li++) {
      const lote = lotes[li];
      const pct = Math.round((docsProcessados / totalDocs) * 100);
      setProgresso({
        atual: docsProcessados,
        total: totalDocs,
        pct,
        msg: `Lendo ${docsProcessados + 1}–${Math.min(docsProcessados + lote.length, totalDocs)} de ${totalDocs} documentos — ${pct}%`,
      });

      try {
        const resp = await base44.functions.invoke("extrairDadosVigilante", {
          casoVigilanteId: idFicha,
          documentUrls: lote,
        });
        const payload = resp?.data ?? resp;
        const campos = payload?.campos || {};
        const alerta = payload?.alerta;
        const docsNaoLidos = payload?.docsNaoLidos;
        
        // Exibe alerta se houver
        if (alerta) {
          console.warn("Alerta extração:", alerta);
        }
        if (docsNaoLidos && docsNaoLidos.length > 0) {
          console.warn("Documentos não lidos:", docsNaoLidos);
        }
        
        // Merge: não sobrescreve campos já preenchidos em lotes anteriores
        for (const [k, v] of Object.entries(campos)) {
          if (v && v.trim() && !camposMerged[k]) camposMerged[k] = v.trim();
        }
      } catch (e) {
        // Lote com falha — continua para os demais
        console.error(`Lote ${li} falhou:`, e.message);
      }

      docsProcessados += lote.length;
    }

    // ── PASSO 3: Atualiza barra para 100% e relê a ficha do banco ─────────
    setProgresso({ atual: totalDocs, total: totalDocs, pct: 100, msg: "Finalizando — relendo ficha..." });

    try {
      // Relê a ficha para pegar o estado real gravado (merge acumulativo do backend)
      const fichaAtualizada = await base44.entities.CasoVigilante.filter({ id: idFicha });
      const fichaData = fichaAtualizada?.[0] || {};

      // Monta os campos relevantes a partir da ficha
      const camposDaFicha = {};
      for (const c of CAMPOS_EXTRAIVEIS) {
        if (fichaData[c.key]) camposDaFicha[c.key] = fichaData[c.key];
      }
      // Complementa com o que foi mergeado localmente (caso a leitura seja parcial)
      const camposFinais = { ...camposMerged, ...camposDaFicha };

      const total = Object.keys(camposFinais).length;
      setDadosExtraidos(camposFinais);
      setDadosEditados({ ...camposFinais });
      setFase("revisao");

      if (total === 0) {
        toast.error("Nenhum dado foi extraído dos documentos. Verifique se: (1) os arquivos estão legíveis, (2) contêm CTPS/holerites/entrevista, (3) não estão corrompidos.");
      } else if (total < 3) {
        toast.warning(`Apenas ${total} campo(s) extraído(s). A IA pode não ter conseguido ler os documentos corretamente. Revise com atenção.`);
      } else {
        toast.success(`${total} campos extraídos — revise antes de confirmar.`);
      }
    } catch (e) {
      // Falha na releitura — usa o merge local mesmo
      const camposFinais = { ...camposMerged };
      setDadosExtraidos(camposFinais);
      setDadosEditados({ ...camposFinais });
      setFase("revisao");
      toast.error("Erro ao ler dados extraídos. Verifique o ErrorLog.");
    }
  };

  const handleConfirmar = () => {
    onConfirmar(dadosEditados, fichaId);
    onFechar();
  };

  const totalDocs = documentUrls.length + arquivosExtras.length;
  const camposPreenchidos = dadosExtraidos ? Object.keys(dadosExtraidos).filter(k => dadosExtraidos[k]).length : 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-foreground">Extrair dados dos documentos com IA</h2>
          </div>
          {fase !== "extraindo" && (
            <button onClick={onFechar} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Aviso permanente */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Atenção:</strong> A IA extrai dados por OCR/visão, mas pode cometer erros. <strong>Revise todos os campos antes de confirmar.</strong> Os valores dos pedidos (P01–P87) e VALOR_CAUSA <strong>não são preenchidos automaticamente</strong>.
            </div>
          </div>

          {/* ── FASE: INÍCIO ── */}
          {fase === "inicio" && (
            <>
              {documentUrls.length > 0 && (
                <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-800">
                  <strong>✓ {documentUrls.length} documento(s) da petição</strong> serão analisados automaticamente.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Adicionar mais documentos <span className="normal-case font-normal">(opcional)</span>
                </label>
                <div
                  className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleAddArquivos(e.dataTransfer.files); }}
                >
                  <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">Clique ou arraste arquivos aqui</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">JPEG, PNG, PDF, Word</p>
                  <input
                    ref={fileInputRef} type="file" multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt"
                    className="hidden"
                    onChange={e => handleAddArquivos(e.target.files)}
                  />
                </div>

                {uploadando && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...
                  </div>
                )}

                {arquivosExtras.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {arquivosExtras.map((arq, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                        {getFileIcon(arq.type)}
                        <span className="text-xs text-foreground flex-1 truncate">{arq.name}</span>
                        <button
                          onClick={() => setArquivosExtras(prev => prev.filter((_, idx) => idx !== i))}
                          className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleExtrair}
                disabled={uploadando || totalDocs === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-bold text-sm transition-colors"
              >
                <Wand2 className="w-4 h-4" /> Extrair dados de {totalDocs} documento(s)
              </button>
            </>
          )}

          {/* ── FASE: EXTRAINDO (barra de progresso) ── */}
          {fase === "extraindo" && (
            <div className="py-6 space-y-5">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-foreground font-semibold text-sm">Extraindo com IA...</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progresso.msg || "Iniciando..."}</span>
                  <span className="font-bold text-primary">{progresso.pct}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-primary h-3 rounded-full transition-all duration-500"
                    style={{ width: `${progresso.pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Cada lote de 2 documentos leva ~20–40s. Não feche esta janela.
                </p>
              </div>
            </div>
          )}

          {/* ── FASE: REVISÃO ── */}
          {fase === "revisao" && dadosExtraidos && (
            <>
              {camposPreenchidos < 3 && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Atenção: poucos dados extraídos.</strong> A IA pode não ter conseguido ler os documentos. Verifique se os arquivos estão legíveis e contêm as informações necessárias (CTPS, holerites, entrevista, TRCT).
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{camposPreenchidos} campo(s) extraídos e gravados na ficha.</strong> Revise e edite abaixo antes de confirmar.
                </span>
              </div>

              <div className="space-y-3">
                {CAMPOS_EXTRAIVEIS.map(c => (
                  <div key={c.key}>
                    <label className="block text-xs text-muted-foreground mb-1">
                      <span className="font-semibold text-foreground">{c.label}</span>
                      {dadosExtraidos[c.key]
                        ? <span className="ml-2 text-green-600">✓ extraído</span>
                        : <span className="ml-2 text-muted-foreground/50">não encontrado</span>
                      }
                    </label>
                    <input
                      type="text"
                      value={dadosEditados[c.key] || ""}
                      onChange={e => setDadosEditados(prev => ({ ...prev, [c.key]: e.target.value }))}
                      placeholder="Não encontrado — preencha manualmente se necessário"
                      className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2 sticky bottom-0 bg-card pb-2">
                <button
                  onClick={() => { setFase("inicio"); setDadosExtraidos(null); setDadosEditados({}); }}
                  className="px-4 py-2.5 rounded-xl border border-border bg-secondary hover:bg-secondary/80 text-secondary-foreground text-sm font-semibold transition-colors"
                >
                  ← Tentar novamente
                </button>
                <button
                  onClick={handleConfirmar}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirmar e preencher formulário
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}