// Apresentação das MARCAS do projeto — o parágrafo que responde "de quem é
// esse equipamento?" quando o síndico folheia o Dossiê.
//
// Os textos vêm de pesquisa em fontes públicas (site das marcas e imprensa
// especializada), escritos no mesmo tom do resto do documento: fato, sem
// adjetivo de vitrine. Marca fora desta base aparece só pelo nome — melhor
// do que inventar biografia.

import type { Cena, Equipamento, ItemPosicionado } from "./types";
import { normalizar } from "./curadoria";

export interface MarcaInfo {
  /** Trechos que identificam a marca em nomes/campos (minúsculo, sem acento). */
  chaves: string[];
  nome: string;
  origem: string;
  /** 2–3 frases factuais sobre a marca. */
  resumo: string;
}

export const MARCAS_BASE: MarcaInfo[] = [
  {
    // "Movimente"/"Moviment" são grafias que aparecem em orçamento e catálogo.
    chaves: ["movement", "moviment", "movimente"],
    nome: "Movement",
    origem: "Brasil · Pompéia/SP",
    resumo:
      "Marca de equipamentos de ginástica do grupo Brudden, fundado em 1980 em Pompéia (SP), no mercado fitness desde 1987 — primeiro como Moviment, depois Movement. É uma das líderes nacionais do segmento, presente em grande parte das academias do país, com fabricação própria e rede de assistência técnica no Brasil. A linha de musculação EDGE recebeu o iF Design Award (2015), premiação internacional de design industrial.",
  },
  {
    chaves: ["nautilus"],
    nome: "Nautilus",
    origem: "Estados Unidos",
    resumo:
      "Marca norte-americana criada por Arthur Jones, que patenteou em 1970 as primeiras máquinas de resistência variável por came — o desenho que ajustou a carga à curva de força do músculo e definiu o padrão das máquinas de musculação modernas. Hoje a linha comercial Nautilus pertence ao grupo Core Health & Fitness, o mesmo das marcas StairMaster, Star Trac e Schwinn.",
  },
  {
    chaves: ["stairmaster", "stair master"],
    nome: "StairMaster",
    origem: "Estados Unidos",
    resumo:
      "Marca norte-americana especializada em simuladores de escada, criadora do StepMill — o aparelho de degraus rolantes contínuos. Pertence ao grupo Core Health & Fitness, o mesmo da Nautilus, Star Trac e Schwinn.",
  },
];

/** Marca conhecida cujo trecho aparece no texto (nome do item, marca do catálogo…). */
function marcaEmTexto(texto: string): MarcaInfo | null {
  const n = normalizar(texto);
  for (const m of MARCAS_BASE) if (m.chaves.some((c) => n.includes(c))) return m;
  return null;
}

export interface MarcaDoProjeto {
  nome: string;
  origem?: string;
  resumo?: string;
  /** Quantos equipamentos do projeto são da marca. */
  n: number;
}

/**
 * Marcas presentes no projeto, com o texto de apresentação quando a marca está
 * na base. Detecta pela marca do catálogo e, na falta dela, pelo nome do item
 * (os orçamentos escrevem a marca no nome: "Esteira · Movimente RT250").
 */
export function marcasDaCena(cena: Cena, catalogo?: Equipamento[]): MarcaDoProjeto[] {
  const catId = new Map<string, Equipamento>();
  const catNome = new Map<string, Equipamento>();
  (catalogo ?? []).forEach((e) => { if (e.id) catId.set(e.id, e); catNome.set(e.nome, e); });

  const conhecidas = new Map<string, MarcaDoProjeto>();
  const desconhecidas = new Map<string, MarcaDoProjeto>();

  for (const it of (cena.itens ?? []) as ItemPosicionado[]) {
    const cat = (it.equipamentoId && catId.get(it.equipamentoId)) || catNome.get(it.nome);
    const textoMarca = (cat?.marca ?? "").trim();
    const info = marcaEmTexto(textoMarca) ?? marcaEmTexto(it.nome);
    if (info) {
      const atual = conhecidas.get(info.nome) ?? conhecidas.set(info.nome, { nome: info.nome, origem: info.origem, resumo: info.resumo, n: 0 }).get(info.nome)!;
      atual.n += 1;
    } else if (textoMarca) {
      const chave = normalizar(textoMarca);
      const atual = desconhecidas.get(chave) ?? desconhecidas.set(chave, { nome: textoMarca, n: 0 }).get(chave)!;
      atual.n += 1;
    }
  }
  // Conhecidas primeiro (têm texto), por presença no projeto.
  return [...conhecidas.values(), ...desconhecidas.values()].sort((a, b) => b.n - a.n);
}
