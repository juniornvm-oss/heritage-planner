// Testes da análise funcional de espaço. É o número que o consultor defende na
// frente do síndico ("cabem 12 pessoas, sobram 38 m² de circulação"), então os
// erros aqui saem impressos no Dossiê. `npm test`.
import { describe, it, expect } from "vitest";
import type { Cena, ItemPosicionado, AreaFuncional } from "./types";
import { CIRCULACAO_PADRAO } from "./types";
import {
  analisarEspaco, areaUniaoCm2, classificarVao,
  OCUPACAO_AMBAR_PCT, PASSAGEM_MINIMA_CM, VAO_BATERIA_CM,
} from "./analiseEspaco";
import { heritageProjeto } from "./seed";

// Sala de 10 × 8 m = 80 m² — as contas fecham de cabeça.
const sala = () => ({ largura_cm: 1000, profundidade_cm: 800 });

const item = (p: Partial<ItemPosicionado> & { id: string }): ItemPosicionado => ({
  nome: "Aparelho", x_cm: 0, y_cm: 0, w_cm: 100, h_cm: 100, rotacao: 0,
  zona: "forca", cenario: "balanceado", preco: 0, ...p,
});

const cena = (itens: ItemPosicionado[], extra: Partial<Cena> = {}): Cena =>
  ({ sala: sala(), planta: null, itens, ...extra });

describe("união de retângulos", () => {
  it("mede a união, não a soma", () => {
    // Dois quadrados de 1 m² com meio metro de sobreposição: 1,5 m², não 2.
    const a = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const b = { x0: 50, y0: 0, x1: 150, y1: 100 };
    expect(areaUniaoCm2([a, b])).toBe(15000);
    expect(areaUniaoCm2([a, a])).toBe(10000);
  });

  it("ignora retângulo degenerado e lista vazia", () => {
    expect(areaUniaoCm2([])).toBe(0);
    expect(areaUniaoCm2([{ x0: 10, y0: 10, x1: 10, y1: 50 }])).toBe(0);
    // Recorte que não interseta chega invertido — não pode virar área negativa.
    expect(areaUniaoCm2([{ x0: 50, y0: 0, x1: 10, y1: 100 }])).toBe(0);
  });

  it("soma retângulos separados sem inventar o vão entre eles", () => {
    expect(areaUniaoCm2([{ x0: 0, y0: 0, x1: 100, y1: 100 }, { x0: 300, y0: 0, x1: 400, y1: 100 }])).toBe(20000);
  });
});

describe("sala vazia", () => {
  const a = analisarEspaco(cena([]));

  it("a área bruta é o retângulo da sala e nada está ocupado", () => {
    expect(a.areaBrutaM2.valor).toBe(80);
    expect(a.areaUtilM2.valor).toBe(80);
    expect(a.areaCorpoM2.valor).toBe(0);
    expect(a.areaUsoM2.valor).toBe(0);
    expect(a.areaLivreM2.valor).toBe(80);
    expect(a.ocupacaoFuncional.valor).toBe(0);
    expect(a.ocupacaoFuncional.status).toBe("ok");
  });

  it("não mede vão nem inventa capacidade", () => {
    expect(a.folgas.menorVaoCm).toBeNull();
    expect(a.folgas.menorVao.status).toBe("neutro");
    expect(a.capacidade.simultaneos.valor).toBe(0);
    expect(a.capacidade.simultaneos.status).toBe("neutro");
    expect(a.m2PorAparelho.valor).toBe(0);
  });

  it("avisa que não há o que analisar, sem alarme falso", () => {
    expect(a.alertas.map((x) => x.nivel)).toEqual(["info"]);
    expect(a.alertas[0].texto).toContain("sem equipamento posicionado");
  });

  it("sala sem dimensão é erro, não ocupação zero", () => {
    const vazia = analisarEspaco({ sala: { largura_cm: 0, profundidade_cm: 0 }, planta: null, itens: [] });
    expect(vazia.alertas.some((x) => x.nivel === "critico")).toBe(true);
    expect(vazia.ocupacaoFuncional.valor).toBe(0);
  });
});

describe("item único", () => {
  // 2 × 1 m de corpo, com 50 cm de margem de uso na frente e 20 cm nas laterais:
  // área de uso = 2,4 × 2,0 = 4,8 m².
  const c = cena([item({ id: "a", x_cm: 300, y_cm: 300, w_cm: 200, h_cm: 100, uso_frontal_cm: 50, uso_lateral_cm: 20 })]);
  const a = analisarEspaco(c);

  it("separa corpo de área de uso", () => {
    expect(a.areaCorpoM2.valor).toBe(2);
    expect(a.areaUsoM2.valor).toBe(4.8);
  });

  it("fecha a conta: útil = uso + livre", () => {
    expect(a.areaUtilM2.valor).toBe(80);
    expect(a.areaUsoM2.valor + a.areaLivreM2.valor).toBeCloseTo(a.areaUtilM2.valor, 2);
  });

  it("a ocupação é do piso ÚTIL e vem com semáforo e faixa", () => {
    expect(a.ocupacaoFuncional.valor).toBe(6);
    expect(a.ocupacaoFuncional.status).toBe("ok");
    expect(a.ocupacaoFuncional.faixa).toEqual({ max: 55 });
    expect(a.ocupacaoFuncional.referencia).toContain("55%");
  });

  it("um aparelho sozinho é um usuário simultâneo", () => {
    expect(a.capacidade.simultaneos.valor).toBe(1);
    expect(a.capacidade.compartilhados).toEqual([]);
    expect(a.capacidade.m2UtilPorUsuario).toBe(80);
  });

  it("pilar e mobiliário fixo saem da área útil", () => {
    // Pilar de 1 × 1 m: útil cai para 79 m² e a ocupação sobe, mesmo sem mexer
    // no equipamento — é o que `resumo()` e o PDF não enxergam hoje.
    const comPilar = analisarEspaco({
      ...c,
      estrutura: { paredes: [], aberturas: [], pilares: [{ id: "p1", x_cm: 0, y_cm: 0, w_cm: 100, h_cm: 100 }] },
    });
    expect(comPilar.areaBrutaM2.valor).toBe(80);
    expect(comPilar.areaUtilM2.valor).toBe(79);
    expect(comPilar.ocupacaoFuncional.valor).toBeGreaterThan(a.ocupacaoFuncional.valor);
    expect(comPilar.areaUsoM2.valor + comPilar.areaLivreM2.valor).toBeCloseTo(79, 2);
  });
});

describe("dois itens colados", () => {
  // 40 cm entre os corpos: a fenda morta. Cabe o corpo de alguém, então parece
  // passagem — mas ninguém atravessa.
  const c = cena([
    item({ id: "a", x_cm: 0, y_cm: 200, w_cm: 200, h_cm: 90 }),
    item({ id: "b", x_cm: 240, y_cm: 200, w_cm: 200, h_cm: 90 }),
  ]);
  const a = analisarEspaco(c);

  it("classifica o vão como crítico contra a circulação do projeto", () => {
    expect(a.circulacaoMinCm).toBe(CIRCULACAO_PADRAO);
    expect(a.folgas.menorVaoCm).toBe(40);
    expect(a.folgas.nCritica).toBe(1);
    expect(a.folgas.criticos[0].valorCm).toBe(40);
    expect(a.folgas.criticos[0].tipo).toBe("circulacao");
    expect(a.folgas.menorVao.status).toBe("critico");
  });

  it("nomeia os dois equipamentos das pontas do vão", () => {
    expect(a.folgas.criticos[0].ids.sort()).toEqual(["a", "b"]);
  });

  it("o alerta crítico chega pronto para a UI, com os ids", () => {
    const alerta = a.alertas.find((x) => x.nivel === "critico");
    expect(alerta?.texto).toContain("40 cm");
    expect(alerta?.ids?.sort()).toEqual(["a", "b"]);
    // Crítico vem antes de atenção/informativo na lista.
    expect(a.alertas[0].nivel).toBe("critico");
  });

  it("equipamento ENCOSTADO é bateria, não circulação crítica", () => {
    // Duas esteiras lado a lado com 8 cm entre elas é como se monta uma linha
    // de cardio. Medido cru contra 90 cm isso vira alarme falso — e alarme
    // falso em massa é o que fazia o consultor ignorar o painel inteiro.
    const bateria = analisarEspaco(cena([
      item({ id: "a", x_cm: 0, y_cm: 200, w_cm: 200, h_cm: 90 }),
      item({ id: "b", x_cm: 208, y_cm: 200, w_cm: 200, h_cm: 90 }),
    ]));
    expect(bateria.folgas.vaos.some((v) => v.valorCm === 8 && v.tipo === "bateria")).toBe(true);
    expect(bateria.folgas.nBateria).toBe(1);
    expect(bateria.folgas.nCritica).toBe(0);
    expect(bateria.alertas.some((x) => x.nivel === "critico")).toBe(false);
  });

  it("recuo contra a parede não é julgado como circulação", () => {
    // Aparelho a 15 cm da parede do fundo é projeto, não defeito.
    const encostado = analisarEspaco(cena([item({ id: "a", x_cm: 400, y_cm: 685, w_cm: 200, h_cm: 100 })]));
    expect(encostado.folgas.nRecuoParede).toBeGreaterThanOrEqual(1);
    expect(encostado.folgas.menorRecuoParedeCm).toBe(15);
    expect(encostado.folgas.vaos.every((v) => v.tipo === "parede")).toBe(true);
    expect(encostado.folgas.nCirculacao).toBe(0);
    expect(encostado.folgas.menorVaoCm).toBeNull();
    expect(encostado.folgas.nCritica).toBe(0);
  });

  it("afastar os aparelhos resolve o vão sem tocar em mais nada", () => {
    const folgado = analisarEspaco(cena([
      item({ id: "a", x_cm: 0, y_cm: 200, w_cm: 200, h_cm: 90 }),
      item({ id: "b", x_cm: 320, y_cm: 200, w_cm: 200, h_cm: 90 }),
    ]));
    expect(folgado.folgas.menorVaoCm).toBe(120);
    expect(folgado.folgas.nCritica).toBe(0);
    expect(folgado.folgas.criticos).toEqual([]);
  });

  it("a régua do projeto manda: circulação maior aperta vãos que passavam", () => {
    const exigente = analisarEspaco(cena([
      item({ id: "a", x_cm: 0, y_cm: 200, w_cm: 200, h_cm: 90 }),
      item({ id: "b", x_cm: 300, y_cm: 200, w_cm: 200, h_cm: 90 }),
    ], { circulacaoMin: 120 }));
    // 100 cm passa em 90, não passa em 120 — mas ninguém fica "intransponível"
    // acima de PASSAGEM_MINIMA_CM.
    expect(exigente.folgas.menorVaoCm).toBe(100);
    expect(exigente.folgas.nApertada).toBeGreaterThanOrEqual(1);
    expect(exigente.folgas.nCritica).toBe(0);
    expect(classificarVao(100, 120)).toBe("apertada");
    expect(classificarVao(100, 90)).toBe("ok");
    expect(classificarVao(PASSAGEM_MINIMA_CM - 1, 90)).toBe("critica");
  });
});

describe("sobreposição não conta duas vezes", () => {
  // O bug do PDF: `livre = sala − Σuso` com áreas de uso que se cruzam derruba
  // a área livre (chega a zerar em sala densa). Na união, o cruzamento entra
  // uma vez só.
  const itens = [
    item({ id: "a", x_cm: 0, y_cm: 0, w_cm: 100, h_cm: 100 }),
    item({ id: "b", x_cm: 50, y_cm: 0, w_cm: 100, h_cm: 100 }),
  ];
  const a = analisarEspaco(cena(itens));

  it("a área de corpo é a união (1,5 m²), não a soma (2 m²)", () => {
    const soma = itens.reduce((s, i) => s + (i.w_cm / 100) * (i.h_cm / 100), 0);
    expect(soma).toBe(2);
    expect(a.areaCorpoM2.valor).toBe(1.5);
    expect(a.areaUsoM2.valor).toBe(1.5);
  });

  it("a área livre continua fechando com a útil", () => {
    expect(a.areaLivreM2.valor).toBe(78.5);
    expect(a.areaUsoM2.valor + a.areaLivreM2.valor).toBeCloseTo(a.areaUtilM2.valor, 2);
  });

  it("dois aparelhos com área de uso sobreposta valem UM usuário simultâneo", () => {
    // `itens.length` diria 2. Não dá para usar os dois ao mesmo tempo.
    expect(a.capacidade.nAparelhos).toBe(2);
    expect(a.capacidade.simultaneos.valor).toBe(1);
    expect(a.capacidade.compartilhados).toHaveLength(1);
    expect(a.alertas.some((x) => x.texto.includes("dividem área de uso"))).toBe(true);
  });

  it("uma sala densa não produz área livre negativa nem ocupação acima de 100%", () => {
    // 30 aparelhos de 2 × 2 m empilhados no mesmo canto: o cálculo antigo
    // somaria 120 m² de uso numa sala de 80 m².
    const pilha = Array.from({ length: 30 }, (_, k) =>
      item({ id: `p${k}`, x_cm: 10 + k, y_cm: 10 + k, w_cm: 200, h_cm: 200 }));
    const densa = analisarEspaco(cena(pilha));
    expect(densa.areaLivreM2.valor).toBeGreaterThan(0);
    expect(densa.ocupacaoFuncional.valor).toBeLessThanOrEqual(100);
    expect(densa.areaUsoM2.valor).toBeLessThanOrEqual(densa.areaUtilM2.valor);
  });
});

describe("áreas funcionais", () => {
  const area = (p: Partial<AreaFuncional> & { id: string; tipo: AreaFuncional["tipo"] }): AreaFuncional => ({
    pontos: [], x_cm: 0, y_cm: 0, w_cm: 0, h_cm: 0, ...p,
  });
  // Região de 4 × 4 m no canto superior esquerdo.
  const cardio = area({
    id: "z1", tipo: "cardio", nome: "Cardio",
    pontos: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }],
    x_cm: 0, y_cm: 0, w_cm: 400, h_cm: 400,
  });

  it("conta só os itens cujo centro cai dentro do polígono", () => {
    const a = analisarEspaco(cena([
      item({ id: "dentro", x_cm: 100, y_cm: 100, w_cm: 100, h_cm: 100 }),
      item({ id: "fora", x_cm: 700, y_cm: 500, w_cm: 100, h_cm: 100 }),
      // Centro em (410, 50): encosta na região, mas o centro está fora dela.
      item({ id: "borda", x_cm: 360, y_cm: 0, w_cm: 100, h_cm: 100 }),
    ], { areas: [cardio] }));

    expect(a.porArea).toHaveLength(1);
    expect(a.porArea[0].ids).toEqual(["dentro"]);
    expect(a.porArea[0].nItens).toBe(1);
    expect(a.porArea[0].m2).toBe(16);
    expect(a.porArea[0].areaUsoM2).toBe(1);
    expect(a.porArea[0].ocupacaoPct).toBe(6.3);
    expect(a.porArea[0].status).toBe("ok");
    expect(a.porArea[0].cor).toBe("#4A90C4");
  });

  it("acusa a região saturada com os ids para a UI destacar", () => {
    const cheios = Array.from({ length: 4 }, (_, k) =>
      item({ id: `c${k}`, x_cm: (k % 2) * 200, y_cm: Math.floor(k / 2) * 200, w_cm: 190, h_cm: 190 }));
    const a = analisarEspaco(cena(cheios, { areas: [cardio] }));
    expect(a.porArea[0].nItens).toBe(4);
    expect(a.porArea[0].ocupacaoPct).toBeGreaterThan(OCUPACAO_AMBAR_PCT);
    expect(a.porArea[0].status).toBe("critico");
    const alerta = a.alertas.find((x) => x.texto.startsWith("Cardio:"));
    expect(alerta?.ids).toHaveLength(4);
  });

  it("circulação é área que existe para ficar vazia", () => {
    const rota = area({
      id: "z2", tipo: "circulacao",
      pontos: [{ x: 500, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 800 }, { x: 500, y: 800 }],
      x_cm: 500, y_cm: 0, w_cm: 100, h_cm: 800,
    });
    const a = analisarEspaco(cena([item({ id: "x", x_cm: 510, y_cm: 300, w_cm: 80, h_cm: 80 })], { areas: [rota] }));
    expect(a.porArea[0].status).toBe("critico");
    expect(a.alertas.some((x) => x.nivel === "critico" && x.ids?.includes("x"))).toBe(true);
    // 100 cm de largura não atende rota de saída (120 cm).
    expect(a.alertas.some((x) => x.texto.includes("rota de saída"))).toBe(true);

    const livre = analisarEspaco(cena([], { areas: [rota] }));
    expect(livre.porArea[0].status).toBe("ok");
  });

  it("área legada, só com bbox, ainda é medida", () => {
    const legada = area({ id: "z3", tipo: "apoio", x_cm: 600, y_cm: 400, w_cm: 200, h_cm: 200 });
    const a = analisarEspaco(cena([item({ id: "m", x_cm: 650, y_cm: 450, w_cm: 100, h_cm: 100 })], { areas: [legada] }));
    expect(a.porArea[0].m2).toBe(4);
    expect(a.porArea[0].nItens).toBe(1);
    expect(a.porArea[0].nome).toBe("Apoio");
  });
});

describe("projeto Heritage (cena real)", () => {
  const a = analisarEspaco(heritageProjeto().cena!);

  it("as áreas fecham entre si", () => {
    expect(a.areaBrutaM2.valor).toBeCloseTo(123.2, 1); // 11,00 × 11,20 m
    expect(a.areaUtilM2.valor).toBeLessThan(a.areaBrutaM2.valor); // o pilar da sala desconta
    expect(a.areaCorpoM2.valor).toBeLessThanOrEqual(a.areaUsoM2.valor);
    expect(a.areaUsoM2.valor + a.areaLivreM2.valor).toBeCloseTo(a.areaUtilM2.valor, 1);
    expect(a.ocupacaoFuncional.valor).toBeGreaterThan(0);
    expect(a.ocupacaoFuncional.valor).toBeLessThanOrEqual(100);
  });

  it("a capacidade não é a contagem de itens", () => {
    const n = heritageProjeto().cena!.itens.length;
    expect(a.capacidade.nAparelhos).toBe(n);
    expect(a.capacidade.simultaneos.valor).toBeLessThanOrEqual(n);
    expect(a.capacidade.simultaneos.valor).toBeGreaterThan(0);
    expect(a.capacidade.estacoes.length + a.capacidade.compartilhados.length).toBe(n);
  });

  it("toda métrica sai com referência e status — nunca o número sozinho", () => {
    const metricas = [
      a.areaBrutaM2, a.areaUtilM2, a.areaCorpoM2, a.areaUsoM2, a.areaLivreM2,
      a.ocupacaoFuncional, a.m2PorAparelho, a.capacidade.simultaneos, a.folgas.menorVao,
    ];
    for (const m of metricas) {
      expect(Number.isFinite(m.valor)).toBe(true);
      expect(m.referencia.length).toBeGreaterThan(20);
      expect(["neutro", "ok", "atencao", "critico"]).toContain(m.status);
    }
  });

  it("mede os vãos reais da planta e os classifica", () => {
    expect(a.folgas.vaos.length).toBeGreaterThan(5);
    expect(a.folgas.nOk + a.folgas.nApertada + a.folgas.nCritica).toBe(a.folgas.nCirculacao);
    expect(a.folgas.nCirculacao + a.folgas.nBateria + a.folgas.nRecuoParede).toBe(a.folgas.vaos.length);
    expect(a.folgas.menorVaoCm).not.toBeNull();
    // Recuo de parede e aparelho em bateria existem no modelo e NÃO podem
    // virar alarme de circulação: era isso que enchia o painel de vermelho.
    expect(a.folgas.nRecuoParede).toBeGreaterThan(0);
    expect(a.folgas.nBateria).toBeGreaterThan(0);
    for (const v of a.folgas.criticos) {
      expect(v.valorCm).toBeLessThan(PASSAGEM_MINIMA_CM);
      expect(v.valorCm).toBeGreaterThanOrEqual(VAO_BATERIA_CM);
      expect(v.tipo).toBe("circulacao");
    }
    // Os críticos saem do mais estreito para o mais largo.
    const ordenados = [...a.folgas.criticos].sort((x, y) => x.valorCm - y.valorCm);
    expect(a.folgas.criticos.map((v) => v.valorCm)).toEqual(ordenados.map((v) => v.valorCm));
  });

  it("os alertas vêm ordenados por gravidade e sem texto vazio", () => {
    const peso = { critico: 0, atencao: 1, info: 2 };
    const pesos = a.alertas.map((x) => peso[x.nivel]);
    expect(pesos).toEqual([...pesos].sort((x, y) => x - y));
    for (const al of a.alertas) expect(al.texto.trim().length).toBeGreaterThan(0);
    // O modelo não tem margem de uso cadastrada — a análise precisa dizer isso
    // em vez de fingir que a ocupação está medida.
    expect(a.alertas.some((x) => x.texto.includes("sem área de uso cadastrada"))).toBe(true);
  });
});

// ── Aberturas e fixações ────────────────────────────────────────────────────
// A parte da análise que só existe porque a Etapa 1 ganhou variantes: sem
// modelo de porta e material de parede, nada disto tem o que julgar.

const paredes = () => [
  { id: "topo", x1: 0, y1: 0, x2: 1000, y2: 0, espessura_cm: 15 },
  { id: "dir", x1: 1000, y1: 0, x2: 1000, y2: 800, espessura_cm: 15 },
  { id: "base", x1: 1000, y1: 800, x2: 0, y2: 800, espessura_cm: 15 },
  { id: "esq", x1: 0, y1: 800, x2: 0, y2: 0, espessura_cm: 15 },
];

const comEstrutura = (itens: ItemPosicionado[], extra: Partial<Cena> = {}, est: Partial<Cena["estrutura"] & object> = {}): Cena =>
  cena(itens, { estrutura: { paredes: paredes(), aberturas: [], pilares: [], ...est }, ...extra });

describe("varredura da porta", () => {
  // Porta de 90 cm centrada em x=500 na parede do topo; a folha varre o
  // quadrante x∈[455,545], y∈[0,90] para dentro da sala.
  const porta = (extra = {}) => ({ id: "p", paredeId: "topo", centro_cm: 500, largura_cm: 90, tipo: "porta" as const, ...extra });
  const naFrente = item({ id: "esteira", x_cm: 470, y_cm: 20, w_cm: 80, h_cm: 200 });
  const longe = item({ id: "longe", x_cm: 100, y_cm: 400, w_cm: 80, h_cm: 200 });

  it("acusa o equipamento que trava a folha", () => {
    const a = analisarEspaco(comEstrutura([naFrente], {}, { aberturas: [porta()] }));
    expect(a.aberturas).toHaveLength(1);
    expect(a.aberturas[0].ids).toEqual(["esteira"]);
    expect(a.aberturas[0].status).toBe("critico");
    expect(a.alertas.some((x) => x.nivel === "critico" && x.texto.includes("varredura da folha"))).toBe(true);
  });

  it("não acusa quem está fora do arco", () => {
    const a = analisarEspaco(comEstrutura([longe], {}, { aberturas: [porta()] }));
    expect(a.aberturas[0].ids).toEqual([]);
    expect(a.aberturas[0].status).toBe("ok");
  });

  it("trocar para porta de correr libera o piso", () => {
    const giro = analisarEspaco(comEstrutura([naFrente], {}, { aberturas: [porta()] }));
    const correr = analisarEspaco(comEstrutura([naFrente], {}, { aberturas: [porta({ modelo: "correr" })] }));
    expect(giro.aberturas[0].ids).toHaveLength(1);
    expect(correr.aberturas[0].ids).toHaveLength(0);
    expect(correr.aberturas[0].varre).toBe(false);
    expect(correr.aberturas[0].status).toBe("neutro");
  });

  it("inverter o lado de abertura tira o equipamento do arco", () => {
    // Os dois quartos de disco se sobrepõem no miolo do vão, então o caso que
    // separa um do outro é o CANTO PROFUNDO: 20×20 encostado na ombreira
    // esquerda, a 75 cm da parede. Do pivô esquerdo (455,0) dista 75 — dentro.
    // Do pivô direito (545,0) o ponto mais próximo dista 103 — fora do raio 90.
    const canto = item({ id: "rack", x_cm: 455, y_cm: 75, w_cm: 20, h_cm: 20 });
    const esq = analisarEspaco(comEstrutura([canto], {}, { aberturas: [porta({ lado: "esquerda" })] }));
    const dir = analisarEspaco(comEstrutura([canto], {}, { aberturas: [porta({ lado: "direita" })] }));
    expect(esq.aberturas[0].ids).toEqual(["rack"]);
    expect(dir.aberturas[0].ids).toEqual([]);
  });

  it("o arco não muda a área útil — útil = uso + livre continua fechando", () => {
    const a = analisarEspaco(comEstrutura([naFrente], {}, { aberturas: [porta()] }));
    expect(a.areaUsoM2.valor + a.areaLivreM2.valor).toBeCloseTo(a.areaUtilM2.valor, 1);
  });

  it("abertura órfã (parede apagada) é ignorada em vez de quebrar", () => {
    const a = analisarEspaco(comEstrutura([naFrente], {}, { aberturas: [porta({ paredeId: "fantasma" })] }));
    expect(a.aberturas).toHaveLength(0);
  });

  it("janela não reserva piso nenhum", () => {
    const a = analisarEspaco(comEstrutura([naFrente], {}, {
      aberturas: [{ id: "j", paredeId: "topo", centro_cm: 500, largura_cm: 120, tipo: "janela" as const }],
    }));
    expect(a.aberturas[0].varre).toBe(false);
    expect(a.aberturas[0].ids).toEqual([]);
  });
});

describe("fixação do elemento de parede", () => {
  const espelho = {
    id: "esp", tipo: "espelho" as const, paredeId: "topo",
    offset_cm: 200, largura_cm: 200, altura_cm: 200, dist_piso_cm: 30,
  };

  it("alvenaria aceita o espelho em silêncio", () => {
    const a = analisarEspaco(comEstrutura([], { elementosParede: [espelho] }));
    expect(a.fixacoes).toEqual([]);
  });

  it("drywall sem reforço vira alerta com a saída escrita", () => {
    const est = { paredes: paredes().map((p) => (p.id === "topo" ? { ...p, material: "drywall" as const } : p)) };
    const a = analisarEspaco(comEstrutura([], { elementosParede: [espelho] }, est));
    expect(a.fixacoes).toHaveLength(1);
    expect(a.fixacoes[0].nivel).toBe("atencao");
    expect(a.fixacoes[0].motivo).toContain("reforço");
    expect(a.alertas.some((x) => x.texto.includes("reforço"))).toBe(true);
  });

  it("marcar a parede como reforçada silencia o alerta", () => {
    const est = { paredes: paredes().map((p) => (p.id === "topo" ? { ...p, material: "drywall" as const, reforcada: true } : p)) };
    expect(analisarEspaco(comEstrutura([], { elementosParede: [espelho] }, est)).fixacoes).toEqual([]);
  });

  it("vidro não recebe carga nem com reforço", () => {
    const est = { paredes: paredes().map((p) => (p.id === "topo" ? { ...p, material: "vidro" as const, reforcada: true } : p)) };
    const a = analisarEspaco(comEstrutura([], { elementosParede: [espelho] }, est));
    expect(a.fixacoes[0].nivel).toBe("critico");
  });

  it("espelho sobre a janela é conflito nos dois eixos", () => {
    // Janela de 120 cm centrada em 200, peitoril 110 → ocupa 140..260 na
    // horizontal e 110..220 na vertical. O espelho (100..300 × 30..230) invade.
    const janela = { id: "j", paredeId: "topo", centro_cm: 200, largura_cm: 120, tipo: "janela" as const };
    const a = analisarEspaco(comEstrutura([], { elementosParede: [espelho] }, { aberturas: [janela] }));
    expect(a.fixacoes.some((f) => f.motivo.includes("sobrepõe"))).toBe(true);
  });

  it("elemento acima da verga não conflita com a janela", () => {
    const janela = { id: "j", paredeId: "topo", centro_cm: 200, largura_cm: 120, tipo: "janela" as const };
    const tv = { id: "tv", tipo: "tv" as const, paredeId: "topo", offset_cm: 200, largura_cm: 98, altura_cm: 57, dist_piso_cm: 230 };
    const a = analisarEspaco(comEstrutura([], { elementosParede: [tv] }, { aberturas: [janela] }));
    expect(a.fixacoes).toEqual([]);
  });

  it("elemento ao lado da janela não conflita", () => {
    const janela = { id: "j", paredeId: "topo", centro_cm: 800, largura_cm: 120, tipo: "janela" as const };
    const a = analisarEspaco(comEstrutura([], { elementosParede: [espelho] }, { aberturas: [janela] }));
    expect(a.fixacoes).toEqual([]);
  });

  it("elemento órfão de parede apagada não quebra a análise", () => {
    const a = analisarEspaco(comEstrutura([], { elementosParede: [{ ...espelho, paredeId: "fantasma" }] }));
    expect(a.fixacoes).toEqual([]);
  });
});

describe("sala vazia continua muda", () => {
  it("sem abertura e sem elemento, nada de novo é dito", () => {
    const a = analisarEspaco(cena([]));
    expect(a.aberturas).toEqual([]);
    expect(a.fixacoes).toEqual([]);
  });
});

describe("mobiliário fixo também trava a porta", () => {
  const porta = { id: "p", paredeId: "topo", centro_cm: 500, largura_cm: 90, tipo: "porta" as const };

  it("a catraca dentro do arco é acusada, e à parte dos equipamentos", () => {
    const catraca = { id: "catraca", tipo: "banco" as const, nome: "Catraca", x_cm: 470, y_cm: 10, w_cm: 60, h_cm: 40, rotacao: 0 };
    const a = analisarEspaco(comEstrutura([], { infra: [catraca] }, { aberturas: [porta] }));
    expect(a.aberturas[0].idsInfra).toEqual(["catraca"]);
    expect(a.aberturas[0].ids).toEqual([]); // `ids` continua sendo só equipamento
    expect(a.aberturas[0].status).toBe("critico");
    expect(a.alertas.some((x) => x.texto.includes("mobiliário"))).toBe(true);
  });

  it("tapete não trava porta nenhuma", () => {
    const tapete = { id: "tapete", tipo: "tapete" as const, nome: "Tapete", x_cm: 470, y_cm: 10, w_cm: 60, h_cm: 40, rotacao: 0 };
    const a = analisarEspaco(comEstrutura([], { infra: [tapete] }, { aberturas: [porta] }));
    expect(a.aberturas[0].idsInfra).toEqual([]);
    expect(a.aberturas[0].status).toBe("ok");
  });
});
