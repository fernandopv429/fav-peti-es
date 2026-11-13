import { Link, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/app/auth/AuthContext";
import { useCasosWebhook } from "@/features/entrevista/useCasosWebhook";

/**
 * Itens das abas. Todo caminho aqui precisa ter uma rota em app/AppRoutes.jsx.
 */
const ABAS = [
  { label: "Início", path: "/" },
  { label: "Entrevistas", path: "/entrevista", contador: true },
  { label: "Modelos", path: "/modelos" },
  { label: "Webhooks", path: "/webhooks" },
];

function iniciais(nome) {
  if (!nome) return "?";
  const p = nome.trim().split(" ").filter(Boolean);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

/**
 * Barra superior preta com a marca FAV e as abas. A aba ativa ganha o
 * sublinhado âmbar do timbrado; "Entrevistas" mostra quantos casos estão na
 * fila. No celular as abas rolam na horizontal.
 */
export default function TopNav() {
  const location = useLocation();
  const { user, logout } = useAuth();
  // Mesmo critério do botão "Fila" da tela de Entrevistas: tudo que não foi revisado.
  const { naFila, gerando } = useCasosWebhook();
  const pendentes = naFila.length + gerando.length;

  return (
    <header className="sticky top-0 z-40 bg-[#0f0f0f] text-white">
      <div className="h-12 flex items-center gap-4 sm:gap-8 px-4 lg:px-8">
        <Link to="/" className="flex items-baseline gap-1.5 shrink-0" aria-label="FAV Petições — Início">
          <span className="font-semibold text-[17px] tracking-tight">FAV</span>
          <span className="w-[5px] h-[5px] rounded-full bg-primary inline-block" />
          <span className="text-[12px] text-white/55 hidden sm:inline">Petições</span>
        </Link>

        <nav className="flex-1 min-w-0 flex items-stretch gap-5 sm:gap-7 h-full overflow-x-auto no-scrollbar">
          {ABAS.map((aba) => {
            const ativo = aba.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(aba.path);
            return (
              <Link
                key={aba.path}
                to={aba.path}
                aria-current={ativo ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium border-b-2 transition-colors ${
                  ativo
                    ? "text-white border-primary"
                    : "text-white/55 border-transparent hover:text-white/90"
                }`}
              >
                {aba.label}
                {aba.contador && pendentes > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10.5px] font-semibold flex items-center justify-center">
                    {pendentes}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <span
            title={user?.full_name || ""}
            className="w-8 h-8 rounded-full bg-white/10 text-primary text-[11px] font-semibold flex items-center justify-center"
          >
            {iniciais(user?.full_name)}
          </span>
          <button
            onClick={() => logout()}
            title="Sair"
            aria-label="Sair"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
