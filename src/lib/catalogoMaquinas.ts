/**
 * Biblioteca comercial de maquinário — Nautilus, Life Fitness, Hammer Strength,
 * Matrix e Technogym.
 *
 * O catálogo Heritage (as peças do modelo) continua em `seed.ts`. Esta lista é
 * o que o consultor puxa quando o condomínio pede linha internacional: nome
 * em português que a base técnica reconhece, modelo da linha, ocupação em
 * planta (cm) a partir das fichas técnicas comerciais.
 *
 * Preço fica zerado de propósito — entra pela cotação do projeto.
 */

import type { Cenario, Equipamento, Zona } from "./types";
import { cenarioSugerido } from "./curadoria";
import { silhuetaDaPeca, silhuetasParaAtualizar } from "./contornosMaquinas";

interface Spec {
  /** Nome funcional em português — tem de casar `baseDoNome`. */
  funcao: string;
  modelo: string;
  w: number;
  h: number;
  alt?: number;
  zona: Zona;
  cat: string;
  sub: string;
  peso?: number;
  tomada?: boolean;
}

const usoDaZona = (z: Zona) => {
  switch (z) {
    case "ergo": return { usoF: 80, usoL: 30, seg: 30, entrada: 80, parede: 20 };
    case "forca": return { usoF: 60, usoL: 40, seg: 20, entrada: 80, parede: 15 };
    case "livre": return { usoF: 90, usoL: 50, seg: 30, entrada: 100, parede: 20 };
    case "prep": return { usoF: 40, usoL: 20, seg: 10, entrada: 60, parede: 5 };
  }
};

function peca(marca: string, s: Spec): Equipamento {
  const m = usoDaZona(s.zona);
  const nome = `${s.funcao} · ${marca}`;
  const cenario: Cenario = cenarioSugerido(nome, s.zona);
  const cardio = s.tomada ?? s.zona === "ergo";
  return {
    nome,
    marca,
    modelo: s.modelo,
    largura_cm: s.w,
    profundidade_cm: s.h,
    altura_cm: s.alt ?? null,
    peso_kg: s.peso ?? null,
    zona: s.zona,
    preco: 0,
    categoria: s.cat,
    subcategoria: s.sub,
    cenario_padrao: cenario,
    precisa_tomada: cardio,
    voltagem: cardio ? "bivolt" : null,
    uso_frontal_cm: m.usoF,
    uso_lateral_cm: m.usoL,
    seguranca_cm: m.seg,
    dist_entrada_cm: m.entrada,
    dist_parede_cm: m.parede,
    dist_lateral_cm: m.usoL,
    dist_frontal_cm: m.usoF,
    contorno: silhuetaDaPeca(s.funcao, s.cat),
    obs: "Ocupação em planta a partir da ficha técnica comercial da linha. Preço entra pela cotação do projeto.",
  };
}

/** Nautilus — linha Impact (carga selecionada) e cardio comercial. */
const NAUTILUS: Spec[] = [
  { funcao: "Esteira", modelo: "T9.16", w: 91, h: 211, alt: 160, zona: "ergo", cat: "Cardio", sub: "Esteira", peso: 180 },
  { funcao: "Elíptico", modelo: "E9.16", w: 76, h: 208, alt: 170, zona: "ergo", cat: "Cardio", sub: "Elíptico", peso: 150 },
  { funcao: "Bike Horizontal", modelo: "R9.16", w: 66, h: 168, alt: 130, zona: "ergo", cat: "Cardio", sub: "Bicicleta horizontal", peso: 75 },
  { funcao: "Bike Vertical", modelo: "U9.16", w: 64, h: 122, alt: 140, zona: "ergo", cat: "Cardio", sub: "Bicicleta vertical", peso: 68 },
  { funcao: "Escada", modelo: "StairClimber", w: 81, h: 147, alt: 210, zona: "ergo", cat: "Cardio", sub: "Escada", peso: 160 },
  { funcao: "Supino máquina", modelo: "Impact Chest Press", w: 137, h: 127, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Peitoral", peso: 250 },
  { funcao: "Voador", modelo: "Impact Pec Fly", w: 145, h: 104, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Peitoral", peso: 240 },
  { funcao: "Desenvolvimento de ombros", modelo: "Impact Overhead Press", w: 137, h: 132, alt: 155, zona: "forca", cat: "Musculação guiada", sub: "Ombros", peso: 245 },
  { funcao: "Elevação lateral", modelo: "Impact Delt Raise", w: 130, h: 117, alt: 145, zona: "forca", cat: "Musculação guiada", sub: "Ombros", peso: 220 },
  { funcao: "Puxada", modelo: "Impact Lat Pulldown", w: 124, h: 165, alt: 200, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 260 },
  { funcao: "Remada", modelo: "Impact Mid Row", w: 124, h: 155, alt: 130, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 250 },
  { funcao: "Cadeira Extensora", modelo: "Impact Leg Extension", w: 109, h: 140, alt: 145, zona: "forca", cat: "Musculação guiada", sub: "Quadríceps", peso: 230 },
  { funcao: "Mesa Flexora", modelo: "Impact Lying Leg Curl", w: 99, h: 178, alt: 80, zona: "forca", cat: "Musculação guiada", sub: "Posterior", peso: 220 },
  { funcao: "Leg Press 45°", modelo: "Impact Leg Press", w: 152, h: 211, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Quadríceps", peso: 340 },
  { funcao: "Abdutora", modelo: "Impact Abduction", w: 145, h: 91, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 210 },
  { funcao: "Adutora", modelo: "Impact Adduction", w: 145, h: 91, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 210 },
  { funcao: "Elevação pélvica", modelo: "Impact Glute Drive", w: 137, h: 152, alt: 120, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 230 },
  { funcao: "Cadeira abdominal", modelo: "Impact Abdominal", w: 109, h: 130, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Abdômen", peso: 180 },
  { funcao: "Tríceps", modelo: "Impact Triceps Press", w: 109, h: 140, alt: 145, zona: "forca", cat: "Musculação guiada", sub: "Braços", peso: 200 },
  { funcao: "Rosca bíceps", modelo: "Impact Biceps Curl", w: 109, h: 109, alt: 130, zona: "forca", cat: "Musculação guiada", sub: "Braços", peso: 190 },
  { funcao: "Panturrilha", modelo: "Impact Calf Raise", w: 109, h: 140, alt: 160, zona: "forca", cat: "Musculação guiada", sub: "Panturrilha", peso: 200 },
  { funcao: "Cross Over", modelo: "Impact Dual Adjustable Pulley", w: 160, h: 110, alt: 220, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 280 },
];

/** Life Fitness — Integrity (cardio) e Optima/Circuit (carga selecionada). */
const LIFE_FITNESS: Spec[] = [
  { funcao: "Esteira", modelo: "Integrity Series Treadmill", w: 94, h: 216, alt: 160, zona: "ergo", cat: "Cardio", sub: "Esteira", peso: 190 },
  { funcao: "Elíptico", modelo: "Integrity Cross-Trainer", w: 76, h: 213, alt: 170, zona: "ergo", cat: "Cardio", sub: "Elíptico", peso: 155 },
  { funcao: "Bike Vertical", modelo: "Integrity Upright Bike", w: 64, h: 128, alt: 140, zona: "ergo", cat: "Cardio", sub: "Bicicleta vertical", peso: 70 },
  { funcao: "Bike Horizontal", modelo: "Integrity Recumbent Bike", w: 67, h: 165, alt: 130, zona: "ergo", cat: "Cardio", sub: "Bicicleta horizontal", peso: 78 },
  { funcao: "Escada", modelo: "Powermill Climber", w: 84, h: 152, alt: 215, zona: "ergo", cat: "Cardio", sub: "Escada", peso: 175 },
  { funcao: "Remo", modelo: "Row GX", w: 55, h: 220, alt: 100, zona: "ergo", cat: "Cardio", sub: "Remo", peso: 45 },
  { funcao: "Supino máquina", modelo: "Optima Chest Press", w: 140, h: 130, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Peitoral", peso: 255 },
  { funcao: "Desenvolvimento de ombros", modelo: "Optima Shoulder Press", w: 138, h: 132, alt: 155, zona: "forca", cat: "Musculação guiada", sub: "Ombros", peso: 250 },
  { funcao: "Puxada", modelo: "Optima Lat Pulldown", w: 128, h: 168, alt: 205, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 265 },
  { funcao: "Remada", modelo: "Optima Seated Row", w: 128, h: 158, alt: 130, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 250 },
  { funcao: "Cadeira Extensora", modelo: "Optima Leg Extension", w: 112, h: 142, alt: 145, zona: "forca", cat: "Musculação guiada", sub: "Quadríceps", peso: 235 },
  { funcao: "Cadeira Flexora", modelo: "Optima Seated Leg Curl", w: 112, h: 155, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Posterior", peso: 230 },
  { funcao: "Leg Press 45°", modelo: "Optima Leg Press", w: 155, h: 210, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Quadríceps", peso: 350 },
  { funcao: "Hack squat", modelo: "Optima Hack Squat", w: 150, h: 200, alt: 160, zona: "forca", cat: "Musculação guiada", sub: "Quadríceps", peso: 320 },
  { funcao: "Abdutora", modelo: "Optima Hip Abduction", w: 148, h: 92, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 215 },
  { funcao: "Adutora", modelo: "Optima Hip Adduction", w: 148, h: 92, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 215 },
  { funcao: "Cadeira abdominal", modelo: "Optima Abdominal", w: 110, h: 128, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Abdômen", peso: 185 },
  { funcao: "Extensão lombar", modelo: "Optima Back Extension", w: 110, h: 140, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Abdômen", peso: 190 },
  { funcao: "Tríceps", modelo: "Optima Triceps Extension", w: 110, h: 138, alt: 145, zona: "forca", cat: "Musculação guiada", sub: "Braços", peso: 200 },
  { funcao: "Rosca bíceps", modelo: "Optima Biceps Curl", w: 110, h: 110, alt: 130, zona: "forca", cat: "Musculação guiada", sub: "Braços", peso: 190 },
  { funcao: "Cross Over", modelo: "Cable Motion Dual Adjustable Pulley", w: 165, h: 112, alt: 225, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 290 },
  { funcao: "Smith Rack", modelo: "Signature Smith Machine", w: 220, h: 165, alt: 230, zona: "livre", cat: "Peso livre", sub: "Smith", peso: 310 },
];

/** Hammer Strength — carga livre (plate loaded) e racks. Life Fitness Group. */
const HAMMER_STRENGTH: Spec[] = [
  { funcao: "Supino máquina", modelo: "Iso-Lateral Bench Press", w: 168, h: 155, alt: 150, zona: "forca", cat: "Peso livre", sub: "Peitoral", peso: 180 },
  { funcao: "Desenvolvimento de ombros", modelo: "Iso-Lateral Shoulder Press", w: 155, h: 140, alt: 155, zona: "forca", cat: "Peso livre", sub: "Ombros", peso: 170 },
  { funcao: "Puxada", modelo: "Iso-Lateral Front Lat Pulldown", w: 168, h: 155, alt: 200, zona: "forca", cat: "Peso livre", sub: "Costas", peso: 175 },
  { funcao: "Remada", modelo: "Iso-Lateral Row", w: 165, h: 147, alt: 130, zona: "forca", cat: "Peso livre", sub: "Costas", peso: 170 },
  { funcao: "Cadeira Extensora", modelo: "Iso-Lateral Leg Extension", w: 140, h: 150, alt: 140, zona: "forca", cat: "Peso livre", sub: "Quadríceps", peso: 160 },
  { funcao: "Mesa Flexora", modelo: "Iso-Lateral Lying Leg Curl", w: 100, h: 175, alt: 80, zona: "forca", cat: "Peso livre", sub: "Posterior", peso: 155 },
  { funcao: "Leg Press 45°", modelo: "Linear Leg Press", w: 157, h: 216, alt: 150, zona: "forca", cat: "Peso livre", sub: "Quadríceps", peso: 280 },
  { funcao: "Hack squat", modelo: "Linear Hack Squat", w: 152, h: 198, alt: 160, zona: "forca", cat: "Peso livre", sub: "Quadríceps", peso: 260 },
  { funcao: "Elevação pélvica", modelo: "Iso-Lateral Glute", w: 150, h: 155, alt: 120, zona: "forca", cat: "Peso livre", sub: "Glúteos", peso: 150 },
  { funcao: "Panturrilha", modelo: "Standing Calf Raise", w: 115, h: 140, alt: 170, zona: "forca", cat: "Peso livre", sub: "Panturrilha", peso: 140 },
  { funcao: "Power Rack", modelo: "HD Athletic Half Rack", w: 168, h: 183, alt: 230, zona: "livre", cat: "Peso livre", sub: "Rack", peso: 220 },
  { funcao: "Gaiola", modelo: "HD Athletic Power Rack", w: 183, h: 183, alt: 240, zona: "livre", cat: "Peso livre", sub: "Gaiola", peso: 260 },
  { funcao: "Banco supino", modelo: "Olympic Flat Bench", w: 170, h: 165, alt: 120, zona: "livre", cat: "Peso livre", sub: "Banco", peso: 85 },
  { funcao: "Banco regulável", modelo: "Adjustable Bench 0-90", w: 155, h: 70, alt: 50, zona: "livre", cat: "Peso livre", sub: "Banco", peso: 45 },
  { funcao: "Banco inclinado", modelo: "Olympic Incline Bench", w: 170, h: 170, alt: 130, zona: "livre", cat: "Peso livre", sub: "Banco", peso: 90 },
  { funcao: "Estante de halteres", modelo: "2-Tier Dumbbell Rack", w: 240, h: 60, alt: 90, zona: "livre", cat: "Peso livre", sub: "Halteres", peso: 70 },
  { funcao: "Suporte de anilhas", modelo: "Olympic Weight Tree", w: 70, h: 70, alt: 130, zona: "livre", cat: "Peso livre", sub: "Anilhas", peso: 35 },
];

/** Matrix — Ultra/Versa (carga selecionada) e cardio T3x / ClimbMill / Ascent. */
const MATRIX: Spec[] = [
  { funcao: "Esteira", modelo: "T3xh", w: 91, h: 211, alt: 158, zona: "ergo", cat: "Cardio", sub: "Esteira", peso: 185 },
  { funcao: "Elíptico", modelo: "Ascent Trainer A50", w: 89, h: 203, alt: 175, zona: "ergo", cat: "Cardio", sub: "Elíptico", peso: 160 },
  { funcao: "Bike Vertical", modelo: "U30", w: 62, h: 125, alt: 140, zona: "ergo", cat: "Cardio", sub: "Bicicleta vertical", peso: 68 },
  { funcao: "Bike Horizontal", modelo: "R30", w: 66, h: 165, alt: 130, zona: "ergo", cat: "Cardio", sub: "Bicicleta horizontal", peso: 76 },
  { funcao: "Escada", modelo: "ClimbMill C50", w: 81, h: 147, alt: 212, zona: "ergo", cat: "Cardio", sub: "Escada", peso: 170 },
  { funcao: "Bike Spinning", modelo: "CXP Indoor Cycle", w: 56, h: 115, alt: 115, zona: "ergo", cat: "Cardio", sub: "Spinning", peso: 55 },
  { funcao: "Supino máquina", modelo: "Ultra Chest Press", w: 140, h: 135, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Peitoral", peso: 255 },
  { funcao: "Voador", modelo: "Ultra Pec Fly", w: 146, h: 105, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Peitoral", peso: 245 },
  { funcao: "Desenvolvimento de ombros", modelo: "Ultra Shoulder Press", w: 138, h: 133, alt: 155, zona: "forca", cat: "Musculação guiada", sub: "Ombros", peso: 250 },
  { funcao: "Puxada", modelo: "Ultra Lat Pulldown", w: 126, h: 168, alt: 205, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 265 },
  { funcao: "Remada", modelo: "Ultra Seated Row", w: 126, h: 156, alt: 130, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 250 },
  { funcao: "Cadeira Extensora", modelo: "Ultra Leg Extension", w: 110, h: 142, alt: 145, zona: "forca", cat: "Musculação guiada", sub: "Quadríceps", peso: 235 },
  { funcao: "Cadeira Flexora", modelo: "Ultra Seated Leg Curl", w: 110, h: 156, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Posterior", peso: 230 },
  { funcao: "Leg Press 45°", modelo: "Ultra Leg Press", w: 154, h: 208, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Quadríceps", peso: 345 },
  { funcao: "Abdutora", modelo: "Ultra Hip Abductor", w: 146, h: 90, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 210 },
  { funcao: "Adutora", modelo: "Ultra Hip Adductor", w: 146, h: 90, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 210 },
  { funcao: "Elevação pélvica", modelo: "Ultra Glute Drive", w: 138, h: 154, alt: 120, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 225 },
  { funcao: "Cadeira abdominal", modelo: "Ultra Abdominal", w: 110, h: 128, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Abdômen", peso: 185 },
  { funcao: "Tríceps", modelo: "Ultra Triceps", w: 110, h: 140, alt: 145, zona: "forca", cat: "Musculação guiada", sub: "Braços", peso: 200 },
  { funcao: "Rosca bíceps", modelo: "Ultra Biceps", w: 110, h: 110, alt: 130, zona: "forca", cat: "Musculação guiada", sub: "Braços", peso: 190 },
  { funcao: "Cross Over", modelo: "Versa Functional Trainer", w: 162, h: 110, alt: 220, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 285 },
  { funcao: "Smith Rack", modelo: "Versa Smith", w: 218, h: 164, alt: 228, zona: "livre", cat: "Peso livre", sub: "Smith", peso: 300 },
];

/** Technogym — Excite Live (cardio), Skill (especial), Selection (guiada), Pure (livre). */
const TECHNOGYM: Spec[] = [
  { funcao: "Esteira", modelo: "Excite Live Run", w: 94, h: 216, alt: 160, zona: "ergo", cat: "Cardio", sub: "Esteira", peso: 195 },
  { funcao: "Elíptico", modelo: "Excite Live Vario", w: 80, h: 200, alt: 175, zona: "ergo", cat: "Cardio", sub: "Elíptico", peso: 165 },
  { funcao: "Bike Vertical", modelo: "Excite Live Bike", w: 60, h: 140, alt: 140, zona: "ergo", cat: "Cardio", sub: "Bicicleta vertical", peso: 72 },
  { funcao: "Bike Horizontal", modelo: "Excite Live Recline", w: 66, h: 168, alt: 130, zona: "ergo", cat: "Cardio", sub: "Bicicleta horizontal", peso: 80 },
  { funcao: "Esteira curva", modelo: "Skillmill", w: 91, h: 185, alt: 170, zona: "ergo", cat: "Cardio", sub: "Esteira", peso: 160, tomada: false },
  { funcao: "Remo", modelo: "Skillrow", w: 55, h: 245, alt: 100, zona: "ergo", cat: "Cardio", sub: "Remo", peso: 52 },
  { funcao: "Supino máquina", modelo: "Selection Chest Press", w: 135, h: 145, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Peitoral", peso: 250 },
  { funcao: "Voador", modelo: "Selection Pec Fly", w: 144, h: 108, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Peitoral", peso: 240 },
  { funcao: "Desenvolvimento de ombros", modelo: "Selection Shoulder Press", w: 136, h: 138, alt: 155, zona: "forca", cat: "Musculação guiada", sub: "Ombros", peso: 245 },
  { funcao: "Puxada", modelo: "Selection Lat Machine", w: 130, h: 170, alt: 210, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 270 },
  { funcao: "Remada", modelo: "Selection Low Row", w: 128, h: 160, alt: 130, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 255 },
  { funcao: "Cadeira Extensora", modelo: "Selection Leg Extension", w: 112, h: 145, alt: 145, zona: "forca", cat: "Musculação guiada", sub: "Quadríceps", peso: 235 },
  { funcao: "Cadeira Flexora", modelo: "Selection Leg Curl", w: 112, h: 158, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Posterior", peso: 230 },
  { funcao: "Leg Press 45°", modelo: "Selection Leg Press", w: 150, h: 205, alt: 150, zona: "forca", cat: "Musculação guiada", sub: "Quadríceps", peso: 340 },
  { funcao: "Abdutora", modelo: "Selection Abductor", w: 145, h: 92, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 210 },
  { funcao: "Adutora", modelo: "Selection Adductor", w: 145, h: 92, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Glúteos", peso: 210 },
  { funcao: "Cadeira abdominal", modelo: "Selection Abdominal Crunch", w: 110, h: 130, alt: 140, zona: "forca", cat: "Musculação guiada", sub: "Abdômen", peso: 185 },
  { funcao: "Tríceps", modelo: "Selection Triceps Extension", w: 110, h: 140, alt: 145, zona: "forca", cat: "Musculação guiada", sub: "Braços", peso: 200 },
  { funcao: "Rosca bíceps", modelo: "Selection Biceps Curl", w: 110, h: 112, alt: 130, zona: "forca", cat: "Musculação guiada", sub: "Braços", peso: 190 },
  { funcao: "Cross Over", modelo: "Cable Station", w: 180, h: 110, alt: 225, zona: "forca", cat: "Musculação guiada", sub: "Costas", peso: 300 },
  { funcao: "Power Rack", modelo: "Pure Strength Power Rack", w: 180, h: 180, alt: 235, zona: "livre", cat: "Peso livre", sub: "Rack", peso: 240 },
  { funcao: "Banco regulável", modelo: "Pure Strength Adjustable Bench", w: 155, h: 68, alt: 50, zona: "livre", cat: "Peso livre", sub: "Banco", peso: 42 },
];

export const MARCAS_MAQUINAS = ["Nautilus", "Life Fitness", "Hammer Strength", "Matrix", "Technogym"] as const;
export type MarcaMaquina = (typeof MARCAS_MAQUINAS)[number];

export const BIBLIOTECA_MAQUINAS: Equipamento[] = [
  ...NAUTILUS.map((s) => peca("Nautilus", s)),
  ...LIFE_FITNESS.map((s) => peca("Life Fitness", s)),
  ...HAMMER_STRENGTH.map((s) => peca("Hammer Strength", s)),
  ...MATRIX.map((s) => peca("Matrix", s)),
  ...TECHNOGYM.map((s) => peca("Technogym", s)),
];

export const chaveDaMaquina = (e: Pick<Equipamento, "nome" | "marca">): string =>
  `${(e.nome || "").trim().toLowerCase()}|${(e.marca || "").trim().toLowerCase()}`;

/** Itens da biblioteca que ainda não estão no cadastro (mesmo nome + marca). */
export function maquinasFaltando(existentes: Equipamento[]): Equipamento[] {
  const ja = new Set(existentes.map(chaveDaMaquina));
  return BIBLIOTECA_MAQUINAS.filter((e) => !ja.has(chaveDaMaquina(e)));
}

/** Cadastro que já tem a peça, mas ainda sem a silhueta de planta. */
export function silhuetasFaltando(existentes: Equipamento[]): Equipamento[] {
  return silhuetasParaAtualizar(existentes, BIBLIOTECA_MAQUINAS);
}

export function csvDaBiblioteca(): string {
  const cols = ["nome", "marca", "modelo", "largura_cm", "profundidade_cm", "altura_cm", "zona", "categoria", "subcategoria", "preco"];
  const linhas = [cols.join(",")];
  for (const e of BIBLIOTECA_MAQUINAS) {
    const vals = [e.nome, e.marca, e.modelo, e.largura_cm, e.profundidade_cm, e.altura_cm ?? "", e.zona, e.categoria, e.subcategoria, e.preco];
    linhas.push(vals.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return linhas.join("\n");
}
