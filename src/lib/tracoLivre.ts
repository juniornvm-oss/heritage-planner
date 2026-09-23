// Traço livre da prancheta de cadastro: o consultor desenha o footprint com a
// Apple Pencil (ou o dedo/mouse) e o resultado vira o mesmo `contorno` 0..1
// que a planta já consome. Sem isso, o cadastro só aceitava clique-a-clique
// ou arquivo CAD — e no iPad a caneta pedia papel quadriculado, não pontos.

export const EPS_SIMPLIFICAR = 0.004; // ~0,4 % do lado (~0,4 cm numa peça de 100)
export const MIN_DIST = 0.003;
/** Fecha o polígono se a ponta voltou para perto da origem (silhueta). */
export const FECHAR_DIST = 0.04;
/** Abaixo disso o gesto foi um toque, não um traço. */
export const MIN_ARRASTO = 0.01;

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const r4 = (n: number): number => Math.round(n * 10000) / 10000;

export function pontoNormalizado(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): [number, number] {
  if (!(rect.width > 0) || !(rect.height > 0)) return [0, 0];
  return [
    clamp01((clientX - rect.left) / rect.width),
    clamp01((clientY - rect.top) / rect.height),
  ];
}

/** Encaixa o valor 0..1 na grade em cm daquele eixo. */
export function snapNorm(v: number, tamanhoCm: number, passoCm: number): number {
  if (!(tamanhoCm > 0) || !(passoCm > 0)) return clamp01(v);
  const cm = clamp01(v) * tamanhoCm;
  return clamp01(r4((Math.round(cm / passoCm) * passoCm) / tamanhoCm));
}

/**
 * Passo da grade em cm. Peças de academia cabem em 5 cm (a mesma régua do
 * editor); só abre para 10/20 cm quando o retângulo fica enorme, senão a
 * prancheta vira um caderno de linhas.
 */
export function passoGradeCm(larguraCm: number, profundidadeCm: number): number {
  const m = Math.max(larguraCm, profundidadeCm);
  if (!Number.isFinite(m) || m <= 0) return 5;
  if (m <= 200) return 5;
  if (m <= 400) return 10;
  return 20;
}

/** Teto de linhas da grade. Sem isso, um 10⁹ colado em Largura trava o render. */
export const MAX_MARCAS_GRADE = 80;

/** Marcas de 0 até o tamanho, inclusive — para linhas e rótulos da grade. */
export function marcasGrade(tamanhoCm: number, passo: number): number[] {
  if (!Number.isFinite(tamanhoCm) || tamanhoCm <= 0) return [0];
  const passoOk = Number.isFinite(passo) && passo > 0 ? passo : 5;
  const passoUsado = Math.max(passoOk, tamanhoCm / MAX_MARCAS_GRADE);
  if (!Number.isFinite(passoUsado) || passoUsado <= 0) return [0];
  const out: number[] = [];
  const n = Math.min(MAX_MARCAS_GRADE, Math.ceil(tamanhoCm / passoUsado));
  for (let i = 0; i <= n; i++) {
    const c = Math.min(tamanhoCm, r4(i * passoUsado));
    if (!out.length || out[out.length - 1] !== c) out.push(c);
  }
  if (out[out.length - 1] !== tamanhoCm) out.push(r4(tamanhoCm));
  return out;
}

/** Linha grossa da grade (a cada 50 cm, ou 10 cm em peças miúdas). */
export function passoMaiorCm(passo: number, tamanhoCm: number): number {
  if (tamanhoCm <= 80) return Math.max(passo, 10);
  const alvo = 50;
  const k = Math.max(1, Math.round(alvo / passo));
  return passo * k;
}

export function distPontoSegmento(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Descarta pontos colados no anterior; sempre conserva o primeiro e o último. */
export function filtrarEspacamento(pts: number[], minDist = MIN_DIST): number[] {
  if (pts.length < 4) return pts.slice();
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length - 2; i += 2) {
    const x = pts[i], y = pts[i + 1];
    if (Math.hypot(x - out[out.length - 2], y - out[out.length - 1]) >= minDist) {
      out.push(x, y);
    }
  }
  const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
  if (out[out.length - 2] !== lx || out[out.length - 1] !== ly) out.push(lx, ly);
  return out;
}

/** Ramer–Douglas–Peucker sobre polilinha achatada [x0,y0,x1,y1,…]. */
export function simplificarRdp(pts: number[], epsilon = EPS_SIMPLIFICAR): number[] {
  const n = Math.floor(pts.length / 2);
  if (n <= 2) return pts.slice(0, n * 2);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, maxI = s;
    const ax = pts[s * 2], ay = pts[s * 2 + 1];
    const bx = pts[e * 2], by = pts[e * 2 + 1];
    for (let i = s + 1; i < e; i++) {
      const d = distPontoSegmento(pts[i * 2], pts[i * 2 + 1], ax, ay, bx, by);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > epsilon) {
      keep[maxI] = 1;
      if (maxI - s > 1) stack.push([s, maxI]);
      if (e - maxI > 1) stack.push([maxI, e]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

/**
 * Fecha o ciclo se a ponta voltou para perto da origem — silhueta de máquina
 * quase sempre é um recinto, não um rabisco aberto.
 */
export function fecharSeProximo(pts: number[], dist = FECHAR_DIST): number[] {
  if (pts.length < 6) return pts.slice();
  const dx = pts[0] - pts[pts.length - 2], dy = pts[1] - pts[pts.length - 1];
  if (Math.hypot(dx, dy) > dist) return pts.slice();
  if (dx === 0 && dy === 0) return pts.slice();
  return [...pts, pts[0], pts[1]];
}

/** Comprimento da polilinha achatada, em unidades 0..1. */
export function comprimentoTraco(pts: number[]): number {
  let s = 0;
  for (let i = 2; i < pts.length; i += 2) s += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return s;
}

/** Prepara o gesto para gravar: filtra, simplifica, arredonda, fecha. */
export function finalizarTraco(pts: number[], epsilon = EPS_SIMPLIFICAR): number[] | null {
  const filtrado = filtrarEspacamento(pts);
  if (filtrado.length < 4 || comprimentoTraco(filtrado) < MIN_ARRASTO) return null;
  const simples = simplificarRdp(filtrado, epsilon).map(r4);
  if (simples.length < 4) return null;
  const fechado = fecharSeProximo(simples).map(r4);
  return fechado.length < 4 ? null : fechado;
}

/** Caixa da prancheta: respeita o aspecto L×P e cabe no espaço disponível. */
export function caixaPrancheta(
  larguraCm: number,
  profundidadeCm: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const L = Number.isFinite(larguraCm) && larguraCm > 0 ? larguraCm : 100;
  const P = Number.isFinite(profundidadeCm) && profundidadeCm > 0 ? profundidadeCm : 100;
  const a = P / L;
  let w = maxW, h = w * a;
  if (h > maxH) { h = maxH; w = h / a; }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}
