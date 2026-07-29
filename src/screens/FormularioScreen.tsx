// Formulário público do síndico (rota /formulario) — FORA do login e sem
// exigir paisagem: o síndico preenche no celular. Ao enviar, cai na caixa
// de entrada (planner.solicitacoes) como anon; não lê nada de ninguém.
import { useState } from "react";
import { criarSolicitacao, online } from "../lib/supabase";
import type { AnexoSolicitacao, Solicitacao } from "../lib/types";

const LOCALIZACAO = ["Térreo", "Subsolo", "Cobertura / rooftop", "Andar intermediário"];
const CLIMATIZACAO = ["Ar-condicionado instalado", "Previsto em obra", "Apenas ventilação", "Nenhuma", "Não sei"];
const FAIXAS = ["18–30", "30–45", "45–65", "65+", "Muito misto"];
const ESTILOS = ["Musculação guiada", "Pesos livres", "Cardio / ergometria", "Funcional", "Alongamento / pilates", "Aulas coletivas"];
const OBJETIVOS = ["Valorização do imóvel", "Uso real e frequente", "Ambos igualmente", "Substituir academia externa"];
const APROVACAO = ["Já aprovado em assembleia", "Aprovação prevista", "Em discussão no conselho", "Fase de estudo"];

const VAZIO = {
  condominio: "", cidade: "", sindico: "", whatsapp: "", email: "", unidades: "",
  dimensoes: "", localizacao: "", climatizacao: "", faixa_etaria: "",
  visao: "", objetivo: "", orcamento: "", aprovacao: "", observacoes: "",
};

const Campo = ({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
    <span className="microlabel">{label}{req && <span style={{ color: "var(--gold)" }}> ★</span>}</span>
    {children}
  </label>
);

const Sel = ({ value, onChange, opcoes }: { value: string; onChange: (v: string) => void; opcoes: string[] }) => (
  <select className="fld" value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">—</option>
    {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

const Bloco = ({ n, titulo, desc, children }: { n: string; titulo: string; desc?: string; children: React.ReactNode }) => (
  <section className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span className="brandface" style={{ fontSize: 24, color: "var(--gold)" }}>{n}</span>
      <div>
        <div className="brandface" style={{ fontSize: 18, letterSpacing: "0.02em" }}>{titulo}</div>
        {desc && <div style={{ color: "var(--muted)", fontSize: 12 }}>{desc}</div>}
      </div>
    </div>
    {children}
  </section>
);

// Foto → dataURL reduzido (cabe no banco). PDF/DWG → dataURL direto.
async function lerAnexo(file: File): Promise<AnexoSolicitacao> {
  const ehImagem = /^image\//.test(file.type);
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
  });
  if (!ehImagem) return { tipo: "planta", nome: file.name, dataUrl };
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const max = 1400, sc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return { tipo: "foto", nome: file.name, dataUrl: c.toDataURL("image/jpeg", 0.82) };
}

const LIMITE_MB = 12;

export default function FormularioScreen() {
  const [f, setF] = useState({ ...VAZIO });
  const [estilos, setEstilos] = useState<string[]>([]);
  const [anexos, setAnexos] = useState<AnexoSolicitacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const toggleEstilo = (e: string) => setEstilos((xs) => xs.includes(e) ? xs.filter((x) => x !== e) : [...xs, e]);

  async function adicionarArquivos(files: FileList | null) {
    if (!files) return;
    setErro(null);
    for (const file of Array.from(files)) {
      if (file.size > LIMITE_MB * 1024 * 1024) { setErro(`"${file.name}" passa de ${LIMITE_MB} MB. Reduza e tente de novo.`); continue; }
      try { const anexo = await lerAnexo(file); setAnexos((xs) => [...xs, anexo]); }
      catch { setErro(`Não consegui ler "${file.name}".`); }
    }
  }

  async function enviar() {
    setErro(null);
    const orcamento = f.orcamento ? Number(f.orcamento.replace(/\D/g, "")) : null;
    if (!f.condominio.trim() || !f.sindico.trim() || !f.whatsapp.trim() || !f.dimensoes.trim() || !f.visao.trim() || !orcamento) {
      setErro("Preencha os campos obrigatórios (★)."); return;
    }
    if (!online) { setErro("Envio indisponível no momento."); return; }
    setBusy(true);
    try {
      const payload: Solicitacao = {
        condominio: f.condominio.trim(), cidade: f.cidade.trim() || null, sindico: f.sindico.trim(),
        whatsapp: f.whatsapp.trim(), email: f.email.trim() || null, unidades: f.unidades ? Number(f.unidades) : null,
        dimensoes: f.dimensoes.trim(), localizacao: f.localizacao || null, climatizacao: f.climatizacao || null,
        faixa_etaria: f.faixa_etaria || null, estilos,
        visao: f.visao.trim(), objetivo: f.objetivo || null, orcamento_teto: orcamento,
        aprovacao: f.aprovacao || null, observacoes: f.observacoes.trim() || null, anexos,
      };
      await criarSolicitacao(payload);
      setEnviado(true);
    } catch (e) {
      setErro("Não consegui enviar. Confira a conexão e tente de novo. " + (e as Error).message);
      setBusy(false);
    }
  }

  if (enviado) {
    return (
      <Casca>
        <section className="card" style={{ padding: 28, textAlign: "center", display: "grid", gap: 12, maxWidth: 520, margin: "0 auto" }}>
          <span className="brandface" style={{ fontSize: 28, color: "var(--gold)" }}>Recebido!</span>
          <p style={{ color: "#d9d9d4", lineHeight: 1.6 }}>
            Obrigado. Suas informações chegaram à nossa assessoria. Em breve entramos em contato pelo WhatsApp informado.
          </p>
        </section>
      </Casca>
    );
  }

  return (
    <Casca>
      <div style={{ display: "grid", gap: 16, maxWidth: 720, margin: "0 auto" }}>
        <Bloco n="1" titulo="Condomínio & contato" desc="Dados básicos do condomínio e do responsável.">
          <Campo label="Nome do condomínio" req><input className="fld" value={f.condominio} onChange={(e) => set("condominio")(e.target.value)} /></Campo>
          <Campo label="Cidade / bairro"><input className="fld" value={f.cidade} onChange={(e) => set("cidade")(e.target.value)} /></Campo>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Síndico / responsável" req><input className="fld" value={f.sindico} onChange={(e) => set("sindico")(e.target.value)} /></Campo>
            <Campo label="WhatsApp" req><input className="fld" inputMode="tel" value={f.whatsapp} onChange={(e) => set("whatsapp")(e.target.value)} /></Campo>
            <Campo label="E-mail"><input className="fld" type="email" inputMode="email" value={f.email} onChange={(e) => set("email")(e.target.value)} /></Campo>
            <Campo label="Nº de unidades"><input className="fld" inputMode="numeric" value={f.unidades} onChange={(e) => set("unidades")(e.target.value.replace(/\D/g, ""))} /></Campo>
          </div>
        </Bloco>

        <Bloco n="2" titulo="Espaço & moradores" desc="Medidas gerais e quem vai usar a academia.">
          <Campo label="Dimensões aprox. (largura × comprimento, m)" req>
            <input className="fld" placeholder="Ex.: 11,0 x 11,2" value={f.dimensoes} onChange={(e) => set("dimensoes")(e.target.value)} />
          </Campo>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Localização no prédio"><Sel value={f.localizacao} onChange={set("localizacao")} opcoes={LOCALIZACAO} /></Campo>
            <Campo label="Climatização"><Sel value={f.climatizacao} onChange={set("climatizacao")} opcoes={CLIMATIZACAO} /></Campo>
            <Campo label="Faixa etária predominante"><Sel value={f.faixa_etaria} onChange={set("faixa_etaria")} opcoes={FAIXAS} /></Campo>
          </div>
          <Campo label="Estilo de treino prioritário (pode marcar vários)">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ESTILOS.map((e) => (
                <button key={e} type="button" className="btn" onClick={() => toggleEstilo(e)}
                  style={{ borderColor: estilos.includes(e) ? "var(--gold)" : "var(--line-2)", color: estilos.includes(e) ? "var(--gold)" : "#d9d9d4" }}>
                  {estilos.includes(e) ? "✓ " : ""}{e}
                </button>
              ))}
            </div>
          </Campo>
          <Campo label="Planta e fotos do espaço (PDF ou imagens)">
            <input className="fld" type="file" accept="image/*,application/pdf" multiple onChange={(e) => void adicionarArquivos(e.target.files)} />
            {anexos.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {anexos.map((a, i) => (
                  <span key={i} className="pill" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    {a.tipo === "foto" ? "🖼" : "📄"} {a.nome}
                    <button type="button" onClick={() => setAnexos((xs) => xs.filter((_, j) => j !== i))} style={{ background: "none", border: 0, color: "var(--muted)", cursor: "pointer" }}>✕</button>
                  </span>
                ))}
              </div>
            )}
          </Campo>
        </Bloco>

        <Bloco n="3" titulo="Objetivo & investimento" desc="A parte mais importante: o que essa academia pode se tornar.">
          <Campo label="Na sua visão, o que essa academia pode se tornar para o condomínio?" req>
            <textarea className="fld" rows={4} value={f.visao} onChange={(e) => set("visao")(e.target.value)}
              placeholder="Ex.: um espaço que os moradores realmente usem, um diferencial na venda dos apartamentos…" />
          </Campo>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Objetivo principal"><Sel value={f.objetivo} onChange={set("objetivo")} opcoes={OBJETIVOS} /></Campo>
            <Campo label="Teto de investimento (R$)" req>
              <input className="fld" inputMode="numeric" placeholder="Ex.: 400.000"
                value={f.orcamento ? "R$ " + Number(f.orcamento.replace(/\D/g, "") || 0).toLocaleString("pt-BR") : ""}
                onChange={(e) => set("orcamento")(e.target.value.replace(/\D/g, ""))} />
            </Campo>
          </div>
          <Campo label="Status da aprovação"><Sel value={f.aprovacao} onChange={set("aprovacao")} opcoes={APROVACAO} /></Campo>
          <Campo label="Observações"><textarea className="fld" rows={3} value={f.observacoes} onChange={(e) => set("observacoes")(e.target.value)} /></Campo>
        </Bloco>

        {erro && <div style={{ color: "#e88", fontSize: 13, textAlign: "center" }}>{erro}</div>}

        <button className="btn btn-gold" disabled={busy} onClick={() => void enviar()} style={{ justifyContent: "center", padding: 14, fontSize: 15 }}>
          {busy ? "Enviando…" : "Enviar diagnóstico"}
        </button>
        <div style={{ height: 12 }} />
      </div>
    </Casca>
  );
}

// Cabeçalho simples próprio (o formulário não usa o Shell da plataforma).
function Casca({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        padding: "calc(18px + var(--sat)) calc(20px + var(--sar)) 16px calc(20px + var(--sal))",
        borderBottom: "2px solid var(--gold)", textAlign: "center", display: "grid", justifyItems: "center", gap: 8,
      }}>
        <img src="/logo.png" alt="Heritage Gym Builder" style={{ width: "min(240px, 70%)", height: "auto", borderRadius: 12 }} />
        <div style={{ color: "var(--muted)", fontSize: 12 }}>Diagnóstico de Academia · Assessoria Técnica</div>
      </header>
      <main style={{ flex: 1, overflow: "auto", padding: "20px calc(16px + var(--sar)) calc(24px + var(--sab)) calc(16px + var(--sal))" }}>
        {children}
      </main>
    </div>
  );
}
