import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { FileText, FilePlus, CheckCircle, Clock, TrendingUp, Scale, DollarSign, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart } from "recharts";
import { Link } from "react-router-dom";
import DashboardStatCard from "../components/dashboard/DashboardStatCard";
import RecentPetitions from "../components/dashboard/RecentPetitions";

const STATUS_COLORS = {
  rascunho: "hsl(220, 9%, 46%)",
  em_geracao: "hsl(38, 92%, 50%)",
  concluida: "hsl(160, 60%, 45%)",
  revisao: "hsl(280, 65%, 60%)",
};

const STATUS_LABELS = {
  rascunho: "Rascunho",
  em_geracao: "Em Geração",
  concluida: "Concluída",
  revisao: "Em Revisão",
};

export default function Dashboard() {
  const [petitions, setPetitions] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [p, t] = await Promise.all([
        base44.entities.Petition.list(),
        base44.entities.PetitionTemplate.list(),
      ]);
      setPetitions(p);
      setTemplates(t);
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
  const completed = petitions.filter((p) => p.status === "concluida").length;
  const inProgress = petitions.filter((p) => p.status === "em_geracao").length;
  const pendingReview = petitions.filter((p) => p.status === "revisao").length;
  const totalValue = petitions.reduce((acc, p) => acc + (p.estimated_value || p.salary * 12 || 0), 0);
  const fmtCurrency = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  const statusData = Object.entries(STATUS_LABELS).map(([key, label]) => ({
    name: label,
    value: petitions.filter((p) => p.status === key).length,
    color: STATUS_COLORS[key],
  })).filter(d => d.value > 0);

  const caseTypeData = ["trabalhista", "civel", "previdenciario", "consumidor", "outro"]
    .map((type) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      quantidade: petitions.filter((p) => p.case_type === type).length,
    }))
    .filter((d) => d.quantidade > 0);

  // Monthly data from petitions
  const monthlyData = getMonthlyData(petitions);

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-playfair font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Visão geral das suas petições</p>
        </div>
        <Link
          to="/nova-peticao"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
        >
          <FilePlus className="w-4 h-4" />
          Nova Petição
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DashboardStatCard icon={FileText} label="Total de Petições" value={total} color="text-primary" />
        <DashboardStatCard icon={CheckCircle} label="Concluídas" value={completed} color="text-green-600" />
        <DashboardStatCard icon={AlertCircle} label="Revisão Pendente" value={pendingReview} color="text-amber-500" />
        <DashboardStatCard icon={Scale} label="Modelos" value={templates.length} color="text-purple-600" />
      </div>

      {/* Value highlight */}
      {totalValue > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm opacity-70">Valor Total Acumulado das Causas</p>
            <p className="text-3xl font-bold mt-1">{fmtCurrency(totalValue)}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs opacity-70">Média por petição</p>
              <p className="text-lg font-semibold">{total > 0 ? fmtCurrency(totalValue / total) : "R$ 0"}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4">Distribuição por Status</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Nenhuma petição criada ainda" />
          )}
          {statusData.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-4 justify-center">
              {statusData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-muted-foreground">{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Case Type Chart */}
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-4">Por Tipo de Ação</h3>
          {caseTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={caseTypeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip />
                <Bar dataKey="quantidade" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Nenhuma petição criada ainda" />
          )}
        </Card>

        {/* Monthly trend */}
        <Card className="p-6 lg:col-span-2">
          <h3 className="font-semibold text-foreground mb-4">Petições por Mês</h3>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip />
                <Area type="monotone" dataKey="total" fill="hsl(var(--primary))" fillOpacity={0.1} stroke="hsl(var(--primary))" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Nenhum dado disponível" />
          )}
        </Card>
      </div>

      {/* Recent Petitions */}
      <RecentPetitions petitions={petitions} />
    </div>
  );
}

function EmptyChart({ message }) {
  return (
    <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
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