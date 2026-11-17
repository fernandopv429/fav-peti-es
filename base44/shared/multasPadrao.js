// Lista "DAS MULTAS CONVENCIONAIS": regras fixas do escritório (17/11/2026).
// Vale para a lista escrita pela IA e para a lista reserva do sistema.
//  - periculosidade: um item só, "Não integra o adicional de periculosidade em suas horas extras;"
//  - sempre no fim, nesta ordem: intervalo (com a cláusula), FGTS, DSR e dano moral.
// Itens da IA sobre esses mesmos assuntos saem, para não repetir.

export const ITEM_MULTA_PERICULOSIDADE = 'Não integra o adicional de periculosidade em suas horas extras;';

const RX_PERIC = /periculosidade/i;
// Intervalo de refeição; os "10 minutos de descanso a cada hora" são outro item.
const RX_INTERVALO = { test: (s) => /intervalo|refei[çc][ãa]o e descanso/i.test(s) && !/10\s*(?:\(dez\)\s*)?minutos/i.test(s) };
const RX_FGTS = /\bFGTS\b/i;
const RX_DSR = /\bDSR|descanso semanal/i;
const RX_DANO = /dano moral/i;

// Cláusula da CCT para o intervalo: a que a IA citou, se citou; senão a da
// CCT de vigilância (41ª, IV — peças do escritório); senão sem número.
function clausulaIntervalo(itensIA, ehVigilante) {
  for (const s of itensIA) {
    if (!RX_INTERVALO.test(s)) continue;
    const m = /(cl[aá]usulas?\s+\d+[ªº]?(?:\s*,\s*(?:§\s*\d+[ºª]?|inciso\s+[IVXL]+|[IVXL]+))?(?:\s*,?\s*e\s+(?:da\s+)?cl[aá]usula\s+\d+[ªº]?(?:\s*,\s*(?:§\s*\d+[ºª]?|inciso\s+[IVXL]+|[IVXL]+))?)?)/i.exec(s);
    // "cláusula 40ª, §4º, e da cláusula 41ª, IV" → "cláusulas 40ª, §4º, e 41ª, IV"
    if (m) {
      const c = m[1].replace(/\s+/g, ' ').trim();
      return /\be\s+(?:da\s+)?cl[aá]usula/i.test(c)
        ? c.replace(/^cl[aá]usula\b/i, 'cláusulas').replace(/\s*e\s+(?:da\s+)?cl[aá]usula\s+/i, ' e ')
        : c;
    }
  }
  return ehVigilante ? 'cláusula 41ª, IV' : '';
}

export function finalizarItensMulta(lista = [], { ehVigilante = false } = {}) {
  const itens = (lista || []).map((s) => String(s || '').trim()).filter(Boolean);
  const clausula = clausulaIntervalo(itens, ehVigilante);
  const out = [];
  let temPeric = false;
  for (const s of itens) {
    if (RX_PERIC.test(s)) {
      if (!temPeric) out.push(ITEM_MULTA_PERICULOSIDADE);
      temPeric = true;
      continue;
    }
    if (RX_INTERVALO.test(s) || RX_FGTS.test(s) || RX_DSR.test(s) || RX_DANO.test(s)) continue;
    // O valor em R$ que a IA escreve é retirado antes (sanitizarValoresIA) e
    // sobrava "no valor de por dia" (Thais, 17/11/2026). Tira a sobra.
    const limpo = s
      .replace(/,?\s*(?:no|pelo)\s+valor\s+(?:de\b\s*)?(?:por\s+(?:dia|m[eê]s|plant[ãa]o)\s*)?(?=[,;.]|$)/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,;.])/g, '$1');
    out.push(/[;.]$/.test(limpo) ? limpo.replace(/\.$/, ';') : `${limpo};`);
  }
  out.push(`Não concessão do intervalo de refeição e descanso${clausula ? `, ${clausula}` : ''};`);
  out.push('Não remunera corretamente o FGTS;');
  out.push('Não remunera corretamente os seus DSR;');
  out.push('Incorre em dano moral em virtude das condições supramencionadas;');
  return out;
}
