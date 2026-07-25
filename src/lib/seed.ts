import type { Equipamento, SalaConfig, ItemPosicionado, Zona } from "./types";

// Catálogo local (fallback offline) — migrado do planner original.
export const CATALOGO_LOCAL: Equipamento[] = [
  { nome: "Esteira", largura_cm: 90, profundidade_cm: 205, zona: "ergo", preco: 0 },
  { nome: "Escada", largura_cm: 86, profundidade_cm: 147, zona: "ergo", preco: 45000 },
  { nome: "Elíptico", largura_cm: 66, profundidade_cm: 165, zona: "ergo", preco: 15000 },
  { nome: "Bike Horizontal", largura_cm: 66, profundidade_cm: 168, zona: "ergo", preco: 14800 },
  { nome: "Bike Spinning", largura_cm: 51, profundidade_cm: 110, zona: "ergo", preco: 8200 },
  { nome: "Cross + Smith", largura_cm: 219, profundidade_cm: 163, zona: "livre", preco: 40900 },
  { nome: "Squat Machine", largura_cm: 224, profundidade_cm: 133, zona: "forca", preco: 27700 },
  { nome: "Leg Press 45°", largura_cm: 246, profundidade_cm: 158, zona: "forca", preco: 40600 },
  { nome: "Elevação Pélvica", largura_cm: 158, profundidade_cm: 152, zona: "forca", preco: 13800 },
  { nome: "Lying Leg Curl", largura_cm: 178, profundidade_cm: 99, zona: "forca", preco: 29100 },
  { nome: "Dual Leg Extension", largura_cm: 142, profundidade_cm: 94, zona: "forca", preco: 23200 },
  { nome: "Dual Inner", largura_cm: 145, profundidade_cm: 69, zona: "forca", preco: 21500 },
  { nome: "Impact Delt Raise", largura_cm: 130, profundidade_cm: 117, zona: "forca", preco: 21500 },
  { nome: "Puxada + Remada", largura_cm: 198, profundidade_cm: 82, zona: "forca", preco: 21800 },
  { nome: "Cross Over Angular", largura_cm: 120, profundidade_cm: 270, zona: "forca", preco: 0 },
  { nome: "Estante Dumbbells", largura_cm: 60, profundidade_cm: 240, zona: "livre", preco: 0 },
  { nome: "Torre Halteres", largura_cm: 60, profundidade_cm: 90, zona: "livre", preco: 0 },
  { nome: "Banco 0-90°", largura_cm: 155, profundidade_cm: 64, zona: "livre", preco: 4600 },
  { nome: "Banco Declinado", largura_cm: 135, profundidade_cm: 86, zona: "livre", preco: 0 },
  { nome: "Banco Supino", largura_cm: 130, profundidade_cm: 55, zona: "livre", preco: 0 },
  { nome: "Espaldar", largura_cm: 120, profundidade_cm: 20, zona: "prep", preco: 0 },
  { nome: "Colchonetes", largura_cm: 80, profundidade_cm: 35, zona: "prep", preco: 0 },
];

export const HERITAGE_CONFIG: SalaConfig = {
  pisos: [
    { nome: "Vinílico 240", y0: 0, y1: 240, cor: "#241C12" },
    { nome: "Borracha 480", y0: 240, y1: 720, cor: "#14161A" },
    { nome: "Pista 100", y0: 720, y1: 820, cor: "#4A1E1E" },
    { nome: "Vinílico 300", y0: 820, y1: 1120, cor: "#241C12" },
  ],
  pilar: { x: 358, y: 302, w: 33, h: 47 },
  corredor: { x: 750, w: 100 },
  paredes: { top: "PAREDE PILAR · 1100", bottom: "PAREDE PORTA", left: "ESPELHO · 1120", right: "VIDRAÇA" },
  pista_label: "PISTA · VIDRAÇA ↔ ESPELHO",
};

const HERITAGE_POS: [string, number, number][] = [
  ["Escada", 70, 20], ["Elíptico", 205, 20], ["Bike Horizontal", 470, 20], ["Bike Spinning", 580, 20],
  ["Cross + Smith", 881, 20], ["Squat Machine", 876, 240], ["Elevação Pélvica", 942, 405],
  ["Leg Press 45°", 854, 562], ["Impact Delt Raise", 620, 240], ["Dual Leg Extension", 608, 391],
  ["Lying Leg Curl", 572, 519], ["Dual Inner", 605, 651], ["Puxada + Remada", 160, 285],
  ["Cross Over Angular", 440, 360], ["Estante Dumbbells", 15, 370], ["Torre Halteres", 15, 630],
  ["Banco Declinado", 150, 460], ["Banco 0-90°", 150, 560], ["Banco Supino", 155, 655],
  ["Esteira", 20, 905], ["Esteira", 133, 905], ["Esteira", 246, 905], ["Esteira", 359, 905],
  ["Espaldar", 510, 1095], ["Colchonetes", 660, 1080],
];

export function heritageItens(): ItemPosicionado[] {
  return HERITAGE_POS.map(([nome, x, y], i) => {
    const c = CATALOGO_LOCAL.find((m) => m.nome === nome)!;
    return {
      id: `h${i + 1}`,
      nome,
      x_cm: x,
      y_cm: y,
      w_cm: c.largura_cm,
      h_cm: c.profundidade_cm,
      rotacao: 0,
      zona: c.zona as Zona,
      cenario: "balanceado" as const,
      preco: c.preco,
    };
  });
}

export const SALA_PADRAO = { largura_cm: 1000, profundidade_cm: 800 };

/** Projeto Heritage embutido (modelo/offline) — id fixo "heritage". */
export function heritageProjeto(): import("./types").Projeto {
  return {
    id: "heritage",
    nome: "Heritage (modelo)",
    orcamento_teto: 250000,
    cena: {
      sala: { largura_cm: 1100, profundidade_cm: 1120, config: HERITAGE_CONFIG },
      planta: null,
      itens: heritageItens(),
    },
  };
}
