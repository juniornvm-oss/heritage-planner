import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { criarProjeto, online } from "../lib/supabase";
import { BRL } from "../lib/units";
import { TAXA_ASSESSORIA, type Cena } from "../lib/types";

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 6 }}>
    <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".08em" }}>{label}</span>
    {children}
  </label>
);

export default function NovoProjetoScreen() {
  const nav = useNavigate();
  const [f, setF] = useState({
    nome: "", sindico: "", contato: "", orcamento: "",
    faixa: "", frequencia: "", uso: "autônomo",
    largura: "1000", profundidade: "800",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  const teto = Number(f.orcamento) || 0;

  async function criar() {
    if (!f.nome.trim()) { setErro("Preencha o nome do condomínio."); return; }
    if (!online) { setErro("Supabase não configurado."); return; }
    const cena: Cena = {
      sala: { largura_cm: Number(f.largura) || 1000, profundidade_cm: Number(f.profundidade) || 800 },
      planta: null,
      itens: [],
    };
    setSalvando(true);
    setErro(null);
    try {
      const p = await criarProjeto({
        nome: f.nome.trim(),
        sindico: f.sindico || null,
        contato: f.contato || null,
        orcamento_teto: teto || null,
        perfil: { faixa_etaria: f.faixa, frequencia: f.frequencia, uso: f.uso },
        cena,
      });
      nav(`/projeto/${p.id}`);
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <Shell>
      <h1 className="brandface" style={{ fontSize: 28, color: "var(--gold)", marginBottom: 18 }}>NOVO PROJETO</h1>
      <div style={{ maxWidth: 720, display: "grid", gap: 22 }}>
        <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14 }}>
          <Campo label="CONDOMÍNIO"><input className="fld" value={f.nome} placeholder="Ex.: Residencial Aurora" onChange={set("nome")} /></Campo>
          <Campo label="SÍNDICO"><input className="fld" value={f.sindico} onChange={set("sindico")} /></Campo>
          <Campo label="CONTATO"><input className="fld" value={f.contato} onChange={set("contato")} /></Campo>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14, alignItems: "end" }}>
          <Campo label="ORÇAMENTO-TETO (R$)"><input className="fld" type="number" value={f.orcamento} onChange={set("orcamento")} /></Campo>
          <div style={{ fontSize: 13, color: "var(--gold)", paddingBottom: 12 }}>
            Honorário da assessoria (0,5%): <b>{BRL(Math.round(teto * TAXA_ASSESSORIA))}</b>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Campo label="FAIXA ETÁRIA"><input className="fld" value={f.faixa} placeholder="Ex.: 30–55" onChange={set("faixa")} /></Campo>
          <Campo label="FREQUÊNCIA ESPERADA"><input className="fld" value={f.frequencia} placeholder="Ex.: 40/dia pico" onChange={set("frequencia")} /></Campo>
          <Campo label="USO">
            <select className="fld" value={f.uso} onChange={set("uso")}>
              <option value="autônomo">Autônomo</option>
              <option value="assistido">Assistido</option>
            </select>
          </Campo>
        </section>

        <section>
          <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 8 }}>SALA (cm) — você poderá importar a planta baixa no editor</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 360 }}>
            <Campo label="LARGURA"><input className="fld" type="number" value={f.largura} onChange={set("largura")} /></Campo>
            <Campo label="PROFUNDIDADE"><input className="fld" type="number" value={f.profundidade} onChange={set("profundidade")} /></Campo>
          </div>
        </section>

        {erro && <div style={{ color: "var(--red)", fontSize: 13 }}>{erro}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-gold" disabled={salvando} onClick={criar}>{salvando ? "Criando…" : "Criar e abrir editor"}</button>
          <button className="btn" onClick={() => nav("/")}>Cancelar</button>
        </div>
      </div>
    </Shell>
  );
}
