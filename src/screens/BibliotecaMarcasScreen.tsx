import { useRef, useState } from "react";
import Shell from "../ui/Shell";
import { useLibrary } from "../store/libraryStore";
import {
  inserirMarca, atualizarMarca as atualizarNoBanco, removerMarca as removerNoBanco, online,
} from "../lib/supabase";
import { MARCAS_BASE, refDaMarca } from "../lib/marcas";
import { TIPOS_MARCA, type Marca, type TipoMarca } from "../lib/types";
import { reduzirPng } from "../lib/imagem";

const TIPOS = Object.keys(TIPOS_MARCA) as TipoMarca[];

const VAZIA: Marca = {
  nome: "", tipo: "equipamento", origem: "", grupo: "", resumo: "", site: "", fonte: "",
  cor: "#b8704a", logo: null, garantia: "", assistencia: "", chaves: [], ativo: true,
};

/** Chaves de detecção: uma linha de texto vira lista, e vice-versa. */
const chavesTexto = (m: Marca) => (m.chaves ?? []).join(", ");
const chavesLista = (txt: string) =>
  txt.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean);

const Campo = ({ label, largura, children }: { label: string; largura: number; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 5, width: largura, minWidth: 0 }}>
    <span className="microlabel">{label}</span>
    {children}
  </label>
);

export default function BibliotecaMarcasScreen() {
  const marcas = useLibrary((s) => s.marcas);
  const addMarcas = useLibrary((s) => s.addMarcas);
  const updateMarca = useLibrary((s) => s.updateMarca);
  const removerMarcaLocal = useLibrary((s) => s.removerMarca);

  const [form, setForm] = useState<Marca>(VAZIA);
  const [chaves, setChaves] = useState("");
  // `ref` = id do banco ou, no modo local, o nome. Nulo = formulário de cadastro.
  const [editando, setEditando] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<Marca>) => setForm((f) => ({ ...f, ...p }));

  function limpar() {
    setForm(VAZIA); setChaves(""); setEditando(null);
  }

  function editar(m: Marca) {
    setForm({ ...VAZIA, ...m });
    setChaves(chavesTexto(m));
    setEditando(m.id || m.nome);
    setStatus(null);
  }

  async function onLogo(file?: File | null) {
    if (!file) return;
    setOcupado(true);
    // PNG e não JPEG: logo com fundo transparente vira fundo preto no
    // Dossiê, que é branco.
    try { patch({ logo: await reduzirPng(file, 400) }); }
    catch (e) { setStatus("Não consegui ler a imagem: " + (e as Error).message); }
    finally { setOcupado(false); }
  }

  async function salvar() {
    const nome = form.nome.trim();
    if (!nome) return;
    // Sem chave declarada, a marca é procurada pelo próprio nome — que é o que
    // funciona na maioria dos casos. Só grafia alternativa precisa de chave.
    const registro: Marca = { ...form, nome, chaves: chavesLista(chaves) };
    setOcupado(true); setStatus(null);
    // A lista local responde primeiro: o cadastro tem de funcionar offline e
    // enquanto a migração 018 não é aplicada.
    if (editando) {
      updateMarca(editando, registro);
      if (online && registro.id) {
        try { await atualizarNoBanco(registro.id, registro); setStatus("Marca atualizada."); }
        catch (e) { setStatus("Alterada localmente (Supabase: " + (e as Error).message + ")"); }
      } else setStatus("Alterada localmente.");
    } else if (online) {
      try { addMarcas([await inserirMarca(registro)]); setStatus("Marca cadastrada."); }
      catch (e) { addMarcas([registro]); setStatus("Cadastrada localmente (Supabase: " + (e as Error).message + ")"); }
    } else {
      addMarcas([registro]);
      setStatus("Cadastrada localmente (Supabase não configurado).");
    }
    limpar();
    setOcupado(false);
  }

  async function remover(m: Marca) {
    removerMarcaLocal(m.id || m.nome);
    if (editando === (m.id || m.nome)) limpar();
    if (online && m.id) { try { await removerNoBanco(m.id); } catch { /* segue: a lista local já saiu */ } }
    setStatus(`"${m.nome}" removida.`);
  }

  async function semear() {
    const existentes = new Set(marcas.map((m) => refDaMarca(m.nome)));
    const faltam = MARCAS_BASE.filter((m) => !existentes.has(refDaMarca(m.nome)));
    if (!faltam.length) { setStatus("A base de marcas já está toda na biblioteca."); return; }
    setOcupado(true); setStatus(null);
    addMarcas(faltam);
    if (online) {
      let n = 0;
      for (const m of faltam) { try { await inserirMarca(m); n++; } catch { /* segue */ } }
      setStatus(`${n} marca(s) da base adicionadas.`);
    } else setStatus(`${faltam.length} adicionadas localmente (Supabase não configurado).`);
    setOcupado(false);
  }

  const comTexto = marcas.filter((m) => m.resumo).length;

  return (
    <Shell>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 className="brandface" style={{ fontSize: 28, color: "var(--gold)", marginBottom: 4 }}>BIBLIOTECA DE MARCAS</h1>
        <button className="btn" disabled={ocupado} onClick={() => void semear()}>✦ Semear base</button>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>
        Fabricantes apresentados no Dossiê. {marcas.length} marca(s), {comTexto} com texto.
        {status ? " · " + status : ""}
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginBottom: 20,
        padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" }}>
        <Campo label="Marca" largura={190}>
          <input className="fld" placeholder="Ex.: Movement" value={form.nome}
            onChange={(e) => patch({ nome: e.target.value })} />
        </Campo>
        <Campo label="Tipo" largura={140}>
          <select className="fld" value={form.tipo ?? "equipamento"}
            onChange={(e) => patch({ tipo: e.target.value as TipoMarca })}>
            {TIPOS.map((t) => <option key={t} value={t}>{TIPOS_MARCA[t]}</option>)}
          </select>
        </Campo>
        <Campo label="Origem" largura={170}>
          <input className="fld" placeholder="Brasil · Pompéia/SP" value={form.origem ?? ""}
            onChange={(e) => patch({ origem: e.target.value })} />
        </Campo>
        <Campo label="Grupo controlador" largura={190}>
          <input className="fld" placeholder="Core Health & Fitness" value={form.grupo ?? ""}
            onChange={(e) => patch({ grupo: e.target.value })} />
        </Campo>
        <Campo label="Chaves de detecção" largura={220}>
          <input className="fld" placeholder="movement, moviment, movimente" value={chaves}
            onChange={(e) => setChaves(e.target.value)} />
        </Campo>
        <Campo label="Cor" largura={70}>
          <input className="fld" style={{ padding: 4, height: 42 }} type="color" value={form.cor || "#b8704a"}
            onChange={(e) => patch({ cor: e.target.value })} />
        </Campo>
        <Campo label="Ordem" largura={80}>
          <input className="fld" type="number" value={form.ordem ?? ""}
            onChange={(e) => patch({ ordem: e.target.value === "" ? null : +e.target.value })} />
        </Campo>

        <Campo label="Resumo (2–3 frases factuais)" largura={520}>
          <textarea className="fld" rows={3} value={form.resumo ?? ""}
            placeholder="O que a marca é, de onde vem e o que a sustenta — sem adjetivo de vitrine."
            onChange={(e) => patch({ resumo: e.target.value })} />
        </Campo>
        <Campo label="Fonte do texto" largura={230}>
          <input className="fld" placeholder="Site oficial da marca" value={form.fonte ?? ""}
            onChange={(e) => patch({ fonte: e.target.value })} />
        </Campo>
        <Campo label="Site" largura={200}>
          <input className="fld" placeholder="marca.com.br" value={form.site ?? ""}
            onChange={(e) => patch({ site: e.target.value })} />
        </Campo>
        <Campo label="Garantia" largura={170}>
          <input className="fld" placeholder="12 meses" value={form.garantia ?? ""}
            onChange={(e) => patch({ garantia: e.target.value })} />
        </Campo>
        <Campo label="Assistência técnica" largura={200}>
          <input className="fld" placeholder="Rede própria · São Paulo" value={form.assistencia ?? ""}
            onChange={(e) => patch({ assistencia: e.target.value })} />
        </Campo>

        <Campo label="Logo" largura={210}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => void onLogo(e.target.files?.[0])} />
            {/* Fundo claro: logo é feito para papel, e o Dossiê é branco. */}
            <span style={{ width: 42, height: 42, borderRadius: 8, background: form.logo ? "#fff" : "var(--panel-2)",
              border: "1px solid var(--line)", display: "grid", placeItems: "center", overflow: "hidden" }}>
              {form.logo
                ? <img src={form.logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} />
                : <span style={{ color: "var(--muted)", fontSize: 16 }}>◱</span>}
            </span>
            <button className="btn btn--sm" onClick={() => logoRef.current?.click()}>⭱ Enviar</button>
            {form.logo && <button className="btn btn--sm" onClick={() => patch({ logo: null })}>Tirar</button>}
          </div>
        </Campo>

        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          {editando && <button className="btn" onClick={limpar}>Cancelar</button>}
          <button className="btn btn-gold" disabled={!form.nome.trim() || ocupado} onClick={() => void salvar()}>
            {editando ? "Salvar alterações" : "Adicionar"}
          </button>
        </div>
      </div>

      {!marcas.length && <p style={{ color: "var(--muted)", fontSize: 14 }}>Nenhuma marca cadastrada ainda.</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
        {marcas.map((m, i) => (
          <div key={(m.id || m.nome) + i} className="card" style={{ padding: 12, display: "grid", gap: 8, alignContent: "start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: 7, flex: "0 0 auto", overflow: "hidden",
                background: m.logo ? "#fff" : (m.cor || "var(--panel-2)"), border: "1px solid var(--line)",
                display: "grid", placeItems: "center" }}>
                {m.logo ? <img src={m.logo} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} /> : null}
              </span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 14, minWidth: 0 }}>{m.nome}</span>
              <span className="microlabel">{m.tipo ? TIPOS_MARCA[m.tipo] : "—"}</span>
            </div>
            <div className="microlabel" style={{ letterSpacing: "0.08em", textTransform: "none" }}>
              {[m.origem, m.grupo && `Grupo ${m.grupo}`].filter(Boolean).join(" · ") || "Origem não informada"}
            </div>
            <p style={{ color: "var(--text-3)", fontSize: 12, lineHeight: 1.5, margin: 0,
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {m.resumo || "Sem texto de apresentação — a marca sai só pelo nome no Dossiê."}
            </p>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(m.chaves ?? []).length ? <span className="microlabel" style={{ flex: 1 }}>{(m.chaves ?? []).length} chave(s)</span> : <span style={{ flex: 1 }} />}
              <button className="btn btn--sm" onClick={() => editar(m)}>✎ Editar</button>
              <button className="btn btn--sm" onClick={() => void remover(m)}>Remover</button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
