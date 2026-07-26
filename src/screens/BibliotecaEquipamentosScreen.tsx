import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import Shell from "../ui/Shell";
import { useLibrary } from "../store/libraryStore";
import { inserirEquipamentos, online } from "../lib/supabase";
import { lerEquipamentos } from "../lib/readers";
import { ZONAS, type Equipamento } from "../lib/types";
import { BRL } from "../lib/units";

export default function BibliotecaEquipamentosScreen() {
  const equipamentos = useLibrary((s) => s.equipamentos);
  const addEquipamentos = useLibrary((s) => s.addEquipamentos);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

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
        <Link to="/equipamentos/novo" className="btn btn-gold">＋ Cadastrar</Link>
      </>
    }>
      <h1 className="brandface" style={{ fontSize: 28, color: "var(--gold)", marginBottom: 4 }}>BIBLIOTECA DE EQUIPAMENTOS</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>{equipamentos.length} itens {status ? "· " + status : ""}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
        {equipamentos.map((m, i) => (
          <Link key={(m.id || m.nome) + i} to={`/equipamentos/${encodeURIComponent(m.id || m.nome)}`}
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit",
            background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px" }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: ZONAS[m.zona]?.cor || "#888" }} />
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{m.nome}</span>
            {(m.contorno || m.imagem) && <span title="tem desenho" style={{ fontSize: 11, color: "var(--gold)" }}>◱</span>}
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{m.largura_cm}×{m.profundidade_cm}</span>
            {m.preco ? <span style={{ color: "var(--gold)", fontSize: 12 }}>{BRL(m.preco)}</span> : null}
            <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 2 }}>✎</span>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
