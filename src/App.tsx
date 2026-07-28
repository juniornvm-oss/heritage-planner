import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import OrientationGuard from "./screens/OrientationGuard";
import ErrorBoundary from "./ui/ErrorBoundary";
import AuthGuard from "./ui/AuthGuard";
import LoginScreen from "./screens/LoginScreen";
import FormularioScreen from "./screens/FormularioScreen";
import SolicitacoesScreen from "./screens/SolicitacoesScreen";
import CadastroScreen from "./screens/CadastroScreen";
import HomeScreen from "./screens/HomeScreen";
import ProjetosScreen from "./screens/ProjetosScreen";
import LeituraScreen from "./screens/LeituraScreen";
import EditorScreen from "./screens/EditorScreen";
import CuradoriaScreen from "./screens/CuradoriaScreen";
import BibliotecaEquipamentosScreen from "./screens/BibliotecaEquipamentosScreen";
import CadastrarEquipamentoScreen from "./screens/CadastrarEquipamentoScreen";
import BibliotecaAcabamentosScreen from "./screens/BibliotecaAcabamentosScreen";
import { useAuth } from "./lib/auth";
import { online } from "./lib/supabase";
import { useLibrary } from "./store/libraryStore";

export default function App() {
  return (
    <Routes>
      {/* Rotas públicas — fora do login e sem exigir orientação paisagem. */}
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/formulario" element={<FormularioScreen />} />

      {/* Todo o resto é a plataforma, protegida por login. */}
      <Route path="/*" element={<Plataforma />} />
    </Routes>
  );
}

function Plataforma() {
  const { sessao } = useAuth();
  const carregar = useLibrary((s) => s.carregar);

  // Só busca dados quando há sessão (ou no modo local). Com o banco trancado,
  // carregar sem login retornaria erro de permissão.
  useEffect(() => {
    if (sessao || !online) void carregar();
  }, [carregar, sessao]);

  return (
    <AuthGuard>
      <OrientationGuard>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/projetos" element={<ProjetosScreen />} />
            <Route path="/solicitacoes" element={<SolicitacoesScreen />} />
            <Route path="/cadastro" element={<CadastroScreen />} />
            <Route path="/novo" element={<LeituraScreen />} />
            <Route path="/projeto/:id/leitura" element={<LeituraScreen />} />
            <Route path="/projeto/:id/curadoria" element={<CuradoriaScreen />} />
            <Route path="/projeto/:id" element={<EditorScreen />} />
            <Route path="/equipamentos" element={<BibliotecaEquipamentosScreen />} />
            <Route path="/equipamentos/novo" element={<CadastrarEquipamentoScreen />} />
            <Route path="/equipamentos/:ref" element={<CadastrarEquipamentoScreen />} />
            <Route path="/acabamentos" element={<BibliotecaAcabamentosScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </OrientationGuard>
    </AuthGuard>
  );
}
