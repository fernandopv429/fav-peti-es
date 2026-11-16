// ============================================================
// Indicadores do painel Início. SOMENTE LEITURA: agrega os casos de webhook
// já carregados (CasoTrabalhista) para exibição. Nada aqui altera dados ou
// participa da geração das petições.
// ============================================================
import { TIPO_DISPENSA_LABELS } from "@/features/entrevista/lib/tokens";
import { pendenciasDaPeca } from "@/features/entrevista/components/SeloCompletude";

const DIA = 24 * 60 * 60 * 1000;
export const DIAS_ALERTA = 5; // âmbar a partir de 5 dias na fila
export const DIAS_CRITICO = 7; // vermelho a partir de 7

export const PERIODOS = [
  { id: "7d", rotulo: "7d", dias: 7 },
  { id: "30d", rotulo: "30d", dias: 30 },
  { id: "ano", rotulo: "Ano", dias: 365 },
];

// O banco devolve as datas em UTC SEM o "Z" ("2026-11-16T18:49:15"); lidas
// assim, o navegador as trataria como hora local e um caso de hoje apareceria
// "no futuro" (−1 dia). O "Z" restaura o fuso correto.
const lerData = (s) => {
  if (!s) return new Date(NaN);
  return new Date(typeof s === "string" && !/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? `${s}Z` : s);
};
const dataDe = (c) => lerData(c.created_date);
// O caso não guarda a data da revisão; a última alteração é a melhor aproximação.
const dataRevisao = (c) => lerData(c.updated_date || c.created_date);
const diasDesde = (d, agora) => Math.max(0, Math.floor((agora - d) / DIA));

const ehHonorario = (item) => /^Honor[aá]rios/i.test(item?.item || "");

/** Valor da causa ESTIMADO: soma dos pedidos sem honorários nem subsidiários. */
export function valorCausaEstimado(c) {
  return (c.analise_json?.calculos || []).reduce((soma, item) => {
    if (!item || item.valor == null || ehHonorario(item) || item.foraDaCausa) return soma;
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

/** { pedido: valor somado } de um caso (reflexos somam no pedido principal). */
function pedidosDoCaso(c) {
  const mapa = new Map();
  for (const item of c.analise_json?.calculos || []) {
    if (!item || item.foraDaCausa || ehHonorario(item)) continue;
    const nome = (item.item || "").replace(/^Reflexos de\s+/i, "");
    const hit = PEDIDOS.find(([, rx]) => rx.test(nome));
    if (hit) mapa.set(hit[0], (mapa.get(hit[0]) || 0) + (Number(item.valor) || 0));
  }
  if (!mapa.has("Dano moral") && (c.analise_json?.blocos?.BLOCO_DANO_MORAL || c.analise_json?.caso?.tem_dano_moral)) {
    mapa.set("Dano moral", 0);
  }
  return mapa;
}

// Cor fixa por categoria (a cor segue a categoria, nunca a posição no ranking).
const CATEGORIAS = {
  vigilancia: { rotulo: "Vigilância", cor: "#141414" },
  asseio_conservacao: { rotulo: "Asseio e conservação", cor: "#f2a900" },
  limpeza: { rotulo: "Limpeza", cor: "#f2a900" },
  terceirizados: { rotulo: "Terceirizados / portaria", cor: "#8c8c8c" },
};
const OUTRAS = { rotulo: "Outras", cor: "#cfcac0" };
const SEM_CATEGORIA = { rotulo: "Não identificada", cor: "#e6e2d9" };
const categoriaDe = (c) => {
  const k = c.analise_json?.dadosCct?.categoria;
  if (!k) return SEM_CATEGORIA;
  return CATEGORIAS[k] || OUTRAS;
};

const DISPENSA_CURTA = {
  sem_justa_causa: "Sem justa causa",
  rescisao_indireta: "Rescisão indireta",
  nulidade_pedido_demissao: "Nulidade do pedido de demissão",
  reversao_justa_causa: "Reversão da justa causa",
  acordo: "Acordo (484-A)",
};
const rotuloDispensa = (c) => {
  const k = c.analise_json?.caso?.tipo_dispensa || c.tipo_dispensa;
  if (!k) return "Não informado";
  return DISPENSA_CURTA[k] || TIPO_DISPENSA_LABELS[k]?.split("(")[0]?.trim() || k;
};

export const nomeCurto = (nome = "") =>
  nome
    .replace(/\b(LTDA\.?|S\/?A\.?|S\.A\.?|EIRELI|ME|EPP|-)\s*$/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (m) => m.toUpperCase());

/** Peça sem nenhum trecho "[...]" pendente. Erros de leitura contam como pendência. */
function pendenciasSeguras(c) {
  try {
    return c.analise_json?.caso ? pendenciasDaPeca(c.analise_json).length : null;
  } catch {
    return null;
  }
}

/** Baldes de tempo: 7 dias (diário), 30 dias (8 semanas) ou ano (12 meses). */
function baldes(periodoId, agora) {
  const lista = [];
  if (periodoId === "7d") {
    for (let i = 6; i >= 0; i--) {
      const ini = new Date(agora); ini.setHours(0, 0, 0, 0); ini.setDate(ini.getDate() - i);
      lista.push({ ini, fim: new Date(ini.getTime() + DIA), rotulo: ini.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), titulo: ini.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "numeric" }) });
    }
  } else if (periodoId === "30d") {
    const seg = new Date(agora); seg.setHours(0, 0, 0, 0);
    seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
    for (let i = 7; i >= 0; i--) {
      const ini = new Date(seg.getTime() - i * 7 * DIA);
      const r = ini.toLocaleDateString("pt-BR", { day: "numeric", month: "numeric" });
      lista.push({ ini, fim: new Date(ini.getTime() + 7 * DIA), rotulo: r, titulo: `Semana de ${r}` });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const ini = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
      lista.push({ ini, fim, rotulo: ini.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), titulo: ini.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) });
    }
  }
  return lista;
}

export function calcularIndicadores(casos, periodoId = "30d", agora = new Date()) {
  const periodo = PERIODOS.find((p) => p.id === periodoId) || PERIODOS[1];
  const inicio = new Date(agora.getTime() - periodo.dias * DIA);
  const inicioAnterior = new Date(inicio.getTime() - periodo.dias * DIA);

  const noPeriodo = casos.filter((c) => dataDe(c) >= inicio);
  const anterior = casos.filter((c) => { const d = dataDe(c); return d >= inicioAnterior && d < inicio; });
  const revisadasNoPeriodo = noPeriodo.filter((c) => c.status === "pronto");

  // Fila e casos parados
  const naFila = casos.filter((c) => c.status !== "pronto")
    .map((c) => ({ caso: c, dias: diasDesde(dataDe(c), agora) }))
    .sort((a, b) => b.dias - a.dias);
  const atrasados = naFila.filter((f) => f.dias >= DIAS_ALERTA).length;

  // Completude da peça (mesma regra do selo da fila)
  const pend = new Map();
  for (const c of [...noPeriodo, ...naFila.slice(0, 6).map((f) => f.caso)]) {
    if (!pend.has(c.id)) pend.set(c.id, pendenciasSeguras(c));
  }
  const geradosNoPeriodo = noPeriodo.filter((c) => c.status !== "em_analise");
  const completasLista = geradosNoPeriodo.filter((c) => pend.get(c.id) === 0);
  const pendentesLista = geradosNoPeriodo.filter((c) => (pend.get(c.id) || 0) > 0 && c.status !== "pronto");

  // Valores
  const valores = noPeriodo.map(valorCausaEstimado);
  const valorTotal = valores.reduce((s, v) => s + v, 0);
  const comValor = valores.filter((v) => v > 0).length;

  // Séries por balde
  const bs = baldes(periodo.id, agora);
  const dentro = (d, b) => d >= b.ini && d < b.fim;
  const serie = bs.map((b) => ({
    rotulo: b.rotulo,
    titulo: b.titulo,
    casos: casos.filter((c) => dentro(dataDe(c), b)),
    recebidas: casos.filter((c) => dentro(dataDe(c), b)).length,
    revisadas: casos.filter((c) => c.status === "pronto" && dentro(dataRevisao(c), b)).length,
    valor: casos.filter((c) => dentro(dataDe(c), b)).reduce((s, c) => s + valorCausaEstimado(c), 0),
    // Fila ao fim do balde: chegou antes e ainda não estava revisado.
    fila: casos.filter((c) => dataDe(c) < b.fim && (c.status !== "pronto" || dataRevisao(c) >= b.fim)).length,
  }));

  // Pedidos: casos + valor somado
  const pedidos = new Map();
  for (const c of noPeriodo) {
    for (const [nome, valor] of pedidosDoCaso(c)) {
      const p = pedidos.get(nome) || { rotulo: nome, casos: 0, valor: 0, lista: [] };
      p.casos += 1; p.valor += valor; p.lista.push(c);
      pedidos.set(nome, p);
    }
  }

  // Categorias (barra única) e dispensas
  const cats = new Map();
  for (const c of noPeriodo) {
    const k = categoriaDe(c);
    const it = cats.get(k.rotulo) || { ...k, valor: 0, lista: [] };
    it.valor += 1; it.lista.push(c);
    cats.set(k.rotulo, it);
  }
  const disp = new Map();
  for (const c of noPeriodo) {
    const k = rotuloDispensa(c);
    disp.set(k, [...(disp.get(k) || []), c]);
  }

  // Reclamadas: casos + valor
  const recl = new Map();
  for (const c of noPeriodo) {
    if (!c.recl1_nome) continue;
    const nome = nomeCurto(c.recl1_nome);
    const r = recl.get(nome) || { rotulo: nome, casos: 0, valor: 0, lista: [] };
    r.casos += 1; r.valor += valorCausaEstimado(c); r.lista.push(c);
    recl.set(nome, r);
  }

  const ordenar = (m, k) => [...m.values()].sort((a, b) => b[k] - a[k] || b.valor - a.valor);

  return {
    periodo,
    // Listas para o detalhamento (clique nos cartões)
    listas: {
      naFila: naFila.map((f) => f.caso),
      atrasados: naFila.filter((f) => f.dias >= DIAS_ALERTA).map((f) => f.caso),
      recebidas: noPeriodo,
      revisadas: revisadasNoPeriodo,
      porValor: [...noPeriodo].sort((a, b) => valorCausaEstimado(b) - valorCausaEstimado(a)),
      pendentes: pendentesLista,
    },
    pendencias: pend,
    naFila: naFila.length,
    atrasados,
    recebidas: noPeriodo.length,
    variacao: noPeriodo.length - anterior.length,
    revisadas: revisadasNoPeriodo.length,
    taxaRevisao: noPeriodo.length ? Math.round((revisadasNoPeriodo.length / noPeriodo.length) * 100) : 0,
    valorTotal,
    valorMedio: comValor ? valorTotal / comValor : 0,
    serie,
    funil: [
      { rotulo: "Recebidas", valor: noPeriodo.length, cor: "bg-foreground", lista: noPeriodo },
      { rotulo: "Peça completa", valor: completasLista.length, cor: "bg-foreground/75", lista: completasLista },
      { rotulo: "Revisadas", valor: revisadasNoPeriodo.length, cor: "bg-primary", lista: revisadasNoPeriodo },
    ],
    comPendencias: pendentesLista.length,
    atencao: naFila.slice(0, 5).map((f) => ({
      id: f.caso.id,
      nome: f.caso.recl_nome || f.caso.titulo || "(sem nome)",
      reclamada: f.caso.recl1_nome ? nomeCurto(f.caso.recl1_nome) : "—",
      dias: f.dias,
      gerando: f.caso.status === "em_analise",
      pendencias: pend.get(f.caso.id) || 0,
    })),
    pedidos: ordenar(pedidos, "casos").slice(0, 6),
    categorias: [...cats.values()].sort((a, b) => b.valor - a.valor),
    dispensas: [...disp.entries()].sort((a, b) => b[1].length - a[1].length).map(([rotulo, lista]) => ({ rotulo, valor: lista.length, lista })),
    reclamadas: ordenar(recl, "casos").slice(0, 5),
  };
}

/** R$ compacto: R$ 2,9 mi · R$ 96 mil · R$ 850. */
export function brlCompacto(v) {
  if (!v) return "R$ 0";
  if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1e3) return `R$ ${Math.round(v / 1e3).toLocaleString("pt-BR")} mil`;
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}
