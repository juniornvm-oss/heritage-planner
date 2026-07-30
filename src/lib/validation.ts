import type { Cena, ItemPosicionado, Cenario } from "./types";
import { CENARIOS } from "./types";

interface RectCm { x_cm: number; y_cm: number; w_cm: number; h_cm: number }
const overlapR = (a: RectCm, b: RectCm) =>
  a.x_cm < b.x_cm + b.w_cm && a.x_cm + a.w_cm > b.x_cm && a.y_cm < b.y_cm + b.h_cm && a.y_cm + a.h_cm > b.y_cm;
const overlap = (a: ItemPosicionado, b: RectCm) => overlapR(a, b);

/** Retângulo da ÁREA DE USO do item (corpo + margens frontal/lateral). */
const usoRect = (a: ItemPosicionado): RectCm => {
  const uF = a.uso_frontal_cm || 0, uL = a.uso_lateral_cm || 0;
  return { x_cm: a.x_cm - uL, y_cm: a.y_cm - uF, w_cm: a.w_cm + 2 * uL, h_cm: a.h_cm + 2 * uF };
};

export type Problema = "colisao" | "corredor" | "uso" | null;

export function problemasDaCena(cena: Cena): Record<string, Problema> {
  const sala = cena.sala;
  const itens = cena.itens ?? [];
  const p = sala.config?.pilar;
  const pilarRect = p ? { x_cm: p.x, y_cm: p.y, w_cm: p.w, h_cm: p.h } : null;
  // Pilares da estrutura (Etapa 1) também bloqueiam.
  const pilaresEst: RectCm[] = (cena.estrutura?.pilares ?? []).map((pl) => ({ x_cm: pl.x_cm, y_cm: pl.y_cm, w_cm: pl.w_cm, h_cm: pl.h_cm }));
  // Paredes ORTOGONAIS da estrutura como retângulos finos (diagonais ficam de fora — aproximação documentada).
  const paredesRect: RectCm[] = (cena.estrutura?.paredes ?? [])
    .filter((w) => Math.abs(w.x1 - w.x2) < 0.5 || Math.abs(w.y1 - w.y2) < 0.5)
    .map((w) => {
      const e = Math.max(w.espessura_cm, 4) / 2;
      return {
        x_cm: Math.min(w.x1, w.x2) - e, y_cm: Math.min(w.y1, w.y2) - e,
        w_cm: Math.abs(w.x2 - w.x1) + 2 * e, h_cm: Math.abs(w.y2 - w.y1) + 2 * e,
      };
    });
  const infraRects: RectCm[] = (cena.infra ?? []).map((i) => ({ x_cm: i.x_cm, y_cm: i.y_cm, w_cm: i.w_cm, h_cm: i.h_cm }));
  const corredor = sala.config?.corredor;
  const res: Record<string, Problema> = {};
  for (const a of itens) {
    const fora = a.x_cm < 0 || a.y_cm < 0 || a.x_cm + a.w_cm > sala.largura_cm || a.y_cm + a.h_cm > sala.profundidade_cm;
    const pil = (pilarRect ? overlap(a, pilarRect) : false) || pilaresEst.some((r) => overlap(a, r));
    const parede = paredesRect.some((r) => overlap(a, r));
    const mob = infraRects.some((r) => overlap(a, r));
    const outro = itens.some((b) => b.id !== a.id && overlap(a, b));
    const corr = corredor ? a.x_cm < corredor.x + corredor.w && a.x_cm + a.w_cm > corredor.x : false;
    // Área de uso invadida por OUTRO equipamento (aviso amarelo, não bloqueio).
    const uso = !fora && !pil && !outro && itens.some((b) => b.id !== a.id && overlapR(usoRect(a), usoRect(b)));
    res[a.id] = fora || pil || parede || mob || outro ? "colisao" : corr ? "corredor" : uso ? "uso" : null;
  }
  return res;
}

// Tolerante a dados antigos: item sem cenário válido conta como "balanceado".
export function totalCenario(itens: ItemPosicionado[], tier: Cenario): number {
  const tierOrd = (CENARIOS[tier] ?? CENARIOS.balanceado).ordem;
  return (itens ?? []).reduce((s, i) => {
    const c = CENARIOS[i.cenario] ?? CENARIOS.balanceado;
    return c.ordem <= tierOrd ? s + (i.preco || 0) : s;
  }, 0);
}

/** Item com prioridade calculada (impacto+valor_percebido+necessidade), ordenado desc.
 *  Só entram itens com pelo menos um dos três campos preenchidos. */
export function matrizDaCena(cena: Cena): (ItemPosicionado & { prio: number })[] {
  return (cena.itens ?? [])
    .filter((i) => i.impacto || i.valor_percebido || i.necessidade)
    .map((i) => ({ ...i, prio: (i.impacto || 0) + (i.valor_percebido || 0) + (i.necessidade || 0) }))
    .sort((a, b) => b.prio - a.prio);
}

export function resumo(cena: Cena) {
  const sala = cena.sala;
  const itens = cena.itens ?? [];
  const problemas = problemasDaCena(cena);
  const nCol = Object.values(problemas).filter((v) => v === "colisao").length;
  const nCor = Object.values(problemas).filter((v) => v === "corredor").length;
  const nUso = Object.values(problemas).filter((v) => v === "uso").length;
  const areaItens = itens.reduce((s, i) => s + i.w_cm * i.h_cm, 0);
  const ocup = sala.largura_cm && sala.profundidade_cm ? (areaItens / (sala.largura_cm * sala.profundidade_cm)) * 100 : 0;
  const subtotal = itens.reduce((s, i) => s + (i.preco || 0), 0);
  return {
    problemas, nCol, nCor, nUso,
    ocupacao: Math.round(ocup),
    subtotal,
    cenarios: {
      essencial: totalCenario(itens, "essencial"),
      balanceado: totalCenario(itens, "balanceado"),
      premium: totalCenario(itens, "premium"),
    },
  };
}
