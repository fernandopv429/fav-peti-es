import { Link, useLocation } from "react-router-dom";
import {
  Home, BookOpen, Scale, LogOut, FileText, FolderOpen, BookMarked,
  Calculator, Shield, TrendingUp, ShieldCheck, BarChart2, MessagesSquare, Webhook,
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
 * Menu lateral em pílula estreita: apenas ícones, sem rótulos. O nome de cada
 * destino fica no `title`/`aria-label` (tooltip nativo + leitores de tela).
 * Só o item ativo ganha bloco laranja com o ícone em navy.
 */
export default function Sidebar({ onNavigate }) {
  const location = useLocation();
  const { logout } = useAuth();

  return (
    <div
      className="h-full w-16 flex flex-col items-center bg-sidebar text-sidebar-foreground
                 rounded-none lg:rounded-2xl card-soft-lg"
    >
      {/* Marca */}
      <div className="h-16 shrink-0 flex items-center justify-center">
        <Scale className="w-6 h-6 text-primary" strokeWidth={STROKE} />
      </div>

      {/* Navegação */}
      <nav className="flex-1 w-full px-2 py-2 overflow-y-auto no-scrollbar space-y-3">
        {NAV.map((section) => (
          <div key={section.group} className="space-y-1">
            {section.items.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center justify-center w-12 h-11 mx-auto rounded-xl transition-colors ${
                    isActive ? "bg-sidebar-primary" : "hover:bg-sidebar-accent"
                  }`}
                >
                  <item.icon
                    className={`w-5 h-5 ${
                      isActive ? "text-sidebar-primary-foreground" : "text-primary"
                    }`}
                    strokeWidth={STROKE}
                  />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Sair */}
      <div className="p-2 shrink-0">
        <button
          onClick={() => logout()}
          title="Sair"
          aria-label="Sair"
          className="flex items-center justify-center w-12 h-11 rounded-xl hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="w-5 h-5 text-primary" strokeWidth={STROKE} />
        </button>
      </div>
    </div>
  );
}