import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from "recharts";
import { FileText, Clock, CheckCircle2, DollarSign, TrendingUp, BarChart2 } from "lucide-react";

// ── Período ───────────────────────────────────────────────────────────────────
const PERIODOS = [
  { value: "mes",  label: "Este mês" },
  { value: "3m",   label: "Últimos 3 meses" },
  { value: "ano",  label: "Este ano" },
  { value: "tudo", label: "Tudo" },
];

function getDataCorte(periodo) {
  const now = new Date();
  if (periodo === "mes")  return new Date(now.getFullYear(), now.getMonth(), 1);
  if (periodo === "3m")   return new Date(now.getFullYear(), now.getMonth() - 3, 1);
  if (periodo === "ano")  return new Date(now.getFullYear(), 0, 1);
  return null;
}

// ── Labels amigáveis ──────────────────────────────────────────────────────────
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
  dispensa_sem_justa_causa: "Dispensa s/ Justa Causa",
  rescisao_indireta: "Rescisão Indireta",
  reversao_justa_causa: "Reversão Justa Causa",
  pedido_demissao: "Pedido de Demissão",
};

const COLORS = ["#C5972F", "#2F7EC5", "#2FC572", "#C52F2F", "#8B2FC5", "#2FC5C5", "#C5742F"];

function parseMoney(str) {
  if (!str) return 0;
  const n = parseFloat(String(str).replace(/[^\d,.-]/g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color = "text-primary", sub }) {
  return (
    <Card className="p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-primary/10`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

// ── Chart wrapper ─────────────────────────────────────────────────────────────
function ChartCard({ title, children, empty }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {empty
        ? <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Sem dados no período</div>
        : children
      }
    </Card>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

export default function Analise() {
  const [periodo, setPeriodo] = useState("tudo");
  const [petitions, setPetitions] = useState([]);
  const [casos, setCasos] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Petition.list("-created_date", 1000).catch(() => []),
      base44.entities.CasoVigilante.list("-created_date", 1000).catch(() => []),
      base44.entities.PetitionTemplate.list().catch(() => []),
    ]).then(([p, c, t]) => {
      setPetitions(p || []);
      setCasos(c || []);
      setTemplates(t || []);
      setLoading(false);
    });
  }, []);

  // ── Filtro por período ────────────────────────────────────────────────────
  const corte = getDataCorte(periodo);
  const filtrar = (lista) => {
    if (!corte) return lista;
    return lista.filter(item => item.created_date && new Date(item.created_date) >= corte);
  };

  const pet = useMemo(() => filtrar(petitions), [petitions, periodo]);
  const cas = useMemo(() => filtrar(casos), [casos, periodo]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const total = pet.length;
  const pendentes = pet.filter(p => p.status === "revisao_necessaria").length;
  const prontas = pet.filter(p => p.status === "pronto_para_protocolo").length;
  const valorTotal = pet.reduce((acc, p) => acc + (p.estimated_value || 0), 0)
    + cas.reduce((acc, c) => acc + parseMoney(c.VALOR_CAUSA), 0);
  const ticketMedio = total > 0 ? valorTotal / total : 0;

  const fmt = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  // ── Bloco 2: por status ───────────────────────────────────────────────────
  const porStatus = useMemo(() => {
    const map = {};
    pet.forEach(p => { map[p.status] = (map[p.status] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: STATUS_LABELS[k] || k, total: v }));
  }, [pet]);

  // ── Bloco 3: por tipo de ação ─────────────────────────────────────────────
  const porTipo = useMemo(() => {
    const map = {};
    pet.forEach(p => { const k = p.case_type || "outro"; map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: CASE_LABELS[k] || k, value: v }));
  }, [pet]);

  // ── Bloco 4: por tipo de rescisão ─────────────────────────────────────────
  const porRescisao = useMemo(() => {
    const map = {};
    cas.forEach(c => { if (c.TIPO_RESCISAO) map[c.TIPO_RESCISAO] = (map[c.TIPO_RESCISAO] || 0) + 1; });
    return Object.entries(map).map(([k, v]) => ({ name: RESCISAO_LABELS[k] || k, total: v }));
  }, [cas]);

  // ── Bloco 5: modelos mais usados ──────────────────────────────────────────
  const porModelo = useMemo(() => {
    // conta petições por template_used
    const map = {};
    pet.forEach(p => { if (p.template_used) map[p.template_used] = (map[p.template_used] || 0) + 1; });
    // resolve nomes
    const templateMap = {};
    templates.forEach(t => { templateMap[t.id] = t.name; });
    return Object.entries(map)
      .map(([k, v]) => ({ name: templateMap[k] || k, total: v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [pet, templates]);

  // ── Bloco 6: teses vigilante ──────────────────────────────────────────────
  const tesesVigilante = useMemo(() => {
    const n = cas.length;
    if (n === 0) return [];
    const sub = cas.filter(c => c.tem_subsidiaria).length;
    const desv = cas.filter(c => c.tem_desvio).length;
    const noturno = cas.filter(c => c.tem_adic_noturno).length;
    return [
      { name: "Resp. Subsidiária", pct: Math.round((sub / n) * 100), count: sub },
      { name: "Desvio de Função", pct: Math.round((desv / n) * 100), count: desv },
      { name: "Adicional Noturno", pct: Math.round((noturno / n) * 100), count: noturno },
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
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([k, v]) => {
        const [y, m] = k.split("-");
        const mes = new Date(Number(y), Number(m) - 1).toLocaleString("pt-BR", { month: "short", year: "2-digit" });
        return { mes, total: v };
      });
  }, [petitions]);

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
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                periodo === p.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bloco 1: KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total de iniciais" value={total} icon={FileText} />
        <KpiCard label="Pendentes revisão" value={pendentes} icon={Clock} color="text-red-500" />
        <KpiCard label="Prontas protocolo" value={prontas} icon={CheckCircle2} color="text-green-500" />
        <KpiCard label="Valor total" value={valorTotal > 0 ? fmt(valorTotal) : "—"} icon={DollarSign} color="text-amber-500" />
        <KpiCard label="Ticket médio" value={ticketMedio > 0 ? fmt(ticketMedio) : "—"} icon={TrendingUp} color="text-blue-500"
          sub={total > 0 ? `${total} petição(ões)` : undefined} />
      </div>

      {/* Bloco 2 + 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Petições por Status" empty={porStatus.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porStatus} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
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
              <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
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
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${t.pct}%` }}
                />
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
    </div>
  );
}