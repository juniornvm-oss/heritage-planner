/**
 * Cópias de planta (vista de cima) no formato `contorno` do planner.
 * Não são arquivos DWG/DXF dos fabricantes — são silhuetas de uso
 * (contorno + pilha/chifres + banco/trilho), no mesmo sistema que o
 * canvas usa: 0..1, origem no canto superior esquerdo, Y para baixo,
 * utilizador / entrada na base (Y → 1).
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

const ESTEIRA: Traço[] = [
  rect(0.18, 0.04, 0.64, 0.82),
  rect(0.24, 0.1, 0.52, 0.68),
  linha(0.24, 0.28, 0.76, 0.28),
  linha(0.24, 0.46, 0.76, 0.46),
  linha(0.24, 0.64, 0.76, 0.64),
  rect(0.28, 0.86, 0.44, 0.12),
  linha(0.5, 0.86, 0.5, 0.98),
]

const ESTEIRA_CURVA: Traço[] = [
  fechado(0.22, 0.08, 0.78, 0.08, 0.86, 0.55, 0.78, 0.92, 0.22, 0.92, 0.14, 0.55),
  fechado(0.3, 0.16, 0.7, 0.16, 0.76, 0.52, 0.7, 0.84, 0.3, 0.84, 0.24, 0.52),
  linha(0.32, 0.32, 0.68, 0.32),
  linha(0.3, 0.5, 0.7, 0.5),
  linha(0.32, 0.68, 0.68, 0.68),
  rect(0.36, 0.88, 0.28, 0.08),
]

const ELIPTICO: Traço[] = [
  oval(0.5, 0.22, 0.22, 0.16, 18),
  rect(0.12, 0.38, 0.76, 0.08),
  oval(0.28, 0.62, 0.12, 0.07, 14),
  oval(0.72, 0.62, 0.12, 0.07, 14),
  linha(0.28, 0.62, 0.22, 0.9),
  linha(0.72, 0.62, 0.78, 0.9),
  rect(0.34, 0.86, 0.32, 0.1),
  linha(0.18, 0.9, 0.82, 0.9),
]

const BIKE_V: Traço[] = [
  oval(0.5, 0.52, 0.28, 0.38, 20),
  oval(0.5, 0.18, 0.1, 0.08, 12),
  oval(0.5, 0.5, 0.08, 0.08, 12),
  rect(0.38, 0.86, 0.24, 0.1),
  linha(0.5, 0.26, 0.5, 0.86),
]

const BIKE_H: Traço[] = [
  rect(0.22, 0.08, 0.56, 0.22),
  oval(0.5, 0.22, 0.18, 0.12, 14),
  rect(0.3, 0.28, 0.4, 0.42),
  oval(0.5, 0.62, 0.1, 0.08, 12),
  rect(0.34, 0.86, 0.32, 0.1),
  linha(0.18, 0.92, 0.82, 0.92),
]

const SPIN: Traço[] = [
  oval(0.5, 0.78, 0.2, 0.16, 18),
  linha(0.5, 0.18, 0.5, 0.64),
  oval(0.5, 0.16, 0.09, 0.07, 12),
  oval(0.5, 0.48, 0.07, 0.07, 12),
  linha(0.22, 0.9, 0.78, 0.9),
  linha(0.28, 0.48, 0.72, 0.78),
]

const ESCADA: Traço[] = [
  rect(0.22, 0.06, 0.56, 0.78),
  rect(0.3, 0.12, 0.4, 0.08),
  rect(0.3, 0.24, 0.4, 0.08),
  rect(0.3, 0.36, 0.4, 0.08),
  rect(0.3, 0.48, 0.4, 0.08),
  rect(0.3, 0.6, 0.4, 0.08),
  linha(0.22, 0.1, 0.22, 0.82),
  linha(0.78, 0.1, 0.78, 0.82),
  rect(0.32, 0.86, 0.36, 0.1),
]

const REMO: Traço[] = [
  oval(0.5, 0.14, 0.2, 0.12, 16),
  rect(0.42, 0.24, 0.16, 0.58),
  rect(0.36, 0.48, 0.28, 0.12),
  linha(0.28, 0.22, 0.72, 0.22),
  rect(0.3, 0.18, 0.4, 0.06),
  oval(0.5, 0.88, 0.08, 0.05, 10),
]

function sentadoEmpurrar(comPilhas: boolean): Traço[] {
  return [
    rect(0.22, 0.08, 0.56, 0.16),
    rect(0.3, 0.24, 0.4, 0.18),
    rect(0.28, 0.44, 0.44, 0.12),
    ...cargas(comPilhas, 0.1, 0.5),
    linha(0.22, 0.62, 0.78, 0.62),
    rect(0.34, 0.72, 0.32, 0.18),
  ]
}

function voador(comPilhas: boolean): Traço[] {
  return [
    rect(0.28, 0.1, 0.44, 0.16),
    rect(0.32, 0.28, 0.36, 0.2),
    fechado(0.08, 0.38, 0.28, 0.28, 0.3, 0.55, 0.12, 0.62),
    fechado(0.92, 0.38, 0.72, 0.28, 0.7, 0.55, 0.88, 0.62),
    ...cargas(comPilhas, 0.08, 0.42),
    rect(0.34, 0.72, 0.32, 0.18),
  ]
}

function puxada(comPilhas: boolean): Traço[] {
  return [
    rect(0.08, 0.04, 0.84, 0.1),
    linha(0.18, 0.14, 0.18, 0.72),
    linha(0.82, 0.14, 0.82, 0.72),
    ...cargas(comPilhas, 0.16, 0.58),
    rect(0.32, 0.58, 0.36, 0.14),
    linha(0.28, 0.74, 0.72, 0.74),
    rect(0.34, 0.8, 0.32, 0.14),
  ]
}

function remada(comPilhas: boolean): Traço[] {
  return [
    rect(0.28, 0.06, 0.44, 0.14),
    rect(0.32, 0.2, 0.36, 0.16),
    ...cargas(comPilhas, 0.08, 0.48),
    rect(0.3, 0.4, 0.4, 0.14),
    linha(0.22, 0.72, 0.78, 0.72),
    rect(0.34, 0.78, 0.32, 0.14),
  ]
}

function extensora(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.06, 0.4),
    rect(0.28, 0.12, 0.44, 0.18),
    rect(0.3, 0.32, 0.4, 0.22),
    oval(0.5, 0.68, 0.22, 0.08, 14),
    rect(0.34, 0.8, 0.32, 0.14),
  ]
}

function flexoraDeitada(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.04, 0.28),
    rect(0.22, 0.12, 0.56, 0.52),
    oval(0.5, 0.22, 0.16, 0.08, 12),
    oval(0.5, 0.72, 0.2, 0.08, 12),
    rect(0.3, 0.84, 0.4, 0.1),
  ]
}

function flexoraSentada(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.06, 0.38),
    rect(0.28, 0.1, 0.44, 0.16),
    rect(0.3, 0.28, 0.4, 0.22),
    oval(0.5, 0.62, 0.24, 0.08, 14),
    rect(0.34, 0.78, 0.32, 0.14),
  ]
}

function legPress(comPilhas: boolean): Traço[] {
  return [
    rect(0.18, 0.04, 0.64, 0.22),
    linha(0.28, 0.26, 0.22, 0.78),
    linha(0.72, 0.26, 0.78, 0.78),
    rect(0.24, 0.78, 0.52, 0.16),
    ...(comPilhas
      ? cargas(true, 0.32, 0.7)
      : [
          oval(0.12, 0.38, 0.07, 0.07, 12),
          oval(0.88, 0.38, 0.07, 0.07, 12),
          oval(0.1, 0.52, 0.07, 0.07, 12),
          oval(0.9, 0.52, 0.07, 0.07, 12),
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
    ...cargas(comPilhas, 0.06, 0.4),
    rect(0.32, 0.12, 0.36, 0.2),
    rect(0.34, 0.34, 0.32, 0.16),
    fechado(0.06, 0.42, 0.34, 0.38, 0.36, 0.58, 0.1, 0.68),
    fechado(0.94, 0.42, 0.66, 0.38, 0.64, 0.58, 0.9, 0.68),
    rect(0.36, 0.78, 0.28, 0.14),
  ]
}

function gluteo(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.08, 0.42),
    rect(0.22, 0.16, 0.56, 0.22),
    rect(0.28, 0.4, 0.44, 0.18),
    oval(0.5, 0.68, 0.18, 0.08, 12),
    rect(0.34, 0.82, 0.32, 0.12),
  ]
}

function abdominal(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.08, 0.4),
    rect(0.3, 0.12, 0.4, 0.16),
    rect(0.32, 0.3, 0.36, 0.2),
    oval(0.5, 0.62, 0.2, 0.08, 12),
    rect(0.36, 0.8, 0.28, 0.12),
  ]
}

function lombar(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.06, 0.32),
    oval(0.5, 0.18, 0.16, 0.1, 12),
    rect(0.3, 0.3, 0.4, 0.22),
    linha(0.22, 0.72, 0.78, 0.72),
    rect(0.34, 0.8, 0.32, 0.12),
  ]
}

function braco(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.08, 0.46),
    rect(0.3, 0.1, 0.4, 0.16),
    rect(0.34, 0.28, 0.32, 0.18),
    linha(0.22, 0.56, 0.78, 0.56),
    rect(0.36, 0.78, 0.28, 0.14),
  ]
}

function panturrilha(comPilhas: boolean): Traço[] {
  return [
    ...cargas(comPilhas, 0.08, 0.5),
    rect(0.3, 0.08, 0.4, 0.14),
    rect(0.34, 0.7, 0.32, 0.22),
    linha(0.38, 0.22, 0.38, 0.7),
    linha(0.62, 0.22, 0.62, 0.7),
  ]
}

const CROSSOVER: Traço[] = [
  rect(0.04, 0.08, 0.2, 0.72),
  rect(0.76, 0.08, 0.2, 0.72),
  rect(0.04, 0.08, 0.92, 0.08),
  oval(0.14, 0.16, 0.05, 0.05, 10),
  oval(0.86, 0.16, 0.05, 0.05, 10),
  oval(0.14, 0.72, 0.05, 0.05, 10),
  oval(0.86, 0.72, 0.05, 0.05, 10),
  linha(0.24, 0.5, 0.76, 0.5),
  rect(0.08, 0.8, 0.12, 0.12),
  rect(0.8, 0.8, 0.12, 0.12),
]

const SMITH: Traço[] = [
  rect(0.12, 0.06, 0.12, 0.8),
  rect(0.76, 0.06, 0.12, 0.8),
  linha(0.12, 0.42, 0.88, 0.42),
  linha(0.18, 0.22, 0.82, 0.22),
  linha(0.18, 0.62, 0.82, 0.62),
  rect(0.28, 0.72, 0.44, 0.18),
  rect(0.08, 0.86, 0.2, 0.08),
  rect(0.72, 0.86, 0.2, 0.08),
]

const RACK: Traço[] = [
  rect(0.1, 0.06, 0.1, 0.8),
  rect(0.8, 0.06, 0.1, 0.8),
  rect(0.1, 0.06, 0.1, 0.12),
  rect(0.8, 0.06, 0.1, 0.12),
  linha(0.1, 0.08, 0.9, 0.08),
  linha(0.2, 0.48, 0.8, 0.48),
  rect(0.22, 0.7, 0.56, 0.18),
  rect(0.06, 0.86, 0.18, 0.08),
  rect(0.76, 0.86, 0.18, 0.08),
]

const GAIOLA: Traço[] = [
  rect(0.08, 0.06, 0.1, 0.78),
  rect(0.82, 0.06, 0.1, 0.78),
  rect(0.08, 0.06, 0.1, 0.12),
  rect(0.82, 0.06, 0.1, 0.12),
  linha(0.08, 0.08, 0.92, 0.08),
  linha(0.18, 0.08, 0.18, 0.84),
  linha(0.82, 0.08, 0.82, 0.84),
  linha(0.18, 0.5, 0.82, 0.5),
  rect(0.28, 0.68, 0.44, 0.16),
]

const BANCO_SUPINO: Traço[] = [
  rect(0.18, 0.08, 0.12, 0.28),
  rect(0.7, 0.08, 0.12, 0.28),
  linha(0.18, 0.16, 0.82, 0.16),
  rect(0.38, 0.22, 0.24, 0.62),
  rect(0.28, 0.84, 0.44, 0.1),
]

const BANCO: Traço[] = [
  rect(0.32, 0.1, 0.36, 0.22),
  rect(0.36, 0.32, 0.28, 0.5),
  linha(0.22, 0.88, 0.78, 0.88),
]

const ESTANTE: Traço[] = [
  rect(0.08, 0.12, 0.84, 0.76),
  linha(0.12, 0.28, 0.88, 0.28),
  linha(0.12, 0.44, 0.88, 0.44),
  linha(0.12, 0.6, 0.88, 0.6),
  linha(0.12, 0.76, 0.88, 0.76),
  linha(0.5, 0.12, 0.5, 0.88),
]

const ARVORE: Traço[] = [
  oval(0.5, 0.82, 0.22, 0.1, 14),
  linha(0.5, 0.12, 0.5, 0.82),
  oval(0.28, 0.22, 0.1, 0.1, 12),
  oval(0.72, 0.22, 0.1, 0.1, 12),
  oval(0.22, 0.4, 0.1, 0.1, 12),
  oval(0.78, 0.4, 0.1, 0.1, 12),
  oval(0.22, 0.58, 0.1, 0.1, 12),
  oval(0.78, 0.58, 0.1, 0.1, 12),
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
  "Elevação lateral": sentadoEmpurrar,
  Puxada: puxada,
  Remada: remada,
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
  "Power Rack": () => RACK,
  Gaiola: () => GAIOLA,
  "Banco supino": () => BANCO_SUPINO,
  "Banco regulável": () => BANCO,
  "Banco inclinado": () => BANCO,
  "Estante de halteres": () => ESTANTE,
  "Suporte de anilhas": () => ARVORE,
}

export function silhuetaDaPeca(funcao: string, categoria: string): Traço[] {
  const comPilhas = categoria !== "Peso livre"
  const fab = POR_FUNCAO[funcao]
  if (!fab) return [rect(0.08, 0.08, 0.84, 0.84)]
  return fab(comPilhas)
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
