/**
 * calcularPedidos — cálculo DETERMINÍSTICO dos tokens P01..P87 + VALOR_CAUSA.
 *
 * Reaproveita a lógica da página "Calculadora de Verbas" (VerbaRescisoriaCalculo)
 * para as verbas rescisórias, e mapeia conforme especificação do usuário:
 *
 * PEDIDOS DETERMINÍSTICOS:
 *   P01 (dano moral)         = 10 × última remuneração
 *   P09 (saldo de salário)   = salário/30 × 15
 *   P10 (aviso prévio)       = salário/30 × min(30 + anos×3, 90)  [Lei 12.506]
 *   P11 (13º proporcional)   = salário/12 × meses no ano da rescisão
 *   P12 (férias venc. dobro) = salário × 4/3 × 2  (somente se período vencido > 1 ano)
 *   P13 (férias vencidas)    = salário × 4/3
 *   P14 (férias proporcionais)= salário/12 × meses × 4/3
 *   P15                      = P09 + P10 + P11 + P12 + P13 + P14
 *   P82 (FGTS)               = 8% × salário × meses de contrato
 *   P83 (multa 40% FGTS)     = 40% × P82
 *   P84                      = P82 + P83
 *   P85 (multa art. 467)     = 50% × P15
 *   P86 (multa art. 477)     = 1 salário
 *   P87 (honorários)         = 15% × total estimado da condenação
 *
 * PEDIDOS VARIÁVEIS (P02, P03–P08, P16–P81):
 *   "a apurar em liquidação" — NUNCA inventar número.
 *
 * VALOR_CAUSA     = soma de todos os pedidos estimados (excluindo subtotais P15, P84)
 * VALOR_CAUSA_EXT = valor por extenso
 */
import { valorPorExtenso } from "./valorPorExtenso.js";

const A_APURAR = "a apurar em liquidação";

const MESES_EXT = {
  "janeiro": 0, "fevereiro": 1, "março": 2, "abril": 3, "maio": 4, "junho": 5,
  "julho": 6, "agosto": 7, "setembro": 8, "outubro": 9, "novembro": 10, "dezembro": 11,
};

/**
 * Converte "R$ 2.148,22", "2148.22" ou "2148,22" em número.
 */
function parseMoney(val) {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const clean = String(val).replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

/**
 * Converte "04 de junho de 2012", "2012-06-04", "04/06/2012" ou Date em Date.
 */
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  if (!s) return null;

  // ISO: 2012-06-04
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s + "T12:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  // "04 de junho de 2012"
  const m1 = s.match(/(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})/i);
  if (m1) {
    const mes = MESES_EXT[m1[2].toLowerCase()];
    if (mes !== undefined) {
      const d = new Date(parseInt(m1[3]), mes, parseInt(m1[1]));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // DD/MM/YYYY
  const m2 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m2) {
    const d = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function fmtBRL(n) {
  return "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diffAnosCompletos(admissao, demissao) {
  let anos = demissao.getFullYear() - admissao.getFullYear();
  const mesOk = demissao.getMonth() > admissao.getMonth() ||
    (demissao.getMonth() === admissao.getMonth() && demissao.getDate() >= admissao.getDate());
  if (!mesOk) anos--;
  return Math.max(0, anos);
}

/**
 * Avos de 13º no ano da rescisão (1-12).
 */
function avos13(admissao, demissao) {
  const anoAdm = admissao.getFullYear();
  const anoDem = demissao.getFullYear();
  let meses;
  if (anoDem > anoAdm) {
    // Ano da rescisão diferente do ano de admissão → avos = mês da rescisão
    meses = demissao.getMonth() + 1;
    if (demissao.getDate() < 15) meses -= 1;
  } else {
    // Mesmo ano → avos = meses de admissão a rescisão
    meses = demissao.getMonth() - admissao.getMonth() + 1;
    if (admissao.getDate() > 1) {} // já conta o mês de admissão
    if (demissao.getDate() < 15) meses -= 1;
  }
  return Math.max(0, Math.min(meses, 12));
}

/**
 * Avos de férias proporcionais (último período aquisitivo, 1-12).
 */
function avosFeriasProporcionais(admissao, demissao) {
  const admMes = admissao.getMonth();
  const admDia = admissao.getDate();
  const demAno = demissao.getFullYear();

  // Aniversário do contrato no ano da rescisão
  let aniversario = new Date(demAno, admMes, admDia);
  if (aniversario > demissao) {
    aniversario.setFullYear(demAno - 1);
  }
  const diffMs = demissao - aniversario;
  const diffDias = Math.floor(diffMs / 86400000);
  const avos = Math.min(Math.floor(diffDias / 30) + 1, 12);
  return Math.max(0, avos);
}

/**
 * Meses totais de contrato (para cálculo de FGTS).
 */
function mesesContrato(admissao, demissao) {
  let meses = (demissao.getFullYear() - admissao.getFullYear()) * 12;
  meses += demissao.getMonth() - admissao.getMonth();
  if (demissao.getDate() >= admissao.getDate()) meses += 1;
  return Math.max(1, meses);
}

/**
 * Calcula todos os pedidos P01..P87 + VALOR_CAUSA + VALOR_CAUSA_EXT.
 *
 * @param {object} dados  — CasoVigilante (usa SALARIO, DATA_ADMISSAO, DATA_RESCISAO)
 * @param {object} flags  — flags derivadas (de derivarFlags) — opcional
 * @returns {object}      — { P01..P87, VALOR_CAUSA, VALOR_CAUSA_EXT }
 */
export function calcularPedidos(dados, flags = {}) {
  const salario = parseMoney(dados.SALARIO);
  const admissao = parseDate(dados.DATA_ADMISSAO);
  const demissao = parseDate(dados.DATA_RESCISAO);

  const pedidos = {};
  // Inicializa P01..P87 vazios
  for (let i = 1; i <= 87; i++) {
    pedidos[`P${String(i).padStart(2, "0")}`] = "";
  }

  const podeCalcular = salario > 0 && admissao && demissao && demissao >= admissao;

  // ── Pedidos variáveis: "a apurar em liquidação" ──────────────────────
  // P02 (desvio/acúmulo), P03–P08, P16–P81
  const variaveis = [
    2, 3, 4, 5, 6, 7, 8,
    ...Array.from({ length: 81 - 16 + 1 }, (_, i) => 16 + i), // P16..P81
  ];
  for (const i of variaveis) {
    pedidos[`P${String(i).padStart(2, "0")}`] = A_APURAR;
  }

  if (!podeCalcular) {
    return {
      ...pedidos,
      VALOR_CAUSA: "",
      VALOR_CAUSA_EXT: "",
    };
  }

  const anosCompletos = diffAnosCompletos(admissao, demissao);

  // P01 — Dano moral = 10 × última remuneração
  pedidos.P01 = fmtBRL(salario * 10);

  // P09 — Saldo de salário (15 dias) = salário/30 × 15
  const P09 = (salario / 30) * 15;
  pedidos.P09 = fmtBRL(P09);

  // P10 — Aviso prévio indenizado = salário/30 × min(30 + anos×3, 90)
  const diasAviso = Math.min(30 + anosCompletos * 3, 90);
  const P10 = (salario / 30) * diasAviso;
  pedidos.P10 = fmtBRL(P10);

  // P11 — 13º proporcional = salário/12 × meses no ano da rescisão
  const avos13Val = avos13(admissao, demissao);
  const P11 = (salario / 12) * avos13Val;
  pedidos.P11 = fmtBRL(P11);

  // P12 — Férias vencidas em dobro + 1/3 = salário × 4/3 × 2 (somente se > 1 ano)
  const P12 = anosCompletos >= 1 ? salario * (4 / 3) * 2 : 0;
  pedidos.P12 = fmtBRL(P12);

  // P13 — Férias vencidas + 1/3 = salário × 4/3
  const P13 = salario * (4 / 3);
  pedidos.P13 = fmtBRL(P13);

  // P14 — Férias proporcionais + 1/3 = salário/12 × meses × 4/3
  const avosFer = avosFeriasProporcionais(admissao, demissao);
  const P14 = (salario / 12) * avosFer * (4 / 3);
  pedidos.P14 = fmtBRL(P14);

  // P15 = P09 + P10 + P11 + P12 + P13 + P14
  const P15 = P09 + P10 + P11 + P12 + P13 + P14;
  pedidos.P15 = fmtBRL(P15);

  // P82 — FGTS = 8% × salário × meses de contrato
  const meses = mesesContrato(admissao, demissao);
  const P82 = salario * 0.08 * meses;
  pedidos.P82 = fmtBRL(P82);

  // P83 — Multa 40% FGTS
  const P83 = P82 * 0.40;
  pedidos.P83 = fmtBRL(P83);

  // P84 = P82 + P83
  const P84 = P82 + P83;
  pedidos.P84 = fmtBRL(P84);

  // P85 — Multa art. 467 = 50% das verbas rescisórias (P15)
  const P85 = P15 * 0.50;
  pedidos.P85 = fmtBRL(P85);

  // P86 — Multa art. 477 = 1 salário
  const P86 = salario;
  pedidos.P86 = fmtBRL(P86);

  // ── VALOR_CAUSA = soma dos pedidos estimados (excluindo subtotais P15, P84) ──
  const totalEstimado =
    salario * 10 +    // P01
    P09 + P10 + P11 + P12 + P13 + P14 +  // verbas rescisórias (sem subtotal P15)
    P82 + P83 +       // FGTS + multa (sem subtotal P84)
    P85 + P86;        // multas 467 + 477

  // P87 — Honorários = 15% sobre o total estimado
  const P87 = totalEstimado * 0.15;
  pedidos.P87 = fmtBRL(P87);

  const valorCausa = totalEstimado + P87;

  return {
    ...pedidos,
    VALOR_CAUSA: fmtBRL(valorCausa),
    VALOR_CAUSA_EXT: valorPorExtenso(valorCausa),
  };
}