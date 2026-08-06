/**
 * A CAIXA DE FERRAMENTAS — rail vertical à esquerda do canvas, com flyout de
 * variantes, no modelo do CorelDraw.
 *
 * Três coisas que a fila horizontal de quinze botões não fazia:
 *
 *  1. O botão CARREGA a variante escolhida. "Porta" não é um botão só: é
 *     "porta de correr de 100" enquanto for essa a escolha, e o ícone muda
 *     junto — o ícone é o símbolo de planta de verdade, gerado pela mesma
 *     função que desenha no canvas.
 *  2. O flyout abre por toque no triângulo do canto OU por pressão longa no
 *     próprio botão. No iPad não existe clique direito nem hover; a pressão
 *     longa é o gesto que sobra, e o triângulo é a pista visual de que ela
 *     existe.
 *  3. O rail é vertical. A faixa horizontal roubava duas linhas de altura do
 *     canvas quando quebrava — e altura é exatamente o que falta numa planta
 *     em paisagem no iPad.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DefFerramenta, GrupoFerramentas, IdFerramenta, Variante } from "./ferramentas";
import { SimboloPlanta } from "./PreviaEsquadria";

const DURACAO_PRESSAO = 420; // ms até o flyout abrir sozinho sob o dedo

export function CaixaFerramentas({ grupos, ativa, variantes, onFerramenta, onVariante }: {
  grupos: GrupoFerramentas[];
  /** Ferramenta ativa (modal). Ação de um toque só nunca fica ativa. */
  ativa: IdFerramenta | null;
  /** Variante escolhida por ferramenta: { parede: "drywall", porta: "correr" }. */
  variantes: Partial<Record<IdFerramenta, string>>;
  onFerramenta: (id: IdFerramenta) => void;
  onVariante: (id: IdFerramenta, varianteId: string) => void;
}) {
  const [aberto, setAberto] = useState<IdFerramenta | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Fechar o flyout: Esc, toque fora, ou troca de etapa (o rail remonta).
  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: PointerEvent) => {
      const alvo = ev.target as Element | null;
      // O flyout é renderizado em portal (ver `Flyout`), então não está dentro
      // do rail: sem o segundo teste, o toque na própria variante fecharia o
      // painel antes de o clique chegar.
      if (railRef.current?.contains(alvo as Node) || alvo?.closest?.(".cf-flyout")) return;
      setAberto(null);
    };
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") { ev.stopPropagation(); setAberto(null); } };
    document.addEventListener("pointerdown", fora, true);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", fora, true);
      document.removeEventListener("keydown", esc, true);
    };
  }, [aberto]);

  if (!grupos.length) return null;

  return (
    <div ref={railRef} className="caixaferr" role="toolbar" aria-orientation="vertical" aria-label="Ferramentas da etapa">
      {grupos.map((g, gi) => (
        <div key={g.titulo} className="cf-grupo">
          {gi > 0 && <span className="cf-sep" aria-hidden />}
          <span className="cf-titulo">{g.titulo}</span>
          {g.ferramentas.map((f) => (
            <BotaoFerramenta
              key={f.id}
              def={f}
              ativa={ativa === f.id}
              varianteId={variantes[f.id]}
              flyoutAberto={aberto === f.id}
              onAtivar={() => { setAberto(null); onFerramenta(f.id); }}
              onAbrirFlyout={() => setAberto((a) => (a === f.id ? null : f.id))}
              onEscolher={(v) => { setAberto(null); onVariante(f.id, v); }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function BotaoFerramenta({ def, ativa, varianteId, flyoutAberto, onAtivar, onAbrirFlyout, onEscolher }: {
  def: DefFerramenta;
  ativa: boolean;
  varianteId?: string;
  flyoutAberto: boolean;
  onAtivar: () => void;
  onAbrirFlyout: () => void;
  onEscolher: (varianteId: string) => void;
}) {
  const variante = def.variantes?.find((v) => v.id === varianteId) ?? def.variantes?.[0];
  const pressao = useRef<number | null>(null);
  const abriuPorPressao = useRef(false);

  // Pressão longa. `abriuPorPressao` impede que o clique que vem depois de
  // soltar o dedo ative a ferramenta por cima do flyout recém-aberto.
  const iniciarPressao = () => {
    if (!def.variantes?.length) return;
    abriuPorPressao.current = false;
    pressao.current = window.setTimeout(() => {
      abriuPorPressao.current = true;
      onAbrirFlyout();
    }, DURACAO_PRESSAO);
  };
  const cancelarPressao = () => {
    if (pressao.current) { clearTimeout(pressao.current); pressao.current = null; }
  };
  useEffect(() => () => { if (pressao.current) clearTimeout(pressao.current); }, []);

  const rotulo = variante && def.variantes ? `${def.label} · ${variante.label}` : def.label;
  const slotRef = useRef<HTMLDivElement>(null);

  return (
    <div className="cf-slot" ref={slotRef}>
      <button
        type="button"
        className={`cf-btn${def.perigo ? " cf-btn--perigo" : ""}`}
        aria-pressed={def.acao ? undefined : ativa}
        aria-label={rotulo}
        title={`${rotulo}${def.atalho ? ` (${def.atalho})` : ""}\n${def.dica}${def.variantes?.length ? "\nPressione para ver as opções." : ""}`}
        onPointerDown={iniciarPressao}
        onPointerUp={cancelarPressao}
        onPointerLeave={cancelarPressao}
        onPointerCancel={cancelarPressao}
        onContextMenu={(e) => { if (def.variantes?.length) { e.preventDefault(); onAbrirFlyout(); } }}
        onClick={() => { if (abriuPorPressao.current) { abriuPorPressao.current = false; return; } onAtivar(); }}
      >
        <span className="cf-glifo" aria-hidden>
          {variante?.esquadria
            ? <SimboloPlanta esp={{ tipo: variante.esquadria.tipo, modelo: variante.esquadria.modelo }} tamanho={22} />
            : (variante?.glifo ?? def.glifo)}
        </span>
        <span className="cf-label">{def.label}</span>
      </button>
      {!!def.variantes?.length && (
        <button
          type="button"
          className="cf-seta"
          aria-label={`Opções de ${def.label}`}
          aria-haspopup="true"
          aria-expanded={flyoutAberto}
          onClick={(e) => { e.stopPropagation(); onAbrirFlyout(); }}
        >
          <span aria-hidden>◢</span>
        </button>
      )}
      {flyoutAberto && def.variantes && (
        <Flyout ancora={slotRef} titulo={def.tituloVariantes ?? "Opções"} dica={def.dica}
          variantes={def.variantes} atual={variante?.id} onEscolher={onEscolher} />
      )}
    </div>
  );
}

/**
 * O painel de variantes, em PORTAL no `body`.
 *
 * Não pode ser filho do rail: `.caixaferr` rola na vertical, e no CSS um eixo
 * com `overflow` diferente de `visible` força o OUTRO eixo a recortar também.
 * Como filho, o painel simplesmente sumia atrás da borda do rail — abria,
 * funcionava e não aparecia. Em portal, ele se ancora nas coordenadas de tela
 * do botão e nunca é recortado por ninguém.
 */
function Flyout({ ancora, titulo, dica, variantes, atual, onEscolher }: {
  ancora: React.RefObject<HTMLElement>;
  titulo: string;
  dica: string;
  variantes: Variante[];
  atual?: string;
  onEscolher: (id: string) => void;
}) {
  const [pos, setPos] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      const alturaLivre = window.innerHeight - r.top - 12;
      const tetoNormal = Math.min(window.innerHeight * 0.7, alturaLivre);
      setPos(tetoNormal < 260
        // Botão perto do rodapé: o painel encosta embaixo em vez de espremer.
        ? { left: r.right + 6, bottom: 12, maxHeight: Math.min(window.innerHeight * 0.7, window.innerHeight - 24) }
        : { left: r.right + 6, top: Math.max(8, r.top - 4), maxHeight: tetoNormal });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [ancora]);

  if (!pos) return null;

  return createPortal(
    <div className="cf-flyout mo-pop" role="menu" aria-label={titulo} style={pos}>
      <div className="cf-flyout-topo">
        <span className="microlabel">{titulo}</span>
        <p className="cf-flyout-dica">{dica}</p>
      </div>
      <div className="cf-flyout-grade">
        {variantes.map((v) => (
          <button key={v.id} type="button" role="menuitemradio" aria-checked={v.id === atual}
            className={`cf-var${v.id === atual ? " cf-var--on" : ""}`}
            title={v.descricao}
            onClick={() => onEscolher(v.id)}>
            <span className="cf-var-icone" style={v.cor ? { color: v.cor } : undefined} aria-hidden>
              {v.esquadria
                ? <SimboloPlanta esp={{ tipo: v.esquadria.tipo, modelo: v.esquadria.modelo }} tamanho={30} />
                : v.glifo}
            </span>
            <span className="cf-var-texto">
              <b>{v.label}</b>
              {v.medida && <em>{v.medida}</em>}
              <small>{v.descricao}</small>
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
