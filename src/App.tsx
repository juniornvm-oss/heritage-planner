import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import OrientationGuard from "./screens/OrientationGuard";
import ProjetosScreen from "./screens/ProjetosScreen";
import NovoProjetoScreen from "./screens/NovoProjetoScreen";
import EditorScreen from "./screens/EditorScreen";
import BibliotecaEquipamentosScreen from "./screens/BibliotecaEquipamentosScreen";
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
        <Route path="/" element={<ProjetosScreen />} />
        <Route path="/novo" element={<NovoProjetoScreen />} />
        <Route path="/projeto/:id" element={<EditorScreen />} />
        <Route path="/equipamentos" element={<BibliotecaEquipamentosScreen />} />
        <Route path="/acabamentos" element={<BibliotecaAcabamentosScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </OrientationGuard>
  );
}
