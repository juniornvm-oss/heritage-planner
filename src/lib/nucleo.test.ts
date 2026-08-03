// Testes do núcleo: as funções puras que decidem DINHEIRO e MEDIDA. São as que
// saem no dossiê do cliente e as que definem o tamanho da sala — errar aqui é
// caro e silencioso. `npm test`.
import { describe, it, expect } from "vitest";
import { taxaDe, taxaLabel, TAXA_ASSESSORIA, type Cena } from "./types";
import { parseLength, formatLength, BRL } from "./units";
import { dimensoesParaCm } from "./supabase";
import { resumo } from "./validation";
import { montarDossie } from "./export/pdfExport";

describe("honorário", () => {
  it("cai no padrão de 0,5% quando o cadastro está vazio", () => {
    expect(taxaDe(null)).toBe(TAXA_ASSESSORIA);
    expect(taxaDe({})).toBe(TAXA_ASSESSORIA);
    expect(taxaDe({ honorario_pct: null })).toBe(TAXA_ASSESSORIA);
  });

  it("usa o percentual cadastrado", () => {
    expect(taxaDe({ honorario_pct: 1 })).toBe(0.01);
    expect(taxaDe({ honorario_pct: 0.5 })).toBe(0.005);
    expect(taxaDe({ honorario_pct: 2.5 })).toBe(0.025);
  });

  it("ignora valor inválido em vez de zerar o honorário", () => {
    expect(taxaDe({ honorario_pct: 0 })).toBe(TAXA_ASSESSORIA);
    expect(taxaDe({ honorario_pct: -3 })).toBe(TAXA_ASSESSORIA);
    expect(taxaDe({ honorario_pct: NaN })).toBe(TAXA_ASSESSORIA);
  });

  it("rotula em pt-BR", () => {
    expect(taxaLabel(0.005)).toBe("0,5%");
    expect(taxaLabel(0.01)).toBe("1%");
    expect(taxaLabel(0.025)).toBe("2,5%");
  });

  it("o honorário de um teto de 350 mil bate com o rótulo", () => {
    const teto = 350000;
    expect(Math.round(teto * taxaDe({ honorario_pct: 0.5 }))).toBe(1750);
    expect(Math.round(teto * taxaDe({ honorario_pct: 1 }))).toBe(3500);
    expect(BRL(1750)).toBe("R$ 1.750");
  });
});

describe("dimensões enviadas pelo síndico", () => {
  it("lê os formatos que aparecem no formulário", () => {
    expect(dimensoesParaCm("11,0 x 11,2")).toEqual({ largura_cm: 1100, profundidade_cm: 1120 });
    expect(dimensoesParaCm("11 x 11")).toEqual({ largura_cm: 1100, profundidade_cm: 1100 });
    expect(dimensoesParaCm("8.5 por 6.4 metros")).toEqual({ largura_cm: 850, profundidade_cm: 640 });
  });

  it("devolve null em vez de inventar uma sala", () => {
    // Antes isto virava 10 × 8 m em silêncio e o projeto nascia com a sala errada.
    expect(dimensoesParaCm("mais ou menos onze por onze")).toBeNull();
    expect(dimensoesParaCm("11")).toBeNull();
    expect(dimensoesParaCm("")).toBeNull();
    expect(dimensoesParaCm(null)).toBeNull();
  });
});

describe("unidades (mundo em cm)", () => {
  it("converte de e para metros", () => {
    expect(parseLength("5m")).toBe(500);
    expect(parseLength("5,2 m")).toBe(520);
    expect(parseLength("80 cm")).toBe(80);
    expect(parseLength("500")).toBe(500);
    expect(parseLength("onze")).toBeNull();
  });

  it("formata sem casas sobrando", () => {
    expect(formatLength(500)).toBe("5 m");
    expect(formatLength(520)).toBe("5,20 m");
    expect(formatLength(80)).toBe("80 cm");
  });
});

// ── Cena mínima reaproveitada nos testes de resumo e PDF ──────────────────
const cena = (): Cena => ({
  sala: { largura_cm: 1000, profundidade_cm: 800 },
  planta: null,
  itens: [
    { id: "a", nome: "Esteira", x_cm: 0, y_cm: 0, w_cm: 200, h_cm: 90, rotacao: 0, zona: "ergo", preco: 30000, cenario: "essencial" },
    { id: "b", nome: "Banco", x_cm: 400, y_cm: 400, w_cm: 150, h_cm: 60, rotacao: 0, zona: "livre", preco: 5000, cenario: "premium" },
  ],
});

describe("resumo da cena", () => {
  it("soma os cenários de forma acumulativa", () => {
    const r = resumo(cena());
    // Essencial entra em todos; premium só no premium.
    expect(r.cenarios.essencial).toBe(30000);
    expect(r.cenarios.premium).toBe(35000);
  });

  it("não acusa colisão em itens separados", () => {
    expect(resumo(cena()).nCol).toBe(0);
  });

  it("acusa colisão quando dois itens se sobrepõem", () => {
    const c = cena();
    c.itens[1] = { ...c.itens[1], x_cm: 10, y_cm: 10 };
    expect(resumo(c).nCol).toBeGreaterThan(0);
  });
});

describe("dossiê executivo (PDF)", () => {
  it("gera um PDF válido sem cadastro do consultor", async () => {
    const bytes = await montarDossie({ nome: "Maison Heritage", orcamento_teto: 350000, cena: cena() });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("gera com o cadastro preenchido (honorário fora do padrão)", async () => {
    const bytes = await montarDossie(
      { nome: "Maison Heritage", orcamento_teto: 350000, cena: cena() },
      null, [], { empresa: "Heritage", honorario_pct: 1, rodape: "Heritage · Assessoria" },
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("não quebra num projeto sem teto e sem itens", async () => {
    const vazia: Cena = { sala: { largura_cm: 500, profundidade_cm: 400 }, planta: null, itens: [] };
    const bytes = await montarDossie({ nome: "Novo", orcamento_teto: null, cena: vazia });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
