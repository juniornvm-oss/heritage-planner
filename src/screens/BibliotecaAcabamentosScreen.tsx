import { useState } from "react";
import Shell from "../ui/Shell";
import { useLibrary } from "../store/libraryStore";
import { inserirAcabamento, online } from "../lib/supabase";
import { ACABAMENTOS_LOCAL } from "../lib/seed";
import type { Acabamento } from "../lib/types";
import { BRL } from "../lib/units";

const TIPOS: Acabamento["tipo"][] = ["piso", "parede", "teto", "outro"];

export default function BibliotecaAcabamentosScreen() {
  const acabamentos = useLibrary((s) => s.acabamentos);
  const [lista, setLista] = useState<Acabamento[]>(acabamentos);
  const [status, setStatus] = useState<string | null>(null);
  const [novo, setNovo] = useState<Acabamento>({ nome: "", tipo: "piso", cor: "#241C12", preco_m2: 0, fornecedor: "" });
  const [semeando, setSemeando] = useState(false);

  async function semear() {
    const existentes = new Set(lista.map((a) => a.nome.toLowerCase()));
    const faltam = ACABAMENTOS_LOCAL.filter((a) => !existentes.has(a.nome.toLowerCase()));
    if (!faltam.length) { setStatus("Todos os acabamentos de alto padrão já estão na lista."); return; }
    setSemeando(true); setStatus(null);
    setLista((l) => [...l, ...faltam]);
    if (online) {
      let n = 0;
      for (const a of faltam) { try { await inserirAcabamento(a); n++; } catch { /* segue */ } }
      setStatus(`${n} acabamento(s) de alto padrão adicionados.`);
    } else setStatus(`${faltam.length} adicionados localmente (Supabase não configurado).`);
    setSemeando(false);
  }

  async function adicionar() {
    if (!novo.nome.trim()) return;
    setLista((l) => [...l, novo]);
    if (online) {
      try { await inserirAcabamento(novo); setStatus("Salvo."); }
      catch (e) { setStatus("Salvo localmente (Supabase: " + (e as Error).message + ")"); }
    }
    setNovo({ nome: "", tipo: "piso", cor: "#241C12", preco_m2: 0, fornecedor: "" });
  }

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 className="brandface" style={{ fontSize: 28, color: "var(--gold)", marginBottom: 4 }}>BIBLIOTECA DE ACABAMENTOS</h1>
        <button className="btn" disabled={semeando} onClick={semear}>{semeando ? "Semeando…" : "✦ Semear alto padrão"}</button>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>
        Pisos, paredes e revestimentos. {status ? "· " + status : ""}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 20,
        padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" }}>
        <input className="fld" style={{ width: 200 }} placeholder="Nome (ex.: Vinílico Amadeirado)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
        <select className="fld" style={{ width: 120 }} value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as Acabamento["tipo"] })}>
          {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="fld" style={{ width: 70, padding: 4, height: 42 }} type="color" value={novo.cor || "#241C12"} onChange={(e) => setNovo({ ...novo, cor: e.target.value })} />
        <input className="fld" style={{ width: 120 }} type="number" placeholder="R$/m²" value={novo.preco_m2 || 0} onChange={(e) => setNovo({ ...novo, preco_m2: +e.target.value })} />
        <input className="fld" style={{ width: 160 }} placeholder="Fornecedor" value={novo.fornecedor || ""} onChange={(e) => setNovo({ ...novo, fornecedor: e.target.value })} />
        <button className="btn btn-gold" disabled={!novo.nome.trim()} onClick={adicionar}>Adicionar</button>
      </div>

      {!lista.length && <p style={{ color: "var(--muted)", fontSize: 14 }}>Nenhum acabamento cadastrado ainda.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
        {lista.map((a, i) => (
          <div key={(a.id || a.nome) + i} style={{ display: "flex", alignItems: "center", gap: 10,
            background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px" }}>
            <span style={{ width: 18, height: 18, borderRadius: 4, background: a.cor || "#333", border: "1px solid #0006" }} />
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{a.nome}</span>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>{a.tipo}</span>
            {a.preco_m2 ? <span style={{ color: "var(--gold)", fontSize: 12 }}>{BRL(a.preco_m2)}/m²</span> : null}
          </div>
        ))}
      </div>
    </Shell>
  );
}
