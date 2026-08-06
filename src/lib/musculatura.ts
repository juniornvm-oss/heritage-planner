// Vocabulário FECHADO de músculo e movimento — a régua da análise de cobertura.
//
// A pergunta que o síndico faz depois de olhar a planta é "esta academia treina
// o corpo inteiro ou sobrou buraco?". Responder exige vocabulário fechado: se
// cada equipamento escrever o nome do músculo do seu jeito, nada soma e a seção
// do Dossiê vira lista de adjetivos.
//
// São 14 grupos musculares + o sistema cardiovascular, e 18 padrões de
// movimento. O recorte é o do mapa corporal que o consultor já mostra ao
// cliente, não a anatomia completa: grupo demais deixa a leitura ilegível,
// grupo de menos esconde buraco de treino.
//
// Quem PREENCHE a ficha de cada equipamento (`capacidades`, em curadoria.ts) é
// o consultor, item a item. `tools/derivar-capacidades.mjs` só orienta: lê um
// dataset público de exercícios FORA do app e imprime um rascunho para revisão
// humana. Nada daquele dataset entra no bundle — ver docs/licencas.md.

/** Grupo do mapa corporal. Catorze músculos + o sistema cardiovascular, que
 *  não é músculo mas é a capacidade que a zona de ergometria entrega. */
export type Musculo =
  | "peitoral" | "costas" | "ombros"
  | "biceps" | "triceps" | "antebraco"
  | "abdomen" | "lombar"
  | "gluteos" | "adutores" | "abdutores"
  | "quadriceps" | "posterior" | "panturrilha"
  | "cardiovascular";

/** Região do corpo — é como o mapa corporal agrupa as caixas na tela. */
export type RegiaoCorpo = "tronco" | "bracos" | "core" | "quadril" | "pernas" | "sistemico";

export const REGIOES: Record<RegiaoCorpo, string> = {
  tronco: "Tronco",
  bracos: "Braços",
  core: "Centro do corpo",
  quadril: "Quadril",
  pernas: "Pernas",
  sistemico: "Sistêmico",
};

export interface GrupoMuscular {
  /** Nome que o consultor já usa na frente do cliente. */
  label: string;
  regiao: RegiaoCorpo;
  /** O que o grupo abarca. O mapa tem 14 caixas e a anatomia tem muito mais:
   *  sem esta linha, "Costas coberto" esconde que trapézio entrou junto. */
  inclui?: string;
}

/** Na ordem do mapa corporal — de cima para baixo, da frente para trás. */
export const MUSCULOS: Record<Musculo, GrupoMuscular> = {
  peitoral: { label: "Peitoral", regiao: "tronco" },
  costas: { label: "Costas", regiao: "tronco", inclui: "dorsais, trapézio e romboides" },
  ombros: { label: "Ombros", regiao: "tronco", inclui: "deltoide anterior, medial e posterior; manguito rotador" },
  biceps: { label: "Bíceps", regiao: "bracos" },
  triceps: { label: "Tríceps", regiao: "bracos" },
  antebraco: { label: "Antebraço", regiao: "bracos", inclui: "flexores e extensores do punho — a pegada" },
  abdomen: { label: "Abdômen", regiao: "core", inclui: "reto abdominal, oblíquos e serrátil" },
  lombar: { label: "Lombar", regiao: "core", inclui: "eretores da espinha — a musculatura que sustenta a coluna" },
  gluteos: { label: "Glúteos", regiao: "quadril" },
  adutores: { label: "Adutores", regiao: "quadril", inclui: "face interna da coxa" },
  abdutores: { label: "Abdutores", regiao: "quadril", inclui: "glúteo médio e mínimo — a estabilidade do quadril" },
  quadriceps: { label: "Quadríceps", regiao: "pernas" },
  posterior: { label: "Posterior de coxa", regiao: "pernas", inclui: "isquiotibiais" },
  panturrilha: { label: "Panturrilha", regiao: "pernas", inclui: "gastrocnêmio e sóleo" },
  cardiovascular: { label: "Sistema cardiovascular", regiao: "sistemico", inclui: "coração e pulmão — condicionamento aeróbio" },
};

/** Ordem canônica de leitura (a de `MUSCULOS`) — evita cada tela inventar a sua. */
export const MUSCULOS_ORDEM = Object.keys(MUSCULOS) as Musculo[];

/**
 * Colapsa o vocabulário sujo das fontes externas nos 14 grupos.
 *
 * Existe porque a mesma coisa aparece escrita de três jeitos ("traps",
 * "trapezius", "upper back") e porque a fonte usa recortes que o mapa corporal
 * não tem ("serratus anterior", "brachialis"). Sem esta tabela, o rascunho do
 * script viraria 50 rótulos soltos e a cobertura nunca fecharia.
 *
 * Chave em minúsculo, como a fonte escreve. Ver `NORM_IGNORADO` para o que é
 * conhecido e fica DE FORA de propósito.
 */
export const NORM_MUSCULO: Record<string, Musculo> = {
  // ── Tronco ──
  pectorals: "peitoral", chest: "peitoral", "upper chest": "peitoral",
  lats: "costas", "latissimus dorsi": "costas", "upper back": "costas", back: "costas",
  traps: "costas", trapezius: "costas", rhomboids: "costas", "levator scapulae": "costas",
  delts: "ombros", deltoids: "ombros", shoulders: "ombros",
  "rear deltoids": "ombros", "rotator cuff": "ombros",
  // ── Braços ──
  biceps: "biceps", brachialis: "biceps",
  triceps: "triceps",
  forearms: "antebraco", "wrist flexors": "antebraco", "wrist extensors": "antebraco",
  wrists: "antebraco", hands: "antebraco", "grip muscles": "antebraco",
  // ── Centro do corpo ──
  abs: "abdomen", abdominals: "abdomen", "lower abs": "abdomen", obliques: "abdomen",
  core: "abdomen", "serratus anterior": "abdomen",
  spine: "lombar", "lower back": "lombar",
  // ── Quadril ──
  glutes: "gluteos",
  adductors: "adutores", groin: "adutores", "inner thighs": "adutores",
  abductors: "abdutores",
  // ── Pernas ──
  quads: "quadriceps", quadriceps: "quadriceps",
  hamstrings: "posterior",
  calves: "panturrilha", soleus: "panturrilha",
  // ── Sistêmico ──
  "cardiovascular system": "cardiovascular",
};

/**
 * Rótulos da fonte que NÃO viram grupo do mapa — decisão, não esquecimento.
 *
 * Flexor de quadril é o caso que importa: aparece em 66 exercícios e a tentação
 * é jogá-lo em "abdômen". Seria inflar a cobertura de core com um músculo que
 * ninguém treina de propósito em academia de condomínio. O resto é tornozelo,
 * pé e pescoço — fora do que o Dossiê promete.
 */
export const NORM_IGNORADO: string[] = [
  "hip flexors", "ankles", "ankle stabilizers", "feet", "shins", "sternocleidomastoid",
];

/** Rótulo bruto → grupo do mapa. `null` quando não mapeia (ignorado ou novo). */
export function normalizarMusculo(bruto: string): Musculo | null {
  const k = String(bruto || "").toLowerCase().replace(/\s+/g, " ").trim();
  return NORM_MUSCULO[k] ?? null;
}

/**
 * Padrão de movimento — o segundo eixo da análise.
 *
 * Músculo sozinho engana: uma sala pode marcar "costas coberto" só com puxada
 * alta e não ter uma única remada. O padrão é o que mostra isso. É também a
 * linguagem em que o critério de dimensionamento da zona de força já está
 * escrito ("cobrir os grandes padrões sem repetir função").
 */
export type PadraoMovimento =
  | "empurrar_horizontal" | "empurrar_vertical" | "puxar_horizontal" | "puxar_vertical"
  | "abducao_ombro" | "flexao_cotovelo" | "extensao_cotovelo"
  | "agachar" | "dobrar_quadril" | "extensao_joelho" | "flexao_joelho"
  | "abducao_quadril" | "aducao_quadril" | "panturrilha"
  | "core_flexao" | "core_anti_extensao" | "core_rotacao"
  | "cardio";

export interface DefPadrao {
  label: string;
  /** Uma linha: o que é o movimento e onde ele aparece. */
  resumo: string;
}

export const PADROES: Record<PadraoMovimento, DefPadrao> = {
  empurrar_horizontal: { label: "Empurrar horizontal", resumo: "Supino, chest press e crucifixo — afastar a carga do peito." },
  empurrar_vertical: { label: "Empurrar vertical", resumo: "Desenvolvimento de ombros — levar a carga acima da cabeça." },
  puxar_horizontal: { label: "Puxar horizontal", resumo: "Remada — trazer a carga em direção ao tronco. É o par que costuma faltar." },
  puxar_vertical: { label: "Puxar vertical", resumo: "Puxada alta e barra fixa — trazer a carga de cima para baixo." },
  abducao_ombro: { label: "Elevar o braço pelo lado", resumo: "Elevação lateral — abdução de ombro, o que dá a largura da silhueta." },
  flexao_cotovelo: { label: "Flexionar o cotovelo", resumo: "Rosca — bíceps e antebraço." },
  extensao_cotovelo: { label: "Estender o cotovelo", resumo: "Tríceps na polia, banco ou máquina." },
  agachar: { label: "Agachar", resumo: "Joelho e quadril dobrando juntos com carga — agachamento, leg press, afundo." },
  dobrar_quadril: { label: "Dobrar o quadril", resumo: "Terra, stiff, elevação pélvica e hiperextensão — carga na cadeia posterior com o joelho pouco dobrado." },
  extensao_joelho: { label: "Estender o joelho", resumo: "Cadeira extensora — quadríceps isolado, sem carga na coluna." },
  flexao_joelho: { label: "Flexionar o joelho", resumo: "Mesa flexora — o posterior de coxa, que nenhum outro movimento isola." },
  abducao_quadril: { label: "Abrir o quadril", resumo: "Abdução — glúteo médio, a estabilidade lateral que o agachamento não treina." },
  aducao_quadril: { label: "Fechar o quadril", resumo: "Adução — face interna da coxa." },
  panturrilha: { label: "Flexão plantar", resumo: "Elevar o calcanhar com carga — panturrilha em pé ou sentado." },
  core_flexao: { label: "Flexionar o tronco", resumo: "Abdominal e elevação de pernas — encurtar a distância entre costela e quadril." },
  core_anti_extensao: { label: "Segurar o tronco (anti-extensão)", resumo: "Prancha e roda abdominal — resistir à extensão da coluna. Protege a lombar." },
  core_rotacao: { label: "Girar e resistir à rotação", resumo: "Lenhador e paloff — o plano que quase nenhuma máquina da sala cobre." },
  cardio: { label: "Esforço contínuo", resumo: "Caminhada, corrida, pedalada e remada — condicionamento aeróbio." },
};

/** Ordem canônica de leitura dos padrões (a de `PADROES`). */
export const PADROES_ORDEM = Object.keys(PADROES) as PadraoMovimento[];

/**
 * O que um equipamento entrega, em músculo e em movimento.
 *
 * `primario` é o que o aparelho EXISTE para treinar; `secundario` é o que ele
 * recruta junto. A distinção é o que separa "coberto" de "fraco" no Dossiê:
 * uma sala que só tem esteira não pode alegar treino de panturrilha.
 *
 * `padroes` é o movimento DISPONÍVEL no aparelho, e por isso pode ir além do
 * primário — a barra guiada permite panturrilha em pé sem ser uma
 * panturrilheira. Músculo responde "o que a sala treina"; padrão responde "o
 * que o morador consegue fazer aqui".
 */
export interface Capacidades {
  primario: Musculo[];
  secundario?: Musculo[];
  padroes: PadraoMovimento[];
}
