import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../ui/Shell";
import {
  obterProjeto, online, salvarCena,
  listarFornecedores, inserirFornecedor, removerFornecedor,
  listarCotacoes, inserirCotacao, atualizarCotacao, removerCotacao,
  listarOrcamentos, inserirOrcamento, atualizarOrcamento, removerOrcamento,
  uploadOrcamento, urlOrcamento, removerOrcamentoArquivo,
} from "../lib/supabase";
import { lerOrcamentoPdf, type OrcamentoLido, type TipoLinha } from "../lib/orcamentoPdf";
import OrcamentoConferencia from "../ui/OrcamentoConferencia";
import { lerCotacoes } from "../lib/readers";
import { heritageProjeto } from "../lib/seed";
import { resumo } from "../lib/validation";
import { BRL } from "../lib/units";
import { useLibrary } from "../store/libraryStore";
import { CENARIOS, taxaDe, taxaLabel, type Cenario, type Cotacao, type Fornecedor, type Orcamento, type Projeto } from "../lib/types";

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
  const [manual, setManual] = useState(false);

  // Orçamentos em PDF: subir → conferir → virar cotações.
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [tipoUpload, setTipoUpload] = useState<TipoLinha>("equipamento");
  const [conferencia, setConferencia] = useState<{ lido: OrcamentoLido; arquivo: File } | null>(null);
  const [salvandoOrc, setSalvandoOrc] = useState(false);
  const pdfRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        const p = ehHeritage ? heritageProjeto() : (await obterProjeto(id)) || heritageProjeto();
        setProjeto(p);
      } catch { setProjeto(heritageProjeto()); }
      setFornecedores(await listarFornecedores());
      if (podeCotar) {
        setCotacoes(await listarCotacoes(id));
        setOrcamentos(await listarOrcamentos(id));
      }
    })();
  }, [id, ehHeritage, podeCotar]);

  const r = useMemo(() => (projeto?.cena ? resumo(projeto.cena) : null), [projeto]);
  const teto = Number(projeto?.orcamento_teto) || 0;
  const nomeForn = (fid?: string | null) => fornecedores.find((f) => f.id === fid)?.nome || "—";

  // Agrupa cotações do MESMO item entre fornecedores. O nome vem de PDFs
  // diferentes ("Leg Press 45°" × "LEG PRESS 45 GRAUS"), então a chave ignora
  // caixa, acento e pontuação — senão cada proposta viraria um grupo sozinho.
  const grupos = useMemo(() => {
    const chave = (c: Cotacao) => (c.equipamento || c.categoria || "Sem categoria")
      .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const g = new Map<string, { rotulo: string; itens: Cotacao[] }>();
    for (const c of cotacoes) {
      const k = chave(c);
      const atual = g.get(k) ?? g.set(k, { rotulo: (c.equipamento || c.categoria || "Sem categoria").trim(), itens: [] }).get(k)!;
      atual.itens.push(c);
    }
    return [...g.values()]
      .sort((a, b) => b.itens.length - a.itens.length || a.rotulo.localeCompare(b.rotulo))
      .map((v) => [v.rotulo, v.itens] as [string, Cotacao[]]);
  }, [cotacoes]);

  // Resumo da compra decidida (pode misturar fornecedores).
  const escolhidas = useMemo(() => {
    const sel = cotacoes.filter((c) => c.escolhida);
    return {
      n: sel.length,
      total: sel.reduce((t, c) => t + (c.valor || 0), 0),
      fornecedores: new Set(sel.map((c) => c.fornecedor_id ?? "—")).size,
    };
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

  // ── Orçamento em PDF ──────────────────────────────────────────────────────
  async function lerPdf(file?: File | null) {
    if (!file || !podeCotar) return;
    if (!/\.pdf$/i.test(file.name)) { setErro("Envie um arquivo PDF."); return; }
    setStatus("Lendo o orçamento…"); setErro(null);
    try {
      const lido = await lerOrcamentoPdf(file, tipoUpload);
      setConferencia({ lido, arquivo: file });
      setStatus(null);
    } catch (e) {
      setErro(`Não consegui ler o PDF: ${(e as Error).message}`);
      setStatus(null);
    } finally { if (pdfRef.current) pdfRef.current.value = ""; }
  }

  async function confirmarOrcamento(cab: Orcamento, linhas: Cotacao[], fornecedorNovo: string | null) {
    if (!conferencia || !id) return;
    setSalvandoOrc(true); setErro(null);
    try {
      // Fornecedor novo entra no cadastro global e já sai vinculado à proposta.
      let fornecedorId = cab.fornecedor_id ?? null;
      if (!fornecedorId && fornecedorNovo) {
        const f = await inserirFornecedor({ nome: fornecedorNovo });
        setFornecedores((xs) => [...xs, f].sort((a, b) => a.nome.localeCompare(b.nome)));
        fornecedorId = f.id ?? null;
      }
      // O PDF fica guardado junto: a proposta precisa do documento original.
      let path: string | null = null;
      try { path = await uploadOrcamento(id, conferencia.arquivo); }
      catch { setStatus("Orçamento salvo, mas o arquivo não subiu para a nuvem."); }

      await inserirOrcamento(
        { ...cab, projeto_id: id, fornecedor_id: fornecedorId, arquivo_path: path },
        linhas.map((l) => ({ ...l, fornecedor_id: fornecedorId })),
      );
      setOrcamentos(await listarOrcamentos(id));
      setCotacoes(await listarCotacoes(id));
      setConferencia(null);
      setStatus(`Orçamento de ${cab.fornecedor_nome ?? "fornecedor"} salvo com ${linhas.length} item(ns).`);
    } catch (e) { setErro(`Falha ao salvar: ${(e as Error).message}`); }
    finally { setSalvandoOrc(false); }
  }

  async function alternarEscolhido(o: Orcamento) {
    if (!o.id) return;
    try {
      await atualizarOrcamento(o.id, { escolhido: !o.escolhido });
      setOrcamentos((xs) => xs.map((x) => (x.id === o.id ? { ...x, escolhido: !o.escolhido } : x)));
    } catch (e) { setErro((e as Error).message); }
  }

  async function excluirOrcamento(o: Orcamento) {
    if (!o.id) return;
    if (!confirm(`Remover a proposta de ${o.fornecedor_nome ?? "fornecedor"} e as ${cotacoes.filter((c) => c.orcamento_id === o.id).length} linha(s) dela?`)) return;
    try {
      await removerOrcamento(o.id);
      if (o.arquivo_path) await removerOrcamentoArquivo(o.arquivo_path).catch(() => {});
      setOrcamentos((xs) => xs.filter((x) => x.id !== o.id));
      setCotacoes((xs) => xs.filter((c) => c.orcamento_id !== o.id));
    } catch (e) { setErro((e as Error).message); }
  }

  /** Marca (ou desmarca) a linha comprada. Só uma escolha por item — trocar de
   *  fornecedor desmarca a anterior do mesmo grupo. */
  async function escolherLinha(grupo: Cotacao[], alvo: Cotacao) {
    if (!alvo.id) return;
    const ligar = !alvo.escolhida;
    try {
      for (const c of grupo) {
        const novo = ligar && c.id === alvo.id;
        if (!!c.escolhida === novo || !c.id) continue;
        await atualizarCotacao(c.id, { escolhida: novo });
      }
      setCotacoes((xs) => xs.map((c) =>
        grupo.some((g) => g.id === c.id) ? { ...c, escolhida: ligar && c.id === alvo.id } : c));
    } catch (e) { setErro((e as Error).message); }
  }

  /** Leva as linhas ESCOLHIDAS de acessório para a cena do projeto — é de lá
   *  que o Dossiê monta a tabela de acessórios. */
  async function enviarAcessoriosAoProjeto() {
    if (!projeto?.cena || !id) return;
    const escolhidosAc = cotacoes.filter((c) => c.escolhida && c.tipo === "acessorio" && c.equipamento);
    if (!escolhidosAc.length) { setErro("Marque primeiro (✓) as linhas de acessório escolhidas no comparativo."); return; }
    setErro(null);
    const atuais = [...(projeto.cena.acessorios ?? [])];
    let novos = 0, atualizados = 0;
    for (const c of escolhidosAc) {
      const qtd = Math.max(1, Math.round(Number(c.qtd) || 1));
      const preco_un = c.preco_un ?? (c.valor != null ? c.valor / qtd : 0);
      const idx = atuais.findIndex((a) => a.nome.trim().toLowerCase() === c.equipamento!.trim().toLowerCase());
      if (idx >= 0) { atuais[idx] = { ...atuais[idx], qtd, preco_un }; atualizados++; }
      else { atuais.push({ id: crypto.randomUUID(), nome: c.equipamento!, qtd, preco_un }); novos++; }
    }
    const cenaNova = { ...projeto.cena, acessorios: atuais };
    try {
      await salvarCena(id, cenaNova);
      setProjeto({ ...projeto, cena: cenaNova });
      setStatus(`Acessórios no projeto: ${novos} novo(s), ${atualizados} atualizado(s) — já saem no Dossiê.`);
    } catch (e) { setErro((e as Error).message); }
  }

  async function abrirPdf(path?: string | null) {
    if (!path) { setErro("Esta proposta não tem arquivo guardado."); return; }
    try { window.open(await urlOrcamento(path), "_blank"); }
    catch (e) { setErro(`Não consegui abrir: ${(e as Error).message}`); }
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

        {/* Orçamentos em PDF + cotações */}
        <Secao n="04" titulo="Orçamentos & Cotações"
          desc="Suba o PDF do fornecedor: o app lê, você confere e vira cotação. Meta: 3+ propostas por item."
          right={podeCotar ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".06em" }}>O PDF É DE</span>
              {([["equipamento", "Equipamentos"], ["acessorio", "Acessórios"]] as [TipoLinha, string][]).map(([k, lbl]) => (
                <button key={k} className="btn" onClick={() => setTipoUpload(k)}
                  style={{ padding: "5px 10px", fontSize: 11, ...(tipoUpload === k ? { borderColor: "var(--gold)", color: "var(--gold)" } : {}) }}>{lbl}</button>
              ))}
              <input ref={pdfRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={(e) => void lerPdf(e.target.files?.[0])} />
              <button className="btn btn-gold" onClick={() => pdfRef.current?.click()}>⭱ Subir orçamento (PDF)</button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={(e) => importar(e.target.files?.[0])} />
              <button className="btn" onClick={() => fileRef.current?.click()}>Planilha</button>
            </div>
          ) : undefined}>
          {!podeCotar ? (
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              {ehHeritage ? "Os orçamentos ficam disponíveis em um projeto salvo (o Heritage é um modelo)." : "Configure o Supabase para registrar orçamentos."}
            </div>
          ) : (
            <>
              {/* Propostas recebidas */}
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="microlabel">PROPOSTAS RECEBIDAS ({orcamentos.length})</span>
                  {escolhidas.n > 0 && (
                    <span className="chip" style={{ padding: "2px 9px", fontSize: 10.5, borderColor: "var(--green)", color: "var(--green)" }}>
                      Compra escolhida: {BRL(Math.round(escolhidas.total))} · {escolhidas.n} item(ns) · {escolhidas.fornecedores} fornecedor(es)
                    </span>
                  )}
                  {cotacoes.some((c) => c.escolhida && c.tipo === "acessorio") && (
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 11 }}
                      title="Grava as linhas de acessório escolhidas na cena do projeto — é de lá que o Dossiê monta a tabela"
                      onClick={() => void enviarAcessoriosAoProjeto()}>→ Enviar acessórios ao projeto</button>
                  )}
                </div>
                {orcamentos.length === 0 ? (
                  <div style={{ color: "var(--muted)", fontSize: 12.5 }}>
                    Nenhum orçamento ainda. Suba o PDF que o fornecedor mandou — o app lê fornecedor, itens, valores, prazo e garantia, e abre a tela de conferência.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                    {orcamentos.map((o) => {
                      const linhas = cotacoes.filter((c) => c.orcamento_id === o.id);
                      const soma = linhas.reduce((t, c) => t + (c.valor || 0), 0);
                      return (
                        <div key={o.id} className="card" style={{ padding: 12, borderTop: `3px solid ${o.escolhido ? "var(--green)" : "var(--line-2)"}` }}>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{o.fornecedor_nome || nomeForn(o.fornecedor_id)}</span>
                            {o.escolhido && <span style={{ fontSize: 10.5, color: "var(--green)", fontWeight: 700 }}>✓ ESCOLHIDO</span>}
                          </div>
                          <div className="brandface" style={{ fontSize: 19, color: "var(--gold)", marginTop: 3 }}>{BRL(Math.round(o.total ?? soma))}</div>
                          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                            {linhas.length} item(ns){o.documento ? ` · nº ${o.documento}` : ""}{o.validade ? ` · validade ${o.validade}` : ""}
                          </div>
                          <div style={{ fontSize: 11, color: "#8a8a8f", marginTop: 4, lineHeight: 1.5 }}>
                            {[o.prazo_entrega && `Entrega ${o.prazo_entrega}`, o.garantia && `Garantia ${o.garantia}`, o.pagamento && `Pgto. ${o.pagamento}`]
                              .filter(Boolean).join(" · ") || "—"}
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                            <button className="btn" style={{ padding: "4px 9px", fontSize: 11 }} onClick={() => void abrirPdf(o.arquivo_path)}>📄 PDF</button>
                            <button className="btn" style={{ padding: "4px 9px", fontSize: 11, ...(o.escolhido ? { borderColor: "var(--green)", color: "var(--green)" } : {}) }}
                              onClick={() => void alternarEscolhido(o)}>{o.escolhido ? "✓ Final" : "Marcar como final"}</button>
                            <button className="btn" style={{ padding: "4px 9px", fontSize: 11 }} onClick={() => void excluirOrcamento(o)}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Comparativo por item */}
              {grupos.length > 0 && (
                <div style={{ display: "grid", gap: 10 }}>
                  <div className="hairline" />
                  <span className="microlabel">COMPARATIVO POR ITEM — marque a linha comprada</span>
                  {grupos.map(([nome, cs]) => {
                    const melhor = cs.reduce<number | null>((m, c) => {
                      const v = c.preco_un ?? c.valor;
                      return v != null && (m == null || v < m) ? v : m;
                    }, null);
                    const ok = cs.length >= 3;
                    const ehAcessorio = cs.every((c) => c.tipo === "acessorio");
                    return (
                      <div key={nome} style={{ display: "grid", gap: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{nome}</span>
                          {ehAcessorio && <span style={{ fontSize: 10, color: "var(--muted)", border: "1px solid var(--line-2)", borderRadius: 999, padding: "1px 7px" }}>acessório</span>}
                          <span className="chip" style={{ padding: "2px 9px", fontSize: 10.5, borderColor: ok ? "var(--green)" : "#E09A45", color: ok ? "var(--green)" : "#E09A45" }}>
                            {ok ? `${cs.length} cotações ✓` : `${cs.length}/3 — faltam ${3 - cs.length}`}
                          </span>
                        </div>
                        {cs.map((c) => {
                          const unit = c.preco_un ?? c.valor;
                          return (
                            <div key={c.id} style={{
                              display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "#c9c9c4",
                              padding: "5px 10px", background: "var(--panel-2)", borderRadius: 8,
                              border: `1px solid ${c.escolhida ? "var(--green)" : "var(--line)"}`,
                            }}>
                              <button className="btn" style={{
                                padding: "2px 8px", fontSize: 11, minWidth: 34,
                                ...(c.escolhida ? { borderColor: "var(--green)", color: "var(--green)" } : {}),
                              }} title="Marcar esta como a compra escolhida"
                                onClick={() => void escolherLinha(cs, c)}>{c.escolhida ? "✓" : "○"}</button>
                              <span style={{ flex: 1, minWidth: 0 }}>{nomeForn(c.fornecedor_id)}{c.modelo ? ` · ${c.modelo}` : ""}</span>
                              {c.qtd != null && c.qtd > 1 && <span style={{ color: "var(--muted)" }}>{c.qtd}×</span>}
                              {c.garantia && <span style={{ color: "var(--muted)" }}>Gar. {c.garantia}</span>}
                              {c.prazo && <span style={{ color: "var(--muted)" }}>{c.prazo}</span>}
                              <span style={{ fontWeight: 700, color: unit != null && unit === melhor ? "var(--green)" : "var(--gold)" }}>
                                {unit != null ? BRL(Math.round(unit)) : "—"}
                              </span>
                              <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => delCotacao(c.id)}>✕</button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Lançamento manual (fica fora do caminho principal) */}
              <div>
                <button className="btn" style={{ padding: "5px 10px", fontSize: 11 }} onClick={() => setManual((m) => !m)}>
                  {manual ? "− Fechar" : "＋ Lançar cotação à mão"}
                </button>
                {manual && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginTop: 10 }}>
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
                )}
              </div>
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

      {conferencia && (
        <OrcamentoConferencia
          lido={conferencia.lido}
          arquivo={conferencia.arquivo}
          fornecedores={fornecedores}
          tipoPadrao={tipoUpload}
          salvando={salvandoOrc}
          onCancelar={() => setConferencia(null)}
          onConfirmar={(cab, linhas, novo) => void confirmarOrcamento(cab, linhas, novo)}
        />
      )}
    </Shell>
  );
}
