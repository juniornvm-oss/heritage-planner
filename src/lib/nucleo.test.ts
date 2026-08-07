// Testes do núcleo: as funções puras que decidem DINHEIRO e MEDIDA. São as que
// saem no dossiê do cliente e as que definem o tamanho da sala — errar aqui é
// caro e silencioso. `npm test`.
import { describe, it, expect } from "vitest";
import { taxaDe, taxaLabel, TAXA_ASSESSORIA, type Cena } from "./types";
import { parseLength, formatLength, BRL } from "./units";
import { dimensoesParaCm } from "./supabase";
import { resumo } from "./validation";
import { montarDossie } from "./export/pdfExport";
import {
  baseDoNome, cenarioSugerido, classificacaoPendente, composicaoZonas,
  detalheCenarios, especificacaoDaZona, exerciciosDaCena, exerciciosDoItem,
  explicarItem, normalizarExercicios,
} from "./curadoria";
import { heritageProjeto } from "./seed";

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

describe("curadoria — classificação por cenário", () => {
  it("sugere o cenário pelo nome do equipamento, ignorando acento e caixa", () => {
    expect(cenarioSugerido("Esteira", "ergo")).toBe("essencial");
    expect(cenarioSugerido("ESTEIRA · Movimente RT250", "ergo")).toBe("essencial");
    expect(cenarioSugerido("Elevação Pélvica · Nautilus", "forca")).toBe("balanceado");
    expect(cenarioSugerido("Bike Spinning", "ergo")).toBe("premium");
  });

  it("casa a chave mais específica quando o nome tem mais de uma", () => {
    // "Wire Cross + Smith Rack" tem "wire cross", "cross + smith" e "smith rack".
    // A combinada é essencial; a torre de polias sozinha é premium.
    expect(baseDoNome("Wire Cross + Smith Rack · Moviment")?.cenario).toBe("essencial");
    expect(cenarioSugerido("Cross Over Angular", "forca")).toBe("premium");
  });

  it("cai num padrão seguro quando o nome não está na base", () => {
    expect(cenarioSugerido("Aparelho sem nome conhecido", "prep")).toBe("essencial");
    expect(cenarioSugerido("Aparelho sem nome conhecido", "forca")).toBe("balanceado");
  });

  it("o modelo Heritage sai do editor com os três cenários diferentes", () => {
    // O bug que motivou tudo: com tudo em "balanceado", Essencial saía R$ 0 e
    // Premium saía igual ao Balanceado — os três cards do PDF diziam a mesma coisa.
    const c = heritageProjeto().cena!;
    expect(classificacaoPendente(c)).toBe(false);
    const r = resumo(c);
    expect(r.cenarios.essencial).toBeGreaterThan(0);
    expect(r.cenarios.essencial).toBeLessThan(r.cenarios.balanceado);
    expect(r.cenarios.balanceado).toBeLessThan(r.cenarios.premium);
  });

  it("detalha o que cada nível ACRESCENTA, além do acumulado", () => {
    const niveis = detalheCenarios(cena());
    expect(niveis.map((n) => n.cenario)).toEqual(["essencial", "balanceado", "premium"]);
    // O acumulado do último nível é a soma de todos os incrementos.
    const soma = niveis.reduce((s, n) => s + n.incremento, 0);
    expect(niveis[2].total).toBe(soma);
    expect(niveis[2].nAcumulado).toBe(cena().itens.length);
  });

  it("acusa a classificação pendente quando ninguém classificou nada", () => {
    const c = cena();
    c.itens = c.itens.map((i) => ({ ...i, cenario: "balanceado" as const }));
    expect(classificacaoPendente(c)).toBe(true);
  });
});

describe("curadoria — especificação e explicação", () => {
  it("agrupa a cena por categoria com quantidade, área e subtotal", () => {
    const comp = composicaoZonas(heritageProjeto().cena!);
    expect(comp.length).toBeGreaterThan(1);
    for (const c of comp) {
      expect(c.n).toBe(c.itens.length);
      expect(c.subtotal).toBe(c.itens.reduce((s, i) => s + (i.preco || 0), 0));
      const nPorCenario = c.porCenario.essencial.n + c.porCenario.balanceado.n + c.porCenario.premium.n;
      expect(nPorCenario).toBe(c.n);
    }
  });

  it("a nota do projeto acompanha a especificação padrão, sem substituí-la", () => {
    const c = heritageProjeto().cena!;
    c.especificacoes = { ergo: { nota: "4 esteiras atendem o pico das 19h." } };
    const esp = especificacaoDaZona("ergo", c);
    expect(esp.nota).toBe("4 esteiras atendem o pico das 19h.");
    expect(esp.oque).toContain("esforço contínuo");
  });

  it("o texto reescrito pelo consultor SUBSTITUI o padrão, campo a campo", () => {
    const c = heritageProjeto().cena!;
    c.especificacoes = { ergo: { oque: "Só as esteiras, por decisão do conselho." } };
    const esp = especificacaoDaZona("ergo", c);
    expect(esp.oque).toBe("Só as esteiras, por decisão do conselho.");
    // os demais campos continuam vindo do padrão
    expect(esp.criterio).toContain("12 a 15");
    expect(esp.nota).toBeUndefined();
  });

  it("explica pelo padrão e deixa o texto do consultor vencer", () => {
    const item = heritageProjeto().cena!.itens.find((i) => i.nome === "Esteira")!;
    const padrao = explicarItem(item, null);
    expect(padrao.padrao).toBe(true);
    expect(padrao.oque).toContain("Esteira motorizada");
    expect(padrao.trabalha).not.toBe("—");

    const ajustado = explicarItem({ ...item, funcao: "Aquecimento dos moradores." }, null);
    expect(ajustado.indicacao).toBe("Aquecimento dos moradores.");
    expect(ajustado.padrao).toBe(false);
    // A descrição do catálogo substitui o "o que é" da base técnica.
    expect(explicarItem(item, { nome: "Esteira", largura_cm: 90, profundidade_cm: 205, zona: "ergo", preco: 0, descricao: "Esteira do condomínio." }).oque)
      .toBe("Esteira do condomínio.");
  });

  it("gera o dossiê completo do modelo Heritage (memorial de todos os itens)", async () => {
    const p = heritageProjeto();
    const bytes = await montarDossie(p);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    // Memorial + especificações fazem o documento crescer bem acima da versão só-tabela.
    expect(bytes.length).toBeGreaterThan(20000);
  });
});

describe("curadoria — exercícios de musculação por equipamento", () => {
  const itemDe = (nome: string) => heritageProjeto().cena!.itens.find((i) => i.nome === nome)!;

  it("lista exercícios só onde a lista é fechada (máquina de trajetória fixa)", () => {
    expect(exerciciosDoItem(itemDe("Leg Press 45°")).length).toBeGreaterThan(2);
    expect(exerciciosDoItem(itemDe("Puxada + Remada")).join(" ")).toContain("Puxada frontal");
    // Banco e rack NÃO listam exercício por exercício — o repertório é aberto
    // (depende do que o morador traz para cima do banco) e lista incompleta
    // passa informação errada.
    expect(exerciciosDoItem(itemDe("Banco 0-90°"))).toEqual([]);
    expect(explicarItem(itemDe("Banco 0-90°")).indicacao).toContain("múltiplos exercícios");
    // Já a estação combinada (Smith + polias) TEM lista: a trajetória de cada
    // exercício é definida pela própria estrutura, então a lista é fechada e
    // verificável, mesmo sendo longa.
    expect(exerciciosDoItem(itemDe("Cross + Smith")).length).toBeGreaterThan(10);
  });

  it("não inventa exercício onde não se faz musculação", () => {
    // Ergômetro, móvel de guarda e área de solo ficam de fora — a regra é só
    // exercício RESISTIDO feito no próprio equipamento.
    for (const nome of ["Esteira", "Bike Horizontal", "Elíptico", "Escada", "Estante Dumbbells", "Torre Halteres", "Colchonetes", "Espaldar"]) {
      expect(exerciciosDoItem(itemDe(nome))).toEqual([]);
    }
  });

  it("a ficha do projeto e o catálogo vencem a base técnica, nessa ordem", () => {
    const item = itemDe("Leg Press 45°");
    const doCatalogo = { nome: "Leg Press 45°", largura_cm: 246, profundidade_cm: 158, zona: "forca" as const, preco: 0, exercicios: ["Leg press do fornecedor"] };
    expect(exerciciosDoItem(item, doCatalogo)).toEqual(["Leg press do fornecedor"]);
    expect(exerciciosDoItem({ ...item, exercicios: ["Só este"] }, doCatalogo)).toEqual(["Só este"]);
    // Lista vazia não conta como override — cai de volta no padrão.
    expect(exerciciosDoItem({ ...item, exercicios: [] }).length).toBeGreaterThan(3);
  });

  it("limpa a lista digitada: sem vazios, sem repetido, na ordem escrita", () => {
    expect(normalizarExercicios(["  Agachamento  ", "", "agachamento", "Leg press", "   "]))
      .toEqual(["Agachamento", "Leg press"]);
  });

  it("conta os exercícios distintos da sala sem repetir", () => {
    const c = heritageProjeto().cena!;
    const distintos = exerciciosDaCena(c);
    const somaBruta = c.itens.reduce((s, i) => s + exerciciosDoItem(i).length, 0);
    expect(distintos.length).toBeGreaterThan(10);
    expect(distintos.length).toBeLessThanOrEqual(somaBruta);
    expect(new Set(distintos).size).toBe(distintos.length);
  });

  it("a explicação do item carrega a lista para o memorial", () => {
    expect(explicarItem(itemDe("Squat Machine")).exercicios).toContain("Agachamento guiado completo");
    expect(explicarItem(itemDe("Esteira")).exercicios).toEqual([]);
  });
});

describe("lâminas do Dossiê", () => {
  // PNG 1×1 transparente — basta para o pdf-lib embutir.
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  it("aceita a string antiga (a planta única de sempre)", async () => {
    const bytes = await montarDossie({ nome: "Antigo", orcamento_teto: null, cena: cena() }, PNG);
    const semPlanta = await montarDossie({ nome: "Antigo", orcamento_teto: null, cena: cena() }, null);
    expect(bytes.length).toBeGreaterThan(semPlanta.length);
  });

  it("aceita várias lâminas e cresce com elas", async () => {
    const p = { nome: "Lâminas", orcamento_teto: null, cena: cena() };
    const uma = await montarDossie(p, [{ png: PNG, indice: true }]);
    const tres = await montarDossie(p, [
      { png: PNG, indice: true },
      { png: PNG, legenda: "Piso e revestimento" },
      { png: PNG, legenda: "Distâncias entre aparelhos" },
    ]);
    expect(tres.length).toBeGreaterThan(uma.length);
  });

  it("sem lâmina nenhuma o Dossiê ainda sai", async () => {
    const bytes = await montarDossie({ nome: "Sem planta", orcamento_teto: null, cena: cena() }, []);
    expect(bytes.length).toBeGreaterThan(5000);
  });
});
