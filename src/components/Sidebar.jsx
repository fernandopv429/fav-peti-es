import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FilePlus,
  FileText,
  FolderOpen,
  Scale,
  X,
  LogOut,
  BookMarked } from
"lucide-react";
import { base44 } from "@/api/base44Client";

const navItems = [
{ label: "Dashboard", icon: LayoutDashboard, path: "/" },
{ label: "Nova Petição", icon: FilePlus, path: "/nova-peticao" },
{ label: "Minhas Petições", icon: FileText, path: "/peticoes" },
{ label: "Modelos", icon: FolderOpen, path: "/modelos" },
{ label: "Precedentes", icon: BookMarked, path: "/precedentes" }];


export default function Sidebar({ onClose }) {
  const location = useLocation();

  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="h-20 flex items-center justify-between px-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sidebar-primary flex items-center justify-center">
            <Scale className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-playfair font-bold text-lg leading-tight text-white">FAV </h1>
            <p className="text-xs text-sidebar-foreground/60">Petições Inteligentes</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden p-1 rounded hover:bg-sidebar-accent">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              isActive ?
              "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20" :
              "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"}`
              }>
              
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>);

        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={() => base44.auth.logout()}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all w-full">
          
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </div>);

}