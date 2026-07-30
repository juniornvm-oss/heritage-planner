// Lâmina do Arquiteto — cotas automáticas da planta: distâncias de cada
// equipamento até o vizinho mais próximo e até as paredes, nos eixos X e Y.
// Função pura sobre a cena (testável sem DOM).

import type { Cena, ItemPosicionado } from "./types";

export interface CotaAuto {
  x1: number; y1: number; x2: number; y2: number; // segmento em cm (mundo)
  valor: number; // cm
}

interface Caixa { x0: number; y0: number; x1: number; y1: number; parede: boolean }

/** AABB do item considerando rotação (mesma aproximação da validação). */
function aabb(a: ItemPosicionado): Caixa {
  const th = ((a.rotacao || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  const w = a.w_cm * c + a.h_cm * s, h = a.w_cm * s + a.h_cm * c;
  const cx = a.x_cm + a.w_cm / 2, cy = a.y_cm + a.h_cm / 2;
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, parede: false };
}

const LIMITE_CM = 600; // não cota vãos maiores que 6 m (não são "circulação entre partes")

/**
 * Gera as cotas de afastamento: para cada equipamento, a distância até o
 * obstáculo mais próximo à ESQUERDA e ACIMA (evita duplicar a mesma folga nos
 * dois sentidos) e, quando o vizinho de baixo/direita é uma PAREDE, também
 * essas. Obstáculos: outros equipamentos, mobiliário, pilares, paredes
 * ortogonais e os limites da sala.
 */
export function gerarCotasAutomaticas(cena: Cena): CotaAuto[] {
  const sala = cena.sala;
  const itens = cena.itens ?? [];
  const caixas: Caixa[] = itens.map(aabb);

  const obstaculos: Caixa[] = [...caixas];
  for (const i of cena.infra ?? []) obstaculos.push({ x0: i.x_cm, y0: i.y_cm, x1: i.x_cm + i.w_cm, y1: i.y_cm + i.h_cm, parede: false });
  for (const p of cena.estrutura?.pilares ?? []) obstaculos.push({ x0: p.x_cm, y0: p.y_cm, x1: p.x_cm + p.w_cm, y1: p.y_cm + p.h_cm, parede: false });
  for (const w of cena.estrutura?.paredes ?? []) {
    if (Math.abs(w.x1 - w.x2) > 0.5 && Math.abs(w.y1 - w.y2) > 0.5) continue; // só ortogonais
    const e = Math.max(w.espessura_cm, 4) / 2;
    obstaculos.push({ x0: Math.min(w.x1, w.x2) - e, y0: Math.min(w.y1, w.y2) - e, x1: Math.max(w.x1, w.x2) + e, y1: Math.max(w.y1, w.y2) + e, parede: true });
  }
  // limites da sala como "paredes" (caso não haja estrutura desenhada)
  const G = 100000;
  obstaculos.push({ x0: -G, y0: -G, x1: 0, y1: G, parede: true }); // esquerda
  obstaculos.push({ x0: sala.largura_cm, y0: -G, x1: G, y1: G, parede: true }); // direita
  obstaculos.push({ x0: -G, y0: -G, x1: G, y1: 0, parede: true }); // topo
  obstaculos.push({ x0: -G, y0: sala.profundidade_cm, x1: G, y1: G, parede: true }); // base

  const cotas: CotaAuto[] = [];
  const vistas = new Set<string>(); // dedup por posição arredondada

  const põe = (x1: number, y1: number, x2: number, y2: number) => {
    const valor = Math.hypot(x2 - x1, y2 - y1);
    if (valor < 2 || valor > LIMITE_CM) return;
    const chave = [x1, y1, x2, y2].map((v) => Math.round(v / 4)).sort().join(",");
    if (vistas.has(chave)) return;
    vistas.add(chave);
    cotas.push({ x1, y1, x2, y2, valor });
  };

  caixas.forEach((c, idx) => {
    const overlapY = (o: Caixa) => Math.min(c.y1, o.y1) - Math.max(c.y0, o.y0);
    const overlapX = (o: Caixa) => Math.min(c.x1, o.x1) - Math.max(c.x0, o.x0);

    // vizinho mais próximo em cada direção (com sobreposição no eixo perpendicular)
    let esq: Caixa | null = null, dir: Caixa | null = null, cima: Caixa | null = null, baixo: Caixa | null = null;
    obstaculos.forEach((o, j) => {
      if (o === caixas[idx]) return;
      if (j < caixas.length && j === idx) return;
      if (overlapY(o) > 8) {
        if (o.x1 <= c.x0 + 0.5 && (!esq || o.x1 > esq.x1)) esq = o;
        if (o.x0 >= c.x1 - 0.5 && (!dir || o.x0 < dir.x0)) dir = o;
      }
      if (overlapX(o) > 8) {
        if (o.y1 <= c.y0 + 0.5 && (!cima || o.y1 > cima.y1)) cima = o;
        if (o.y0 >= c.y1 - 0.5 && (!baixo || o.y0 < baixo.y0)) baixo = o;
      }
    });

    if (esq) {
      const o = esq as Caixa;
      const ym = (Math.max(c.y0, o.y0) + Math.min(c.y1, o.y1)) / 2;
      põe(o.x1, ym, c.x0, ym);
    }
    if (cima) {
      const o = cima as Caixa;
      const xm = (Math.max(c.x0, o.x0) + Math.min(c.x1, o.x1)) / 2;
      põe(xm, o.y1, xm, c.y0);
    }
    // direita/baixo: só quando o vizinho é parede (senão a folga já sai do item vizinho)
    if (dir && (dir as Caixa).parede) {
      const o = dir as Caixa;
      const ym = (Math.max(c.y0, o.y0) + Math.min(c.y1, o.y1)) / 2;
      põe(c.x1, ym, o.x0, ym);
    }
    if (baixo && (baixo as Caixa).parede) {
      const o = baixo as Caixa;
      const xm = (Math.max(c.x0, o.x0) + Math.min(c.x1, o.x1)) / 2;
      põe(xm, c.y1, xm, o.y0);
    }
  });

  return cotas;
}
