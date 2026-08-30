/**
 * Organização espacial dos acessórios.
 *
 * Acessório não é equipamento: não tem footprint de treino. Mesmo assim ele
 * mora em algum lugar — ao lado do rack, na polia, no suporte de colchonetes.
 * Sem esse endereço, a lista da etapa vira o orçamento Heritage inteiro,
 * copiado de um projeto para o outro, e o Dossiê não diz ONDE aquilo entra.
 *
 * Aqui: (1) a família de cada item, (2) o que ESTE projeto realmente pede a
 * partir do layout e das regiões, (3) a âncora no espaço.
 */

import { areaPoligonoM2, pontoNoPoligono, type Ponto } from "./geometria";
import { baseDoNome, normalizar } from "./curadoria";
import {
  ACESSORIOS_CATALOGO, TIPOS_AREA,
  type AcessorioProjeto, type AncoraAcessorio, type AreaFuncional, type Cena,
  type FamiliaAcessorio, type ItemPosicionado, type TipoArea,
} from "./types";

export const FAMILIAS_ACESSORIO: Record<FamiliaAcessorio, {
  label: string; cor: string; glifo: string; descricao: string;
}> = {
  carga: {
    label: "Carga solta", cor: "#C07A3E", glifo: "⬤",
    descricao: "Anilhas e barras olímpicas — ficam no rack, no banco ou no suporte de anilhas.",
  },
  halteres: {
    label: "Halteres", cor: "#D8A657", glifo: "●●",
    descricao: "Dumbbells e o suporte deles — zona de peso livre.",
  },
  puxadores: {
    label: "Puxadores", cor: "#C9A227", glifo: "⊣",
    descricao: "Cabos e puxadores — ficam na estação de polia, não soltos na circulação.",
  },
  funcional: {
    label: "Funcional", cor: "#7FB77E", glifo: "◇",
    descricao: "Kettlebell, step, bola — área livre de solo, com suporte próprio.",
  },
  alongamento: {
    label: "Alongamento", cor: "#8B78BC", glifo: "▭",
    descricao: "Colchonetes e espaldar — fora do fluxo, guardados na vertical.",
  },
  guarda: {
    label: "Guarda", cor: "#8A8A8F", glifo: "▤",
    descricao: "Suportes que ocupam piso: anilhas, barras, colchonetes, puxadores.",
  },
};

const CHAVES_FAMILIA: Record<FamiliaAcessorio, string[]> = {
  carga: ["anilha", "barra olimpica", "barra olímpica", "barra cromada", "tipo w"],
  halteres: ["dumbbell", "halter"],
  puxadores: ["puxador", "pulley"],
  funcional: ["kettlebell", "step", "bola", "pilates", "elastico", "trx"],
  alongamento: ["colchonete", "espaldar", "tatame"],
  guarda: ["suporte", "kit puxador"],
};

function contemChave(nome: string, chave: string): boolean {
  const n = normalizar(nome);
  const c = normalizar(chave);
  for (let i = n.indexOf(c); i >= 0; i = n.indexOf(c, i + 1)) {
    if (i === 0 || !/[a-z0-9]/.test(n[i - 1])) return true;
  }
  return false;
}

export { contemChave };

/** O que um suporte / móvel de guarda armazena. */
export type PapelGuarda = "anilhas" | "barras" | "halteres" | "colchonetes" | "puxadores" | "bolas" | "kettlebells";

export function familiaDoNome(nome: string): FamiliaAcessorio {
  const n = normalizar(nome);
  if (contemChave(n, "suporte") || contemChave(n, "kit puxador")) return "guarda";
  let achada: FamiliaAcessorio = "guarda";
  let tam = 0;
  for (const [fam, chaves] of Object.entries(CHAVES_FAMILIA) as [FamiliaAcessorio, string[]][]) {
    if (fam === "guarda") continue;
    for (const c of chaves) {
      if (contemChave(n, c) && c.length > tam) { achada = fam; tam = c.length; }
    }
  }
  return achada;
}

export function defDoCatalogo(nome: string): (typeof ACESSORIOS_CATALOGO)[number] | undefined {
  const n = normalizar(nome);
  return ACESSORIOS_CATALOGO.find((c) => normalizar(c.nome) === n)
    ?? ACESSORIOS_CATALOGO.find((c) => n.includes(normalizar(c.nome)) || normalizar(c.nome).includes(n));
}

/** Footprint de guarda no piso, quando o item é um suporte. */
export function ocupaDoNome(nome: string): { w_cm: number; h_cm: number } | null {
  const fam = familiaDoNome(nome);
  if (fam !== "guarda") return null;
  const n = normalizar(nome);
  if (contemChave(n, "dumbbell") || contemChave(n, "halter")) return { w_cm: 160, h_cm: 50 };
  if (contemChave(n, "anilha")) return { w_cm: 70, h_cm: 70 };
  if (contemChave(n, "barra")) return { w_cm: 90, h_cm: 40 };
  if (contemChave(n, "colchonete")) return { w_cm: 80, h_cm: 45 };
  if (contemChave(n, "puxador")) return { w_cm: 45, h_cm: 45 };
  if (contemChave(n, "bola")) return { w_cm: 75, h_cm: 45 };
  if (contemChave(n, "kettlebell")) return { w_cm: 120, h_cm: 45 };
  return { w_cm: 60, h_cm: 40 };
}

// ── O que o projeto tem, em sinais ──────────────────────────────────────────

export interface SinaisAcessorio {
  nRack: number;
  nBancoLivre: number;
  nPolia: number;
  nHalter: number;
  nFuncional: number;
  nAlong: number;
  areaPesoLivre: AreaFuncional | null;
  areaFuncional: AreaFuncional | null;
  areaAlongamento: AreaFuncional | null;
  jaTemEspaldarParede: boolean;
  jaTemSuporteColchoneteParede: boolean;
  itemRack: ItemPosicionado | null;
  itemPolia: ItemPosicionado | null;
  itemHalter: ItemPosicionado | null;
  /** Pontas / ganchos já no layout (rack, smith, árvore, estante). */
  slotsAnilha: number;
  slotsBarra: number;
  slotsHalterPar: number;
  slotsColchonete: number;
  slotsPuxador: number;
  fontesGuarda: string[];
  /** Acessórios reaproveitados do inventário (não comprar de novo). */
  nomesInventario: string[];
}

const CHAVES_RACK = ["rack", "gaiola", "smith", "agachamento", "hack"];
const CHAVES_BANCO = ["banco supino", "supino reto", "banco reto", "banco declinado", "banco inclinado"];
const CHAVES_POLIA = ["puxada", "remada", "crossover", "cross over", "polia", "pulley", "cable"];
const CHAVES_HALTER_EQ = ["estante", "dumbbell", "halter", "torre"];
const CHAVES_FUNC_EQ = ["funcional", "kettlebell", "trx", "battle", "corda naval"];
const CHAVES_ALONG_EQ = ["colchonete", "espaldar", "tatame"];
const CHAVES_CARGA_PLACA = ["iso-lateral", "hammer", "leg press", "hack", "squat machine", "elevacao pelvica", "elevação pélvica"];

/** Papel de guarda pelo nome — layout (estante/torre) ou acessório (suporte). */
export function papelGuardaDoNome(nome: string): PapelGuarda | null {
  const n = nome;
  const temSuporte = contemChave(n, "suporte") || /c\/\s*suporte/i.test(n) || contemChave(n, "kit puxador");
  if (contemChave(n, "anilha") && (temSuporte || contemChave(n, "arvore") || contemChave(n, "árvore") || contemChave(n, "estante"))) {
    return "anilhas";
  }
  if (contemChave(n, "barra") && temSuporte) return "barras";
  if ((contemChave(n, "dumbbell") || contemChave(n, "halter")) && (temSuporte || contemChave(n, "estante") || contemChave(n, "torre"))) {
    return "halteres";
  }
  if (contemChave(n, "estante") || contemChave(n, "torre")) return "halteres";
  if (contemChave(n, "colchonete") && (temSuporte || !contemChave(n, "emborrachado"))) return "colchonetes";
  if (temSuporte && contemChave(n, "puxador")) return "puxadores";
  if (temSuporte && contemChave(n, "bola")) return "bolas";
  if ((temSuporte || contemChave(n, "rack")) && contemChave(n, "kettlebell")) return "kettlebells";
  return null;
}

function slotsDoItemLayout(it: ItemPosicionado): Partial<Record<PapelGuarda, number>> {
  const papel = papelGuardaDoNome(it.nome);
  const out: Partial<Record<PapelGuarda, number>> = {};
  if (papel === "halteres") {
    const comprido = Math.max(it.w_cm, it.h_cm) >= 180;
    out.halteres = contemChave(it.nome, "torre") && !comprido ? 10 : comprido ? 20 : 10;
  }
  if (papel === "anilhas") out.anilhas = 8;
  if (papel === "barras") out.barras = 9;
  if (papel === "colchonetes") out.colchonetes = 10;
  if (papel === "puxadores") out.puxadores = 8;
  if (papel === "bolas") out.bolas = 3;
  if (papel === "kettlebells") out.kettlebells = 12;
  const base = baseDoNome(it.nome)?.nome ?? it.nome;
  const eRack = CHAVES_RACK.some((c) => contemChave(it.nome, c) || contemChave(base, c));
  if (eRack) {
    out.anilhas = (out.anilhas ?? 0) + 8;
    out.barras = (out.barras ?? 0) + 2;
  } else if (CHAVES_CARGA_PLACA.some((c) => contemChave(it.nome, c) || contemChave(base, c))) {
    out.anilhas = (out.anilhas ?? 0) + 4;
  }
  return out;
}

function contaItens(itens: ItemPosicionado[], chaves: string[]): { n: number; primeiro: ItemPosicionado | null } {
  let n = 0;
  let primeiro: ItemPosicionado | null = null;
  for (const it of itens) {
    const base = baseDoNome(it.nome)?.nome ?? it.nome;
    if (chaves.some((c) => contemChave(it.nome, c) || contemChave(base, c))) {
      n++;
      if (!primeiro) primeiro = it;
    }
  }
  return { n, primeiro };
}

function areaDoTipo(areas: AreaFuncional[] | undefined, tipos: TipoArea[]): AreaFuncional | null {
  for (const t of tipos) {
    const a = (areas ?? []).find((x) => x.tipo === t);
    if (a) return a;
  }
  return null;
}

export function sinaisDoProjeto(cena: Cena): SinaisAcessorio {
  const itens = cena.itens ?? [];
  const rack = contaItens(itens, CHAVES_RACK);
  const banco = contaItens(itens, CHAVES_BANCO);
  const polia = contaItens(itens, CHAVES_POLIA);
  const halter = contaItens(itens, CHAVES_HALTER_EQ);
  const func = contaItens(itens, CHAVES_FUNC_EQ);
  const along = contaItens(itens, CHAVES_ALONG_EQ);
  const paredes = cena.elementosParede ?? [];
  let slotsAnilha = 0, slotsBarra = 0, slotsHalterPar = 0, slotsColchonete = 0, slotsPuxador = 0;
  const fontesGuarda: string[] = [];
  for (const it of itens) {
    const sl = slotsDoItemLayout(it);
    if (sl.anilhas) { slotsAnilha += sl.anilhas; fontesGuarda.push(it.nome); }
    if (sl.barras) { slotsBarra += sl.barras; if (!fontesGuarda.includes(it.nome)) fontesGuarda.push(it.nome); }
    if (sl.halteres) { slotsHalterPar += sl.halteres; if (!fontesGuarda.includes(it.nome)) fontesGuarda.push(it.nome); }
    if (sl.colchonetes) { slotsColchonete += sl.colchonetes; if (!fontesGuarda.includes(it.nome)) fontesGuarda.push(it.nome); }
    if (sl.puxadores) { slotsPuxador += sl.puxadores; if (!fontesGuarda.includes(it.nome)) fontesGuarda.push(it.nome); }
  }
  if (paredes.some((e) => e.tipo === "colchonetes")) {
    slotsColchonete += 10;
    fontesGuarda.push("suporte de colchonetes na parede");
  }
  const nomesInventario = (cena.inventario ?? [])
    .filter((i) => i.destino === "reaproveitado")
    .map((i) => i.nome);
  return {
    nRack: rack.n,
    nBancoLivre: banco.n,
    nPolia: polia.n,
    nHalter: halter.n,
    nFuncional: func.n,
    nAlong: along.n,
    areaPesoLivre: areaDoTipo(cena.areas, ["peso_livre", "articulados"]),
    areaFuncional: areaDoTipo(cena.areas, ["funcional"]),
    areaAlongamento: areaDoTipo(cena.areas, ["alongamento"]),
    jaTemEspaldarParede: paredes.some((e) => e.tipo === "espaldar"),
    jaTemSuporteColchoneteParede: paredes.some((e) => e.tipo === "colchonetes") || slotsColchonete > 0,
    itemRack: rack.primeiro,
    itemPolia: polia.primeiro,
    itemHalter: halter.primeiro,
    slotsAnilha,
    slotsBarra,
    slotsHalterPar,
    slotsColchonete,
    slotsPuxador,
    fontesGuarda,
    nomesInventario,
  };
}

export function projetoPedeFamilia(s: SinaisAcessorio, fam: FamiliaAcessorio): boolean {
  switch (fam) {
    case "carga": return s.nRack > 0 || s.nBancoLivre > 0 || !!s.areaPesoLivre;
    case "halteres": return s.nHalter > 0 || !!s.areaPesoLivre || s.nRack > 0;
    case "puxadores": return s.nPolia > 0;
    case "funcional": return s.nFuncional > 0 || !!s.areaFuncional;
    case "alongamento": return s.nAlong > 0 || !!s.areaAlongamento;
    case "guarda": return projetoPedeFamilia(s, "carga") || projetoPedeFamilia(s, "halteres")
      || projetoPedeFamilia(s, "puxadores") || projetoPedeFamilia(s, "alongamento")
      || projetoPedeFamilia(s, "funcional");
  }
}

/** Família que o suporte SERVE — guarda de anilhas só entra se o projeto pede carga. */
export function familiaServida(nome: string, familia?: FamiliaAcessorio | null): FamiliaAcessorio {
  const fam = familia ?? familiaDoNome(nome);
  if (fam !== "guarda") return fam;
  const n = normalizar(nome);
  if (contemChave(n, "anilha") || contemChave(n, "barra")) return "carga";
  if (contemChave(n, "dumbbell") || contemChave(n, "halter")) return "halteres";
  if (contemChave(n, "colchonete")) return "alongamento";
  if (contemChave(n, "puxador")) return "puxadores";
  if (contemChave(n, "bola") || contemChave(n, "kettlebell")) return "funcional";
  return fam;
}

export function catalogoRelevante(cena: Cena): typeof ACESSORIOS_CATALOGO {
  const s = sinaisDoProjeto(cena);
  const temSinal = s.nRack + s.nBancoLivre + s.nPolia + s.nHalter + s.nFuncional + s.nAlong > 0
    || !!(s.areaPesoLivre || s.areaFuncional || s.areaAlongamento);
  if (!temSinal) return [];
  return ACESSORIOS_CATALOGO.filter((c) => projetoPedeFamilia(s, familiaServida(c.nome, c.familia)));
}

// ── Âncora ──────────────────────────────────────────────────────────────────

export function centroDoItem(it: ItemPosicionado): Ponto {
  return { x: it.x_cm + it.w_cm / 2, y: it.y_cm + it.h_cm / 2 };
}

export function centroDaArea(a: AreaFuncional): Ponto {
  if (a.pontos?.length) {
    const sx = a.pontos.reduce((t, p) => t + p.x, 0);
    const sy = a.pontos.reduce((t, p) => t + p.y, 0);
    return { x: sx / a.pontos.length, y: sy / a.pontos.length };
  }
  return { x: a.x_cm + a.w_cm / 2, y: a.y_cm + a.h_cm / 2 };
}

export function ancoraParaFamilia(fam: FamiliaAcessorio, cena: Cena): AncoraAcessorio | null {
  const s = sinaisDoProjeto(cena);
  const item = fam === "puxadores" ? s.itemPolia
    : fam === "halteres" ? (s.itemHalter ?? s.itemRack)
    : fam === "carga" || fam === "guarda" ? (s.itemRack ?? s.itemHalter ?? s.itemPolia)
    : fam === "funcional" ? null
    : fam === "alongamento" ? null
    : s.itemRack;
  if (item) return { tipo: "item", id: item.id };
  const area = fam === "funcional" ? s.areaFuncional
    : fam === "alongamento" ? s.areaAlongamento
    : fam === "puxadores" ? areaDoTipo(cena.areas, ["musculacao", "bateria"])
    : (s.areaPesoLivre ?? s.areaFuncional ?? s.areaAlongamento);
  if (area) return { tipo: "area", id: area.id };
  return null;
}

export function ancoraNoPonto(cena: Cena, p: Ponto): AncoraAcessorio {
  let melhor: { it: ItemPosicionado; d: number } | null = null;
  for (const it of cena.itens ?? []) {
    const c = centroDoItem(it);
    const dentro = p.x >= it.x_cm && p.x <= it.x_cm + it.w_cm && p.y >= it.y_cm && p.y <= it.y_cm + it.h_cm;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (dentro || d < 80) {
      if (!melhor || (dentro && melhor.d > 0) || d < melhor.d) melhor = { it, d: dentro ? 0 : d };
    }
  }
  if (melhor) return { tipo: "item", id: melhor.it.id };
  for (const a of cena.areas ?? []) {
    if (a.pontos?.length >= 3 && pontoNoPoligono(p, a.pontos)) return { tipo: "area", id: a.id };
  }
  return { tipo: "ponto", x_cm: Math.round(p.x), y_cm: Math.round(p.y) };
}

export function posicaoDaAncora(ancora: AncoraAcessorio | null | undefined, cena: Cena): Ponto | null {
  if (!ancora) return null;
  if (ancora.tipo === "ponto") {
    if (ancora.x_cm == null || ancora.y_cm == null) return null;
    return { x: ancora.x_cm, y: ancora.y_cm };
  }
  if (ancora.tipo === "item" && ancora.id) {
    const it = (cena.itens ?? []).find((i) => i.id === ancora.id);
    if (!it) return null;
    const c = centroDoItem(it);
    // Um pouco à frente da peça, para o pino não cobrir o equipamento.
    return { x: c.x, y: it.y_cm + it.h_cm + 18 };
  }
  if (ancora.tipo === "area" && ancora.id) {
    const a = (cena.areas ?? []).find((x) => x.id === ancora.id);
    return a ? centroDaArea(a) : null;
  }
  if (ancora.tipo === "infra" && ancora.id) {
    const inf = (cena.infra ?? []).find((x) => x.id === ancora.id);
    if (!inf) return null;
    return { x: inf.x_cm + inf.w_cm / 2, y: inf.y_cm + inf.h_cm / 2 };
  }
  return null;
}

export function posicaoDoAcessorio(a: AcessorioProjeto, cena: Cena): Ponto | null {
  if (a.x_cm != null && a.y_cm != null) {
    const w = a.w_cm ?? 0, h = a.h_cm ?? 0;
    return { x: a.x_cm + w / 2, y: a.y_cm + h / 2 };
  }
  return posicaoDaAncora(a.ancora, cena);
}

export function rotuloDaAncora(ancora: AncoraAcessorio | null | undefined, cena: Cena): string {
  if (!ancora) return "Sem lugar na planta";
  if (ancora.tipo === "item" && ancora.id) {
    const it = (cena.itens ?? []).find((i) => i.id === ancora.id);
    return it ? `Junto de ${it.nome}` : "Equipamento removido";
  }
  if (ancora.tipo === "area" && ancora.id) {
    const ar = (cena.areas ?? []).find((x) => x.id === ancora.id);
    if (!ar) return "Região removida";
    return ar.nome?.trim() || TIPOS_AREA[ar.tipo]?.label || "Região";
  }
  if (ancora.tipo === "infra" && ancora.id) {
    const inf = (cena.infra ?? []).find((x) => x.id === ancora.id);
    return inf ? inf.nome : "Mobiliário removido";
  }
  if (ancora.tipo === "ponto") return "Ponto na planta";
  return "Sem lugar na planta";
}

export interface GrupoAcessorio {
  chave: string;
  titulo: string;
  itens: AcessorioProjeto[];
}

export function agruparPorLugar(acessorios: AcessorioProjeto[], cena: Cena): GrupoAcessorio[] {
  const mapa = new Map<string, GrupoAcessorio>();
  const ordem: string[] = [];
  for (const a of acessorios) {
    const chave = a.ancora
      ? `${a.ancora.tipo}:${a.ancora.id ?? `${a.ancora.x_cm},${a.ancora.y_cm}`}`
      : "solto";
    let g = mapa.get(chave);
    if (!g) {
      g = { chave, titulo: rotuloDaAncora(a.ancora, cena), itens: [] };
      mapa.set(chave, g);
      ordem.push(chave);
    }
    g.itens.push(a);
  }
  // Soltos no fim: o Dossiê começa pelo que já tem endereço.
  return ordem
    .map((k) => mapa.get(k)!)
    .sort((a, b) => Number(a.chave === "solto") - Number(b.chave === "solto")
      || a.titulo.localeCompare(b.titulo, "pt-BR"));
}

// ── Organizar / sugerir ─────────────────────────────────────────────────────

function pesoDaAnilha(nome: string): number | null {
  const m = normalizar(nome).match(/(?:anilha).*?(\d+(?:[.,]\d+)?)\s*kg/);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/** Distribui a carga pelo uso real: anilhas pesadas ficam nas máquinas
 * plate-loaded; as leves permanecem no rack central de barras/pesos livres. */
function ancoraDaAnilha(a: AcessorioProjeto, cena: Cena): AncoraAcessorio | null {
  const peso = pesoDaAnilha(a.nome);
  if (peso == null) return null;
  const itens = cena.itens ?? [];
  const pesadas = ["leg press", "hack", "iso-lateral", "articulad", "squat", "elevacao pelvica", "elevação pélvica"];
  const centrais = ["power rack", "gaiola", "smith", "suporte de anilha", "arvore", "árvore"];
  const chaves = peso >= 10 ? pesadas : centrais;
  const alvo = itens.find((it) => chaves.some((c) => contemChave(it.nome, c)));
  return alvo ? { tipo: "item", id: alvo.id } : null;
}

function ancoraDe(a: AcessorioProjeto, cena: Cena): AncoraAcessorio | null {
  const fam = a.familia ?? familiaDoNome(a.nome);
  if (fam === "carga") {
    const especifica = ancoraDaAnilha(a, cena);
    if (especifica) return especifica;
  }
  return ancoraParaFamilia(fam, cena);
}

function posicaoInicial(a: AcessorioProjeto, ancora: AncoraAcessorio | null, cena: Cena): { x_cm?: number; y_cm?: number } {
  const ocupa = a.w_cm && a.h_cm ? { w_cm: a.w_cm, h_cm: a.h_cm } : ocupaDoNome(a.nome);
  const p = posicaoDaAncora(ancora, cena);
  if (!p) return {};
  if (ocupa) {
    return { x_cm: Math.round(p.x - ocupa.w_cm / 2), y_cm: Math.round(p.y - ocupa.h_cm / 2) };
  }
  return { x_cm: Math.round(p.x), y_cm: Math.round(p.y) };
}

/** Preenche família, âncora e posição nos itens que ainda não têm endereço. */
export function organizarAcessorios(lista: AcessorioProjeto[], cena: Cena): AcessorioProjeto[] {
  const usados = new Map<string, number>();
  return lista.map((a) => {
    const familia = a.familia ?? familiaDoNome(a.nome);
    const ancora = a.ancora ?? ancoraDe({ ...a, familia }, cena);
    const ocupa = ocupaDoNome(a.nome);
    const pos = (a.x_cm != null && a.y_cm != null)
      ? { x_cm: a.x_cm, y_cm: a.y_cm }
      : posicaoInicial({ ...a, familia, w_cm: a.w_cm ?? ocupa?.w_cm, h_cm: a.h_cm ?? ocupa?.h_cm }, ancora, cena);
    // Vários itens no mesmo ponto: espalha um pouco para o pino não empilhar.
    const chave = ancora ? `${ancora.tipo}:${ancora.id ?? "p"}` : "solto";
    const n = usados.get(chave) ?? 0;
    usados.set(chave, n + 1);
    const dx = (n % 3) * 22;
    const dy = Math.floor(n / 3) * 22;
    return {
      ...a,
      familia,
      ancora,
      ...(ocupa && !a.w_cm ? ocupa : {}),
      ...(pos.x_cm != null ? { x_cm: pos.x_cm + dx, y_cm: (pos.y_cm ?? 0) + dy } : {}),
    };
  });
}

export interface SugestaoAcessorio {
  nome: string;
  qtd: number;
  preco_un: number;
  familia: FamiliaAcessorio;
  motivo: string;
}

export interface DiagnosticoGuarda {
  puxadores: number;
  vagasPuxadores: number;
  puxadoresSemLugar: number;
  bolas: number;
  temSuporteBolas: boolean;
  kettlebells: number;
  temRackKettlebells: boolean;
}

/** Contagem objetiva para o consultor decidir a guarda antes de apresentar. */
export function diagnosticoGuarda(cena: Cena): DiagnosticoGuarda {
  const s = sinaisDoProjeto(cena);
  const lista = cena.acessorios ?? [];
  const qtd = (teste: (nome: string) => boolean) => lista
    .filter((a) => !a.incluso && teste(a.nome))
    .reduce((t, a) => t + Math.max(1, a.qtd), 0);
  const puxadores = qtd((n) => familiaDoNome(n) === "puxadores");
  const suportePuxador = lista.filter((a) => papelGuardaDoNome(a.nome) === "puxadores")
    .reduce((t, a) => t + 8 * Math.max(1, a.qtd), 0);
  const bolas = qtd((n) => familiaDoNome(n) === "funcional" && contemChave(n, "bola"));
  const kettlebells = qtd((n) => familiaDoNome(n) === "funcional" && contemChave(n, "kettlebell"));
  return {
    puxadores,
    vagasPuxadores: s.slotsPuxador + suportePuxador,
    puxadoresSemLugar: Math.max(0, puxadores - s.slotsPuxador - suportePuxador),
    bolas,
    temSuporteBolas: lista.some((a) => papelGuardaDoNome(a.nome) === "bolas"),
    kettlebells,
    temRackKettlebells: lista.some((a) => papelGuardaDoNome(a.nome) === "kettlebells"),
  };
}

function cat(nomeParte: string): (typeof ACESSORIOS_CATALOGO)[number] | undefined {
  const n = normalizar(nomeParte);
  return ACESSORIOS_CATALOGO.find((c) => normalizar(c.nome).includes(n));
}

function jaTemNoInventario(s: SinaisAcessorio, nome: string): boolean {
  const n = normalizar(nome);
  return s.nomesInventario.some((x) => {
    const nx = normalizar(x);
    return nx === n || nx.includes(n) || n.includes(nx);
  });
}

function pushCat(out: SugestaoAcessorio[], parte: string, qtd: number, motivo: string) {
  const c = cat(parte);
  if (!c) return;
  if (out.some((s) => s.nome === c.nome)) return;
  out.push({
    nome: c.nome,
    qtd: Math.max(1, qtd),
    preco_un: c.preco,
    familia: c.familia ?? familiaDoNome(c.nome),
    motivo,
  });
}

/**
 * O que ESTE projeto pede. Não é o catálogo Heritage: é a interseção do
 * catálogo com o que já está no layout e nas regiões — sem duplicar a guarda
 * que a planta já tem (estante, torre, chifres do rack, suporte de colchonete).
 */
export function sugerirAcessorios(cena: Cena): SugestaoAcessorio[] {
  const s = sinaisDoProjeto(cena);
  const out: SugestaoAcessorio[] = [];

  if (s.nRack > 0 || s.nBancoLivre > 0 || s.areaPesoLivre) {
    const n = Math.max(1, s.nRack + Math.min(1, s.nBancoLivre));
    const motivo = s.nRack
      ? `${s.nRack} ${s.nRack === 1 ? "rack" : "racks"} de carga solta no layout`
      : s.nBancoLivre
        ? `${s.nBancoLivre} ${s.nBancoLivre === 1 ? "banco" : "bancos"} de supino no layout`
        : `região ${s.areaPesoLivre ? (TIPOS_AREA[s.areaPesoLivre.tipo].label) : "de peso livre"}`;
    pushCat(out, "anilha olímpica bv 20", Math.max(4, 4 * n), motivo);
    pushCat(out, "anilha olímpica bv 10", Math.max(4, 4 * n), motivo);
    pushCat(out, "anilha olímpica bv 5", Math.max(6, 4 * n), motivo);
    pushCat(out, "anilha olímpica bv 2,5", 4, motivo);
    if (s.nRack > 0) {
      pushCat(out, "barra olímpica cromada 2,20", Math.max(2, s.nRack), motivo);
    }
    if (s.nBancoLivre > 0) pushCat(out, "barra olímpica cromada 1,20", 1, "barra curta do banco de supino");
    pushCat(out, "barra olímpica cromada tipo w", 1, motivo);
    if (s.slotsAnilha < 8) {
      pushCat(out, "suporte para anilhas 8 pontas", 1, "anilhas fora do chão");
    }
    if (s.slotsBarra < 2) {
      pushCat(out, "suporte para 9 barras", 1, "guarda das barras");
    }
  }

  if (s.nHalter > 0 || s.areaPesoLivre) {
    const motivo = s.nHalter
      ? "já há estante/torre no layout — falta o jogo"
      : "região de peso livre sem jogo de halteres orçado";
    pushCat(out, "dumbbell emborrachado", 1, motivo);
    if (s.slotsHalterPar < 10) {
      pushCat(out, "suporte de dumbbell 10 pares", 1, "guarda dos halteres");
      pushCat(out, "conjunto halteres sextavados", 1, motivo);
    }
  }

  if (s.nPolia > 0) {
    const motivo = `${s.nPolia} ${s.nPolia === 1 ? "estação" : "estações"} de polia no layout`;
    if (s.slotsPuxador < 8) pushCat(out, "kit puxador ultra", 1, motivo);
    if (s.nPolia >= 2) {
      pushCat(out, "puxador corda", s.nPolia, motivo);
      pushCat(out, "puxador reto", s.nPolia, motivo);
      pushCat(out, "puxador triângulo", 1, motivo);
    }
  }

  if (s.nFuncional > 0 || s.areaFuncional) {
    const motivo = s.areaFuncional
      ? `região ${s.areaFuncional.nome?.trim() || "Funcional"}`
      : "equipamento funcional no layout";
    pushCat(out, "kettlebell (8", 1, motivo);
    pushCat(out, "step eva", 2, motivo);
    pushCat(out, "bola pilates", 1, motivo);
    pushCat(out, "suporte vertical para 3 bolas", 1, "bola suíça não pode ficar solta na sala");
    pushCat(out, "rack para kettlebells", 1, "kettlebells organizados fora do piso");
  }

  if (s.nAlong > 0 || s.areaAlongamento) {
    const m2 = s.areaAlongamento ? areaPoligonoM2(s.areaAlongamento.pontos) : 8;
    const qtd = Math.min(12, Math.max(4, Math.round(m2 / 1.2)));
    const motivo = s.areaAlongamento
      ? `região de alongamento · ${m2.toFixed(1)} m²`
      : "colchonete/espaldar já no layout";
    pushCat(out, "colchonete emborrachado", qtd, motivo);
    if (!s.jaTemSuporteColchoneteParede && s.slotsColchonete < 6 && qtd >= 6) {
      pushCat(out, "suporte para 10 colchonetes", 1, "colchonetes no chão viram obstáculo");
    }
    if (!s.jaTemEspaldarParede && !s.nAlong) {
      pushCat(out, "espaldar alumínio", 1, motivo);
    }
  }

  return out.filter((x) => !jaTemNoInventario(s, x.nome));
}

export function custoAcessorio(a: AcessorioProjeto): number {
  if (a.incluso) return 0;
  return a.qtd * a.preco_un;
}

/**
 * Marca como `incluso` a guarda que o layout (ou o inventário) já cobre —
 * anilhas no chifre do rack, halteres na estante/torre, colchonetes no suporte
 * da planta — para o orçamento não pagar duas vezes o mesmo lugar.
 */
export function reconciliarAcessorios(lista: AcessorioProjeto[], cena: Cena): AcessorioProjeto[] {
  const s = sinaisDoProjeto(cena);
  const vistos = new Set<PapelGuarda>();
  return lista.map((a) => {
    const chave = normalizar(a.nome);
    if (jaTemNoInventario(s, a.nome)) {
      const inv = (cena.inventario ?? []).find((i) => i.destino === "reaproveitado" && (
        normalizar(i.nome) === chave || chave.includes(normalizar(i.nome)) || normalizar(i.nome).includes(chave)
      ));
      return {
        ...a,
        incluso: true,
        origemInventarioId: inv?.id ?? a.origemInventarioId,
        obs: a.obs || `reaproveitado do inventário${inv ? ` (${inv.nome})` : ""}`,
      };
    }
    const papel = papelGuardaDoNome(a.nome);
    if (!papel) return { ...a, incluso: false };
    // Conjunto de carga + suporte: o jogo ainda se compra; só o móvel duplica.
    if (contemChave(a.nome, "conjunto")) return { ...a, incluso: false };
    if (vistos.has(papel)) {
      return { ...a, incluso: true, obs: a.obs || "duplicata na lista — a guarda já foi lançada" };
    }
    vistos.add(papel);
    const noLayout = papel === "anilhas" ? s.slotsAnilha >= 8
      : papel === "barras" ? s.slotsBarra >= 2
      : papel === "halteres" ? s.slotsHalterPar >= 10
      : papel === "colchonetes" ? s.slotsColchonete >= 6
      : papel === "puxadores" ? s.slotsPuxador >= 8
      : papel === "bolas" ? false
      : papel === "kettlebells" ? false
      : false;
    if (!noLayout) return { ...a, incluso: false };
    const fonte = s.fontesGuarda[0];
    return {
      ...a,
      incluso: true,
      obs: a.obs || (fonte ? `incluso no layout (${fonte})` : "incluso no layout"),
    };
  });
}

/** Junta a lista atual com as sugestões, sem duplicar nome, e ancora no espaço. */
export function mesclarSugestoes(atuais: AcessorioProjeto[], cena: Cena, novoId: () => string): AcessorioProjeto[] {
  const nomes = new Set(atuais.map((a) => normalizar(a.nome)));
  const extra: AcessorioProjeto[] = [];
  for (const s of sugerirAcessorios(cena)) {
    if (nomes.has(normalizar(s.nome))) continue;
    nomes.add(normalizar(s.nome));
    extra.push({
      id: novoId(),
      nome: s.nome,
      qtd: s.qtd,
      preco_un: s.preco_un,
      familia: s.familia,
      obs: s.motivo,
    });
  }
  return organizarAcessorios(reconciliarAcessorios([...atuais, ...extra], cena), cena);
}

export function acessorioDoCatalogo(nome: string, novoId: () => string): AcessorioProjeto {
  const c = defDoCatalogo(nome);
  const familia = c?.familia ?? familiaDoNome(nome);
  const ocupa = ocupaDoNome(c?.nome ?? nome);
  return {
    id: novoId(),
    nome: c?.nome ?? nome,
    qtd: c?.qtd ?? 1,
    preco_un: c?.preco ?? 0,
    familia,
    ...(ocupa ?? {}),
  };
}
