import type { Cena, ItemPosicionado, Cenario } from "./types";
import { CENARIOS } from "./types";
import { analisarEspaco, type AnaliseEspaco } from "./analiseEspaco";

interface RectCm { x_cm: number; y_cm: number; w_cm: number; h_cm: number }
const overlapR = (a: RectCm, b: RectCm) =>
  a.x_cm < b.x_cm + b.w_cm && a.x_cm + a.w_cm > b.x_cm && a.y_cm < b.y_cm + b.h_cm && a.y_cm + a.h_cm > b.y_cm;
/** AABB do item considerando a rotação em torno do centro (aproximação
 *  conservadora para colisão — o retângulo envolvente do corpo girado). */
const aabbItem = (a: ItemPosicionado): RectCm => {
  const th = ((a.rotacao || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  const w = a.w_cm * c + a.h_cm * s, h = a.w_cm * s + a.h_cm * c;
  const cx = a.x_cm + a.w_cm / 2, cy = a.y_cm + a.h_cm / 2;
  return { x_cm: cx - w / 2, y_cm: cy - h / 2, w_cm: w, h_cm: h };
};
const overlap = (a: ItemPosicionado, b: RectCm) => overlapR(aabbItem(a), b);

/** Retângulo da ÁREA DE USO do item (AABB do corpo girado + margens). */
const usoRect = (a: ItemPosicionado): RectCm => {
  const uF = a.uso_frontal_cm || 0, uL = a.uso_lateral_cm || 0;
  const bb = aabbItem(a);
  return { x_cm: bb.x_cm - uL, y_cm: bb.y_cm - uF, w_cm: bb.w_cm + 2 * uL, h_cm: bb.h_cm + 2 * uF };
};

/**
 * O problema de UM equipamento, em ordem de gravidade.
 *
 *  · `colisao`  — o corpo do aparelho invade parede, pilar, móvel ou outro
 *                 aparelho. Não pode ficar aí, ponto.
 *  · `giro`     — está dentro da varredura da folha de uma porta: cabe no
 *                 piso, mas trava a porta. Some ao trocar para porta de correr.
 *  · `corredor` — atravessa o corredor de circulação do projeto legado.
 *  · `uso`      — divide área de operação com o vizinho.
 *
 * Importe SEMPRE deste arquivo. A união já esteve escrita à mão em três
 * lugares, e as cópias falhavam de formas opostas: uma quebrava o typecheck
 * (barulhenta, útil) e a outra aceitava em silêncio um membro que nunca
 * chegava à tela.
 */
export type Problema = "colisao" | "giro" | "corredor" | "uso" | null;

/**
 * `espaco` é injetável de propósito: `analisarEspaco` é a conta mais cara do
 * editor e já roda no canvas e no rodapé. Quem tem a análise em mãos passa a
 * sua; quem não tem paga uma vez. Sem isso, ler a varredura das portas aqui
 * dobraria o custo justamente durante o arraste.
 */
export function problemasDaCena(cena: Cena, espaco: AnaliseEspaco = analisarEspaco(cena)): Record<string, Problema> {
  const sala = cena.sala;
  const itens = cena.itens ?? [];
  const p = sala.config?.pilar;
  const pilarRect = p ? { x_cm: p.x, y_cm: p.y, w_cm: p.w, h_cm: p.h } : null;
  // Pilares da estrutura (Etapa 1) também bloqueiam.
  const pilaresEst: RectCm[] = (cena.estrutura?.pilares ?? []).map((pl) => ({ x_cm: pl.x_cm, y_cm: pl.y_cm, w_cm: pl.w_cm, h_cm: pl.h_cm }));
  // Paredes ORTOGONAIS da estrutura como retângulos finos (diagonais ficam de fora — aproximação documentada).
  const paredesRect: RectCm[] = (cena.estrutura?.paredes ?? [])
    .filter((w) => Math.abs(w.x1 - w.x2) < 0.5 || Math.abs(w.y1 - w.y2) < 0.5)
    .map((w) => {
      const e = Math.max(w.espessura_cm, 4) / 2;
      return {
        x_cm: Math.min(w.x1, w.x2) - e, y_cm: Math.min(w.y1, w.y2) - e,
        w_cm: Math.abs(w.x2 - w.x1) + 2 * e, h_cm: Math.abs(w.y2 - w.y1) + 2 * e,
      };
    });
  const infraRects: RectCm[] = (cena.infra ?? []).map((i) => ({ x_cm: i.x_cm, y_cm: i.y_cm, w_cm: i.w_cm, h_cm: i.h_cm }));
  const corredor = sala.config?.corredor;
  // Varredura das folhas de porta. Vem de `analisarEspaco`, que já resolveu o
  // "para dentro" pelo centro das paredes e já descartou os modelos que não
  // varrem — refazer a conta aqui seria a quinta cópia de geometria de parede
  // do projeto, e a primeira a divergir das outras quatro.
  const noGiro = new Set(espaco.aberturas.flatMap((ab) => ab.ids));
  const res: Record<string, Problema> = {};
  for (const a of itens) {
    const bb = aabbItem(a);
    const fora = bb.x_cm < 0 || bb.y_cm < 0 || bb.x_cm + bb.w_cm > sala.largura_cm || bb.y_cm + bb.h_cm > sala.profundidade_cm;
    const pil = (pilarRect ? overlap(a, pilarRect) : false) || pilaresEst.some((r) => overlap(a, r));
    const parede = paredesRect.some((r) => overlap(a, r));
    const mob = infraRects.some((r) => overlap(a, r));
    const outro = itens.some((b) => b.id !== a.id && overlap(a, aabbItem(b)));
    const corr = corredor ? a.x_cm < corredor.x + corredor.w && a.x_cm + a.w_cm > corredor.x : false;
    // Área de uso invadida por OUTRO equipamento (aviso amarelo, não bloqueio).
    const uso = !fora && !pil && !outro && itens.some((b) => b.id !== a.id && overlapR(usoRect(a), usoRect(b)));
    res[a.id] = fora || pil || parede || mob || outro ? "colisao"
      : noGiro.has(a.id) ? "giro"
      : corr ? "corredor" : uso ? "uso" : null;
  }
  return res;
}

// Tolerante a dados antigos: item sem cenário válido conta como "balanceado".
export function totalCenario(itens: ItemPosicionado[], tier: Cenario): number {
  const tierOrd = (CENARIOS[tier] ?? CENARIOS.balanceado).ordem;
  return (itens ?? []).reduce((s, i) => {
    const c = CENARIOS[i.cenario] ?? CENARIOS.balanceado;
    return c.ordem <= tierOrd ? s + (i.preco || 0) : s;
  }, 0);
}

/** Item com prioridade calculada (impacto+valor_percebido+necessidade), ordenado desc.
 *  Só entram itens com pelo menos um dos três campos preenchidos. */
export function matrizDaCena(cena: Cena): (ItemPosicionado & { prio: number })[] {
  return (cena.itens ?? [])
    .filter((i) => i.impacto || i.valor_percebido || i.necessidade)
    .map((i) => ({ ...i, prio: (i.impacto || 0) + (i.valor_percebido || 0) + (i.necessidade || 0) }))
    .sort((a, b) => b.prio - a.prio);
}

export function resumo(cena: Cena, espaco: AnaliseEspaco = analisarEspaco(cena)) {
  const sala = cena.sala;
  const itens = cena.itens ?? [];
  const problemas = problemasDaCena(cena, espaco);
  const nCol = Object.values(problemas).filter((v) => v === "colisao").length;
  const nCor = Object.values(problemas).filter((v) => v === "corredor").length;
  const nUso = Object.values(problemas).filter((v) => v === "uso").length;
  const nGiro = Object.values(problemas).filter((v) => v === "giro").length;
  // Ocupação vem de `analiseEspaco`, a mesma conta que alimenta o painel e o
  // Dossiê. Antes eram três fórmulas diferentes com o mesmo nome: aqui era
  // Σ(w×h) sobre o retângulo da sala — que conta sobreposição duas vezes e
  // ignora pilar e mobiliário —, e o PDF refazia à mão de outro jeito.
  const ocup = espaco.ocupacaoFuncional.valor;
  const subtotal = itens.reduce((s, i) => s + (i.preco || 0), 0);
  return {
    problemas, nCol, nCor, nUso, nGiro,
    ocupacao: Math.round(ocup),
    subtotal,
    cenarios: {
      essencial: totalCenario(itens, "essencial"),
      balanceado: totalCenario(itens, "balanceado"),
      premium: totalCenario(itens, "premium"),
    },
  };
}
