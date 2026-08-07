// Cálculos trabalhistas determinísticos (JavaScript puro) — cópia backend.
// Fonte única de verdade mantida em sincronia com src/lib/trabalhista/mathUtils.js.

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function formatBRL(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function grupoPorExtenso(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 10) partes.push(UNIDADES[resto]);
    else if (resto < 20) partes.push(DEZ_A_DEZENOVE[resto - 10]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

function inteiroPorExtenso(n) {
  if (n === 0) return 'zero';
  const milhoes = Math.floor(n / 1000000);
  const milhares = Math.floor((n % 1000000) / 1000);
  const centenas = n % 1000;
  const partes = [];
  if (milhoes) partes.push(milhoes === 1 ? 'um milhão' : `${grupoPorExtenso(milhoes)} milhões`);
  if (milhares) partes.push(milhares === 1 ? 'mil' : `${grupoPorExtenso(milhares)} mil`);
  if (centenas) partes.push(grupoPorExtenso(centenas));
  return partes.join(', ');
}

export function valorPorExtenso(valor) {
  const centavosTotais = Math.round((Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const centavosTxt = centavos ? `${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}` : '';
  if (!reais) return centavosTxt || 'zero reais';
  const reaisTxt = `${inteiroPorExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`;
  return centavos ? `${reaisTxt} e ${centavosTxt}` : reaisTxt;
}

export const numeroPorExtenso = valorPorExtenso;

export function brlComExtenso(valor) {
  if (valor == null || isNaN(valor)) return '';
  return `${formatBRL(valor)} (${valorPorExtenso(valor)})`;
}

// 'YYYY-MM-DD' TEM de ser lido como data LOCAL. new Date('2025-12-07') é
// interpretado como meia-noite UTC: rodando em UTC-3 (o navegador do
// escritório), getDate() devolve 6. Foi exatamente o que aconteceu na peça do
// Marcos — saldo de salário com 6 dias (R$ 429,64) em vez de 7 (R$ 501,25),
// porque o .docx é montado no navegador enquanto o backend (UTC) acertava.
function parseData(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Data -> 'YYYY-MM-DD' no fuso LOCAL (toISOString() desfaria a correção acima).
function isoLocal(d) {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function mesesContrato(admissao, rescisao) {
  if (!admissao || !rescisao) return null;
  const a = parseData(admissao);
  const r = parseData(rescisao);
  if (!a || !r || r < a) return null;
  let meses = 0;
  const inicioMs = new Date(a.getFullYear(), a.getMonth(), 1).getTime();
  const fimMs = new Date(r.getFullYear(), r.getMonth(), 1).getTime();
  const cursor = new Date(a.getFullYear(), a.getMonth(), 1);
  while (cursor.getTime() <= fimMs) {
    const mesEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const start = cursor.getTime() === inicioMs ? a : new Date(cursor);
    const end = cursor.getTime() === fimMs ? r : mesEnd;
    const dias = Math.floor((end - start) / 86400000) + 1;
    if (dias >= 15) meses += 1;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return Math.max(meses, 0);
}

export function anosCompletos(admissao, rescisao) {
  const m = mesesContrato(admissao, rescisao);
  return m == null ? null : Math.floor(m / 12);
}

export function projetarDataComAvisoPrevio(rescisao, diasAviso) {
  if (!rescisao || !diasAviso) return rescisao;
  const r = parseData(rescisao);
  if (!r) return rescisao;
  r.setDate(r.getDate() + diasAviso);
  return isoLocal(r);
}

export function avosEntreDatas(admissao, dataFinal, contarProjecaoUltimoMes) {
  if (!admissao || !dataFinal) return null;
  const a = parseData(admissao);
  const r = parseData(dataFinal);
  if (!a || !r || r < a) return null;
  let avos = 0;
  const cursor = new Date(a.getFullYear(), a.getMonth(), 1);
  const ultimoMes = new Date(r.getFullYear(), r.getMonth(), 1);
  const mesAdmissao = new Date(a.getFullYear(), a.getMonth(), 1).getTime();
  while (cursor <= ultimoMes) {
    const mesEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const efetivoStart = cursor.getTime() === mesAdmissao ? a : new Date(cursor);
    const ehUltimo = cursor.getTime() === ultimoMes.getTime();
    const efetivoEnd = ehUltimo ? r : mesEnd;
    const dias = Math.floor((efetivoEnd - efetivoStart) / 86400000) + 1;
    if (dias >= 15 || (ehUltimo && contarProjecaoUltimoMes)) avos += 1;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return Math.min(avos, 12);
}

export function avisoPrevio(salario, anos, { acordo = false } = {}) {
  if (!salario || anos == null) return null;
  const diasIntegral = Math.min(30 + anos * 3, 90);
  const dias = acordo ? Math.round(diasIntegral / 2) : diasIntegral;
  return { dias, diasIntegral, valor: round2((salario / 30) * dias) };
}

export function saldoSalario(salario, dataRescisao) {
  if (!salario || !dataRescisao) return null;
  const r = parseData(dataRescisao);
  if (!r) return null;
  const dias = r.getDate();
  return { dias, valor: round2((salario / 30) * dias) };
}

export function decimoTerceiroProporcional(salario, meses) {
  if (!salario || meses == null) return null;
  const avos = meses % 12 || 12;
  return { avos, valor: round2((salario / 12) * avos) };
}

export function feriasProporcionais(salario, meses) {
  if (!salario || meses == null) return null;
  const avos = meses % 12 || 12;
  const base = (salario / 12) * avos;
  return { avos, valor: round2(base * (4 / 3)) };
}

export function fgtsPeriodo(salario, meses, { multaPct = 0.4 } = {}) {
  if (!salario || meses == null) return null;
  const deposito = round2(salario * 0.08 * meses);
  const multa = round2(deposito * multaPct);
  return { deposito, multa, multa40: multa, multaPct };
}

export function dsrSobreValor(valor) {
  if (!valor) return null;
  return round2(valor / 6);
}

export function danoMoral10x(maiorRemuneracao) {
  if (!maiorRemuneracao) return null;
  return round2(maiorRemuneracao * 10);
}

export function temDanoMoralConcreto(caso = {}) {
  return Boolean(
    caso.tem_dano_moral
    || (caso.dano_fatos && String(caso.dano_fatos).trim().length >= 20)
    || (caso.dano_supervisor && String(caso.dano_supervisor).trim().length >= 20)
    || caso.tem_desvio
    || (caso.tem_ft && caso.tem_integracao_por_fora)
    || caso.tem_insalubridade
  );
}

// Busca na CCT já consultada (dadosCct.clausulas) a cláusula real e o
// percentual referentes a um tema (desvio/acúmulo/gratificação de função) —
// evita citar um número/percentual fixo quando a convenção da categoria do
// caso (vigilância/asseio/terceirizados) numera ou percentualiza diferente.
// Sem cláusula encontrada, quem chama usa o padrão anterior (fallback).
function buscarClausulaCct(dadosCct, regexTema) {
  if (!dadosCct?.clausulas?.length) return null;
  for (const c of dadosCct.clausulas) {
    // Campos vistos na resposta real da API de CCT: clausula_ref, titulo
    // (título do instrumento, não da cláusula), conteudo. clausula_titulo/
    // ementa/texto não existem hoje, mas são mantidos por robustez a shapes
    // futuros da API.
    const texto = [c.clausula_titulo, c.ementa, c.texto, c.conteudo].filter(Boolean).join(' ');
    if (!regexTema.test(texto)) continue;
    // Cláusulas de CCT numeiam por extenso ("CLÁUSULA SEXAGÉSIMA QUARTA") e o
    // percentual costuma ficar em parágrafo separado da definição do tema —
    // por isso a busca do percentual é na cláusula INTEIRA, não numa janela
    // estreita ao redor do termo buscado.
    const refNum = (c.clausula_ref || '').match(/\d+/)?.[0] || texto.match(/cl[áa]usula\s*(\d+)/i)?.[1];
    const pctMatch = texto.match(/(\d{1,3})\s*%/);
    const pct = pctMatch ? Number(pctMatch[1]) : null;
    return {
      clausula: refNum ? `cláusula ${refNum}ª` : (c.clausula_ref || null),
      percentual: (pct && pct >= 5 && pct <= 100) ? pct / 100 : null,
    };
  }
  return null;
}

// ============================================================
// MATRIZ DE REFLEXOS DO ESCRITÓRIO
// Derivada das peças reais da especialista: em Marcos e Luciano, TODOS os itens
// com reflexos batem, ao centavo, nestes percentuais sobre o principal
// (conferido em 6 verbas × 5 reflexos). Ex.: HE principal R$ 522,00 → DSR
// R$ 37,85 / aviso R$ 20,88 / 13º R$ 31,32 / férias+1/3 R$ 36,54 / FGTS+40%
// R$ 54,80 = R$ 703,39 no rol.
// Atenção: a peça do Jonathan usa a matriz ortodoxa (1/12 para 13º, 1/12+1/3
// para férias, 8%+40% de FGTS). São duas práticas no escritório; aqui ficou a
// que aparece em 2 das 3 referências. Trocar = mexer só nesta tabela.
// ============================================================
export const REFLEXOS_PCT = {
  'DSR': 0.0725,
  'aviso prévio': 0.04,
  '13º salário': 0.06,
  'férias + 1/3': 0.07,
  'FGTS': 0.075,
  'multa de 40% do FGTS': 0.03,
};
export const REFLEXOS_TOTAL_PCT = 0.3475;

export function reflexosSobre(principal) {
  const p = Number(principal) || 0;
  if (p <= 0) return null;
  const memoria = Object.entries(REFLEXOS_PCT)
    .map(([nome, pct]) => `${nome} ${formatBRL(round2(p * pct))}`)
    .join(' · ');
  return { valor: round2(p * REFLEXOS_TOTAL_PCT), memoria };
}

// ============================================================
// PARÂMETROS DA ESTIMATIVA DAS VERBAS POR HORA
// Antes, TODA verba que depende de contagem de horas saía "a apurar em
// liquidação", SEM VALOR. Esse era o maior furo do valor da causa: na peça de
// referência do Marcos essas seis verbas somam R$ 8.061,90 — 56% do gap de
// R$ 14.464,75 entre a peça gerada e a da especialista.
//
// A quantidade de horas de cada tese fica AQUI, num só lugar, e a memória de
// cálculo de cada item traz a conta inteira para o advogado auditar. Os padrões
// abaixo são os tecnicamente devidos (1h de intervalo por dia trabalhado, 10
// min a cada hora etc.) e ficam ACIMA das estimativas conservadoras da
// especialista — calibrar aqui, nunca no meio do cálculo.
// ============================================================
export const PARAMS_HORAS = {
  divisor_mensal: 220,                    // hora normal = salário / 220
  adicional_convencional_vigilancia: 0.60, // cl. 12º CCT vigilância
  adicional_convencional_demais: 0.50,     // art. 71, §4º / art. 59 CLT
  dias_mes_12x36: 15,                      // 12x36 = ~15 dias/mês
  dias_mes_padrao: 22,
  horas_prorrogacao_dia: 1,                // 30 min antes + 30 min depois
  horas_intervalo_dia: 1,                  // art. 71: 1h por dia trabalhado
  janela_noturna_horas: 7,                 // 22h–05h
  fator_hora_noturna_reduzida: 60 / 52.5,  // hora noturna de 52'30"
  adicional_noturno: 0.20,
  minutos_descanso_por_hora: 10,           // cl. 33º CCT vigilância
  horas_jornada_dia: 12,
  adicional_periculosidade: 0.30,
};

// Média de um intervalo escrito em texto ("4 a 6 vezes por mês" → 5).
function mediaNumerica(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const nums = String(v).match(/\d+(?:[.,]\d+)?/g);
  if (!nums || !nums.length) return null;
  const vals = nums.map((n) => parseFloat(n.replace(',', '.'))).filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  if (vals.length === 1) return vals[0];
  return (vals[0] + vals[1]) / 2;
}

// Mesma lógica de jornadaCruzaNoturno em shared/redacao.js e em
// features/entrevista/lib/dadosTemplate.js — mudou lá, mudar aqui também.
function cruzaNoturno(jornadaTxt) {
  const m = /(\d{1,2})[:h]?(\d{2})?\s*(?:[àa]s?|-)\s*(\d{1,2})[:h]?(\d{2})?/i.exec(jornadaTxt || '');
  if (!m) return false;
  const inicio = Number(m[1]);
  const fim = Number(m[3]);
  const dentroDaJanela = (h) => h >= 22 || h < 5;
  if (dentroDaJanela(inicio) || dentroDaJanela(fim)) return true;
  return fim < inicio;
}

export function calcularVerbasCaso(caso = {}, dadosCct = null) {
  const itens = [];
  const salario = Number(caso.salario) || null;
  const maiorRem = Number(caso.maior_remuneracao) || salario;
  const meses = mesesContrato(caso.data_admissao, caso.data_rescisao);
  const anos = meses == null ? null : Math.floor(meses / 12);
  const folgasMes = Number(caso.ft_qtd_media) || null;
  const isAcordo = caso.tipo_dispensa === 'acordo';

  if (meses != null) {
    itens.push({ item: 'Duração do contrato', memoria: `${meses} mês(es) / ${anos} ano(s) completo(s)`, valor: null });
  }

  const saldo = saldoSalario(salario, caso.data_rescisao);
  if (saldo) itens.push({ item: 'Saldo de salário', memoria: `${saldo.dias} dia(s) do mês da rescisão (base 30)`, valor: saldo.valor });

  const ap = avisoPrevio(salario, anos, { acordo: isAcordo });
  if (ap) {
    const memoriaAp = isAcordo
      ? `${ap.dias} dias — metade de ${ap.diasIntegral} (art. 484-A, I, CLT — acordo)`
      : `${ap.dias} dias (Lei 12.506/2011)`;
    itens.push({ item: 'Aviso prévio indenizado', memoria: memoriaAp, valor: ap.valor });
  }
  const dataFim = ap ? (projetarDataComAvisoPrevio(caso.data_rescisao, ap.dias) || caso.data_rescisao) : caso.data_rescisao;
  const mesesProjetados = mesesContrato(caso.data_admissao, dataFim) ?? meses;
  const avos13 = salario ? avosEntreDatas(caso.data_admissao, dataFim, false) : null;
  const valor13 = avos13 != null ? round2((salario / 12) * avos13) : null;
  if (valor13 != null) itens.push({ item: '13º proporcional', memoria: `${avos13}/12 avos (proj. aviso prévio)`, valor: valor13 });
  const avosFerias = salario ? avosEntreDatas(caso.data_admissao, dataFim, false) : null;
  const valorFerias = avosFerias != null ? round2((salario / 12) * avosFerias * (4 / 3)) : null;
  if (valorFerias != null) itens.push({ item: 'Férias proporcionais + 1/3', memoria: `${avosFerias}/12 avos + 1/3 (proj. aviso prévio)`, valor: valorFerias });

  if (ap && valor13 != null && valorFerias != null) {
    const baseIncontroversa = round2((saldo?.valor || 0) + ap.valor + valor13 + valorFerias);
    itens.push({ item: 'Multa do art. 467 da CLT', memoria: '50% sobre saldo + aviso prévio + 13º + férias +1/3 (verbas incontroversas)', valor: round2(baseIncontroversa * 0.5) });
  }

  if (ap && salario) {
    itens.push({ item: 'Multa do art. 477 da CLT', memoria: '1 salário nominal (art. 477, §§ 6º e 8º, CLT)', valor: round2(salario) });
  }

  if (caso.tem_salarios_aberto && salario) {
    const qtd = Number(caso.salarios_aberto_qtd);
    if (qtd > 0) {
      itens.push({ item: 'Salários em aberto', memoria: `${qtd} mês(es) não quitado(s) × ${formatBRL(salario)}`, valor: round2(salario * qtd) });
    }
  }

  const fg = fgtsPeriodo(salario, mesesProjetados, { multaPct: isAcordo ? 0.2 : 0.4 });
  if (fg) {
    itens.push({ item: 'FGTS do período (8%)', memoria: `8% × ${mesesProjetados} meses (proj. aviso prévio)`, valor: fg.deposito });
    itens.push({
      item: isAcordo ? 'Multa de 20% do FGTS (acordo)' : 'Multa de 40% do FGTS',
      memoria: isAcordo ? '20% sobre os depósitos (art. 484-A, II, CLT — acordo)' : '40% sobre os depósitos',
      valor: fg.multa,
    });
  }

  const temConteudoDanoMoral = temDanoMoralConcreto(caso);
  if (temConteudoDanoMoral && maiorRem) {
    itens.push({ item: 'Dano moral (10x remuneração)', memoria: '10x a maior remuneração na função', valor: danoMoral10x(maiorRem) });
  }

  if (caso.val_ft) {
    const porFolga = Number(caso.val_ft);
    const totalFT = folgasMes && meses ? round2(porFolga * folgasMes * meses) : round2(porFolga);
    itens.push({ item: 'Folgas trabalhadas (100%)', memoria: folgasMes && meses ? `${formatBRL(porFolga)}/folga × ${folgasMes}/mês × ${meses} meses` : 'valor informado', valor: totalFT });
    const dsr = dsrSobreValor(totalFT);
    if (dsr) itens.push({ item: 'Reflexo DSR sobre FT (1/6)', memoria: 'Súm. 172 TST', valor: dsr });
  }

  if (caso.tem_acumulo && salario && meses) {
    const cl = buscarClausulaCct(dadosCct, /ac[uú]mulo de fun/i);
    const pct = cl?.percentual ?? 0.2;
    const clTxt = cl?.clausula ? ` (${cl.clausula})` : '';
    itens.push({ item: `Acúmulo de função (${Math.round(pct * 100)}%)`, memoria: `${Math.round(pct * 100)}% × ${formatBRL(salario)} × ${meses} meses${clTxt}`, valor: round2(pct * salario * meses) });
  }

  if (caso.tem_gratificacao && meses) {
    const gratVal = Number(caso.gratificacao_valor);
    if (gratVal > 0) {
      itens.push({ item: 'Gratificação/bônus de função', memoria: `${formatBRL(gratVal)}/mês × ${meses} meses`, valor: round2(gratVal * meses) });
    } else if (salario) {
      const cl = buscarClausulaCct(dadosCct, /gratifica[çc][ãa]o de fun|condutor|motorista/i);
      const pct = cl?.percentual ?? 0.1;
      const clTxt = cl?.clausula || 'cláusula 3ª';
      itens.push({ item: `Gratificação de função (${Math.round(pct * 100)}%)`, memoria: `${Math.round(pct * 100)}% × ${formatBRL(salario)} × ${meses} meses (${clTxt})`, valor: round2(pct * salario * meses) });
    }
  }

  if (caso.tem_desvio && salario && meses) {
    const cl = buscarClausulaCct(dadosCct, /desvio de fun/i);
    const pct = cl?.percentual ?? 0.5;
    const clTxt = cl?.clausula || 'cláusula 64ª';
    itens.push({ item: `Desvio de função (${Math.round(pct * 100)}%)`, memoria: `${Math.round(pct * 100)}% × ${formatBRL(salario)} × ${meses} meses (${clTxt})`, valor: round2(pct * salario * meses) });
  }

  if (caso.tem_assiduidade && caso.assiduidade_diferenca && meses) {
    const dif = Number(caso.assiduidade_diferenca);
    itens.push({ item: 'Bonificação de assiduidade (diferença)', memoria: `${formatBRL(dif)}/mês × ${meses} meses`, valor: round2(dif * meses) });
  }

  if (caso.tem_integracao_por_fora && caso.valor_por_fora && meses) {
    const vpf = Number(caso.valor_por_fora);
    itens.push({ item: 'Integração de valores por fora', memoria: `${formatBRL(vpf)}/mês × ${meses} meses`, valor: round2(vpf * meses) });
  }

  if (caso.tem_auxilio_alimentacao && caso.valor_aux_alimentacao && folgasMes && meses) {
    const va = Number(caso.valor_aux_alimentacao);
    itens.push({ item: 'Auxílio-alimentação nas folgas', memoria: `${formatBRL(va)}/dia × ${folgasMes}/mês × ${meses} meses`, valor: round2(va * folgasMes * meses) });
  }

  if (caso.tem_vale_transporte && folgasMes && meses) {
    const vc = Number(caso.val_conducao) || 5;
    const usouPadrao = !caso.val_conducao;
    const memoria = usouPadrao
      ? `2 conduções × R$ 5,00 (padrão — valor não informado) × ${folgasMes}/mês × ${meses} meses`
      : `2 conduções × ${formatBRL(vc)} × ${folgasMes}/mês × ${meses} meses`;
    itens.push({ item: 'Vale-transporte nas folgas', memoria, valor: round2(2 * vc * folgasMes * meses) });
  }

  // ---- Verbas que dependem de contagem de horas ----
  // Cada item entra com principal + reflexos (matriz do escritório) e com a
  // conta inteira na memória. Antes, todas saíam "a apurar em liquidação".
  const horaNormal = salario ? round2(salario / PARAMS_HORAS.divisor_mensal) : null;
  if (horaNormal && meses) {
    const ehVigilante = /vigilante|vigil/i.test(caso.funcao || '');
    const adicConv = ehVigilante
      ? PARAMS_HORAS.adicional_convencional_vigilancia
      : PARAMS_HORAS.adicional_convencional_demais;
    const adicTxt = `${Math.round(adicConv * 100)}%`;
    const horaExtra = round2(horaNormal * (1 + adicConv));
    const eh12x36 = /12\s*x\s*36/i.test(`${caso.escala || ''} ${caso.jornada_horario || ''}`);
    const diasMes = eh12x36 ? PARAMS_HORAS.dias_mes_12x36 : PARAMS_HORAS.dias_mes_padrao;
    const diasTotais = diasMes * meses;
    const base = `hora normal ${formatBRL(horaNormal)} (salário ÷ ${PARAMS_HORAS.divisor_mensal})`;

    const addComReflexos = (item, memoria, valor) => {
      const v = round2(valor);
      if (!(v > 0)) return;
      itens.push({ item, memoria, valor: v });
      const r = reflexosSobre(v);
      if (r) {
        itens.push({
          item: `Reflexos de ${item}`,
          memoria: `${(REFLEXOS_TOTAL_PCT * 100).toFixed(2)}% sobre ${formatBRL(v)} — ${r.memoria}`,
          valor: r.valor,
        });
      }
    };

    // 1) Horas extras pela prorrogação habitual (minutos que antecedem/sucedem)
    if (caso.jornada_extrapola || caso.prorrogacao_jornada) {
      const freq = mediaNumerica(caso.jornada_freq_extra) ?? diasMes;
      const horas = round2(PARAMS_HORAS.horas_prorrogacao_dia * freq * meses);
      addComReflexos(
        'Horas extras — prorrogação da jornada',
        `${horas}h (${PARAMS_HORAS.horas_prorrogacao_dia}h × ${freq}×/mês × ${meses} meses) × ${base} + ${adicTxt}`,
        horas * horaExtra,
      );
    }

    // 2) Intervalo intrajornada suprimido (art. 71, §4º)
    if (caso.intervalo_gozado === false || caso.intervalo_usufruido || caso.tem_intervalo_suprimido) {
      const horas = round2(PARAMS_HORAS.horas_intervalo_dia * diasTotais);
      addComReflexos(
        'Intervalo intrajornada (art. 71 da CLT)',
        `${horas}h (${PARAMS_HORAS.horas_intervalo_dia}h × ${diasMes} dias/mês × ${meses} meses) × ${base} + ${adicTxt}`,
        horas * horaExtra,
      );
    }

    // 3) Adicional noturno + hora noturna reduzida (art. 73 CLT, Súm. 60 TST)
    if (caso.tem_adic_noturno || cruzaNoturno(caso.jornada_horario || caso.escala || '')) {
      const fictas = round2(PARAMS_HORAS.janela_noturna_horas * PARAMS_HORAS.fator_hora_noturna_reduzida);
      const excedente = round2(fictas - PARAMS_HORAS.janela_noturna_horas);
      const porNoite = round2((PARAMS_HORAS.adicional_noturno * fictas + excedente) * horaNormal);
      addComReflexos(
        'Adicional noturno e hora noturna reduzida',
        `${formatBRL(porNoite)}/noite [${PARAMS_HORAS.adicional_noturno * 100}% × ${fictas}h fictas + ${excedente}h de redução] × ${diasTotais} noites × ${base}`,
        porNoite * diasTotais,
      );
    }

    // 4) 10 minutos de descanso a cada hora (cl. 33º CCT vigilância)
    if (ehVigilante || caso.tem_dez_min_cct) {
      const horasDia = round2((PARAMS_HORAS.minutos_descanso_por_hora / 60) * PARAMS_HORAS.horas_jornada_dia);
      const horas = round2(horasDia * diasTotais);
      addComReflexos(
        '10 minutos de descanso (cláusula 33º da CCT)',
        `${horas}h (${PARAMS_HORAS.minutos_descanso_por_hora} min × ${PARAMS_HORAS.horas_jornada_dia}h = ${horasDia}h/dia × ${diasTotais} dias) × ${base} + ${adicTxt}`,
        horas * horaExtra,
      );
    }

    // 5) Periculosidade sobre as horas extras (Súm. 132, I, do TST)
    if (caso.tem_periculosidade || ehVigilante) {
      const baseHe = itens
        .filter((i) => /^Horas extras|^Intervalo intrajornada|^10 minutos/.test(i.item))
        .reduce((s, i) => s + (Number(i.valor) || 0), 0);
      if (baseHe > 0) {
        addComReflexos(
          'Adicional de periculosidade sobre as horas extras',
          `${PARAMS_HORAS.adicional_periculosidade * 100}% sobre ${formatBRL(round2(baseHe))} de horas extras (Súm. 132, I, do TST)`,
          baseHe * PARAMS_HORAS.adicional_periculosidade,
        );
      }
    }
  }

  const somaVerbas = round2(itens.reduce((s, c) => s + (Number(c.valor) || 0), 0));
  if (somaVerbas > 0) {
    itens.push({ item: 'Honorários advocatícios (15%)', memoria: '15% sobre o valor da causa (art. 85 do CPC)', valor: round2(somaVerbas * 0.15) });
  }

  return itens;
}