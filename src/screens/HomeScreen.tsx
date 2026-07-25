import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { listarProjetos, online, criarProjeto } from "../lib/supabase";
import { heritageProjeto } from "../lib/seed";
import { BRL } from "../lib/units";
import { TAXA_ASSESSORIA, type Projeto } from "../lib/types";
import {
  FASES, progressoProjeto, statusDaFase, STATUS_LABEL, STATUS_COR, type Fase, type StatusFase,
} from "../lib/fases";

const PILARES = [
  { titulo: "Custo-benefício", nota: "Cada real no equipamento certo" },
  { titulo: "Espaço otimizado", nota: "Layout em escala, circulação livre" },
  { titulo: "Perfil de uso", nota: "A academia dos moradores reais" },
  { titulo: "Valorização imobiliária", nota: "Um ativo que valoriza o condomínio" },
];

export default function HomeScreen() {
  const nav = useNavigate();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ativoId, setAtivoId] = useState<string>("heritage");
  const [dupBusy, setDupBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const heritage = useMemo(() => heritageProjeto(), []);

  async function duplicarHeritage() {
    if (!online) { setErro("Configure o Supabase para salvar projetos."); return; }
    setDupBusy(true); setErro(null);
    try {
      const base = heritageProjeto();
      const p = await criarProjeto({ nome: "Heritage", orcamento_teto: base.orcamento_teto, cena: base.cena });
      nav(`/projeto/${p.id}`);
    } catch (e) { setErro((e as Error).message); setDupBusy(false); }
  }

  useEffect(() => {
    (async () => {
      try {
        const ps = await listarProjetos();
        setProjetos(ps);
        if (ps[0]?.id) setAtivoId(ps[0].id);
      } catch {
        /* offline: fica só com o modelo Heritage */
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  const todos = useMemo(() => [heritage, ...projetos], [heritage, projetos]);
  const ativo = todos.find((p) => (p.id ?? "") === ativoId) ?? heritage;
  const prog = progressoProjeto(ativo);

  return (
    <Shell actions={<Link to="/novo" className="btn btn-gold">+ Nova leitura</Link>}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1120, margin: "0 auto 8px" }}>
        <div className="microlabel">Assessoria de implantação · Academias de condomínio</div>
        <h1 className="brandface" style={{ fontSize: 46, lineHeight: 1.02, marginTop: 8, letterSpacing: "0.02em" }}>
          A academia mais <span style={{ color: "var(--gold)" }}>funcional e bonita</span><br />
          que o orçamento do condomínio pode ter.
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 15, maxWidth: 680, marginTop: 12, lineHeight: 1.6 }}>
          Do diagnóstico ao dossiê executivo: uma trilha em quatro fases que transforma o
          orçamento-teto na melhor academia possível — pronta para o engenheiro e o arquiteto
          executarem. Honorário de <b style={{ color: "var(--text)" }}>{(TAXA_ASSESSORIA * 100).toLocaleString("pt-BR")}%</b> do teto de investimento.
        </p>

        {/* Pilares */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 22 }}>
          {PILARES.map((p) => (
            <div key={p.titulo} className="card" style={{ padding: "14px 16px" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{p.titulo}</div>
              <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 3 }}>{p.nota}</div>
            </div>
          ))}
        </div>
      </section>

      <hr className="hairline" style={{ maxWidth: 1120, margin: "30px auto 22px" }} />

      {/* ── Trilha das 4 fases ───────────────────────────────── */}
      <section style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 className="brandface" style={{ fontSize: 26, color: "var(--gold)" }}>A trilha da assessoria</h2>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>
              Quatro fases, dez entregáveis. {prog.concluidas}/4 concluídas para <b style={{ color: "var(--text)" }}>{ativo.nome}</b>.
            </p>
          </div>
          <button className="btn btn-gold" onClick={() => nav(prog.atual.rota(ativo.id))}>
            Continuar · {prog.atual.titulo}
          </button>
        </div>

        {/* Seletor de projeto ativo */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          {todos.map((p) => {
            const id = p.id ?? "heritage";
            const sel = id === ativoId;
            return (
              <button key={id} onClick={() => setAtivoId(id)} className="chip" style={{
                cursor: "pointer",
                borderColor: sel ? "var(--gold)" : "var(--line-2)",
                color: sel ? "var(--gold)" : "var(--muted)",
                background: sel ? "var(--gold-soft)" : "transparent",
              }}>
                {p.nome}
              </button>
            );
          })}
        </div>

        {/* Cards das fases */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14, marginTop: 16 }}>
          {prog.itens.map(({ fase, status }) => (
            <FaseCard key={fase.id} fase={fase} status={status} onIr={() => nav(fase.rota(ativo.id))} />
          ))}
        </div>
      </section>

      <hr className="hairline" style={{ maxWidth: 1120, margin: "34px auto 22px" }} />

      {/* ── Seus projetos ────────────────────────────────────── */}
      <section style={{ maxWidth: 1120, margin: "0 auto 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 className="brandface" style={{ fontSize: 26, color: "var(--gold)" }}>Seus projetos</h2>
          <Link to="/novo" className="btn btn-gold">+ Nova leitura</Link>
        </div>
        {!online && (
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginBottom: 12 }}>
            Modo local (Supabase não configurado) — exibindo apenas o modelo Heritage.
          </p>
        )}
        <p style={{ color: "var(--muted)", fontSize: 12.5, marginBottom: 12 }}>
          O <b style={{ color: "#c9c9c4" }}>Heritage</b> é um modelo só-leitura. Use <b style={{ color: "var(--gold)" }}>Duplicar como projeto</b> para editar e salvar de verdade.
        </p>
        {erro && <p style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 12 }}>{erro}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          <ProjetoCard projeto={heritage} modelo onAbrir={() => nav("/projeto/heritage")} onSelecionar={() => setAtivoId("heritage")} ativo={ativoId === "heritage"} onDuplicar={duplicarHeritage} dupBusy={dupBusy} />
          {carregando && <div style={{ color: "var(--muted)", alignSelf: "center" }}>Carregando…</div>}
          {projetos.map((p) => (
            <ProjetoCard key={p.id} projeto={p}
              onAbrir={() => nav(`/projeto/${p.id}`)}
              onSelecionar={() => setAtivoId(p.id!)}
              ativo={ativoId === p.id} />
          ))}
        </div>
      </section>
    </Shell>
  );
}

// ── Card de fase ─────────────────────────────────────────────────
function FaseCard({ fase, status, onIr }: { fase: Fase; status: StatusFase; onIr: () => void }) {
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <span className="brandface" style={{ fontSize: 40, lineHeight: 0.9, color: fase.cor }}>{fase.numero}</span>
        <StatusPill status={status} />
      </div>
      <div>
        <div className="brandface" style={{ fontSize: 21, letterSpacing: "0.02em" }}>{fase.titulo}</div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 1 }}>{fase.subtitulo}</div>
      </div>
      <p style={{ color: "#b6b6b1", fontSize: 12.5, lineHeight: 1.5, flex: 1 }}>{fase.descricao}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {fase.entregaveis.map((e) => (
          <span key={e.n} className="chip" style={{ padding: "3px 9px", fontSize: 11, gap: 5 }}>
            <b style={{ color: fase.cor }}>{e.n}</b> {e.label}
          </span>
        ))}
      </div>
      {fase.emBreve?.length ? (
        <div style={{ fontSize: 11, color: "#6e6e73" }}>Em breve: {fase.emBreve.join(" · ")}</div>
      ) : null}
      <button className="btn" onClick={onIr} style={{ borderColor: fase.cor, color: fase.cor, marginTop: 2 }}>
        Abrir fase →
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: StatusFase }) {
  const cor = STATUS_COR[status];
  return (
    <span style={{ border: `1px solid ${cor}`, color: cor, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Card de projeto ──────────────────────────────────────────────
function ProjetoCard({ projeto, modelo, ativo, onAbrir, onSelecionar, onDuplicar, dupBusy }: {
  projeto: Projeto; modelo?: boolean; ativo?: boolean; onAbrir: () => void; onSelecionar: () => void;
  onDuplicar?: () => void; dupBusy?: boolean;
}) {
  const itens = projeto.cena?.itens ?? [];
  const total = itens.reduce((s, i) => s + (i.preco || 0), 0);
  const teto = Number(projeto.orcamento_teto) || 0;

  return (
    <div className={`card${ativo ? " card-gold" : ""}`} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div className="brandface" style={{ fontSize: 22, color: "var(--gold)" }}>{projeto.nome}</div>
        {modelo && <span className="chip" style={{ padding: "2px 9px", fontSize: 10.5 }}>modelo</span>}
      </div>
      {projeto.sindico && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -4 }}>Síndico: {projeto.sindico}</div>}

      {/* mini-progresso das 4 fases */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {FASES.map((f) => {
          const st = statusDaFase(f, projeto);
          return <span key={f.id} title={`${f.numero} · ${f.titulo}`} style={{
            width: 9, height: 9, borderRadius: 3, background: STATUS_COR[st],
            opacity: st === "a-iniciar" ? 0.35 : 1,
          }} />;
        })}
        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>{itens.length} equip.</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 2 }}>
        <div style={{ fontSize: 13, color: "var(--gold)", fontWeight: 700 }}>{BRL(total)}</div>
        {teto > 0 && <div style={{ fontSize: 11, color: "var(--muted)" }}>Teto {BRL(teto)} · 0,5% {BRL(Math.round(teto * TAXA_ASSESSORIA))}</div>}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
        {modelo ? (
          <>
            <button className="btn btn-gold" style={{ flex: 1 }} onClick={onDuplicar} disabled={dupBusy}>
              {dupBusy ? "Duplicando…" : "＋ Duplicar como projeto"}
            </button>
            <button className="btn" onClick={onAbrir}>Abrir modelo</button>
          </>
        ) : (
          <>
            <button className="btn btn-gold" style={{ flex: 1 }} onClick={onAbrir}>Abrir editor</button>
            <button className="btn" onClick={onSelecionar} style={ativo ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}>
              {ativo ? "✓ Ativo" : "Na trilha"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
