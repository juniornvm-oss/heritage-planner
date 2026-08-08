// Etapa 1 — geração automática da estrutura (paredes/pilares) a partir da planta
// importada, com "medidas equilibradas" (arredondadas). O resultado é sempre
// editável manualmente depois (auto + correção).

import type { Cena, EstruturaPlanta, Parede, PilarPlanta } from "./types";

const uid = () => crypto.randomUUID();

/** Arredonda para um passo (medidas equilibradas). */
export const arred = (v: number, passo = 5) => Math.round(v / passo) * passo;

/** Caixa (bbox) da planta atual, em cm no mundo. Cai para a sala se não houver planta. */
export function bboxDaPlanta(cena: Cena): { x: number; y: number; w: number; h: number } {
  const pv = cena.plantaVetorial;
  if (pv && pv.tracos.length) {
    const esc = pv.escala || 1;
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const t of pv.tracos) for (let i = 0; i < t.pts.length; i += 2) {
      mnx = Math.min(mnx, t.pts[i]); mxx = Math.max(mxx, t.pts[i]);
      mny = Math.min(mny, t.pts[i + 1]); mxy = Math.max(mxy, t.pts[i + 1]);
    }
    if (Number.isFinite(mnx)) return { x: pv.x_cm + mnx * esc, y: pv.y_cm + mny * esc, w: (mxx - mnx) * esc, h: (mxy - mny) * esc };
  }
  const pl = cena.planta;
  if (pl) return { x: pl.x_cm, y: pl.y_cm, w: pl.larguraPx * pl.cmPorPx, h: pl.alturaPx * pl.cmPorPx };
  return { x: 0, y: 0, w: cena.sala.largura_cm, h: cena.sala.profundidade_cm };
}

/** Retângulo perimetral (4 paredes) a partir de uma caixa, arredondado. */
export function paredesPerimetro(x: number, y: number, w: number, h: number, espessura = 15): Parede[] {
  const x0 = arred(x), y0 = arred(y), x1 = arred(x + w), y1 = arred(y + h);
  const canto = (ax: number, ay: number, bx: number, by: number): Parede => ({ id: uid(), x1: ax, y1: ay, x2: bx, y2: by, espessura_cm: espessura });
  return [
    canto(x0, y0, x1, y0), // topo
    canto(x1, y0, x1, y1), // direita
    canto(x1, y1, x0, y1), // base
    canto(x0, y1, x0, y0), // esquerda
  ];
}

/** Segmentos internos candidatos a parede: longos e ~ortogonais, extraídos do vetor. */
function paredesInternas(cena: Cena, bbox: { x: number; y: number; w: number; h: number }): Parede[] {
  const pv = cena.plantaVetorial;
  if (!pv || !pv.tracos.length) return [];
  const esc = pv.escala || 1;
  const minLen = Math.max(120, Math.min(bbox.w, bbox.h) * 0.25); // parede interna relevante
  const margem = Math.min(bbox.w, bbox.h) * 0.06; // ignora o que está colado no perímetro
  const out: Parede[] = [];
  const seen = new Set<string>();
  for (const t of pv.tracos) {
    for (let i = 0; i + 3 < t.pts.length; i += 2) {
      const ax = pv.x_cm + t.pts[i] * esc, ay = pv.y_cm + t.pts[i + 1] * esc;
      const bx = pv.x_cm + t.pts[i + 2] * esc, by = pv.y_cm + t.pts[i + 3] * esc;
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len < minLen) continue;
      const horiz = Math.abs(dy) < Math.abs(dx) * 0.12;
      const vert = Math.abs(dx) < Math.abs(dy) * 0.12;
      if (!horiz && !vert) continue; // só ortogonais
      // ortogonaliza + arredonda
      let X1 = arred(ax), Y1 = arred(ay), X2 = arred(bx), Y2 = arred(by);
      if (horiz) { const yy = arred((ay + by) / 2); Y1 = yy; Y2 = yy; } else { const xx = arred((ax + bx) / 2); X1 = xx; X2 = xx; }
      // descarta o que coincide com o perímetro
      const noPerim = (horiz && (Math.abs(Y1 - bbox.y) < margem || Math.abs(Y1 - (bbox.y + bbox.h)) < margem))
        || (vert && (Math.abs(X1 - bbox.x) < margem || Math.abs(X1 - (bbox.x + bbox.w)) < margem));
      if (noPerim) continue;
      // Chave por PARES de pontos ordenados (A→B ≡ B→A). Ordenar os 4 números
      // soltos fazia paredes perpendiculares distintas ("0,0→100,0" e
      // "0,0→0,100") colidirem na mesma chave — e uma delas sumia do auto.
      const p1 = `${Math.round(X1 / 10)},${Math.round(Y1 / 10)}`, p2 = `${Math.round(X2 / 10)},${Math.round(Y2 / 10)}`;
      const key = p1 <= p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ id: uid(), x1: X1, y1: Y1, x2: X2, y2: Y2, espessura_cm: 10 });
      if (out.length >= 40) return out; // teto de segurança
    }
  }
  return out;
}

/** Pilares: já existe um no config legado — reaproveita como pilar estrutural. */
function pilaresDoConfig(cena: Cena): PilarPlanta[] {
  const p = cena.sala.config?.pilar;
  return p ? [{ id: uid(), x_cm: arred(p.x), y_cm: arred(p.y), w_cm: arred(p.w), h_cm: arred(p.h) }] : [];
}

/**
 * Gera a estrutura (perímetro + paredes internas detectadas + pilares) a partir
 * da planta importada. Tudo arredondado ("medidas equilibradas") e editável.
 */
export function gerarEstrutura(cena: Cena): EstruturaPlanta {
  const bbox = bboxDaPlanta(cena);
  return {
    paredes: [...paredesPerimetro(bbox.x, bbox.y, bbox.w, bbox.h), ...paredesInternas(cena, bbox)],
    aberturas: [],
    pilares: pilaresDoConfig(cena),
  };
}

export const estruturaVazia = (): EstruturaPlanta => ({ paredes: [], aberturas: [], pilares: [] });
