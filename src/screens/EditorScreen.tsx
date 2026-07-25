import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type Konva from "konva";
import EditorCanvas from "../editor/EditorCanvas";
import { useProjeto } from "../store/projetoStore";
import { useLibrary } from "../store/libraryStore";
import { obterProjeto } from "../lib/supabase";
import { heritageProjeto } from "../lib/seed";
import { lerPlanta } from "../lib/planta";
import { exportarPdf } from "../lib/export/pdfExport";
import { resumo } from "../lib/validation";
import { snapCm } from "../lib/canvas";
import { BRL, formatLength, parseLength } from "../lib/units";
import { ZONAS, CENARIOS, TAXA_ASSESSORIA, type Zona, type Cenario, type ItemPosicionado, type Equipamento } from "../lib/types";

export default function EditorScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const { projeto, cena, selectedId, dirty, salvando } = useProjeto();
  const { abrir, selecionar, addItem, updateItem, removerSelecionado, girarSelecionado, setPlanta, updatePlanta, undo, redo, salvar } = useProjeto();
  const equipamentos = useLibrary((s) => s.equipamentos);

  const [erro, setErro] = useState<string | null>(null);
  const [modoCalibrar, setModoCalibrar] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      if (id === "heritage") { abrir(heritageProjeto()); return; }
      try {
        const p = await obterProjeto(id);
        if (!p) { setErro("Projeto não encontrado."); return; }
        abrir(p);
      } catch {
        // offline / sem Supabase → abre o modelo Heritage como demonstração
        abrir(heritageProjeto());
      }
    })();
  }, [id, abrir]);

  const r = resumo(cena);
  const selItem = cena.itens.find((i) => i.id === selectedId) || null;
  const teto = Number(projeto?.orcamento_teto) || 0;
  const saldo = teto - r.subtotal;

  function adicionar(m: Equipamento) {
    const w = m.largura_cm, h = m.profundidade_cm;
    const item: ItemPosicionado = {
      id: crypto.randomUUID(),
      equipamentoId: m.id ?? null,
      nome: m.nome,
      x_cm: snapCm(cena.sala.largura_cm / 2 - w / 2),
      y_cm: snapCm(cena.sala.profundidade_cm / 2 - h / 2),
      w_cm: w, h_cm: h, rotacao: 0, zona: m.zona, cenario: "balanceado", preco: m.preco,
    };
    addItem(item);
  }

  async function importarPlanta(file?: File | null) {
    if (!file) return;
    setBusy("Lendo planta…");
    setErro(null);
    try {
      const bmp = await lerPlanta(file);
      const cmPorPx = cena.sala.largura_cm / bmp.larguraPx; // começa do tamanho da sala; calibre depois
      setPlanta({ dataUrl: bmp.dataUrl, larguraPx: bmp.larguraPx, alturaPx: bmp.alturaPx, x_cm: 0, y_cm: 0, cmPorPx, rotacao: 0, opacidade: 0.55, bloqueada: false });
    } catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  function onCalibrar(distanciaMundoCm: number) {
    setModoCalibrar(false);
    if (!cena.planta) return;
    const entrada = window.prompt("Distância real entre os 2 pontos (ex.: 500 ou 5 m):", "500");
    const real = entrada ? parseLength(entrada) : null;
    if (!real || distanciaMundoCm <= 0) return;
    updatePlanta({ cmPorPx: cena.planta.cmPorPx * (real / distanciaMundoCm) });
  }

  async function exportar() {
    if (!projeto) return;
    setBusy("Gerando PDF…");
    try {
      const png = stageRef.current ? stageRef.current.toDataURL({ pixelRatio: 2 }) : null;
      await exportarPdf({ ...projeto, cena }, png);
    } catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  if (erro) return <Centro><p style={{ color: "var(--red)" }}>{erro}</p><button className="btn" onClick={() => nav("/")}>Voltar</button></Centro>;
  if (!projeto) return <Centro><p style={{ color: "var(--muted)" }}>Carregando projeto…</p></Centro>;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "calc(8px + var(--sat)) calc(12px + var(--sar)) 8px calc(12px + var(--sal))", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <button className="btn" onClick={() => nav("/")}>←</button>
        <span className="brandface" style={{ fontSize: 18, color: "var(--gold)" }}>{projeto.nome}</span>
        {id && id !== "heritage" && (
          <button className="btn" onClick={() => nav(`/projeto/${id}/leitura`)} style={{ padding: "8px 11px", fontSize: 11.5 }} title="Revisar a Leitura do Condomínio">
            ◱ Leitura
          </button>
        )}
        <span className="chip" style={{ padding: "3px 10px", fontSize: 10.5, borderColor: "var(--gold)", color: "var(--gold)" }}>Fase 02 · Projeto Funcional</span>
        <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />
        <input ref={fileRef} type="file" accept=".pdf,.dwg,.dxf,image/*" style={{ display: "none" }} onChange={(e) => importarPlanta(e.target.files?.[0])} />
        <button className="btn btn-blue" onClick={() => fileRef.current?.click()}>⭱ Planta</button>
        <button className="btn" disabled={!cena.planta} onClick={() => setModoCalibrar((v) => !v)} style={modoCalibrar ? { borderColor: "#5FC8E8", color: "#8fd6f0" } : undefined}>📐 Calibrar</button>
        <button className="btn" disabled={!selItem} onClick={() => girarSelecionado()}>↻ Girar</button>
        <button className="btn" disabled={!selItem} onClick={removerSelecionado}>✕</button>
        <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />
        <button className="btn" onClick={undo}>⤺</button>
        <button className="btn" onClick={redo}>⤻</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {busy && <span style={{ fontSize: 12, color: "var(--gold)" }}>{busy}</span>}
          {modoCalibrar && <span style={{ fontSize: 12, color: "#8fd6f0" }}>toque 2 pontos de medida conhecida</span>}
          <button className="btn btn-gold" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : dirty ? "💾 Salvar" : "✓ Salvo"}</button>
          <button className="btn btn-blue" onClick={exportar}>⤓ PDF</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Rail esquerdo: biblioteca */}
        <aside style={{ width: 210, flexShrink: 0, borderRight: "1px solid var(--line)", overflow: "auto", padding: "10px 10px 10px calc(10px + var(--sal))" }}>
          <div className="brandface" style={{ fontSize: 15, color: "var(--gold)", marginBottom: 8 }}>BIBLIOTECA</div>
          <div style={{ display: "grid", gap: 5 }}>
            {equipamentos.map((m, i) => (
              <button key={(m.id || m.nome) + i} onClick={() => adicionar(m)} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
                background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px",
                color: "#c9c9c4", font: "600 12px 'DM Sans'", textAlign: "left", cursor: "pointer",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: ZONAS[m.zona]?.cor }} />{m.nome}
                </span>
                <span style={{ color: "#6e6e73", fontWeight: 400 }}>{m.largura_cm}×{m.profundidade_cm}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <EditorCanvas modoCalibrar={modoCalibrar} onCalibrar={onCalibrar} stageRef={stageRef} />
        </div>

        {/* Inspetor direito */}
        <aside style={{ width: 220, flexShrink: 0, borderLeft: "1px solid var(--line)", overflow: "auto", padding: "12px calc(12px + var(--sar)) 12px 12px" }}>
          {selItem ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>{selItem.nome}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Dimensões (proporção travada)<br />
                <b style={{ color: "#e9e9e6", fontSize: 14 }}>{formatLength(selItem.w_cm)} × {formatLength(selItem.h_cm)}</b>
              </div>
              <Bloco label="ZONA">
                <select className="fld" value={selItem.zona} onChange={(e) => updateItem(selItem.id, { zona: e.target.value as Zona })}>
                  {Object.entries(ZONAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Bloco>
              <Bloco label="CENÁRIO">
                <div style={{ display: "flex", gap: 4 }}>
                  {(Object.keys(CENARIOS) as Cenario[]).map((k) => (
                    <button key={k} className="btn" onClick={() => updateItem(selItem.id, { cenario: k })} style={{
                      flex: 1, padding: "8px 4px", fontSize: 10.5,
                      borderColor: selItem.cenario === k ? CENARIOS[k].cor : "var(--line-2)",
                      color: selItem.cenario === k ? CENARIOS[k].cor : "var(--muted)",
                    }}>{CENARIOS[k].label}</button>
                  ))}
                </div>
              </Bloco>
              {selItem.preco ? <div style={{ fontSize: 13, color: "var(--gold)" }}>{BRL(selItem.preco)}</div> : null}
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => girarSelecionado()}>↻ Girar</button>
                <button className="btn" style={{ flex: 1 }} onClick={removerSelecionado}>✕ Remover</button>
              </div>
            </div>
          ) : cena.planta ? (
            <PlantaInspector />
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>
              Toque um equipamento da biblioteca para adicioná-lo. Arraste na planta para posicionar.
              <br /><br />Importe a <b>planta baixa</b> (PDF/DWG) e use <b>Calibrar</b> para deixar tudo em escala real.
            </div>
          )}
        </aside>
      </div>

      {/* Rodapé: validação */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px calc(12px + var(--sar)) calc(7px + var(--sab)) calc(12px + var(--sal))", borderTop: "1px solid var(--line)", flexWrap: "wrap", flexShrink: 0 }}>
        <Chip ok={r.nCol === 0} txt={r.nCol === 0 ? "Sem colisões" : `${r.nCol} colisão(ões)`} />
        <Chip ok={r.nCor === 0} warn txt={r.nCor === 0 ? "Corredor livre" : `${r.nCor} no corredor`} />
        <Chip neutro txt={`Ocupação ${r.ocupacao}%`} />
        <Chip neutro txt={`Equipamentos ${cena.itens.length}`} />
        <Chip gold txt={BRL(r.subtotal)} />
        <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
        {(Object.keys(CENARIOS) as Cenario[]).map((k) => (
          <span key={k} style={{ border: `1px solid ${CENARIOS[k].cor}`, color: CENARIOS[k].cor, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 700 }}>
            {CENARIOS[k].label} {BRL(r.cenarios[k])}
          </span>
        ))}
        {teto > 0 && <span style={{ marginLeft: "auto", fontSize: 12, color: saldo >= 0 ? "var(--green)" : "var(--red)" }}>
          Teto {BRL(teto)} · Assessoria {BRL(Math.round(teto * TAXA_ASSESSORIA))} · Saldo {BRL(saldo)}
        </span>}
      </div>
    </div>
  );
}

function PlantaInspector() {
  const planta = useProjeto((s) => s.cena.planta)!;
  const updatePlanta = useProjeto((s) => s.updatePlanta);
  const setPlanta = useProjeto((s) => s.setPlanta);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PLANTA BAIXA</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>Escala: <b style={{ color: "#e9e9e6" }}>{planta.cmPorPx.toFixed(3)} cm/px</b><br />Use "Calibrar" na barra para ajustar.</div>
      <Bloco label={`OPACIDADE ${Math.round(planta.opacidade * 100)}%`}>
        <input type="range" min={0} max={1} step={0.05} value={planta.opacidade} onChange={(e) => updatePlanta({ opacidade: +e.target.value })} style={{ width: "100%" }} />
      </Bloco>
      <button className="btn" onClick={() => setPlanta(null)}>Remover planta</button>
    </div>
  );
}

const Bloco = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "grid", gap: 5 }}>
    <span style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".08em" }}>{label}</span>
    {children}
  </div>
);

const Centro = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center" }}>{children}</div>
);

function Chip({ txt, ok, warn, gold, neutro }: { txt: string; ok?: boolean; warn?: boolean; gold?: boolean; neutro?: boolean }) {
  const cor = neutro ? "#8A8A8F" : gold ? "#C9A227" : ok ? "#5FBF7A" : warn ? "#E09A45" : "#E04545";
  return <span style={{ border: `1px solid ${cor}`, color: cor, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 700 }}>{txt}</span>;
}
