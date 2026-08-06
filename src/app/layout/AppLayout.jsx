import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, Scale } from "lucide-react";
import Sidebar from "@/app/layout/Sidebar";

/**
 * Moldura de todas as telas.
 *
 * Desktop: o menu é uma pílula flutuante fixa à esquerda, sempre visível. Ela
 * expande no hover POR CIMA do conteúdo, então a margem do conteúdo é fixa e
 * nada reposiciona quando o mouse passa.
 *
 * Mobile: o mesmo menu vira gaveta, aberta pelo botão do cabeçalho.
 */
export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen app-canvas">
      {/* Sombra de fundo da gaveta (só mobile) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Menu */}
      <div
        className={`fixed z-50 transition-transform duration-300 ease-out
                    inset-y-0 left-0
                    lg:inset-y-4 lg:left-4 lg:translate-x-0
                    ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Sidebar onNavigate={() => setDrawerOpen(false)} />
      </div>

      {/* Cabeçalho mobile */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 h-16 px-4 bg-background/80 backdrop-blur-md border-b border-border">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
          className="w-10 h-10 rounded-2xl bg-card card-soft flex items-center justify-center text-foreground"
        >
          <Menu className="w-5 h-5 text-primary" strokeWidth={2.25} />
        </button>
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" strokeWidth={2.25} />
          <span className="font-bold text-sm tracking-wide">FAV Petições</span>
        </div>
      </header>

      {/* Conteúdo — largura total, apenas afastado da pílula do menu */}
      <main className="lg:pl-28">
        <Outlet />
      </main>
    </div>
  );
}
