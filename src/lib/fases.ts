// A metodologia da assessoria em 4 fases (a "trilha" da Home), ancorada nos 10 entregáveis.
// O progresso de cada fase é DERIVADO dos dados que já existem no projeto — sem coluna nova.

import type { Projeto } from "./types";

export type StatusFase = "concluida" | "andamento" | "a-iniciar";

export interface Entregavel {
  n: string; // "01".."10"
  label: string;
}

export interface Fase {
  id: "leitura" | "projeto" | "curadoria" | "dossie";
  numero: string; // "01".."04"
  titulo: string;
  subtitulo: string;
  descricao: string;
  cor: string;
  entregaveis: Entregavel[];
  /** Ferramentas ainda por construir nesta fase (marcadas "em breve"). */
  emBreve?: string[];
  /** Rota da ação principal da fase (depende de haver projeto ativo). */
  rota: (projetoId?: string) => string;
}

export const FASES: Fase[] = [
  {
    id: "leitura",
    numero: "01",
    titulo: "Leitura do Condomínio",
    subtitulo: "Diagnóstico — tudo começa aqui",
    descricao:
      "Perfil de uso dos moradores, infraestrutura do local (elétrica, climatização, piso, acesso), orçamento-teto e a planta baixa. É a base de todo o projeto.",
    cor: "#4A90C4",
    entregaveis: [
      { n: "01", label: "Relatório de Diagnóstico" },
      { n: "09", label: "Análise de Infraestrutura" },
    ],
    rota: (id) => (id ? `/projeto/${id}/leitura` : "/novo"),
  },
  {
    id: "projeto",
    numero: "02",
    titulo: "Projeto Funcional",
    subtitulo: "Layout em escala real",
    descricao:
      "Planta baixa calibrada, zonas de treino, equipamentos posicionados com proporção travada e circulação validada ao vivo.",
    cor: "#C9A227",
    entregaveis: [
      { n: "02", label: "Layout Funcional da Planta" },
      { n: "07", label: "Planta Renderizada" },
    ],
    rota: (id) => (id ? `/projeto/${id}` : "/novo"),
  },
  {
    id: "curadoria",
    numero: "03",
    titulo: "Curadoria & Investimento",
    subtitulo: "O melhor que o orçamento compra",
    descricao:
      "Lista técnica de equipamentos e os cenários Essencial · Balanceado · Premium. Matriz de priorização e cotações de fornecedores organizam a decisão.",
    cor: "#C07A3E",
    entregaveis: [
      { n: "03", label: "Lista Técnica de Equipamentos" },
      { n: "06", label: "Cenários de Investimento" },
      { n: "05", label: "Matriz de Priorização" },
      { n: "04", label: "3+ Cotações por Categoria" },
      { n: "10", label: "Contatos de Fornecedores" },
    ],
    emBreve: ["Matriz de priorização editável", "Cotações & fornecedores no app"],
    rota: (id) => (id ? `/projeto/${id}` : "/novo"),
  },
  {
    id: "dossie",
    numero: "04",
    titulo: "Dossiê Executivo",
    subtitulo: "Pronto para o engenheiro executar",
    descricao:
      "O documento de alto padrão que consolida diagnóstico, layout, lista técnica, cenários e resumo financeiro — para que engenheiro e arquiteto executem sem saber de academia.",
    cor: "#8B78BC",
    entregaveis: [{ n: "08", label: "Relatório Executivo (PDF)" }],
    emBreve: ["Capa e diagnóstico no padrão dossiê"],
    rota: (id) => (id ? `/projeto/${id}` : "/novo"),
  },
];

function temValor(o?: object | null): boolean {
  if (!o) return false;
  return Object.values(o).some((v) => v != null && String(v).trim() !== "");
}

/** Status derivado de UMA fase para um projeto (undefined => trilha genérica). */
export function statusDaFase(fase: Fase, projeto?: Projeto | null): StatusFase {
  if (!projeto) return "a-iniciar";
  const itens = projeto.cena?.itens ?? [];
  const temPlanta = !!projeto.cena?.planta;

  switch (fase.id) {
    case "leitura": {
      const sinais = [temValor(projeto.perfil), temValor(projeto.infraestrutura), Number(projeto.orcamento_teto) > 0];
      const n = sinais.filter(Boolean).length;
      return n === sinais.length ? "concluida" : n > 0 ? "andamento" : "a-iniciar";
    }
    case "projeto":
      return itens.length > 0 ? "concluida" : temPlanta ? "andamento" : "a-iniciar";
    case "curadoria": {
      const cenarios = new Set(itens.map((i) => i.cenario));
      return cenarios.size >= 2 ? "concluida" : itens.length > 0 ? "andamento" : "a-iniciar";
    }
    case "dossie":
      return itens.length > 0 ? "andamento" : "a-iniciar";
  }
}

/** Progresso de todas as fases + a fase "atual" (a primeira não concluída). */
export function progressoProjeto(projeto?: Projeto | null): {
  itens: { fase: Fase; status: StatusFase }[];
  atual: Fase;
  concluidas: number;
} {
  const itens = FASES.map((fase) => ({ fase, status: statusDaFase(fase, projeto) }));
  const atual = itens.find((x) => x.status !== "concluida")?.fase ?? FASES[FASES.length - 1];
  const concluidas = itens.filter((x) => x.status === "concluida").length;
  return { itens, atual, concluidas };
}

export const STATUS_LABEL: Record<StatusFase, string> = {
  concluida: "Concluída",
  andamento: "Em andamento",
  "a-iniciar": "A iniciar",
};

export const STATUS_COR: Record<StatusFase, string> = {
  concluida: "#5FBF7A",
  andamento: "#C9A227",
  "a-iniciar": "#8A8A8F",
};
