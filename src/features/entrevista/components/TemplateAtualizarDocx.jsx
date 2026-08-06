import React, { useState } from 'react';
import { Download, Upload, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * Ciclo de edição do modelo oficial: baixar o .docx atual, ajustar no Word e
 * subir de volta. O upload substitui o arquivo do PetitionTemplate escolhido
 * e atualiza o template padrão usado na exportação.
 */
export default function TemplateAtualizarDocx({ template, onAtualizado }) {
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !template?.id) return;
    setEnviando(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.PetitionTemplate.update(template.id, {
        modelo_docx_url: file_url,
        modelo_docx_name: file.name,
      });
      await onAtualizado?.({ url: file_url, nome: file.name });
    } catch (err) {
      console.error(err);
      window.alert(`Não foi possível enviar o modelo: ${err?.message || err}`);
    }
    setEnviando(false);
  };

  if (!template?.modelo_docx_url) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <a
        href={template.modelo_docx_url}
        download={template.modelo_docx_name || 'modelo.docx'}
        className="flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
      >
        <Download className="w-4 h-4" /> Baixar modelo
      </a>
      <input type="file" accept=".docx" id="upload-modelo-docx" className="hidden" onChange={enviar} />
      <label
        htmlFor="upload-modelo-docx"
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors cursor-pointer"
      >
        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {enviando ? 'Enviando...' : 'Enviar modelo atualizado'}
      </label>
      <span className="text-[11px] text-muted-foreground">
        Baixe, ajuste no Word mantendo as tags e envie de volta.
      </span>
    </div>
  );
}