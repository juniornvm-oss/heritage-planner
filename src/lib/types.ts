// Domínio do Heritage Planner (schema Supabase "planner").

export type Zona = "ergo" | "forca" | "livre" | "prep";
export type Cenario = "essencial" | "balanceado" | "premium";

export const ZONAS: Record<Zona, { label: string; cor: string }> = {
  ergo: { label: "Ergometria", cor: "#4A90C4" },
  forca: { label: "Força guiada", cor: "#C9A227" },
  livre: { label: "Peso livre", cor: "#C07A3E" },
  prep: { label: "Preparação", cor: "#8B78BC" },
};

export const CENARIOS: Record<Cenario, { label: string; cor: string; ordem: number }> = {
  essencial: { label: "Essencial", cor: "#5FBF7A", ordem: 1 },
  balanceado: { label: "Balanceado", cor: "#C9A227", ordem: 2 },
  premium: { label: "Premium", cor: "#8B78BC", ordem: 3 },
};

export const TAXA_ASSESSORIA = 0.005; // 0,5% do teto do condomínio

/** Equipamento do catálogo (planner.equipamentos). */
export interface Equipamento {
  id?: string;
  nome: string;
  marca?: string | null;
  modelo?: string | null;
  largura_cm: number;
  profundidade_cm: number;
  zona: Zona;
  preco: number;
}

/** Fornecedor (planner.fornecedores) — global, reaproveitado entre projetos. */
export interface Fornecedor {
  id?: string;
  nome: string;
  marca?: string | null;
  contato?: string | null;
  telefone?: string | null;
  email?: string | null;
  condicoes?: string | null;
  criado_em?: string;
}

/** Cotação de um equipamento/categoria (planner.cotacoes) — por projeto. */
export interface Cotacao {
  id?: string;
  projeto_id?: string;
  categoria?: string | null;
  equipamento?: string | null;
  fornecedor_id?: string | null;
  marca?: string | null;
  modelo?: string | null;
  valor?: number | null;
  garantia?: string | null;
  assistencia?: string | null;
  prazo?: string | null;
  criado_em?: string;
}

/** Acabamento/revestimento (planner.acabamentos). */
export interface Acabamento {
  id?: string;
  nome: string;
  tipo: "piso" | "parede" | "teto" | "outro";
  categoria?: string | null;
  cor?: string | null;
  preco_m2?: number | null;
  fornecedor?: string | null;
}

/** Instância posicionada na cena (equipamento colocado na planta). */
export interface ItemPosicionado {
  id: string;
  equipamentoId?: string | null;
  nome: string;
  x_cm: number;
  y_cm: number;
  w_cm: number;
  h_cm: number;
  rotacao: number; // graus
  zona: Zona;
  cenario: Cenario;
  preco: number;
  // Matriz de priorização (1–5, opcional) — alimenta o Dossiê Executivo.
  impacto?: number;
  valor_percebido?: number;
  necessidade?: number;
}

/** Planta baixa importada como fundo, já calibrada em escala real. */
export interface PlantaFundo {
  dataUrl: string; // imagem (PDF rasterizado ou DWG renderizado)
  larguraPx: number;
  alturaPx: number;
  x_cm: number; // canto superior-esquerdo em cm
  y_cm: number;
  cmPorPx: number; // escala calibrada: quantos cm cada pixel da imagem representa
  rotacao: number;
  opacidade: number;
  bloqueada: boolean;
}

export interface Piso {
  nome: string;
  y0: number;
  y1: number;
  cor: string;
}

export interface SalaConfig {
  pisos?: Piso[];
  pilar?: { x: number; y: number; w: number; h: number } | null;
  corredor?: { x: number; w: number } | null;
  paredes?: { top?: string; bottom?: string; left?: string; right?: string };
  pista_label?: string;
}

export interface Sala {
  largura_cm: number;
  profundidade_cm: number;
  config?: SalaConfig;
}

/** Área de acabamento pintada na planta (piso/parede) — retângulo em cm. */
export interface AreaAcabamento {
  id: string;
  acabamentoId?: string | null;
  nome: string; // nome do acabamento aplicado
  tipo: "piso" | "parede";
  cor: string;
  preco_m2?: number | null;
  x_cm: number;
  y_cm: number;
  w_cm: number;
  h_cm: number;
}

/** Estado completo do editor de um projeto. */
export interface Cena {
  sala: Sala;
  planta?: PlantaFundo | null;
  itens: ItemPosicionado[];
  acabamentos?: AreaAcabamento[];
}

/** Diagnóstico — perfil de uso do condomínio (planner.projetos.perfil jsonb). */
export interface PerfilUso {
  faixa_etaria?: string;
  frequencia?: string;
  uso?: string; // "autônomo" | "assistido" (texto livre por flexibilidade)
  moradores?: string;
  objetivo?: string;
}

/** Diagnóstico — infraestrutura do local (planner.projetos.infraestrutura jsonb). */
export interface Infraestrutura {
  eletrica?: string;
  climatizacao?: string;
  piso?: string;
  acesso?: string;
}

export interface Projeto {
  id?: string;
  nome: string;
  sindico?: string | null;
  contato?: string | null; // contato do síndico (telefone/WhatsApp)
  contato_admin?: string | null; // contato administrativo (nome · telefone)
  endereco?: string | null;
  cep?: string | null;
  foto_fachada?: string | null; // dataURL (JPEG reduzido)
  orcamento_teto?: number | null;
  taxa_assessoria?: number | null; // coluna gerada no banco — nunca enviar em insert/update
  perfil?: PerfilUso | null;
  infraestrutura?: Infraestrutura | null;
  observacoes?: string | null;
  status?: string | null; // 'diagnostico' por padrão no banco
  cena?: Cena | null;
  criado_em?: string;
}
