// Caixa de entrada das solicitações do formulário do síndico (só logado).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { BRL } from "../lib/units";
import {
  listarSolicitacoes, converterSolicitacaoEmProjeto, atualizarStatusSolicitacao, online,
} from "../lib/supabase";
import type { Solicitacao } from "../lib/types";

const STATUS_ROTULO: Record<string, string> = { nova: "Nova", convertida: "Convertida", arquivada: "Arquivada" };
const STATUS_COR: Record<string, string> = { nova: "var(--gold)", convertida: "#7ec98f", arquivada: "var(--muted)" };

function dataBR(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function SolicitacoesScreen() {
  const nav = useNavigate();
  const [lista, setLista] = useState<Solicitacao[]>([]);
  const [sel, setSel] = useState<Solicitacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function recarregar() {
    setCarregando(true);
    try { setLista(await listarSolicitacoes()); }
    catch (e) { setErro((e as Error).message); }
    finally { setCarregando(false); }
  }
  useEffect(() => { if (online) void recarregar(); else setCarregando(false); }, []);

  async function converter(s: Solicitacao) {
    if (!confirm(`Converter "${s.condominio}" em um projeto editável?`)) return;
    setBusy(true); setErro(null);
    try { const p = await converterSolicitacaoEmProjeto(s); nav(`/projeto/${p.id}/leitura`); }
    catch (e) { setErro((e as Error).message); setBusy(false); }
  }
  async function arquivar(s: Solicitacao) {
    setBusy(true);
    try { await atualizarStatusSolicitacao(s.id!, "arquivada"); await recarregar(); setSel(null); }
    catch (e) { setErro((e as Error).message); }
    finally { setBusy(false); }
  }

  const novas = lista.filter((s) => s.status === "nova").length;

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
        <h1 className="brandface" style={{ fontSize: 28 }}>Solicitações</h1>
        {novas > 0 && <span className="pill" style={{ color: "var(--gold)" }}>{novas} nova{novas > 1 ? "s" : ""}</span>}
      </div>

      {erro && <div style={{ color: "#e88", marginBottom: 12 }}>{erro}</div>}
      {carregando ? <div style={{ color: "var(--muted)" }}>Carregando…</div>
        : lista.length === 0 ? <div style={{ color: "var(--muted)" }}>Nenhuma solicitação ainda. Compartilhe o link do formulário com os síndicos.</div>
        : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 18, alignItems: "start" }}>
          <div style={{ display: "grid", gap: 8 }}>
            {lista.map((s) => (
              <button key={s.id} className="card card-btn" onClick={() => setSel(s)}
                style={{ padding: 14, borderColor: sel?.id === s.id ? "var(--gold)" : "var(--line-2)", opacity: s.status === "arquivada" ? 0.55 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700 }}>{s.condominio}</span>
                  <span style={{ fontSize: 11, color: STATUS_COR[s.status ?? "nova"] }}>{STATUS_ROTULO[s.status ?? "nova"]}</span>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>
                  {s.sindico} · {s.cidade || "—"} · {dataBR(s.criado_em)}
                </div>
              </button>
            ))}
          </div>

          {sel ? <Detalhe s={sel} busy={busy} onConverter={() => converter(sel)} onArquivar={() => arquivar(sel)} />
            : <div className="card" style={{ padding: 24, color: "var(--muted)" }}>Selecione uma solicitação para ver os detalhes.</div>}
        </div>
      )}
    </Shell>
  );
}

function Linha({ r, v }: { r: string; v?: React.ReactNode }) {
  if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
      <span className="microlabel" style={{ alignSelf: "center" }}>{r}</span>
      <span style={{ color: "#e6e6e1" }}>{v}</span>
    </div>
  );
}

function Detalhe({ s, busy, onConverter, onArquivar }: { s: Solicitacao; busy: boolean; onConverter: () => void; onArquivar: () => void }) {
  return (
    <div className="card" style={{ padding: 22, display: "grid", gap: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <h2 className="brandface" style={{ fontSize: 22 }}>{s.condominio}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {s.status !== "arquivada" && <button className="btn" disabled={busy} onClick={onArquivar}>Arquivar</button>}
          {s.status !== "convertida" && <button className="btn btn-primary" disabled={busy} onClick={onConverter}>Converter em projeto</button>}
          {s.status === "convertida" && <span className="pill" style={{ color: "#7ec98f" }}>Já convertida</span>}
        </div>
      </div>

      <Linha r="Síndico" v={s.sindico} />
      <Linha r="WhatsApp" v={s.whatsapp} />
      <Linha r="E-mail" v={s.email} />
      <Linha r="Cidade / bairro" v={s.cidade} />
      <Linha r="Nº de unidades" v={s.unidades} />
      <Linha r="Dimensões (m)" v={s.dimensoes} />
      <Linha r="Localização" v={s.localizacao} />
      <Linha r="Climatização" v={s.climatizacao} />
      <Linha r="Faixa etária" v={s.faixa_etaria} />
      <Linha r="Estilo de treino" v={s.estilos?.join(", ")} />
      <Linha r="Visão do síndico" v={s.visao} />
      <Linha r="Objetivo" v={s.objetivo} />
      <Linha r="Teto de investimento" v={s.orcamento_teto != null ? BRL(s.orcamento_teto) : null} />
      <Linha r="Status da aprovação" v={s.aprovacao} />
      <Linha r="Observações" v={s.observacoes} />

      {(s.anexos?.length ?? 0) > 0 && (
        <div style={{ marginTop: 12 }}>
          <span className="microlabel">Anexos</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            {s.anexos!.map((a, i) => a.tipo === "foto"
              ? <img key={i} src={a.dataUrl} alt={a.nome} style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)" }} />
              : <a key={i} className="btn" href={a.dataUrl} download={a.nome} style={{ textDecoration: "none" }}>📄 {a.nome}</a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
