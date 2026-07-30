// Vista IA — monta um prompt de geração de imagem a partir de um ângulo de
// câmera posicionado na planta. Descreve o que está no campo de visão (sala,
// pisos, espelhos, TVs, mobiliário e equipamentos, com posições e distâncias)
// em INGLÊS, que é o idioma em que os geradores (Midjourney/DALL-E/Flux)
// respondem melhor.

import type { Cena, ElementoParede, MaterialPiso } from "./types";
import { ELEMENTOS_PAREDE, MATERIAIS_PISO } from "./types";
import { pontoNoPoligono, type Ponto } from "./geometria";

const CAMPO_VISAO_GRAUS = 100; // cone de visão (lente grande-angular)

const MATERIAL_EN: Record<MaterialPiso, string> = {
  vinilico: "wood-look vinyl plank flooring",
  borracha: "black rubber gym flooring",
  pista: "dark red sprint track lane",
  ceramico: "ceramic tile flooring",
  livre: "bare concrete floor",
  outro: "designer flooring",
};

const ELEMENTO_EN: Partial<Record<keyof typeof ELEMENTOS_PAREDE, string>> = {
  espelho: "floor-to-ceiling wall mirror",
  tv: "wall-mounted flat-screen TV",
  painel_tv: "TV media wall panel",
  ar: "air-conditioning unit",
  iluminacao: "linear LED light fixture",
  espaldar: "wooden wall bars (stall bars)",
  colchonetes: "mat storage rack",
  prateleira: "wall shelf",
  extintor: "fire extinguisher",
};

const INFRA_EN: Record<string, string> = {
  balcao: "reception counter", mesa: "table", cadeira: "chair", banco: "bench",
  sofa: "lounge sofa", armario: "storage cabinet", nicho: "cubby shelving",
  bebedouro: "water fountain", lixeira: "waste bin", frigobar: "mini fridge",
  catraca: "access turnstile", leitor: "access card reader", biometria: "biometric reader",
  porta_objetos: "personal item lockers", roupeiro: "lockers", jardineira: "planter with greenery",
  tapete: "area rug", divisoria: "room divider", guarda_corpo: "glass guardrail", outro: "furniture piece",
};

// Nomes PT→EN dos equipamentos mais comuns do catálogo (fallback: nome original).
const EQUIP_EN: [RegExp, string][] = [
  [/esteira/i, "treadmill"], [/escada/i, "stair climber"], [/el[ií]ptico/i, "elliptical trainer"],
  [/bike|bicicleta|spinning/i, "exercise bike"], [/remo/i, "rowing machine"],
  [/smith|cross ?over|cross \+/i, "cable crossover / smith machine station"],
  [/squat/i, "squat machine"], [/leg press/i, "45° leg press machine"],
  [/p[eé]lvica/i, "hip thrust machine"], [/leg curl/i, "leg curl machine"],
  [/leg extension/i, "leg extension machine"], [/inner|adutora/i, "hip adductor machine"],
  [/delt|raise/i, "lateral raise machine"], [/puxada|remada|pulley/i, "lat pulldown and row station"],
  [/halter|dumbbell/i, "dumbbell rack"], [/anilha/i, "weight plate rack"],
  [/banco/i, "adjustable workout bench"], [/espaldar/i, "wall bars"], [/colchonete/i, "exercise mats"],
];
const equipEn = (nome: string) => EQUIP_EN.find(([re]) => re.test(nome))?.[1] ?? nome;

interface Avistado { nome: string; dist: number; lado: string }

/** Direção relativa (esq/frente/dir) e distância de um ponto em relação à câmera. */
function relativo(cam: Ponto, dir: Ponto, alvo: Ponto): { dentroCone: boolean; dist: number; lado: string } {
  const vx = alvo.x - cam.x, vy = alvo.y - cam.y;
  const dist = Math.hypot(vx, vy);
  if (dist < 1) return { dentroCone: true, dist, lado: "underfoot" };
  const angCam = Math.atan2(dir.y, dir.x);
  const angAlvo = Math.atan2(vy, vx);
  let d = ((angAlvo - angCam) * 180) / Math.PI;
  while (d > 180) d -= 360; while (d < -180) d += 360;
  const dentroCone = Math.abs(d) <= CAMPO_VISAO_GRAUS / 2;
  const lado = Math.abs(d) < 15 ? "straight ahead" : d < -40 ? "far left" : d < 0 ? "on the left" : d > 40 ? "far right" : "on the right";
  return { dentroCone, dist, lado };
}

const metros = (cm: number) => `${(cm / 100).toFixed(1).replace(/\.0$/, "")} m`;

/** Gera o prompt de imagem para a câmera em `p1` olhando na direção de `p2`. */
export function gerarPromptVista(cena: Cena, p1: Ponto, p2: Ponto): string {
  const dir = { x: p2.x - p1.x, y: p2.y - p1.y };
  const sala = cena.sala;
  const partes: string[] = [];

  // Cenário base
  partes.push(
    `Photorealistic interior photo of a premium residential condominium gym, ` +
    `room approximately ${metros(sala.largura_cm)} by ${metros(sala.profundidade_cm)}, ` +
    `seen from eye level (1.60 m) with a 24 mm wide-angle lens.`
  );

  // Piso sob a câmera e pisos visíveis
  const pisos = (cena.acabamentos ?? []).filter((a) => a.tipo === "piso" && (a.pontos?.length ?? 0) >= 3);
  const sob = pisos.find((a) => pontoNoPoligono(p1, a.pontos!));
  const visiveis = new Set<string>();
  if (sob) visiveis.add(MATERIAL_EN[sob.material ?? "outro"]);
  for (const a of pisos) {
    const c = { x: a.x_cm + a.w_cm / 2, y: a.y_cm + a.h_cm / 2 };
    const r = relativo(p1, dir, c);
    if (r.dentroCone && r.dist < 1500) visiveis.add(MATERIAL_EN[a.material ?? "outro"]);
  }
  if (visiveis.size) partes.push(`Flooring: ${[...visiveis].join(", transitioning into ")}.`);

  // Elementos de parede (espelhos, TVs…) no cone
  const pmap = new Map((cena.estrutura?.paredes ?? []).map((w) => [w.id, w]));
  const paredeAvistada: Avistado[] = [];
  for (const el of (cena.elementosParede ?? []) as ElementoParede[]) {
    const w = pmap.get(el.paredeId); if (!w) continue;
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    const ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
    const c = { x: w.x1 + ux * el.offset_cm, y: w.y1 + uy * el.offset_cm };
    const r = relativo(p1, dir, c);
    if (!r.dentroCone) continue;
    const nomeEn = ELEMENTO_EN[el.tipo] ?? ELEMENTOS_PAREDE[el.tipo].label;
    const extra = el.tipo === "espelho"
      ? ` ${metros(el.largura_cm)} wide${el.luz_superior || el.luz_inferior ? " with LED accent lighting" : ""}`
      : "";
    paredeAvistada.push({ nome: `${nomeEn}${extra}`, dist: r.dist, lado: r.lado });
  }
  paredeAvistada.sort((a, b) => a.dist - b.dist);
  for (const v of paredeAvistada.slice(0, 6)) {
    partes.push(`A ${v.nome} ${v.lado}, about ${metros(v.dist)} away.`);
  }

  // Mobiliário no cone
  const mob: Avistado[] = [];
  for (const it of cena.infra ?? []) {
    const r = relativo(p1, dir, { x: it.x_cm + it.w_cm / 2, y: it.y_cm + it.h_cm / 2 });
    if (r.dentroCone) mob.push({ nome: INFRA_EN[it.tipo] ?? it.nome, dist: r.dist, lado: r.lado });
  }
  mob.sort((a, b) => a.dist - b.dist);
  for (const v of mob.slice(0, 5)) partes.push(`A ${v.nome} ${v.lado} (${metros(v.dist)}).`);

  // Equipamentos no cone, agrupados por nome
  const grupos = new Map<string, { qtd: number; distMin: number; lados: Set<string> }>();
  for (const it of cena.itens ?? []) {
    const r = relativo(p1, dir, { x: it.x_cm + it.w_cm / 2, y: it.y_cm + it.h_cm / 2 });
    if (!r.dentroCone || r.dist > 2000) continue;
    const nome = equipEn(it.nome);
    const g = grupos.get(nome) ?? { qtd: 0, distMin: Infinity, lados: new Set<string>() };
    g.qtd += 1; g.distMin = Math.min(g.distMin, r.dist); g.lados.add(r.lado);
    grupos.set(nome, g);
  }
  const eqs = [...grupos.entries()].sort((a, b) => a[1].distMin - b[1].distMin);
  if (eqs.length) {
    const frases = eqs.slice(0, 8).map(([nome, g]) =>
      `${g.qtd > 1 ? `${g.qtd}× ` : "a "}${nome} ${[...g.lados][0]} (closest ${metros(g.distMin)})`);
    partes.push(`Gym equipment in view: ${frases.join("; ")}.`);
  } else {
    partes.push(`Open training floor in view, equipment further away.`);
  }

  // Estilo (identidade Heritage)
  partes.push(
    `High-end interior design: dark charcoal walls, warm brass/gold accent details, ` +
    `soft diffused LED lighting with warm spots, subtle reflections on the mirrors, ` +
    `clean and uncluttered, architectural photography, ultra realistic, 16:9.`
  );

  return partes.join(" ");
}
