import { Link, useLocation } from "react-router-dom";
import {
  Home, BookOpen, Wand2, Scale, X, LogOut, ChevronRight,
  FilePlus, FileText, FolderOpen, BookMarked, Calculator, Shield, TrendingUp
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const NAV = [
  {
    group: "Principal",
    items: [
      { label: "Início", icon: Home, path: "/" },
      { label: "Catálogo de Especialistas", icon: BookOpen, path: "/catalogo" },
      { label: "Gerar Documento", icon: Wand2, path: "/gerar" },
    ],
  },
  {
    group: "Petições",
    items: [
      { label: "Nova Petição", icon: FilePlus, path: "/nova-peticao" },
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
];

export default function Sidebar({ onClose }) {
  const location = useLocation();

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg">
            <Scale className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-sidebar-foreground">FAV Petições</h1>
            <p className="text-[10px] text-sidebar-foreground/40">Fernando Vieira Advogados</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-5">
        {NAV.map((section) => (
          <div key={section.group}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/30 px-3 mb-2">{section.group}</p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-white/10 text-sidebar-foreground"
                        : "text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      isActive ? "bg-sidebar-primary shadow-md" : "bg-white/[0.05] group-hover:bg-white/[0.08]"
                    }`}>
                      <item.icon className={`w-3.5 h-3.5 ${isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/60"}`} />
                    </div>
                    <span className="flex-1 leading-tight">{item.label}</span>
                    {isActive && <ChevronRight className="w-3 h-3 text-sidebar-foreground/30" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground/30 hover:text-sidebar-foreground/70 hover:bg-white/[0.05] transition-all w-full"
        >
          <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center">
            <LogOut className="w-3.5 h-3.5" />
          </div>
          Sair
        </button>
      </div>
    </div>
  );
}