import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type Konva from "konva";
import EditorCanvas from "../editor/EditorCanvas";
import { useProjeto } from "../store/projetoStore";
import { useLibrary } from "../store/libraryStore";
import { obterProjeto, criarProjeto, obterConfigConsultor } from "../lib/supabase";
import { heritageProjeto } from "../lib/seed";
import { lerPlanta } from "../lib/planta";
import { lerPlantaVetorial } from "../lib/plantaVetorial";
import { exportarPdf } from "../lib/export/pdfExport";
import { resumo } from "../lib/validation";
import { snapCm } from "../lib/canvas";
import { BRL, formatLength, parseLength } from "../lib/units";
import { ZONAS, CENARIOS, TAXA_ASSESSORIA, type Zona, type Cenario, type ItemPosicionado, type Equipamento, type AreaAcabamento } from "../lib/types";

export default function EditorScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const somenteLeitura = id === "heritage"; // projeto legado: só visualização (evita os bugs de edição)
  const { projeto, cena, selectedId, selectedAcabId, dirty, salvando } = useProjeto();
  const { abrir, selecionar, addItem, updateItem, removerSelecionado, girarSelecionado, setPlanta, updatePlanta, setPlantaVetorial, updatePlantaVetorial, recortarVetorial, addArea, undo, redo, salvar } = useProjeto();
  const equipamentos = useLibrary((s) => s.equipamentos);
  const acabamentos = useLibrary((s) => s.acabamentos);

  const [erro, setErro] = useState<string | null>(null);
  const [modoCalibrar, setModoCalibrar] = useState(false);
  const [modoAcabamento, setModoAcabamento] = useState(false);
  const [modoRecorte, setModoRecorte] = useState(false);
  const [modoParede, setModoParede] = useState(false);
  const [modoMoverPlanta, setModoMoverPlanta] = useState(false);
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
  const selAcab = (cena.acabamentos ?? []).find((a) => a.id === selectedAcabId) || null;
  const teto = Number(projeto?.orcamento_teto) || 0;
  const saldo = teto - r.subtotal;

  function onArea(rect: { x: number; y: number; w: number; h: number }) {
    const ac = acabamentos[0];
    const area: AreaAcabamento = {
      id: crypto.randomUUID(),
      acabamentoId: ac?.id ?? null,
      nome: ac?.nome ?? "Piso",
      tipo: (ac?.tipo === "parede" ? "parede" : "piso"),
      cor: ac?.cor ?? "#8A7B5C",
      preco_m2: ac?.preco_m2 ?? null,
      x_cm: rect.x, y_cm: rect.y, w_cm: rect.w, h_cm: rect.h,
    };
    addArea(area);
    setModoAcabamento(false);
  }

  function adicionar(m: Equipamento) {
    const w = m.largura_cm, h = m.profundidade_cm;
    const item: ItemPosicionado = {
      id: crypto.randomUUID(),
      equipamentoId: m.id ?? null,
      nome: m.nome,
      x_cm: snapCm(cena.sala.largura_cm / 2 - w / 2),
      y_cm: snapCm(cena.sala.profundidade_cm / 2 - h / 2),
      w_cm: w, h_cm: h, rotacao: 0, zona: m.zona, cenario: "balanceado", preco: m.preco,
      imagem: m.imagem ?? null, contorno: m.contorno ?? null,
    };
    addItem(item);
  }

  async function importarPlanta(file?: File | null) {
    if (!file) return;
    setBusy("Lendo planta…");
    setErro(null);
    try {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (ext === "dxf" || ext === "dwg" || ext === "pdf") {
        const pv = await lerPlantaVetorial(file); // desenho vetorial separado do texto
        if (pv) { setPlantaVetorial(pv); return; }
        // sem geometria (ex.: PDF escaneado) → cai no raster
      }
      const bmp = await lerPlanta(file);
      const cmPorPx = cena.sala.largura_cm / bmp.larguraPx; // começa do tamanho da sala; calibre depois
      setPlanta({ dataUrl: bmp.dataUrl, larguraPx: bmp.larguraPx, alturaPx: bmp.alturaPx, x_cm: 0, y_cm: 0, cmPorPx, rotacao: 0, opacidade: 0.55, bloqueada: false });
    } catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  function onCalibrar(distanciaMundoCm: number) {
    setModoCalibrar(false);
    const entrada = window.prompt("Distância real entre os 2 pontos (ex.: 500 ou 5 m):", "500");
    const real = entrada ? parseLength(entrada) : null;
    if (!real || distanciaMundoCm <= 0) return;
    if (cena.plantaVetorial) { updatePlantaVetorial({ escala: (cena.plantaVetorial.escala || 1) * (real / distanciaMundoCm) }); return; }
    if (cena.planta) updatePlanta({ cmPorPx: cena.planta.cmPorPx * (real / distanciaMundoCm) });
  }

  // Enquadrar por parede de referência: escala (parede = comprimento real),
  // rotaciona (parede na horizontal) e encaixa o início da parede no canto (0,0) da sala.
  function onParede(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    setModoParede(false);
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (dist <= 0) return;
    const entrada = window.prompt("Comprimento real dessa parede (ex.: 500 ou 5 m):", "500");
    const real = entrada ? parseLength(entrada) : null;
    if (!real) return;

    const s = real / dist;
    const theta = -Math.atan2(p2.y - p1.y, p2.x - p1.x); // deixa a parede na horizontal (+X)
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const S = (qx: number, qy: number) => {
      const dx = qx - p1.x, dy = qy - p1.y;
      return { x: s * (cos * dx - sin * dy), y: s * (sin * dx + cos * dy) }; // âncora A = (0,0)
    };
    let thetaDeg = (theta * 180) / Math.PI;

    // rot atual + centro atual (para virar 180° se a planta cair acima da sala)
    const rot0 = cena.plantaVetorial?.rotacao ?? cena.planta?.rotacao ?? 0;
    const centro = centroPlanta();
    let nt = S(cena.plantaVetorial?.x_cm ?? cena.planta?.x_cm ?? 0, cena.plantaVetorial?.y_cm ?? cena.planta?.y_cm ?? 0);
    if (centro && S(centro.x, centro.y).y < 0) { // corpo caiu acima da parede → gira 180° em torno do meio da parede
      nt = { x: real - nt.x, y: -nt.y }; thetaDeg += 180;
    }

    if (cena.plantaVetorial) {
      const pv = cena.plantaVetorial;
      updatePlantaVetorial({ x_cm: nt.x, y_cm: nt.y, rotacao: (rot0 || 0) + thetaDeg, escala: (pv.escala || 1) * s });
    } else if (cena.planta) {
      const pl = cena.planta;
      updatePlanta({ x_cm: nt.x, y_cm: nt.y, rotacao: (rot0 || 0) + thetaDeg, cmPorPx: pl.cmPorPx * s });
    }
  }

  // Centro da planta no mundo atual (para heurística de virar 180°).
  function centroPlanta(): { x: number; y: number } | null {
    const rot = (g: number) => (g * Math.PI) / 180;
    if (cena.planta) {
      const pl = cena.planta;
      const hx = (pl.larguraPx * pl.cmPorPx) / 2, hy = (pl.alturaPx * pl.cmPorPx) / 2;
      const a = rot(pl.rotacao || 0);
      return { x: pl.x_cm + Math.cos(a) * hx - Math.sin(a) * hy, y: pl.y_cm + Math.sin(a) * hx + Math.cos(a) * hy };
    }
    if (cena.plantaVetorial) {
      const pv = cena.plantaVetorial;
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const t of pv.tracos) for (let i = 0; i < t.pts.length; i += 2) {
        mnx = Math.min(mnx, t.pts[i]); mxx = Math.max(mxx, t.pts[i]); mny = Math.min(mny, t.pts[i + 1]); mxy = Math.max(mxy, t.pts[i + 1]);
      }
      if (!Number.isFinite(mnx)) return { x: pv.x_cm, y: pv.y_cm };
      const cx = ((mnx + mxx) / 2) * (pv.escala || 1), cy = ((mny + mxy) / 2) * (pv.escala || 1);
      const a = rot(pv.rotacao || 0);
      return { x: pv.x_cm + Math.cos(a) * cx - Math.sin(a) * cy, y: pv.y_cm + Math.sin(a) * cx + Math.cos(a) * cy };
    }
    return null;
  }

  async function salvarComoNovo() {
    setBusy("Salvando…"); setErro(null);
    try {
      const p = await criarProjeto({ nome: projeto?.nome?.replace(" (modelo)", "") || "Heritage", orcamento_teto: projeto?.orcamento_teto ?? null, cena });
      nav(`/projeto/${p.id}`);
    } catch (e) { setErro((e as Error).message); setBusy(null); }
  }

  async function exportar() {
    if (!projeto) return;
    setBusy("Gerando PDF…");
    try {
      const png = stageRef.current ? stageRef.current.toDataURL({ pixelRatio: 2 }) : null;
      const config = await obterConfigConsultor();
      await exportarPdf({ ...projeto, cena }, png, equipamentos, config);
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
        {id && !somenteLeitura && (
          <button className="btn" onClick={() => nav(`/projeto/${id}/curadoria`)} style={{ padding: "8px 11px", fontSize: 11.5 }} title="Curadoria & Investimento">
            ⚖ Curadoria
          </button>
        )}
        {somenteLeitura
          ? <span className="chip" style={{ padding: "3px 10px", fontSize: 10.5, borderColor: "#8A8A8F", color: "#b6b6b1" }}>Referência · somente visualização</span>
          : <span className="chip" style={{ padding: "3px 10px", fontSize: 10.5, borderColor: "var(--gold)", color: "var(--gold)" }}>Fase 02 · Projeto Funcional</span>}
        {!somenteLeitura && (
          <>
            <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />
            <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => importarPlanta(e.target.files?.[0])} />
            <button className="btn btn-blue" onClick={() => fileRef.current?.click()}>⭱ Planta</button>
            <button className="btn" disabled={!cena.planta && !cena.plantaVetorial} onClick={() => { const v = !modoCalibrar; setModoCalibrar(v); setModoAcabamento(false); setModoRecorte(false); setModoParede(false); setModoMoverPlanta(false); }} style={modoCalibrar ? { borderColor: "#5FC8E8", color: "#8fd6f0" } : undefined}>📐 Calibrar</button>
            <button className="btn" disabled={!cena.planta && !cena.plantaVetorial} onClick={() => { const v = !modoParede; setModoParede(v); setModoCalibrar(false); setModoAcabamento(false); setModoRecorte(false); setModoMoverPlanta(false); }} style={modoParede ? { borderColor: "#C97BE0", color: "#C97BE0" } : undefined} title="Enquadrar a planta por uma parede de referência">📏 Parede</button>
            <button className="btn" disabled={!cena.planta && !cena.plantaVetorial} onClick={() => { const v = !modoMoverPlanta; setModoMoverPlanta(v); setModoCalibrar(false); setModoAcabamento(false); setModoRecorte(false); setModoParede(false); }} style={modoMoverPlanta ? { borderColor: "#5FBF7A", color: "#5FBF7A" } : undefined} title="Arrastar a planta de fundo para posicionar">🖐 Mover</button>
            <button className="btn" onClick={() => { setModoAcabamento((v) => !v); setModoCalibrar(false); setModoRecorte(false); setModoParede(false); setModoMoverPlanta(false); }} style={modoAcabamento ? { borderColor: "#C9A227", color: "#C9A227" } : undefined}>▦ Acabamento</button>
            {cena.plantaVetorial && <button className="btn" onClick={() => { setModoRecorte((v) => !v); setModoCalibrar(false); setModoAcabamento(false); setModoParede(false); setModoMoverPlanta(false); }} style={modoRecorte ? { borderColor: "#5FBF7A", color: "#5FBF7A" } : undefined}>✂ Recortar</button>}
            <button className="btn" disabled={!selItem} onClick={() => girarSelecionado()}>↻ Girar</button>
            <button className="btn" disabled={!selItem} onClick={removerSelecionado}>✕</button>
            <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />
            <button className="btn" onClick={undo}>⤺</button>
            <button className="btn" onClick={redo}>⤻</button>
          </>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {busy && <span style={{ fontSize: 12, color: "var(--gold)" }}>{busy}</span>}
          {modoCalibrar && <span style={{ fontSize: 12, color: "#8fd6f0" }}>toque 2 pontos de medida conhecida</span>}
          {modoParede && <span style={{ fontSize: 12, color: "#C97BE0" }}>toque as 2 pontas de uma parede de medida conhecida</span>}
          {modoMoverPlanta && <span style={{ fontSize: 12, color: "#5FBF7A" }}>arraste a planta para posicionar</span>}
          {modoAcabamento && <span style={{ fontSize: 12, color: "var(--gold)" }}>toque 2 cantos da área a revestir</span>}
          {somenteLeitura
            ? <button className="btn btn-gold" onClick={() => nav("/novo")}>＋ Começar meu Heritage</button>
            : <button className="btn btn-gold" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : dirty ? "💾 Salvar" : "✓ Salvo"}</button>}
          <button className="btn btn-blue" onClick={exportar}>⤓ Dossiê</button>
        </div>
      </div>

      {somenteLeitura && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px calc(12px + var(--sar)) 8px calc(12px + var(--sal))", background: "var(--panel-2)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>🏛️</span>
          <span style={{ fontSize: 12.5, color: "#b6b6b1", lineHeight: 1.5 }}>
            Este é o <b style={{ color: "var(--gold)" }}>Heritage de referência</b> — o projeto legado que deu origem à plataforma. Fica aqui só para consulta (não é editável).
            Para tocar o projeto de verdade, <b style={{ color: "#e9e9e6" }}>comece o seu Heritage do zero</b> e siga a trilha das quatro fases.
          </span>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Rail esquerdo: biblioteca (oculto no modo referência) */}
        {!somenteLeitura && (
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
        )}

        {/* Canvas */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <EditorCanvas modoCalibrar={modoCalibrar} onCalibrar={onCalibrar} modoAcabamento={modoAcabamento} onArea={onArea}
            modoRecorte={modoRecorte} onRecorte={(rect) => { recortarVetorial(rect); setModoRecorte(false); }}
            modoParede={modoParede} onParede={onParede} modoMoverPlanta={modoMoverPlanta}
            stageRef={stageRef} somenteLeitura={somenteLeitura} />
        </div>

        {/* Inspetor direito */}
        <aside style={{ width: 220, flexShrink: 0, borderLeft: "1px solid var(--line)", overflow: "auto", padding: "12px calc(12px + var(--sar)) 12px 12px" }}>
          {somenteLeitura ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>Sobre este projeto</div>
              <p style={{ color: "#b6b6b1", fontSize: 12.5, lineHeight: 1.6 }}>
                O <b style={{ color: "#e9e9e6" }}>Heritage</b> foi o primeiro estudo que originou esta assessoria — o layout, o orçamento e a lógica das quatro fases nasceram aqui.
              </p>
              <p style={{ color: "#b6b6b1", fontSize: 12.5, lineHeight: 1.6 }}>
                Ele fica como <b style={{ color: "var(--gold)" }}>referência</b>: dá para navegar, dar zoom e exportar o dossiê, mas não editar.
              </p>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {cena.itens.length} equipamentos · {BRL(r.subtotal)}
              </div>
              <button className="btn btn-gold" onClick={() => nav("/novo")}>＋ Começar meu Heritage</button>
              <div style={{ fontSize: 11, color: "#6e6e73", lineHeight: 1.5 }}>Use o pinch/scroll para dar zoom e arrastar a vista.</div>
            </div>
          ) : selItem ? (
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
              <Bloco label="PRIORIDADE (1–5)">
                <Nota1a5 label="Impacto" valor={selItem.impacto} onSet={(n) => updateItem(selItem.id, { impacto: n })} />
                <Nota1a5 label="Valor percebido" valor={selItem.valor_percebido} onSet={(n) => updateItem(selItem.id, { valor_percebido: n })} />
                <Nota1a5 label="Necessidade" valor={selItem.necessidade} onSet={(n) => updateItem(selItem.id, { necessidade: n })} />
              </Bloco>
              {selItem.preco ? <div style={{ fontSize: 13, color: "var(--gold)" }}>{BRL(selItem.preco)}</div> : null}
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => girarSelecionado()}>↻ Girar</button>
                <button className="btn" style={{ flex: 1 }} onClick={removerSelecionado}>✕ Remover</button>
              </div>
            </div>
          ) : selAcab ? (
            <AcabamentoInspector area={selAcab} />
          ) : cena.plantaVetorial ? (
            <PlantaVetorialInspector />
          ) : cena.planta ? (
            <PlantaInspector />
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>
              Toque um equipamento da biblioteca para adicioná-lo. Arraste na planta para posicionar.
              <br /><br />Importe a <b>planta baixa</b> (PDF/DWG) e use <b>Calibrar</b> para deixar tudo em escala real.
              <br /><br />Use <b>▦ Acabamento</b> para pintar pisos/paredes com um revestimento da biblioteca.
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

// Ajuste fino da planta de fundo: rotação e posição (usado por raster e vetorial).
function AjustePlanta({ rotacao, onRot, onNudge }: { rotacao: number; onRot: (delta: number) => void; onNudge: (dx: number, dy: number) => void }) {
  const passo = 20; // cm por toque
  return (
    <Bloco label={`ROTAÇÃO ${Math.round(((rotacao % 360) + 360) % 360)}°`}>
      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
        <button className="btn" style={{ flex: 1, padding: "7px 4px", fontSize: 11 }} onClick={() => onRot(-90)}>↺ 90°</button>
        <button className="btn" style={{ flex: 1, padding: "7px 4px", fontSize: 11 }} onClick={() => onRot(-1)}>−1°</button>
        <button className="btn" style={{ flex: 1, padding: "7px 4px", fontSize: 11 }} onClick={() => onRot(1)}>+1°</button>
        <button className="btn" style={{ flex: 1, padding: "7px 4px", fontSize: 11 }} onClick={() => onRot(90)}>90° ↻</button>
      </div>
      <span className="microlabel">POSIÇÃO (nudge {passo} cm)</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginTop: 5, maxWidth: 150 }}>
        <span /><button className="btn" style={{ padding: "6px 0" }} onClick={() => onNudge(0, -passo)}>↑</button><span />
        <button className="btn" style={{ padding: "6px 0" }} onClick={() => onNudge(-passo, 0)}>←</button>
        <button className="btn" style={{ padding: "6px 0" }} onClick={() => onNudge(0, passo)}>↓</button>
        <button className="btn" style={{ padding: "6px 0" }} onClick={() => onNudge(passo, 0)}>→</button>
      </div>
    </Bloco>
  );
}

function PlantaInspector() {
  const planta = useProjeto((s) => s.cena.planta)!;
  const updatePlanta = useProjeto((s) => s.updatePlanta);
  const setPlanta = useProjeto((s) => s.setPlanta);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PLANTA BAIXA</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>Escala: <b style={{ color: "#e9e9e6" }}>{planta.cmPorPx.toFixed(3)} cm/px</b></div>
      <div style={{ fontSize: 11.5, color: "#b6b6b1", lineHeight: 1.5 }}>
        Para encaixar na sala: <b>📏 Parede</b> (toque as 2 pontas de uma parede e informe a medida — a planta é escalada, girada e encaixada). <b>🖐 Mover</b> arrasta; ajuste fino abaixo.
      </div>
      <AjustePlanta rotacao={planta.rotacao || 0}
        onRot={(d) => updatePlanta({ rotacao: (planta.rotacao || 0) + d })}
        onNudge={(dx, dy) => updatePlanta({ x_cm: planta.x_cm + dx, y_cm: planta.y_cm + dy })} />
      <Bloco label={`OPACIDADE ${Math.round(planta.opacidade * 100)}%`}>
        <input type="range" min={0} max={1} step={0.05} value={planta.opacidade} onChange={(e) => updatePlanta({ opacidade: +e.target.value })} style={{ width: "100%" }} />
      </Bloco>
      <button className="btn" onClick={() => setPlanta(null)}>Remover planta</button>
    </div>
  );
}

function PlantaVetorialInspector() {
  const pv = useProjeto((s) => s.cena.plantaVetorial)!;
  const updatePV = useProjeto((s) => s.updatePlantaVetorial);
  const toggleCamada = useProjeto((s) => s.toggleCamada);
  const setPV = useProjeto((s) => s.setPlantaVetorial);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PLANTA VETORIAL</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {pv.origem.toUpperCase()} · {pv.tracos.length} traços · {pv.rotulos.length} textos
      </div>
      {Math.abs((pv.escala || 1) - 1) > 1e-6 && <div style={{ fontSize: 11, color: "var(--muted)" }}>Escala calibrada: ×{(pv.escala || 1).toFixed(3)}</div>}
      <div style={{ fontSize: 11.5, color: "#b6b6b1", lineHeight: 1.5 }}>
        Para encaixar na sala use <b>📏 Parede</b> (toque as 2 pontas de uma parede e informe a medida — escala, gira e encaixa). <b>🖐 Mover</b> arrasta; <b>📐 Calibrar</b> ajusta só a escala.
        {pv.origem === "pdf" && <> <b>✂ Recortar</b> isola a planta do carimbo/observações.</>}
      </div>
      <AjustePlanta rotacao={pv.rotacao || 0}
        onRot={(d) => updatePV({ rotacao: (pv.rotacao || 0) + d })}
        onNudge={(dx, dy) => updatePV({ x_cm: pv.x_cm + dx, y_cm: pv.y_cm + dy })} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#c9c9c4" }}>
        <input type="checkbox" checked={pv.mostrarTexto} onChange={(e) => updatePV({ mostrarTexto: e.target.checked })} />
        Mostrar texto / anotações
      </label>
      <Bloco label={`OPACIDADE ${Math.round(pv.opacidade * 100)}%`}>
        <input type="range" min={0.15} max={1} step={0.05} value={pv.opacidade} onChange={(e) => updatePV({ opacidade: +e.target.value })} style={{ width: "100%" }} />
      </Bloco>
      {pv.camadas.length > 1 && (
        <Bloco label="CAMADAS">
          <div style={{ display: "grid", gap: 3, maxHeight: 220, overflow: "auto" }}>
            {pv.camadas.map((c) => (
              <label key={c.nome} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#c9c9c4" }}>
                <input type="checkbox" checked={c.visivel} onChange={() => toggleCamada(c.nome)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
              </label>
            ))}
          </div>
        </Bloco>
      )}
      <button className="btn" onClick={() => setPV(null)}>Remover planta</button>
    </div>
  );
}

function AcabamentoInspector({ area }: { area: AreaAcabamento }) {
  const acabamentos = useLibrary((s) => s.acabamentos);
  const updateArea = useProjeto((s) => s.updateArea);
  const removerArea = useProjeto((s) => s.removerArea);
  const m2 = (area.w_cm / 100) * (area.h_cm / 100);
  const custo = area.preco_m2 ? m2 * area.preco_m2 : 0;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>REVESTIMENTO</div>
      <Bloco label="ACABAMENTO">
        <select className="fld" value={area.acabamentoId ?? ""} onChange={(e) => {
          const ac = acabamentos.find((a) => a.id === e.target.value);
          updateArea(area.id, ac
            ? { acabamentoId: ac.id, nome: ac.nome, cor: ac.cor ?? area.cor, preco_m2: ac.preco_m2 ?? null, tipo: ac.tipo === "parede" ? "parede" : "piso" }
            : { acabamentoId: null });
        }}>
          <option value="">— selecione da biblioteca —</option>
          {acabamentos.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.preco_m2 ? ` · ${BRL(a.preco_m2)}/m²` : ""}</option>)}
        </select>
        {acabamentos.length === 0 && <span style={{ fontSize: 11, color: "var(--muted)" }}>Cadastre acabamentos na Biblioteca para escolher aqui.</span>}
      </Bloco>
      <Bloco label="TIPO">
        <div style={{ display: "flex", gap: 6 }}>
          {(["piso", "parede"] as const).map((t) => (
            <button key={t} className="btn" onClick={() => updateArea(area.id, { tipo: t })} style={{
              flex: 1, padding: "8px 4px", fontSize: 11,
              borderColor: area.tipo === t ? "var(--gold)" : "var(--line-2)", color: area.tipo === t ? "var(--gold)" : "var(--muted)",
            }}>{t === "piso" ? "Piso" : "Parede"}</button>
          ))}
        </div>
      </Bloco>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
        Área: <b style={{ color: "#e9e9e6" }}>{m2.toFixed(1)} m²</b>
        {area.preco_m2 ? <> · Custo: <b style={{ color: "var(--gold)" }}>{BRL(Math.round(custo))}</b></> : null}
      </div>
      <button className="btn" onClick={() => removerArea(area.id)}>✕ Remover área</button>
    </div>
  );
}

const Bloco = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "grid", gap: 5 }}>
    <span style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".08em" }}>{label}</span>
    {children}
  </div>
);

function Nota1a5({ label, valor, onSet }: { label: string; valor?: number; onSet: (n: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
      <span style={{ fontSize: 11, color: "#b6b6b1", flex: 1 }}>{label}</span>
      <div style={{ display: "flex", gap: 3 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onSet(valor === n ? 0 : n)} title={`${label}: ${n}`} style={{
            width: 20, height: 22, borderRadius: 5, cursor: "pointer",
            border: `1px solid ${valor && valor >= n ? "var(--gold)" : "var(--line-2)"}`,
            background: valor && valor >= n ? "var(--gold-soft)" : "transparent",
            color: valor && valor >= n ? "var(--gold)" : "#6e6e73", font: "700 11px 'DM Sans'",
          }}>{n}</button>
        ))}
      </div>
    </div>
  );
}

const Centro = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center" }}>{children}</div>
);

function Chip({ txt, ok, warn, gold, neutro }: { txt: string; ok?: boolean; warn?: boolean; gold?: boolean; neutro?: boolean }) {
  const cor = neutro ? "#8A8A8F" : gold ? "#C9A227" : ok ? "#5FBF7A" : warn ? "#E09A45" : "#E04545";
  return <span style={{ border: `1px solid ${cor}`, color: cor, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 700 }}>{txt}</span>;
}
