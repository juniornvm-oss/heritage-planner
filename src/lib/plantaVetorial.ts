// Leitor VETORIAL de planta (DXF/DWG): separa DESENHO (geometria) de TEXTO (rótulos/cotas)
// e devolve tudo em cm, para desenhar como vetor no editor. Baseado no walker validado de
// tools/importar.js e no IsTextEntity do dxf-viewer. PDF vetorial fica para outro ciclo.

import type { Traco, Rotulo, Camada, PlantaVetorial } from "./types";
import { carregarPdfjs, carregarDxfParser, carregarLibreDwg } from "./parsers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ent = any;

const TEXTO = new Set(["TEXT", "MTEXT", "DIMENSION", "ATTRIB", "ATTDEF"]);

/** $INSUNITS → fator para cm (mm por padrão, como no importar.js). */
export function unitToCm(insunits: number): number {
  return ({ 1: 2.54, 4: 0.1, 5: 1, 6: 100 } as Record<number, number>)[insunits] ?? 0.1;
}

function limparTexto(s: unknown): string {
  return String(s ?? "")
    .replace(/\\P/g, " ")
    .replace(/\\[A-Za-z][^;]*;/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

/**
 * Converte entidades DXF (dxf-parser / libredwg) em geometria vetorial + rótulos, em cm.
 * Função pura e testável (sem DOM). Y do CAD é para cima → invertido para o editor (y p/ baixo).
 */
export function dxfEntidadesParaVetorial(entities: Ent[], blocks: Record<string, Ent>, unitFactor = 1, angulosRad = false): {
  tracos: Traco[]; rotulos: Rotulo[]; camadas: Camada[];
} {
  const grau = (a: number) => (angulosRad ? a : (a * Math.PI) / 180); // ARC: DXF em graus, DWG em radianos
  const tracosRaw: { pts: [number, number][]; camada: string; fechado?: boolean }[] = [];
  const rotulosRaw: { texto: string; x: number; y: number; altura: number; rot: number; camada: string }[] = [];
  const camadas = new Set<string>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const hit = (x: number, y: number) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  const addTraco = (pts: [number, number][], camada: string, fechado?: boolean) => {
    if (pts.length >= 2) { tracosRaw.push({ pts, camada, fechado }); for (const [x, y] of pts) hit(x, y); }
  };

  const walk = (ents: Ent[], tf: (x: number, y: number) => [number, number], depth = 0) => {
    if (depth > 8) return;
    for (const e of ents || []) {
      const t = (e.type || "").toUpperCase();
      const camada = e.layer || "0";
      camadas.add(camada);
      if (t === "LINE") {
        // dxf-parser: e.vertices; libredwg: startPoint/endPoint
        if (e.startPoint && e.endPoint) addTraco([tf(e.startPoint.x, e.startPoint.y), tf(e.endPoint.x, e.endPoint.y)], camada);
        else if (e.vertices) addTraco((e.vertices || []).map((v: Ent) => tf(v.x, v.y)), camada);
      } else if (t === "LWPOLYLINE" || t === "POLYLINE" || t === "POLYLINE2D" || t === "POLYLINE3D") {
        addTraco((e.vertices || []).map((v: Ent) => tf(v.x, v.y)), camada, e.shape || e.closed || !!(e.flag & 1));
      } else if (t === "CIRCLE" && e.center) {
        const n = 32, pts: [number, number][] = [];
        for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; pts.push(tf(e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a))); }
        addTraco(pts, camada, true);
      } else if (t === "ARC" && e.center) {
        let a0 = grau(e.startAngle || 0), a1 = grau(e.endAngle || 0);
        if (a1 < a0) a1 += 2 * Math.PI;
        const n = Math.max(6, Math.ceil((a1 - a0) / (Math.PI / 16))), pts: [number, number][] = [];
        for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push(tf(e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a))); }
        addTraco(pts, camada);
      } else if (t === "ELLIPSE" && e.center && e.majorAxisEndPoint) {
        const mx = e.majorAxisEndPoint.x, my = e.majorAxisEndPoint.y;
        const rot = Math.atan2(my, mx), rx = Math.hypot(mx, my), ry = rx * (e.axisRatio ?? 1);
        let a0 = e.startAngle ?? 0, a1 = e.endAngle ?? (2 * Math.PI); if (a1 < a0) a1 += 2 * Math.PI;
        const n = 48, pts: [number, number][] = [];
        for (let i = 0; i <= n; i++) {
          const a = a0 + (a1 - a0) * (i / n), ex = rx * Math.cos(a), ey = ry * Math.sin(a);
          pts.push(tf(e.center.x + ex * Math.cos(rot) - ey * Math.sin(rot), e.center.y + ex * Math.sin(rot) + ey * Math.cos(rot)));
        }
        addTraco(pts, camada);
      } else if (t === "INSERT" && blocks && blocks[e.name]?.entities) {
        const p = e.position || { x: 0, y: 0 }, xs = e.xScale || 1, ys = e.yScale || 1;
        const r = -((e.rotation || 0) * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r);
        walk(blocks[e.name].entities, (bx, by) => tf(p.x + bx * xs * c - by * ys * s, p.y + bx * xs * s + by * ys * c), depth + 1);
      } else if (TEXTO.has(t)) {
        const pt = e.startPoint || e.position || e.textMidPoint || e.anchorPoint;
        const txt = limparTexto(e.text ?? e.string);
        if (pt && txt) { const [x, y] = tf(pt.x, pt.y); const rot = angulosRad ? (e.rotation || 0) * 180 / Math.PI : (e.rotation || 0); rotulosRaw.push({ texto: txt, x, y, altura: e.textHeight || e.height || 20, rot, camada }); hit(x, y); }
      }
    }
  };
  walk(entities, (x, y) => [x, y]);

  if (!Number.isFinite(minX)) return { tracos: [], rotulos: [], camadas: [] };
  const u = unitFactor || 1;
  const nx = (x: number) => (x - minX) * u;   // origem no canto
  const ny = (y: number) => (maxY - y) * u;   // inverte Y do CAD (topo → 0)

  const tracos: Traco[] = tracosRaw.map((tr) => ({ pts: tr.pts.flatMap(([x, y]) => [nx(x), ny(y)]), camada: tr.camada, fechado: tr.fechado }));
  const rotulos: Rotulo[] = rotulosRaw.map((r) => ({ texto: r.texto, x_cm: nx(r.x), y_cm: ny(r.y), altura: (r.altura || 20) * u, rotacao: -(r.rot || 0), camada: r.camada }));
  return { tracos, rotulos, camadas: [...camadas].map((nome) => ({ nome, visivel: true })) };
}

function montar(origem: "dxf" | "dwg", g: { tracos: Traco[]; rotulos: Rotulo[]; camadas: Camada[] }): PlantaVetorial {
  return { origem, ...g, x_cm: 0, y_cm: 0, rotacao: 0, escala: 1, opacidade: 0.9, bloqueada: false, mostrarTexto: true };
}

// ── PDF vetorial (pdf.js): extrai o DESENHO (paths) separando o TEXTO ──────────
const mulM = (m: number[], n: number[]) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apM = (m: number[], x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

async function lerPdfVetorial(file: File): Promise<PlantaVetorial | null> {
  const pdfjs: Ent = await carregarPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const ol = await page.getOperatorList();
  const OPS = pdfjs.OPS;

  const tracosRaw: [number, number][][] = [];
  let ctm = [1, 0, 0, 1, 0, 0]; const pilha: number[][] = [];
  const SEGN = 8;
  const cubica = (p0: [number, number], c1: [number, number], c2: [number, number], p1: [number, number], out: [number, number][]) => {
    for (let i = 1; i <= SEGN; i++) { const t = i / SEGN, u = 1 - t; out.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]]); }
  };
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPS.save) pilha.push(ctm.slice());
    else if (fn === OPS.restore) ctm = pilha.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mulM(ctm, a);
    else if (fn === OPS.constructPath) {
      const ops = a[0], co = a[1]; let k = 0, cur: [number, number] | null = null, sub: [number, number][] = [];
      const flush = () => { if (sub.length >= 2) tracosRaw.push(sub); sub = []; };
      for (const op of ops) {
        if (op === OPS.moveTo) { flush(); cur = apM(ctm, co[k], co[k + 1]); k += 2; sub = [cur]; }
        else if (op === OPS.lineTo) { cur = apM(ctm, co[k], co[k + 1]); k += 2; sub.push(cur); }
        else if (op === OPS.curveTo) { const c1 = apM(ctm, co[k], co[k + 1]), c2 = apM(ctm, co[k + 2], co[k + 3]), p1 = apM(ctm, co[k + 4], co[k + 5]); if (cur) cubica(cur, c1, c2, p1, sub); cur = p1; k += 6; }
        else if (op === OPS.curveTo2) { const c2 = apM(ctm, co[k], co[k + 1]), p1 = apM(ctm, co[k + 2], co[k + 3]); if (cur) cubica(cur, cur, c2, p1, sub); cur = p1; k += 4; }
        else if (op === OPS.curveTo3) { const c1 = apM(ctm, co[k], co[k + 1]), p1 = apM(ctm, co[k + 2], co[k + 3]); if (cur) cubica(cur, c1, p1, p1, sub); cur = p1; k += 4; }
        else if (op === OPS.rectangle) { const x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3]; k += 4; flush(); sub = [apM(ctm, x, y), apM(ctm, x + w, y), apM(ctm, x + w, y + h), apM(ctm, x, y + h), apM(ctm, x, y)]; flush(); }
        else if (op === OPS.closePath) { if (sub.length) sub.push(sub[0]); }
      }
      flush();
    }
  }

  const tc = await page.getTextContent();
  const rotulosRaw = (tc.items as Ent[]).filter((t) => t.str && t.str.trim()).map((t) => {
    const m = t.transform as number[];
    return { texto: String(t.str).trim(), x: m[4], y: m[5], altura: t.height || Math.hypot(m[2], m[3]) || 10, rot: -(Math.atan2(m[1], m[0]) * 180 / Math.PI) };
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pl of tracosRaw) for (const [x, y] of pl) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (!Number.isFinite(minX)) return null;
  const nx = (x: number) => x - minX, ny = (y: number) => maxY - y; // inverte Y (PDF/CAD para cima)
  const tracos: Traco[] = tracosRaw.map((pl) => ({ pts: pl.flatMap(([x, y]) => [nx(x), ny(y)]), camada: "desenho" }));
  const rotulos: Rotulo[] = rotulosRaw.map((r) => ({ texto: r.texto, x_cm: nx(r.x), y_cm: ny(r.y), altura: r.altura, rotacao: r.rot, camada: "texto" }));
  return { origem: "pdf", tracos, rotulos, camadas: [{ nome: "desenho", visivel: true }], x_cm: 0, y_cm: 0, rotacao: 0, escala: 1, opacidade: 0.9, bloqueada: false, mostrarTexto: true };
}

/** Extrai o contorno (footprint) de um DWG/PDF/DXF como polilinhas normalizadas 0..1 (para equipamento). */
export async function contornoDeArquivo(file: File): Promise<number[][] | null> {
  const pv = await lerPlantaVetorial(file);
  if (!pv || !pv.tracos.length) return null;
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  for (const t of pv.tracos) for (let i = 0; i < t.pts.length; i += 2) { mnx = Math.min(mnx, t.pts[i]); mxx = Math.max(mxx, t.pts[i]); mny = Math.min(mny, t.pts[i + 1]); mxy = Math.max(mxy, t.pts[i + 1]); }
  const w = (mxx - mnx) || 1, h = (mxy - mny) || 1;
  return pv.tracos.map((t) => t.pts.map((v, i) => (i % 2 === 0 ? (v - mnx) / w : (v - mny) / h)));
}

/** Lê DXF/DWG/PDF como vetor. Retorna null se não houver geometria (chamador cai no raster). */
export async function lerPlantaVetorial(file: File): Promise<PlantaVetorial | null> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return lerPdfVetorial(file);
  if (ext === "dxf") {
    const DxfParser = await carregarDxfParser();
    const parsed = (new DxfParser().parseSync(await file.text())) as Ent;
    const insunits = Number(parsed.header?.["$INSUNITS"] ?? 0);
    const g = dxfEntidadesParaVetorial(parsed.entities, parsed.blocks || {}, unitToCm(insunits));
    return g.tracos.length ? montar("dxf", g) : null;
  }
  if (ext === "dwg") {
    const { lib, Dwg_File_Type }: Ent = await carregarLibreDwg();
    const dwg = lib.dwg_read_data(new Uint8Array(await file.arrayBuffer()), Dwg_File_Type.DWG);
    const db = lib.convert(dwg);
    const blocks: Record<string, Ent> = {};
    (db.blocks || []).forEach((b: Ent) => { if (b?.name) blocks[b.name] = { entities: b.entities || [] }; });
    const ents = db.entities || [];
    const insunits = Number(db.header?.INSUNITS ?? db.header?.["$INSUNITS"] ?? 0);
    // libredwg: ângulos em RADIANOS; LINE via startPoint/endPoint (tratado no walker)
    const g = dxfEntidadesParaVetorial(ents, blocks, unitToCm(insunits), true);
    try { lib.dwg_free(dwg); } catch { /* ignore */ }
    return g.tracos.length ? montar("dwg", g) : null;
  }
  return null;
}
