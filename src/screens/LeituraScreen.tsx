import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../ui/Shell";
import { criarProjeto, atualizarProjeto, obterProjeto, online } from "../lib/supabase";
import { lerPlanta } from "../lib/planta";
import { BRL } from "../lib/units";
import { useLibrary } from "../store/libraryStore";
import {
  taxaDe, taxaLabel, PADROES_CONDOMINIO, INVESTIMENTO_PERFIL, PRIORIDADES_ACADEMIA,
  PAPEIS_CONTATO, enderecoEmLinha, formatarTelefone,
  type Cena, type ContatoProjeto, type PapelContato, type PlantaFundo, type Projeto,
} from "../lib/types";

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

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const VAZIO = {
  nome: "", cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  faixa: "", frequencia: "", uso: "Autônomo (sem professor)", moradores: "", objetivo: "",
  padrao: "", investimentoPerfil: "",
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
  // Passo 1 = identificação; passo 2 = o que vem do formulário do síndico.
  const [passo, setPasso] = useState<1 | 2>(1);
  // Contatos: o projeto aceita vários (síndico + administradora), cada um com
  // papel e canais próprios.
  const [contatos, setContatos] = useState<ContatoProjeto[]>([
    { id: crypto.randomUUID(), nome: "", papel: "sindico", whatsapp: "", email: "" },
  ]);
  const setContato = (cid: string, patch: Partial<ContatoProjeto>) =>
    setContatos((xs) => xs.map((c) => (c.id === cid ? { ...c, ...patch } : c)));
  // Prioridades em ORDEM: o toque adiciona no fim; tocar de novo remove.
  // A ordem escolhida é a ordem da matriz de priorização no Dossiê.
  const [prioridades, setPrioridades] = useState<string[]>([]);
  const togglePrioridade = (p: string) =>
    setPrioridades((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
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
          nome: p.nome ?? "", cep: p.cep ?? p.endereco_det?.cep ?? "",
          rua: p.endereco_det?.rua ?? p.endereco ?? "", numero: p.endereco_det?.numero ?? "",
          complemento: p.endereco_det?.complemento ?? "", bairro: p.endereco_det?.bairro ?? "",
          cidade: p.endereco_det?.cidade ?? "", estado: p.endereco_det?.estado ?? "",
          faixa: perfil.faixa_etaria ?? "", frequencia: perfil.frequencia ?? "", uso: perfil.uso ?? "Autônomo (sem professor)",
          moradores: perfil.moradores ?? "", objetivo: perfil.objetivo ?? "",
          padrao: perfil.padrao ?? "", investimentoPerfil: perfil.investimento_perfil ?? "",
          eletrica: infra.eletrica ?? "", climatizacao: infra.climatizacao ?? "", piso: infra.piso ?? "", acesso: infra.acesso ?? "",
          observacoes: p.observacoes ?? "",
          largura: String(p.cena?.sala.largura_cm ?? 1000), profundidade: String(p.cena?.sala.profundidade_cm ?? 800),
        });
        setPrioridades(Array.isArray(perfil.prioridades) ? perfil.prioridades : []);
        // Contatos: usa a lista nova; sem ela, remonta a partir dos campos antigos.
        const lista = Array.isArray(p.contatos) && p.contatos.length ? p.contatos : [
          ...(p.sindico || p.contato ? [{ id: crypto.randomUUID(), nome: p.sindico ?? "", papel: "sindico" as PapelContato, whatsapp: (p.contato ?? "").replace(/\D/g, ""), email: "" }] : []),
          ...(p.contato_admin ? [{ id: crypto.randomUUID(), nome: (p.contato_admin.split(/[–\-·]/)[0] ?? "").trim(), papel: "administrador" as PapelContato, whatsapp: (p.contato_admin.match(/[\d]{8,}/)?.[0] ?? ""), email: "" }] : []),
        ];
        setContatos(lista.length ? lista : [{ id: crypto.randomUUID(), nome: "", papel: "sindico", whatsapp: "", email: "" }]);
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
      setF((x) => ({ ...x, rua: d.logradouro || x.rua, bairro: d.bairro || x.bairro, cidade: d.localidade || x.cidade, estado: d.uf || x.estado }));
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
    const endereco_det = {
      cep: f.cep.replace(/\D/g, "") || null, rua: t(f.rua) || null, numero: t(f.numero) || null,
      complemento: t(f.complemento) || null, bairro: t(f.bairro) || null,
      cidade: t(f.cidade) || null, estado: t(f.estado) || null,
    };
    const enderecoFinal = enderecoEmLinha(endereco_det);
    // Lista limpa + os campos antigos derivados dela (o Dossiê e o formulário
    // do síndico continuam lendo `sindico`/`contato`/`contato_admin`).
    const contatosLimpos = contatos.filter((c) => t(c.nome) || t(c.whatsapp ?? "") || t(c.email ?? ""))
      .map((c) => ({ ...c, nome: t(c.nome), whatsapp: (c.whatsapp ?? "").replace(/\D/g, "") || null, email: t(c.email ?? "") || null }));
    const oSindico = contatosLimpos.find((c) => c.papel === "sindico") ?? contatosLimpos[0];
    const oAdmin = contatosLimpos.find((c) => c.papel === "administrador");
    const cena: Cena = {
      sala: { largura_cm: Number(f.largura) || 1000, profundidade_cm: Number(f.profundidade) || 800, config: cenaExistente?.sala.config },
      planta, itens: cenaExistente?.itens ?? [],
    };
    return {
      nome: t(f.nome),
      sindico: oSindico?.nome || null,
      contato: oSindico ? (formatarTelefone(oSindico.whatsapp) || oSindico.email || null) : null,
      contato_admin: oAdmin ? [oAdmin.nome, formatarTelefone(oAdmin.whatsapp) || oAdmin.email].filter(Boolean).join(" · ") || null : null,
      contatos: contatosLimpos.length ? contatosLimpos : null,
      cep: f.cep.replace(/\D/g, "") || null, endereco: enderecoFinal || null, endereco_det, foto_fachada: foto,
      orcamento_teto: orcamento,
      perfil: {
        faixa_etaria: t(f.faixa), frequencia: t(f.frequencia), uso: t(f.uso), moradores: t(f.moradores), objetivo: t(f.objetivo),
        padrao: t(f.padrao) || undefined, investimento_perfil: t(f.investimentoPerfil) || undefined,
        prioridades: prioridades.length ? prioridades : undefined,
      },
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

  const podeAvancar = !!f.nome.trim();

  return (
    <Shell actions={<>
      {passo === 2 && <button className="btn" onClick={() => setPasso(1)}>← Identificação</button>}
      <button className="btn" onClick={() => nav("/")}>← Início</button>
    </>}>
      {/* Largura cheia: o app roda em iPad deitado — usar a tela toda é o que
          tira a rolagem. Os blocos se distribuem em colunas. */}
      <div style={{ width: "100%", margin: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="microlabel">Fase 01 · Diagnóstico · Passo {passo} de 2</div>
            <h1 className="brandface" style={{ fontSize: 30, color: "var(--gold)", marginTop: 4, marginBottom: 2 }}>
              {passo === 1 ? "Leitura do Condomínio" : "Formulário do Síndico"}
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              {passo === 1
                ? "Quem é o condomínio, quem decide e onde fica. O CEP preenche o endereço."
                : "O que o síndico responderia no formulário público. Se ele não preencheu, preencha aqui."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {([1, 2] as const).map((n) => (
              <button key={n} className="btn" onClick={() => setPasso(n)}
                style={{ padding: "7px 14px", fontSize: 12, ...(passo === n ? { borderColor: "var(--gold)", color: "var(--gold)", background: "var(--gold-soft)" } : {}) }}>
                {n}. {n === 1 ? "Identificação" : "Formulário"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          {passo === 1 ? (
            <>
              {/* Condomínio + contatos lado a lado — a tela deitada comporta */}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(420px, 1.6fr)", gap: 14, alignItems: "start" }}>
                <Secao n="A" titulo="Condomínio" desc="O nome que abre o Dossiê.">
                  <Campo label="Nome do condomínio">
                    <input className="fld" value={f.nome} placeholder="Ex.: Residencial Aurora" onChange={(e) => set("nome")(e.target.value)} />
                  </Campo>
                </Secao>

                <Secao n="B" titulo="Contatos" desc="Quem representa o condomínio. Pode ter mais de um — síndico, administradora…">
                  <div style={{ display: "grid", gap: 8 }}>
                    {contatos.map((c, i) => (
                      <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.1fr 1.4fr auto", gap: 8, alignItems: "end" }}>
                        <Campo label={i === 0 ? "Nome" : ""}>
                          <input className="fld" value={c.nome} placeholder="Nome" onChange={(e) => setContato(c.id, { nome: e.target.value })} />
                        </Campo>
                        <Campo label={i === 0 ? "Papel" : ""}>
                          <select className="fld" value={c.papel} onChange={(e) => setContato(c.id, { papel: e.target.value as PapelContato })}>
                            {(Object.keys(PAPEIS_CONTATO) as PapelContato[]).map((k) => <option key={k} value={k}>{PAPEIS_CONTATO[k]}</option>)}
                          </select>
                        </Campo>
                        <Campo label={i === 0 ? "WhatsApp" : ""}>
                          <input className="fld" type="tel" inputMode="tel" placeholder="(00) 00000-0000"
                            value={formatarTelefone(c.whatsapp)}
                            onChange={(e) => setContato(c.id, { whatsapp: e.target.value.replace(/\D/g, "").slice(0, 11) })} />
                        </Campo>
                        <Campo label={i === 0 ? "E-mail" : ""}>
                          <input className="fld" type="email" inputMode="email" placeholder="nome@email.com"
                            value={c.email ?? ""} onChange={(e) => setContato(c.id, { email: e.target.value })} />
                        </Campo>
                        <button className="btn" style={{ padding: "9px 11px" }} disabled={contatos.length === 1}
                          title="Remover contato"
                          onClick={() => setContatos((xs) => xs.filter((x) => x.id !== c.id))}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button className="btn" style={{ justifySelf: "start", padding: "6px 12px", fontSize: 11.5 }}
                    onClick={() => setContatos((xs) => [...xs, { id: crypto.randomUUID(), nome: "", papel: xs.some((c) => c.papel === "sindico") ? "administrador" : "sindico", whatsapp: "", email: "" }])}>
                    ＋ Contato
                  </button>
                </Secao>
              </div>

              {/* Endereço (CEP puxa o resto) + foto lado a lado */}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(520px, 2.2fr) minmax(260px, 1fr)", gap: 14, alignItems: "start" }}>
                <Secao n="C" titulo="Endereço" desc="Digite o CEP — rua, bairro, cidade e estado vêm preenchidos.">
                  <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 110px", gap: 12 }}>
                    <Campo label="CEP">
                      <input className="fld" type="text" inputMode="numeric" placeholder="00000-000" value={cepFmt(f.cep)}
                        onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 8); set("cep")(v); setCepMsg(null); if (v.length === 8) buscarCep(v); }} />
                    </Campo>
                    <Campo label="Rua"><input className="fld" value={f.rua} onChange={(e) => set("rua")(e.target.value)} /></Campo>
                    <Campo label="Número"><Num value={f.numero} onChange={set("numero")} placeholder="nº" /></Campo>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 110px", gap: 12 }}>
                    <Campo label="Complemento"><input className="fld" value={f.complemento} placeholder="Bloco, torre…" onChange={(e) => set("complemento")(e.target.value)} /></Campo>
                    <Campo label="Bairro"><input className="fld" value={f.bairro} onChange={(e) => set("bairro")(e.target.value)} /></Campo>
                    <Campo label="Cidade"><input className="fld" value={f.cidade} onChange={(e) => set("cidade")(e.target.value)} /></Campo>
                    <Campo label="Estado">
                      <select className="fld" value={f.estado} onChange={(e) => set("estado")(e.target.value)}>
                        <option value="">—</option>
                        {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Campo>
                  </div>
                  {cepMsg && <div style={{ fontSize: 12, color: cepMsg.includes("✓") ? "var(--green)" : "var(--muted)" }}>{cepMsg}</div>}
                </Secao>

                <Secao n="D" titulo="Foto da fachada" desc="Abre o Dossiê — o síndico reconhece o prédio dele.">
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    {foto && <img src={foto} alt="fachada" style={{ width: 132, height: 88, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line-2)" }} />}
                    <label className="btn btn-blue" style={{ cursor: "pointer" }}>
                      {busy === "Processando foto…" ? "Processando…" : foto ? "Trocar foto" : "⭱ Enviar foto"}
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => anexarFoto(e.target.files?.[0])} />
                    </label>
                    {foto && <button className="btn" onClick={() => setFoto(null)}>Remover</button>}
                  </div>
                </Secao>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: "var(--muted)", background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 12px" }}>
                Estes são os campos do <b style={{ color: "#e9e9e6" }}>formulário público do síndico</b>. Se ele já respondeu, chegam preenchidos pela caixa de Solicitações — senão, preencha com ele na visita.
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1fr) minmax(420px, 1.7fr)", gap: 14, alignItems: "start" }}>
                <Secao n="1" titulo="Investimento" desc="O teto define o honorário e baliza os cenários.">
                  <Campo label="Orçamento-teto"><Moeda valor={orcamento} onChange={setOrcamento} /></Campo>
                  <div style={{ fontSize: 12.5, color: "var(--gold)" }}>
                    Honorário da assessoria ({taxaLabel(taxa)}): <b>{BRL(Math.round(teto * taxa))}</b>
                  </div>
                </Secao>

                <Secao n="2" titulo="Perfil de uso" desc="Quem vai usar, com que frequência e com qual objetivo.">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <Campo label="Faixa etária"><Sel value={f.faixa} onChange={set("faixa")} opcoes={FAIXAS} /></Campo>
                    <Campo label="Frequência esperada"><Sel value={f.frequencia} onChange={set("frequencia")} opcoes={FREQUENCIAS} /></Campo>
                    <Campo label="Moradores"><Num value={f.moradores} onChange={set("moradores")} placeholder="Ex.: 320" /></Campo>
                    <Campo label="Uso">
                      <select className="fld" value={f.uso} onChange={(e) => set("uso")(e.target.value)}>
                        <option value="Autônomo (sem professor)">Autônomo (sem professor)</option>
                        <option value="Assistido (com professor)">Assistido (com professor)</option>
                      </select>
                    </Campo>
                    <Campo label="Objetivo predominante"><Sel value={f.objetivo} onChange={set("objetivo")} opcoes={OBJETIVOS} /></Campo>
                  </div>
                </Secao>
              </div>

              <Secao n="3" titulo="Padrão & prioridades" desc="É daqui que sai a matriz de priorização do Dossiê — toque as prioridades NA ORDEM de importância.">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Campo label="Padrão do condomínio"><Sel value={f.padrao} onChange={set("padrao")} opcoes={PADROES_CONDOMINIO} /></Campo>
                  <Campo label="Orçamento frente ao padrão"><Sel value={f.investimentoPerfil} onChange={set("investimentoPerfil")} opcoes={INVESTIMENTO_PERFIL} /></Campo>
                </div>
                <div>
                  <span className="microlabel">A ACADEMIA É PRIORIDADE PARA…</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 7 }}>
                    {PRIORIDADES_ACADEMIA.map((pr) => {
                      const pos = prioridades.indexOf(pr);
                      const ativa = pos >= 0;
                      return (
                        <button key={pr} type="button" className="btn" onClick={() => togglePrioridade(pr)}
                          style={{
                            padding: "7px 12px", fontSize: 11.5,
                            borderColor: ativa ? "var(--gold)" : "var(--line-2)",
                            color: ativa ? "var(--gold)" : "var(--muted)",
                            background: ativa ? "var(--gold-soft)" : undefined,
                          }}>
                          {ativa ? `${pos + 1}º · ` : ""}{pr}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Secao>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(420px, 1.4fr) minmax(340px, 1fr)", gap: 14, alignItems: "start" }}>
                <Secao n="4" titulo="Infraestrutura" desc="O que o local oferece e o que precisa ser adequado.">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Campo label="Elétrica"><Sel value={f.eletrica} onChange={set("eletrica")} opcoes={ELETRICA} /></Campo>
                    <Campo label="Climatização"><Sel value={f.climatizacao} onChange={set("climatizacao")} opcoes={CLIMATIZACAO} /></Campo>
                    <Campo label="Piso / contrapiso"><Sel value={f.piso} onChange={set("piso")} opcoes={PISOS} /></Campo>
                    <Campo label="Acesso"><Sel value={f.acesso} onChange={set("acesso")} opcoes={ACESSOS} /></Campo>
                  </div>
                </Secao>

                <Secao n="5" titulo="Espaço" desc="Dimensões da sala ou a planta baixa (calibre no editor).">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Campo label="Largura (cm)"><Num value={f.largura} onChange={set("largura")} /></Campo>
                    <Campo label="Profundidade (cm)"><Num value={f.profundidade} onChange={set("profundidade")} /></Campo>
                  </div>
                  <label className="btn btn-blue" style={{ textAlign: "center", cursor: "pointer" }}>
                    {busy === "Lendo planta…" ? "Lendo…" : planta ? "✓ Planta anexada" : "⭱ Planta baixa"}
                    <input type="file" style={{ display: "none" }} onChange={(e) => importarPlanta(e.target.files?.[0])} />
                  </label>
                </Secao>
              </div>

              <Secao n="6" titulo="Observações" desc="Notas livres para o dossiê.">
                <textarea className="fld" value={f.observacoes} placeholder="Restrições, expectativas do síndico, prazos…" onChange={(e) => set("observacoes")(e.target.value)} />
              </Secao>
            </>
          )}
        </div>

        {erro && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 14 }}>{erro}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 16, position: "sticky", bottom: 0, paddingBottom: 4, background: "linear-gradient(transparent, var(--bg) 40%)", paddingTop: 10 }}>
          {passo === 1 ? (
            <button className="btn btn-gold" disabled={!podeAvancar} onClick={() => setPasso(2)} title={podeAvancar ? "" : "Preencha o nome do condomínio"}>
              Continuar para o formulário →
            </button>
          ) : (
            <button className="btn btn-gold" disabled={!!busy} onClick={() => salvar(true)}>
              {busy ? busy : editando ? "Salvar e abrir o projeto" : "Concluir Fase 01 e ir ao Projeto →"}
            </button>
          )}
          <button className="btn" disabled={!!busy} onClick={() => salvar(false)}>Salvar leitura</button>
          <button className="btn" onClick={() => nav("/")}>Cancelar</button>
        </div>
      </div>
    </Shell>
  );
}
