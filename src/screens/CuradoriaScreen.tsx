import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../ui/Shell";
import {
  obterProjeto, online,
  listarFornecedores, inserirFornecedor, removerFornecedor,
  listarCotacoes, inserirCotacao, removerCotacao,
} from "../lib/supabase";
import { lerCotacoes } from "../lib/readers";
import { heritageProjeto } from "../lib/seed";
import { resumo } from "../lib/validation";
import { BRL } from "../lib/units";
import { useLibrary } from "../store/libraryStore";
import { CENARIOS, taxaDe, taxaLabel, type Cenario, type Cotacao, type Fornecedor, type Projeto } from "../lib/types";

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
    <span className="microlabel">{label}</span>
    {children}
  </label>
);

const Secao = ({ n, titulo, desc, right, children }: { n: string; titulo: string; desc?: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <section className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="brandface" style={{ fontSize: 24, color: "var(--gold)" }}>{n}</span>
        <div>
          <div className="brandface" style={{ fontSize: 18, letterSpacing: "0.02em" }}>{titulo}</div>
          {desc && <div style={{ color: "var(--muted)", fontSize: 12 }}>{desc}</div>}
        </div>
      </div>
      {right}
    </div>
    {children}
  </section>
);

export default function CuradoriaScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const taxa = taxaDe(useLibrary((s) => s.config));
  const ehHeritage = id === "heritage";
  const podeCotar = online && !!id && !ehHeritage;

  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [nf, setNf] = useState<Fornecedor>({ nome: "" });
  const [nc, setNc] = useState<Cotacao>({ equipamento: "", valor: null });

  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        const p = ehHeritage ? heritageProjeto() : (await obterProjeto(id)) || heritageProjeto();
        setProjeto(p);
      } catch { setProjeto(heritageProjeto()); }
      setFornecedores(await listarFornecedores());
      if (podeCotar) setCotacoes(await listarCotacoes(id));
    })();
  }, [id, ehHeritage, podeCotar]);

  const r = useMemo(() => (projeto?.cena ? resumo(projeto.cena) : null), [projeto]);
  const teto = Number(projeto?.orcamento_teto) || 0;
  const nomeForn = (fid?: string | null) => fornecedores.find((f) => f.id === fid)?.nome || "—";

  // agrupa cotações por equipamento (ou categoria)
  const grupos = useMemo(() => {
    const g = new Map<string, Cotacao[]>();
    for (const c of cotacoes) {
      const k = (c.equipamento || c.categoria || "Sem categoria").trim();
      (g.get(k) ?? g.set(k, []).get(k)!).push(c);
    }
    return [...g.entries()];
  }, [cotacoes]);

  async function addFornecedor() {
    if (!nf.nome.trim()) { setErro("Informe o nome do fornecedor."); return; }
    if (!online) { setErro("Supabase não configurado."); return; }
    setErro(null);
    try {
      const f = await inserirFornecedor({ ...nf, nome: nf.nome.trim() });
      setFornecedores((xs) => [...xs, f].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNf({ nome: "" });
    } catch (e) { setErro((e as Error).message); }
  }

  async function delFornecedor(fid?: string) {
    if (!fid) return;
    try { await removerFornecedor(fid); setFornecedores((xs) => xs.filter((f) => f.id !== fid)); }
    catch (e) { setErro((e as Error).message); }
  }

  async function addCotacao() {
    if (!podeCotar) { setErro("Abra um projeto salvo para cotar."); return; }
    if (!nc.equipamento?.trim()) { setErro("Informe o equipamento da cotação."); return; }
    setErro(null);
    try {
      const c = await inserirCotacao({ ...nc, projeto_id: id, equipamento: nc.equipamento!.trim() });
      setCotacoes((xs) => [...xs, c]);
      setNc({ equipamento: "", valor: null });
    } catch (e) { setErro((e as Error).message); }
  }

  async function delCotacao(cid?: string) {
    if (!cid) return;
    try { await removerCotacao(cid); setCotacoes((xs) => xs.filter((c) => c.id !== cid)); }
    catch (e) { setErro((e as Error).message); }
  }

  async function importar(file?: File | null) {
    if (!file || !podeCotar) return;
    setStatus("Lendo planilha…"); setErro(null);
    try {
      const linhas = await lerCotacoes(file);
      let n = 0;
      for (const l of linhas) {
        const fnome = (l as { fornecedor_nome?: string }).fornecedor_nome;
        const fid = fnome ? fornecedores.find((f) => f.nome.toLowerCase() === fnome.toLowerCase())?.id ?? null : null;
        const { fornecedor_nome: _drop, ...rest } = l as Cotacao & { fornecedor_nome?: string };
        const c = await inserirCotacao({ ...rest, fornecedor_id: fid, projeto_id: id });
        setCotacoes((xs) => [...xs, c]); n++;
      }
      setStatus(`${n} cotação(ões) importada(s).`);
    } catch (e) { setErro((e as Error).message); setStatus(null); }
  }

  if (!projeto) return <Shell><p style={{ color: "var(--muted)" }}>Carregando…</p></Shell>;

  return (
    <Shell actions={<>
      <button className="btn" onClick={() => nav(`/projeto/${id}`)}>Editor</button>
      <button className="btn" onClick={() => nav("/")}>← Início</button>
    </>}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gap: 16 }}>
        <div>
          <div className="microlabel">Fase 03 · {projeto.nome}</div>
          <h1 className="brandface" style={{ fontSize: 32, color: "var(--gold)", marginTop: 6 }}>Curadoria & Investimento</h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2, maxWidth: 640, lineHeight: 1.5 }}>
            O melhor que o orçamento pode comprar: cenários de investimento, 3+ cotações por categoria e os fornecedores da obra.
          </p>
        </div>

        {/* Cenários */}
        {r && (
          <Secao n="06" titulo="Cenários de Investimento" desc="Essencial · Balanceado · Premium (cumulativos).">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {(Object.keys(CENARIOS) as Cenario[]).map((k) => {
                const total = r.cenarios[k]; const saldo = teto ? teto - total : null;
                return (
                  <div key={k} className="card" style={{ padding: 14, borderTop: `3px solid ${CENARIOS[k].cor}` }}>
                    <div className="microlabel">{CENARIOS[k].label}</div>
                    <div className="brandface" style={{ fontSize: 24, marginTop: 4 }}>{BRL(total)}</div>
                    {saldo != null && <div style={{ fontSize: 12, color: saldo >= 0 ? "var(--green)" : "var(--red)" }}>Saldo {BRL(saldo)}</div>}
                  </div>
                );
              })}
            </div>
            {teto > 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Teto {BRL(teto)} · Honorário {taxaLabel(taxa)} {BRL(Math.round(teto * taxa))} · {projeto.cena?.itens.length ?? 0} equipamentos
            </div>}
          </Secao>
        )}

        {/* Cotações */}
        <Secao n="04" titulo="Cotações por Categoria" desc="Meta: 3+ cotações por equipamento."
          right={podeCotar ? <>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => importar(e.target.files?.[0])} />
            <button className="btn" onClick={() => fileRef.current?.click()}>⭱ Importar planilha</button>
          </> : undefined}>
          {!podeCotar ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              {ehHeritage ? "As cotações ficam disponíveis em um projeto salvo (o Heritage é um modelo)." : "Configure o Supabase para registrar cotações."}
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
                <Campo label="Equipamento"><input className="fld" style={{ width: 170 }} value={nc.equipamento ?? ""} onChange={(e) => setNc({ ...nc, equipamento: e.target.value })} /></Campo>
                <Campo label="Categoria"><input className="fld" style={{ width: 120 }} value={nc.categoria ?? ""} onChange={(e) => setNc({ ...nc, categoria: e.target.value })} /></Campo>
                <Campo label="Fornecedor">
                  <select className="fld" style={{ width: 150 }} value={nc.fornecedor_id ?? ""} onChange={(e) => setNc({ ...nc, fornecedor_id: e.target.value || null })}>
                    <option value="">—</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </Campo>
                <Campo label="Modelo"><input className="fld" style={{ width: 110 }} value={nc.modelo ?? ""} onChange={(e) => setNc({ ...nc, modelo: e.target.value })} /></Campo>
                <Campo label="Valor (R$)"><input className="fld" style={{ width: 100 }} type="number" value={nc.valor ?? ""} onChange={(e) => setNc({ ...nc, valor: e.target.value ? Number(e.target.value) : null })} /></Campo>
                <Campo label="Garantia"><input className="fld" style={{ width: 90 }} value={nc.garantia ?? ""} onChange={(e) => setNc({ ...nc, garantia: e.target.value })} /></Campo>
                <Campo label="Prazo"><input className="fld" style={{ width: 90 }} value={nc.prazo ?? ""} onChange={(e) => setNc({ ...nc, prazo: e.target.value })} /></Campo>
                <button className="btn btn-gold" onClick={addCotacao}>Adicionar</button>
              </div>

              {grupos.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>Nenhuma cotação ainda. Adicione acima ou importe uma planilha.</div>
              ) : grupos.map(([nome, cs]) => {
                const melhor = cs.reduce<number | null>((m, c) => c.valor != null && (m == null || c.valor < m) ? c.valor : m, null);
                const ok = cs.length >= 3;
                return (
                  <div key={nome} style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{nome}</span>
                      <span className="chip" style={{ padding: "2px 9px", fontSize: 10.5, borderColor: ok ? "var(--green)" : "#E09A45", color: ok ? "var(--green)" : "#E09A45" }}>
                        {ok ? `${cs.length} cotações ✓` : `${cs.length}/3 — faltam ${3 - cs.length}`}
                      </span>
                    </div>
                    {cs.map((c) => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "#c9c9c4", padding: "5px 10px", background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8 }}>
                        <span style={{ flex: 1 }}>{nomeForn(c.fornecedor_id)}{c.modelo ? ` · ${c.modelo}` : ""}</span>
                        {c.garantia && <span style={{ color: "var(--muted)" }}>Gar. {c.garantia}</span>}
                        {c.prazo && <span style={{ color: "var(--muted)" }}>{c.prazo}</span>}
                        <span style={{ fontWeight: 700, color: c.valor != null && c.valor === melhor ? "var(--green)" : "var(--gold)" }}>{c.valor != null ? BRL(c.valor) : "—"}</span>
                        <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => delCotacao(c.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </Secao>

        {/* Fornecedores */}
        <Secao n="10" titulo="Fornecedores" desc="Contatos reaproveitados entre projetos.">
          {online ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end" }}>
              <Campo label="Nome"><input className="fld" style={{ width: 160 }} value={nf.nome} onChange={(e) => setNf({ ...nf, nome: e.target.value })} /></Campo>
              <Campo label="Marca(s)"><input className="fld" style={{ width: 120 }} value={nf.marca ?? ""} onChange={(e) => setNf({ ...nf, marca: e.target.value })} /></Campo>
              <Campo label="Contato"><input className="fld" style={{ width: 120 }} value={nf.contato ?? ""} onChange={(e) => setNf({ ...nf, contato: e.target.value })} /></Campo>
              <Campo label="Telefone"><input className="fld" style={{ width: 120 }} value={nf.telefone ?? ""} onChange={(e) => setNf({ ...nf, telefone: e.target.value })} /></Campo>
              <Campo label="E-mail"><input className="fld" style={{ width: 150 }} value={nf.email ?? ""} onChange={(e) => setNf({ ...nf, email: e.target.value })} /></Campo>
              <button className="btn btn-gold" onClick={addFornecedor}>Adicionar</button>
            </div>
          ) : <div style={{ color: "var(--muted)", fontSize: 13 }}>Configure o Supabase para cadastrar fornecedores.</div>}

          {fornecedores.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
              {fornecedores.map((f) => (
                <div key={f.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{f.nome}</span>
                    <button className="btn" style={{ padding: "3px 7px", fontSize: 11 }} onClick={() => delFornecedor(f.id)}>✕</button>
                  </div>
                  {f.marca && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{f.marca}</div>}
                  <div style={{ fontSize: 11.5, color: "#c9c9c4", marginTop: 4 }}>
                    {[f.contato, f.telefone, f.email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Secao>

        {status && <div style={{ color: "var(--gold)", fontSize: 12.5 }}>{status}</div>}
        {erro && <div style={{ color: "var(--red)", fontSize: 13 }}>{erro}</div>}
      </div>
    </Shell>
  );
}
