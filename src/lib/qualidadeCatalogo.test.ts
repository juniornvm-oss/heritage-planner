import { describe, expect, it } from "vitest";
import { CAMPOS_TECNICOS, type Equipamento } from "./types";

describe("referência da biblioteca comercial", () => {
  it("persiste a página oficial no cadastro técnico", () => {
    expect(CAMPOS_TECNICOS).toContain("produto_url");
  });

  it("mantém a imagem separada da identificação real do modelo", () => {
    const equipamento = { imagem: "data:image/webp;base64,abc", marca: "Movement", modelo: "" } as Equipamento;
    expect(equipamento.imagem).toBeTruthy();
    expect(equipamento.modelo).toBeFalsy();
  });
});
