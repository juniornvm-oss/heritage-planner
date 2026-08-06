// Testes da apresentação de MARCAS. O que está em jogo aqui é o que o síndico
// lê como "de quem é este equipamento": marca detectada errado, marca que some
// do Dossiê ou biografia colada na marca errada são erro de documento, não de
// pixel. `npx vitest run`.
import { describe, it, expect } from "vitest";
import {
  MARCAS_BASE, agruparMarcas, bibliotecaDeMarcas, marcasDaCena, presencaDaMarca, refDaMarca,
} from "./marcas";
import type {
  Acabamento, AreaAcabamento, Cena, Equipamento, ItemPosicionado, Marca,
} from "./types";
import { ACABAMENTOS_LOCAL } from "./seed";

const item = (nome: string, extra: Partial<ItemPosicionado> = {}): ItemPosicionado => ({
  id: nome, nome, x_cm: 0, y_cm: 0, w_cm: 100, h_cm: 100,
  rotacao: 0, zona: "forca", cenario: "balanceado", preco: 0, ...extra,
});

const cenaCom = (itens: ItemPosicionado[], extra: Partial<Cena> = {}): Cena => ({
  sala: { largura_cm: 1000, profundidade_cm: 800 }, planta: null, itens, ...extra,
});

const equip = (nome: string, extra: Partial<Equipamento> = {}): Equipamento => ({
  nome, largura_cm: 100, profundidade_cm: 100, zona: "forca", preco: 0, ...extra,
});

const area = (nome: string, extra: Partial<AreaAcabamento> = {}): AreaAcabamento => ({
  id: nome, nome, tipo: "piso", cor: "#333", x_cm: 0, y_cm: 0, w_cm: 500, h_cm: 400, ...extra,
});

const acharMarca = <T extends { nome: string }>(lista: T[], nome: string): T | undefined =>
  lista.find((m) => refDaMarca(m.nome) === refDaMarca(nome));

describe("detecção da marca", () => {
  it("lê a marca do cadastro do catálogo", () => {
    const c = cenaCom([item("Leg Press 45°"), item("Puxada + Remada")]);
    const cat = [equip("Leg Press 45°", { marca: "Nautilus" }), equip("Puxada + Remada", { marca: "Nautilus" })];
    const [nautilus, ...resto] = marcasDaCena(c, cat);
    expect(nautilus.nome).toBe("Nautilus");
    expect(nautilus.conhecida).toBe(true);
    expect(nautilus.resumo).toContain("Arthur Jones");
    expect(nautilus.por.equipamentos).toBe(2);
    expect(nautilus.n).toBe(2);
    expect(resto).toEqual([]);
  });

  it("lê a marca escrita no nome do item, na grafia que os orçamentos usam", () => {
    // Sem catálogo nenhum: é o caso do projeto montado a partir de um PDF.
    const marcas = marcasDaCena(cenaCom([item("Esteira · Movimente RT250")]));
    expect(marcas.map((m) => m.nome)).toEqual(["Movement"]);
    expect(marcas[0].origem).toBe("Brasil · Pompéia/SP");
  });

  it("usa o fornecedor do cadastro quando a marca está em branco", () => {
    const cat = [equip("Bebedouro", { marca: null, fornecedor: "Nautilus" })];
    expect(marcasDaCena(cenaCom([item("Bebedouro")]), cat)[0].nome).toBe("Nautilus");
  });

  it("não descarta a marca desconhecida do item sem catálogo", () => {
    // O bug antigo: só a marca vinda do catálogo virava "desconhecida", então
    // um projeto sem catálogo (ou com marca=null, como o seed grava) publicava
    // a seção vazia.
    const marcas = marcasDaCena(cenaCom([item("Esteira · Physicus F5"), item("Esteira · Physicus F5", { id: "b" })]));
    expect(marcas.map((m) => m.nome)).toEqual(["Physicus"]);
    expect(marcas[0].conhecida).toBe(false);
    expect(marcas[0].resumo).toBeUndefined();
    expect(marcas[0].n).toBe(2);
  });

  it("não inventa marca onde não há nenhuma pista", () => {
    // O modelo Heritage é exatamente isto: nome de equipamento, sem fabricante.
    expect(marcasDaCena(cenaCom([item("Banco 0-90°"), item("Leg Press 45°")]))).toEqual([]);
  });

  it("separa as duas marcas de um fornecedor escrito com barra", () => {
    const cat = [equip("Piso", { marca: "Krona/Plurigoma" })];
    expect(marcasDaCena(cenaCom([item("Piso")]), cat).map((m) => m.nome).sort())
      .toEqual(["Krona", "Plurigoma"]);
  });

  it("ignora travessão e 'a definir' no lugar do fornecedor", () => {
    const cat = [equip("Piso", { marca: "—" }), equip("Parede", { marca: "a definir" })];
    expect(marcasDaCena(cenaCom([item("Piso"), item("Parede")]), cat)).toEqual([]);
  });
});

describe("origens da marca dentro do projeto", () => {
  const cena = cenaCom([item("Leg Press 45°")], {
    acessorios: [{ id: "a1", nome: "Kettlebell · Movimente", qtd: 4, preco_un: 900 }],
    infra: [{ id: "i1", tipo: "bebedouro", nome: "Bebedouro", x_cm: 0, y_cm: 0, w_cm: 35, h_cm: 35, rotacao: 0, fornecedor: "Tarkett" }],
    acabamentos: [area("Porcelanato Acetinado 90×90"), area("Vinílico Tarkett Ambienta", { id: "a2" })],
    inventario: [{ id: "v1", nome: "Escada · StairMaster", qtd: 2, destino: "reaproveitado" }],
  });
  const cat = [equip("Leg Press 45°", { marca: "Nautilus" })];
  const marcas = marcasDaCena(cena, cat, null, ACABAMENTOS_LOCAL as Acabamento[]);

  it("conta por origem, não num contador único", () => {
    expect(acharMarca(marcas, "Nautilus")!.por.equipamentos).toBe(1);
    expect(acharMarca(marcas, "Movement")!.por.acessorios).toBe(4);
    // Tarkett aparece como fornecedor de mobiliário E de um piso pintado.
    const tarkett = acharMarca(marcas, "Tarkett")!;
    expect(tarkett.por.mobiliario).toBe(1);
    expect(tarkett.por.acabamentos).toBe(1);
    expect(tarkett.n).toBe(2);
    expect(presencaDaMarca(tarkett)).toBe("1 item de mobiliário · 1 área de acabamento");
  });

  it("cruza a área pintada com o fornecedor do catálogo de acabamentos", () => {
    // A área só guarda o nome do acabamento; quem sabe de quem ele é é o
    // catálogo — sem o cruzamento, Portobello nunca chegaria ao Dossiê.
    expect(acharMarca(marcas, "Portobello")!.por.acabamentos).toBe(1);
  });

  it("marca que só existe no inventário é 'já no condomínio' e desce na lista", () => {
    const stair = acharMarca(marcas, "StairMaster")!;
    expect(stair.por.inventario).toBe(2);
    expect(stair.soInventario).toBe(true);
    expect(marcas.indexOf(stair)).toBe(marcas.length - 1);
    expect(acharMarca(marcas, "Nautilus")!.soInventario).toBe(false);
  });
});

describe("agrupamento por controlador", () => {
  it("junta as marcas irmãs e deixa as sozinhas sem rótulo de grupo", () => {
    const cat = [equip("Leg Press", { marca: "Nautilus" }), equip("Escada", { marca: "StairMaster" }), equip("Esteira", { marca: "Movement" })];
    const marcas = marcasDaCena(cenaCom([item("Leg Press"), item("Escada"), item("Esteira")]), cat);
    const grupos = agruparMarcas(marcas);
    const core = grupos.find((g) => g.grupo === "Core Health & Fitness")!;
    expect(core.rotulo).toBe("Core Health & Fitness — Nautilus, StairMaster");
    expect(core.marcas).toHaveLength(2);
    // Movement é do grupo Brudden, mas está sozinha: anunciar o grupo de uma
    // marca só não informa nada.
    const movement = grupos.find((g) => g.rotulo === "Movement")!;
    expect(movement.grupo).toBeUndefined();
    expect(grupos.flatMap((g) => g.marcas)).toHaveLength(marcas.length);
  });
});

describe("overrides do projeto (cena.marcas)", () => {
  const banco: Marca[] = [
    { nome: "Nautilus", chaves: ["nautilus"], resumo: "Texto da biblioteca do banco." },
  ];
  const cat = [equip("Leg Press", { marca: "Nautilus" }), equip("Esteira", { marca: "Movement" })];
  const base = () => cenaCom([item("Leg Press"), item("Esteira")]);

  it("a biblioteca do banco vence a base local, campo a campo", () => {
    const m = marcasDaCena(base(), cat, banco);
    const nautilus = acharMarca(m, "Nautilus")!;
    expect(nautilus.resumo).toBe("Texto da biblioteca do banco.");
    // O que o banco não diz continua vindo da base local.
    expect(nautilus.grupo).toBe("Core Health & Fitness");
  });

  it("o texto escrito para o projeto vence a biblioteca", () => {
    const c = base();
    c.marcas = [{ ref: refDaMarca("Nautilus"), resumo: "Escolhida pelo conselho pela assistência local." }];
    expect(acharMarca(marcasDaCena(c, cat, banco), "Nautilus")!.resumo)
      .toBe("Escolhida pelo conselho pela assistência local.");
  });

  it("`ocultar` tira a marca do Dossiê", () => {
    const c = base();
    c.marcas = [{ ref: refDaMarca("Movement"), ocultar: true }];
    expect(marcasDaCena(c, cat, banco).map((m) => m.nome)).toEqual(["Nautilus"]);
  });

  it("`destaque` sobe a marca e `ordem` ordena o resto", () => {
    const c = cenaCom([item("Leg Press"), item("Leg Press", { id: "b" }), item("Esteira")]);
    // Nautilus tem 2 itens e sairia primeiro pela presença.
    expect(marcasDaCena(c, cat).map((m) => m.nome)).toEqual(["Nautilus", "Movement"]);
    c.marcas = [{ ref: refDaMarca("Movement"), destaque: true }];
    expect(marcasDaCena(c, cat).map((m) => m.nome)).toEqual(["Movement", "Nautilus"]);
    c.marcas = [{ ref: refDaMarca("Movement"), ordem: 1 }, { ref: refDaMarca("Nautilus"), ordem: 2 }];
    expect(marcasDaCena(c, cat).map((m) => m.nome)).toEqual(["Movement", "Nautilus"]);
  });

  it("a nota e o nome do projeto acompanham a marca", () => {
    const c = base();
    c.marcas = [{ ref: refDaMarca("Movement"), nome: "Movement (Brudden)", nota: "Entrega em 20 dias." }];
    const m = acharMarca(marcasDaCena(c, cat), "Movement (Brudden)")!;
    expect(m.nota).toBe("Entrega em 20 dias.");
    expect(m.resumo).toContain("Brudden"); // o texto da biblioteca continua lá
  });
});

describe("biblioteca efetiva", () => {
  it("a base local é o chão e o banco só acrescenta", () => {
    const bib = bibliotecaDeMarcas([{ nome: "Physicus", tipo: "equipamento" }]);
    expect(bib.length).toBe(MARCAS_BASE.length + 1);
    // Campo vazio vindo do banco não apaga o texto da base.
    const comVazio = bibliotecaDeMarcas([{ nome: "Movement", resumo: "", origem: null }]);
    const movement = comVazio.find((m) => m.nome === "Movement")!;
    expect(movement.resumo).toContain("Brudden");
    expect(movement.origem).toBe("Brasil · Pompéia/SP");
  });

  it("marca desativada sai da detecção", () => {
    const cat = [equip("Esteira", { marca: "Movement" })];
    const c = cenaCom([item("Esteira")]);
    const m = marcasDaCena(c, cat, [{ nome: "Movement", ativo: false }]);
    // Continua aparecendo (o equipamento é daquela marca), mas sem a ficha.
    expect(m[0].nome).toBe("Movement");
    expect(m[0].conhecida).toBe(false);
    expect(m[0].resumo).toBeUndefined();
  });

  it("marca cadastrada sem chaves é procurada pelo próprio nome", () => {
    const cat = [equip("Esteira", { marca: "Physicus Fitness" })];
    const m = marcasDaCena(cenaCom([item("Esteira")]), cat, [{ nome: "Physicus", resumo: "Fabricante nacional." }]);
    expect(m[0].nome).toBe("Physicus");
    expect(m[0].resumo).toBe("Fabricante nacional.");
  });
});
