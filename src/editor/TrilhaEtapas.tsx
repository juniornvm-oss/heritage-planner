// A trilha de etapas do editor e o HUD do modo ativo.
//
// Substituem, respectivamente: sete `.btn` idênticos numa fila de quinze
// controles, e treze `<span>` de instrução encostados no canto superior
// direito da toolbar — longe do centro do canvas, que é para onde o olho e o
// dedo do consultor estão apontados enquanto ele desenha.

import { ETAPAS, sinalDaEtapa, type DefEtapa } from "./etapas";
import type { Etapa } from "./EditorCanvas";
import { useMarcaDeslizante } from "../ui/anim";
import type { Cena } from "../lib/types";

export function TrilhaEtapas({ etapa, cena, nColisoes, onIr }: {
  etapa: Etapa;
  cena: Cena;
  nColisoes: number;
  onIr: (e: Etapa) => void;
}) {
  const { trilhaRef, estilo } = useMarcaDeslizante(etapa);
  return (
    <div className="trilha" ref={trilhaRef} role="tablist" aria-label="Etapas do projeto">
      {ETAPAS.map((def, i) => (
        <BotaoEtapa key={def.id} def={def} n={i + 1} ativa={def.id === etapa}
          sinal={sinalDaEtapa(def.id, cena, nColisoes)} onIr={() => onIr(def.id)} />
      ))}
      {/* Um traço que desliza entre as abas em vez de piscar de um lugar para
          o outro: o olho segue o movimento e entende que trocou de contexto. */}
      <span className="trilha-marca" style={{ width: 1, ...estilo }} aria-hidden />
    </div>
  );
}

function BotaoEtapa({ def, n, ativa, sinal, onIr }: {
  def: DefEtapa; n: number; ativa: boolean;
  sinal: ReturnType<typeof sinalDaEtapa>;
  onIr: () => void;
}) {
  const corSinal = sinal.alerta ? "var(--warn)" : sinal.pronta ? "var(--green)" : "var(--text-4)";
  return (
    <button
      role="tab"
      aria-selected={ativa}
      data-etapa={def.id}
      title={def.ajuda}
      onClick={onIr}
      style={{
        display: "grid", gap: 1, textAlign: "left", padding: "6px 11px 8px",
        background: ativa ? "var(--gold-soft)" : "transparent",
        border: "1px solid " + (ativa ? "var(--gold)" : "transparent"),
        borderRadius: "10px 10px 4px 4px", cursor: "pointer", minWidth: 92,
        WebkitTapHighlightColor: "transparent",
        transition: "background var(--mo-fast), border-color var(--mo-fast)",
      }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", color: ativa ? "var(--gold)" : "var(--text-4)" }}>
          {String(n).padStart(2, "0")}
        </span>
        <span style={{ font: "700 13px 'DM Sans'", color: ativa ? "var(--gold)" : "var(--text-2)" }}>{def.titulo}</span>
      </span>
      {/* Segunda linha: o que a etapa entrega, ou o que já existe na cena.
          É a diferença entre uma aba e uma etapa de método. */}
      <span style={{ fontSize: 10, color: corSinal, lineHeight: 1.3, whiteSpace: "nowrap" }}>
        {sinal.texto || def.entrega}
      </span>
    </button>
  );
}

// ── HUD do modo ativo ──────────────────────────────────────────────────────

export interface ModoAtivo {
  /** Rótulo do modo ("Calibrar escala"). */
  nome: string;
  /** O que fazer agora ("toque o 2º ponto de medida conhecida"). */
  instrucao: string;
  /** Cor do modo — a mesma do botão que o ligou. */
  cor: string;
  /** Passo atual de uma ferramenta de dois toques. */
  passo?: string;
  /** Leitura ao vivo (comprimento, área) enquanto o modo está ligado. */
  valor?: string;
}

export function ModoHUD({ modo, onCancelar }: { modo: ModoAtivo; onCancelar: () => void }) {
  return (
    <div className="modo-hud" style={{ borderColor: modo.cor }} role="status" aria-live="polite">
      <span style={{ width: 8, height: 8, borderRadius: 999, background: modo.cor, flexShrink: 0 }} />
      <span style={{ color: modo.cor, fontWeight: 700 }}>{modo.nome}</span>
      {modo.passo && <span className="passo">{modo.passo}</span>}
      <span style={{ color: "var(--text-3)", fontWeight: 500 }}>{modo.instrucao}</span>
      {modo.valor && (
        <span style={{ font: "700 12.5px 'DM Sans'", color: "var(--text)", background: "rgba(255,255,255,.07)", padding: "3px 8px", borderRadius: 7 }}>
          {modo.valor}
        </span>
      )}
      <button className="btn btn--xs" onClick={onCancelar} title="Cancelar (Esc)" style={{ marginLeft: 2 }}>
        Esc
      </button>
    </div>
  );
}
