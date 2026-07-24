// Lê uma planta baixa (PDF / DWG / DXF / imagem) e devolve um bitmap de fundo
// para o editor. A ESCALA real é definida depois, por calibração no canvas.
// Parsers pesados carregam sob demanda via CDN (fora do bundle).

const CDN = {
  pdf: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs",
  pdfWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs",
  dxf: "https://cdn.jsdelivr.net/npm/dxf-parser@1.1.2/+esm",
  dwg: "https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web/+esm",
};
const dyn = (u: string) => import(/* @vite-ignore */ u);

export interface PlantaBitmap {
  dataUrl: string;
  larguraPx: number;
  alturaPx: number;
}

const MAX_PX = 2400;

async function lerPdf(file: File): Promise<PlantaBitmap> {
  const pdfjs: any = await dyn(CDN.pdf);
  pdfjs.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, MAX_PX / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), larguraPx: canvas.width, alturaPx: canvas.height };
}

function desenharEntidades(entities: any[], blocks: Record<string, any>): PlantaBitmap {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const segs: [number, number, number, number][] = [];
  const hit = (x: number, y: number) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
  const push = (ents: any[], tf: (x: number, y: number) => [number, number]) => {
    for (const e of ents || []) {
      const t = (e.type || "").toUpperCase();
      if (t === "LINE" || t === "LWPOLYLINE" || t === "POLYLINE") {
        const vs = (e.vertices || []).map((v: any) => tf(v.x, v.y));
        for (let i = 0; i + 1 < vs.length; i++) { segs.push([vs[i][0], vs[i][1], vs[i + 1][0], vs[i + 1][1]]); hit(vs[i][0], vs[i][1]); hit(vs[i + 1][0], vs[i + 1][1]); }
      } else if (t === "CIRCLE" && e.center) {
        const n = 24; let prev = tf(e.center.x + e.radius, e.center.y);
        for (let i = 1; i <= n; i++) { const a = (i / n) * 2 * Math.PI; const p = tf(e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a)); segs.push([prev[0], prev[1], p[0], p[1]]); hit(p[0], p[1]); prev = p; }
      } else if (t === "INSERT" && blocks && blocks[e.name]?.entities) {
        const p = e.position || { x: 0, y: 0 }, xs = e.xScale || 1, ys = e.yScale || 1;
        const r = -((e.rotation || 0) * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r);
        push(blocks[e.name].entities, (bx, by) => { const [wx, wy] = tf(p.x + bx * xs * c - by * ys * s, p.y + bx * xs * s + by * ys * c); return [wx, wy]; });
      }
    }
  };
  push(entities, (x, y) => [x, y]);
  if (!Number.isFinite(minX)) throw new Error("Desenho sem geometria reconhecível.");
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const scale = Math.min(MAX_PX / w, MAX_PX / h, 3);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.ceil(w * scale));
  canvas.height = Math.max(2, Math.ceil(h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segs) {
    // eixo Y do CAD é para cima; inverte para tela
    ctx.moveTo((x1 - minX) * scale, canvas.height - (y1 - minY) * scale);
    ctx.lineTo((x2 - minX) * scale, canvas.height - (y2 - minY) * scale);
  }
  ctx.stroke();
  return { dataUrl: canvas.toDataURL("image/png"), larguraPx: canvas.width, alturaPx: canvas.height };
}

async function lerDxf(file: File): Promise<PlantaBitmap> {
  const mod: any = await dyn(CDN.dxf);
  const DxfParser = mod.default || mod.DxfParser || mod;
  const parsed = new DxfParser().parseSync(await file.text());
  return desenharEntidades(parsed.entities, parsed.blocks || {});
}

async function lerDwg(file: File): Promise<PlantaBitmap> {
  const { LibreDwg, Dwg_File_Type }: any = await dyn(CDN.dwg);
  const lib = await LibreDwg.create();
  const dwg = lib.dwg_read_data(new Uint8Array(await file.arrayBuffer()), Dwg_File_Type.DWG);
  const db = lib.convert(dwg);
  const blocks: Record<string, any> = {};
  (db.blocks || []).forEach((b: any) => { if (b?.name) blocks[b.name] = { entities: b.entities || [] }; });
  const ents = db.entities || (db.blocks && db.blocks.model_space) || [];
  const out = desenharEntidades(ents, blocks);
  try { lib.dwg_free(dwg); } catch { /* ignore */ }
  return out;
}

async function lerImagem(file: File): Promise<PlantaBitmap> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  const dims = await new Promise<{ w: number; h: number }>((res, rej) => { const img = new Image(); img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight }); img.onerror = rej; img.src = dataUrl; });
  return { dataUrl, larguraPx: dims.w, alturaPx: dims.h };
}

export async function lerPlanta(file: File): Promise<PlantaBitmap> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return lerPdf(file);
  if (ext === "dxf") return lerDxf(file);
  if (ext === "dwg") return lerDwg(file);
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return lerImagem(file);
  throw new Error("Formato não suportado. Use PDF, DWG, DXF ou imagem.");
}
