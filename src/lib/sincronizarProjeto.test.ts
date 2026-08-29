import { describe, it, expect } from "vitest";
import { heritageProjeto } from "./seed";
import { sugerirInventario, mesclarInventario } from "./inventarioSugestoes";
import { sugerirFuturo } from "./sugestoesFuturas";
import { OPCOES_DOSSIE_PADRAO, ORDEM_DOSSIE_PADRAO, ROTULO_SECAO_DOSSIE } from "./types";

describe("inventário sincronizado com o layout", () => {
  it("Heritage reaproveita esteira, banco, estante, torre e colchonetes", () => {
    const cena = heritageProjeto().cena!;
    const s = sugerirInventario(cena);
    const nomes = s.map((x) => x.nome);
    expect(nomes).toEqual(expect.arrayContaining(["Esteira", "Banco Supino", "Estante Dumbbells", "Torre Halteres", "Colchonetes"]));
    expect(s.find((x) => x.nome === "Esteira")?.qtd).toBe(4);
    expect(s.find((x) => x.nome === "Esteira")?.sugestao).toBe("reaproveitar");
    expect(s.find((x) => x.nome === "Escada")).toBeUndefined(); // preço > 0 = compra nova
  });

  it("o que está no inventário e não na planta vira sugestão de venda", () => {
    const cena = heritageProjeto().cena!;
    cena.inventario = [
      { id: "i1", nome: "Bike antiga", qtd: 2, destino: "reaproveitado" },
    ];
    const s = sugerirInventario(cena);
    const bike = s.find((x) => /bike antiga/i.test(x.nome));
    expect(bike?.sugestao).toBe("vender");
    expect(bike?.destino).toBe("residual");
  });

  it("mesclar não duplica o mesmo nome", () => {
    const cena = heritageProjeto().cena!;
    const a = mesclarInventario([], cena, () => "a");
    const b = mesclarInventario(a, cena, () => "b");
    const esteiras = b.filter((i) => i.nome === "Esteira");
    expect(esteiras).toHaveLength(1);
  });
});

describe("sugestões futuras", () => {
  it("Heritage já treina o essencial e ainda lista o que falta para completar", () => {
    const cena = heritageProjeto().cena!;
    const f = sugerirFuturo(cena);
    expect(f.length).toBeGreaterThan(0);
    expect(f.some((x) => x.tipo === "equipamento")).toBe(true);
  });
});

describe("seção futuro do Dossiê", () => {
  it("entra no mapa de seções", () => {
    expect(OPCOES_DOSSIE_PADRAO.futuro).toBe(true);
    expect(ORDEM_DOSSIE_PADRAO).toContain("futuro");
    expect(ROTULO_SECAO_DOSSIE.futuro).toMatch(/futur/i);
  });
});
