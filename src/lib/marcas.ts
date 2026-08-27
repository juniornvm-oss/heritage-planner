// Apresentação das MARCAS do projeto — o parágrafo que responde "de quem é
// esse equipamento?" quando o síndico folheia o Dossiê.
//
// Os textos vêm de pesquisa em fontes públicas (site das marcas e imprensa
// especializada), escritos no mesmo tom do resto do documento: fato, sem
// adjetivo de vitrine. Marca fora desta base aparece só pelo nome — melhor
// do que inventar biografia; por isso várias entradas daqui têm `tipo` e
// nenhum `resumo`.
//
// A base local é o CHÃO, não o teto: a biblioteca do banco (planner.marcas,
// migração 018) sobrescreve marca a marca, campo a campo.

import type {
  Acabamento, AcessorioProjeto, AreaAcabamento, Cena, ElementoParede, Equipamento,
  ItemInfraestrutura, ItemInventario, ItemPosicionado, Marca, MarcaProjeto, TipoMarca,
} from "./types";
import { normalizar } from "./curadoria";

export const MARCAS_BASE: Marca[] = [
  {
    // "Movimente"/"Moviment" são grafias que aparecem em orçamento e catálogo.
    chaves: ["movement", "moviment", "movimente"],
    nome: "Movement",
    tipo: "equipamento",
    origem: "Brasil · Pompéia/SP",
    grupo: "Brudden",
    resumo:
      "Marca de equipamentos de ginástica do grupo Brudden, fundado em 1980 em Pompéia (SP), no mercado fitness desde 1987 — primeiro como Moviment, depois Movement. É uma das líderes nacionais do segmento, presente em grande parte das academias do país, com fabricação própria e rede de assistência técnica no Brasil. A linha de musculação EDGE recebeu o iF Design Award (2015), premiação internacional de design industrial.",
    fonte: "Site oficial da marca e imprensa especializada",
  },
  {
    chaves: ["nautilus"],
    nome: "Nautilus",
    tipo: "equipamento",
    origem: "Estados Unidos",
    grupo: "Core Health & Fitness",
    resumo:
      "Marca norte-americana criada por Arthur Jones, que patenteou em 1970 as primeiras máquinas de resistência variável por came — o desenho que ajustou a carga à curva de força do músculo e definiu o padrão das máquinas de musculação modernas. Hoje a linha comercial Nautilus pertence ao grupo Core Health & Fitness, o mesmo das marcas StairMaster, Star Trac e Schwinn.",
    fonte: "Site oficial da marca e imprensa especializada",
  },
  {
    chaves: ["stairmaster", "stair master"],
    nome: "StairMaster",
    tipo: "equipamento",
    origem: "Estados Unidos",
    grupo: "Core Health & Fitness",
    resumo:
      "Marca norte-americana especializada em simuladores de escada, criadora do StepMill — o aparelho de degraus rolantes contínuos. Pertence ao grupo Core Health & Fitness, o mesmo da Nautilus, Star Trac e Schwinn.",
    fonte: "Site oficial da marca e imprensa especializada",
  },
  {
    chaves: ["life fitness", "lifefitness"],
    nome: "Life Fitness",
    tipo: "equipamento",
    origem: "Estados Unidos · Franklin Park/IL",
    grupo: "Life Fitness",
    resumo:
      "Marca norte-americana de equipamentos de ginástica fundada em 1977, conhecida pelas esteiras e elípticos da linha Integrity e pelas máquinas de musculação Optima e Circuit. É uma das marcas mais presentes em academias comerciais no mundo, com assistência técnica e peças no Brasil.",
    fonte: "Site oficial da marca e imprensa especializada",
    site: "https://www.lifefitness.com",
  },
  {
    chaves: ["hammer strength", "hammerstrength"],
    nome: "Hammer Strength",
    tipo: "equipamento",
    origem: "Estados Unidos",
    grupo: "Life Fitness",
    resumo:
      "Linha de musculação de carga livre (plate loaded) do grupo Life Fitness, criada para o treino de força com anilhas e movimento independente por lado (Iso-Lateral). É a linha que costuma acompanhar a Life Fitness em academias que separam cardio guiado e peso livre.",
    fonte: "Site oficial da marca e imprensa especializada",
    site: "https://www.lifefitness.com",
  },
  {
    chaves: ["matrix"],
    nome: "Matrix",
    tipo: "equipamento",
    origem: "Estados Unidos · Cottage Grove/WI",
    grupo: "Johnson Health Tech",
    resumo:
      "Marca do grupo taiwanês Johnson Health Tech, com fabricação e sede comercial nos Estados Unidos. No segmento comercial é conhecida pelas esteiras da série T, pelo ClimbMill e pelas linhas Ultra e Versa de musculação guiada, com presença consolidada em academias e condomínios no Brasil.",
    fonte: "Site oficial da marca e imprensa especializada",
    site: "https://pt-br.matrixfitness.com",
  },
  {
    chaves: ["technogym", "tecnogym", "techno gym"],
    nome: "Technogym",
    tipo: "equipamento",
    origem: "Itália · Cesena",
    grupo: "Technogym",
    resumo:
      "Fabricante italiana fundada em 1983 em Cesena, fornecedora oficial de equipamentos de várias edições dos Jogos Olímpicos. No comercial brasileiro entram as linhas Excite (cardio), Selection (carga selecionada), Pure Strength (peso livre) e Skill (Skillmill e Skillrow).",
    fonte: "Site oficial da marca e imprensa especializada",
    site: "https://www.technogym.com",
  },
  // ── Acabamentos: as marcas que a biblioteca de acabamentos já usa como
  //    fornecedor (src/lib/seed.ts) e que nunca chegavam ao Dossiê ──────────
  {
    chaves: ["tarkett"],
    nome: "Tarkett",
    tipo: "acabamento",
    origem: "França",
    resumo:
      "Fabricante francesa de pisos e revestimentos, com sede em Paris e operação industrial no Brasil. No mercado brasileiro é conhecida pelos pisos vinílicos em manta e em régua para uso comercial, entre eles a linha Ambienta.",
    fonte: "Site oficial da marca",
  },
  {
    chaves: ["portobello"],
    nome: "Portobello",
    tipo: "acabamento",
    origem: "Brasil · Tijucas/SC",
    resumo:
      "Fabricante brasileira de porcelanatos e revestimentos cerâmicos, com sede e fábrica em Tijucas (SC). É uma das maiores do setor cerâmico no país e distribui por rede própria de lojas, a Portobello Shop.",
    fonte: "Site oficial da marca",
  },
  {
    chaves: ["suvinil"],
    nome: "Suvinil",
    tipo: "acabamento",
    origem: "Brasil · São Bernardo do Campo/SP",
    resumo:
      "Marca brasileira de tintas imobiliárias, fabricada em São Bernardo do Campo (SP) e por décadas parte do portfólio do grupo alemão BASF. Em 2025 a BASF anunciou a venda da marca para a norte-americana Sherwin-Williams.",
    fonte: "Site oficial da marca e comunicados das companhias (2025)",
  },
  {
    chaves: ["indusparquet", "indus parquet"],
    nome: "Indusparquet",
    tipo: "acabamento",
    origem: "Brasil · Tietê/SP",
    resumo:
      "Fabricante brasileira de pisos de madeira maciça e engenheirada, com fábrica em Tietê (SP). Trabalha com madeiras de reflorestamento e exporta parte relevante da produção.",
    fonte: "Site oficial da marca",
  },
  // Sem resumo de propósito: não tenho fato verificado sobre a origem e o
  // controle destas marcas, e biografia inventada num dossiê técnico é pior
  // do que ausência. Ficam aqui só para serem reconhecidas e classificadas.
  { chaves: ["alubond"], nome: "Alubond", tipo: "acabamento" },
  { chaves: ["plurigoma"], nome: "Plurigoma", tipo: "acabamento" },
  { chaves: ["krona"], nome: "Krona", tipo: "acabamento" },
];

/** Chave de casamento entre a marca detectada e o override do projeto
 *  (`MarcaProjeto.ref`). Quem grava o override tem de usar isto. */
export const refDaMarca = (nome: string): string => normalizar(nome);

/**
 * Texto que NÃO é marca: preenchimento de planilha e travessão de "sem
 * fornecedor". Sem esta peneira, "—" viraria uma marca do projeto.
 */
const SEM_MARCA = new Set([
  "", "-", "--", "---", "—", "–", "n/a", "na", "nd", "sem marca", "sem fornecedor",
  "nao informado", "a definir", "a especificar", "diversos", "varios", "generico",
  "propria", "propriao", "outro", "outros",
]);

/** Campos vazios do banco não podem apagar o texto da base local. */
function semVazios(m: Marca): Partial<Marca> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }
  return out as Partial<Marca>;
}

/**
 * Biblioteca efetiva de marcas: a base local por baixo, o banco por cima —
 * casadas pelo nome normalizado, campo a campo. Marca desativada (`ativo:
 * false`) sai da detecção; é como o consultor aposenta uma marca sem apagar
 * o texto que escreveu.
 */
export function bibliotecaDeMarcas(banco?: Marca[] | null): Marca[] {
  const porNome = new Map<string, Marca>();
  for (const m of MARCAS_BASE) porNome.set(refDaMarca(m.nome), m);
  for (const m of banco ?? []) {
    if (!m?.nome) continue;
    const k = refDaMarca(m.nome);
    const base = porNome.get(k);
    porNome.set(k, base ? { ...base, ...semVazios(m) } : m);
  }
  return [...porNome.values()].filter((m) => m.ativo !== false);
}

/** Marca da biblioteca cujo trecho aparece no texto (nome do item, fornecedor…).
 *  Marca cadastrada sem `chaves` é procurada pelo próprio nome. */
function acharNaBiblioteca(bib: Marca[], texto?: string | null): Marca | null {
  const n = normalizar(texto ?? "");
  if (!n) return null;
  for (const m of bib) {
    const chaves = (m.chaves?.length ? m.chaves : [m.nome]).map(normalizar).filter(Boolean);
    if (chaves.some((c) => n.includes(c))) return m;
  }
  return null;
}

/** Um campo de marca/fornecedor pode carregar duas ("Krona/Plurigoma"). */
function candidatos(texto?: string | null): string[] {
  return String(texto ?? "")
    .split(/[/,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !SEM_MARCA.has(normalizar(s)));
}

/**
 * Marca escrita dentro do NOME do item, depois do separador que os orçamentos
 * usam ("Esteira · Physicus F5" → "Physicus"). Para no primeiro pedaço com
 * dígito, que já é modelo. Sem o "·" não há palpite: garimpar marca dentro de
 * "Banco 0-90°" produziria fabricante inventado no Dossiê.
 */
function marcaSoltaNoNome(nome?: string | null): string | null {
  const partes = String(nome ?? "").split("·");
  if (partes.length < 2) return null;
  const palavras: string[] = [];
  for (const p of partes[partes.length - 1].trim().split(/\s+/)) {
    if (/\d/.test(p)) break;
    palavras.push(p);
    if (palavras.length === 2) break; // marca com mais de duas palavras é rara
  }
  const txt = palavras.join(" ").trim();
  return txt.length >= 3 && !SEM_MARCA.has(normalizar(txt)) ? txt : null;
}

/** De onde no projeto a marca apareceu. */
export type OrigemMarca = "equipamentos" | "acessorios" | "mobiliario" | "acabamentos" | "inventario";

export const ORIGENS_MARCA: OrigemMarca[] = ["equipamentos", "acessorios", "mobiliario", "acabamentos", "inventario"];

export const ROTULO_ORIGEM_MARCA: Record<OrigemMarca, { um: string; muitos: string }> = {
  equipamentos: { um: "equipamento", muitos: "equipamentos" },
  acessorios: { um: "acessório", muitos: "acessórios" },
  mobiliario: { um: "item de mobiliário", muitos: "itens de mobiliário" },
  acabamentos: { um: "área de acabamento", muitos: "áreas de acabamento" },
  inventario: { um: "item já no condomínio", muitos: "itens já no condomínio" },
};

const zerado = (): Record<OrigemMarca, number> =>
  ({ equipamentos: 0, acessorios: 0, mobiliario: 0, acabamentos: 0, inventario: 0 });

export interface MarcaDoProjeto {
  nome: string;
  origem?: string;
  resumo?: string;
  grupo?: string;
  tipo?: TipoMarca;
  site?: string;
  fonte?: string;
  logo?: string;
  cor?: string;
  garantia?: string;
  assistencia?: string;
  /** Observação do consultor para ESTE projeto (vem de `cena.marcas`). */
  nota?: string;
  /** Marca âncora — sai primeiro, com destaque. */
  destaque?: boolean;
  /** Está na biblioteca (base local ou banco): tem ficha, não é palpite. */
  conhecida: boolean;
  /** Quantos itens do projeto são da marca, POR ORIGEM. */
  por: Record<OrigemMarca, number>;
  /** Total de itens da marca, somando todas as origens. */
  n: number;
  /** A marca só aparece no inventário: já está no condomínio, não é compra. */
  soInventario: boolean;
}

/** "4 equipamentos · 2 áreas de acabamento" — a presença da marca em uma linha. */
export function presencaDaMarca(m: MarcaDoProjeto): string {
  return ORIGENS_MARCA
    .filter((o) => m.por[o] > 0)
    .map((o) => `${m.por[o]} ${m.por[o] === 1 ? ROTULO_ORIGEM_MARCA[o].um : ROTULO_ORIGEM_MARCA[o].muitos}`)
    .join(" · ");
}

/**
 * Marcas presentes no projeto, com o texto de apresentação quando a marca está
 * na biblioteca. Varre TUDO que o projeto especifica — equipamentos,
 * acessórios, mobiliário, acabamentos e o inventário do condomínio —, detecta
 * pela marca do catálogo, pelo fornecedor e, na falta dos dois, pelo nome do
 * item (os orçamentos escrevem a marca no nome: "Esteira · Movimente RT250").
 *
 * `biblioteca` é a lista do banco (planner.marcas) e é opcional: sem ela vale
 * a base local. `acabamentos` é o catálogo de revestimentos — a área pintada
 * na planta guarda só o nome do acabamento, e é o catálogo que sabe de quem
 * ele é.
 */
export function marcasDaCena(
  cena: Cena,
  catalogo?: Equipamento[],
  biblioteca?: Marca[] | null,
  acabamentos?: Acabamento[],
): MarcaDoProjeto[] {
  const bib = bibliotecaDeMarcas(biblioteca);

  const catId = new Map<string, Equipamento>();
  const catNome = new Map<string, Equipamento>();
  for (const e of catalogo ?? []) { if (e.id) catId.set(e.id, e); catNome.set(normalizar(e.nome), e); }

  const acabId = new Map<string, Acabamento>();
  const acabNome = new Map<string, Acabamento>();
  for (const a of acabamentos ?? []) { if (a.id) acabId.set(a.id, a); acabNome.set(normalizar(a.nome), a); }

  const achadas = new Map<string, MarcaDoProjeto>();

  function registrar(ficha: Marca | null, nomeCru: string, origem: OrigemMarca, qtd: number) {
    const nome = (ficha?.nome ?? nomeCru).trim();
    const chave = refDaMarca(nome);
    if (!chave || SEM_MARCA.has(chave)) return;
    let m = achadas.get(chave);
    if (!m) {
      m = {
        nome,
        origem: ficha?.origem ?? undefined,
        resumo: ficha?.resumo ?? undefined,
        grupo: ficha?.grupo ?? undefined,
        tipo: ficha?.tipo ?? undefined,
        site: ficha?.site ?? undefined,
        fonte: ficha?.fonte ?? undefined,
        logo: ficha?.logo ?? undefined,
        cor: ficha?.cor ?? undefined,
        garantia: ficha?.garantia ?? undefined,
        assistencia: ficha?.assistencia ?? undefined,
        conhecida: !!ficha,
        por: zerado(),
        n: 0,
        soInventario: false,
      };
      achadas.set(chave, m);
    }
    m.por[origem] += Math.max(1, Math.round(qtd) || 1);
  }

  /**
   * Onde a marca do item pode estar, em ordem de confiança: primeiro os campos
   * declarados (marca/fornecedor do cadastro), depois o nome. O primeiro campo
   * preenchido manda — se o cadastro diz a marca, o fornecedor não acrescenta.
   */
  function detectar(origem: OrigemMarca, qtd: number, campos: (string | null | undefined)[], nome?: string | null) {
    for (const campo of campos) {
      const partes = candidatos(campo);
      if (!partes.length) continue;
      // Marca fora da biblioteca entra pelo texto cru, sem ficha — melhor um
      // nome sem biografia do que a marca sumir do Dossiê.
      for (const parte of partes) registrar(acharNaBiblioteca(bib, parte), parte, origem, qtd);
      return;
    }
    const ficha = acharNaBiblioteca(bib, nome);
    if (ficha) { registrar(ficha, ficha.nome, origem, qtd); return; }
    // Sem cadastro nenhum, sobra o nome do item. Antes disto o item sem
    // catálogo era descartado — e como o seed grava marca=null, a seção do
    // Dossiê ficava sempre vazia no modo local.
    const solta = marcaSoltaNoNome(nome);
    if (solta) registrar(null, solta, origem, qtd);
  }

  for (const it of (cena.itens ?? []) as ItemPosicionado[]) {
    const cat = (it.equipamentoId ? catId.get(it.equipamentoId) : undefined) ?? catNome.get(normalizar(it.nome));
    detectar("equipamentos", 1, [cat?.marca, cat?.fornecedor], it.nome);
  }

  for (const ac of (cena.acessorios ?? []) as AcessorioProjeto[]) {
    detectar("acessorios", ac.qtd, [], ac.nome);
  }

  for (const inf of (cena.infra ?? []) as ItemInfraestrutura[]) {
    detectar("mobiliario", 1, [inf.fornecedor], inf.nome);
  }
  // Espelho, TV e ponto elétrico moram noutra lista, mas são o mesmo capítulo
  // do Dossiê ("Espelhos, parede & mobiliário") e o mesmo campo `fornecedor`.
  for (const el of (cena.elementosParede ?? []) as ElementoParede[]) {
    detectar("mobiliario", 1, [el.fornecedor], null);
  }

  for (const ar of (cena.acabamentos ?? []) as AreaAcabamento[]) {
    const cat = (ar.acabamentoId ? acabId.get(ar.acabamentoId) : undefined) ?? acabNome.get(normalizar(ar.nome));
    detectar("acabamentos", 1, [cat?.fornecedor], ar.nome);
  }

  for (const iv of (cena.inventario ?? []) as ItemInventario[]) {
    detectar("inventario", iv.qtd, [], iv.nome);
  }

  // ── Overrides do projeto (cena.marcas) ────────────────────────────────────
  const overrides = new Map<string, MarcaProjeto>();
  for (const o of cena.marcas ?? []) {
    if (o?.ref) overrides.set(refDaMarca(o.ref), o);
    if (o?.nome) overrides.set(refDaMarca(o.nome), o);
  }

  const lista: MarcaDoProjeto[] = [];
  const ordemManual = new Map<MarcaDoProjeto, number>();
  for (const [chave, m] of achadas) {
    m.n = ORIGENS_MARCA.reduce((s, o) => s + m.por[o], 0);
    m.soInventario = m.por.inventario > 0 && m.n === m.por.inventario;

    const ov = overrides.get(chave);
    if (ov) {
      if (ov.ocultar) continue;
      if (ov.nome?.trim()) m.nome = ov.nome.trim();
      // O texto escrito para ESTE projeto vence a biblioteca — é o consultor
      // dizendo algo que a ficha genérica não diz.
      if (ov.resumo?.trim()) m.resumo = ov.resumo.trim();
      if (ov.nota?.trim()) m.nota = ov.nota.trim();
      if (ov.destaque) m.destaque = true;
      if (typeof ov.ordem === "number") ordemManual.set(m, ov.ordem);
    }
    lista.push(m);
  }

  const posicao = (m: MarcaDoProjeto) => ordemManual.get(m) ?? Number.POSITIVE_INFINITY;
  return lista.sort((a, b) =>
    Number(!!b.destaque) - Number(!!a.destaque)
    || posicao(a) - posicao(b)
    // Marca já presente no condomínio desce: a vitrine é do que está sendo
    // especificado, não do que o síndico já tem.
    || Number(a.soInventario) - Number(b.soInventario)
    || Number(!!b.resumo) - Number(!!a.resumo)
    || b.n - a.n
    || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Marcas irmãs sob o mesmo controlador, na ordem em que a lista já vinha. */
export interface GrupoDeMarcas {
  /** Controlador ("Core Health & Fitness"); ausente quando a marca sai sozinha. */
  grupo?: string;
  /** "Core Health & Fitness — Nautilus, StairMaster" ou só o nome da marca. */
  rotulo: string;
  marcas: MarcaDoProjeto[];
}

/**
 * Agrupa por `grupo`. Grupo com uma marca só é desfeito: anunciar "grupo" de
 * uma marca solitária informa zero e ainda sugere um porte que não existe.
 */
export function agruparMarcas(marcas: MarcaDoProjeto[]): GrupoDeMarcas[] {
  const grupos = new Map<string, MarcaDoProjeto[]>();
  const ordem: string[] = [];
  for (const m of marcas) {
    const g = m.grupo?.trim() || ` ${m.nome}`; // chave única para quem não tem grupo
    if (!grupos.has(g)) { grupos.set(g, []); ordem.push(g); }
    grupos.get(g)!.push(m);
  }
  const out: GrupoDeMarcas[] = [];
  for (const g of ordem) {
    const membros = grupos.get(g)!;
    const sozinha = g.startsWith(" ") || membros.length < 2;
    if (sozinha) {
      for (const m of membros) out.push({ rotulo: m.nome, marcas: [m] });
    } else {
      out.push({ grupo: g, rotulo: `${g} — ${membros.map((m) => m.nome).join(", ")}`, marcas: membros });
    }
  }
  return out;
}
