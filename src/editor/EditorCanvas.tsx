import { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Line, Group, Text, Image as KImage, Circle } from "react-konva";
import type Konva from "konva";
import { useProjeto } from "../store/projetoStore";
import { ZONAS, type ItemPosicionado } from "../lib/types";
import { problemasDaCena } from "../lib/validation";
import { snapCm, GRID_CM } from "../lib/canvas";
import { formatLength } from "../lib/units";

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

export default function EditorCanvas({ modoCalibrar, onCalibrar, modoAcabamento, onArea, stageRef }: {
  modoCalibrar: boolean;
  onCalibrar: (distanciaMundoCm: number) => void;
  modoAcabamento: boolean;
  onArea: (rect: { x: number; y: number; w: number; h: number }) => void;
  stageRef?: React.RefObject<Konva.Stage>;
}) {
  const cena = useProjeto((s) => s.cena);
  const selectedId = useProjeto((s) => s.selectedId);
  const selectedAcabId = useProjeto((s) => s.selectedAcabId);
  const selecionar = useProjeto((s) => s.selecionar);
  const selecionarAcab = useProjeto((s) => s.selecionarAcab);
  const updateItem = useProjeto((s) => s.updateItem);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState<Cam>({ zoom: 0.4, x: 60, y: 60 });
  const pan = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const [calPts, setCalPts] = useState<{ x: number; y: number }[]>([]);
  const [areaPts, setAreaPts] = useState<{ x: number; y: number }[]>([]);

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
    const stage = e.target.getStage()!;
    const p = stage.getPointerPosition()!;
    zoomAt(p.x, p.y, e.evt.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  function stageDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage()!;
    const p = stage.getPointerPosition()!;
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
    const touches = (e.evt as TouchEvent).touches;
    if (touches && touches.length === 2) {
      const [a, b] = [touches[0], touches[1]];
      pinch.current = { dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
      return;
    }
    if (emVazio) { pan.current = { x: p.x, y: p.y }; if (!modoCalibrar) selecionar(null); }
  }

  function stageMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage()!;
    const touches = (e.evt as TouchEvent).touches;
    if (touches && touches.length === 2 && pinch.current) {
      const [a, b] = [touches[0], touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
      const rect = wrapRef.current!.getBoundingClientRect();
      const factor = dist / (pinch.current.dist || dist);
      zoomAt(cx - rect.left, cy - rect.top, factor);
      setCam((c) => ({ ...c, x: c.x + (cx - pinch.current!.cx), y: c.y + (cy - pinch.current!.cy) }));
      pinch.current = { dist, cx, cy };
      return;
    }
    if (pan.current) {
      const p = stage.getPointerPosition()!;
      setCam((c) => ({ ...c, x: c.x + (p.x - pan.current!.x), y: c.y + (p.y - pan.current!.y) }));
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
  const drawing = modoCalibrar || modoAcabamento; // enquanto desenha, itens/áreas não capturam o toque

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0, cursor: modoCalibrar || modoAcabamento ? "crosshair" : pan.current ? "grabbing" : "default", background: "#0C0C0E" }}>
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
            <KImage name="bg" image={plantaImg} x={planta.x_cm} y={planta.y_cm}
              width={planta.larguraPx * planta.cmPorPx} height={planta.alturaPx * planta.cmPorPx}
              opacity={planta.opacidade} listening={false} />
          )}

          {/* grade */}
          {gridLines.map((l, i) => <Line key={i} points={l} stroke="#ffffff" strokeWidth={0.6 / cam.zoom} opacity={0.05} listening={false} />)}

          {/* corredor */}
          {cfg.corredor && <Rect name="bg" x={cfg.corredor.x} y={0} width={cfg.corredor.w} height={sala.profundidade_cm} fill="#C9A227" opacity={0.06} listening={false} />}

          {/* contorno da sala */}
          <Rect x={0} y={0} width={sala.largura_cm} height={sala.profundidade_cm} stroke="#3A3A3C" strokeWidth={12 / cam.zoom} listening={false} />

          {/* pilar */}
          {cfg.pilar && <Rect name="bg" x={cfg.pilar.x} y={cfg.pilar.y} width={cfg.pilar.w} height={cfg.pilar.h} fill="#2B2B2E" stroke="#8A8A8F" strokeWidth={2 / cam.zoom} listening={false} />}

          {/* áreas de acabamento (piso/parede pintados) */}
          {(cena.acabamentos ?? []).map((a) => {
            const sel = selectedAcabId === a.id;
            const m2 = (a.w_cm / 100) * (a.h_cm / 100);
            return (
              <Group key={a.id} x={a.x_cm} y={a.y_cm} listening={!drawing} onMouseDown={() => selecionarAcab(a.id)} onTouchStart={() => selecionarAcab(a.id)} onClick={() => selecionarAcab(a.id)} onTap={() => selecionarAcab(a.id)}>
                <Rect width={a.w_cm} height={a.h_cm} fill={a.cor} opacity={a.tipo === "parede" ? 0.3 : 0.5}
                  stroke={sel ? "#C9A227" : a.cor} strokeWidth={(sel ? 6 : 2) / cam.zoom} dash={a.tipo === "parede" ? [14 / cam.zoom, 8 / cam.zoom] : undefined} />
                <Text x={0} y={a.h_cm / 2 - 9} width={a.w_cm} align="center" text={`${a.nome}\n${m2.toFixed(1)} m²`}
                  fontSize={13} fill="#F2F2F0" fontStyle="600" listening={false} />
              </Group>
            );
          })}

          {/* equipamentos */}
          {cena.itens.map((it) => (
            <ItemView key={it.id} it={it} zoom={cam.zoom} selected={selectedId === it.id} problema={problemas[it.id]} listening={!drawing}
              onSelect={() => selecionar(it.id)}
              onDrag={(x, y, commit) => updateItem(it.id, { x_cm: snapCm(x), y_cm: snapCm(y) }, commit)} />
          ))}

          {/* marcadores de calibração */}
          {calPts.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#5FC8E8" />)}
          {calPts.length === 1 && <Text x={calPts[0].x} y={calPts[0].y} text=" toque o 2º ponto" fontSize={16 / cam.zoom} fill="#5FC8E8" />}

          {/* marcadores de área de acabamento */}
          {areaPts.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#C9A227" />)}
          {areaPts.length === 1 && <Text x={areaPts[0].x} y={areaPts[0].y} text=" toque o canto oposto" fontSize={16 / cam.zoom} fill="#C9A227" />}
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
  return (
    <Group x={it.x_cm} y={it.y_cm} draggable={listening !== false} listening={listening}
      onMouseDown={onSelect} onTouchStart={onSelect} onClick={onSelect} onTap={onSelect}
      onDragMove={(e) => onDrag(e.target.x(), e.target.y(), false)}
      onDragEnd={(e) => onDrag(e.target.x(), e.target.y(), true)}>
      <Rect width={it.w_cm} height={it.h_cm} cornerRadius={4} fill={selected ? "#1E1F23" : "#141518"}
        stroke={cor} strokeWidth={(selected ? 7 : 4) / zoom} dash={problema ? [10 / zoom, 7 / zoom] : undefined} />
      <Text x={0} y={it.h_cm / 2 - 10} width={it.w_cm} align="center" text={it.nome}
        fontSize={Math.min(it.w_cm, it.h_cm) >= 85 ? 20 : 15} fill="#F2F2F0" fontStyle="600"
        rotation={vert ? -90 : 0} offsetX={vert ? (it.w_cm - it.h_cm) / 2 : 0} listening={false} />
      <Text x={0} y={it.h_cm / 2 + 12} width={it.w_cm} align="center" text={`${formatLength(it.w_cm)} × ${formatLength(it.h_cm)}`}
        fontSize={12} fill="#9A9AA0" listening={false} visible={!vert} />
    </Group>
  );
}
