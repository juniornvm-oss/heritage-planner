import { describe, expect, it } from "vitest";
import { PRESETS_LAMINA } from "../lib/types";
import { ETAPAS } from "./etapas";

describe("fluxo de trabalho do editor", () => {
  it("levanta o inventário logo após a planta", () => {
    expect(ETAPAS.slice(0, 2).map((etapa) => etapa.id)).toEqual(["planta", "inventario"]);
  });

  it("organiza acessórios junto ao layout", () => {
    const layout = ETAPAS.findIndex((etapa) => etapa.id === "layout");
    expect(ETAPAS[layout + 1].id).toBe("acessorios");
  });

  it("revisa cobertura e sugestões futuras antes do dossiê", () => {
    expect(ETAPAS.slice(-2).map((etapa) => etapa.id)).toEqual(["cobertura", "curadoria"]);
  });
});

describe("lâminas de visualização", () => {
  it("oferece as vistas limpas pedidas para o layout", () => {
    expect(PRESETS_LAMINA.map((p) => p.id)).toEqual(expect.arrayContaining([
      "maquinas", "entradas", "medidas", "layout_limpo",
    ]));
  });

  it("não mistura texto nas vistas de máquina e entrada", () => {
    for (const id of ["maquinas", "entradas"]) {
      const camadas = PRESETS_LAMINA.find((p) => p.id === id)!.camadas;
      expect(camadas.equipamentos).toBe(true);
      expect(camadas.rotulos).toBe(false);
      expect(camadas.medidas).toBe(false);
    }
  });
});
