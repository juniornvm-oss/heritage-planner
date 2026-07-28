// Guarda de rotas: sem sessão → manda para o login. No modo local (sem
// Supabase) libera direto, para o desenvolvimento com o projeto "Heritage".
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { online } from "../lib/supabase";
import { useAuth } from "../lib/auth";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const { carregando, sessao } = useAuth();

  if (!online) return <>{children}</>; // modo local: sem login

  if (carregando) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)" }}>
        <span className="brandface" style={{ fontSize: 22, letterSpacing: "0.06em" }}>HERITAGE PLANNER</span>
      </div>
    );
  }

  if (!sessao) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  return <>{children}</>;
}
