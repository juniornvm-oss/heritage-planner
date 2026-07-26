import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "../ui/Shell";
import { useLibrary } from "../store/libraryStore";
import { inserirEquipamentos, online } from "../lib/supabase";
import { reduzirImagem } from "../lib/imagem";
import { contornoDeArquivo } from "../lib/plantaVetorial";
import { ZONAS, type Equipamento, type Zona } from "../lib/types";

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
    <span className="microlabel">{label}</span>
    {children}
  </label>
);

export default function CadastrarEquipamentoScreen() {
  const nav = useNavigate();
  const addEquipamentos = useLibrary((s) => s.addEquipamentos);

  const [f, setF] = useState({ nome: "", marca: "", modelo: "", zona: "livre" as Zona, preco: "", largura: "100", profundidade: "100" });
  const [imagem, setImagem] = useState<string | null>(null);
  const [contorno, setContorno] = useState<number[][]>([]);
  const [tracando, setTracando] = useState(false);
  const [tracoAtual, setTracoAtual] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const larg = Number(f.largura) || 100, prof = Number(f.profundidade) || 100;
  const aspecto = useMemo(() => prof / larg, [prof, larg]);

  async function onUpload(file?: File | null) {
    if (!file) return;
    setErro(null);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    try {
      if (["dxf", "dwg", "pdf"].includes(ext)) {
        setBusy("Extraindo contorno…");
        const c = await contornoDeArquivo(file);
        if (c && c.length) { setContorno(c); setImagem(null); }
        else setErro("Não achei geometria nesse arquivo. Tente uma imagem e trace por cima.");
      } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        setBusy("Processando imagem…");
        setImagem(await reduzirImagem(file));
      } else setErro("Use DWG, DXF, PDF ou imagem.");
    } catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  function clicarPreview(e: React.MouseEvent) {
    if (!tracando || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    setTracoAtual((t) => [...t, x, y]);
  }

  function concluirTraco() {
    if (tracoAtual.length >= 4) setContorno((c) => [...c, tracoAtual]);
    setTracoAtual([]);
  }

  async function salvar() {
    if (!f.nome.trim()) { setErro("Informe o nome."); return; }
    setBusy("Salvando…"); setErro(null);
    const eq: Equipamento = {
      nome: f.nome.trim(), marca: f.marca || null, modelo: f.modelo || null,
      largura_cm: larg, profundidade_cm: prof, zona: f.zona, preco: Number(f.preco) || 0,
      imagem, contorno: contorno.length ? contorno : null,
    };
    addEquipamentos([eq]);
    if (online) { try { await inserirEquipamentos([eq]); } catch (e) { setErro("Salvo localmente (Supabase: " + (e as Error).message + ")"); setBusy(null); return; } }
    nav("/equipamentos");
  }

  const previewW = 360, previewH = Math.round(360 * aspecto);

  return (
    <Shell actions={<button className="btn" onClick={() => nav("/equipamentos")}>← Biblioteca</button>}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div className="microlabel">Biblioteca · Equipamentos</div>
        <h1 className="brandface" style={{ fontSize: 30, color: "var(--gold)", marginTop: 6, marginBottom: 4 }}>Cadastrar equipamento</h1>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20, maxWidth: 620, lineHeight: 1.5 }}>
          Suba um <b>DWG/PDF</b> (extraio o contorno) ou uma <b>imagem</b> (você informa as medidas e traça o contorno por cima). Depois é só posicionar e calibrar na planta.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 22, alignItems: "start" }}>
          {/* Formulário */}
          <div className="card" style={{ padding: 18, display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <Campo label="Nome"><input className="fld" value={f.nome} placeholder="Ex.: Leg Press 45°" onChange={(e) => set("nome")(e.target.value)} /></Campo>
              <Campo label="Zona">
                <select className="fld" value={f.zona} onChange={(e) => set("zona")(e.target.value)}>
                  {Object.entries(ZONAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Campo>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Campo label="Marca"><input className="fld" value={f.marca} onChange={(e) => set("marca")(e.target.value)} /></Campo>
              <Campo label="Modelo"><input className="fld" value={f.modelo} onChange={(e) => set("modelo")(e.target.value)} /></Campo>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Campo label="Largura (cm)"><input className="fld" type="text" inputMode="numeric" value={f.largura} onChange={(e) => set("largura")(e.target.value.replace(/[^\d]/g, ""))} /></Campo>
              <Campo label="Profundidade (cm)"><input className="fld" type="text" inputMode="numeric" value={f.profundidade} onChange={(e) => set("profundidade")(e.target.value.replace(/[^\d]/g, ""))} /></Campo>
              <Campo label="Preço (R$)"><input className="fld" type="text" inputMode="numeric" value={f.preco} onChange={(e) => set("preco")(e.target.value.replace(/[^\d]/g, ""))} /></Campo>
            </div>
            <div>
              <input ref={fileRef} type="file" accept=".dwg,.dxf,.pdf,image/*" style={{ display: "none" }} onChange={(e) => onUpload(e.target.files?.[0])} />
              <button className="btn btn-blue" onClick={() => fileRef.current?.click()}>{busy || "⭱ Subir arquivo (DWG/PDF/imagem)"}</button>
            </div>
            {erro && <div style={{ color: "var(--red)", fontSize: 12.5 }}>{erro}</div>}
          </div>

          {/* Preview / traçado */}
          <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
            <div className="microlabel">Footprint {larg}×{prof} cm</div>
            <div style={{ position: "relative", width: previewW, height: previewH, background: "var(--panel-2)", border: "1px solid var(--line-2)", borderRadius: 8, overflow: "hidden" }}>
              {imagem && <img src={imagem} alt="equipamento" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", opacity: 0.85 }} />}
              <svg ref={svgRef} viewBox="0 0 1 1" preserveAspectRatio="none" onClick={clicarPreview}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: tracando ? "crosshair" : "default" }}>
                {contorno.map((pl, i) => <polyline key={i} points={pts(pl)} fill="none" stroke="#C9A227" strokeWidth={0.007} />)}
                {tracoAtual.length >= 2 && <polyline points={pts(tracoAtual)} fill="none" stroke="#5FC8E8" strokeWidth={0.007} />}
                {chunk(tracoAtual).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.012} fill="#5FC8E8" />)}
              </svg>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", maxWidth: previewW }}>
              <button className="btn" onClick={() => setTracando((v) => !v)} style={tracando ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}>{tracando ? "Traçando…" : "✎ Traçar"}</button>
              <button className="btn" disabled={tracoAtual.length < 4} onClick={concluirTraco}>Concluir traço</button>
              <button className="btn" disabled={!tracoAtual.length} onClick={() => setTracoAtual((t) => t.slice(0, -2))}>↶ ponto</button>
              <button className="btn" disabled={!contorno.length && !tracoAtual.length} onClick={() => { setContorno([]); setTracoAtual([]); }}>Limpar</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", maxWidth: previewW }}>
              {contorno.length ? `${contorno.length} traço(s) no contorno.` : "DWG/PDF gera o contorno; na imagem, ligue Traçar e toque os pontos."}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn btn-gold" disabled={!!busy} onClick={salvar}>Salvar equipamento</button>
          <button className="btn" onClick={() => nav("/equipamentos")}>Cancelar</button>
        </div>
      </div>
    </Shell>
  );
}

const pts = (flat: number[]) => { let s = ""; for (let i = 0; i < flat.length; i += 2) s += `${flat[i]},${flat[i + 1]} `; return s.trim(); };
const chunk = (flat: number[]): [number, number][] => { const o: [number, number][] = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };
