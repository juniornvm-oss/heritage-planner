// Acessórios no espaço: o catálogo Heritage não pode ir inteiro para todo
// condomínio. Cardio não pede anilha; polia pede puxador; rack pede barra.
// `npx vitest run src/lib/acessorios.test.ts`
import { describe, it, expect } from "vitest";
import {
  agruparPorLugar, ancoraNoPonto, catalogoRelevante, custoAcessorio, familiaDoNome,
  mesclarSugestoes, organizarAcessorios, reconciliarAcessorios, sinaisDoProjeto, sugerirAcessorios,
} from "./acessorios";
import type { AreaFuncional, Cena, ItemPosicionado } from "./types";

const item = (nome: string, extra: Partial<ItemPosicionado> = {}): ItemPosicionado => ({
  id: extra.id ?? nome, nome, x_cm: extra.x_cm ?? 100, y_cm: extra.y_cm ?? 100,
  w_cm: extra.w_cm ?? 120, h_cm: extra.h_cm ?? 80, rotacao: 0, zona: "livre",
  cenario: "balanceado", preco: 0, ...extra,
});

const area = (tipo: AreaFuncional["tipo"], extra: Partial<AreaFuncional> = {}): AreaFuncional => ({
  id: extra.id ?? tipo,
  tipo,
  pontos: extra.pontos ?? [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }],
  x_cm: 0, y_cm: 0, w_cm: 400, h_cm: 300, ...extra,
});

const cenaDe = (itens: ItemPosicionado[], extra: Partial<Cena> = {}): Cena => ({
  sala: { largura_cm: 1000, profundidade_cm: 800 },
  planta: null,
  itens,
  ...extra,
});

describe("família pelo nome", () => {
  it("separa carga, puxador, guarda e alongamento", () => {
    expect(familiaDoNome("Anilha olímpica BV 20 kg")).toBe("carga");
    expect(familiaDoNome("Puxador corda")).toBe("puxadores");
    expect(familiaDoNome("Suporte para anilhas 8 pontas")).toBe("guarda");
    expect(familiaDoNome("Colchonete emborrachado D80")).toBe("alongamento");
    expect(familiaDoNome("Kettlebell 32 kg")).toBe("funcional");
  });
});

describe("sugestão a partir do projeto", () => {
  it("não sugere nada numa sala só de cardio", () => {
    const c = cenaDe([item("Esteira Movement", { zona: "ergo" })]);
    expect(sugerirAcessorios(c)).toEqual([]);
    expect(catalogoRelevante(c)).toEqual([]);
  });

  it("rack pede anilha e barra — guarda fica no próprio rack", () => {
    const c = cenaDe([item("Power Rack")]);
    const nomes = sugerirAcessorios(c).map((s) => s.nome.toLowerCase());
    expect(nomes.some((n) => n.includes("anilha") && !n.includes("suporte"))).toBe(true);
    expect(nomes.some((n) => n.includes("2,20"))).toBe(true);
    expect(nomes.some((n) => n.includes("puxador"))).toBe(false);
    expect(nomes.some((n) => n.includes("8 pontas"))).toBe(false);
    expect(nomes.some((n) => n.includes("9 barras"))).toBe(false);
    expect(sinaisDoProjeto(c).nRack).toBe(1);
  });

  it("estação de polia pede kit de puxadores, não anilha", () => {
    const c = cenaDe([item("Puxada + Remada")]);
    const sugs = sugerirAcessorios(c);
    expect(sugs.some((s) => /puxador/i.test(s.nome))).toBe(true);
    expect(sugs.some((s) => /anilha/i.test(s.nome))).toBe(false);
  });

  it("região de alongamento dimensiona colchonete pela área", () => {
    const c = cenaDe([], { areas: [area("alongamento")] });
    const colch = sugerirAcessorios(c).find((s) => /colchonete/i.test(s.nome));
    expect(colch).toBeTruthy();
    expect(colch!.qtd).toBeGreaterThanOrEqual(4);
    expect(colch!.qtd).toBeLessThanOrEqual(12);
  });

  it("duas estações de polia pedem puxadores extras", () => {
    const c = cenaDe([item("Puxada + Remada", { id: "a" }), item("Cross Over", { id: "b" })]);
    expect(sinaisDoProjeto(c).nPolia).toBe(2);
    const corda = sugerirAcessorios(c).find((s) => /corda/i.test(s.nome));
    expect(corda?.qtd).toBe(2);
  });
});

describe("organização no espaço", () => {
  it("ancora anilha no rack e puxador na polia", () => {
    const rack = item("Gaiola de agachamento", { id: "rack", x_cm: 50, y_cm: 50 });
    const polia = item("Puxada + Remada", { id: "polia", x_cm: 400, y_cm: 50 });
    const c = cenaDe([rack, polia], {
      acessorios: [
        { id: "1", nome: "Anilha olímpica BV 20 kg", qtd: 4, preco_un: 740 },
        { id: "2", nome: "Puxador corda", qtd: 1, preco_un: 247 },
      ],
    });
    const org = organizarAcessorios(c.acessorios!, c);
    expect(org[0].ancora).toEqual({ tipo: "item", id: "rack" });
    expect(org[1].ancora).toEqual({ tipo: "item", id: "polia" });
    expect(org[0].familia).toBe("carga");
    expect(org[1].familia).toBe("puxadores");
  });

  it("o toque sobre o equipamento vira âncora da peça", () => {
    const rack = item("Power Rack", { id: "r", x_cm: 100, y_cm: 100, w_cm: 120, h_cm: 80 });
    const c = cenaDe([rack]);
    expect(ancoraNoPonto(c, { x: 140, y: 130 })).toEqual({ tipo: "item", id: "r" });
  });

  it("mesclar não duplica o que já está na lista", () => {
    const c = cenaDe([item("Power Rack")], {
      acessorios: [{ id: "x", nome: "Anilha olímpica BV 20 kg", qtd: 2, preco_un: 740 }],
    });
    let n = 0;
    const m = mesclarSugestoes(c.acessorios!, c, () => `n${++n}`);
    expect(m.filter((a) => /20 kg/i.test(a.nome))).toHaveLength(1);
    expect(m.length).toBeGreaterThan(1);
  });

  it("agrupa no Dossiê pelo lugar, soltos no fim", () => {
    const rack = item("Power Rack", { id: "r" });
    const c = cenaDe([rack]);
    const grupos = agruparPorLugar([
      { id: "1", nome: "Anilha", qtd: 1, preco_un: 1, ancora: { tipo: "item", id: "r" } },
      { id: "2", nome: "Step EVA", qtd: 1, preco_un: 1 },
    ], c);
    expect(grupos[0].titulo).toMatch(/Power Rack/);
    expect(grupos[grupos.length - 1].titulo).toMatch(/Sem lugar/);
  });
});

describe("sincronizar guarda com o layout", () => {
  it("estante e torre no layout não pedem outro suporte de dumbbell", () => {
    const c = cenaDe([
      item("Estante Dumbbells", { w_cm: 60, h_cm: 240 }),
      item("Torre Halteres", { id: "t" }),
    ]);
    const nomes = sugerirAcessorios(c).map((s) => s.nome.toLowerCase());
    expect(nomes.some((n) => n.includes("dumbbell"))).toBe(true);
    expect(nomes.some((n) => n.includes("suporte de dumbbell"))).toBe(false);
    expect(nomes.some((n) => n.includes("conjunto"))).toBe(false);
  });

  it("colchonetes na planta não pedem suporte extra", () => {
    const c = cenaDe([item("Colchonetes", { zona: "prep" })], {
      areas: [area("alongamento")],
    });
    expect(sugerirAcessorios(c).some((s) => /suporte para 10 colchonetes/i.test(s.nome))).toBe(false);
  });

  it("marca suporte de anilha como incluso quando o rack já tem chifre", () => {
    const c = cenaDe([item("Power Rack")]);
    const rec = reconciliarAcessorios([
      { id: "1", nome: "Suporte para anilhas 8 pontas", qtd: 1, preco_un: 1200 },
      { id: "2", nome: "Anilha olímpica BV 20 kg", qtd: 8, preco_un: 740 },
    ], c);
    expect(rec[0].incluso).toBe(true);
    expect(rec[1].incluso).toBe(false);
    expect(custoAcessorio(rec[0])).toBe(0);
    expect(custoAcessorio(rec[1])).toBe(8 * 740);
  });
});
