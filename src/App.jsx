import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/app/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from '@/pages/NotFound';
import { AuthProvider, useAuth } from '@/app/auth/AuthContext';
import ErrorBoundary from '@/app/ErrorBoundary';
import UserNotRegisteredError from '@/app/auth/UserNotRegisteredError';
import Layout from '@/app/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import NewPetition from '@/pages/NewPetition';
import PetitionsList from '@/pages/PetitionsList';
import PetitionView from '@/pages/PetitionView';
import Templates from '@/pages/Templates';
import Precedents from '@/pages/Precedents';
import CalculadoraVerbas from '@/pages/CalculadoraVerbas';
import Defesa from '@/pages/Defesa';
import AtualizacaoCalculoPage from '@/pages/AtualizacaoCalculo';
import Home from '@/pages/Home';
import Catalogo from '@/pages/Catalogo';
import BackupRestauracao from '@/pages/BackupRestauracao';
import Analise from '@/pages/Analise';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/catalogo" element={<Catalogo />} />
        <Route path="/nova-peticao" element={<NewPetition />} />
        <Route path="/peticoes" element={<PetitionsList />} />
        <Route path="/peticoes/:id" element={<PetitionView />} />
        <Route path="/modelos" element={<Templates />} />
        <Route path="/precedentes" element={<Precedents />} />
        <Route path="/calculadora-verbas" element={<CalculadoraVerbas />} />
        <Route path="/defesa" element={<Defesa />} />
        <Route path="/atualizacao-calculo" element={<AtualizacaoCalculoPage />} />
        <Route path="/backup" element={<BackupRestauracao />} />
        <Route path="/analise" element={<Analise />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
};


function App() {

  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App