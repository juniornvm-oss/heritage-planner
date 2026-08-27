import { create } from "zustand";
import type { Projeto, Cena, Cenario, AreaFuncional, Equipamento, ItemInventario, OpcoesDossie, ItemPosicionado, PlantaFundo, AreaAcabamento, PlantaVetorial, EstruturaPlanta, Parede, Abertura, PilarPlanta, Cota, ElementoParede, ItemInfraestrutura, AcessorioProjeto, AnexoOrcamento, Zona, EspecProjeto, MarcaProjeto, SecaoDossie, LaminaDossie, CamadasLamina } from "../lib/types";
import { CENARIOS, ZONAS, OPCOES_DOSSIE_PADRAO, ORDEM_DOSSIE_PADRAO, PRESETS_LAMINA, CAMADAS_TUDO } from "../lib/types";
import { cenarioSugerido, normalizarExercicios } from "../lib/curadoria";
import { gerarEstrutura, estruturaVazia } from "../lib/estrutura";
import { bboxPoligono, retanguloParaPontos, transladar } from "../lib/geometria";
import { salvarCena } from "../lib/supabase";
import { mesclarSugestoes, organizarAcessorios } from "../lib/acessorios";

// Garante o modelo de polígono da área e mantém o bbox (x/y/w/h) em dia.
function normalizarArea(a: AreaAcabamento): AreaAcabamento {
  const pontos = a.pontos && a.pontos.length >= 3 ? a.pontos : retanguloParaPontos(a.x_cm, a.y_cm, a.w_cm, a.h_cm);
  const bb = bboxPoligono(pontos);
  return { ...a, pontos, x_cm: bb.x, y_cm: bb.y, w_cm: bb.w, h_cm: bb.h };
}

export type SelEstrutura = { tipo: "parede" | "pilar" | "abertura"; id: string } | null;

/** bbox do polígono — mantém x/y/w/h em dia junto com os pontos. */
const bboxDe = (pontos: { x: number; y: number }[]) => {
  const bb = bboxPoligono(pontos);
  return { x_cm: bb.x, y_cm: bb.y, w_cm: bb.w, h_cm: bb.h };
};

const CENA_VAZIA: Cena = { sala: { largura_cm: 1000, profundidade_cm: 800 }, planta: null, itens: [] };

/** Elementos de parede que ainda apontam para uma parede viva. */
const semOrfaos = (els: ElementoParede[] | undefined, paredes: Parede[]): ElementoParede[] => {
  const vivas = new Set(paredes.map((p) => p.id));
  return (els ?? []).filter((e) => vivas.has(e.paredeId));
};

/**
 * Mantém a abertura DENTRO da parede em que ela mora.
 *
 * Sem isto, digitar "400" na posição de uma parede de 400 cm deixava metade do
 * vão pendurada além da ponta: o símbolo continuava sendo desenhado, o setor de
 * varredura era pintado no vazio e o alerta acusava equipamento que estava do
 * lado de fora. Vale para todo caminho de edição, porque mora no store.
 */
function encaixarNaParede(a: Abertura, paredes: Parede[]): Abertura {
  const w = paredes.find((p) => p.id === a.paredeId);
  if (!w) return a;
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  // Vão maior que a parede: centraliza e encolhe até caber.
  const largura = Math.min(a.largura_cm, len);
  const meia = largura / 2;
  const centro = Math.min(Math.max(a.centro_cm, meia), Math.max(meia, len - meia));
  return largura === a.largura_cm && centro === a.centro_cm ? a : { ...a, largura_cm: largura, centro_cm: centro };
}

// Normaliza uma cena vinda do banco: garante arrays e campos válidos por item
// (dados antigos podem não ter cenario/zona → antes derrubavam o editor com tela preta).
function normalizarCena(bruta: Cena | null | undefined): Cena {
  const base = bruta && bruta.sala ? clone(bruta) : clone(CENA_VAZIA);
  const sala = base.sala ?? { ...CENA_VAZIA.sala };
  const itens: ItemPosicionado[] = (Array.isArray(base.itens) ? base.itens : []).map((it) => ({
    ...it,
    cenario: it.cenario && CENARIOS[it.cenario] ? it.cenario : "balanceado",
    zona: it.zona && ZONAS[it.zona] ? it.zona : "livre",
    // Lista de exercícios pode chegar do banco como null/string/lixo.
    exercicios: Array.isArray(it.exercicios) ? normalizarExercicios(it.exercicios) : null,
  }));
  const acabamentos = (Array.isArray(base.acabamentos) ? base.acabamentos : []).map(normalizarArea);
  const cotas = Array.isArray(base.cotas) ? base.cotas : [];
  const elementosParede = Array.isArray(base.elementosParede) ? base.elementosParede : [];
  const infra = Array.isArray(base.infra) ? base.infra : [];
  const acessorios = Array.isArray(base.acessorios) ? base.acessorios : [];
  const areas = (Array.isArray(base.areas) ? base.areas : [])
    .filter((a) => Array.isArray(a.pontos) && a.pontos.length >= 3)
    .map((a) => ({ ...a, ...bboxDe(a.pontos) }));
  const inventario = (Array.isArray(base.inventario) ? base.inventario : []).map((i) => ({
    ...i,
    qtd: Number(i.qtd) > 0 ? Math.round(Number(i.qtd)) : 1,
    destino: i.destino === "residual" ? ("residual" as const) : ("reaproveitado" as const),
  }));
  const anexos = Array.isArray(base.anexos) ? base.anexos : [];
  const e = base.estrutura;
  const estrutura: EstruturaPlanta | null = e && (Array.isArray(e.paredes) || Array.isArray(e.pilares))
    ? { paredes: e.paredes ?? [], aberturas: e.aberturas ?? [], pilares: e.pilares ?? [] }
    : null;
  // `especificacoes` mudou de string solta para objeto por campo. A string
  // antiga sempre significou "a nota do consultor", então vira `{ nota }`.
  const esp = base.especificacoes as unknown;
  const especificacoes: Partial<Record<Zona, EspecProjeto>> = {};
  if (esp && typeof esp === "object") {
    const mapa = esp as Record<string, unknown>;
    for (const z of Object.keys(ZONAS) as Zona[]) {
      const t = mapa[z];
      if (typeof t === "string") {
        if (t.trim()) especificacoes[z] = { nota: t.trim() };
      } else if (t && typeof t === "object") {
        const src = t as Record<string, unknown>;
        const limpo: EspecProjeto = {};
        for (const k of ["oque", "entrega", "criterio", "operacao", "nota"] as const) {
          const v = src[k];
          if (typeof v === "string" && v.trim()) limpo[k] = v.trim();
        }
        if (Object.keys(limpo).length) especificacoes[z] = limpo;
      }
    }
  }
  // `dossie.acabamentos` controlava DUAS seções (revestimentos + espelhos/
  // mobiliário) antes de `mobiliario` existir. Cena antiga com a seção
  // desligada continua com as duas ocultas — sem isto, uma seção que o
  // consultor desligou voltaria a sair no PDF entregue ao síndico.
  const dossie = base.dossie && typeof base.dossie === "object"
    ? { ...base.dossie, ...(base.dossie.acabamentos === false && base.dossie.mobiliario === undefined ? { mobiliario: false } : {}) }
    : base.dossie;
  const marcas = (Array.isArray(base.marcas) ? base.marcas : []).filter((m) => m && m.ref);
  // Lâmina gravada por uma versão anterior pode não ter uma camada criada
  // depois: o padrão preenche o buraco em vez de deixar `undefined` decidindo.
  const laminas = (Array.isArray(base.laminas) ? base.laminas : [])
    .filter((l) => l && l.id)
    .map((l) => ({ ...l, camadas: { ...CAMADAS_TUDO, ...(l.camadas ?? {}) } }));
  const dossieOrdem = Array.isArray(base.dossieOrdem)
    ? base.dossieOrdem.filter((s): s is SecaoDossie => s in OPCOES_DOSSIE_PADRAO)
    : undefined;
  return { ...base, sala, itens, acabamentos, cotas, elementosParede, infra, acessorios, anexos, estrutura, especificacoes, inventario, areas, marcas, laminas, dossieOrdem, dossie };
}

interface ProjetoState {
  projeto: Projeto | null;
  cena: Cena;
  selectedId: string | null;
  selectedAcabId: string | null;
  selElemParedeId: string | null;
  selInfraId: string | null;
  selEstrutura: SelEstrutura;
  dirty: boolean;
  salvando: boolean;
  past: Cena[];
  future: Cena[];

  abrir: (projeto: Projeto) => void;
  selecionar: (id: string | null) => void;
  selecionarAcab: (id: string | null) => void;

  addArea: (area: AreaAcabamento) => void;
  updateArea: (id: string, patch: Partial<AreaAcabamento>, commit?: boolean) => void;
  removerArea: (id: string) => void;
  duplicarArea: (id: string) => void;
  moverArea: (id: string, dx: number, dy: number) => void;
  addCota: (c: Cota) => void;
  removerCota: (id: string) => void;

  selecionarElemParede: (id: string | null) => void;
  addElemParede: (e: ElementoParede) => void;
  updateElemParede: (id: string, patch: Partial<ElementoParede>, commit?: boolean) => void;
  removerElemParede: (id: string) => void;

  selecionarInfra: (id: string | null) => void;
  addInfra: (i: ItemInfraestrutura) => void;
  updateInfra: (id: string, patch: Partial<ItemInfraestrutura>, commit?: boolean) => void;
  removerInfra: (id: string) => void;
  duplicarInfra: (id: string) => void;

  addAcessorio: (a: AcessorioProjeto) => void;
  updateAcessorio: (id: string, patch: Partial<AcessorioProjeto>, commit?: boolean) => void;
  removerAcessorio: (id: string) => void;
  selAcessorioId: string | null;
  selecionarAcessorio: (id: string | null) => void;
  /** Completa a lista com o que o layout pede e ancora tudo no espaço. */
  sugerirAcessoriosDoProjeto: () => number;
  /** Só ancora o que já está na lista — não acrescenta item. */
  organizarAcessoriosNoEspaco: () => void;
  addAnexo: (a: AnexoOrcamento) => void;
  removerAnexo: (id: string) => void;

  addItem: (item: ItemPosicionado) => void;
  updateItem: (id: string, patch: Partial<ItemPosicionado>, commit?: boolean) => void;
  /** Etapa 6 — cenário de vários itens de uma vez (todos, ou só os de uma zona). */
  classificarEmLote: (cenario: Cenario, zona?: Zona) => void;
  /** Etapa 6 — aplica o cenário sugerido pela base técnica em quem ainda não foi classificado. */
  sugerirCenarios: (sobrescrever?: boolean) => void;
  /** Especificação da categoria neste projeto — sobrescreve o padrão campo a campo. */
  setEspecificacao: (zona: Zona, patch: Partial<EspecProjeto>) => void;
  /** Título/texto de abertura de uma seção do Dossiê ("titulo:financeiro"…). */
  setDossieTexto: (chave: string, texto: string) => void;
  /** Sobe/desce uma seção na ordem impressa. */
  moverSecaoDossie: (secao: SecaoDossie, delta: -1 | 1) => void;
  resetOrdemDossie: () => void;
  setDossieEmissao: (iso: string | null) => void;
  /** Override da marca NESTE projeto (texto, ordem, destaque, ocultar). */
  setMarcaProjeto: (ref: string, patch: Partial<MarcaProjeto>) => void;
  setMarcasIntro: (texto: string) => void;
  // ── Lâminas do Dossiê ──
  addLamina: (presetId: string) => void;
  updateLamina: (id: string, patch: Partial<LaminaDossie>) => void;
  setCamadaLamina: (id: string, camada: keyof CamadasLamina, valor: boolean) => void;
  duplicarLamina: (id: string) => void;
  removerLamina: (id: string) => void;
  moverLamina: (id: string, delta: -1 | 1) => void;
  /** Régua de circulação do projeto, em cm. */
  setCirculacaoMin: (cm: number) => void;
  /** Espelha nos itens posicionados o cadastro ATUAL do catálogo — preço,
   *  dimensões, desenho e ficha técnica. Roda sozinho ao abrir o projeto:
   *  atualizou o cadastro, o layout acompanha. Devolve quantos itens mudaram. */
  sincronizarComCatalogo: (catalogo: Equipamento[]) => number;
  // ── Inventário do condomínio (reaproveitado / residual) ──
  addInventario: (i: ItemInventario) => void;
  updateInventario: (id: string, patch: Partial<ItemInventario>) => void;
  removerInventario: (id: string) => void;
  /** Liga/desliga uma seção opcional do Dossiê. */
  setOpcaoDossie: (chave: keyof OpcoesDossie, ligado: boolean) => void;
  /** Parecer técnico do consultor (sai no Dossiê, depois da planta). */
  setParecer: (texto: string) => void;
  // ── Fase 02 · layout de área: regiões funcionais da sala ──
  selAreaFuncId: string | null;
  selecionarAreaFunc: (id: string | null) => void;
  addAreaFuncional: (a: AreaFuncional) => void;
  updateAreaFuncional: (id: string, patch: Partial<AreaFuncional>, commit?: boolean) => void;
  removerAreaFuncional: (id: string) => void;
  removerSelecionado: () => void;
  girarSelecionado: (graus?: number) => void;
  duplicarItem: (id: string) => void;
  espelharItem: (id: string, eixo: "h" | "v") => void;

  setPlanta: (planta: PlantaFundo | null) => void;
  updatePlanta: (patch: Partial<PlantaFundo>, commit?: boolean) => void;
  setPlantaVetorial: (pv: PlantaVetorial | null) => void;
  updatePlantaVetorial: (patch: Partial<PlantaVetorial>, commit?: boolean) => void;
  toggleCamada: (nome: string) => void;
  recortarVetorial: (rect: { x: number; y: number; w: number; h: number }) => void;

  // Etapa 1 — estrutura
  selecionarEstrutura: (sel: SelEstrutura) => void;
  gerarEstruturaAuto: () => void;
  limparEstrutura: () => void;
  addParede: (p: Parede) => void;
  updateParede: (id: string, patch: Partial<Parede>, commit?: boolean) => void;
  removerParede: (id: string) => void;
  addPilar: (p: PilarPlanta) => void;
  updatePilar: (id: string, patch: Partial<PilarPlanta>, commit?: boolean) => void;
  removerPilar: (id: string) => void;
  girarEstruturaSel: () => void;
  updateSala: (patch: Partial<Cena["sala"]>) => void;
  addAbertura: (a: Abertura) => void;
  updateAbertura: (id: string, patch: Partial<Abertura>, commit?: boolean) => void;
  removerAbertura: (id: string) => void;

  undo: () => void;
  redo: () => void;
  salvar: () => Promise<void>;
}

/** Cópia profunda da cena para o histórico. `structuredClone` (Safari 15.4+,
 *  o alvo do iPad) é bem mais rápido que passar por JSON numa cena grande. */
const clone = (c: Cena): Cena =>
  typeof structuredClone === "function" ? structuredClone(c) : JSON.parse(JSON.stringify(c));

/** Teto do histórico: cena grande × passos ilimitados estoura a memória do iPad. */
const MAX_HIST = 60;
const empilhar = (past: Cena[], atual: Cena): Cena[] => {
  const novo = [...past, clone(atual)];
  return novo.length > MAX_HIST ? novo.slice(novo.length - MAX_HIST) : novo;
};

/** Zera toda a seleção — usado por undo/redo e ao selecionar outra coisa.
 *  Esquecer uma destas chaves deixa o inspetor mostrando um item que já não
 *  existe mais na cena. */
const SEM_SELECAO = {
  selectedId: null,
  selectedAcabId: null,
  selElemParedeId: null,
  selInfraId: null,
  selEstrutura: null,
  selAreaFuncId: null,
  selAcessorioId: null,
} as const;

export const useProjeto = create<ProjetoState>((set, get) => ({
  projeto: null,
  cena: CENA_VAZIA,
  selectedId: null,
  selectedAcabId: null,
  selElemParedeId: null,
  selInfraId: null,
  selEstrutura: null,
  selAreaFuncId: null,
  selAcessorioId: null,
  dirty: false,
  salvando: false,
  past: [],
  future: [],

  abrir(projeto) {
    const cena = normalizarCena(projeto.cena);
    set({ projeto, cena, ...SEM_SELECAO, dirty: false, past: [], future: [] });
  },

  selecionar(id) {
    set({ ...SEM_SELECAO, selectedId: id });
  },

  selecionarAcab(id) {
    set({ ...SEM_SELECAO, selectedAcabId: id });
  },

  addArea(area) {
    const a = normalizarArea(area);
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, acabamentos: [...(s.cena.acabamentos ?? []), a] }, selectedAcabId: a.id, selectedId: null, dirty: true }));
  },

  updateArea(id, patch, commit = true) {
    set((s) => {
      const acabamentos = (s.cena.acabamentos ?? []).map((a) => (a.id === id ? normalizarArea({ ...a, ...patch }) : a));
      const past = commit ? empilhar(s.past, s.cena) : s.past;
      return { past, future: commit ? [] : s.future, cena: { ...s.cena, acabamentos }, dirty: true };
    });
  },

  removerArea(id) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, acabamentos: (s.cena.acabamentos ?? []).filter((a) => a.id !== id) }, selectedAcabId: null, dirty: true }));
  },

  // Duplica a área com um pequeno deslocamento (30 cm), já selecionando a cópia.
  duplicarArea(id) {
    set((s) => {
      const orig = (s.cena.acabamentos ?? []).find((a) => a.id === id);
      if (!orig) return {};
      const nova = normalizarArea({ ...orig, id: crypto.randomUUID(), pontos: transladar(orig.pontos ?? [], 30, 30), bloqueado: false });
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, acabamentos: [...(s.cena.acabamentos ?? []), nova] }, selectedAcabId: nova.id, dirty: true };
    });
  },

  moverArea(id, dx, dy) {
    set((s) => {
      const acabamentos = (s.cena.acabamentos ?? []).map((a) => (a.id === id ? normalizarArea({ ...a, pontos: transladar(a.pontos ?? [], dx, dy) }) : a));
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, acabamentos }, dirty: true };
    });
  },

  addCota(c) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, cotas: [...(s.cena.cotas ?? []), c] }, dirty: true }));
  },

  removerCota(id) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, cotas: (s.cena.cotas ?? []).filter((c) => c.id !== id) }, dirty: true }));
  },

  // ── Etapa 5: acessórios (orçamento + lugar na planta) ──────────────────────
  addAcessorio(a) {
    set((s) => ({
      past: empilhar(s.past, s.cena), future: [],
      cena: { ...s.cena, acessorios: [...(s.cena.acessorios ?? []), a] },
      ...SEM_SELECAO, selAcessorioId: a.id, dirty: true,
    }));
  },
  updateAcessorio(id, patch, commit = true) {
    set((s) => ({
      past: commit ? empilhar(s.past, s.cena) : s.past, future: [],
      cena: { ...s.cena, acessorios: (s.cena.acessorios ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)) },
      dirty: true,
    }));
  },
  removerAcessorio(id) {
    set((s) => ({
      past: empilhar(s.past, s.cena), future: [],
      cena: { ...s.cena, acessorios: (s.cena.acessorios ?? []).filter((a) => a.id !== id) },
      selAcessorioId: s.selAcessorioId === id ? null : s.selAcessorioId, dirty: true,
    }));
  },
  selecionarAcessorio(id) {
    set({ ...SEM_SELECAO, selAcessorioId: id });
  },
  sugerirAcessoriosDoProjeto() {
    const { cena } = get();
    const antes = new Set((cena.acessorios ?? []).map((a) => a.id));
    const lista = mesclarSugestoes(cena.acessorios ?? [], cena, () => crypto.randomUUID());
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, acessorios: lista }, dirty: true }));
    return lista.filter((a) => !antes.has(a.id)).length;
  },
  organizarAcessoriosNoEspaco() {
    set((s) => ({
      past: empilhar(s.past, s.cena), future: [],
      cena: { ...s.cena, acessorios: organizarAcessorios(s.cena.acessorios ?? [], s.cena) },
      dirty: true,
    }));
  },

  addAnexo(a) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, anexos: [...(s.cena.anexos ?? []), a] }, dirty: true }));
  },
  removerAnexo(id) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, anexos: (s.cena.anexos ?? []).filter((x) => x.id !== id) }, dirty: true }));
  },

  addItem(item) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, itens: [...s.cena.itens, item] }, selectedId: item.id, dirty: true }));
  },

  updateItem(id, patch, commit = true) {
    set((s) => {
      const itens = s.cena.itens.map((it) => (it.id === id ? { ...it, ...patch } : it));
      // Movimentos contínuos (commit=false) não empilham histórico a cada frame.
      const past = commit ? empilhar(s.past, s.cena) : s.past;
      return { past, future: commit ? [] : s.future, cena: { ...s.cena, itens }, dirty: true };
    });
  },

  // ── Etapa 6: curadoria (cenário em lote + nota da categoria) ──────────────
  classificarEmLote(cenario, zona) {
    set((s) => {
      const itens = s.cena.itens.map((it) => (!zona || it.zona === zona ? { ...it, cenario } : it));
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, itens }, dirty: true };
    });
  },

  sugerirCenarios(sobrescrever = false) {
    set((s) => {
      // Sem sobrescrever, só mexe em quem está no padrão "balanceado" — o que o
      // consultor já classificou à mão nunca é revertido pela sugestão.
      const itens = s.cena.itens.map((it) =>
        sobrescrever || it.cenario === "balanceado" ? { ...it, cenario: cenarioSugerido(it.nome, it.zona) } : it,
      );
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, itens }, dirty: true };
    });
  },

  sincronizarComCatalogo(catalogo) {
    const porId = new Map<string, Equipamento>();
    const porNome = new Map<string, Equipamento>();
    for (const e of catalogo) { if (e.id) porId.set(e.id, e); porNome.set(e.nome, e); }
    let mudados = 0;
    set((s) => {
      const itens = s.cena.itens.map((it) => {
        const e = (it.equipamentoId && porId.get(it.equipamentoId)) || porNome.get(it.nome);
        if (!e) return it;
        // O catálogo é a fonte da verdade destes campos; posição, rotação,
        // cenário e os textos da ficha continuam sendo do projeto.
        const patch: Partial<ItemPosicionado> = {};
        if (it.equipamentoId && e.id === it.equipamentoId && e.nome !== it.nome) patch.nome = e.nome;
        if (typeof e.preco === "number" && e.preco !== it.preco) patch.preco = e.preco;
        if (e.largura_cm > 0 && e.largura_cm !== it.w_cm) patch.w_cm = e.largura_cm;
        if (e.profundidade_cm > 0 && e.profundidade_cm !== it.h_cm) patch.h_cm = e.profundidade_cm;
        if ((e.imagem ?? null) !== (it.imagem ?? null)) patch.imagem = e.imagem ?? null;
        if (JSON.stringify(e.contorno ?? null) !== JSON.stringify(it.contorno ?? null)) patch.contorno = e.contorno ?? null;
        if ((e.uso_frontal_cm ?? null) !== (it.uso_frontal_cm ?? null)) patch.uso_frontal_cm = e.uso_frontal_cm ?? null;
        if ((e.uso_lateral_cm ?? null) !== (it.uso_lateral_cm ?? null)) patch.uso_lateral_cm = e.uso_lateral_cm ?? null;
        if ((e.seguranca_cm ?? null) !== (it.seguranca_cm ?? null)) patch.seguranca_cm = e.seguranca_cm ?? null;
        if ((e.precisa_tomada ?? null) !== (it.precisa_tomada ?? null)) patch.precisa_tomada = e.precisa_tomada ?? null;
        if (JSON.stringify(e.lados ?? null) !== JSON.stringify(it.lados ?? null)) patch.lados = e.lados ?? null;
        if ((e.dist_entrada_cm ?? null) !== (it.dist_entrada_cm ?? null)) patch.dist_entrada_cm = e.dist_entrada_cm ?? null;
        if (!Object.keys(patch).length) return it;
        mudados++;
        return { ...it, ...patch };
      });
      if (!mudados) return {};
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, itens }, dirty: true };
    });
    return mudados;
  },

  setEspecificacao(zona, patch) {
    set((s) => {
      const especificacoes = { ...(s.cena.especificacoes ?? {}) };
      const atual: EspecProjeto = { ...(especificacoes[zona] ?? {}) };
      for (const [k, v] of Object.entries(patch) as [keyof EspecProjeto, string | undefined][]) {
        if (v && v.trim()) atual[k] = v.trim();
        else delete atual[k];
      }
      if (Object.keys(atual).length) especificacoes[zona] = atual;
      else delete especificacoes[zona];
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, especificacoes }, dirty: true };
    });
  },

  // ── Dossiê: texto, ordem e emissão ───────────────────────────────────────
  setDossieTexto(chave, texto) {
    set((s) => {
      const dossieTextos = { ...(s.cena.dossieTextos ?? {}) };
      // Campo LIMPO volta ao texto padrão; só-espaços é a supressão prometida
      // pela Central ("escreva um espaço") — grava vazio, e vazio não imprime.
      if (texto === "") delete dossieTextos[chave];
      else dossieTextos[chave] = texto.trim();
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, dossieTextos }, dirty: true };
    });
  },

  moverSecaoDossie(secao, delta) {
    set((s) => {
      // A ordem gravada não contém as seções criadas DEPOIS dela — e o painel
      // e o PDF as reanexam no fim. Sem o mesmo merge aqui, `indexOf` devolvia
      // −1 para a seção nova e o botão ↑ simplesmente não fazia nada.
      const salva = s.cena.dossieOrdem?.length ? s.cena.dossieOrdem : ORDEM_DOSSIE_PADRAO;
      const ordem = [...salva, ...ORDEM_DOSSIE_PADRAO.filter((id) => !salva.includes(id))];
      const i = ordem.indexOf(secao);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ordem.length) return {};
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, dossieOrdem: ordem }, dirty: true };
    });
  },

  resetOrdemDossie() {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, dossieOrdem: undefined }, dirty: true }));
  },

  setDossieEmissao(iso) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, dossieEmissao: iso }, dirty: true }));
  },

  // ── Marcas do projeto ────────────────────────────────────────────────────
  setMarcaProjeto(ref, patch) {
    set((s) => {
      const lista = [...(s.cena.marcas ?? [])];
      const i = lista.findIndex((m) => m.ref === ref);
      if (i >= 0) lista[i] = { ...lista[i], ...patch };
      else lista.push({ ref, ...patch });
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, marcas: lista }, dirty: true };
    });
  },

  setMarcasIntro(texto) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, marcasIntro: texto.trim() || null }, dirty: true }));
  },

  // ── Lâminas do Dossiê ──────────────────────────────────────────────────
  // Lista vazia é significativa: quer dizer "o Dossiê sai com a planta única
  // de sempre". Só quando o consultor cria a primeira lâmina é que ele assume
  // o controle da apresentação.
  addLamina(presetId) {
    set((s) => {
      const preset = PRESETS_LAMINA.find((p) => p.id === presetId) ?? PRESETS_LAMINA[0];
      const atuais = s.cena.laminas ?? [];
      const nova: LaminaDossie = {
        id: crypto.randomUUID(),
        nome: preset.nome,
        camadas: { ...preset.camadas },
        indice: preset.indice,
        ativa: true,
      };
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, laminas: [...atuais, nova] }, dirty: true };
    });
  },
  updateLamina(id, patch) {
    set((s) => ({
      past: empilhar(s.past, s.cena), future: [],
      cena: { ...s.cena, laminas: (s.cena.laminas ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)) },
      dirty: true,
    }));
  },
  setCamadaLamina(id, camada, valor) {
    set((s) => ({
      past: empilhar(s.past, s.cena), future: [],
      cena: { ...s.cena, laminas: (s.cena.laminas ?? []).map((l) => (l.id === id ? { ...l, camadas: { ...l.camadas, [camada]: valor } } : l)) },
      dirty: true,
    }));
  },
  duplicarLamina(id) {
    set((s) => {
      const atuais = s.cena.laminas ?? [];
      const i = atuais.findIndex((l) => l.id === id);
      if (i < 0) return {};
      const copia: LaminaDossie = { ...atuais[i], id: crypto.randomUUID(), nome: `${atuais[i].nome} (cópia)`, camadas: { ...atuais[i].camadas } };
      const laminas = [...atuais.slice(0, i + 1), copia, ...atuais.slice(i + 1)];
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, laminas }, dirty: true };
    });
  },
  removerLamina(id) {
    set((s) => ({
      past: empilhar(s.past, s.cena), future: [],
      cena: { ...s.cena, laminas: (s.cena.laminas ?? []).filter((l) => l.id !== id) },
      dirty: true,
    }));
  },
  moverLamina(id, delta) {
    set((s) => {
      const laminas = [...(s.cena.laminas ?? [])];
      const i = laminas.findIndex((l) => l.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= laminas.length) return {};
      [laminas[i], laminas[j]] = [laminas[j], laminas[i]];
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, laminas }, dirty: true };
    });
  },

  setCirculacaoMin(cm) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, circulacaoMin: cm > 0 ? Math.round(cm) : null }, dirty: true }));
  },

  addInventario(i) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, inventario: [...(s.cena.inventario ?? []), i] }, dirty: true }));
  },
  updateInventario(id, patch) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, inventario: (s.cena.inventario ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i)) }, dirty: true }));
  },
  removerInventario(id) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, inventario: (s.cena.inventario ?? []).filter((i) => i.id !== id) }, dirty: true }));
  },

  selecionarAreaFunc(id) {
    set({ ...SEM_SELECAO, selAreaFuncId: id });
  },
  addAreaFuncional(a) {
    const norm = { ...a, ...bboxDe(a.pontos) };
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, areas: [...(s.cena.areas ?? []), norm] }, selAreaFuncId: a.id, dirty: true }));
  },
  updateAreaFuncional(id, patch, commit = true) {
    set((s) => {
      const areas = (s.cena.areas ?? []).map((a) => {
        if (a.id !== id) return a;
        const nova = { ...a, ...patch };
        return patch.pontos ? { ...nova, ...bboxDe(nova.pontos) } : nova;
      });
      return { past: commit ? empilhar(s.past, s.cena) : s.past, future: commit ? [] : s.future, cena: { ...s.cena, areas }, dirty: true };
    });
  },
  removerAreaFuncional(id) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, areas: (s.cena.areas ?? []).filter((a) => a.id !== id) }, selAreaFuncId: null, dirty: true }));
  },

  setParecer(texto) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, parecer: texto.trim() || null }, dirty: true }));
  },

  setOpcaoDossie(chave, ligado) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, dossie: { ...(s.cena.dossie ?? {}), [chave]: ligado } }, dirty: true }));
  },

  removerSelecionado() {
    const id = get().selectedId;
    if (!id) return;
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, itens: s.cena.itens.filter((it) => it.id !== id) }, selectedId: null, dirty: true }));
  },

  // Rotação REAL em torno do centro (qualquer grau; padrão 90°).
  girarSelecionado(graus = 90) {
    const id = get().selectedId;
    if (!id) return;
    set((s) => {
      const itens = s.cena.itens.map((it) => (it.id === id ? { ...it, rotacao: (((it.rotacao || 0) + graus) % 360 + 360) % 360 } : it));
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, itens }, dirty: true };
    });
  },

  duplicarItem(id) {
    set((s) => {
      const orig = s.cena.itens.find((i) => i.id === id);
      if (!orig) return {};
      const novo = { ...orig, id: crypto.randomUUID(), x_cm: orig.x_cm + 30, y_cm: orig.y_cm + 30, bloqueado: false };
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, itens: [...s.cena.itens, novo] }, selectedId: novo.id, dirty: true };
    });
  },

  espelharItem(id, eixo) {
    set((s) => {
      const itens = s.cena.itens.map((it) => (it.id === id ? { ...it, ...(eixo === "h" ? { flipH: !it.flipH } : { flipV: !it.flipV }) } : it));
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, itens }, dirty: true };
    });
  },

  setPlanta(planta) {
    // planta raster e vetorial são mutuamente exclusivas
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, planta, plantaVetorial: planta ? null : s.cena.plantaVetorial }, dirty: true }));
  },

  updatePlanta(patch, commit = true) {
    set((s) => {
      if (!s.cena.planta) return {};
      // Entra no histórico: mover/girar a planta já calibrada com o dedo era
      // irreversível — um deslize apagava a calibração de escala.
      return { past: commit ? empilhar(s.past, s.cena) : s.past, future: commit ? [] : s.future,
        cena: { ...s.cena, planta: { ...s.cena.planta, ...patch } }, dirty: true };
    });
  },

  setPlantaVetorial(pv) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, plantaVetorial: pv, planta: pv ? null : s.cena.planta }, dirty: true }));
  },

  updatePlantaVetorial(patch, commit = true) {
    set((s) => {
      if (!s.cena.plantaVetorial) return {};
      return { past: commit ? empilhar(s.past, s.cena) : s.past, future: commit ? [] : s.future,
        cena: { ...s.cena, plantaVetorial: { ...s.cena.plantaVetorial, ...patch } }, dirty: true };
    });
  },

  toggleCamada(nome) {
    set((s) => {
      const pv = s.cena.plantaVetorial;
      if (!pv) return {};
      const camadas = pv.camadas.map((c) => (c.nome === nome ? { ...c, visivel: !c.visivel } : c));
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, plantaVetorial: { ...pv, camadas } }, dirty: true };
    });
  },

  // Mantém só o desenho/texto dentro do retângulo (isola a planta do carimbo/observações).
  recortarVetorial(rect) {
    set((s) => {
      const pv = s.cena.plantaVetorial;
      if (!pv) return {};
      const esc = pv.escala || 1;
      const lx = (rect.x - pv.x_cm) / esc, ly = (rect.y - pv.y_cm) / esc, lw = rect.w / esc, lh = rect.h / esc;
      const dentro = (x: number, y: number) => x >= lx && x <= lx + lw && y >= ly && y <= ly + lh;
      const tracos = pv.tracos.filter((t) => {
        let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
        for (let i = 0; i < t.pts.length; i += 2) { mnx = Math.min(mnx, t.pts[i]); mxx = Math.max(mxx, t.pts[i]); mny = Math.min(mny, t.pts[i + 1]); mxy = Math.max(mxy, t.pts[i + 1]); }
        return dentro((mnx + mxx) / 2, (mny + mxy) / 2);
      });
      const rotulos = pv.rotulos.filter((r) => dentro(r.x_cm, r.y_cm));
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, plantaVetorial: { ...pv, tracos, rotulos } }, dirty: true };
    });
  },

  // ── Etapa 1 — estrutura (paredes / pilares / aberturas) ────────────────────
  selecionarEstrutura(sel) {
    set({ ...SEM_SELECAO, selEstrutura: sel });
  },

  // Trocar ou zerar a estrutura mata TODOS os ids de parede: `gerarEstrutura`
  // cria paredes novas com uuid novo, e `estruturaVazia` não deixa nenhuma. Os
  // espelhos e TVs presos às paredes antigas viravam órfãos — invisíveis no
  // canvas (o desenho desiste em `if (!w) return null`) e ainda assim contados
  // no orçamento e no memorial. Este helper é a mesma cascata de
  // `removerParede`, aplicada aos três caminhos que apagam parede.
  gerarEstruturaAuto() {
    set((s) => {
      const estrutura = gerarEstrutura(s.cena);
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, estrutura, elementosParede: semOrfaos(s.cena.elementosParede, estrutura.paredes) }, selEstrutura: null, selElemParedeId: null, dirty: true };
    });
  },

  limparEstrutura() {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, estrutura: estruturaVazia(), elementosParede: [] }, selEstrutura: null, selElemParedeId: null, dirty: true }));
  },

  addParede(p) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, estrutura: { ...est, paredes: [...est.paredes, p] } }, selEstrutura: { tipo: "parede", id: p.id }, selectedId: null, selectedAcabId: null, dirty: true };
    });
  },
  updateParede(id, patch, commit = true) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      const paredes = est.paredes.map((p) => (p.id === id ? { ...p, ...patch } : p));
      return { past: commit ? empilhar(s.past, s.cena) : s.past, future: commit ? [] : s.future, cena: { ...s.cena, estrutura: { ...est, paredes } }, dirty: true };
    });
  },
  removerParede(id) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      // Cascata COMPLETA. As aberturas já caíam junto; os elementos de parede
      // (espelho, TV, espaldar) não, porque moram em `cena.elementosParede`,
      // fora de `cena.estrutura` — e ficavam apontando para uma parede morta:
      // invisíveis no canvas (o desenho desiste em `if (!w) return null`),
      // presentes no orçamento e no memorial. Um espelho de 200 cm cobrado sem
      // parede onde pendurar.
      const elementosParede = (s.cena.elementosParede ?? []).filter((e) => e.paredeId !== id);
      return {
        past: empilhar(s.past, s.cena), future: [],
        cena: {
          ...s.cena,
          elementosParede,
          estrutura: { ...est, paredes: est.paredes.filter((p) => p.id !== id), aberturas: est.aberturas.filter((a) => a.paredeId !== id) },
        },
        selEstrutura: null,
        selElemParedeId: (s.cena.elementosParede ?? []).some((e) => e.id === s.selElemParedeId && e.paredeId === id) ? null : s.selElemParedeId,
        dirty: true,
      };
    });
  },

  addPilar(p) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, estrutura: { ...est, pilares: [...est.pilares, p] } }, selEstrutura: { tipo: "pilar", id: p.id }, selectedId: null, selectedAcabId: null, dirty: true };
    });
  },
  updatePilar(id, patch, commit = true) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      const pilares = est.pilares.map((p) => (p.id === id ? { ...p, ...patch } : p));
      return { past: commit ? empilhar(s.past, s.cena) : s.past, future: commit ? [] : s.future, cena: { ...s.cena, estrutura: { ...est, pilares } }, dirty: true };
    });
  },
  removerPilar(id) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, estrutura: { ...est, pilares: est.pilares.filter((p) => p.id !== id) } }, selEstrutura: null, dirty: true };
    });
  },

  // Gira 90° o elemento estrutural selecionado, em torno do próprio centro:
  // parede gira o segmento; pilar troca largura ↔ profundidade.
  // Redimensiona a sala-guia (retângulo de referência do projeto).
  updateSala(patch) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, sala: { ...s.cena.sala, ...patch } }, dirty: true }));
  },

  girarEstruturaSel() {
    const sel = get().selEstrutura;
    if (!sel) return;
    set((s) => {
      const est = s.cena.estrutura;
      if (!est) return {};
      if (sel.tipo === "parede") {
        const paredes = est.paredes.map((p) => {
          if (p.id !== sel.id) return p;
          const cx = (p.x1 + p.x2) / 2, cy = (p.y1 + p.y2) / 2;
          return { ...p, x1: cx - (p.y1 - cy), y1: cy + (p.x1 - cx), x2: cx - (p.y2 - cy), y2: cy + (p.x2 - cx) };
        });
        return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, estrutura: { ...est, paredes } }, dirty: true };
      }
      if (sel.tipo === "pilar") {
        const pilares = est.pilares.map((p) => {
          if (p.id !== sel.id) return p;
          const cx = p.x_cm + p.w_cm / 2, cy = p.y_cm + p.h_cm / 2;
          return { ...p, x_cm: cx - p.h_cm / 2, y_cm: cy - p.w_cm / 2, w_cm: p.h_cm, h_cm: p.w_cm };
        });
        return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, estrutura: { ...est, pilares } }, dirty: true };
      }
      return {};
    });
  },

  addAbertura(a) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      const nova = encaixarNaParede(a, est.paredes);
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, estrutura: { ...est, aberturas: [...est.aberturas, nova] } }, selEstrutura: { tipo: "abertura", id: a.id }, selectedId: null, selectedAcabId: null, dirty: true };
    });
  },
  updateAbertura(id, patch, commit = true) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      const aberturas = est.aberturas.map((a) => (a.id === id ? encaixarNaParede({ ...a, ...patch }, est.paredes) : a));
      return { past: commit ? empilhar(s.past, s.cena) : s.past, future: commit ? [] : s.future, cena: { ...s.cena, estrutura: { ...est, aberturas } }, dirty: true };
    });
  },
  removerAbertura(id) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, estrutura: { ...est, aberturas: est.aberturas.filter((a) => a.id !== id) } }, selEstrutura: null, dirty: true };
    });
  },

  // ── Etapa 2: elementos de parede (espelho, TV, elétrica…) ──────────────────
  selecionarElemParede(id) {
    set({ ...SEM_SELECAO, selElemParedeId: id });
  },
  addElemParede(e) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, elementosParede: [...(s.cena.elementosParede ?? []), e] }, selElemParedeId: e.id, selectedId: null, selectedAcabId: null, selInfraId: null, selEstrutura: null, dirty: true }));
  },
  updateElemParede(id, patch, commit = true) {
    set((s) => {
      const elementosParede = (s.cena.elementosParede ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e));
      return { past: commit ? empilhar(s.past, s.cena) : s.past, future: commit ? [] : s.future, cena: { ...s.cena, elementosParede }, dirty: true };
    });
  },
  removerElemParede(id) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, elementosParede: (s.cena.elementosParede ?? []).filter((e) => e.id !== id) }, selElemParedeId: null, dirty: true }));
  },

  // ── Etapa 2: mobiliário / infraestrutura ───────────────────────────────────
  selecionarInfra(id) {
    set({ ...SEM_SELECAO, selInfraId: id });
  },
  addInfra(i) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, infra: [...(s.cena.infra ?? []), i] }, selInfraId: i.id, selectedId: null, selectedAcabId: null, selElemParedeId: null, selEstrutura: null, dirty: true }));
  },
  updateInfra(id, patch, commit = true) {
    set((s) => {
      const infra = (s.cena.infra ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i));
      return { past: commit ? empilhar(s.past, s.cena) : s.past, future: commit ? [] : s.future, cena: { ...s.cena, infra }, dirty: true };
    });
  },
  removerInfra(id) {
    set((s) => ({ past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, infra: (s.cena.infra ?? []).filter((i) => i.id !== id) }, selInfraId: null, dirty: true }));
  },
  duplicarInfra(id) {
    set((s) => {
      const orig = (s.cena.infra ?? []).find((i) => i.id === id);
      if (!orig) return {};
      const novo = { ...orig, id: crypto.randomUUID(), x_cm: orig.x_cm + 30, y_cm: orig.y_cm + 30, bloqueado: false };
      return { past: empilhar(s.past, s.cena), future: [], cena: { ...s.cena, infra: [...(s.cena.infra ?? []), novo] }, selInfraId: novo.id, dirty: true };
    });
  },

  undo() {
    set((s) => {
      if (!s.past.length) return {};
      const previous = s.past[s.past.length - 1];
      return { ...SEM_SELECAO, cena: previous, past: s.past.slice(0, -1), future: [clone(s.cena), ...s.future], dirty: true };
    });
  },

  redo() {
    set((s) => {
      if (!s.future.length) return {};
      const next = s.future[0];
      return { ...SEM_SELECAO, cena: next, future: s.future.slice(1), past: empilhar(s.past, s.cena), dirty: true };
    });
  },

  async salvar() {
    const { projeto, cena, salvando } = get();
    if (salvando) return; // já há um save em voo com uma cena mais antiga
    if (!projeto?.id || projeto.id === "heritage") { set({ dirty: false }); return; }
    set({ salvando: true });
    try {
      await salvarCena(projeto.id, cena);
      // Só limpa o `dirty` se nada mudou durante o await — cada edição cria
      // uma cena nova, então a comparação por referência detecta edições feitas
      // enquanto o save estava em voo (senão o "✓ Salvo" mentiria).
      const agora = get();
      if (agora.cena === cena && agora.projeto?.id === projeto.id) set({ dirty: false });
    } finally {
      set({ salvando: false });
    }
  },
}));
