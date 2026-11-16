// ============================================================
// Indicadores do painel Início. SOMENTE LEITURA: agrega os casos de webhook
// já carregados (CasoTrabalhista) para exibição. Nada aqui altera dados ou
// participa da geração das petições.
// ============================================================
import { TIPO_DISPENSA_LABELS } from "@/features/entrevista/lib/tokens";

const DIA = 24 * 60 * 60 * 1000;

export const PERIODOS = [
  { id: "7d", rotulo: "7 dias", dias: 7 },
  { id: "30d", rotulo: "30 dias", dias: 30 },
  { id: "ano", rotulo: "Ano", dias: 365 },
];

const dataDe = (c) => new Date(c.created_date);

/** Valor da causa ESTIMADO: soma dos pedidos sem honorários nem subsidiários. */
export function valorCausaEstimado(c) {
  const calculos = c.analise_json?.calculos || [];
  return calculos.reduce((soma, item) => {
    if (!item || item.valor == null) return soma;
    if (/^Honor[aá]rios/i.test(item.item || "")) return soma;
    if (item.foraDaCausa) return soma;
    return soma + (Number(item.valor) || 0);
  }, 0);
}

// Ordem importa: o primeiro padrão que casar define o pedido.
const PEDIDOS = [
  ["Dano moral", /dano moral/i],
  ["Periculosidade", /periculosidade/i],
  ["Insalubridade", /insalubridade/i],
  ["Desvio de função", /desvio de fun/i],
  ["Acúmulo de função", /ac[uú]mulo/i],
  ["Adicional noturno", /noturn/i],
  ["Intervalo", /intervalo|intrajornada/i],
  ["Descanso (CCT)", /minutos de descanso/i],
  ["Horas extras", /horas? extras?/i],
  ["Benefícios (VT/VA/VR)", /vale|alimenta|refei/i],
  ["Descontos indevidos", /descont/i],
  ["Multa convencional", /multa convencional|multa normativa/i],
  ["Feriados e folgas", /feriado|folga|domingo/i],
];

function pedidosDoCaso(c) {
  const achados = new Set();
  for (const item of c.analise_json?.calculos || []) {
    const nome = (item?.item || "").replace(/^Reflexos de\s+/i, "");
    const hit = PEDIDOS.find(([, rx]) => rx.test(nome));
    if (hit) achados.add(hit[0]);
  }
  if (c.analise_json?.blocos?.BLOCO_DANO_MORAL || c.analise_json?.caso?.tem_dano_moral) achados.add("Dano moral");
  return [...achados];
}

const CATEGORIAS = {
  vigilancia: "Vigilância",
  asseio_conservacao: "Asseio e conservação",
  limpeza: "Limpeza",
  terceirizados: "Terceirizados / portaria",
  comercio: "Comércio",
};
const rotuloCategoria = (c) => {
  const k = c.analise_json?.dadosCct?.categoria;
  if (!k) return "Não identificada";
  return CATEGORIAS[k] || k.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());
};

const DISPENSA_CURTA = {
  sem_justa_causa: "Sem justa causa",
  rescisao_indireta: "Rescisão indireta",
  nulidade_pedido_demissao: "Nulidade pedido demissão",
  reversao_justa_causa: "Reversão justa causa",
  acordo: "Acordo (484-A)",
};
const rotuloDispensa = (c) => {
  const k = c.analise_json?.caso?.tipo_dispensa || c.tipo_dispensa;
  if (!k) return "Não informado";
  return DISPENSA_CURTA[k] || TIPO_DISPENSA_LABELS[k]?.split("(")[0]?.trim() || k;
};

const nomeCurto = (nome = "") =>
  nome
    .replace(/\b(LTDA\.?|S\/?A\.?|S\.A\.?|EIRELI|ME|EPP|-)\s*$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());

function contar(lista, chave, limite) {
  const mapa = new Map();
  for (const item of lista) {
    const ks = Array.isArray(chave(item)) ? chave(item) : [chave(item)];
    for (const k of ks) if (k) mapa.set(k, (mapa.get(k) || 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, limite)
    .map(([rotulo, valor]) => ({ rotulo, valor }));
}

/** Série temporal: 7 dias (diária), 30 dias (8 semanas) ou ano (12 meses). */
function serie(casos, periodoId, agora) {
  const baldes = [];
  if (periodoId === "7d") {
    for (let i = 6; i >= 0; i--) {
      const ini = new Date(agora); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() - i);
      const fim = new Date(ini.getTime() + DIA);
      baldes.push({ ini, fim, rotulo: ini.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), titulo: ini.toLocaleDateString("pt-BR") });
    }
  } else if (periodoId === "30d") {
    const seg = new Date(agora); seg.setHours(0, 0, 0, 0);
    seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7)); // segunda-feira da semana atual
    for (let i = 7; i >= 0; i--) {
      const ini = new Date(seg.getTime() - i * 7 * DIA);
      const fim = new Date(ini.getTime() + 7 * DIA);
      const r = ini.toLocaleDateString("pt-BR", { day: "numeric", month: "numeric" });
      baldes.push({ ini, fim, rotulo: r, titulo: `Semana de ${r}` });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const ini = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
      const r = ini.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      baldes.push({ ini, fim, rotulo: r, titulo: ini.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) });
    }
  }
  return baldes.map((b) => ({
    rotulo: b.rotulo,
    titulo: b.titulo,
    valor: casos.filter((c) => { const d = dataDe(c); return d >= b.ini && d < b.fim; }).length,
  }));
}

export function calcularIndicadores(casos, periodoId = "30d", agora = new Date()) {
  const periodo = PERIODOS.find((p) => p.id === periodoId) || PERIODOS[1];
  const inicio = new Date(agora.getTime() - periodo.dias * DIA);
  const inicioAnterior = new Date(inicio.getTime() - periodo.dias * DIA);

  const noPeriodo = casos.filter((c) => dataDe(c) >= inicio);
  const anterior = casos.filter((c) => { const d = dataDe(c); return d >= inicioAnterior && d < inicio; });

  const naFila = casos.filter((c) => c.status !== "pronto");
  const maisAntiga = naFila.reduce((min, c) => (!min || dataDe(c) < min ? dataDe(c) : min), null);
  const diasMaisAntiga = maisAntiga ? Math.floor((agora - maisAntiga) / DIA) : null;

  const valores = noPeriodo.map(valorCausaEstimado).filter((v) => v > 0);
  const valorTotal = valores.reduce((s, v) => s + v, 0);

  return {
    periodo,
    naFila: naFila.length,
    diasMaisAntiga,
    revisadas: noPeriodo.filter((c) => c.status === "pronto").length,
    recebidas: noPeriodo.length,
    variacao: noPeriodo.length - anterior.length,
    valorTotal,
    valorMedio: valores.length ? valorTotal / valores.length : 0,
    serie: serie(casos, periodo.id, agora),
    pedidos: contar(noPeriodo, pedidosDoCaso, 6),
    categorias: contar(noPeriodo, rotuloCategoria, 5),
    dispensas: contar(noPeriodo, rotuloDispensa, 5),
    reclamadas: contar(noPeriodo, (c) => (c.recl1_nome ? nomeCurto(c.recl1_nome) : null), 5),
  };
}

/** R$ compacto para os cartões: R$ 2,9 mi · R$ 96 mil · R$ 850. */
export function brlCompacto(v) {
  if (!v) return "R$ 0";
  if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3) return `R$ ${Math.round(v / 1e3).toLocaleString("pt-BR")} mil`;
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}
