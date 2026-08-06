// A trilha do editor: as sete etapas, na ordem em que o trabalho realmente
// acontece, com o que cada uma entrega e um indicador derivado da cena.
//
// Antes eram sete botões idênticos rotulados "1 · Planta" … "7 · Acessórios"
// numa fila de quinze controles. O número estava no rótulo (então reordenar
// exigia reescrever texto), a ordem contradizia o próprio produto — o painel
// de Áreas diz "antes dos equipamentos: onde fica a circulação", mas Áreas
// vinha depois de Acabamento — e nada dizia o que faltava fazer em cada uma.

import type { Cena } from "../lib/types";
import type { Etapa } from "./EditorCanvas";

export interface DefEtapa {
  id: Etapa;
  titulo: string;
  /** O que esta etapa entrega, em três a cinco palavras. */
  entrega: string;
  /** Uma frase de ajuda, para quem abriu a etapa sem saber o que fazer. */
  ajuda: string;
  /** Etapa de tela cheia (sem canvas nem inspetor). */
  telaCheia?: boolean;
}

/**
 * ORDEM DE TRABALHO — levantar a sala, zonear, posicionar, revestir,
 * documentar, precificar. Acabamento vem DEPOIS do layout porque só se sabe
 * onde vai o piso de borracha quando se sabe onde caem os halteres.
 */
export const ETAPAS: DefEtapa[] = [
  {
    id: "planta",
    titulo: "Planta",
    entrega: "a sala medida",
    ajuda: "Importe a planta baixa, calibre a escala e desenhe paredes, portas, janelas e pilares.",
  },
  {
    id: "areas",
    titulo: "Áreas",
    entrega: "o zoneamento",
    ajuda: "Antes dos equipamentos: onde fica a circulação e que região recebe cada família de aparelho.",
  },
  {
    id: "layout",
    titulo: "Layout",
    entrega: "os equipamentos posicionados",
    ajuda: "Arraste os equipamentos da biblioteca. As guias mostram alinhamento e folga em centímetros.",
  },
  {
    id: "acabamento",
    titulo: "Acabamento",
    entrega: "pisos, espelhos e mobiliário",
    ajuda: "Pinte as áreas de piso e parede, fixe espelhos e pontos elétricos, posicione o mobiliário.",
  },
  {
    id: "fichas",
    titulo: "Fichas",
    entrega: "o memorial de cada peça",
    ajuda: "Para cada equipamento: função no projeto, restrições e detalhes de instalação.",
  },
  {
    id: "curadoria",
    titulo: "Cenários & Dossiê",
    entrega: "a decisão e o documento",
    ajuda: "Classifique em Essencial · Balanceado · Premium, escreva o parecer e monte o Dossiê.",
    telaCheia: true,
  },
  {
    id: "acessorios",
    titulo: "Acessórios",
    entrega: "o orçamento dos complementos",
    ajuda: "Anilhas, barras, colchonetes e puxadores — o que é orçado sem ocupar posição na planta.",
    telaCheia: true,
  },
];

export const numeroDaEtapa = (id: Etapa): string =>
  String(ETAPAS.findIndex((e) => e.id === id) + 1).padStart(2, "0");

export const defDaEtapa = (id: Etapa): DefEtapa =>
  ETAPAS.find((e) => e.id === id) ?? ETAPAS[0];

/** Indicador da etapa: o que já existe na cena, em uma expressão curta. */
export interface SinalEtapa {
  /** Texto do selo ("12 itens", "3 regiões"). Vazio = nada feito ainda. */
  texto: string;
  /** Chama atenção: há problema a resolver nesta etapa. */
  alerta?: boolean;
  /** A etapa está cumprida. */
  pronta?: boolean;
}

export function sinalDaEtapa(id: Etapa, cena: Cena, nColisoes: number): SinalEtapa {
  const itens = cena.itens ?? [];
  switch (id) {
    case "planta": {
      const paredes = cena.estrutura?.paredes.length ?? 0;
      const temFundo = !!(cena.planta || cena.plantaVetorial);
      if (paredes) return { texto: `${paredes} paredes`, pronta: true };
      return { texto: temFundo ? "sem paredes" : "", alerta: temFundo };
    }
    case "areas": {
      const n = cena.areas?.length ?? 0;
      return { texto: n ? `${n} ${n === 1 ? "região" : "regiões"}` : "", pronta: n > 0 };
    }
    case "layout": {
      if (!itens.length) return { texto: "" };
      if (nColisoes) return { texto: `${nColisoes} a resolver`, alerta: true };
      return { texto: `${itens.length} itens`, pronta: true };
    }
    case "acabamento": {
      const n = (cena.acabamentos?.length ?? 0) + (cena.elementosParede?.length ?? 0) + (cena.infra?.length ?? 0);
      return { texto: n ? `${n} itens` : "", pronta: n > 0 };
    }
    case "fichas": {
      if (!itens.length) return { texto: "" };
      const feitas = itens.filter((i) => (i.funcao ?? "").trim() || (i.restricoes ?? "").trim() || (i.detalhes ?? "").trim()).length;
      return { texto: `${feitas}/${itens.length}`, pronta: feitas === itens.length && feitas > 0 };
    }
    case "curadoria": {
      if (!itens.length) return { texto: "" };
      const cenarios = new Set(itens.map((i) => i.cenario));
      if (cenarios.size < 2) return { texto: "sem classificar", alerta: true };
      return { texto: cena.parecer?.trim() ? "com parecer" : "classificado", pronta: !!cena.parecer?.trim() };
    }
    case "acessorios": {
      const n = cena.acessorios?.length ?? 0;
      return { texto: n ? `${n} itens` : "", pronta: n > 0 };
    }
  }
}
