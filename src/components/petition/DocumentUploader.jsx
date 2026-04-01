import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, X, FileText, Loader2, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function DocumentUploader({ form, updateForm }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    const newUrls = [...form.document_urls];
    const newNames = [...form.document_names];

    for (const file of files) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        newUrls.push(file_url);
        newNames.push(file.name);
      } catch (err) {
        toast.error(`Erro ao enviar ${file.name}`);
      }
    }

    updateForm("document_urls", newUrls);
    updateForm("document_names", newNames);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index) => {
    const newUrls = form.document_urls.filter((_, i) => i !== index);
    const newNames = form.document_names.filter((_, i) => i !== index);
    updateForm("document_urls", newUrls);
    updateForm("document_names", newNames);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Documentos</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Envie os documentos necessários para a elaboração da petição (CTPS, contracheques, cartões de ponto, etc.)
        </p>
      </div>

      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
      >
        {uploading ? (
          <Loader2 className="w-10 h-10 mx-auto text-muted-foreground animate-spin mb-3" />
        ) : (
          <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        )}
        <p className="font-medium text-foreground">
          {uploading ? "Enviando arquivos..." : "Clique ou arraste para enviar"}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          PDF, DOC, DOCX, JPG, PNG - Múltiplos arquivos permitidos
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* File list */}
      {form.document_names.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">{form.document_names.length} arquivo(s) enviado(s)</p>
          {form.document_names.map((name, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-xl border bg-card">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileIcon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm font-medium truncate">{name}</span>
              </div>
              <button
                onClick={() => removeFile(i)}
                className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}