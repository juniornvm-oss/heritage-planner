// Movimento no lado DOM. Substitui o `AnimatePresence` da lib `motion` — que
// não é usada aqui: ela não anima nós Konva (onde a edição de layout
// acontece) e o app é PWA offline-first, que paga o peso no precache.
//
// Os valores numéricos vivem em `global.css` (tokens `--mo-*`) e em
// `tokens.ts` (`DUR`, para o Konva). Aqui só a mecânica de montar/desmontar.

import { useEffect, useRef, useState } from "react";
import { DUR, reduzMovimento } from "./tokens";

export type EstadoPresenca = "entrando" | "dentro" | "saindo";

/**
 * Mantém o elemento montado durante a animação de SAÍDA.
 *
 * ```tsx
 * const { render, estado } = usePresenca(!!aviso);
 * return render ? <div className={estado === "saindo" ? "mo-saindo" : "mo-pop"}>…</div> : null;
 * ```
 */
export function usePresenca(aberto: boolean, saidaMs = DUR.exit) {
  const [render, setRender] = useState(aberto);
  const [estado, setEstado] = useState<EstadoPresenca>(aberto ? "dentro" : "saindo");

  useEffect(() => {
    if (aberto) {
      setRender(true);
      setEstado("entrando");
      const r = requestAnimationFrame(() => setEstado("dentro"));
      return () => cancelAnimationFrame(r);
    }
    setEstado("saindo");
    const t = setTimeout(() => setRender(false), reduzMovimento() ? 0 : saidaMs);
    return () => clearTimeout(t);
  }, [aberto, saidaMs]);

  return { render, estado } as const;
}

/**
 * Posição do indicador deslizante da trilha de etapas.
 * Mede o botão ativo e devolve o `transform` — `translateX` + `scaleX`, as
 * duas propriedades que o compositor resolve sem relayout. Animar `left`/
 * `width` custaria um reflow por frame.
 */
export function useMarcaDeslizante(chaveAtiva: string) {
  const trilhaRef = useRef<HTMLDivElement>(null);
  const [estilo, setEstilo] = useState<{ transform: string; opacity: number }>({ transform: "scaleX(0)", opacity: 0 });

  useEffect(() => {
    const medir = () => {
      const trilha = trilhaRef.current;
      const alvo = trilha?.querySelector<HTMLElement>(`[data-etapa="${CSS.escape(chaveAtiva)}"]`);
      if (!trilha || !alvo) { setEstilo((e) => ({ ...e, opacity: 0 })); return; }
      const t = trilha.getBoundingClientRect(), a = alvo.getBoundingClientRect();
      // scaleX parte de uma base de 1px, então o fator é a própria largura.
      setEstilo({ transform: `translateX(${a.left - t.left}px) scaleX(${a.width})`, opacity: 1 });
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (trilhaRef.current) ro.observe(trilhaRef.current);
    window.addEventListener("resize", medir);
    return () => { ro.disconnect(); window.removeEventListener("resize", medir); };
  }, [chaveAtiva]);

  return { trilhaRef, estilo } as const;
}

/** Atraso escalonado de entrada de lista, com teto — 40 equipamentos não
 *  podem virar 1,1 s de espera. */
export const atrasoLista = (i: number): string =>
  `${Math.min(i * DUR.stagger, DUR.staggerMax)}ms`;
