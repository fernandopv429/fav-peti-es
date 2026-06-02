import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Search, Wand2, BookOpen } from "lucide-react";

const AREAS_ORDER = [
  "Gestão & Prazos", "Atendimento & Clientes", "Pesquisa Jurídica", "Cível",
  "Recursos", "Trabalhista", "Família & Sucessões", "Criminal", "Tributário",
  "Empresarial & Contratos", "Imobiliário & Locação", "Previdenciário", "Execução & Cálculo",
];

export default function Catalogo() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const initialArea = new URLSearchParams(search).get("area") || "";

  const [especialistas, setEspecialistas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState(initialArea);

  useEffect(() => {
    base44.entities.Especialista.filter({ ativo: true })
      .then(data => setEspecialistas(data.sort((a, b) => Number(a.numero) - Number(b.numero))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = especialistas.filter(e => {
    const matchArea = !areaFilter || e.area === areaFilter;
    const q = query.toLowerCase();
    const matchQ = !q || (e.titulo || "").toLowerCase().includes(q) || (e.descricao || "").toLowerCase().includes(q);
    return matchArea && matchQ;
  });

  // Group by area preserving order
  const grouped = {};
  AREAS_ORDER.forEach(a => { grouped[a] = []; });
  filtered.forEach(e => {
    if (!grouped[e.area]) grouped[e.area] = [];
    grouped[e.area].push(e);
  });

  const handleGerar = (e) => {
    navigate(`/gerar?especialista=${encodeURIComponent(e.id)}&area=${encodeURIComponent(e.area)}`);
  };

  return (
    <div className="min-h-screen bg-[#0d1526]">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0d1526]/95 backdrop-blur-md border-b border-white/[0.06] px-6 lg:px-10 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <BookOpen className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Catálogo de Especialistas</h1>
              <p className="text-slate-500 text-xs">{filtered.length} especialistas encontrados</p>
            </div>
          </div>
          <div className="sm:ml-auto flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nome ou descrição..."
                className="bg-white/[0.06] border border-white/10 text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-amber-500/50 w-full sm:w-64 transition-colors"
              />
            </div>
            {/* Area filter */}
            <select
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
              className="bg-white/[0.06] border border-white/10 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
            >
              <option value="" className="bg-slate-900">Todas as áreas</option>
              {AREAS_ORDER.map(a => <option key={a} value={a} className="bg-slate-900">{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-10 py-8 space-y-10">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500 text-lg">Nenhum especialista encontrado.</p>
            <button onClick={() => { setQuery(""); setAreaFilter(""); }} className="mt-3 text-amber-400 text-sm hover:text-amber-300">Limpar filtros</button>
          </div>
        ) : (
          AREAS_ORDER.map(area => {
            const items = grouped[area];
            if (!items || items.length === 0) return null;
            return (
              <div key={area}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xl">{getAreaIcon(area)}</span>
                  <h2 className="text-white font-bold text-base">{area}</h2>
                  <span className="text-xs text-slate-500 bg-white/[0.05] px-2 py-0.5 rounded-full">{items.length}</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(esp => (
                    <div
                      key={esp.id}
                      className="group relative bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5 hover:border-amber-500/25 hover:bg-white/[0.07] transition-all duration-200 flex flex-col"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-2xl">{esp.icone || "⚖️"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm leading-tight">{esp.titulo || esp.name}</p>
                          <p className="text-amber-400/60 text-xs mt-0.5">{esp.area}</p>
                        </div>
                        <span className="text-[10px] text-slate-600 font-mono shrink-0">#{esp.numero}</span>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed flex-1 line-clamp-3">{esp.descricao}</p>
                      <button
                        onClick={() => handleGerar(esp)}
                        className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-semibold transition-colors border border-amber-500/20 hover:border-amber-500/40"
                      >
                        <Wand2 className="w-3.5 h-3.5" /> Gerar Documento
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function getAreaIcon(area) {
  const MAP = {
    "Gestão & Prazos": "📋", "Atendimento & Clientes": "🤝", "Pesquisa Jurídica": "🔍",
    "Cível": "⚖️", "Recursos": "📤", "Trabalhista": "👷", "Família & Sucessões": "👨‍👩‍👧",
    "Criminal": "🔒", "Tributário": "💰", "Empresarial & Contratos": "🏢",
    "Imobiliário & Locação": "🏠", "Previdenciário": "🛡️", "Execução & Cálculo": "📊",
  };
  return MAP[area] || "⚖️";
}