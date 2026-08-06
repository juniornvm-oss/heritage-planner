import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { online } from "../lib/supabase";
import { sair, useAuth } from "../lib/auth";

const nav = [
  { to: "/", label: "Início" },
  { to: "/projetos", label: "Projetos" },
  { to: "/solicitacoes", label: "Solicitações" },
  { to: "/equipamentos", label: "Equipamentos" },
  { to: "/acabamentos", label: "Acabamentos" },
  { to: "/marcas", label: "Marcas" },
  { to: "/cadastro", label: "Cadastro" },
];

export default function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const loc = useLocation();
  const { sessao } = useAuth();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="appbar safe-top" style={{
        display: "flex", alignItems: "center", gap: 20,
        padding: "14px calc(22px + var(--sar)) 14px calc(22px + var(--sal))",
        flexWrap: "wrap", position: "sticky", top: 0, zIndex: 20,
      }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <img src="/icons/icon-192.png" alt="" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span className="brandface" style={{ fontSize: 22, lineHeight: 1 }}>
            HERITAGE <span style={{ color: "var(--gold)" }}>GYMBUILDER</span>
          </span>
        </Link>
        <nav className="nav">
          {nav.map((n) => {
            const active = n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={"nav-link" + (active ? " active" : "")}>{n.label}</Link>
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
