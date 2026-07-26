import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import OrientationGuard from "./screens/OrientationGuard";
import HomeScreen from "./screens/HomeScreen";
import ProjetosScreen from "./screens/ProjetosScreen";
import LeituraScreen from "./screens/LeituraScreen";
import EditorScreen from "./screens/EditorScreen";
import CuradoriaScreen from "./screens/CuradoriaScreen";
import BibliotecaEquipamentosScreen from "./screens/BibliotecaEquipamentosScreen";
import CadastrarEquipamentoScreen from "./screens/CadastrarEquipamentoScreen";
import BibliotecaAcabamentosScreen from "./screens/BibliotecaAcabamentosScreen";
import { useLibrary } from "./store/libraryStore";

export default function App() {
  const carregar = useLibrary((s) => s.carregar);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <OrientationGuard>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/projetos" element={<ProjetosScreen />} />
        <Route path="/novo" element={<LeituraScreen />} />
        <Route path="/projeto/:id/leitura" element={<LeituraScreen />} />
        <Route path="/projeto/:id/curadoria" element={<CuradoriaScreen />} />
        <Route path="/projeto/:id" element={<EditorScreen />} />
        <Route path="/equipamentos" element={<BibliotecaEquipamentosScreen />} />
        <Route path="/equipamentos/novo" element={<CadastrarEquipamentoScreen />} />
        <Route path="/acabamentos" element={<BibliotecaAcabamentosScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </OrientationGuard>
  );
}
