// Resolvedor ÚNICO de snap do editor: para onde a peça vai E as guias que
// explicam o encaixe.
//
// Antes daqui conviviam quatro políticas de arredondamento, e elas se
// contradiziam:
//   · `snapCm(v, 5)` (canvas.ts), no arraste de equipamento — passo 5 cm
//     cravado no código, ignorando o controle SNAP da barra: trocar para 1 cm
//     não mudava nada na tela;
//   · um `sn()` inline, duplicado no arraste de área de acabamento e no de
//     infraestrutura — esse lê o SNAP, mas só arredonda: nunca alinha;
//   · `arred()` (estrutura.ts), na Etapa 1 — passo 5 cm, também fixo;
//   · `snapPonto()` dentro do EditorCanvas — o único completo (vértice →
//     parede → grade), e justamente o que só as ferramentas de desenho usavam.
//
// O buraco aparecia onde mais dói: arrastando um aparelho o editor arredondava
// a posição e não olhava para o vizinho, então duas esteiras lado a lado só
// ficavam alinhadas por sorte — e o consultor corrigia no olho, cota por cota.
//
// A política agora é uma, e ela DEVOLVE O PORQUÊ do encaixe: cada resultado vem
// com o alvo que o causou, a linha a desenhar e o vizinho envolvido. Sem isso a
// UI teria de refazer a busca inteira só para saber onde pintar a guia.
//
// Função pura sobre a cena: sem React, sem Konva, sem DOM.

import type { Cena, ItemPosicionado, Parede } from "./types";
import { projetarNoSegmento, type Ponto } from "./geometria";

// ── Tolerâncias ─────────────────────────────────────────────────────────────

/**
 * Raio do ímã em PIXELS DE TELA nas ferramentas de desenho (parede, polígono,
 * cota). Cada toque disputa poucos candidatos, então o raio pode ser generoso —
 * é dedo em vidro, não mouse.
 */
export const TOL_DESENHO_PX = 14;

/**
 * Raio do ímã em PIXELS DE TELA no arraste de objeto. Menor de propósito: cada
 * vizinho oferece três referências por eixo (esquerda/centro/direita e
 * topo/centro/base), e com uma dúzia de candidatos em disputa o raio de 14 px
 * faz a peça saltar entre alinhamentos a cada pixel de movimento.
 */
export const TOL_ITEM_PX = 8;

/** Converte o raio de tela em tolerância de MUNDO (cm): o ímã tem que medir o
 *  mesmo na tela em qualquer zoom, e por isso encolhe em cm quando aproxima. */
export const tolCmPorZoom = (px: number, zoom: number): number => px / Math.max(zoom, 1e-6);

/** Sem grade, a entrada ainda é discretizada em 1 mm: obra não tem micrômetro
 *  e float cru envenena as cotas com 0,0001 cm. */
export const arredMm = (v: number): number => Math.round(v * 10) / 10;

/** Paralelismo/contato: mesma folga de 0,5 cm usada por validation e lâmina. */
const EPS = 0.5;

/** Sobreposição mínima no eixo perpendicular para dois corpos serem "vizinhos
 *  de frente" — abaixo disso a cota mediria a diagonal entre quinas, que não é
 *  passagem nenhuma. Mesmo critério da lâmina. */
const SOBREPOSICAO_MIN_CM = 8;

// ── Tipos ───────────────────────────────────────────────────────────────────

/** Retângulo alinhado aos eixos em cm (mundo). Mesmos nomes de campo dos itens
 *  (`x_cm/y_cm/w_cm/h_cm`) para o chamador não precisar traduzir nada. */
export interface RectCm { x_cm: number; y_cm: number; w_cm: number; h_cm: number }

/** Sufixo X/Y = eixo TRAVADO pelo alinhamento (guia vertical / horizontal). */
export type TipoAlvo = "vertice" | "parede" | "grade" | "bordaX" | "bordaY" | "centroX" | "centroY";

/** Eixo que o alvo trava. `xy` = ponto cravado (vértice, parede diagonal). */
export type Eixo = "x" | "y" | "xy";

export interface AlvoSnap {
  tipo: TipoAlvo;
  eixo: Eixo;
  /** Ponto exato do encaixe — presente só quando `eixo` é "xy". */
  p?: Ponto;
  /** Coordenada travada, nos alvos de eixo único. */
  valor?: number;
  /** Segmento da guia a desenhar (cm, mundo). */
  linha?: [Ponto, Ponto];
  /** Quem justificou o encaixe (vizinho, parede, sala). */
  contraId?: string;
  contraRotulo?: string;
  /** Quanto o encaixe moveu, em cm — a UI usa para graduar o realce. */
  dist: number;
}

export interface CtxSnap {
  cena: Cena;
  /** Passo da grade em cm; 0 = grade desligada (fica só o 1 mm). */
  passoGrade: number;
  /** Raio do ímã em cm. Venha de `tolCmPorZoom`, nunca de constante fixa. */
  tolCm: number;
  /**
   * Id do que está sendo arrastado. Sem isto o objeto se alinha CONSIGO MESMO:
   * durante o arraste a cena já guarda a posição corrente, então o candidato
   * mais próximo é sempre ele próprio, a 0 cm, e nada mais tem chance.
   */
  ignorarId?: string;
  /** Vértice em edição, pelo mesmo motivo — o ponto arrastado já está gravado
   *  na cena e o ímã acharia a si próprio. */
  ignorarPonto?: Ponto;
}

export type TipoObstaculo = "equipamento" | "infra" | "pilar" | "parede" | "sala";

/** Corpo com o qual dá para alinhar e do qual dá para medir folga. */
export interface Obstaculo {
  id: string;
  rotulo: string;
  tipo: TipoObstaculo;
  rect: RectCm;
}

export type Direcao = "esq" | "dir" | "cima" | "baixo";

/** Vão livre do item até o vizinho mais próximo naquela direção — é a cota que
 *  a UI escreve enquanto o dedo arrasta. */
export interface FolgaViva {
  dir: Direcao;
  cm: number;
  contraId: string;
  contraRotulo: string;
  /** Segmento da cota (cm, mundo), já no meio da região de encontro. */
  linha: [Ponto, Ponto];
}

// ── Geometria de apoio ──────────────────────────────────────────────────────

interface Bordas { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }

const bordas = (r: RectCm): Bordas => ({
  x0: r.x_cm, y0: r.y_cm, x1: r.x_cm + r.w_cm, y1: r.y_cm + r.h_cm,
  cx: r.x_cm + r.w_cm / 2, cy: r.y_cm + r.h_cm / 2,
});

/**
 * AABB de um corpo girado em torno do próprio centro.
 *
 * Mesma fórmula de `validation.ts` (`aabbItem`) e de `lamina.ts`: o retângulo
 * envolvente do corpo girado. Repetir a conta com o retângulo NÃO girado é o
 * erro clássico — um aparelho a 90° passa a alinhar por uma borda que não
 * existe na tela, 50 cm fora do lugar.
 */
export function aabbGirado(x_cm: number, y_cm: number, w_cm: number, h_cm: number, rotacaoGraus: number): RectCm {
  const th = ((rotacaoGraus || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  const w = w_cm * c + h_cm * s, h = w_cm * s + h_cm * c;
  const cx = x_cm + w_cm / 2, cy = y_cm + h_cm / 2;
  return { x_cm: cx - w / 2, y_cm: cy - h / 2, w_cm: w, h_cm: h };
}

export const aabbDoItem = (it: ItemPosicionado): RectCm =>
  aabbGirado(it.x_cm, it.y_cm, it.w_cm, it.h_cm, it.rotacao || 0);

/** Parede ortogonal vira retângulo com a espessura real; a diagonal fica de
 *  fora (mesma aproximação documentada em validation/lâmina — ela continua
 *  valendo como LINHA para o snap de ponto). */
function retDaParede(w: Parede): RectCm | null {
  const horiz = Math.abs(w.y1 - w.y2) <= EPS, vert = Math.abs(w.x1 - w.x2) <= EPS;
  if (!horiz && !vert) return null;
  const e = Math.max(w.espessura_cm, 4) / 2;
  const x0 = Math.min(w.x1, w.x2) - e, y0 = Math.min(w.y1, w.y2) - e;
  return { x_cm: x0, y_cm: y0, w_cm: Math.max(w.x1, w.x2) + e - x0, h_cm: Math.max(w.y1, w.y2) + e - y0 };
}

/**
 * Tudo com que dá para alinhar: equipamentos, mobiliário, pilares, paredes
 * ortogonais e a própria sala.
 *
 * A sala entra como corpo CONTINENTE (`tipo: "sala"`): as bordas dela são as
 * faces internas, e o centro dela é o centro da planta — alinhar o aparelho ao
 * eixo da sala é pedido corriqueiro e não existia em lugar nenhum do editor.
 * `folgaAte` inverte o sinal para esse caso; alinhamento não precisa saber.
 */
export function obstaculosDaCena(cena: Cena): Obstaculo[] {
  const out: Obstaculo[] = [];
  const sala = cena.sala;
  if (sala && sala.largura_cm > 0 && sala.profundidade_cm > 0) {
    out.push({ id: "sala", rotulo: "Sala", tipo: "sala", rect: { x_cm: 0, y_cm: 0, w_cm: sala.largura_cm, h_cm: sala.profundidade_cm } });
  }
  for (const it of cena.itens ?? []) {
    out.push({ id: it.id, rotulo: it.nome, tipo: "equipamento", rect: aabbDoItem(it) });
  }
  for (const i of cena.infra ?? []) {
    // Mobiliário também gira na tela; usar o retângulo cru (como validation.ts
    // faz) desenharia a guia numa borda que o consultor não vê.
    out.push({ id: i.id, rotulo: i.nome, tipo: "infra", rect: aabbGirado(i.x_cm, i.y_cm, i.w_cm, i.h_cm, i.rotacao || 0) });
  }
  for (const p of cena.estrutura?.pilares ?? []) {
    out.push({ id: p.id, rotulo: "Pilar", tipo: "pilar", rect: { x_cm: p.x_cm, y_cm: p.y_cm, w_cm: p.w_cm, h_cm: p.h_cm } });
  }
  // Pilar do config legado: sem estrutura desenhada, é o único obstáculo da
  // sala — as demais análises já o consideram.
  const legado = cena.sala?.config?.pilar;
  if (legado) out.push({ id: "pilar-legado", rotulo: "Pilar", tipo: "pilar", rect: { x_cm: legado.x, y_cm: legado.y, w_cm: legado.w, h_cm: legado.h } });
  for (const w of cena.estrutura?.paredes ?? []) {
    const r = retDaParede(w);
    if (r) out.push({ id: w.id, rotulo: "Parede", tipo: "parede", rect: r });
  }
  return out;
}

/** Pontos que o ímã de vértice persegue, na ordem em que foram desenhados. */
export function verticesDaCena(cena: Cena): Ponto[] {
  const out: Ponto[] = [];
  for (const pr of cena.estrutura?.paredes ?? []) {
    out.push({ x: pr.x1, y: pr.y1 });
    out.push({ x: pr.x2, y: pr.y2 });
  }
  for (const a of cena.acabamentos ?? []) for (const pt of a.pontos ?? []) out.push({ x: pt.x, y: pt.y });
  // As áreas funcionais ficavam FORA do ímã: encostar o piso do cardio na zona
  // já desenhada dependia da pontaria do dedo, e sobrava fresta de 3 cm.
  for (const a of cena.areas ?? []) for (const pt of a.pontos ?? []) out.push({ x: pt.x, y: pt.y });
  return out;
}

// ── Snap de PONTO (ferramentas de desenho) ──────────────────────────────────

/**
 * Cascata: vértice → linha da parede → grade → 1 mm.
 *
 * A ordem não é estética. Vértice antes de linha porque encostar na quina é
 * intenção explícita; linha antes de grade porque a parede real quase nunca
 * cai num múltiplo do passo, e obrigar a grade ali abriria fresta entre o piso
 * e a parede — o erro que o Dossiê imprime como área de acabamento errada.
 *
 * Quando a parede é ortogonal ela trava UM eixo só, e o eixo livre ainda vai
 * para a grade: o vértice fica colado na parede e alinhado com o resto do
 * desenho, em vez de herdar o ruído do dedo.
 */
export function resolverSnapPonto(p: Ponto, ctx: CtxSnap): { p: Ponto; alvos: AlvoSnap[] } {
  const tol = Math.max(0, ctx.tolCm);
  const ign = ctx.ignorarPonto;

  let vertice: Ponto | null = null;
  let dVertice = Infinity;
  for (const v of verticesDaCena(ctx.cena)) {
    if (ign && Math.abs(v.x - ign.x) < 1e-6 && Math.abs(v.y - ign.y) < 1e-6) continue;
    const d = Math.hypot(p.x - v.x, p.y - v.y);
    if (d <= tol && d < dVertice) { vertice = v; dVertice = d; }
  }
  if (vertice) {
    return { p: { x: vertice.x, y: vertice.y }, alvos: [{ tipo: "vertice", eixo: "xy", p: { x: vertice.x, y: vertice.y }, dist: dVertice }] };
  }

  let parede: Parede | null = null;
  let proj: Ponto = p;
  let dParede = Infinity;
  for (const pr of ctx.cena.estrutura?.paredes ?? []) {
    const pj = projetarNoSegmento(p, { x: pr.x1, y: pr.y1 }, { x: pr.x2, y: pr.y2 });
    if (pj.dist <= tol && pj.dist < dParede) { parede = pr; proj = { x: pj.x, y: pj.y }; dParede = pj.dist; }
  }

  const alvos: AlvoSnap[] = [];
  let x = p.x, y = p.y;
  let travouX = false, travouY = false;

  if (parede) {
    const linha: [Ponto, Ponto] = [{ x: parede.x1, y: parede.y1 }, { x: parede.x2, y: parede.y2 }];
    const vert = Math.abs(parede.x1 - parede.x2) <= EPS;
    const horiz = Math.abs(parede.y1 - parede.y2) <= EPS;
    const comum = { tipo: "parede" as const, linha, contraId: parede.id, contraRotulo: "Parede" };
    if (vert && !horiz) {
      x = proj.x; travouX = true;
      alvos.push({ ...comum, eixo: "x", valor: x, dist: Math.abs(p.x - x) });
    } else if (horiz && !vert) {
      y = proj.y; travouY = true;
      alvos.push({ ...comum, eixo: "y", valor: y, dist: Math.abs(p.y - y) });
    } else {
      // Diagonal (ou parede de comprimento zero): não há eixo a liberar, o
      // ponto tem de ficar exatamente sobre a linha.
      x = proj.x; y = proj.y; travouX = true; travouY = true;
      alvos.push({ ...comum, eixo: "xy", p: { x, y }, dist: dParede });
    }
  }

  const passo = ctx.passoGrade > 0 ? ctx.passoGrade : 0;
  if (!travouX) {
    const nx = passo ? Math.round(x / passo) * passo : arredMm(x);
    if (passo) alvos.push({ tipo: "grade", eixo: "x", valor: nx, dist: Math.abs(nx - x) });
    x = nx;
  }
  if (!travouY) {
    const ny = passo ? Math.round(y / passo) * passo : arredMm(y);
    if (passo) alvos.push({ tipo: "grade", eixo: "y", valor: ny, dist: Math.abs(ny - y) });
    y = ny;
  }
  return { p: { x, y }, alvos };
}

// ── Snap de ITEM arrastado ──────────────────────────────────────────────────

type Papel = "borda" | "centro";

const referencias = (b: Bordas, eixo: "x" | "y"): { v: number; papel: Papel }[] =>
  eixo === "x"
    ? [{ v: b.x0, papel: "borda" }, { v: b.cx, papel: "centro" }, { v: b.x1, papel: "borda" }]
    : [{ v: b.y0, papel: "borda" }, { v: b.cy, papel: "centro" }, { v: b.y1, papel: "borda" }];

interface Alinhamento { delta: number; valor: number; centro: boolean; o: Obstaculo; ob: Bordas; dist: number; prio: number }

/** Melhor alinhamento num eixo. Empate técnico (mesmo deslocamento) resolve por
 *  intenção: centro-com-centro primeiro, depois borda-com-borda; misturar
 *  centro com borda é o alinhamento mais fraco e fica por último. */
function alinhar(b: Bordas, vizinhos: Obstaculo[], eixo: "x" | "y", tol: number): Alinhamento | null {
  const meus = referencias(b, eixo);
  let melhor: Alinhamento | null = null;
  for (const o of vizinhos) {
    const ob = bordas(o.rect);
    for (const alvo of referencias(ob, eixo)) {
      for (const meu of meus) {
        const delta = alvo.v - meu.v;
        const dist = Math.abs(delta);
        if (dist > tol) continue;
        const centro = meu.papel === "centro" && alvo.papel === "centro";
        const prio = centro ? 0 : meu.papel === alvo.papel ? 1 : 2;
        const ganha = !melhor
          || dist < melhor.dist - 1e-9
          || (dist <= melhor.dist + 1e-9 && prio < melhor.prio);
        if (ganha) melhor = { delta, valor: alvo.v, centro, o, ob, dist, prio };
      }
    }
  }
  return melhor;
}

/**
 * Resolve o arraste de um objeto: devolve o DESLOCAMENTO a aplicar (não a
 * posição), porque o chamador pode estar movendo um item, um móvel ou uma área
 * inteira — o que muda é só onde somar.
 *
 * Recebe o AABB JÁ GIRADO (use `aabbDoItem`): é a borda que o consultor enxerga
 * e, portanto, a única que faz sentido alinhar.
 *
 * No máximo um alvo por eixo — uma guia vertical e uma horizontal. Mais que
 * isso vira teia de aranha sobre a planta e o consultor deixa de ler qualquer
 * uma. Sem alinhamento no eixo, ele cai na grade (a borda do AABB vai para o
 * passo; a origem do item pode ficar quebrada, e é o certo: alinhado é o que
 * aparece).
 */
export function resolverSnapItem(bbox: RectCm, ctx: CtxSnap): { dx: number; dy: number; alvos: AlvoSnap[] } {
  const tol = Math.max(0, ctx.tolCm);
  const b = bordas(bbox);
  const vizinhos = obstaculosDaCena(ctx.cena).filter((o) => o.id !== ctx.ignorarId);
  const passo = ctx.passoGrade > 0 ? ctx.passoGrade : 0;
  const alvos: AlvoSnap[] = [];

  const ax = alinhar(b, vizinhos, "x", tol);
  let dx: number;
  if (ax) {
    dx = ax.delta;
    alvos.push({
      tipo: ax.centro ? "centroX" : "bordaX", eixo: "x", valor: ax.valor,
      linha: [{ x: ax.valor, y: Math.min(b.y0, ax.ob.y0) }, { x: ax.valor, y: Math.max(b.y1, ax.ob.y1) }],
      contraId: ax.o.id, contraRotulo: ax.o.rotulo, dist: ax.dist,
    });
  } else if (passo) {
    dx = Math.round(b.x0 / passo) * passo - b.x0;
    alvos.push({ tipo: "grade", eixo: "x", valor: b.x0 + dx, dist: Math.abs(dx) });
  } else {
    dx = arredMm(b.x0) - b.x0;
  }

  const ay = alinhar(b, vizinhos, "y", tol);
  let dy: number;
  if (ay) {
    dy = ay.delta;
    alvos.push({
      tipo: ay.centro ? "centroY" : "bordaY", eixo: "y", valor: ay.valor,
      linha: [{ x: Math.min(b.x0, ay.ob.x0), y: ay.valor }, { x: Math.max(b.x1, ay.ob.x1), y: ay.valor }],
      contraId: ay.o.id, contraRotulo: ay.o.rotulo, dist: ay.dist,
    });
  } else if (passo) {
    dy = Math.round(b.y0 / passo) * passo - b.y0;
    alvos.push({ tipo: "grade", eixo: "y", valor: b.y0 + dy, dist: Math.abs(dy) });
  } else {
    dy = arredMm(b.y0) - b.y0;
  }

  return { dx, dy, alvos };
}

// ── Cota viva (folgas durante o arraste) ────────────────────────────────────

/**
 * Menor vão livre do item até o vizinho de cada lado, em cm — a cota que
 * aparece enquanto a peça está no ar, antes de soltar.
 *
 * É a mesma pergunta que `analiseEspaco` responde depois do fato ("este vão tem
 * 42 cm, ninguém passa"); aqui ela chega ANTES, que é quando ainda dá para
 * mudar o layout de graça.
 *
 * Só conta vizinho de frente: exige `SOBREPOSICAO_MIN_CM` de sobreposição no
 * eixo perpendicular, senão a "folga" seria a distância até uma quina que o
 * usuário contorna andando. Corpo sobreposto (colisão) não vira folga negativa
 * — quem julga colisão é a validação.
 *
 * Sai ordenado do vão mais apertado para o mais largo: o primeiro é o que
 * decide se o layout passa.
 */
export function folgaAte(bbox: RectCm, ctx: CtxSnap): FolgaViva[] {
  const b = bordas(bbox);
  const melhor = new Map<Direcao, FolgaViva>();

  const registrar = (dir: Direcao, cm: number, o: Obstaculo, linha: [Ponto, Ponto]) => {
    if (cm < -EPS) return; // sobreposto: é colisão, não folga
    const atual = melhor.get(dir);
    const val = Math.max(0, cm);
    if (!atual || val < atual.cm) melhor.set(dir, { dir, cm: val, contraId: o.id, contraRotulo: o.rotulo, linha });
  };

  for (const o of obstaculosDaCena(ctx.cena)) {
    if (o.id === ctx.ignorarId) continue;
    const ob = bordas(o.rect);
    const dentro = o.tipo === "sala"; // a sala CONTÉM o item: as faces se invertem
    const sobY = Math.min(b.y1, ob.y1) - Math.max(b.y0, ob.y0);
    const sobX = Math.min(b.x1, ob.x1) - Math.max(b.x0, ob.x0);

    if (sobY > SOBREPOSICAO_MIN_CM) {
      const ym = (Math.max(b.y0, ob.y0) + Math.min(b.y1, ob.y1)) / 2;
      const faceEsq = dentro ? ob.x0 : ob.x1;
      const faceDir = dentro ? ob.x1 : ob.x0;
      if (dentro || faceEsq <= b.x0 + EPS) registrar("esq", b.x0 - faceEsq, o, [{ x: faceEsq, y: ym }, { x: b.x0, y: ym }]);
      if (dentro || faceDir >= b.x1 - EPS) registrar("dir", faceDir - b.x1, o, [{ x: b.x1, y: ym }, { x: faceDir, y: ym }]);
    }
    if (sobX > SOBREPOSICAO_MIN_CM) {
      const xm = (Math.max(b.x0, ob.x0) + Math.min(b.x1, ob.x1)) / 2;
      const faceCima = dentro ? ob.y0 : ob.y1;
      const faceBaixo = dentro ? ob.y1 : ob.y0;
      if (dentro || faceCima <= b.y0 + EPS) registrar("cima", b.y0 - faceCima, o, [{ x: xm, y: faceCima }, { x: xm, y: b.y0 }]);
      if (dentro || faceBaixo >= b.y1 - EPS) registrar("baixo", faceBaixo - b.y1, o, [{ x: xm, y: b.y1 }, { x: xm, y: faceBaixo }]);
    }
  }

  return [...melhor.values()].sort((a, c) => a.cm - c.cm);
}
