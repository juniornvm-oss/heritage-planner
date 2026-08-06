// Testes da ANÁLISE DE COBERTURA: o que a academia projetada treina e o que
// deixa de fora. O erro que estes testes existem para pegar é o casamento
// errado de nome — ele não aparece na tela, aparece no Dossiê do síndico como
// um grupo muscular marcado "coberto" que a sala não treina.
import { describe, it, expect } from "vitest";
import {
  MUSCULOS, MUSCULOS_ORDEM, NORM_MUSCULO, NORM_IGNORADO, PADROES, PADROES_ORDEM,
  normalizarMusculo, type Musculo,
} from "./musculatura";
import { analisarCobertura, BASE_EQUIP, baseDoNome, exerciciosDoItem, normalizar } from "./curadoria";
import { CATALOGO_LOCAL, heritageProjeto } from "./seed";
import type { Cena, ItemPosicionado } from "./types";

/**
 * Os 19 valores distintos de `target` do dataset de exercícios (1.324
 * registros). Ficam aqui como LITERAL de propósito: o dataset não está no repo
 * do app — é fonte de build time, revisada à mão (ver docs/licencas.md). Se
 * ele ganhar um alvo novo, `tools/derivar-capacidades.mjs` acusa e esta lista
 * é atualizada junto.
 */
const TARGETS_DATASET = [
  "abs", "pectorals", "biceps", "glutes", "delts", "triceps", "upper back", "lats",
  "calves", "quads", "forearms", "cardiovascular system", "hamstrings", "spine",
  "traps", "adductors", "serratus anterior", "abductors", "levator scapulae",
];

describe("vocabulário de músculo", () => {
  it("tem 14 grupos musculares + o sistema cardiovascular", () => {
    expect(MUSCULOS_ORDEM.length).toBe(15);
    expect(MUSCULOS_ORDEM).toContain("cardiovascular");
    expect(MUSCULOS_ORDEM.filter((m) => m !== "cardiovascular").length).toBe(14);
  });

  it("NORM_MUSCULO colapsa TODOS os alvos do dataset nos 14 grupos", () => {
    for (const alvo of TARGETS_DATASET) {
      const g = normalizarMusculo(alvo);
      expect(g, `alvo "${alvo}" ficaria fora da análise`).not.toBeNull();
      expect(MUSCULOS_ORDEM).toContain(g);
    }
  });

  it("colapsa os sinônimos sujos que a fonte usa para a mesma coisa", () => {
    expect(normalizarMusculo("traps")).toBe(normalizarMusculo("trapezius"));
    expect(normalizarMusculo("lats")).toBe(normalizarMusculo("latissimus dorsi"));
    expect(normalizarMusculo("quads")).toBe(normalizarMusculo("quadriceps"));
    expect(normalizarMusculo("delts")).toBe(normalizarMusculo("deltoids"));
    expect(normalizarMusculo("delts")).toBe(normalizarMusculo("shoulders"));
    expect(normalizarMusculo("abs")).toBe(normalizarMusculo("abdominals"));
    // Caixa e espaço sobrando não podem criar um grupo novo.
    expect(normalizarMusculo("  Upper   Back ")).toBe("costas");
    expect(normalizarMusculo("nada disso")).toBeNull();
  });

  it("o que é ignorado é decisão registrada, não buraco na tabela", () => {
    for (const r of NORM_IGNORADO) expect(NORM_MUSCULO[r]).toBeUndefined();
    expect(NORM_IGNORADO).toContain("hip flexors");
  });

  it("nenhum apelido aponta para grupo inexistente", () => {
    for (const [bruto, grupo] of Object.entries(NORM_MUSCULO)) {
      expect(MUSCULOS_ORDEM, `"${bruto}" aponta para "${grupo}"`).toContain(grupo);
    }
  });
});

describe("base técnica — casamento de nome", () => {
  it("acerta os 22 nomes do catálogo local", () => {
    const esperado: Record<string, string> = {
      "Esteira": "Esteira",
      "Escada": "Escada (Stepmill)",
      "Elíptico": "Elíptico",
      "Bike Horizontal": "Bike Horizontal",
      "Bike Spinning": "Bike de Spinning",
      "Cross + Smith": "Estação Cross + Smith",
      "Squat Machine": "Agachamento guiado (Hack Squat)",
      "Leg Press 45°": "Leg Press 45°",
      "Elevação Pélvica": "Elevação Pélvica (Hip Thrust)",
      "Lying Leg Curl": "Mesa Flexora",
      "Dual Leg Extension": "Cadeira Extensora",
      "Dual Inner": "Abdutora & Adutora",
      "Impact Delt Raise": "Elevação Lateral (Delt Raise)",
      "Puxada + Remada": "Puxada + Remada",
      "Cross Over Angular": "Cross Over (torre de polias)",
      "Estante Dumbbells": "Estante de guarda (halteres e anilhas)",
      "Torre Halteres": "Estante de guarda (halteres e anilhas)",
      "Banco 0-90°": "Banco Regulável 0-90°",
      "Banco Declinado": "Banco Inclinado / Declinado",
      "Banco Supino": "Banco de Supino",
      "Espaldar": "Espaldar",
      "Colchonetes": "Colchonetes",
    };
    expect(Object.keys(esperado).length).toBe(CATALOGO_LOCAL.length);
    for (const equip of CATALOGO_LOCAL) {
      expect(baseDoNome(equip.nome)?.nome, `catálogo: ${equip.nome}`).toBe(esperado[equip.nome]);
    }
  });

  it("a máquina de isolamento não sequestra a estação maior", () => {
    // Era o coringa: uma entrada só, com as chaves de seis grupos musculares.
    // "panturrilha" tem 11 caracteres e vencia "leg press", que tem 9.
    expect(baseDoNome("Panturrilha Sentado")?.nome).toBe("Panturrilha Máquina");
    expect(baseDoNome("Leg Press 45° com Panturrilha")?.nome).toBe("Leg Press 45°");
    expect(baseDoNome("Panturrilha no Smith Rack")?.nome).toBe("Estação Cross + Smith");
    // E cada isolamento responde pelo SEU grupo, não por um genérico.
    expect(baseDoNome("Rosca Scott")?.capacidades?.primario).toEqual(["biceps"]);
    expect(baseDoNome("Tríceps Pulley")?.capacidades?.primario).toEqual(["triceps"]);
    expect(baseDoNome("Cadeira Abdominal")?.capacidades?.primario).toEqual(["abdomen"]);
    expect(baseDoNome("Extensão Lombar")?.capacidades?.primario).toEqual(["lombar"]);
  });

  it("não confunde móvel de guarda com aparelho de treino", () => {
    // "rack" (4) casaria a gaiola de agachamento e a torre de anilhas passaria
    // a declarar cobertura de perna.
    expect(baseDoNome("Rack de Anilhas")?.nome).toBe("Estante de guarda (halteres e anilhas)");
    expect(baseDoNome("Rack de Anilhas")?.capacidades).toBeUndefined();
    expect(baseDoNome("Power Rack")?.nome).toBe("Rack / Gaiola");
  });

  it("empurrar vertical não vira elevação lateral", () => {
    // A chave "ombro" da elevação lateral pegava qualquer desenvolvimento.
    expect(baseDoNome("Desenvolvimento de Ombros")?.capacidades?.padroes).toContain("empurrar_vertical");
    expect(baseDoNome("Impact Delt Raise")?.capacidades?.padroes).toEqual(["abducao_ombro"]);
  });

  it("a chave casa em início de palavra, e sufixo continua livre", () => {
    expect(baseDoNome("Cadeira Adutora")?.nome).toBe("Abdutora & Adutora");
    expect(baseDoNome("Colchonetes D80")?.nome).toBe("Colchonetes");
    // "step" no miolo de outra palavra não pode virar acessório funcional.
    expect(baseDoNome("Step Mill")?.nome).toBe("Escada (Stepmill)");
    expect(baseDoNome("Aparelho sem nome conhecido")).toBeNull();
  });

  it("quando uma chave é pedaço de outra, a mais específica vence", () => {
    // Toda chave contida em outra é uma ambiguidade em potencial: o nome que
    // casa a longa casa a curta também. A regra da chave mais longa tem que
    // resolver TODAS elas a favor da entrada mais específica.
    let pares = 0;
    for (const dono of BASE_EQUIP) {
      for (const longa of dono.chaves) {
        for (const outro of BASE_EQUIP) {
          if (outro === dono) continue;
          for (const curta of outro.chaves) {
            if (curta === longa || !longa.includes(curta)) continue;
            pares++;
            expect(baseDoNome(longa)?.nome, `"${curta}" (${outro.nome}) dentro de "${longa}"`).toBe(dono.nome);
          }
        }
      }
    }
    expect(pares).toBeGreaterThan(0); // o teste precisa estar de fato exercitando algo
  });
});

describe("base técnica — capacidades declaradas", () => {
  it("só usa vocabulário existente e nunca repete grupo entre primário e secundário", () => {
    for (const b of BASE_EQUIP) {
      expect(b.nome.trim().length, "toda entrada precisa de nome").toBeGreaterThan(0);
      const c = b.capacidades;
      if (!c) continue;
      expect(c.primario.length, `${b.nome}: capacidades sem primário`).toBeGreaterThan(0);
      for (const m of c.primario) expect(MUSCULOS_ORDEM, b.nome).toContain(m);
      for (const m of c.secundario ?? []) {
        expect(MUSCULOS_ORDEM, b.nome).toContain(m);
        expect(c.primario, `${b.nome}: "${m}" em primário e secundário`).not.toContain(m);
      }
      for (const p of c.padroes) expect(PADROES_ORDEM, b.nome).toContain(p);
      expect(new Set(c.primario).size).toBe(c.primario.length);
    }
  });

  it("todo grupo e todo padrão têm ao menos um equipamento que os atende", () => {
    // Régua da própria base: grupo que nenhuma entrada cobre nunca sairia de
    // "descoberto" e a sugestão de compra viria vazia.
    const primarios = new Set(BASE_EQUIP.flatMap((b) => b.capacidades?.primario ?? []));
    const padroes = new Set(BASE_EQUIP.flatMap((b) => b.capacidades?.padroes ?? []));
    const semPrimario = MUSCULOS_ORDEM.filter((m) => !primarios.has(m));
    // Antebraço é a exceção conhecida: nenhuma máquina de academia de
    // condomínio existe para ele — só entra como auxiliar de pegada.
    expect(semPrimario).toEqual(["antebraco"]);
    expect(PADROES_ORDEM.filter((p) => !padroes.has(p))).toEqual([]);
  });

  it("ergômetro declara cardiovascular mesmo sem exercício resistido", () => {
    // Coerência com nucleo.test.ts: `exercicios` continua vazio nos ergômetros
    // (não se faz musculação neles) e `capacidades` é independente disso.
    const item = (nome: string): ItemPosicionado => ({
      id: "x", nome, x_cm: 0, y_cm: 0, w_cm: 100, h_cm: 100, rotacao: 0,
      zona: "ergo", cenario: "essencial", preco: 0,
    });
    for (const nome of ["Esteira", "Bike Horizontal", "Bike Vertical", "Elíptico", "Escada"]) {
      const b = baseDoNome(nome);
      expect(exerciciosDoItem(item(nome)), nome).toEqual([]);
      expect(b?.capacidades?.primario, nome).toContain("cardiovascular");
      expect(b?.capacidades?.padroes, nome).toContain("cardio");
    }
    expect(baseDoNome("Esteira")?.capacidades).toEqual({ primario: ["cardiovascular"], padroes: ["cardio"] });
    // Esteira não treina perna: marcar quadríceps aqui esvaziaria a análise.
    expect(baseDoNome("Esteira")?.capacidades?.secundario).toBeUndefined();
  });

  it("móvel de guarda e área de solo não declaram estímulo nenhum", () => {
    for (const nome of ["Estante Dumbbells", "Torre Halteres", "Colchonetes", "Espaldar"]) {
      expect(baseDoNome(nome)?.capacidades, nome).toBeUndefined();
    }
  });
});

describe("análise de cobertura da cena", () => {
  const cobertura = analisarCobertura(heritageProjeto().cena!);
  const status = (m: Musculo) => cobertura.musculos.find((l) => l.musculo === m)!.status;

  it("classifica os 15 grupos, sem sobra nem repetição", () => {
    expect(cobertura.musculos.map((l) => l.musculo)).toEqual(MUSCULOS_ORDEM);
    const { cobertos, fracos, descobertos } = cobertura.resumo;
    expect(cobertos + fracos + descobertos).toBe(MUSCULOS_ORDEM.length);
    expect(cobertura.resumo.padroesTotal).toBe(Object.keys(PADROES).length);
  });

  it("o modelo Heritage cobre o que tem e acusa o que falta", () => {
    // Tem estação de polias, leg press, extensora, flexora e abdutora/adutora:
    for (const m of ["peitoral", "costas", "ombros", "quadriceps", "posterior", "gluteos", "adutores", "abdutores"] as Musculo[]) {
      expect(status(m), m).toBe("coberto");
    }
    expect(status("cardiovascular")).toBe("coberto"); // 4 esteiras + bikes + escada
    // Não tem banco lombar nem máquina de abdômen; a panturrilha só aparece
    // como acessório do Smith e do leg press.
    expect(status("lombar")).toBe("descoberto");
    expect(status("abdomen")).toBe("fraco");
    expect(status("panturrilha")).toBe("fraco");
    // Nenhum item do modelo fica de fora da conta por nome não reconhecido.
    expect(cobertura.naoReconhecidos).toEqual([]);
    expect(cobertura.resumo.itensAvaliados).toBeGreaterThan(10);
  });

  it("nomeia os equipamentos que sustentam cada grupo", () => {
    const costas = cobertura.musculos.find((l) => l.musculo === "costas")!;
    expect(costas.primarios).toContain("Puxada + Remada");
    expect(costas.primarios.every((n) => n !== "")).toBe(true);
    // Um equipamento não pode aparecer como primário E secundário do mesmo grupo.
    for (const l of cobertura.musculos) {
      for (const n of l.secundarios) expect(l.primarios, `${l.musculo}: ${n}`).not.toContain(n);
    }
  });

  it("o eixo do movimento mostra o que o eixo do músculo esconde", () => {
    const pad = (p: string) => cobertura.padroes.find((l) => l.padrao === p)!;
    expect(pad("puxar_horizontal").coberto).toBe(true);
    expect(pad("puxar_vertical").coberto).toBe(true);
    expect(pad("extensao_joelho").equipamentos).toContain("Cadeira Extensora");
    // Prancha e roda abdominal não têm aparelho na sala.
    expect(pad("core_anti_extensao").coberto).toBe(false);
    expect(cobertura.resumo.padroesCobertos).toBe(cobertura.padroes.filter((l) => l.coberto).length);
  });

  it("sugere compra só do que falta, e nada que já esteja na sala", () => {
    const nomes = cobertura.sugestoes.map((s) => s.equipamento);
    expect(nomes.length).toBeGreaterThan(0);
    expect(new Set(nomes).size).toBe(nomes.length);
    // O que falta aparece; o que já existe, não.
    expect(cobertura.sugestoes.some((s) => s.musculos.includes("lombar"))).toBe(true);
    expect(nomes).not.toContain("Leg Press 45°");
    expect(nomes).not.toContain("Puxada + Remada");
    for (const s of cobertura.sugestoes) {
      expect(s.musculos.length + s.padroes.length, s.equipamento).toBeGreaterThan(0);
      for (const m of s.musculos) expect(status(m), `${s.equipamento} sugerido para ${m}`).not.toBe("coberto");
      expect(s.porque).toContain("Fecha");
    }
    // O kit funcional resolve abdômen e anti-extensão de uma vez: por resolver
    // duas lacunas, o guloso tem que escolhê-lo antes das máquinas de uma só.
    expect(nomes[0]).toBe("Kit Funcional");
  });

  it("mostra a CONSEQUÊNCIA de cortar o orçamento, não só o preço", () => {
    const [essencial, balanceado, premium] = cobertura.porCenario;
    expect([essencial.cenario, balanceado.cenario, premium.cenario]).toEqual(["essencial", "balanceado", "premium"]);
    // Cobertura é acumulativa: nada que o Essencial cobre pode sumir no Premium.
    for (const m of essencial.cobertos) expect(premium.cobertos).toContain(m);
    expect(premium.cobertos.length).toBeGreaterThan(essencial.cobertos.length);
    // Cortar para o Essencial custa perna posterior e quadril lateral: no
    // Essencial eles são no máximo coadjuvantes (o leg press recruta, não
    // treina), e é o Balanceado que os promove a estímulo principal.
    for (const m of ["posterior", "adutores", "abdutores"] as Musculo[]) {
      expect(essencial.cobertos, m).not.toContain(m);
      expect([...essencial.fracos, ...essencial.descobertos], m).toContain(m);
      expect(balanceado.ganha, m).toContain(m);
    }
    expect(essencial.descobertos).toContain("lombar");
    // O Premium do modelo é variedade, não cobertura nova.
    expect(premium.ganha).toEqual([]);
    // O último nível bate com a análise cheia.
    expect(premium.cobertos).toEqual(cobertura.musculos.filter((l) => l.status === "coberto").map((l) => l.musculo));
  });

  it("não quebra na cena vazia e avisa o que não reconheceu", () => {
    const vazia: Cena = { sala: { largura_cm: 500, profundidade_cm: 400 }, planta: null, itens: [] };
    const c = analisarCobertura(vazia);
    expect(c.resumo.descobertos).toBe(MUSCULOS_ORDEM.length);
    expect(c.sugestoes.length).toBeGreaterThan(0); // sala vazia = tudo a comprar

    const desconhecida: Cena = {
      ...vazia,
      itens: [{
        id: "a", nome: "Aparelho XPTO 3000", x_cm: 0, y_cm: 0, w_cm: 100, h_cm: 100,
        rotacao: 0, zona: "forca", cenario: "balanceado", preco: 1,
      }],
    };
    expect(analisarCobertura(desconhecida).naoReconhecidos).toEqual(["Aparelho XPTO 3000"]);
    // Com o catálogo em mãos, o item renomeado volta para a análise.
    const comCatalogo = analisarCobertura(
      { ...desconhecida, itens: [{ ...desconhecida.itens[0], equipamentoId: "e1" }] },
      [{ id: "e1", nome: "Leg Press 45°", largura_cm: 246, profundidade_cm: 158, zona: "forca", preco: 0 }],
    );
    expect(comCatalogo.naoReconhecidos).toEqual([]);
    expect(comCatalogo.musculos.find((l) => l.musculo === "quadriceps")!.status).toBe("coberto");
  });
});

describe("normalização de nome (a régua de todo casamento)", () => {
  it("ignora acento, caixa e espaço repetido", () => {
    expect(normalizar("  ELEVAÇÃO   Pélvica ")).toBe("elevacao pelvica");
  });
});
