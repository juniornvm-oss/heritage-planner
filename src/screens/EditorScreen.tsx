import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type Konva from "konva";
import EditorCanvas, { type Etapa, type FerramentaEstrutura, type FerramentaAcab } from "../editor/EditorCanvas";
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
import { ZONAS, CENARIOS, TAXA_ASSESSORIA, MATERIAIS_PISO, ELEMENTOS_PAREDE, MOBILIARIO_CATALOGO, LADOS_PADRAO, type LadoRect, type MaterialPiso, type TipoElementoParede, type Zona, type Cenario, type ItemPosicionado, type Equipamento, type AreaAcabamento, type ElementoParede, type ItemInfraestrutura } from "../lib/types";
import { areaPoligonoM2, perimetroCm, bboxPoligono, ehRetangulo, retanguloParaPontos, transladar, m2 } from "../lib/geometria";
import { gerarPromptVista } from "../lib/promptVista";

export default function EditorScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const somenteLeitura = id === "heritage"; // projeto legado: só visualização (evita os bugs de edição)
  const { projeto, cena, selectedId, selectedAcabId, selEstrutura, dirty, salvando } = useProjeto();
  const { abrir, selecionar, addItem, updateItem, removerSelecionado, girarSelecionado, setPlanta, updatePlanta, setPlantaVetorial, updatePlantaVetorial, recortarVetorial, addArea, undo, redo, salvar } = useProjeto();
  const { gerarEstruturaAuto, limparEstrutura, girarEstruturaSel, selecionarEstrutura } = useProjeto();
  const { removerParede, removerPilar, removerAbertura, removerArea } = useProjeto();
  const { selElemParedeId, selInfraId } = useProjeto();
  const { removerElemParede, removerInfra, addInfra } = useProjeto();
  const { duplicarItem, espelharItem } = useProjeto();
  const equipamentos = useLibrary((s) => s.equipamentos);
  const acabamentos = useLibrary((s) => s.acabamentos);

  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null); // mensagem não-fatal (import/export) — não derruba o editor
  const [modoCalibrar, setModoCalibrar] = useState(false);
  const [ferrAcab, setFerrAcab] = useState<FerramentaAcab>(null); // ferramentas da Etapa 2
  const [snapPasso, setSnapPasso] = useState(5); // 0 = snap desligado
  const [tipoElemParede, setTipoElemParede] = useState<TipoElementoParede>("tv");
  const [buscaEquip, setBuscaEquip] = useState("");
  const [filtroZona, setFiltroZona] = useState<Zona | "">("");
  const [filtroCat, setFiltroCat] = useState("");
  const [camadas, setCamadas] = useState<"tudo" | "uso" | "nada">("tudo"); // uso/segurança no canvas
  const [nudgePasso, setNudgePasso] = useState(5); // nudge do equipamento (1/5/10/20 cm)
  const [apresentacao, setApresentacao] = useState(false); // modo limpo p/ condomínio
  const [modoVista, setModoVista] = useState(false); // câmera da Vista IA
  const [lamina, setLamina] = useState(false); // Lâmina do Arquiteto (cotas automáticas)
  const [promptVista, setPromptVista] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [modoRecorte, setModoRecorte] = useState(false);
  const [modoParede, setModoParede] = useState(false);
  const [modoMoverPlanta, setModoMoverPlanta] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("planta");
  const [ferrEstrutura, setFerrEstrutura] = useState<FerramentaEstrutura>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Desliga todos os modos/ferramentas (usado ao trocar de etapa).
  function limparModos() {
    setModoCalibrar(false); setFerrAcab(null); setModoRecorte(false);
    setModoParede(false); setModoMoverPlanta(false); setFerrEstrutura(null); setModoVista(false);
  }
  function irParaEtapa(e: Etapa) { limparModos(); selecionar(null); setEtapa(e); }

  // Apaga o que estiver selecionado (estrutura, equipamento ou área de acabamento).
  function apagarSelecionado() {
    const s = useProjeto.getState();
    if (s.selEstrutura) {
      const { tipo, id } = s.selEstrutura;
      if (tipo === "parede") removerParede(id); else if (tipo === "pilar") removerPilar(id); else removerAbertura(id);
    } else if (s.selectedId) removerSelecionado();
    else if (s.selectedAcabId) removerArea(s.selectedAcabId);
    else if (s.selElemParedeId) removerElemParede(s.selElemParedeId);
    else if (s.selInfraId) removerInfra(s.selInfraId);
  }

  // Tecla Delete/Backspace apaga o selecionado (fora de campos de texto).
  useEffect(() => {
    if (somenteLeitura) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Delete" && ev.key !== "Backspace") return;
      const alvo = ev.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable)) return;
      ev.preventDefault();
      apagarSelecionado();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [somenteLeitura]);
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
  const selElemParede = (cena.elementosParede ?? []).find((e) => e.id === selElemParedeId) || null;
  const selInfra = (cena.infra ?? []).find((i) => i.id === selInfraId) || null;
  const teto = Number(projeto?.orcamento_teto) || 0;
  const saldo = teto - r.subtotal;

  // Cria a área de piso a partir dos vértices desenhados (retângulo ou polígono).
  function onArea(pontos: { x: number; y: number }[]) {
    const bb = bboxPoligono(pontos);
    const area: AreaAcabamento = {
      id: crypto.randomUUID(),
      acabamentoId: null,
      nome: MATERIAIS_PISO.vinilico.label,
      tipo: "piso",
      material: "vinilico",
      cor: MATERIAIS_PISO.vinilico.cor,
      preco_m2: null,
      pontos,
      rotacaoTextura: 0,
      bloqueado: false,
      x_cm: bb.x, y_cm: bb.y, w_cm: bb.w, h_cm: bb.h,
    };
    addArea(area);
    setFerrAcab(null);
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
      uso_frontal_cm: m.uso_frontal_cm ?? null, uso_lateral_cm: m.uso_lateral_cm ?? null,
      seguranca_cm: m.seguranca_cm ?? null, precisa_tomada: m.precisa_tomada ?? null,
      lados: m.lados ?? null, dist_entrada_cm: m.dist_entrada_cm ?? null,
    };
    addItem(item);
  }

  async function importarPlanta(file?: File | null) {
    if (!file) return;
    setBusy("Lendo planta…");
    setAviso(null);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    try {
      if (ext === "dxf" || ext === "dwg" || ext === "pdf") {
        const pv = await lerPlantaVetorial(file); // desenho vetorial separado do texto
        if (pv) { setPlantaVetorial(pv); return; }
        // sem geometria (ex.: PDF escaneado) → cai no raster
      }
      const bmp = await lerPlanta(file);
      const cmPorPx = cena.sala.largura_cm / bmp.larguraPx; // começa do tamanho da sala; calibre depois
      setPlanta({ dataUrl: bmp.dataUrl, larguraPx: bmp.larguraPx, alturaPx: bmp.alturaPx, x_cm: 0, y_cm: 0, cmPorPx, rotacao: 0, opacidade: 0.55, bloqueada: false });
    } catch (e) {
      // Falha ao ler a planta NÃO derruba o editor: mostra um aviso dispensável e
      // mantém o layout (equipamentos/acabamentos) intacto.
      const msg = (e as Error)?.message || "Falha ao ler o arquivo.";
      setAviso(ext === "dwg"
        ? "Não consegui ler este DWG. Tente exportar como DXF ou PDF no seu CAD e importar novamente."
        : `Não consegui importar esta planta (${ext.toUpperCase() || "arquivo"}): ${msg}`);
    } finally { setBusy(null); }
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
    } catch (e) { setAviso(`Falha ao gerar o PDF: ${(e as Error).message}`); } finally { setBusy(null); }
  }

  if (erro) return <Centro><p style={{ color: "var(--red)" }}>{erro}</p><button className="btn" onClick={() => nav("/")}>Voltar</button></Centro>;
  if (!projeto) return <Centro><p style={{ color: "var(--muted)" }}>Carregando projeto…</p></Centro>;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, rowGap: 6, flexWrap: "wrap", padding: "calc(8px + var(--sat)) calc(12px + var(--sar)) 8px calc(12px + var(--sal))", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
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
        {!somenteLeitura && !apresentacao && (
          <>
            <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />
            {/* Abas das 3 etapas */}
            {([["planta", "1 · Planta"], ["acabamento", "2 · Acabamento"], ["layout", "3 · Layout"]] as [Etapa, string][]).map(([e, lbl]) => (
              <button key={e} className="btn" onClick={() => irParaEtapa(e)} style={etapa === e
                ? { borderColor: "var(--gold)", color: "var(--gold)", background: "var(--gold-soft)" }
                : undefined}>{lbl}</button>
            ))}
            <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />

            {/* Ferramentas da ETAPA 1 — PLANTA */}
            {etapa === "planta" && <>
              <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => importarPlanta(e.target.files?.[0])} />
              <button className="btn btn-blue" onClick={() => fileRef.current?.click()}>⭱ Planta</button>
              <button className="btn" disabled={!cena.planta && !cena.plantaVetorial} onClick={() => { limparModos(); setModoParede(true); }} style={modoParede ? { borderColor: "#C97BE0", color: "#C97BE0" } : undefined} title="Alinhar a planta: toque as 2 pontas de uma parede de medida conhecida — a planta é escalada, girada e encaixada">📐 Alinhar</button>
              <button className="btn" disabled={!cena.planta && !cena.plantaVetorial} onClick={() => { limparModos(); setModoCalibrar(true); }} style={modoCalibrar ? { borderColor: "#5FC8E8", color: "#8fd6f0" } : undefined} title="Ajustar só a escala: toque 2 pontos de medida conhecida">📏 Calibrar</button>
              <button className="btn" disabled={!cena.planta && !cena.plantaVetorial} onClick={() => { limparModos(); setModoMoverPlanta(true); }} style={modoMoverPlanta ? { borderColor: "#5FBF7A", color: "#5FBF7A" } : undefined} title="Arrastar a planta de fundo">🖐 Mover</button>
              {cena.plantaVetorial && <button className="btn" onClick={() => { limparModos(); setModoRecorte(true); }} style={modoRecorte ? { borderColor: "#5FBF7A", color: "#5FBF7A" } : undefined}>✂ Recortar</button>}
              <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />
              <button className="btn" onClick={() => gerarEstruturaAuto()} disabled={!cena.planta && !cena.plantaVetorial} title="Gerar paredes/pilares a partir da planta importada">✨ Auto</button>
              {/* Selecionar: modo padrão (nenhuma ferramenta ativa) */}
              <button className="btn" onClick={() => { limparModos(); }} style={!ferrEstrutura && !modoCalibrar && !modoParede && !modoMoverPlanta && !modoRecorte ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined} title="Selecionar/mover elementos (toque para selecionar, arraste para mover)">➤ Selecionar</button>
              {([["parede", "▮ Parede"], ["porta", "🚪 Porta"], ["janela", "🪟 Janela"], ["pilar", "◼ Pilar"], ["apagar", "⌫ Apagar"]] as [FerramentaEstrutura, string][]).map(([f, lbl]) => (
                <button key={f} className="btn" onClick={() => { const v = ferrEstrutura === f ? null : f; limparModos(); setFerrEstrutura(v); }} style={ferrEstrutura === f ? (f === "apagar" ? { borderColor: "var(--red)", color: "var(--red)" } : { borderColor: "var(--gold)", color: "var(--gold)" }) : undefined}>{lbl}</button>
              ))}
              <button className="btn" disabled={!selEstrutura || selEstrutura.tipo === "abertura"} onClick={() => girarEstruturaSel()} title="Girar 90° a parede/pilar selecionado">↻ Girar</button>
              <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />
              {(cena.planta || cena.plantaVetorial) && (
                <button className="btn" onClick={() => { if (confirm("Remover o arquivo de fundo? O que você desenhou (paredes/portas/pilares) fica.")) { if (cena.plantaVetorial) setPlantaVetorial(null); else setPlanta(null); selecionarEstrutura(null); } }} title="Apagar o arquivo importado, mantendo o desenho">🗋 Tirar fundo</button>
              )}
              {cena.estrutura && <button className="btn" onClick={() => { if (confirm("Apagar toda a estrutura (paredes/portas/pilares)?")) limparEstrutura(); }} title="Limpar estrutura">🗑</button>}
            </>}

            {/* Ferramentas da ETAPA 2 — ACABAMENTO */}
            {etapa === "acabamento" && <>
              <button className="btn" onClick={() => { limparModos(); }} style={!ferrAcab ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined} title="Selecionar/mover áreas (toque seleciona, arraste move; vértices editáveis)">➤ Selecionar</button>
              {([["rect", "▭ Área"], ["poligono", "⬠ Polígono"], ["cota", "📏 Cota"], ["espelho", "🪞 Espelho"], ["itemParede", "🔌 Item parede"], ["apagar", "⌫ Apagar"]] as [FerramentaAcab, string][]).map(([f, lbl]) => (
                <button key={f} className="btn" onClick={() => { const v = ferrAcab === f ? null : f; limparModos(); setFerrAcab(v); }}
                  style={ferrAcab === f ? (f === "apagar" ? { borderColor: "var(--red)", color: "var(--red)" } : { borderColor: "var(--gold)", color: "var(--gold)" }) : undefined}>{lbl}</button>
              ))}
              <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />
              <span style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".06em" }}>SNAP</span>
              {[[1, "1"], [5, "5"], [10, "10"], [0, "off"]].map(([v, lbl]) => (
                <button key={v} className="btn" onClick={() => setSnapPasso(v as number)}
                  style={{ padding: "8px 9px", fontSize: 11, ...(snapPasso === v ? { borderColor: "#5FC8E8", color: "#8fd6f0" } : {}) }}
                  title={v === 0 ? "Snap desligado (precisão de 1 mm)" : `Encaixe de ${v} cm (+ imã de parede e vértice)`}>{lbl}</button>
              ))}
            </>}

            {/* Ferramentas da ETAPA 3 — LAYOUT */}
            {etapa === "layout" && <>
              <button className="btn" disabled={!selItem} onClick={() => girarSelecionado()}>↻ Girar 90°</button>
              <button className="btn" disabled={!selItem} onClick={removerSelecionado}>✕ Remover</button>
              <button className="btn" onClick={() => setLamina((v) => !v)}
                style={lamina ? { borderColor: "#8FD6F0", color: "#8FD6F0" } : undefined}
                title="Lâmina do Arquiteto: medidas dos equipamentos e distâncias entre eles e as paredes — entra no Dossiê PDF">📐 Lâmina</button>
              <button className="btn" onClick={() => { const v = !modoVista; limparModos(); setModoVista(v); }}
                style={modoVista ? { borderColor: "#C97BE0", color: "#C97BE0" } : undefined}
                title="Vista IA: toque onde fica a câmera e depois para onde ela olha — gera um prompt de imagem">📷 Vista IA</button>
              <button className="btn" onClick={() => setCamadas(camadas === "tudo" ? "uso" : camadas === "uso" ? "nada" : "tudo")}
                title="Alternar camadas técnicas: uso + segurança / só uso / nada">
                👁 {camadas === "tudo" ? "Uso+Seg" : camadas === "uso" ? "Uso" : "Corpo"}
              </button>
            </>}

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
          {ferrAcab === "rect" && <span style={{ fontSize: 12, color: "var(--gold)" }}>toque 2 cantos da área a revestir</span>}
          {ferrAcab === "poligono" && <span style={{ fontSize: 12, color: "var(--gold)" }}>toque os cantos; toque o 1º ponto (verde) para fechar</span>}
          {ferrAcab === "cota" && <span style={{ fontSize: 12, color: "#8fd6f0" }}>toque 2 pontos para fixar a medida</span>}
          {ferrAcab === "espelho" && <span style={{ fontSize: 12, color: "#8fd6f0" }}>toque na parede onde fica o espelho</span>}
          {ferrAcab === "itemParede" && <span style={{ fontSize: 12, color: "var(--gold)" }}>escolha o item no painel esquerdo e toque na parede</span>}
          {ferrAcab === "apagar" && etapa === "acabamento" && <span style={{ fontSize: 12, color: "var(--red)" }}>toque no elemento para apagar</span>}
          {ferrEstrutura === "parede" && <span style={{ fontSize: 12, color: "var(--gold)" }}>toque as 2 pontas da parede</span>}
          {ferrEstrutura === "pilar" && <span style={{ fontSize: 12, color: "var(--gold)" }}>toque 2 cantos do pilar</span>}
          {(ferrEstrutura === "porta" || ferrEstrutura === "janela") && <span style={{ fontSize: 12, color: "var(--gold)" }}>toque sobre a parede onde fica {ferrEstrutura === "porta" ? "a porta" : "a janela"}</span>}
          {ferrEstrutura === "apagar" && <span style={{ fontSize: 12, color: "var(--red)" }}>toque no elemento para apagar</span>}
          {modoVista && <span style={{ fontSize: 12, color: "#C97BE0" }}>toque onde fica a câmera, depois para onde ela olha</span>}
          {lamina && etapa === "layout" && <span style={{ fontSize: 12, color: "#8FD6F0" }}>lâmina ativa — exporte o Dossiê para levá-la ao PDF</span>}
          {!somenteLeitura && <button className="btn" onClick={() => { limparModos(); selecionar(null); setApresentacao((v) => !v); }}
            style={apresentacao ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined} title="Modo apresentação: esconde grade, medidas e painéis">🎦</button>}
          {somenteLeitura
            ? <button className="btn btn-gold" onClick={() => nav("/novo")}>＋ Começar meu Heritage</button>
            : <button className="btn btn-gold" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : dirty ? "💾 Salvar" : "✓ Salvo"}</button>}
          <button className="btn btn-blue" onClick={exportar}>⤓ Dossiê</button>
        </div>
      </div>

      {aviso && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px calc(12px + var(--sar)) 9px calc(12px + var(--sal))", background: "rgba(224,154,69,.12)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <span style={{ fontSize: 12.5, color: "#E09A45", lineHeight: 1.5, flex: 1 }}>{aviso}</span>
          <button className="btn" onClick={() => setAviso(null)} style={{ padding: "5px 10px", fontSize: 11.5 }}>Dispensar</button>
        </div>
      )}

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
        {/* Rail esquerdo: biblioteca de equipamentos — só na Etapa 3 (Layout) */}
        {!somenteLeitura && !apresentacao && etapa === "layout" && (() => {
          const q = buscaEquip.trim().toLowerCase();
          const lista = equipamentos.filter((m) =>
            m.ativo !== false
            && (!q || `${m.nome} ${m.marca ?? ""} ${m.modelo ?? ""}`.toLowerCase().includes(q))
            && (!filtroZona || m.zona === filtroZona)
            && (!filtroCat || m.categoria === filtroCat));
          const categorias = [...new Set(equipamentos.map((m) => m.categoria).filter(Boolean))] as string[];
          return (
            <aside style={{ width: 224, flexShrink: 0, borderRight: "1px solid var(--line)", overflow: "auto", padding: "10px 10px 10px calc(10px + var(--sal))", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="brandface" style={{ fontSize: 15, color: "var(--gold)" }}>BIBLIOTECA</div>
              <input className="fld" placeholder="🔍 Buscar…" value={buscaEquip} onChange={(e) => setBuscaEquip(e.target.value)} style={{ padding: "8px 10px", fontSize: 12.5 }} />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setFiltroZona("")} style={{ padding: "4px 8px", fontSize: 10.5, ...(filtroZona === "" ? { borderColor: "var(--gold)", color: "var(--gold)" } : {}) }}>Todas</button>
                {(Object.keys(ZONAS) as Zona[]).map((z) => (
                  <button key={z} className="btn" onClick={() => setFiltroZona(filtroZona === z ? "" : z)}
                    style={{ padding: "4px 8px", fontSize: 10.5, ...(filtroZona === z ? { borderColor: ZONAS[z].cor, color: ZONAS[z].cor } : {}) }}>{ZONAS[z].label}</button>
                ))}
              </div>
              {categorias.length > 0 && (
                <select className="fld" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} style={{ padding: "7px 9px", fontSize: 12 }}>
                  <option value="">Todas as categorias</option>
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{lista.length} equipamento(s)</div>
              <div style={{ display: "grid", gap: 5 }}>
                {lista.map((m, i) => (
                  <button key={(m.id || m.nome) + i} onClick={() => adicionar(m)} style={{
                    display: "grid", gap: 2,
                    background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px",
                    color: "#c9c9c4", font: "600 12px 'DM Sans'", textAlign: "left", cursor: "pointer",
                  }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: ZONAS[m.zona]?.cor, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nome}</span>
                      {m.precisa_tomada && <span title="Precisa tomada">⚡</span>}
                    </span>
                    <span style={{ display: "flex", justifyContent: "space-between", color: "#6e6e73", fontWeight: 400, fontSize: 10.5 }}>
                      <span>{[m.marca, m.modelo].filter(Boolean).join(" ") || (m.categoria ?? "")}</span>
                      <span>{m.largura_cm}×{m.profundidade_cm}{m.preco ? ` · ${BRL(m.preco)}` : ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          );
        })()}

        {/* Rail esquerdo da Etapa 2: itens de parede + mobiliário/infraestrutura */}
        {!somenteLeitura && !apresentacao && etapa === "acabamento" && (
          <aside style={{ width: 210, flexShrink: 0, borderRight: "1px solid var(--line)", overflow: "auto", padding: "10px 10px 10px calc(10px + var(--sal))" }}>
            <div className="brandface" style={{ fontSize: 15, color: "var(--gold)", marginBottom: 8 }}>ITENS DE PAREDE</div>
            <div style={{ display: "grid", gap: 4, marginBottom: 14 }}>
              {(Object.keys(ELEMENTOS_PAREDE) as TipoElementoParede[]).filter((t) => t !== "espelho").map((t) => (
                <button key={t} onClick={() => { limparModos(); setTipoElemParede(t); setFerrAcab("itemParede"); }} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  background: ferrAcab === "itemParede" && tipoElemParede === t ? "var(--gold-soft)" : "var(--panel-2)",
                  border: `1px solid ${ferrAcab === "itemParede" && tipoElemParede === t ? "var(--gold)" : "var(--line)"}`,
                  borderRadius: 7, padding: "6px 9px", color: "#c9c9c4", font: "600 11.5px 'DM Sans'", textAlign: "left", cursor: "pointer",
                }}>
                  <span>{ELEMENTOS_PAREDE[t].icone}</span>{ELEMENTOS_PAREDE[t].label}
                  <span style={{ marginLeft: "auto", color: "#6e6e73", fontWeight: 400, fontSize: 10.5 }}>{ELEMENTOS_PAREDE[t].largura}×{ELEMENTOS_PAREDE[t].altura}</span>
                </button>
              ))}
            </div>
            <div className="brandface" style={{ fontSize: 15, color: "var(--gold)", marginBottom: 8 }}>MOBILIÁRIO</div>
            <div style={{ display: "grid", gap: 4 }}>
              {MOBILIARIO_CATALOGO.map((mob) => (
                <button key={mob.tipo + mob.nome} onClick={() => {
                  const item: ItemInfraestrutura = {
                    id: crypto.randomUUID(), tipo: mob.tipo, nome: mob.nome, categoria: mob.categoria,
                    x_cm: Math.round(cena.sala.largura_cm / 2 - mob.w / 2), y_cm: Math.round(cena.sala.profundidade_cm / 2 - mob.h / 2),
                    w_cm: mob.w, h_cm: mob.h, altura_cm: mob.alt ?? null, rotacao: 0,
                  };
                  limparModos(); addInfra(item);
                }} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
                  background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 7, padding: "6px 9px",
                  color: "#c9c9c4", font: "600 11.5px 'DM Sans'", textAlign: "left", cursor: "pointer",
                }}>
                  <span>{mob.nome}</span>
                  <span style={{ color: "#6e6e73", fontWeight: 400, fontSize: 10.5 }}>{mob.w}×{mob.h}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <EditorCanvas modoCalibrar={modoCalibrar} onCalibrar={onCalibrar} ferrAcab={ferrAcab} tipoElemParede={tipoElemParede} snapPasso={snapPasso} camadas={camadas} apresentacao={apresentacao} onArea={onArea}
            modoVista={modoVista} onVista={(a, b) => { setModoVista(false); setCopiado(false); setPromptVista(gerarPromptVista(cena, a, b)); }}
            lamina={lamina && etapa === "layout"}
            modoRecorte={modoRecorte} onRecorte={(rect) => { recortarVetorial(rect); setModoRecorte(false); }}
            modoParede={modoParede} onParede={onParede} modoMoverPlanta={modoMoverPlanta}
            etapa={etapa} ferrEstrutura={ferrEstrutura}
            stageRef={stageRef} somenteLeitura={somenteLeitura} />
        </div>

        {/* Inspetor direito */}
        {!apresentacao && <aside style={{ width: 220, flexShrink: 0, borderLeft: "1px solid var(--line)", overflow: "auto", padding: "12px calc(12px + var(--sar)) 12px 12px" }}>
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
          ) : etapa === "planta" ? (
            selEstrutura ? <EstruturaInspector sel={selEstrutura} /> : <PlantaEtapaInspector temPlanta={!!(cena.planta || cena.plantaVetorial)} temEstrutura={!!cena.estrutura} />
          ) : selItem ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>{selItem.nome} {selItem.bloqueado && "🔒"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Dimensões (proporção travada)<br />
                <b style={{ color: "#e9e9e6", fontSize: 14 }}>{formatLength(selItem.w_cm)} × {formatLength(selItem.h_cm)}</b>
              </div>
              <Bloco label="POSIÇÃO X × Y (cm)">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <CampoCm valor={selItem.x_cm} onSet={(v) => updateItem(selItem.id, { x_cm: v })} />
                  <span style={{ color: "var(--muted)" }}>×</span>
                  <CampoCm valor={selItem.y_cm} onSet={(v) => updateItem(selItem.id, { y_cm: v })} />
                </div>
              </Bloco>
              <Bloco label={`ROTAÇÃO · ${Math.round(selItem.rotacao || 0)}°`}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[["-45", -45], ["-15", -15], ["-1", -1], ["+1", 1], ["+15", 15], ["+45", 45]].map(([lbl, d]) => (
                    <button key={lbl} className="btn" disabled={selItem.bloqueado} onClick={() => girarSelecionado(d as number)} style={{ flex: 1, padding: "7px 1px", fontSize: 10 }}>{lbl}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <button className="btn" disabled={selItem.bloqueado} onClick={() => girarSelecionado(90)} style={{ flex: 1, padding: "7px 2px", fontSize: 10.5 }}>90°</button>
                  <button className="btn" disabled={selItem.bloqueado} onClick={() => updateItem(selItem.id, { rotacao: 0 })} style={{ flex: 1, padding: "7px 2px", fontSize: 10.5 }}>0°</button>
                  <button className="btn" disabled={selItem.bloqueado} onClick={() => espelharItem(selItem.id, "h")} style={{ flex: 1, padding: "7px 2px", fontSize: 10.5, ...(selItem.flipH ? { borderColor: "var(--gold)", color: "var(--gold)" } : {}) }}>⇋ H</button>
                  <button className="btn" disabled={selItem.bloqueado} onClick={() => espelharItem(selItem.id, "v")} style={{ flex: 1, padding: "7px 2px", fontSize: 10.5, ...(selItem.flipV ? { borderColor: "var(--gold)", color: "var(--gold)" } : {}) }}>⇵ V</button>
                </div>
              </Bloco>
              <Bloco label={`ENTRADA · vão de ${Math.round(selItem.dist_entrada_cm || 0)} cm`}>
                <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                  {([["topo", "↑ Topo"], ["base", "↓ Base"], ["esq", "← Esq"], ["dir", "Dir →"]] as [LadoRect, string][]).map(([k, lbl]) => {
                    const ladosAtual = { ...LADOS_PADRAO, ...(selItem.lados ?? {}) };
                    const ativo = ladosAtual[k] === "entrada";
                    return (
                      <button key={k} className="btn" disabled={selItem.bloqueado} onClick={() => {
                        const novo = { ...ladosAtual };
                        (Object.keys(novo) as LadoRect[]).forEach((s2) => { if (novo[s2] === "entrada") novo[s2] = "lateral"; });
                        novo[k] = "entrada";
                        updateItem(selItem.id, { lados: novo });
                      }} style={{ flex: 1, padding: "6px 2px", fontSize: 10, ...(ativo ? { borderColor: "#5FBF7A", color: "#5FBF7A" } : {}) }}>{lbl}</button>
                    );
                  })}
                </div>
                <CampoCm valor={selItem.dist_entrada_cm ?? 0} min={0} onSet={(v) => updateItem(selItem.id, { dist_entrada_cm: v })} />
              </Bloco>
              <Bloco label={`NUDGE (${nudgePasso} cm)`}>
                <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                  {[1, 5, 10, 20].map((n) => (
                    <button key={n} className="btn" onClick={() => setNudgePasso(n)} style={{ flex: 1, padding: "5px 2px", fontSize: 10, ...(nudgePasso === n ? { borderColor: "#5FC8E8", color: "#8fd6f0" } : {}) }}>{n}</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, maxWidth: 150 }}>
                  <span /><button className="btn" disabled={selItem.bloqueado} style={{ padding: "6px 0" }} onClick={() => updateItem(selItem.id, { y_cm: selItem.y_cm - nudgePasso })}>↑</button><span />
                  <button className="btn" disabled={selItem.bloqueado} style={{ padding: "6px 0" }} onClick={() => updateItem(selItem.id, { x_cm: selItem.x_cm - nudgePasso })}>←</button>
                  <button className="btn" disabled={selItem.bloqueado} style={{ padding: "6px 0" }} onClick={() => updateItem(selItem.id, { y_cm: selItem.y_cm + nudgePasso })}>↓</button>
                  <button className="btn" disabled={selItem.bloqueado} style={{ padding: "6px 0" }} onClick={() => updateItem(selItem.id, { x_cm: selItem.x_cm + nudgePasso })}>→</button>
                </div>
              </Bloco>
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
                <button className="btn" style={{ flex: 1 }} onClick={() => duplicarItem(selItem.id)}>⧉ Duplicar</button>
                <button className="btn" style={{ flex: 1 }} onClick={() => updateItem(selItem.id, { bloqueado: !selItem.bloqueado })}>{selItem.bloqueado ? "🔓 Destravar" : "🔒 Travar"}</button>
              </div>
              <button className="btn" disabled={selItem.bloqueado} onClick={removerSelecionado}>✕ Remover</button>
            </div>
          ) : selElemParede ? (
            <ElemParedeInspector el={selElemParede} />
          ) : selInfra ? (
            <InfraInspector item={selInfra} snapPasso={snapPasso} />
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
        </aside>}
      </div>

      {/* Modal: prompt da Vista IA */}
      {promptVista && (
        <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "grid", placeItems: "center", background: "rgba(0,0,0,.55)" }}
          onClick={() => setPromptVista(null)}>
          <div className="card" style={{ width: "min(680px, 92vw)", padding: 18, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div className="brandface" style={{ fontSize: 18, color: "var(--gold)" }}>📷 PROMPT DA VISTA</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
              Cole no seu gerador de imagem (Midjourney, DALL-E, Flux…). O prompt está em inglês porque os geradores respondem melhor — descreve a sala, os acabamentos e o que está no campo de visão da câmera que você posicionou.
            </div>
            <textarea className="fld" readOnly value={promptVista} rows={9}
              style={{ resize: "vertical", fontSize: 12.5, lineHeight: 1.55, fontFamily: "inherit" }}
              onFocus={(e) => e.currentTarget.select()} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={async () => {
                try { await navigator.clipboard.writeText(promptVista); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
                catch { /* iPad sem permissão: o usuário seleciona e copia manualmente */ }
              }}>{copiado ? "✓ Copiado!" : "⧉ Copiar prompt"}</button>
              <button className="btn" onClick={() => { setPromptVista(null); setModoVista(true); }}>📷 Outro ângulo</button>
              <button className="btn" onClick={() => setPromptVista(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay do modo apresentação: título do projeto */}
      {apresentacao && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 18, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <span className="brandface" style={{ fontSize: 22, color: "var(--gold)", background: "rgba(10,10,11,.72)", padding: "8px 22px", borderRadius: 999, border: "1px solid var(--line-2)" }}>
            {projeto.nome}
          </span>
        </div>
      )}

      {/* Rodapé: validação */}
      {!apresentacao && <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px calc(12px + var(--sar)) calc(7px + var(--sab)) calc(12px + var(--sal))", borderTop: "1px solid var(--line)", flexWrap: "wrap", flexShrink: 0 }}>
        <Chip ok={r.nCol === 0} txt={r.nCol === 0 ? "Sem colisões" : `${r.nCol} colisão(ões)`} />
        <Chip ok={r.nCor === 0} warn txt={r.nCor === 0 ? "Corredor livre" : `${r.nCor} no corredor`} />
        {r.nUso > 0 && <Chip warn ok={false} txt={`${r.nUso} área(s) de uso invadida(s)`} />}
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
      </div>}
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

// Inspetor da Etapa 1 sem seleção: orientação + gerar estrutura.
function PlantaEtapaInspector({ temPlanta, temEstrutura }: { temPlanta: boolean; temEstrutura: boolean }) {
  const sala = useProjeto((s) => s.cena.sala);
  const temParedes = useProjeto((s) => !!s.cena.estrutura?.paredes.length);
  const updateSala = useProjeto((s) => s.updateSala);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>ETAPA 1 · PLANTA</div>
      {!temParedes && (
        <Bloco label="SALA (GUIA) — LARGURA × PROFUNDIDADE">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input className="fld" type="number" min={100} step={10} value={sala.largura_cm}
              onChange={(e) => updateSala({ largura_cm: Math.max(100, +e.target.value || 0) })} />
            <span style={{ color: "var(--muted)" }}>×</span>
            <input className="fld" type="number" min={100} step={10} value={sala.profundidade_cm}
              onChange={(e) => updateSala({ profundidade_cm: Math.max(100, +e.target.value || 0) })} />
          </div>
          <span style={{ fontSize: 11, color: "#6e6e73", lineHeight: 1.5 }}>
            O retângulo tracejado é só uma <b>guia</b> com as dimensões do projeto (em cm) — não é parede.
            Ele some sozinho quando você desenhar as paredes reais.
          </span>
        </Bloco>
      )}
      <p style={{ color: "#b6b6b1", fontSize: 12.5, lineHeight: 1.6 }}>
        <b style={{ color: "#e9e9e6" }}>1.</b> Suba o arquivo em <b>⭱ Planta</b> (PDF, DWG, DXF ou imagem).<br />
        <b style={{ color: "#e9e9e6" }}>2.</b> Ajuste a escala com <b>📐 Calibrar</b> e posicione com <b>🖐 Mover</b>.<br />
        <b style={{ color: "#e9e9e6" }}>3.</b> Toque <b style={{ color: "var(--gold)" }}>✨ Auto</b> para gerar paredes e pilares já em escala.
      </p>
      <p style={{ color: "#b6b6b1", fontSize: 12.5, lineHeight: 1.6 }}>
        Depois refine à mão: <b>▮ Parede</b>, <b>🚪 Porta</b>, <b>🪟 Janela</b> e <b>◼ Pilar</b>. Toque um elemento para editar medida/espessura.
      </p>
      {!temPlanta && <div style={{ fontSize: 11.5, color: "#E09A45" }}>Comece subindo a planta em ⭱ Planta.</div>}
      {temPlanta && !temEstrutura && <div style={{ fontSize: 11.5, color: "var(--gold)" }}>Planta carregada — toque ✨ Auto para gerar a estrutura.</div>}
    </div>
  );
}

// Inspetor de um elemento da estrutura (parede / pilar / porta / janela).
function EstruturaInspector({ sel }: { sel: { tipo: "parede" | "pilar" | "abertura"; id: string } }) {
  const est = useProjeto((s) => s.cena.estrutura);
  const updateParede = useProjeto((s) => s.updateParede);
  const updatePilar = useProjeto((s) => s.updatePilar);
  const updateAbertura = useProjeto((s) => s.updateAbertura);
  const removerParede = useProjeto((s) => s.removerParede);
  const removerPilar = useProjeto((s) => s.removerPilar);
  const removerAbertura = useProjeto((s) => s.removerAbertura);
  if (!est) return null;

  if (sel.tipo === "parede") {
    const p = est.paredes.find((x) => x.id === sel.id); if (!p) return null;
    const len = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PAREDE</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Comprimento<br /><b style={{ color: "#e9e9e6", fontSize: 15 }}>{formatLength(len)}</b></div>
        <Bloco label="ESPESSURA (cm)">
          <input className="fld" type="number" min={3} value={p.espessura_cm} onChange={(e) => updateParede(p.id, { espessura_cm: Math.max(3, +e.target.value || 0) })} />
        </Bloco>
        <button className="btn" onClick={() => removerParede(p.id)}>✕ Remover parede</button>
      </div>
    );
  }
  if (sel.tipo === "pilar") {
    const p = est.pilares.find((x) => x.id === sel.id); if (!p) return null;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PILAR</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Bloco label="LARGURA (cm)"><input className="fld" type="number" min={5} value={p.w_cm} onChange={(e) => updatePilar(p.id, { w_cm: Math.max(5, +e.target.value || 0) })} /></Bloco>
          <Bloco label="PROFUND. (cm)"><input className="fld" type="number" min={5} value={p.h_cm} onChange={(e) => updatePilar(p.id, { h_cm: Math.max(5, +e.target.value || 0) })} /></Bloco>
        </div>
        <button className="btn" onClick={() => removerPilar(p.id)}>✕ Remover pilar</button>
      </div>
    );
  }
  const a = est.aberturas.find((x) => x.id === sel.id); if (!a) return null;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>{a.tipo === "porta" ? "PORTA" : "JANELA"}</div>
      <Bloco label="TIPO">
        <div style={{ display: "flex", gap: 6 }}>
          {(["porta", "janela"] as const).map((t) => (
            <button key={t} className="btn" onClick={() => updateAbertura(a.id, { tipo: t })} style={{ flex: 1, padding: "8px 4px", fontSize: 11, borderColor: a.tipo === t ? "var(--gold)" : "var(--line-2)", color: a.tipo === t ? "var(--gold)" : "var(--muted)" }}>{t === "porta" ? "Porta" : "Janela"}</button>
          ))}
        </div>
      </Bloco>
      <Bloco label="LARGURA (cm)">
        <input className="fld" type="number" min={40} value={a.largura_cm} onChange={(e) => updateAbertura(a.id, { largura_cm: Math.max(40, +e.target.value || 0) })} />
      </Bloco>
      <Bloco label="POSIÇÃO NA PAREDE (cm)">
        <input className="fld" type="number" min={0} value={Math.round(a.centro_cm)} onChange={(e) => updateAbertura(a.id, { centro_cm: Math.max(0, +e.target.value || 0) })} />
      </Bloco>
      <button className="btn" onClick={() => removerAbertura(a.id)}>✕ Remover</button>
    </div>
  );
}

// Campo numérico em cm que confirma no blur/Enter (não "briga" com a digitação).
function CampoCm({ valor, min, onSet }: { valor: number; min?: number; onSet: (v: number) => void }) {
  const [txt, setTxt] = useState(String(Math.round(valor * 10) / 10));
  useEffect(() => { setTxt(String(Math.round(valor * 10) / 10)); }, [valor]);
  const confirmar = () => {
    const n = parseFloat(txt.replace(",", "."));
    if (Number.isFinite(n)) onSet(Math.max(min ?? -100000, n));
    else setTxt(String(Math.round(valor * 10) / 10));
  };
  return <input className="fld" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)}
    onBlur={confirmar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function AcabamentoInspector({ area }: { area: AreaAcabamento }) {
  const acabamentos = useLibrary((s) => s.acabamentos);
  const cena = useProjeto((s) => s.cena);
  const updateArea = useProjeto((s) => s.updateArea);
  const removerArea = useProjeto((s) => s.removerArea);
  const duplicarArea = useProjeto((s) => s.duplicarArea);
  const moverArea = useProjeto((s) => s.moverArea);

  const pontos = area.pontos ?? [];
  const rect = ehRetangulo(pontos);
  const areaM2 = areaPoligonoM2(pontos);
  const perim = perimetroCm(pontos);
  const custo = area.preco_m2 ? areaM2 * area.preco_m2 : 0;
  const travado = !!area.bloqueado;

  // Referência para distâncias: caixa das paredes desenhadas; senão, a sala-guia.
  const ref = (() => {
    const ps = cena.estrutura?.paredes ?? [];
    if (ps.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of ps) { x0 = Math.min(x0, p.x1, p.x2); x1 = Math.max(x1, p.x1, p.x2); y0 = Math.min(y0, p.y1, p.y2); y1 = Math.max(y1, p.y1, p.y2); }
      return { x0, y0, x1, y1, nome: "parede" };
    }
    return { x0: 0, y0: 0, x1: cena.sala.largura_cm, y1: cena.sala.profundidade_cm, nome: "sala" };
  })();
  const dEsq = area.x_cm - ref.x0, dTopo = area.y_cm - ref.y0;
  const dDir = ref.x1 - (area.x_cm + area.w_cm), dBase = ref.y1 - (area.y_cm + area.h_cm);

  const setRect = (x: number, y: number, w: number, h: number) =>
    updateArea(area.id, { pontos: retanguloParaPontos(x, y, Math.max(10, w), Math.max(10, h)) });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PISO / ÁREA {travado && "🔒"}</div>

      <Bloco label="MATERIAL">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {(Object.keys(MATERIAIS_PISO) as MaterialPiso[]).map((mkey) => (
            <button key={mkey} className="btn" disabled={travado}
              onClick={() => updateArea(area.id, { material: mkey, nome: area.acabamentoId ? area.nome : MATERIAIS_PISO[mkey].label, cor: MATERIAIS_PISO[mkey].cor })}
              style={{ padding: "7px 4px", fontSize: 10, display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-start",
                borderColor: area.material === mkey ? "var(--gold)" : "var(--line-2)", color: area.material === mkey ? "var(--gold)" : "#c9c9c4" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: MATERIAIS_PISO[mkey].cor, flexShrink: 0 }} />
              {MATERIAIS_PISO[mkey].label}
            </button>
          ))}
        </div>
      </Bloco>

      <Bloco label="ACABAMENTO (BIBLIOTECA · PREÇO)">
        <select className="fld" disabled={travado} value={area.acabamentoId ?? ""} onChange={(e) => {
          const ac = acabamentos.find((a) => a.id === e.target.value);
          updateArea(area.id, ac
            ? { acabamentoId: ac.id, nome: ac.nome, cor: ac.cor ?? area.cor, preco_m2: ac.preco_m2 ?? null, material: "outro" }
            : { acabamentoId: null });
        }}>
          <option value="">— selecione da biblioteca —</option>
          {acabamentos.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.preco_m2 ? ` · ${BRL(a.preco_m2)}/m²` : ""}</option>)}
        </select>
      </Bloco>

      {rect ? (
        <>
          <Bloco label="POSIÇÃO X × Y (cm)">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <CampoCm valor={area.x_cm} onSet={(v) => moverArea(area.id, v - area.x_cm, 0)} />
              <span style={{ color: "var(--muted)" }}>×</span>
              <CampoCm valor={area.y_cm} onSet={(v) => moverArea(area.id, 0, v - area.y_cm)} />
            </div>
          </Bloco>
          <Bloco label="LARGURA × COMPRIMENTO (cm)">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <CampoCm valor={area.w_cm} min={10} onSet={(v) => setRect(area.x_cm, area.y_cm, v, area.h_cm)} />
              <span style={{ color: "var(--muted)" }}>×</span>
              <CampoCm valor={area.h_cm} min={10} onSet={(v) => setRect(area.x_cm, area.y_cm, area.w_cm, v)} />
            </div>
          </Bloco>
          <Bloco label={`DISTÂNCIA ATÉ ${ref.nome === "parede" ? "AS PAREDES" : "A SALA"} (cm)`}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 5, alignItems: "center", fontSize: 11.5, color: "#b6b6b1" }}>
              <span>Esquerda</span><CampoCm valor={dEsq} onSet={(v) => moverArea(area.id, v - dEsq, 0)} />
              <span>Topo</span><CampoCm valor={dTopo} onSet={(v) => moverArea(area.id, 0, v - dTopo)} />
              <span>Direita</span><CampoCm valor={dDir} onSet={(v) => moverArea(area.id, dDir - v, 0)} />
              <span>Base</span><CampoCm valor={dBase} onSet={(v) => moverArea(area.id, 0, dBase - v)} />
            </div>
          </Bloco>
        </>
      ) : (
        <div style={{ fontSize: 11.5, color: "#b6b6b1", lineHeight: 1.5 }}>
          Polígono de <b style={{ color: "#e9e9e6" }}>{pontos.length} vértices</b> — selecione e arraste cada vértice na planta para ajustar.
        </div>
      )}

      <Bloco label={`SENTIDO DO PISO · ${Math.round(area.rotacaoTextura ?? 0)}°`}>
        <div style={{ display: "flex", gap: 5 }}>
          {[0, 45, 90].map((g) => (
            <button key={g} className="btn" disabled={travado} onClick={() => updateArea(area.id, { rotacaoTextura: g })}
              style={{ flex: 1, padding: "7px 4px", fontSize: 11, borderColor: (area.rotacaoTextura ?? 0) === g ? "var(--gold)" : "var(--line-2)", color: (area.rotacaoTextura ?? 0) === g ? "var(--gold)" : "var(--muted)" }}>{g}°</button>
          ))}
          <button className="btn" disabled={travado} onClick={() => updateArea(area.id, { rotacaoTextura: ((area.rotacaoTextura ?? 0) + 15) % 180 })} style={{ flex: 1, padding: "7px 4px", fontSize: 11 }}>+15°</button>
        </div>
      </Bloco>

      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
        Área: <b style={{ color: "#e9e9e6" }}>{m2(areaM2)}</b> · Perímetro: <b style={{ color: "#e9e9e6" }}>{formatLength(perim)}</b>
        {area.preco_m2 ? <><br />Custo: <b style={{ color: "var(--gold)" }}>{BRL(Math.round(custo))}</b> ({BRL(area.preco_m2)}/m²)</> : null}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => duplicarArea(area.id)}>⧉ Duplicar</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => updateArea(area.id, { bloqueado: !travado })}>{travado ? "🔓 Destravar" : "🔒 Travar"}</button>
      </div>
      <button className="btn" disabled={travado} onClick={() => removerArea(area.id)}>✕ Remover área</button>
    </div>
  );
}

// Inspetor de um elemento de parede (espelho / TV / elétrica…).
function ElemParedeInspector({ el }: { el: ElementoParede }) {
  const updateElemParede = useProjeto((s) => s.updateElemParede);
  const removerElemParede = useProjeto((s) => s.removerElemParede);
  const paredes = useProjeto((s) => s.cena.estrutura?.paredes ?? []);
  const def = ELEMENTOS_PAREDE[el.tipo];
  const espelho = el.tipo === "espelho";
  const areaM2 = (el.largura_cm / 100) * (el.altura_cm / 100);
  const custo = espelho ? areaM2 * (el.preco_m2 ?? 0) : (el.custo ?? 0);
  const travado = !!el.bloqueado;
  const idx = paredes.findIndex((p) => p.id === el.paredeId);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>{def.icone} {def.label.toUpperCase()} {travado && "🔒"}</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Parede {idx >= 0 ? idx + 1 : "?"} · deslocamento do início até o centro</div>
      <Bloco label="DESLOCAMENTO NA PAREDE (cm)">
        <CampoCm valor={el.offset_cm} min={0} onSet={(v) => updateElemParede(el.id, { offset_cm: v })} />
      </Bloco>
      <Bloco label={espelho ? "COMPRIMENTO × ALTURA (cm)" : "LARGURA × ALTURA (cm)"}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <CampoCm valor={el.largura_cm} min={5} onSet={(v) => updateElemParede(el.id, { largura_cm: v })} />
          <span style={{ color: "var(--muted)" }}>×</span>
          <CampoCm valor={el.altura_cm} min={5} onSet={(v) => updateElemParede(el.id, { altura_cm: v })} />
        </div>
      </Bloco>
      <Bloco label="DISTÂNCIA DO PISO (cm)">
        <CampoCm valor={el.dist_piso_cm} min={0} onSet={(v) => updateElemParede(el.id, { dist_piso_cm: v })} />
      </Bloco>
      {espelho && (
        <>
          <Bloco label="ILUMINAÇÃO">
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" disabled={travado} onClick={() => updateElemParede(el.id, { luz_superior: !el.luz_superior })}
                style={{ flex: 1, padding: "7px 4px", fontSize: 11, borderColor: el.luz_superior ? "var(--gold)" : "var(--line-2)", color: el.luz_superior ? "var(--gold)" : "var(--muted)" }}>☀ Superior</button>
              <button className="btn" disabled={travado} onClick={() => updateElemParede(el.id, { luz_inferior: !el.luz_inferior })}
                style={{ flex: 1, padding: "7px 4px", fontSize: 11, borderColor: el.luz_inferior ? "var(--gold)" : "var(--line-2)", color: el.luz_inferior ? "var(--gold)" : "var(--muted)" }}>☀ Inferior</button>
            </div>
          </Bloco>
          <Bloco label="PREÇO POR M² (R$)">
            <CampoCm valor={el.preco_m2 ?? 0} min={0} onSet={(v) => updateElemParede(el.id, { preco_m2: v })} />
          </Bloco>
        </>
      )}
      {!espelho && (
        <Bloco label="CUSTO (R$)">
          <CampoCm valor={el.custo ?? 0} min={0} onSet={(v) => updateElemParede(el.id, { custo: v })} />
        </Bloco>
      )}
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
        Área: <b style={{ color: "#e9e9e6" }}>{m2(areaM2)}</b>
        {custo ? <> · Custo: <b style={{ color: "var(--gold)" }}>{BRL(Math.round(custo))}</b></> : null}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => updateElemParede(el.id, { bloqueado: !travado })}>{travado ? "🔓 Destravar" : "🔒 Travar"}</button>
        <button className="btn" style={{ flex: 1 }} disabled={travado} onClick={() => removerElemParede(el.id)}>✕ Remover</button>
      </div>
    </div>
  );
}

// Inspetor de mobiliário / infraestrutura.
function InfraInspector({ item, snapPasso }: { item: ItemInfraestrutura; snapPasso: number }) {
  const updateInfra = useProjeto((s) => s.updateInfra);
  const removerInfra = useProjeto((s) => s.removerInfra);
  const duplicarInfra = useProjeto((s) => s.duplicarInfra);
  const travado = !!item.bloqueado;
  const passo = snapPasso || 5;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>{item.nome.toUpperCase()} {travado && "🔒"}</div>
      {item.categoria && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{item.categoria}</div>}
      <Bloco label="POSIÇÃO X × Y (cm)">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <CampoCm valor={item.x_cm} onSet={(v) => updateInfra(item.id, { x_cm: v })} />
          <span style={{ color: "var(--muted)" }}>×</span>
          <CampoCm valor={item.y_cm} onSet={(v) => updateInfra(item.id, { y_cm: v })} />
        </div>
      </Bloco>
      <Bloco label="LARGURA × PROFUNDIDADE (cm)">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <CampoCm valor={item.w_cm} min={5} onSet={(v) => updateInfra(item.id, { w_cm: v })} />
          <span style={{ color: "var(--muted)" }}>×</span>
          <CampoCm valor={item.h_cm} min={5} onSet={(v) => updateInfra(item.id, { h_cm: v })} />
        </div>
      </Bloco>
      <Bloco label={`ROTAÇÃO · ${Math.round(item.rotacao || 0)}°`}>
        <div style={{ display: "flex", gap: 5 }}>
          {[["-45", -45], ["-5", -5], ["+5", 5], ["+45", 45], ["90", 90]].map(([lbl, d]) => (
            <button key={lbl} className="btn" disabled={travado} onClick={() => updateInfra(item.id, { rotacao: ((item.rotacao || 0) + (d as number)) % 360 })}
              style={{ flex: 1, padding: "7px 2px", fontSize: 10.5 }}>{lbl}°</button>
          ))}
        </div>
      </Bloco>
      <Bloco label={`NUDGE (${passo} cm)`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, maxWidth: 150 }}>
          <span /><button className="btn" disabled={travado} style={{ padding: "6px 0" }} onClick={() => updateInfra(item.id, { y_cm: item.y_cm - passo })}>↑</button><span />
          <button className="btn" disabled={travado} style={{ padding: "6px 0" }} onClick={() => updateInfra(item.id, { x_cm: item.x_cm - passo })}>←</button>
          <button className="btn" disabled={travado} style={{ padding: "6px 0" }} onClick={() => updateInfra(item.id, { y_cm: item.y_cm + passo })}>↓</button>
          <button className="btn" disabled={travado} style={{ padding: "6px 0" }} onClick={() => updateInfra(item.id, { x_cm: item.x_cm + passo })}>→</button>
        </div>
      </Bloco>
      <Bloco label="CUSTO (R$)">
        <CampoCm valor={item.custo ?? 0} min={0} onSet={(v) => updateInfra(item.id, { custo: v })} />
      </Bloco>
      <Bloco label="OBSERVAÇÃO">
        <input className="fld" value={item.obs ?? ""} disabled={travado} onChange={(e) => updateInfra(item.id, { obs: e.target.value }, false)} onBlur={(e) => updateInfra(item.id, { obs: e.target.value })} />
      </Bloco>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => duplicarInfra(item.id)}>⧉ Duplicar</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => updateInfra(item.id, { bloqueado: !travado })}>{travado ? "🔓 Destravar" : "🔒 Travar"}</button>
      </div>
      <button className="btn" disabled={travado} onClick={() => removerInfra(item.id)}>✕ Remover</button>
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
