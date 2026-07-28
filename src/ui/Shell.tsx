import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { online } from "../lib/supabase";
import { sair, useAuth } from "../lib/auth";

const nav = [
  { to: "/", label: "Início" },
  { to: "/projetos", label: "Projetos" },
  { to: "/equipamentos", label: "Equipamentos" },
  { to: "/acabamentos", label: "Acabamentos" },
];

export default function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const loc = useLocation();
  const { sessao } = useAuth();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 22,
        padding: "calc(16px + var(--sat)) calc(24px + var(--sar)) 16px calc(24px + var(--sal))",
        borderBottom: "2px solid var(--gold)", flexWrap: "wrap",
      }}>
        <Link to="/" className="brandface" style={{ fontSize: 26 }}>
          HERITAGE <span style={{ color: "var(--gold)" }}>PLANNER</span>
        </Link>
        <nav style={{ display: "flex", gap: 6 }}>
          {nav.map((n) => {
            const active = n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className="btn" style={{
                borderColor: active ? "var(--gold)" : "var(--line-2)",
                color: active ? "var(--gold)" : "#d9d9d4",
              }}>{n.label}</Link>
            );
          })}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {actions}
          {online && sessao && (
            <button className="btn" onClick={() => void sair()} title="Encerrar a sessão">Sair</button>
          )}
        </div>
      </header>
      <main style={{
        flex: 1, overflow: "auto",
        padding: "24px calc(24px + var(--sar)) calc(24px + var(--sab)) calc(24px + var(--sal))",
      }}>{children}</main>
    </div>
  );
}
