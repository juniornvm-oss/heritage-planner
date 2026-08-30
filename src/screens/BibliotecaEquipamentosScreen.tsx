import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Shell from "../ui/Shell";
import { useLibrary } from "../store/libraryStore";
import { inserirEquipamentos, atualizarEquipamento, online } from "../lib/supabase";
import { lerEquipamentos } from "../lib/readers";
import { ZONAS, type Equipamento } from "../lib/types";
import { BRL } from "../lib/units";
import {
  BIBLIOTECA_MAQUINAS, MARCAS_MAQUINAS, csvDaBiblioteca, maquinasFaltando, silhuetasFaltando,
} from "../lib/catalogoMaquinas";

/** Parcerias comerciais já formalizadas pelo consultor. Elas aparecem primeiro,
 * sem bloquear outras marcas: a escolha final continua dependente do cliente. */
const MARCAS_PARCEIRAS = new Set(["Movement", "Nautilus"]);

export default function BibliotecaEquipamentosScreen() {
  const equipamentos = useLibrary((s) => s.equipamentos);
  const addEquipamentos = useLibrary((s) => s.addEquipamentos);
  const updateEquipamento = useLibrary((s) => s.updateEquipamento);
  const recarregar = useLibrary((s) => s.recarregar);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [filtroMarca, setFiltroMarca] = useState<string>("");
  const [busca, setBusca] = useState("");

  const faltando = useMemo(() => maquinasFaltando(equipamentos), [equipamentos]);
  const semSilhueta = useMemo(() => silhuetasFaltando(equipamentos), [equipamentos]);
  const qualidade = useMemo(() => {
    const ativos = equipamentos.filter((e) => e.ativo !== false);
    return {
      total: ativos.length,
      comFoto: ativos.filter((e) => !!e.imagem).length,
      comFonte: ativos.filter((e) => !!e.produto_url).length,
      conferidos: ativos.filter((e) => !!e.marca && !!e.modelo && e.largura_cm > 0 && e.profundidade_cm > 0).length,
    };
  }, [equipamentos]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return equipamentos.filter((e) => {
      if (e.ativo === false) return false;
      if (filtroMarca && (e.marca || "") !== filtroMarca) return false;
      if (!q) return true;
      return `${e.nome} ${e.marca ?? ""} ${e.modelo ?? ""}`.toLowerCase().includes(q);
    });
  }, [equipamentos, filtroMarca, busca]);

  const marcasNaLista = useMemo(() => {
    const s = new Set<string>();
    for (const e of equipamentos) if (e.marca && e.ativo !== false) s.add(e.marca);
    return [...s].sort((a, b) => {
      const prioridade = Number(MARCAS_PARCEIRAS.has(b)) - Number(MARCAS_PARCEIRAS.has(a));
      return prioridade || a.localeCompare(b, "pt-BR");
    });
  }, [equipamentos]);

  async function persistir(rows: Equipamento[]) {
    addEquipamentos(rows);
    if (online) {
      try {
        await inserirEquipamentos(rows);
        await recarregar();
      } catch (e) { setStatus("Salvo localmente (erro no Supabase: " + (e as Error).message + ")"); return; }
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

  async function carregarBiblioteca() {
    if (!faltando.length) { setStatus("A biblioteca internacional já está neste cadastro."); return; }
    setOcupado(true);
    try { await persistir(faltando); }
    finally { setOcupado(false); }
  }

  async function aplicarSilhuetas() {
    if (!semSilhueta.length) { setStatus("Todas as peças da biblioteca já têm silhueta de planta."); return; }
    setOcupado(true);
    try {
      for (const eq of semSilhueta) {
        updateEquipamento(eq.id || eq.nome, eq);
      }
      if (online) {
        const comId = semSilhueta.filter((e) => e.id);
        try {
          await Promise.all(comId.map((eq) => atualizarEquipamento(eq)));
          await recarregar();
        } catch (e) {
          setStatus("Silhuetas no aparelho (erro no Supabase: " + (e as Error).message + ")");
          return;
        }
      }
      setStatus(`${semSilhueta.length} silhueta(s) de planta aplicadas. Não são DWG de fabricante — são a cópia do footprint em cm.`);
    } finally {
      setOcupado(false);
    }
  }

  function baixarCsv() {
    const blob = new Blob([csvDaBiblioteca()], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "biblioteca-maquinas.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Shell actions={
      <>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
          onChange={(e) => onImport(e.target.files?.[0])} />
        <button className="btn" onClick={baixarCsv} title="Planilha da biblioteca Nautilus, Life Fitness, Hammer Strength, Matrix e Technogym">
          ↧ CSV da biblioteca
        </button>
        <button className="btn btn-blue" onClick={() => fileRef.current?.click()}>↥ Importar planilha</button>
        <Link to="/equipamentos/novo" className="btn btn-gold">＋ Cadastrar</Link>
      </>
    }>
      <h1 className="brandface" style={{ fontSize: 28, color: "var(--gold)", marginBottom: 4 }}>BIBLIOTECA DE EQUIPAMENTOS</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
        {equipamentos.length} itens {status ? "· " + status : ""}
      </p>

      <div className="card" style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 14 }}>
        <span className="brandface" style={{ color: "var(--gold)", fontSize: 14 }}>QUALIDADE DO CATÁLOGO</span>
        <span style={{ fontSize: 12, color: "#b6b6b1" }}><b>{qualidade.comFoto}/{qualidade.total}</b> com foto real</span>
        <span style={{ fontSize: 12, color: "#b6b6b1" }}><b>{qualidade.comFonte}/{qualidade.total}</b> com página oficial</span>
        <span style={{ fontSize: 12, color: qualidade.conferidos === qualidade.total ? "var(--green)" : "var(--warn)" }}>
          <b>{qualidade.conferidos}/{qualidade.total}</b> com modelo e medidas
        </span>
        <span style={{ fontSize: 11, color: "var(--muted)", flex: 1, minWidth: 240 }}>
          As fotos são meramente ilustrativas. A especificação final segue a cotação, a versão disponível e o poder de investimento do cliente.
        </span>
      </div>

      <div style={{
        background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 10,
        padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: "#b6b6b1", lineHeight: 1.55,
      }}>
        Na planta cada peça é a <b style={{ color: "#e9e9e6" }}>leitura do footprint em escala</b> (cm), no estilo de um DWG de layout: silhueta com console, banco, pilha e seta de entrada; caixa pontilhada; frente no topo e entrada na base. Os blocos CAD oficiais das marcas (Life Fitness Gym Planner, Matrix, Technogym, Nautilus, Hammer Strength) são proprietários — não entram no app. Se você tiver o arquivo, cole na ficha do equipamento (DWG/DXF/PDF) que extraímos só o contorno.
      </div>

      {faltando.length > 0 && (
        <div style={{
          display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap",
          background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 10,
          padding: "12px 14px", marginBottom: 16,
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="brandface" style={{ fontSize: 15, color: "var(--gold)", marginBottom: 4 }}>MAQUINÁRIO COMERCIAL</div>
            <div style={{ fontSize: 12.5, color: "#b6b6b1", lineHeight: 1.5 }}>
              {faltando.length} peças de {MARCAS_MAQUINAS.join(", ")} ainda não estão neste cadastro — medidas de ocupação em planta a partir das fichas técnicas. Preço entra pela cotação do projeto. Cada peça traz a silhueta de planta (cópia do footprint em cm, não o DWG do fabricante). Frente no topo, entrada na base — para ver onde posicionar em relação a parede, espelho e circulação.
            </div>
          </div>
          <button className="btn btn-gold" disabled={ocupado} onClick={() => void carregarBiblioteca()}>
            {ocupado ? "Incluindo…" : `＋ Incluir ${faltando.length} máquinas`}
          </button>
        </div>
      )}

      {semSilhueta.length > 0 && (
        <div style={{
          display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap",
          background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 10,
          padding: "12px 14px", marginBottom: 16,
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="brandface" style={{ fontSize: 15, color: "var(--gold)", marginBottom: 4 }}>SILHUETAS DE PLANTA</div>
            <div style={{ fontSize: 12.5, color: "#b6b6b1", lineHeight: 1.5 }}>
              {semSilhueta.length} peças já cadastradas ainda aparecem como retângulo. Aplica a cópia do footprint (vista de cima, com frente, lateral e entrada) — não substitui um desenho que você já colou na ficha.
            </div>
          </div>
          <button className="btn btn-gold" disabled={ocupado} onClick={() => void aplicarSilhuetas()}>
            {ocupado ? "Aplicando…" : `Aplicar ${semSilhueta.length} silhuetas`}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <input className="fld" placeholder="Buscar nome, marca, modelo…" value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ padding: "8px 10px", fontSize: 13, width: 260 }} />
        <button className="btn" onClick={() => setFiltroMarca("")}
          style={filtroMarca === "" ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}>Todas</button>
        {marcasNaLista.map((m) => (
          <button key={m} className="btn" onClick={() => setFiltroMarca(filtroMarca === m ? "" : m)}
            style={filtroMarca === m ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}>
            {MARCAS_PARCEIRAS.has(m) ? "★ " : ""}{m}
          </button>
        ))}
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{visiveis.length} visíveis</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {visiveis.map((m, i) => (
          <Link key={(m.id || m.nome) + i} to={`/equipamentos/${encodeURIComponent(m.id || m.nome)}`}
            style={{ display: "grid", gap: 3, textDecoration: "none", color: "inherit",
            background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 9, padding: "9px 12px" }}>
            <MiniSilhueta eq={m} />
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: ZONAS[m.zona]?.cor || "#888", flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{m.nome}</span>
              {m.marca && MARCAS_PARCEIRAS.has(m.marca) && <span title="Parceria comercial formalizada" style={{ color: "var(--gold)", fontSize: 11 }}>★ parceiro</span>}
              {(m.contorno || m.imagem) && <span title="tem desenho" style={{ fontSize: 11, color: "var(--gold)" }}>◱</span>}
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", color: "#6e6e73", fontSize: 11.5, gap: 8 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[m.marca, m.modelo].filter(Boolean).join(" · ") || ZONAS[m.zona]?.label}
              </span>
              <span>{m.largura_cm}×{m.profundidade_cm}{m.preco ? ` · ${BRL(m.preco)}` : ""}</span>
            </span>
            <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 3 }}>
              {m.imagem && <span className="chip" style={{ padding: "1px 6px", fontSize: 9.5, color: "var(--muted)" }}>imagem ilustrativa</span>}
              {m.produto_url && <span className="chip" style={{ padding: "1px 6px", fontSize: 9.5, color: "var(--info-soft)" }}>fonte oficial</span>}
            </span>
          </Link>
        ))}
      </div>
      {visiveis.length === 0 && (
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>Nenhum equipamento com esse filtro.</div>
      )}
      <p style={{ color: "#6e6e73", fontSize: 11.5, marginTop: 18, lineHeight: 1.5 }}>
        {BIBLIOTECA_MAQUINAS.length} peças na biblioteca internacional (Nautilus Impact, Life Fitness Integrity/Optima, Hammer Strength Iso-Lateral, Matrix Ultra/Versa, Technogym Excite/Selection). O footprint vai para a planta em cm, no mesmo espírito de um layout DWG: silhueta com frente no topo, entrada na base, caixa pontilhada e medida. Não incluímos DWG/3D proprietários dos fabricantes — a cópia de planta já vem na peça; se você tiver o bloco CAD oficial, cole na ficha (DWG/DXF/PDF) que extraímos o contorno em escala. O CSV baixa essa lista para conferir ou reimportar.
      </p>
    </Shell>
  );
}

function pts(pl: number[]): string {
  const out: string[] = [];
  for (let i = 0; i + 1 < pl.length; i += 2) out.push(`${pl[i]},${pl[i + 1]}`);
  return out.join(" ");
}

function MiniSilhueta({ eq }: { eq: Equipamento }) {
  const c = eq.contorno;
  if (!c?.length) {
    return (
      <div style={{ height: 56, border: "1px dashed var(--line)", borderRadius: 6, background: "var(--panel)" }} />
    );
  }
  return (
    <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet"
      style={{ height: 56, width: "100%", background: "var(--panel)", border: "1px dashed var(--line)", borderRadius: 6 }}>
      {c.map((pl, i) => (
        <polyline key={i} points={pts(pl)} fill="none" stroke={ZONAS[eq.zona]?.cor || "#C9A227"} strokeWidth={0.018} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
