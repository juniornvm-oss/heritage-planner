// Pré-visualização elástica das ferramentas de desenho.
//
// Era a maior lacuna de intuitividade do editor, e nem é animação: entre o 1º
// e o 2º toque de TODAS as ferramentas de dois pontos (parede, pilar, região,
// cota, calibração, recorte, Vista IA) o consultor via um círculo e uma frase,
// e dava o segundo toque às cegas — sem saber que retângulo estava formando,
// que comprimento tinha a parede, nem que a linha ia ser ortogonalizada.
//
// PERFORMANCE: este componente mantém estado PRÓPRIO e lê a posição do
// ponteiro de um ref por requestAnimationFrame. Se o `EditorCanvas` guardasse
// o ponteiro em `useState`, cada movimento do dedo re-renderizaria todos os
// nós da cena — incluindo os milhares de traços de uma planta vetorial.

import { useEffect, useRef, useState } from "react";
import { Circle, Group, Line, Rect, Text } from "react-konva";
import type { Ponto } from "../lib/geometria";
import { areaPoligonoM2, m2 } from "../lib/geometria";
import { formatLength } from "../lib/units";
import { CANVAS } from "../ui/tokens";

/** Forma que a ferramenta ativa está desenhando. */
export type FormaPreview =
  | "retangulo"   // região, área, pilar, recorte — 2 cantos
  | "linha"       // parede, cota, calibração, alinhamento, Vista IA — 2 pontos
  | "poligono"    // vários toques, fecha no primeiro
  | null;

export interface PreviewProps {
  forma: FormaPreview;
  /** Pontos já confirmados pelo toque. */
  ancoras: Ponto[];
  /** Posição do ponteiro em coordenadas de MUNDO (cm), atualizada por ref. */
  ponteiroRef: React.MutableRefObject<Ponto | null>;
  zoom: number;
  cor?: string;
  /** A ferramenta endireita linhas quase retas? Mostramos isso ANTES de acontecer. */
  ortogonaliza?: boolean;
  /** Raio de fechamento do polígono, em cm. */
  raioFechar?: number;
}

/** Ângulo em graus, 0 = leste, sentido horário na tela. */
const anguloDe = (a: Ponto, b: Ponto) => {
  const g = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return ((g % 360) + 360) % 360;
};

/** Ângulo "notável" — o consultor está mirando um reto e o snap vai ajudar. */
const notavel = (g: number) => [0, 45, 90, 135, 180, 225, 270, 315].some((k) => Math.abs(((g - k + 540) % 360) - 180) > 178);

export default function PreviewFX({ forma, ancoras, ponteiroRef, zoom, cor = CANVAS.selecao, ortogonaliza, raioFechar }: PreviewProps) {
  const [p, setP] = useState<Ponto | null>(null);
  const anterior = useRef<Ponto | null>(null);

  // Laço próprio de animação: só este componente re-renderiza, e só quando o
  // ponteiro andou o suficiente para mudar algo na tela (0,25 px).
  useEffect(() => {
    if (!forma || !ancoras.length) { setP(null); anterior.current = null; return; }
    let vivo = true;
    const tick = () => {
      if (!vivo) return;
      const atual = ponteiroRef.current;
      const ant = anterior.current;
      const mudou = !atual !== !ant
        || (atual && ant && (Math.abs(atual.x - ant.x) * zoom > 0.25 || Math.abs(atual.y - ant.y) * zoom > 0.25));
      if (mudou) {
        anterior.current = atual ? { ...atual } : null;
        setP(atual ? { ...atual } : null);
      }
      requestAnimationFrame(tick);
    };
    const h = requestAnimationFrame(tick);
    return () => { vivo = false; cancelAnimationFrame(h); };
  }, [forma, ancoras.length, ponteiroRef, zoom]);

  if (!forma || !p || !ancoras.length) return null;

  const traco = 1.6 / zoom;
  const fonte = 13 / zoom;
  const dash = [8 / zoom, 6 / zoom];
  const a = ancoras[ancoras.length - 1];

  /** Etiqueta legível sobre fundo escuro — a planta pode estar clara embaixo. */
  const etiqueta = (x: number, y: number, texto: string, corTexto = cor) => {
    const larg = (texto.length * 7.1 + 14) / zoom;
    return (
      <Group listening={false}>
        <Rect x={x} y={y - 15 / zoom} width={larg} height={19 / zoom} cornerRadius={4 / zoom}
          fill="#0C0C0E" opacity={0.82} stroke={corTexto} strokeWidth={0.8 / zoom} />
        <Text x={x + 7 / zoom} y={y - 11 / zoom} text={texto} fontSize={fonte} fontStyle="700" fill={corTexto} />
      </Group>
    );
  };

  if (forma === "retangulo") {
    const x = Math.min(a.x, p.x), y = Math.min(a.y, p.y);
    const larg = Math.abs(p.x - a.x), alt = Math.abs(p.y - a.y);
    return (
      <Group listening={false}>
        <Rect x={x} y={y} width={larg} height={alt} stroke={cor} strokeWidth={traco} dash={dash}
          fill={cor} opacity={0.1} />
        <Rect x={x} y={y} width={larg} height={alt} stroke={cor} strokeWidth={traco} dash={dash} />
        {etiqueta(p.x + 12 / zoom, p.y - 6 / zoom,
          `${formatLength(larg)} × ${formatLength(alt)}  ·  ${m2(areaPoligonoM2([{ x, y }, { x: x + larg, y }, { x: x + larg, y: y + alt }, { x, y: y + alt }]))}`)}
      </Group>
    );
  }

  if (forma === "linha") {
    const dx = Math.abs(p.x - a.x), dy = Math.abs(p.y - a.y);
    // Mostra o ponto FINAL que a ferramenta vai realmente usar, e não onde o
    // dedo está: se ela endireita linhas quase retas, o preview já endireita.
    let fim = p;
    let travado = false;
    if (ortogonaliza) {
      if (dy < dx * 0.2) { fim = { x: p.x, y: a.y }; travado = true; }
      else if (dx < dy * 0.2) { fim = { x: a.x, y: p.y }; travado = true; }
    }
    const comp = Math.hypot(fim.x - a.x, fim.y - a.y);
    const g = anguloDe(a, fim);
    const corAtiva = travado || notavel(g) ? CANVAS.ok : cor;
    return (
      <Group listening={false}>
        {/* Mira fina atravessando a sala: é o que faz um CAD parecer preciso. */}
        <Line points={[fim.x, fim.y - 4000, fim.x, fim.y + 4000]} stroke={corAtiva} strokeWidth={0.5 / zoom} opacity={0.25} />
        <Line points={[fim.x - 4000, fim.y, fim.x + 4000, fim.y]} stroke={corAtiva} strokeWidth={0.5 / zoom} opacity={0.25} />
        <Line points={[a.x, a.y, fim.x, fim.y]} stroke={corAtiva} strokeWidth={traco} dash={travado ? undefined : dash} />
        <Circle x={fim.x} y={fim.y} radius={5 / zoom} fill={corAtiva} />
        {etiqueta((a.x + fim.x) / 2 + 10 / zoom, (a.y + fim.y) / 2 - 6 / zoom,
          `${formatLength(comp)}  ·  ${Math.round(g)}°${travado ? " travado" : ""}`, corAtiva)}
      </Group>
    );
  }

  // Polígono: aresta pontilhada seguindo o dedo, e o ponto de fechamento
  // crescendo quando o cursor entra no raio — "vai fechar aqui".
  const p0 = ancoras[0];
  const perto = ancoras.length >= 3 && raioFechar != null && Math.hypot(p.x - p0.x, p.y - p0.y) < raioFechar;
  const provisorio = [...ancoras, p];
  return (
    <Group listening={false}>
      <Line points={provisorio.flatMap((q) => [q.x, q.y])} stroke={cor} strokeWidth={traco} dash={dash} />
      {ancoras.length >= 2 && (
        <Line points={[...provisorio.flatMap((q) => [q.x, q.y]), p0.x, p0.y]} closed
          fill={cor} opacity={0.09} />
      )}
      {perto && <Circle x={p0.x} y={p0.y} radius={15 / zoom} fill={CANVAS.ok} opacity={0.35} />}
      {ancoras.length >= 2 && etiqueta(p.x + 12 / zoom, p.y - 6 / zoom,
        perto ? "solte para fechar" : `${m2(areaPoligonoM2(provisorio))}  ·  ${ancoras.length + 1} cantos`,
        perto ? CANVAS.ok : cor)}
    </Group>
  );
}
