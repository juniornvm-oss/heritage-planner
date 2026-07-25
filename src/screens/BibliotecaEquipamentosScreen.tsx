import { useRef, useState } from "react";
import Shell from "../ui/Shell";
import { useLibrary } from "../store/libraryStore";
import { inserirEquipamentos, online } from "../lib/supabase";
import { lerEquipamentos } from "../lib/readers";
import { ZONAS, type Equipamento, type Zona } from "../lib/types";
import { BRL } from "../lib/units";

export default function BibliotecaEquipamentosScreen() {
  const equipamentos = useLibrary((s) => s.equipamentos);
  const addEquipamentos = useLibrary((s) => s.addEquipamentos);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [novo, setNovo] = useState<Equipamento>({ nome: "", largura_cm: 100, profundidade_cm: 100, zona: "livre", preco: 0 });

  async function persistir(rows: Equipamento[]) {
    addEquipamentos(rows);
    if (online) {
      try { await inserirEquipamentos(rows); } catch (e) { setStatus("Salvo localmente (erro no Supabase: " + (e as Error).message + ")"); return; }
    }
    setStatus(`${rows.length} equipamento(s) adicionados.`);
  }

  async function onImport(file?: File | null) {
    if (!file) return;
    setStatus("Lendo…");
    try {
      const rows = await lerEquipamentos(file);
      if (!rows.length) { setStatus("Nenhuma linha reconhecida (verifique as colunas)."); return; }
      await persistir(rows);
    } catch (e) { setStatus((e as Error).message); }
  }

  return (
    <Shell actions={
      <>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
          onChange={(e) => onImport(e.target.files?.[0])} />
        <button className="btn btn-blue" onClick={() => fileRef.current?.click()}>⭱ Importar planilha</button>
      </>
    }>
      <h1 className="brandface" style={{ fontSize: 28, color: "var(--gold)", marginBottom: 4 }}>BIBLIOTECA DE EQUIPAMENTOS</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>{equipamentos.length} itens {status ? "· " + status : ""}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 20,
        padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" }}>
        <input className="fld" style={{ width: 200 }} placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
        <input className="fld" style={{ width: 90 }} type="number" placeholder="Larg" value={novo.largura_cm} onChange={(e) => setNovo({ ...novo, largura_cm: +e.target.value })} />
        <input className="fld" style={{ width: 90 }} type="number" placeholder="Prof" value={novo.profundidade_cm} onChange={(e) => setNovo({ ...novo, profundidade_cm: +e.target.value })} />
        <select className="fld" style={{ width: 130 }} value={novo.zona} onChange={(e) => setNovo({ ...novo, zona: e.target.value as Zona })}>
          {Object.entries(ZONAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input className="fld" style={{ width: 110 }} type="number" placeholder="Preço" value={novo.preco} onChange={(e) => setNovo({ ...novo, preco: +e.target.value })} />
        <button className="btn btn-gold" disabled={!novo.nome.trim()} onClick={() => { void persistir([novo]); setNovo({ nome: "", largura_cm: 100, profundidade_cm: 100, zona: "livre", preco: 0 }); }}>Adicionar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
        {equipamentos.map((m, i) => (
          <div key={(m.id || m.nome) + i} style={{ display: "flex", alignItems: "center", gap: 10,
            background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px" }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: ZONAS[m.zona]?.cor || "#888" }} />
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{m.nome}</span>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{m.largura_cm}×{m.profundidade_cm}</span>
            {m.preco ? <span style={{ color: "var(--gold)", fontSize: 12 }}>{BRL(m.preco)}</span> : null}
          </div>
        ))}
      </div>
    </Shell>
  );
}
