// Prancheta quadriculada do cadastro de equipamento.
//
// Segunda área, ao lado do upload de DWG/PDF/imagem: um retângulo na escala
// L×P cm, grade em centímetros, traço preso na caixa. Feita para a Apple
// Pencil no iPad — o Safari não rola a página no meio do gesto.
import { useMemo, useState } from "react";
import { ZONAS, type Zona } from "../lib/types";
import {
  caixaPrancheta, marcasGrade, passoGradeCm, passoMaiorCm,
} from "../lib/tracoLivre";
import { useTracoPonteiro } from "./useTracoPonteiro";

export interface PranchetaDesenhoProps {
  larguraCm: number;
  profundidadeCm: number;
  contorno: number[][];
  /** Acrescenta um traço já simplificado ao footprint. */
  onTraco: (pl: number[]) => void;
  onDesfazer: () => void;
  onLimpar: () => void;
  imagem?: string | null;
  zona?: Zona;
  maxW?: number;
  maxH?: number;
}

/** Grade 0..1 para qualquer SVG de footprint (prancheta e preview). */
export function GradeSvg({ larguraCm, profundidadeCm }: { larguraCm: number; profundidadeCm: number }) {
  const larg = larguraCm || 100, prof = profundidadeCm || 100;
  const passo = passoGradeCm(larg, prof);
  const maior = passoMaiorCm(passo, Math.max(larg, prof));
  const xs = marcasGrade(larg, passo);
  const ys = marcasGrade(prof, passo);
  return (
    <g pointerEvents="none">
      {xs.map((cm) => {
        const x = cm / larg;
        const grossa = cm % maior === 0 || cm === 0 || cm === larg;
        return (
          <line key={`x${cm}`} x1={x} y1={0} x2={x} y2={1}
            stroke={grossa ? "rgba(184,112,74,0.38)" : "rgba(255,255,255,0.07)"}
            strokeWidth={grossa ? 0.003 : 0.0015} />
        );
      })}
      {ys.map((cm) => {
        const y = cm / prof;
        const grossa = cm % maior === 0 || cm === 0 || cm === prof;
        return (
          <line key={`y${cm}`} x1={0} y1={y} x2={1} y2={y}
            stroke={grossa ? "rgba(184,112,74,0.38)" : "rgba(255,255,255,0.07)"}
            strokeWidth={grossa ? 0.003 : 0.0015} />
        );
      })}
    </g>
  );
}

const pts = (flat: number[]) => {
  let s = "";
  for (let i = 0; i < flat.length; i += 2) s += `${flat[i]},${flat[i + 1]} `;
  return s.trim();
};

export default function PranchetaDesenho({
  larguraCm, profundidadeCm, contorno, onTraco, onDesfazer, onLimpar,
  imagem, zona = "livre",
  maxW = 720, maxH = 420,
}: PranchetaDesenhoProps) {
  const [snap, setSnap] = useState(false);
  const [tracoVivo, setTracoVivo] = useState<number[]>([]);
  const larg = larguraCm || 100, prof = profundidadeCm || 100;
  const passo = passoGradeCm(larg, prof);
  const maior = passoMaiorCm(passo, Math.max(larg, prof));
  const { w, h } = caixaPrancheta(larg, prof, maxW, maxH);
  const cor = ZONAS[zona]?.cor ?? "#C9A227";
  const marcasX = useMemo(() => marcasGrade(larg, passo), [larg, passo]);
  const marcasY = useMemo(() => marcasGrade(prof, passo), [prof, passo]);

  const ponteiro = useTracoPonteiro({
    habilitado: true,
    larguraCm: larg, profundidadeCm: prof, snap, passoCm: passo,
    onVivo: setTracoVivo,
    onPronto: onTraco,
  });

  return (
    <div className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div>
        <div className="microlabel" style={{ color: "var(--gold)" }}>PRANCHETA — desenhe com a caneta</div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginTop: 4, maxWidth: 640 }}>
          O retângulo é o equipamento ({larg} × {prof} cm). A grade é de {passo} cm;
          o traço não sai da caixa. No iPad, use a <b style={{ color: "#e9e9e6" }}>Apple Pencil</b>
          — dedo e mouse também valem. Frente no topo, entrada na base.
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
        <div style={{ position: "relative", width: w, paddingBottom: 18, paddingRight: 28 }}>
          <div style={{
            position: "relative", width: w, height: h,
            border: "1px solid var(--gold)", borderRadius: 4, overflow: "hidden",
            background: "#121316", boxShadow: "inset 0 0 0 1px rgba(184,112,74,0.25)",
            touchAction: "none", WebkitUserSelect: "none", userSelect: "none",
          }}>
            {imagem && (
              <img src={imagem} alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", opacity: 0.32, pointerEvents: "none" }} />
            )}
            <svg
              className="prancheta"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              {...ponteiro}
              onContextMenu={(e) => e.preventDefault()}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "crosshair", touchAction: "none", display: "block" }}
            >
              <GradeSvg larguraCm={larg} profundidadeCm={prof} />
              {contorno.map((pl, i) => (
                <polyline key={i} points={pts(pl)} fill="none" stroke={cor} strokeWidth={0.008}
                  strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {tracoVivo.length >= 2 && (
                <polyline points={pts(tracoVivo)} fill="none" stroke="#5FC8E8" strokeWidth={0.008}
                  strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
            <div style={{
              position: "absolute", top: 6, left: 8, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", color: "rgba(95,200,232,0.85)", pointerEvents: "none",
            }}>FRENTE</div>
            <div style={{
              position: "absolute", bottom: 6, left: 8, fontSize: 10, fontWeight: 700,
              letterSpacing: "0.08em", color: "rgba(95,191,122,0.9)", pointerEvents: "none",
            }}>ENTRADA</div>
          </div>
          {marcasX.filter((cm) => cm % maior === 0 || cm === larg).map((cm) => (
            <span key={`lx${cm}`} style={{
              position: "absolute", left: (cm / larg) * w, top: h + 2,
              transform: "translateX(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none",
            }}>{cm}</span>
          ))}
          {marcasY.filter((cm) => cm % maior === 0 || cm === prof).map((cm) => (
            <span key={`ly${cm}`} style={{
              position: "absolute", top: (cm / prof) * h, left: w + 4,
              transform: "translateY(-50%)", fontSize: 10, color: "var(--muted)", pointerEvents: "none",
            }}>{cm}</span>
          ))}
        </div>

        <div style={{ display: "grid", gap: 8, alignContent: "start", minWidth: 180 }}>
          <button className="btn" onClick={() => setSnap((v) => !v)}
            style={snap ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}>
            {snap ? "⊞ Snap na grade" : "⊞ Snap (off)"}
          </button>
          <button className="btn" disabled={!contorno.length && !tracoVivo.length}
            onClick={() => { setTracoVivo([]); onDesfazer(); }}>
            ↶ último traço
          </button>
          <button className="btn" disabled={!contorno.length && !tracoVivo.length}
            onClick={() => { setTracoVivo([]); onLimpar(); }}>
            Limpar prancheta
          </button>
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>
            {contorno.length
              ? `${contorno.length} traço(s) no footprint — entram na planta neste tamanho.`
              : "Desenhe a silhueta vista de cima. Cada gesto vira um traço do contorno."}
          </div>
        </div>
      </div>
    </div>
  );
}
