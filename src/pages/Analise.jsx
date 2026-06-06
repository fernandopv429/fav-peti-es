import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, ComposedChart, Area,
} from "recharts";
import {
  FileText, Clock, CheckCircle2, DollarSign, TrendingUp, TrendingDown,
  AlertTriangle, ArrowUpRight, ArrowDownRight, Minus, Users, AlertCircle,
  ExternalLink,
} from "lucide-react";

// ── Período ───────────────────────────────────────────────────────────────────
const PERIODOS = [
  { value: "mes",  label: "Este mês" },
  { value: "3m",   label: "Últimos 3 meses" },
  { value: "ano",  label: "Este ano" },
  { value: "tudo", label: "Tudo" },
];

function getCorte(periodo) {
  const now = new Date();
  if (periodo === "mes") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (periodo === "3m")  return new Date(now.getFullYear(), now.getMonth() - 3, 1);
  if (periodo === "ano") return new Date(now.getFullYear(), 0, 1);
  return null;
}

function getCorteAnterior(periodo) {
  const now = new Date();
  if (periodo === "mes") {
    const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
    const fim = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { de: fim, ate: inicio };
  }
  if (periodo === "3m") {
    const inicio = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const fim = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    return { de: fim, ate: inicio };
  }
  if (periodo === "ano") {
    return {
      de: new Date(now.getFullYear() - 1, 0, 1),
      ate: new Date(now.getFullYear(), 0, 1),
    };
  }
  return null;
}

// ── Labels ────────────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  rascunho: "Rascunho",
  em_geracao: "Em Geração",
  concluida: "Concluída",
  revisao_necessaria: "Revisão Nec.",
  pronto_para_protocolo: "Pronto Protocolo",
};
const CASE_LABELS = {
  trabalhista: "Trabalhista", civel: "Cível",
  previdenciario: "Previdenciário", consumidor: "Consumidor", outro: "Outro",
};
const RESCISAO_LABELS = {
  dispensa_sem_justa_causa: "Dispensa s/ JC",
  rescisao_indireta: "Rescisão Indireta",
  reversao_justa_causa: "Reversão JC",
  pedido_demissao: "Ped. Demissão",
};

const COLORS = ["#C5972F", "#2F7EC5", "#2FC572", "#C52F2F", "#8B2FC5", "#2FC5C5", "#C5742F"];

function parseMoney(str) {
  if (!str) return 0;
  const n = parseFloat(String(str).replace(/[^\d,.-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function daysDiff(date) {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

const fmt = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// ── Variação ──────────────────────────────────────────────────────────────────
function Variacao({ atual, anterior }) {
  if (anterior === null || anterior === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  if (anterior === 0 && atual === 0) return <span className="text-xs text-muted-foreground">—</span>;
  if (anterior === 0) return <span className="text-xs text-green-500 flex items-center gap-0.5"><ArrowUpRight className="w-3 h-3" />Novo</span>;
  const pct = Math.round(((atual - anterior) / anterior) * 100);
  if (pct === 0) return <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Minus className="w-3 h-3" />0%</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs flex items-center gap-0.5 ${up ? "text-green-500" : "text-red-500"}`}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color = "text-primary", sub, onClick, variacao, alert }) {
  return (
    <Card
      onClick={onClick}
      className={`p-5 flex items-start gap-4 ${onClick ? "cursor-pointer hover:border-primary/50 hover:shadow-md transition-all" : ""} ${alert ? "border-red-300 bg-red-50/30 dark:bg-red-950/20" : ""}`}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-primary/10">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {variacao !== undefined && <Variacao atual={variacao.atual} anterior={variacao.anterior} />}
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </div>
      {onClick && <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-1" />}
    </Card>
  );
}

// ── Chart Card ────────────────────────────────────────────────────────────────
function ChartCard({ title, children, empty, badge }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {badge}
      </div>
      {empty
        ? <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sem dados no período</div>
        : children
      }
    </Card>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.stroke }}>{p.name}: <strong>{p.value?.toLocaleString("pt-BR")}</strong></p>
      ))}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
export default function Analise() {
  const navigate = useNavigate();
  const [periodo, setPeriodo] = useState("tudo");
  const [petitions, setPetitions] = useState([]);
  const [casos, setCasos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Petition.list("-created_date", 1000).catch(() => []),
      base44.entities.CasoVigilante.list("-created_date", 1000).catch(() => []),
      base44.entities.PetitionTemplate.list().catch(() => []),
      base44.entities.GenerationLog.list("-created_date", 500).catch(() => []),
    ]).then(([p, c, t, l]) => {
      setPetitions(p || []);
      setCasos(c || []);
      setTemplates(t || []);
      setLogs(l || []);
      setLoading(false);
    });
  }, []);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const corte = useMemo(() => getCorte(periodo), [periodo]);
  const corteAnt = useMemo(() => getCorteAnterior(periodo), [periodo]);

  const filtrar = (lista) => !corte ? lista : lista.filter(i => i.created_date && new Date(i.created_date) >= corte);
  const filtrarAnt = (lista) => {
    if (!corteAnt) return null;
    return lista.filter(i => i.created_date && new Date(i.created_date) >= corteAnt.de && new Date(i.created_date) < corteAnt.ate);
  };

  const pet    = useMemo(() => filtrar(petitions), [petitions, periodo]);
  const petAnt = useMemo(() => filtrarAnt(petitions), [petitions, periodo]);
  const cas    = useMemo(() => filtrar(casos), [casos, periodo]);
  const casAnt = useMemo(() => filtrarAnt(casos), [casos, periodo]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const total     = pet.length;
  const totalAnt  = petAnt?.length ?? null;
  const pendentes = pet.filter(p => p.status === "revisao_necessaria").length;
  const pendAnt   = petAnt?.filter(p => p.status === "revisao_necessaria").length ?? null;
  const prontas   = pet.filter(p => p.status === "pronto_para_protocolo").length;
  const prontAnt  = petAnt?.filter(p => p.status === "pronto_para_protocolo").length ?? null;

  const valorTotal    = pet.reduce((a, p) => a + (p.estimated_value || 0), 0)
                       + cas.reduce((a, c) => a + parseMoney(c.VALOR_CAUSA), 0);
  const valorAnt      = petAnt && casAnt
    ? petAnt.reduce((a, p) => a + (p.estimated_value || 0), 0) + casAnt.reduce((a, c) => a + parseMoney(c.VALOR_CAUSA), 0)
    : null;
  const ticketMedio   = total > 0 ? valorTotal / total : 0;
  const ticketAnt     = (petAnt && petAnt.length > 0 && valorAnt !== null) ? valorAnt / petAnt.length : null;

  // ── Paradas >7 dias ───────────────────────────────────────────────────────
  const paradas = useMemo(() =>
    pet.filter(p => p.status === "revisao_necessaria" && daysDiff(p.updated_date || p.created_date) > 7),
  [pet]);

  // ── Bloco 2: por status ───────────────────────────────────────────────────
  const porStatus = useMemo(() => {
    const map = {};
    pet.forEach(p => { map[p.status] = (map[p.status] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: STATUS_LABELS[k] || k, total: v }));
  }, [pet]);

  // ── Bloco 3: por tipo ────────────────────────────────────────────────────
  const porTipo = useMemo(() => {
    const map = {};
    pet.forEach(p => { const k = p.case_type || "outro"; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: CASE_LABELS[k] || k, value: v }));
  }, [pet]);

  // ── Bloco 4: por rescisão ─────────────────────────────────────────────────
  const porRescisao = useMemo(() => {
    const map = {};
    cas.forEach(c => { if (c.TIPO_RESCISAO) map[c.TIPO_RESCISAO] = (map[c.TIPO_RESCISAO] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: RESCISAO_LABELS[k] || k, total: v }));
  }, [cas]);

  // ── Bloco 5: modelos ──────────────────────────────────────────────────────
  const porModelo = useMemo(() => {
    const map = {};
    pet.forEach(p => { if (p.template_used) map[p.template_used] = (map[p.template_used] || 0) + 1; });
    const tmplMap = {};
    templates.forEach(t => { tmplMap[t.id] = t.name; });
    return Object.entries(map)
      .map(([k, v]) => ({ name: tmplMap[k] || k.slice(0, 20), total: v }))
      .sort((a, b) => b.total - a.total).slice(0, 8);
  }, [pet, templates]);

  // ── Bloco 6: teses vigilante ──────────────────────────────────────────────
  const tesesVigilante = useMemo(() => {
    const n = cas.length;
    if (n === 0) return [];
    return [
      { name: "Resp. Subsidiária", pct: Math.round((cas.filter(c => c.tem_subsidiaria).length / n) * 100), count: cas.filter(c => c.tem_subsidiaria).length },
      { name: "Desvio de Função",  pct: Math.round((cas.filter(c => c.tem_desvio).length / n) * 100), count: cas.filter(c => c.tem_desvio).length },
      { name: "Adicional Noturno", pct: Math.round((cas.filter(c => c.tem_adic_noturno).length / n) * 100), count: cas.filter(c => c.tem_adic_noturno).length },
    ];
  }, [cas]);

  // ── Bloco 7: evolução mensal ──────────────────────────────────────────────
  const evolucao = useMemo(() => {
    const map = {};
    petitions.forEach(p => {
      if (!p.created_date) return;
      const d = new Date(p.created_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
      .map(([k, v]) => {
        const [y, m] = k.split("-");
        return { mes: new Date(+y, +m - 1).toLocaleString("pt-BR", { month: "short", year: "2-digit" }), total: v };
      });
  }, [petitions]);

  // ── NOVO: Financeiro por rescisão ─────────────────────────────────────────
  const financeiroPorRescisao = useMemo(() => {
    const map = {};
    cas.forEach(c => {
      const k = RESCISAO_LABELS[c.TIPO_RESCISAO] || (c.TIPO_RESCISAO ? c.TIPO_RESCISAO : "Sem tipo");
      map[k] = (map[k] || 0) + parseMoney(c.VALOR_CAUSA);
    });
    return Object.entries(map).map(([k, v]) => ({ name: k, valor: Math.round(v) })).sort((a, b) => b.valor - a.valor);
  }, [cas]);

  // ── NOVO: Financeiro por mês ──────────────────────────────────────────────
  const financeiroPorMes = useMemo(() => {
    const map = {};
    petitions.forEach(p => {
      if (!p.created_date || !p.estimated_value) return;
      const d = new Date(p.created_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map[k] = (map[k] || 0) + (p.estimated_value || 0);
    });
    casos.forEach(c => {
      if (!c.created_date || !c.VALOR_CAUSA) return;
      const d = new Date(c.created_date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map[k] = (map[k] || 0) + parseMoney(c.VALOR_CAUSA);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
      .map(([k, v]) => {
        const [y, m] = k.split("-");
        return { mes: new Date(+y, +m - 1).toLocaleString("pt-BR", { month: "short", year: "2-digit" }), valor: Math.round(v) };
      });
  }, [petitions, casos]);

  // ── NOVO: Por advogado ────────────────────────────────────────────────────
  const porAdvogado = useMemo(() => {
    const map = {};
    // usa generated_by dos GenerationLog vinculados ao período
    const logsNoPeriodo = !corte ? logs : logs.filter(l => l.generated_at && new Date(l.generated_at) >= corte);
    logsNoPeriodo.forEach(l => {
      const nome = l.generated_by || "Desconhecido";
      map[nome] = (map[nome] || 0) + 1;
    });
    // fallback: petições por created_by_id
    if (Object.keys(map).length === 0) {
      pet.forEach(p => {
        const k = p.created_by_id || "Desconhecido";
        map[k] = (map[k] || 0) + 1;
      });
    }
    return Object.entries(map).map(([k, v]) => ({ nome: k, total: v })).sort((a, b) => b.total - a.total);
  }, [pet, logs, corte]);

  // ── NOVO: Casos incompletos ───────────────────────────────────────────────
  const casosIncompletos = useMemo(() => {
    return casos.filter(c =>
      !c.TIPO_RESCISAO || !c.VALOR_CAUSA || !c.RECL_NOME
    ).map(c => {
      const pendencias = [];
      if (!c.TIPO_RESCISAO) pendencias.push("Tipo de rescisão");
      if (!c.VALOR_CAUSA) pendencias.push("Valor da causa");
      if (!c.RECL_NOME) pendencias.push("Nome do reclamante");
      return { ...c, pendencias };
    });
  }, [casos]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-64">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header + Filtro */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-playfair font-bold">Painel / Análise</h1>
          <p className="text-muted-foreground mt-1">Indicadores das iniciais e petições geradas</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {PERIODOS.map(p => (
            <button key={p.value} onClick={() => setPeriodo(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                periodo === p.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alerta de paradas */}
      {paradas.length > 0 && (
        <div
          onClick={() => navigate("/peticoes")}
          className="flex items-center gap-3 p-4 rounded-xl border border-red-300 bg-red-50/50 dark:bg-red-950/20 cursor-pointer hover:bg-red-100/50 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              {paradas.length} petição(ões) paradas há mais de 7 dias em "Revisão Necessária"
            </p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-0.5">
              {paradas.map(p => p.title || p.claimant_name || p.id).slice(0, 3).join(", ")}
              {paradas.length > 3 ? ` e mais ${paradas.length - 3}...` : ""}
            </p>
          </div>
          <ExternalLink className="w-4 h-4 text-red-400 shrink-0" />
        </div>
      )}

      {/* Bloco 1: KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total de iniciais" value={total} icon={FileText}
          variacao={{ atual: total, anterior: totalAnt }}
          onClick={() => navigate("/peticoes")} />
        <KpiCard label="Pendentes revisão" value={pendentes} icon={Clock} color="text-red-500"
          variacao={{ atual: pendentes, anterior: pendAnt }}
          alert={paradas.length > 0}
          sub={paradas.length > 0 ? `⚠ ${paradas.length} paradas >7d` : undefined}
          onClick={() => navigate("/peticoes")} />
        <KpiCard label="Prontas protocolo" value={prontas} icon={CheckCircle2} color="text-green-500"
          variacao={{ atual: prontas, anterior: prontAnt }}
          onClick={() => navigate("/peticoes")} />
        <KpiCard label="Valor total" value={valorTotal > 0 ? fmt(valorTotal) : "—"} icon={DollarSign} color="text-amber-500"
          variacao={valorAnt !== null ? { atual: valorTotal, anterior: valorAnt } : undefined} />
        <KpiCard label="Ticket médio" value={ticketMedio > 0 ? fmt(ticketMedio) : "—"} icon={TrendingUp} color="text-blue-500"
          variacao={ticketAnt !== null ? { atual: ticketMedio, anterior: ticketAnt } : undefined}
          sub={total > 0 ? `${total} petição(ões)` : undefined} />
      </div>

      {/* Bloco 2 + 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Petições por Status" empty={porStatus.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porStatus} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Qtd" radius={[4, 4, 0, 0]}>
                {porStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Petições por Tipo de Ação" empty={porTipo.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={porTipo} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={75} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                labelLine={false}>
                {porTipo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Bloco 4 + 5 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Casos Vigilante por Tipo de Rescisão" empty={porRescisao.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porRescisao} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Qtd" radius={[0, 4, 4, 0]}>
                {porRescisao.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Modelos Mais Utilizados" empty={porModelo.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porModelo} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Usos" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Bloco 6: Teses Vigilante */}
      <ChartCard title="Teses Mais Frequentes — Vigilante 12x36" empty={tesesVigilante.length === 0}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {tesesVigilante.map((t) => (
            <div key={t.name} className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{t.name}</span>
                <span className="text-muted-foreground text-xs">{t.count} de {cas.length}</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${t.pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground text-right">{t.pct}%</p>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* Bloco 7: Evolução mensal */}
      <ChartCard title="Evolução Mensal de Iniciais Geradas (últimos 12 meses)" empty={evolucao.length === 0}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={evolucao} margin={{ left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="total" name="Iniciais" stroke={COLORS[0]}
              strokeWidth={2.5} dot={{ r: 4, fill: COLORS[0] }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* NOVO: Financeiro — valor por rescisão + por mês */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Valor da Causa por Tipo de Rescisão (R$)" empty={financeiroPorRescisao.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={financeiroPorRescisao} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<CustomTooltip />} formatter={v => fmt(v)} />
              <Bar dataKey="valor" name="Valor" fill={COLORS[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Valor da Causa por Mês (R$)" empty={financeiroPorMes.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={financeiroPorMes} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip content={<CustomTooltip />} formatter={v => fmt(v)} />
              <Area type="monotone" dataKey="valor" name="Valor" fill={`${COLORS[0]}30`} stroke={COLORS[0]} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* NOVO: Por advogado */}
      <ChartCard title="Iniciais por Usuário / Advogado" empty={porAdvogado.length === 0}
        badge={<span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{porAdvogado.length} usuário(s)</span>}>
        {porAdvogado.length === 1 ? (
          <div className="flex items-center gap-4 py-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{porAdvogado[0].nome}</p>
              <p className="text-muted-foreground text-sm">{porAdvogado[0].total} iniciai(s) gerada(s)</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, porAdvogado.length * 40)}>
            <BarChart data={porAdvogado} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
              <YAxis dataKey="nome" type="category" width={140} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Iniciais" fill={COLORS[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* NOVO: Qualidade / pendências */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Casos Incompletos — Qualidade dos Dados</h3>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${casosIncompletos.length > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"}`}>
            {casosIncompletos.length === 0 ? "✓ Tudo completo" : `${casosIncompletos.length} pendente(s)`}
          </span>
        </div>
        {casosIncompletos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todos os casos Vigilante têm dados completos.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {casosIncompletos.map(c => (
              <div key={c.id}
                onClick={() => navigate("/gerar")}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-200/60 bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-100/50 cursor-pointer transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{c.titulo || c.RECL_NOME || c.id}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Pendente: {c.pendencias.join(" · ")}
                  </p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}