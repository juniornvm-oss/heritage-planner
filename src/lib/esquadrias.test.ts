// Testes das esquadrias. O erro aqui não aparece como pixel torto: aparece
// como porta que bate no equipamento na obra, espelho de 40 kg arrancando a
// chapa de drywall, ou quadro de esquadrias com o vão errado no orçamento do
// serralheiro. `npm test`.
import { describe, it, expect } from "vitest";
import type { Abertura, EstruturaPlanta, Parede, PilarPlanta } from "./types";
import {
  PORTAS, JANELAS, PAREDES, avaliarFixacao, centroDaEstrutura, contornoPilar,
  defParede, eixoDaParede, fichaAbertura, medidaEsquadria, modeloDaAbertura,
  quadroDeEsquadrias, setoresGiro, simboloAbertura,
} from "./esquadrias";
import { areaPoligonoCm2, convexoTocaRetangulo, pontoNoPoligono } from "./geometria";

// Sala de 10 × 8 m fechada por quatro paredes; centro em (500, 400).
const parede = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Parede> = {}): Parede =>
  ({ id, x1, y1, x2, y2, espessura_cm: 15, ...extra });

const SALA: Parede[] = [
  parede("topo", 0, 0, 1000, 0),
  parede("dir", 1000, 0, 1000, 800),
  parede("base", 1000, 800, 0, 800),
  parede("esq", 0, 800, 0, 0),
];

const centro = { x: 500, y: 400 };

const abertura = (p: Partial<Abertura> = {}): Abertura => ({
  id: "a1", paredeId: "topo", centro_cm: 500, largura_cm: 90, tipo: "porta", ...p,
});

const est = (p: Partial<EstruturaPlanta> = {}): EstruturaPlanta =>
  ({ paredes: SALA, aberturas: [], pilares: [], ...p });

describe("eixo da parede e o lado de dentro", () => {
  it("aponta a normal para o interior, seja qual for o sentido do traço", () => {
    // A parede do topo foi desenhada da esquerda para a direita e a da base da
    // direita para a esquerda: sem a correção pelo centro, uma abriria para
    // dentro e a outra para fora com a MESMA configuração.
    const topo = eixoDaParede(SALA[0], centro);
    const base = eixoDaParede(SALA[2], centro);
    expect(topo.ny).toBeGreaterThan(0); // do topo, "dentro" é para baixo
    expect(base.ny).toBeLessThan(0);    // da base, "dentro" é para cima
    const esq = eixoDaParede(SALA[3], centro);
    expect(esq.nx).toBeGreaterThan(0);  // da esquerda, "dentro" é para a direita
  });

  it("mede o comprimento e o unitário da parede", () => {
    const e = eixoDaParede(SALA[1], centro);
    expect(e.comprimento).toBe(800);
    expect(e.ux).toBeCloseTo(0);
    expect(e.uy).toBeCloseTo(1);
  });

  it("cai no fallback quando ainda não há parede desenhada", () => {
    expect(centroDaEstrutura(null, { x: 7, y: 9 })).toEqual({ x: 7, y: 9 });
    expect(centroDaEstrutura(est(), { x: 0, y: 0 })).toEqual({ x: 500, y: 400 });
  });
});

describe("setor de varredura da folha", () => {
  it("a porta de giro varre um quarto de círculo do tamanho do vão", () => {
    const s = setoresGiro(abertura({ largura_cm: 90 }), SALA[0], centro);
    expect(s).toHaveLength(1);
    // Setor de 90° e raio 90 → π·90²/4 ≈ 6362 cm². A poligonal de 12 lados
    // inscreve um pouco menos; 3% de folga cobre a discretização.
    const esperado = (Math.PI * 90 * 90) / 4;
    expect(areaPoligonoCm2(s[0])).toBeGreaterThan(esperado * 0.97);
    expect(areaPoligonoCm2(s[0])).toBeLessThanOrEqual(esperado);
  });

  it("varre para DENTRO da sala, não para fora", () => {
    const s = setoresGiro(abertura({ sentido: "dentro" }), SALA[0], centro);
    // Um ponto logo abaixo do vão (dentro da sala) tem de estar no setor.
    expect(pontoNoPoligono({ x: 480, y: 30 }, s[0])).toBe(true);
    // E o espelhado, fora da sala, não.
    expect(pontoNoPoligono({ x: 480, y: -30 }, s[0])).toBe(false);
  });

  it("inverte o setor quando a porta abre para fora", () => {
    const s = setoresGiro(abertura({ sentido: "fora" }), SALA[0], centro);
    expect(pontoNoPoligono({ x: 480, y: -30 }, s[0])).toBe(true);
    expect(pontoNoPoligono({ x: 480, y: 30 }, s[0])).toBe(false);
  });

  it("a dobradiça troca de ombreira com o lado", () => {
    const dir = setoresGiro(abertura({ lado: "direita" }), SALA[0], centro)[0];
    const esq = setoresGiro(abertura({ lado: "esquerda" }), SALA[0], centro)[0];
    // Ombreira esquerda = x 455, direita = x 545 (vão de 90 centrado em 500).
    expect(esq[0].x).toBeCloseTo(455);
    expect(dir[0].x).toBeCloseTo(545);
  });

  it("porta de correr, sanfonada e vão livre não varrem piso nenhum", () => {
    for (const modelo of ["correr", "correr_dupla", "sanfonada", "vao"] as const) {
      expect(setoresGiro(abertura({ modelo }), SALA[0], centro)).toEqual([]);
    }
  });

  it("a porta dupla varre dois setores de meia folha cada", () => {
    const s = setoresGiro(abertura({ modelo: "dupla", largura_cm: 160 }), SALA[0], centro);
    expect(s).toHaveLength(2);
    const esperado = (Math.PI * 80 * 80) / 4;
    for (const setor of s) expect(areaPoligonoCm2(setor)).toBeGreaterThan(esperado * 0.97);
  });

  it("o vaivém varre um setor inteiro de cada lado da parede", () => {
    const s = setoresGiro(abertura({ modelo: "vaivem" }), SALA[0], centro);
    expect(s).toHaveLength(2);
    expect(s.some((p) => pontoNoPoligono({ x: 500, y: 20 }, p))).toBe(true);
    expect(s.some((p) => pontoNoPoligono({ x: 500, y: -20 }, p))).toBe(true);
  });

  it("a pivotante varre 80% para um lado e 20% para o outro", () => {
    // Dobradiça à direita (padrão): eixo recuado 20% do vão a partir da
    // ombreira direita (545) → x 527.
    const s = setoresGiro(abertura({ modelo: "pivotante", largura_cm: 90 }), SALA[0], centro);
    expect(s).toHaveLength(2);
    const grande = s.find((p) => pontoNoPoligono({ x: 500, y: 20 }, p));
    const pequeno = s.find((p) => pontoNoPoligono({ x: 535, y: -8 }, p));
    expect(grande).toBeDefined();
    expect(pequeno).toBeDefined();
    expect(grande).not.toBe(pequeno);
    // A aba menor não pode alcançar o que a folha grande alcança.
    expect(pontoNoPoligono({ x: 500, y: -20 }, pequeno!)).toBe(false);
  });

  it("a pivotante respeita a ombreira escolhida", () => {
    // O controle de dobradiça aparece para a pivotante (temLado) e o quadro de
    // esquadrias imprime o valor: o eixo tem de segui-lo, e não ficar preso na
    // ombreira do início da parede.
    const eixoX = (lado: "esquerda" | "direita") =>
      setoresGiro(abertura({ modelo: "pivotante", largura_cm: 90, lado }), SALA[0], centro)[0][0].x;
    expect(eixoX("esquerda")).toBeCloseTo(455 + 18);
    expect(eixoX("direita")).toBeCloseTo(545 - 18);
  });

  it("janela nunca varre piso", () => {
    expect(setoresGiro(abertura({ tipo: "janela", modelo: "folhas" }), SALA[0], centro)).toEqual([]);
  });

  it("acompanha a parede inclinada", () => {
    const diagonal = parede("d", 0, 0, 300, 400); // comprimento 500
    const s = setoresGiro(abertura({ paredeId: "d", centro_cm: 250, largura_cm: 100 }), diagonal, { x: 400, y: 0 });
    expect(s).toHaveLength(1);
    const esperado = (Math.PI * 100 * 100) / 4;
    expect(areaPoligonoCm2(s[0])).toBeGreaterThan(esperado * 0.97);
  });
});

describe("símbolo de planta", () => {
  it("o vão vai de ombreira a ombreira, centrado", () => {
    const s = simboloAbertura(abertura({ centro_cm: 200, largura_cm: 90 }), SALA[0], centro);
    expect(s.vao[0].x).toBeCloseTo(155);
    expect(s.vao[1].x).toBeCloseTo(245);
  });

  it("cada modelo de porta desenha um símbolo diferente", () => {
    const assinatura = (modelo: Abertura["modelo"]) => {
      const s = simboloAbertura(abertura({ modelo }), SALA[0], centro);
      return [s.cheias.length, s.finas.length, s.tracejadas.length, s.setas.length].join("/");
    };
    const vistos = new Set([
      assinatura("giro"), assinatura("dupla"), assinatura("correr"),
      assinatura("correr_dupla"), assinatura("sanfonada"), assinatura("pivotante"),
      assinatura("vaivem"), assinatura("vao"),
    ]);
    // Oito modelos, pelo menos seis desenhos distinguíveis só pela contagem de
    // traços — o resto se distingue pela geometria.
    expect(vistos.size).toBeGreaterThanOrEqual(6);
  });

  it("a folha da porta de giro tem o comprimento do vão e sai perpendicular", () => {
    const s = simboloAbertura(abertura({ largura_cm: 90, lado: "direita", sentido: "dentro" }), SALA[0], centro);
    const folha = s.cheias[0];
    const [x1, y1, x2, y2] = folha;
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(90);
    expect(x1).toBeCloseTo(545); // pivô na ombreira direita
    expect(y2).toBeCloseTo(90);  // aberta para dentro (eixo y cresce para baixo)
  });

  it("a janela sempre mostra as duas linhas de vidro", () => {
    for (const modelo of Object.keys(JANELAS) as (keyof typeof JANELAS)[]) {
      const s = simboloAbertura(abertura({ tipo: "janela", modelo }), SALA[0], centro);
      expect(s.finas.length).toBeGreaterThanOrEqual(4); // 2 ombreiras + 2 vidros
    }
  });

  it("basculante e maxim-ar projetam para FORA da sala", () => {
    for (const modelo of ["basculante", "maxim_ar"] as const) {
      const s = simboloAbertura(abertura({ tipo: "janela", modelo }), SALA[0], centro);
      const ys = s.tracejadas.flat().filter((_, i) => i % 2 === 1);
      expect(Math.min(...ys)).toBeLessThan(0); // avança para y negativo
    }
  });

  it("não devolve NaN em nenhum traço, para nenhum modelo", () => {
    const todos: Abertura[] = [
      ...Object.keys(PORTAS).map((m) => abertura({ modelo: m as never })),
      ...Object.keys(JANELAS).map((m) => abertura({ tipo: "janela", modelo: m as never })),
    ];
    for (const ab of todos) {
      for (const w of SALA) {
        const s = simboloAbertura(ab, w, centro);
        const nums = [...s.cheias, ...s.finas, ...s.tracejadas, ...s.setas].flat();
        expect(nums.every(Number.isFinite)).toBe(true);
      }
    }
  });
});

describe("resolução de dados antigos", () => {
  it("abertura sem modelo cai no padrão da família", () => {
    expect(modeloDaAbertura(abertura())).toBe("giro");
    expect(modeloDaAbertura(abertura({ tipo: "janela" }))).toBe("correr");
  });

  it("porta convertida em janela não mantém um modelo impossível", () => {
    // O consultor trocou o tipo na barra de propriedades e o `modelo` ficou
    // para trás: "giro" não existe no catálogo de janelas.
    expect(modeloDaAbertura(abertura({ tipo: "janela", modelo: "giro" as never }))).toBe("correr");
  });

  it("a ficha herda medidas do modelo e respeita a sobrescrita", () => {
    const padrao = fichaAbertura(abertura({ tipo: "janela", modelo: "basculante" }));
    expect(padrao.altura_cm).toBe(JANELAS.basculante.altura_cm);
    expect(padrao.peitoril_cm).toBe(JANELAS.basculante.peitoril_cm);
    const custom = fichaAbertura(abertura({ tipo: "janela", modelo: "basculante", altura_cm: 45, peitoril_cm: 180 }));
    expect(custom.altura_cm).toBe(45);
    expect(custom.peitoril_cm).toBe(180);
  });

  it("porta não tem peitoril", () => {
    expect(fichaAbertura(abertura()).peitoril_cm).toBeNull();
  });

  it("parede sem material é alvenaria ½ vez", () => {
    expect(defParede(undefined)).toBe(PAREDES.alvenaria);
    expect(defParede("drywall")).toBe(PAREDES.drywall);
  });
});

describe("fixação na parede", () => {
  it("alvenaria e concreto recebem qualquer coisa", () => {
    expect(avaliarFixacao("alvenaria", "espelho").ok).toBe(true);
    expect(avaliarFixacao("concreto", "espaldar").ok).toBe(true);
  });

  it("drywall sem reforço reprova elemento pesado e aprova o leve", () => {
    expect(avaliarFixacao("drywall", "espelho").ok).toBe(false);
    expect(avaliarFixacao("drywall", "espelho").nivel).toBe("requer_reforco");
    expect(avaliarFixacao("drywall", "tomada").ok).toBe(true);
  });

  it("drywall com reforço previsto passa", () => {
    expect(avaliarFixacao("drywall", "espelho", true).ok).toBe(true);
  });

  it("vidro não recebe carga nem com reforço", () => {
    expect(avaliarFixacao("vidro", "tv", true).ok).toBe(false);
    expect(avaliarFixacao("vidro", "tv").nivel).toBe("nao_recebe");
  });

  it("o ar-condicionado conta como carga pesada", () => {
    expect(avaliarFixacao("drywall", "ar").ok).toBe(false);
  });
});

describe("quadro de esquadrias", () => {
  const j = (p: Partial<Abertura>): Abertura => abertura({ tipo: "janela", modelo: "correr", ...p });

  it("agrupa esquadrias idênticas e conta a quantidade", () => {
    const q = quadroDeEsquadrias(est({
      aberturas: [
        abertura({ id: "1", largura_cm: 90 }),
        abertura({ id: "2", largura_cm: 90, centro_cm: 300 }),
        abertura({ id: "3", largura_cm: 160, modelo: "dupla" }),
      ],
    }));
    expect(q).toHaveLength(2);
    expect(q[0]).toMatchObject({ codigo: "P1", qtd: 2, largura_cm: 90 });
    expect(q[1]).toMatchObject({ codigo: "P2", qtd: 1, largura_cm: 160 });
  });

  it("numera portas e janelas em séries separadas", () => {
    const q = quadroDeEsquadrias(est({
      aberturas: [j({ id: "1" }), abertura({ id: "2" }), j({ id: "3", largura_cm: 200 })],
    }));
    expect(q.map((l) => l.codigo)).toEqual(["P1", "J1", "J2"]);
  });

  it("não agrupa esquadria igual em parede de material diferente", () => {
    const q = quadroDeEsquadrias({
      paredes: [parede("a", 0, 0, 500, 0, { material: "alvenaria" }), parede("b", 0, 800, 500, 800, { material: "drywall" })],
      aberturas: [abertura({ id: "1", paredeId: "a" }), abertura({ id: "2", paredeId: "b" })],
      pilares: [],
    });
    expect(q).toHaveLength(2);
    expect(q.map((l) => l.parede)).toEqual([PAREDES.alvenaria.label, PAREDES.drywall.label]);
  });

  it("anota o vão fora do mínimo de acessibilidade", () => {
    const q = quadroDeEsquadrias(est({ aberturas: [abertura({ largura_cm: 70 })] }));
    expect(q[0].observacao).toContain("NBR 9050");
  });

  it("anota o sentido de abertura da porta e a forma da janela", () => {
    const q = quadroDeEsquadrias(est({
      aberturas: [
        abertura({ id: "1", lado: "esquerda", sentido: "fora" }),
        j({ id: "2", forma: "arco_pleno" }),
      ],
    }));
    expect(q[0].observacao).toContain("esquerda");
    expect(q[0].observacao).toContain("fora");
    expect(q[1].observacao).toContain("arco pleno");
  });

  it("é estável: a mesma estrutura em outra ordem gera os mesmos códigos", () => {
    const a = abertura({ id: "1", largura_cm: 90 });
    const b = abertura({ id: "2", largura_cm: 160, modelo: "dupla" });
    const c = j({ id: "3" });
    const q1 = quadroDeEsquadrias(est({ aberturas: [a, b, c] }));
    const q2 = quadroDeEsquadrias(est({ aberturas: [c, b, a] }));
    expect(q1).toEqual(q2);
  });

  it("estrutura sem abertura devolve quadro vazio", () => {
    expect(quadroDeEsquadrias(null)).toEqual([]);
    expect(quadroDeEsquadrias(est())).toEqual([]);
  });

  it("formata a medida como o quadro de projeto executivo", () => {
    expect(medidaEsquadria(90, 210)).toBe("0,90 × 2,10");
    expect(medidaEsquadria(160, 210)).toBe("1,60 × 2,10");
  });
});

describe("contorno do pilar", () => {
  const p = (extra: Partial<PilarPlanta> = {}): PilarPlanta =>
    ({ id: "p1", x_cm: 100, y_cm: 100, w_cm: 40, h_cm: 40, ...extra });

  it("retangular fecha nos quatro cantos", () => {
    expect(contornoPilar(p())).toEqual([100, 100, 140, 100, 140, 140, 100, 140]);
  });

  it("circular tem área de círculo, não de quadrado", () => {
    const pts = contornoPilar(p({ forma: "circular" }));
    const poly = [];
    for (let i = 0; i < pts.length; i += 2) poly.push({ x: pts[i], y: pts[i + 1] });
    expect(areaPoligonoCm2(poly)).toBeGreaterThan(Math.PI * 400 * 0.97);
    expect(areaPoligonoCm2(poly)).toBeLessThan(1600); // menor que o quadrado
  });

  it("em L tem seis vértices e área menor que o retângulo", () => {
    const pts = contornoPilar(p({ forma: "L" }));
    expect(pts).toHaveLength(12);
    const poly = [];
    for (let i = 0; i < pts.length; i += 2) poly.push({ x: pts[i], y: pts[i + 1] });
    expect(areaPoligonoCm2(poly)).toBeLessThan(1600);
  });
});

// A primitiva que dá utilidade ao setor: sem ela, "o equipamento invade o
// arco?" só teria resposta por bbox (27% de área falsa num quarto de círculo)
// ou por ponto central (perde a esteira que entra pela quina). Mora em
// `geometria.ts`, mas é testada aqui, junto de quem a usa.
describe("interseção convexo × retângulo", () => {
  // Quadrado de 100 × 100 na origem.
  const quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const ret = (x: number, y: number, w = 20, h = 20) => ({ x_cm: x, y_cm: y, w_cm: w, h_cm: h });

  it("acusa o retângulo dentro, encavalado e envolvente", () => {
    expect(convexoTocaRetangulo(quad, ret(40, 40))).toBe(true);
    expect(convexoTocaRetangulo(quad, ret(-10, 40))).toBe(true);
    expect(convexoTocaRetangulo(quad, ret(-50, -50, 300, 300))).toBe(true);
  });

  it("nega o retângulo separado, em qualquer direção", () => {
    for (const [x, y] of [[-40, 40], [140, 40], [40, -40], [40, 140], [-40, -40]]) {
      expect(convexoTocaRetangulo(quad, ret(x, y))).toBe(false);
    }
  });

  it("dois convexos que só encostam não se tocam", () => {
    expect(convexoTocaRetangulo(quad, ret(100, 40))).toBe(false);
    expect(convexoTocaRetangulo(quad, ret(99.9, 40))).toBe(true);
  });

  it("não confunde o BBOX do leque com o leque", () => {
    // Quarto de círculo de raio 90 com centro na origem, varrendo para +x/+y.
    // O canto (80,80) está DENTRO do bbox 90×90 e FORA do arco (dist 113).
    const setor = setoresGiro(
      abertura({ centro_cm: 45, largura_cm: 90, lado: "esquerda", sentido: "dentro" }),
      parede("w", 0, 0, 1000, 0), { x: 500, y: 500 },
    )[0];
    expect(convexoTocaRetangulo(setor, ret(20, 20, 10, 10))).toBe(true);   // dentro do arco
    expect(convexoTocaRetangulo(setor, ret(78, 78, 10, 10))).toBe(false);  // no bbox, fora do arco
  });

  it("polígono degenerado nunca toca nada", () => {
    expect(convexoTocaRetangulo([], ret(0, 0))).toBe(false);
    expect(convexoTocaRetangulo([{ x: 0, y: 0 }, { x: 1, y: 1 }], ret(0, 0))).toBe(false);
  });
});

// ── Casos que a revisão adversarial encontrou ──────────────────────────────
// Cada teste aqui é um defeito que compilava, passava nos outros testes e
// entregava a coisa errada ao consultor.

describe("o lado de dentro em planta que não é um retângulo", () => {
  // Sala em L: o "centro" (média dos pontos médios das paredes) cai FORA dela.
  //   (0,0)──(800,0)──(800,200)──(200,200)──(200,600)──(0,600)──(0,0)
  const L: Parede[] = [
    parede("a", 0, 0, 800, 0),
    parede("b", 800, 0, 800, 200),
    parede("c", 800, 200, 200, 200), // reentrante: o interior está ACIMA dela
    parede("d", 200, 200, 200, 600),
    parede("e", 200, 600, 0, 600),
    parede("f", 0, 600, 0, 0),
  ];
  const centroL = centroDaEstrutura({ paredes: L, aberturas: [], pilares: [] }, { x: 0, y: 0 });

  it("o centro do conjunto realmente cai fora da sala (a armadilha)", () => {
    const contorno = [
      { x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 200 },
      { x: 200, y: 200 }, { x: 200, y: 600 }, { x: 0, y: 600 },
    ];
    expect(pontoNoPoligono(centroL, contorno)).toBe(false);
  });

  it("com o contorno em mãos, a normal da parede reentrante aponta para dentro", () => {
    // Sem o contorno, o teste pelo centro devolve n=(0,+1) — para o vazio.
    expect(eixoDaParede(L[2], centroL).ny).toBeGreaterThan(0);
    // Com ele, aponta para y<200, que é onde a sala está.
    expect(eixoDaParede(L[2], centroL, L).ny).toBeLessThan(0);
  });

  it("e o setor de giro cai dentro da sala, onde o equipamento está", () => {
    const ab = abertura({ paredeId: "c", centro_cm: 300, largura_cm: 90, sentido: "dentro" });
    const s = setoresGiro(ab, L[2], centroL, L);
    // A parede c vai de (800,200) para (200,200): centro_cm 300 → x 500.
    // A esteira encostada nela pelo lado de dentro tem de estar no setor.
    expect(s.some((p) => pontoNoPoligono({ x: 500, y: 160 }, p))).toBe(true);
    expect(s.some((p) => pontoNoPoligono({ x: 500, y: 240 }, p))).toBe(false);
  });

  it("contorno aberto continua caindo no teste pelo centro", () => {
    // Três paredes soltas não fecham nada: a paridade não significaria nada.
    const soltas = [parede("x", 0, 0, 100, 0), parede("y", 300, 0, 400, 0), parede("z", 0, 300, 100, 300)];
    const c = centroDaEstrutura({ paredes: soltas, aberturas: [], pilares: [] }, { x: 0, y: 0 });
    expect(() => eixoDaParede(soltas[0], c, soltas)).not.toThrow();
  });
});

describe("paredes colineares não invertem com o sentido do traço", () => {
  it("duas paredes na mesma reta, desenhadas em sentidos opostos, concordam", () => {
    // O centro cai SOBRE a reta: o produto escalar dá zero e o desempate
    // costumava ficar por conta de qual ponta foi tocada primeiro.
    const a = parede("a", 0, 0, 500, 0);
    const b = parede("b", 1000, 0, 500, 0); // mesma reta, traço invertido
    const c = centroDaEstrutura({ paredes: [a, b], aberturas: [], pilares: [] }, { x: 500, y: 400 });
    const ea = eixoDaParede(a, c), eb = eixoDaParede(b, c);
    expect(Math.sign(ea.ny)).toBe(Math.sign(eb.ny));
  });
});

describe("quadro de esquadrias distingue o que é diferente", () => {
  const j = (p: Partial<Abertura>): Abertura => abertura({ tipo: "janela", modelo: "correr", ...p });

  it("portas de mãos opostas não viram uma linha só", () => {
    const q = quadroDeEsquadrias(est({
      aberturas: [
        abertura({ id: "1", centro_cm: 200, lado: "esquerda", sentido: "dentro" }),
        abertura({ id: "2", centro_cm: 700, lado: "direita", sentido: "fora" }),
      ],
    }));
    expect(q).toHaveLength(2);
    expect(q.map((l) => l.codigo)).toEqual(["P1", "P2"]);
    expect(q[0].observacao).toContain("esquerda");
    expect(q[1].observacao).toContain("direita");
  });

  it("a nota da segunda esquadria não é engolida pela primeira", () => {
    const q = quadroDeEsquadrias(est({
      aberturas: [
        abertura({ id: "1", centro_cm: 200, nota: "porta corta-fogo P-90" }),
        abertura({ id: "2", centro_cm: 700, nota: "com visor" }),
      ],
    }));
    expect(q).toHaveLength(2);
    expect(q.map((l) => l.observacao).join(" ")).toContain("corta-fogo");
    expect(q.map((l) => l.observacao).join(" ")).toContain("visor");
  });

  it("mas esquadrias de fato idênticas continuam somando quantidade", () => {
    const q = quadroDeEsquadrias(est({
      aberturas: [j({ id: "1", centro_cm: 200 }), j({ id: "2", centro_cm: 700 })],
    }));
    expect(q).toHaveLength(1);
    expect(q[0].qtd).toBe(2);
  });
});
