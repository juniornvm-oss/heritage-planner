import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { Projeto, Equipamento, ItemPosicionado, ConfigConsultor, Cenario } from "../types";
import { ZONAS, CENARIOS, taxaDe, taxaLabel, ELEMENTOS_PAREDE, DESTINOS_INVENTARIO, OPCOES_DOSSIE_PADRAO } from "../types";
import { resumo, matrizDaCena } from "../validation";
import { BRL, formatLength } from "../units";
import { areaPoligonoM2 } from "../geometria";
import {
  CENARIO_DEF, classificacaoPendente, composicaoZonas, detalheCenarios,
  especificacaoDaZona, exerciciosDaCena, explicarItem,
} from "../curadoria";

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
  const taxa = taxaDe(config); // honorário do Cadastro do consultor
  const assinatura = (config?.rodape && config.rodape.trim())
    || [config?.empresa, "Assessoria Técnica de Implantação"].filter(Boolean).join(" · ")
    || "Heritage GymBuilder · Assessoria Técnica de Implantação";
  const cena = projeto.cena!;
  const r = resumo(cena);
  // Seções opcionais: ausente = ligada (o dossiê completo é o padrão).
  const mostrar = { ...OPCOES_DOSSIE_PADRAO, ...(cena.dossie ?? {}) };
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

  // `reserva` = altura do conteúdo que precisa acompanhar o título, para o
  // cabeçalho nunca ficar órfão no pé da página.
  const secao = (titulo: string, reserva = 0) => {
    ensure(46 + reserva);
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

  // Quebra um texto em linhas que cabem em `maxW` (sem desenhar).
  const linhasDe = (s: string, maxW: number, size: number, f: PDFFont = font): string[] => {
    const linhas: string[] = [];
    let linha = "";
    for (const p of String(s).split(/\s+/).filter(Boolean)) {
      const t = linha ? linha + " " + p : p;
      if (w(t, size, f) > maxW && linha) { linhas.push(linha); linha = p; } else linha = t;
    }
    if (linha) linhas.push(linha);
    return linhas;
  };

  /** Rótulo em caixa alta à esquerda + texto corrido com recuo pendurado. */
  const campo = (rotulo: string, texto: string, x = M, larg = CW, rotW = 96, size = 8.5, corTexto: RGB = rgb(0.26, 0.26, 0.26)) => {
    if (!texto || !texto.trim()) return;
    const linhas = linhasDe(texto, larg - rotW, size);
    const alturaLinha = size + 3.4;
    ensure(linhas.length * alturaLinha + 5);
    at(rotulo.toUpperCase(), x, y, 7, bold, GOLD);
    linhas.forEach((l, i) => at(l, x + rotW, y - i * alturaLinha, size, font, corTexto));
    y -= linhas.length * alturaLinha + 5;
  };

  /** Selo do cenário do item (Essencial/Balanceado/Premium), alinhado à direita. */
  const seloCenario = (cen: keyof typeof CENARIOS, xRight: number, yy: number, size = 7.5) => {
    const txt = CENARIOS[cen].label.toUpperCase();
    const larg = w(txt, size, bold) + 12;
    page.drawRectangle({ x: xRight - larg, y: yy - 3, width: larg, height: size + 6, borderColor: hexToRgb(CENARIOS[cen].cor), borderWidth: 0.8 });
    at(txt, xRight - larg + 6, yy, size, bold, hexToRgb(CENARIOS[cen].cor));
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
    at(`HONORÁRIO DA ASSESSORIA (${taxaLabel(taxa)})`, A4.w - M - 220, y - 20, 9, bold, MUTED);
    at(BRL(Math.round(teto * taxa)), A4.w - M - 220, y - 44, 20, bold, GOLD);
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

  const comp = composicaoZonas(cena);
  // Numeração única por equipamento (a mesma da planta e das fichas).
  const numeroDe = new Map<string, number>();
  cena.itens.forEach((it, i) => numeroDe.set(it.id, i + 1));

  // ── Resumo financeiro ──
  secao("08 · Resumo Financeiro", 70);
  const fin: [string, string, RGB][] = [];
  if (teto) fin.push(["Orçamento-teto", BRL(teto), DARK]);
  fin.push(["Investimento", BRL(r.cenarios.balanceado), DARK]);
  if (teto) fin.push([`Honorário ${taxaLabel(taxa)}`, BRL(Math.round(teto * taxa)), GOLD]);
  if (teto) fin.push(["Saldo", BRL(teto - r.cenarios.balanceado), teto - r.cenarios.balanceado >= 0 ? GREEN : RED]);
  const fgap = 12, fw = (CW - fgap * (fin.length - 1)) / fin.length, fy = y;
  fin.forEach(([rot, val, cor], i) => {
    const x = M + i * (fw + fgap);
    page.drawRectangle({ x, y: fy - 52, width: fw, height: 52, borderColor: LINE, borderWidth: 1 });
    at(trunc(rot.toUpperCase(), fw - 20, 7.5, bold), x + 10, fy - 18, 7.5, bold, MUTED);
    at(trunc(val, fw - 20, 13, bold), x + 10, fy - 40, 13, bold, cor);
  });
  y = fy - 66;
  at(
    `Cenário Balanceado  ·  ${cena.itens.length} equipamentos  ·  ${comp.length} categorias  ·  ocupação ${r.ocupacao}%`,
    M, y, 9, font, MUTED,
  );
  y -= 24;

  // ── 03 · Categorias: especificação + lista técnica de cada uma ──
  secao("03 · Categorias & Lista Técnica");
  paragrafo(
    "À esquerda, os equipamentos da categoria com o cenário e o valor. À direita, o que aquele conjunto é, o que entrega e como foi dimensionado — mais a observação do consultor sobre este condomínio.",
    9, MUTED,
  );
  y -= 12;

  // Duas colunas: à esquerda a tabela (equipamento · cenário · valor), à
  // direita a especificação do conjunto e a observação do consultor. Cada
  // categoria é um bloco fechado — nunca começa no pé de uma página.
  const GAP = 18;
  const LARG_ESQ = Math.round(CW * 0.56);
  const X_DIR = M + LARG_ESQ + GAP;
  const LARG_DIR = A4.w - M - X_DIR;
  const colCen = M + LARG_ESQ - 118, colVal = M + LARG_ESQ;

  for (const c of comp) {
    const esp = especificacaoDaZona(c.zona, cena);
    // Altura das duas colunas, para reservar a página inteira do bloco.
    const altEsq = 21 + c.itens.length * 16 + 22;
    const textosDir: [string, string][] = [
      ["O que é", esp.oque], ["O que entrega", esp.entrega],
      ["Dimensionamento", esp.criterio], ["Obra & operação", esp.operacao],
    ];
    if (esp.nota) textosDir.push(["Observação", esp.nota]);
    const altDir = textosDir.reduce((t, [, txt]) => t + linhasDe(txt, LARG_DIR, 8).length * 11 + 13, 0);
    ensure(Math.min(560, 30 + Math.max(altEsq, altDir)) + 10);

    // Faixa da categoria (largura total)
    page.drawRectangle({ x: M, y: y - 4, width: CW, height: 20, color: DARKBG });
    at(c.label.toUpperCase(), M + 9, y, 10, bold, hexToRgb(c.cor));
    rightAt(
      `${c.n} ${c.n === 1 ? "equipamento" : "equipamentos"}    ${BRL(c.subtotal)}`,
      A4.w - M - 9, y, 8.5, bold, rgb(0.88, 0.88, 0.88),
    );
    y -= 28;
    const topo = y;

    // ── Coluna esquerda: tabela ──
    let ye = topo;
    page.drawRectangle({ x: M, y: ye - 4, width: LARG_ESQ, height: 16, color: CREAM });
    at("EQUIPAMENTO", M + 6, ye, 7, bold, MUTED);
    at("CENÁRIO", colCen, ye, 7, bold, MUTED);
    rightAt("VALOR", colVal - 6, ye, 7, bold, MUTED);
    ye -= 19;
    for (const it of c.itens) {
      const marca = marcaDe(it);
      const num = String(numeroDe.get(it.id) ?? 0).padStart(2, "0");
      at(trunc(`${num} · ${it.nome}${marca ? ` · ${marca}` : ""}`, colCen - (M + 6) - 6, 9), M + 6, ye, 9, font, DARK);
      at(CENARIOS[it.cenario].label, colCen, ye, 7.5, bold, hexToRgb(CENARIOS[it.cenario].cor));
      rightAt(it.preco ? BRL(it.preco) : "incluso", colVal - 6, ye, 9, font, it.preco ? DARK : MUTED);
      page.drawLine({ start: { x: M, y: ye - 5 }, end: { x: M + LARG_ESQ, y: ye - 5 }, thickness: 0.35, color: LINE });
      ye -= 16;
    }
    at(`Subtotal ${c.label}`, M + 6, ye - 1, 8.5, bold, DARK);
    rightAt(BRL(c.subtotal), colVal - 6, ye - 1, 9, bold, DARK);
    ye -= 18;
    // Composição por cenário, no pé da tabela
    let cx = M + 6;
    for (const k of ["essencial", "balanceado", "premium"] as Cenario[]) {
      const d = c.porCenario[k];
      if (!d.n) continue;
      const txt = `${CENARIOS[k].label} ${d.n}`;
      at(txt, cx, ye, 7.5, bold, hexToRgb(CENARIOS[k].cor));
      cx += w(txt, 7.5, bold) + 14;
    }
    ye -= 14;

    // ── Coluna direita: o que é este conjunto + observação ──
    let yd = topo;
    const campoDir = (rotulo: string, texto: string, destaque = false) => {
      const linhas = linhasDe(texto, LARG_DIR, 8);
      at(rotulo.toUpperCase(), X_DIR, yd, 6.5, bold, destaque ? hexToRgb(c.cor) : GOLD);
      yd -= 10;
      linhas.forEach((l, i) => at(l, X_DIR, yd - i * 11, 8, font, destaque ? DARK : rgb(0.28, 0.28, 0.28)));
      yd -= linhas.length * 11 + 3;
    };
    campoDir("O que é", esp.oque);
    campoDir("O que entrega", esp.entrega);
    campoDir("Dimensionamento", esp.criterio);
    campoDir("Obra & operação", esp.operacao);
    if (esp.nota) campoDir("Observação", esp.nota, true);

    // Filete separando as colunas, do topo ao fim do bloco
    const base = Math.min(ye, yd);
    page.drawLine({ start: { x: X_DIR - GAP / 2, y: topo + 10 }, end: { x: X_DIR - GAP / 2, y: base + 6 }, thickness: 0.5, color: LINE });
    y = base - 12;
  }

  ensure(20);
  page.drawRectangle({ x: M, y: y - 5, width: CW, height: 20, color: CREAM });
  at("INVESTIMENTO TOTAL (PREMIUM)", M + 9, y, 9, bold, GOLD);
  rightAt(BRL(r.cenarios.premium), A4.w - M - 9, y, 10.5, bold, GOLD);
  y -= 28;

  // ── 04 · Memorial: o que é e para que serve cada equipamento ──
  if (cena.itens.length) {
    secao("04 · Memorial dos Equipamentos");
    paragrafo(
      "Um verbete por equipamento, agrupado por categoria: o que é, o que trabalha, por que está neste projeto, o que exige atenção e os exercícios que ele executa. A numeração é a mesma da planta e da lista técnica.",
      9, MUTED,
    );
    const totalEx = exerciciosDaCena(cena, (it) => (it.equipamentoId && catId.get(it.equipamentoId)) || catNome.get(it.nome));
    if (totalEx.length) {
      paragrafo(
        `Somados, os equipamentos deste projeto executam ${totalEx.length} exercícios resistidos de musculação distintos. A lista de cada verbete conta apenas exercícios resistidos feitos no próprio aparelho — exercícios de peso corporal, alongamento e mobilidade não entram, e acessórios não são contabilizados.`,
        9, MUTED,
      );
    }
    y -= 6;
    for (const c of comp) {
      ensure(56);
      at(c.label.toUpperCase(), M, y, 9, bold, hexToRgb(c.cor));
      const xLinha = M + w(c.label.toUpperCase(), 9, bold) + 12;
      page.drawLine({ start: { x: xLinha, y: y + 3 }, end: { x: A4.w - M, y: y + 3 }, thickness: 0.8, color: hexToRgb(c.cor) });
      y -= 20;
      // Unidades idênticas (4 esteiras iguais) viram UM verbete com a lista de
      // números — repetir o mesmo texto quatro vezes só cansa quem lê.
      const grupos = new Map<string, ItemPosicionado[]>();
      for (const it of c.itens) {
        const chave = [it.nome, marcaDe(it), it.cenario, it.preco, Math.round(it.w_cm), Math.round(it.h_cm), it.funcao ?? "", it.restricoes ?? "", it.detalhes ?? ""].join("|");
        (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(it);
      }
      for (const grupo of grupos.values()) {
        const it = grupo[0];
        const cat = (it.equipamentoId && catId.get(it.equipamentoId)) || catNome.get(it.nome) || null;
        const ex = explicarItem(it, cat);
        ensure(104);
        // Equipamento repetido não vira verbete repetido: entra uma vez, com a
        // quantidade no lugar da lista de números.
        const marcador = grupo.length > 1 ? `${grupo.length}×` : "•";
        at(marcador, M, y, grupo.length > 1 ? 10.5 : 12, bold, hexToRgb(c.cor));
        const xNome = M + 26;
        at(trunc(it.nome, A4.w - M - xNome - 78, 11, bold), xNome, y, 11, bold, DARK);
        seloCenario(it.cenario, A4.w - M, y);
        y -= 13;
        const custo = it.preco
          ? (grupo.length > 1 ? `${grupo.length} × ${BRL(it.preco)} = ${BRL(it.preco * grupo.length)}` : BRL(it.preco))
          : "sem custo — item já existente";
        const ficha = [marcaDe(it), custo].filter(Boolean).join("   ·   ");
        at(ficha, xNome, y, 8.5, font, MUTED);
        y -= 15;
        campo("O que é", ex.oque, M + 26, CW - 26, 88);
        campo("Trabalha", ex.trabalha, M + 26, CW - 26, 88);
        campo("Por que está aqui", ex.indicacao, M + 26, CW - 26, 88);
        campo("Atenção", ex.atencao, M + 26, CW - 26, 88);
        if (ex.exercicios.length) {
          campo(`Exercícios (${ex.exercicios.length})`, ex.exercicios.join("  ·  "), M + 26, CW - 26, 88);
        }
        if (ex.detalhes) campo("Detalhes", ex.detalhes, M + 26, CW - 26, 88);
        y -= 2;
        page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.4, color: LINE });
        y -= 12;
      }
    }
  }

  // ── Inventário do condomínio: o que já existe e o que fica ──
  const inventario = cena.inventario ?? [];
  if (mostrar.inventario && inventario.length) {
    const reap = inventario.filter((i) => i.destino === "reaproveitado");
    const resi = inventario.filter((i) => i.destino === "residual");
    const somaQtd = (xs: typeof inventario) => xs.reduce((t, i) => t + (i.qtd || 1), 0);
    secao("Inventário — Reaproveitado & Residual", 60);
    paragrafo(
      "Levantamento do que o condomínio já tem. O reaproveitado permanece no projeto e não entra no investimento; o residual sai da sala.",
      9, MUTED,
    );
    y -= 6;

    for (const [destino, lista] of [["reaproveitado", reap], ["residual", resi]] as const) {
      if (!lista.length) continue;
      const def = DESTINOS_INVENTARIO[destino];
      ensure(64);
      page.drawRectangle({ x: M, y: y - 4, width: CW, height: 19, color: DARKBG });
      at(def.label.toUpperCase(), M + 9, y, 9.5, bold, hexToRgb(def.cor));
      rightAt(`${somaQtd(lista)} ${somaQtd(lista) === 1 ? "peça" : "peças"}`, A4.w - M - 9, y, 8.5, bold, rgb(0.88, 0.88, 0.88));
      y -= 24;
      campo("Critério", def.descricao);
      const colObs = M + 210, colEst = A4.w - M - 150;
      ensure(24);
      page.drawRectangle({ x: M, y: y - 4, width: CW, height: 16, color: CREAM });
      at("ITEM", M + 6, y, 7, bold, MUTED);
      at("OBSERVAÇÃO", colObs, y, 7, bold, MUTED);
      rightAt("ESTADO", A4.w - M - 6, y, 7, bold, MUTED);
      y -= 19;
      for (const i of lista) {
        ensure(17);
        const nome = `${i.qtd > 1 ? `${i.qtd}× ` : ""}${i.nome}`;
        at(trunc(nome, colObs - (M + 6) - 8, 9), M + 6, y, 9, font, DARK);
        at(trunc(i.observacao || "—", colEst - colObs - 8, 8.5), colObs, y, 8.5, font, MUTED);
        rightAt(trunc(i.estado || "—", 140, 8.5), A4.w - M - 6, y, 8.5, font, MUTED);
        page.drawLine({ start: { x: M, y: y - 5 }, end: { x: A4.w - M, y: y - 5 }, thickness: 0.35, color: LINE });
        y -= 16;
      }
      y -= 10;
    }

    const valorReap = reap.reduce((t, i) => t + (i.valor_estimado || 0) * (i.qtd || 1), 0);
    if (valorReap > 0) {
      ensure(20);
      page.drawRectangle({ x: M, y: y - 5, width: CW, height: 19, color: CREAM });
      at("VALOR DE MERCADO DO QUE FOI REAPROVEITADO", M + 9, y, 8.5, bold, GOLD);
      rightAt(BRL(Math.round(valorReap)), A4.w - M - 9, y, 10, bold, GOLD);
      y -= 26;
    }
  }

  // ── Revestimentos & acabamentos ──
  const revest = cena.acabamentos ?? [];
  if (mostrar.acabamentos && revest.length) {
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

  // ── Espelhos, itens de parede e mobiliário (quantitativos da Etapa 2) ──
  const elems = cena.elementosParede ?? [];
  const infra = cena.infra ?? [];
  if (mostrar.acabamentos && (elems.length || infra.length)) {
    secao("Espelhos, Parede & Mobiliário");
    const qCol = M + 320, vCol = A4.w - M - 6;
    const linha = (nome: string, qtd: string, valor: number | null) => {
      ensure(16);
      at(nome, M + 6, y, 9.5, font, DARK);
      at(qtd, qCol, y, 9, font, MUTED);
      rightAt(valor != null ? BRL(Math.round(valor)) : "—", vCol, y, 9.5, font, DARK);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: A4.w - M, y: y - 5 }, thickness: 0.4, color: LINE });
      y -= 16;
    };
    let totalEtapa2 = 0;
    const espelhos = elems.filter((e) => e.tipo === "espelho");
    if (espelhos.length) {
      const metros = espelhos.reduce((s, e) => s + e.largura_cm, 0) / 100;
      const custoEsp = espelhos.reduce((s, e) => s + (e.largura_cm / 100) * (e.altura_cm / 100) * (e.preco_m2 || 0), 0);
      totalEtapa2 += custoEsp;
      linha(`Espelhos (${espelhos.length}×)`, `${metros.toFixed(1).replace(".", ",")} m lineares`, custoEsp || null);
    }
    const porTipo = new Map<string, { qtd: number; custo: number }>();
    for (const e of elems) {
      if (e.tipo === "espelho") continue;
      const chave = e.tipo;
      const atu = porTipo.get(chave) ?? { qtd: 0, custo: 0 };
      atu.qtd += 1; atu.custo += e.custo || 0;
      porTipo.set(chave, atu);
    }
    for (const [tipo, info] of porTipo) {
      totalEtapa2 += info.custo;
      linha(ELEMENTOS_PAREDE[tipo as keyof typeof ELEMENTOS_PAREDE]?.label ?? tipo, `${info.qtd}×`, info.custo || null);
    }
    for (const it of infra) {
      totalEtapa2 += it.custo || 0;
      linha(it.nome, `${it.w_cm}×${it.h_cm} cm`, it.custo || null);
    }
    ensure(16);
    at("Total espelhos + parede + mobiliário", M + 6, y, 9, bold, DARK);
    rightAt(BRL(Math.round(totalEtapa2)), vCol, y, 10, bold, GOLD);
    y -= 24;
  }

  // ── Acessórios (Etapa 5) ──
  const acess = cena.acessorios ?? [];
  if (mostrar.acessorios && acess.length) {
    secao("Acessórios");
    const qCol = A4.w - M - 200, uCol = A4.w - M - 110, tCol = A4.w - M - 6;
    page.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: CREAM });
    at("ITEM", M + 6, y, 8, bold, MUTED);
    rightAt("QTD", qCol, y, 8, bold, MUTED); rightAt("PREÇO UN.", uCol, y, 8, bold, MUTED); rightAt("TOTAL", tCol, y, 8, bold, MUTED);
    y -= 22;
    let totalAc = 0;
    for (const a of acess) {
      ensure(16);
      const tot = a.qtd * a.preco_un;
      totalAc += tot;
      at(trunc(a.nome, qCol - 40 - M, 9.5), M + 6, y, 9.5, font, DARK);
      rightAt(String(a.qtd), qCol, y, 9, font, MUTED);
      rightAt(BRL(a.preco_un), uCol, y, 9, font, MUTED);
      rightAt(BRL(Math.round(tot)), tCol, y, 9.5, font, DARK);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: A4.w - M, y: y - 5 }, thickness: 0.4, color: LINE });
      y -= 16;
    }
    ensure(16);
    at("Total em acessórios", M + 6, y, 9, bold, DARK);
    rightAt(BRL(Math.round(totalAc)), tCol, y, 10, bold, GOLD);
    y -= 24;
  }

  // ── Capacidade & ocupação ──
  if (mostrar.capacidade) {
    const itens = cena.itens ?? [];
    const salaM2 = (cena.sala.largura_cm / 100) * (cena.sala.profundidade_cm / 100);
    const corpoM2 = itens.reduce((s, i) => s + (i.w_cm / 100) * (i.h_cm / 100), 0);
    const usoM2 = itens.reduce((s, i) => {
      const uF = (i.uso_frontal_cm || 0) / 100, uL = (i.uso_lateral_cm || 0) / 100;
      return s + (i.w_cm / 100 + 2 * uL) * (i.h_cm / 100 + 2 * uF);
    }, 0);
    const livreM2 = Math.max(0, salaM2 - usoM2);
    const usuarios = itens.length; // 1 usuário por estação (estimativa conservadora)
    const custoM2 = salaM2 > 0 ? r.subtotal / salaM2 : 0;
    secao("Capacidade & Ocupação");
    const kv = (k: string, v: string) => { ensure(16); at(k, M + 6, y, 9.5, font, MUTED); rightAt(v, A4.w - M - 6, y, 9.5, bold, DARK); y -= 16; };
    kv("Área da sala", `${salaM2.toFixed(1).replace(".", ",")} m²`);
    kv("Equipamentos", String(itens.length));
    kv("Área física ocupada (corpo)", `${corpoM2.toFixed(1).replace(".", ",")} m² (${salaM2 ? Math.round((corpoM2 / salaM2) * 100) : 0}%)`);
    kv("Área de uso (corpo + operação)", `${usoM2.toFixed(1).replace(".", ",")} m² (${salaM2 ? Math.round((usoM2 / salaM2) * 100) : 0}%)`);
    kv("Área livre de circulação", `${livreM2.toFixed(1).replace(".", ",")} m²`);
    kv("Usuários simultâneos (estimado)", `${usuarios} (1 por estação)`);
    kv("Investimento por m²", BRL(Math.round(custoM2)));
    if (usuarios > 0) kv("Investimento por usuário simultâneo", BRL(Math.round(r.subtotal / usuarios)));
    y -= 8;
  }

  // ── Cenários ──
  const niveis = detalheCenarios(cena);
  if (mostrar.cenarios) {
  secao("06 · Cenários de Investimento", 140);
  paragrafo(
    "Cada equipamento foi classificado em um dos três níveis. Os cenários são cumulativos: o Balanceado inclui todo o Essencial, e o Premium inclui os dois anteriores.",
    9, MUTED,
  );
  y -= 6;
  ensure(88);
  const gap = 12, cardW = (CW - gap * 2) / 3, topY = y;
  niveis.forEach((n, i) => {
    const x = M + i * (cardW + gap);
    const saldo = teto ? teto - n.total : null;
    page.drawRectangle({ x, y: topY - 82, width: cardW, height: 82, borderColor: LINE, borderWidth: 1 });
    page.drawRectangle({ x, y: topY - 4, width: cardW, height: 4, color: hexToRgb(n.cor) });
    at(n.label.toUpperCase(), x + 12, topY - 22, 9, bold, MUTED);
    at(BRL(n.total), x + 12, topY - 44, 15, bold, DARK);
    at(`${n.nAcumulado} de ${cena.itens.length} equipamentos`, x + 12, topY - 58, 8, font, MUTED);
    if (saldo != null) at(`Saldo ${BRL(saldo)}`, x + 12, topY - 72, 9, font, saldo >= 0 ? GREEN : RED);
  });
  y = topY - 96;

  // O que cada nível significa e o que ele ACRESCENTA (o cumulativo esconde isso).
  for (const n of niveis) {
    ensure(46);
    at(n.label.toUpperCase(), M, y, 8.5, bold, hexToRgb(n.cor));
    rightAt(
      n.nNivel
        ? `acrescenta ${n.nNivel} ${n.nNivel === 1 ? "equipamento" : "equipamentos"}  ·  + ${BRL(n.incremento)}`
        : "nenhum equipamento classificado neste nível",
      A4.w - M - 6, y, 8.5, n.nNivel ? bold : font, n.nNivel ? DARK : MUTED,
    );
    y -= 13;
    campo("Resumo", CENARIO_DEF[n.cenario].resumo, M, CW, 62, 8.5);
    campo("Critério", CENARIO_DEF[n.cenario].criterio, M, CW, 62, 8.5);
    y -= 4;
  }
  if (classificacaoPendente(cena)) {
    ensure(26);
    at(
      "Todos os equipamentos estão no nível Balanceado — a classificação por cenário ainda não foi feita no editor, por isso os três cenários mostram o mesmo valor.",
      M, y, 8.5, font, hexToRgb("#E09A45"),
    );
    y -= 18;
  }

  }

  // ── Matriz de priorização ──
  const mat = matrizDaCena(cena);
  if (mostrar.matriz) {
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
