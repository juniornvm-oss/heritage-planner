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

export const TAXA_ASSESSORIA = 0.005; // fração padrão: 0,5% do teto do condomínio
export const HONORARIO_PADRAO_PCT = 0.5; // mesmo valor em % — usado no cadastro e em projetos novos

/** Percentual de honorário de um projeto (em %), caindo no padrão quando não definido. */
export function pctHonorario(p?: { honorario_pct?: number | null } | null): number {
  const pct = Number(p?.honorario_pct);
  return Number.isFinite(pct) && pct >= 0 ? pct : HONORARIO_PADRAO_PCT;
}

/** Rótulo do honorário do projeto: "0,5%". */
export function honorarioLabel(p?: { honorario_pct?: number | null } | null): string {
  return pctHonorario(p).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
}

/** Honorário em reais: teto × % do projeto (arredondado). */
export function valorHonorario(teto: number | null | undefined, p?: { honorario_pct?: number | null } | null): number {
  return Math.round((Number(teto) || 0) * pctHonorario(p) / 100);
}

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
  "lados", "dist_entrada_cm",
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
/** Parede: segmento de reta em cm (mundo), com espessura. */
export interface Parede {
  id: string;
  x1: number; y1: number; x2: number; y2: number;
  espessura_cm: number;
}
/** Abertura (porta/janela) posicionada sobre uma parede. */
export interface Abertura {
  id: string;
  paredeId: string;
  centro_cm: number; // distância do início da parede (x1,y1) até o centro da abertura
  largura_cm: number;
  tipo: "porta" | "janela";
}
/** Pilar estrutural (retângulo em cm). */
export interface PilarPlanta {
  id: string;
  x_cm: number; y_cm: number; w_cm: number; h_cm: number;
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

/** PDF de orçamento anexado ao projeto (arquivo no Storage; metadados na cena). */
export interface AnexoOrcamento {
  id: string;
  nome: string;
  path: string; // caminho no bucket "orcamentos"
  tamanho: number; // bytes
  criado_em: string; // ISO
}

// ── Etapa 5: acessórios do projeto (orçamento de itens sem posição na planta) ─
/** Acessório orçado no projeto (anilhas, barras, colchonetes…). */
export interface AcessorioProjeto {
  id: string;
  nome: string;
  qtd: number;
  preco_un: number; // R$
  obs?: string | null;
}

/** Catálogo-base de acessórios (orçamento G2 Fitness · Maison Heritage, jul/2026). */
export const ACESSORIOS_CATALOGO: { nome: string; qtd: number; preco: number }[] = [
  { nome: "Espaldar alumínio", qtd: 1, preco: 2450 },
  { nome: "Anilha olímpica BV 20 kg", qtd: 8, preco: 740 },
  { nome: "Anilha olímpica BV 10 kg", qtd: 8, preco: 370 },
  { nome: "Anilha olímpica BV 5 kg", qtd: 10, preco: 185 },
  { nome: "Anilha olímpica BV 2,5 kg", qtd: 6, preco: 94.75 },
  { nome: "Dumbbell emborrachado (par 12,5 a 25 kg)", qtd: 1, preco: 7897.5 },
  { nome: "Suporte de dumbbell 10 pares", qtd: 1, preco: 3450 },
  { nome: "Barra olímpica cromada 1,20 m", qtd: 1, preco: 900 },
  { nome: "Barra olímpica cromada tipo W", qtd: 1, preco: 790 },
  { nome: "Barra olímpica cromada 2,20 m", qtd: 3, preco: 950 },
  { nome: "Barra olímpica cromada 1,50 m", qtd: 1, preco: 790 },
  { nome: "Step EVA", qtd: 2, preco: 250 },
  { nome: "Bola pilates 65 cm", qtd: 1, preco: 180 },
  { nome: "Suporte para anilhas 8 pontas", qtd: 1, preco: 1200 },
  { nome: "Suporte para 9 barras olímpicas", qtd: 1, preco: 950 },
  { nome: "Colchonete emborrachado D80", qtd: 10, preco: 190 },
  { nome: "Suporte para 10 colchonetes", qtd: 1, preco: 1990 },
  { nome: "Conjunto halteres sextavados 1–10 kg c/ suporte", qtd: 1, preco: 3990 },
  { nome: "Puxador corda", qtd: 1, preco: 247.5 },
  { nome: "Puxador reto", qtd: 1, preco: 172.5 },
  { nome: "Puxador triângulo", qtd: 1, preco: 220 },
  { nome: "Puxador pulley 120 cm", qtd: 1, preco: 240 },
  { nome: "Puxador tornozeleira c/ alça (par, glúteo)", qtd: 2, preco: 112.5 },
  { nome: "Kit puxador ultra anatômico 8 pçs + suporte vertical", qtd: 1, preco: 4990 },
  { nome: "Kettlebell (8, 12, 16, 20 kg)", qtd: 1, preco: 2450 },
  { nome: "Kettlebell 32 kg", qtd: 1, preco: 920 },
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
  acessorios?: AcessorioProjeto[]; // orçamento de acessórios (Etapa 5)
  anexos?: AnexoOrcamento[]; // PDFs de orçamento (arquivos no Storage)
  infra?: ItemInfraestrutura[]; // mobiliário e infraestrutura (Etapa 2)
  estrutura?: EstruturaPlanta | null; // Etapa 1: paredes/aberturas/pilares
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
  honorario_pct?: number | null; // % de honorário deste projeto (null = padrão do cadastro)
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
