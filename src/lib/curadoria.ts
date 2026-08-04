// Curadoria: o conhecimento técnico que faz o Dossiê explicar as escolhas.
//
// Três perguntas que o síndico faz e que o PDF precisa responder sozinho:
//   1. "Por que esta CATEGORIA está no projeto?"  → ESPEC_ZONA
//   2. "O que é este EQUIPAMENTO e para que serve?" → BASE_EQUIP / explicarItem
//   3. "O que entra em cada CENÁRIO e por quê?"    → CENARIO_DEF / cenarioSugerido
//
// Tudo aqui é PADRÃO. O consultor sobrescreve por projeto na ficha do
// equipamento (função/restrições/detalhes) e na nota da categoria — o texto do
// projeto sempre vence o padrão.

import type { Cena, Cenario, Equipamento, ItemPosicionado, Zona } from "./types";
import { CENARIOS, ZONAS } from "./types";

/** minúsculas, sem acento — para casar nome do projeto com a base. */
export const normalizar = (s: string): string =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// ── 1. Especificação de cada categoria (zona) ───────────────────────────────

export interface EspecCategoria {
  /** O que é a categoria, em uma frase. */
  oque: string;
  /** O que ela entrega para o morador / para o condomínio. */
  entrega: string;
  /** Como se dimensiona — a régua que justifica a quantidade de estações. */
  criterio: string;
  /** O que a obra e a operação precisam garantir nesta zona. */
  operacao: string;
}

export const ESPEC_ZONA: Record<Zona, EspecCategoria> = {
  forca: {
    oque:
      "Equipamentos de trajetória guiada — cabos, alavancas e trilhos. A máquina define o caminho do movimento e o morador controla apenas a carga.",
    entrega:
      "Ganho de força e hipertrofia com risco baixo de execução. É a zona que sustenta o treino quando o professor não está ao lado, porque a própria máquina limita o erro.",
    criterio:
      "Cobrir os grandes padrões de movimento sem repetir função: empurrar (peito/ombro), puxar (costas), estender e flexionar joelho, quadril e uma estação de polias para os complementos.",
    operacao:
      "Estação individual (1 morador por vez). Prever folga lateral para entrada e saída, e espaço à frente das máquinas com banco reclinável. Piso nivelado e capaz de receber carga concentrada.",
  },
  ergo: {
    oque:
      "Aparelhos de esforço contínuo: esteira, bicicleta, elíptico e escada. É por onde a maioria dos moradores começa e a zona de maior rotatividade da sala.",
    entrega:
      "Condicionamento cardiovascular, controle de peso e aquecimento para o restante do treino. Também é a zona de maior valor percebido — é o que o condômino vê ao abrir a porta.",
    criterio:
      "Um aparelho para cada 12 a 15 usuários previstos no horário de pico, garantindo pelo menos duas mecânicas diferentes (com e sem impacto) para atender joelho e quadril sensíveis.",
    operacao:
      "Exige tomada dedicada por aparelho e recuo livre atrás das esteiras (segurança em caso de queda). Posicionar de frente para o campo visual mais aberto da sala — janela, espelho ou TV.",
  },
  livre: {
    oque:
      "Halteres, barras, anilhas, bancos e racks. A carga é solta: quem estabiliza o movimento é o próprio morador.",
    entrega:
      "O estímulo mais completo da sala, por exigir estabilização e coordenação. É a zona procurada pelo público de hipertrofia e a que mais rende com professor presente.",
    criterio:
      "Progressão contínua de halteres (sem buracos na sequência de peso), bancos ajustáveis em número suficiente para não formar fila e área de piso reforçado para apoio de carga.",
    operacao:
      "Piso emborrachado sob a área de carga (queda de halteres e anilhas), folga à frente dos bancos e suporte de guarda para 100% do material — peso solto fora do rack é a principal causa de acidente e de perda de patrimônio.",
  },
  prep: {
    oque:
      "Área de solo e apoio: colchonetes, espaldar, acessórios de mobilidade e alongamento.",
    entrega:
      "Aquecimento, alongamento, mobilidade e trabalho de core. É o que faz a academia servir também ao morador mais velho, ao iniciante e a quem está voltando de lesão.",
    criterio:
      "Reservar área livre de piso fora do fluxo de circulação, suficiente para dois moradores deitados ao mesmo tempo sem se tocar.",
    operacao:
      "Manter permanentemente livre de equipamento. Colchonetes guardados em suporte vertical — no chão, viram obstáculo e duram menos.",
  },
};

/** Espec. da categoria + a nota que o consultor escreveu para ESTE projeto. */
export function especificacaoDaZona(zona: Zona, cena?: Cena): EspecCategoria & { nota?: string } {
  const nota = cena?.especificacoes?.[zona]?.trim();
  return { ...ESPEC_ZONA[zona], ...(nota ? { nota } : {}) };
}

// ── 2. Base de equipamentos: o que é, o que trabalha, por que está no projeto ─

export interface BaseEquip {
  /** Trechos do nome que identificam o equipamento (minúsculo, sem acento). */
  chaves: string[];
  cenario: Cenario;
  /** Exercícios RESISTIDOS de musculação executáveis no aparelho. Ausente
   *  de propósito em ergômetros, móveis de guarda e área de solo: ali não se
   *  faz exercício resistido, e inventar lista ali seria enganar o síndico. */
  exercicios?: string[];
  oque: string;
  trabalha: string;
  indicacao: string;
  atencao: string;
}

/** Ordem não importa: casa sempre a chave MAIS LONGA encontrada no nome. */
export const BASE_EQUIP: BaseEquip[] = [
  // Regra dos textos: descrever o que o equipamento É e para que serve, de
  // forma geral e verificável — sem promessa e sem enfeite. Lista de
  // exercícios só onde ela é FECHADA (máquina de trajetória fixa). Estação
  // multiuso, banco e rack não têm lista: seria impossível ser completo, e
  // lista incompleta passa informação errada.

  // ── Força guiada ─────────────────────────────────────────────────────────
  {
    chaves: ["wire cross + smith", "cross + smith", "smith rack", "wire cross"],
    cenario: "essencial",
    oque: "Estação combinada: barra guiada (Smith) de um lado e torres de polias reguláveis do outro.",
    trabalha: "Corpo inteiro — pernas e glúteos na barra guiada; peito, costas, ombros e braços nos cabos.",
    indicacao: "Estação para múltiplos exercícios guiados e de cabo — concentra em uma estrutura o treino de vários grupos musculares.",
    atencao: "Exige pé-direito compatível e piso firme. Trava de segurança da barra deve ser revisada periodicamente.",
  },
  {
    chaves: ["cross over", "crossover", "polia dupla", "estacao de polias"],
    cenario: "premium",
    oque: "Torre de polias com dois braços reguláveis em altura e ângulo; a carga vem por cabo.",
    trabalha: "Peito, costas, ombros, braços e core, conforme a regulagem e o acessório usados.",
    indicacao: "Estação para múltiplos exercícios de cabo — amplia a variedade de treino sem ocupar nova área.",
    atencao: "Precisa de área livre entre as torres. Puxadores devem ficar em suporte próprio.",
  },
  {
    chaves: ["puxada + remada", "puxada e remada", "pulley", "puxada", "remada"],
    cenario: "essencial",
    oque: "Estação dupla de costas: puxada alta em cima, remada sentada embaixo.",
    trabalha: "Dorsais, trapézio, romboides, posterior de ombro e bíceps.",
    indicacao: "Cobre os movimentos de puxar — a base do treino de costas em qualquer sala.",
    atencao: "Banco e apoio de joelho precisam de regulagem para usuários de estaturas diferentes.",
    exercicios: [
      "Puxada frontal (pegadas aberta, supinada e neutra)",
      "Puxada unilateral",
      "Remada sentada (pegadas neutra e aberta)",
      "Remada unilateral",
    ],
  },
  {
    chaves: ["leg press"],
    cenario: "essencial",
    oque: "Plataforma inclinada a 45° em que o usuário empurra a carga com as pernas, sentado e com a coluna apoiada.",
    trabalha: "Quadríceps, glúteos e adutores.",
    indicacao: "Treino de pernas com carga alta e coluna apoiada — adequado a salas de uso autônomo.",
    atencao: "Ocupa muita profundidade. Carga alta requer liberação em caso de hérnia ou prótese de quadril.",
    exercicios: [
      "Leg press tradicional",
      "Variações de posição dos pés (ênfase em glúteo, quadríceps ou adutores)",
      "Leg press unilateral",
      "Panturrilha na plataforma",
    ],
  },
  {
    chaves: ["squat machine", "agachamento guiado", "hack"],
    cenario: "balanceado",
    oque: "Máquina de agachamento com trajetória guiada e apoio para ombros ou costas.",
    trabalha: "Quadríceps, glúteos e posterior de coxa.",
    indicacao: "Agachamento com carga sem exigir a técnica do exercício livre.",
    atencao: "Conferir a trava de segurança antes de cada série.",
    exercicios: ["Agachamento guiado", "Variações de posição dos pés", "Agachamento unilateral", "Panturrilha em pé"],
  },
  {
    chaves: ["leg extension", "extensora", "extensao de joelho"],
    cenario: "balanceado",
    oque: "Cadeira com rolo à frente dos tornozelos: sentado, o usuário estende os joelhos contra a carga.",
    trabalha: "Quadríceps, de forma isolada.",
    indicacao: "Isola o quadríceps sem carga na coluna — serve de iniciante a avançado.",
    atencao: "Alinhar o eixo do joelho ao eixo da máquina.",
    exercicios: ["Extensão de joelhos bilateral", "Extensão unilateral"],
  },
  {
    chaves: ["leg curl", "flexora", "mesa flexora"],
    cenario: "balanceado",
    oque: "Mesa (deitado) ou cadeira (sentado) em que o usuário flexiona os joelhos contra a carga.",
    trabalha: "Posterior de coxa (isquiotibiais).",
    indicacao: "Par da extensora — cobre a flexão de joelho, que nenhuma outra máquina da sala isola.",
    atencao: "O rolo apoia acima do calcanhar; alinhar o eixo do joelho ao da máquina.",
    exercicios: ["Flexão de joelhos bilateral", "Flexão unilateral"],
  },
  {
    chaves: ["elevacao pelvica", "hip thrust", "gluteo"],
    cenario: "balanceado",
    oque: "Banco com apoio para as costas e almofada sobre o quadril: o usuário eleva o quadril contra a carga.",
    trabalha: "Glúteos, com participação do posterior de coxa.",
    indicacao: "Exercício específico de glúteo com carga, em máquina — execução mais simples e segura que a versão com barra livre.",
    atencao: "Almofada de quadril em bom estado; atenção com carga alta em quem tem dor lombar.",
    exercicios: ["Elevação pélvica bilateral", "Elevação pélvica unilateral"],
  },
  {
    chaves: ["abducao", "aducao", "adutor", "abdutor", "dual inner", "inner outer"],
    cenario: "balanceado",
    oque: "Cadeira com apoios laterais nas coxas: abrir as pernas contra a carga (abdução) ou fechá-las (adução).",
    trabalha: "Glúteo médio e abdutores; adutores da coxa.",
    indicacao: "Cobre o quadril no plano lateral, que as demais máquinas não alcançam.",
    atencao: "Começar com amplitude reduzida em quem tem quadril rígido.",
    exercicios: ["Abdução de quadril sentado", "Adução de quadril sentado"],
  },
  {
    chaves: ["delt raise", "elevacao lateral", "deltoide", "ombro"],
    cenario: "premium",
    oque: "Máquina de elevação lateral: sentado, o usuário afasta os braços do corpo contra almofadas.",
    trabalha: "Deltoide medial.",
    indicacao: "Isola o ombro com trajetória guiada — movimento que, com halteres, exige mais técnica.",
    atencao: "Alinhar o eixo do ombro ao da máquina. Evitar em quadro agudo de tendinite.",
    exercicios: ["Elevação lateral bilateral", "Elevação lateral unilateral"],
  },
  {
    chaves: ["supino maquina", "chest press", "peitoral", "voador", "peck"],
    cenario: "essencial",
    oque: "Máquina de empurrar sentado (chest press) ou de fechar os braços à frente (voador).",
    trabalha: "Peitoral, ombro anterior e tríceps.",
    indicacao: "Treino de peito sem necessidade de apoio de outra pessoa.",
    atencao: "Regular o assento para as mãos ficarem na linha do peito.",
    exercicios: ["Pressão de peito (supino na máquina)", "Crucifixo (voador)"],
  },
  {
    chaves: ["triceps", "biceps", "rosca", "panturrilha", "abdominal", "lombar"],
    cenario: "premium",
    oque: "Máquina de grupo muscular isolado, com trajetória guiada e carga por pino.",
    trabalha: "O grupo indicado no nome do aparelho.",
    indicacao: "Complemento — entra depois que os movimentos principais estão cobertos.",
    atencao: "Ajustar assento e apoios antes da primeira série.",
  },

  // ── Ergometria ───────────────────────────────────────────────────────────
  {
    chaves: ["esteira", "treadmill"],
    cenario: "essencial",
    oque: "Esteira motorizada com regulagem de velocidade e inclinação.",
    trabalha: "Condicionamento cardiovascular; caminhada e corrida.",
    indicacao: "O equipamento de cardio mais usado em academias de condomínio — atende de quem caminha a quem corre.",
    atencao: "Tomada dedicada e recuo livre atrás. Manutenção do amortecimento e da manta.",
  },
  {
    chaves: ["escada", "stepmill", "simulador de escada"],
    cenario: "premium",
    oque: "Simulador de escada com degraus rolantes contínuos.",
    trabalha: "Condicionamento cardiovascular; glúteos e coxas.",
    indicacao: "Cardio de intensidade alta, sem necessidade de velocidade de corrida.",
    atencao: "Pé-direito elevado; é ruidoso — afastar de parede compartilhada com unidade. Não indicado a quem tem instabilidade de equilíbrio.",
  },
  {
    chaves: ["eliptico", "transport", "cross trainer"],
    cenario: "balanceado",
    oque: "Aparelho de passada elíptica com pedais suspensos e braços móveis — o pé não deixa o pedal.",
    trabalha: "Condicionamento cardiovascular, sem impacto; pernas e braços.",
    indicacao: "Alternativa de cardio sem impacto para quem não pode correr.",
    atencao: "Verificar folga para a passada completa e para os braços.",
  },
  {
    chaves: ["bike horizontal", "bicicleta horizontal", "reclinada", "recumbent"],
    cenario: "essencial",
    oque: "Bicicleta com assento tipo poltrona, encosto e pedais à frente do corpo.",
    trabalha: "Condicionamento cardiovascular e pernas, com a coluna apoiada.",
    indicacao: "A opção de cardio mais acessível para idosos e pessoas em reabilitação: entrada fácil e coluna apoiada.",
    atencao: "Regular a distância do assento — o joelho não deve estender por completo.",
  },
  {
    chaves: ["bike vertical", "bicicleta vertical", "bike ergometrica"],
    cenario: "balanceado",
    oque: "Bicicleta ergométrica de postura vertical.",
    trabalha: "Condicionamento cardiovascular e pernas, sem impacto.",
    indicacao: "Cardio compacto — ocupa a menor área entre os ergômetros.",
    atencao: "Ajuste simples de assento é essencial para o uso rotativo.",
  },
  {
    chaves: ["spinning", "bike spinning", "indoor cycle"],
    cenario: "premium",
    oque: "Bicicleta de roda de inércia com regulagem fina de carga, para pedalar sentado ou em pé.",
    trabalha: "Condicionamento cardiovascular em intensidade alta; pernas e glúteos.",
    indicacao: "Atende quem busca treino intenso; complementa (não substitui) o cardio da sala.",
    atencao: "Requer ajuste de assento e guidão a cada usuário; manutenção frequente de freio e correia.",
  },
  {
    chaves: ["remo", "remoergometro", "rower"],
    cenario: "premium",
    oque: "Ergômetro de remada com trilho e resistência a ar, água ou magnética.",
    trabalha: "Corpo inteiro — pernas, costas, core e braços.",
    indicacao: "Cardio de corpo inteiro em área pequena, para quem já tem a técnica da remada.",
    atencao: "Requer orientação inicial — a remada sem técnica sobrecarrega a lombar.",
  },

  // ── Peso livre ───────────────────────────────────────────────────────────
  {
    chaves: ["estante dumbbell", "estante de halteres", "torre halteres", "torre de halteres", "suporte de halteres", "rack de halteres"],
    cenario: "essencial",
    oque: "Estante em aço para guarda dos halteres em ordem de peso.",
    trabalha: "Guarda e organização — não é aparelho de treino.",
    indicacao: "Mantém o peso livre organizado e fora do chão.",
    atencao: "Fixar ou lastrar contra tombamento; prever folga à frente para retirada dos pares.",
  },
  {
    chaves: ["banco 0-90", "banco regulavel", "banco ajustavel", "banco 0 90"],
    cenario: "essencial",
    oque: "Banco com encosto regulável de 0° (horizontal) a 90° (vertical).",
    trabalha: "Apoio para exercícios de peito, ombro, costas e braços.",
    indicacao: "Banco para múltiplos exercícios com pesos livres, como os halteres — a regulagem de ângulo multiplica as possibilidades de treino.",
    atencao: "Verificar periodicamente a trava do encosto e o estofamento.",
  },
  {
    chaves: ["banco supino", "supino reto", "banco reto"],
    cenario: "balanceado",
    oque: "Banco horizontal com suportes para barra.",
    trabalha: "Peitoral, ombro anterior e tríceps.",
    indicacao: "Banco para exercícios de empurrar com barra e halteres.",
    atencao: "Com barra e carga alta, usar com acompanhamento ou dentro de rack com segurança.",
  },
  {
    chaves: ["banco declinado", "banco inclinado"],
    cenario: "premium",
    oque: "Banco de ângulo fixo (inclinado ou declinado).",
    trabalha: "Apoio para variações de exercícios com halteres e barra.",
    indicacao: "Banco para múltiplos exercícios com pesos livres, em ângulo fixo — complementa o banco regulável.",
    atencao: "Por ser de ângulo fixo, priorizar o banco regulável quando a área for disputada.",
  },
  {
    chaves: ["rack", "gaiola", "power rack", "squat rack"],
    cenario: "balanceado",
    oque: "Estrutura de colunas com apoios e barras de segurança reguláveis, para treino com barra livre.",
    trabalha: "Estrutura para múltiplos exercícios com barra — agachamento, supino, remada e variações.",
    indicacao: "Torna o treino pesado com barra mais seguro: as barras de segurança param a carga.",
    atencao: "Piso reforçado e altura livre; regular as barras de segurança antes de cada série.",
  },

  // ── Preparação ───────────────────────────────────────────────────────────
  {
    chaves: ["colchonete", "tatame", "colchao"],
    cenario: "essencial",
    oque: "Colchonetes de alta densidade para exercícios de solo.",
    trabalha: "Core, alongamento e exercícios de solo em geral.",
    indicacao: "Item de menor custo e uso constante — aquecimento, abdominais e alongamento.",
    atencao: "Guardar em suporte vertical; no chão viram obstáculo e estragam mais rápido.",
  },
  {
    chaves: ["espaldar", "barra sueca"],
    cenario: "essencial",
    oque: "Estrutura vertical de barras fixada à parede, usada como apoio para alongamento e mobilidade.",
    trabalha: "Alongamento e mobilidade com apoio.",
    indicacao: "Ocupa apenas parede e serve principalmente ao público que precisa de apoio para alongar.",
    atencao: "Fixação em alvenaria firme; conferir o aperto dos parafusos periodicamente.",
  },
  {
    chaves: ["funcional", "kettlebell", "bola", "step", "elastico", "trx"],
    cenario: "balanceado",
    oque: "Acessórios de treino funcional guardados em suporte próprio.",
    trabalha: "Core, equilíbrio, coordenação e condicionamento geral.",
    indicacao: "Ampliam a variedade de treino com custo baixo e área quase nula.",
    atencao: "Exigem área livre de solo e suporte de guarda.",
  },
];

/** Entrada da base que melhor descreve o nome (casa a chave mais longa). */
export function baseDoNome(nome: string): BaseEquip | null {
  const n = normalizar(nome);
  let achado: BaseEquip | null = null;
  let tamanho = 0;
  for (const b of BASE_EQUIP) {
    for (const chave of b.chaves) {
      if (n.includes(chave) && chave.length > tamanho) { achado = b; tamanho = chave.length; }
    }
  }
  return achado;
}

/** Cenário sugerido para um equipamento (base técnica → padrão da zona). */
export function cenarioSugerido(nome: string, zona: Zona): Cenario {
  const b = baseDoNome(nome);
  if (b) return b.cenario;
  // Sem correspondência na base: preparação é barata e indispensável; o resto
  // entra como balanceado, que é o cenário recomendado por padrão.
  return zona === "prep" ? "essencial" : "balanceado";
}

/** Explicação de UM equipamento do projeto — texto do consultor vence o padrão. */
export interface ExplicacaoEquip {
  oque: string;
  trabalha: string;
  indicacao: string;
  atencao: string;
  detalhes?: string;
  /** Exercícios resistidos de musculação executáveis no aparelho. Vazio quando
   *  o equipamento não é de musculação (ergômetro, guarda, solo). */
  exercicios: string[];
  /** true quando nada foi escrito na ficha e o texto veio 100% do padrão. */
  padrao: boolean;
}

/** Lista limpa: sem vazios, sem repetidos, na ordem em que foi escrita. */
export function normalizarExercicios(lista?: string[] | null): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const e of lista ?? []) {
    const t = String(e || "").trim();
    if (!t) continue;
    const chave = normalizar(t);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(t);
  }
  return out;
}

/** Exercícios do item: ficha do projeto > catálogo > base técnica. */
export function exerciciosDoItem(item: ItemPosicionado, cat?: Equipamento | null): string[] {
  const doItem = normalizarExercicios(item.exercicios);
  if (doItem.length) return doItem;
  const doCatalogo = normalizarExercicios(cat?.exercicios);
  if (doCatalogo.length) return doCatalogo;
  return normalizarExercicios(baseDoNome(item.nome)?.exercicios);
}

export function explicarItem(item: ItemPosicionado, cat?: Equipamento | null): ExplicacaoEquip {
  const b = baseDoNome(item.nome);
  const z = ESPEC_ZONA[item.zona] ?? ESPEC_ZONA.livre;
  const daFicha = !!(item.funcao || item.restricoes || item.detalhes || item.exercicios?.length || cat?.descricao);
  return {
    oque: (cat?.descricao || "").trim() || b?.oque || z.oque,
    trabalha: b?.trabalha || "—",
    indicacao: (item.funcao || "").trim() || b?.indicacao || z.entrega,
    atencao: (item.restricoes || "").trim() || b?.atencao || z.operacao,
    detalhes: (item.detalhes || cat?.obs || "").trim() || undefined,
    exercicios: exerciciosDoItem(item, cat),
    padrao: !daFicha,
  };
}

// ── 3. Cenários: o que significa cada nível ─────────────────────────────────

export interface DefCenario {
  /** Uma linha: o que este nível é. */
  resumo: string;
  /** A régua de classificação — por que um equipamento entra neste nível. */
  criterio: string;
}

export const CENARIO_DEF: Record<Cenario, DefCenario> = {
  essencial: {
    resumo: "O núcleo indispensável — a academia cumpre sua função com isto e nada menos.",
    criterio:
      "Entram os equipamentos sem os quais um grupo muscular ou uma capacidade física ficaria descoberto, e os que sustentam o uso seguro da sala. Cortar qualquer item deste nível deixa um buraco no treino.",
  },
  balanceado: {
    resumo: "O nível recomendado — cobre todos os perfis de morador com folga de operação.",
    criterio:
      "Acrescenta ao Essencial a variedade que evita fila no horário de pico, os pares que faltavam (flexora para a extensora, sem impacto para a esteira) e o que o perfil de uso do condomínio pede.",
  },
  premium: {
    resumo: "O projeto completo — especialização, conforto e o que dá vitrine à sala.",
    criterio:
      "Acrescenta os equipamentos de especialização e de alto valor percebido. São itens que elevam a sala, mas cuja ausência não compromete nenhum treino.",
  },
};

// ── 4. Leituras agregadas para o Dossiê ────────────────────────────────────

/** Exercícios resistidos DISTINTOS que a sala inteira oferece (sem repetir o
 *  que dois aparelhos iguais fazem). */
export function exerciciosDaCena(cena: Cena, cat?: (it: ItemPosicionado) => Equipamento | null | undefined): string[] {
  const todos: string[] = [];
  for (const it of cena.itens ?? []) todos.push(...exerciciosDoItem(it, cat?.(it)));
  return normalizarExercicios(todos);
}

export interface ComposicaoZona {
  zona: Zona;
  label: string;
  cor: string;
  itens: ItemPosicionado[];
  n: number;
  subtotal: number;
  areaM2: number;
  porCenario: Record<Cenario, { n: number; total: number }>;
}

/** Uma linha por zona presente na cena, na ordem canônica das ZONAS. */
export function composicaoZonas(cena: Cena): ComposicaoZona[] {
  const itens = cena.itens ?? [];
  const ordem = Object.keys(ZONAS) as Zona[];
  return ordem
    .filter((z) => itens.some((i) => i.zona === z))
    .map((zona) => {
      const daZona = itens.filter((i) => i.zona === zona);
      const porCenario = {
        essencial: { n: 0, total: 0 },
        balanceado: { n: 0, total: 0 },
        premium: { n: 0, total: 0 },
      } as Record<Cenario, { n: number; total: number }>;
      for (const i of daZona) {
        const c = CENARIOS[i.cenario] ? i.cenario : "balanceado";
        porCenario[c].n += 1;
        porCenario[c].total += i.preco || 0;
      }
      return {
        zona,
        label: ZONAS[zona].label,
        cor: ZONAS[zona].cor,
        itens: daZona,
        n: daZona.length,
        subtotal: daZona.reduce((s, i) => s + (i.preco || 0), 0),
        areaM2: daZona.reduce((s, i) => s + (i.w_cm / 100) * (i.h_cm / 100), 0),
        porCenario,
      };
    });
}

export interface DetalheCenario {
  cenario: Cenario;
  label: string;
  cor: string;
  /** Itens que ESTE nível acrescenta (não cumulativo). */
  nNivel: number;
  incremento: number;
  /** Acumulado deste nível para baixo (é o que vai ao orçamento). */
  nAcumulado: number;
  total: number;
}

/** Cenários com o que cada nível ACRESCENTA — o cumulativo sozinho esconde isso. */
export function detalheCenarios(cena: Cena): DetalheCenario[] {
  const itens = cena.itens ?? [];
  const niveis = (Object.keys(CENARIOS) as Cenario[]).sort((a, b) => CENARIOS[a].ordem - CENARIOS[b].ordem);
  let nAcum = 0;
  let acum = 0;
  return niveis.map((cenario) => {
    const doNivel = itens.filter((i) => (CENARIOS[i.cenario] ? i.cenario : "balanceado") === cenario);
    const incremento = doNivel.reduce((s, i) => s + (i.preco || 0), 0);
    nAcum += doNivel.length;
    acum += incremento;
    return {
      cenario,
      label: CENARIOS[cenario].label,
      cor: CENARIOS[cenario].cor,
      nNivel: doNivel.length,
      incremento,
      nAcumulado: nAcum,
      total: acum,
    };
  });
}

/** true quando ninguém classificou nada (tudo no padrão "balanceado"). */
export function classificacaoPendente(cena: Cena): boolean {
  const itens = cena.itens ?? [];
  if (!itens.length) return false;
  return itens.every((i) => (CENARIOS[i.cenario] ? i.cenario : "balanceado") === "balanceado");
}
