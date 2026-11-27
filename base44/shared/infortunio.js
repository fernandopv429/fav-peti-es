// DOENÇA x ACIDENTE DE TRABALHO e PRAZO DA ESTABILIDADE (27/11/2026).
//
// O Fav Sales manda um campo só ("Doença ou acidente de trabalho?" + descrição).
// Tudo virava "DA DOENÇA OCUPACIONAL ... art. 20, I" — no caso Augusto, um tiro
// na mão em assalto saiu como "foi acometido de durante um assalto...". E o
// capítulo da estabilidade era ligado sempre que havia doença, mesmo com os
// 12 meses (art. 118 da Lei 8.213/91) já vencidos na data da saída.
//
// avaliarInfortunio(caso) devolve:
//   tipo: 'acidente' (art. 19: fato súbito) | 'doenca' (art. 20) | null
//   estabilidade: true | false | null (null = sem datas para conferir)
//   motivo / aviso: texto para a revisão

const RX_ACIDENTE = /acident|assalt|roub|\btiro|balead|baleou|disparo|arma de fogo|esfaque|facad|agredid|agress[ãa]o f[íi]sic|queda|\bcaiu|\bcair\b|trope[çc]|atropel|colis[ãa]o|choque el[ée]tric|queimadur|\bcortou|\bcorte\b|prensad|prensou|esmag|fratur|tor[çc]eu|tor[çc][ãa]o|amputa/i;
const RX_DOENCA = /depress|ansiedad|burnout|s[íi]ndrome|p[âa]nico|estresse|psiqui|psicol|\bler\b|\bdort\b|tendin|tendon|bursite|epicondil|h[ée]rnia|artrose|lombalg|cervicalg|perda auditiva|pair\b|alergi|dermatit|asma|intoxica|varize|doen[çc]a/i;

const NUM_EXTENSO = {
  um: 1, uma: 1, dois: 2, duas: 2, 'três': 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8,
  nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40,
  cinquenta: 50, sessenta: 60, noventa: 90, cento: 100, cem: 100, 'cento e vinte': 120, 'cento e oitenta': 180,
};

function iso(dt) {
  return dt ? dt.toISOString().slice(0, 10) : null;
}
function br(isoTxt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoTxt || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
function dataBr(d, m, a) {
  let ano = Number(a);
  if (ano < 100) ano += 2000;
  const dt = new Date(Date.UTC(ano, Number(m) - 1, Number(d)));
  return Number.isNaN(dt.getTime()) ? null : dt;
}
function somarDias(dt, dias) {
  return new Date(dt.getTime() + dias * 86400000);
}
function somarMeses(dt, meses) {
  const r = new Date(dt.getTime());
  r.setUTCMonth(r.getUTCMonth() + meses);
  return r;
}

const DATA = String.raw`(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})`;
const NUM = String.raw`(\d{1,3}|${Object.keys(NUM_EXTENSO).sort((a, b) => b.length - a.length).join('|')})`;
const UNID = String.raw`(dias?|semanas?|m[eê]s(?:es)?|anos?)`;

function paraDias(n, unid) {
  const q = /^\d+$/.test(n) ? Number(n) : NUM_EXTENSO[String(n).toLowerCase()];
  if (!q) return null;
  if (/^dia/i.test(unid)) return q;
  if (/^semana/i.test(unid)) return q * 7;
  if (/^m/i.test(unid)) return q * 30;
  if (/^ano/i.test(unid)) return q * 365;
  return null;
}

export function tipoInfortunio(caso = {}) {
  if (caso.tipo_infortunio === 'acidente' || caso.tipo_infortunio === 'doenca') return caso.tipo_infortunio;
  const desc = String(caso.doenca_descricao || '');
  if (!desc.trim()) return caso.tem_doenca ? 'doenca' : null;
  if (RX_ACIDENTE.test(desc) && !RX_DOENCA.test(desc)) return 'acidente';
  return 'doenca';
}

// Datas do afastamento lidas da entrevista (o Fav Sales não tem campo para elas).
export function datasAfastamento(caso = {}) {
  const txt = [caso.doenca_descricao, caso.entrevista_texto, caso.dano_observacao, caso.fatos_narrados]
    .filter(Boolean).join('\n');
  const out = { evento: null, dias_afastamento: null, retorno: null };

  // Retorno/alta explícitos.
  const rRet = new RegExp(String.raw`(?:retorn\w*|voltou|alta|cessa\w*\s+do\s+benef\w*)[^.\n]{0,40}?${DATA}`, 'i').exec(txt);
  if (rRet) out.retorno = dataBr(rRet[1], rRet[2], rRet[3]);

  // Data do fato: a primeira data perto de palavras do infortúnio.
  const rEv = new RegExp(String.raw`(?:acident|assalt|tiro|balead|queda|caiu|afast|les[ãa]o|doen|inss|benef|cirurgi)[^\n]{0,80}?${DATA}|${DATA}[^\n]{0,40}?(?:acident|assalt|tiro|balead|queda|caiu|afast)`, 'i').exec(txt);
  if (rEv) out.evento = rEv[1] ? dataBr(rEv[1], rEv[2], rEv[3]) : dataBr(rEv[4], rEv[5], rEv[6]);

  // Duração: "afastado por 60 dias", "ficou 3 meses afastado", "60 dias de afastamento".
  const rDur = new RegExp(String.raw`afastad\w*\s+(?:pelo\s+INSS\s+)?(?:por|durante)?\s*(?:cerca\s+de\s+|aproximadamente\s+)?${NUM}\s*${UNID}`, 'i').exec(txt)
    || new RegExp(String.raw`${NUM}\s*${UNID}\s+(?:de\s+)?afasta`, 'i').exec(txt)
    || new RegExp(String.raw`ficou\s+${NUM}\s*${UNID}\s+afastad`, 'i').exec(txt);
  if (rDur) out.dias_afastamento = paraDias(rDur[1], rDur[2]);

  if (!out.retorno && out.evento && out.dias_afastamento) out.retorno = somarDias(out.evento, out.dias_afastamento);
  return { evento: iso(out.evento), dias_afastamento: out.dias_afastamento, retorno: iso(out.retorno) };
}

export function avaliarInfortunio(caso = {}) {
  const tem = !!(caso.tem_doenca || caso.tem_estabilidade);
  if (!tem) return { tipo: null, estabilidade: false, datas: null, motivo: '', aviso: '' };
  const tipo = tipoInfortunio(caso);
  const datas = datasAfastamento(caso);
  const saida = /^\d{4}-\d{2}-\d{2}/.test(caso.data_rescisao || '') ? new Date(`${caso.data_rescisao.slice(0, 10)}T00:00:00Z`) : null;

  let estabilidade = null;
  let motivo = '';
  if (datas.dias_afastamento != null && datas.dias_afastamento <= 15) {
    estabilidade = false;
    motivo = `afastamento de ${datas.dias_afastamento} dias (até 15 dias não gera auxílio acidentário — Súm. 378, II, do TST)`;
  } else if (datas.retorno && saida) {
    const fim = somarMeses(new Date(`${datas.retorno}T00:00:00Z`), 12);
    if (saida > fim) {
      estabilidade = false;
      motivo = `os 12 meses após o retorno (${br(datas.retorno)}) terminaram em ${br(iso(fim))}, antes da saída (${br(caso.data_rescisao)})`;
    } else {
      estabilidade = true;
      motivo = `saída (${br(caso.data_rescisao)}) dentro dos 12 meses após o retorno (${br(datas.retorno)})`;
    }
  }

  const avisos = [];
  if (tipo === 'acidente') avisos.push('Infortúnio tratado como ACIDENTE DE TRABALHO típico (art. 19), não doença. Conferir.');
  if (estabilidade === false) avisos.push(`Estabilidade acidentária NÃO pedida: ${motivo}. Conferir.`);
  else if (estabilidade === true) avisos.push(`Estabilidade acidentária pedida: ${motivo}.`);
  else avisos.push('Estabilidade acidentária pedida sem datas de afastamento/retorno na entrevista: CONFERIR se houve afastamento de mais de 15 dias e se a saída foi até 12 meses após o retorno; se não, retirar o capítulo.');
  return { tipo, estabilidade, datas, motivo, aviso: avisos.join(' ') };
}

// Descrição para o meio da frase: sem ponto final e com inicial minúscula
// ("Alergia devido a ... fortes." -> "alergia devido a ... fortes").
export function descricaoNaFrase(desc) {
  let s = String(desc || '').trim().replace(/[\s.;,]+$/, '');
  if (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(s)) s = s[0].toLowerCase() + s.slice(1);
  return s;
}
