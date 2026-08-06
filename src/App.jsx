import AppProviders from "@/app/AppProviders";
import AppRoutes from "@/app/AppRoutes";

/**
 * Raiz do app. Mantida deliberadamente mínima: os contextos ficam em
 * app/AppProviders.jsx e as rotas em app/AppRoutes.jsx.
 */
export default function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  );
}
