/**
 * AnalisarDocumentosDefesa
 * Upload de arquivos (inicial / pasta funcional) + extração IA para preencher
 * automaticamente os campos do formulário de Defesa.
 */
import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, X, FileText, Image, File, Loader2, Wand2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

function FileIcon({ type }) {
  if (type?.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
  if (type?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-muted-foreground" />;
}

const SCHEMA = {
  type: "object",
  properties: {
    reclamante_name:      { type: "string" },
    reclamante_cpf:       { type: "string" },
    reclamada_name:       { type: "string" },
    reclamada_cnpj:       { type: "string" },
    reclamada_setor:      { type: "string" },
    posicao_processual:   { type: "string", enum: ["empregadora", "tomadora", ""] },
    process_number:       { type: "string" },
    contract_start:       { type: "string", description: "formato AAAA-MM-DD" },
    contract_end:         { type: "string", description: "formato AAAA-MM-DD" },
    funcao:               { type: "string" },
    salario:              { type: "number" },
    jornada:              { type: "string" },
    valor_causa:          { type: "number" },
    inicial_texto:        { type: "string", description: "texto integral da petição inicial" },
    pedidos_identificados: {
      type: "array",
      items: { type: "string" },
      description: "lista de pedidos da inicial (ex: horas extras, FGTS, etc.)"
    },
    analise_documentos: {
      type: "string",
      description: "laudo resumido da análise: dados extraídos, pedidos, riscos e pontos de atenção"
    },
  },
};

export default function AnalisarDocumentosDefesa({ existingUrls = [], existingNames = [], onExtracted, onDocsChange }) {
  const [arquivos, setArquivos] = useState(
    existingUrls.map((u, i) => ({ url: u, name: existingNames[i] || `Arquivo ${i + 1}`, type: "" }))
  );
  const [uploading, setUploading] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const fileRef = useRef(null);

  const notifyParent = (lista) => {
    onDocsChange(
      lista.map(a => a.url),
      lista.map(a => a.name),
    );
  };

  const handleAddFiles = async (files) => {
    setUploading(true);
    const novos = [];
    for (const file of Array.from(files)) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        novos.push({ url: file_url, name: file.name, type: file.type });
        toast.success(`${file.name} enviado`);
      } catch (e) {
        toast.error(`Erro ao enviar ${file.name}: ` + e.message);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    const lista = [...arquivos, ...novos];
    setArquivos(lista);
    notifyParent(lista);
    setConcluido(false);
  };

  const handleRemove = (i) => {
    const lista = arquivos.filter((_, idx) => idx !== i);
    setArquivos(lista);
    notifyParent(lista);
    setConcluido(false);
  };

  const handleAnalisar = async () => {
    if (arquivos.length === 0) {
      toast.error("Adicione ao menos um documento para analisar.");
      return;
    }
    setAnalisando(true);
    setConcluido(false);

    try {
      const urls = arquivos.map(a => a.url);

      const prompt = `Você é um assistente jurídico especializado em direito trabalhista.
Analise os documentos anexados (petição inicial trabalhista e/ou pasta funcional do reclamante).

Extraia APENAS os dados que estiverem explicitamente presentes nos documentos. NÃO invente nem infira dados ausentes — deixe o campo vazio se não encontrar.

Extraia:
- reclamante_name: nome completo do reclamante
- reclamante_cpf: CPF do reclamante
- reclamada_name: razão social da reclamada (empregadora ou tomadora principal)
- reclamada_cnpj: CNPJ da reclamada
- reclamada_setor: ramo de atividade da reclamada (ex: vigilância, limpeza, telecomunicações)
- posicao_processual: "empregadora" se for a contratante direta, "tomadora" se for tomadora de serviços, "" se não identificado
- process_number: número do processo judicial (formato TRT)
- contract_start: data de admissão (AAAA-MM-DD)
- contract_end: data de demissão/rescisão (AAAA-MM-DD)
- funcao: função/cargo do reclamante
- salario: salário mensal em número (ex: 2148.22)
- jornada: descrição da jornada alegada na inicial
- valor_causa: valor da causa em número (ex: 45000.00)
- inicial_texto: texto integral da petição inicial (se disponível no documento)
- pedidos_identificados: array com os pedidos da inicial (ex: ["horas extras", "FGTS + 40%", "aviso prévio", "danos morais"])
- analise_documentos: laudo resumido com: dados extraídos confirmados, pedidos identificados, pontos de atenção para a defesa, riscos processuais evidentes`;

      const resultado = await base44.integrations.Core.InvokeLLM({
        prompt,
        file_urls: urls,
        response_json_schema: SCHEMA,
      });

      // Filtra campos vazios / nulos para não sobrescrever com vazio
      const limpo = {};
      for (const [k, v] of Object.entries(resultado)) {
        if (v === null || v === undefined || v === "") continue;
        if (Array.isArray(v) && v.length === 0) continue;
        limpo[k] = v;
      }

      onExtracted(limpo);
      setConcluido(true);
      toast.success(`Análise concluída — ${Object.keys(limpo).length} campos extraídos.`);
    } catch (e) {
      toast.error("Erro na análise: " + e.message);
    } finally {
      setAnalisando(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Área de drop */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleAddFiles(e.dataTransfer.files); }}
      >
        <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
        <p className="text-sm text-muted-foreground">Clique ou arraste a petição inicial e a pasta funcional</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">PDF, DOCX, JPEG, PNG</p>
        <input
          ref={fileRef} type="file" multiple
          accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={e => handleAddFiles(e.target.files)}
        />
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando arquivo...
        </div>
      )}

      {/* Lista de arquivos */}
      {arquivos.length > 0 && (
        <div className="space-y-1.5">
          {arquivos.map((arq, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border border-border">
              <FileIcon type={arq.type} />
              <span className="text-xs text-foreground flex-1 truncate">{arq.name}</span>
              <button
                onClick={() => handleRemove(i)}
                className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Botão analisar */}
      {arquivos.length > 0 && (
        <button
          onClick={handleAnalisar}
          disabled={analisando || uploading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-semibold text-sm transition-colors"
        >
          {analisando
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando documentos...</>
            : concluido
              ? <><CheckCircle2 className="w-4 h-4" /> Analisar novamente</>
              : <><Wand2 className="w-4 h-4" /> Analisar documentos e preencher</>
          }
        </button>
      )}

      {concluido && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Campos preenchidos automaticamente. Revise e edite antes de gerar a defesa.
        </div>
      )}

      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        A IA pode cometer erros. Sempre revise os campos extraídos antes de prosseguir.
      </div>
    </div>
  );
}