// Ponteiro único da prancheta (e do preview, quando "Traçar" está ligado):
// Apple Pencil, dedo e mouse viram o mesmo traço 0..1. Palm rejection: com a
// caneta abaixada, o toque da mão no vidro é ignorado — senão o Safari pinta
// um rastro da palma no meio da silhueta.
import { useRef, type PointerEvent as REPointerEvent } from "react";
import {
  finalizarTraco, MIN_ARRASTO, MIN_DIST, pontoNormalizado, snapNorm,
} from "../lib/tracoLivre";

export interface TracoPonteiroOpts {
  habilitado: boolean;
  larguraCm: number;
  profundidadeCm: number;
  snap: boolean;
  passoCm: number;
  /** Traço em andamento (para o SVG acompanhar a caneta). */
  onVivo: (pts: number[]) => void;
  /** Traço concluído (já simplificado) — só em arraste, nunca em toque. */
  onPronto: (pts: number[]) => void;
  /** Toque sem arraste: vértice do modo clique-a-clique. */
  onToque?: (p: [number, number]) => void;
}

type Stroke = { id: number; pts: number[]; arrastou: boolean };

export function useTracoPonteiro(opts: TracoPonteiroOpts) {
  const stroke = useRef<Stroke | null>(null);
  const caneta = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const ponto = (clientX: number, clientY: number, el: Element): [number, number] => {
    const o = optsRef.current;
    const r = el.getBoundingClientRect();
    let [x, y] = pontoNormalizado(clientX, clientY, r);
    if (o.snap) {
      x = snapNorm(x, o.larguraCm, o.passoCm);
      y = snapNorm(y, o.profundidadeCm, o.passoCm);
    }
    return [x, y];
  };

  const down = (e: REPointerEvent<SVGSVGElement>) => {
    const o = optsRef.current;
    if (!o.habilitado) return;
    if (e.pointerType === "touch" && caneta.current) return;
    if (e.button === 2) return;
    if (e.pointerType === "pen") caneta.current = true;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = ponto(e.clientX, e.clientY, e.currentTarget);
    stroke.current = { id: e.pointerId, pts: [p[0], p[1]], arrastou: false };
    o.onVivo([p[0], p[1]]);
  };

  const move = (e: REPointerEvent<SVGSVGElement>) => {
    const s = stroke.current;
    if (!s || s.id !== e.pointerId) return;
    e.preventDefault();
    const nativos = typeof e.nativeEvent.getCoalescedEvents === "function"
      ? e.nativeEvent.getCoalescedEvents()
      : [e.nativeEvent];
    for (const ev of nativos) {
      const p = ponto(ev.clientX, ev.clientY, e.currentTarget);
      const n = s.pts.length;
      if (n >= 2 && Math.hypot(p[0] - s.pts[n - 2], p[1] - s.pts[n - 1]) < MIN_DIST) continue;
      s.pts.push(p[0], p[1]);
    }
    if (s.pts.length >= 4) {
      const dx = s.pts[s.pts.length - 2] - s.pts[0];
      const dy = s.pts[s.pts.length - 1] - s.pts[1];
      if (Math.hypot(dx, dy) >= MIN_ARRASTO) s.arrastou = true;
    }
    optsRef.current.onVivo(s.pts.slice());
  };

  const up = (e: REPointerEvent<SVGSVGElement>) => {
    const s = stroke.current;
    if (!s || s.id !== e.pointerId) return;
    stroke.current = null;
    if (e.pointerType === "pen") caneta.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já soltou */ }
    const o = optsRef.current;
    if (s.arrastou) {
      const fin = finalizarTraco(s.pts);
      o.onVivo([]);
      if (fin) o.onPronto(fin);
      return;
    }
    o.onVivo([]);
    if (o.onToque) o.onToque([s.pts[0], s.pts[1]]);
  };

  return { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up };
}
