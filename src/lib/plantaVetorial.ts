// Leitor VETORIAL de planta (DXF/DWG): separa DESENHO (geometria) de TEXTO (rótulos/cotas)
// e devolve tudo em cm, para desenhar como vetor no editor. Baseado no walker validado de
// tools/importar.js e no IsTextEntity do dxf-viewer. PDF vetorial fica para outro ciclo.

import type { Traco, Rotulo, Camada, PlantaVetorial } from "./types";

const CDN = {
  dxf: "https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/+esm",
  dwg: "https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web/+esm",
};
const dyn = (u: string) => import(/* @vite-ignore */ u);

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
export function dxfEntidadesParaVetorial(entities: Ent[], blocks: Record<string, Ent>, unitFactor = 1): {
  tracos: Traco[]; rotulos: Rotulo[]; camadas: Camada[];
} {
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
      if (t === "LINE" || t === "LWPOLYLINE" || t === "POLYLINE") {
        addTraco((e.vertices || []).map((v: Ent) => tf(v.x, v.y)), camada, e.shape || e.closed);
      } else if (t === "CIRCLE" && e.center) {
        const n = 32, pts: [number, number][] = [];
        for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; pts.push(tf(e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a))); }
        addTraco(pts, camada, true);
      } else if (t === "ARC" && e.center) {
        let a0 = (e.startAngle || 0) * Math.PI / 180, a1 = (e.endAngle || 0) * Math.PI / 180;
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
        if (pt && txt) { const [x, y] = tf(pt.x, pt.y); rotulosRaw.push({ texto: txt, x, y, altura: e.textHeight || e.height || 20, rot: e.rotation || 0, camada }); hit(x, y); }
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
  return { origem, ...g, x_cm: 0, y_cm: 0, rotacao: 0, opacidade: 0.9, bloqueada: false, mostrarTexto: true };
}

/** Lê DXF/DWG como vetor. Retorna null se não houver geometria (chamador cai no raster). */
export async function lerPlantaVetorial(file: File): Promise<PlantaVetorial | null> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "dxf") {
    const mod: Ent = await dyn(CDN.dxf);
    const DxfParser = mod.default || mod.DxfParser || mod;
    const parsed = new DxfParser().parseSync(await file.text());
    const insunits = Number(parsed.header?.["$INSUNITS"] ?? 0);
    const g = dxfEntidadesParaVetorial(parsed.entities, parsed.blocks || {}, unitToCm(insunits));
    return g.tracos.length ? montar("dxf", g) : null;
  }
  if (ext === "dwg") {
    const { LibreDwg, Dwg_File_Type }: Ent = await dyn(CDN.dwg);
    const lib = await LibreDwg.create();
    const dwg = lib.dwg_read_data(new Uint8Array(await file.arrayBuffer()), Dwg_File_Type.DWG);
    const db = lib.convert(dwg);
    const blocks: Record<string, Ent> = {};
    (db.blocks || []).forEach((b: Ent) => { if (b?.name) blocks[b.name] = { entities: b.entities || [] }; });
    const ents = db.entities || (db.blocks && db.blocks.model_space) || [];
    const g = dxfEntidadesParaVetorial(ents, blocks, 1); // unidades do DWG desconhecidas → calibrar
    try { lib.dwg_free(dwg); } catch { /* ignore */ }
    return g.tracos.length ? montar("dwg", g) : null;
  }
  return null;
}
