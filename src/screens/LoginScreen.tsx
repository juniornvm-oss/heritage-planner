// Tela de login (e-mail + senha) — porta única da plataforma.
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { entrar, useAuth } from "../lib/auth";
import { online } from "../lib/supabase";

export default function LoginScreen() {
  const nav = useNavigate();
  const loc = useLocation();
  const { carregando, sessao } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const destino = (loc.state as { from?: string } | null)?.from || "/";

  // Sem Supabase (modo local) ou já logado: não faz sentido ficar aqui.
  if (!online || (!carregando && sessao)) return <Navigate to={destino} replace />;

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setBusy(true);
    try {
      await entrar(email, senha);
      nav(destino, { replace: true });
    } catch (err) {
      setErro((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      padding: "calc(24px + var(--sat)) calc(24px + var(--sar)) calc(24px + var(--sab)) calc(24px + var(--sal))",
    }}>
      <div style={{ display: "grid", gap: 18, width: "min(380px, 100%)", justifyItems: "center" }}>
      <img src="/logo.png" alt="Heritage GymBuilder"
        style={{ width: "min(280px, 82%)", height: "auto", borderRadius: 16 }} />
      <form onSubmit={submeter} className="card" style={{ padding: 30, display: "grid", gap: 18, width: "100%" }}>
        <div style={{ textAlign: "center" }}>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>Acesso restrito — entre para continuar.</span>
        </div>

        <hr className="hairline" />

        <label style={{ display: "grid", gap: 5 }}>
          <span className="microlabel">E-mail</span>
          <input className="fld" type="email" autoComplete="username" inputMode="email"
            value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>

        <label style={{ display: "grid", gap: 5 }}>
          <span className="microlabel">Senha</span>
          <input className="fld" type="password" autoComplete="current-password"
            value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>

        {erro && <div style={{ color: "#e88", fontSize: 13, textAlign: "center" }}>{erro}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: "center", padding: "13px" }}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
      </div>
    </div>
  );
}
