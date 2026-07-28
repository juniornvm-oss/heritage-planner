import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { erro: Error | null }

// Evita "tela totalmente preta": se algum render estourar, mostra uma saída
// amigável em vez de derrubar o app inteiro.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error) {
    // eslint-disable-next-line no-console
    console.error("Erro de render capturado pelo ErrorBoundary:", erro);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div style={{
        position: "fixed", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16, padding: 24,
        background: "var(--bg, #0C0C0E)", textAlign: "center",
      }}>
        <div className="brandface" style={{ fontSize: 26, color: "var(--gold, #C9A227)" }}>Algo saiu do trilho</div>
        <p style={{ color: "var(--muted, #9A9AA0)", fontSize: 14, maxWidth: 460, lineHeight: 1.6 }}>
          Encontramos um erro ao abrir esta tela. Seus dados estão salvos — volte ao início e tente de novo.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-gold" onClick={() => { this.setState({ erro: null }); location.assign("/"); }}>Voltar ao início</button>
          <button className="btn" onClick={() => location.reload()}>Recarregar</button>
        </div>
        <pre style={{ color: "#6e6e73", fontSize: 11, maxWidth: 520, overflow: "auto", whiteSpace: "pre-wrap" }}>{String(this.state.erro?.message || this.state.erro)}</pre>
      </div>
    );
  }
}
