// Leitura de PDF de ORÇAMENTO de fornecedor → cabeçalho + linhas de item.
//
// Cada fornecedor manda o PDF no seu próprio layout, então aqui não existe
// "certeza": o leitor extrai o que consegue, marca o que ficou duvidoso
// (`incerta`) e devolve a linha crua ao lado. Quem decide é a tela de
// conferência — nada entra no projeto sem o consultor validar.
//
// `interpretarOrcamento` é PURA (texto → dados) e testável em Node;
// `lerOrcamentoPdf` só acrescenta a extração de texto do PDF pelo pdf.js.

import { carregarPdfjs } from "./parsers";
import { parseNum } from "./readers";

export type TipoLinha = "equipamento" | "acessorio";

export interface LinhaOrcamento {
  id: string;
  descricao: string;
  modelo: string | null;
  qtd: number;
  preco_un: number | null;
  total: number | null;
  tipo: TipoLinha;
  /** true quando o valor unitário foi deduzido, não lido — a tela destaca. */
  incerta: boolean;
  /** Linha original do PDF, para conferir sem abrir o arquivo. */
  bruto: string;
}

export interface OrcamentoLido {
  fornecedor: string | null;
  cnpj: string | null;
  documento: string | null;
  data_orcamento: string | null;
  validade: string | null;
  prazo_entrega: string | null;
  garantia: string | null;
  pagamento: string | null;
  frete: string | null;
  /** Total impresso no PDF (quando encontrado). */
  total: number | null;
  linhas: LinhaOrcamento[];
  /** Texto extraído, para conferência e para o caso de o leitor errar. */
  texto: string;
  paginas: number;
  /** false = PDF sem camada de texto (escaneado/foto) — não dá para ler. */
  temTexto: boolean;
}

// ── Utilidades ──────────────────────────────────────────────────────────────

const norm = (s: string) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Valor monetário: exige as duas casas decimais (1.234,56 · 234,56 · 1234.56). */
const RE_MOEDA = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})/g;

/** Linhas que são cabeçalho, rodapé ou totalizador — nunca viram item. */
const RUIDO = [
  "total", "subtotal", "valor total", "total geral", "desconto", "acrescimo", "frete",
  "ipi", "icms", "st ", "cnpj", "cpf", "inscricao", "endereco", "telefone", "e-mail", "email",
  "banco", "agencia", "conta", "pix", "boleto", "validade", "prazo", "garantia",
  "pagamento", "condicoes", "observac", "assinatura", "pagina", "orcamento n", "proposta n",
  "razao social", "vendedor", "cliente", "obrigado", "atenciosamente", "www.", "http",
  "qtd", "quantidade", "descricao", "valor unit", "vl unit", "unitario", "produto",
];

function ehRuido(linha: string): boolean {
  const n = norm(linha).trim();
  if (n.length < 3) return true;
  // Só é ruído se a palavra aparecer no COMEÇO da linha — "Esteira com garantia
  // estendida" é item, "Garantia: 12 meses" não é.
  return RUIDO.some((r) => n.startsWith(r));
}

/** Unidade logo depois do número: "2,20 m" e "1,50 kg" são MEDIDA, não preço —
 *  e descrição de equipamento é cheia delas. Só vale para número sem "R$". */
const RE_UNIDADE = /^\s*(?:m|cm|mm|km|m²|m2|kg|g|mg|t|l|ml|pol|["”'′″])\b/i;

function acharMoedas(linha: string): { valor: number; inicio: number; fim: number }[] {
  const out: { valor: number; inicio: number; fim: number }[] = [];
  RE_MOEDA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_MOEDA.exec(linha))) {
    const v = parseNum(m[1]);
    if (v == null || v <= 0) continue;
    const fim = m.index + m[0].length;
    const temCifrao = /R\$/i.test(m[0]);
    if (!temCifrao && RE_UNIDADE.test(linha.slice(fim))) continue;
    out.push({ valor: v, inicio: m.index, fim });
  }
  return out;
}

/** Quantidade da linha: "2 UN", "QTD 2", "2x" ou o inteiro solto antes do preço. */
function acharQtd(linha: string, inicioPreco: number): { qtd: number; trecho: [number, number] | null } {
  const antes = linha.slice(0, inicioPreco >= 0 ? inicioPreco : linha.length);
  const comUnidade = /(\d{1,4})\s*(?:x\b|un\b|und\b|unid\b|pc\b|pç\b|pcs\b|pecas?\b|peças?\b|cj\b|par\b|pares\b)/i.exec(antes);
  if (comUnidade) {
    const n = Number(comUnidade[1]);
    if (n > 0 && n <= 9999) return { qtd: n, trecho: [comUnidade.index, comUnidade.index + comUnidade[0].length] };
  }
  const rotulada = /(?:qtd|qtde|quant(?:idade)?)\.?\s*:?\s*(\d{1,4})/i.exec(antes);
  if (rotulada) {
    const n = Number(rotulada[1]);
    if (n > 0 && n <= 9999) return { qtd: n, trecho: [rotulada.index, rotulada.index + rotulada[0].length] };
  }
  // Coluna QTD: inteiro isolado logo antes do preço, separado por vão de coluna.
  // Exigir o isolamento é o que impede "Leg Press 45 Graus" de virar qtd 45.
  const coluna = /(?:^|\s{2,})(\d{1,4})\s*$/.exec(antes);
  if (coluna) {
    const n = Number(coluna[1]);
    if (n > 0 && n <= 999) {
      const i = antes.lastIndexOf(coluna[1]);
      return { qtd: n, trecho: [i, i + coluna[1].length] };
    }
  }
  return { qtd: 1, trecho: null };
}

function limparDescricao(linha: string, cortes: [number, number][]): string {
  let out = "";
  let i = 0;
  const ordenados = [...cortes].sort((a, b) => a[0] - b[0]);
  for (const [a, b] of ordenados) {
    if (a > i) out += linha.slice(i, a);
    i = Math.max(i, b);
  }
  out += linha.slice(i);
  return out
    // Numeração do item ("01 - ", "3) ") e a coluna ITEM/QTD colada à esquerda
    // ("01␣␣Leg Press"). Exige pontuação ou vão de coluna, para não comer
    // medida do começo da descrição ("20 kg Anilha").
    .replace(/^\s*\d{1,3}(?:\s*[.)\-–]\s*|\s{2,})/, "")
    .replace(/\bR\$\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s.,;:\-–|]+$/, "")
    .trim();
}

function acharModelo(descricao: string): string | null {
  const m = /(?:mod(?:elo)?\.?|ref(?:er[êe]ncia)?\.?|c[óo]d(?:igo)?\.?)\s*:?\s*([A-Za-z0-9][A-Za-z0-9\-./]{1,19})/i.exec(descricao);
  return m ? m[1] : null;
}

function campo(texto: string, res: RegExp[]): string | null {
  for (const re of res) {
    const m = re.exec(texto);
    if (m) {
      const v = (m[1] ?? "").replace(/\s{2,}/g, " ").trim().replace(/[.;|]+$/, "");
      if (v) return v.slice(0, 120);
    }
  }
  return null;
}

/** Nome do fornecedor: linha com forma societária, senão a vizinha do CNPJ. */
function acharFornecedor(linhas: string[], cnpj: string | null): string | null {
  const cabecalho = linhas.slice(0, 15);
  const societaria = cabecalho.find((l) =>
    /\b(ltda|eireli|epp|me|s\.?\/?a|mei)\b/i.test(l) && l.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 4);
  if (societaria) return societaria.replace(/\s{2,}/g, " ").trim().slice(0, 90);
  if (cnpj) {
    const i = linhas.findIndex((l) => l.includes(cnpj) || norm(l).includes("cnpj"));
    for (const cand of [linhas[i - 1], linhas[i]]) {
      if (!cand) continue;
      const limpo = cand.replace(/cnpj.*/i, "").replace(/\s{2,}/g, " ").trim();
      if (limpo.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 4) return limpo.slice(0, 90);
    }
  }
  const primeira = cabecalho.find((l) => l.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 5 && !ehRuido(l));
  return primeira ? primeira.replace(/\s{2,}/g, " ").trim().slice(0, 90) : null;
}

// ── Interpretação (pura) ────────────────────────────────────────────────────

/**
 * Lê o texto de um orçamento e devolve cabeçalho + linhas de item.
 * `tipoPadrao` marca as linhas como equipamento ou acessório (o PDF de
 * acessórios entra como "acessorio" e a tela deixa trocar linha a linha).
 */
export function interpretarOrcamento(texto: string, tipoPadrao: TipoLinha = "equipamento"): OrcamentoLido {
  const linhas = texto.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() !== "");
  const inteiro = linhas.join("\n");

  const cnpj = campo(inteiro, [/\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/]);
  const fornecedor = acharFornecedor(linhas, cnpj);

  const cab: Omit<OrcamentoLido, "linhas" | "texto" | "paginas" | "temTexto" | "fornecedor" | "cnpj"> = {
    documento: campo(inteiro, [
      /(?:or[çc]amento|proposta|pedido)\s*(?:n[ºo°.]?|n[úu]mero)?\s*:?\s*([A-Za-z0-9\-/]{1,20})/i,
    ]),
    data_orcamento: campo(inteiro, [
      /\bdata\s*(?:de\s*emiss[ãa]o)?\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i,
      /\b(\d{2}\/\d{2}\/\d{4})\b/,
    ]),
    validade: campo(inteiro, [
      /valid(?:ade|o)(?:\s*da\s*proposta)?\s*:?\s*(?:de\s*)?(\d{1,3}\s*dias?[^\n]{0,20}|\d{2}\/\d{2}\/\d{2,4})/i,
    ]),
    prazo_entrega: campo(inteiro, [
      /prazo\s*(?:de\s*)?entrega\s*:?\s*([^\n]{2,60})/i,
      /entrega\s*:?\s*(\d{1,3}\s*dias?[^\n]{0,30})/i,
    ]),
    garantia: campo(inteiro, [/garantia\s*:?\s*([^\n]{2,60})/i]),
    pagamento: campo(inteiro, [
      /(?:condi[çc][õo]es?\s*(?:de\s*)?pagamento|forma\s*de\s*pagamento|pagamento)\s*:?\s*([^\n]{2,80})/i,
    ]),
    frete: campo(inteiro, [/frete\s*:?\s*([^\n]{2,60})/i]),
    total: null,
  };

  // Total impresso: a maior moeda numa linha que começa com "total".
  let total: number | null = null;
  for (const l of linhas) {
    if (!/^\s*(?:valor\s+)?total|^\s*total\s+geral/i.test(norm(l))) continue;
    for (const m of acharMoedas(l)) total = Math.max(total ?? 0, m.valor);
  }

  const itens: LinhaOrcamento[] = [];
  for (const linha of linhas) {
    if (ehRuido(linha)) continue;
    const moedas = acharMoedas(linha);
    if (!moedas.length) continue;

    const { qtd: qtdEncontrada, trecho } = acharQtd(linha, moedas[0].inicio);
    let qtd = qtdEncontrada;
    const cortes: [number, number][] = moedas.map((m) => [m.inicio, m.fim] as [number, number]);
    if (trecho) cortes.push(trecho);
    const descricao = limparDescricao(linha, cortes);
    // Sem descrição sobrando, é linha de totalização e não item.
    if (descricao.replace(/[^A-Za-zÀ-ÿ]/g, "").length < 3) continue;

    let preco_un: number | null;
    let totalLinha: number | null;
    let incerta = false;
    if (moedas.length >= 2) {
      preco_un = moedas[0].valor;
      totalLinha = moedas[moedas.length - 1].valor;
      // Confere a aritmética: se não fecha, o leitor pegou colunas trocadas.
      if (Math.abs(preco_un * qtd - totalLinha) > Math.max(1, totalLinha * 0.02)) {
        // Antes de desistir: se total/unitário dá um inteiro redondo, a coluna
        // QTD existe e ficou fora do recorte — deduz dela e a conta fecha.
        const razao = preco_un > 0 ? totalLinha / preco_un : 0;
        const arred = Math.round(razao);
        if (qtdEncontrada === 1 && arred >= 2 && arred <= 999 && Math.abs(razao - arred) < 0.02) qtd = arred;
        else incerta = true;
      }
    } else {
      // Coluna única: nos orçamentos que vemos é o total da linha.
      totalLinha = moedas[0].valor;
      preco_un = qtd > 0 ? Math.round((totalLinha / qtd) * 100) / 100 : totalLinha;
      incerta = qtd > 1;
    }

    itens.push({
      id: `l${itens.length + 1}`,
      descricao,
      modelo: acharModelo(descricao),
      qtd,
      preco_un,
      total: totalLinha,
      tipo: tipoPadrao,
      incerta,
      bruto: linha.replace(/\s{2,}/g, "  ").trim(),
    });
  }

  return {
    fornecedor,
    cnpj,
    ...cab,
    total,
    linhas: itens,
    texto: inteiro,
    paginas: 1,
    temTexto: linhas.length > 0,
  };
}

/** Soma das linhas — a tela compara com o total impresso no PDF. */
export function somaLinhas(linhas: LinhaOrcamento[]): number {
  return linhas.reduce((s, l) => s + (l.total ?? (l.preco_un ?? 0) * l.qtd), 0);
}

// ── Extração do texto do PDF ────────────────────────────────────────────────

/** Reconstrói as linhas visuais da página: agrupa por Y, ordena por X e
 *  preserva a separação de colunas (espaço duplo) para o parser achar QTD. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function linhasDaPagina(itens: any[]): string[] {
  const porY = new Map<number, { x: number; largura: number; s: string }[]>();
  for (const it of itens) {
    const s = String(it.str ?? "");
    if (!s.trim()) continue;
    const x = it.transform[4] as number;
    const y = Math.round((it.transform[5] as number) / 3) * 3; // tolera 3pt de desalinho
    const arr = porY.get(y) ?? porY.set(y, []).get(y)!;
    arr.push({ x, largura: Number(it.width) || 0, s });
  }
  return [...porY.entries()]
    .sort((a, b) => b[0] - a[0]) // topo → base
    .map(([, pedacos]) => {
      pedacos.sort((a, b) => a.x - b.x);
      let linha = "";
      let fimAnterior = -Infinity;
      for (const p of pedacos) {
        const vao = p.x - fimAnterior;
        if (linha) linha += vao > 12 ? "  " : vao > 1.2 ? " " : "";
        linha += p.s;
        fimAnterior = p.x + p.largura;
      }
      return linha.trim();
    })
    .filter((l) => l !== "");
}

/** Texto de todas as páginas do PDF, já em linhas visuais. */
export async function textoDoPdf(file: File | ArrayBuffer): Promise<{ texto: string; paginas: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await carregarPdfjs();
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const paginas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    paginas.push(linhasDaPagina(tc.items).join("\n"));
  }
  return { texto: paginas.join("\n").trim(), paginas: doc.numPages };
}

/** Lê um PDF de orçamento inteiro: texto → cabeçalho + linhas. */
export async function lerOrcamentoPdf(file: File, tipoPadrao: TipoLinha = "equipamento"): Promise<OrcamentoLido> {
  const { texto, paginas } = await textoDoPdf(file);
  const lido = interpretarOrcamento(texto, tipoPadrao);
  return { ...lido, paginas, temTexto: texto.replace(/\s/g, "").length > 40 };
}
