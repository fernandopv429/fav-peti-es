/**
 * Extrai o texto plano (parágrafo por parágrafo) de um arquivo .docx,
 * para exibição na tela de revisão/correção após a geração.
 */
import PizZip from "pizzip";
import { fetchDocxViaBackend } from "./fetchDocxViaBackend.js";

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function extrairTextoDeBuffer(arrayBuffer) {
  const zip = new PizZip(arrayBuffer);
  const docXml = zip.file("word/document.xml")?.asText() || "";
  const paras = docXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  return paras
    .map((p) => {
      const runs = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      return decodeEntities(runs.map((r) => r.replace(/<[^>]+>/g, "")).join(""));
    })
    .join("\n");
}

export async function extrairTextoDocxUrl(url) {
  const ab = await fetchDocxViaBackend(url);
  return extrairTextoDeBuffer(ab);
}

export async function extrairTextoDocxBlob(blob) {
  const ab = await blob.arrayBuffer();
  return extrairTextoDeBuffer(ab);
}