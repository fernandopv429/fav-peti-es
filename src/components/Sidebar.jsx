import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FilePlus, FileText, FolderOpen, Scale, X, LogOut, BookMarked, ChevronRight, Calculator } from "lucide-react";
import { base44 } from "@/api/base44Client";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Nova Petição", icon: FilePlus, path: "/nova-peticao" },
  { label: "Minhas Petições", icon: FileText, path: "/peticoes" },
  { label: "Modelos", icon: FolderOpen, path: "/modelos" },
  { label: "Precedentes", icon: BookMarked, path: "/precedentes" },
  { label: "Calculadora de Verbas", icon: Calculator, path: "/calculadora-verbas" },
];

export default function Sidebar({ onClose }) {
  const location = useLocation();

  return (
    <div className="h-full flex flex-col" style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e293b 100%)" }}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)" }}>
            <Scale className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-white">FAV Petições</h1>
            <p className="text-[10px] text-white/40">Inteligência Jurídica</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 mb-3">Menu</p>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/50 hover:text-white hover:bg-white/5"
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                isActive ? "bg-amber-500 shadow-lg shadow-amber-500/30" : "bg-white/5 group-hover:bg-white/10"
              }`}>
                <item.icon className="w-3.5 h-3.5" />
              </div>
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="w-3 h-3 text-white/40" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/5">
        <button
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-white/30 hover:text-white/70 hover:bg-white/5 transition-all w-full"
        >
          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
            <LogOut className="w-3.5 h-3.5" />
          </div>
          Sair
        </button>
      </div>
    </div>
  );
}