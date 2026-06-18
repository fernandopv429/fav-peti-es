/**
 * Utilitário de formatação de datas no fuso de Brasília (America/Sao_Paulo).
 * Os dados ficam em UTC no banco; apenas a exibição é convertida.
 */

const TZ = "America/Sao_Paulo";

/**
 * Formata data + hora: "DD/MM/AAAA HH:MM"
 */
export function formatarDataHora(valor) {
  if (!valor) return "—";
  try {
    const d = new Date(valor);
    return d.toLocaleString("pt-BR", {
      timeZone: TZ,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Formata apenas a data: "DD/MM/AAAA"
 */
export function formatarData(valor) {
  if (!valor) return "—";
  try {
    const d = new Date(valor);
    return d.toLocaleDateString("pt-BR", { timeZone: TZ });
  } catch {
    return "—";
  }
}