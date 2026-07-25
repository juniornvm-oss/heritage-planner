import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../ui/Shell";
import { criarProjeto, atualizarProjeto, obterProjeto, online } from "../lib/supabase";
import { lerPlanta } from "../lib/planta";
import { BRL } from "../lib/units";
import { TAXA_ASSESSORIA, type Cena, type PlantaFundo, type Projeto } from "../lib/types";

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 6 }}>
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

const VAZIO = {
  nome: "", sindico: "", contato: "", endereco: "", orcamento: "",
  faixa: "", frequencia: "", uso: "autônomo", moradores: "", objetivo: "",
  eletrica: "", climatizacao: "", piso: "", acesso: "",
  observacoes: "", largura: "1000", profundidade: "800",
};

export default function LeituraScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const editando = !!id && id !== "heritage";

  const [f, setF] = useState({ ...VAZIO });
  const [planta, setPlanta] = useState<PlantaFundo | null>(null);
  const [cenaExistente, setCenaExistente] = useState<Cena | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(editando);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  const teto = Number(f.orcamento) || 0;

  // Carrega o projeto quando estiver revisando a leitura
  useEffect(() => {
    if (!editando) return;
    (async () => {
      try {
        const p = await obterProjeto(id!);
        if (!p) { setErro("Projeto não encontrado."); return; }
        const perfil = p.perfil ?? {};
        const infra = p.infraestrutura ?? {};
        setF({
          nome: p.nome ?? "", sindico: p.sindico ?? "", contato: p.contato ?? "", endereco: p.endereco ?? "",
          orcamento: p.orcamento_teto != null ? String(p.orcamento_teto) : "",
          faixa: perfil.faixa_etaria ?? "", frequencia: perfil.frequencia ?? "", uso: perfil.uso ?? "autônomo",
          moradores: perfil.moradores ?? "", objetivo: perfil.objetivo ?? "",
          eletrica: infra.eletrica ?? "", climatizacao: infra.climatizacao ?? "", piso: infra.piso ?? "", acesso: infra.acesso ?? "",
          observacoes: p.observacoes ?? "",
          largura: String(p.cena?.sala.largura_cm ?? 1000), profundidade: String(p.cena?.sala.profundidade_cm ?? 800),
        });
        setCenaExistente(p.cena ?? null);
        setPlanta(p.cena?.planta ?? null);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    })();
  }, [editando, id]);

  async function importarPlanta(file?: File | null) {
    if (!file) return;
    setBusy("Lendo planta…"); setErro(null);
    try {
      const bmp = await lerPlanta(file);
      const largura_cm = Number(f.largura) || 1000;
      setPlanta({
        dataUrl: bmp.dataUrl, larguraPx: bmp.larguraPx, alturaPx: bmp.alturaPx,
        x_cm: 0, y_cm: 0, cmPorPx: largura_cm / bmp.larguraPx, rotacao: 0, opacidade: 0.55, bloqueada: false,
      });
    } catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  function montarPatch(): Partial<Projeto> {
    const cena: Cena = {
      sala: { largura_cm: Number(f.largura) || 1000, profundidade_cm: Number(f.profundidade) || 800, config: cenaExistente?.sala.config },
      planta,
      itens: cenaExistente?.itens ?? [],
    };
    return {
      nome: f.nome.trim(),
      sindico: f.sindico || null,
      contato: f.contato || null,
      endereco: f.endereco || null,
      orcamento_teto: teto || null,
      perfil: { faixa_etaria: f.faixa, frequencia: f.frequencia, uso: f.uso, moradores: f.moradores, objetivo: f.objetivo },
      infraestrutura: { eletrica: f.eletrica, climatizacao: f.climatizacao, piso: f.piso, acesso: f.acesso },
      observacoes: f.observacoes || null,
      cena,
    };
  }

  async function salvar(avancar: boolean) {
    if (!f.nome.trim()) { setErro("Preencha o nome do condomínio."); return; }
    if (!online) { setErro("Supabase não configurado."); return; }
    setBusy(avancar ? "Salvando…" : "Salvando leitura…"); setErro(null);
    try {
      const patch = montarPatch();
      const p = editando ? await atualizarProjeto(id!, patch) : await criarProjeto(patch);
      if (avancar) nav(`/projeto/${p.id}`);
      else nav("/");
    } catch (e) {
      setErro((e as Error).message);
      setBusy(null);
    }
  }

  if (carregando) return <Shell><p style={{ color: "var(--muted)" }}>Carregando leitura…</p></Shell>;

  return (
    <Shell actions={<button className="btn" onClick={() => nav("/")}>← Início</button>}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div className="microlabel">Fase 01 · Diagnóstico</div>
        <h1 className="brandface" style={{ fontSize: 34, color: "var(--gold)", marginTop: 6, marginBottom: 4 }}>
          Leitura do Condomínio
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13.5, marginBottom: 20, lineHeight: 1.6, maxWidth: 640 }}>
          Tudo começa aqui. Quanto mais fiel a leitura — perfil dos moradores, infraestrutura e
          espaço — melhor o projeto que a academia vai receber.
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <Secao n="A" titulo="Identificação" desc="O condomínio e quem conduz a decisão.">
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
              <Campo label="Condomínio"><input className="fld" value={f.nome} placeholder="Ex.: Residencial Aurora" onChange={set("nome")} /></Campo>
              <Campo label="Contato"><input className="fld" value={f.contato} onChange={set("contato")} /></Campo>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
              <Campo label="Síndico"><input className="fld" value={f.sindico} onChange={set("sindico")} /></Campo>
              <Campo label="Endereço"><input className="fld" value={f.endereco} placeholder="Bairro, cidade" onChange={set("endereco")} /></Campo>
            </div>
          </Secao>

          <Secao n="B" titulo="Investimento" desc="O teto define o honorário e baliza os cenários.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, alignItems: "end" }}>
              <Campo label="Orçamento-teto (R$)"><input className="fld" type="number" value={f.orcamento} onChange={set("orcamento")} /></Campo>
              <div style={{ fontSize: 13, color: "var(--gold)", paddingBottom: 12 }}>
                Honorário da assessoria (0,5%): <b>{BRL(Math.round(teto * TAXA_ASSESSORIA))}</b>
              </div>
            </div>
          </Secao>

          <Secao n="C" titulo="Perfil de uso" desc="Quem vai usar, com que frequência e como.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <Campo label="Faixa etária"><input className="fld" value={f.faixa} placeholder="Ex.: 30–55" onChange={set("faixa")} /></Campo>
              <Campo label="Frequência esperada"><input className="fld" value={f.frequencia} placeholder="Ex.: 40/dia no pico" onChange={set("frequencia")} /></Campo>
              <Campo label="Moradores"><input className="fld" value={f.moradores} placeholder="Ex.: 320" onChange={set("moradores")} /></Campo>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
              <Campo label="Uso">
                <select className="fld" value={f.uso} onChange={set("uso")}>
                  <option value="autônomo">Autônomo (sem professor)</option>
                  <option value="assistido">Assistido (com professor)</option>
                </select>
              </Campo>
              <Campo label="Objetivo predominante"><input className="fld" value={f.objetivo} placeholder="Ex.: saúde e condicionamento; estética" onChange={set("objetivo")} /></Campo>
            </div>
          </Secao>

          <Secao n="D" titulo="Infraestrutura" desc="O que o local oferece e o que precisa ser adequado.">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Campo label="Elétrica"><input className="fld" value={f.eletrica} placeholder="Ex.: 220V, quadro dedicado a revisar" onChange={set("eletrica")} /></Campo>
              <Campo label="Climatização"><input className="fld" value={f.climatizacao} placeholder="Ex.: 2 splits 12.000 BTU" onChange={set("climatizacao")} /></Campo>
              <Campo label="Piso / contrapiso"><input className="fld" value={f.piso} placeholder="Ex.: contrapiso nivelado; receber vinílico + borracha" onChange={set("piso")} /></Campo>
              <Campo label="Acesso"><input className="fld" value={f.acesso} placeholder="Ex.: elevador de serviço até o 2º subsolo" onChange={set("acesso")} /></Campo>
            </div>
          </Secao>

          <Secao n="E" titulo="Espaço" desc="Dimensões da sala ou a planta baixa (calibre no editor).">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 14, alignItems: "end" }}>
              <Campo label="Largura (cm)"><input className="fld" type="number" value={f.largura} onChange={set("largura")} /></Campo>
              <Campo label="Profundidade (cm)"><input className="fld" type="number" value={f.profundidade} onChange={set("profundidade")} /></Campo>
              <label className="btn btn-blue" style={{ textAlign: "center" }}>
                {busy === "Lendo planta…" ? "Lendo…" : planta ? "✓ Planta anexada" : "⭱ Planta baixa"}
                <input type="file" accept=".pdf,.dwg,.dxf,image/*" style={{ display: "none" }} onChange={(e) => importarPlanta(e.target.files?.[0])} />
              </label>
            </div>
            {planta && <div style={{ fontSize: 12, color: "var(--muted)" }}>Planta anexada ({planta.larguraPx}×{planta.alturaPx}px). A calibração de escala é feita no editor.</div>}
          </Secao>

          <Secao n="F" titulo="Observações" desc="Notas livres para o dossiê.">
            <textarea className="fld" value={f.observacoes} placeholder="Restrições, expectativas do síndico, prazos…" onChange={set("observacoes")} />
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
