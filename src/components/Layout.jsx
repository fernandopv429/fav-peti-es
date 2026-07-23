import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { Menu, Scale } from "lucide-react";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-[margin] duration-300 ${sidebarOpen ? "lg:ml-64" : "ml-0"}`}>
        {/* Mobile header */}
        <div className="lg:hidden flex items-center h-14 px-4 bg-sidebar border-b border-sidebar-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-sidebar-foreground/60"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
              <Scale className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm text-sidebar-foreground">FAV Petições</span>
          </div>
        </div>

        {/* Desktop reopen button (when sidebar closed) */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden lg:flex fixed top-4 left-4 z-30 items-center justify-center w-10 h-10 rounded-xl bg-sidebar text-sidebar-foreground shadow-lg hover:bg-sidebar/90 transition-colors"
            title="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}