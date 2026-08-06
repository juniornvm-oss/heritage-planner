/**
 * O canto de leitura da barra de status: onde está o ponteiro, em que escala e
 * com que encaixe.
 *
 * Existe pelo mesmo motivo que existe no CorelDraw: desenhar sem saber a
 * coordenada é desenhar no escuro. Aqui a falta era pior — a planta é medida
 * em centímetros reais, e não havia nenhum lugar na tela que dissesse em que
 * ponto do mundo o dedo estava.
 *
 * Lê tudo de um ref por requestAnimationFrame, como o `ArrasteFX`: é o único
 * componente que re-renderiza enquanto o dedo se move. Em estado do React,
 * cada movimento redesenharia o editor inteiro.
 */

import { useEffect, useRef, useState } from "react";
import type { EstadoPonteiro } from "./EditorCanvas";

export function PosicaoPonteiro({ estadoRef, snapPasso }: {
  estadoRef: React.MutableRefObject<EstadoPonteiro>;
  snapPasso: number;
}) {
  const [, forcar] = useState(0);
  const anterior = useRef("");
  useEffect(() => {
    let vivo = true;
    const tick = () => {
      if (!vivo) return;
      const e = estadoRef.current;
      // Assinatura barata: só re-renderiza quando o texto mudaria de verdade.
      const assin = `${Math.round(e.x)},${Math.round(e.y)},${Math.round(e.zoom * 100)},${e.dentro ? 1 : 0}`;
      if (assin !== anterior.current) { anterior.current = assin; forcar((n) => n + 1); }
      requestAnimationFrame(tick);
    };
    const h = requestAnimationFrame(tick);
    return () => { vivo = false; cancelAnimationFrame(h); };
  }, [estadoRef]);

  const e = estadoRef.current;
  return (
    <span className="statusbar">
      <span className="sb-item" title="Posição do ponteiro na planta, em centímetros do canto da sala">
        <b>x</b>{e.dentro ? Math.round(e.x) : "—"}
        <b>y</b>{e.dentro ? Math.round(e.y) : "—"}
      </span>
      <span className="sb-item" title="Escala de visualização (não é a escala de impressão)">
        <b>zoom</b>{Math.round(e.zoom * 100)}%
      </span>
      <span className="sb-item" title={snapPasso ? `Encaixe na grade de ${snapPasso} cm, mais ímã de parede, borda e centro` : "Sem grade: encaixa em parede, vértice, borda e centro dos vizinhos"}>
        <b>encaixe</b>{snapPasso ? `${snapPasso} cm` : "livre"}
      </span>
    </span>
  );
}
