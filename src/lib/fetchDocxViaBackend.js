/**
 * Baixa um arquivo .docx via função de backend para evitar bloqueio CORS
 * no app publicado. Retorna um ArrayBuffer pronto para PizZip.
 */
import { base44 } from "@/api/base44Client";

export async function fetchDocxViaBackend(url) {
  let resp;
  try {
    resp = await base44.functions.invoke("fetchDocxTemplate", { url });
  } catch (invokeErr) {
    // Extrai o corpo real do erro HTTP para mensagem visível ao usuário
    const d = invokeErr?.response?.data;
    const body = d
      ? (d.error || d.message || d.detail || (typeof d === "string" ? d : JSON.stringify(d)))
      : invokeErr.message;
    const status = invokeErr?.response?.status;
    throw new Error(`Falha ao baixar template${status ? ` (HTTP ${status})` : ""}: ${body}`);
  }

  const base64 = resp.data?.base64;
  if (!base64) {
    const errBody = resp.data?.error || JSON.stringify(resp.data);
    throw new Error(`fetchDocxTemplate não retornou base64. Resposta: ${errBody}`);
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}