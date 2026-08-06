import { Link, useLocation } from "react-router-dom";
import {
  Home, BookOpen, Scale, LogOut, FileText, FolderOpen, BookMarked,
  Calculator, Shield, TrendingUp, ShieldCheck, BarChart2, MessagesSquare, Webhook,
  ChevronRight,
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
      { label: "Gerar por Entrevista", icon: MessagesSquare, path: "/entrevista" },
      { label: "Minhas Petições", icon: FileText, path: "/peticoes" },
      { label: "Modelos", icon: FolderOpen, path: "/modelos" },
      { label: "Precedentes", icon: BookMarked, path: "/precedentes" },
      { label: "Modelos de Referência", icon: BookMarked, path: "/modelos-referencia" },
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
      { label: "Webhooks", icon: Webhook, path: "/webhooks" },
      { label: "Backup e Restauração", icon: ShieldCheck, path: "/backup" },
    ],
  },
];

/** Traço mais grosso, como os ícones da referência. */
const STROKE = 2.25;

/**
 * Menu lateral em pílula flutuante, no estilo da referência: superfície navy,
 * ícones laranja de traço grosso e sem chip de fundo. Só o item ativo ganha
 * bloco laranja com o ícone em navy — o mesmo contraste que a referência usa
 * no hero (texto navy sobre laranja).
 *
 * No desktop fica estreito (só ícones) e expande no hover para mostrar os
 * rótulos — por isso todo texto usa `lg:opacity-0 lg:group-hover:opacity-100`.
 */
export default function Sidebar({ onNavigate }) {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <div
      className="group/nav h-full w-64 lg:w-20 lg:hover:w-64 overflow-hidden
                 flex flex-col bg-sidebar text-sidebar-foreground
                 rounded-none lg:rounded-2xl card-soft-lg
                 transition-[width] duration-300 ease-out"
    >
      {/* Marca */}
      <div className="h-20 flex items-center gap-3 px-4 shrink-0">
        <div className="w-12 h-12 shrink-0 flex items-center justify-center">
          <Scale className="w-6 h-6 text-primary" strokeWidth={STROKE} />
        </div>
        <div className="min-w-0 opacity-100 lg:opacity-0 lg:group-hover/nav:opacity-100 transition-opacity duration-200">
          <p className="font-bold text-sm whitespace-nowrap tracking-wide">FAV Petições</p>
          <p className="text-[10px] text-white/70 whitespace-nowrap">Fernando Vieira Advogados</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto no-scrollbar space-y-4">
        {NAV.map((section) => (
          <div key={section.group}>
            <p
              className="text-[10px] font-bold uppercase tracking-widest text-white/65 mb-2 px-2
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
                    className={`group/item flex items-center gap-2 rounded-xl transition-colors ${
                      isActive ? "bg-sidebar-primary" : "hover:bg-sidebar-accent"
                    }`}
                  >
                    <div className="w-14 h-12 shrink-0 flex items-center justify-center">
                      <item.icon
                        className={`w-5 h-5 ${
                          isActive ? "text-sidebar-primary-foreground" : "text-primary"
                        }`}
                        strokeWidth={STROKE}
                      />
                    </div>
                    <span
                      className={`flex-1 text-sm font-semibold whitespace-nowrap transition-opacity duration-200
                                  opacity-100 lg:opacity-0 lg:group-hover/nav:opacity-100 ${
                                    isActive ? "text-sidebar-primary-foreground" : "text-white"
                                  }`}
                    >
                      {item.label}
                    </span>
                    {/* Chevron laranja, como na navegação da referência */}
                    <ChevronRight
                      className={`w-4 h-4 mr-3 shrink-0 transition-opacity duration-200
                                  opacity-0 lg:group-hover/nav:opacity-100 ${
                                    isActive ? "text-sidebar-primary-foreground" : "text-primary"
                                  }`}
                      strokeWidth={STROKE}
                    />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sair */}
      <div className="p-3 shrink-0">
        <button
          onClick={() => logout()}
          title="Sair"
          className="flex items-center gap-2 w-full rounded-xl hover:bg-sidebar-accent transition-colors"
        >
          <div className="w-14 h-12 shrink-0 flex items-center justify-center">
            <LogOut className="w-5 h-5 text-primary" strokeWidth={STROKE} />
          </div>
          <span className="text-sm font-semibold text-white whitespace-nowrap opacity-100 lg:opacity-0 lg:group-hover/nav:opacity-100 transition-opacity duration-200">
            Sair
          </span>
        </button>
      </div>
    </div>
  );
}
