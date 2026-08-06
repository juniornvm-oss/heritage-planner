// Conferência do orçamento lido do PDF — a etapa entre "subiu o arquivo" e
// "virou cotação". Nada é salvo sem passar por aqui: o leitor erra, e o que
// vale é o que o consultor confirma.

import { useMemo, useState } from "react";
import { BRL } from "../lib/units";
import type { Fornecedor, Orcamento, Cotacao } from "../lib/types";
import type { LinhaOrcamento, OrcamentoLido, TipoLinha } from "../lib/orcamentoPdf";
import { somaLinhas } from "../lib/orcamentoPdf";

export interface LinhaConferida extends LinhaOrcamento {
  usar: boolean;
}

const Campo = ({ label, children, largura }: { label: string; children: React.ReactNode; largura?: number }) => (
  <label style={{ display: "grid", gap: 4, minWidth: 0, width: largura }}>
    <span className="microlabel" style={{ whiteSpace: "normal" }}>{label}</span>
    {children}
  </label>
);

/** Número em pt-BR ("1234,56") tolerante ao que o usuário digita. */
const num = (v: string): number | null => {
  const s = v.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(s);
  return s !== "" && Number.isFinite(n) ? n : null;
};

export default function OrcamentoConferencia({
  lido, arquivo, fornecedores, tipoPadrao, salvando, onCancelar, onConfirmar,
}: {
  lido: OrcamentoLido;
  arquivo: File;
  fornecedores: Fornecedor[];
  tipoPadrao: TipoLinha;
  salvando: boolean;
  onCancelar: () => void;
  /** Devolve o cabeçalho conferido, as linhas marcadas e o nome do fornecedor
   *  novo (quando o consultor não escolheu um já cadastrado). */
  onConfirmar: (cab: Orcamento, linhas: Cotacao[], fornecedorNovo: string | null) => void;
}) {
  // Casa o fornecedor lido com um já cadastrado (nome contido no outro).
  const sugerido = useMemo(() => {
    const alvo = (lido.fornecedor || "").toLowerCase();
    if (!alvo) return "";
    const f = fornecedores.find((x) => alvo.includes(x.nome.toLowerCase()) || x.nome.toLowerCase().includes(alvo.split(" ")[0]));
    return f?.id ?? "";
  }, [lido.fornecedor, fornecedores]);

  const [fornecedorId, setFornecedorId] = useState<string>(sugerido);
  const [fornecedorNome, setFornecedorNome] = useState(lido.fornecedor ?? "");
  const [cab, setCab] = useState({
    documento: lido.documento ?? "", data_orcamento: lido.data_orcamento ?? "", validade: lido.validade ?? "",
    prazo_entrega: lido.prazo_entrega ?? "", garantia: lido.garantia ?? "", pagamento: lido.pagamento ?? "",
    frete: lido.frete ?? "", total: lido.total != null ? String(lido.total) : "", observacoes: "",
  });
  const setC = (k: keyof typeof cab) => (v: string) => setCab((x) => ({ ...x, [k]: v }));

  const [linhas, setLinhas] = useState<LinhaConferida[]>(lido.linhas.map((l) => ({ ...l, usar: true })));
  const [verTexto, setVerTexto] = useState(false);
  const [verDescartadas, setVerDescartadas] = useState(false);

  const patch = (id: string, p: Partial<LinhaConferida>) =>
    setLinhas((xs) => xs.map((l) => (l.id === id ? { ...l, ...p } : l)));

  const usadas = linhas.filter((l) => l.usar);
  const soma = somaLinhas(usadas);
  const totalPdf = num(cab.total);
  const divergencia = totalPdf != null && Math.abs(totalPdf - soma) > 1;
  const duvidosas = usadas.filter((l) => l.incerta).length;

  function confirmar() {
    const nomeFinal = fornecedorId
      ? (fornecedores.find((f) => f.id === fornecedorId)?.nome ?? null)
      : (fornecedorNome.trim() || null);
    const cabecalho: Orcamento = {
      fornecedor_id: fornecedorId || null,
      fornecedor_nome: nomeFinal,
      cnpj: lido.cnpj,
      arquivo_nome: arquivo.name,
      documento: cab.documento || null,
      data_orcamento: cab.data_orcamento || null,
      validade: cab.validade || null,
      prazo_entrega: cab.prazo_entrega || null,
      garantia: cab.garantia || null,
      pagamento: cab.pagamento || null,
      frete: cab.frete || null,
      total: totalPdf ?? soma,
      escolhido: false,
      observacoes: cab.observacoes || null,
    };
    const cotacoes: Cotacao[] = usadas.map((l) => ({
      equipamento: l.descricao,
      categoria: l.tipo === "acessorio" ? "Acessórios" : null,
      modelo: l.modelo,
      qtd: l.qtd,
      preco_un: l.preco_un,
      valor: l.total ?? (l.preco_un ?? 0) * l.qtd,
      tipo: l.tipo,
      garantia: cab.garantia || null,
      prazo: cab.prazo_entrega || null,
      escolhida: false,
    }));
    onConfirmar(cabecalho, cotacoes, fornecedorId ? null : (fornecedorNome.trim() || null));
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.62)", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ width: "min(1080px, 96vw)", maxHeight: "92vh", overflow: "auto", padding: 20, display: "grid", gap: 14 }}>
        <div>
          <div className="brandface" style={{ fontSize: 20, color: "var(--gold)" }}>CONFERIR ORÇAMENTO</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            📄 {arquivo.name} · {lido.paginas} página(s) · {lido.linhas.length} linha(s) lida(s).
            {" "}O leitor faz o rascunho — o que vale é o que você confirmar aqui.
          </div>
        </div>

        {!lido.temTexto && (
          <div style={{ border: "1px solid var(--red)", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, color: "#e9a0a0", lineHeight: 1.5 }}>
            Este PDF não tem texto — provavelmente é um escaneado ou foto. Não dá para ler automaticamente.
            Você pode lançar as linhas à mão abaixo; o arquivo fica anexado do mesmo jeito.
          </div>
        )}

        {/* ── Cabeçalho da proposta ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <Campo label="Fornecedor" largura={210}>
            <select className="fld" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
              <option value="">— novo fornecedor —</option>
              {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
          {!fornecedorId && (
            <Campo label={`Nome do fornecedor${lido.fornecedor ? " (lido do PDF)" : ""}`} largura={230}>
              <input className="fld" value={fornecedorNome} onChange={(e) => setFornecedorNome(e.target.value)} placeholder="Ex.: Moviment Equipamentos" />
            </Campo>
          )}
          <Campo label="Nº da proposta" largura={120}><input className="fld" value={cab.documento} onChange={(e) => setC("documento")(e.target.value)} /></Campo>
          <Campo label="Data" largura={110}><input className="fld" value={cab.data_orcamento} onChange={(e) => setC("data_orcamento")(e.target.value)} /></Campo>
          <Campo label="Validade" largura={130}><input className="fld" value={cab.validade} onChange={(e) => setC("validade")(e.target.value)} /></Campo>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
          <Campo label="Prazo de entrega" largura={190}><input className="fld" value={cab.prazo_entrega} onChange={(e) => setC("prazo_entrega")(e.target.value)} /></Campo>
          <Campo label="Garantia" largura={170}><input className="fld" value={cab.garantia} onChange={(e) => setC("garantia")(e.target.value)} /></Campo>
          <Campo label="Pagamento" largura={230}><input className="fld" value={cab.pagamento} onChange={(e) => setC("pagamento")(e.target.value)} /></Campo>
          <Campo label="Frete" largura={140}><input className="fld" value={cab.frete} onChange={(e) => setC("frete")(e.target.value)} /></Campo>
          <Campo label="Total do PDF" largura={130}><input className="fld" value={cab.total} onChange={(e) => setC("total")(e.target.value)} /></Campo>
        </div>

        {/* ── Linhas ── */}
        <div className="hairline" />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="brandface" style={{ fontSize: 15, color: "var(--gold)" }}>ITENS ({usadas.length})</span>
          {duvidosas > 0 && (
            <span className="chip" style={{ padding: "2px 9px", fontSize: 10.5, borderColor: "#E09A45", color: "#E09A45" }}>
              {duvidosas} linha(s) para conferir
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn" style={{ padding: "5px 10px", fontSize: 11 }}
            onClick={() => setLinhas((xs) => [...xs, {
              id: `n${xs.length + 1}-${Date.now()}`, descricao: "", modelo: null, qtd: 1,
              preco_un: null, total: null, tipo: tipoPadrao, incerta: false, bruto: "(lançado à mão)", usar: true,
            }])}>＋ Linha</button>
        </div>

        <div style={{ display: "grid", gap: 5 }}>
          {linhas.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 9px", flexWrap: "wrap" }}>
              <span style={{ width: 13 }} />
              <span className="microlabel" style={{ width: 118 }}>TIPO</span>
              <span className="microlabel" style={{ flex: 1, minWidth: 190 }}>DESCRIÇÃO</span>
              <span className="microlabel" style={{ width: 58, textAlign: "right" }}>QTD</span>
              <span className="microlabel" style={{ width: 108, textAlign: "right" }}>UNITÁRIO</span>
              <span className="microlabel" style={{ width: 108, textAlign: "right" }}>TOTAL</span>
              <span style={{ width: 66 }} />
            </div>
          )}
          {linhas.map((l) => (
            <div key={l.id} style={{
              display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
              background: "var(--panel-2)", borderRadius: 8, padding: "7px 9px",
              border: `1px solid ${l.usar && l.incerta ? "#E09A45" : "var(--line)"}`,
              opacity: l.usar ? 1 : 0.45,
            }}>
              <input type="checkbox" checked={l.usar} onChange={(e) => patch(l.id, { usar: e.target.checked })} title="Usar esta linha" />
              <select className="fld" style={{ width: 118, padding: "5px 7px", fontSize: 11 }} value={l.tipo}
                onChange={(e) => patch(l.id, { tipo: e.target.value as TipoLinha })}>
                <option value="equipamento">Equipamento</option>
                <option value="acessorio">Acessório</option>
              </select>
              <input className="fld" style={{ flex: 1, minWidth: 190, padding: "5px 8px", fontSize: 12 }} value={l.descricao}
                placeholder="Descrição do item" onChange={(e) => patch(l.id, { descricao: e.target.value })} />
              <input className="fld" style={{ width: 58, padding: "5px 6px", fontSize: 12, textAlign: "right" }} value={String(l.qtd)}
                title="Quantidade" onChange={(e) => {
                  const q = Math.max(1, Math.round(num(e.target.value) ?? 1));
                  patch(l.id, { qtd: q, total: l.preco_un != null ? Math.round(l.preco_un * q * 100) / 100 : l.total, incerta: false });
                }} />
              <input className="fld" style={{ width: 108, padding: "5px 7px", fontSize: 12, textAlign: "right" }}
                value={l.preco_un != null ? String(l.preco_un).replace(".", ",") : ""} placeholder="unitário"
                onChange={(e) => {
                  const p = num(e.target.value);
                  patch(l.id, { preco_un: p, total: p != null ? Math.round(p * l.qtd * 100) / 100 : null, incerta: false });
                }} />
              <span style={{ width: 108, textAlign: "right", fontSize: 12.5, fontWeight: 700, color: "var(--gold)" }}>
                {BRL(Math.round(l.total ?? (l.preco_un ?? 0) * l.qtd))}
              </span>
              <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} title={l.bruto}
                onClick={() => alert(`Linha original do PDF:\n\n${l.bruto}`)}>👁</button>
              <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }}
                onClick={() => setLinhas((xs) => xs.filter((x) => x.id !== l.id))}>✕</button>
            </div>
          ))}
          {linhas.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Nenhuma linha reconhecida. Use ＋ Linha para lançar à mão.</div>
          )}
        </div>

        {/* ── Conferência do total ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
          <span style={{ color: "var(--muted)" }}>Soma das linhas marcadas</span>
          <span className="brandface" style={{ fontSize: 18, color: "var(--gold)" }}>{BRL(Math.round(soma))}</span>
          {totalPdf != null && (
            <span style={{ color: divergencia ? "var(--red)" : "var(--green)" }}>
              {divergencia
                ? `não bate com o total do PDF (${BRL(Math.round(totalPdf))}) — diferença de ${BRL(Math.round(Math.abs(totalPdf - soma)))}`
                : "confere com o total do PDF"}
            </span>
          )}
        </div>
        {divergencia && (
          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginTop: -6 }}>
            Diferença normal quando o PDF tem frete, desconto ou impostos fora das linhas — confira antes de salvar.
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn--sm" onClick={() => { setVerTexto((v) => !v); setVerDescartadas(false); }}>
            {verTexto ? "− Ocultar" : "🔍 Ver"} texto extraído do PDF
          </button>
          {/* O que o leitor NÃO usou, e por quê. Sem esta lista, o app decide
              em silêncio o que virou item — e uma linha de produto engolida
              por uma heurística some do orçamento sem ninguém notar. */}
          {lido.descartadas.length > 0 && (
            <button className="btn btn--sm" onClick={() => { setVerDescartadas((v) => !v); setVerTexto(false); }}
              style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>
              {verDescartadas ? "− Ocultar" : "⚠ Ver"} {lido.descartadas.length} linha(s) que não viraram item
            </button>
          )}
        </div>
        {(verTexto || verDescartadas) && (
          <pre style={{
            marginTop: -4, maxHeight: 240, overflow: "auto", background: "var(--panel-2)", border: "1px solid var(--line)",
            borderRadius: 8, padding: 10, fontSize: 10.5, lineHeight: 1.5, color: "#b6b6b1", whiteSpace: "pre-wrap",
          }}>{verDescartadas
            ? lido.descartadas.map((d) => `[${d.motivo}]\n${d.linha}`).join("\n\n") || "(nenhuma)"
            : lido.texto || "(vazio)"}</pre>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" disabled={salvando} onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-gold" disabled={salvando || usadas.length === 0} onClick={confirmar}>
            {salvando ? "Salvando…" : `✓ Salvar ${usadas.length} item(ns)`}
          </button>
        </div>
      </div>
    </div>
  );
}
