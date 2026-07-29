// Cadastro do consultor: dados que entram no PDF de entrega + trocar senha.
// Só acessível logado (rota protegida).
import { useEffect, useState } from "react";
import Shell from "../ui/Shell";
import { obterConfigConsultor, salvarConfigConsultor, trocarSenha, online } from "../lib/supabase";
import type { ConfigConsultor } from "../lib/types";

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
    <span className="microlabel">{label}</span>
    {children}
  </label>
);

async function logoReduzido(file: File): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const max = 600, sc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

export default function CadastroScreen() {
  const [c, setC] = useState<ConfigConsultor>({});
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof ConfigConsultor) => (v: string | number | null) => setC((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!online) { setCarregando(false); return; }
    (async () => { setC((await obterConfigConsultor()) ?? {}); setCarregando(false); })();
  }, []);

  async function salvar() {
    setBusy(true); setMsg(null); setErro(null);
    try { await salvarConfigConsultor(c); setMsg("Cadastro salvo."); }
    catch (e) { setErro((e as Error).message); }
    finally { setBusy(false); }
  }

  async function trocarLogo(file?: File | null) {
    if (!file) return;
    try { set("logo")(await logoReduzido(file)); } catch { setErro("Não consegui ler o logotipo."); }
  }

  // Trocar senha
  const [s1, setS1] = useState(""); const [s2, setS2] = useState(""); const [senhaBusy, setSenhaBusy] = useState(false); const [senhaMsg, setSenhaMsg] = useState<string | null>(null);
  async function submeterSenha() {
    setSenhaMsg(null);
    if (s1.length < 8) { setSenhaMsg("Use ao menos 8 caracteres."); return; }
    if (s1 !== s2) { setSenhaMsg("As senhas não conferem."); return; }
    setSenhaBusy(true);
    try { await trocarSenha(s1); setS1(""); setS2(""); setSenhaMsg("Senha alterada com sucesso."); }
    catch (e) { setSenhaMsg((e as Error).message); }
    finally { setSenhaBusy(false); }
  }

  if (carregando) return <Shell><div style={{ color: "var(--muted)" }}>Carregando…</div></Shell>;

  return (
    <Shell>
      <h1 className="brandface" style={{ fontSize: 28, marginBottom: 6 }}>Cadastro</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>Seus dados entram na capa e no rodapé do PDF de entrega.</p>

      <div style={{ display: "grid", gap: 18, maxWidth: 720 }}>
        <section className="card" style={{ padding: 20, display: "grid", gap: 14 }}>
          <div className="brandface" style={{ fontSize: 18, color: "var(--gold)" }}>Dados do consultor</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Nome do responsável"><input className="fld" value={c.consultor ?? ""} onChange={(e) => set("consultor")(e.target.value)} /></Campo>
            <Campo label="Empresa / marca"><input className="fld" value={c.empresa ?? ""} onChange={(e) => set("empresa")(e.target.value)} /></Campo>
            <Campo label="Registro (CREF / CAU / CREA)"><input className="fld" value={c.registro ?? ""} onChange={(e) => set("registro")(e.target.value)} /></Campo>
            <Campo label="CNPJ / CPF"><input className="fld" value={c.documento ?? ""} onChange={(e) => set("documento")(e.target.value)} /></Campo>
            <Campo label="WhatsApp"><input className="fld" inputMode="tel" value={c.whatsapp ?? ""} onChange={(e) => set("whatsapp")(e.target.value)} /></Campo>
            <Campo label="E-mail"><input className="fld" type="email" value={c.email ?? ""} onChange={(e) => set("email")(e.target.value)} /></Campo>
            <Campo label="Site / Instagram"><input className="fld" value={c.site ?? ""} onChange={(e) => set("site")(e.target.value)} /></Campo>
            <Campo label="Cidade / UF"><input className="fld" value={c.cidade_uf ?? ""} onChange={(e) => set("cidade_uf")(e.target.value)} /></Campo>
            <Campo label="Honorário (%)"><input className="fld" inputMode="decimal" value={c.honorario_pct ?? ""} onChange={(e) => set("honorario_pct")(e.target.value ? Number(e.target.value.replace(",", ".")) : null)} /></Campo>
          </div>
          <Campo label="Assinatura / rodapé do dossiê">
            <textarea className="fld" rows={2} value={c.rodape ?? ""} onChange={(e) => set("rodape")(e.target.value)} placeholder="Ex.: Heritage · Assessoria Técnica de Implantação" />
          </Campo>
          <Campo label="Logotipo (opcional)">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input className="fld" type="file" accept="image/*" onChange={(e) => void trocarLogo(e.target.files?.[0])} />
              {c.logo && <img src={c.logo} alt="logo" style={{ height: 44, background: "#fff", borderRadius: 6, padding: 4 }} />}
              {c.logo && <button className="btn" onClick={() => set("logo")(null)}>Remover</button>}
            </div>
          </Campo>

          {erro && <div style={{ color: "#e88", fontSize: 13 }}>{erro}</div>}
          {msg && <div style={{ color: "#7ec98f", fontSize: 13 }}>{msg}</div>}
          <div><button className="btn btn-primary" disabled={busy} onClick={() => void salvar()}>{busy ? "Salvando…" : "Salvar cadastro"}</button></div>
        </section>

        <section className="card" style={{ padding: 20, display: "grid", gap: 14 }}>
          <div className="brandface" style={{ fontSize: 18, color: "var(--gold)" }}>Segurança · trocar senha</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Campo label="Nova senha"><input className="fld" type="password" autoComplete="new-password" value={s1} onChange={(e) => setS1(e.target.value)} /></Campo>
            <Campo label="Confirmar nova senha"><input className="fld" type="password" autoComplete="new-password" value={s2} onChange={(e) => setS2(e.target.value)} /></Campo>
          </div>
          {senhaMsg && <div style={{ color: /sucesso/.test(senhaMsg) ? "#7ec98f" : "#e88", fontSize: 13 }}>{senhaMsg}</div>}
          <div><button className="btn" disabled={senhaBusy} onClick={() => void submeterSenha()}>{senhaBusy ? "Alterando…" : "Alterar senha"}</button></div>
        </section>
      </div>
    </Shell>
  );
}
