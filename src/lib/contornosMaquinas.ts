/**
 * Cópias de planta (vista de cima) no formato `contorno` do planner.
 *
 * Não são arquivos DWG/DXF dos fabricantes — esses blocos CAD são
 * proprietários e não redistribuímos. O que vai para a planta é a leitura
 * do footprint em escala (cm), no mesmo espírito de um layout DWG: silhueta
 * com console/banco/pilha/plataforma + caixa pontilhada.
 *
 * Sistema: 0..1, origem no canto superior esquerdo, Y para baixo.
 * Convenção de lados (`LADOS_PADRAO`): topo = frente, base = entrada.
 * Cardio: console/display no topo; o utilizador sobe pela base.
 * O consultor pode colar o DWG/DXF real na ficha do equipamento para
 * substituir esta cópia pelo contorno extraído do arquivo.
 */

import type { Equipamento } from "./types"

export type Traço = number[]

function r3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function fechado(...pts: number[]): number[] {
  const p = pts.map(r3)
  if (p.length < 4) return p
  if (p[0] !== p[p.length - 2] || p[1] !== p[p.length - 1]) {
    p.push(p[0], p[1])
  }
  return p
}

function rect(x: number, y: number, w: number, h: number): number[] {
  return fechado(x, y, x + w, y, x + w, y + h, x, y + h)
}

function oval(cx: number, cy: number, rx: number, ry: number, n = 20): number[] {
  const pts: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)
  }
  return fechado(...pts)
}

function linha(...pts: number[]): number[] {
  return pts.map(r3)
}

/** Chevron na base — marca a entrada (de onde o utilizador aborda a peça). */
function setaEntrada(): Traço[] {
  return [linha(0.40, 0.955, 0.50, 0.995, 0.60, 0.955)]
}

function comEntrada(tracos: Traço[]): Traço[] {
  return [...tracos, ...setaEntrada()]
}

/** Pilhas de pinos (selectorized) ou chifres de anilha (plate-loaded). */
function cargas(comPilhas: boolean, y0 = 0.1, y1 = 0.55): Traço[] {
  if (comPilhas) {
    return [rect(0.04, y0, 0.12, y1 - y0), rect(0.84, y0, 0.12, y1 - y0)]
  }
  return [
    oval(0.1, y0 + 0.08, 0.055, 0.055, 14),
    oval(0.9, y0 + 0.08, 0.055, 0.055, 14),
    oval(0.1, y0 + 0.22, 0.055, 0.055, 14),
    oval(0.9, y0 + 0.22, 0.055, 0.055, 14),
  ]
}

/** Esteira: console na frente (topo), esteira para baixo, entrada na base. */
const ESTEIRA: Traço[] = [
  rect(0.18, 0.02, 0.64, 0.14),
  rect(0.28, 0.04, 0.44, 0.08),
  rect(0.16, 0.16, 0.68, 0.78),
  rect(0.24, 0.20, 0.52, 0.68),
  linha(0.24, 0.36, 0.76, 0.36),
  linha(0.24, 0.52, 0.76, 0.52),
  linha(0.24, 0.68, 0.76, 0.68),
  linha(0.16, 0.18, 0.16, 0.86),
  linha(0.84, 0.18, 0.84, 0.86),
]

const ESTEIRA_CURVA: Traço[] = [
  rect(0.28, 0.02, 0.44, 0.12),
  fechado(0.22, 0.14, 0.78, 0.14, 0.86, 0.52, 0.78, 0.92, 0.22, 0.92, 0.14, 0.52),
  fechado(0.30, 0.22, 0.70, 0.22, 0.76, 0.50, 0.70, 0.84, 0.30, 0.84, 0.24, 0.50),
  linha(0.32, 0.38, 0.68, 0.38),
  linha(0.30, 0.54, 0.70, 0.54),
  linha(0.32, 0.70, 0.68, 0.70),
]

/** Elíptico: drive/console na frente; pedais e estabilizador para a entrada. */
const ELIPTICO: Traço[] = [
  rect(0.32, 0.02, 0.36, 0.10),
  oval(0.50, 0.22, 0.22, 0.14, 18),
  rect(0.16, 0.34, 0.68, 0.08),
  linha(0.28, 0.12, 0.22, 0.56),
  linha(0.72, 0.12, 0.78, 0.56),
  oval(0.28, 0.64, 0.13, 0.07, 14),
  oval(0.72, 0.64, 0.13, 0.07, 14),
  linha(0.16, 0.88, 0.84, 0.88),
  rect(0.38, 0.82, 0.24, 0.08),
]

const BIKE_V: Traço[] = [
  rect(0.36, 0.02, 0.28, 0.08),
  oval(0.50, 0.16, 0.12, 0.08, 12),
  linha(0.50, 0.24, 0.50, 0.70),
  oval(0.50, 0.48, 0.08, 0.07, 12),
  oval(0.50, 0.72, 0.22, 0.14, 18),
  linha(0.22, 0.90, 0.78, 0.90),
]

/** Bike horizontal: console e pedais na frente; encosto / entrada na base. */
const BIKE_H: Traço[] = [
  rect(0.28, 0.02, 0.44, 0.12),
  oval(0.50, 0.22, 0.16, 0.10, 14),
  rect(0.38, 0.28, 0.24, 0.32),
  oval(0.50, 0.68, 0.18, 0.12, 14),
  rect(0.30, 0.78, 0.40, 0.14),
  linha(0.16, 0.92, 0.84, 0.92),
]

/** Spinning: volante e guidão na frente; selim e estabilizador na entrada. */
const SPIN: Traço[] = [
  oval(0.50, 0.16, 0.18, 0.14, 18),
  oval(0.50, 0.18, 0.09, 0.07, 12),
  linha(0.50, 0.28, 0.50, 0.72),
  oval(0.50, 0.52, 0.07, 0.07, 12),
  linha(0.22, 0.90, 0.78, 0.90),
  linha(0.28, 0.22, 0.72, 0.48),
]

const ESCADA: Traço[] = [
  rect(0.28, 0.02, 0.44, 0.12),
  rect(0.22, 0.14, 0.56, 0.78),
  rect(0.30, 0.22, 0.40, 0.08),
  rect(0.30, 0.34, 0.40, 0.08),
  rect(0.30, 0.46, 0.40, 0.08),
  rect(0.30, 0.58, 0.40, 0.08),
  rect(0.30, 0.70, 0.40, 0.08),
  linha(0.22, 0.16, 0.22, 0.88),
  linha(0.78, 0.16, 0.78, 0.88),
]

const REMO: Traço[] = [
  oval(0.50, 0.12, 0.22, 0.10, 16),
  rect(0.32, 0.04, 0.36, 0.08),
  linha(0.28, 0.22, 0.72, 0.22),
  rect(0.42, 0.24, 0.16, 0.58),
  rect(0.36, 0.50, 0.28, 0.12),
  oval(0.50, 0.90, 0.08, 0.05, 10),
]

function sentadoEmpurrar(comPilhas: boolean): Traço[] {
  return [
    rect(0.22, 0.08, 0.56, 0.16),
    rect(0.30, 0.24, 0.40, 0.18),
    rect(0.28, 0.44, 0.44, 0.12),
    ...cargas(comPilhas, 0.10, 0.50),
    linha(0.22, 0.62, 0.78, 0.62),
    rect(0.34, 0.72, 0.32, 0.18),
  ]
}

function voador(comPilhas: boolean): Traço[] {
  return [
    rect(0.28, 0.10, 0.44, 0.16),
    rect(0.32, 0.28, 0.36, 0.20),
    fechado(0.08, 0.38, 0.28, 0.28, 0.30, 0.55, 0.12, 0.62),
    fechado(0.92, 0.38, 0.72, 0.28, 0.70, 0.55, 0.88, 0.62),
    ...cargas(comPilhas, 0.08, 0.42),
    rect(0.34, 0.72, 0.32, 0.18),
  ]
}

/** Elevação lateral: banco central e braços articulados para os lados. */
function deltRaise(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.08, 0.40),
    rect(0.34, 0.28, 0.32, 0.22),
    fechado(0.06, 0.22, 0.32, 0.32, 0.30, 0.50, 0.08, 0.54),
    fechado(0.94, 0.22, 0.68, 0.32, 0.70, 0.50, 0.92, 0.54),
    rect(0.36, 0.72, 0.28, 0.18),
  ]
}

function puxada(comPilhas: boolean): Traço[] {
  return [
    rect(0.08, 0.04, 0.84, 0.10),
    linha(0.18, 0.14, 0.18, 0.72),
    linha(0.82, 0.14, 0.82, 0.72),
    ...cargas(comPilhas, 0.16, 0.58),
    rect(0.32, 0.58, 0.36, 0.14),
    linha(0.28, 0.74, 0.72, 0.74),
    rect(0.34, 0.80, 0.32, 0.14),
  ]
}

function remada(comPilhas: boolean): Traço[] {
  return [
    rect(0.28, 0.06, 0.44, 0.14),
    rect(0.32, 0.20, 0.36, 0.16),
    ...cargas(comPilhas, 0.08, 0.48),
    rect(0.30, 0.40, 0.40, 0.14),
    linha(0.22, 0.72, 0.78, 0.72),
    rect(0.34, 0.78, 0.32, 0.14),
  ]
}

function extensora(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.06, 0.40),
    rect(0.28, 0.12, 0.44, 0.18),
    rect(0.30, 0.32, 0.40, 0.22),
    oval(0.50, 0.68, 0.22, 0.08, 14),
    rect(0.34, 0.80, 0.32, 0.14),
  ]
}

function flexoraDeitada(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.04, 0.28),
    rect(0.22, 0.12, 0.56, 0.52),
    oval(0.50, 0.22, 0.16, 0.08, 12),
    oval(0.50, 0.72, 0.20, 0.08, 12),
    rect(0.30, 0.84, 0.40, 0.10),
  ]
}

function flexoraSentada(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.06, 0.38),
    rect(0.28, 0.10, 0.44, 0.16),
    rect(0.30, 0.28, 0.40, 0.22),
    oval(0.50, 0.62, 0.24, 0.08, 14),
    rect(0.34, 0.78, 0.32, 0.14),
  ]
}

/** Leg press: plataforma na frente (topo); banco / entrada na base. */
function legPress(comPilhas: boolean): Traço[] {
  return [
    rect(0.18, 0.04, 0.64, 0.22),
    linha(0.28, 0.26, 0.22, 0.78),
    linha(0.72, 0.26, 0.78, 0.78),
    rect(0.24, 0.78, 0.52, 0.16),
    ...(comPilhas
      ? cargas(true, 0.32, 0.70)
      : [
          oval(0.12, 0.38, 0.07, 0.07, 12),
          oval(0.88, 0.38, 0.07, 0.07, 12),
          oval(0.10, 0.52, 0.07, 0.07, 12),
          oval(0.90, 0.52, 0.07, 0.07, 12),
        ]),
  ]
}

function hack(comPilhas: boolean): Traço[] {
  return [
    rect(0.28, 0.04, 0.44, 0.14),
    linha(0.32, 0.18, 0.26, 0.82),
    linha(0.68, 0.18, 0.74, 0.82),
    rect(0.22, 0.82, 0.56, 0.12),
    ...cargas(comPilhas, 0.22, 0.62),
  ]
}

function abdutora(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.06, 0.40),
    rect(0.32, 0.12, 0.36, 0.20),
    rect(0.34, 0.34, 0.32, 0.16),
    fechado(0.06, 0.42, 0.34, 0.38, 0.36, 0.58, 0.10, 0.68),
    fechado(0.94, 0.42, 0.66, 0.38, 0.64, 0.58, 0.90, 0.68),
    rect(0.36, 0.78, 0.28, 0.14),
  ]
}

function gluteo(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.12, 0.38),
    rect(0.18, 0.08, 0.64, 0.16),
    rect(0.28, 0.26, 0.44, 0.28),
    oval(0.16, 0.46, 0.08, 0.08, 12),
    oval(0.84, 0.46, 0.08, 0.08, 12),
    rect(0.34, 0.72, 0.32, 0.18),
  ]
}

function abdominal(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.08, 0.40),
    rect(0.30, 0.12, 0.40, 0.16),
    rect(0.32, 0.30, 0.36, 0.20),
    oval(0.50, 0.62, 0.20, 0.08, 12),
    rect(0.36, 0.80, 0.28, 0.12),
  ]
}

function lombar(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.06, 0.32),
    oval(0.50, 0.18, 0.16, 0.10, 12),
    rect(0.30, 0.30, 0.40, 0.22),
    linha(0.22, 0.72, 0.78, 0.72),
    rect(0.34, 0.80, 0.32, 0.12),
  ]
}

function braco(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.08, 0.46),
    rect(0.30, 0.10, 0.40, 0.16),
    rect(0.34, 0.28, 0.32, 0.18),
    linha(0.22, 0.56, 0.78, 0.56),
    rect(0.36, 0.78, 0.28, 0.14),
  ]
}

function panturrilha(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.08, 0.50),
    rect(0.30, 0.08, 0.40, 0.14),
    rect(0.34, 0.70, 0.32, 0.22),
    linha(0.38, 0.22, 0.38, 0.70),
    linha(0.62, 0.22, 0.62, 0.70),
  ]
}

const CROSSOVER: Traço[] = [
  rect(0.04, 0.08, 0.20, 0.72),
  rect(0.76, 0.08, 0.20, 0.72),
  rect(0.04, 0.08, 0.92, 0.08),
  oval(0.14, 0.16, 0.05, 0.05, 10),
  oval(0.86, 0.16, 0.05, 0.05, 10),
  oval(0.14, 0.72, 0.05, 0.05, 10),
  oval(0.86, 0.72, 0.05, 0.05, 10),
  linha(0.24, 0.50, 0.76, 0.50),
  rect(0.08, 0.80, 0.12, 0.12),
  rect(0.80, 0.80, 0.12, 0.12),
]

const SMITH: Traço[] = [
  rect(0.12, 0.06, 0.12, 0.80),
  rect(0.76, 0.06, 0.12, 0.80),
  linha(0.12, 0.42, 0.88, 0.42),
  linha(0.18, 0.22, 0.82, 0.22),
  linha(0.18, 0.62, 0.82, 0.62),
  rect(0.28, 0.72, 0.44, 0.18),
  rect(0.08, 0.86, 0.20, 0.08),
  rect(0.72, 0.86, 0.20, 0.08),
]

/** Smith combinado com cruzamento de cabos — colunas, barra e torres laterais. */
const SMITH_CROSS: Traço[] = [
  rect(0.02, 0.08, 0.14, 0.72),
  rect(0.84, 0.08, 0.14, 0.72),
  rect(0.02, 0.06, 0.96, 0.10),
  rect(0.22, 0.08, 0.08, 0.72),
  rect(0.70, 0.08, 0.08, 0.72),
  linha(0.20, 0.40, 0.80, 0.40),
  oval(0.09, 0.16, 0.05, 0.05, 10),
  oval(0.91, 0.16, 0.05, 0.05, 10),
  oval(0.09, 0.72, 0.05, 0.05, 10),
  oval(0.91, 0.72, 0.05, 0.05, 10),
  rect(0.36, 0.70, 0.28, 0.20),
]

const RACK: Traço[] = [
  rect(0.10, 0.06, 0.10, 0.80),
  rect(0.80, 0.06, 0.10, 0.80),
  rect(0.10, 0.06, 0.10, 0.12),
  rect(0.80, 0.06, 0.10, 0.12),
  linha(0.10, 0.08, 0.90, 0.08),
  linha(0.20, 0.48, 0.80, 0.48),
  rect(0.22, 0.70, 0.56, 0.18),
  rect(0.06, 0.86, 0.18, 0.08),
  rect(0.76, 0.86, 0.18, 0.08),
]

const GAIOLA: Traço[] = [
  rect(0.08, 0.06, 0.10, 0.78),
  rect(0.82, 0.06, 0.10, 0.78),
  rect(0.08, 0.06, 0.10, 0.12),
  rect(0.82, 0.06, 0.10, 0.12),
  linha(0.08, 0.08, 0.92, 0.08),
  linha(0.18, 0.08, 0.18, 0.84),
  linha(0.82, 0.08, 0.82, 0.84),
  linha(0.18, 0.50, 0.82, 0.50),
  rect(0.28, 0.68, 0.44, 0.16),
]

/** Dual lat + row: duas torres e bancos na entrada. */
const PUXADA_REMADA: Traço[] = [
  rect(0.04, 0.08, 0.16, 0.70),
  rect(0.80, 0.08, 0.16, 0.70),
  rect(0.04, 0.06, 0.92, 0.10),
  linha(0.08, 0.18, 0.92, 0.18),
  linha(0.22, 0.16, 0.22, 0.52),
  linha(0.78, 0.16, 0.78, 0.52),
  rect(0.22, 0.52, 0.22, 0.28),
  rect(0.56, 0.52, 0.22, 0.28),
]

const BANCO_SUPINO: Traço[] = [
  rect(0.18, 0.08, 0.12, 0.28),
  rect(0.70, 0.08, 0.12, 0.28),
  linha(0.18, 0.16, 0.82, 0.16),
  rect(0.38, 0.22, 0.24, 0.62),
  rect(0.28, 0.84, 0.44, 0.10),
]

const BANCO: Traço[] = [
  rect(0.32, 0.10, 0.36, 0.22),
  rect(0.36, 0.32, 0.28, 0.50),
  linha(0.22, 0.88, 0.78, 0.88),
]

const BANCO_DECLINADO: Traço[] = [
  fechado(0.30, 0.08, 0.70, 0.08, 0.66, 0.30, 0.34, 0.30),
  rect(0.36, 0.30, 0.28, 0.52),
  linha(0.22, 0.88, 0.78, 0.88),
]

const ESTANTE: Traço[] = [
  rect(0.08, 0.12, 0.84, 0.76),
  linha(0.12, 0.28, 0.88, 0.28),
  linha(0.12, 0.44, 0.88, 0.44),
  linha(0.12, 0.60, 0.88, 0.60),
  linha(0.12, 0.76, 0.88, 0.76),
  linha(0.50, 0.12, 0.50, 0.88),
]

const TORRE: Traço[] = [
  rect(0.18, 0.08, 0.64, 0.84),
  linha(0.22, 0.24, 0.78, 0.24),
  linha(0.22, 0.40, 0.78, 0.40),
  linha(0.22, 0.56, 0.78, 0.56),
  linha(0.22, 0.72, 0.78, 0.72),
  linha(0.50, 0.08, 0.50, 0.92),
]

const ARVORE: Traço[] = [
  oval(0.50, 0.82, 0.22, 0.10, 14),
  linha(0.50, 0.12, 0.50, 0.82),
  oval(0.28, 0.22, 0.10, 0.10, 12),
  oval(0.72, 0.22, 0.10, 0.10, 12),
  oval(0.22, 0.40, 0.10, 0.10, 12),
  oval(0.78, 0.40, 0.10, 0.10, 12),
  oval(0.22, 0.58, 0.10, 0.10, 12),
  oval(0.78, 0.58, 0.10, 0.10, 12),
]

const ESPALDAR: Traço[] = [
  rect(0.02, 0.08, 0.96, 0.84),
  linha(0.02, 0.08, 0.02, 0.92),
  linha(0.98, 0.08, 0.98, 0.92),
  linha(0.08, 0.22, 0.92, 0.22),
  linha(0.08, 0.38, 0.92, 0.38),
  linha(0.08, 0.54, 0.92, 0.54),
  linha(0.08, 0.70, 0.92, 0.70),
  linha(0.08, 0.86, 0.92, 0.86),
]

const COLCHONETES: Traço[] = [
  rect(0.06, 0.18, 0.78, 0.62),
  rect(0.12, 0.24, 0.78, 0.62),
  rect(0.18, 0.30, 0.74, 0.56),
]

const POR_FUNCAO: Record<string, (comPilhas: boolean) => Traço[]> = {
  Esteira: () => ESTEIRA,
  "Esteira curva": () => ESTEIRA_CURVA,
  Elíptico: () => ELIPTICO,
  "Bike Vertical": () => BIKE_V,
  "Bike Horizontal": () => BIKE_H,
  "Bike Spinning": () => SPIN,
  Escada: () => ESCADA,
  Remo: () => REMO,
  "Supino máquina": sentadoEmpurrar,
  Voador: voador,
  "Desenvolvimento de ombros": sentadoEmpurrar,
  "Elevação lateral": deltRaise,
  Puxada: puxada,
  Remada: remada,
  "Puxada + Remada": () => PUXADA_REMADA,
  "Cadeira Extensora": extensora,
  "Mesa Flexora": flexoraDeitada,
  "Cadeira Flexora": flexoraSentada,
  "Leg Press 45°": legPress,
  "Hack squat": hack,
  Abdutora: abdutora,
  Adutora: abdutora,
  "Elevação pélvica": gluteo,
  "Cadeira abdominal": abdominal,
  "Extensão lombar": lombar,
  Tríceps: braco,
  "Rosca bíceps": braco,
  Panturrilha: panturrilha,
  "Cross Over": () => CROSSOVER,
  "Smith Rack": () => SMITH,
  "Smith + Cross": () => SMITH_CROSS,
  "Power Rack": () => RACK,
  Gaiola: () => GAIOLA,
  "Banco supino": () => BANCO_SUPINO,
  "Banco regulável": () => BANCO,
  "Banco inclinado": () => BANCO,
  "Banco declinado": () => BANCO_DECLINADO,
  "Estante de halteres": () => ESTANTE,
  "Torre de halteres": () => TORRE,
  "Suporte de anilhas": () => ARVORE,
  Espaldar: () => ESPALDAR,
  Colchonetes: () => COLCHONETES,
}

/** Nomes Heritage / comerciais → chave de `POR_FUNCAO`. Sem acento, minúsculo. */
const ALIAS_NOME: Record<string, string> = {
  esteira: "Esteira",
  escada: "Escada",
  eliptico: "Elíptico",
  "bike horizontal": "Bike Horizontal",
  "bike spinning": "Bike Spinning",
  "bike vertical": "Bike Vertical",
  remo: "Remo",
  "cross + smith": "Smith + Cross",
  "smith + cross": "Smith + Cross",
  "squat machine": "Hack squat",
  "hack squat": "Hack squat",
  "leg press 45°": "Leg Press 45°",
  "leg press 45": "Leg Press 45°",
  "elevacao pelvica": "Elevação pélvica",
  "lying leg curl": "Mesa Flexora",
  "mesa flexora": "Mesa Flexora",
  "dual leg extension": "Cadeira Extensora",
  "cadeira extensora": "Cadeira Extensora",
  "dual inner": "Adutora",
  "impact delt raise": "Elevação lateral",
  "elevacao lateral": "Elevação lateral",
  "puxada + remada": "Puxada + Remada",
  "cross over angular": "Cross Over",
  "cross over": "Cross Over",
  "estante dumbbells": "Estante de halteres",
  "estante de halteres": "Estante de halteres",
  "torre halteres": "Torre de halteres",
  "torre de halteres": "Torre de halteres",
  "banco 0-90°": "Banco regulável",
  "banco 0-90": "Banco regulável",
  "banco regulavel": "Banco regulável",
  "banco declinado": "Banco declinado",
  "banco supino": "Banco supino",
  espaldar: "Espaldar",
  colchonetes: "Colchonetes",
}

function dobra(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function nomeSemMarca(nome: string): string {
  const i = nome.indexOf(" · ")
  return (i >= 0 ? nome.slice(0, i) : nome).trim()
}

/** Função de silhueta conhecida para este nome de catálogo (ou `undefined`). */
export function funcaoDaSilhueta(nome: string): string | undefined {
  const d = dobra(nomeSemMarca(nome))
  if (ALIAS_NOME[d]) return ALIAS_NOME[d]
  return Object.keys(POR_FUNCAO).find((k) => dobra(k) === d)
}

export function silhuetaDaPeca(funcao: string, categoria: string): Traço[] {
  const comPilhas = categoria !== "Peso livre"
  const fab = POR_FUNCAO[funcao]
  if (!fab) return comEntrada([rect(0.08, 0.08, 0.84, 0.84)])
  return comEntrada(fab(comPilhas))
}

/** Resolve nome Heritage ou `Esteira · Nautilus` para a silhueta de planta. */
export function silhuetaPorNome(nome: string, categoria?: string | null): Traço[] {
  const funcao = funcaoDaSilhueta(nome) ?? nomeSemMarca(nome)
  return silhuetaDaPeca(funcao, categoria ?? "Musculação guiada")
}

function chave(nome: string, marca?: string | null) {
  return `${nome.trim().toLowerCase()}|${(marca ?? "").trim().toLowerCase()}`
}

function mesmaSilhueta(a?: number[][] | null, b?: number[][] | null): boolean {
  if (!a && !b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((tr, i) => tr.length === b[i].length && tr.every((n, j) => n === b[i][j]))
}

/** Peças já cadastradas sem footprint — preenche a cópia de planta, sem sobrescrever um contorno que o consultor já desenhou ou importou. */
export function silhuetasParaAtualizar(
  existentes: Equipamento[],
  biblioteca: Equipamento[],
): Equipamento[] {
  const mapa = new Map(existentes.map(e => [chave(e.nome, e.marca), e]))
  const out: Equipamento[] = []
  for (const peca of biblioteca) {
    const atual = mapa.get(chave(peca.nome, peca.marca))
    if (!atual) continue
    if (!peca.contorno?.length) continue
    if (mesmaSilhueta(atual.contorno, peca.contorno)) continue
    if (atual.contorno && atual.contorno.length > 0) continue
    out.push({ ...atual, contorno: peca.contorno })
  }
  return out
}
