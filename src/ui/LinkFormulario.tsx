// Link público do formulário do síndico (/formulario) — copiar, abrir e enviar
// pelo WhatsApp. É a porta de entrada da caixa de Solicitações.
import { useState } from "react";
import type { ConfigConsultor } from "../lib/types";

/** URL absoluta do formulário público, no domínio em que o app está rodando. */
export const urlFormulario = () => new URL("/formulario", window.location.origin).toString();

/** Convite pronto para colar no WhatsApp/e-mail do síndico. */
export function conviteFormulario(url: string, c?: ConfigConsultor | null): string {
  const quem = [c?.consultor, c?.empresa].filter(Boolean).join(" · ");
  return [
    "Olá! Para montarmos o diagnóstico da academia do condomínio, preencha este formulário:",
    url,
    "São 3 blocos (condomínio, espaço e objetivo), leva uns 5 minutos. Se puder, anexe a planta ou fotos do espaço.",
    quem && `— ${quem}`,
  ].filter(Boolean).join("\n\n");
}

export default function LinkFormulario({ config }: { config?: ConfigConsultor | null }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const url = urlFormulario();
  const convite = conviteFormulario(url, config);

  async function copiar(texto: string, rotulo: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(rotulo);
    } catch {
      setCopiado("erro");
    }
  }

  return (
    <section className="card" style={{ padding: 20, display: "grid", gap: 12 }}>
      <div>
        <div className="brandface" style={{ fontSize: 18, color: "var(--gold)" }}>Link do formulário do síndico</div>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
          Mande este link para o síndico. Ele preenche pelo celular, sem login, e a resposta
          cai direto em <b style={{ color: "#c9c9c4" }}>Solicitações</b> — com planta e fotos anexadas.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="fld"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          style={{ flex: "1 1 260px", minWidth: 0, color: "var(--gold)" }}
        />
        <button className="btn btn-primary" onClick={() => void copiar(url, "link")}>Copiar link</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="btn" href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          Abrir formulário
        </a>
        <button className="btn" onClick={() => void copiar(convite, "convite")}>Copiar convite pronto</button>
        <a
          className="btn"
          href={`https://wa.me/?text=${encodeURIComponent(convite)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none" }}
        >
          Enviar pelo WhatsApp
        </a>
      </div>

      {copiado === "erro"
        ? <div style={{ color: "#e88", fontSize: 13 }}>Não consegui copiar. Selecione o link acima e copie na mão.</div>
        : copiado
          ? <div style={{ color: "#7ec98f", fontSize: 13 }}>{copiado === "link" ? "Link copiado." : "Convite copiado — é só colar."}</div>
          : null}
    </section>
  );
}
