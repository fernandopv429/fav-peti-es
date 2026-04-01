import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { FileText, FilePlus, CheckCircle, TrendingUp, Scale, DollarSign, AlertTriangle, PackageCheck, Clock, ArrowRight, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";
import { Link } from "react-router-dom";
import RecentPetitions from "../components/dashboard/RecentPetitions";
import TopTemplates from "../components/dashboard/TopTemplates";

const STATUS_COLORS = {
  rascunho: "hsl(220, 9%, 46%)",
  em_geracao: "hsl(38, 92%, 50%)",
  concluida: "hsl(210, 70%, 55%)",
  revisao_necessaria: "hsl(0, 84%, 60%)",
  pronto_para_protocolo: "hsl(160, 60%, 45%)",
};

const STATUS_LABELS = {
  rascunho: "Rascunho",
  em_geracao: "Em Geração",
  concluida: "Aguard. Revisão",
  revisao_necessaria: "Revisão Necessária",
  pronto_para_protocolo: "Pronto p/ Protocolo",
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
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const total = petitions.length;
  const completed = petitions.filter((p) => p.status === "pronto_para_protocolo").length;
  const needsRevision = petitions.filter((p) => p.status === "revisao_necessaria").length;
  const awaiting = petitions.filter((p) => p.status === "concluida").length;
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
    }))
    .filter((d) => d.total > 0);

  const monthlyData = getMonthlyData(petitions);
  const greeting = getGreeting(user?.full_name);

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground p-8">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-primary-foreground/60 text-sm font-medium mb-1">Bem-vindo de volta</p>
            <h1 className="text-2xl lg:text-3xl font-playfair font-bold">{greeting}</h1>
            <p className="text-primary-foreground/70 mt-1.5 text-sm">
              {total === 0
                ? "Comece criando sua primeira petição."
                : `Você tem ${needsRevision > 0 ? `${needsRevision} petição(ões) aguardando revisão e ` : ""}${awaiting > 0 ? `${awaiting} aguardando aprovação` : total + " petições no total"}.`}
            </p>
          </div>
          <Link
            to="/nova-peticao"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-xl font-medium transition-all border border-white/20 shrink-0"
          >
            <FilePlus className="w-4 h-4" /> Nova Petição
          </Link>
        </div>
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-6 -right-4 w-24 h-24 rounded-full bg-white/5" />
        <div className="absolute top-4 right-32 w-12 h-12 rounded-full bg-accent/20" />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} label="Total de Petições" value={total} sub="criadas" accent="bg-blue-50 text-blue-600" to="/peticoes" />
        <StatCard icon={PackageCheck} label="Prontas p/ Protocolo" value={completed} sub="aprovadas" accent="bg-green-50 text-green-600" to="/peticoes" />
        <StatCard icon={AlertTriangle} label="Revisão Necessária" value={needsRevision} sub="pendentes" accent="bg-red-50 text-red-600" to="/peticoes" />
        <StatCard icon={Clock} label="Aguardando Aprovação" value={awaiting} sub="geradas" accent="bg-amber-50 text-amber-600" to="/peticoes" />
      </div>

      {/* Value Banner */}
      {totalValue > 0 && (
        <Link to="/peticoes" className="block">
        <div className="rounded-2xl border bg-card p-6 flex flex-col sm:flex-row sm:items-center gap-6 hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-4 flex-1">
            <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
              <DollarSign className="w-7 h-7 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valor total acumulado das causas</p>
              <p className="text-3xl font-bold text-foreground mt-0.5">{fmtCurrency(totalValue)}</p>
            </div>
          </div>
          <div className="flex gap-8 sm:border-l sm:pl-6">
            <div>
              <p className="text-xs text-muted-foreground">Média por petição</p>
              <p className="text-xl font-semibold">{total > 0 ? fmtCurrency(totalValue / total) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Modelos ativos</p>
              <p className="text-xl font-semibold">{templates.filter(t => t.is_active).length}</p>
            </div>
          </div>
        </div>
        </Link>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly trend */}
        <Link to="/peticoes" className="lg:col-span-2 block">
        <Card className="p-6 h-full hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Petições por Mês</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Últimos 12 meses</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
              <TrendingUp className="w-3 h-3" /> Tendência
            </div>
          </div>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#colorTotal)" dot={{ r: 4, fill: "hsl(var(--primary))" }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Nenhum dado disponível" />
          )}
        </Card>
        </Link>

        {/* Status Pie */}
        <Link to="/peticoes" className="block">
        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer">
          <div className="mb-6">
            <h3 className="font-semibold text-foreground">Status das Petições</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Distribuição atual</p>
          </div>
          {statusData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {statusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {statusData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-muted-foreground truncate max-w-[130px]">{d.name}</span>
                    </div>
                    <span className="font-semibold">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyChart message="Nenhuma petição criada" />
          )}
        </Card>
        </Link>
      </div>

      {/* Case type bar + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Link to="/peticoes" className="lg:col-span-2 block">
        <Card className="p-6 h-full hover:shadow-md transition-shadow cursor-pointer">
          <div className="mb-6">
            <h3 className="font-semibold text-foreground">Petições por Área</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Tipos de ação jurídica</p>
          </div>
          {caseTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={caseTypeData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Nenhuma petição criada" />
          )}
        </Card>
        </Link>

        {/* Quick Actions */}
        <Card className="p-6 flex flex-col gap-3">
          <div className="mb-2">
            <h3 className="font-semibold text-foreground">Ações Rápidas</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Acesse as principais funções</p>
          </div>
          <QuickAction to="/nova-peticao" icon={FilePlus} label="Nova Petição" desc="Gerar com IA" color="bg-primary/10 text-primary" />
          <QuickAction to="/peticoes" icon={FileText} label="Minhas Petições" desc="Ver histórico completo" color="bg-blue-50 text-blue-600" />
          <QuickAction to="/modelos" icon={Scale} label="Modelos" desc="Gerenciar templates" color="bg-purple-50 text-purple-600" />
          <QuickAction to="/precedentes" icon={Sparkles} label="Precedentes" desc="Jurisprudência" color="bg-amber-50 text-amber-600" />
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

function StatCard({ icon: Icon, label, value, sub, accent, to }) {
  return (
    <Link to={to || "/peticoes"} className="block">
      <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer group">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${accent}`}>
          <Icon className="w-5 h-5" />
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm font-medium text-foreground/80 mt-0.5">{label}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">{sub} <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" /></p>
      </Card>
    </Link>
  );
}

function QuickAction({ to, icon: Icon, label, desc, color }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors group">
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
    <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
      {message}
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

function getGreeting(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return name ? `${part}, ${name.split(" ")[0]}!` : `${part}!`;
}