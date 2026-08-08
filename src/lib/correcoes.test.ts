// Testes de regressão da auditoria: cada bloco fixa um bug que passava em
// silêncio — números pt-BR truncados, blocos DWG sem girar, colisão cega à
// rotação, paredes/cotas engolidas por chave de dedup destrutiva. `npm test`.
import { describe, it, expect } from "vitest";
import { parseNum, detectarDelimitador, mapEquipamento } from "./readers";
import { unitToCm, dxfEntidadesParaVetorial } from "./plantaVetorial";
import { gerarEstrutura } from "./estrutura";
import { gerarCotasAutomaticas } from "./lamina";
import { problemasDaCena } from "./validation";
import { FASES, statusDaFase } from "./fases";
import type { Cena, ItemPosicionado, PlantaVetorial, Projeto } from "./types";

describe("parseNum (números pt-BR)", () => {
  it("lê vírgula decimal com 1 dígito — '90,5' virava 905", () => {
    expect(parseNum("90,5")).toBe(90.5);
    expect(parseNum("12,5")).toBe(12.5);
    expect(parseNum("0,5")).toBe(0.5);
    expect(parseNum("11,0")).toBe(11);
    expect(parseNum("-12,5")).toBe(-12.5);
  });

  it("continua lendo os formatos que já funcionavam", () => {
    expect(parseNum("12,50")).toBe(12.5);
    expect(parseNum("40.600,00")).toBe(40600);
    expect(parseNum("40,600.00")).toBe(40600);
    expect(parseNum("R$ 8.200,00")).toBe(8200);
    expect(parseNum("23.200")).toBe(23200);
    expect(parseNum("1,234,567")).toBe(1234567);
    expect(parseNum(0)).toBe(0);
    expect(parseNum("")).toBeNull();
    expect(parseNum("abc")).toBeNull();
  });

  it("dimensão com decimal chega inteira no equipamento", () => {
    const eq = mapEquipamento({ nome: "Esteira", largura: "90,5", profundidade: "210", preco: "12,5" });
    expect(eq?.largura_cm).toBe(90.5);
    expect(eq?.preco).toBe(12.5);
  });
});

describe("CSV com ponto e vírgula (Excel pt-BR)", () => {
  it("detecta ; , e tab pelo cabeçalho", () => {
    expect(detectarDelimitador("nome;largura;profundidade")).toBe(";");
    expect(detectarDelimitador("nome,largura,profundidade")).toBe(",");
    expect(detectarDelimitador("nome\tlargura\tprofundidade")).toBe("\t");
    // vírgula dentro de aspas não conta como delimitador
    expect(detectarDelimitador('"nome, completo";largura')).toBe(";");
  });
});

describe("importação DXF/DWG", () => {
  it("converte pés ($INSUNITS=2) — antes uma sala imperial encolhia ~305×", () => {
    expect(unitToCm(2)).toBe(30.48);
    expect(unitToCm(6)).toBe(100);
    expect(unitToCm(4)).toBe(0.1);
    expect(unitToCm(99)).toBe(0.1); // desconhecido cai em mm
  });

  it("INSERT de DWG gira em radianos (antes π/2 virava ~1,6°)", () => {
    const blocks = { B: { entities: [{ type: "LINE", startPoint: { x: 0, y: 0 }, endPoint: { x: 100, y: 0 } }] } };
    const ents = [{ type: "INSERT", name: "B", position: { x: 0, y: 0 }, rotation: Math.PI / 2 }];
    const g = dxfEntidadesParaVetorial(ents, blocks, 1, true); // DWG: ângulos em rad
    expect(g.tracos).toHaveLength(1);
    const pts = g.tracos[0].pts; // [x0,y0,x1,y1]
    expect(pts[0]).toBeCloseTo(pts[2], 5); // linha ficou VERTICAL
    expect(Math.abs(pts[3] - pts[1])).toBeCloseTo(100, 5);
  });

  it("INSERT de DXF continua girando em graus", () => {
    const blocks = { B: { entities: [{ type: "LINE", startPoint: { x: 0, y: 0 }, endPoint: { x: 100, y: 0 } }] } };
    const ents = [{ type: "INSERT", name: "B", position: { x: 0, y: 0 }, rotation: 90 }];
    const g = dxfEntidadesParaVetorial(ents, blocks, 1, false);
    const pts = g.tracos[0].pts;
    expect(pts[0]).toBeCloseTo(pts[2], 5);
    expect(Math.abs(pts[3] - pts[1])).toBeCloseTo(100, 5);
  });
});

const plantaVetorialDe = (tracos: number[][]): PlantaVetorial => ({
  origem: "dxf",
  tracos: tracos.map((pts) => ({ pts })),
  rotulos: [], camadas: [],
  x_cm: 0, y_cm: 0, rotacao: 0, escala: 1, opacidade: 1, bloqueada: false, mostrarTexto: true,
});

describe("estrutura automática (✨ Auto)", () => {
  it("mantém duas paredes internas perpendiculares — a chave antiga fundia as duas", () => {
    const cena: Cena = {
      sala: { largura_cm: 1000, profundidade_cm: 1000 },
      itens: [],
      plantaVetorial: plantaVetorialDe([
        [0, 0, 1000, 0, 1000, 1000, 0, 1000, 0, 0], // perímetro
        [200, 500, 800, 500], // parede interna horizontal
        [500, 200, 500, 800], // parede interna vertical (mesma chave na versão antiga)
      ]),
    };
    const est = gerarEstrutura(cena);
    // 4 do perímetro + 2 internas
    expect(est.paredes).toHaveLength(6);
    const internas = est.paredes.slice(4);
    const horiz = internas.filter((w) => w.y1 === w.y2).length;
    const vert = internas.filter((w) => w.x1 === w.x2).length;
    expect(horiz).toBe(1);
    expect(vert).toBe(1);
  });
});

const item = (p: Partial<ItemPosicionado>): ItemPosicionado => ({
  id: p.id ?? "a", nome: "Item", x_cm: 0, y_cm: 0, w_cm: 100, h_cm: 100,
  rotacao: 0, zona: "livre", cenario: "balanceado", preco: 0, ...p,
});

describe("cotas automáticas da lâmina", () => {
  it("não engole a cota vertical quando a horizontal tem os mesmos números", () => {
    // (0,50)→(100,50) e (50,0)→(50,100): a chave antiga ([...].sort()) era igual.
    const cena: Cena = {
      sala: { largura_cm: 1000, profundidade_cm: 1000 },
      itens: [
        item({ id: "a", x_cm: 100, y_cm: 40, w_cm: 100, h_cm: 20 }),
        item({ id: "b", x_cm: 40, y_cm: 100, w_cm: 20, h_cm: 100 }),
      ],
    };
    const cotas = gerarCotasAutomaticas(cena);
    const temHoriz = cotas.some((c) => c.y1 === 50 && c.y2 === 50 && c.x1 === 0 && c.x2 === 100);
    const temVert = cotas.some((c) => c.x1 === 50 && c.x2 === 50 && c.y1 === 0 && c.y2 === 100);
    expect(temHoriz).toBe(true);
    expect(temVert).toBe(true);
  });
});

describe("validação considera a rotação", () => {
  it("item a 90° fora do corredor não é marcado como corredor", () => {
    // Corpo cru: x 600–800 (invadiria o corredor 750–850).
    // AABB girado: x 680–720 (não invade — é o que se vê na tela).
    const cena: Cena = {
      sala: { largura_cm: 1000, profundidade_cm: 1000, config: { corredor: { x: 750, w: 100 } } },
      itens: [item({ id: "a", x_cm: 600, y_cm: 100, w_cm: 200, h_cm: 40, rotacao: 90 })],
    };
    expect(problemasDaCena(cena).a).toBeNull();
  });

  it("margem frontal acompanha o giro do equipamento (aviso de uso)", () => {
    // Esteira a 90°: a folga frontal de 100 cm passa a se estender no eixo X.
    // Na conta antiga (margem no eixo do mundo) o vizinho da direita não era visto.
    const cena: Cena = {
      sala: { largura_cm: 1000, profundidade_cm: 1000 },
      itens: [
        item({ id: "a", x_cm: 100, y_cm: 300, w_cm: 200, h_cm: 50, rotacao: 90, uso_frontal_cm: 100 }),
        item({ id: "b", x_cm: 300, y_cm: 300, w_cm: 50, h_cm: 50 }),
      ],
    };
    const p = problemasDaCena(cena);
    expect(p.a).toBe("uso");
    expect(p.b).toBe("uso");
  });

  it("mobiliário girado colide pelo retângulo que aparece na tela", () => {
    // Armário 200×40 a 90°: AABB vira 40×200 (x 180–220). O item em x 300–400
    // NÃO encosta nele — o retângulo cru (100–300) acusava colisão fantasma.
    const cena: Cena = {
      sala: { largura_cm: 1000, profundidade_cm: 1000 },
      itens: [item({ id: "a", x_cm: 300, y_cm: 100, w_cm: 100, h_cm: 100 })],
      infra: [{ id: "m", tipo: "armario", nome: "Armário", x_cm: 100, y_cm: 130, w_cm: 200, h_cm: 40, rotacao: 90 }],
    };
    expect(problemasDaCena(cena).a).toBeNull();
  });
});

describe("progresso de fase enxerga planta vetorial", () => {
  it("DXF importado deixa a fase Projeto 'em andamento'", () => {
    const fase = FASES.find((f) => f.id === "projeto")!;
    const projeto = {
      cena: {
        sala: { largura_cm: 1000, profundidade_cm: 800 },
        itens: [],
        plantaVetorial: plantaVetorialDe([[0, 0, 100, 0]]),
      },
    } as unknown as Projeto;
    expect(statusDaFase(fase, projeto)).toBe("andamento");
  });
});
