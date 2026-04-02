import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import {
  FileText, FilePlus, CheckCircle, TrendingUp, Scale, DollarSign,
  AlertTriangle, PackageCheck, Clock, ArrowRight, Sparkles, Activity,
  BarChart2, BookOpen, Zap, ChevronUp, ChevronDown, Calendar
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line
} from "recharts";
import { Link } from "react-router-dom";
import RecentPetitions from "../components/dashboard/RecentPetitions";
import TopTemplates from "../components/dashboard/TopTemplates";

const STATUS_COLORS = {
  rascunho: "#94a3b8",
  em_geracao: "#f59e0b",
  concluida: "#3b82f6",
  revisao_necessaria: "#ef4444",
  pronto_para_protocolo: "#10b981",
};

const STATUS_LABELS = {
  rascunho: "Rascunho",
  em_geracao: "Em Geração",
  concluida: "Aguard. Revisão",
  revisao_necessaria: "Revisão Necessária",
  pronto_para_protocolo: "Pronto p/ Protocolo",
};

const CASE_COLORS = {
  trabalhista: "#6366f1",
  civel: "#0ea5e9",
  previdenciario: "#8b5cf6",
  consumidor: "#f59e0b",
  outro: "#64748b",
};

export default function Dashboard() {
  const [petitions, setPetitions] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [p, t, u] = await Promise.all([
        base44.entities.Petition.list(),
        base44.entities.PetitionTemplate.list("-use_count", 10),
        base44.auth.me().catch(() => null),
      ]);
      setPetitions(p);
      setTemplates(t);
      setUser(u);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-muted border-t-amber-500 rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Carregando dashboard...</p>
        </div>
      </div>
    );
  }

  const total = petitions.length;
  const completed = petitions.filter((p) => p.status === "pronto_para_protocolo").length;
  const needsRevision = petitions.filter((p) => p.status === "revisao_necessaria").length;
  const awaiting = petitions.filter((p) => p.status === "concluida").length;
  const drafts = petitions.filter((p) => p.status === "rascunho").length;
  const totalValue = petitions.reduce((acc, p) => acc + (p.estimated_value || (p.salary ? p.salary * 12 : 0)), 0);
  const fmtCurrency = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const statusData = Object.entries(STATUS_LABELS).map(([key, label]) => ({
    name: label,
    value: petitions.filter((p) => p.status === key).length,
    color: STATUS_COLORS[key],
  })).filter(d => d.value > 0);

  const caseTypeData = ["trabalhista", "civel", "previdenciario", "consumidor", "outro"]
    .map((type) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      total: petitions.filter((p) => p.case_type === type).length,
      color: CASE_COLORS[type],
    }))
    .filter((d) => d.total > 0);

  const monthlyData = getMonthlyData(petitions);
  const greeting = getGreeting(user?.full_name);

  // Weekly data (last 7 days)
  const weeklyData = getWeeklyData(petitions);

  // Completion rate
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl p-8" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e293b 100%)" }}>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white/50 text-xs font-medium uppercase tracking-widest">Sistema Ativo</span>
            </div>
            <h1 className="text-3xl lg:text-4xl font-playfair font-bold text-white">{greeting}</h1>
            <p className="text-white/50 mt-2 text-sm max-w-md">
              {total === 0
                ? "Comece criando sua primeira petição com IA."
                : `${total} petição(ões) no sistema${needsRevision > 0 ? ` · ${needsRevision} aguardando revisão` : ""}${completed > 0 ? ` · ${completed} prontas para protocolo` : ""}`}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/nova-peticao"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all text-sm shrink-0 text-slate-900"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}
            >
              <Sparkles className="w-4 h-4" /> Gerar com IA
            </Link>
            <Link
              to="/peticoes"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all text-sm text-white/80 hover:text-white border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 shrink-0"
            >
              <FileText className="w-4 h-4" /> Ver Petições
            </Link>
          </div>
        </div>
        {/* Decorative */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #f59e0b, transparent)" }} />
        <div className="absolute -bottom-8 right-1/3 w-32 h-32 rounded-full opacity-5" style={{ background: "radial-gradient(circle, #3b82f6, transparent)" }} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={FileText} label="Total" value={total} sub="petições criadas"
          iconBg="bg-blue-500/10" iconColor="text-blue-500" to="/peticoes"
          trend={total > 0 ? "+100%" : null}
        />
        <KpiCard
          icon={PackageCheck} label="Prontas" value={completed} sub="para protocolo"
          iconBg="bg-emerald-500/10" iconColor="text-emerald-500" to="/peticoes"
          highlight={completed > 0}
        />
        <KpiCard
          icon={AlertTriangle} label="Revisão" value={needsRevision} sub="necessária"
          iconBg="bg-red-500/10" iconColor="text-red-500" to="/peticoes"
          alert={needsRevision > 0}
        />
        <KpiCard
          icon={Clock} label="Aguardando" value={awaiting} sub="aprovação"
          iconBg="bg-amber-500/10" iconColor="text-amber-500" to="/peticoes"
        />
      </div>

      {/* Value + Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Total Value */}
        <Link to="/peticoes" className="lg:col-span-2 block">
          <div className="h-full rounded-2xl border bg-card p-6 hover:shadow-lg transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Valor Acumulado das Causas</p>
                <p className="text-4xl font-bold mt-2 text-foreground">{fmtCurrency(totalValue)}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-amber-500" />
              </div>
            </div>
            <div className="flex gap-6 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Média por petição</p>
                <p className="text-lg font-bold mt-0.5">{total > 0 ? fmtCurrency(totalValue / total) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taxa de conclusão</p>
                <p className="text-lg font-bold mt-0.5 text-emerald-600">{completionRate}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rascunhos ativos</p>
                <p className="text-lg font-bold mt-0.5">{drafts}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Modelos ativos</p>
                <p className="text-lg font-bold mt-0.5">{templates.filter(t => t.is_active).length}</p>
              </div>
            </div>
          </div>
        </Link>

        {/* Completion Ring */}
        <div className="rounded-2xl border bg-card p-6 flex flex-col items-center justify-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-4">Progresso Geral</p>
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
              <circle
                cx="50" cy="50" r="40" fill="none"
                stroke="#10b981" strokeWidth="10"
                strokeDasharray={`${completionRate * 2.513} 251.3`}
                strokeLinecap="round"
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-foreground">{completionRate}%</span>
              <span className="text-xs text-muted-foreground">concluído</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 w-full">
            <div className="text-center p-2 rounded-xl bg-muted/50">
              <p className="text-sm font-bold text-emerald-600">{completed}</p>
              <p className="text-xs text-muted-foreground">Prontas</p>
            </div>
            <div className="text-center p-2 rounded-xl bg-muted/50">
              <p className="text-sm font-bold text-amber-600">{total - completed}</p>
              <p className="text-xs text-muted-foreground">Em andamento</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Area Chart */}
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Petições por Mês</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Volume nos últimos 12 meses</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full font-medium">
              <TrendingUp className="w-3 h-3" /> Ativo
            </div>
          </div>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }} />
                <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2.5} fill="url(#areaGrad)" dot={{ r: 4, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Nenhum dado disponível ainda" />
          )}
        </Card>

        {/* Status Donut */}
        <Card className="p-6">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Status</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Distribuição atual</p>
          </div>
          {statusData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value">
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {statusData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground truncate max-w-[110px]">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(d.value / total) * 100}%`, backgroundColor: d.color }} />
                      </div>
                      <span className="font-bold w-4 text-right">{d.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyChart message="Nenhuma petição criada" />
          )}
        </Card>
      </div>

      {/* Area Type + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <div className="mb-6">
            <h3 className="font-semibold text-foreground">Petições por Área Jurídica</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Volume por tipo de ação</p>
          </div>
          {caseTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={caseTypeData} barSize={36} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))", radius: 6 }} />
                <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                  {caseTypeData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Nenhuma petição criada" />
          )}
        </Card>

        {/* Quick Actions */}
        <Card className="p-6 flex flex-col">
          <div className="mb-4">
            <h3 className="font-semibold text-foreground">Ações Rápidas</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Acesso direto às funções</p>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <QuickAction to="/nova-peticao" icon={Sparkles} label="Nova Petição com IA" desc="Gerar automaticamente" color="bg-amber-500/10 text-amber-600" />
            <QuickAction to="/peticoes" icon={FileText} label="Minhas Petições" desc="Ver histórico completo" color="bg-blue-500/10 text-blue-600" />
            <QuickAction to="/modelos" icon={BookOpen} label="Modelos" desc="Gerenciar templates" color="bg-purple-500/10 text-purple-600" />
            <QuickAction to="/precedentes" icon={Scale} label="Precedentes" desc="Banco de jurisprudência" color="bg-emerald-500/10 text-emerald-600" />
          </div>
          {needsRevision > 0 && (
            <Link to="/peticoes" className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{needsRevision} revisão(ões) pendente(s)</p>
                <p className="text-xs opacity-70">Clique para ver</p>
              </div>
              <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentPetitions petitions={petitions.slice(0, 5)} />
        </div>
        <TopTemplates templates={templates} />
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, iconBg, iconColor, to, highlight, alert, trend }) {
  return (
    <Link to={to || "/peticoes"} className="block group">
      <Card className={`p-5 hover:shadow-lg transition-all cursor-pointer border ${alert && value > 0 ? "border-red-200 bg-red-50/30" : highlight && value > 0 ? "border-emerald-200 bg-emerald-50/30" : ""}`}>
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          {trend && (
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5">
              <ChevronUp className="w-3 h-3" />{trend}
            </span>
          )}
        </div>
        <p className="text-3xl font-bold text-foreground">{value}</p>
        <p className="text-sm font-medium text-foreground/80 mt-0.5">{label}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          {sub}
          <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity ml-auto" />
        </p>
      </Card>
    </Link>
  );
}

function QuickAction({ to, icon: Icon, label, desc, color }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors group border border-transparent hover:border-border">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}

function EmptyChart({ message }) {
  return (
    <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
      <BarChart2 className="w-8 h-8 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function getMonthlyData(petitions) {
  const months = {};
  petitions.forEach((p) => {
    const date = new Date(p.created_date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    if (!months[key]) months[key] = { month: label, total: 0 };
    months[key].total++;
  });
  return Object.values(months).slice(-12);
}

function getWeeklyData(petitions) {
  const days = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("pt-BR", { weekday: "short" });
    days[key] = { day: label, total: 0 };
  }
  petitions.forEach((p) => {
    const key = new Date(p.created_date).toISOString().split("T")[0];
    if (days[key]) days[key].total++;
  });
  return Object.values(days);
}

function getGreeting(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return name ? `${part}, ${name.split(" ")[0]}!` : `${part}!`;
}