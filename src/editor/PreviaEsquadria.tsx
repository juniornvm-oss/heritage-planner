/**
 * Prévias de esquadria — o desenho que responde "o que eu vou ganhar se
 * escolher esta variante?" antes de o consultor tocar no canvas.
 *
 * São duas, e as duas são SVG puro (sem Konva): o flyout da caixa de
 * ferramentas precisa delas dentro de um botão do DOM, e o inspetor precisa
 * delas ao lado de um campo de texto.
 *
 *  · `SimboloPlanta`   — o símbolo EM PLANTA, gerado por `simboloAbertura`,
 *    a mesmíssima função que o canvas usa. Ícone e desenho final não podem
 *    divergir: se o botão mostra um arco e a planta desenha outro, o botão
 *    está mentindo.
 *  · `ElevacaoEsquadria` — a ELEVAÇÃO, que é onde mora tudo que o corte
 *    horizontal não mostra: a forma do vão (arco, óculo, oitão), a divisão
 *    das folhas, o peitoril e a altura. É por isso que "janela de diversas
 *    formas" é uma escolha com consequência e não um rótulo.
 */

import { useMemo } from "react";
import type { Abertura, Parede } from "../lib/types";
import {
  JANELAS, PORTAS, defJanela, defPorta, fichaAbertura, modeloDaAbertura, simboloAbertura,
  type FormaJanela, type LadoAbertura, type ModeloJanela, type ModeloPorta, type SentidoAbertura,
} from "../lib/esquadrias";

export interface EspecEsquadria {
  tipo: "porta" | "janela";
  modelo?: ModeloPorta | ModeloJanela;
  largura_cm?: number;
  altura_cm?: number;
  peitoril_cm?: number;
  forma?: FormaJanela;
  lado?: LadoAbertura;
  sentido?: SentidoAbertura;
}

/** Abertura sintética a partir de uma especificação parcial (para as prévias). */
function aberturaDemo(e: EspecEsquadria): Abertura {
  const largura = e.largura_cm
    ?? (e.tipo === "porta" ? defPorta(modeloOu(e)).vao_cm : defJanela(modeloOu(e)).vao_cm);
  return {
    // Centro em ¾ do comprimento sintético (L = 1,5 × vão): é o que deixa um
    // toco de parede IGUAL dos dois lados do símbolo. Centrar em `largura`
    // encostava o vão na ponta direita e o ícone saía torto.
    id: "demo", paredeId: "demo", centro_cm: largura * 0.75, largura_cm: largura,
    tipo: e.tipo, modelo: e.modelo, lado: e.lado, sentido: e.sentido,
    forma: e.forma, altura_cm: e.altura_cm, peitoril_cm: e.peitoril_cm,
  };
}
const modeloOu = (e: EspecEsquadria): ModeloPorta | ModeloJanela =>
  e.modelo ?? (e.tipo === "porta" ? "giro" : "correr");

// ─────────────────────────────────────────────────────────────────────────
// SÍMBOLO EM PLANTA
// ─────────────────────────────────────────────────────────────────────────

export function SimboloPlanta({ esp, tamanho = 34, cor = "currentColor" }: {
  esp: EspecEsquadria;
  tamanho?: number;
  cor?: string;
}) {
  const d = useMemo(() => {
    const ab = aberturaDemo(esp);
    // Tocos de parede curtos (¼ do vão de cada lado): o suficiente para ler
    // "isto está numa parede" sem espremer o símbolo num traço.
    const L = ab.largura_cm * 1.5;
    // Parede horizontal com a abertura no meio; o centro da "sala" fica
    // abaixo, então "dentro" é para baixo — como na tela.
    const w: Parede = { id: "demo", x1: 0, y1: 0, x2: L, y2: 0, espessura_cm: 14 };
    const s = simboloAbertura(ab, w, { x: L / 2, y: L });
    const trechos = [...s.cheias, ...s.finas, ...s.tracejadas, ...s.setas];
    const xs = [0, L], ys = [-8, 8];
    for (const t of trechos) for (let i = 0; i < t.length; i += 2) { xs.push(t[i]); ys.push(t[i + 1]); }
    let x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    // Janela em planta é um traço de 120 × 16 cm: num quadro quadrado ela
    // encolhe até virar um fio. Limitar a proporção a 2,2:1 dá altura ao
    // desenho e deixa o símbolo legível em 30 px.
    const RAZAO = 2.2;
    let lw = x1 - x0, lh = y1 - y0;
    if (lw / Math.max(lh, 0.001) > RAZAO) { const alvo = lw / RAZAO; const f = (alvo - lh) / 2; y0 -= f; y1 += f; lh = alvo; }
    else if (lh / Math.max(lw, 0.001) > RAZAO) { const alvo = lh / RAZAO; const f = (alvo - lw) / 2; x0 -= f; x1 += f; lw = alvo; }
    const pad = Math.max(lw, lh) * 0.05;
    return {
      s, L,
      view: `${x0 - pad} ${y0 - pad} ${lw + pad * 2} ${lh + pad * 2}`,
      largura: lw + pad * 2, altura: lh + pad * 2,
      escala: Math.max(lw, lh) / 100, // traços proporcionais ao enquadramento
    };
  }, [esp]);

  const linha = (pts: number[]) => pts.join(",");
  const eixo = d.escala * 1.5; // o mini-símbolo pede traço mais gordo que a planta

  return (
    <svg width={tamanho} height={tamanho * (d.altura / d.largura)} viewBox={d.view} aria-hidden focusable="false"
      style={{ display: "block", overflow: "visible" }}>
      {/* tocos de parede dos dois lados do vão */}
      <line x1={0} y1={0} x2={d.s.vao[0].x} y2={0} stroke={cor} strokeWidth={7 * eixo} opacity={0.35} strokeLinecap="butt" />
      <line x1={d.s.vao[1].x} y1={0} x2={d.L} y2={0} stroke={cor} strokeWidth={7 * eixo} opacity={0.35} strokeLinecap="butt" />
      {d.s.finas.map((p, i) => <polyline key={`f${i}`} points={linha(p)} fill="none" stroke={cor} strokeWidth={1.1 * eixo} opacity={0.75} />)}
      {d.s.tracejadas.map((p, i) => (
        <polyline key={`t${i}`} points={linha(p)} fill="none" stroke={cor} strokeWidth={1 * eixo}
          strokeDasharray={`${3 * eixo},${2.6 * eixo}`} opacity={0.6} />
      ))}
      {d.s.setas.map((p, i) => <polyline key={`s${i}`} points={linha(p)} fill="none" stroke={cor} strokeWidth={1.3 * eixo} opacity={0.9} />)}
      {d.s.cheias.map((p, i) => <polyline key={`c${i}`} points={linha(p)} fill="none" stroke={cor} strokeWidth={3.2 * eixo} strokeLinecap="round" strokeLinejoin="round" />)}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ELEVAÇÃO
// ─────────────────────────────────────────────────────────────────────────

/** Contorno do vão em elevação, conforme a forma. Devolve um `path` SVG. */
function contornoVao(forma: FormaJanela, w: number, h: number): string {
  const R = w / 2;
  switch (forma) {
    case "arco_pleno": {
      // Meia-circunferência sobre a verga; a altura total inclui a flecha.
      const reto = Math.max(0, h - R);
      return `M0,${h} L0,${reto} A${R},${R} 0 0 1 ${w},${reto} L${w},${h} Z`;
    }
    case "arco_abatido": {
      const f = Math.min(h * 0.3, w * 0.18); // flecha rebaixada
      const reto = Math.max(0, h - f);
      const raio = (f * f + R * R) / (2 * f || 1);
      return `M0,${h} L0,${reto} A${raio},${raio} 0 0 1 ${w},${reto} L${w},${h} Z`;
    }
    case "circular": {
      const r = Math.min(w, h) / 2;
      return `M${w / 2 - r},${h / 2} a${r},${r} 0 1 0 ${r * 2},0 a${r},${r} 0 1 0 ${-r * 2},0 Z`;
    }
    case "triangular":
      return `M0,${h} L${w / 2},0 L${w},${h} Z`;
    default:
      return `M0,0 L${w},0 L${w},${h} L0,${h} Z`;
  }
}

/**
 * Convenção de elevação: o vértice do triângulo tracejado marca o EIXO das
 * dobradiças. Vértice na lateral = folha de abrir; no topo = maxim-ar; na
 * base = basculante. Seta = folha que corre.
 */
function marcasDeAbertura(esp: EspecEsquadria, w: number, h: number): {
  tracejados: string[]; setas: string[]; ripas: string[]; grade: string[];
} {
  const tracejados: string[] = [], setas: string[] = [], ripas: string[] = [], grade: string[] = [];
  const m = modeloOu(esp);
  const vAbrir = (x0: number, x1: number, vertice: "esq" | "dir") => {
    const vx = vertice === "esq" ? x0 : x1, lx = vertice === "esq" ? x1 : x0;
    tracejados.push(`M${lx},0 L${vx},${h / 2} L${lx},${h}`);
  };
  const seta = (x0: number, x1: number, y: number) => {
    const dir = Math.sign(x1 - x0) || 1, p = Math.abs(x1 - x0) * 0.16;
    setas.push(`M${x0},${y} L${x1},${y} M${x1},${y} l${-dir * p},${-p} M${x1},${y} l${-dir * p},${p}`);
  };

  if (esp.tipo === "porta") {
    const naEsq = (esp.lado ?? "direita") === "esquerda";
    switch (m as ModeloPorta) {
      case "giro": vAbrir(0, w, naEsq ? "esq" : "dir"); break;
      case "vaivem":
        vAbrir(0, w, naEsq ? "esq" : "dir");
        setas.push(`M${w * 0.3},${h * 0.5} L${w * 0.7},${h * 0.5}`);
        break;
      case "dupla":
        tracejados.push(`M${w / 2},0 L0,${h / 2} L${w / 2},${h}`, `M${w / 2},0 L${w},${h / 2} L${w / 2},${h}`);
        ripas.push(`M${w / 2},0 L${w / 2},${h}`);
        break;
      case "correr":
        ripas.push(`M${w / 2},0 L${w / 2},${h}`);
        seta(w * 0.3, naEsq ? w * 0.05 : w * 0.95, h * 0.5);
        break;
      case "correr_dupla":
        ripas.push(`M${w / 2},0 L${w / 2},${h}`);
        seta(w * 0.45, w * 0.05, h * 0.5);
        seta(w * 0.55, w * 0.95, h * 0.5);
        break;
      case "sanfonada":
        for (let i = 1; i < 5; i++) ripas.push(`M${(w * i) / 5},0 L${(w * i) / 5},${h}`);
        seta(w * 0.6, naEsq ? w * 0.05 : w * 0.95, h * 0.5);
        break;
      case "pivotante":
        ripas.push(`M${w * 0.2},0 L${w * 0.2},${h}`);
        tracejados.push(`M${w},0 L${w * 0.2},${h / 2} L${w},${h}`);
        break;
      case "vao": break;
    }
    return { tracejados, setas, ripas, grade };
  }

  switch (m as ModeloJanela) {
    case "correr":
    case "correr_4": {
      const n = m === "correr" ? 2 : 4;
      for (let i = 1; i < n; i++) ripas.push(`M${(w * i) / n},0 L${(w * i) / n},${h}`);
      seta(w * (0.5 / n + 0.02), w * 0.02, h * 0.5);
      break;
    }
    case "folhas":
      ripas.push(`M${w / 2},0 L${w / 2},${h}`);
      vAbrir(0, w / 2, "esq");
      vAbrir(w / 2, w, "dir");
      break;
    case "basculante": {
      const n = 3;
      for (let i = 1; i < n; i++) ripas.push(`M0,${(h * i) / n} L${w},${(h * i) / n}`);
      tracejados.push(`M0,0 L${w / 2},${h} L${w},0`); // vértice embaixo = eixo inferior
      break;
    }
    case "maxim_ar":
      tracejados.push(`M0,${h} L${w / 2},0 L${w},${h}`); // vértice em cima
      break;
    case "guilhotina":
      ripas.push(`M0,${h / 2} L${w},${h / 2}`);
      setas.push(`M${w / 2},${h * 0.75} L${w / 2},${h * 0.3} M${w / 2},${h * 0.3} l${-w * 0.06},${h * 0.09} M${w / 2},${h * 0.3} l${w * 0.06},${h * 0.09}`);
      break;
    case "pivotante":
      ripas.push(`M${w / 2},0 L${w / 2},${h}`);
      tracejados.push(`M0,0 L${w / 2},${h / 2} L0,${h}`, `M${w},0 L${w / 2},${h / 2} L${w},${h}`);
      break;
    case "veneziana": {
      const n = Math.max(4, Math.round(h / 12));
      for (let i = 1; i < n; i++) ripas.push(`M0,${(h * i) / n} L${w},${(h * i) / n}`);
      break;
    }
    case "cobogo": {
      const passo = Math.max(w, h) / 5;
      for (let x = passo; x < w - 0.01; x += passo) grade.push(`M${x},0 L${x},${h}`);
      for (let y = passo; y < h - 0.01; y += passo) grade.push(`M0,${y} L${w},${y}`);
      break;
    }
    case "fixa": break;
  }
  return { tracejados, setas, ripas, grade };
}

/**
 * A esquadria vista de frente, com piso, peitoril e cotas.
 * `compacta` corta as cotas — é a versão que cabe num botão de flyout.
 */
export function ElevacaoEsquadria({ esp, altura = 96, compacta, cor = "currentColor" }: {
  esp: EspecEsquadria;
  /** Altura do SVG em px. A largura sai da proporção real do vão. */
  altura?: number;
  compacta?: boolean;
  cor?: string;
}) {
  const ab = aberturaDemo(esp);
  const f = fichaAbertura(ab);
  const w = f.largura_cm, h = f.altura_cm;
  const peitoril = esp.tipo === "porta" ? 0 : f.peitoril_cm ?? 0;
  const forma: FormaJanela = esp.tipo === "porta" ? "retangular" : f.forma;
  const marcas = marcasDeAbertura(esp, w, h);

  // Mundo do desenho: piso em y = peitoril + h, vão de y = 0 (verga) até h.
  const totalH = h + peitoril;
  const margemX = w * (compacta ? 0.08 : 0.34);
  const vbW = w + margemX * 2;
  const vbH = totalH * 1.1;
  const escala = vbH / 100;
  const px = altura / vbH;

  return (
    <svg height={altura} width={Math.max(18, vbW * px)} viewBox={`${-margemX} ${-totalH * 0.06} ${vbW} ${vbH}`}
      aria-hidden focusable="false" style={{ display: "block", overflow: "visible" }}>
      {/* piso */}
      <line x1={-margemX} y1={totalH} x2={w + margemX} y2={totalH} stroke={cor} strokeWidth={1.6 * escala} opacity={0.55} />
      {/* alvenaria sob o peitoril */}
      {peitoril > 0 && (
        <rect x={0} y={h} width={w} height={peitoril} fill={cor} opacity={0.07} />
      )}
      <g transform="translate(0,0)">
        <path d={contornoVao(forma, w, h)} fill={cor} fillOpacity={0.06} stroke={cor} strokeWidth={2.2 * escala} strokeLinejoin="round" />
        {marcas.grade.map((d, i) => <path key={`g${i}`} d={d} stroke={cor} strokeWidth={1 * escala} opacity={0.45} fill="none" />)}
        {marcas.ripas.map((d, i) => <path key={`r${i}`} d={d} stroke={cor} strokeWidth={1.4 * escala} opacity={0.8} fill="none" />)}
        {marcas.tracejados.map((d, i) => (
          <path key={`t${i}`} d={d} stroke={cor} strokeWidth={1.1 * escala} strokeDasharray={`${3.4 * escala},${2.6 * escala}`} opacity={0.65} fill="none" />
        ))}
        {marcas.setas.map((d, i) => <path key={`s${i}`} d={d} stroke={cor} strokeWidth={1.3 * escala} opacity={0.9} fill="none" strokeLinecap="round" />)}
      </g>
      {!compacta && (
        <g opacity={0.75} fontSize={7.5 * escala} fill={cor} fontWeight={600}>
          {/* cota da largura, sob o piso */}
          <text x={w / 2} y={totalH + 8.5 * escala} textAnchor="middle">{w} cm</text>
          {/* cota da altura, à esquerda */}
          <text x={-margemX * 0.5} y={h / 2} textAnchor="middle" transform={`rotate(-90 ${-margemX * 0.5} ${h / 2})`}>{h} cm</text>
          {peitoril > 0 && (
            <text x={w + margemX * 0.5} y={h + peitoril / 2} textAnchor="middle"
              transform={`rotate(-90 ${w + margemX * 0.5} ${h + peitoril / 2})`}>peitoril {peitoril}</text>
          )}
        </g>
      )}
    </svg>
  );
}

/** Rótulo curto da variante — o mesmo texto no flyout, no HUD e no inspetor. */
export function rotuloModelo(tipo: "porta" | "janela", modelo?: ModeloPorta | ModeloJanela): string {
  if (tipo === "porta") return (PORTAS[modelo as ModeloPorta] ?? PORTAS.giro).label;
  return (JANELAS[modelo as ModeloJanela] ?? JANELAS.correr).label;
}
