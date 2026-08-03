import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../ui/Shell";
import { criarProjeto, atualizarProjeto, obterProjeto, online } from "../lib/supabase";
import { lerPlanta } from "../lib/planta";
import { BRL } from "../lib/units";
import { useLibrary } from "../store/libraryStore";
import { taxaDe, taxaLabel, type Cena, type PlantaFundo, type Projeto } from "../lib/types";

// ── Componentes de campo ───────────────────────────────────────────────
const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
    <span className="microlabel">{label}</span>
    {children}
  </label>
);

const Secao = ({ n, titulo, desc, children }: { n: string; titulo: string; desc?: string; children: React.ReactNode }) => (
  <section className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span className="brandface" style={{ fontSize: 26, color: "var(--gold)" }}>{n}</span>
      <div>
        <div className="brandface" style={{ fontSize: 19, letterSpacing: "0.02em" }}>{titulo}</div>
        {desc && <div style={{ color: "var(--muted)", fontSize: 12 }}>{desc}</div>}
      </div>
    </div>
    {children}
  </section>
);

/** Select com opções + "Outro…" que revela um campo livre (valores fora da lista viram "Outro"). */
function Sel({ value, onChange, opcoes }: { value: string; onChange: (v: string) => void; opcoes: string[] }) {
  const naLista = opcoes.includes(value);
  const outro = !!value && !naLista;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <select className="fld" value={outro ? "__outro__" : value} onChange={(e) => onChange(e.target.value === "__outro__" ? " " : e.target.value)}>
        <option value="">—</option>
        {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__outro__">Outro…</option>
      </select>
      {outro && <input className="fld" placeholder="Especifique…" value={value === " " ? "" : value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

/** Campo numérico — abre teclado numérico no iPad. */
const Num = (p: { value: string; onChange: (v: string) => void; placeholder?: string; decimal?: boolean }) => (
  <input className="fld" type="text" inputMode={p.decimal ? "decimal" : "numeric"} placeholder={p.placeholder}
    value={p.value} onChange={(e) => p.onChange(e.target.value.replace(p.decimal ? /[^\d.,]/g : /[^\d]/g, ""))} />
);

/** Campo de moeda — mostra R$ formatado e guarda o número. */
function Moeda({ valor, onChange }: { valor: number | null; onChange: (n: number | null) => void }) {
  const s = valor != null ? "R$ " + valor.toLocaleString("pt-BR") : "";
  return (
    <input className="fld" type="text" inputMode="numeric" placeholder="R$ 0" value={s}
      onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); onChange(d ? Number(d) : null); }} />
  );
}

// ── Opções de preenchimento rápido ─────────────────────────────────────
const FAIXAS = ["18–35 (jovem)", "30–55 (adulto)", "30–70 (misto)", "50+ (maduro)", "Familiar (todas as idades)"];
const FREQUENCIAS = ["Baixa — até 15 usos/dia", "Média — 15 a 40/dia", "Alta — 40 a 80/dia", "Muito alta — 80+/dia"];
const OBJETIVOS = ["Saúde e condicionamento", "Emagrecimento", "Hipertrofia / estética", "Reabilitação / mobilidade", "Bem-estar geral", "Misto"];
const ELETRICA = ["110V", "220V", "220V com quadro dedicado", "Trifásico", "A revisar / adequar"];
const CLIMATIZACAO = ["Sem climatização", "Ventilação natural", "Splits existentes", "Central / VRF", "A instalar"];
const PISOS = ["Contrapiso nivelado", "Cerâmica / porcelanato", "Vinílico existente", "Madeira / laminado", "A regularizar"];
const ACESSOS = ["Térreo", "Elevador social", "Elevador de serviço", "Escada", "Subsolo com elevador", "Rampa"];

const VAZIO = {
  nome: "", cep: "", endereco: "", numero: "", sindico: "", contato: "", contatoAdmin: "",
  faixa: "", frequencia: "", uso: "Autônomo (sem professor)", moradores: "", objetivo: "",
  eletrica: "", climatizacao: "", piso: "", acesso: "",
  observacoes: "", largura: "1000", profundidade: "800",
};

// ── Foto da fachada: reduz para caber no banco ──────────────────────────
async function lerFotoReduzida(file: File): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const max = 1400, sc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

export default function LeituraScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const taxa = taxaDe(useLibrary((s) => s.config));
  const editando = !!id && id !== "heritage";

  const [f, setF] = useState({ ...VAZIO });
  const [foto, setFoto] = useState<string | null>(null);
  const [planta, setPlanta] = useState<PlantaFundo | null>(null);
  const [orcamento, setOrcamento] = useState<number | null>(null);
  const [cenaExistente, setCenaExistente] = useState<Cena | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cepMsg, setCepMsg] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(editando);

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const teto = orcamento || 0;

  useEffect(() => {
    if (!editando) return;
    (async () => {
      try {
        const p = await obterProjeto(id!);
        if (!p) { setErro("Projeto não encontrado."); return; }
        const perfil = p.perfil ?? {}; const infra = p.infraestrutura ?? {};
        setF({
          nome: p.nome ?? "", cep: p.cep ?? "", endereco: p.endereco ?? "", numero: "",
          sindico: p.sindico ?? "", contato: p.contato ?? "", contatoAdmin: p.contato_admin ?? "",
          faixa: perfil.faixa_etaria ?? "", frequencia: perfil.frequencia ?? "", uso: perfil.uso ?? "Autônomo (sem professor)",
          moradores: perfil.moradores ?? "", objetivo: perfil.objetivo ?? "",
          eletrica: infra.eletrica ?? "", climatizacao: infra.climatizacao ?? "", piso: infra.piso ?? "", acesso: infra.acesso ?? "",
          observacoes: p.observacoes ?? "",
          largura: String(p.cena?.sala.largura_cm ?? 1000), profundidade: String(p.cena?.sala.profundidade_cm ?? 800),
        });
        setOrcamento(p.orcamento_teto ?? null);
        setFoto(p.foto_fachada ?? null);
        setCenaExistente(p.cena ?? null);
        setPlanta(p.cena?.planta ?? null);
      } catch (e) { setErro((e as Error).message); }
      finally { setCarregando(false); }
    })();
  }, [editando, id]);

  async function buscarCep(cepRaw: string) {
    const cep = cepRaw.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setCepMsg("Buscando endereço…");
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) { setCepMsg("CEP não encontrado."); return; }
      const linha = [d.logradouro, d.bairro, [d.localidade, d.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
      setF((x) => ({ ...x, endereco: linha }));
      setCepMsg("Endereço preenchido ✓");
    } catch { setCepMsg("Não consegui buscar o CEP agora — preencha o endereço manualmente."); }
  }

  async function importarPlanta(file?: File | null) {
    if (!file) return;
    setBusy("Lendo planta…"); setErro(null);
    try {
      const bmp = await lerPlanta(file);
      const largura_cm = Number(f.largura) || 1000;
      setPlanta({ dataUrl: bmp.dataUrl, larguraPx: bmp.larguraPx, alturaPx: bmp.alturaPx, x_cm: 0, y_cm: 0, cmPorPx: largura_cm / bmp.larguraPx, rotacao: 0, opacidade: 0.55, bloqueada: false });
    } catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  async function anexarFoto(file?: File | null) {
    if (!file) return;
    setBusy("Processando foto…"); setErro(null);
    try { setFoto(await lerFotoReduzida(file)); } catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  function montarPatch(): Partial<Projeto> {
    const t = (s: string) => s.trim();
    const enderecoFinal = [t(f.endereco), f.numero.trim() && `nº ${f.numero.trim()}`].filter(Boolean).join(", ");
    const cena: Cena = {
      sala: { largura_cm: Number(f.largura) || 1000, profundidade_cm: Number(f.profundidade) || 800, config: cenaExistente?.sala.config },
      planta, itens: cenaExistente?.itens ?? [],
    };
    return {
      nome: t(f.nome), sindico: t(f.sindico) || null, contato: t(f.contato) || null, contato_admin: t(f.contatoAdmin) || null,
      cep: f.cep.replace(/\D/g, "") || null, endereco: enderecoFinal || null, foto_fachada: foto,
      orcamento_teto: orcamento,
      perfil: { faixa_etaria: t(f.faixa), frequencia: t(f.frequencia), uso: t(f.uso), moradores: t(f.moradores), objetivo: t(f.objetivo) },
      infraestrutura: { eletrica: t(f.eletrica), climatizacao: t(f.climatizacao), piso: t(f.piso), acesso: t(f.acesso) },
      observacoes: t(f.observacoes) || null, cena,
    };
  }

  async function salvar(avancar: boolean) {
    if (!f.nome.trim()) { setErro("Preencha o nome do condomínio."); return; }
    if (!online) { setErro("Supabase não configurado."); return; }
    setBusy(avancar ? "Salvando…" : "Salvando leitura…"); setErro(null);
    try {
      const patch = montarPatch();
      const p = editando ? await atualizarProjeto(id!, patch) : await criarProjeto(patch);
      if (avancar) nav(`/projeto/${p.id}`); else nav("/");
    } catch (e) { setErro((e as Error).message); setBusy(null); }
  }

  const cepFmt = (v: string) => { const d = v.replace(/\D/g, "").slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };

  if (carregando) return <Shell><p style={{ color: "var(--muted)" }}>Carregando leitura…</p></Shell>;

  return (
    <Shell actions={<button className="btn" onClick={() => nav("/")}>← Início</button>}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="microlabel">Fase 01 · Diagnóstico</div>
        <h1 className="brandface" style={{ fontSize: 34, color: "var(--gold)", marginTop: 6, marginBottom: 4 }}>Leitura do Condomínio</h1>
        <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 20, lineHeight: 1.6, maxWidth: 640 }}>
          Preenchimento rápido: o CEP traz o endereço, os campos são de seleção e os números abrem o teclado numérico. Quanto mais fiel a leitura, melhor o projeto.
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <Secao n="A" titulo="Identificação" desc="O condomínio, o endereço e quem conduz a decisão.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
              <Campo label="CEP">
                <input className="fld" type="text" inputMode="numeric" placeholder="00000-000" value={cepFmt(f.cep)}
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 8); set("cep")(v); setCepMsg(null); if (v.length === 8) buscarCep(v); }} />
              </Campo>
              <Campo label="Condomínio"><input className="fld" value={f.nome} placeholder="Ex.: Residencial Aurora" onChange={(e) => set("nome")(e.target.value)} /></Campo>
            </div>
            {cepMsg && <div style={{ fontSize: 12, color: cepMsg.includes("✓") ? "var(--green)" : "var(--muted)", marginTop: -4 }}>{cepMsg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "3fr 1fr", gap: 14 }}>
              <Campo label="Endereço"><input className="fld" value={f.endereco} placeholder="Preenchido pelo CEP — ajuste se precisar" onChange={(e) => set("endereco")(e.target.value)} /></Campo>
              <Campo label="Número"><Num value={f.numero} onChange={set("numero")} placeholder="nº" /></Campo>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <Campo label="Síndico (nome)"><input className="fld" value={f.sindico} onChange={(e) => set("sindico")(e.target.value)} /></Campo>
              <Campo label="Contato do síndico"><input className="fld" type="tel" inputMode="tel" placeholder="Telefone / WhatsApp" value={f.contato} onChange={(e) => set("contato")(e.target.value)} /></Campo>
              <Campo label="Contato administrativo"><input className="fld" placeholder="Nome · telefone" value={f.contatoAdmin} onChange={(e) => set("contatoAdmin")(e.target.value)} /></Campo>
            </div>
            <Campo label="Foto da fachada">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                {foto && <img src={foto} alt="fachada" style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)" }} />}
                <label className="btn btn-blue" style={{ cursor: "pointer" }}>
                  {busy === "Processando foto…" ? "Processando…" : foto ? "Trocar foto" : "⭱ Enviar foto"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => anexarFoto(e.target.files?.[0])} />
                </label>
                {foto && <button className="btn" onClick={() => setFoto(null)}>Remover</button>}
              </div>
            </Campo>
          </Secao>

          <Secao n="B" titulo="Investimento" desc="O teto define o honorário e baliza os cenários.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, alignItems: "end" }}>
              <Campo label="Orçamento-teto"><Moeda valor={orcamento} onChange={setOrcamento} /></Campo>
              <div style={{ fontSize: 13, color: "var(--gold)", paddingBottom: 12 }}>
                Honorário da assessoria ({taxaLabel(taxa)}): <b>{BRL(Math.round(teto * taxa))}</b>
              </div>
            </div>
          </Secao>

          <Secao n="C" titulo="Perfil de uso" desc="Quem vai usar, com que frequência e com qual objetivo.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <Campo label="Faixa etária"><Sel value={f.faixa} onChange={set("faixa")} opcoes={FAIXAS} /></Campo>
              <Campo label="Frequência esperada"><Sel value={f.frequencia} onChange={set("frequencia")} opcoes={FREQUENCIAS} /></Campo>
              <Campo label="Moradores"><Num value={f.moradores} onChange={set("moradores")} placeholder="Ex.: 320" /></Campo>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Campo label="Uso">
                <select className="fld" value={f.uso} onChange={(e) => set("uso")(e.target.value)}>
                  <option value="Autônomo (sem professor)">Autônomo (sem professor)</option>
                  <option value="Assistido (com professor)">Assistido (com professor)</option>
                </select>
              </Campo>
              <Campo label="Objetivo predominante"><Sel value={f.objetivo} onChange={set("objetivo")} opcoes={OBJETIVOS} /></Campo>
            </div>
          </Secao>

          <Secao n="D" titulo="Infraestrutura" desc="O que o local oferece e o que precisa ser adequado.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Campo label="Elétrica"><Sel value={f.eletrica} onChange={set("eletrica")} opcoes={ELETRICA} /></Campo>
              <Campo label="Climatização"><Sel value={f.climatizacao} onChange={set("climatizacao")} opcoes={CLIMATIZACAO} /></Campo>
              <Campo label="Piso / contrapiso"><Sel value={f.piso} onChange={set("piso")} opcoes={PISOS} /></Campo>
              <Campo label="Acesso"><Sel value={f.acesso} onChange={set("acesso")} opcoes={ACESSOS} /></Campo>
            </div>
          </Secao>

          <Secao n="E" titulo="Espaço" desc="Dimensões da sala ou a planta baixa (calibre no editor).">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 14, alignItems: "end" }}>
              <Campo label="Largura (cm)"><Num value={f.largura} onChange={set("largura")} /></Campo>
              <Campo label="Profundidade (cm)"><Num value={f.profundidade} onChange={set("profundidade")} /></Campo>
              <label className="btn btn-blue" style={{ textAlign: "center", cursor: "pointer" }}>
                {busy === "Lendo planta…" ? "Lendo…" : planta ? "✓ Planta anexada" : "⭱ Planta baixa"}
                <input type="file" style={{ display: "none" }} onChange={(e) => importarPlanta(e.target.files?.[0])} />
              </label>
            </div>
            {planta && <div style={{ fontSize: 12, color: "var(--muted)" }}>Planta anexada ({planta.larguraPx}×{planta.alturaPx}px). A calibração de escala é feita no editor.</div>}
          </Secao>

          <Secao n="F" titulo="Observações" desc="Notas livres para o dossiê.">
            <textarea className="fld" value={f.observacoes} placeholder="Restrições, expectativas do síndico, prazos…" onChange={(e) => set("observacoes")(e.target.value)} />
          </Secao>
        </div>

        {erro && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 14 }}>{erro}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 18, position: "sticky", bottom: 0, paddingBottom: 4 }}>
          <button className="btn btn-gold" disabled={!!busy} onClick={() => salvar(true)}>
            {busy ? busy : editando ? "Salvar e abrir editor" : "Criar e ir ao Projeto Funcional →"}
          </button>
          <button className="btn" disabled={!!busy} onClick={() => salvar(false)}>Salvar leitura</button>
          <button className="btn" onClick={() => nav("/")}>Cancelar</button>
        </div>
      </div>
    </Shell>
  );
}
