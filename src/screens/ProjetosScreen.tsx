import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { listarProjetos, online } from "../lib/supabase";
import type { Projeto } from "../lib/types";
import { BRL } from "../lib/units";

export default function ProjetosScreen() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        setProjetos(await listarProjetos());
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  return (
    <Shell actions={<Link to="/novo" className="btn btn-gold">+ Novo projeto</Link>}>
      <h1 className="brandface" style={{ fontSize: 28, color: "var(--gold)", marginBottom: 4 }}>PROJETOS</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
        {online ? "Assessoria de implantação de academias." : "Modo local (Supabase não configurado)."}
      </p>

      {carregando && <p style={{ color: "var(--muted)" }}>Carregando…</p>}
      {erro && <p style={{ color: "var(--red)" }}>Erro: {erro}</p>}
      {!carregando && !projetos.length && !erro && (
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          Nenhum projeto ainda. <Link to="/novo" style={{ color: "var(--gold)" }}>Crie o primeiro</Link>.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        <button onClick={() => nav("/projeto/heritage")} style={{
          textAlign: "left", background: "var(--panel)", border: "1px solid var(--gold)",
          borderRadius: 14, padding: 18, cursor: "pointer",
        }}>
          <div className="brandface" style={{ fontSize: 22, color: "var(--gold)" }}>Heritage (modelo)</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Projeto de exemplo · 25 equipamentos · abre no editor</div>
        </button>
        {projetos.map((p) => {
          const n = p.cena?.itens?.length ?? 0;
          const total = (p.cena?.itens ?? []).reduce((s, i) => s + (i.preco || 0), 0);
          return (
            <button key={p.id} onClick={() => nav(`/projeto/${p.id}`)} style={{
              textAlign: "left", background: "var(--panel)", border: "1px solid var(--line)",
              borderRadius: 14, padding: 18, cursor: "pointer",
            }}>
              <div className="brandface" style={{ fontSize: 22, color: "var(--gold)" }}>{p.nome}</div>
              {p.sindico && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>Síndico: {p.sindico}</div>}
              <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 12, color: "#c9c9c4" }}>
                <span>{n} equipamento(s)</span>
                {p.orcamento_teto ? <span>Teto {BRL(p.orcamento_teto)}</span> : null}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--gold)", fontWeight: 700 }}>{BRL(total)}</div>
            </button>
          );
        })}
      </div>
    </Shell>
  );
}
