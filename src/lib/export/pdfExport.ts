import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { Projeto, Equipamento, ItemPosicionado, ConfigConsultor, Cenario, Cena, Marca, Acabamento } from "../types";
import { CENARIOS, taxaDe, taxaLabel, ELEMENTOS_PAREDE, DESTINOS_INVENTARIO, OPCOES_DOSSIE_PADRAO,
  ORDEM_DOSSIE_PADRAO, ROTULO_SECAO_DOSSIE, type SecaoDossie } from "../types";
import { resumo, matrizDaCena } from "../validation";
import { BRL, formatLength } from "../units";
import { areaPoligonoM2 } from "../geometria";
import {
  CENARIO_DEF, analisarCobertura, classificacaoPendente, composicaoZonas, detalheCenarios,
  especificacaoDaZona, exerciciosDoItem, explicarItem,
} from "../curadoria";
import { MUSCULOS, REGIOES } from "../musculatura";
import { analisarEspaco } from "../analiseEspaco";
import { agruparMarcas, marcasDaCena, presencaDaMarca, refDaMarca } from "../marcas";
import { agruparPorLugar, custoAcessorio } from "../acessorios";
import { sugerirFuturo } from "../sugestoesFuturas";
import { medidaEsquadria, quadroDeEsquadrias } from "../esquadrias";

/**
 * Uma lâmina já capturada do canvas, pronta para o papel.
 *
 * O PDF não escolhe camadas nem redesenha nada: ele recebe a imagem que o
 * consultor aprovou na prévia. Qualquer decisão de desenho tomada aqui seria
 * uma segunda verdade sobre a mesma planta.
 */
export interface LaminaRender {
  png: string;
  /** Legenda impressa sob a imagem. Vazia = lâmina muda, só o desenho. */
  legenda?: string | null;
  /** Imprime a lista numerada de equipamentos ao lado. */
  indice?: boolean;
  /** Título da prancha (lâminas após a primeira). Ausente = só o desenho. */
  titulo?: string | null;
}
import { PAPEL_LADO, PAPEIS_CONTATO, enderecoEmLinha, formatarTelefone } from "../types";

// Paleta do dossiê
const GOLD = rgb(0.722, 0.439, 0.290); // cobre da marca Heritage GymBuilder
const DARK = rgb(0.11, 0.11, 0.11);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);
const CREAM = rgb(0.98, 0.965, 0.913);
const DARKBG = rgb(0.1, 0.1, 0.1);
const GREEN = rgb(0.18, 0.49, 0.2);
const RED = rgb(0.78, 0.16, 0.16);
const LINE_TXT = rgb(0.55, 0.55, 0.55); // régua sob o número: menor e mais clara que o valor

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
  /** Uma string ainda é aceita: é a planta única, como sempre foi. */
  laminasEntrada?: LaminaRender[] | string | null,
  catalogo?: Equipamento[],
  config?: ConfigConsultor | null,
  /** Biblioteca de marcas (planner.marcas) — dá logo, grupo e garantia à
   *  seção de marcas. Ausente: cai na base local de `marcas.ts`. */
  biblioteca?: Marca[] | null,
  /** Catálogo de acabamentos — permite cruzar a área pintada na planta com o
   *  fornecedor do revestimento e detectar a marca. */
  acabCatalogo?: Acabamento[],
): Promise<Uint8Array> {
  // Rodapé/assinatura vindos do Cadastro do consultor (fallback: padrão Heritage).
  const taxa = taxaDe(config); // honorário do Cadastro do consultor
  const assinatura = (config?.rodape && config.rodape.trim())
    || [config?.empresa, "Assessoria Técnica de Implantação"].filter(Boolean).join(" · ")
    || "Heritage GymBuilder · Assessoria Técnica de Implantação";
  const cena = projeto.cena!;
  const r = resumo(cena);
  // Análise de espaço: a mesma fonte que o painel do editor consome.
  const esp = analisarEspaco(cena);
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

  /**
   * Texto do Dossiê: o que o consultor escreveu para ESTE projeto vence; na
   * falta dele, o padrão do código. É o mecanismo que torna todo o documento
   * editável sem espalhar `if` por 900 linhas.
   */
  const textos = cena.dossieTextos ?? {};
  const txt = (chave: string, padrao: string): string => {
    const proprio = textos[chave];
    return proprio && proprio.trim() ? proprio.trim() : padrao;
  };

  // Numeração sequencial: o número acompanha a ORDEM em que as seções saem no
  // papel (reordenar seções nunca embaralha o índice).
  let nSec = 0;
  /** Cabeçalho de uma seção — título editável por `titulo:<id>`. */
  const secN = (id: SecaoDossie, reserva = 0) =>
    secao(`${String(++nSec).padStart(2, "0")} · ${txt(`titulo:${id}`, ROTULO_SECAO_DOSSIE[id])}`, reserva);
  /** Parágrafo de abertura da seção — editável por `intro:<id>`.
   *  Texto vazio (o consultor apagou de propósito) suprime a abertura. */
  const intro = (id: SecaoDossie, padrao: string, size = 9) => {
    const t = textos[`intro:${id}`] != null ? textos[`intro:${id}`].trim() : padrao;
    if (!t) return;
    paragrafo(t, size, MUTED);
  };

  /** Grade de mini-cartões rotulados (diagnóstico/infraestrutura). */
  const cartoes = (pares: [string, string][], porLinha = 3) => {
    const uteis = pares.filter(([, v]) => v && v.trim() && v.trim() !== "—");
    if (!uteis.length) { paragrafo("Não informado.", 10, MUTED); return; }
    const cgap = 10, cw = (CW - cgap * (porLinha - 1)) / porLinha, ch = 38;
    for (let i = 0; i < uteis.length; i += porLinha) {
      ensure(ch + 8);
      const linha = uteis.slice(i, i + porLinha);
      linha.forEach(([rot, val], j) => {
        const x = M + j * (cw + cgap);
        page.drawRectangle({ x, y: y - ch + 8, width: cw, height: ch, borderColor: LINE, borderWidth: 0.8 });
        at(rot.toUpperCase(), x + 9, y - 6, 6.5, bold, MUTED);
        at(trunc(val, cw - 18, 10, bold), x + 9, y - 22, 10, bold, DARK);
      });
      y -= ch + 8;
    }
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
  // Página de apresentação: identidade + foto da fachada. SEM valores — o
  // dinheiro aparece no miolo, depois que o síndico viu o projeto.
  pageNo = 1;
  page.drawRectangle({ x: 0, y: A4.h - 8, width: A4.w, height: 8, color: GOLD });
  y = A4.h - 120;

  // Logotipo do consultor (Cadastro) — a capacidade de embutir PNG já existia
  // para a foto da fachada; o logo simplesmente nunca era desenhado.
  if (config?.logo) {
    try {
      const lg = /^data:image\/png/i.test(config.logo) ? await doc.embedPng(config.logo) : await doc.embedJpg(config.logo);
      const lh = Math.min(46, lg.height), lw = (lg.width / lg.height) * lh;
      page.drawImage(lg, { x: M, y: y + 6, width: lw, height: lh });
      y -= lh - 8;
    } catch { /* logo inválido — a capa segue sem ele */ }
  }

  at(txt("capa:kicker", "ASSESSORIA TÉCNICA · IMPLANTAÇÃO DE ACADEMIA").toUpperCase(), M, y, 10, bold, GOLD); y -= 42;
  for (const linha of quebrar(projeto.nome, CW, 32, bold, w)) { at(linha, M, y, 32, bold, DARK); y -= 38; }
  y -= 4;
  page.drawLine({ start: { x: M, y }, end: { x: M + 120, y }, thickness: 2, color: GOLD }); y -= 26;

  // Foto da fachada — o síndico reconhece o prédio dele na primeira página.
  if (projeto.foto_fachada) {
    try {
      const foto = /^data:image\/png/i.test(projeto.foto_fachada)
        ? await doc.embedPng(projeto.foto_fachada)
        : await doc.embedJpg(projeto.foto_fachada);
      const maxH = 320;
      const sc = Math.min(CW / foto.width, maxH / foto.height);
      const iw = foto.width * sc, ih = foto.height * sc;
      const ix = M + (CW - iw) / 2;
      page.drawRectangle({ x: ix - 4, y: y - ih - 4, width: iw + 8, height: ih + 8, borderColor: LINE, borderWidth: 1, color: CREAM });
      page.drawImage(foto, { x: ix, y: y - ih, width: iw, height: ih });
      y -= ih + 26;
    } catch { /* foto inválida — a capa segue sem ela */ }
  }

  // Contatos: quando o projeto tem a lista destrinchada (migração 017), ela
  // vence os campos derivados `sindico`/`contato` — que escondem
  // administradora e conselho, justamente quem decide junto com o síndico.
  const contatos = (projeto.contatos ?? []).filter((c) => c && c.nome);
  const linhasContato = contatos.length
    ? contatos.map((c) => [
        `${PAPEIS_CONTATO[c.papel] ?? "Contato"}: ${c.nome}`,
        c.whatsapp ? formatarTelefone(c.whatsapp) : "",
      ].filter(Boolean).join("  ·  "))
    : [
        projeto.sindico && `Síndico(a): ${projeto.sindico}`,
        projeto.contato && String(projeto.contato),
      ].filter(Boolean) as string[];

  const capaMeta = [
    enderecoEmLinha(projeto.endereco_det) || (projeto.endereco && String(projeto.endereco)) || "",
    ...linhasContato,
  ].filter(Boolean) as string[];
  for (const m of capaMeta) { at(m, M, y, 12, font, rgb(0.3, 0.3, 0.3)); y -= 18; }
  y -= 8;
  // Data do dossiê: a de EMISSÃO quando o consultor a define. Antes vinha de
  // `criado_em`, que o banco nunca deixa alterar — era impossível datar o
  // documento no dia da entrega.
  at(`Dossiê Executivo  ·  ${dataBR(cena.dossieEmissao ?? projeto.criado_em)}`, M, y, 11, bold, MUTED); y -= 20;
  const preparado = [
    config?.consultor && `Preparado por ${config.consultor}`,
    config?.registro && `(${config.registro})`,
    config?.whatsapp && `· ${config.whatsapp}`,
  ].filter(Boolean).join(" ");
  if (preparado) at(preparado, M, y, 10, font, rgb(0.35, 0.35, 0.35));
  at(txt("capa:tagline", "A academia mais funcional e bonita que o orçamento do condomínio pode ter."), M, 70, 10, font, MUTED);

  const teto = Number(projeto.orcamento_teto) || 0;

  // ── CONTEÚDO ────────────────────────────────────────────────────────────
  novaPagina();

  const comp = composicaoZonas(cena);
  // Numeração única por equipamento (a mesma da planta e das fichas).
  const numeroDe = new Map<string, number>();
  cena.itens.forEach((it, i) => numeroDe.set(it.id, i + 1));


  // ── Cálculos compartilhados entre seções ──────────────────────────────
  // Ficam FORA das seções porque mais de uma os consome e o consultor pode
  // reordenar as seções: o valor não pode depender de quem imprime primeiro.

  const perfil = projeto.perfil ?? {};
  const prioridades = Array.isArray(perfil.prioridades) ? perfil.prioridades : [];



  // ── Resumo financeiro: o INVESTIMENTO soma tudo que foi orçado ──────────
  // equipamentos (projeto completo) + acessórios + revestimentos + espelhos,
  // parede e mobiliário. Um número só, sem letra miúda.
  const areaAcab = (a: NonNullable<Cena["acabamentos"]>[number]) =>
    a.pontos && a.pontos.length >= 3 ? areaPoligonoM2(a.pontos) : (a.w_cm / 100) * (a.h_cm / 100);
  const totalEquip = r.cenarios.premium;
  const totalAcess = (cena.acessorios ?? []).reduce((t, a) => t + custoAcessorio(a), 0);
  const totalRevest = (cena.acabamentos ?? []).reduce((t, a) => t + areaAcab(a) * (a.preco_m2 || 0), 0);
  const totalParede =
    (cena.elementosParede ?? []).reduce((t, e) =>
      t + (e.tipo === "espelho" ? (e.largura_cm / 100) * (e.altura_cm / 100) * (e.preco_m2 || 0) : (e.custo || 0)), 0)
    + (cena.infra ?? []).reduce((t, i) => t + (i.custo || 0), 0);
  const investimentoTotal = Math.round(totalEquip + totalAcess + totalRevest + totalParede);


  // ── Cenários: UM valor (o total) e o resto em percentual ────────────────
  // Dinheiro confuso derruba a apresentação. Aqui só aparece o investimento
  // total; Essencial/Balanceado/Premium viram fatias percentuais dele.
  const niveis = detalheCenarios(cena);


  // ── Acessórios (Etapa 5) ──
  const acess = cena.acessorios ?? [];

  // ── Marcas do projeto: quem fabrica o que o condomínio vai comprar ──────

  // ── 04 · Memorial: o que é e para que serve cada equipamento ──

  // ── Exercícios contemplados: o que dá para treinar nesta academia ───────

  // ── Inventário do condomínio: o que já existe e o que fica ──
  const inventario = cena.inventario ?? [];

  // ── Lâminas da apresentação ──
  // Compatível com o chamador antigo (uma string = a planta única de sempre,
  // com o índice numerado ao lado).
  const laminas: LaminaRender[] = typeof laminasEntrada === "string"
    ? [{ png: laminasEntrada, indice: true }]
    : (laminasEntrada ?? []).filter((l) => l && l.png);

  // ── Quadro de esquadrias: portas e janelas, agrupadas por tipo ──
  const esquadrias = quadroDeEsquadrias(cena.estrutura);

  // ── Revestimentos & acabamentos ──
  const revest = cena.acabamentos ?? [];

  // ── Espelhos, itens de parede e mobiliário (quantitativos da Etapa 2) ──
  const elems = cena.elementosParede ?? [];
  const infra = cena.infra ?? [];

  // ── Capacidade & ocupação ──

  // ── Matriz de priorização: nasce da LEITURA do condomínio ───────────────
  const mat = matrizDaCena(cena);

  // ── Validação técnica ──

  // ── As seções, cada uma endereçável por id ────────────────────────────
  // O consultor liga/desliga (`cena.dossie`), renomeia (`titulo:<id>`),
  // reescreve a abertura (`intro:<id>`) e reordena (`cena.dossieOrdem`).
  // A numeração impressa segue a ordem real de saída, sempre.
  const SECOES: Partial<Record<SecaoDossie, () => Promise<void> | void>> = {
    /**
     * AS LÂMINAS. Uma por página, na ordem montada no editor.
     *
     * A primeira herda o formato clássico quando pede índice: desenho à
     * esquerda, lista numerada dos equipamentos à direita. As demais saem em
     * largura cheia e MUDAS — sem nome, sem medida, sem legenda automática:
     * numa lâmina de apresentação o desenho é o argumento, e texto por cima
     * dele é ruído. O que aparece é o que foi ligado na prévia, e só.
     */
    planta: async () => {
      if (!laminas.length) return;
      let primeira = true;
      for (const lam of laminas) {
        let png;
        try { png = await doc.embedPng(lam.png); } catch { continue; }
        const comIndice = !!lam.indice && cena.itens.length > 0;
        const legW = comIndice ? 168 : 0;
        const maxW = CW - legW - (comIndice ? 14 : 0);
        const maxH = 430;
        const sc = Math.min(maxW / png.width, maxH / png.height);
        const iw = png.width * sc, ih = png.height * sc;
        const altLegenda = comIndice ? cena.itens.length * 12.5 + 16 : 0;

        if (primeira) {
          ensure(Math.max(ih, altLegenda) + 56);
          secN("planta");
          intro("planta", "");
        } else {
          // Cada lâmina seguinte começa em página limpa: é assim que ela vira
          // uma prancha, e não uma ilustração espremida no pé da anterior.
          novaPagina();
          if (lam.titulo?.trim()) {
            at(lam.titulo.trim().toUpperCase(), M, y, 10, bold, GOLD);
            y -= 8;
            page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.8, color: LINE });
            y -= 14;
          }
        }

        const topo = y;
        page.drawRectangle({ x: M, y: y - ih - 8, width: iw + 8, height: ih + 8, borderColor: LINE, borderWidth: 1 });
        page.drawImage(png, { x: M + 4, y: y - ih - 4, width: iw, height: ih });

        let ly = topo - 2;
        if (comIndice) {
          const lx = M + iw + 22;
          at("EQUIPAMENTOS", lx, ly, 7, bold, GOLD);
          ly -= 14;
          for (const it of cena.itens) {
            if (ly < 80) break; // não invade o rodapé (a sobra fica na lista técnica)
            at(String(numeroDe.get(it.id)).padStart(2, "0"), lx, ly, 8, bold, GOLD);
            at(trunc(it.nome, legW - 24, 8), lx + 18, ly, 8, font, rgb(0.25, 0.25, 0.25));
            ly -= 12.5;
          }
        }

        y -= Math.max(ih + 16, comIndice ? topo - ly + 6 : 0);

        if (lam.legenda?.trim()) {
          for (const linha of linhasDe(lam.legenda.trim(), CW, 9)) { at(linha, M, y, 9, font, MUTED); y -= 12; }
          y -= 4;
        }
        if (primeira) {
          at(`Sala ${formatLength(cena.sala.largura_cm)} × ${formatLength(cena.sala.profundidade_cm)}  ·  Ocupação ${r.ocupacao}%  ·  ${cena.itens.length} equipamentos`, M, y, 9, font, MUTED);
          y -= 16;
          // Legenda das faixas de orientação desenhadas em cada equipamento.
          let lgx = M;
          at("ORIENTAÇÃO:", lgx, y, 7, bold, MUTED); lgx += 58;
          for (const k of ["entrada", "frente", "costas", "lateral"] as const) {
            const info = PAPEL_LADO[k];
            page.drawRectangle({ x: lgx, y: y - 1, width: 9, height: 9, color: hexToRgb(info.cor), opacity: 0.5 });
            at(info.label, lgx + 13, y, 8, font, rgb(0.3, 0.3, 0.3));
            lgx += 13 + w(info.label, 8, font) + 16;
          }
          y -= 18;
        }
        primeira = false;
      }
    },

    /**
     * QUADRO DE ESQUADRIAS — a tabela que o serralheiro orça e o mestre de
     * obras confere. Vem logo depois da planta porque é o quantitativo do
     * mesmo desenho: quem acabou de ver a porta no papel quer o vão dela.
     *
     * Cabeçalho REEMITIDO após quebra de página. Nenhuma outra tabela do
     * arquivo faz isso, e é o que produz linha órfã sem título na página 2 —
     * aqui não dá para conviver com isso: um quadro de esquadrias longo é o
     * caso comum, não a exceção.
     */
    esquadrias: () => {
      if (!mostrar.esquadrias || !esquadrias.length) return;
      secN("esquadrias", 90);
      intro("esquadrias", "Portas e janelas lançadas na planta, agrupadas por tipo. As medidas são de VÃO acabado (largura × altura, em metros); o peitoril é medido do piso acabado.");
      const codCol = M + 6, qtdCol = M + 52, tipoCol = M + 76, vaoCol = A4.w - M - 168, peitCol = A4.w - M - 96, pareCol = A4.w - M - 6;
      const cabecalho = () => {
        page.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: CREAM });
        at("COD.", codCol, y, 8, bold, MUTED);
        at("QTD", qtdCol, y, 8, bold, MUTED);
        at("TIPO / MODELO", tipoCol, y, 8, bold, MUTED);
        rightAt("VÃO L × A (m)", vaoCol, y, 8, bold, MUTED);
        rightAt("PEITORIL", peitCol, y, 8, bold, MUTED);
        rightAt("PAREDE", pareCol, y, 8, bold, MUTED);
        y -= 22;
      };
      cabecalho();
      for (const e of esquadrias) {
        const obs = e.observacao ? linhasDe(e.observacao, CW - 60, 7.5) : [];
        const alto = 16 + obs.length * 9;
        const antes = pageNo;
        ensure(alto);
        if (pageNo !== antes) cabecalho();
        at(e.codigo, codCol, y, 9, bold, DARK);
        at(String(e.qtd), qtdCol, y, 9, font, MUTED);
        at(trunc(`${e.tipo === "porta" ? "Porta" : "Janela"} · ${e.modelo}`, vaoCol - tipoCol - 10, 9.5), tipoCol, y, 9.5, font, DARK);
        rightAt(medidaEsquadria(e.largura_cm, e.altura_cm), vaoCol, y, 9, font, DARK);
        rightAt(e.peitoril_cm != null ? `${Math.round(e.peitoril_cm)} cm` : "—", peitCol, y, 9, font, MUTED);
        rightAt(trunc(e.parede, 104, 8.5), pareCol, y, 8.5, font, MUTED);
        y -= 12;
        for (const l of obs) { at(l, tipoCol, y, 7.5, font, MUTED); y -= 9; }
        page.drawLine({ start: { x: M, y: y - 3 }, end: { x: A4.w - M, y: y - 3 }, thickness: 0.4, color: LINE });
        y -= 12;
      }
      const nP = esquadrias.filter((e) => e.tipo === "porta").reduce((t, e) => t + e.qtd, 0);
      const nJ = esquadrias.filter((e) => e.tipo === "janela").reduce((t, e) => t + e.qtd, 0);
      ensure(16);
      at(`${nP} porta(s) e ${nJ} janela(s) em ${esquadrias.length} tipo(s) distinto(s).`, M + 6, y, 8.5, bold, DARK);
      y -= 24;
    },

    parecer: async () => {
      // Parecer técnico: a defesa do layout, nas palavras do consultor.
      if (!(cena.parecer && cena.parecer.trim())) return;
      secN("parecer", 40);
      for (const par of cena.parecer.split(/\n+/).map((t) => t.trim()).filter(Boolean)) {
        paragrafo(par, 10, rgb(0.22, 0.22, 0.22));
        y -= 5;
      }
      const quem = [config?.consultor, config?.registro].filter(Boolean).join(" · ");
      if (quem) { y -= 2; at(quem, M, y, 9, bold, MUTED); y -= 16; }
      y -= 4;
    },

    diagnostico: async () => {
      secN("diagnostico", 60);
      cartoes([
        ["Padrão do condomínio", perfil.padrao ?? ""],
        ["Moradores", perfil.moradores ?? ""],
        ["Faixa etária", perfil.faixa_etaria ?? ""],
        ["Frequência esperada", perfil.frequencia ?? ""],
        ["Uso", perfil.uso ?? ""],
        ["Objetivo predominante", perfil.objetivo ?? ""],
      ]);
      if (perfil.investimento_perfil) {
        ensure(16);
        at("ORÇAMENTO FRENTE AO PADRÃO", M, y, 7, bold, GOLD);
        at(perfil.investimento_perfil, M + 160, y, 9.5, bold, DARK);
        y -= 18;
      }
      if (prioridades.length) {
        ensure(18);
        at("A ACADEMIA É PRIORIDADE PARA", M, y, 7, bold, GOLD);
        y -= 15;
        let px = M;
        prioridades.forEach((pr, i) => {
          const rotulo = `${i + 1}º  ${pr}`;
          const larg = w(rotulo, 8.5, bold) + 18;
          if (px + larg > A4.w - M) { px = M; y -= 22; ensure(22); }
          page.drawRectangle({ x: px, y: y - 5, width: larg, height: 19, borderColor: GOLD, borderWidth: 0.9 });
          at(rotulo, px + 9, y, 8.5, bold, GOLD);
          px += larg + 8;
        });
        y -= 26;
      }
      y -= 4;
    },

    infraestrutura: async () => {
      secN("infraestrutura", 50);
      cartoes([
        ["Elétrica", projeto.infraestrutura?.eletrica ?? ""],
        ["Climatização", projeto.infraestrutura?.climatizacao ?? ""],
        ["Piso / contrapiso", projeto.infraestrutura?.piso ?? ""],
        ["Acesso", projeto.infraestrutura?.acesso ?? ""],
      ], 2);
      if (projeto.observacoes) {
        y -= 4;
        at("Observações", M, y, 10, bold, DARK);
        y -= 14;
        paragrafo(String(projeto.observacoes), 10, rgb(0.25, 0.25, 0.25));
      }
      y -= 6;
    },

    financeiro: async () => {
      secN("financeiro", 84);
      const fin: [string, string, RGB][] = [];
      if (teto) fin.push(["Orçamento-teto", BRL(teto), DARK]);
      fin.push(["Investimento total", BRL(investimentoTotal), DARK]);
      if (teto) fin.push([`Honorário ${taxaLabel(taxa)}`, BRL(Math.round(teto * taxa)), GOLD]);
      if (teto) fin.push(["Saldo", BRL(teto - investimentoTotal), teto - investimentoTotal >= 0 ? GREEN : RED]);
      const fgap = 12, fw = (CW - fgap * (fin.length - 1)) / fin.length, fy = y;
      fin.forEach(([rot, val, cor], i) => {
        const x = M + i * (fw + fgap);
        page.drawRectangle({ x, y: fy - 52, width: fw, height: 52, borderColor: LINE, borderWidth: 1 });
        at(trunc(rot.toUpperCase(), fw - 20, 7.5, bold), x + 10, fy - 18, 7.5, bold, MUTED);
        at(trunc(val, fw - 20, 13, bold), x + 10, fy - 40, 13, bold, cor);
      });
      y = fy - 64;
      const compFin = [
        ["Equipamentos", totalEquip], ["Acessórios", totalAcess],
        ["Revestimentos", totalRevest], ["Espelhos, parede & mobiliário", totalParede],
      ].filter(([, v]) => (v as number) > 0) as [string, number][];
      at(compFin.map(([n, v]) => `${n} ${BRL(Math.round(v))}`).join("   ·   "), M, y, 9, font, MUTED);
      y -= 24;
    },

    cenarios: async () => {
      if (investimentoTotal <= 0) return;
      secN("cenarios", 150);
      intro("cenarios",
        "Como o investimento total se distribui: o núcleo indispensável (Essencial), o nível recomendado (Balanceado), os itens de acabamento do projeto (Premium) e os complementos orçados.");
      y -= 8;

      ensure(54);
      page.drawRectangle({ x: M, y: y - 44, width: CW, height: 48, borderColor: LINE, borderWidth: 1, color: CREAM });
      at("INVESTIMENTO TOTAL", M + 14, y - 14, 8, bold, MUTED);
      at(BRL(investimentoTotal), M + 14, y - 38, 19, bold, DARK);
      y -= 60;

      const fatias = [
        ...niveis.map((n) => ({ rotulo: `${n.label} — ${n.nNivel} equip.`, valor: n.incremento, cor: hexToRgb(n.cor) })),
        { rotulo: "Acessórios", valor: totalAcess, cor: hexToRgb("#C07A3E") },
        { rotulo: "Revestimentos, espelhos & mobiliário", valor: totalRevest + totalParede, cor: hexToRgb("#8A8A8F") },
      ].filter((f) => f.valor > 0);
      const pctDe = (v: number) => Math.round((v / investimentoTotal) * 100);

      ensure(30);
      const barH = 16;
      let bx = M;
      for (const f of fatias) {
        const bw = (f.valor / investimentoTotal) * CW;
        page.drawRectangle({ x: bx, y: y - barH, width: bw, height: barH, color: f.cor });
        bx += bw;
      }
      page.drawRectangle({ x: M, y: y - barH, width: CW, height: barH, borderColor: LINE, borderWidth: 0.8 });
      y -= barH + 14;

      for (const f of fatias) {
        ensure(17);
        page.drawRectangle({ x: M, y: y - 1, width: 9, height: 9, color: f.cor });
        at(`${pctDe(f.valor)}%`, M + 16, y, 10.5, bold, DARK);
        at(f.rotulo, M + 52, y, 9.5, font, rgb(0.28, 0.28, 0.28));
        y -= 16;
      }
      y -= 6;
      if (classificacaoPendente(cena)) {
        ensure(24);
        paragrafo(
          "Todos os equipamentos ainda estão no nível Balanceado — classifique-os na Curadoria para os percentuais refletirem o projeto.",
          8.5, hexToRgb("#E09A45"),
        );
        y -= 6;
      }
    },

    categorias: async () => {
      if (!comp.length) return;
      secN("categorias");
      intro("categorias",
        "À esquerda, os equipamentos da categoria com o cenário e o valor. À direita, o que aquele conjunto é, o que entrega e como foi dimensionado — mais a observação do consultor sobre este condomínio.");
      y -= 12;

      const GAP = 18;
      const LARG_ESQ = Math.round(CW * 0.56);
      const X_DIR = M + LARG_ESQ + GAP;
      const LARG_DIR = A4.w - M - X_DIR;
      const colCen = M + LARG_ESQ - 118, colVal = M + LARG_ESQ;

      for (const c of comp) {
        const espec = especificacaoDaZona(c.zona, cena);
        const altEsq = 21 + c.itens.length * 16 + 22;
        const textosDir: [string, string][] = [
          ["O que é", espec.oque], ["O que entrega", espec.entrega],
          ["Dimensionamento", espec.criterio], ["Obra & operação", espec.operacao],
        ];
        if (espec.nota) textosDir.push(["Observação", espec.nota]);
        const altDir = textosDir.reduce((t, [, tx]) => t + linhasDe(tx, LARG_DIR, 8).length * 11 + 13, 0);
        ensure(Math.min(560, 30 + Math.max(altEsq, altDir)) + 10);

        page.drawRectangle({ x: M, y: y - 4, width: CW, height: 20, color: DARKBG });
        at(c.label.toUpperCase(), M + 9, y, 10, bold, hexToRgb(c.cor));
        rightAt(
          `${c.n} ${c.n === 1 ? "equipamento" : "equipamentos"}    ${BRL(c.subtotal)}`,
          A4.w - M - 9, y, 8.5, bold, rgb(0.88, 0.88, 0.88),
        );
        y -= 28;
        const topo = y;

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
        let cx = M + 6;
        for (const k of ["essencial", "balanceado", "premium"] as Cenario[]) {
          const d = c.porCenario[k];
          if (!d.n) continue;
          const rotulo = `${CENARIOS[k].label} ${d.n}`;
          at(rotulo, cx, ye, 7.5, bold, hexToRgb(CENARIOS[k].cor));
          cx += w(rotulo, 7.5, bold) + 14;
        }
        ye -= 14;

        let yd = topo;
        const campoDir = (rotulo: string, texto: string, destaque = false) => {
          const linhas = linhasDe(texto, LARG_DIR, 8);
          at(rotulo.toUpperCase(), X_DIR, yd, 6.5, bold, destaque ? hexToRgb(c.cor) : GOLD);
          yd -= 10;
          linhas.forEach((l, i) => at(l, X_DIR, yd - i * 11, 8, font, destaque ? DARK : rgb(0.28, 0.28, 0.28)));
          yd -= linhas.length * 11 + 3;
        };
        campoDir("O que é", espec.oque);
        campoDir("O que entrega", espec.entrega);
        campoDir("Dimensionamento", espec.criterio);
        campoDir("Obra & operação", espec.operacao);
        if (espec.nota) campoDir("Observação", espec.nota, true);

        const base = Math.min(ye, yd);
        page.drawLine({ start: { x: X_DIR - GAP / 2, y: topo + 10 }, end: { x: X_DIR - GAP / 2, y: base + 6 }, thickness: 0.5, color: LINE });
        y = base - 12;
      }

      ensure(20);
      page.drawRectangle({ x: M, y: y - 5, width: CW, height: 20, color: CREAM });
      at("INVESTIMENTO TOTAL (PREMIUM)", M + 9, y, 9, bold, GOLD);
      rightAt(BRL(r.cenarios.premium), A4.w - M - 9, y, 10.5, bold, GOLD);
      y -= 28;
    },

    acessorios: async () => {
      if (mostrar.acessorios && acess.length) {
        secN("acessorios");
        const qCol = A4.w - M - 200, uCol = A4.w - M - 110, tCol = A4.w - M - 6;
        page.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: CREAM });
        at("ITEM", M + 6, y, 8, bold, MUTED);
        rightAt("QTD", qCol, y, 8, bold, MUTED); rightAt("PREÇO UN.", uCol, y, 8, bold, MUTED); rightAt("TOTAL", tCol, y, 8, bold, MUTED);
        y -= 22;
        let totalAc = 0;
        const grupos = agruparPorLugar(acess, cena);
        for (const g of grupos) {
          ensure(18);
          at(g.titulo.toUpperCase(), M + 6, y, 8, bold, MUTED);
          y -= 16;
          for (const a of g.itens) {
            ensure(16);
            const tot = custoAcessorio(a);
            totalAc += tot;
            at(trunc(a.incluso ? `${a.nome} (incluso)` : a.nome, qCol - 40 - M, 9.5), M + 6, y, 9.5, font, DARK);
            rightAt(String(a.qtd), qCol, y, 9, font, MUTED);
            rightAt(a.incluso ? "—" : BRL(a.preco_un), uCol, y, 9, font, MUTED);
            rightAt(a.incluso ? "incluso" : BRL(Math.round(tot)), tCol, y, 9.5, font, DARK);
            page.drawLine({ start: { x: M, y: y - 5 }, end: { x: A4.w - M, y: y - 5 }, thickness: 0.4, color: LINE });
            y -= 16;
          }
          y -= 4;
        }
        ensure(16);
        at("Total em acessórios", M + 6, y, 9, bold, DARK);
        rightAt(BRL(Math.round(totalAc)), tCol, y, 10, bold, GOLD);
        y -= 24;
      }
    },

    // Marcas do projeto — a vitrine de quem fabrica o que o condomínio compra.
    marcas: async () => {
      if (!mostrar.marcas) return;
      const marcas = marcasDaCena(cena, catalogo, biblioteca, acabCatalogo);
      // Gate por `marcas`, não por "marcas com texto": um projeto cujas marcas
      // estão todas fora da base de textos ligava a seção e o PDF saía sem ela.
      if (!marcas.length) return;
      secN("marcas", 60);
      intro("marcas",
        cena.marcasIntro?.trim()
        || "Fabricantes dos equipamentos especificados neste projeto (fontes: sites das marcas e imprensa especializada).");
      y -= 6;

      // Marcas irmãs saem sob o grupo que as controla ("Core Health &
      // Fitness — Nautilus, StairMaster"): é a informação que o síndico usa
      // para entender que duas marcas do projeto têm a mesma assistência.
      for (const g of agruparMarcas(marcas.filter((m) => (m.resumo || m.logo) && !m.soInventario))) {
        if (g.grupo) {
          ensure(20);
          at(g.rotulo.toUpperCase(), M, y, 7.5, bold, GOLD);
          y -= 15;
        }
        for (const m of g.marcas) {
          const linhas = m.resumo ? linhasDe(m.resumo, CW - 4, 9) : [];
          ensure(34 + linhas.length * 12.5);
          let xNome = M;
          // Logotipo da marca, quando cadastrado na biblioteca.
          if (m.logo) {
            try {
              const lg = /^data:image\/png/i.test(m.logo) ? await doc.embedPng(m.logo) : await doc.embedJpg(m.logo);
              const lh = 16, lw = Math.min(64, (lg.width / lg.height) * lh);
              page.drawImage(lg, { x: M, y: y - 4, width: lw, height: lh });
              xNome = M + lw + 10;
            } catch { /* logo inválido — a marca sai só com o nome */ }
          }
          at(m.nome.toUpperCase(), xNome, y, 11, bold, DARK);
          const xInfo = xNome + w(m.nome.toUpperCase(), 11, bold) + 10;
          // `presencaDaMarca` conta por ORIGEM: uma marca que só aparece em
          // acabamento não pode ser anunciada como "3 equipamentos".
          at([m.origem, presencaDaMarca(m)].filter(Boolean).join("  ·  "), xInfo, y, 8.5, font, MUTED);
          y -= 15;
          linhas.forEach((l) => { at(l, M, y, 9, font, rgb(0.25, 0.25, 0.25)); y -= 12.5; });
          if (m.nota) { at(m.nota, M, y, 8.5, font, GOLD); y -= 13; }
          const rodape = [
            m.garantia && `Garantia: ${m.garantia}`,
            m.assistencia && `Assistência: ${m.assistencia}`,
          ].filter(Boolean).join("   ·   ");
          if (rodape) { at(rodape, M, y, 8, font, MUTED); y -= 13; }

          // A PRANCHA DA LINHA. O logo diz de quem é o aparelho; esta imagem
          // mostra o que o condomínio vai receber. Vem do override do projeto
          // (`cena.marcas[].imagem`), não da biblioteca: a linha especificada
          // muda de projeto para projeto.
          const ovm = (cena.marcas ?? []).find((x) => x.ref === refDaMarca(m.nome));
          if (ovm?.imagem) {
            try {
              const im = /^data:image\/png/i.test(ovm.imagem) ? await doc.embedPng(ovm.imagem) : await doc.embedJpg(ovm.imagem);
              const iw = Math.min(CW, im.width);
              const ih = (im.height / im.width) * iw;
              const alt = Math.min(ih, 250);
              const larg = (alt / ih) * iw;
              ensure(alt + (ovm.imagemLegenda ? 26 : 14));
              page.drawImage(im, { x: M + (CW - larg) / 2, y: y - alt, width: larg, height: alt });
              y -= alt + 6;
              if (ovm.imagemLegenda?.trim()) {
                const leg = ovm.imagemLegenda.trim();
                at(leg, M + (CW - w(leg, 8, font)) / 2, y, 8, font, MUTED);
                y -= 12;
              }
            } catch { /* imagem inválida: a marca sai sem a prancha */ }
          }
          y -= 8;
        }
      }

      const soNome = marcas.filter((m) => !m.resumo && !m.logo && !m.soInventario);
      if (soNome.length) {
        ensure(16);
        at(`Também presentes: ${soNome.map((m) => m.nome).join(", ")}.`, M, y, 8.5, font, MUTED);
        y -= 16;
      }
      // O que o condomínio já tem não é vitrine de compra — sai separado.
      const jaTem = marcas.filter((m) => m.soInventario);
      if (jaTem.length) {
        ensure(16);
        at(`Já presentes no condomínio: ${jaTem.map((m) => m.nome).join(", ")}.`, M, y, 8.5, font, MUTED);
        y -= 16;
      }
      y -= 4;
    },

    memorial: async () => {
      if (cena.itens.length) {
        secN("memorial");
        intro("memorial",
          "Um verbete por equipamento, agrupado por categoria: o que é, o que trabalha, por que está neste projeto e o que exige atenção.");
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
    },

    exercicios: async () => {
      if (mostrar.exercicios && cena.itens.length) {
        // Um bloco por equipamento DISTINTO com lista fechada de exercícios.
        const blocos = new Map<string, { nome: string; exercicios: string[] }>();
        for (const it of cena.itens) {
          const cat = (it.equipamentoId && catId.get(it.equipamentoId)) || catNome.get(it.nome) || null;
          const exs = exerciciosDoItem(it, cat);
          if (exs.length && !blocos.has(it.nome)) blocos.set(it.nome, { nome: it.nome, exercicios: exs });
        }
        if (blocos.size) {
          secN("exercicios", 60);
          intro("exercicios",
            "Exercícios de musculação executáveis nos equipamentos deste projeto. A lista cobre as máquinas de trajetória definida; bancos, racks e estações de cabo ampliam o repertório com dezenas de variações com pesos livres.");
          y -= 6;
          for (const b of blocos.values()) {
            const texto = b.exercicios.join("  ·  ");
            const linhas = linhasDe(texto, CW - 120, 8.5);
            ensure(linhas.length * 11.5 + 8);
            at(trunc(b.nome, 112, 8.5, bold), M, y, 8.5, bold, DARK);
            linhas.forEach((l, i) => at(l, M + 120, y - i * 11.5, 8.5, font, rgb(0.28, 0.28, 0.28)));
            y -= linhas.length * 11.5 + 7;
          }
          y -= 6;
        }
      }
    },

    inventario: async () => {
      if (mostrar.inventario && inventario.length) {
        const reap = inventario.filter((i) => i.destino === "reaproveitado");
        const resi = inventario.filter((i) => i.destino === "residual");
        const somaQtd = (xs: typeof inventario) => xs.reduce((t, i) => t + (i.qtd || 1), 0);
        secN("inventario", 60);
        intro("inventario",
          "Levantamento do que o condomínio já tem. O reaproveitado permanece no projeto e não entra no investimento; o residual sai da sala.");
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
    },

    acabamentos: async () => {
      if (mostrar.acabamentos && revest.length) {
        const areaDe = (a: (typeof revest)[number]) => (a.pontos && a.pontos.length >= 3 ? areaPoligonoM2(a.pontos) : (a.w_cm / 100) * (a.h_cm / 100));
        const totalRevest = revest.reduce((s, a) => s + areaDe(a) * (a.preco_m2 || 0), 0);
        secN("acabamentos");
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
    },

    mobiliario: async () => {
      if (mostrar.mobiliario && (elems.length || infra.length)) {
        secN("mobiliario");
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
    },

    // Capacidade & ocupação. Os números vêm de `analisarEspaco` — a MESMA
    // função que alimenta o painel do editor. Antes o PDF refazia a conta à
    // mão, sobre a área BRUTA e com `livre = sala − Σuso` (que zera em sala
    // densa, porque soma sobreposição duas vezes) e contava um usuário por
    // item — halteres e banco viravam dois usuários simultâneos.
    capacidade: async () => {
      if (mostrar.capacidade) {
        const itens = cena.itens ?? [];
        const usuarios = esp.capacidade.simultaneos.valor;
        const custoM2 = esp.areaUtilM2.valor > 0 ? r.subtotal / esp.areaUtilM2.valor : 0;
        secN("capacidade");
        // Todo número sai com a régua ao lado: sem ela, "ocupação 43%" não
        // informa nada a quem não é do ramo — que é justamente o leitor.
        const kv = (k: string, v: string, ref?: string) => {
          ensure(ref ? 26 : 16);
          at(k, M + 6, y, 9.5, font, MUTED);
          rightAt(v, A4.w - M - 6, y, 9.5, bold, DARK);
          y -= ref ? 11 : 16;
          if (ref) { at(ref, M + 6, y, 7.5, font, LINE_TXT); y -= 15; }
        };
        const nm = (x: number) => `${x.toFixed(1).replace(".", ",")} m²`;
        kv("Área da sala", nm(esp.areaBrutaM2.valor));
        kv("Área útil (sem pilares e mobiliário fixo)", nm(esp.areaUtilM2.valor));
        kv("Equipamentos", String(itens.length));
        kv("Área física ocupada (corpo)", nm(esp.areaCorpoM2.valor));
        kv("Área de uso (corpo + operação)", nm(esp.areaUsoM2.valor));
        kv("Área livre de circulação", nm(esp.areaLivreM2.valor), esp.areaLivreM2.referencia);
        kv("Ocupação funcional", `${Math.round(esp.ocupacaoFuncional.valor)}%`, esp.ocupacaoFuncional.referencia);
        kv("Área útil por aparelho", nm(esp.m2PorAparelho.valor), esp.m2PorAparelho.referencia);
        kv("Usuários simultâneos (estimado)", String(Math.round(usuarios)), esp.capacidade.simultaneos.referencia);
        if (esp.folgas.menorVaoCm != null) {
          kv("Menor vão de circulação", `${Math.round(esp.folgas.menorVaoCm)} cm`, esp.folgas.menorVao.referencia);
        }
        kv("Investimento por m² útil", BRL(Math.round(custoM2)));
        if (usuarios > 0) kv("Investimento por usuário simultâneo", BRL(Math.round(r.subtotal / usuarios)));
        y -= 8;
      }
    },

    // ── Cobertura muscular & movimento ──────────────────────────────────
    // A análise vem ANTES da lista de exercícios: primeiro o que a academia
    // treina e o que ficou de fora, depois o anexo que comprova.
    cobertura: async () => {
      if (!mostrar.cobertura || !cena.itens.length) return;
      const cob = analisarCobertura(cena, catalogo);
      if (!cob.resumo.itensAvaliados) return;
      secN("cobertura", 80);
      intro("cobertura",
        `Que grupos musculares e padrões de movimento esta academia atende, somando os ${cob.resumo.itensAvaliados} equipamentos reconhecidos pela base técnica. Coberto = há equipamento que trabalha o grupo como estímulo principal; fraco = ele entra apenas como auxiliar.`);
      y -= 4;

      // Faixa-resumo
      ensure(30);
      const cx = [
        [`${cob.resumo.cobertos} cobertos`, GREEN],
        [`${cob.resumo.fracos} fracos`, hexToRgb("#E09A45")],
        [`${cob.resumo.descobertos} descobertos`, cob.resumo.descobertos ? RED : MUTED],
        [`${cob.resumo.padroesCobertos}/${cob.resumo.padroesTotal} movimentos`, DARK],
      ] as [string, RGB][];
      let bx = M;
      for (const [t, cor] of cx) {
        const lw = w(t, 9, bold) + 18;
        page.drawRectangle({ x: bx, y: y - 5, width: lw, height: 19, borderColor: cor, borderWidth: 0.9 });
        at(t, bx + 9, y, 9, bold, cor);
        bx += lw + 8;
      }
      y -= 30;

      // Uma linha por grupo muscular, agrupada por região do corpo.
      const porRegiao = new Map<string, typeof cob.musculos>();
      for (const l of cob.musculos) {
        const reg = REGIOES[MUSCULOS[l.musculo].regiao];
        (porRegiao.get(reg) ?? porRegiao.set(reg, []).get(reg)!).push(l);
      }
      for (const [reg, linhas] of porRegiao) {
        ensure(20 + linhas.length * 14);
        at(reg.toUpperCase(), M, y, 7, bold, GOLD);
        y -= 14;
        for (const l of linhas) {
          ensure(15);
          const cor = l.status === "coberto" ? GREEN : l.status === "fraco" ? hexToRgb("#E09A45") : RED;
          at(l.status === "coberto" ? "•" : l.status === "fraco" ? "◦" : "×", M + 6, y, 9, bold, cor);
          at(l.label, M + 20, y, 9, bold, DARK);
          const quem = l.primarios.length ? l.primarios.join(", ")
            : l.secundarios.length ? `só como auxiliar: ${l.secundarios.join(", ")}`
            : "nenhum equipamento do projeto";
          at(trunc(quem, CW - 150, 8.5), M + 130, y, 8.5, font, MUTED);
          y -= 14;
        }
        y -= 4;
      }

      // O que comprar para fechar cada lacuna — a parte que vira decisão.
      if (cob.sugestoes.length) {
        ensure(34);
        y -= 4;
        at("PARA FECHAR AS LACUNAS", M, y, 7, bold, GOLD); y -= 15;
        for (const s of cob.sugestoes) {
          const linhas = linhasDe(s.porque, CW - 150, 8.5);
          ensure(linhas.length * 11 + 8);
          at(trunc(s.equipamento, 132, 9, bold), M + 6, y, 9, bold, DARK);
          seloCenario(s.cenario, A4.w - M, y);
          linhas.forEach((t, i) => at(t, M + 146, y - i * 11, 8.5, font, rgb(0.3, 0.3, 0.3)));
          y -= Math.max(linhas.length * 11, 12) + 5;
        }
      }

      // Cortar orçamento tem consequência de TREINO, não só de preço.
      if (cob.porCenario.length) {
        ensure(30 + cob.porCenario.length * 14);
        y -= 6;
        at("O QUE CADA CENÁRIO ENTREGA", M, y, 7, bold, GOLD); y -= 15;
        for (const c of cob.porCenario) {
          ensure(15);
          at(c.label, M + 6, y, 9, bold, hexToRgb(CENARIOS[c.cenario].cor));
          const txtC = c.descobertos.length
            ? `${c.cobertos.length} grupos cobertos · fora: ${c.descobertos.map((m) => MUSCULOS[m].label).join(", ")}`
            : c.fracos.length
              ? `${c.cobertos.length} grupos cobertos · ${c.fracos.length} só como auxiliar`
              : `${c.cobertos.length} grupos cobertos — corpo inteiro`;
          at(trunc(txtC, CW - 110, 8.5), M + 96, y, 8.5, font, rgb(0.3, 0.3, 0.3));
          y -= 14;
        }
      }

      // Análise que esconde o que ignorou não vale nada.
      if (cob.naoReconhecidos.length) {
        ensure(18);
        y -= 4;
        at(trunc(`Fora da análise: ${cob.naoReconhecidos.join(", ")}.`, CW, 8, font), M, y, 8, font, MUTED);
        y -= 16;
      }
      y -= 6;
    },

    futuro: async () => {
      if (!mostrar.futuro || !cena.itens.length) return;
      const lista = sugerirFuturo(cena, catalogo);
      if (!lista.length) return;
      secN("futuro", 50);
      intro("futuro",
        "O que comprar numa segunda fase para completar a academia — depois do que o layout atual já treina.");
      y -= 4;
      for (const s of lista) {
        const linhas = linhasDe(s.motivo, CW - 8, 8.5);
        ensure(linhas.length * 11 + 16);
        at(trunc(s.nome, CW - 80, 9.5, bold), M + 6, y, 9.5, bold, DARK);
        at(s.tipo === "acessorio" ? "acessório" : "equipamento", A4.w - M - 70, y, 8, font, MUTED);
        y -= 13;
        linhas.forEach((t) => { at(t, M + 6, y, 8.5, font, rgb(0.3, 0.3, 0.3)); y -= 11; });
        y -= 4;
      }
      y -= 4;
    },

    matriz: async () => {
      if (mostrar.matriz && (mat.length || prioridades.length)) {
      secN("matriz");
      if (!mat.length) {
        // Sem notas por equipamento, a matriz é a da leitura: padrão do condomínio,
        // adequação do orçamento e as prioridades na ordem definida com o síndico.
        paragrafo(
          [
            perfil.padrao && `Condomínio de ${perfil.padrao.toLowerCase()}`,
            perfil.investimento_perfil && `orçamento ${perfil.investimento_perfil.toLowerCase()}`,
          ].filter(Boolean).join(", ") + ". Se o orçamento apertar, preserva-se nesta ordem:",
          9.5, rgb(0.25, 0.25, 0.25),
        );
        y -= 6;
        prioridades.forEach((pr, i) => {
          ensure(20);
          at(`${i + 1}º`, M + 4, y, 11, bold, GOLD);
          at(pr, M + 30, y, 10.5, bold, DARK);
          page.drawLine({ start: { x: M, y: y - 6 }, end: { x: A4.w - M, y: y - 6 }, thickness: 0.35, color: LINE });
          y -= 19;
        });
        y -= 6;
      } else {
        intro("matriz", "Impacto funcional · valor percebido · necessidade (1–5). Maior soma = maior prioridade — o que preservar se o orçamento apertar.");
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
    },

    // Validação técnica: o veredito sobre o layout entregue. Agora sai com os
    // alertas reais da análise de espaço (vãos abaixo da régua, ocupação fora
    // de faixa, região de circulação obstruída) e não só "N colisões" — e
    // continua desligável, porque nem todo Dossiê deve levar ao síndico a
    // lista de pendências internas do consultor.
    validacao: async () => {
      secN("validacao", 40);
      const limpo = r.nCol === 0 && r.nCor === 0 && !esp.alertas.some((a) => a.nivel === "critico");
      if (limpo) {
        at(`Layout validado — sem colisões e com circulação dentro da régua de ${esp.circulacaoMinCm} cm.`, M, y, 10, font, GREEN);
        y -= 16;
      } else {
        if (r.nCol) { at(`${r.nCol} colisão(ões) a resolver.`, M, y, 10, font, RED); y -= 15; }
        if (r.nCor) { at(`${r.nCor} equipamento(s) sobre a circulação.`, M, y, 10, font, hexToRgb("#E09A45")); y -= 15; }
      }
      for (const al of esp.alertas) {
        const linhas = linhasDe(al.texto, CW - 16, 9);
        ensure(linhas.length * 12 + 4);
        const cor = al.nivel === "critico" ? RED : al.nivel === "atencao" ? hexToRgb("#E09A45") : MUTED;
        at(al.nivel === "critico" ? "•" : "◦", M, y, 10, bold, cor);
        linhas.forEach((l, i) => at(l, M + 14, y - i * 12, 9, font, i === 0 ? cor : rgb(0.35, 0.35, 0.35)));
        y -= linhas.length * 12 + 3;
      }
      y -= 4;
      at(`Ocupação funcional ${Math.round(esp.ocupacaoFuncional.valor)}% da área útil  ·  ${esp.ocupacaoFuncional.referencia}`, M, y, 8.5, font, MUTED);
      y -= 18;
    },

  };

  // Ordem impressa: a do projeto quando existe, senão a padrão. Seções
  // desligadas somem sem deixar buraco na numeração.
  const ordem = (cena.dossieOrdem?.length ? cena.dossieOrdem : ORDEM_DOSSIE_PADRAO)
    .filter((id, i, xs) => xs.indexOf(id) === i);
  const faltando = ORDEM_DOSSIE_PADRAO.filter((id) => !ordem.includes(id));
  for (const id of [...ordem, ...faltando]) {
    if (mostrar[id] === false) continue;
    await SECOES[id]?.();
  }


  return await doc.save();
}

/** Gera o Dossiê e dispara o download no navegador. */
export async function exportarPdf(
  projeto: Projeto, laminas?: LaminaRender[] | string | null, catalogo?: Equipamento[], config?: ConfigConsultor | null,
  biblioteca?: Marca[] | null, acabCatalogo?: Acabamento[],
) {
  const bytes = await montarDossie(projeto, laminas, catalogo, config, biblioteca, acabCatalogo);
  baixarPdf(bytes, projeto.nome);
}

/** Dispara o download de bytes já montados (prévia → baixar). */
export function baixarPdf(bytes: Uint8Array, nomeProjeto: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Dossie_${nomeProjeto.replace(/[^\w\-]+/g, "_")}.pdf`;
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
  if (!iso) return new Date().toLocaleDateString("pt-BR");
  // "2026-08-06" sem hora: o construtor trata como MEIA-NOITE UTC, que no fuso
  // do Brasil é o dia ANTERIOR — o Dossiê sairia datado de véspera. Data pura
  // é montada como data local.
  const soDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = soDia ? new Date(+soDia[1], +soDia[2] - 1, +soDia[3]) : new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
