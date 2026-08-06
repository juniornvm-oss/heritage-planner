// Testes do resolvedor de snap. Aqui erro não aparece como número errado no
// papel: aparece como peça 3 cm fora do lugar que o consultor só descobre na
// obra, com o equipamento já entregue. `npm test`.
import { describe, it, expect } from "vitest";
import type { AreaAcabamento, AreaFuncional, Cena, ItemInfraestrutura, ItemPosicionado, Parede } from "./types";
import {
  aabbDoItem, folgaAte, obstaculosDaCena, resolverSnapItem, resolverSnapPonto,
  tolCmPorZoom, TOL_DESENHO_PX, TOL_ITEM_PX, type AlvoSnap, type CtxSnap, type Eixo,
} from "./snap";

// Sala de 10 × 8 m: centro em (500, 400), bem longe dos números usados nos
// testes — alinhamento com a sala é real e atrapalharia a leitura do que cada
// caso está de fato medindo.
const sala = () => ({ largura_cm: 1000, profundidade_cm: 800 });

const item = (p: Partial<ItemPosicionado> & { id: string }): ItemPosicionado => ({
  nome: "Aparelho", x_cm: 0, y_cm: 0, w_cm: 100, h_cm: 100, rotacao: 0,
  zona: "forca", cenario: "balanceado", preco: 0, ...p,
});

const parede = (id: string, x1: number, y1: number, x2: number, y2: number, espessura_cm = 15): Parede =>
  ({ id, x1, y1, x2, y2, espessura_cm });

const area = (id: string, pontos: { x: number; y: number }[]): AreaFuncional => ({
  id, tipo: "cardio", pontos,
  x_cm: Math.min(...pontos.map((p) => p.x)), y_cm: Math.min(...pontos.map((p) => p.y)),
  w_cm: Math.max(...pontos.map((p) => p.x)) - Math.min(...pontos.map((p) => p.x)),
  h_cm: Math.max(...pontos.map((p) => p.y)) - Math.min(...pontos.map((p) => p.y)),
});

const acabamento = (id: string, pontos: { x: number; y: number }[]): AreaAcabamento => ({
  id, nome: "Piso", tipo: "piso", cor: "#888", pontos,
  x_cm: 0, y_cm: 0, w_cm: 0, h_cm: 0,
});

const infra = (p: Partial<ItemInfraestrutura> & { id: string }): ItemInfraestrutura => ({
  tipo: "banco", nome: "Banco", x_cm: 0, y_cm: 0, w_cm: 100, h_cm: 40, rotacao: 0, ...p,
});

const cena = (extra: Partial<Cena> = {}): Cena => ({ sala: sala(), planta: null, itens: [], ...extra });

/** Contexto de desenho: ímã largo (14 px), grade de 5 cm, zoom 1 → 14 cm. */
const ctxDesenho = (c: Cena, extra: Partial<CtxSnap> = {}): CtxSnap =>
  ({ cena: c, passoGrade: 5, tolCm: 10, ...extra });

/** Contexto de arraste: ímã apertado. */
const ctxItem = (c: Cena, extra: Partial<CtxSnap> = {}): CtxSnap =>
  ({ cena: c, passoGrade: 5, tolCm: 8, ...extra });

const doEixo = (alvos: AlvoSnap[], eixo: Eixo) => alvos.find((a) => a.eixo === eixo);

describe("tolerância a partir do zoom", () => {
  it("o ímã mede o mesmo NA TELA em qualquer zoom", () => {
    // Zoom 1 px/cm: 14 px = 14 cm. Zoom 2 (aproximado): os mesmos 14 px valem
    // 7 cm de mundo — é o que impede o ímã de engolir meia sala afastado.
    expect(tolCmPorZoom(TOL_DESENHO_PX, 1)).toBe(14);
    expect(tolCmPorZoom(TOL_DESENHO_PX, 2)).toBe(7);
    expect(tolCmPorZoom(TOL_ITEM_PX, 0.5)).toBe(16);
  });
});

describe("snap de ponto — vértices", () => {
  it("encaixa na ponta da parede", () => {
    const c = cena({ estrutura: { paredes: [parede("p1", 100, 100, 500, 100)], aberturas: [], pilares: [] } });
    const r = resolverSnapPonto({ x: 104, y: 97 }, ctxDesenho(c));
    expect(r.p).toEqual({ x: 100, y: 100 });
    expect(r.alvos).toHaveLength(1);
    expect(r.alvos[0].tipo).toBe("vertice");
    expect(r.alvos[0].eixo).toBe("xy");
    expect(r.alvos[0].dist).toBeCloseTo(5, 6);
  });

  it("o vértice ganha da linha da parede, mesmo com a linha mais perto", () => {
    // Ponto a 1 cm da linha e a 6 cm da ponta: quem encosta na quina quer a
    // quina — a linha resolveria com menos movimento e faria a fresta.
    const c = cena({ estrutura: { paredes: [parede("p1", 100, 100, 500, 100)], aberturas: [], pilares: [] } });
    const r = resolverSnapPonto({ x: 106, y: 101 }, ctxDesenho(c));
    expect(r.p).toEqual({ x: 100, y: 100 });
    expect(r.alvos[0].tipo).toBe("vertice");
  });

  it("vértice de ÁREA FUNCIONAL também é ímã (antes ficava de fora)", () => {
    const c = cena({ areas: [area("a1", [{ x: 600, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 300 }, { x: 600, y: 300 }])] });
    expect(resolverSnapPonto({ x: 603, y: 203 }, ctxDesenho(c)).p).toEqual({ x: 600, y: 200 });
  });

  it("vértice de área de acabamento continua valendo", () => {
    const c = cena({ acabamentos: [acabamento("ac1", [{ x: 620, y: 240 }, { x: 700, y: 240 }, { x: 700, y: 300 }])] });
    expect(resolverSnapPonto({ x: 618, y: 243 }, ctxDesenho(c)).p).toEqual({ x: 620, y: 240 });
  });

  it("ignora o vértice que está sendo arrastado", () => {
    // Durante o arraste a cena já guarda o ponto na posição do dedo; sem a
    // exclusão o ímã acha a si próprio a 0 cm e a grade nunca roda.
    const pts = [{ x: 603, y: 203 }, { x: 700, y: 200 }, { x: 700, y: 300 }];
    const c = cena({ acabamentos: [acabamento("ac1", pts)] });
    expect(resolverSnapPonto({ x: 603, y: 203 }, ctxDesenho(c)).p).toEqual({ x: 603, y: 203 });
    const r = resolverSnapPonto({ x: 603, y: 203 }, ctxDesenho(c, { ignorarPonto: { x: 603, y: 203 } }));
    expect(r.p).toEqual({ x: 605, y: 205 });
    expect(r.alvos.every((a) => a.tipo === "grade")).toBe(true);
  });
});

describe("snap de ponto — linha da parede", () => {
  it("cola na parede horizontal e manda o eixo livre para a grade", () => {
    const c = cena({ estrutura: { paredes: [parede("p1", 100, 100, 500, 100)], aberturas: [], pilares: [] } });
    const r = resolverSnapPonto({ x: 302, y: 104 }, ctxDesenho(c));
    expect(r.p).toEqual({ x: 300, y: 100 });
    const naParede = doEixo(r.alvos, "y");
    expect(naParede?.tipo).toBe("parede");
    expect(naParede?.valor).toBe(100);
    expect(naParede?.contraId).toBe("p1");
    expect(naParede?.linha).toEqual([{ x: 100, y: 100 }, { x: 500, y: 100 }]);
    expect(doEixo(r.alvos, "x")).toMatchObject({ tipo: "grade", valor: 300 });
  });

  it("parede vertical trava só o X", () => {
    const c = cena({ estrutura: { paredes: [parede("p1", 100, 100, 100, 500)], aberturas: [], pilares: [] } });
    const r = resolverSnapPonto({ x: 104, y: 302 }, ctxDesenho(c));
    expect(r.p).toEqual({ x: 100, y: 300 });
    expect(doEixo(r.alvos, "x")?.tipo).toBe("parede");
    expect(doEixo(r.alvos, "y")?.tipo).toBe("grade");
  });

  it("parede diagonal trava os dois eixos sobre a linha", () => {
    // Sem eixo a liberar: arredondar qualquer coordenada tiraria o ponto de
    // cima da parede, que é justamente o que o encaixe prometeu.
    const c = cena({ estrutura: { paredes: [parede("p1", 0, 0, 1000, 1000)], aberturas: [], pilares: [] } });
    const r = resolverSnapPonto({ x: 402, y: 398 }, ctxDesenho(c));
    expect(r.p.x).toBeCloseTo(400, 6);
    expect(r.p.y).toBeCloseTo(400, 6);
    expect(r.alvos).toHaveLength(1);
    expect(r.alvos[0]).toMatchObject({ tipo: "parede", eixo: "xy" });
  });

  it("longe de tudo, cai na grade — e no milímetro quando a grade está desligada", () => {
    const c = cena();
    const naGrade = resolverSnapPonto({ x: 302.4, y: 197.6 }, ctxDesenho(c));
    expect(naGrade.p).toEqual({ x: 300, y: 200 });
    expect(naGrade.alvos.map((a) => a.tipo)).toEqual(["grade", "grade"]);

    const solto = resolverSnapPonto({ x: 12.3456, y: 7.8912 }, ctxDesenho(c, { passoGrade: 0 }));
    expect(solto.p).toEqual({ x: 12.3, y: 7.9 });
    expect(solto.alvos).toHaveLength(0);
  });
});

describe("snap de item — alinhamento com o vizinho", () => {
  const vizinho = item({ id: "a", x_cm: 200, y_cm: 600, w_cm: 100, h_cm: 60 });

  it("alinha borda com borda", () => {
    // Borda esquerda do arrastado a 3 cm da borda direita do vizinho.
    const r = resolverSnapItem({ x_cm: 303, y_cm: 700, w_cm: 100, h_cm: 60 }, ctxItem(cena({ itens: [vizinho] })));
    expect(r.dx).toBeCloseTo(-3, 6);
    const gx = doEixo(r.alvos, "x");
    expect(gx).toMatchObject({ tipo: "bordaX", valor: 300, contraId: "a", contraRotulo: "Aparelho" });
    // A guia cobre os dois corpos, para o consultor ver o que alinhou com o quê.
    expect(gx?.linha).toEqual([{ x: 300, y: 600 }, { x: 300, y: 760 }]);
    // Nada perto no outro eixo: grade, e uma guia por eixo, no máximo.
    expect(doEixo(r.alvos, "y")?.tipo).toBe("grade");
    expect(r.dy).toBeCloseTo(0, 6);
    expect(r.alvos).toHaveLength(2);
  });

  it("alinha centro com centro, e o centro ganha o empate contra a borda", () => {
    // Centro a 1 cm do centro do vizinho E borda a 1 cm da borda dele: mesmo
    // deslocamento, intenções diferentes. Centro é o alinhamento que se lê na
    // planta (bateria de máquinas), então ele vence.
    const r = resolverSnapItem({ x_cm: 199, y_cm: 700, w_cm: 104, h_cm: 60 }, ctxItem(cena({ itens: [vizinho] })));
    expect(r.dx).toBeCloseTo(-1, 6);
    expect(doEixo(r.alvos, "x")).toMatchObject({ tipo: "centroX", valor: 250, contraId: "a" });
  });

  it("alinha no eixo Y contra mobiliário", () => {
    const c = cena({ infra: [infra({ id: "m1", nome: "Bebedouro", x_cm: 700, y_cm: 300, w_cm: 60, h_cm: 40 })] });
    const r = resolverSnapItem({ x_cm: 100, y_cm: 296, w_cm: 100, h_cm: 60 }, ctxItem(c));
    expect(r.dy).toBeCloseTo(4, 6);
    expect(doEixo(r.alvos, "y")).toMatchObject({ tipo: "bordaY", valor: 300, contraId: "m1", contraRotulo: "Bebedouro" });
  });

  it("longe de tudo, cai na grade nos dois eixos", () => {
    const r = resolverSnapItem({ x_cm: 123.4, y_cm: 217.6, w_cm: 100, h_cm: 60 }, ctxItem(cena()));
    expect(r.dx).toBeCloseTo(1.6, 6);
    expect(r.dy).toBeCloseTo(2.4, 6);
    expect(r.alvos.map((a) => a.tipo)).toEqual(["grade", "grade"]);
    expect(doEixo(r.alvos, "x")).toMatchObject({ valor: 125 });
    expect(doEixo(r.alvos, "y")).toMatchObject({ valor: 220 });
  });

  it("respeita ignorarId: o item arrastado não se alinha consigo mesmo", () => {
    const c = cena({ itens: [vizinho] });
    const bbox = { x_cm: 203, y_cm: 600, w_cm: 100, h_cm: 60 };
    // Sem ignorar, a peça é puxada de volta para a própria posição gravada.
    expect(resolverSnapItem(bbox, ctxItem(c)).dx).toBeCloseTo(-3, 6);
    const r = resolverSnapItem(bbox, ctxItem(c, { ignorarId: "a" }));
    expect(r.dx).toBeCloseTo(2, 6); // 203 → 205, grade
    expect(r.alvos.every((a) => a.tipo === "grade")).toBe(true);
  });

  it("alinha com a face da parede e com o eixo da sala", () => {
    // Parede horizontal em y=0 com 15 cm: a face interna fica em 7,5.
    const c = cena({ estrutura: { paredes: [parede("p1", 0, 0, 1000, 0)], aberturas: [], pilares: [] } });
    const encostado = resolverSnapItem({ x_cm: 400, y_cm: 11, w_cm: 100, h_cm: 60 }, ctxItem(c));
    expect(encostado.dy).toBeCloseTo(-3.5, 6);
    expect(doEixo(encostado.alvos, "y")).toMatchObject({ tipo: "bordaY", contraId: "p1", contraRotulo: "Parede" });

    // Centro da sala (500) contra o centro do item.
    const centrado = resolverSnapItem({ x_cm: 448, y_cm: 300, w_cm: 100, h_cm: 60 }, ctxItem(cena()));
    expect(centrado.dx).toBeCloseTo(2, 6);
    expect(doEixo(centrado.alvos, "x")).toMatchObject({ tipo: "centroX", valor: 500, contraId: "sala" });
  });
});

describe("AABB de item girado", () => {
  it("a 90° o envelope troca largura por profundidade", () => {
    const bb = aabbDoItem(item({ id: "r", x_cm: 0, y_cm: 0, w_cm: 200, h_cm: 100, rotacao: 90 }));
    expect(bb.w_cm).toBeCloseTo(100, 6);
    expect(bb.h_cm).toBeCloseTo(200, 6);
    // Gira em torno do CENTRO (100, 50), não do canto.
    expect(bb.x_cm).toBeCloseTo(50, 6);
    expect(bb.y_cm).toBeCloseTo(-50, 6);
  });

  it("o item girado alinha pela borda que aparece na tela", () => {
    // Corpo 200 × 100 a 90°: envelope de 100 × 200, borda direita em 297.
    // Vizinho com borda esquerda em 300 → encaixe de 3 cm. Se o resolvedor
    // usasse o retângulo NÃO girado (bordas 147/247/347), o mesmo arraste
    // andaria −7 cm, para um alinhamento invisível na planta.
    const girado = item({ id: "r", x_cm: 147, y_cm: 600, w_cm: 200, h_cm: 100, rotacao: 90 });
    const c = cena({ itens: [girado, item({ id: "a", x_cm: 300, y_cm: 600, w_cm: 80, h_cm: 60 })] });
    const r = resolverSnapItem(aabbDoItem(girado), ctxItem(c, { ignorarId: "r" }));
    expect(r.dx).toBeCloseTo(3, 6);
    expect(doEixo(r.alvos, "x")).toMatchObject({ tipo: "bordaX", valor: 300, contraId: "a" });
  });

  it("obstáculos da cena saem com o envelope girado, não com o retângulo cru", () => {
    const c = cena({ itens: [item({ id: "r", x_cm: 0, y_cm: 0, w_cm: 200, h_cm: 100, rotacao: 90 })] });
    const o = obstaculosDaCena(c).find((x) => x.id === "r");
    expect(o?.tipo).toBe("equipamento");
    expect(o?.rect.w_cm).toBeCloseTo(100, 6);
    expect(o?.rect.h_cm).toBeCloseTo(200, 6);
  });
});

describe("cota viva (folgas)", () => {
  it("mede o vão livre até o vizinho e até os limites da sala", () => {
    const c = cena({ itens: [item({ id: "a", x_cm: 200, y_cm: 600, w_cm: 100, h_cm: 60 })] });
    const f = folgaAte({ x_cm: 400, y_cm: 610, w_cm: 100, h_cm: 40 }, ctxItem(c));
    expect(f.map((x) => x.dir)).toEqual(["esq", "baixo", "dir", "cima"]); // do mais apertado ao mais largo
    expect(f[0]).toMatchObject({ dir: "esq", cm: 100, contraId: "a" });
    expect(f[0].linha).toEqual([{ x: 300, y: 630 }, { x: 400, y: 630 }]);
    expect(f.find((x) => x.dir === "baixo")).toMatchObject({ cm: 150, contraId: "sala" });
    expect(f.find((x) => x.dir === "dir")).toMatchObject({ cm: 500, contraId: "sala" });
  });

  it("vizinho que não está de frente não vira folga", () => {
    // Vizinho encostado só pela quina (2 cm de sobreposição em Y): a distância
    // até ele não é passagem — dá a volta andando.
    const c = cena({ itens: [item({ id: "a", x_cm: 200, y_cm: 552, w_cm: 100, h_cm: 60 })] });
    const f = folgaAte({ x_cm: 400, y_cm: 610, w_cm: 100, h_cm: 40 }, ctxItem(c));
    expect(f.find((x) => x.dir === "esq")).toMatchObject({ cm: 400, contraId: "sala" });
  });

  it("ignora o próprio item arrastado", () => {
    const c = cena({ itens: [item({ id: "a", x_cm: 400, y_cm: 610, w_cm: 100, h_cm: 40 })] });
    const f = folgaAte({ x_cm: 400, y_cm: 610, w_cm: 100, h_cm: 40 }, ctxItem(c, { ignorarId: "a" }));
    expect(f.every((x) => x.contraId === "sala")).toBe(true);
    expect(f.find((x) => x.dir === "esq")?.cm).toBe(400);
  });
});
