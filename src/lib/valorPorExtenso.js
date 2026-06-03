/**
 * Converte valor monetário em string (ex: "R$ 2.148,22") ou número
 * para a representação por extenso em português do Brasil.
 * Ex: "R$ 2.148,22" → "dois mil, cento e quarenta e oito reais e vinte e dois centavos"
 */

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cem", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos"];

function centenas(n) {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let txt = c > 0 ? CENTENAS[c] : "";
  if (resto > 0) {
    txt += (txt ? " e " : "") + dezenas(resto);
  }
  return txt;
}

function dezenas(n) {
  if (n < 20) return UNIDADES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return DEZENAS[d] + (u > 0 ? " e " + UNIDADES[u] : "");
}

function milhares(n) {
  if (n === 0) return "zero";
  const partes = [];

  const bi = Math.floor(n / 1_000_000_000);
  n %= 1_000_000_000;
  if (bi > 0) partes.push(centenas(bi) + (bi === 1 ? " bilhão" : " bilhões"));

  const mi = Math.floor(n / 1_000_000);
  n %= 1_000_000;
  if (mi > 0) partes.push(centenas(mi) + (mi === 1 ? " milhão" : " milhões"));

  const mil = Math.floor(n / 1_000);
  n %= 1_000;
  if (mil > 0) partes.push((mil === 1 ? "mil" : centenas(mil) + " mil"));

  if (n > 0) partes.push(centenas(n));

  return partes.join(", ");
}

/**
 * @param {string|number} valor — "R$ 2.148,22" ou 2148.22
 * @returns {string} por extenso
 */
export function valorPorExtenso(valor) {
  if (!valor && valor !== 0) return "";

  // Extrai número a partir de string monetária BR
  let num;
  if (typeof valor === "string") {
    const clean = valor.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
    num = parseFloat(clean);
  } else {
    num = Number(valor);
  }

  if (isNaN(num) || num < 0) return "";

  const reais = Math.floor(num);
  const centavos = Math.round((num - reais) * 100);

  const parteReais = reais === 0 ? "" : milhares(reais) + (reais === 1 ? " real" : " reais");
  const parteCentavos = centavos === 0 ? "" : milhares(centavos) + (centavos === 1 ? " centavo" : " centavos");

  if (!parteReais && !parteCentavos) return "zero reais";
  if (!parteReais) return parteCentavos;
  if (!parteCentavos) return parteReais;
  return parteReais + " e " + parteCentavos;
}