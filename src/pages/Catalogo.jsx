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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-6 lg:px-10 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-foreground font-bold text-lg">Catálogo de Especialistas</h1>
              <p className="text-muted-foreground text-xs">{filtered.length} especialistas encontrados</p>
            </div>
          </div>
          <div className="sm:ml-auto flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nome ou descrição..."
                className="bg-input border border-border text-foreground placeholder-muted-foreground rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring w-full sm:w-64 transition-colors"
              />
            </div>
            <select
              value={areaFilter}
              onChange={e => setAreaFilter(e.target.value)}
              className="bg-input border border-border text-foreground rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
            >
              <option value="">Todas as áreas</option>
              {AREAS_ORDER.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="px-6 lg:px-10 py-8 space-y-10">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-lg">Nenhum especialista encontrado.</p>
            <button onClick={() => { setQuery(""); setAreaFilter(""); }} className="mt-3 text-primary text-sm hover:text-primary/80">Limpar filtros</button>
          </div>
        ) : (
          AREAS_ORDER.map(area => {
            const items = grouped[area];
            if (!items || items.length === 0) return null;
            return (
              <div key={area}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xl">{getAreaIcon(area)}</span>
                  <h2 className="text-foreground font-bold text-base">{area}</h2>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{items.length}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(esp => (
                    <div
                      key={esp.id}
                      className="group relative bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 flex flex-col"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-2xl">{esp.icone || "⚖️"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-card-foreground font-semibold text-sm leading-tight">{esp.titulo || esp.name}</p>
                          <p className="text-primary text-xs mt-0.5 opacity-70">{esp.area}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">#{esp.numero}</span>
                      </div>
                      <p className="text-muted-foreground text-xs leading-relaxed flex-1 line-clamp-3">{esp.descricao}</p>
                      <button
                        onClick={() => handleGerar(esp)}
                        className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors border border-primary/20 hover:border-primary/40"
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