/**
 * Modal de extração de dados de documentos com IA + revisão antes de confirmar.
 * NÃO preenche valores de pedidos (P01..P87).
 */
import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Upload, X, FileText, Image, File, CheckCircle2, AlertTriangle, Wand2 } from "lucide-react";
import { toast } from "sonner";

const CAMPOS_EXTRAIVEIS = [
  { key: "RECL_NOME",          label: "Nome completo" },
  { key: "RECL_NACIONALIDADE", label: "Nacionalidade" },
  { key: "RECL_ESTADOCIVIL",   label: "Estado civil" },
  { key: "RECL_RG",            label: "RG" },
  { key: "RECL_PIS",           label: "PIS" },
  { key: "RECL_CTPS",          label: "CTPS" },
  { key: "RECL_SERIE",         label: "Série CTPS" },
  { key: "RECL_CPF",           label: "CPF" },
  { key: "RECL_NASC",          label: "Data de nascimento" },
  { key: "RECL_FILIACAO",      label: "Filiação" },
  { key: "RECL_ENDERECO",      label: "Endereço" },
  { key: "RECL_CEP",           label: "CEP" },
  { key: "RECL1_NOME",         label: "1ª Reclamada — Razão social" },
  { key: "RECL1_CNPJ",         label: "1ª Reclamada — CNPJ" },
  { key: "RECL1_LOGRADOURO",   label: "1ª Reclamada — Logradouro" },
  { key: "RECL1_ENDCOMPL",     label: "1ª Reclamada — Complemento" },
  { key: "RECL2_NOME",         label: "2ª Reclamada — Razão social" },
  { key: "RECL2_CNPJ",         label: "2ª Reclamada — CNPJ" },
  { key: "RECL2_LOGRADOURO",   label: "2ª Reclamada — Logradouro" },
  { key: "RECL2_ENDCOMPL",     label: "2ª Reclamada — Complemento" },
  { key: "RECL3_NOME",         label: "3ª Reclamada — Razão social" },
  { key: "RECL3_CNPJ",         label: "3ª Reclamada — CNPJ" },
  { key: "DATA_ADMISSAO",      label: "Data de admissão (por extenso)" },
  { key: "FUNCAO",             label: "Função" },
  { key: "DATA_RESCISAO",      label: "Data de rescisão (por extenso)" },
  { key: "SALARIO",            label: "Salário (ex: R$ 2.148,22)" },
  { key: "JORNADA_HORARIO",    label: "Jornada (ex: 18:30 às 07:30)" },
  { key: "COMARCA_UF",         label: "Comarca/UF" },
  { key: "FORO_COMPETENCIA",   label: "Foro de competência" },
  { key: "LOCAL_PRESTACAO",    label: "Local de prestação" },
];

function getFileIcon(type) {
  if (type?.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
  if (type?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

export default function ExtrairDadosIA({ onConfirmar, onFechar }) {
  const [arquivos, setArquivos] = useState([]);
  const [uploadando, setUploadando] = useState(false);
  const [extraindo, setExtraindo] = useState(false);
  const [dadosExtraidos, setDadosExtraidos] = useState(null); // null = ainda não extraiu
  const [dadosEditados, setDadosEditados] = useState({});
  const fileInputRef = useRef(null);

  const handleAddArquivos = async (files) => {
    setUploadando(true);
    for (const file of Array.from(files)) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        setArquivos(prev => [...prev, { name: file.name, url: file_url, type: file.type }]);
      } catch (e) {
        toast.error(`Erro ao enviar ${file.name}: ` + e.message);
      }
    }
    setUploadando(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleExtrair = async () => {
    if (arquivos.length === 0) { toast.error("Adicione pelo menos um documento."); return; }
    setExtraindo(true);
    try {
      // Separa URLs visuais (imagem/PDF) de texto
      const urlsVisuais = arquivos
        .filter(a => a.type?.startsWith("image/") || a.type?.includes("pdf") ||
          a.url.toLowerCase().endsWith(".pdf") || a.url.toLowerCase().endsWith(".png") ||
          a.url.toLowerCase().endsWith(".jpg") || a.url.toLowerCase().endsWith(".jpeg"))
        .map(a => a.url);

      const camposSchema = {};
      CAMPOS_EXTRAIVEIS.forEach(c => { camposSchema[c.key] = { type: "string" }; });

      const prompt = `Você é um extrator de dados jurídicos. Analise os documentos trabalhistas fornecidos (CTPS, contracheque, TRCT, rescisão, holerite, etc.) e extraia os seguintes campos quando presentes.

IMPORTANTE:
- Datas devem ser formatadas por extenso em português (ex: "04 de junho de 2012")
- Salário deve incluir "R$" e usar vírgula decimal (ex: "R$ 2.148,22")
- Se um campo não aparecer nos documentos, retorne string vazia ""
- NÃO invente dados. Apenas extraia o que está explícito.
- Para Comarca/UF, infira da localidade da empresa ou do local de trabalho
- CTPS e Série são campos separados da carteira de trabalho

Campos a extrair:
${CAMPOS_EXTRAIVEIS.map(c => `- ${c.key}: ${c.label}`).join("\n")}

Retorne JSON com exatamente essas chaves.`;

      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
        file_urls: urlsVisuais.length > 0 ? urlsVisuais : undefined,
        response_json_schema: {
          type: "object",
          properties: camposSchema,
        },
      });

      // Filtra apenas campos não-vazios para mostrar na revisão
      const extraidos = {};
      CAMPOS_EXTRAIVEIS.forEach(c => {
        if (resultado[c.key]) extraidos[c.key] = resultado[c.key];
      });

      setDadosExtraidos(extraidos);
      setDadosEditados({ ...extraidos });

      if (Object.keys(extraidos).length === 0) {
        toast.warning("A IA não conseguiu extrair dados dos documentos. Verifique se os arquivos estão legíveis.");
      } else {
        toast.success(`${Object.keys(extraidos).length} campos extraídos — revise antes de confirmar.`);
      }
    } catch (e) {
      toast.error("Erro na extração: " + e.message);
    } finally {
      setExtraindo(false);
    }
  };

  const handleConfirmar = () => {
    onConfirmar(dadosEditados);
    onFechar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-foreground">Extrair dados dos documentos com IA</h2>
          </div>
          <button onClick={onFechar} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Aviso */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Atenção:</strong> A IA extrai dados dos documentos automaticamente, mas pode cometer erros. <strong>Revise todos os campos antes de confirmar.</strong> Os valores dos pedidos (P01–P87) NÃO são preenchidos automaticamente — devem ser informados manualmente.
            </div>
          </div>

          {/* Upload de documentos */}
          {!dadosExtraidos && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Documentos (CTPS, contracheque, TRCT, rescisão...)
                </label>
                <div
                  className="border-2 border-dashed border-border rounded-xl p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleAddArquivos(e.dataTransfer.files); }}
                >
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Clique ou arraste arquivos aqui</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">PDF, imagens, Word — a IA lerá e extrairá os dados</p>
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

                {arquivos.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {arquivos.map((arq, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border">
                        {getFileIcon(arq.type)}
                        <span className="text-xs text-foreground flex-1 truncate">{arq.name}</span>
                        <button
                          onClick={() => setArquivos(prev => prev.filter((_, idx) => idx !== i))}
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
                disabled={extraindo || arquivos.length === 0 || uploadando}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-bold text-sm transition-colors"
              >
                {extraindo ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Extraindo com IA (pode levar 20-40s)...</>
                ) : (
                  <><Wand2 className="w-4 h-4" /> Extrair dados dos documentos</>
                )}
              </button>
            </>
          )}

          {/* Tela de revisão */}
          {dadosExtraidos && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span><strong>{Object.keys(dadosExtraidos).length} campos extraídos.</strong> Revise e edite abaixo antes de confirmar.</span>
              </div>

              <div className="space-y-3">
                {CAMPOS_EXTRAIVEIS.map(c => (
                  <div key={c.key}>
                    <label className="block text-xs text-muted-foreground mb-1">
                      <span className="font-semibold text-foreground">{c.label}</span>
                      {dadosExtraidos[c.key]
                        ? <span className="ml-2 text-green-600">✓ extraído</span>
                        : <span className="ml-2 text-muted-foreground/60">não encontrado</span>
                      }
                    </label>
                    <input
                      type="text"
                      value={dadosEditados[c.key] || ""}
                      onChange={e => setDadosEditados(prev => ({ ...prev, [c.key]: e.target.value }))}
                      placeholder={dadosExtraidos[c.key] ? "" : "Não encontrado nos documentos"}
                      className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setDadosExtraidos(null); setDadosEditados({}); }}
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