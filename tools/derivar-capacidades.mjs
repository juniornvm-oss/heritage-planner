#!/usr/bin/env node
/**
 * derivar-capacidades.mjs — RASCUNHO de `capacidades` para a base técnica.
 *
 * Roda FORA do app, na mão do consultor, e imprime no terminal um bloco
 * TypeScript pronto para colar em `src/lib/curadoria.ts`. Nada aqui entra no
 * bundle: o dataset de exercícios é fonte de FATO (músculo × equipamento) em
 * build time, e sua licença proíbe uso comercial das mídias e das instruções —
 * ver `docs/licencas.md`. Por isso o script NUNCA copia imagem, GIF ou texto de
 * instrução: só conta ocorrências e devolve códigos de grupo muscular.
 *
 * O julgamento continua humano. O que sai daqui é evidência ("53 dos 61
 * exercícios de leg press têm quadríceps como alvo"), não veredito: um
 * casamento errado vira grupo muscular falsamente marcado como coberto no
 * Dossiê do síndico.
 *
 * ## Como rodar
 *
 * ```bash
 * cd tools
 * node derivar-capacidades.mjs                             # usa ../../exercises-dataset
 * node derivar-capacidades.mjs --dados=/caminho/exercises.json
 * node derivar-capacidades.mjs --alvo="Leg Press"          # só um equipamento
 * node derivar-capacidades.mjs --evidencia                 # mostra a contagem por rótulo
 * ```
 *
 * Sem dependências: Node 18+ e os dois arquivos de entrada.
 *
 * ## De onde vem cada coisa
 *
 * - Os 14 grupos, a tabela de normalização e os 18 padrões são LIDOS de
 *   `src/lib/musculatura.ts`. Duplicar aquela tabela aqui garantiria que as
 *   duas versassem diferente depois do terceiro ajuste.
 * - Os SELETORES (quais exercícios representam cada equipamento) moram aqui,
 *   porque são hipótese de trabalho, não domínio do app.
 *
 * ## Por que não filtrar só por `equipment`
 *
 * O campo é grosso demais: "cable" sozinho são 157 registros que vão de rosca
 * a abdução de quadril. Todo seletor combina equipamento COM termos do nome, e
 * quase todos precisam de exclusões (`leg press` casa `calf press` se deixar).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const arg = (nome, padrao) => {
  const p = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return p ? p.slice(nome.length + 3) : padrao;
};
const flag = (nome) => process.argv.includes(`--${nome}`);

const CAMINHO_DADOS = resolve(AQUI, arg("dados", "../../exercises-dataset/data/exercises.json"));
const CAMINHO_MUSC = resolve(AQUI, arg("musculatura", "../src/lib/musculatura.ts"));

// ── 1. Vocabulário: lido do app, nunca redigitado ───────────────────────────

/** Recorta o literal de `export const NOME = { … }` (ou `[ … ]`) contando
 *  delimitadores. Falha alto: se a fonte mudar de forma, o rascunho não pode
 *  sair silenciosamente com meia tabela. */
function bloco(fonte, nome, abre = "{") {
  const fecha = abre === "{" ? "}" : "]";
  const i = fonte.indexOf(`export const ${nome}`);
  if (i < 0) throw new Error(`musculatura.ts: não achei "export const ${nome}"`);
  // Do "=" em diante: a anotação de tipo tem colchete ("string[]") e pegaria
  // o delimitador errado.
  const ini = fonte.indexOf(abre, fonte.indexOf("=", i));
  let n = 0;
  for (let j = ini; j < fonte.length; j++) {
    if (fonte[j] === abre) n++;
    else if (fonte[j] === fecha && --n === 0) return fonte.slice(ini, j + 1);
  }
  throw new Error(`musculatura.ts: bloco de ${nome} não fecha`);
}

const fonteMusc = readFileSync(CAMINHO_MUSC, "utf8");
/** Chaves de primeiro nível de um Record literal (`  peitoral: { ... }`). */
const chavesDoRecord = (txt) => [...txt.matchAll(/^ {2}([a-z_]+):\s*\{/gm)].map((m) => m[1]);

const MUSCULOS = chavesDoRecord(bloco(fonteMusc, "MUSCULOS"));
const PADROES = chavesDoRecord(bloco(fonteMusc, "PADROES"));
const NORM = new Map(
  [...bloco(fonteMusc, "NORM_MUSCULO").matchAll(/(?:"([^"]+)"|([a-z_]+))\s*:\s*"([a-z_]+)"/g)]
    .map((m) => [m[1] ?? m[2], m[3]]),
);
const IGNORADOS = new Set(
  [...bloco(fonteMusc, "NORM_IGNORADO", "[").matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);
if (!NORM.size || !MUSCULOS.length || !PADROES.length || !IGNORADOS.size) {
  throw new Error("musculatura.ts: leitura veio vazia — conferir o formato dos literais");
}

for (const [bruto, grupo] of NORM) {
  if (!MUSCULOS.includes(grupo)) throw new Error(`NORM_MUSCULO manda "${bruto}" para "${grupo}", que não existe em MUSCULOS`);
}

// ── 2. Dataset ──────────────────────────────────────────────────────────────

/**
 * "sled 45в° leg press" → "sled 45° leg press".
 *
 * Quatro registros (0738, 0739, 0740, 1464) foram gravados com o "°" lido como
 * CP1251 e voltaram como "в°". Sem limpar, o termo "45°" de um seletor não
 * casa e o leg press inclinado some da amostra.
 */
const limpar = (s) => String(s ?? "").replace(/в°/g, "°").toLowerCase().trim();

const bruto = JSON.parse(readFileSync(CAMINHO_DADOS, "utf8"));
const EXERCICIOS = bruto.map((e) => ({
  id: e.id,
  nome: limpar(e.name),
  equipamento: limpar(e.equipment),
  alvo: limpar(e.target),
  // `muscle_group` e `secondary_muscles` dizem a mesma coisa em campos
  // diferentes conforme o registro; para "quem mais entra no movimento" tanto
  // faz de onde veio.
  apoio: [...(Array.isArray(e.secondary_muscles) ? e.secondary_muscles : []), e.muscle_group]
    .filter(Boolean).map(limpar),
}));

// ── 3. Seletores: qual amostra representa cada equipamento da base ──────────

/**
 * Dentro de um campo a lista é OU (basta um termo casar); ENTRE campos é E —
 * `equipamento` restringe a família e `nome` escolhe o movimento. `excluir` é
 * veto. `alvo` é o nome EXATO da entrada em BASE_EQUIP: é por ele que o
 * rascunho é colado de volta.
 *
 * Móvel de guarda (estante de halteres), área de solo e espaldar não têm
 * seletor de propósito: ali não se faz exercício resistido, e derivar músculo
 * para eles seria inventar cobertura.
 */
const SELETORES = [
  // ── Força guiada ──
  { alvo: "Estação Cross + Smith", equipamento: ["smith machine", "cable"], excluir: [] },
  { alvo: "Cross Over (torre de polias)", equipamento: ["cable"], excluir: ["seated", "lying"] },
  { alvo: "Puxada + Remada", equipamento: ["cable", "leverage machine"], nome: ["pulldown", "pull-down", "row"], excluir: ["upright row", "front raise"] },
  { alvo: "Leg Press 45°", equipamento: ["sled machine", "leverage machine"], nome: ["leg press", "45° leg", "leg wide press"], excluir: ["calf"] },
  { alvo: "Agachamento guiado (Hack Squat)", equipamento: ["sled machine", "smith machine", "leverage machine"], nome: ["hack squat", "squat"], excluir: ["calf"] },
  { alvo: "Cadeira Extensora", equipamento: ["leverage machine", "sled machine"], nome: ["leg extension"] },
  { alvo: "Mesa Flexora", equipamento: ["leverage machine", "cable"], nome: ["leg curl"] },
  { alvo: "Elevação Pélvica (Hip Thrust)", nome: ["hip thrust", "glute bridge", "hip lift"] },
  { alvo: "Abdutora & Adutora", nome: ["hip abduction", "hip adduction", "abductor", "adductor", "thigh adductor"] },
  { alvo: "Elevação Lateral (Delt Raise)", nome: ["lateral raise", "side lateral"], excluir: ["front raise"] },
  { alvo: "Desenvolvimento de Ombros", nome: ["shoulder press", "military press", "overhead press", "arnold press"] },
  { alvo: "Supino Máquina / Voador", equipamento: ["leverage machine", "cable", "smith machine"], nome: ["chest press", "bench press", "fly", "flye", "pec deck"] },
  { alvo: "Tríceps Máquina", nome: ["triceps"], excluir: ["dip"] },
  { alvo: "Rosca Bíceps Máquina", nome: ["biceps curl", "preacher curl", "concentration curl", "hammer curl"] },
  { alvo: "Panturrilha Máquina", nome: ["calf raise", "calf press", "calf extension"] },
  { alvo: "Abdominal Máquina", nome: ["crunch", "sit-up", "situp"], excluir: ["reverse hyper"] },
  { alvo: "Extensão Lombar", nome: ["hyperextension", "back extension", "good morning"] },

  // ── Ergometria ──
  // O dataset é de musculação: são 29 exercícios de cardio para 1.324. A
  // amostra aqui serve de conferência, não de fonte — o estímulo do ergômetro
  // é decidido na base técnica, não contado aqui.
  { alvo: "Esteira", nome: ["run", "walk", "jog", "treadmill"] },
  { alvo: "Escada (Stepmill)", equipamento: ["stepmill machine"] },
  { alvo: "Elíptico", equipamento: ["elliptical machine"] },
  { alvo: "Bike Horizontal", equipamento: ["stationary bike"] },
  { alvo: "Bike Vertical", equipamento: ["stationary bike"] },
  { alvo: "Bike de Spinning", equipamento: ["stationary bike"] },
  { alvo: "Remo Ergômetro", equipamento: ["skierg machine", "upper body ergometer"], nome: ["rowing", "ergometer"] },

  // ── Peso livre ──
  { alvo: "Banco Regulável 0-90°", equipamento: ["dumbbell"], nome: ["incline", "bench", "seated"], excluir: ["leg", "calf", "squat"] },
  { alvo: "Banco de Supino", equipamento: ["barbell", "dumbbell"], nome: ["bench press"], excluir: ["incline", "decline"] },
  { alvo: "Banco Inclinado / Declinado", nome: ["incline bench press", "decline bench press", "incline fly", "decline fly"] },
  { alvo: "Rack / Gaiola", equipamento: ["barbell", "olympic barbell", "trap bar"], nome: ["squat", "deadlift", "press", "row", "shrug", "good morning", "lunge"] },

  // ── Preparação ──
  { alvo: "Kit Funcional", equipamento: ["kettlebell", "stability ball", "medicine ball", "bosu ball", "wheel roller", "band", "resistance band"] },
];

/**
 * Termo casa só em INÍCIO DE PALAVRA — a mesma regra de `baseDoNome`.
 *
 * Sem ela, "run" casa dentro de "trunk rotation" e a esteira herda 52
 * exercícios de abdômen. Sufixo continua livre ("row" casa "rowing").
 */
const contem = (texto, termo) => {
  for (let i = texto.indexOf(termo); i >= 0; i = texto.indexOf(termo, i + 1)) {
    if (i === 0 || !/[a-z0-9]/.test(texto[i - 1])) return true;
  }
  return false;
};

const casa = (ex, s) => {
  if (s.excluir?.some((t) => contem(ex.nome, t))) return false;
  if (s.equipamento && !s.equipamento.includes(ex.equipamento)) return false;
  if (s.nome && !s.nome.some((t) => contem(ex.nome, t))) return false;
  return Boolean(s.equipamento || s.nome);
};

// ── 4. Derivação ────────────────────────────────────────────────────────────

/** Rótulo bruto → grupo do mapa; devolve null e ANOTA o que não mapeou. */
const naoMapeados = new Map();
function grupoDe(rotulo) {
  const g = NORM.get(rotulo);
  if (g) return g;
  if (!IGNORADOS.has(rotulo)) naoMapeados.set(rotulo, (naoMapeados.get(rotulo) ?? 0) + 1);
  return null;
}

/** Nome do exercício → padrão de movimento. Ordem importa: o primeiro que
 *  casar vence, e os termos mais específicos vêm antes ("leg curl" antes de
 *  "curl", senão a mesa flexora vira rosca de bíceps). */
const PISTAS_PADRAO = [
  ["leg curl", "flexao_joelho"],
  ["leg extension", "extensao_joelho"],
  ["calf", "panturrilha"],
  ["hip abduction", "abducao_quadril"], ["abductor", "abducao_quadril"], ["abduction", "abducao_quadril"],
  ["hip adduction", "aducao_quadril"], ["adductor", "aducao_quadril"], ["adduction", "aducao_quadril"],
  ["hip thrust", "dobrar_quadril"], ["glute bridge", "dobrar_quadril"], ["deadlift", "dobrar_quadril"],
  ["good morning", "dobrar_quadril"], ["hyperextension", "dobrar_quadril"], ["back extension", "dobrar_quadril"],
  ["squat", "agachar"], ["lunge", "agachar"], ["leg press", "agachar"], ["step-up", "agachar"],
  ["lateral raise", "abducao_ombro"], ["side lateral", "abducao_ombro"],
  ["shoulder press", "empurrar_vertical"], ["military press", "empurrar_vertical"],
  ["overhead press", "empurrar_vertical"], ["overhead extension", "extensao_cotovelo"],
  ["pulldown", "puxar_vertical"], ["pull-down", "puxar_vertical"], ["pull-up", "puxar_vertical"], ["chin-up", "puxar_vertical"],
  ["row", "puxar_horizontal"],
  ["bench press", "empurrar_horizontal"], ["chest press", "empurrar_horizontal"],
  ["fly", "empurrar_horizontal"], ["flye", "empurrar_horizontal"], ["pec deck", "empurrar_horizontal"],
  ["triceps", "extensao_cotovelo"], ["pushdown", "extensao_cotovelo"], ["skullcrusher", "extensao_cotovelo"],
  ["curl", "flexao_cotovelo"],
  ["plank", "core_anti_extensao"], ["rollout", "core_anti_extensao"],
  ["twist", "core_rotacao"], ["woodchop", "core_rotacao"], ["rotation", "core_rotacao"],
  ["crunch", "core_flexao"], ["sit-up", "core_flexao"], ["situp", "core_flexao"], ["leg raise", "core_flexao"],
  ["run", "cardio"], ["walk", "cardio"], ["cycle", "cardio"], ["bike", "cardio"],
  ["stair", "cardio"], ["rowing machine", "cardio"], ["elliptical", "cardio"],
];
for (const [, p] of PISTAS_PADRAO) {
  if (!PADROES.includes(p)) throw new Error(`PISTAS_PADRAO cita "${p}", que não existe em PADROES`);
}
const padraoDe = (nome) => PISTAS_PADRAO.find(([t]) => contem(nome, t))?.[1] ?? null;

/** Fração da amostra a partir da qual o grupo entra no rascunho. Alto de
 *  propósito: é melhor o consultor ACRESCENTAR o que falta do que apagar o que
 *  o script marcou a mais e ele não notou. */
const CORTE_PRIMARIO = 0.15;
const CORTE_SECUNDARIO = 0.3;
const CORTE_PADRAO = 0.1;

function derivar(seletor) {
  const amostra = EXERCICIOS.filter((e) => casa(e, seletor));
  const conta = (mapa, chave) => mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
  const alvos = new Map(), apoios = new Map(), padroes = new Map();
  for (const ex of amostra) {
    const g = grupoDe(ex.alvo);
    if (g) conta(alvos, g);
    for (const a of new Set(ex.apoio.map(grupoDe).filter(Boolean))) conta(apoios, a);
    const p = padraoDe(ex.nome);
    if (p) conta(padroes, p);
  }
  const acima = (mapa, corte) => [...mapa.entries()]
    .filter(([, n]) => n / Math.max(amostra.length, 1) >= corte)
    .sort((a, b) => b[1] - a[1]);
  const primario = acima(alvos, CORTE_PRIMARIO);
  const nomesPrim = new Set(primario.map(([g]) => g));
  return {
    n: amostra.length,
    primario,
    secundario: acima(apoios, CORTE_SECUNDARIO).filter(([g]) => !nomesPrim.has(g)),
    padroes: acima(padroes, CORTE_PADRAO),
    alvos, apoios,
  };
}

// ── 5. Saída ────────────────────────────────────────────────────────────────

const filtro = arg("alvo", "");
const lista = (pares) => pares.map(([g]) => `"${g}"`).join(", ");
const evidencia = (mapa, n) => [...mapa.entries()].sort((a, b) => b[1] - a[1])
  .map(([g, c]) => `${g} ${Math.round((c / Math.max(n, 1)) * 100)}%`).join(" · ");

console.log(`// Rascunho gerado por tools/derivar-capacidades.mjs — REVISAR ITEM A ITEM.`);
console.log(`// Fonte: ${CAMINHO_DADOS} (${EXERCICIOS.length} registros, uso não comercial — docs/licencas.md).`);
console.log(`// O número entre parênteses é o tamanho da amostra: amostra pequena = palpite fraco.\n`);

for (const s of SELETORES) {
  if (filtro && !s.alvo.toLowerCase().includes(filtro.toLowerCase())) continue;
  const d = derivar(s);
  console.log(`// ── ${s.alvo} — ${d.n} exercícios na amostra`);
  if (!d.n) {
    console.log(`// AMOSTRA VAZIA: o seletor não casou nada. Preencher à mão.\n`);
    continue;
  }
  if (flag("evidencia")) {
    console.log(`//   alvo:  ${evidencia(d.alvos, d.n)}`);
    console.log(`//   apoio: ${evidencia(d.apoios, d.n)}`);
  }
  const sec = d.secundario.length ? `\n  secundario: [${lista(d.secundario)}],` : "";
  console.log(`capacidades: {\n  primario: [${lista(d.primario)}],${sec}\n  padroes: [${lista(d.padroes)}],\n},\n`);
}

// O relatório final é o que mantém a tabela viva: rótulo novo na fonte aparece
// aqui em vez de sumir silenciosamente da conta.
if (naoMapeados.size) {
  console.log(`// ── Rótulos fora de NORM_MUSCULO e de NORM_IGNORADO (decidir em musculatura.ts):`);
  for (const [r, n] of [...naoMapeados.entries()].sort((a, b) => b[1] - a[1])) console.log(`//   ${r} (${n}×)`);
} else {
  console.log(`// Nenhum rótulo fora da tabela: NORM_MUSCULO cobre a amostra inteira.`);
}
