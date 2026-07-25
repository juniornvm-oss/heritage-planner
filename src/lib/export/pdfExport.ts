import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Projeto } from "../types";
import { ZONAS, CENARIOS, TAXA_ASSESSORIA } from "../types";
import { resumo } from "../validation";
import { BRL, formatLength } from "../units";

const GOLD = rgb(0.788, 0.635, 0.153);
const DARK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.45, 0.45);

/** Gera o PDF de entrega e dispara o download. `plantaPng` é o snapshot do editor (opcional). */
export async function exportarPdf(projeto: Projeto, plantaPng?: string | null) {
  const cena = projeto.cena!;
  const r = resumo(cena);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const A4 = { w: 595, h: 842 };
  let page = doc.addPage([A4.w, A4.h]);
  let y = A4.h - 56;
  const M = 48;

  const text = (s: string, x: number, yy: number, size: number, f = font, color = DARK) =>
    page.drawText(s, { x, y: yy, size, font: f, color });

  // Cabeçalho
  text("ASSESSORIA TÉCNICA · IMPLANTAÇÃO DE ACADEMIA", M, y, 9, bold, GOLD); y -= 22;
  text(projeto.nome, M, y, 22, bold); y -= 18;
  const meta = [projeto.sindico && `Síndico: ${projeto.sindico}`, projeto.contato].filter(Boolean).join("  ·  ");
  if (meta) { text(meta, M, y, 10, font, MUTED); y -= 16; }
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 2, color: GOLD }); y -= 24;

  // Planta (snapshot)
  if (plantaPng) {
    try {
      const png = await doc.embedPng(plantaPng);
      const maxW = A4.w - M * 2, maxH = 320;
      const scale = Math.min(maxW / png.width, maxH / png.height);
      const w = png.width * scale, h = png.height * scale;
      text("PLANTA — DISTRIBUIÇÃO", M, y, 11, bold, GOLD); y -= 12;
      page.drawImage(png, { x: M, y: y - h, width: w, height: h });
      y -= h + 22;
    } catch { /* ignora imagem inválida */ }
  }

  // Lista técnica por zona
  const ensure = (need: number) => { if (y < need) { page = doc.addPage([A4.w, A4.h]); y = A4.h - 56; } };
  ensure(120);
  text("LISTA TÉCNICA DE EQUIPAMENTOS", M, y, 11, bold, GOLD); y -= 18;
  const zonas = Array.from(new Set(cena.itens.map((i) => i.zona)));
  for (const z of zonas) {
    ensure(60);
    text((ZONAS[z]?.label || z).toUpperCase(), M, y, 9, bold, MUTED); y -= 14;
    for (const it of cena.itens.filter((i) => i.zona === z)) {
      ensure(40);
      text(it.nome, M + 8, y, 10);
      text(`${formatLength(it.w_cm)} × ${formatLength(it.h_cm)}`, M + 250, y, 9, font, MUTED);
      text(BRL(it.preco), A4.w - M - 70, y, 10, font, DARK);
      y -= 14;
    }
    y -= 6;
  }

  // Cenários + resumo financeiro
  ensure(140);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) }); y -= 20;
  text("CENÁRIOS DE INVESTIMENTO", M, y, 11, bold, GOLD); y -= 18;
  (Object.keys(CENARIOS) as (keyof typeof CENARIOS)[]).forEach((k) => {
    text(CENARIOS[k].label, M + 8, y, 10, bold);
    text(BRL(r.cenarios[k]), M + 160, y, 10);
    y -= 15;
  });
  y -= 10;
  const teto = Number(projeto.orcamento_teto) || 0;
  text("RESUMO FINANCEIRO", M, y, 11, bold, GOLD); y -= 16;
  if (teto) { text(`Orçamento-teto: ${BRL(teto)}`, M + 8, y, 10); y -= 14; }
  if (teto) { text(`Honorário da assessoria (0,5%): ${BRL(Math.round(teto * TAXA_ASSESSORIA))}`, M + 8, y, 10); y -= 14; }
  text(`Investimento (Balanceado): ${BRL(r.cenarios.balanceado)}`, M + 8, y, 10); y -= 14;
  text(`Equipamentos: ${cena.itens.length}  ·  Ocupação: ${r.ocupacao}%`, M + 8, y, 10); y -= 24;

  text("A academia mais funcional e bonita que o orçamento pode comprar.", M, 40, 9, font, MUTED);

  const bytes = await doc.save();
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projeto.nome.replace(/[^\w\-]+/g, "_")}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
