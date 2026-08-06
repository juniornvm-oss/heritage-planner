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

/**
 * O polígono CONVEXO encosta no retângulo alinhado aos eixos?
 *
 * Teorema dos eixos separadores: dois convexos são disjuntos se, e somente se,
 * existe um eixo em que as projeções não se tocam. Basta testar as normais das
 * arestas dos dois — para o retângulo, X e Y.
 *
 * Existe porque o setor de varredura de uma porta é um leque de ~14 vértices e
 * as duas saídas fáceis erram nos dois sentidos: usar o bbox do leque acusa
 * ~27% de área que a folha nunca alcança (alarme em massa), e testar só o
 * centro do equipamento perde a esteira que entra no arco pela quina.
 *
 * Convexo é pré-requisito: um setor de até 180° com o arco poligonizado é
 * convexo, que é o caso de todos os setores de `esquadrias.ts`.
 */
export function convexoTocaRetangulo(
  poly: Ponto[],
  r: { x_cm: number; y_cm: number; w_cm: number; h_cm: number },
): boolean {
  if (poly.length < 3) return false;
  const rx0 = r.x_cm, ry0 = r.y_cm, rx1 = r.x_cm + r.w_cm, ry1 = r.y_cm + r.h_cm;

  // Eixos do retângulo primeiro: descartam a maioria dos pares por bbox.
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const p of poly) {
    if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;
    if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y;
  }
  if (mxx <= rx0 || mnx >= rx1 || mxy <= ry0 || mny >= ry1) return false;

  // Normais das arestas do polígono.
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    if (!ex && !ey) continue;
    const nx = -ey, ny = ex;
    let pMin = Infinity, pMax = -Infinity;
    for (const p of poly) { const d = p.x * nx + p.y * ny; if (d < pMin) pMin = d; if (d > pMax) pMax = d; }
    let rMin = Infinity, rMax = -Infinity;
    for (const [x, y] of [[rx0, ry0], [rx1, ry0], [rx1, ry1], [rx0, ry1]] as const) {
      const d = x * nx + y * ny; if (d < rMin) rMin = d; if (d > rMax) rMax = d;
    }
    if (pMax <= rMin || rMax <= pMin) return false;
  }
  return true;
}

/** Ponto dentro do polígono (ray casting). */
export function pontoNoPoligono(p: Ponto, pts: Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}
