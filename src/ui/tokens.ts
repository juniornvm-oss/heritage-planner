/**
 * Espelho JS dos tokens de `global.css`.
 *
 * O canvas é Konva, que desenha em <canvas> e portanto NÃO lê `var(--gold)`.
 * Sem este espelho, cada cor do editor vira um literal solto — foi assim que
 * o canvas acabou com 22 ocorrências de um dourado (#C9A227) que a marca
 * abandonou quando adotou o cobre (#b8704a).
 *
 * Regra: cor que aparece nos DOIS lados mora aqui e em `global.css`, com o
 * mesmo valor. Cor que só existe no canvas (estados de desenho) mora só aqui.
 */

export const TOKENS = {
  // ── Superfícies ──
  bg: "#0a0a0b",
  canvas: "#0C0C0E",
  panel: "#101113",
  panel2: "#131416",
  line: "#212227",
  line2: "#303138",

  // ── Texto ──
  text: "#ececea",
  text2: "#c9c9c4",
  text3: "#b6b6b1",
  muted: "#8a8a90",
  text4: "#6e6e73",

  // ── Marca ──
  gold: "#b8704a", // cobre Heritage GymBuilder
  goldSoft: "rgba(184, 112, 74, 0.14)",

  // ── Semântica ──
  blue: "#4a90c4",
  green: "#5fbf7a",
  red: "#e04545",
  purple: "#8b78bc",
  warn: "#e09a45",
  info: "#5FC8E8",
  infoSoft: "#8FD6F0",
} as const;

/**
 * Cores de estado do canvas — o que cada realce significa na planta.
 *
 * Regra que faltava: cor de ESTADO nunca pode ser igual a cor de DADO. O
 * canvas usava #C9A227 tanto para "selecionado" quanto para a zona Força
 * guiada (`ZONAS.forca.cor`), então um aparelho de força selecionado ficava
 * idêntico a um não selecionado. `selecao` é um cobre claro, parente do cobre
 * da marca e distinto das quatro cores de zona.
 */
export const CANVAS = {
  /** Seleção e alças de edição. */
  selecao: "#F0A868",
  /** Guia de alinhamento e cota viva durante o arraste. */
  guia: TOKENS.info,
  /** Colisão: o item não pode ficar aí. */
  colisao: TOKENS.red,
  /** Aviso: área de uso invadida, corredor apertado. */
  aviso: TOKENS.warn,
  /** Confirmação: encaixe válido, ponto de fechamento do polígono. */
  ok: TOKENS.green,
  /** Fantasma da posição de origem durante o arraste. */
  ghost: "rgba(236, 236, 234, 0.22)",
  /** Traço da planta importada. */
  planta: "#9FB4C7",
  /** Grade. */
  grade: "#ffffff",
} as const;

/**
 * Durações de movimento, em MILISSEGUNDOS.
 *
 * Derivadas dos presets de spring do motion-dev-animations-skill, convertidas
 * para duração + cubic-bezier (o app não usa a biblioteca `motion`: ela não
 * anima nós Konva, que é onde a edição de layout acontece).
 *
 * O preset "Bouncy" do skill fica de fora de propósito: 37% de overshoot numa
 * ferramenta de MEDIÇÃO sugere que a peça se moveu além do ponto real.
 */
export const DUR = {
  press: 90,   // resposta ao toque
  fast: 140,   // seleção, realce
  base: 260,   // troca de estado, entrada de elemento
  panel: 400,  // painel, câmera
  modal: 480,
  exit: 180,   // saídas sempre mais rápidas que entradas
  stagger: 28, // atraso entre itens de lista
  staggerMax: 240,
} as const;

/** O usuário pediu menos movimento? Vale para as duas trilhas (DOM e Konva). */
export const reduzMovimento = (): boolean =>
  typeof window !== "undefined"
  && typeof window.matchMedia === "function"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
