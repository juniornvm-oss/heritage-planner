import { useEffect, useState, type ReactNode } from "react";

interface Viewport {
  portrait: boolean;
  phone: boolean; // menor dimensão pequena → provável celular
}

function read(): Viewport {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const menor = Math.min(w, h);
  return { portrait: h > w, phone: menor < 480 };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  return vp;
}

const Overlay = ({ titulo, texto, icone }: { titulo: string; texto: string; icone: string }) => (
  <div style={{
    position: "fixed", inset: 0, background: "#0A0A0B", color: "#E9E9E6",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 14, padding: "calc(32px + var(--sat)) calc(32px + var(--sar)) calc(32px + var(--sab)) calc(32px + var(--sal))",
    textAlign: "center", zIndex: 1000,
  }}>
    <div style={{ fontSize: 64 }}>{icone}</div>
    <div className="brandface" style={{ fontSize: 30, color: "#C9A227" }}>{titulo}</div>
    <div style={{ fontSize: 15, color: "#B9B9B4", maxWidth: 420 }}>{texto}</div>
  </div>
);

/**
 * iPad em paisagem = app completo.
 * iPad/tablet em retrato = "gire o dispositivo".
 * Celular = por enquanto só uma mensagem (import/export chega na fase 2).
 */
export default function OrientationGuard({ children }: { children: ReactNode }) {
  const { portrait, phone } = useViewport();

  if (phone) {
    return (
      <Overlay
        icone="📱"
        titulo="Abra no iPad"
        texto="O editor de projetos foi desenhado para iPad na horizontal. No celular, em breve, você poderá importar e exportar documentos."
      />
    );
  }
  if (portrait) {
    return (
      <Overlay
        icone="🔄"
        titulo="Gire o iPad"
        texto="Use o iPad na horizontal (paisagem) para trabalhar no projeto."
      />
    );
  }
  return <>{children}</>;
}
