import { Link, useLocation } from "react-router-dom";
import {
  Home, BookOpen, Scale, LogOut, FileText, FolderOpen, BookMarked,
  Calculator, Shield, TrendingUp, ShieldCheck, BarChart2,
} from "lucide-react";
import { useAuth } from "@/app/auth/AuthContext";

/**
 * Itens do menu. Todo caminho aqui precisa ter uma rota em app/AppRoutes.jsx.
 */
const NAV = [
  {
    group: "Principal",
    items: [
      { label: "Início", icon: Home, path: "/" },
      { label: "Catálogo de Especialistas", icon: BookOpen, path: "/catalogo" },
    ],
  },
  {
    group: "Petições",
    items: [
      { label: "Minhas Petições", icon: FileText, path: "/peticoes" },
      { label: "Modelos", icon: FolderOpen, path: "/modelos" },
      { label: "Precedentes", icon: BookMarked, path: "/precedentes" },
    ],
  },
  {
    group: "Ferramentas Trabalhistas",
    items: [
      { label: "Calculadora de Verbas", icon: Calculator, path: "/calculadora-verbas" },
      { label: "Defesa / Contestação", icon: Shield, path: "/defesa" },
      { label: "Atualização de Cálculo", icon: TrendingUp, path: "/atualizacao-calculo" },
    ],
  },
  {
    group: "Ferramentas",
    items: [
      { label: "Painel / Análise", icon: BarChart2, path: "/analise" },
      { label: "Backup e Restauração", icon: ShieldCheck, path: "/backup" },
    ],
  },
];

/**
 * Menu lateral em pílula flutuante.
 *
 * No desktop fica estreito (só ícones) e expande no hover para mostrar os
 * rótulos — por isso todo texto usa `lg:opacity-0 lg:group-hover:opacity-100`.
 * No mobile ele é uma gaveta e aparece sempre expandido.
 */
export default function Sidebar({ onNavigate }) {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <div
      className="group/nav h-full w-64 lg:w-20 lg:hover:w-64 overflow-hidden
                 flex flex-col bg-sidebar text-sidebar-foreground
                 rounded-none lg:rounded-[28px] card-soft-lg
                 transition-[width] duration-300 ease-out"
    >
      {/* Marca */}
      <div className="h-20 flex items-center gap-3 px-4 shrink-0">
        <div className="w-12 h-12 shrink-0 rounded-2xl bg-white/15 flex items-center justify-center">
          <Scale className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0 opacity-100 lg:opacity-0 lg:group-hover/nav:opacity-100 transition-opacity duration-200">
          <p className="font-bold text-sm whitespace-nowrap">FAV Petições</p>
          <p className="text-[10px] text-white/50 whitespace-nowrap">Fernando Vieira Advogados</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-4 py-2 overflow-y-auto no-scrollbar space-y-4">
        {NAV.map((section) => (
          <div key={section.group}>
            {/* O título do grupo só faz sentido quando há rótulos para agrupar */}
            <p
              className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 px-1
                         whitespace-nowrap h-3 opacity-100 lg:opacity-0 lg:group-hover/nav:opacity-100
                         transition-opacity duration-200"
            >
              {section.group}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onNavigate}
                    title={item.label}
                    aria-current={isActive ? "page" : undefined}
                    className="flex items-center gap-3 rounded-2xl transition-colors"
                  >
                    <div
                      className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition-all ${
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                    </div>
                    <span
                      className={`text-sm font-medium whitespace-nowrap transition-opacity duration-200
                                  opacity-100 lg:opacity-0 lg:group-hover/nav:opacity-100 ${
                                    isActive ? "text-white" : "text-white/70"
                                  }`}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sair */}
      <div className="p-4 shrink-0">
        <button
          onClick={() => logout()}
          title="Sair"
          className="flex items-center gap-3 w-full rounded-2xl transition-colors"
        >
          <div className="w-12 h-12 shrink-0 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors">
            <LogOut className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-white/70 whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/nav:opacity-100 transition-opacity duration-200">
            Sair
          </span>
        </button>
      </div>
    </div>
  );
}
