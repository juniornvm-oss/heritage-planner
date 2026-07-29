import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { Projeto, Equipamento, ItemPosicionado, ConfigConsultor } from "../types";
import { ZONAS, CENARIOS, TAXA_ASSESSORIA } from "../types";
import { resumo, matrizDaCena } from "../validation";
import { BRL, formatLength } from "../units";
import { areaPoligonoM2 } from "../geometria";

// Paleta do dossiê
const GOLD = rgb(0.722, 0.439, 0.290); // cobre da marca Heritage GymBuilder
const DARK = rgb(0.11, 0.11, 0.11);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);
const CREAM = rgb(0.98, 0.965, 0.913);
const DARKBG = rgb(0.1, 0.1, 0.1);
const GREEN = rgb(0.18, 0.49, 0.2);
const RED = rgb(0.78, 0.16, 0.16);

// Sanitiza texto para o WinAnsi das fontes standard (evita crash com emoji/setas/símbolos).
const ENC_KEEP = new Set([0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac]);
const ENC_MAP: Record<number, string> = { 0x2286: "", 0x2192: "->", 0x2194: "<->", 0x2264: "<=", 0x2265: ">=" };
function enc(s: string): string {
  let out = "";
  for (const ch of String(s)) {
    const c = ch.codePointAt(0)!;
    if (c <= 0xff || ENC_KEEP.has(c)) out += ch;
    else if (ENC_MAP[c] != null) out += ENC_MAP[c];
  }
  return out;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

const A4 = { w: 595, h: 842 };
const M = 48;
const CW = A4.w - M * 2;

/**
 * Monta o Dossiê Executivo (PDF de alto padrão) e retorna os bytes.
 * Função pura (só pdf-lib) — testável em Node, sem tocar no DOM.
 */
export async function montarDossie(
  projeto: Projeto,
  plantaPng?: string | null,
  catalogo?: Equipamento[],
  config?: ConfigConsultor | null,
): Promise<Uint8Array> {
  // Rodapé/assinatura vindos do Cadastro do consultor (fallback: padrão Heritage).
  const assinatura = (config?.rodape && config.rodape.trim())
    || [config?.empresa, "Assessoria Técnica de Implantação"].filter(Boolean).join(" · ")
    || "Heritage GymBuilder · Assessoria Técnica de Implantação";
  const cena = projeto.cena!;
  const r = resumo(cena);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // catálogo p/ resolver marca/modelo (por id ou nome)
  const catId = new Map<string, Equipamento>();
  const catNome = new Map<string, Equipamento>();
  (catalogo ?? []).forEach((e) => { if (e.id) catId.set(e.id, e); catNome.set(e.nome, e); });
  const marcaDe = (it: ItemPosicionado) => {
    const e = (it.equipamentoId && catId.get(it.equipamentoId)) || catNome.get(it.nome);
    return [e?.marca, e?.modelo].filter(Boolean).join(" ");
  };

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = 0;
  let pageNo = 0;

  const w = (s: string, size: number, f: PDFFont = font) => f.widthOfTextAtSize(enc(s), size);
  const at = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color: RGB = DARK) =>
    page.drawText(enc(s), { x, y: yy, size, font: f, color });
  const rightAt = (s: string, xRight: number, yy: number, size: number, f: PDFFont = font, color: RGB = DARK) =>
    at(s, xRight - w(s, size, f), yy, size, f, color);
  const trunc = (s: string, maxW: number, size: number, f: PDFFont = font) => {
    if (w(s, size, f) <= maxW) return s;
    let t = s;
    while (t.length > 1 && w(t + "…", size, f) > maxW) t = t.slice(0, -1);
    return t + "…";
  };

  const footer = () => {
    page.drawLine({ start: { x: M, y: 54 }, end: { x: A4.w - M, y: 54 }, thickness: 0.5, color: LINE });
    at(assinatura, M, 44, 8, font, MUTED);
    rightAt(`p. ${pageNo}`, A4.w - M, 44, 8, font, MUTED);
  };
  const novaPagina = () => { page = doc.addPage([A4.w, A4.h]); pageNo++; y = A4.h - 64; footer(); };
  const ensure = (need: number) => { if (y - need < 72) novaPagina(); };

  const secao = (titulo: string) => {
    ensure(46);
    y -= 8;
    at(titulo.toUpperCase(), M, y, 12, bold, GOLD);
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1.4, color: GOLD });
    y -= 18;
  };

  const paragrafo = (s: string, size = 10, color: RGB = DARK, f: PDFFont = font) => {
    const maxW = CW;
    const palavras = s.split(/\s+/);
    let linha = "";
    const flush = () => { if (linha) { ensure(size + 4); at(linha, M, y, size, f, color); y -= size + 4; linha = ""; } };
    for (const p of palavras) {
      const t = linha ? linha + " " + p : p;
      if (w(t, size, f) > maxW) { flush(); linha = p; } else linha = t;
    }
    flush();
  };

  const kvList = (obj?: Record<string, unknown> | null) => {
    const entradas = Object.entries(obj ?? {}).filter(([, v]) => v != null && String(v).trim() !== "");
    if (!entradas.length) { paragrafo("Não informado.", 10, MUTED); return; }
    for (const [k, v] of entradas) {
      ensure(16);
      const rotulo = k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      at(rotulo + ":", M, y, 10, bold, DARK);
      const x0 = M + w(rotulo + ": ", 10, bold);
      at(trunc(String(v), CW - (x0 - M), 10), x0, y, 10, font, rgb(0.25, 0.25, 0.25));
      y -= 16;
    }
  };

  // ── CAPA ────────────────────────────────────────────────────────────────
  pageNo = 1;
  page.drawRectangle({ x: 0, y: A4.h - 8, width: A4.w, height: 8, color: GOLD });
  y = A4.h - 150;
  at("ASSESSORIA TÉCNICA · IMPLANTAÇÃO DE ACADEMIA", M, y, 10, bold, GOLD); y -= 46;
  for (const linha of quebrar(projeto.nome, CW, 34, bold, w)) { at(linha, M, y, 34, bold, DARK); y -= 40; }
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: M + 120, y }, thickness: 2, color: GOLD }); y -= 30;
  const capaMeta = [
    projeto.endereco && String(projeto.endereco),
    projeto.sindico && `Síndico: ${projeto.sindico}`,
    projeto.contato && String(projeto.contato),
  ].filter(Boolean) as string[];
  for (const m of capaMeta) { at(m, M, y, 12, font, rgb(0.3, 0.3, 0.3)); y -= 18; }
  y -= 10;
  at(`Dossiê Executivo · Fase 04    ·    ${dataBR(projeto.criado_em)}`, M, y, 11, bold, MUTED); y -= 22;
  const preparado = [
    config?.consultor && `Preparado por ${config.consultor}`,
    config?.registro && `(${config.registro})`,
    config?.whatsapp && `· ${config.whatsapp}`,
  ].filter(Boolean).join(" ");
  if (preparado) at(preparado, M, y, 10, font, rgb(0.35, 0.35, 0.35));
  y -= 18;

  const teto = Number(projeto.orcamento_teto) || 0;
  if (teto) {
    page.drawRectangle({ x: M, y: y - 58, width: CW, height: 58, borderColor: LINE, borderWidth: 1, color: CREAM });
    at("ORÇAMENTO-TETO DE INVESTIMENTO", M + 16, y - 20, 9, bold, MUTED);
    at(BRL(teto), M + 16, y - 44, 20, bold, DARK);
    at("HONORÁRIO DA ASSESSORIA (0,5%)", A4.w - M - 220, y - 20, 9, bold, MUTED);
    at(BRL(Math.round(teto * TAXA_ASSESSORIA)), A4.w - M - 220, y - 44, 20, bold, GOLD);
  }
  at("A academia mais funcional e bonita que o orçamento do condomínio pode ter.", M, 70, 10, font, MUTED);

  // ── CONTEÚDO ────────────────────────────────────────────────────────────
  novaPagina();

  secao("01 · Diagnóstico — Perfil de Uso");
  kvList(projeto.perfil as Record<string, unknown>);
  y -= 6;

  secao("09 · Análise de Infraestrutura");
  kvList(projeto.infraestrutura as Record<string, unknown>);
  if (projeto.observacoes) { y -= 4; at("Observações", M, y, 10, bold, DARK); y -= 14; paragrafo(String(projeto.observacoes), 10, rgb(0.25, 0.25, 0.25)); }
  y -= 6;

  // Planta
  if (plantaPng) {
    try {
      const png = await doc.embedPng(plantaPng);
      const maxW = CW, maxH = 300;
      const sc = Math.min(maxW / png.width, maxH / png.height);
      const iw = png.width * sc, ih = png.height * sc;
      ensure(ih + 40);
      secao("02 · Planta — Distribuição em Escala");
      page.drawRectangle({ x: M, y: y - ih - 8, width: iw + 8, height: ih + 8, borderColor: LINE, borderWidth: 1 });
      page.drawImage(png, { x: M + 4, y: y - ih - 4, width: iw, height: ih });
      y -= ih + 16;
      at(`Sala ${formatLength(cena.sala.largura_cm)} × ${formatLength(cena.sala.profundidade_cm)}  ·  Ocupação ${r.ocupacao}%  ·  ${cena.itens.length} equipamentos`, M, y, 9, font, MUTED);
      y -= 18;
    } catch { /* imagem inválida */ }
  }

  // ── Lista técnica por zona ──
  secao("03 · Lista Técnica de Equipamentos");
  const colDim = M + 232, colCen = M + 340, colVal = A4.w - M - 6;
  const cabecalho = () => {
    page.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: CREAM });
    at("EQUIPAMENTO", M + 6, y, 8, bold, MUTED);
    at("DIMENSÕES", colDim, y, 8, bold, MUTED);
    at("CENÁRIO", colCen, y, 8, bold, MUTED);
    rightAt("VALOR", colVal, y, 8, bold, MUTED);
    y -= 22;
  };
  cabecalho();
  const zonas = Array.from(new Set(cena.itens.map((i) => i.zona)));
  for (const z of zonas) {
    ensure(40);
    if (y < A4.h - 66) { /* garante cabeçalho ao virar página */ }
    page.drawRectangle({ x: M, y: y - 3, width: CW, height: 16, color: DARKBG });
    at((ZONAS[z]?.label || z).toUpperCase(), M + 6, y, 8, bold, hexToRgb(ZONAS[z]?.cor || "#C9A227"));
    y -= 20;
    let sub = 0;
    for (const it of cena.itens.filter((i) => i.zona === z)) {
      ensure(18);
      const marca = marcaDe(it);
      const nomeCell = trunc(it.nome + (marca ? ` · ${marca}` : ""), colDim - (M + 6) - 8, 9.5);
      at(nomeCell, M + 6, y, 9.5, font, DARK);
      at(`${formatLength(it.w_cm)} × ${formatLength(it.h_cm)}`, colDim, y, 9, font, MUTED);
      at(CENARIOS[it.cenario].label, colCen, y, 9, font, hexToRgb(CENARIOS[it.cenario].cor));
      rightAt(BRL(it.preco), colVal, y, 9.5, font, DARK);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: A4.w - M, y: y - 5 }, thickness: 0.4, color: LINE });
      y -= 16;
      sub += it.preco || 0;
    }
    ensure(16);
    at(`Subtotal ${ZONAS[z]?.label || z}`, M + 6, y, 9, bold, DARK);
    rightAt(BRL(sub), colVal, y, 9, bold, DARK);
    y -= 20;
  }
  ensure(18);
  page.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: CREAM });
  at("INVESTIMENTO TOTAL (PREMIUM)", M + 6, y, 9, bold, GOLD);
  rightAt(BRL(r.cenarios.premium), colVal, y, 10, bold, GOLD);
  y -= 26;

  // ── Revestimentos & acabamentos ──
  const revest = cena.acabamentos ?? [];
  if (revest.length) {
    const areaDe = (a: (typeof revest)[number]) => (a.pontos && a.pontos.length >= 3 ? areaPoligonoM2(a.pontos) : (a.w_cm / 100) * (a.h_cm / 100));
    const totalRevest = revest.reduce((s, a) => s + areaDe(a) * (a.preco_m2 || 0), 0);
    secao("Revestimentos & Acabamentos");
    const rTipo = M + 250, rM2 = M + 340, rUnit = M + 420, rTot = A4.w - M - 6;
    page.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: CREAM });
    at("ÁREA / ACABAMENTO", M + 6, y, 8, bold, MUTED);
    at("TIPO", rTipo, y, 8, bold, MUTED);
    rightAt("M²", rM2, y, 8, bold, MUTED); rightAt("R$/M²", rUnit, y, 8, bold, MUTED); rightAt("TOTAL", rTot, y, 8, bold, MUTED);
    y -= 22;
    for (const a of revest) {
      ensure(18);
      const m2 = areaDe(a);
      at(trunc(a.nome, rTipo - (M + 6) - 8, 9.5), M + 6, y, 9.5, font, DARK);
      at(a.tipo === "parede" ? "Parede" : "Piso", rTipo, y, 9, font, MUTED);
      rightAt(m2.toFixed(1), rM2, y, 9, font, MUTED);
      rightAt(a.preco_m2 ? BRL(a.preco_m2) : "—", rUnit, y, 9, font, MUTED);
      rightAt(a.preco_m2 ? BRL(Math.round(m2 * a.preco_m2)) : "—", rTot, y, 9.5, font, DARK);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: A4.w - M, y: y - 5 }, thickness: 0.4, color: LINE });
      y -= 16;
    }
    ensure(16);
    at("Total em revestimentos", M + 6, y, 9, bold, DARK);
    rightAt(BRL(Math.round(totalRevest)), rTot, y, 10, bold, GOLD);
    y -= 24;
  }

  // ── Cenários ──
  secao("06 · Cenários de Investimento");
  paragrafo("Essencial · Balanceado · Premium — cada cenário é cumulativo (inclui os anteriores), do indispensável ao completo.", 9, MUTED);
  y -= 6;
  ensure(76);
  const cards = ["essencial", "balanceado", "premium"] as const;
  const gap = 12, cardW = (CW - gap * 2) / 3, topY = y;
  cards.forEach((k, i) => {
    const x = M + i * (cardW + gap);
    const total = r.cenarios[k];
    const saldo = teto ? teto - total : null;
    page.drawRectangle({ x, y: topY - 70, width: cardW, height: 70, borderColor: LINE, borderWidth: 1 });
    page.drawRectangle({ x, y: topY - 4, width: cardW, height: 4, color: hexToRgb(CENARIOS[k].cor) });
    at(CENARIOS[k].label.toUpperCase(), x + 12, topY - 22, 9, bold, MUTED);
    at(BRL(total), x + 12, topY - 44, 15, bold, DARK);
    if (saldo != null) at(`Saldo ${BRL(saldo)}`, x + 12, topY - 60, 9, font, saldo >= 0 ? GREEN : RED);
  });
  y = topY - 84;

  // ── Matriz de priorização ──
  const mat = matrizDaCena(cena);
  secao("05 · Matriz de Priorização");
  if (!mat.length) {
    paragrafo("Defina impacto, valor percebido e necessidade (1–5) nos equipamentos, no editor, para gerar a matriz que orienta o que preservar se o orçamento apertar.", 9.5, MUTED);
  } else {
    paragrafo("Impacto funcional · valor percebido · necessidade (1–5). Maior soma = maior prioridade — o que preservar se o orçamento apertar.", 9, MUTED);
    y -= 4;
    const cI = M + 300, cV = M + 360, cN = M + 430, cP = A4.w - M - 6;
    page.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: CREAM });
    at("EQUIPAMENTO", M + 6, y, 8, bold, MUTED);
    rightAt("IMP.", cI, y, 8, bold, MUTED); rightAt("VALOR", cV, y, 8, bold, MUTED);
    rightAt("NEC.", cN, y, 8, bold, MUTED); rightAt("PRIOR.", cP, y, 8, bold, MUTED);
    y -= 22;
    for (const it of mat) {
      ensure(18);
      at(trunc(it.nome, 250, 9.5), M + 6, y, 9.5, font, DARK);
      rightAt(String(it.impacto || "-"), cI, y, 9.5, font, MUTED);
      rightAt(String(it.valor_percebido || "-"), cV, y, 9.5, font, MUTED);
      rightAt(String(it.necessidade || "-"), cN, y, 9.5, font, MUTED);
      rightAt(String(it.prio), cP, y, 9.5, bold, GOLD);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: A4.w - M, y: y - 5 }, thickness: 0.4, color: LINE });
      y -= 16;
    }
    y -= 8;
  }

  // ── Validação técnica ──
  secao("Validação Técnica do Layout");
  if (r.nCol === 0 && r.nCor === 0) {
    at(`Layout validado — sem colisões, corredor livre. Ocupação ${r.ocupacao}% da área.`, M, y, 10, font, GREEN); y -= 18;
  } else {
    if (r.nCol) { at(`${r.nCol} colisão(ões) a resolver.`, M, y, 10, font, RED); y -= 16; }
    if (r.nCor) { at(`${r.nCor} equipamento(s) sobre o corredor de circulação.`, M, y, 10, font, hexToRgb("#E09A45")); y -= 16; }
    at(`Ocupação ${r.ocupacao}% da área.`, M, y, 10, font, MUTED); y -= 18;
  }
  y -= 6;

  // ── Resumo financeiro ──
  secao("08 · Resumo Financeiro");
  ensure(64);
  const fin: [string, string, RGB][] = [];
  if (teto) fin.push(["Orçamento-teto", BRL(teto), DARK]);
  fin.push(["Investimento (Balanceado)", BRL(r.cenarios.balanceado), DARK]);
  if (teto) fin.push(["Honorário (0,5%)", BRL(Math.round(teto * TAXA_ASSESSORIA)), GOLD]);
  if (teto) fin.push(["Saldo vs. teto", BRL(teto - r.cenarios.balanceado), teto - r.cenarios.balanceado >= 0 ? GREEN : RED]);
  const fgap = 12, fw = (CW - fgap * (fin.length - 1)) / fin.length, fy = y;
  fin.forEach(([rot, val, cor], i) => {
    const x = M + i * (fw + fgap);
    page.drawRectangle({ x, y: fy - 52, width: fw, height: 52, borderColor: LINE, borderWidth: 1 });
    at(rot.toUpperCase(), x + 10, fy - 18, 7.5, bold, MUTED);
    at(trunc(val, fw - 20, 13, bold), x + 10, fy - 40, 13, bold, cor);
  });
  y = fy - 66;
  at(`${cena.itens.length} equipamentos  ·  ${zonas.length} zonas  ·  ocupação ${r.ocupacao}%`, M, y, 9, font, MUTED);

  return await doc.save();
}

/** Gera o Dossiê e dispara o download no navegador. */
export async function exportarPdf(projeto: Projeto, plantaPng?: string | null, catalogo?: Equipamento[], config?: ConfigConsultor | null) {
  const bytes = await montarDossie(projeto, plantaPng, catalogo, config);
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Dossie_${projeto.nome.replace(/[^\w\-]+/g, "_")}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── util de quebra de linha por largura (para a capa) ──
function quebrar(s: string, maxW: number, size: number, f: PDFFont, medir: (t: string, sz: number, ff: PDFFont) => number): string[] {
  const palavras = s.split(/\s+/);
  const linhas: string[] = [];
  let linha = "";
  for (const p of palavras) {
    const t = linha ? linha + " " + p : p;
    if (medir(t, size, f) > maxW && linha) { linhas.push(linha); linha = p; } else linha = t;
  }
  if (linha) linhas.push(linha);
  return linhas;
}

function dataBR(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("pt-BR");
}
