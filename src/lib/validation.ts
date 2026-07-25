import type { Cena, ItemPosicionado, Cenario } from "./types";
import { CENARIOS } from "./types";

const overlap = (a: ItemPosicionado, b: { x_cm: number; y_cm: number; w_cm: number; h_cm: number }) =>
  a.x_cm < b.x_cm + b.w_cm && a.x_cm + a.w_cm > b.x_cm && a.y_cm < b.y_cm + b.h_cm && a.y_cm + a.h_cm > b.y_cm;

export type Problema = "colisao" | "corredor" | null;

export function problemasDaCena(cena: Cena): Record<string, Problema> {
  const { sala, itens } = cena;
  const p = sala.config?.pilar;
  const pilarRect = p ? { x_cm: p.x, y_cm: p.y, w_cm: p.w, h_cm: p.h } : null;
  const corredor = sala.config?.corredor;
  const res: Record<string, Problema> = {};
  for (const a of itens) {
    const fora = a.x_cm < 0 || a.y_cm < 0 || a.x_cm + a.w_cm > sala.largura_cm || a.y_cm + a.h_cm > sala.profundidade_cm;
    const pil = pilarRect ? overlap(a, pilarRect) : false;
    const outro = itens.some((b) => b.id !== a.id && overlap(a, b));
    const corr = corredor ? a.x_cm < corredor.x + corredor.w && a.x_cm + a.w_cm > corredor.x : false;
    res[a.id] = fora || pil || outro ? "colisao" : corr ? "corredor" : null;
  }
  return res;
}

export function totalCenario(itens: ItemPosicionado[], tier: Cenario): number {
  return itens.reduce((s, i) => (CENARIOS[i.cenario].ordem <= CENARIOS[tier].ordem ? s + (i.preco || 0) : s), 0);
}

export function resumo(cena: Cena) {
  const { sala, itens } = cena;
  const problemas = problemasDaCena(cena);
  const nCol = Object.values(problemas).filter((v) => v === "colisao").length;
  const nCor = Object.values(problemas).filter((v) => v === "corredor").length;
  const areaItens = itens.reduce((s, i) => s + i.w_cm * i.h_cm, 0);
  const ocup = sala.largura_cm && sala.profundidade_cm ? (areaItens / (sala.largura_cm * sala.profundidade_cm)) * 100 : 0;
  const subtotal = itens.reduce((s, i) => s + (i.preco || 0), 0);
  return {
    problemas, nCol, nCor,
    ocupacao: Math.round(ocup),
    subtotal,
    cenarios: {
      essencial: totalCenario(itens, "essencial"),
      balanceado: totalCenario(itens, "balanceado"),
      premium: totalCenario(itens, "premium"),
    },
  };
}
