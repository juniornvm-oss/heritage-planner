/**
 * ESQUADRIAS — o catálogo construtivo da Etapa 1 e a geometria dos símbolos
 * de planta baixa.
 *
 * Até aqui a Etapa 1 tinha quatro botões e nenhuma opção: toda parede nascia
 * com 15 cm e nenhum material, toda porta era um traço de 90 cm com um arco
 * genérico e toda janela era uma linha de 120 cm. Em papel isso não é planta
 * — é rascunho: quem lê não sabe se a parede é alvenaria ou drywall (o que
 * decide se o espelho de 200 cm pode ser pendurado), nem se a porta abre para
 * dentro (o que decide se cabe uma esteira ali na frente).
 *
 * Este módulo é a fonte única dessas escolhas. Ele responde a três perguntas,
 * e por isso é PURO (sem React, sem Konva): o canvas, a barra de propriedades,
 * a validação, a prévia em elevação e o Dossiê consomem os mesmos números.
 *
 *   1. Que variantes existem, e com que medidas de fábrica?  → catálogos
 *   2. Como cada variante se desenha em planta?              → `simboloAbertura`
 *   3. Que consequência funcional cada escolha tem?          → `setorGiro`,
 *      `avaliarFixacao`, `quadroDeEsquadrias`
 *
 * A terceira é a que importa: variante que não muda análise nenhuma é
 * decoração. Aqui, porta de correr não varre piso (libera a área que a de
 * giro bloqueia), drywall não recebe espelho sem reforço, e o quadro de
 * esquadrias sai no Dossiê como sai em projeto executivo.
 */

import type { Abertura, Parede, PilarPlanta, EstruturaPlanta, TipoElementoParede } from "./types";
import type { Ponto } from "./geometria";

// ─────────────────────────────────────────────────────────────────────────
// PAREDES
// ─────────────────────────────────────────────────────────────────────────

export type MaterialParede =
  | "alvenaria" | "alvenaria_uma_vez" | "bloco" | "concreto"
  | "drywall" | "drywall_duplo" | "madeira" | "vidro";

/** Como a parede se comporta quando alguém pendura algo nela. */
export type Fixacao =
  /** Recebe carga direto no substrato (bucha/parabolt). */
  | "livre"
  /** Precisa de reforço embutido ANTES do fechamento: montante duplo, chapa
   *  de OSB/compensado no miolo ou requadro metálico. */
  | "requer_reforco"
  /** Não recebe carga: a fixação tem de ir para a estrutura vizinha. */
  | "nao_recebe";

export interface DefParede {
  label: string;
  /** Espessura acabada padrão, em cm. */
  espessura_cm: number;
  /** Espessuras usuais, para os atalhos da barra de propriedades. */
  espessuras: number[];
  /** Cor do traço em planta. */
  cor: string;
  /** Como o corte é preenchido em planta. */
  hachura: "solida" | "dupla" | "listrada" | "vidro" | "diagonal";
  estrutural: boolean;
  fixacao: Fixacao;
  descricao: string;
  icone: string;
}

/**
 * Espessuras ACABADAS (com revestimento), que é o que interessa a quem vai
 * medir folga de circulação — não a medida nominal do bloco.
 */
export const PAREDES: Record<MaterialParede, DefParede> = {
  alvenaria: {
    label: "Alvenaria ½ vez", espessura_cm: 15, espessuras: [13, 15, 17],
    cor: "#C9C9C4", hachura: "solida", estrutural: false, fixacao: "livre",
    descricao: "Tijolo/bloco cerâmico assentado a meia vez, revestido nas duas faces. O padrão de vedação interna no Brasil.",
    icone: "▩",
  },
  alvenaria_uma_vez: {
    label: "Alvenaria 1 vez", espessura_cm: 25, espessuras: [23, 25, 28],
    cor: "#C9C9C4", hachura: "solida", estrutural: true, fixacao: "livre",
    descricao: "Tijolo assentado a uma vez. Divisa, empena e parede de fachada; aceita qualquer fixação.",
    icone: "▩",
  },
  bloco: {
    label: "Bloco de concreto", espessura_cm: 19, espessuras: [14, 19, 24],
    cor: "#BEBEB8", hachura: "solida", estrutural: true, fixacao: "livre",
    descricao: "Bloco estrutural ou de vedação. Melhor desempenho acústico que o cerâmico — relevante em sala de peso livre.",
    icone: "▨",
  },
  concreto: {
    label: "Concreto armado", espessura_cm: 20, espessuras: [12, 15, 20, 25],
    cor: "#A9A9A4", hachura: "diagonal", estrutural: true, fixacao: "livre",
    descricao: "Parede/pilar-parede da estrutura. Não pode ser demolida nem furada sem consulta ao calculista.",
    icone: "▰",
  },
  drywall: {
    label: "Drywall (chapa simples)", espessura_cm: 10, espessuras: [7.5, 9.5, 10, 12.5],
    cor: "#D6D2C8", hachura: "dupla", estrutural: false, fixacao: "requer_reforco",
    descricao: "Montante metálico 48/70 + uma chapa por face. Rápido e leve — mas cada ponto de carga exige reforço embutido antes do fechamento.",
    icone: "▤",
  },
  drywall_duplo: {
    label: "Drywall (chapa dupla)", espessura_cm: 14, espessuras: [12.5, 14, 15.5],
    cor: "#D6D2C8", hachura: "dupla", estrutural: false, fixacao: "requer_reforco",
    descricao: "Duas chapas por face sobre montante 70/90, com lã mineral. Melhor acústica; ainda assim carga pesada pede reforço.",
    icone: "▤",
  },
  madeira: {
    label: "Divisória de madeira", espessura_cm: 8, espessuras: [3.5, 5, 8, 10],
    cor: "#B08D63", hachura: "listrada", estrutural: false, fixacao: "requer_reforco",
    descricao: "Divisória naval/MDF em montante de madeira. Fecha ambiente de apoio; não é parede de carga nem de fixação pesada.",
    icone: "▥",
  },
  vidro: {
    label: "Vidro / pele de vidro", espessura_cm: 5, espessuras: [1, 2, 5, 10],
    cor: "#8FD6F0", hachura: "vidro", estrutural: false, fixacao: "nao_recebe",
    descricao: "Painel laminado ou temperado com perfil. Não recebe nada pendurado — espelho, TV e espaldar têm de ir para outra parede.",
    icone: "▢",
  },
};

export const MATERIAL_PAREDE_PADRAO: MaterialParede = "alvenaria";

export const defParede = (m?: MaterialParede | null): DefParede =>
  (m && PAREDES[m]) || PAREDES[MATERIAL_PAREDE_PADRAO];

/**
 * Elementos que puxam carga de verdade na parede da academia.
 *
 * Espelho de 200×200 em 4 mm pesa ~40 kg; espaldar recebe o peso de um corpo
 * em balanço; o split de ar-condicionado passa de 10 kg em braço de alavanca.
 * Tomada e sinalização, não — por isso a lista é fechada e explícita.
 */
export const ELEMENTOS_PESADOS: TipoElementoParede[] = [
  "espelho", "tv", "painel_tv", "espaldar", "prateleira", "colchonetes", "ar",
];

export const ehElementoPesado = (t: TipoElementoParede) => ELEMENTOS_PESADOS.includes(t);

/** O que acontece ao pendurar `tipo` numa parede de `material`. */
export function avaliarFixacao(
  material: MaterialParede | undefined,
  tipo: TipoElementoParede,
  reforcada?: boolean,
): { ok: boolean; nivel: Fixacao; motivo: string } {
  const def = defParede(material);
  if (!ehElementoPesado(tipo)) return { ok: true, nivel: "livre", motivo: "" };
  if (def.fixacao === "livre") return { ok: true, nivel: "livre", motivo: "" };
  if (def.fixacao === "nao_recebe") {
    return { ok: false, nivel: "nao_recebe", motivo: `${def.label} não recebe carga pendurada — remaneje para uma parede de alvenaria ou concreto.` };
  }
  if (reforcada) return { ok: true, nivel: "requer_reforco", motivo: "Reforço previsto em projeto." };
  return {
    ok: false, nivel: "requer_reforco",
    motivo: `${def.label} exige reforço embutido (montante duplo ou chapa de OSB no miolo) antes do fechamento — marque “parede reforçada”.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PORTAS
// ─────────────────────────────────────────────────────────────────────────

export type ModeloPorta =
  | "giro" | "dupla" | "correr" | "correr_dupla"
  | "sanfonada" | "pivotante" | "vaivem" | "vao";

export interface DefPorta {
  label: string;
  /** Vão livre padrão, em cm. */
  vao_cm: number;
  /** Altura do vão, em cm. */
  altura_cm: number;
  /** Vãos usuais, para os atalhos da barra de propriedades. */
  vaos: number[];
  folhas: number;
  /** A folha varre piso? Só quem varre bloqueia equipamento. */
  varre: boolean;
  /** A dobradiça fica numa das ombreiras (o "abre para a direita/esquerda"). */
  temLado: boolean;
  descricao: string;
  icone: string;
}

/**
 * Vãos de referência: 80 cm é o mínimo de acessibilidade da NBR 9050 para
 * porta de uso comum (vão livre de 80 cm com a folha aberta a 90°), e é o que
 * a academia de condomínio precisa cumprir na entrada.
 */
export const PORTAS: Record<ModeloPorta, DefPorta> = {
  giro: {
    label: "Giro (1 folha)", vao_cm: 90, altura_cm: 210, vaos: [70, 80, 90, 100],
    folhas: 1, varre: true, temLado: true, icone: "🚪",
    descricao: "Folha única em dobradiça. Varre um quarto de círculo do próprio tamanho — esse setor tem de ficar livre de equipamento.",
  },
  dupla: {
    label: "Dupla (2 folhas)", vao_cm: 160, altura_cm: 210, vaos: [140, 160, 180, 200],
    folhas: 2, varre: true, temLado: false, icone: "🚪",
    descricao: "Duas folhas em dobradiça, cada uma varrendo metade do vão. Entrada principal e passagem de equipamento grande.",
  },
  correr: {
    label: "Correr (1 folha)", vao_cm: 100, altura_cm: 210, vaos: [80, 90, 100, 120],
    folhas: 1, varre: false, temLado: true, icone: "⇥",
    descricao: "Desliza sobre trilho, embutida ou aparente. Não varre piso — é a escolha quando o vão dá para uma área de uso.",
  },
  correr_dupla: {
    label: "Correr (2 folhas)", vao_cm: 180, altura_cm: 210, vaos: [160, 180, 200, 240],
    folhas: 2, varre: false, temLado: false, icone: "⇹",
    descricao: "Duas folhas correndo para lados opostos. Abertura ampla sem consumir piso.",
  },
  sanfonada: {
    label: "Sanfonada", vao_cm: 90, altura_cm: 210, vaos: [70, 80, 90, 120],
    folhas: 1, varre: false, temLado: true, icone: "⋀",
    descricao: "Folhas articuladas que dobram sobre si. Ocupa pouco piso; usada em vestiário e depósito.",
  },
  pivotante: {
    label: "Pivotante", vao_cm: 110, altura_cm: 230, vaos: [100, 110, 120, 140],
    folhas: 1, varre: true, temLado: true, icone: "◑",
    descricao: "Gira em eixo recuado da ombreira: parte da folha vai para dentro e parte para fora. Varre os dois lados.",
  },
  vaivem: {
    label: "Vaivém", vao_cm: 90, altura_cm: 210, vaos: [80, 90, 100],
    folhas: 1, varre: true, temLado: true, icone: "⇄",
    descricao: "Abre nos dois sentidos, sem trinco. Varre um setor de cada lado da parede.",
  },
  vao: {
    label: "Vão livre (sem porta)", vao_cm: 120, altura_cm: 210, vaos: [90, 120, 150, 200],
    folhas: 0, varre: false, temLado: false, icone: "▯",
    descricao: "Passagem sem folha. Liga duas zonas da academia sem consumir piso nem exigir manutenção.",
  },
};

export const MODELO_PORTA_PADRAO: ModeloPorta = "giro";

/** Dobradiça na ombreira inicial (lado de x1,y1) ou final da parede. */
export type LadoAbertura = "esquerda" | "direita";
/** Para que face da parede a folha varre. "dentro" = face voltada à sala. */
export type SentidoAbertura = "dentro" | "fora";

// ─────────────────────────────────────────────────────────────────────────
// JANELAS
// ─────────────────────────────────────────────────────────────────────────

export type ModeloJanela =
  | "correr" | "correr_4" | "folhas" | "basculante" | "maxim_ar"
  | "guilhotina" | "pivotante" | "fixa" | "veneziana" | "cobogo";

/**
 * A FORMA do vão. Em planta baixa o corte é sempre reto — a forma aparece na
 * elevação, na prévia do editor e no quadro de esquadrias. Registrar isso é o
 * que separa "uma linha na parede" de uma esquadria especificada.
 */
export type FormaJanela = "retangular" | "arco_pleno" | "arco_abatido" | "circular" | "triangular";

export const FORMAS_JANELA: Record<FormaJanela, { label: string; descricao: string }> = {
  retangular: { label: "Retangular", descricao: "Vão reto — o padrão." },
  arco_pleno: { label: "Arco pleno", descricao: "Meia-circunferência sobre o vão; a altura inclui a flecha do arco." },
  arco_abatido: { label: "Arco abatido", descricao: "Arco rebaixado, de flecha menor que o raio." },
  circular: { label: "Circular (óculo)", descricao: "Vão redondo; largura e altura são o diâmetro." },
  triangular: { label: "Triangular", descricao: "Vão de oitão, sob água de telhado." },
};

export interface DefJanela {
  label: string;
  vao_cm: number;
  altura_cm: number;
  peitoril_cm: number;
  vaos: number[];
  folhas: number;
  /** A folha projeta para fora do plano da parede quando aberta. */
  projeta: boolean;
  descricao: string;
  icone: string;
}

export const JANELAS: Record<ModeloJanela, DefJanela> = {
  correr: {
    label: "Correr (2 folhas)", vao_cm: 120, altura_cm: 110, peitoril_cm: 110,
    vaos: [100, 120, 150, 200], folhas: 2, projeta: false, icone: "⇥",
    descricao: "Duas folhas deslizando em trilho. Abre metade do vão e não invade o ambiente — a mais comum.",
  },
  correr_4: {
    label: "Correr (4 folhas)", vao_cm: 200, altura_cm: 110, peitoril_cm: 110,
    vaos: [180, 200, 240, 300], folhas: 4, projeta: false, icone: "⇹",
    descricao: "Quatro folhas em dois trilhos. Vão largo de sala; abre metade.",
  },
  folhas: {
    label: "De abrir / folhas", vao_cm: 120, altura_cm: 120, peitoril_cm: 100,
    vaos: [60, 80, 120, 150], folhas: 2, projeta: true, icone: "⟨⟩",
    descricao: "Folhas em dobradiça vertical, abrindo 90°. Abre o vão inteiro, mas a folha invade um dos lados.",
  },
  basculante: {
    label: "Basculante", vao_cm: 100, altura_cm: 60, peitoril_cm: 160,
    vaos: [60, 80, 100, 120], folhas: 3, projeta: true, icone: "⌅",
    descricao: "Lâminas em eixo horizontal, projetando para fora. Ventila com privacidade — padrão de vestiário e sanitário.",
  },
  maxim_ar: {
    label: "Maxim-ar", vao_cm: 100, altura_cm: 80, peitoril_cm: 140,
    vaos: [80, 100, 120, 150], folhas: 1, projeta: true, icone: "⌃",
    descricao: "Folha única projetante no topo. Ventila mesmo sob chuva; a folha aberta avança sobre a fachada.",
  },
  guilhotina: {
    label: "Guilhotina", vao_cm: 100, altura_cm: 120, peitoril_cm: 100,
    vaos: [80, 100, 120], folhas: 2, projeta: false, icone: "⇅",
    descricao: "Folhas correndo na vertical. Não ocupa piso nem fachada; em planta lê-se como janela fixa.",
  },
  pivotante: {
    label: "Pivotante", vao_cm: 120, altura_cm: 120, peitoril_cm: 100,
    vaos: [100, 120, 150], folhas: 1, projeta: true, icone: "◑",
    descricao: "Folha girando em eixo central. Metade projeta para dentro e metade para fora.",
  },
  fixa: {
    label: "Fixa", vao_cm: 150, altura_cm: 120, peitoril_cm: 100,
    vaos: [100, 150, 200, 300], folhas: 1, projeta: false, icone: "▢",
    descricao: "Painel sem abertura, só iluminação. Numa academia, exige ventilação mecânica compensatória.",
  },
  veneziana: {
    label: "Veneziana", vao_cm: 100, altura_cm: 110, peitoril_cm: 110,
    vaos: [60, 80, 100, 120], folhas: 2, projeta: false, icone: "▤",
    descricao: "Lâminas fixas ou móveis. Ventila permanentemente sem vista — usada em casa de máquinas e depósito.",
  },
  cobogo: {
    label: "Cobogó", vao_cm: 120, altura_cm: 120, peitoril_cm: 90,
    vaos: [60, 120, 180, 240], folhas: 0, projeta: false, icone: "▦",
    descricao: "Elemento vazado de concreto ou cerâmica. Ventilação permanente e sombra; não fecha nem veda som.",
  },
};

export const MODELO_JANELA_PADRAO: ModeloJanela = "correr";

// ─────────────────────────────────────────────────────────────────────────
// PILARES
// ─────────────────────────────────────────────────────────────────────────

export type FormaPilar = "retangular" | "circular" | "L";
export type MaterialPilar = "concreto" | "alvenaria" | "metalico" | "madeira";

export const FORMAS_PILAR: Record<FormaPilar, { label: string; icone: string; descricao: string }> = {
  retangular: { label: "Retangular", icone: "▮", descricao: "Pilar de seção retangular — o caso comum." },
  circular: { label: "Circular", icone: "●", descricao: "Pilar redondo; largura e profundidade são o diâmetro." },
  L: { label: "Em L", icone: "◣", descricao: "Pilar de canto/encontro de vigas, com aba." },
};

export const MATERIAIS_PILAR: Record<MaterialPilar, { label: string; cor: string; descricao: string }> = {
  concreto: { label: "Concreto armado", cor: "#A9A9A4", descricao: "Estrutural. Não pode ser furado nem cortado." },
  alvenaria: { label: "Alvenaria", cor: "#C9C9C4", descricao: "Enchimento ou pilar de tijolo; verifique se é de carga." },
  metalico: { label: "Metálico", cor: "#93A9B8", descricao: "Perfil de aço, geralmente revestido. Seção menor para a mesma carga." },
  madeira: { label: "Madeira", cor: "#B08D63", descricao: "Pilar de madeira laminada ou maciça." },
};

// ─────────────────────────────────────────────────────────────────────────
// RESOLUÇÃO — cena antiga não tem nenhum destes campos
// ─────────────────────────────────────────────────────────────────────────

/** Modelo efetivo da abertura, com o padrão da família quando o dado é antigo
 *  ou incoerente (ex.: porta convertida em janela mantendo `modelo: "giro"`). */
export function modeloDaAbertura(ab: Abertura): ModeloPorta | ModeloJanela {
  if (ab.tipo === "porta") {
    const m = ab.modelo as ModeloPorta | undefined;
    return m && m in PORTAS ? m : MODELO_PORTA_PADRAO;
  }
  const m = ab.modelo as ModeloJanela | undefined;
  return m && m in JANELAS ? m : MODELO_JANELA_PADRAO;
}

export const defPorta = (m: ModeloPorta | ModeloJanela): DefPorta => PORTAS[m as ModeloPorta] ?? PORTAS[MODELO_PORTA_PADRAO];
export const defJanela = (m: ModeloPorta | ModeloJanela): DefJanela => JANELAS[m as ModeloJanela] ?? JANELAS[MODELO_JANELA_PADRAO];

/** Ficha resolvida de uma abertura: rótulos e medidas prontos para exibir. */
export interface FichaAbertura {
  label: string;
  icone: string;
  descricao: string;
  largura_cm: number;
  altura_cm: number;
  /** Só janela. */
  peitoril_cm: number | null;
  folhas: number;
  varre: boolean;
  forma: FormaJanela;
}

export function fichaAbertura(ab: Abertura): FichaAbertura {
  const m = modeloDaAbertura(ab);
  if (ab.tipo === "porta") {
    const d = defPorta(m);
    return {
      label: d.label, icone: d.icone, descricao: d.descricao,
      largura_cm: ab.largura_cm, altura_cm: ab.altura_cm ?? d.altura_cm,
      peitoril_cm: null, folhas: d.folhas, varre: d.varre, forma: "retangular",
    };
  }
  const d = defJanela(m);
  return {
    label: d.label, icone: d.icone, descricao: d.descricao,
    largura_cm: ab.largura_cm, altura_cm: ab.altura_cm ?? d.altura_cm,
    peitoril_cm: ab.peitoril_cm ?? d.peitoril_cm,
    folhas: d.folhas, varre: false, forma: ab.forma ?? "retangular",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// GEOMETRIA — o eixo da parede e o "para dentro"
// ─────────────────────────────────────────────────────────────────────────

export interface EixoParede {
  /** Início e fim. */
  a: Ponto; b: Ponto;
  /** Unitário ao longo da parede (a → b). */
  ux: number; uy: number;
  /** Unitário perpendicular, apontando para o INTERIOR da sala. */
  nx: number; ny: number;
  comprimento: number;
}

/**
 * Centro geométrico do conjunto de paredes — a referência de "para dentro".
 *
 * Sem isto, "abre para dentro" seria só "+90° do traço", que muda de lado
 * conforme a parede foi desenhada da esquerda para a direita ou o contrário:
 * duas portas iguais em paredes opostas apareceriam abrindo para lados
 * diferentes, e o setor de varredura cairia fora da sala.
 */
export function centroDaEstrutura(est: EstruturaPlanta | null | undefined, fallback: Ponto): Ponto {
  const ps = est?.paredes ?? [];
  if (!ps.length) return fallback;
  let sx = 0, sy = 0;
  for (const p of ps) { sx += p.x1 + p.x2; sy += p.y1 + p.y2; }
  return { x: sx / (ps.length * 2), y: sy / (ps.length * 2) };
}

/**
 * O conjunto de paredes fecha um contorno? (todo extremo encontra outro)
 *
 * É a licença para usar paridade de raio como teste de interior. Num traçado
 * aberto — três paredes soltas, uma divisória no meio da sala — a paridade não
 * significa nada, e aí o teste pelo centro é o menos pior.
 */
function conjuntoFechado(paredes: Parede[]): boolean {
  if (paredes.length < 3) return false;
  const chave = (x: number, y: number) => `${Math.round(x / 2)}:${Math.round(y / 2)}`; // tolerância de 2 cm
  const grau = new Map<string, number>();
  for (const p of paredes) {
    for (const k of [chave(p.x1, p.y1), chave(p.x2, p.y2)]) grau.set(k, (grau.get(k) ?? 0) + 1);
  }
  for (const g of grau.values()) if (g < 2) return false;
  return true;
}

/** Ponto dentro do contorno das paredes, por paridade de raio (+x). */
function dentroDasParedes(p: Ponto, paredes: Parede[]): boolean {
  let dentro = false;
  for (const w of paredes) {
    if ((w.y1 > p.y) !== (w.y2 > p.y)) {
      const x = w.x1 + ((p.y - w.y1) / (w.y2 - w.y1)) * (w.x2 - w.x1);
      if (p.x < x) dentro = !dentro;
    }
  }
  return dentro;
}

/**
 * Eixo da parede e — o que importa — para que lado fica o INTERIOR.
 *
 * Três regimes, do mais confiável para o menos:
 *
 *  1. Contorno fechado (`paredes` informado): lança-se um ponto de sonda a meia
 *     espessura da face e pergunta-se se ele está dentro, por paridade de raio.
 *     É o único teste que acerta planta em L, U ou T — nelas o "centro" é uma
 *     média que pode cair FORA da sala, e a parede reentrante ganhava a normal
 *     invertida: a porta varria o vazio e o equipamento encostado nela por
 *     dentro nunca era acusado.
 *  2. Traçado aberto: produto escalar contra `centroSala`, como antes.
 *  3. Empate (centro sobre a reta da parede — o caso de paredes colineares):
 *     canoniza-se a normal por convenção fixa. Não existe "dentro" aí, mas ao
 *     menos duas paredes iguais desenhadas em sentidos opostos passam a
 *     concordar entre si, em vez de abrir para lados diferentes.
 */
export function eixoDaParede(w: Parede, centroSala: Ponto, paredes?: Parede[]): EixoParede {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
  const comprimento = Math.hypot(dx, dy) || 1;
  const ux = dx / comprimento, uy = dy / comprimento;
  let nx = -uy, ny = ux;
  const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;

  let inverter: boolean;
  if (paredes && conjuntoFechado(paredes)) {
    const off = Math.max(w.espessura_cm, 4) / 2 + 0.1;
    inverter = !dentroDasParedes({ x: mx + nx * off, y: my + ny * off }, paredes);
  } else {
    const lado = (centroSala.x - mx) * nx + (centroSala.y - my) * ny;
    inverter = Math.abs(lado) < 1e-6
      ? (ny < -1e-9 || (Math.abs(ny) <= 1e-9 && nx < 0)) // convenção fixa no empate
      : lado < 0;
  }
  if (inverter) { nx = -nx; ny = -ny; }
  return { a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 }, ux, uy, nx, ny, comprimento };
}

/** Polilinha de um arco de círculo, em pontos planos [x,y,x,y,…]. */
export function arcoPontos(cx: number, cy: number, r: number, a0: number, a1: number, n = 16): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return out;
}

/** Diferença angular normalizada para (−π, π] — garante o arco pelo lado curto. */
const deltaAngulo = (de: number, para: number) => {
  let d = para - de;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/**
 * SETOR DE VARREDURA da folha, em polígono de mundo (cm).
 *
 * É o que transforma "porta de giro" numa restrição de projeto: nenhum
 * equipamento pode ocupar este setor, ou a porta não abre. Porta de correr,
 * sanfonada e vão livre devolvem lista vazia — e é por isso que trocar o
 * modelo LIBERA piso na análise.
 */
export function setoresGiro(ab: Abertura, w: Parede, centroSala: Ponto, paredes?: Parede[]): Ponto[][] {
  const m = modeloDaAbertura(ab);
  if (ab.tipo !== "porta") return [];
  const d = defPorta(m);
  if (!d.varre) return [];

  const e = eixoDaParede(w, centroSala, paredes);
  const meia = ab.largura_cm / 2;
  const cx = w.x1 + e.ux * ab.centro_cm, cy = w.y1 + e.uy * ab.centro_cm;
  // Ombreiras: P é a do lado do início da parede, Q a do lado do fim.
  const P = { x: cx - e.ux * meia, y: cy - e.uy * meia };
  const Q = { x: cx + e.ux * meia, y: cy + e.uy * meia };

  const dentro = (ab.sentido ?? "dentro") === "dentro" ? 1 : -1;
  const nx = e.nx * dentro, ny = e.ny * dentro;

  const setor = (pivo: Ponto, raio: number, dirFechada: Ponto, dirAberta: Ponto): Ponto[] => {
    const a0 = Math.atan2(dirFechada.y, dirFechada.x);
    const a1 = a0 + deltaAngulo(a0, Math.atan2(dirAberta.y, dirAberta.x));
    const pts = arcoPontos(pivo.x, pivo.y, raio, a0, a1, 12);
    const poly: Ponto[] = [{ x: pivo.x, y: pivo.y }];
    for (let i = 0; i < pts.length; i += 2) poly.push({ x: pts[i], y: pts[i + 1] });
    return poly;
  };

  if (m === "dupla") {
    const L = ab.largura_cm / 2;
    return [
      setor(P, L, { x: e.ux, y: e.uy }, { x: nx, y: ny }),
      setor(Q, L, { x: -e.ux, y: -e.uy }, { x: nx, y: ny }),
    ];
  }
  const naEsquerda = (ab.lado ?? "direita") === "esquerda";

  if (m === "pivotante") {
    // Eixo recuado a 20% do vão a partir da ombreira ESCOLHIDA: 80% da folha
    // varre um lado, 20% o outro. O controle de dobradiça vale aqui também —
    // a barra de propriedades o oferece e o quadro de esquadrias o imprime.
    const base = naEsquerda ? P : Q;
    const sx = naEsquerda ? e.ux : -e.ux, sy = naEsquerda ? e.uy : -e.uy;
    const pv = { x: base.x + sx * (ab.largura_cm * 0.2), y: base.y + sy * (ab.largura_cm * 0.2) };
    return [
      setor(pv, ab.largura_cm * 0.8, { x: sx, y: sy }, { x: nx, y: ny }),
      setor(pv, ab.largura_cm * 0.2, { x: -sx, y: -sy }, { x: -nx, y: -ny }),
    ];
  }

  const pivo = naEsquerda ? P : Q;
  const fechada = naEsquerda ? { x: e.ux, y: e.uy } : { x: -e.ux, y: -e.uy };
  if (m === "vaivem") {
    return [
      setor(pivo, ab.largura_cm, fechada, { x: nx, y: ny }),
      setor(pivo, ab.largura_cm, fechada, { x: -nx, y: -ny }),
    ];
  }
  return [setor(pivo, ab.largura_cm, fechada, { x: nx, y: ny })];
}

// ─────────────────────────────────────────────────────────────────────────
// SÍMBOLO DE PLANTA
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tudo que o canvas precisa desenhar para uma abertura, já em cm de mundo.
 * Só polilinhas: o mesmo dado serve ao Konva, a um SVG de prévia e a um teste.
 */
export interface SimboloAbertura {
  /** Segmento do vão — a parte da parede que o desenho "apaga". */
  vao: [Ponto, Ponto];
  /** Traço cheio: folha, painel, batente. */
  cheias: number[][];
  /** Traço fino: vidro, trilho, marcação. */
  finas: number[][];
  /** Traço tracejado: varredura da folha, projeção para fora. */
  tracejadas: number[][];
  /** Setas de deslizamento (correr/guilhotina), já com as farpas da ponta. */
  setas: number[][];
  /** Espessura sugerida do traço cheio, em cm de mundo. */
  espFolha_cm: number;
}

/** Farpas da ponta de uma seta, de (x1,y1) para (x2,y2). */
function pontaSeta(x1: number, y1: number, x2: number, y2: number, tam: number): number[][] {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const g = 0.42; // ~24°
  return [
    [x2, y2, x2 - tam * Math.cos(a - g), y2 - tam * Math.sin(a - g)],
    [x2, y2, x2 - tam * Math.cos(a + g), y2 - tam * Math.sin(a + g)],
  ];
}

export function simboloAbertura(ab: Abertura, w: Parede, centroSala: Ponto, paredes?: Parede[]): SimboloAbertura {
  const e = eixoDaParede(w, centroSala, paredes);
  const meia = ab.largura_cm / 2;
  const cx = w.x1 + e.ux * ab.centro_cm, cy = w.y1 + e.uy * ab.centro_cm;
  const P = { x: cx - e.ux * meia, y: cy - e.uy * meia };
  const Q = { x: cx + e.ux * meia, y: cy + e.uy * meia };
  const esp = Math.max(w.espessura_cm, 6);

  const sim: SimboloAbertura = {
    vao: [P, Q], cheias: [], finas: [], tracejadas: [], setas: [],
    espFolha_cm: ab.tipo === "porta" ? 3.5 : 3,
  };

  const dentro = (ab.sentido ?? "dentro") === "dentro" ? 1 : -1;
  const nx = e.nx * dentro, ny = e.ny * dentro;
  // Ombreiras: sempre desenhadas, em qualquer modelo — é o que mostra o vão.
  const ombreira = (p: Ponto) => [
    p.x - e.nx * (esp / 2), p.y - e.ny * (esp / 2),
    p.x + e.nx * (esp / 2), p.y + e.ny * (esp / 2),
  ];
  sim.finas.push(ombreira(P), ombreira(Q));

  const arco = (pivo: Ponto, raio: number, dirFechada: Ponto, dirAberta: Ponto) => {
    const a0 = Math.atan2(dirFechada.y, dirFechada.x);
    const a1 = a0 + deltaAngulo(a0, Math.atan2(dirAberta.y, dirAberta.x));
    return arcoPontos(pivo.x, pivo.y, raio, a0, a1, 14);
  };
  const folhaAberta = (pivo: Ponto, comp: number, sx: number, sy: number) =>
    [pivo.x, pivo.y, pivo.x + sx * comp, pivo.y + sy * comp];

  if (ab.tipo === "porta") {
    const m = modeloDaAbertura(ab) as ModeloPorta;
    const naEsquerda = (ab.lado ?? "direita") === "esquerda";
    const pivo = naEsquerda ? P : Q;
    const fechada = naEsquerda ? { x: e.ux, y: e.uy } : { x: -e.ux, y: -e.uy };

    if (m === "giro" || m === "vaivem") {
      sim.cheias.push(folhaAberta(pivo, ab.largura_cm, nx, ny));
      sim.tracejadas.push(arco(pivo, ab.largura_cm, fechada, { x: nx, y: ny }));
      if (m === "vaivem") {
        sim.cheias.push(folhaAberta(pivo, ab.largura_cm, -nx, -ny));
        sim.tracejadas.push(arco(pivo, ab.largura_cm, fechada, { x: -nx, y: -ny }));
      }
    } else if (m === "dupla") {
      const L = ab.largura_cm / 2;
      sim.cheias.push(folhaAberta(P, L, nx, ny), folhaAberta(Q, L, nx, ny));
      sim.tracejadas.push(
        arco(P, L, { x: e.ux, y: e.uy }, { x: nx, y: ny }),
        arco(Q, L, { x: -e.ux, y: -e.uy }, { x: nx, y: ny }),
      );
    } else if (m === "pivotante") {
      // Mesmo eixo de `setoresGiro`: recuado da ombreira ESCOLHIDA.
      const base = naEsquerda ? P : Q;
      const sx = naEsquerda ? e.ux : -e.ux, sy = naEsquerda ? e.uy : -e.uy;
      const pv = { x: base.x + sx * (ab.largura_cm * 0.2), y: base.y + sy * (ab.largura_cm * 0.2) };
      sim.cheias.push([
        pv.x - nx * (ab.largura_cm * 0.2), pv.y - ny * (ab.largura_cm * 0.2),
        pv.x + nx * (ab.largura_cm * 0.8), pv.y + ny * (ab.largura_cm * 0.8),
      ]);
      sim.tracejadas.push(
        arco(pv, ab.largura_cm * 0.8, { x: sx, y: sy }, { x: nx, y: ny }),
        arco(pv, ab.largura_cm * 0.2, { x: -sx, y: -sy }, { x: -nx, y: -ny }),
      );
      sim.finas.push([pv.x - e.ux * 3, pv.y - e.uy * 3, pv.x + e.ux * 3, pv.y + e.uy * 3]);
    } else if (m === "correr" || m === "correr_dupla") {
      // Painel deslizado para fora do vão, na face interna, e o trilho sobre o vão.
      const off = esp / 2 + 2;
      const painel = (de: Ponto, dirX: number, dirY: number, comp: number) => [
        de.x + nx * off, de.y + ny * off,
        de.x + dirX * comp + nx * off, de.y + dirY * comp + ny * off,
      ];
      sim.finas.push([P.x + nx * off, P.y + ny * off, Q.x + nx * off, Q.y + ny * off]); // trilho
      if (m === "correr") {
        const comp = ab.largura_cm;
        const dirX = naEsquerda ? -e.ux : e.ux, dirY = naEsquerda ? -e.uy : e.uy;
        const de = naEsquerda ? P : Q;
        sim.cheias.push(painel(de, dirX, dirY, comp));
        const s0 = { x: cx + nx * off, y: cy + ny * off };
        const s1 = { x: s0.x + dirX * (ab.largura_cm * 0.45), y: s0.y + dirY * (ab.largura_cm * 0.45) };
        sim.setas.push([s0.x, s0.y, s1.x, s1.y], ...pontaSeta(s0.x, s0.y, s1.x, s1.y, ab.largura_cm * 0.12));
      } else {
        const comp = ab.largura_cm / 2;
        sim.cheias.push(painel(P, -e.ux, -e.uy, comp), painel(Q, e.ux, e.uy, comp));
        const s0 = { x: cx + nx * off, y: cy + ny * off };
        for (const s of [1, -1]) {
          const s1 = { x: s0.x + e.ux * s * (comp * 0.7), y: s0.y + e.uy * s * (comp * 0.7) };
          sim.setas.push([s0.x, s0.y, s1.x, s1.y], ...pontaSeta(s0.x, s0.y, s1.x, s1.y, comp * 0.2));
        }
      }
    } else if (m === "sanfonada") {
      // Zigue-zague das folhas dobradas, recolhido junto à ombreira do pivô.
      const n = 4, passo = ab.largura_cm / n, amp = Math.min(passo, ab.largura_cm * 0.22);
      const dirX = naEsquerda ? e.ux : -e.ux, dirY = naEsquerda ? e.uy : -e.uy;
      const zig: number[] = [pivo.x, pivo.y];
      for (let i = 1; i <= n; i++) {
        const s = i % 2 ? 1 : 0;
        zig.push(pivo.x + dirX * passo * i + nx * amp * s, pivo.y + dirY * passo * i + ny * amp * s);
      }
      sim.cheias.push(zig);
    } else {
      // vão livre: só as ombreiras, já empilhadas acima.
      sim.finas.push([P.x, P.y, Q.x, Q.y]);
    }
    return sim;
  }

  // ── JANELAS ──
  const mj = modeloDaAbertura(ab) as ModeloJanela;
  const g = Math.max(1.2, esp * 0.16); // afastamento das linhas de vidro
  const vidro = (s: number) => [P.x + e.nx * s * g, P.y + e.ny * s * g, Q.x + e.nx * s * g, Q.y + e.ny * s * g];
  sim.finas.push(vidro(1), vidro(-1));

  if (mj === "correr" || mj === "correr_4") {
    const partes = mj === "correr" ? 2 : 4;
    const comp = ab.largura_cm / partes;
    for (let i = 0; i < partes; i++) {
      const s = i % 2 ? 1 : -1;
      const de = { x: P.x + e.ux * comp * i, y: P.y + e.uy * comp * i };
      sim.cheias.push([
        de.x + e.nx * s * g, de.y + e.ny * s * g,
        de.x + e.ux * comp + e.nx * s * g, de.y + e.uy * comp + e.ny * s * g,
      ]);
    }
    const s0 = { x: cx, y: cy }, s1 = { x: cx + e.ux * comp * 0.6, y: cy + e.uy * comp * 0.6 };
    sim.setas.push([s0.x, s0.y, s1.x, s1.y], ...pontaSeta(s0.x, s0.y, s1.x, s1.y, comp * 0.2));
  } else if (mj === "folhas") {
    const L = ab.largura_cm / 2;
    sim.cheias.push(folhaAberta(P, L, nx, ny), folhaAberta(Q, L, nx, ny));
    sim.tracejadas.push(
      arco(P, L, { x: e.ux, y: e.uy }, { x: nx, y: ny }),
      arco(Q, L, { x: -e.ux, y: -e.uy }, { x: nx, y: ny }),
    );
  } else if (mj === "basculante" || mj === "maxim_ar") {
    // Projeção para FORA (−n interna): triângulo tracejado, a folha em balanço.
    const px = -nx, py = -ny;
    const proj = mj === "maxim_ar" ? ab.altura_cm ?? JANELAS[mj].altura_cm : (ab.altura_cm ?? JANELAS[mj].altura_cm) / 2;
    const alcance = Math.max(12, Math.min(proj * 0.6, ab.largura_cm * 0.5));
    const ap = { x: cx + px * alcance, y: cy + py * alcance };
    sim.tracejadas.push([P.x, P.y, ap.x, ap.y], [Q.x, Q.y, ap.x, ap.y]);
    sim.setas.push([cx, cy, ap.x, ap.y], ...pontaSeta(cx, cy, ap.x, ap.y, alcance * 0.3));
  } else if (mj === "pivotante") {
    const L = ab.largura_cm / 2;
    sim.cheias.push([cx - nx * L * 0.5, cy - ny * L * 0.5, cx + nx * L * 0.5, cy + ny * L * 0.5]);
    sim.tracejadas.push(
      arco({ x: cx, y: cy }, L, { x: e.ux, y: e.uy }, { x: nx, y: ny }),
      arco({ x: cx, y: cy }, L, { x: -e.ux, y: -e.uy }, { x: -nx, y: -ny }),
    );
  } else if (mj === "guilhotina") {
    // Corre na vertical: em planta é uma fixa; a seta dupla marca o sentido.
    const t = Math.max(6, esp * 0.9);
    sim.setas.push(
      [cx - e.ux * t, cy - e.uy * t, cx + e.ux * t, cy + e.uy * t],
      ...pontaSeta(cx, cy, cx + e.ux * t, cy + e.uy * t, t * 0.5),
      ...pontaSeta(cx, cy, cx - e.ux * t, cy - e.uy * t, t * 0.5),
    );
  } else if (mj === "veneziana") {
    const n = Math.max(3, Math.round(ab.largura_cm / 12));
    for (let i = 0; i < n; i++) {
      const t0 = (i + 0.15) / n, t1 = (i + 0.85) / n;
      sim.cheias.push([
        P.x + e.ux * ab.largura_cm * t0 - e.nx * g, P.y + e.uy * ab.largura_cm * t0 - e.ny * g,
        P.x + e.ux * ab.largura_cm * t1 + e.nx * g, P.y + e.uy * ab.largura_cm * t1 + e.ny * g,
      ]);
    }
  } else if (mj === "cobogo") {
    const n = Math.max(2, Math.round(ab.largura_cm / 20));
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * ab.largura_cm;
      sim.finas.push([
        P.x + e.ux * t - e.nx * g, P.y + e.uy * t - e.ny * g,
        P.x + e.ux * t + e.nx * g, P.y + e.uy * t + e.ny * g,
      ]);
    }
  }
  // fixa: só as duas linhas de vidro.
  return sim;
}

// ─────────────────────────────────────────────────────────────────────────
// QUADRO DE ESQUADRIAS
// ─────────────────────────────────────────────────────────────────────────

export interface LinhaEsquadria {
  /** P1, P2… J1, J2… — repetido para esquadrias idênticas. */
  codigo: string;
  qtd: number;
  tipo: "porta" | "janela";
  modelo: string;
  largura_cm: number;
  altura_cm: number;
  peitoril_cm: number | null;
  /** Material da parede em que está — quem instala precisa saber. */
  parede: string;
  observacao: string;
}

/**
 * O quadro de esquadrias do projeto executivo: uma linha por esquadria
 * DIFERENTE, com a quantidade. Agrupa por tipo + modelo + medidas + peitoril,
 * porque é assim que se compra e é assim que o fabricante orça.
 */
export function quadroDeEsquadrias(est: EstruturaPlanta | null | undefined): LinhaEsquadria[] {
  const aberturas = est?.aberturas ?? [];
  if (!aberturas.length) return [];
  const paredes = new Map((est?.paredes ?? []).map((p) => [p.id, p]));

  const grupos = new Map<string, LinhaEsquadria>();
  // Ordem estável: portas antes de janelas, depois por largura — o código
  // gerado não pode dançar entre duas aberturas do mesmo PDF.
  const ordenadas = [...aberturas].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === "porta" ? -1 : 1;
    const fa = fichaAbertura(a), fb = fichaAbertura(b);
    return fa.largura_cm - fb.largura_cm || fa.altura_cm - fb.altura_cm || fa.label.localeCompare(fb.label, "pt-BR");
  });

  for (const ab of ordenadas) {
    const f = fichaAbertura(ab);
    const w = paredes.get(ab.paredeId);
    const dp = defParede(w?.material);
    const obs: string[] = [];
    if (ab.tipo === "porta") {
      const d = defPorta(modeloDaAbertura(ab));
      if (d.temLado) obs.push(`abre para a ${ab.lado === "esquerda" ? "esquerda" : "direita"}, para ${(ab.sentido ?? "dentro") === "dentro" ? "dentro" : "fora"}`);
      if (f.largura_cm < 80) obs.push("vão abaixo de 80 cm — fora do mínimo de acessibilidade da NBR 9050");
    } else if (f.forma !== "retangular") {
      obs.push(`vão ${FORMAS_JANELA[f.forma].label.toLowerCase()}`);
    }
    if (ab.nota?.trim()) obs.push(ab.nota.trim());
    const observacao = obs.join(" · ");
    // A OBSERVAÇÃO ENTRA NA CHAVE. Sem ela, duas portas iguais de mãos opostas
    // viravam uma linha "qtd 2 · abre para a esquerda" e o serralheiro
    // fabricava as duas com a mesma mão; e a nota da segunda ("porta
    // corta-fogo P-90", "com visor") sumia do quadro sem deixar rastro.
    // Agrupar só o que imprime exatamente a mesma linha.
    const chave = [ab.tipo, f.label, f.largura_cm, f.altura_cm, f.peitoril_cm ?? "-", f.forma, dp.label, observacao].join("|");
    const existente = grupos.get(chave);
    if (existente) { existente.qtd += 1; continue; }
    grupos.set(chave, {
      codigo: "", qtd: 1, tipo: ab.tipo, modelo: f.label,
      largura_cm: f.largura_cm, altura_cm: f.altura_cm, peitoril_cm: f.peitoril_cm,
      parede: dp.label, observacao,
    });
  }

  let nP = 0, nJ = 0;
  return [...grupos.values()].map((l) => ({
    ...l,
    codigo: l.tipo === "porta" ? `P${++nP}` : `J${++nJ}`,
  }));
}

/** Medida no formato de quadro de esquadrias: 0,90 × 2,10 (m). */
export const medidaEsquadria = (largura_cm: number, altura_cm: number) =>
  `${(largura_cm / 100).toFixed(2).replace(".", ",")} × ${(altura_cm / 100).toFixed(2).replace(".", ",")}`;

// ─────────────────────────────────────────────────────────────────────────
// PILAR — contorno conforme a forma
// ─────────────────────────────────────────────────────────────────────────

/** Contorno do pilar em pontos planos, para desenhar e para conferir choque. */
export function contornoPilar(p: PilarPlanta): number[] {
  const { x_cm: x, y_cm: y, w_cm: w, h_cm: h } = p;
  if (p.forma === "circular") {
    const r = Math.min(w, h) / 2;
    return arcoPontos(x + w / 2, y + h / 2, r, 0, 2 * Math.PI, 28);
  }
  if (p.forma === "L") {
    const a = w * 0.45, b = h * 0.45;
    return [x, y, x + w, y, x + w, y + b, x + a, y + b, x + a, y + h, x, y + h];
  }
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}
