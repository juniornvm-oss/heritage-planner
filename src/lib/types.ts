// Domínio do Heritage Planner (schema Supabase "planner").

// Só TIPOS: `esquadrias.ts` importa tipos daqui e este importa tipos de lá.
// Como as duas pontas são `import type`, o ciclo é apagado na compilação e
// não existe em tempo de execução.
import type {
  MaterialParede, ModeloPorta, ModeloJanela, FormaJanela,
  LadoAbertura, SentidoAbertura, FormaPilar, MaterialPilar,
} from "./esquadrias";

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

export const TAXA_ASSESSORIA = 0.005; // 0,5% do teto do condomínio (padrão)

/** Circulação mínima entre equipamentos, em cm. É a régua da análise de
 *  espaço: 90 cm é o vão que deixa duas pessoas se cruzarem de lado sem
 *  esbarrar em aparelho. Rota de saída pede mais — ver `CIRCULACAO_ROTA`. */
export const CIRCULACAO_PADRAO = 90;
/** Vão livre exigido em corredor de saída / rota de fuga, em cm. */
export const CIRCULACAO_ROTA = 120;

/** Honorário efetivo (fração) — vem do Cadastro do consultor; cai no padrão se vazio. */
export const taxaDe = (c?: { honorario_pct?: number | null } | null): number => {
  const pct = Number(c?.honorario_pct);
  return Number.isFinite(pct) && pct > 0 ? pct / 100 : TAXA_ASSESSORIA;
};

/** Fração → rótulo pt-BR ("0,5%"). */
export const taxaLabel = (taxa: number): string =>
  (taxa * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";

/** Categorias e subcategorias do catálogo de equipamentos. */
export const CATEGORIAS_EQUIP: Record<string, string[]> = {
  Cardio: ["Esteira", "Bicicleta vertical", "Bicicleta horizontal", "Spinning", "Elíptico", "Escada", "Remo"],
  "Musculação guiada": ["Peitoral", "Costas", "Ombros", "Braços", "Quadríceps", "Posterior", "Glúteos", "Panturrilha", "Abdômen"],
  "Peso livre": ["Halteres", "Anilhas", "Barras", "Banco", "Rack", "Gaiola", "Plataforma", "Smith", "Cross"],
  Funcional: [], Mobilidade: [], Alongamento: [], Acessórios: [], "Avaliação física": [],
};

/** Equipamento do catálogo (planner.equipamentos; ficha técnica no jsonb `tecnico`). */
export interface Equipamento {
  id?: string;
  nome: string;
  marca?: string | null;
  modelo?: string | null;
  largura_cm: number;
  profundidade_cm: number;
  zona: Zona;
  preco: number;
  imagem?: string | null; // dataURL de referência (foto do equipamento, reduzida)
  contorno?: number[][] | null; // polilinhas do footprint, normalizadas 0..1 (x/larg, y/prof)
  // ── Ficha técnica (opcional; persiste no jsonb planner.equipamentos.tecnico) ──
  categoria?: string | null;
  subcategoria?: string | null;
  altura_cm?: number | null;
  peso_kg?: number | null;
  fornecedor?: string | null;
  codigo?: string | null; // código interno
  descricao?: string | null; // o que é / para que serve — sai no memorial do Dossiê
  cenario_padrao?: Cenario | null; // cenário sugerido ao posicionar no projeto
  exercicios?: string[] | null; // exercícios resistidos executáveis no aparelho
  precisa_tomada?: boolean | null;
  voltagem?: "127" | "220" | "bivolt" | null;
  ponto_internet?: boolean | null;
  dist_parede_cm?: number | null; // distância mínima de parede
  dist_lateral_cm?: number | null;
  dist_frontal_cm?: number | null;
  uso_frontal_cm?: number | null; // margem da ÁREA DE USO (frente/trás)
  uso_lateral_cm?: number | null; // margem da ÁREA DE USO (laterais)
  seguranca_cm?: number | null; // margem extra da ÁREA DE SEGURANÇA (além do uso)
  lados?: Partial<Record<LadoRect, PapelLado>> | null; // papel de cada lado do footprint
  dist_entrada_cm?: number | null; // espaço livre exigido no lado da ENTRADA
  obs?: string | null;
  ativo?: boolean | null; // false = não aparece na biblioteca do editor
}

/** Papel de cada lado do footprint (orientação do equipamento em planta). */
export type PapelLado = "entrada" | "frente" | "costas" | "lateral";
export type LadoRect = "topo" | "base" | "esq" | "dir";
export const PAPEL_LADO: Record<PapelLado, { label: string; letra: string; cor: string }> = {
  entrada: { label: "Entrada", letra: "E", cor: "#5FBF7A" },
  frente: { label: "Frente", letra: "F", cor: "#5FC8E8" },
  costas: { label: "Costas", letra: "C", cor: "#8A8A8F" },
  lateral: { label: "Lateral", letra: "L", cor: "#6e6e73" },
};
/** Papéis padrão: entra por baixo (base), frente para cima. */
export const LADOS_PADRAO: Record<LadoRect, PapelLado> = { topo: "frente", base: "entrada", esq: "lateral", dir: "lateral" };

/** Chaves da ficha técnica (para empacotar/desempacotar o jsonb `tecnico`). */
export const CAMPOS_TECNICOS = [
  "categoria", "subcategoria", "altura_cm", "peso_kg", "fornecedor", "codigo",
  "precisa_tomada", "voltagem", "ponto_internet", "dist_parede_cm", "dist_lateral_cm",
  "dist_frontal_cm", "uso_frontal_cm", "uso_lateral_cm", "seguranca_cm", "obs", "ativo",
  "lados", "dist_entrada_cm", "descricao", "cenario_padrao", "exercicios",
] as const;

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

/** Cabeçalho de um orçamento recebido em PDF (planner.orcamentos) — por projeto.
 *  Uma proposta de fornecedor = um registro; as linhas ficam em `cotacoes`. */
export interface Orcamento {
  id?: string;
  projeto_id?: string;
  fornecedor_id?: string | null;
  fornecedor_nome?: string | null;
  cnpj?: string | null;
  arquivo_nome?: string | null;
  arquivo_path?: string | null; // bucket "orcamentos"
  documento?: string | null;
  data_orcamento?: string | null;
  validade?: string | null;
  prazo_entrega?: string | null;
  garantia?: string | null;
  pagamento?: string | null;
  frete?: string | null;
  total?: number | null;
  /** Proposta final — a escolhida. Mais de um fornecedor pode ser escolhido. */
  escolhido?: boolean | null;
  observacoes?: string | null;
  criado_em?: string;
}

/** Cotação de um equipamento/categoria (planner.cotacoes) — por projeto.
 *  Digitada à mão ou lida de um PDF (aí vem com `orcamento_id`). */
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
  // ── Linhas vindas de um PDF de orçamento (migração 016) ──
  orcamento_id?: string | null;
  qtd?: number | null;
  preco_un?: number | null;
  tipo?: "equipamento" | "acessorio" | null;
  /** Esta linha é a compra escolhida para o item. */
  escolhida?: boolean | null;
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
  // Visual do equipamento (herdado do catálogo) para desenhar no editor.
  imagem?: string | null;
  contorno?: number[][] | null;
  // Footprint técnico (herdado do catálogo ao adicionar; cm de margem).
  uso_frontal_cm?: number | null;
  uso_lateral_cm?: number | null;
  seguranca_cm?: number | null;
  precisa_tomada?: boolean | null;
  lados?: Partial<Record<LadoRect, PapelLado>> | null;
  dist_entrada_cm?: number | null;
  // Ficha do equipamento no projeto (Etapa 4 — texto livre do consultor).
  funcao?: string | null; // função/uso deste equipamento no projeto
  restricoes?: string | null; // onde NÃO utilizar / restrições
  detalhes?: string | null; // demais detalhes (instalação, entrega, obs.)
  /** Exercícios resistidos de musculação executáveis NESTE equipamento.
   *  Sobrescreve o catálogo e a base técnica. */
  exercicios?: string[] | null;
  // Transformações do editor profissional.
  flipH?: boolean;
  flipV?: boolean;
  bloqueado?: boolean;
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

/** Planta importada como VETOR (DXF/DWG): geometria separada do texto, em cm. */
export interface Traco {
  pts: number[]; // [x0,y0,x1,y1,...] em cm (mundo)
  cor?: string;
  camada?: string;
  fechado?: boolean;
}
export interface Rotulo {
  texto: string;
  x_cm: number;
  y_cm: number;
  altura: number; // cm
  rotacao?: number;
  camada?: string;
}
export interface Camada {
  nome: string;
  visivel: boolean;
}
export interface PlantaVetorial {
  origem: "dxf" | "dwg" | "pdf";
  tracos: Traco[];
  rotulos: Rotulo[];
  camadas: Camada[];
  x_cm: number;
  y_cm: number;
  rotacao: number;
  escala: number; // multiplicador de escala (calibração 2 cliques); 1 = unidades do arquivo
  opacidade: number;
  bloqueada: boolean;
  mostrarTexto: boolean; // separa desenho (sempre) de texto/anotações (toggle)
}

// ── Etapa 1: estrutura da planta (paredes, aberturas, pilares) ──────────────
//
// Os campos de VARIANTE (material, modelo, lado, forma…) são todos opcionais
// de propósito: a cena gravada antes deles não tem nenhum, e a resolução dos
// padrões vive em `esquadrias.ts` — nunca em `??` espalhado pelas telas. É por
// isso que este arquivo importa só os TIPOS de lá: o catálogo (com rótulos e
// medidas de fábrica) mora junto da geometria que o consome.
/** Parede: segmento de reta em cm (mundo), com espessura. */
export interface Parede {
  id: string;
  x1: number; y1: number; x2: number; y2: number;
  espessura_cm: number;
  /** Sistema construtivo. Ausente = alvenaria ½ vez (o padrão do catálogo). */
  material?: MaterialParede;
  /** Drywall/madeira com reforço embutido previsto para carga pendurada. */
  reforcada?: boolean;
  /** Pé-direito local, em cm. Ausente = o da sala. */
  altura_cm?: number;
  /** Etiqueta do consultor ("divisa do vestiário"). */
  nome?: string;
}
/** Abertura (porta/janela) posicionada sobre uma parede. */
export interface Abertura {
  id: string;
  paredeId: string;
  centro_cm: number; // distância do início da parede (x1,y1) até o centro da abertura
  largura_cm: number;
  tipo: "porta" | "janela";
  /** Variante dentro da família: chave de `PORTAS` ou de `JANELAS`. */
  modelo?: ModeloPorta | ModeloJanela;
  /** Ombreira da dobradiça: "esquerda" = a do lado de (x1,y1) da parede. */
  lado?: LadoAbertura;
  /** Para que face a folha varre. "dentro" = a face voltada ao interior. */
  sentido?: SentidoAbertura;
  /** Forma do vão (só janela) — aparece na elevação e no quadro, não no corte. */
  forma?: FormaJanela;
  /** Altura do vão, em cm. Ausente = a do modelo. */
  altura_cm?: number;
  /** Peitoril (só janela), em cm do piso. Ausente = o do modelo. */
  peitoril_cm?: number;
  /** Observação que sai no quadro de esquadrias. */
  nota?: string;
}
/** Pilar estrutural (retângulo em cm). */
export interface PilarPlanta {
  id: string;
  x_cm: number; y_cm: number; w_cm: number; h_cm: number;
  /** Seção. Ausente = retangular. */
  forma?: FormaPilar;
  /** Material. Ausente = concreto armado. */
  material?: MaterialPilar;
}
/** Estrutura construtiva gerada/editada na Etapa 1. */
export interface EstruturaPlanta {
  paredes: Parede[];
  aberturas: Abertura[];
  pilares: PilarPlanta[];
}

/** Materiais de piso da Etapa 2 (paleta padrão; "outro" usa a cor da biblioteca). */
export type MaterialPiso = "vinilico" | "borracha" | "pista" | "ceramico" | "livre" | "outro";
export const MATERIAIS_PISO: Record<MaterialPiso, { label: string; cor: string }> = {
  vinilico: { label: "Vinílico amadeirado", cor: "#8A6E4B" },
  borracha: { label: "Borracha preta", cor: "#3A3B40" },
  pista: { label: "Pista de corrida", cor: "#6E2A2A" },
  ceramico: { label: "Cerâmico / existente", cor: "#8F8878" },
  livre: { label: "Área livre", cor: "#4A5058" },
  outro: { label: "Personalizado", cor: "#8A7B5C" },
};

/**
 * Área de acabamento pintada na planta — POLÍGONO em cm (Fase 2).
 * `pontos` é a fonte da verdade; x/y/w/h guardam o bbox (compat com dados
 * antigos e com o PDF). Áreas legadas (só retângulo) são normalizadas na
 * abertura, ganhando `pontos` a partir do retângulo.
 */
export interface AreaAcabamento {
  id: string;
  acabamentoId?: string | null;
  nome: string; // nome do acabamento aplicado
  tipo: "piso" | "parede";
  material?: MaterialPiso;
  cor: string;
  preco_m2?: number | null;
  pontos?: { x: number; y: number }[]; // vértices em cm (mundo)
  rotacaoTextura?: number; // sentido do piso, em graus
  bloqueado?: boolean;
  x_cm: number;
  y_cm: number;
  w_cm: number;
  h_cm: number;
}

/** Cota de medida fixada na planta (entre 2 pontos, em cm). */
export interface Cota {
  id: string;
  x1: number; y1: number; x2: number; y2: number;
}

// ── Etapa 2: elementos fixados na parede (espelho, TV, elétrica…) ───────────
export type TipoElementoParede =
  | "espelho" | "tv" | "painel_tv" | "tomada" | "eletrica" | "internet" | "som"
  | "ar" | "iluminacao" | "espaldar" | "colchonetes" | "prateleira" | "camera" | "extintor" | "sinalizacao";

export const ELEMENTOS_PAREDE: Record<TipoElementoParede, { label: string; icone: string; cor: string; largura: number; altura: number; distPiso: number }> = {
  espelho: { label: "Espelho", icone: "🪞", cor: "#5FC8E8", largura: 200, altura: 200, distPiso: 30 },
  tv: { label: "Televisão", icone: "📺", cor: "#C9A227", largura: 98, altura: 57, distPiso: 160 },
  painel_tv: { label: "Painel de TV", icone: "🖥", cor: "#C9A227", largura: 180, altura: 120, distPiso: 110 },
  tomada: { label: "Tomada", icone: "⚡", cor: "#E09A45", largura: 12, altura: 12, distPiso: 30 },
  eletrica: { label: "Ponto elétrico", icone: "🔌", cor: "#E09A45", largura: 15, altura: 15, distPiso: 30 },
  internet: { label: "Internet", icone: "🌐", cor: "#5FBF7A", largura: 12, altura: 12, distPiso: 30 },
  som: { label: "Ponto de som", icone: "🔊", cor: "#8B78BC", largura: 20, altura: 20, distPiso: 220 },
  ar: { label: "Ar-condicionado", icone: "❄", cor: "#5FC8E8", largura: 90, altura: 30, distPiso: 220 },
  iluminacao: { label: "Iluminação", icone: "💡", cor: "#C9A227", largura: 60, altura: 12, distPiso: 260 },
  espaldar: { label: "Espaldar", icone: "🪜", cor: "#8B78BC", largura: 90, altura: 220, distPiso: 10 },
  colchonetes: { label: "Suporte colchonetes", icone: "🧘", cor: "#8B78BC", largura: 80, altura: 60, distPiso: 100 },
  prateleira: { label: "Prateleira", icone: "📚", cor: "#C07A3E", largura: 90, altura: 25, distPiso: 140 },
  camera: { label: "Câmera", icone: "📷", cor: "#8A8A8F", largura: 12, altura: 12, distPiso: 250 },
  extintor: { label: "Extintor", icone: "🧯", cor: "#E04545", largura: 20, altura: 55, distPiso: 110 },
  sinalizacao: { label: "Sinalização", icone: "🚻", cor: "#5FBF7A", largura: 30, altura: 30, distPiso: 180 },
};

/** Elemento preso a uma parede (Etapa 2). Posição = deslocamento do início da
 *  parede até o CENTRO do elemento — acompanha a parede quando ela é editada. */
export interface ElementoParede {
  id: string;
  tipo: TipoElementoParede;
  paredeId: string;
  offset_cm: number; // início da parede → centro do elemento
  largura_cm: number;
  altura_cm: number; // dimensão vertical (não aparece na planta, entra no memorial)
  dist_piso_cm: number;
  espessura_cm?: number; // espelho
  luz_superior?: boolean; // espelho
  luz_inferior?: boolean; // espelho
  preco_m2?: number | null; // espelho (custo = área × preço)
  custo?: number | null; // demais itens
  fornecedor?: string | null;
  obs?: string | null;
  bloqueado?: boolean;
}

// ── Etapa 2: mobiliário e infraestrutura (piso, fora da biblioteca de treino) ─
export type TipoInfra =
  | "balcao" | "mesa" | "cadeira" | "banco" | "sofa" | "armario" | "nicho" | "bebedouro" | "lixeira"
  | "frigobar" | "catraca" | "leitor" | "biometria" | "porta_objetos" | "roupeiro" | "jardineira"
  | "tapete" | "divisoria" | "guarda_corpo" | "outro";

export const MOBILIARIO_CATALOGO: { tipo: TipoInfra; nome: string; categoria: "Acesso" | "Recepção" | "Apoio" | "Decoração"; w: number; h: number; alt?: number }[] = [
  { tipo: "balcao", nome: "Balcão de recepção", categoria: "Recepção", w: 180, h: 60, alt: 110 },
  { tipo: "mesa", nome: "Mesa", categoria: "Recepção", w: 120, h: 70, alt: 75 },
  { tipo: "cadeira", nome: "Cadeira", categoria: "Recepção", w: 45, h: 50, alt: 90 },
  { tipo: "banco", nome: "Banco", categoria: "Apoio", w: 120, h: 40, alt: 45 },
  { tipo: "sofa", nome: "Sofá", categoria: "Recepção", w: 180, h: 85, alt: 80 },
  { tipo: "armario", nome: "Armário", categoria: "Apoio", w: 90, h: 45, alt: 180 },
  { tipo: "nicho", nome: "Nicho", categoria: "Apoio", w: 90, h: 35, alt: 180 },
  { tipo: "bebedouro", nome: "Bebedouro", categoria: "Apoio", w: 35, h: 35, alt: 110 },
  { tipo: "lixeira", nome: "Lixeira", categoria: "Apoio", w: 30, h: 30, alt: 70 },
  { tipo: "frigobar", nome: "Frigobar", categoria: "Apoio", w: 50, h: 55, alt: 85 },
  { tipo: "catraca", nome: "Catraca", categoria: "Acesso", w: 75, h: 90, alt: 100 },
  { tipo: "leitor", nome: "Leitor de acesso", categoria: "Acesso", w: 12, h: 12, alt: 120 },
  { tipo: "biometria", nome: "Biometria", categoria: "Acesso", w: 12, h: 12, alt: 120 },
  { tipo: "porta_objetos", nome: "Porta-objetos", categoria: "Apoio", w: 90, h: 40, alt: 160 },
  { tipo: "roupeiro", nome: "Roupeiro", categoria: "Apoio", w: 120, h: 50, alt: 190 },
  { tipo: "jardineira", nome: "Jardineira", categoria: "Decoração", w: 90, h: 35, alt: 60 },
  { tipo: "tapete", nome: "Tapete", categoria: "Decoração", w: 200, h: 140 },
  { tipo: "divisoria", nome: "Divisória", categoria: "Decoração", w: 180, h: 10, alt: 180 },
  { tipo: "guarda_corpo", nome: "Guarda-corpo", categoria: "Decoração", w: 200, h: 10, alt: 110 },
];

/** Destino de um equipamento que o condomínio JÁ TEM. */
export type DestinoInventario = "reaproveitado" | "residual";

export const DESTINOS_INVENTARIO: Record<DestinoInventario, { label: string; cor: string; descricao: string }> = {
  reaproveitado: {
    label: "Reaproveitado", cor: "#5FBF7A",
    descricao: "Permanece no projeto — entra no layout novo sem custo de aquisição.",
  },
  residual: {
    label: "Residual", cor: "#8A8A8F",
    descricao: "Sai do projeto — sem condição de uso, função repetida ou fora do padrão da sala.",
  },
};

/** Equipamento que já existe no condomínio (levantamento da Fase 01). */
export interface ItemInventario {
  id: string;
  nome: string;
  qtd: number;
  destino: DestinoInventario;
  /** Estado de conservação observado na visita. */
  estado?: string | null;
  /** Por que foi reaproveitado ou descartado. */
  observacao?: string | null;
  /** Valor de mercado estimado (referência para o condomínio). */
  valor_estimado?: number | null;
  /** Equipamento de treino vs acessório/guarda (anilhas, colchonetes…). */
  tipo?: "equipamento" | "acessorio";
  /**
   * Sugestão da sincronização com o layout — o consultor confirma no destino.
   * reaproveitar = fica no projeto; vender = residual para o condomínio liquidar.
   */
  sugestao?: "reaproveitar" | "vender" | null;
  /** Id do item na planta quando o reaproveitamento já está posicionado. */
  layoutItemId?: string | null;
}

/**
 * Seções do Dossiê — TODAS controláveis pelo consultor.
 *
 * As oito primeiras chaves existiam antes e mantêm o nome exato, para não
 * invalidar o `dossie` já gravado nas cenas em produção. `acabamentos`
 * controlava DUAS seções (revestimentos + espelhos/mobiliário); agora
 * `mobiliario` é separada — não fazia sentido publicar piso sem espelho.
 */
export interface OpcoesDossie {
  acabamentos?: boolean;   // revestimentos & acabamentos
  capacidade?: boolean;    // capacidade & ocupação
  cenarios?: boolean;      // cenários de investimento
  matriz?: boolean;        // matriz de priorização
  inventario?: boolean;    // inventário reaproveitado/residual
  acessorios?: boolean;    // lista de acessórios
  marcas?: boolean;        // apresentação das marcas do projeto
  exercicios?: boolean;    // exercícios contemplados pela academia
  // ── Seções que antes saíam sempre, sem controle nenhum ──
  planta?: boolean;        // a planta do projeto na sala
  esquadrias?: boolean;    // quadro de portas e janelas
  parecer?: boolean;       // parecer técnico do consultor
  diagnostico?: boolean;   // leitura do condomínio
  infraestrutura?: boolean;// análise de infraestrutura
  financeiro?: boolean;    // resumo financeiro
  categorias?: boolean;    // categorias & lista técnica
  mobiliario?: boolean;    // espelhos, parede & mobiliário
  memorial?: boolean;      // memorial dos equipamentos
  cobertura?: boolean;     // cobertura muscular & padrões de movimento
  futuro?: boolean;        // o que comprar depois, para completar a academia
  validacao?: boolean;     // validação técnica do layout
}

/** Padrão: tudo ligado (o dossiê completo). */
export const OPCOES_DOSSIE_PADRAO: Required<OpcoesDossie> = {
  acabamentos: true, capacidade: true, cenarios: true, matriz: true, inventario: true,
  acessorios: true, marcas: true, exercicios: true,
  planta: true, esquadrias: true, parecer: true, diagnostico: true, infraestrutura: true, financeiro: true,
  categorias: true, mobiliario: true, memorial: true, cobertura: true, futuro: true, validacao: true,
};

/** Chave de uma seção do Dossiê. */
export type SecaoDossie = keyof OpcoesDossie;

export const ROTULO_SECAO_DOSSIE: Record<SecaoDossie, string> = {
  planta: "Planta — o projeto na sala",
  esquadrias: "Quadro de esquadrias",
  parecer: "Parecer técnico",
  diagnostico: "Diagnóstico — leitura do condomínio",
  infraestrutura: "Análise de infraestrutura",
  financeiro: "Resumo financeiro",
  cenarios: "Cenários de investimento",
  categorias: "Categorias & lista técnica",
  acessorios: "Acessórios",
  marcas: "Marcas do projeto",
  memorial: "Memorial dos equipamentos",
  cobertura: "Cobertura muscular & movimento",
  futuro: "Sugestões futuras",
  exercicios: "Exercícios contemplados",
  inventario: "Inventário (reaproveitado/residual)",
  acabamentos: "Revestimentos & acabamentos",
  mobiliario: "Espelhos, parede & mobiliário",
  capacidade: "Capacidade & ocupação",
  matriz: "Matriz de priorização",
  validacao: "Validação técnica do layout",
};

/**
 * Ordem PADRÃO em que as seções saem no papel. A numeração impressa acompanha
 * esta lista (ou a de `cena.dossieOrdem`, quando o consultor reordena), então
 * mexer aqui nunca embaralha o índice.
 */
export const ORDEM_DOSSIE_PADRAO: SecaoDossie[] = [
  "planta", "esquadrias", "parecer", "diagnostico", "infraestrutura", "financeiro", "cenarios",
  "categorias", "acessorios", "marcas", "memorial", "cobertura", "futuro", "exercicios",
  "inventario", "acabamentos", "mobiliario", "capacidade", "matriz", "validacao",
];

/** O que a seção precisa ter para sair — mostrado na Central do Dossiê quando
 *  o consultor liga uma seção que ainda não tem conteúdo. */
export const SECAO_EXIGE_DADO: Partial<Record<SecaoDossie, string>> = {
  planta: "uma planta capturada do editor",
  esquadrias: "portas e janelas lançadas na Etapa 1",
  parecer: "o parecer escrito na etapa Cenários",
  cenarios: "equipamentos classificados em mais de um cenário",
  acessorios: "acessórios lançados na etapa Acessórios",
  marcas: "marcas detectadas nos equipamentos",
  inventario: "itens no inventário do condomínio",
  acabamentos: "áreas de piso/parede pintadas",
  mobiliario: "espelhos, itens de parede ou mobiliário",
  exercicios: "equipamentos com lista de exercícios",
  cobertura: "equipamentos reconhecidos pela base técnica",
  futuro: "lacunas de treino depois do que a sala já faz",
};

/**
 * Textos do Dossiê sobrescritos pelo consultor neste projeto.
 * Chave = `"<uso>:<secao>"` — `titulo:financeiro`, `intro:memorial`,
 * `capa:kicker`, `capa:tagline`. Ausente = usa o texto padrão do código.
 */
export type DossieTextos = Record<string, string>;

/** Especificação de uma categoria (zona) escrita PARA ESTE PROJETO.
 *  Campo vazio cai no texto padrão de `ESPEC_ZONA`. */
export interface EspecProjeto {
  oque?: string;
  entrega?: string;
  criterio?: string;
  operacao?: string;
  /** Observação adicional — o único campo que existia antes (como string solta). */
  nota?: string;
}

/** Marca no contexto DESTE projeto — override do que vem da biblioteca. */
export interface MarcaProjeto {
  /** Casamento com a biblioteca: nome da marca, normalizado. */
  ref: string;
  nome?: string | null;
  /** Texto de apresentação escrito para este projeto (vence a biblioteca). */
  resumo?: string | null;
  /** Observação curta do consultor ("fornecedor local, entrega em 20 dias"). */
  nota?: string | null;
  /** Marca âncora — sai primeiro e com destaque. */
  destaque?: boolean;
  /** Não sai no Dossiê nem na vitrine. */
  ocultar?: boolean;
  ordem?: number;
  /**
   * Imagem da LINHA usada neste projeto (dataURL) — a prancha do fabricante
   * com a família de aparelhos especificada. O logo diz de quem é; esta imagem
   * mostra o que o condomínio vai receber, que é o que o síndico quer ver.
   */
  imagem?: string | null;
  /** Legenda da imagem ("Linha EDGE — musculação"). */
  imagemLegenda?: string | null;
}

// ── Lâminas do Dossiê ───────────────────────────────────────────────────────

/**
 * As camadas que uma LÂMINA mostra.
 *
 * O editor sempre desenhou tudo de uma vez, e o Dossiê imprimia uma captura só
 * dessa vista. Mas uma apresentação não é uma vista: é uma sequência de
 * argumentos. "Aqui é o piso", "aqui é o zoneamento", "aqui é a distância
 * entre os aparelhos" são três desenhos da mesma planta com camadas
 * diferentes, e antes só dava para entregar os três juntos, embaralhados.
 */
export interface CamadasLamina {
  plantaFundo: boolean;   // a planta importada, por baixo
  estrutura: boolean;     // paredes, portas, janelas, pilares
  acabamento: boolean;    // áreas de piso e parede pintadas
  mobiliario: boolean;    // mobiliário, espelhos e itens de parede
  areas: boolean;         // regiões funcionais (zoneamento)
  equipamentos: boolean;  // o layout dos aparelhos
  rotulos: boolean;       // o nome de cada aparelho
  medidas: boolean;       // as medidas de cada aparelho
  areasUso: boolean;      // a área de uso e de segurança de cada aparelho
  orientacao: boolean;    // faixas e letras de entrada/frente/costas
  cotas: boolean;         // as cotas fixadas à mão
  afastamentos: boolean;  // as distâncias automáticas entre aparelhos e paredes
  grade: boolean;
}

export interface LaminaDossie {
  id: string;
  /** Nome de trabalho, para o consultor se achar na lista. Não sai no papel. */
  nome: string;
  /** Legenda impressa sob a imagem. Vazia = lâmina muda, só o desenho. */
  legenda?: string | null;
  camadas: CamadasLamina;
  /** Fora do Dossiê sem perder a configuração. */
  ativa: boolean;
  /** Imprime a lista numerada de equipamentos ao lado (como a planta clássica). */
  indice?: boolean;
}

/** Tudo ligado, menos o que é rascunho de tela (grade) ou anotação técnica. */
export const CAMADAS_TUDO: CamadasLamina = {
  plantaFundo: true, estrutura: true, acabamento: true, mobiliario: true,
  areas: true, equipamentos: true, rotulos: true, medidas: true,
  areasUso: false, orientacao: true, cotas: true, afastamentos: false, grade: false,
};

const semNada: CamadasLamina = {
  plantaFundo: false, estrutura: false, acabamento: false, mobiliario: false,
  areas: false, equipamentos: false, rotulos: false, medidas: false,
  areasUso: false, orientacao: false, cotas: false, afastamentos: false, grade: false,
};

/**
 * Pontos de partida. Nenhum traz rótulo nem medida: lâmina de apresentação é
 * imagem, e nome de aparelho em cima do desenho é ruído para quem só quer
 * entender a sala. Quem precisar liga na hora.
 */
export const PRESETS_LAMINA: { id: string; nome: string; descricao: string; camadas: CamadasLamina; indice?: boolean }[] = [
  {
    id: "completa", nome: "Layout completo", indice: true,
    descricao: "A planta como ela é: obra, piso, mobiliário e equipamentos, com a lista numerada ao lado.",
    camadas: { ...CAMADAS_TUDO },
  },
  {
    id: "acabamento", nome: "Acabamento",
    descricao: "Só a obra e o revestimento: piso, parede e espelhos, sem nenhum aparelho na frente.",
    camadas: { ...semNada, estrutura: true, acabamento: true, mobiliario: true },
  },
  {
    id: "zoneamento", nome: "Zoneamento",
    descricao: "As regiões da sala sobre o piso, sem os aparelhos — a leitura de como o espaço se divide.",
    camadas: { ...semNada, estrutura: true, acabamento: true, areas: true },
  },
  {
    id: "layout_limpo", nome: "Layout sobre o piso",
    descricao: "Piso e equipamentos, sem as regiões e sem texto. A imagem do projeto pronto.",
    camadas: { ...semNada, estrutura: true, acabamento: true, mobiliario: true, equipamentos: true },
  },
  {
    id: "distancias", nome: "Distâncias",
    descricao: "As folgas medidas entre um aparelho e outro, e entre aparelho e parede.",
    camadas: { ...semNada, estrutura: true, equipamentos: true, afastamentos: true, cotas: true },
  },
  {
    id: "areas_uso", nome: "Áreas de uso",
    descricao: "O espaço que cada aparelho ocupa em operação, além do corpo dele.",
    camadas: { ...semNada, estrutura: true, equipamentos: true, areasUso: true, orientacao: true },
  },
  {
    id: "obra", nome: "Planta seca",
    descricao: "Só paredes, portas, janelas e pilares. A base para o construtor.",
    camadas: { ...semNada, estrutura: true, cotas: true },
  },
];

export const ROTULO_CAMADA: Record<keyof CamadasLamina, string> = {
  plantaFundo: "Planta importada",
  estrutura: "Paredes, portas e pilares",
  acabamento: "Piso e revestimento",
  mobiliario: "Mobiliário e espelhos",
  areas: "Regiões (zoneamento)",
  equipamentos: "Equipamentos",
  rotulos: "Nome dos equipamentos",
  medidas: "Medidas dos equipamentos",
  areasUso: "Áreas de uso e segurança",
  orientacao: "Orientação (entrada/frente)",
  cotas: "Cotas marcadas à mão",
  afastamentos: "Distâncias automáticas",
  grade: "Grade",
};

/** A ordem em que as camadas aparecem no editor de lâminas. */
export const ORDEM_CAMADAS: (keyof CamadasLamina)[] = [
  "plantaFundo", "estrutura", "acabamento", "mobiliario", "areas", "equipamentos",
  "rotulos", "medidas", "orientacao", "areasUso", "cotas", "afastamentos", "grade",
];

/** Marca da biblioteca (planner.marcas) — reaproveitada entre projetos. */
export interface Marca {
  id?: string;
  nome: string;
  /** Trechos que identificam a marca em nomes/campos (minúsculo, sem acento). */
  chaves?: string[] | null;
  /** equipamento · acabamento · mobiliário · acessório */
  tipo?: TipoMarca | null;
  origem?: string | null;
  /** Grupo controlador ("Core Health & Fitness") — agrupa marcas irmãs. */
  grupo?: string | null;
  resumo?: string | null;
  site?: string | null;
  /** De onde veio o texto (site oficial, imprensa) — honestidade editorial. */
  fonte?: string | null;
  logo?: string | null; // dataURL (PNG/JPEG reduzido), mesmo padrão de equipamentos.imagem
  cor?: string | null;  // cor institucional (#RRGGBB)
  garantia?: string | null;
  assistencia?: string | null;
  ordem?: number | null;
  ativo?: boolean | null;
  criado_em?: string;
}

export type TipoMarca = "equipamento" | "acabamento" | "mobiliario" | "acessorio";

export const TIPOS_MARCA: Record<TipoMarca, string> = {
  equipamento: "Equipamento",
  acabamento: "Acabamento",
  mobiliario: "Mobiliário",
  acessorio: "Acessório",
};

// ── Fase 02: LAYOUT DE ÁREA — as regiões da sala, antes dos equipamentos ────
/** Região funcional da academia. É o zoneamento que decide ONDE cada família
 *  de equipamento entra e por onde se circula. */
export type TipoArea =
  | "circulacao" | "cardio" | "musculacao" | "articulados" | "peso_livre"
  | "bateria" | "alongamento" | "funcional" | "avaliacao" | "apoio";

export const TIPOS_AREA: Record<TipoArea, { label: string; cor: string; descricao: string }> = {
  circulacao: { label: "Circulação", cor: "#5FC8E8", descricao: "Corredores e rota de fuga — área que fica permanentemente livre." },
  cardio: { label: "Cardio", cor: "#4A90C4", descricao: "Esteiras, bikes, elípticos e escadas — exige tomada e recuo de segurança." },
  musculacao: { label: "Musculação guiada", cor: "#C9A227", descricao: "Máquinas de carga selecionada, com trajetória definida." },
  articulados: { label: "Equipamentos articulados", cor: "#D8A657", descricao: "Máquinas de alavanca com anilhas (plate loaded)." },
  peso_livre: { label: "Peso livre", cor: "#C07A3E", descricao: "Halteres, barras, bancos e racks — piso reforçado e área de queda." },
  bateria: { label: "Bateria de máquinas", cor: "#B5763A", descricao: "Máquinas alinhadas em sequência de treino (circuito)." },
  alongamento: { label: "Alongamento", cor: "#8B78BC", descricao: "Solo, colchonetes e espaldar — fora do fluxo de circulação." },
  funcional: { label: "Funcional", cor: "#7FB77E", descricao: "Área livre para treino funcional e acessórios." },
  avaliacao: { label: "Avaliação física", cor: "#9E8CC0", descricao: "Espaço reservado para avaliação e atendimento." },
  apoio: { label: "Apoio", cor: "#8A8A8F", descricao: "Recepção, bebedouro, guarda-volumes e demais apoios." },
};

/** Região desenhada na planta (polígono em cm, mundo). */
export interface AreaFuncional {
  id: string;
  tipo: TipoArea;
  /** Nome livre — em branco, usa o rótulo do tipo. */
  nome?: string | null;
  pontos: { x: number; y: number }[];
  x_cm: number; y_cm: number; w_cm: number; h_cm: number; // bbox
  observacao?: string | null;
}

/** PDF de orçamento anexado ao projeto (arquivo no Storage; metadados na cena). */
export interface AnexoOrcamento {
  id: string;
  nome: string;
  path: string; // caminho no bucket "orcamentos"
  tamanho: number; // bytes
  criado_em: string; // ISO
  /** SHA-256 do arquivo — detecta o mesmo PDF subido duas vezes, inclusive
   *  entre sessões (o anexo mora na cena, então o hash volta com o projeto). */
  hash?: string | null;
}

// ── Etapa 5: acessórios do projeto (orçados E organizados no espaço) ────────
/** Família funcional — o que decide ONDE o acessório mora na planta. */
export type FamiliaAcessorio =
  | "carga" | "halteres" | "puxadores" | "funcional" | "alongamento" | "guarda";

/** Endereço do acessório na sala: um equipamento, uma região, ou um ponto. */
export interface AncoraAcessorio {
  tipo: "item" | "area" | "infra" | "ponto";
  id?: string;
  x_cm?: number;
  y_cm?: number;
}

/** Acessório orçado no projeto (anilhas, barras, colchonetes…). */
export interface AcessorioProjeto {
  id: string;
  nome: string;
  qtd: number;
  preco_un: number; // R$
  obs?: string | null;
  familia?: FamiliaAcessorio | null;
  ancora?: AncoraAcessorio | null;
  /** Canto superior-esquerdo quando o item (ou o suporte) ocupa piso. */
  x_cm?: number | null;
  y_cm?: number | null;
  w_cm?: number | null;
  h_cm?: number | null;
  rotacao?: number;
  /**
   * Guarda já existe no layout (estante, torre, chifres do rack) ou no
   * inventário reaproveitado — some do investimento sem sair da lista.
   */
  incluso?: boolean;
  /** Item do inventário do condomínio que este acessório reaproveita. */
  origemInventarioId?: string | null;
}

export interface ItemCatalogoAcessorio {
  nome: string;
  qtd: number;
  preco: number;
  familia: FamiliaAcessorio;
}

/** Catálogo-base de acessórios (orçamento G2 Fitness · Maison Heritage, jul/2026). */
export const ACESSORIOS_CATALOGO: ItemCatalogoAcessorio[] = [
  { nome: "Espaldar alumínio", qtd: 1, preco: 2450, familia: "alongamento" },
  { nome: "Anilha olímpica BV 20 kg", qtd: 8, preco: 740, familia: "carga" },
  { nome: "Anilha olímpica BV 10 kg", qtd: 8, preco: 370, familia: "carga" },
  { nome: "Anilha olímpica BV 5 kg", qtd: 10, preco: 185, familia: "carga" },
  { nome: "Anilha olímpica BV 2,5 kg", qtd: 6, preco: 94.75, familia: "carga" },
  { nome: "Dumbbell emborrachado (par 12,5 a 25 kg)", qtd: 1, preco: 7897.5, familia: "halteres" },
  { nome: "Suporte de dumbbell 10 pares", qtd: 1, preco: 3450, familia: "guarda" },
  { nome: "Barra olímpica cromada 1,20 m", qtd: 1, preco: 900, familia: "carga" },
  { nome: "Barra olímpica cromada tipo W", qtd: 1, preco: 790, familia: "carga" },
  { nome: "Barra olímpica cromada 2,20 m", qtd: 3, preco: 950, familia: "carga" },
  { nome: "Barra olímpica cromada 1,50 m", qtd: 1, preco: 790, familia: "carga" },
  { nome: "Step EVA", qtd: 2, preco: 250, familia: "funcional" },
  { nome: "Bola pilates 65 cm", qtd: 1, preco: 180, familia: "funcional" },
  { nome: "Suporte para anilhas 8 pontas", qtd: 1, preco: 1200, familia: "guarda" },
  { nome: "Suporte para 9 barras olímpicas", qtd: 1, preco: 950, familia: "guarda" },
  { nome: "Colchonete emborrachado D80", qtd: 10, preco: 190, familia: "alongamento" },
  { nome: "Suporte para 10 colchonetes", qtd: 1, preco: 1990, familia: "guarda" },
  { nome: "Conjunto halteres sextavados 1–10 kg c/ suporte", qtd: 1, preco: 3990, familia: "halteres" },
  { nome: "Puxador corda", qtd: 1, preco: 247.5, familia: "puxadores" },
  { nome: "Puxador reto", qtd: 1, preco: 172.5, familia: "puxadores" },
  { nome: "Puxador triângulo", qtd: 1, preco: 220, familia: "puxadores" },
  { nome: "Puxador pulley 120 cm", qtd: 1, preco: 240, familia: "puxadores" },
  { nome: "Puxador tornozeleira c/ alça (par, glúteo)", qtd: 2, preco: 112.5, familia: "puxadores" },
  { nome: "Kit puxador ultra anatômico 8 pçs + suporte vertical", qtd: 1, preco: 4990, familia: "guarda" },
  { nome: "Kettlebell (8, 12, 16, 20 kg)", qtd: 1, preco: 2450, familia: "funcional" },
  { nome: "Kettlebell 32 kg", qtd: 1, preco: 920, familia: "funcional" },
];

/** Item de mobiliário/infraestrutura posicionado na planta (cm, mundo). */
export interface ItemInfraestrutura {
  id: string;
  tipo: TipoInfra;
  nome: string;
  categoria?: string | null;
  x_cm: number;
  y_cm: number;
  w_cm: number;
  h_cm: number; // profundidade em planta
  altura_cm?: number | null;
  rotacao: number;
  custo?: number | null;
  fornecedor?: string | null;
  obs?: string | null;
  bloqueado?: boolean;
}

/** Estado completo do editor de um projeto. */
export interface Cena {
  sala: Sala;
  planta?: PlantaFundo | null;
  plantaVetorial?: PlantaVetorial | null;
  itens: ItemPosicionado[];
  acabamentos?: AreaAcabamento[];
  cotas?: Cota[]; // medidas fixadas na planta (Etapa 2)
  elementosParede?: ElementoParede[]; // espelhos, TVs, elétrica… (Etapa 2)
  acessorios?: AcessorioProjeto[]; // orçamento + âncora no espaço (Etapa Acessórios)
  anexos?: AnexoOrcamento[]; // PDFs de orçamento (arquivos no Storage)
  infra?: ItemInfraestrutura[]; // mobiliário e infraestrutura (Etapa 2)
  estrutura?: EstruturaPlanta | null; // Etapa 1: paredes/aberturas/pilares
  /** Especificação da categoria NESTE projeto (etapa Cenários) — sobrescreve,
   *  campo a campo, a especificação padrão da zona no Dossiê. Chave = zona.
   *  Cenas antigas gravavam uma string solta; a normalização a converte em
   *  `{ nota }`, que é o que aquela string sempre significou. */
  especificacoes?: Partial<Record<Zona, EspecProjeto>>;
  /** Equipamentos que o condomínio já tem: reaproveitados e residuais. */
  inventario?: ItemInventario[];
  /** Seções do Dossiê ligadas/desligadas (ausente = tudo ligado). */
  dossie?: OpcoesDossie;
  /** Ordem das seções no papel (ausente = `ORDEM_DOSSIE_PADRAO`). */
  dossieOrdem?: SecaoDossie[];
  /** Títulos e textos de abertura sobrescritos pelo consultor. */
  dossieTextos?: DossieTextos;
  /** Data de emissão do Dossiê (ISO). Ausente = data de criação do projeto. */
  dossieEmissao?: string | null;
  /** Parecer técnico do consultor — a defesa do layout, no Dossiê. */
  parecer?: string | null;
  /** Fase 02 — layout de área: as regiões funcionais da sala. */
  areas?: AreaFuncional[];
  /** Marcas do projeto: overrides por marca (ordem, destaque, texto próprio). */
  marcas?: MarcaProjeto[];
  /** Parágrafo de abertura da seção de marcas. */
  marcasIntro?: string | null;
  /** As lâminas da apresentação. Ausente/vazia = a planta única de sempre. */
  laminas?: LaminaDossie[];
  /** Circulação mínima exigida neste projeto (cm) — régua da análise de espaço.
   *  Ausente = `CIRCULACAO_PADRAO`. */
  circulacaoMin?: number | null;
}

/** Papel de quem representa o condomínio na decisão. */
export type PapelContato = "sindico" | "administrador" | "zelador" | "conselho" | "outro";

export const PAPEIS_CONTATO: Record<PapelContato, string> = {
  sindico: "Síndico(a)",
  administrador: "Administrador(a)",
  zelador: "Zelador(a)",
  conselho: "Conselho",
  outro: "Outro",
};

/** Contato do condomínio — o projeto aceita vários (síndico + administradora…). */
export interface ContatoProjeto {
  id: string;
  nome: string;
  papel: PapelContato;
  /** Telefone/WhatsApp só com dígitos; a tela formata na exibição. */
  whatsapp?: string | null;
  email?: string | null;
}

/** Endereço destrinchado (o CEP preenche; o consultor ajusta). */
export interface EnderecoDetalhado {
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

/** Endereço em uma linha — é o que a capa do Dossiê e as listas mostram. */
export function enderecoEmLinha(e?: EnderecoDetalhado | null): string {
  if (!e) return "";
  const rua = [e.rua, e.numero && `nº ${e.numero}`, e.complemento].filter(Boolean).join(", ");
  return [rua, e.bairro, [e.cidade, e.estado].filter(Boolean).join("/")].filter(Boolean).join(" · ");
}

/** Telefone brasileiro formatado a partir dos dígitos. */
export function formatarTelefone(digitos?: string | null): string {
  const d = String(digitos ?? "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Diagnóstico — perfil de uso do condomínio (planner.projetos.perfil jsonb). */
export interface PerfilUso {
  faixa_etaria?: string;
  frequencia?: string;
  uso?: string; // "autônomo" | "assistido" (texto livre por flexibilidade)
  moradores?: string;
  objetivo?: string;
  // ── Leitura que alimenta a matriz de priorização ──
  padrao?: string; // padrão do condomínio (alto / médio-alto / médio / econômico)
  investimento_perfil?: string; // adequação do orçamento ao padrão
  /** Prioridades da academia, NA ORDEM de importância escolhida pelo consultor. */
  prioridades?: string[];
}

/** Opções da leitura — mantidas aqui para tela e dossiê falarem a mesma língua. */
export const PADROES_CONDOMINIO = ["Alto padrão", "Médio-alto padrão", "Médio padrão", "Padrão econômico"];
export const INVESTIMENTO_PERFIL = [
  "Adequado ao padrão do condomínio",
  "Enxuto — priorizar o essencial",
  "Folgado — dá para ir além do recomendado",
];
export const PRIORIDADES_ACADEMIA = [
  "Estética & hipertrofia",
  "Emagrecimento & condicionamento",
  "Saúde do público 50+",
  "Reabilitação & mobilidade",
  "Treino de alta intensidade",
  "Valorização do imóvel",
  "Atração & retenção de moradores",
  "Lazer & convivência",
];

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
  endereco?: string | null; // linha montada (compatibilidade com o que já existe)
  cep?: string | null;
  /** Endereço destrinchado (migração 017). */
  endereco_det?: EnderecoDetalhado | null;
  /** Contatos do condomínio (migração 017). Substitui sindico/contato/contato_admin,
   *  que seguem preenchidos para não quebrar o que já lê esses campos. */
  contatos?: ContatoProjeto[] | null;
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

/** Anexo do formulário do síndico (planta/foto) embutido como dataURL. */
export interface AnexoSolicitacao {
  tipo: "foto" | "planta";
  nome: string;
  dataUrl: string;
}

/** Solicitação do formulário público do síndico (planner.solicitacoes). */
export interface Solicitacao {
  id?: string;
  criado_em?: string;
  status?: "nova" | "convertida" | "arquivada";
  // Bloco 1
  condominio: string;
  cidade?: string | null;
  sindico: string;
  whatsapp: string;
  email?: string | null;
  unidades?: number | null;
  // Bloco 2
  dimensoes: string; // "11,0 x 11,2" (m)
  localizacao?: string | null;
  climatizacao?: string | null;
  faixa_etaria?: string | null;
  estilos?: string[] | null;
  // Bloco 3
  visao: string;
  objetivo?: string | null;
  orcamento_teto?: number | null;
  aprovacao?: string | null;
  observacoes?: string | null;
  anexos?: AnexoSolicitacao[] | null;
  projeto_id?: string | null;
}

/** Cadastro do consultor aplicado ao PDF (planner.config_consultor). */
export interface ConfigConsultor {
  id?: number;
  consultor?: string | null;
  empresa?: string | null;
  registro?: string | null;
  documento?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  site?: string | null;
  cidade_uf?: string | null;
  honorario_pct?: number | null;
  logo?: string | null;
  rodape?: string | null;
  atualizado_em?: string;
}
