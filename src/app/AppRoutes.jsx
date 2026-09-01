import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "@/app/layout/AppLayout";
import { useAuth } from "@/app/auth/AuthContext";
import UserNotRegisteredError from "@/app/auth/UserNotRegisteredError";

import Home from "@/pages/Home";
import NewPetition from "@/pages/NewPetition";
import PetitionView from "@/pages/PetitionView";
import Modelos from "@/pages/Modelos";
import GerarPorEntrevista from "@/pages/GerarPorEntrevista";
import Webhooks from "@/pages/Webhooks";
import NotFound from "@/pages/NotFound";

/**
 * Mapa de rotas do app + porteiro de autenticação.
 *
 * Toda rota nova entra AQUI e em nenhum outro lugar. O menu lateral que aponta
 * para elas fica em app/layout/Sidebar.jsx — ao adicionar uma rota, confira se
 * ela também precisa de um item de menu.
 */
export default function AppRoutes() {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // 1. Ainda verificando sessão / configurações públicas do app
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  // 2. Problemas de autenticação
  if (authError?.type === "user_not_registered") {
    return <UserNotRegisteredError />;
  }
  if (authError?.type === "auth_required") {
    navigateToLogin();
    return null;
  }

  // 3. Usuário autenticado — todas as telas vivem dentro do AppLayout
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />

        {/* Petições */}
        <Route path="/entrevista" element={<GerarPorEntrevista />} />
        {/* Aposentada: sem entrada no menu, mantida acessível por URL para comparação
            com /entrevista. Remover quando a entrevista estiver validada. */}
        <Route path="/nova-peticao" element={<NewPetition />} />
        <Route path="/peticoes/:id" element={<PetitionView />} />
        <Route path="/modelos" element={<Modelos />} />
        {/* Rota antiga: cai na mesma página unificada */}
        {/* Mantido como redirect: a tela virou aba dentro de /modelos. */}
        <Route path="/modelos-referencia" element={<Navigate to="/modelos" replace />} />

        {/* Ferramentas */}
        <Route path="/webhooks" element={<Webhooks />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}