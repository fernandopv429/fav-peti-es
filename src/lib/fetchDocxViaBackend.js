/**
 * Baixa um arquivo .docx via função de backend para evitar bloqueio CORS
 * no app publicado. Retorna um ArrayBuffer pronto para PizZip.
 */
import { base44 } from "@/api/base44Client";

export async function fetchDocxViaBackend(url) {
  const resp = await base44.functions.invoke("fetchDocxTemplate", { url });
  const base64 = resp.data?.base64;
  if (!base64) throw new Error("fetchDocxTemplate não retornou base64");

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}