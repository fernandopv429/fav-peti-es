import { Outlet } from "react-router-dom";
import TopNav from "@/app/layout/TopNav";

/**
 * Moldura de todas as telas: barra superior preta com as abas (TopNav, 3rem
 * de altura) e o conteúdo abaixo, em largura total.
 */
export default function AppLayout() {
  return (
    <div className="min-h-screen app-canvas">
      <TopNav />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
