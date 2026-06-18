/**
 * Utilitário de formatação de datas no fuso de Brasília (America/Sao_Paulo).
 * Os dados chegam em UTC do banco; a exibição é sempre convertida para UTC-3.
 */

const TZ = "America/Sao_Paulo";

/**
 * Converte um timestamp UTC para os partes de data/hora em Brasília
 * usando Intl.DateTimeFormat com formatToParts (mais confiável que toLocaleString).
 */
function partesBrasilia(valor) {
  const d = new Date(valor);
  if (isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const partes = {};
  for (const { type, value } of fmt.formatToParts(d)) {
    partes[type] = value;
  }
  return partes;
}

/**
 * Formata data + hora: "DD/MM/AAAA HH:MM" no fuso Brasília.
 * Exemplo: "2026-06-18T18:53:44Z" → "18/06/2026 15:53"
 */
export function formatarDataHora(valor) {
  if (!valor) return "—";
  try {
    const p = partesBrasilia(valor);
    if (!p) return "—";
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
  } catch {
    return "—";
  }
}

/**
 * Formata apenas a data: "DD/MM/AAAA" no fuso Brasília.
 */
export function formatarData(valor) {
  if (!valor) return "—";
  try {
    const p = partesBrasilia(valor);
    if (!p) return "—";
    return `${p.day}/${p.month}/${p.year}`;
  } catch {
    return "—";
  }
}