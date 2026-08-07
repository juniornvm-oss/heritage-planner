/**
 * LÂMINAS DO DOSSIÊ — escolher e montar as pranchas que vão à apresentação.
 *
 * O Dossiê imprimia UMA captura da planta: a vista do editor, com tudo ligado
 * ao mesmo tempo. Mas uma apresentação não é uma vista, é uma sequência de
 * argumentos — "aqui é o piso", "aqui é o zoneamento", "aqui é a folga entre
 * os aparelhos" são três desenhos da mesma planta com camadas diferentes, e
 * antes só dava para entregar os três embaralhados num só.
 *
 * A prévia é o próprio `EditorCanvas` em modo lâmina, e não um desenho
 * paralelo: a imagem que o consultor aprova aqui é, byte a byte, a que o PDF
 * captura na exportação. Uma segunda implementação do desenho divergiria da
 * primeira no dia em que alguém mexesse numa camada.
 */

import { useEffect, useState } from "react";
import { useProjeto } from "../store/projetoStore";
import EditorCanvas from "./EditorCanvas";
import {
  ORDEM_CAMADAS, PRESETS_LAMINA, ROTULO_CAMADA,
  type CamadasLamina, type LaminaDossie,
} from "../lib/types";

/** Resumo de uma lâmina em uma linha: o que ela mostra, na ordem de leitura. */
export function resumoDaLamina(l: LaminaDossie): string {
  const ligadas = ORDEM_CAMADAS.filter((c) => l.camadas[c] && c !== "grade");
  if (!ligadas.length) return "nenhuma camada ligada — a lâmina sai em branco";
  return ligadas.map((c) => ROTULO_CAMADA[c].toLowerCase()).join(" · ");
}

// ── Painel: a lista, dentro da Central do Dossiê ────────────────────────────

export function LaminasPanel({ onEditar }: { onEditar: (id: string) => void }) {
  const laminas = useProjeto((s) => s.cena.laminas ?? []);
  const addLamina = useProjeto((s) => s.addLamina);
  const updateLamina = useProjeto((s) => s.updateLamina);
  const removerLamina = useProjeto((s) => s.removerLamina);
  const duplicarLamina = useProjeto((s) => s.duplicarLamina);
  const moverLamina = useProjeto((s) => s.moverLamina);
  const [abrindo, setAbrindo] = useState(false);

  const nAtivas = laminas.filter((l) => l.ativa).length;

  return (
    <section className="card" style={{ padding: 14, marginTop: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <span className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>LÂMINAS DA APRESENTAÇÃO</span>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>
            {laminas.length
              ? <>As {laminas.length} pranchas de planta do Dossiê, na ordem em que saem — {nAtivas} ligada{nAtivas === 1 ? "" : "s"}. Cada uma mostra só as camadas que você escolher.</>
              : <>Sem lâminas, o Dossiê sai com <b>a planta completa de sempre</b>. Crie a primeira para escolher o que cada prancha mostra — piso sem equipamento, zoneamento sem aparelho, distâncias entre máquinas.</>}
          </div>
        </div>
        <button className="btn btn-gold btn--sm" onClick={() => setAbrindo((v) => !v)} aria-expanded={abrindo}>
          ＋ Nova lâmina
        </button>
      </div>

      {abrindo && (
        <div className="mo-pop" style={{ display: "grid", gap: 4, border: "1px solid var(--line-2)", borderRadius: 12, padding: 8 }}>
          {PRESETS_LAMINA.map((p) => (
            <button key={p.id} className="lam-preset" onClick={() => { addLamina(p.id); setAbrindo(false); }}>
              <b>{p.nome}</b>
              <small>{p.descricao}</small>
            </button>
          ))}
        </div>
      )}

      {laminas.map((l, i) => (
        <div key={l.id} className={`lam-linha${l.ativa ? "" : " off"}`}>
          <button className="lam-chave" role="switch" aria-checked={l.ativa}
            title={l.ativa ? "Sai no Dossiê — toque para deixar de fora" : "Fora do Dossiê — toque para incluir"}
            onClick={() => updateLamina(l.id, { ativa: !l.ativa })}>
            <span className={`lam-bola${l.ativa ? " on" : ""}`} aria-hidden />
          </button>
          <span className="lam-n">{l.ativa ? String(laminas.slice(0, i + 1).filter((x) => x.ativa).length).padStart(2, "0") : "—"}</span>
          <span className="lam-corpo">
            <input className="fld lam-nome" value={l.nome} aria-label="Nome da lâmina"
              onChange={(e) => updateLamina(l.id, { nome: e.target.value })} />
            <small>{resumoDaLamina(l)}</small>
          </span>
          <span className="lam-acoes">
            <button className="btn btn--xs" onClick={() => onEditar(l.id)} title="Escolher as camadas, vendo a planta">✎ Camadas</button>
            <button className="btn btn--xs" disabled={i === 0} onClick={() => moverLamina(l.id, -1)} title="Subir">↑</button>
            <button className="btn btn--xs" disabled={i === laminas.length - 1} onClick={() => moverLamina(l.id, 1)} title="Descer">↓</button>
            <button className="btn btn--xs" onClick={() => duplicarLamina(l.id)} title="Duplicar">⧉</button>
            <button className="btn btn--xs" data-tom="perigo" onClick={() => removerLamina(l.id)} title="Remover">✕</button>
          </span>
        </div>
      ))}
    </section>
  );
}

// ── Editor: camadas à esquerda, planta viva à direita ───────────────────────

export function EditorLaminas({ id, onTrocar, onFechar }: {
  id: string;
  onTrocar: (id: string) => void;
  onFechar: () => void;
}) {
  const laminas = useProjeto((s) => s.cena.laminas ?? []);
  const setCamada = useProjeto((s) => s.setCamadaLamina);
  const updateLamina = useProjeto((s) => s.updateLamina);
  const lamina = laminas.find((l) => l.id === id);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  if (!lamina) return null;
  const c: CamadasLamina = lamina.camadas;

  return (
    <div className="lam-modal" role="dialog" aria-modal="true" aria-label={`Camadas da lâmina ${lamina.nome}`}>
      <div className="lam-modal-caixa mo-pop">
        <header className="lam-modal-topo">
          <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <span className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>CAMADAS DA LÂMINA</span>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
              A planta ao lado é a lâmina — o que você vê aqui é o que sai no papel.
            </span>
          </div>
          {laminas.length > 1 && (
            <select className="fld" style={{ width: 200 }} value={id} onChange={(e) => onTrocar(e.target.value)} aria-label="Lâmina">
              {laminas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          <button className="btn btn--sm" onClick={onFechar} style={{ marginLeft: "auto" }}>Concluir</button>
        </header>

        <div className="lam-modal-corpo">
          <aside className="lam-camadas">
            {ORDEM_CAMADAS.map((k) => (
              <button key={k} className="lam-camada" role="switch" aria-checked={c[k]}
                onClick={() => setCamada(lamina.id, k, !c[k])}>
                <span className={`lam-bola${c[k] ? " on" : ""}`} aria-hidden />
                <span>{ROTULO_CAMADA[k]}</span>
              </button>
            ))}
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 8, display: "grid", gap: 8 }}>
              <label className="lam-opcao">
                <input type="checkbox" checked={!!lamina.indice}
                  onChange={(e) => updateLamina(lamina.id, { indice: e.target.checked })} />
                <span>Lista numerada dos equipamentos ao lado</span>
              </label>
              <label style={{ display: "grid", gap: 3 }}>
                <span className="microlabel">Legenda impressa (opcional)</span>
                <input className="fld" value={lamina.legenda ?? ""} placeholder="sem legenda"
                  onChange={(e) => updateLamina(lamina.id, { legenda: e.target.value || null })} />
              </label>
            </div>
          </aside>

          <div className="lam-preview">
            {/* O canvas de verdade, em modo lâmina. Somente leitura: aqui não
                se edita o projeto, escolhe-se o que mostrar dele. */}
            <EditorCanvas
              camadasLamina={c}
              somenteLeitura
              modoCalibrar={false} onCalibrar={() => {}}
              onArea={() => {}} modoRecorte={false} onRecorte={() => {}}
              modoParede={false} onParede={() => {}} modoMoverPlanta={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
