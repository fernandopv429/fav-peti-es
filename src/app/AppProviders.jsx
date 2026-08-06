import { BrowserRouter as Router } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/toaster";
import { queryClientInstance } from "@/app/query-client";
import { AuthProvider } from "@/app/auth/AuthContext";
import ErrorBoundary from "@/app/ErrorBoundary";

/**
 * Casca de contextos que envolve todo o app, de fora para dentro:
 * erros → autenticação → cache de dados → roteador. O Toaster fica no topo
 * para que qualquer tela possa disparar toast() de qualquer profundidade.
 */
export default function AppProviders({ children }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>{children}</Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
