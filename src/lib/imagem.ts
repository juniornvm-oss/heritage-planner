// Reduz uma imagem para caber no banco (dataURL JPEG). Usado em fachada e cadastro de equipamento.
export async function reduzirImagem(file: File, max = 1200, q = 0.82): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const sc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * sc));
  c.height = Math.max(1, Math.round(img.height * sc));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

/**
 * Reduz PRESERVANDO a transparência (PNG). É o caminho certo para logotipo de
 * marca: `reduzirImagem` exporta JPEG, que não tem canal alfa, então um logo
 * com fundo transparente sai com fundo PRETO — e o Dossiê é branco.
 */
export async function reduzirPng(file: File, max = 600): Promise<string> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
  const img = await carregar(dataUrl);
  const sc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.width * sc));
  c.height = Math.max(1, Math.round(img.height * sc));
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

function carregar(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
}

const hex2rgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0];
};

/**
 * "Limpa" um desenho de linhas (foto/scan de equipamento): mantém só os traços escuros,
 * recolorindo-os na cor da zona e deixando o fundo transparente. Retorna PNG dataURL.
 * `limiar` (0-255): luminância abaixo da qual o pixel é considerado traço.
 */
export async function limparDesenho(dataUrl: string, limiar = 135, corHex = "#C9A227"): Promise<string> {
  const img = await carregar(dataUrl);
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const [cr, cg, cb] = hex2rgb(corHex);
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (lum < limiar) { px[i] = cr; px[i + 1] = cg; px[i + 2] = cb; px[i + 3] = 255; }
    else px[i + 3] = 0;
  }
  ctx.putImageData(data, 0, 0);
  return c.toDataURL("image/png");
}

/**
 * Recorta um retângulo (em coordenadas normalizadas 0..1) de uma imagem — usado para
 * isolar o desenho do equipamento de cotas/legendas ao redor. Retorna PNG dataURL.
 */
export async function recortarImagem(dataUrl: string, rect: { x: number; y: number; w: number; h: number }): Promise<string> {
  const img = await carregar(dataUrl);
  const sx = Math.max(0, Math.min(1, rect.x)) * img.width;
  const sy = Math.max(0, Math.min(1, rect.y)) * img.height;
  const sw = Math.max(1, Math.min(1 - rect.x, rect.w) * img.width);
  const sh = Math.max(1, Math.min(1 - rect.y, rect.h) * img.height);
  const c = document.createElement("canvas");
  c.width = Math.round(sw); c.height = Math.round(sh);
  c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}
