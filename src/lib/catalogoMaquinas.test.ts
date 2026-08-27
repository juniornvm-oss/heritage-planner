// Biblioteca internacional: cada peça precisa ser reconhecida pela base
// técnica (senão some da cobertura do Dossiê) e pela detecção de marca.
import { describe, it, expect } from "vitest";
import { BIBLIOTECA_MAQUINAS, MARCAS_MAQUINAS, chaveDaMaquina, csvDaBiblioteca, maquinasFaltando, silhuetasFaltando } from "./catalogoMaquinas";
import { silhuetaDaPeca } from "./contornosMaquinas";
import { baseDoNome } from "./curadoria";
import { marcasDaCena } from "./marcas";
import { MARCAS_BASE } from "./marcas";
import type { Cena, ItemPosicionado } from "./types";

describe("biblioteca de maquinário", () => {
  it("não duplica nome+marca", () => {
    const chaves = BIBLIOTECA_MAQUINAS.map(chaveDaMaquina);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("cobre as cinco marcas pedidas", () => {
    const marcas = new Set(BIBLIOTECA_MAQUINAS.map((e) => e.marca));
    for (const m of MARCAS_MAQUINAS) expect(marcas.has(m)).toBe(true);
  });

  it("toda peça casa na base técnica", () => {
    const falhas = BIBLIOTECA_MAQUINAS.filter((e) => !baseDoNome(e.nome)).map((e) => e.nome);
    expect(falhas).toEqual([]);
  });

  it("ocupação em planta é medida de equipamento, não de sala", () => {
    for (const e of BIBLIOTECA_MAQUINAS) {
      expect(e.largura_cm).toBeGreaterThanOrEqual(50);
      expect(e.largura_cm).toBeLessThanOrEqual(260);
      expect(e.profundidade_cm).toBeGreaterThanOrEqual(50);
      expect(e.profundidade_cm).toBeLessThanOrEqual(260);
    }
  });

  it("a detecção de marca lê Nautilus, Life Fitness, Hammer Strength, Matrix e Technogym", () => {
    const itens: ItemPosicionado[] = BIBLIOTECA_MAQUINAS.map((e, i) => ({
      id: String(i), nome: e.nome, x_cm: 0, y_cm: 0, w_cm: e.largura_cm, h_cm: e.profundidade_cm,
      rotacao: 0, zona: e.zona, cenario: "balanceado", preco: 0,
    }));
    const cena: Cena = { sala: { largura_cm: 2000, profundidade_cm: 2000 }, planta: null, itens };
    const nomes = marcasDaCena(cena, BIBLIOTECA_MAQUINAS, MARCAS_BASE).map((m) => m.nome);
    for (const m of MARCAS_MAQUINAS) expect(nomes).toContain(m);
  });

  it("maquinasFaltando ignora o que já está cadastrado", () => {
    const um = BIBLIOTECA_MAQUINAS[0];
    const falta = maquinasFaltando([um]);
    expect(falta).toHaveLength(BIBLIOTECA_MAQUINAS.length - 1);
    expect(falta.some((e) => chaveDaMaquina(e) === chaveDaMaquina(um))).toBe(false);
  });

  it("o CSV tem cabeçalho e uma linha por peça", () => {
    const linhas = csvDaBiblioteca().trim().split("\n");
    expect(linhas[0]).toContain("marca");
    expect(linhas.length - 1).toBe(BIBLIOTECA_MAQUINAS.length);
  });

  it("toda peça tem silhueta de planta (cópia do footprint, 0..1)", () => {
    for (const e of BIBLIOTECA_MAQUINAS) {
      expect(e.contorno?.length, e.nome).toBeGreaterThanOrEqual(2);
      for (const tr of e.contorno!) {
        expect(tr.length % 2, e.nome).toBe(0);
        expect(tr.length, e.nome).toBeGreaterThanOrEqual(4);
        for (const n of tr) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("Hammer Strength plate-loaded usa chifres, não pilha de pinos", () => {
    const hammer = silhuetaDaPeca("Supino máquina", "Peso livre");
    const nautilus = silhuetaDaPeca("Supino máquina", "Musculação guiada");
    expect(JSON.stringify(hammer)).not.toBe(JSON.stringify(nautilus));
  });

  it("silhuetasFaltando só pega cadastro sem contorno", () => {
    const um = { ...BIBLIOTECA_MAQUINAS[0], id: "x1", contorno: null };
    expect(silhuetasFaltando([um])).toHaveLength(1);
    expect(silhuetasFaltando([BIBLIOTECA_MAQUINAS[0]])).toHaveLength(0);
    const custom = { ...BIBLIOTECA_MAQUINAS[0], id: "x2", contorno: [[0, 0, 1, 0, 1, 1, 0, 1]] };
    expect(silhuetasFaltando([custom])).toHaveLength(0);
  });
});
