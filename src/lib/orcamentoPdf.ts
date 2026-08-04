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

/** Valor monetário: duas casas decimais E delimitado — sem os limites,
 *  "21.213.298/0001-98" (CNPJ) virava o "preço" 21,21. */
const RE_MOEDA = /(?:R\$\s*)?(?<![\d.,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?![\d.,])/g;

/** Linhas que são cabeçalho, rodapé ou totalizador — nunca viram item. */
const RUIDO = [
  "total", "subtotal", "valor total", "total geral", "desconto", "acrescimo", "frete",
  "ipi", "icms", "st ", "cnpj", "cpf", "inscricao", "endereco", "telefone", "e-mail", "email",
  "banco", "agencia", "conta", "pix", "boleto", "validade", "prazo", "garantia",
  "pagamento", "condicoes", "observac", "assinatura", "pagina", "orcamento n", "proposta n",
  "razao social", "vendedor", "cliente", "obrigado", "atenciosamente", "www.", "http",
  "qtd", "quantidade", "descricao", "valor unit", "vl unit", "unitario", "produto",
  // Blocos de dados e rodapés vistos nos orçamentos reais (Movement, CORE, G2).
  "nome:", "num:", "cep", "uf:", "complemento", "log.", "ins.", "site", "razao",
  "tipo doc", "tipo frete", "parc ", "valor da", "nº de itens", "n° de itens", "no de itens",
  "soma das", "itens da proposta", "lista de produtos", "para", "responsavel",
];

/** Linha de CONDIÇÃO DE PAGAMENTO — tem vários valores, mas não é item.
 *  ("Entrada de R$70.000,00 + saldo em 2x sem Juros de R$35.000,00") */
const RE_PAGAMENTO_LINHA = /\b(entrada|parcel|saldo|juros|[àa]\s*vista|sinal|desconto|\d+\s*x\b|\d{2}\/\d{2}dd)\b/i;

function ehRuido(linha: string): boolean {
  const n = norm(linha).trim();
  if (n.length < 3) return true;
  // Só é ruído se a palavra aparecer no COMEÇO da linha — "Esteira com garantia
  // estendida" é item, "Garantia: 12 meses" não é.
  return RUIDO.some((r) => n.startsWith(r));
}

/** Unidade logo depois do número: "2,20 m" e "1,50 kg" são MEDIDA, não preço —
 *  e descrição de equipamento é cheia delas. Só vale para número sem "R$". */
const RE_UNIDADE = /^\s*(?:m|cm|mm|km|m²|m2|kg|g|mg|t|l|ml|pol|un|und|unid|pc|pç|pcs|par|cj|["”'′″])\b/i;

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
    // Rótulos de coluna que colam na descrição nos layouts em bloco.
    .replace(/\b(?:unit[áa]rio|vl\.? ?unit\.?|pre[çc]o unit\.?|total|qtd\.?|subtotal)\s*:?/gi, " ")
    .replace(/\bSKU\s+[A-Za-z0-9\-./]+/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\b(?:un|und|unid|pc|pç|pcs|cj|par)\b\s*$/i, "")
    .replace(/[\s.,;:\-–|]+$/, "")
    .trim();
}

function acharModelo(texto: string): string | null {
  const m = /(?:sku|mod(?:elo)?\.?|ref(?:er[êe]ncia)?\.?|c[óo]d(?:igo)?\.?)\s*:?\s*([A-Za-z0-9][A-Za-z0-9\-./]{1,19})/i.exec(texto);
  return m ? m[1] : null;
}

/** Corta no vão de coluna: "10 dias␣␣41 99543-7164" → "10 dias" (o telefone
 *  está em outra coluna da mesma linha visual, não faz parte do valor). */
const ateAColuna = (v: string) => v.split(/\s{2,}/)[0].trim().replace(/^[:\-–\s]+/, "").replace(/[.;,|]+$/, "");

function campo(texto: string, res: RegExp[]): string | null {
  for (const re of res) {
    const m = re.exec(texto);
    if (m) {
      const v = ateAColuna(m[1] ?? "");
      if (v) return v.slice(0, 120);
    }
  }
  return null;
}

/**
 * Campo rotulado, do jeito que os orçamentos reais escrevem: "Rótulo: valor",
 * ou "Rótulo:" com o valor na linha de baixo. Devolve o valor até o vão de
 * coluna. `proibido` descarta captura que claramente é cabeçalho de tabela.
 */
function campoRotulado(linhas: string[], rotulo: RegExp, proibido?: RegExp): string | null {
  for (let i = 0; i < linhas.length; i++) {
    const m = rotulo.exec(linhas[i]);
    if (!m) continue;
    const depois = linhas[i].slice(m.index + m[0].length);
    let v = ateAColuna(depois);
    if (!v && linhas[i + 1]) v = ateAColuna(linhas[i + 1]);
    if (!v || v.length < 2) continue;
    if (proibido && proibido.test(v)) continue;
    return v.slice(0, 120);
  }
  return null;
}

/** Bloco de dados do CLIENTE — o CNPJ e o nome ali NÃO são do fornecedor. */
const RE_BLOCO_CLIENTE = /\b(cliente|raz[ãa]o|destinat|para|cobran[çc]a|entrega)\b/i;

/** Nº da proposta. Exige o marcador (nº / número) para não confundir com o
 *  número que aparece depois de "Validade da Proposta:". */
function acharDocumento(texto: string): string | null {
  const re = /(?:or[çc]amento|proposta|pedido|documento)\s*(?:n[ºo°]\.?|n[úu]mero|#)\s*:?\s*([A-Za-z]?\d[A-Za-z0-9\-/]{0,19})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const antes = texto.slice(Math.max(0, m.index - 30), m.index);
    if (/valid|prazo|valor/i.test(antes)) continue;
    return m[1];
  }
  // "Número da Proposta 4093" (rótulo antes do nome do documento).
  const alt = /n[úu]mero\s+d[ao]\s+(?:or[çc]amento|proposta)\s*:?\s*([A-Za-z]?\d[A-Za-z0-9\-/]{0,19})/i.exec(texto);
  return alt ? alt[1] : null;
}

/** CNPJ do FORNECEDOR: o primeiro que não esteja no bloco do cliente. */
function acharCnpj(linhas: string[]): string | null {
  const re = /\b(\d{2}\.?\s?\d{3}\.?\s?\d{3}\s?\/?\s?\d{4}\s?-?\s?\d{2})\b/;
  for (let i = 0; i < linhas.length; i++) {
    const m = re.exec(linhas[i]);
    if (!m) continue;
    const contexto = [linhas[i - 2], linhas[i - 1], linhas[i]].filter(Boolean).join(" ");
    if (RE_BLOCO_CLIENTE.test(contexto)) continue; // é o CNPJ do condomínio
    return m[1].replace(/\s+/g, "");
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
      if (!cand || RE_BLOCO_CLIENTE.test(cand)) continue;
      const limpo = cand.replace(/cnpj.*/i, "").replace(/\s{2,}/g, " ").trim();
      if (limpo.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 4) return limpo.slice(0, 90);
    }
  }
  // Sem forma societária e sem CNPJ do fornecedor (papel timbrado só com
  // logotipo): melhor devolver nada do que chutar o rótulo "Cliente" ou o nome
  // do condomínio — a tela de conferência pergunta.
  // O nome que reaparece num bloco de cliente ("Nome: X", "Razao: X") é o do
  // condomínio, não do fornecedor.
  const ehCliente = (t: string) => {
    const alvo = norm(t).trim();
    return alvo.length > 5 && linhas.some((l) => RE_BLOCO_CLIENTE.test(l) && norm(l).includes(alvo) && norm(l).trim() !== alvo);
  };
  const primeira = cabecalho.find((l) =>
    !ehRuido(l) && !RE_BLOCO_CLIENTE.test(l) && !ehCliente(l)
    && l.trim().split(/\s+/).length >= 2
    && l.replace(/[^A-Za-zÀ-ÿ]/g, "").length >= 10
    // Razão social de papel timbrado é curta; linha longa é descrição de
    // produto, que aparece no topo quando o PDF não tem cabeçalho de empresa.
    && l.trim().length <= 60
    // Linha com preço é item, nunca razão social.
    && !acharMoedas(l).length);
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

  // O PRIMEIRO CNPJ do documento é o do fornecedor (papel timbrado); o do
  // cliente vem depois. Tolera o espaço que alguns PDFs deixam ("0001- 90").
  const cnpj = acharCnpj(linhas);
  const fornecedor = acharFornecedor(linhas, cnpj);

  const cab: Omit<OrcamentoLido, "linhas" | "texto" | "paginas" | "temTexto" | "fornecedor" | "cnpj"> = {
    // "Proposta Nº 4093" / "Orçamento nº 2026-4471" — exige dígito, senão o
    // rótulo da coluna seguinte ("Qtd.") virava o número da proposta.
    documento: acharDocumento(inteiro),
    data_orcamento: campo(inteiro, [
      /\bdata\s*(?:de\s*emiss[ãa]o)?\s*:?\s*(\d{2}\/\d{2}\/\d{2,4})/i,
      /\b(\d{2}\/\d{2}\/\d{4})\b/,
    ]),
    validade: campoRotulado(linhas, /(?:prazo\s*de\s*)?valid(?:ade|o)(?:\s*d[ae]\s*proposta)?\s*:/i)
      ?? campo(inteiro, [/valid(?:ade|o)[^\n]{0,20}?(\d{1,3}\s*dias?[^\n]{0,12}|\d{2}\/\d{2}\/\d{2,4})/i]),
    prazo_entrega: campoRotulado(linhas, /prazo\s*(?:de\s*)?entrega\s*:/i)
      ?? campo(inteiro, [/entrega\s*:?\s*(\d{1,3}\s*dias?[^\n]{0,30})/i]),
    garantia: campoRotulado(linhas, /garantia\s*(?:de)?\s*:/i)
      ?? campo(inteiro, [
        /garantia\s+(?:de\s+)?(\d{1,3}\s*(?:meses|m[êe]s|anos?)[^\n]{0,40})/i,
        /(\d{1,3}\s*(?:meses|m[êe]s|anos?)\s+de\s+garantia[^\n]{0,40})/i,
      ]),
    // Só com dois-pontos: sem isso o cabeçalho de tabela ("Parc Dt Pag Form
    // Pag Valor R$") era lido como condição de pagamento.
    pagamento: campoRotulado(
      linhas,
      /(?:condi[çc][õo]es?\s*(?:de\s*|comerciais\s*)?(?:pagamento)?|forma\s*de\s*pagamento|pagamento)\s*:/i,
      /^(parc|dt pag|form pag|valor r\$)/i,
    ),
    frete: campoRotulado(linhas, /frete[^:\n]{0,25}:/i, /^total/i)
      ?? campo(inteiro, [/frete[^\n]{0,25}?\s((?:por conta|incluso|inclu[íi]do|cortesia|gr[áa]tis|c\.?i\.?f|f\.?o\.?b)[^\n]{0,40})/i]),
    total: null,
  };

  // Total impresso: a maior moeda numa linha que começa com "total".
  let total: number | null = null;
  for (let i = 0; i < linhas.length; i++) {
    const n = norm(linhas[i]);
    const ehTotal = /^\s*(?:valor\s+)?total\b/.test(n) || /total\s+(?:geral|da proposta|dos itens)/.test(n);
    if (!ehTotal) continue;
    const moedas = acharMoedas(linhas[i]);
    // Rótulo sozinho na linha (cabeçalho de rodapé "… Frete  Total da proposta"):
    // o número está na linha de baixo — pega o ÚLTIMO, que é o total geral.
    if (!moedas.length && linhas[i + 1]) {
      const abaixo = acharMoedas(linhas[i + 1]);
      if (abaixo.length) total = Math.max(total ?? 0, abaixo[abaixo.length - 1].valor);
      continue;
    }
    for (const m of moedas) total = Math.max(total ?? 0, m.valor);
  }

  const itens: LinhaOrcamento[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (ehRuido(linha)) continue;
    // Condição de pagamento tem vários valores e não é item.
    if (RE_PAGAMENTO_LINHA.test(linha)) continue;
    const moedas = acharMoedas(linha);
    if (!moedas.length) continue;

    // As duas ÚLTIMAS moedas são unitário e total — é a convenção de todas as
    // tabelas de orçamento. Pegar a primeira quebrava o layout que imprime a
    // quantidade com casas decimais ("UN  8,00  740,00  5.920,00").
    const uni = moedas.length >= 2 ? moedas[moedas.length - 2] : null;
    const tot = moedas[moedas.length - 1];
    const { qtd: qtdLida, trecho } = acharQtd(linha, moedas[0].inicio);

    let preco_un: number | null;
    let totalLinha: number | null;
    let qtd = qtdLida;
    let incerta = false;
    if (uni) {
      preco_un = uni.valor;
      totalLinha = tot.valor;
      // A quantidade sai da própria aritmética das colunas quando fecha certo.
      const razao = preco_un > 0 ? totalLinha / preco_un : 0;
      const arred = Math.round(razao);
      if (arred >= 1 && arred <= 999 && Math.abs(razao - arred) < 0.02) qtd = arred;
      else if (Math.abs(preco_un * qtdLida - totalLinha) > Math.max(1, totalLinha * 0.02)) incerta = true;
    } else {
      // Coluna única: o valor é o total da linha; o unitário é dedução.
      totalLinha = tot.valor;
      preco_un = qtd > 0 ? Math.round((totalLinha / qtd) * 100) / 100 : totalLinha;
      incerta = qtd > 1;
    }

    const cortes: [number, number][] = moedas.map((m) => [m.inicio, m.fim] as [number, number]);
    // Só apaga o trecho da quantidade se ele for mesmo a coluna QTD. Quando a
    // aritmética das colunas mandou outra quantidade, o que `acharQtd` achou
    // era medida da descrição ("CROMADA 1,20 UN") e precisa continuar lá.
    if (trecho && qtd === qtdLida) cortes.push(trecho);
    let descricao = limparDescricao(linha, cortes);

    // Descrição quebrada em duas linhas (layout com bloco por produto): o texto
    // fica acima e só o rabicho sobra junto do preço. Puxa a linha de cima.
    const letras = (t: string) => t.replace(/[^A-Za-zÀ-ÿ]/g, "").length;
    // Só um FRAGMENTO curto ("PRETA (60)", "UN", o resto de um SKU) puxa a
    // linha de cima. Com limite alto, item curto de verdade ("PUXADOR CORDA")
    // colava na sobra do item anterior.
    if (letras(descricao) < 12 && i > 0) {
      const acima = linhas[i - 1];
      if (acima && !ehRuido(acima) && !acharMoedas(acima).length && letras(acima) >= 12) {
        descricao = limparDescricao(`${acima} ${descricao}`, []);
      }
    }
    if (letras(descricao) < 3) continue;

    itens.push({
      id: `l${itens.length + 1}`,
      descricao,
      modelo: acharModelo(linha),
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
