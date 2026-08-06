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
import type { Capacidades, Musculo, PadraoMovimento, RegiaoCorpo } from "./musculatura";
import { MUSCULOS, MUSCULOS_ORDEM, PADROES, PADROES_ORDEM } from "./musculatura";

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

/**
 * Especificação da categoria como ela sai no Dossiê: o texto PADRÃO, com cada
 * campo que o consultor reescreveu para ESTE projeto por cima. O que ele
 * escreve sempre vence — inclusive substituindo por completo o padrão, e não
 * só acrescentando uma nota ao fim, como era antes.
 */
export function especificacaoDaZona(zona: Zona, cena?: Cena): EspecCategoria & { nota?: string } {
  const base = ESPEC_ZONA[zona];
  const p = cena?.especificacoes?.[zona];
  if (!p) return { ...base };
  return {
    oque: p.oque?.trim() || base.oque,
    entrega: p.entrega?.trim() || base.entrega,
    criterio: p.criterio?.trim() || base.criterio,
    operacao: p.operacao?.trim() || base.operacao,
    ...(p.nota?.trim() ? { nota: p.nota.trim() } : {}),
  };
}

/** Os campos da especificação, na ordem em que saem no papel. */
export const CAMPOS_ESPEC = [
  { chave: "oque", rotulo: "O que é" },
  { chave: "entrega", rotulo: "O que entrega" },
  { chave: "criterio", rotulo: "Critério de dimensionamento" },
  { chave: "operacao", rotulo: "Obra & operação" },
  { chave: "nota", rotulo: "Nota deste projeto" },
] as const;

// ── 2. Base de equipamentos: o que é, o que trabalha, por que está no projeto ─

export interface BaseEquip {
  /** Como a base chama o equipamento. É o nome que a análise de cobertura usa
   *  para sugerir o que falta — o do projeto vem do fornecedor e varia. */
  nome: string;
  /** Trechos do nome que identificam o equipamento (minúsculo, sem acento). */
  chaves: string[];
  /** Trechos que ANULAM esta entrada, mesmo que uma chave case. Existe para as
   *  máquinas de isolamento, cujo nome aparece como acessório de estação maior:
   *  "Panturrilha no Leg Press" é um leg press, não uma panturrilheira. */
  exceto?: string[];
  cenario: Cenario;
  /** Exercícios RESISTIDOS de musculação executáveis no aparelho. Ausente
   *  de propósito em ergômetros, móveis de guarda e área de solo: ali não se
   *  faz exercício resistido, e inventar lista ali seria enganar o síndico. */
  exercicios?: string[];
  /** Músculos e padrões que o aparelho entrega — a matéria-prima da análise de
   *  cobertura. Ausente onde não há estímulo nenhum (guarda e área de solo). */
  capacidades?: Capacidades;
  oque: string;
  trabalha: string;
  indicacao: string;
  atencao: string;
}

/** Ordem não importa: casa sempre a chave MAIS LONGA encontrada no nome (e
 *  respeita o `exceto` da entrada). */
export const BASE_EQUIP: BaseEquip[] = [
  // Regra dos textos: descrever o que o equipamento É e para que serve, de
  // forma geral e verificável — sem promessa e sem enfeite. Lista de
  // exercícios só onde ela é FECHADA: a estrutura do aparelho define a
  // trajetória, então dá para enumerar sem mentir (inclui a estação combinada
  // Smith + polias, longa mas verificável). Banco, rack e móvel de guarda
  // ficam sem lista — ali o repertório é aberto e lista incompleta passa
  // informação errada. Ergômetro e área de solo idem: não é exercício
  // resistido no próprio aparelho.
  //
  // `capacidades` (músculo/padrão) é INDEPENDENTE de `exercicios`: a esteira
  // não lista exercício algum e mesmo assim declara o estímulo
  // cardiovascular, para entrar na análise de cobertura.
  //
  // Régua do primário: o grupo entra em `primario` quando o aparelho EXISTE
  // para ele; entra em `secundario` quando só é recrutado junto. É essa linha
  // que separa "coberto" de "fraco" no Dossiê, e é onde o exagero custa caro —
  // grupo marcado a mais é grupo que o síndico acha que tem e não tem.
  //
  // O rascunho de `tools/derivar-capacidades.mjs` orienta, mas cada entrada
  // aqui foi conferida à mão (o script, por exemplo, dá glúteo como único
  // primário do leg press, porque a amostra dele é de sled 45°).

  // ── Força guiada ─────────────────────────────────────────────────────────
  {
    nome: "Estação Cross + Smith",
    chaves: ["wire cross + smith", "cross + smith", "smith rack", "wire cross"],
    cenario: "essencial",
    // A lista de exercícios abaixo é a evidência de cada padrão declarado aqui
    // — panturrilha, abdução de quadril e rotação de tronco inclusive.
    capacidades: {
      primario: ["peitoral", "costas", "ombros", "quadriceps", "gluteos", "triceps", "biceps"],
      secundario: ["posterior", "abdomen", "panturrilha", "abdutores"],
      padroes: [
        "agachar", "dobrar_quadril", "empurrar_horizontal", "empurrar_vertical",
        "puxar_vertical", "puxar_horizontal", "abducao_ombro", "flexao_cotovelo",
        "extensao_cotovelo", "abducao_quadril", "panturrilha", "core_flexao", "core_rotacao",
      ],
    },
    oque: "Estação combinada: barra guiada (Smith) de um lado e torres de polias reguláveis do outro.",
    trabalha: "Corpo inteiro — pernas e glúteos na barra guiada; peito, costas, ombros e braços nos cabos.",
    indicacao: "Estação para múltiplos exercícios guiados e de cabo — concentra em uma estrutura o treino de vários grupos musculares.",
    atencao: "Exige pé-direito compatível e piso firme. Trava de segurança da barra deve ser revisada periodicamente.",
    exercicios: [
      "Agachamento no Smith (afastamentos livre, fechado e sumô)",
      "Agachamento búlgaro e afundo no Smith",
      "Levantamento terra romeno no Smith",
      "Elevação pélvica com barra no Smith",
      "Panturrilha em pé no Smith",
      "Supino reto e inclinado no Smith",
      "Desenvolvimento de ombros no Smith",
      "Remada curvada e remada invertida no Smith",
      "Encolhimento de ombros no Smith",
      "Puxada alta e remada baixa nas polias",
      "Crucifixo nos cabos (alturas alta, média e baixa)",
      "Elevação lateral e frontal na polia",
      "Face pull e crucifixo inverso nos cabos",
      "Tríceps na polia (corda, barra reta)",
      "Rosca de bíceps na polia (direta, martelo na corda)",
      "Coice de glúteo e abdução de quadril na polia",
      "Rotação de tronco e abdominal na polia",
    ],
  },
  {
    nome: "Cross Over (torre de polias)",
    chaves: ["cross over", "crossover", "polia dupla", "estacao de polias"],
    cenario: "premium",
    capacidades: {
      primario: ["peitoral", "costas", "ombros", "triceps", "biceps", "gluteos"],
      secundario: ["abdomen", "posterior", "abdutores", "adutores"],
      padroes: [
        "empurrar_horizontal", "empurrar_vertical", "puxar_vertical", "puxar_horizontal",
        "abducao_ombro", "flexao_cotovelo", "extensao_cotovelo", "dobrar_quadril",
        "abducao_quadril", "aducao_quadril", "core_flexao", "core_rotacao",
      ],
    },
    oque: "Torre de polias com dois braços reguláveis em altura e ângulo; a carga vem por cabo.",
    trabalha: "Peito, costas, ombros, braços e core, conforme a regulagem e o acessório usados.",
    indicacao: "Estação para múltiplos exercícios de cabo — amplia a variedade de treino sem ocupar nova área.",
    atencao: "Precisa de área livre entre as torres. Puxadores devem ficar em suporte próprio.",
    exercicios: [
      "Crucifixo (crossover) nas alturas alta, média e baixa",
      "Crucifixo unilateral",
      "Supino em pé no cabo (chest press)",
      "Puxada com braços estendidos (pull-down reto)",
      "Remada unilateral no cabo",
      "Face pull e crucifixo inverso",
      "Elevação lateral e frontal na polia",
      "Desenvolvimento unilateral no cabo",
      "Tríceps na corda e na barra",
      "Rosca direta, martelo e concentrada no cabo",
      "Coice de glúteo (extensão de quadril)",
      "Abdução e adução de quadril na polia baixa",
      "Pull-through para glúteos e posteriores",
      "Lenhador (rotação de tronco alta-baixa)",
      "Abdominal ajoelhado na polia alta",
    ],
  },
  {
    nome: "Puxada + Remada",
    chaves: ["puxada + remada", "puxada e remada", "pulley", "puxada", "remada"],
    cenario: "essencial",
    // Bíceps entra como SECUNDÁRIO de propósito: puxar treina braço, mas uma
    // sala que só tem esta estação não pode alegar treino de bíceps.
    capacidades: {
      primario: ["costas"],
      secundario: ["biceps", "ombros", "antebraco"],
      padroes: ["puxar_vertical", "puxar_horizontal"],
    },
    oque: "Estação dupla de costas: puxada alta em cima, remada sentada embaixo.",
    trabalha: "Dorsais, trapézio, romboides, posterior de ombro e bíceps.",
    indicacao: "Cobre os movimentos de puxar — a base do treino de costas em qualquer sala.",
    atencao: "Banco e apoio de joelho precisam de regulagem para usuários de estaturas diferentes.",
    exercicios: [
      "Puxada frontal com pegada aberta (pronada)",
      "Puxada com pegada fechada supinada",
      "Puxada com triângulo (pegada neutra)",
      "Puxada unilateral",
      "Puxada com braços estendidos",
      "Remada sentada com triângulo (pegada neutra)",
      "Remada sentada com pegada aberta",
      "Remada unilateral",
      "Face pull na polia alta",
    ],
  },
  {
    nome: "Leg Press 45°",
    chaves: ["leg press"],
    cenario: "essencial",
    capacidades: {
      primario: ["quadriceps", "gluteos"],
      secundario: ["posterior", "adutores", "panturrilha"],
      padroes: ["agachar", "panturrilha"],
    },
    oque: "Plataforma inclinada a 45° em que o usuário empurra a carga com as pernas, sentado e com a coluna apoiada.",
    trabalha: "Quadríceps, glúteos e adutores.",
    indicacao: "Treino de pernas com carga alta e coluna apoiada — adequado a salas de uso autônomo.",
    atencao: "Ocupa muita profundidade. Carga alta requer liberação em caso de hérnia ou prótese de quadril.",
    exercicios: [
      "Leg press tradicional (pés na largura dos ombros)",
      "Leg press com pés altos na plataforma (ênfase em glúteos e posteriores)",
      "Leg press com pés baixos (ênfase em quadríceps)",
      "Leg press com afastamento largo (ênfase em adutores e glúteos)",
      "Leg press com pés próximos (ênfase em vasto lateral)",
      "Leg press unilateral",
      "Panturrilha na plataforma (bilateral e unilateral)",
    ],
  },
  {
    nome: "Agachamento guiado (Hack Squat)",
    chaves: ["squat machine", "agachamento guiado", "hack"],
    cenario: "balanceado",
    capacidades: {
      primario: ["quadriceps", "gluteos"],
      secundario: ["posterior", "adutores", "panturrilha"],
      padroes: ["agachar", "panturrilha"],
    },
    oque: "Máquina de agachamento com trajetória guiada e apoio para ombros ou costas.",
    trabalha: "Quadríceps, glúteos e posterior de coxa.",
    indicacao: "Agachamento com carga sem exigir a técnica do exercício livre.",
    atencao: "Conferir a trava de segurança antes de cada série.",
    exercicios: [
      "Agachamento guiado completo",
      "Agachamento parcial com carga progressiva",
      "Agachamento com pés à frente (ênfase em glúteos)",
      "Agachamento sumô (ênfase em adutores)",
      "Agachamento unilateral",
      "Panturrilha em pé na máquina",
    ],
  },
  {
    nome: "Cadeira Extensora",
    chaves: ["leg extension", "extensora", "extensao de joelho"],
    cenario: "balanceado",
    capacidades: { primario: ["quadriceps"], padroes: ["extensao_joelho"] },
    oque: "Cadeira com rolo à frente dos tornozelos: sentado, o usuário estende os joelhos contra a carga.",
    trabalha: "Quadríceps, de forma isolada.",
    indicacao: "Isola o quadríceps sem carga na coluna — serve de iniciante a avançado.",
    atencao: "Alinhar o eixo do joelho ao eixo da máquina.",
    exercicios: [
      "Extensão de joelhos bilateral",
      "Extensão de joelhos unilateral",
      "Extensão com pausa isométrica no topo",
      "Extensão com ênfase na fase excêntrica (descida controlada)",
      "Extensão com amplitude parcial final (para reabilitação orientada)",
    ],
  },
  {
    nome: "Mesa Flexora",
    chaves: ["leg curl", "flexora", "mesa flexora"],
    cenario: "balanceado",
    capacidades: { primario: ["posterior"], secundario: ["panturrilha"], padroes: ["flexao_joelho"] },
    oque: "Mesa (deitado) ou cadeira (sentado) em que o usuário flexiona os joelhos contra a carga.",
    trabalha: "Posterior de coxa (isquiotibiais).",
    indicacao: "Par da extensora — cobre a flexão de joelho, que nenhuma outra máquina da sala isola.",
    atencao: "O rolo apoia acima do calcanhar; alinhar o eixo do joelho ao da máquina.",
    exercicios: [
      "Flexão de joelhos bilateral",
      "Flexão de joelhos unilateral",
      "Flexão com pausa isométrica na contração",
      "Flexão com ênfase na fase excêntrica",
    ],
  },
  {
    nome: "Elevação Pélvica (Hip Thrust)",
    chaves: ["elevacao pelvica", "hip thrust", "gluteo"],
    cenario: "balanceado",
    capacidades: { primario: ["gluteos"], secundario: ["posterior"], padroes: ["dobrar_quadril"] },
    oque: "Banco com apoio para as costas e almofada sobre o quadril: o usuário eleva o quadril contra a carga.",
    trabalha: "Glúteos, com participação do posterior de coxa.",
    indicacao: "Exercício específico de glúteo com carga, em máquina — execução mais simples e segura que a versão com barra livre.",
    atencao: "Almofada de quadril em bom estado; atenção com carga alta em quem tem dor lombar.",
    exercicios: [
      "Elevação pélvica (hip thrust) bilateral",
      "Elevação pélvica unilateral",
      "Elevação pélvica com pausa isométrica no topo",
      "Elevação pélvica com pés afastados (ênfase em glúteo médio)",
      "Repetições parciais na metade superior da amplitude",
    ],
  },
  {
    nome: "Abdutora & Adutora",
    chaves: ["abducao", "aducao", "adutor", "abdutor", "dual inner", "inner outer"],
    cenario: "balanceado",
    capacidades: {
      primario: ["abdutores", "adutores"],
      secundario: ["gluteos"],
      padroes: ["abducao_quadril", "aducao_quadril"],
    },
    oque: "Cadeira com apoios laterais nas coxas: abrir as pernas contra a carga (abdução) ou fechá-las (adução).",
    trabalha: "Glúteo médio e abdutores; adutores da coxa.",
    indicacao: "Cobre o quadril no plano lateral, que as demais máquinas não alcançam.",
    atencao: "Começar com amplitude reduzida em quem tem quadril rígido.",
    exercicios: [
      "Abdução de quadril sentado",
      "Abdução com tronco inclinado à frente (ênfase em glúteo médio)",
      "Abdução unilateral",
      "Adução de quadril sentado",
      "Adução unilateral",
      "Trabalho isométrico de abdução/adução (contração sustentada)",
    ],
  },
  {
    nome: "Elevação Lateral (Delt Raise)",
    chaves: ["delt raise", "elevacao lateral", "deltoide", "ombro"],
    cenario: "premium",
    capacidades: { primario: ["ombros"], padroes: ["abducao_ombro"] },
    oque: "Máquina de elevação lateral: sentado, o usuário afasta os braços do corpo contra almofadas.",
    trabalha: "Deltoide medial.",
    indicacao: "Isola o ombro com trajetória guiada — movimento que, com halteres, exige mais técnica.",
    atencao: "Alinhar o eixo do ombro ao da máquina. Evitar em quadro agudo de tendinite.",
    exercicios: [
      "Elevação lateral bilateral",
      "Elevação lateral unilateral",
      "Elevação lateral com pausa isométrica",
      "Repetições parciais no arco final (técnica avançada de deltoide)",
    ],
  },
  {
    nome: "Supino Máquina / Voador",
    chaves: ["supino maquina", "chest press", "peitoral", "voador", "peck"],
    cenario: "essencial",
    capacidades: {
      primario: ["peitoral"],
      secundario: ["ombros", "triceps"],
      padroes: ["empurrar_horizontal"],
    },
    oque: "Máquina de empurrar sentado (chest press) ou de fechar os braços à frente (voador).",
    trabalha: "Peitoral, ombro anterior e tríceps.",
    indicacao: "Treino de peito sem necessidade de apoio de outra pessoa.",
    atencao: "Regular o assento para as mãos ficarem na linha do peito.",
    exercicios: [
      "Pressão de peito (supino na máquina) bilateral",
      "Pressão de peito unilateral",
      "Crucifixo (voador) bilateral e unilateral",
      "Crucifixo inverso para posterior de ombro (nos aparelhos com regulagem)",
    ],
  },
  {
    nome: "Desenvolvimento de Ombros",
    chaves: ["desenvolvimento", "shoulder press", "military press", "ombro press"],
    cenario: "balanceado",
    // Sem esta entrada, "Desenvolvimento de Ombros" caía na chave "ombro" da
    // elevação lateral e o empurrar vertical sumia da análise de cobertura.
    capacidades: {
      primario: ["ombros"],
      secundario: ["triceps", "peitoral"],
      padroes: ["empurrar_vertical"],
    },
    oque: "Máquina de empurrar sentado com trajetória vertical e encosto alto.",
    trabalha: "Deltoide (anterior e medial) e tríceps.",
    indicacao: "Cobre o empurrar acima da cabeça sem exigir a estabilização do peso livre.",
    atencao: "Regular o assento para o punho ficar acima do cotovelo. Evitar em ombro com dor à elevação.",
  },

  // As cinco entradas a seguir eram UMA só, genérica, com as chaves
  // ["triceps","biceps","rosca","panturrilha","abdominal","lombar"] e o texto
  // "o grupo indicado no nome do aparelho". Funcionava enquanto o humano lia:
  // ele sabia qual grupo era. Não funciona para `capacidades` — um coringa não
  // tem como declarar músculo, e declarar qualquer um marcaria grupo falso como
  // coberto. Separadas, cada uma responde por si.
  {
    nome: "Tríceps Máquina",
    chaves: ["triceps"],
    cenario: "premium",
    capacidades: { primario: ["triceps"], secundario: ["ombros"], padroes: ["extensao_cotovelo"] },
    oque: "Máquina de extensão de cotovelo com trajetória guiada e carga por pino.",
    trabalha: "Tríceps, de forma isolada.",
    indicacao: "Complemento de braço — entra depois que os empurrões de peito e ombro estão cobertos.",
    atencao: "Alinhar o cotovelo ao eixo da máquina; ajustar assento e apoios antes da primeira série.",
  },
  {
    nome: "Rosca Bíceps Máquina",
    chaves: ["biceps", "rosca"],
    cenario: "premium",
    capacidades: { primario: ["biceps"], secundario: ["antebraco"], padroes: ["flexao_cotovelo"] },
    oque: "Máquina de flexão de cotovelo com apoio para o braço (rosca scott guiada).",
    trabalha: "Bíceps, com participação do antebraço.",
    indicacao: "Complemento de braço — o apoio elimina o balanço de tronco que a rosca livre permite.",
    atencao: "Regular o apoio na altura da axila e manter o punho neutro.",
  },
  {
    nome: "Panturrilha Máquina",
    chaves: ["panturrilha", "calf raise"],
    // A chave "panturrilha" é longa e aparece como acessório de estação maior;
    // sem o veto, "Panturrilha no Leg Press" deixava de ser um leg press.
    exceto: ["leg press", "smith rack", "cross + smith", "hack"],
    cenario: "premium",
    capacidades: { primario: ["panturrilha"], padroes: ["panturrilha"] },
    oque: "Máquina de flexão plantar, em pé ou sentada, com a carga sobre o ombro ou sobre o joelho.",
    trabalha: "Panturrilha — gastrocnêmio na versão em pé, sóleo na sentada.",
    indicacao: "Único aparelho da sala que carrega a panturrilha em amplitude completa.",
    atencao: "Amplitude completa importa mais que carga. Conferir o antiderrapante do degrau.",
  },
  {
    nome: "Abdominal Máquina",
    chaves: ["abdominal"],
    cenario: "premium",
    capacidades: { primario: ["abdomen"], padroes: ["core_flexao"] },
    oque: "Máquina de flexão de tronco sentada, com carga por pino.",
    trabalha: "Abdômen — reto abdominal e, nos modelos com rotação, os oblíquos.",
    indicacao: "Dá carga progressiva ao abdômen, o que o abdominal de solo não faz.",
    atencao: "Ajustar o encosto para o quadril ficar apoiado. Evitar em quadro agudo de dor lombar.",
  },
  {
    nome: "Extensão Lombar",
    chaves: ["lombar", "hiperextensao"],
    cenario: "premium",
    capacidades: {
      primario: ["lombar"],
      secundario: ["gluteos", "posterior"],
      padroes: ["dobrar_quadril"],
    },
    oque: "Banco ou máquina de extensão de tronco (hiperextensão), com o quadril apoiado.",
    trabalha: "Lombar (eretores da espinha), com glúteos e posterior de coxa.",
    indicacao: "Trabalha a musculatura que sustenta a coluna — o pedido mais frequente de quem tem dor nas costas.",
    atencao: "Parar na linha do corpo, sem hiperestender. Liberação médica em hérnia de disco.",
  },

  // ── Ergometria ───────────────────────────────────────────────────────────
  // Regra dos ergômetros: primário é sempre CARDIOVASCULAR, nunca músculo. O
  // grupo só entra como secundário quando o aparelho é reconhecidamente carga
  // para ele (escada, spinning em pé, remada). Caminhar não é treino de
  // quadríceps — marcar perna como coberta pela esteira é exatamente o erro
  // que esta análise existe para evitar.
  {
    nome: "Esteira",
    chaves: ["esteira", "treadmill"],
    cenario: "essencial",
    capacidades: { primario: ["cardiovascular"], padroes: ["cardio"] },
    oque: "Esteira motorizada com regulagem de velocidade e inclinação.",
    trabalha: "Condicionamento cardiovascular; caminhada e corrida.",
    indicacao: "O equipamento de cardio mais usado em academias de condomínio — atende de quem caminha a quem corre.",
    atencao: "Tomada dedicada e recuo livre atrás. Manutenção do amortecimento e da manta.",
  },
  {
    nome: "Escada (Stepmill)",
    chaves: ["escada", "stepmill", "step mill", "simulador de escada"],
    cenario: "premium",
    capacidades: {
      primario: ["cardiovascular"],
      secundario: ["gluteos", "quadriceps", "panturrilha"],
      padroes: ["cardio"],
    },
    oque: "Simulador de escada com degraus rolantes contínuos.",
    trabalha: "Condicionamento cardiovascular; glúteos e coxas.",
    indicacao: "Cardio de intensidade alta, sem necessidade de velocidade de corrida.",
    atencao: "Pé-direito elevado; é ruidoso — afastar de parede compartilhada com unidade. Não indicado a quem tem instabilidade de equilíbrio.",
  },
  {
    nome: "Elíptico",
    chaves: ["eliptico", "transport", "cross trainer"],
    cenario: "balanceado",
    capacidades: { primario: ["cardiovascular"], padroes: ["cardio"] },
    oque: "Aparelho de passada elíptica com pedais suspensos e braços móveis — o pé não deixa o pedal.",
    trabalha: "Condicionamento cardiovascular, sem impacto; pernas e braços.",
    indicacao: "Alternativa de cardio sem impacto para quem não pode correr.",
    atencao: "Verificar folga para a passada completa e para os braços.",
  },
  {
    nome: "Bike Horizontal",
    chaves: ["bike horizontal", "bicicleta horizontal", "reclinada", "recumbent"],
    cenario: "essencial",
    capacidades: { primario: ["cardiovascular"], padroes: ["cardio"] },
    oque: "Bicicleta com assento tipo poltrona, encosto e pedais à frente do corpo.",
    trabalha: "Condicionamento cardiovascular e pernas, com a coluna apoiada.",
    indicacao: "A opção de cardio mais acessível para idosos e pessoas em reabilitação: entrada fácil e coluna apoiada.",
    atencao: "Regular a distância do assento — o joelho não deve estender por completo.",
  },
  {
    nome: "Bike Vertical",
    chaves: ["bike vertical", "bicicleta vertical", "bike ergometrica", "bicicleta ergometrica"],
    cenario: "balanceado",
    capacidades: { primario: ["cardiovascular"], padroes: ["cardio"] },
    oque: "Bicicleta ergométrica de postura vertical.",
    trabalha: "Condicionamento cardiovascular e pernas, sem impacto.",
    indicacao: "Cardio compacto — ocupa a menor área entre os ergômetros.",
    atencao: "Ajuste simples de assento é essencial para o uso rotativo.",
  },
  {
    nome: "Bike de Spinning",
    chaves: ["spinning", "bike spinning", "indoor cycle"],
    cenario: "premium",
    capacidades: {
      primario: ["cardiovascular"],
      secundario: ["quadriceps", "gluteos"],
      padroes: ["cardio"],
    },
    oque: "Bicicleta de roda de inércia com regulagem fina de carga, para pedalar sentado ou em pé.",
    trabalha: "Condicionamento cardiovascular em intensidade alta; pernas e glúteos.",
    indicacao: "Atende quem busca treino intenso; complementa (não substitui) o cardio da sala.",
    atencao: "Requer ajuste de assento e guidão a cada usuário; manutenção frequente de freio e correia.",
  },
  {
    nome: "Remo Ergômetro",
    chaves: ["remo", "remoergometro", "rower"],
    cenario: "premium",
    capacidades: {
      primario: ["cardiovascular"],
      secundario: ["costas", "posterior", "abdomen", "biceps"],
      padroes: ["cardio", "puxar_horizontal"],
    },
    oque: "Ergômetro de remada com trilho e resistência a ar, água ou magnética.",
    trabalha: "Corpo inteiro — pernas, costas, core e braços.",
    indicacao: "Cardio de corpo inteiro em área pequena, para quem já tem a técnica da remada.",
    atencao: "Requer orientação inicial — a remada sem técnica sobrecarrega a lombar.",
  },

  // ── Peso livre ───────────────────────────────────────────────────────────
  {
    nome: "Estante de guarda (halteres e anilhas)",
    // "rack de anilhas" e "suporte de anilhas" entram aqui, e não no rack de
    // agachamento: móvel de guarda não treina ninguém, e a chave curta "rack"
    // faria uma torre de anilhas declarar cobertura de perna.
    chaves: [
      "estante dumbbell", "estante de halteres", "torre halteres", "torre de halteres",
      "suporte de halteres", "rack de halteres", "rack de anilhas", "suporte de anilhas",
    ],
    cenario: "essencial",
    // Sem `capacidades` de propósito: é móvel, não aparelho.
    oque: "Estante em aço para guarda dos halteres e anilhas em ordem de peso.",
    trabalha: "Guarda e organização — não é aparelho de treino.",
    indicacao: "Mantém o peso livre organizado e fora do chão.",
    atencao: "Fixar ou lastrar contra tombamento; prever folga à frente para retirada dos pares.",
  },
  {
    nome: "Banco Regulável 0-90°",
    chaves: ["banco 0-90", "banco regulavel", "banco ajustavel", "banco 0 90"],
    cenario: "essencial",
    // O banco não tem carga própria, mas é o que torna o halter guardado na
    // estante utilizável — é por ele que o peso livre entra na cobertura.
    capacidades: {
      primario: ["peitoral", "ombros"],
      secundario: ["triceps", "biceps", "costas"],
      padroes: ["empurrar_horizontal", "empurrar_vertical", "flexao_cotovelo"],
    },
    oque: "Banco com encosto regulável de 0° (horizontal) a 90° (vertical).",
    trabalha: "Apoio para exercícios de peito, ombro, costas e braços.",
    indicacao: "Banco para múltiplos exercícios com pesos livres, como os halteres — a regulagem de ângulo multiplica as possibilidades de treino.",
    atencao: "Verificar periodicamente a trava do encosto e o estofamento.",
  },
  {
    nome: "Banco de Supino",
    chaves: ["banco supino", "supino reto", "banco reto"],
    cenario: "balanceado",
    capacidades: {
      primario: ["peitoral"],
      secundario: ["ombros", "triceps"],
      padroes: ["empurrar_horizontal"],
    },
    oque: "Banco horizontal com suportes para barra.",
    trabalha: "Peitoral, ombro anterior e tríceps.",
    indicacao: "Banco para exercícios de empurrar com barra e halteres.",
    atencao: "Com barra e carga alta, usar com acompanhamento ou dentro de rack com segurança.",
  },
  {
    nome: "Banco Inclinado / Declinado",
    chaves: ["banco declinado", "banco inclinado"],
    cenario: "premium",
    capacidades: {
      primario: ["peitoral"],
      secundario: ["ombros", "triceps"],
      padroes: ["empurrar_horizontal"],
    },
    oque: "Banco de ângulo fixo (inclinado ou declinado).",
    trabalha: "Apoio para variações de exercícios com halteres e barra.",
    indicacao: "Banco para múltiplos exercícios com pesos livres, em ângulo fixo — complementa o banco regulável.",
    atencao: "Por ser de ângulo fixo, priorizar o banco regulável quando a área for disputada.",
  },
  {
    nome: "Rack / Gaiola",
    chaves: ["rack", "gaiola", "power rack", "squat rack"],
    cenario: "balanceado",
    capacidades: {
      primario: ["quadriceps", "gluteos", "posterior", "costas", "ombros", "peitoral"],
      secundario: ["lombar", "triceps", "biceps", "abdomen", "panturrilha", "antebraco"],
      padroes: [
        "agachar", "dobrar_quadril", "empurrar_vertical", "empurrar_horizontal",
        "puxar_horizontal", "panturrilha",
      ],
    },
    oque: "Estrutura de colunas com apoios e barras de segurança reguláveis, para treino com barra livre.",
    trabalha: "Estrutura para múltiplos exercícios com barra — agachamento, supino, remada e variações.",
    indicacao: "Torna o treino pesado com barra mais seguro: as barras de segurança param a carga.",
    atencao: "Piso reforçado e altura livre; regular as barras de segurança antes de cada série.",
    exercicios: [
      "Agachamento livre com barra (costas e frontal)",
      "Agachamento sumô com barra",
      "Afundo e agachamento búlgaro com barra",
      "Bom-dia (good morning)",
      "Levantamento terra parcial (rack pull)",
      "Remada curvada com barra",
      "Desenvolvimento militar em pé",
      "Supino com barra dentro das seguranças",
      "Elevação pélvica com barra",
      "Encolhimento de ombros com barra",
      "Panturrilha em pé com barra",
    ],
  },

  // ── Preparação ───────────────────────────────────────────────────────────
  {
    nome: "Colchonetes",
    chaves: ["colchonete", "tatame", "colchao"],
    cenario: "essencial",
    // Sem `capacidades`: o colchonete é a superfície, não o estímulo. Quem
    // treina o core aqui é o acessório (kit funcional) ou o próprio corpo.
    oque: "Colchonetes de alta densidade para exercícios de solo.",
    trabalha: "Core, alongamento e exercícios de solo em geral.",
    indicacao: "Item de menor custo e uso constante — aquecimento, abdominais e alongamento.",
    atencao: "Guardar em suporte vertical; no chão viram obstáculo e estragam mais rápido.",
  },
  {
    nome: "Espaldar",
    chaves: ["espaldar", "barra sueca"],
    cenario: "essencial",
    // Sem `capacidades`: apoio de alongamento e mobilidade, sem carga.
    oque: "Estrutura vertical de barras fixada à parede, usada como apoio para alongamento e mobilidade.",
    trabalha: "Alongamento e mobilidade com apoio.",
    indicacao: "Ocupa apenas parede e serve principalmente ao público que precisa de apoio para alongar.",
    atencao: "Fixação em alvenaria firme; conferir o aperto dos parafusos periodicamente.",
  },
  {
    nome: "Kit Funcional",
    chaves: ["funcional", "kettlebell", "bola", "step", "elastico", "trx"],
    cenario: "balanceado",
    // É o item mais barato da base que cobre anti-extensão e rotação de tronco
    // — os dois padrões que nenhuma máquina de carga guiada da sala alcança.
    capacidades: {
      primario: ["abdomen"],
      secundario: ["gluteos", "ombros", "posterior"],
      padroes: ["core_anti_extensao", "core_rotacao", "core_flexao", "dobrar_quadril"],
    },
    oque: "Acessórios de treino funcional guardados em suporte próprio.",
    trabalha: "Core, equilíbrio, coordenação e condicionamento geral.",
    indicacao: "Ampliam a variedade de treino com custo baixo e área quase nula.",
    atencao: "Exigem área livre de solo e suporte de guarda.",
  },
];

/**
 * A chave precisa começar em INÍCIO DE PALAVRA.
 *
 * Substring solta casa no miolo de qualquer nome composto ou de marca, e um
 * casamento errado aqui não fica só no texto: vira grupo muscular declarado
 * como coberto no Dossiê. O fim continua livre por causa do plural e do
 * feminino do português — "adutor" precisa casar "Cadeira Adutora" e
 * "colchonete" precisa casar "Colchonetes".
 */
function contemChave(nome: string, chave: string): boolean {
  for (let i = nome.indexOf(chave); i >= 0; i = nome.indexOf(chave, i + 1)) {
    if (i === 0 || !/[a-z0-9]/.test(nome[i - 1])) return true;
  }
  return false;
}

/** Entrada da base que melhor descreve o nome (casa a chave mais longa). */
export function baseDoNome(nome: string): BaseEquip | null {
  const n = normalizar(nome);
  let achado: BaseEquip | null = null;
  let tamanho = 0;
  for (const b of BASE_EQUIP) {
    if (b.exceto?.some((x) => contemChave(n, x))) continue;
    for (const chave of b.chaves) {
      if (contemChave(n, chave) && chave.length > tamanho) { achado = b; tamanho = chave.length; }
    }
  }
  return achado;
}

/**
 * Entrada da base para um item POSICIONADO.
 *
 * O nome no projeto vem do fornecedor ("Impact Delt Raise", "MX-4000") e nem
 * sempre diz o que a máquina é; quando ele não casa, o nome do catálogo — e
 * depois a subcategoria — costumam dizer. Sem esta escada, renomear o item no
 * projeto apagava o equipamento da análise de cobertura.
 */
export function baseDoItem(item: ItemPosicionado, cat?: Equipamento | null): BaseEquip | null {
  return baseDoNome(item.nome)
    ?? (cat ? baseDoNome(cat.nome) ?? baseDoNome(cat.subcategoria || "") : null);
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
  // A MESMA escada de `baseDoItem` (nome do projeto → nome do catálogo →
  // subcategoria). Só o nome do item deixava o "Leg Press 45° · LP-2000" do
  // fornecedor sem exercícios e sem memorial, enquanto a análise de cobertura
  // o reconhecia — o Dossiê se contradizia.
  return normalizarExercicios(baseDoItem(item, cat)?.exercicios);
}

export function explicarItem(item: ItemPosicionado, cat?: Equipamento | null): ExplicacaoEquip {
  const b = baseDoItem(item, cat);
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

// ── Cobertura: o que a academia treina e o que fica de fora ────────────────
//
// A composição por zona conta MÁQUINA; esta análise conta CORPO. São perguntas
// diferentes: uma sala pode ter quatro estações de força e mesmo assim não
// treinar posterior de coxa. É também o argumento mais forte na hora de
// discutir orçamento, porque `porCenario` mostra o que se perde ao cortar —
// não só quanto se economiza.

export type StatusCobertura = "coberto" | "fraco" | "descoberto";

export const STATUS_COBERTURA: Record<StatusCobertura, { label: string; descricao: string }> = {
  coberto: { label: "Coberto", descricao: "Ao menos um equipamento treina o grupo como estímulo principal." },
  fraco: { label: "Fraco", descricao: "O grupo só aparece como auxiliar de outro movimento." },
  descoberto: { label: "Descoberto", descricao: "Nenhum equipamento da sala treina o grupo." },
};

export interface LinhaMusculo {
  musculo: Musculo;
  label: string;
  regiao: RegiaoCorpo;
  status: StatusCobertura;
  /** Equipamentos que atendem o grupo como estímulo principal. */
  primarios: string[];
  /** Equipamentos em que ele entra só como auxiliar. */
  secundarios: string[];
}

export interface LinhaPadrao {
  padrao: PadraoMovimento;
  label: string;
  coberto: boolean;
  equipamentos: string[];
}

/** Uma compra que fecha lacunas — nome da base técnica, não do fornecedor. */
export interface SugestaoCobertura {
  equipamento: string;
  /** Cenário em que a base classifica o equipamento (o "custo" da sugestão). */
  cenario: Cenario;
  musculos: Musculo[];
  padroes: PadraoMovimento[];
  /** Frase pronta para o Dossiê. */
  porque: string;
}

export interface CoberturaCenario {
  cenario: Cenario;
  label: string;
  cobertos: Musculo[];
  fracos: Musculo[];
  descobertos: Musculo[];
  padroesDescobertos: PadraoMovimento[];
  /** O que este nível acrescenta ao anterior — logo, o que se PERDE ao cortar. */
  ganha: Musculo[];
}

export interface CoberturaAcademia {
  musculos: LinhaMusculo[];
  padroes: LinhaPadrao[];
  sugestoes: SugestaoCobertura[];
  /** Acumulado, na ordem Essencial → Balanceado → Premium. */
  porCenario: CoberturaCenario[];
  /** Itens da cena que a base técnica não reconheceu — ficaram FORA da conta.
   *  Sai no rodapé da seção: análise que esconde o que ignorou não vale nada. */
  naoReconhecidos: string[];
  resumo: {
    cobertos: number;
    fracos: number;
    descobertos: number;
    padroesCobertos: number;
    padroesTotal: number;
    /** Equipamentos da cena que entraram na conta (têm capacidades). */
    itensAvaliados: number;
  };
}

/** Um equipamento da cena já reduzido ao que a análise precisa. */
interface UsoEquip {
  nome: string;
  /** Ordem do cenário DO ITEM (o que o consultor classificou), não o da base. */
  ordem: number;
  capacidades: Capacidades;
}

function usosDaCena(cena: Cena, catalogo?: Equipamento[]): { usos: UsoEquip[]; naoReconhecidos: string[] } {
  const porId = new Map<string, Equipamento>();
  const porNome = new Map<string, Equipamento>();
  for (const e of catalogo ?? []) {
    if (e.id) porId.set(e.id, e);
    porNome.set(normalizar(e.nome), e);
  }
  const usos: UsoEquip[] = [];
  const naoReconhecidos: string[] = [];
  const jaAvisado = new Set<string>();
  for (const it of cena.itens ?? []) {
    const cat = (it.equipamentoId ? porId.get(it.equipamentoId) : null) ?? porNome.get(normalizar(it.nome)) ?? null;
    const b = baseDoItem(it, cat);
    if (!b) {
      const chave = normalizar(it.nome);
      if (chave && !jaAvisado.has(chave)) { jaAvisado.add(chave); naoReconhecidos.push(it.nome); }
      continue;
    }
    // Sem capacidades é silêncio deliberado (móvel de guarda, área de solo):
    // reconhecido, mas não contribui e não vira alerta.
    if (!b.capacidades) continue;
    usos.push({ nome: b.nome, ordem: (CENARIOS[it.cenario] ?? CENARIOS.balanceado).ordem, capacidades: b.capacidades });
  }
  return { usos, naoReconhecidos };
}

/** Acrescenta sem repetir e preservando a ordem em que a sala foi montada. */
function acrescentar<K>(mapa: Map<K, string[]>, chave: K, nome: string): void {
  const atual = mapa.get(chave);
  if (!atual) mapa.set(chave, [nome]);
  else if (!atual.includes(nome)) atual.push(nome);
}

function avaliar(usos: UsoEquip[]): { musculos: LinhaMusculo[]; padroes: LinhaPadrao[] } {
  const prim = new Map<Musculo, string[]>();
  const sec = new Map<Musculo, string[]>();
  const pad = new Map<PadraoMovimento, string[]>();
  for (const u of usos) {
    for (const m of u.capacidades.primario) acrescentar(prim, m, u.nome);
    for (const m of u.capacidades.secundario ?? []) acrescentar(sec, m, u.nome);
    for (const p of u.capacidades.padroes) acrescentar(pad, p, u.nome);
  }
  const musculos = MUSCULOS_ORDEM.map((m): LinhaMusculo => {
    const primarios = prim.get(m) ?? [];
    const secundarios = (sec.get(m) ?? []).filter((n) => !primarios.includes(n));
    return {
      musculo: m,
      label: MUSCULOS[m].label,
      regiao: MUSCULOS[m].regiao,
      status: primarios.length ? "coberto" : secundarios.length ? "fraco" : "descoberto",
      primarios,
      secundarios,
    };
  });
  const padroes = PADROES_ORDEM.map((p): LinhaPadrao => {
    const equipamentos = pad.get(p) ?? [];
    return { padrao: p, label: PADROES[p].label, coberto: equipamentos.length > 0, equipamentos };
  });
  return { musculos, padroes };
}

/** Até quantas compras a análise sugere. Passou disso não é lacuna de projeto,
 *  é projeto errado — e lista longa demais ninguém lê. */
const LIMITE_SUGESTOES = 5;

const listarPt = (itens: string[]): string =>
  itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

/**
 * O que comprar para fechar as lacunas.
 *
 * Guloso de propósito: escolhe primeiro o equipamento que resolve MAIS
 * lacunas, e no empate o do cenário mais barato. Um aparelho que cobre duas
 * ausências vale mais argumento que dois que cobrem uma cada.
 */
function sugerir(musculos: LinhaMusculo[], padroes: LinhaPadrao[], usos: UsoEquip[]): SugestaoCobertura[] {
  const presentes = new Set(usos.map((u) => u.nome));
  const faltaMus = new Set(musculos.filter((l) => l.status !== "coberto").map((l) => l.musculo));
  const faltaPad = new Set(padroes.filter((l) => !l.coberto).map((l) => l.padrao));
  const out: SugestaoCobertura[] = [];
  while ((faltaMus.size || faltaPad.size) && out.length < LIMITE_SUGESTOES) {
    let melhor: { b: BaseEquip; mus: Musculo[]; pad: PadraoMovimento[]; ganho: number } | null = null;
    for (const b of BASE_EQUIP) {
      if (!b.capacidades || presentes.has(b.nome)) continue;
      const mus = b.capacidades.primario.filter((m) => faltaMus.has(m));
      const pad = b.capacidades.padroes.filter((p) => faltaPad.has(p));
      // Músculo descoberto pesa o dobro do padrão: é o que o síndico enxerga.
      const ganho = mus.length * 2 + pad.length;
      if (!ganho) continue;
      const melhorEste = !melhor
        || ganho > melhor.ganho
        || (ganho === melhor.ganho && CENARIOS[b.cenario].ordem < CENARIOS[melhor.b.cenario].ordem);
      if (melhorEste) melhor = { b, mus, pad, ganho };
    }
    if (!melhor) break;
    for (const m of melhor.mus) faltaMus.delete(m);
    for (const p of melhor.pad) faltaPad.delete(p);
    presentes.add(melhor.b.nome);
    const alvos = [
      ...melhor.mus.map((m) => MUSCULOS[m].label.toLowerCase()),
      ...melhor.pad.map((p) => PADROES[p].label.toLowerCase()),
    ];
    out.push({
      equipamento: melhor.b.nome,
      cenario: melhor.b.cenario,
      musculos: melhor.mus,
      padroes: melhor.pad,
      porque: `Fecha ${listarPt(alvos)} — hoje sem estímulo principal na sala. Entra como ${CENARIOS[melhor.b.cenario].label}.`,
    });
  }
  return out;
}

/**
 * Cobertura muscular e de movimento da academia projetada.
 *
 * `catalogo` é opcional e serve para os itens renomeados: o nome do projeto vem
 * do fornecedor e nem sempre diz o que a máquina é.
 */
export function analisarCobertura(cena: Cena, catalogo?: Equipamento[]): CoberturaAcademia {
  const { usos, naoReconhecidos } = usosDaCena(cena, catalogo);
  const { musculos, padroes } = avaliar(usos);

  const niveis = (Object.keys(CENARIOS) as Cenario[]).sort((a, b) => CENARIOS[a].ordem - CENARIOS[b].ordem);
  const porCenario: CoberturaCenario[] = [];
  let cobertosAntes = new Set<Musculo>();
  for (const cenario of niveis) {
    // Acumulado: o Balanceado inclui o Essencial, como no orçamento.
    const parcial = avaliar(usos.filter((u) => u.ordem <= CENARIOS[cenario].ordem));
    const cobertos = parcial.musculos.filter((l) => l.status === "coberto").map((l) => l.musculo);
    porCenario.push({
      cenario,
      label: CENARIOS[cenario].label,
      cobertos,
      fracos: parcial.musculos.filter((l) => l.status === "fraco").map((l) => l.musculo),
      descobertos: parcial.musculos.filter((l) => l.status === "descoberto").map((l) => l.musculo),
      padroesDescobertos: parcial.padroes.filter((l) => !l.coberto).map((l) => l.padrao),
      ganha: cobertos.filter((m) => !cobertosAntes.has(m)),
    });
    cobertosAntes = new Set(cobertos);
  }

  return {
    musculos,
    padroes,
    sugestoes: sugerir(musculos, padroes, usos),
    porCenario,
    naoReconhecidos,
    resumo: {
      cobertos: musculos.filter((l) => l.status === "coberto").length,
      fracos: musculos.filter((l) => l.status === "fraco").length,
      descobertos: musculos.filter((l) => l.status === "descoberto").length,
      padroesCobertos: padroes.filter((l) => l.coberto).length,
      padroesTotal: padroes.length,
      itensAvaliados: usos.length,
    },
  };
}
