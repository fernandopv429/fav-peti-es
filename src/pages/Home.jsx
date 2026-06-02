import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Wand2, Calculator, Shield, TrendingUp, ArrowRight, Users, BookOpen } from "lucide-react";

const AREAS_ORDER = [
  "Gestão & Prazos",
  "Atendimento & Clientes",
  "Pesquisa Jurídica",
  "Cível",
  "Recursos",
  "Trabalhista",
  "Família & Sucessões",
  "Criminal",
  "Tributário",
  "Empresarial & Contratos",
  "Imobiliário & Locação",
  "Previdenciário",
  "Execução & Cálculo",
];

const AREA_ICONS = {
  "Gestão & Prazos": "📋",
  "Atendimento & Clientes": "🤝",
  "Pesquisa Jurídica": "🔍",
  "Cível": "⚖️",
  "Recursos": "📤",
  "Trabalhista": "👷",
  "Família & Sucessões": "👨‍👩‍👧",
  "Criminal": "🔒",
  "Tributário": "💰",
  "Empresarial & Contratos": "🏢",
  "Imobiliário & Locação": "🏠",
  "Previdenciário": "🛡️",
  "Execução & Cálculo": "📊",
};

const TOOLS = [
  { label: "Nova Petição", icon: Wand2, path: "/nova-peticao", color: "from-amber-500 to-orange-500", desc: "Gerar peça inicial com IA" },
  { label: "Calculadora de Verbas", icon: Calculator, path: "/calculadora-verbas", color: "from-blue-500 to-cyan-500", desc: "Rescisórias trabalhistas" },
  { label: "Defesa / Contestação", icon: Shield, path: "/defesa", color: "from-violet-500 to-purple-500", desc: "Contestação do empregador" },
  { label: "Atualização de Cálculo", icon: TrendingUp, path: "/atualizacao-calculo", color: "from-emerald-500 to-green-500", desc: "Correção monetária e juros" },
];

export default function Home() {
  const navigate = useNavigate();
  const [especialistas, setEspecialistas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Especialista.filter({ ativo: true })
      .then(setEspecialistas)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Count by area
  const countByArea = {};
  especialistas.forEach(e => {
    countByArea[e.area] = (countByArea[e.area] || 0) + 1;
  });

  const handleAreaClick = (area) => {
    navigate(`/catalogo?area=${encodeURIComponent(area)}`);
  };

  return (
    <div className="min-h-screen bg-[#0d1526]">
      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0d1a35] to-[#0d1526]" />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, #3b82f6 0%, transparent 50%), radial-gradient(circle at 80% 20%, #f59e0b 0%, transparent 40%)" }} />
        <div className="relative px-6 lg:px-10 pt-10 pb-8">
          <p className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-2">Fernando Vieira Advogados</p>
          <h1 className="text-3xl lg:text-4xl font-playfair font-bold text-white mb-2">FAV Petições</h1>
          <p className="text-slate-400 text-sm max-w-lg">Inteligência jurídica com 57 especialistas em 13 áreas do Direito. Gere peças, calcule verbas e conteste com precisão.</p>

          {/* Stats bar */}
          <div className="flex flex-wrap gap-6 mt-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-none">57</p>
                <p className="text-slate-500 text-xs">Especialistas</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-none">13</p>
                <p className="text-slate-500 text-xs">Áreas do Direito</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
                <Wand2 className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-none">4</p>
                <p className="text-slate-500 text-xs">Ferramentas</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-10 pb-10 space-y-10">
        {/* Quick tools */}
        <div>
          <h2 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-4">Ferramentas rápidas</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {TOOLS.map((t) => (
              <button
                key={t.path}
                onClick={() => navigate(t.path)}
                className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 bg-white/[0.04] border border-white/[0.07] hover:border-white/15"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center mb-3 shadow-lg`}>
                  <t.icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-white font-semibold text-sm">{t.label}</p>
                <p className="text-slate-500 text-xs mt-0.5">{t.desc}</p>
                <ArrowRight className="absolute bottom-4 right-4 w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {/* Areas grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white/60 text-xs font-bold uppercase tracking-widest">Áreas do Direito</h2>
            <button onClick={() => navigate("/catalogo")} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors">
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 13 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {AREAS_ORDER.map((area) => (
                <button
                  key={area}
                  onClick={() => handleAreaClick(area)}
                  className="group relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 bg-white/[0.04] border border-white/[0.07] hover:border-amber-500/30 hover:bg-white/[0.07]"
                >
                  <span className="text-2xl mb-2 block">{AREA_ICONS[area] || "⚖️"}</span>
                  <p className="text-white/90 font-medium text-xs leading-tight">{area}</p>
                  <p className="text-amber-400/70 text-xs mt-1 font-semibold">{countByArea[area] || 0} especialistas</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-white font-semibold">Pronto para gerar seu documento?</p>
            <p className="text-slate-400 text-sm mt-0.5">Escolha o especialista certo para o seu caso no catálogo.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigate("/catalogo")} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-colors flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Catálogo
            </button>
            <button onClick={() => navigate("/gerar")} className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold transition-colors flex items-center gap-2">
              <Wand2 className="w-4 h-4" /> Gerar Documento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}