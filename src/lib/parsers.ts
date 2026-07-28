// Carregadores dos parsers de planta baixa (DXF / DWG / PDF).
//
// IMPORTANTE: antes estes módulos eram baixados de um CDN (jsdelivr) em runtime
// via `import("https://…")`. Quando o CDN estava bloqueado (CSP na Vercel, rede
// corporativa, offline ou instabilidade) o import falhava e derrubava o editor
// inteiro — a origem dos "muitos erros" ao importar plantas. Agora os parsers são
// dependências empacotadas: o Vite os serve do próprio app, como chunks sob
// demanda (lazy), sem nenhuma dependência de rede externa.

import type * as PdfjsNS from "pdfjs-dist";

let pdfjsPromise: Promise<typeof PdfjsNS> | null = null;

/** pdf.js já com o worker apontado para o bundle local (sem CDN). */
export async function carregarPdfjs(): Promise<typeof PdfjsNS> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      // O worker é emitido pelo Vite e servido pela própria origem do app.
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/** Construtor do dxf-parser (pacote puro-JS empacotado). */
export async function carregarDxfParser(): Promise<new () => { parseSync(t: string): unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("dxf-parser");
  return mod.default || mod.DxfParser || mod;
}

/** LibreDwg (wasm) sem CDN: o pacote resolve o .wasm por
 *  `new URL("libredwg-web.wasm", import.meta.url)`, que o Vite reescreve para um
 *  asset servido pela própria origem do app. Por isso `create()` sem argumento
 *  já usa o wasm empacotado. */
export async function carregarLibreDwg() {
  const mod = await import("@mlightcad/libredwg-web");
  const lib = await mod.LibreDwg.create();
  return { lib, Dwg_File_Type: mod.Dwg_File_Type };
}
