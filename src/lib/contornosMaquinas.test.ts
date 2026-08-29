import { describe, it, expect } from "vitest";
import {
  funcaoDaSilhueta, silhuetaDaPeca, silhuetaPorNome,
} from "./contornosMaquinas";
import { CATALOGO_LOCAL, heritageItens } from "./seed";
import { silhuetasFaltando } from "./catalogoMaquinas";

function rects(s: number[][]): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (const tr of s) {
    if (tr.length !== 10) continue;
    const xs = [tr[0], tr[2], tr[4], tr[6]];
    const ys = [tr[1], tr[3], tr[5], tr[7]];
    const x = Math.min(...xs), y = Math.min(...ys);
    out.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
  }
  return out;
}

describe("silhuetas de planta (cópia DWG)", () => {
  it("esteira: console na frente (topo), não na base", () => {
    const s = silhuetaDaPeca("Esteira", "Cardio");
    const consoles = rects(s).filter((r) => r.y <= 0.08 && r.h <= 0.18 && r.w >= 0.35);
    expect(consoles.length, "console curto no topo").toBeGreaterThan(0);
    const naBase = rects(s).filter((r) => r.y >= 0.80 && r.h <= 0.18 && r.w >= 0.35);
    expect(naBase).toEqual([]);
  });

  it("seta de entrada fica na base (Y → 1)", () => {
    const s = silhuetaDaPeca("Esteira", "Cardio");
    const last = s[s.length - 1];
    const ys = last.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0.93);
  });

  it("leg press: plataforma no topo, banco na entrada", () => {
    const s = silhuetaDaPeca("Leg Press 45°", "Peso livre");
    const topo = rects(s).filter((r) => r.y <= 0.08 && r.w >= 0.4);
    const base = rects(s).filter((r) => r.y >= 0.70 && r.w >= 0.4);
    expect(topo.length).toBeGreaterThan(0);
    expect(base.length).toBeGreaterThan(0);
  });

  it("nomes Heritage e Esteira · Marca resolvem função", () => {
    expect(funcaoDaSilhueta("Esteira")).toBe("Esteira");
    expect(funcaoDaSilhueta("Esteira · Nautilus")).toBe("Esteira");
    expect(funcaoDaSilhueta("Cross + Smith")).toBe("Smith + Cross");
    expect(funcaoDaSilhueta("Squat Machine")).toBe("Hack squat");
    expect(funcaoDaSilhueta("Lying Leg Curl")).toBe("Mesa Flexora");
    expect(funcaoDaSilhueta("Dual Leg Extension")).toBe("Cadeira Extensora");
    expect(funcaoDaSilhueta("Dual Inner")).toBe("Adutora");
    expect(funcaoDaSilhueta("Impact Delt Raise")).toBe("Elevação lateral");
    expect(funcaoDaSilhueta("Puxada + Remada")).toBe("Puxada + Remada");
    expect(funcaoDaSilhueta("Elevação Pélvica")).toBe("Elevação pélvica");
    expect(funcaoDaSilhueta("Torre Halteres")).toBe("Torre de halteres");
    expect(funcaoDaSilhueta("Aparelho inventado")).toBeUndefined();
  });

  it("todo o catálogo Heritage tem silhueta 0..1", () => {
    expect(CATALOGO_LOCAL).toHaveLength(22);
    for (const e of CATALOGO_LOCAL) {
      expect(funcaoDaSilhueta(e.nome), e.nome).toBeTruthy();
      expect(e.contorno?.length, e.nome).toBeGreaterThanOrEqual(2);
      for (const tr of e.contorno!) {
        expect(tr.length % 2, e.nome).toBe(0);
        for (const n of tr) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("o modelo Heritage leva o contorno para a planta", () => {
    const itens = heritageItens();
    expect(itens.every((it) => (it.contorno?.length ?? 0) >= 2)).toBe(true);
  });

  it("silhuetasFaltando preenche Heritage sem contorno e não pisa desenho colado", () => {
    const cru = { ...CATALOGO_LOCAL[0], contorno: null };
    expect(silhuetasFaltando([cru])).toHaveLength(1);
    expect(silhuetasFaltando([cru])[0].contorno?.length).toBeGreaterThanOrEqual(2);
    const colado = { ...CATALOGO_LOCAL[0], contorno: [[0, 0, 1, 0, 1, 1, 0, 1]] };
    expect(silhuetasFaltando([colado])).toHaveLength(0);
  });

  it("silhuetaPorNome de marca casa com a função", () => {
    const a = silhuetaPorNome("Esteira · Life Fitness", "Cardio");
    const b = silhuetaDaPeca("Esteira", "Cardio");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
