import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Line, Group, Text, Image as KImage, Circle, Transformer } from "react-konva";
import type Konva from "konva";
import { useProjeto } from "../store/projetoStore";
import { ZONAS, type ItemPosicionado, type Parede, type PilarPlanta, type Abertura } from "../lib/types";
import { problemasDaCena } from "../lib/validation";
import { snapCm, GRID_CM } from "../lib/canvas";
import { formatLength } from "../lib/units";
import { arred } from "../lib/estrutura";

export type Etapa = "planta" | "acabamento" | "layout";
export type FerramentaEstrutura = "parede" | "porta" | "janela" | "pilar" | null;

// Ponto mais próximo sobre um segmento (parede) e distância — para encaixar aberturas.
function projetarNaParede(px: number, py: number, w: Parede) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len2 = dx * dx + dy * dy || 1;
  let t = ((px - w.x1) * dx + (py - w.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = w.x1 + t * dx, cy = w.y1 + t * dy;
  return { t, cx, cy, dist: Math.hypot(px - cx, py - cy), len: Math.hypot(dx, dy) };
}

function useHtmlImage(src?: string) {
  const [img, setImg] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    if (!src) { setImg(undefined); return; }
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  return img;
}

interface Cam { zoom: number; x: number; y: number } // x,y = posição da layer em px

export default function EditorCanvas({ modoCalibrar, onCalibrar, modoAcabamento, onArea, modoRecorte, onRecorte, modoParede, onParede, modoMoverPlanta, stageRef, somenteLeitura, etapa, ferrEstrutura }: {
  modoCalibrar: boolean;
  onCalibrar: (distanciaMundoCm: number) => void;
  modoAcabamento: boolean;
  onArea: (rect: { x: number; y: number; w: number; h: number }) => void;
  modoRecorte: boolean;
  onRecorte: (rect: { x: number; y: number; w: number; h: number }) => void;
  modoParede: boolean;
  onParede: (p1: { x: number; y: number }, p2: { x: number; y: number }) => void;
  modoMoverPlanta: boolean;
  stageRef?: React.RefObject<Konva.Stage>;
  somenteLeitura?: boolean;
  etapa?: Etapa;
  ferrEstrutura?: FerramentaEstrutura;
}) {
  const etapaAtual: Etapa = etapa ?? "layout";
  const cena = useProjeto((s) => s.cena);
  const selectedId = useProjeto((s) => s.selectedId);
  const selectedAcabId = useProjeto((s) => s.selectedAcabId);
  const selEstrutura = useProjeto((s) => s.selEstrutura);
  const selecionar = useProjeto((s) => s.selecionar);
  const selecionarAcab = useProjeto((s) => s.selecionarAcab);
  const selecionarEstrutura = useProjeto((s) => s.selecionarEstrutura);
  const addParede = useProjeto((s) => s.addParede);
  const addPilar = useProjeto((s) => s.addPilar);
  const addAbertura = useProjeto((s) => s.addAbertura);
  const updateParede = useProjeto((s) => s.updateParede);
  const updatePilar = useProjeto((s) => s.updatePilar);
  const updateItem = useProjeto((s) => s.updateItem);
  const updateArea = useProjeto((s) => s.updateArea);
  const updatePlanta = useProjeto((s) => s.updatePlanta);
  const updatePlantaVetorial = useProjeto((s) => s.updatePlantaVetorial);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState<Cam>({ zoom: 0.4, x: 60, y: 60 });
  const pan = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const [calPts, setCalPts] = useState<{ x: number; y: number }[]>([]);
  const [areaPts, setAreaPts] = useState<{ x: number; y: number }[]>([]);
  const [recPts, setRecPts] = useState<{ x: number; y: number }[]>([]);
  const [pardPts, setPardPts] = useState<{ x: number; y: number }[]>([]);
  const [estPts, setEstPts] = useState<{ x: number; y: number }[]>([]); // paredes/pilares da Etapa 1
  const areaRefs = useRef<Record<string, Konva.Group>>({});
  const trRef = useRef<Konva.Transformer>(null);

  const plantaImg = useHtmlImage(cena.planta?.dataUrl);

  // Ajusta tamanho ao container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Enquadra a sala quando abre / muda dimensões
  const sala = cena.sala;
  useEffect(() => {
    const margin = 1.2;
    const zoom = Math.min(size.w / (sala.largura_cm * margin), size.h / (sala.profundidade_cm * margin));
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 0.4;
    setCam({ zoom: z, x: size.w / 2 - (sala.largura_cm / 2) * z, y: size.h / 2 - (sala.profundidade_cm / 2) * z });
  }, [sala.largura_cm, sala.profundidade_cm, size.w, size.h]);

  const toWorld = (sx: number, sy: number) => ({ x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom });

  const zoomAt = (sx: number, sy: number, factor: number) => {
    setCam((c) => {
      const zoom = Math.min(4, Math.max(0.03, c.zoom * factor));
      // mantém o ponto do mundo fixo sob (sx,sy)
      const wx = (sx - c.x) / c.zoom, wy = (sy - c.y) / c.zoom;
      return { zoom, x: sx - wx * zoom, y: sy - wy * zoom };
    });
  };

  const problemas = useMemo(() => problemasDaCena(cena), [cena]);

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const p = stage?.getPointerPosition();
    if (!p) return;
    zoomAt(p.x, p.y, e.evt.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  function stageDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    const emVazio = e.target === stage || e.target.name() === "bg";
    if (modoCalibrar && emVazio) {
      const w = toWorld(p.x, p.y);
      const pts = [...calPts, w];
      if (pts.length === 2) {
        const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        setCalPts([]);
        onCalibrar(d);
      } else setCalPts(pts);
      return;
    }
    if (modoAcabamento && emVazio) {
      const w = toWorld(p.x, p.y);
      const pts = [...areaPts, w];
      if (pts.length === 2) {
        const x = snapCm(Math.min(pts[0].x, pts[1].x)), y = snapCm(Math.min(pts[0].y, pts[1].y));
        const wcm = snapCm(Math.abs(pts[1].x - pts[0].x)), hcm = snapCm(Math.abs(pts[1].y - pts[0].y));
        setAreaPts([]);
        if (wcm >= GRID_CM && hcm >= GRID_CM) onArea({ x, y, w: wcm, h: hcm });
      } else setAreaPts(pts);
      return;
    }
    if (modoRecorte && emVazio) {
      const w = toWorld(p.x, p.y);
      const pts = [...recPts, w];
      if (pts.length === 2) {
        const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
        const wcm = Math.abs(pts[1].x - pts[0].x), hcm = Math.abs(pts[1].y - pts[0].y);
        setRecPts([]);
        if (wcm > 1 && hcm > 1) onRecorte({ x, y, w: wcm, h: hcm });
      } else setRecPts(pts);
      return;
    }
    if (modoParede) {
      const w = toWorld(p.x, p.y);
      const pts = [...pardPts, w];
      if (pts.length === 2) {
        setPardPts([]);
        if (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) > 1) onParede(pts[0], pts[1]);
      } else setPardPts(pts);
      return;
    }
    // ── Etapa 1: ferramentas de estrutura ──────────────────────────────────
    if (ferrEstrutura === "parede" || ferrEstrutura === "pilar") {
      const w = toWorld(p.x, p.y);
      const pts = [...estPts, w];
      if (pts.length === 2) {
        setEstPts([]);
        if (ferrEstrutura === "parede") {
          // ortogonaliza se estiver quase na horizontal/vertical
          let x1 = arred(pts[0].x), y1 = arred(pts[0].y), x2 = arred(pts[1].x), y2 = arred(pts[1].y);
          const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
          if (dy < dx * 0.2) y2 = y1; else if (dx < dy * 0.2) x2 = x1;
          if (Math.hypot(x2 - x1, y2 - y1) >= GRID_CM) addParede({ id: crypto.randomUUID(), x1, y1, x2, y2, espessura_cm: 15 });
        } else {
          const x = arred(Math.min(pts[0].x, pts[1].x)), y = arred(Math.min(pts[0].y, pts[1].y));
          const w2 = arred(Math.abs(pts[1].x - pts[0].x)), h2 = arred(Math.abs(pts[1].y - pts[0].y));
          if (w2 >= GRID_CM && h2 >= GRID_CM) addPilar({ id: crypto.randomUUID(), x_cm: x, y_cm: y, w_cm: w2, h_cm: h2 });
        }
      } else setEstPts(pts);
      return;
    }
    if (ferrEstrutura === "porta" || ferrEstrutura === "janela") {
      const w = toWorld(p.x, p.y);
      const paredes = cena.estrutura?.paredes ?? [];
      let melhor: { parede: Parede; t: number; len: number; dist: number } | null = null;
      for (const pr of paredes) {
        const pj = projetarNaParede(w.x, w.y, pr);
        if (!melhor || pj.dist < melhor.dist) melhor = { parede: pr, t: pj.t, len: pj.len, dist: pj.dist };
      }
      if (melhor && melhor.dist < 80) {
        const largura = ferrEstrutura === "porta" ? 90 : 120;
        addAbertura({ id: crypto.randomUUID(), paredeId: melhor.parede.id, centro_cm: arred(melhor.t * melhor.len), largura_cm: largura, tipo: ferrEstrutura });
      }
      return;
    }
    const touches = (e.evt as TouchEvent).touches;
    if (touches && touches.length === 2) {
      const [a, b] = [touches[0], touches[1]];
      pinch.current = { dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
      return;
    }
    if (emVazio) { pan.current = { x: p.x, y: p.y }; if (!modoCalibrar) selecionar(null); }
  }

  function stageMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const touches = (e.evt as TouchEvent).touches;
    // Captura os refs em locais ANTES do setCam: o updater roda depois e o
    // stageUp pode zerar pinch/pan nesse meio-tempo (crash "current.x" no iPad).
    const pinchAtual = pinch.current;
    if (touches && touches.length === 2 && pinchAtual) {
      const [a, b] = [touches[0], touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) zoomAt(cx - rect.left, cy - rect.top, dist / (pinchAtual.dist || dist));
      setCam((c) => ({ ...c, x: c.x + (cx - pinchAtual.cx), y: c.y + (cy - pinchAtual.cy) }));
      pinch.current = { dist, cx, cy };
      return;
    }
    const panAtual = pan.current;
    if (panAtual) {
      const p = stage.getPointerPosition();
      if (!p) return;
      setCam((c) => ({ ...c, x: c.x + (p.x - panAtual.x), y: c.y + (p.y - panAtual.y) }));
      pan.current = { x: p.x, y: p.y };
    }
  }
  const stageUp = () => { pan.current = null; pinch.current = null; };

  // Grade adaptativa (evita milhares de linhas quando muito afastado)
  const gridLines = useMemo(() => {
    const step = cam.zoom < 0.12 ? GRID_CM * 20 : cam.zoom < 0.3 ? GRID_CM * 4 : GRID_CM;
    const lines: number[][] = [];
    const x0 = -step, x1 = sala.largura_cm + step, y0 = -step, y1 = sala.profundidade_cm + step;
    for (let x = 0; x <= x1; x += step) lines.push([x, y0, x, y1]);
    for (let y = 0; y <= y1; y += step) lines.push([x0, y, x1, y]);
    return lines;
  }, [cam.zoom, sala.largura_cm, sala.profundidade_cm]);

  const cfg = sala.config || {};
  const planta = cena.planta;
  const pv = cena.plantaVetorial;
  const desenhandoEst = ferrEstrutura === "parede" || ferrEstrutura === "pilar" || ferrEstrutura === "porta" || ferrEstrutura === "janela";
  const drawing = modoCalibrar || modoAcabamento || modoRecorte || modoParede || desenhandoEst; // enquanto desenha, nada captura o toque
  // Interatividade por etapa: só o que pertence à etapa ativa responde ao toque.
  const itensAtivos = etapaAtual === "layout" && !drawing && !somenteLeitura && !modoMoverPlanta;
  const areasAtivas = etapaAtual === "acabamento" && !drawing && !somenteLeitura && !modoMoverPlanta;
  const estAtiva = etapaAtual === "planta" && !drawing && !somenteLeitura && !modoMoverPlanta;
  const bloquear = !areasAtivas; // usado pelas áreas de acabamento (compat.)
  const camVis = useMemo(() => new Map((pv?.camadas ?? []).map((c) => [c.nome, c.visivel])), [pv]);

  // Prende o Transformer à área de acabamento selecionada (some durante o desenho).
  useEffect(() => {
    const node = !bloquear && selectedAcabId ? areaRefs.current[selectedAcabId] : null;
    if (trRef.current) { trRef.current.nodes(node ? [node] : []); trRef.current.getLayer()?.batchDraw(); }
  }, [selectedAcabId, drawing, cena.acabamentos]);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0, cursor: drawing ? "crosshair" : modoMoverPlanta ? "grab" : pan.current ? "grabbing" : "default", background: "#0C0C0E" }}>
      <Stage ref={stageRef} width={size.w} height={size.h} onWheel={onWheel}
        onMouseDown={stageDown} onMouseMove={stageMove} onMouseUp={stageUp}
        onTouchStart={stageDown} onTouchMove={stageMove} onTouchEnd={stageUp}>
        <Layer x={cam.x} y={cam.y} scaleX={cam.zoom} scaleY={cam.zoom}>
          {/* fundo/hit-area da sala */}
          <Rect name="bg" x={-2000} y={-2000} width={sala.largura_cm + 4000} height={sala.profundidade_cm + 4000} fill="#0C0C0E" />

          {/* faixas de piso */}
          {(cfg.pisos || []).map((f) => (
            <Rect key={f.nome} name="bg" x={0} y={f.y0} width={sala.largura_cm} height={f.y1 - f.y0} fill={f.cor} />
          ))}

          {/* planta baixa (fundo em escala real) */}
          {planta && plantaImg && (
            <KImage image={plantaImg} x={planta.x_cm} y={planta.y_cm} rotation={planta.rotacao || 0}
              width={planta.larguraPx * planta.cmPorPx} height={planta.alturaPx * planta.cmPorPx}
              opacity={planta.opacidade} listening={modoMoverPlanta && !planta.bloqueada} draggable={modoMoverPlanta && !planta.bloqueada}
              onDragEnd={(e) => updatePlanta({ x_cm: e.target.x(), y_cm: e.target.y() })} />
          )}

          {/* planta VETORIAL (desenho separado do texto) */}
          {pv && (
            <Group x={pv.x_cm} y={pv.y_cm} rotation={pv.rotacao || 0} scaleX={pv.escala || 1} scaleY={pv.escala || 1} opacity={pv.opacidade}
              listening={modoMoverPlanta && !pv.bloqueada} draggable={modoMoverPlanta && !pv.bloqueada}
              onDragEnd={(e) => updatePlantaVetorial({ x_cm: e.target.x(), y_cm: e.target.y() })}>
              {pv.tracos.map((tr, i) => (
                camVis.get(tr.camada ?? "0") === false ? null :
                <Line key={i} points={tr.pts} closed={tr.fechado} stroke={tr.cor || "#9FB4C7"} strokeWidth={1 / (cam.zoom * (pv.escala || 1))} />
              ))}
              {pv.mostrarTexto && pv.rotulos.map((r, i) => (
                camVis.get(r.camada ?? "0") === false ? null :
                <Text key={`t${i}`} x={r.x_cm} y={r.y_cm} text={r.texto} fontSize={Math.max(1, r.altura)} rotation={r.rotacao} fill="#C9A227" />
              ))}
            </Group>
          )}

          {/* grade */}
          {gridLines.map((l, i) => <Line key={i} points={l} stroke="#ffffff" strokeWidth={0.6 / cam.zoom} opacity={0.05} listening={false} />)}

          {/* corredor */}
          {cfg.corredor && <Rect name="bg" x={cfg.corredor.x} y={0} width={cfg.corredor.w} height={sala.profundidade_cm} fill="#C9A227" opacity={0.06} listening={false} />}

          {/* contorno da sala */}
          <Rect x={0} y={0} width={sala.largura_cm} height={sala.profundidade_cm} stroke="#3A3A3C" strokeWidth={12 / cam.zoom} listening={false} />

          {/* pilar (config legado) */}
          {cfg.pilar && !cena.estrutura && <Rect name="bg" x={cfg.pilar.x} y={cfg.pilar.y} width={cfg.pilar.w} height={cfg.pilar.h} fill="#2B2B2E" stroke="#8A8A8F" strokeWidth={2 / cam.zoom} listening={false} />}

          {/* ── Etapa 1: estrutura (pilares, paredes, portas/janelas) ── */}
          {cena.estrutura && (() => {
            const est = cena.estrutura!;
            const pmap = new Map(est.paredes.map((p) => [p.id, p]));
            const ctx = etapaAtual === "planta" ? 1 : 0.5; // esmaece fora da Etapa 1
            return (
              <Group opacity={ctx}>
                {/* pilares */}
                {est.pilares.map((p) => {
                  const sel = selEstrutura?.tipo === "pilar" && selEstrutura.id === p.id;
                  return (
                    <Rect key={p.id} x={p.x_cm} y={p.y_cm} width={p.w_cm} height={p.h_cm} fill="#2B2B2E"
                      stroke={sel ? "#C9A227" : "#8A8A8F"} strokeWidth={(sel ? 4 : 2) / cam.zoom}
                      listening={estAtiva} draggable={estAtiva}
                      onMouseDown={() => selecionarEstrutura({ tipo: "pilar", id: p.id })} onTap={() => selecionarEstrutura({ tipo: "pilar", id: p.id })}
                      onDragMove={(e) => updatePilar(p.id, { x_cm: e.target.x(), y_cm: e.target.y() }, false)}
                      onDragEnd={(e) => updatePilar(p.id, { x_cm: arred(e.target.x()), y_cm: arred(e.target.y()) })} />
                  );
                })}
                {/* paredes */}
                {est.paredes.map((w) => {
                  const sel = selEstrutura?.tipo === "parede" && selEstrutura.id === w.id;
                  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
                  return (
                    <Group key={w.id}>
                      <Line points={[w.x1, w.y1, w.x2, w.y2]} stroke={sel ? "#C9A227" : "#C9C9C4"} strokeWidth={Math.max(w.espessura_cm, 4)}
                        lineCap="round" hitStrokeWidth={Math.max(w.espessura_cm, 34 / cam.zoom)} listening={estAtiva}
                        onMouseDown={() => selecionarEstrutura({ tipo: "parede", id: w.id })} onTap={() => selecionarEstrutura({ tipo: "parede", id: w.id })} />
                      {sel && (
                        <Text x={(w.x1 + w.x2) / 2} y={(w.y1 + w.y2) / 2 - 22 / cam.zoom} text={formatLength(len)}
                          fontSize={15 / cam.zoom} fill="#C9A227" listening={false} />
                      )}
                      {sel && estAtiva && [{ k: "a", x: w.x1, y: w.y1 }, { k: "b", x: w.x2, y: w.y2 }].map((h) => (
                        <Circle key={h.k} x={h.x} y={h.y} radius={9 / cam.zoom} fill="#0C0C0E" stroke="#C9A227" strokeWidth={2 / cam.zoom} draggable
                          onDragMove={(e) => updateParede(w.id, h.k === "a" ? { x1: e.target.x(), y1: e.target.y() } : { x2: e.target.x(), y2: e.target.y() }, false)}
                          onDragEnd={(e) => updateParede(w.id, h.k === "a" ? { x1: arred(e.target.x()), y1: arred(e.target.y()) } : { x2: arred(e.target.x()), y2: arred(e.target.y()) })} />
                      ))}
                    </Group>
                  );
                })}
                {/* aberturas (portas/janelas) */}
                {est.aberturas.map((ab) => {
                  const w = pmap.get(ab.paredeId); if (!w) return null;
                  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
                  const ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
                  const cx = w.x1 + ux * ab.centro_cm, cy = w.y1 + uy * ab.centro_cm, half = ab.largura_cm / 2;
                  const ax = cx - ux * half, ay = cy - uy * half, bx = cx + ux * half, by = cy + uy * half;
                  const sel = selEstrutura?.tipo === "abertura" && selEstrutura.id === ab.id;
                  const cor = ab.tipo === "porta" ? "#5FBF7A" : "#5FC8E8";
                  const px = -uy, py = ux; // perpendicular (batente da porta)
                  return (
                    <Group key={ab.id} listening={estAtiva}
                      onMouseDown={() => selecionarEstrutura({ tipo: "abertura", id: ab.id })} onTap={() => selecionarEstrutura({ tipo: "abertura", id: ab.id })}>
                      {/* "corta" a parede no vão */}
                      <Line points={[ax, ay, bx, by]} stroke="#0C0C0E" strokeWidth={w.espessura_cm + 3} lineCap="butt" listening={false} />
                      {ab.tipo === "janela"
                        ? <Line points={[ax, ay, bx, by]} stroke={sel ? "#C9A227" : cor} strokeWidth={4 / cam.zoom} listening={false} />
                        : <>
                            <Line points={[ax, ay, ax + px * ab.largura_cm, ay + py * ab.largura_cm]} stroke={sel ? "#C9A227" : cor} strokeWidth={3 / cam.zoom} listening={false} />
                            <Line points={[ax, ay, bx, by]} stroke={sel ? "#C9A227" : cor} strokeWidth={2 / cam.zoom} dash={[6 / cam.zoom, 6 / cam.zoom]} listening={false} />
                          </>}
                      {/* alça de clique */}
                      <Circle x={cx} y={cy} radius={(sel ? 8 : 6) / cam.zoom} fill={sel ? "#C9A227" : cor} listening={estAtiva} />
                    </Group>
                  );
                })}
                {/* marcadores da ferramenta em uso */}
                {estPts.map((pp, i) => <Circle key={`e${i}`} x={pp.x} y={pp.y} radius={7 / cam.zoom} fill="#C9A227" listening={false} />)}
                {estPts.length === 1 && <Text x={estPts[0].x} y={estPts[0].y} text={ferrEstrutura === "pilar" ? " canto oposto do pilar" : " outra ponta da parede"} fontSize={16 / cam.zoom} fill="#C9A227" listening={false} />}
              </Group>
            );
          })()}

          {/* áreas de acabamento (piso/parede pintados) */}
          {(cena.acabamentos ?? []).map((a) => {
            const sel = selectedAcabId === a.id;
            const m2 = (a.w_cm / 100) * (a.h_cm / 100);
            return (
              <Group key={a.id} x={a.x_cm} y={a.y_cm} listening={!bloquear} draggable={!bloquear}
                ref={(n) => { if (n) areaRefs.current[a.id] = n; else delete areaRefs.current[a.id]; }}
                onMouseDown={() => selecionarAcab(a.id)} onTouchStart={() => selecionarAcab(a.id)} onClick={() => selecionarAcab(a.id)} onTap={() => selecionarAcab(a.id)}
                onDragEnd={(e) => updateArea(a.id, { x_cm: snapCm(e.target.x()), y_cm: snapCm(e.target.y()) })}
                onTransformEnd={(e) => {
                  const node = e.target; const sx = node.scaleX(), sy = node.scaleY();
                  node.scaleX(1); node.scaleY(1);
                  updateArea(a.id, { x_cm: snapCm(node.x()), y_cm: snapCm(node.y()), w_cm: Math.max(GRID_CM, snapCm(a.w_cm * sx)), h_cm: Math.max(GRID_CM, snapCm(a.h_cm * sy)) });
                }}>
                <Rect width={a.w_cm} height={a.h_cm} fill={a.cor} opacity={a.tipo === "parede" ? 0.3 : 0.5}
                  stroke={sel ? "#C9A227" : a.cor} strokeWidth={(sel ? 6 : 2) / cam.zoom} dash={a.tipo === "parede" ? [14 / cam.zoom, 8 / cam.zoom] : undefined} />
                <Text x={0} y={a.h_cm / 2 - 9} width={a.w_cm} align="center" text={`${a.nome}\n${m2.toFixed(1)} m²`}
                  fontSize={13} fill="#F2F2F0" fontStyle="600" listening={false} />
              </Group>
            );
          })}

          {/* handles de mover/redimensionar da área de acabamento selecionada */}
          <Transformer ref={trRef} rotateEnabled={false} keepRatio={false} ignoreStroke
            anchorSize={12 / cam.zoom} anchorStroke="#C9A227" borderStroke="#C9A227" borderStrokeWidth={1.5 / cam.zoom}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < GRID_CM || newBox.height < GRID_CM ? oldBox : newBox)} />

          {/* equipamentos */}
          {cena.itens.map((it) => (
            <ItemView key={it.id} it={it} zoom={cam.zoom} selected={selectedId === it.id} problema={problemas[it.id]} listening={itensAtivos}
              onSelect={() => selecionar(it.id)}
              onDrag={(x, y, commit) => updateItem(it.id, { x_cm: snapCm(x), y_cm: snapCm(y) }, commit)} />
          ))}

          {/* marcadores de calibração */}
          {calPts.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#5FC8E8" />)}
          {calPts.length === 1 && <Text x={calPts[0].x} y={calPts[0].y} text=" toque o 2º ponto" fontSize={16 / cam.zoom} fill="#5FC8E8" />}

          {/* marcadores de área de acabamento */}
          {areaPts.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#C9A227" />)}
          {areaPts.length === 1 && <Text x={areaPts[0].x} y={areaPts[0].y} text=" toque o canto oposto" fontSize={16 / cam.zoom} fill="#C9A227" />}

          {/* marcadores de recorte */}
          {recPts.map((p, i) => <Circle key={`r${i}`} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#5FBF7A" />)}
          {recPts.length === 1 && <Text x={recPts[0].x} y={recPts[0].y} text=" toque o canto oposto (recorte)" fontSize={16 / cam.zoom} fill="#5FBF7A" />}

          {/* marcadores da parede de referência */}
          {pardPts.map((p, i) => <Circle key={`p${i}`} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#C97BE0" />)}
          {pardPts.length === 1 && <Text x={pardPts[0].x} y={pardPts[0].y} text=" toque a outra ponta da parede" fontSize={16 / cam.zoom} fill="#C97BE0" />}
        </Layer>
      </Stage>
    </div>
  );
}

function ItemView({ it, zoom, selected, problema, listening, onSelect, onDrag }: {
  it: ItemPosicionado; zoom: number; selected: boolean; problema: "colisao" | "corredor" | null; listening?: boolean;
  onSelect: () => void; onDrag: (x: number, y: number, commit: boolean) => void;
}) {
  const cor = problema === "colisao" ? "#E04545" : problema === "corredor" ? "#E09A45" : (ZONAS[it.zona]?.cor || "#888");
  const vert = it.h_cm > it.w_cm * 1.3;
  const img = useHtmlImage(it.imagem || undefined);
  const temDesenho = !!(it.contorno?.length || it.imagem);
  return (
    <Group x={it.x_cm} y={it.y_cm} draggable={listening !== false} listening={listening}
      onMouseDown={onSelect} onTouchStart={onSelect} onClick={onSelect} onTap={onSelect}
      onDragMove={(e) => onDrag(e.target.x(), e.target.y(), false)}
      onDragEnd={(e) => onDrag(e.target.x(), e.target.y(), true)}>
      <Rect width={it.w_cm} height={it.h_cm} cornerRadius={4} fill={selected ? "#1E1F23" : "#141518"}
        stroke={cor} strokeWidth={(selected ? 7 : 4) / zoom} dash={problema ? [10 / zoom, 7 / zoom] : undefined} />
      {it.imagem && img && <KImage image={img} x={0} y={0} width={it.w_cm} height={it.h_cm} opacity={0.85} listening={false} />}
      {(it.contorno || []).map((pl, i) => (
        <Line key={i} points={pl.map((v, j) => (j % 2 === 0 ? v * it.w_cm : v * it.h_cm))} stroke={cor} strokeWidth={2 / zoom} listening={false} />
      ))}
      {!temDesenho && (
        <Text x={0} y={it.h_cm / 2 - 10} width={it.w_cm} align="center" text={it.nome}
          fontSize={Math.min(it.w_cm, it.h_cm) >= 85 ? 20 : 15} fill="#F2F2F0" fontStyle="600"
          rotation={vert ? -90 : 0} offsetX={vert ? (it.w_cm - it.h_cm) / 2 : 0} listening={false} />
      )}
      {temDesenho && (
        <Text x={0} y={it.h_cm - 16} width={it.w_cm} align="center" text={it.nome} fontSize={12} fill="#F2F2F0" fontStyle="600" listening={false} />
      )}
      <Text x={0} y={it.h_cm / 2 + 12} width={it.w_cm} align="center" text={`${formatLength(it.w_cm)} × ${formatLength(it.h_cm)}`}
        fontSize={12} fill="#9A9AA0" listening={false} visible={!vert && !temDesenho} />
    </Group>
  );
}
