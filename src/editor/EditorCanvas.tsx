import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Line, Group, Text, Image as KImage, Circle } from "react-konva";
import type Konva from "konva";
import { useProjeto } from "../store/projetoStore";
import { ZONAS, type ItemPosicionado, type Parede, type PilarPlanta, type Abertura } from "../lib/types";
import { problemasDaCena } from "../lib/validation";
import { snapCm, GRID_CM } from "../lib/canvas";
import { formatLength } from "../lib/units";
import { arred } from "../lib/estrutura";
import { areaPoligonoM2, perimetroCm, projetarNoSegmento, m2, type Ponto } from "../lib/geometria";
import { gerarCotasAutomaticas } from "../lib/lamina";
import { MATERIAIS_PISO, ELEMENTOS_PAREDE, PAPEL_LADO, LADOS_PADRAO, type TipoElementoParede, type LadoRect } from "../lib/types";

export type Etapa = "planta" | "acabamento" | "layout" | "fichas";
export type FerramentaEstrutura = "parede" | "porta" | "janela" | "pilar" | "apagar" | null;
export type FerramentaAcab = "rect" | "poligono" | "cota" | "espelho" | "itemParede" | "apagar" | null;

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

export default function EditorCanvas({ modoCalibrar, onCalibrar, ferrAcab, tipoElemParede, snapPasso, camadas, apresentacao, lamina, modoVista, onVista, onArea, modoRecorte, onRecorte, modoParede, onParede, modoMoverPlanta, stageRef, somenteLeitura, etapa, ferrEstrutura }: {
  modoCalibrar: boolean;
  onCalibrar: (distanciaMundoCm: number) => void;
  ferrAcab?: FerramentaAcab; // ferramentas da Etapa 2 (área/polígono/cota/apagar)
  tipoElemParede?: TipoElementoParede; // tipo a inserir quando ferrAcab === "itemParede"
  snapPasso?: number; // 0 = snap de grade desligado; 1/5/10 cm
  camadas?: "tudo" | "uso" | "nada"; // camadas técnicas do equipamento (uso/segurança)
  apresentacao?: boolean; // modo limpo para apresentar ao condomínio
  lamina?: boolean; // Lâmina do Arquiteto: cotas automáticas de afastamento
  modoVista?: boolean; // Vista IA: 2 toques (câmera + direção) geram prompt
  onVista?: (p1: Ponto, p2: Ponto) => void;
  onArea: (pontos: Ponto[]) => void;
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
  const removerParede = useProjeto((s) => s.removerParede);
  const removerPilar = useProjeto((s) => s.removerPilar);
  const removerAbertura = useProjeto((s) => s.removerAbertura);
  const updateItem = useProjeto((s) => s.updateItem);
  const updateArea = useProjeto((s) => s.updateArea);
  const moverArea = useProjeto((s) => s.moverArea);
  const removerArea = useProjeto((s) => s.removerArea);
  const addCota = useProjeto((s) => s.addCota);
  const removerCota = useProjeto((s) => s.removerCota);
  const selElemParedeId = useProjeto((s) => s.selElemParedeId);
  const selecionarElemParede = useProjeto((s) => s.selecionarElemParede);
  const addElemParede = useProjeto((s) => s.addElemParede);
  const updateElemParede = useProjeto((s) => s.updateElemParede);
  const removerElemParede = useProjeto((s) => s.removerElemParede);
  const selInfraId = useProjeto((s) => s.selInfraId);
  const selecionarInfra = useProjeto((s) => s.selecionarInfra);
  const updateInfra = useProjeto((s) => s.updateInfra);
  const removerInfra = useProjeto((s) => s.removerInfra);
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
  const [polyPts, setPolyPts] = useState<Ponto[]>([]); // polígono de piso em desenho
  const [cotaPts, setCotaPts] = useState<Ponto[]>([]); // cota em desenho
  const [vistaPts, setVistaPts] = useState<Ponto[]>([]); // câmera da Vista IA

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

  // ── Snap avançado (Fase 1): vértice → parede → grade ─────────────────────
  // Vértices (de áreas e pontas de parede) têm prioridade, depois a linha da
  // parede, depois a grade (1/5/10 cm; 0 = desligada, valor cru).
  function snapPonto(w: Ponto): Ponto {
    const thr = 14 / cam.zoom; // raio de imã em px de tela
    let melhor: { p: Ponto; d: number } | null = null;
    const tenta = (x: number, y: number) => {
      const d = Math.hypot(w.x - x, w.y - y);
      if (d < thr && (!melhor || d < melhor.d)) melhor = { p: { x, y }, d };
    };
    for (const pr of cena.estrutura?.paredes ?? []) { tenta(pr.x1, pr.y1); tenta(pr.x2, pr.y2); }
    for (const a of cena.acabamentos ?? []) for (const pt of a.pontos ?? []) tenta(pt.x, pt.y);
    if (melhor) return (melhor as { p: Ponto; d: number }).p;
    // linha da parede
    let melhorSeg: { p: Ponto; d: number } | null = null;
    for (const pr of cena.estrutura?.paredes ?? []) {
      const pj = projetarNoSegmento(w, { x: pr.x1, y: pr.y1 }, { x: pr.x2, y: pr.y2 });
      if (pj.dist < thr && (!melhorSeg || pj.dist < melhorSeg.d)) melhorSeg = { p: { x: pj.x, y: pj.y }, d: pj.dist };
    }
    if (melhorSeg) return (melhorSeg as { p: Ponto; d: number }).p; // fica exatamente sobre a parede
    const passo = snapPasso ?? 0;
    if (passo > 0) return { x: Math.round(w.x / passo) * passo, y: Math.round(w.y / passo) * passo };
    return { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10 }; // sem snap: precisão de 1 mm
  }

  const zoomAt = (sx: number, sy: number, factor: number) => {
    setCam((c) => {
      const zoom = Math.min(4, Math.max(0.03, c.zoom * factor));
      // mantém o ponto do mundo fixo sob (sx,sy)
      const wx = (sx - c.x) / c.zoom, wy = (sy - c.y) / c.zoom;
      return { zoom, x: sx - wx * zoom, y: sy - wy * zoom };
    });
  };

  const problemas = useMemo(() => problemasDaCena(cena), [cena]);
  const cotasAuto = useMemo(() => (lamina ? gerarCotasAutomaticas(cena) : []), [lamina, cena]);

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
    // ── Etapa 2: área retangular (2 toques, com snap) ─────────────────────
    if (ferrAcab === "rect" && emVazio) {
      const w = snapPonto(toWorld(p.x, p.y));
      const pts = [...areaPts, w];
      if (pts.length === 2) {
        const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
        const wcm = Math.abs(pts[1].x - pts[0].x), hcm = Math.abs(pts[1].y - pts[0].y);
        setAreaPts([]);
        if (wcm >= 10 && hcm >= 10) onArea([{ x, y }, { x: x + wcm, y }, { x: x + wcm, y: y + hcm }, { x, y: y + hcm }]);
      } else setAreaPts(pts);
      return;
    }
    // ── Etapa 2: polígono (vários toques; toque no 1º ponto fecha) ────────
    if (ferrAcab === "poligono" && emVazio) {
      const w = snapPonto(toWorld(p.x, p.y));
      if (polyPts.length >= 3) {
        const d0 = Math.hypot(w.x - polyPts[0].x, w.y - polyPts[0].y);
        if (d0 < 20 / cam.zoom) { // fechou no 1º ponto
          const pts = polyPts;
          setPolyPts([]);
          onArea(pts);
          return;
        }
      }
      setPolyPts([...polyPts, w]);
      return;
    }
    // ── Etapa 2: cota (2 toques; quase-reto vira reto) ────────────────────
    if (ferrAcab === "cota" && emVazio) {
      const w = snapPonto(toWorld(p.x, p.y));
      const pts = [...cotaPts, w];
      if (pts.length === 2) {
        let [a, b] = pts;
        const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
        if (dy < dx * 0.09) b = { x: b.x, y: a.y }; // ortogonaliza cotas quase retas
        else if (dx < dy * 0.09) b = { x: a.x, y: b.y };
        setCotaPts([]);
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 2) addCota({ id: crypto.randomUUID(), x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      } else setCotaPts(pts);
      return;
    }
    // ── Etapa 2: espelho / item de parede (toque na parede insere) ────────
    if (ferrAcab === "espelho" || ferrAcab === "itemParede") {
      const w = toWorld(p.x, p.y);
      const paredes = cena.estrutura?.paredes ?? [];
      let melhor: { parede: Parede; t: number; len: number; dist: number } | null = null;
      for (const pr of paredes) {
        const pj = projetarNaParede(w.x, w.y, pr);
        if (!melhor || pj.dist < melhor.dist) melhor = { parede: pr, t: pj.t, len: pj.len, dist: pj.dist };
      }
      if (melhor && melhor.dist < 100) {
        const tipo: TipoElementoParede = ferrAcab === "espelho" ? "espelho" : (tipoElemParede ?? "tv");
        const def = ELEMENTOS_PAREDE[tipo];
        addElemParede({
          id: crypto.randomUUID(), tipo, paredeId: melhor.parede.id,
          offset_cm: arred(melhor.t * melhor.len),
          largura_cm: def.largura, altura_cm: def.altura, dist_piso_cm: def.distPiso,
          ...(tipo === "espelho" ? { espessura_cm: 0.4, luz_superior: false, luz_inferior: false, preco_m2: 320 } : {}),
        });
      }
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
    if (modoVista) {
      const w = toWorld(p.x, p.y);
      const pts = [...vistaPts, w];
      if (pts.length === 2) {
        setVistaPts([]);
        if (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) > 5) onVista?.(pts[0], pts[1]);
      } else setVistaPts(pts);
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
  const desenhandoAcab = ferrAcab === "rect" || ferrAcab === "poligono" || ferrAcab === "cota" || ferrAcab === "espelho" || ferrAcab === "itemParede";
  const drawing = modoCalibrar || desenhandoAcab || modoRecorte || modoParede || desenhandoEst || !!modoVista; // enquanto desenha, nada captura o toque
  // Interatividade por etapa: só o que pertence à etapa ativa responde ao toque.
  const itensAtivos = (etapaAtual === "layout" || etapaAtual === "fichas") && !drawing && !somenteLeitura && !modoMoverPlanta;
  const areasAtivas = etapaAtual === "acabamento" && !drawing && !somenteLeitura && !modoMoverPlanta;
  const estAtiva = etapaAtual === "planta" && !drawing && !somenteLeitura && !modoMoverPlanta;
  const apagando = estAtiva && ferrEstrutura === "apagar"; // toque no elemento = apagar
  // Toque num elemento da estrutura: apaga (modo ⌫) ou seleciona.
  const tocarEstrutura = (tipo: "parede" | "pilar" | "abertura", id: string) => {
    if (apagando) {
      if (tipo === "parede") removerParede(id); else if (tipo === "pilar") removerPilar(id); else removerAbertura(id);
    } else selecionarEstrutura({ tipo, id });
  };
  const apagandoAcab = etapaAtual === "acabamento" && ferrAcab === "apagar" && !somenteLeitura;
  const areasEscutam = areasAtivas || apagandoAcab; // no modo apagar, o toque precisa chegar na área
  const camVis = useMemo(() => new Map((pv?.camadas ?? []).map((c) => [c.nome, c.visivel])), [pv]);

  // Trocar de ferramenta cancela desenhos parciais.
  useEffect(() => { setAreaPts([]); setPolyPts([]); setCotaPts([]); setVistaPts([]); }, [ferrAcab, etapaAtual, modoVista]);

  return (
    <div ref={wrapRef} style={{
      position: "absolute", inset: 0,
      cursor: apagando || apagandoAcab ? "not-allowed" : drawing ? "crosshair" : modoMoverPlanta ? "grab" : pan.current ? "grabbing" : "default",
      background: "#0C0C0E",
      // Apple Pencil / toque no iPad: sem isso o Safari trata o traço como
      // rolagem/gesto da página e o canvas nunca recebe o evento.
      touchAction: "none", WebkitUserSelect: "none", userSelect: "none",
    }}>
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
          {!apresentacao && gridLines.map((l, i) => <Line key={i} points={l} stroke="#ffffff" strokeWidth={0.6 / cam.zoom} opacity={0.05} listening={false} />)}

          {/* corredor */}
          {cfg.corredor && <Rect name="bg" x={cfg.corredor.x} y={0} width={cfg.corredor.w} height={sala.profundidade_cm} fill="#C9A227" opacity={0.06} listening={false} />}

          {/* contorno da sala — só uma GUIA de referência (dimensões do projeto);
              some quando existem paredes reais desenhadas na Etapa 1 */}
          {!(cena.estrutura?.paredes.length) && (
            <>
              <Rect x={0} y={0} width={sala.largura_cm} height={sala.profundidade_cm} stroke="#3A3A3C" strokeWidth={4 / cam.zoom}
                dash={[18 / cam.zoom, 12 / cam.zoom]} listening={false} />
              {etapaAtual === "planta" && (
                <Text x={0} y={-26 / cam.zoom} text={`sala (guia) · ${formatLength(sala.largura_cm)} × ${formatLength(sala.profundidade_cm)} — edite no painel ao lado`}
                  fontSize={14 / cam.zoom} fill="#6e6e73" listening={false} />
              )}
            </>
          )}

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
                      listening={estAtiva} draggable={estAtiva && !apagando}
                      onMouseDown={() => tocarEstrutura("pilar", p.id)} onTap={() => tocarEstrutura("pilar", p.id)}
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
                        onMouseDown={() => tocarEstrutura("parede", w.id)} onTap={() => tocarEstrutura("parede", w.id)} />
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
                      onMouseDown={() => tocarEstrutura("abertura", ab.id)} onTap={() => tocarEstrutura("abertura", ab.id)}>
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
            const pts = a.pontos ?? [];
            if (pts.length < 3) return null;
            const flat = pts.flatMap((p) => [p.x, p.y]);
            const areaM2v = areaPoligonoM2(pts);
            const cor = a.material && a.material !== "outro" ? MATERIAIS_PISO[a.material].cor : a.cor;
            const podeMexer = areasAtivas && !a.bloqueado;
            const rot = ((a.rotacaoTextura ?? 0) * Math.PI) / 180;
            // linhas do sentido do piso, recortadas pelo polígono (clipFunc)
            const diag = Math.hypot(a.w_cm, a.h_cm), cxA = a.x_cm + a.w_cm / 2, cyA = a.y_cm + a.h_cm / 2;
            const nTex = Math.max(2, Math.ceil(diag / 40));
            const texLines: number[][] = [];
            for (let i = -nTex; i <= nTex; i++) {
              const off = i * 40;
              const ox = -Math.sin(rot) * off, oy = Math.cos(rot) * off;
              texLines.push([cxA + ox - Math.cos(rot) * diag, cyA + oy - Math.sin(rot) * diag, cxA + ox + Math.cos(rot) * diag, cyA + oy + Math.sin(rot) * diag]);
            }
            return (
              <Group key={a.id} listening={areasEscutam}>
                <Group
                  onMouseDown={() => (apagandoAcab ? removerArea(a.id) : selecionarAcab(a.id))}
                  onTap={() => (apagandoAcab ? removerArea(a.id) : selecionarAcab(a.id))}
                  draggable={podeMexer}
                  onDragEnd={(e) => {
                    const dx = e.target.x(), dy = e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    const passo = snapPasso ?? 0;
                    const sn = (v: number) => (passo > 0 ? Math.round(v / passo) * passo : Math.round(v * 10) / 10);
                    if (dx || dy) moverArea(a.id, sn(dx), sn(dy));
                  }}>
                  <Line points={flat} closed fill={cor} opacity={a.tipo === "parede" ? 0.3 : 0.45}
                    stroke={sel ? "#C9A227" : cor} strokeWidth={(sel ? 6 : 2) / cam.zoom}
                    dash={a.tipo === "parede" ? [14 / cam.zoom, 8 / cam.zoom] : undefined} />
                  {/* sentido do piso */}
                  <Group listening={false} clipFunc={(ctx) => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); }}>
                    {texLines.map((l, i) => <Line key={i} points={l} stroke="#000000" opacity={0.14} strokeWidth={1.2 / cam.zoom} />)}
                  </Group>
                  <Text x={a.x_cm} y={a.y_cm + a.h_cm / 2 - 9} width={a.w_cm} align="center"
                    text={`${a.nome}${a.bloqueado ? " 🔒" : ""}\n${m2(areaM2v)}`}
                    fontSize={13} fill="#F2F2F0" fontStyle="600" listening={false} />
                </Group>
                {/* vértices editáveis */}
                {sel && podeMexer && pts.map((pt, i) => (
                  <Circle key={i} x={pt.x} y={pt.y} radius={8 / cam.zoom} fill="#0C0C0E" stroke="#C9A227" strokeWidth={2 / cam.zoom} draggable
                    onDragMove={(e) => {
                      const novo = [...pts]; novo[i] = { x: e.target.x(), y: e.target.y() };
                      updateArea(a.id, { pontos: novo }, false);
                    }}
                    onDragEnd={(e) => {
                      const w = snapPonto({ x: e.target.x(), y: e.target.y() });
                      e.target.position(w);
                      const novo = [...pts]; novo[i] = w;
                      updateArea(a.id, { pontos: novo });
                    }} />
                ))}
              </Group>
            );
          })}

          {/* cotas fixadas na planta */}
          {!apresentacao && (cena.cotas ?? []).map((c) => {
            const len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
            const mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
            const ux = (c.x2 - c.x1) / (len || 1), uy = (c.y2 - c.y1) / (len || 1);
            const px = -uy, py = ux, t = 8 / cam.zoom; // traços das pontas
            const escutando = etapaAtual === "acabamento" && (apagandoAcab || areasAtivas);
            return (
              <Group key={c.id} listening={escutando}
                onMouseDown={() => { if (apagandoAcab) removerCota(c.id); }}
                onTap={() => { if (apagandoAcab) removerCota(c.id); }}>
                <Line points={[c.x1, c.y1, c.x2, c.y2]} stroke="#5FC8E8" strokeWidth={1.4 / cam.zoom} hitStrokeWidth={26 / cam.zoom} />
                <Line points={[c.x1 - px * t, c.y1 - py * t, c.x1 + px * t, c.y1 + py * t]} stroke="#5FC8E8" strokeWidth={1.4 / cam.zoom} listening={false} />
                <Line points={[c.x2 - px * t, c.y2 - py * t, c.x2 + px * t, c.y2 + py * t]} stroke="#5FC8E8" strokeWidth={1.4 / cam.zoom} listening={false} />
                <Text x={mx + px * (14 / cam.zoom)} y={my + py * (14 / cam.zoom) - 8 / cam.zoom} text={formatLength(len)}
                  fontSize={14 / cam.zoom} fill="#8fd6f0" listening={false} />
              </Group>
            );
          })}

          {/* ── Etapa 2: mobiliário / infraestrutura ── */}
          {(cena.infra ?? []).map((it) => {
            const sel = selInfraId === it.id;
            const escuta = areasEscutam;
            const podeMexer = areasAtivas && !it.bloqueado;
            return (
              <Group key={it.id} x={it.x_cm + it.w_cm / 2} y={it.y_cm + it.h_cm / 2} rotation={it.rotacao || 0}
                offsetX={it.w_cm / 2} offsetY={it.h_cm / 2}
                listening={escuta} draggable={podeMexer}
                onMouseDown={() => (apagandoAcab ? removerInfra(it.id) : selecionarInfra(it.id))}
                onTap={() => (apagandoAcab ? removerInfra(it.id) : selecionarInfra(it.id))}
                onDragEnd={(e) => {
                  const passo = snapPasso ?? 0;
                  const sn = (v: number) => (passo > 0 ? Math.round(v / passo) * passo : Math.round(v * 10) / 10);
                  updateInfra(it.id, { x_cm: sn(e.target.x() - it.w_cm / 2), y_cm: sn(e.target.y() - it.h_cm / 2) });
                }}>
                <Rect width={it.w_cm} height={it.h_cm} cornerRadius={3} fill="#1A2126"
                  stroke={sel ? "#C9A227" : "#6FA8C4"} strokeWidth={(sel ? 5 : 2.5) / cam.zoom} />
                <Text x={0} y={it.h_cm / 2 - 8} width={it.w_cm} align="center" text={`${it.nome}${it.bloqueado ? " 🔒" : ""}`}
                  fontSize={Math.min(13, Math.max(8, it.w_cm / 8))} fill="#CDE3EE" fontStyle="600" listening={false} />
              </Group>
            );
          })}

          {/* ── Etapa 2: elementos de parede (espelho, TV, elétrica…) ── */}
          {(() => {
            const pmap = new Map((cena.estrutura?.paredes ?? []).map((p) => [p.id, p]));
            return (cena.elementosParede ?? []).map((el) => {
              const w = pmap.get(el.paredeId); if (!w) return null;
              const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
              const ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
              const px = -uy, py = ux; // perpendicular
              const cx = w.x1 + ux * el.offset_cm, cy = w.y1 + uy * el.offset_cm;
              const half = el.largura_cm / 2;
              const sel = selElemParedeId === el.id;
              const def = ELEMENTOS_PAREDE[el.tipo];
              const cor = sel ? "#C9A227" : def.cor;
              const escuta = areasEscutam;
              const podeMexer = areasAtivas && !el.bloqueado;
              const off = (w.espessura_cm / 2 + 6); // desloca para a face da parede
              const ax = cx - ux * half + px * off, ay = cy - uy * half + py * off;
              const bx = cx + ux * half + px * off, by = cy + uy * half + py * off;
              return (
                <Group key={el.id} listening={escuta} draggable={podeMexer}
                  onMouseDown={() => (apagandoAcab ? removerElemParede(el.id) : selecionarElemParede(el.id))}
                  onTap={() => (apagandoAcab ? removerElemParede(el.id) : selecionarElemParede(el.id))}
                  onDragEnd={(e) => {
                    // solta: projeta o deslocamento de volta na parede e vira offset
                    const nx = cx + e.target.x(), ny = cy + e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    const pj = projetarNaParede(nx, ny, w);
                    updateElemParede(el.id, { offset_cm: arred(pj.t * pj.len) });
                  }}>
                  {el.tipo === "espelho" ? (
                    <>
                      {/* espelho: linha dupla na face da parede */}
                      <Line points={[ax, ay, bx, by]} stroke={cor} strokeWidth={4 / cam.zoom} hitStrokeWidth={30 / cam.zoom} />
                      <Line points={[ax + px * (6 / cam.zoom), ay + py * (6 / cam.zoom), bx + px * (6 / cam.zoom), by + py * (6 / cam.zoom)]} stroke={cor} strokeWidth={1.5 / cam.zoom} listening={false} />
                      {(el.luz_superior || el.luz_inferior) && <Line points={[ax + px * (12 / cam.zoom), ay + py * (12 / cam.zoom), bx + px * (12 / cam.zoom), by + py * (12 / cam.zoom)]} stroke="#F2E29B" strokeWidth={2 / cam.zoom} dash={[5 / cam.zoom, 5 / cam.zoom]} listening={false} />}
                      <Text x={(ax + bx) / 2} y={(ay + by) / 2 + py * (18 / cam.zoom)} text={`Espelho ${formatLength(el.largura_cm)}${el.bloqueado ? " 🔒" : ""}`} fontSize={13 / cam.zoom} fill={cor} listening={false} />
                    </>
                  ) : (
                    <>
                      <Line points={[ax, ay, bx, by]} stroke={cor} strokeWidth={5 / cam.zoom} hitStrokeWidth={30 / cam.zoom} />
                      <Circle x={cx + px * off} y={cy + py * off} radius={Math.max(9 / cam.zoom, Math.min(14, half) )} fill="#141518" stroke={cor} strokeWidth={2 / cam.zoom} />
                      <Text x={cx + px * off - 10 / cam.zoom} y={cy + py * off - 8 / cam.zoom} text={def.icone} fontSize={16 / cam.zoom} listening={false} />
                      {sel && <Text x={cx + px * (off + 20)} y={cy + py * (off + 20)} text={def.label} fontSize={13 / cam.zoom} fill={cor} listening={false} />}
                    </>
                  )}
                </Group>
              );
            });
          })()}

          {/* Lâmina do Arquiteto: cotas de afastamento automáticas */}
          {lamina && cotasAuto.map((c, i) => {
            const len = c.valor;
            const mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
            const ux = (c.x2 - c.x1) / (len || 1), uy = (c.y2 - c.y1) / (len || 1);
            const px = -uy, py = ux, t = 6 / cam.zoom;
            const horiz = Math.abs(ux) > Math.abs(uy);
            return (
              <Group key={`la${i}`} listening={false}>
                <Line points={[c.x1, c.y1, c.x2, c.y2]} stroke="#8FD6F0" strokeWidth={1 / cam.zoom} />
                <Line points={[c.x1 - px * t, c.y1 - py * t, c.x1 + px * t, c.y1 + py * t]} stroke="#8FD6F0" strokeWidth={1 / cam.zoom} />
                <Line points={[c.x2 - px * t, c.y2 - py * t, c.x2 + px * t, c.y2 + py * t]} stroke="#8FD6F0" strokeWidth={1 / cam.zoom} />
                <Text x={mx + (horiz ? -16 / cam.zoom : 5 / cam.zoom)} y={my + (horiz ? -14 / cam.zoom : -5 / cam.zoom)}
                  text={String(Math.round(len))} fontSize={11 / cam.zoom} fill="#8FD6F0" fontStyle="600" />
              </Group>
            );
          })}

          {/* equipamentos */}
          {cena.itens.map((it, idx) => (
            <ItemView key={it.id} it={it} numero={etapaAtual === "fichas" ? idx + 1 : undefined} zoom={cam.zoom} selected={!apresentacao && selectedId === it.id} problema={apresentacao ? null : problemas[it.id]} listening={itensAtivos && !apresentacao} camadas={apresentacao || lamina ? "nada" : (camadas ?? "tudo")} lamina={lamina}
              onSelect={() => selecionar(it.id)}
              onDrag={(x, y, commit) => updateItem(it.id, { x_cm: snapCm(x), y_cm: snapCm(y) }, commit)} />
          ))}

          {/* marcadores de calibração */}
          {calPts.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#5FC8E8" />)}
          {calPts.length === 1 && <Text x={calPts[0].x} y={calPts[0].y} text=" toque o 2º ponto" fontSize={16 / cam.zoom} fill="#5FC8E8" />}

          {/* marcadores de área de acabamento (retângulo) */}
          {areaPts.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#C9A227" />)}
          {areaPts.length === 1 && <Text x={areaPts[0].x} y={areaPts[0].y} text=" toque o canto oposto" fontSize={16 / cam.zoom} fill="#C9A227" />}

          {/* polígono em desenho */}
          {polyPts.length > 0 && (
            <Group listening={false}>
              <Line points={polyPts.flatMap((p) => [p.x, p.y])} stroke="#C9A227" strokeWidth={2 / cam.zoom} dash={[8 / cam.zoom, 6 / cam.zoom]} />
              {polyPts.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={(i === 0 && polyPts.length >= 3 ? 11 : 7) / cam.zoom}
                  fill={i === 0 && polyPts.length >= 3 ? "#5FBF7A" : "#C9A227"} />
              ))}
              <Text x={polyPts[polyPts.length - 1].x} y={polyPts[polyPts.length - 1].y}
                text={polyPts.length >= 3 ? " toque o ponto verde para fechar" : " toque os próximos cantos"}
                fontSize={16 / cam.zoom} fill="#C9A227" />
            </Group>
          )}

          {/* cota em desenho */}
          {cotaPts.map((p, i) => <Circle key={`c${i}`} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#5FC8E8" listening={false} />)}
          {cotaPts.length === 1 && <Text x={cotaPts[0].x} y={cotaPts[0].y} text=" toque o 2º ponto da medida" fontSize={16 / cam.zoom} fill="#5FC8E8" listening={false} />}

          {/* marcadores de recorte */}
          {recPts.map((p, i) => <Circle key={`r${i}`} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#5FBF7A" />)}
          {recPts.length === 1 && <Text x={recPts[0].x} y={recPts[0].y} text=" toque o canto oposto (recorte)" fontSize={16 / cam.zoom} fill="#5FBF7A" />}

          {/* marcadores da Vista IA (câmera + direção) */}
          {vistaPts.map((pp, i) => <Circle key={`v${i}`} x={pp.x} y={pp.y} radius={9 / cam.zoom} fill="#C97BE0" listening={false} />)}
          {vistaPts.length === 1 && <Text x={vistaPts[0].x + 14 / cam.zoom} y={vistaPts[0].y - 8 / cam.zoom} text="📷 toque para onde a câmera olha" fontSize={15 / cam.zoom} fill="#C97BE0" listening={false} />}

          {/* marcadores da parede de referência */}
          {pardPts.map((p, i) => <Circle key={`p${i}`} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#C97BE0" />)}
          {pardPts.length === 1 && <Text x={pardPts[0].x} y={pardPts[0].y} text=" toque a outra ponta da parede" fontSize={16 / cam.zoom} fill="#C97BE0" />}
        </Layer>
      </Stage>
    </div>
  );
}

function ItemView({ it, zoom, selected, problema, listening, camadas, lamina, numero, onSelect, onDrag }: {
  it: ItemPosicionado; zoom: number; selected: boolean; problema: "colisao" | "corredor" | "uso" | null; listening?: boolean;
  camadas?: "tudo" | "uso" | "nada"; lamina?: boolean; numero?: number;
  onSelect: () => void; onDrag: (x: number, y: number, commit: boolean) => void;
}) {
  const cor = problema === "colisao" ? "#E04545" : problema === "corredor" || problema === "uso" ? "#E09A45" : (ZONAS[it.zona]?.cor || "#888");
  // Footprint técnico: área de uso (margens frontal/lateral) e de segurança (margem extra).
  const usoF = it.uso_frontal_cm || 0, usoL = it.uso_lateral_cm || 0, seg = it.seguranca_cm || 0;
  const temUso = usoF > 0 || usoL > 0, temSeg = seg > 0;
  const mostraUso = camadas !== "nada" && temUso;
  const mostraSeg = camadas === "tudo" && temSeg;
  const vert = it.h_cm > it.w_cm * 1.3;
  const img = useHtmlImage(it.imagem || undefined);
  const temDesenho = !!(it.contorno?.length || it.imagem);
  const cx = it.x_cm + it.w_cm / 2, cy = it.y_cm + it.h_cm / 2;
  const lados = { ...LADOS_PADRAO, ...(it.lados ?? {}) };
  const distE = it.dist_entrada_cm || 0;
  // Geometria de cada lado no sistema local do item (para letras e vão de entrada).
  const geomLado: Record<LadoRect, { lx: number; ly: number; nx: number; ny: number; len: number }> = {
    topo: { lx: it.w_cm / 2, ly: 0, nx: 0, ny: -1, len: it.w_cm },
    base: { lx: it.w_cm / 2, ly: it.h_cm, nx: 0, ny: 1, len: it.w_cm },
    esq: { lx: 0, ly: it.h_cm / 2, nx: -1, ny: 0, len: it.h_cm },
    dir: { lx: it.w_cm, ly: it.h_cm / 2, nx: 1, ny: 0, len: it.h_cm },
  };
  return (
    <Group x={cx} y={cy} offsetX={it.w_cm / 2} offsetY={it.h_cm / 2} rotation={it.rotacao || 0}
      draggable={listening !== false && !it.bloqueado} listening={listening}
      onMouseDown={onSelect} onTouchStart={onSelect} onClick={onSelect} onTap={onSelect}
      onDragMove={(e) => onDrag(e.target.x() - it.w_cm / 2, e.target.y() - it.h_cm / 2, false)}
      onDragEnd={(e) => onDrag(e.target.x() - it.w_cm / 2, e.target.y() - it.h_cm / 2, true)}>
      {mostraSeg && (
        <Rect x={-usoL - seg} y={-usoF - seg} width={it.w_cm + 2 * (usoL + seg)} height={it.h_cm + 2 * (usoF + seg)}
          cornerRadius={6} fill="#E04545" opacity={0.05} stroke="#E04545" strokeWidth={1 / zoom} dash={[5 / zoom, 7 / zoom]} listening={false} />
      )}
      {mostraUso && (
        <Rect x={-usoL} y={-usoF} width={it.w_cm + 2 * usoL} height={it.h_cm + 2 * usoF}
          cornerRadius={5} fill="#E09A45" opacity={0.08} stroke="#E09A45" strokeWidth={1 / zoom} dash={[8 / zoom, 6 / zoom]} listening={false} />
      )}
      {/* corpo: SEM preenchimento (o piso aparece por baixo). Com desenho próprio,
          o retângulo só aparece selecionado ou com problema; sem desenho, fica o contorno fino. */}
      <Rect width={it.w_cm} height={it.h_cm} cornerRadius={4} fill="transparent"
        stroke={cor} strokeWidth={(selected ? 5 : 2) / zoom}
        opacity={temDesenho && !selected && !problema ? 0 : 1}
        dash={problema ? [10 / zoom, 7 / zoom] : undefined} />
      {/* área de toque (invisível) — sem ela o miolo transparente não seleciona */}
      <Rect width={it.w_cm} height={it.h_cm} fill="#000" opacity={0.001} />
      {/* numeração da ficha (Etapa 4) */}
      {numero != null && (
        <>
          <Circle x={0} y={0} radius={14 / zoom} fill="#C9A227" listening={false} />
          <Text x={-14 / zoom} y={-7 / zoom} width={28 / zoom} align="center" text={String(numero)}
            fontSize={13 / zoom} fontStyle="700" fill="#0C0C0E" listening={false} />
        </>
      )}
      {/* letras dos lados (E/F/C/L) — giram junto com o equipamento */}
      {(Object.keys(geomLado) as LadoRect[]).map((k) => {
        const g = geomLado[k], papel = lados[k], info = PAPEL_LADO[papel];
        if (papel === "lateral" && !selected) return null; // laterais só quando selecionado
        const fs = 12 / zoom;
        return (
          <Text key={k} x={g.lx - g.nx * (10 / zoom) - fs / 2} y={g.ly - g.ny * (10 / zoom) - fs / 2}
            text={info.letra} fontSize={fs} fontStyle="700" fill={info.cor} listening={false} />
        );
      })}
      {/* vão livre da ENTRADA (dist_entrada_cm a partir do lado marcado como entrada) */}
      {distE > 0 && (Object.keys(geomLado) as LadoRect[]).filter((k) => lados[k] === "entrada").map((k) => {
        const g = geomLado[k];
        const horiz = g.ny !== 0; // entrada no topo/base → vão se estende na vertical
        const x = horiz ? 0 : (g.nx < 0 ? -distE : it.w_cm);
        const yv = horiz ? (g.ny < 0 ? -distE : it.h_cm) : 0;
        const wv = horiz ? it.w_cm : distE;
        const hv = horiz ? distE : it.h_cm;
        const acx = g.lx + g.nx * (distE / 2), acy = g.ly + g.ny * (distE / 2);
        return (
          <Group key={`e${k}`} listening={false}>
            <Rect x={x} y={yv} width={wv} height={hv} stroke="#5FBF7A" strokeWidth={1.2 / zoom}
              dash={[7 / zoom, 5 / zoom]} fill="#5FBF7A" opacity={0.35} fillEnabled={false} />
            <Line points={[g.lx, g.ly, g.lx + g.nx * distE, g.ly + g.ny * distE]}
              stroke="#5FBF7A" strokeWidth={1.4 / zoom} dash={[4 / zoom, 4 / zoom]} />
            <Text x={acx - 20 / zoom} y={acy - 7 / zoom} text={`↦ ${Math.round(distE)}`}
              fontSize={11 / zoom} fill="#5FBF7A" rotation={horiz ? 90 : 0} />
          </Group>
        );
      })}
      <Group x={it.w_cm / 2} y={it.h_cm / 2} offsetX={it.w_cm / 2} offsetY={it.h_cm / 2}
        scaleX={it.flipH ? -1 : 1} scaleY={it.flipV ? -1 : 1} listening={false}>
        {it.imagem && img && <KImage image={img} x={0} y={0} width={it.w_cm} height={it.h_cm} opacity={0.85} listening={false} />}
        {(it.contorno || []).map((pl, i) => (
          <Line key={i} points={pl.map((v, j) => (j % 2 === 0 ? v * it.w_cm : v * it.h_cm))} stroke={cor} strokeWidth={2 / zoom} listening={false} />
        ))}
      </Group>
      {!temDesenho && (
        <Text x={0} y={it.h_cm / 2 - 10} width={it.w_cm} align="center" text={it.nome}
          fontSize={Math.min(it.w_cm, it.h_cm) >= 85 ? 20 : 15} fill="#F2F2F0" fontStyle="600"
          rotation={vert ? -90 : 0} offsetX={vert ? (it.w_cm - it.h_cm) / 2 : 0} listening={false} />
      )}
      {temDesenho && (
        <Text x={0} y={it.h_cm - 16} width={it.w_cm} align="center" text={it.nome} fontSize={12} fill="#F2F2F0" fontStyle="600" listening={false} />
      )}
      <Text x={0} y={it.h_cm / 2 + 12} width={it.w_cm} align="center" text={`${formatLength(it.w_cm)} × ${formatLength(it.h_cm)}`}
        fontSize={12} fill={lamina ? "#E9E9E6" : "#9A9AA0"} fontStyle={lamina ? "700" : "400"}
        listening={false} visible={lamina || (!vert && !temDesenho)} />
    </Group>
  );
}
