import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Projetos" },
  { to: "/equipamentos", label: "Equipamentos" },
  { to: "/acabamentos", label: "Acabamentos" },
];

export default function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const loc = useLocation();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 22, padding: "16px 24px",
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
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>{actions}</div>
      </header>
      <main style={{ flex: 1, padding: 24, overflow: "auto" }}>{children}</main>
    </div>
  );
}
