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
  oque: string;
  trabalha: string;
  indicacao: string;
  atencao: string;
}

/** Ordem não importa: casa sempre a chave MAIS LONGA encontrada no nome. */
export const BASE_EQUIP: BaseEquip[] = [
  // ── Força guiada ─────────────────────────────────────────────────────────
  {
    chaves: ["wire cross + smith", "cross + smith", "smith rack", "wire cross"],
    cenario: "essencial",
    oque:
      "Estação combinada: de um lado a barra guiada do Smith, que corre em trilho fixo; do outro, torres de polias reguláveis em altura. Uma só estrutura entrega agachamento, supino e dezenas de exercícios de cabo.",
    trabalha: "Corpo inteiro — pernas e glúteos no Smith; peito, costas, ombros e braços nas polias.",
    indicacao:
      "É a peça de maior aproveitamento por metro quadrado do projeto. Resolve o treino completo de quem chega sem professor e concentra em um ponto o que exigiria quatro máquinas.",
    atencao:
      "Requer altura de pé-direito compatível e fixação em piso firme. A barra do Smith deve ter trava de segurança revisada periodicamente.",
  },
  {
    chaves: ["cross over", "crossover", "polia dupla", "estacao de polias"],
    cenario: "premium",
    oque:
      "Torre de polias com dois braços reguláveis em altura e ângulo. A carga vem por cabo, então a resistência é constante do início ao fim do movimento.",
    trabalha: "Peito, costas, ombros, braços e core — conforme a altura e o acessório usados.",
    indicacao:
      "Amplia o repertório sem ocupar nova área de treino: é onde o professor monta variações e onde o morador experiente busca o acabamento do treino.",
    atencao:
      "Precisa de área livre entre as torres para o movimento dos braços. Os puxadores devem ficar em suporte próprio, senão se perdem.",
  },
  {
    chaves: ["puxada + remada", "puxada e remada", "pulley", "puxada", "remada"],
    cenario: "essencial",
    oque:
      "Estação dupla de costas: em cima, a puxada alta (movimento de trazer a barra até o peito); embaixo, a remada sentada horizontal.",
    trabalha: "Dorsais, trapézio, romboides, posterior de ombro e bíceps.",
    indicacao:
      "Nenhuma sala funciona sem estação de puxar. É o contrapeso postural de quem passa o dia sentado — o exercício com maior efeito percebido em dor de coluna e ombro.",
    atencao:
      "O banco e o apoio de joelho precisam de regulagem; sem isso, o morador baixo perde a estabilidade e puxa com a lombar.",
  },
  {
    chaves: ["leg press"],
    cenario: "essencial",
    oque:
      "Plataforma inclinada a 45° na qual o morador empurra a carga com as pernas, sentado e apoiado no encosto.",
    trabalha: "Quadríceps, glúteos e adutores, com a coluna apoiada.",
    indicacao:
      "É a forma mais segura de treinar perna com carga alta em sala sem professor em tempo integral: a coluna fica apoiada e a trava de segurança impede o acidente clássico do agachamento livre.",
    atencao:
      "Ocupa muito espaço em profundidade. Não indicado com carga alta para quem tem hérnia de disco ou prótese de quadril sem liberação médica.",
  },
  {
    chaves: ["squat machine", "agachamento guiado", "hack"],
    cenario: "balanceado",
    oque:
      "Máquina de agachamento com trajetória guiada e apoio para ombros ou costas, que reproduz o agachamento livre sem exigir equilíbrio.",
    trabalha: "Quadríceps, glúteos e posterior de coxa.",
    indicacao:
      "Entrega o principal exercício de perna a quem não tem técnica para o agachamento com barra — a maioria absoluta dos moradores de condomínio.",
    atencao:
      "Conferir a trava de segurança antes de cada série. Amplitude deve ser reduzida em caso de dor patelar.",
  },
  {
    chaves: ["leg extension", "extensora", "extensao de joelho"],
    cenario: "balanceado",
    oque:
      "Cadeira com rolo à frente do tornozelo: sentado, o morador estende os joelhos contra a carga.",
    trabalha: "Quadríceps, de forma isolada.",
    indicacao:
      "Isola a coxa sem exigir equilíbrio nem carga na coluna. É a máquina de entrada para idosos, iniciantes e retorno de lesão de joelho — e a preferida do público de estética.",
    atencao:
      "Ajustar o encosto para que o joelho fique alinhado ao eixo da máquina. Amplitude completa pode incomodar joelho com condropatia.",
  },
  {
    chaves: ["leg curl", "flexora", "mesa flexora"],
    cenario: "balanceado",
    oque:
      "Mesa (deitado) ou cadeira (sentado) em que o morador flexiona os joelhos puxando o rolo contra a carga.",
    trabalha: "Posterior de coxa (isquiotibiais) e panturrilha.",
    indicacao:
      "Faz o par obrigatório da extensora: sem posterior treinado, o desequilíbrio com o quadríceps é a origem mais comum de lesão de joelho.",
    atencao:
      "Alinhar o eixo do joelho com o eixo da máquina. O rolo deve apoiar acima do calcanhar, nunca sobre o tendão.",
  },
  {
    chaves: ["elevacao pelvica", "hip thrust", "gluteo"],
    cenario: "balanceado",
    oque:
      "Banco de apoio para as costas com almofada sobre o quadril: o morador eleva o quadril contra a carga, partindo do chão.",
    trabalha: "Glúteos, com participação de posterior de coxa.",
    indicacao:
      "É o exercício de maior valor percebido pelo público feminino e o mais eficiente para glúteo. Em condomínio com perfil de estética, sua ausência é notada de imediato.",
    atencao:
      "Exige almofada de quadril em bom estado — sem ela o morador abandona o aparelho. Cuidado com carga alta em quem tem dor lombar.",
  },
  {
    chaves: ["abducao", "aducao", "adutor", "abdutor", "dual inner", "inner outer"],
    cenario: "balanceado",
    oque:
      "Cadeira com apoios laterais para as coxas: abrir as pernas contra a carga (abdução) ou fechá-las (adução). Muitas vezes o mesmo aparelho faz as duas funções.",
    trabalha: "Glúteo médio e abdutores (abrindo); adutores da coxa (fechando).",
    indicacao:
      "Cobre o quadril no plano lateral, que nenhuma outra máquina da sala alcança. Tem procura alta e ocupa pouca área.",
    atencao:
      "Higienizar o apoio a cada uso. Iniciar com amplitude reduzida — a abertura máxima com carga incomoda quem tem quadril rígido.",
  },
  {
    chaves: ["delt raise", "elevacao lateral", "deltoide", "ombro"],
    cenario: "premium",
    oque:
      "Máquina de elevação lateral: sentado, o morador afasta os braços do corpo contra almofadas, com trajetória guiada.",
    trabalha: "Deltoide medial (a porção que dá largura ao ombro).",
    indicacao:
      "Entrega com segurança o exercício que, feito com halteres, quase sempre sai com técnica errada. Item de acabamento estético — grande apelo, função não essencial.",
    atencao:
      "Ajustar a altura do assento para que o eixo do ombro coincida com o da máquina. Contraindicada em quadro agudo de tendinite do manguito.",
  },
  {
    chaves: ["supino maquina", "chest press", "peitoral", "voador", "peck"],
    cenario: "essencial",
    oque:
      "Máquina de empurrar sentado (chest press) ou de fechar os braços à frente (voador), com trajetória guiada.",
    trabalha: "Peitoral, ombro anterior e tríceps.",
    indicacao:
      "É o empurrar da sala com risco quase nulo: dispensa quem segure a barra, o que torna viável treinar peito sem professor ao lado.",
    atencao:
      "Regular a altura do assento para que as mãos fiquem na linha do peito. Reduzir amplitude em caso de dor no ombro.",
  },
  {
    chaves: ["triceps", "biceps", "rosca", "panturrilha", "abdominal", "lombar"],
    cenario: "premium",
    oque: "Máquina de grupo muscular isolado, com trajetória guiada e ajuste de carga por pino.",
    trabalha: "O grupo indicado no nome do aparelho.",
    indicacao:
      "Complementa o treino depois que os grandes movimentos já estão cobertos. Entra quando sobra área e orçamento.",
    atencao: "Ajustar assento e apoios antes da primeira série; o alinhamento articular é o que garante o resultado.",
  },

  // ── Ergometria ───────────────────────────────────────────────────────────
  {
    chaves: ["esteira", "treadmill"],
    cenario: "essencial",
    oque:
      "Esteira ergométrica motorizada, com regulagem de velocidade e inclinação e superfície amortecida.",
    trabalha: "Sistema cardiovascular; membros inferiores em padrão de caminhada e corrida.",
    indicacao:
      "É o equipamento mais procurado de qualquer academia de condomínio e o que define a percepção de qualidade da sala. Serve do morador que caminha ao que corre, sem troca de aparelho.",
    atencao:
      "Precisa de tomada dedicada e recuo livre atrás para queda segura. Amortecimento em dia é obrigatório: esteira rígida transfere impacto direto para joelho e coluna.",
  },
  {
    chaves: ["escada", "stepmill", "simulador de escada"],
    cenario: "premium",
    oque:
      "Simulador de escada com degraus rolantes contínuos: o morador sobe degraus reais, sem descida.",
    trabalha: "Glúteos, coxas e sistema cardiovascular, com gasto calórico alto.",
    indicacao:
      "Maior gasto calórico por minuto entre os aparelhos de ergometria e forte apelo estético para glúteo. É item de vitrine — alta procura no público jovem, dispensável no núcleo mínimo.",
    atencao:
      "Exige pé-direito elevado e é o aparelho mais barulhento da sala — afastar de parede compartilhada com unidade residencial. Não indicado a quem tem instabilidade de equilíbrio.",
  },
  {
    chaves: ["eliptico", "transport", "cross trainer"],
    cenario: "balanceado",
    oque:
      "Aparelho de passada elíptica com pedais suspensos e braços móveis: o pé nunca deixa o pedal, então não há impacto.",
    trabalha: "Sistema cardiovascular, pernas e braços simultaneamente.",
    indicacao:
      "É a alternativa à esteira para quem não pode receber impacto — sobrepeso, artrose, pós-operatório, idoso. Em condomínio com faixa etária ampla, é o que mantém metade dos moradores treinando.",
    atencao: "Ocupa comprimento maior do que aparenta. Verificar folga para a passada completa e para os braços.",
  },
  {
    chaves: ["bike horizontal", "bicicleta horizontal", "reclinada", "recumbent"],
    cenario: "essencial",
    oque:
      "Bicicleta com assento em formato de poltrona e encosto para as costas, pedais à frente do corpo.",
    trabalha: "Sistema cardiovascular e pernas, com a coluna apoiada.",
    indicacao:
      "É o aparelho de entrada do morador idoso, obeso ou em reabilitação: sentar e levantar é fácil, a coluna fica apoiada e não há risco de queda. Numa sala com faixa 30–70 anos, é indispensável.",
    atencao: "Regular a distância do assento antes de pedalar — joelho não deve travar em extensão total.",
  },
  {
    chaves: ["bike vertical", "bicicleta vertical", "bike ergometrica"],
    cenario: "balanceado",
    oque: "Bicicleta ergométrica de postura vertical, com assento e guidão convencionais.",
    trabalha: "Sistema cardiovascular e pernas, sem impacto.",
    indicacao: "Ocupa pouca área e cobre o cardio de quem não quer esteira. Boa relação entre custo e ocupação.",
    atencao: "Assento precisa de ajuste de altura simples — se for difícil de regular, o morador desiste do aparelho.",
  },
  {
    chaves: ["spinning", "bike spinning", "indoor cycle"],
    cenario: "premium",
    oque:
      "Bicicleta de roda de inércia com regulagem fina de carga, feita para pedalar em pé e em alta intensidade.",
    trabalha: "Sistema cardiovascular em alta intensidade; pernas e glúteos.",
    indicacao:
      "Atende o morador condicionado que busca treino intenso e ocupa pouco espaço. Item de complemento — sozinha não cobre o cardio da sala.",
    atencao:
      "Exige ajuste de assento e guidão a cada usuário; sem orientação inicial, gera dor lombar e de joelho. Manutenção do freio e da correia é frequente.",
  },
  {
    chaves: ["remo", "remoergometro", "rower"],
    cenario: "premium",
    oque: "Ergômetro de remada com trilho e resistência a ar, água ou magnética.",
    trabalha: "Corpo inteiro — pernas, costas, core e braços em um só movimento.",
    indicacao: "Melhor relação entre estímulo global e área ocupada, para quem já tem técnica.",
    atencao: "Sem orientação, a remada sai puxando pela lombar. Requer demonstração inicial do professor.",
  },

  // ── Peso livre ───────────────────────────────────────────────────────────
  {
    chaves: ["estante dumbbell", "estante de halteres", "torre halteres", "torre de halteres", "suporte de halteres", "rack de halteres"],
    cenario: "essencial",
    oque:
      "Estante em aço para guarda dos halteres, em um ou dois níveis, com o peso organizado em ordem crescente.",
    trabalha: "Não é aparelho de treino: é a infraestrutura que sustenta toda a zona de peso livre.",
    indicacao:
      "Sem suporte, o halter fica no chão — vira risco de tropeço, some do condomínio e marca o piso. É o item que preserva o patrimônio da sala.",
    atencao:
      "Fixar ou lastrar contra tombamento e prever folga à frente para retirada do par mais pesado sem esbarrar em quem treina ao lado.",
  },
  {
    chaves: ["banco 0-90", "banco regulavel", "banco ajustavel", "banco 0 90"],
    cenario: "essencial",
    oque:
      "Banco com encosto regulável de 0° (horizontal) até 90° (vertical), normalmente com assento também ajustável.",
    trabalha: "Serve de apoio para peito, ombro, costas e braços com halteres.",
    indicacao:
      "É o acessório mais versátil da sala: um banco regulável substitui três bancos fixos. Dois deles evitam fila na zona de peso livre.",
    atencao: "Verificar periodicamente a trava do encosto e o estofamento — banco com trava frouxa sai de operação imediatamente.",
  },
  {
    chaves: ["banco supino", "supino reto", "banco reto"],
    cenario: "balanceado",
    oque: "Banco horizontal com suportes para a barra, para supino com peso livre.",
    trabalha: "Peitoral, ombro anterior e tríceps.",
    indicacao: "Atende o morador experiente que já treina com barra e busca carga que a máquina não entrega.",
    atencao:
      "É o exercício de maior risco da sala sem parceiro de segurança. Em condomínio, recomenda-se usar apenas com professor presente ou dentro de rack com barra de segurança.",
  },
  {
    chaves: ["banco declinado", "banco inclinado"],
    cenario: "premium",
    oque: "Banco de ângulo fixo, inclinado ou declinado, para variação do supino com halteres ou barra.",
    trabalha: "Porção superior ou inferior do peitoral, conforme o ângulo.",
    indicacao: "Variação de treino para quem já tem rotina consolidada. Entra depois que o banco regulável está atendido.",
    atencao: "Ângulo fixo limita o uso; priorizar o banco regulável quando a área for disputada.",
  },
  {
    chaves: ["rack", "gaiola", "power rack", "squat rack"],
    cenario: "balanceado",
    oque: "Estrutura de quatro colunas com barras de segurança reguláveis, para agachamento e supino com peso livre.",
    trabalha: "Corpo inteiro, conforme o exercício.",
    indicacao: "É o que torna o peso livre pesado seguro sem parceiro: as barras de segurança param a carga.",
    atencao: "Exige piso reforçado e altura livre. Ajuste das barras de segurança deve ser feito antes de cada série.",
  },

  // ── Preparação ───────────────────────────────────────────────────────────
  {
    chaves: ["colchonete", "tatame", "colchao"],
    cenario: "essencial",
    oque: "Colchonetes de alta densidade para trabalho de solo, guardados em suporte vertical.",
    trabalha: "Core, mobilidade, alongamento e exercícios de solo em geral.",
    indicacao:
      "É o item de menor custo e maior uso da sala: aquecimento, alongamento no fim do treino, abdominal e a série do morador em reabilitação passam todos por aqui.",
    atencao: "Guardar sempre em pé no suporte. Colchonete no chão vira obstáculo de circulação e perde a vida útil rápido.",
  },
  {
    chaves: ["espaldar", "barra sueca"],
    cenario: "essencial",
    oque: "Estrutura vertical de barras horizontais fixada à parede, usada como apoio para alongamento e mobilidade.",
    trabalha: "Alongamento de cadeia posterior, mobilidade de ombro e descompressão de coluna.",
    indicacao:
      "Ocupa somente parede — área de treino zero — e atende exatamente o público que mais precisa de alongamento assistido: o morador acima de 50 anos.",
    atencao: "Fixação em alvenaria firme, com bucha compatível. Verificar aperto dos parafusos periodicamente.",
  },
  {
    chaves: ["funcional", "kettlebell", "bola", "step", "elastico", "trx"],
    cenario: "balanceado",
    oque: "Acessórios de treino funcional guardados em suporte próprio na área de preparação.",
    trabalha: "Core, equilíbrio, coordenação e condicionamento geral.",
    indicacao: "Ampliam muito o repertório do professor com custo baixo e área ocupada quase nula.",
    atencao: "Exigem área livre de solo e suporte de guarda. Sem organização, se dispersam e somem.",
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
  /** true quando nada foi escrito na ficha e o texto veio 100% do padrão. */
  padrao: boolean;
}

export function explicarItem(item: ItemPosicionado, cat?: Equipamento | null): ExplicacaoEquip {
  const b = baseDoNome(item.nome);
  const z = ESPEC_ZONA[item.zona] ?? ESPEC_ZONA.livre;
  const daFicha = !!(item.funcao || item.restricoes || item.detalhes || cat?.descricao);
  return {
    oque: (cat?.descricao || "").trim() || b?.oque || z.oque,
    trabalha: b?.trabalha || "—",
    indicacao: (item.funcao || "").trim() || b?.indicacao || z.entrega,
    atencao: (item.restricoes || "").trim() || b?.atencao || z.operacao,
    detalhes: (item.detalhes || cat?.obs || "").trim() || undefined,
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
