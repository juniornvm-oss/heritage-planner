import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Shell from "../ui/Shell";
import { useLibrary } from "../store/libraryStore";
import { inserirEquipamentos, atualizarEquipamento, removerEquipamento, online } from "../lib/supabase";
import { reduzirImagem, limparDesenho, recortarImagem } from "../lib/imagem";
import { contornoDeArquivo } from "../lib/plantaVetorial";
import { ZONAS, CENARIOS, CATEGORIAS_EQUIP, PAPEL_LADO, LADOS_PADRAO, type Cenario, type Equipamento, type Zona, type LadoRect, type PapelLado } from "../lib/types";
import { baseDoNome, cenarioSugerido } from "../lib/curadoria";

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
    <span className="microlabel" style={{ whiteSpace: "normal" }}>{label}</span>
    {children}
  </label>
);

export default function CadastrarEquipamentoScreen() {
  const nav = useNavigate();
  const { ref } = useParams();
  const editando = !!ref;
  const addEquipamentos = useLibrary((s) => s.addEquipamentos);
  const updateEquipamentoStore = useLibrary((s) => s.updateEquipamento);
  const removerEquipamentoStore = useLibrary((s) => s.removerEquipamento);
  const equipamentos = useLibrary((s) => s.equipamentos);
  const existente = useMemo(() => (ref ? equipamentos.find((e) => (e.id ? e.id === ref : e.nome === ref)) : undefined), [ref, equipamentos]);

  const [f, setF] = useState({ nome: "", marca: "", modelo: "", zona: "livre" as Zona, preco: "", largura: "100", profundidade: "100" });
  // Ficha técnica (opcional) — persiste no jsonb `tecnico` do catálogo.
  const [t, setT] = useState({
    categoria: "", subcategoria: "", altura: "", peso: "", fornecedor: "", codigo: "",
    precisa_tomada: false, voltagem: "" as "" | "127" | "220" | "bivolt", ponto_internet: false,
    dist_parede: "", dist_lateral: "", dist_frontal: "",
    uso_frontal: "", uso_lateral: "", seguranca: "", obs: "", ativo: true,
    descricao: "", cenario_padrao: "" as "" | Cenario,
  });
  const setTec = (k: keyof typeof t) => (v: string | boolean) => setT((x) => ({ ...x, [k]: v }));
  // Papel de cada lado do footprint (entrada / frente / costas / lateral) + vão da entrada.
  const [lados, setLados] = useState<Record<LadoRect, PapelLado>>({ ...LADOS_PADRAO });
  const [distEntrada, setDistEntrada] = useState("");
  const ORDEM_PAPEL: PapelLado[] = ["entrada", "frente", "costas", "lateral"];
  const ciclarLado = (k: LadoRect) => setLados((l) => ({ ...l, [k]: ORDEM_PAPEL[(ORDEM_PAPEL.indexOf(l[k]) + 1) % ORDEM_PAPEL.length] }));
  const [imagem, setImagem] = useState<string | null>(null);
  const [imagemOriginal, setImagemOriginal] = useState<string | null>(null);
  const preenchido = useRef(false);
  const [limiar, setLimiar] = useState(135);
  const [contorno, setContorno] = useState<number[][]>([]);
  const [tracando, setTracando] = useState(false);
  const [tracoAtual, setTracoAtual] = useState<number[]>([]);
  const [modoRecorte, setModoRecorte] = useState(false);
  const [recorteA, setRecorteA] = useState<[number, number] | null>(null);
  const [recortePtr, setRecortePtr] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Preenche o formulário com o equipamento existente (modo edição) — uma vez.
  useEffect(() => {
    if (!editando || preenchido.current || !existente) return;
    preenchido.current = true;
    setF({
      nome: existente.nome ?? "", marca: existente.marca ?? "", modelo: existente.modelo ?? "",
      zona: existente.zona ?? "livre", preco: existente.preco ? String(existente.preco) : "",
      largura: String(existente.largura_cm ?? 100), profundidade: String(existente.profundidade_cm ?? 100),
    });
    if (existente.imagem) { setImagem(existente.imagem); setImagemOriginal(existente.imagem); }
    if (existente.contorno) setContorno(existente.contorno);
    setT({
      categoria: existente.categoria ?? "", subcategoria: existente.subcategoria ?? "",
      altura: existente.altura_cm ? String(existente.altura_cm) : "", peso: existente.peso_kg ? String(existente.peso_kg) : "",
      fornecedor: existente.fornecedor ?? "", codigo: existente.codigo ?? "",
      precisa_tomada: !!existente.precisa_tomada, voltagem: (existente.voltagem ?? "") as "" | "127" | "220" | "bivolt",
      ponto_internet: !!existente.ponto_internet,
      dist_parede: existente.dist_parede_cm ? String(existente.dist_parede_cm) : "",
      dist_lateral: existente.dist_lateral_cm ? String(existente.dist_lateral_cm) : "",
      dist_frontal: existente.dist_frontal_cm ? String(existente.dist_frontal_cm) : "",
      uso_frontal: existente.uso_frontal_cm ? String(existente.uso_frontal_cm) : "",
      uso_lateral: existente.uso_lateral_cm ? String(existente.uso_lateral_cm) : "",
      seguranca: existente.seguranca_cm ? String(existente.seguranca_cm) : "",
      obs: existente.obs ?? "", ativo: existente.ativo !== false,
      descricao: existente.descricao ?? "", cenario_padrao: (existente.cenario_padrao ?? "") as "" | Cenario,
    });
    setLados({ ...LADOS_PADRAO, ...(existente.lados ?? {}) });
    setDistEntrada(existente.dist_entrada_cm ? String(existente.dist_entrada_cm) : "");
  }, [editando, existente]);

  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const larg = Number(f.largura) || 100, prof = Number(f.profundidade) || 100;
  const aspecto = useMemo(() => prof / larg, [prof, larg]);
  // Texto da base técnica para este nome — vira o padrão do Dossiê se a descrição ficar vazia.
  const sugestaoTexto = useMemo(() => baseDoNome(f.nome), [f.nome]);

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
        const red = await reduzirImagem(file);
        setImagem(red); setImagemOriginal(red);
      } else setErro("Use DWG, DXF, PDF ou imagem.");
    } catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  function ponto(e: React.MouseEvent): [number, number] | null {
    if (!svgRef.current) return null;
    const r = svgRef.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }

  function clicarPreview(e: React.MouseEvent) {
    const p = ponto(e);
    if (!p) return;
    if (modoRecorte) {
      if (!recorteA) { setRecorteA(p); setRecortePtr(p); }
      else { aplicarRecorte(recorteA, p); setRecorteA(null); setRecortePtr(null); setModoRecorte(false); }
      return;
    }
    if (tracando) setTracoAtual((t) => [...t, p[0], p[1]]);
  }

  function moverPreview(e: React.MouseEvent) {
    if (modoRecorte && recorteA) setRecortePtr(ponto(e));
  }

  function concluirTraco() {
    if (tracoAtual.length >= 4) setContorno((c) => [...c, tracoAtual]);
    setTracoAtual([]);
  }

  async function aplicarLimpar() {
    if (!imagemOriginal) return;
    setBusy("Limpando desenho…"); setErro(null);
    try { setImagem(await limparDesenho(imagemOriginal, limiar, ZONAS[f.zona].cor)); }
    catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  function restaurarImagem() { setImagem(imagemOriginal); }

  async function aplicarRecorte(a: [number, number], b: [number, number]) {
    if (!imagem) return;
    const rect = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
    if (rect.w < 0.02 || rect.h < 0.02) return;
    setBusy("Recortando…"); setErro(null);
    try {
      setImagem(await recortarImagem(imagem, rect));
      if (imagemOriginal) setImagemOriginal(await recortarImagem(imagemOriginal, rect));
    } catch (e) { setErro((e as Error).message); } finally { setBusy(null); }
  }

  async function salvar() {
    if (!f.nome.trim()) { setErro("Informe o nome."); return; }
    setBusy("Salvando…"); setErro(null);
    const num = (v: string) => (v.trim() === "" ? null : Number(v) || null);
    const eq: Equipamento = {
      ...(existente?.id ? { id: existente.id } : {}),
      nome: f.nome.trim(), marca: f.marca || null, modelo: f.modelo || null,
      largura_cm: larg, profundidade_cm: prof, zona: f.zona, preco: Number(f.preco) || 0,
      imagem, contorno: contorno.length ? contorno : null,
      categoria: t.categoria || null, subcategoria: t.subcategoria || null,
      altura_cm: num(t.altura), peso_kg: num(t.peso),
      fornecedor: t.fornecedor || null, codigo: t.codigo || null,
      precisa_tomada: t.precisa_tomada || null, voltagem: t.voltagem || null,
      ponto_internet: t.ponto_internet || null,
      dist_parede_cm: num(t.dist_parede), dist_lateral_cm: num(t.dist_lateral), dist_frontal_cm: num(t.dist_frontal),
      uso_frontal_cm: num(t.uso_frontal), uso_lateral_cm: num(t.uso_lateral), seguranca_cm: num(t.seguranca),
      obs: t.obs || null, ativo: t.ativo,
      descricao: t.descricao.trim() || null, cenario_padrao: t.cenario_padrao || null,
      lados, dist_entrada_cm: num(distEntrada),
    };
    if (editando) {
      updateEquipamentoStore(ref!, eq);
      if (online && eq.id) { try { await atualizarEquipamento(eq); } catch (e) { setErro("Salvo localmente (Supabase: " + (e as Error).message + ")"); setBusy(null); return; } }
    } else {
      addEquipamentos([eq]);
      if (online) { try { await inserirEquipamentos([eq]); } catch (e) { setErro("Salvo localmente (Supabase: " + (e as Error).message + ")"); setBusy(null); return; } }
    }
    nav("/equipamentos");
  }

  async function excluir() {
    if (!editando) return;
    if (!window.confirm(`Excluir "${f.nome || "este equipamento"}" da biblioteca?`)) return;
    setBusy("Excluindo…"); setErro(null);
    removerEquipamentoStore(ref!);
    if (online && existente?.id) { try { await removerEquipamento(existente.id); } catch (e) { setErro("Removido localmente (Supabase: " + (e as Error).message + ")"); setBusy(null); return; } }
    nav("/equipamentos");
  }

  const previewW = 360, previewH = Math.round(360 * aspecto);

  return (
    <Shell actions={<button className="btn" onClick={() => nav("/equipamentos")}>← Biblioteca</button>}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="microlabel">Biblioteca · Equipamentos</div>
        <h1 className="brandface" style={{ fontSize: 30, color: "var(--gold)", marginTop: 6, marginBottom: 4 }}>{editando ? "Editar equipamento" : "Cadastrar equipamento"}</h1>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Campo label="Largura (cm)"><input className="fld" type="text" inputMode="numeric" value={f.largura} onChange={(e) => set("largura")(e.target.value.replace(/[^\d]/g, ""))} /></Campo>
              <Campo label="Profundidade (cm)"><input className="fld" type="text" inputMode="numeric" value={f.profundidade} onChange={(e) => set("profundidade")(e.target.value.replace(/[^\d]/g, ""))} /></Campo>
              <Campo label="Preço">
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--gold)", fontSize: 13, fontWeight: 700, pointerEvents: "none" }}>R$</span>
                  <input className="fld" type="text" inputMode="numeric" style={{ paddingLeft: 38, width: "100%" }}
                    value={f.preco ? Number(f.preco).toLocaleString("pt-BR") : ""}
                    placeholder="0"
                    onChange={(e) => set("preco")(e.target.value.replace(/[^\d]/g, ""))} />
                </div>
              </Campo>
            </div>
            <div className="hairline" />
            <div className="microlabel" style={{ color: "var(--gold)" }}>FICHA TÉCNICA (opcional)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Campo label="Categoria">
                <select className="fld" value={t.categoria} onChange={(e) => { setTec("categoria")(e.target.value); setTec("subcategoria")(""); }}>
                  <option value="">—</option>
                  {Object.keys(CATEGORIAS_EQUIP).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Campo>
              <Campo label="Subcategoria">
                <select className="fld" value={t.subcategoria} onChange={(e) => setTec("subcategoria")(e.target.value)} disabled={!(CATEGORIAS_EQUIP[t.categoria] ?? []).length}>
                  <option value="">—</option>
                  {(CATEGORIAS_EQUIP[t.categoria] ?? []).map((sc) => <option key={sc} value={sc}>{sc}</option>)}
                </select>
              </Campo>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <Campo label="Fornecedor"><input className="fld" value={t.fornecedor} onChange={(e) => setTec("fornecedor")(e.target.value)} /></Campo>
            </div>
            <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#c9c9c4" }}>
                <input type="checkbox" checked={t.precisa_tomada} onChange={(e) => setTec("precisa_tomada")(e.target.checked)} /> ⚡ Precisa tomada
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#c9c9c4" }}>
                <input type="checkbox" checked={t.ponto_internet} onChange={(e) => setTec("ponto_internet")(e.target.checked)} /> 🌐 Internet
              </label>
              <Campo label="Voltagem">
                <select className="fld" value={t.voltagem} onChange={(e) => setTec("voltagem")(e.target.value)}>
                  <option value="">—</option><option value="127">127 V</option><option value="220">220 V</option><option value="bivolt">Bivolt</option>
                </select>
              </Campo>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#c9c9c4" }}>
                <input type="checkbox" checked={t.ativo} onChange={(e) => setTec("ativo")(e.target.checked)} /> Ativo
              </label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              <Campo label="Distância da ENTRADA (cm)"><input className="fld" inputMode="numeric" value={distEntrada} onChange={(e) => setDistEntrada(e.target.value.replace(/[^\d]/g, ""))} /></Campo>
            </div>
            <Campo label="Observação de instalação"><input className="fld" value={t.obs} onChange={(e) => setTec("obs")(e.target.value)} /></Campo>

            <div className="hairline" />
            <div className="microlabel" style={{ color: "var(--gold)" }}>CURADORIA (sai no Dossiê)</div>
            <Campo label="O que é / para que serve — usado no memorial dos equipamentos">
              <textarea className="fld" rows={3} style={{ resize: "vertical", fontSize: 12.5, lineHeight: 1.5, fontFamily: "inherit" }}
                placeholder={sugestaoTexto?.oque || "Ex.: cadeira com rolo à frente do tornozelo; sentado, o morador estende os joelhos contra a carga."}
                value={t.descricao} onChange={(e) => setTec("descricao")(e.target.value)} />
            </Campo>
            {!t.descricao.trim() && sugestaoTexto && (
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginTop: -4 }}>
                Em branco, o Dossiê usa o texto da base técnica:{" "}
                <span style={{ color: "#a8a8a4" }}>{sugestaoTexto.oque}</span>{" "}
                <button className="btn" style={{ padding: "2px 8px", fontSize: 10.5 }} onClick={() => setTec("descricao")(sugestaoTexto.oque)}>usar este texto</button>
              </div>
            )}
            <Campo label="Cenário padrão ao entrar no projeto">
              <select className="fld" value={t.cenario_padrao} onChange={(e) => setTec("cenario_padrao")(e.target.value)}>
                <option value="">Sugestão automática ({CENARIOS[cenarioSugerido(f.nome, f.zona)].label})</option>
                {(Object.keys(CENARIOS) as Cenario[]).map((k) => <option key={k} value={k}>{CENARIOS[k].label}</option>)}
              </select>
            </Campo>
            <div>
              <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => onUpload(e.target.files?.[0])} />
              <button className="btn btn-blue" onClick={() => fileRef.current?.click()}>{busy || "⭱ Subir arquivo (DWG/PDF/imagem)"}</button>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Aceita DWG, DXF, PDF ou imagem (PNG/JPG).</div>
            </div>
            {erro && <div style={{ color: "var(--red)", fontSize: 12.5 }}>{erro}</div>}
          </div>

          {/* Preview / traçado */}
          <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
            <div className="microlabel">Footprint {larg}×{prof} cm — toque as bordas para definir Entrada / Frente / Costas / Lateral</div>
            <BotaoLado k="topo" lados={lados} onCiclar={ciclarLado} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <BotaoLado k="esq" lados={lados} onCiclar={ciclarLado} vertical />
            <div style={{ position: "relative", width: previewW, height: previewH, background: "var(--panel-2)", border: "1px solid var(--line-2)", borderRadius: 8, overflow: "hidden" }}>
              {imagem && <img src={imagem} alt="equipamento" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", opacity: 0.85 }} />}
              <svg ref={svgRef} viewBox="0 0 1 1" preserveAspectRatio="none" onClick={clicarPreview} onMouseMove={moverPreview}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: (tracando || modoRecorte) ? "crosshair" : "default" }}>
                {contorno.map((pl, i) => <polyline key={i} points={pts(pl)} fill="none" stroke="#C9A227" strokeWidth={0.007} />)}
                {tracoAtual.length >= 2 && <polyline points={pts(tracoAtual)} fill="none" stroke="#5FC8E8" strokeWidth={0.007} />}
                {chunk(tracoAtual).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.012} fill="#5FC8E8" />)}
                {recorteA && recortePtr && (
                  <rect x={Math.min(recorteA[0], recortePtr[0])} y={Math.min(recorteA[1], recortePtr[1])}
                    width={Math.abs(recorteA[0] - recortePtr[0])} height={Math.abs(recorteA[1] - recortePtr[1])}
                    fill="rgba(95,200,232,0.12)" stroke="#5FC8E8" strokeWidth={0.005} strokeDasharray="0.02 0.012" />
                )}
              </svg>
            </div>
            <BotaoLado k="dir" lados={lados} onCiclar={ciclarLado} vertical />
            </div>
            <BotaoLado k="base" lados={lados} onCiclar={ciclarLado} />
            {imagem && (
              <div style={{ display: "grid", gap: 8, width: previewW, background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="microlabel" style={{ whiteSpace: "nowrap" }}>Sensibilidade</span>
                  <input type="range" min={40} max={220} value={limiar} onChange={(e) => setLimiar(Number(e.target.value))} style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: "var(--muted)", width: 26, textAlign: "right" }}>{limiar}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-gold" onClick={aplicarLimpar}>✦ Limpar desenho</button>
                  <button className="btn" onClick={restaurarImagem} disabled={imagem === imagemOriginal}>↺ Original</button>
                  <button className="btn" onClick={() => { setModoRecorte((v) => !v); setRecorteA(null); setRecortePtr(null); setTracando(false); }}
                    style={modoRecorte ? { borderColor: "var(--blue)", color: "var(--blue)" } : undefined}>{modoRecorte ? (recorteA ? "Toque o 2º canto…" : "Toque o 1º canto…") : "✂ Recortar"}</button>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.4 }}>
                  Isola os traços do equipamento (fundo transparente, na cor da zona). Recorte tira as cotas ao redor.
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", maxWidth: previewW }}>
              <button className="btn" onClick={() => { setTracando((v) => !v); setModoRecorte(false); }} style={tracando ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}>{tracando ? "Traçando…" : "✎ Traçar"}</button>
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
          <button className="btn btn-gold" disabled={!!busy} onClick={salvar}>{editando ? "Salvar alterações" : "Salvar equipamento"}</button>
          <button className="btn" onClick={() => nav("/equipamentos")}>Cancelar</button>
          {editando && <button className="btn" disabled={!!busy} onClick={excluir} style={{ marginLeft: "auto", borderColor: "var(--red)", color: "var(--red)" }}>🗑 Excluir</button>}
        </div>
      </div>
    </Shell>
  );
}

// Botão de papel de um lado do footprint (cicla Entrada→Frente→Costas→Lateral).
function BotaoLado({ k, lados, onCiclar, vertical }: { k: LadoRect; lados: Record<LadoRect, PapelLado>; onCiclar: (k: LadoRect) => void; vertical?: boolean }) {
  const papel = lados[k];
  const info = PAPEL_LADO[papel];
  return (
    <button className="btn" onClick={() => onCiclar(k)} title={`Lado ${k}: ${info.label} (toque para trocar)`}
      style={{ padding: vertical ? "14px 6px" : "6px 14px", fontSize: 11, fontWeight: 700,
        borderColor: info.cor, color: info.cor,
        ...(vertical ? { writingMode: "vertical-rl" as const } : {}) }}>
      {info.label} {papel === "entrada" ? "▸" : ""}
    </button>
  );
}

const pts = (flat: number[]) => { let s = ""; for (let i = 0; i < flat.length; i += 2) s += `${flat[i]},${flat[i + 1]} `; return s.trim(); };
const chunk = (flat: number[]): [number, number][] => { const o: [number, number][] = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };
