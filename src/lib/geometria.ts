// Fase 1 — base de precisão da Etapa 2 (Acabamento).
// Unidade de mundo: cm em ponto flutuante (precisão sub-cm garantida; o snap
// controla o arredondamento na entrada). Formatação de saída em cm/m.

export interface Ponto { x: number; y: number }

/** Área de um polígono (shoelace), em cm². Aceita aberto ou fechado. */
export function areaPoligonoCm2(pts: Ponto[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export const areaPoligonoM2 = (pts: Ponto[]) => areaPoligonoCm2(pts) / 10000;

/** Perímetro do polígono fechado, em cm. */
export function perimetroCm(pts: Ponto[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

export function bboxPoligono(pts: Ponto[]): { x: number; y: number; w: number; h: number } {
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const p of pts) { mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x); mny = Math.min(mny, p.y); mxy = Math.max(mxy, p.y); }
  if (!Number.isFinite(mnx)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: mnx, y: mny, w: mxx - mnx, h: mxy - mny };
}

/** Polígono é um retângulo alinhado aos eixos? (4 vértices, lados ortogonais) */
export function ehRetangulo(pts: Ponto[]): boolean {
  if (pts.length !== 4) return false;
  const eps = 0.01;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    if (Math.abs(a.x - b.x) > eps && Math.abs(a.y - b.y) > eps) return false;
  }
  return true;
}

export const retanguloParaPontos = (x: number, y: number, w: number, h: number): Ponto[] =>
  [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

/** Ponto mais próximo sobre o segmento AB; retorna projeção e distância. */
export function projetarNoSegmento(p: Ponto, a: Ponto, b: Ponto): { x: number; y: number; dist: number; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx, y = a.y + t * dy;
  return { x, y, dist: Math.hypot(p.x - x, p.y - y), t };
}

export const transladar = (pts: Ponto[], dx: number, dy: number): Ponto[] =>
  pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));

/** Formata m² com 2 casas (pt-BR). */
export const m2 = (v: number) => `${v.toFixed(2).replace(".", ",")} m²`;
