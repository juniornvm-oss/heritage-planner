import { describe, it, expect } from "vitest";
import { heritageProjeto } from "./seed";
import { mesclarInventario, resumoInventario } from "./inventarioSugestoes";
import type { ItemInventario } from "./types";

const item = (p: Partial<ItemInventario> & Pick<ItemInventario, "id" | "nome" | "destino">): ItemInventario =>
  ({ qtd: 1, ...p });

describe("totais do inventário", () => {
  it("separa patrimônio que fica do residual que vai ser vendido", () => {
    const r = resumoInventario([
      item({ id: "1", nome: "Esteira", qtd: 4, destino: "reaproveitado", valor_estimado: 1600 }),
      item({ id: "2", nome: "Cross Over", destino: "reaproveitado", valor_estimado: 3200 }),
      item({ id: "3", nome: "Leg Press", destino: "residual", valor_estimado: 3200 }),
    ]);
    expect(r.reaproveitado.valor).toBe(4 * 1600 + 3200);
    expect(r.reaproveitado.pecas).toBe(5);
    expect(r.residual.valor).toBe(3200);
  });

  it("multiplica a faixa de fechamento pela quantidade", () => {
    const r = resumoInventario([
      item({ id: "1", nome: "Banco", qtd: 2, destino: "residual", valor_estimado: 400,
             valor_fechamento_min: 250, valor_fechamento_max: 350 }),
    ]);
    expect(r.residual.valor).toBe(800);
    expect(r.residual.fechamentoMin).toBe(500);
    expect(r.residual.fechamentoMax).toBe(700);
    expect(r.residual.temFaixa).toBe(true);
  });

  it("item sem faixa entra no total pelo próprio anúncio, e não zerado", () => {
    const r = resumoInventario([
      item({ id: "1", nome: "Com faixa", destino: "residual", valor_estimado: 1000,
             valor_fechamento_min: 800, valor_fechamento_max: 900 }),
      item({ id: "2", nome: "Sem faixa", destino: "residual", valor_estimado: 500 }),
    ]);
    expect(r.residual.valor).toBe(1500);
    expect(r.residual.fechamentoMin).toBe(800 + 500);
    expect(r.residual.fechamentoMax).toBe(900 + 500);
  });

  it("só um lado da faixa preenchido não vira intervalo invertido", () => {
    const r = resumoInventario([
      item({ id: "1", nome: "Só mínimo", destino: "residual", valor_estimado: 900, valor_fechamento_min: 600 }),
    ]);
    expect(r.residual.fechamentoMin).toBe(600);
    expect(r.residual.fechamentoMax).toBe(600);
    expect(r.residual.fechamentoMax).toBeGreaterThanOrEqual(r.residual.fechamentoMin);
  });

  it("sem nenhum valor lançado, os totais ficam zerados e sem faixa", () => {
    const r = resumoInventario([item({ id: "1", nome: "Bike", destino: "residual" })]);
    expect(r.residual.valor).toBe(0);
    expect(r.residual.temFaixa).toBe(false);
    expect(resumoInventario(undefined).reaproveitado.pecas).toBe(0);
  });
});

describe("re-sincronizar preserva o que o consultor avaliou", () => {
  it("não sobrescreve valor_estimado já digitado", () => {
    const cena = heritageProjeto().cena!;
    const base = mesclarInventario([], cena, (() => { let n = 0; return () => `a${n++}`; })());
    const esteira = base.find((i) => i.nome === "Esteira")!;
    const avaliado = base.map((i) => (i.id === esteira.id ? { ...i, valor_estimado: 1600 } : i));

    const depois = mesclarInventario(avaliado, cena, (() => { let n = 0; return () => `b${n++}`; })());

    expect(depois.find((i) => i.id === esteira.id)?.valor_estimado).toBe(1600);
  });

  it("preenche o valor das linhas que ainda estavam sem avaliação", () => {
    const cena = heritageProjeto().cena!;
    const semValor: ItemInventario[] = [
      item({ id: "x1", nome: "Bike antiga", qtd: 1, destino: "residual", valor_estimado: 850 }),
    ];
    const depois = mesclarInventario(semValor, { ...cena, inventario: semValor }, () => "novo");
    expect(depois.find((i) => i.id === "x1")?.valor_estimado).toBe(850);
  });
});
