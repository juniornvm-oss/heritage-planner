import { create } from "zustand";
import type { Projeto, Cena, ItemPosicionado, PlantaFundo, AreaAcabamento, PlantaVetorial, EstruturaPlanta, Parede, Abertura, PilarPlanta } from "../lib/types";
import { CENARIOS, ZONAS } from "../lib/types";
import { gerarEstrutura, estruturaVazia } from "../lib/estrutura";
import { salvarCena } from "../lib/supabase";

export type SelEstrutura = { tipo: "parede" | "pilar" | "abertura"; id: string } | null;

const CENA_VAZIA: Cena = { sala: { largura_cm: 1000, profundidade_cm: 800 }, planta: null, itens: [] };

// Normaliza uma cena vinda do banco: garante arrays e campos válidos por item
// (dados antigos podem não ter cenario/zona → antes derrubavam o editor com tela preta).
function normalizarCena(bruta: Cena | null | undefined): Cena {
  const base = bruta && bruta.sala ? clone(bruta) : clone(CENA_VAZIA);
  const sala = base.sala ?? { ...CENA_VAZIA.sala };
  const itens: ItemPosicionado[] = (Array.isArray(base.itens) ? base.itens : []).map((it) => ({
    ...it,
    cenario: it.cenario && CENARIOS[it.cenario] ? it.cenario : "balanceado",
    zona: it.zona && ZONAS[it.zona] ? it.zona : "livre",
  }));
  const acabamentos = Array.isArray(base.acabamentos) ? base.acabamentos : [];
  const e = base.estrutura;
  const estrutura: EstruturaPlanta | null = e && (Array.isArray(e.paredes) || Array.isArray(e.pilares))
    ? { paredes: e.paredes ?? [], aberturas: e.aberturas ?? [], pilares: e.pilares ?? [] }
    : null;
  return { ...base, sala, itens, acabamentos, estrutura };
}

interface ProjetoState {
  projeto: Projeto | null;
  cena: Cena;
  selectedId: string | null;
  selectedAcabId: string | null;
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

  addItem: (item: ItemPosicionado) => void;
  updateItem: (id: string, patch: Partial<ItemPosicionado>, commit?: boolean) => void;
  removerSelecionado: () => void;
  girarSelecionado: (graus?: number) => void;

  setPlanta: (planta: PlantaFundo | null) => void;
  updatePlanta: (patch: Partial<PlantaFundo>) => void;
  setPlantaVetorial: (pv: PlantaVetorial | null) => void;
  updatePlantaVetorial: (patch: Partial<PlantaVetorial>) => void;
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

const clone = (c: Cena): Cena => JSON.parse(JSON.stringify(c));

export const useProjeto = create<ProjetoState>((set, get) => ({
  projeto: null,
  cena: CENA_VAZIA,
  selectedId: null,
  selectedAcabId: null,
  selEstrutura: null,
  dirty: false,
  salvando: false,
  past: [],
  future: [],

  abrir(projeto) {
    const cena = normalizarCena(projeto.cena);
    set({ projeto, cena, selectedId: null, selectedAcabId: null, selEstrutura: null, dirty: false, past: [], future: [] });
  },

  selecionar(id) {
    set({ selectedId: id, selectedAcabId: null, selEstrutura: null });
  },

  selecionarAcab(id) {
    set({ selectedAcabId: id, selectedId: null, selEstrutura: null });
  },

  addArea(area) {
    set((s) => ({ past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, acabamentos: [...(s.cena.acabamentos ?? []), area] }, selectedAcabId: area.id, selectedId: null, dirty: true }));
  },

  updateArea(id, patch, commit = true) {
    set((s) => {
      const acabamentos = (s.cena.acabamentos ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a));
      const past = commit ? [...s.past, clone(s.cena)] : s.past;
      return { past, future: commit ? [] : s.future, cena: { ...s.cena, acabamentos }, dirty: true };
    });
  },

  removerArea(id) {
    set((s) => ({ past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, acabamentos: (s.cena.acabamentos ?? []).filter((a) => a.id !== id) }, selectedAcabId: null, dirty: true }));
  },

  addItem(item) {
    set((s) => ({ past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, itens: [...s.cena.itens, item] }, selectedId: item.id, dirty: true }));
  },

  updateItem(id, patch, commit = true) {
    set((s) => {
      const itens = s.cena.itens.map((it) => (it.id === id ? { ...it, ...patch } : it));
      // Movimentos contínuos (commit=false) não empilham histórico a cada frame.
      const past = commit ? [...s.past, clone(s.cena)] : s.past;
      return { past, future: commit ? [] : s.future, cena: { ...s.cena, itens }, dirty: true };
    });
  },

  removerSelecionado() {
    const id = get().selectedId;
    if (!id) return;
    set((s) => ({ past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, itens: s.cena.itens.filter((it) => it.id !== id) }, selectedId: null, dirty: true }));
  },

  // Girar 90° = trocar largura↔profundidade (proporção preservada; footprint axis-aligned).
  girarSelecionado() {
    const id = get().selectedId;
    if (!id) return;
    set((s) => {
      const itens = s.cena.itens.map((it) => (it.id === id ? { ...it, w_cm: it.h_cm, h_cm: it.w_cm } : it));
      return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, itens }, dirty: true };
    });
  },

  setPlanta(planta) {
    // planta raster e vetorial são mutuamente exclusivas
    set((s) => ({ past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, planta, plantaVetorial: planta ? null : s.cena.plantaVetorial }, dirty: true }));
  },

  updatePlanta(patch) {
    set((s) => {
      if (!s.cena.planta) return {};
      return { cena: { ...s.cena, planta: { ...s.cena.planta, ...patch } }, dirty: true };
    });
  },

  setPlantaVetorial(pv) {
    set((s) => ({ past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, plantaVetorial: pv, planta: pv ? null : s.cena.planta }, dirty: true }));
  },

  updatePlantaVetorial(patch) {
    set((s) => {
      if (!s.cena.plantaVetorial) return {};
      return { cena: { ...s.cena, plantaVetorial: { ...s.cena.plantaVetorial, ...patch } }, dirty: true };
    });
  },

  toggleCamada(nome) {
    set((s) => {
      const pv = s.cena.plantaVetorial;
      if (!pv) return {};
      const camadas = pv.camadas.map((c) => (c.nome === nome ? { ...c, visivel: !c.visivel } : c));
      return { cena: { ...s.cena, plantaVetorial: { ...pv, camadas } }, dirty: true };
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
      return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, plantaVetorial: { ...pv, tracos, rotulos } }, dirty: true };
    });
  },

  // ── Etapa 1 — estrutura (paredes / pilares / aberturas) ────────────────────
  selecionarEstrutura(sel) {
    set({ selEstrutura: sel, selectedId: null, selectedAcabId: null });
  },

  gerarEstruturaAuto() {
    set((s) => ({ past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: gerarEstrutura(s.cena) }, selEstrutura: null, dirty: true }));
  },

  limparEstrutura() {
    set((s) => ({ past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: estruturaVazia() }, selEstrutura: null, dirty: true }));
  },

  addParede(p) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: { ...est, paredes: [...est.paredes, p] } }, selEstrutura: { tipo: "parede", id: p.id }, selectedId: null, selectedAcabId: null, dirty: true };
    });
  },
  updateParede(id, patch, commit = true) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      const paredes = est.paredes.map((p) => (p.id === id ? { ...p, ...patch } : p));
      return { past: commit ? [...s.past, clone(s.cena)] : s.past, future: commit ? [] : s.future, cena: { ...s.cena, estrutura: { ...est, paredes } }, dirty: true };
    });
  },
  removerParede(id) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: { ...est, paredes: est.paredes.filter((p) => p.id !== id), aberturas: est.aberturas.filter((a) => a.paredeId !== id) } }, selEstrutura: null, dirty: true };
    });
  },

  addPilar(p) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: { ...est, pilares: [...est.pilares, p] } }, selEstrutura: { tipo: "pilar", id: p.id }, selectedId: null, selectedAcabId: null, dirty: true };
    });
  },
  updatePilar(id, patch, commit = true) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      const pilares = est.pilares.map((p) => (p.id === id ? { ...p, ...patch } : p));
      return { past: commit ? [...s.past, clone(s.cena)] : s.past, future: commit ? [] : s.future, cena: { ...s.cena, estrutura: { ...est, pilares } }, dirty: true };
    });
  },
  removerPilar(id) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: { ...est, pilares: est.pilares.filter((p) => p.id !== id) } }, selEstrutura: null, dirty: true };
    });
  },

  // Gira 90° o elemento estrutural selecionado, em torno do próprio centro:
  // parede gira o segmento; pilar troca largura ↔ profundidade.
  // Redimensiona a sala-guia (retângulo de referência do projeto).
  updateSala(patch) {
    set((s) => ({ past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, sala: { ...s.cena.sala, ...patch } }, dirty: true }));
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
        return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: { ...est, paredes } }, dirty: true };
      }
      if (sel.tipo === "pilar") {
        const pilares = est.pilares.map((p) => {
          if (p.id !== sel.id) return p;
          const cx = p.x_cm + p.w_cm / 2, cy = p.y_cm + p.h_cm / 2;
          return { ...p, x_cm: cx - p.h_cm / 2, y_cm: cy - p.w_cm / 2, w_cm: p.h_cm, h_cm: p.w_cm };
        });
        return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: { ...est, pilares } }, dirty: true };
      }
      return {};
    });
  },

  addAbertura(a) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: { ...est, aberturas: [...est.aberturas, a] } }, selEstrutura: { tipo: "abertura", id: a.id }, selectedId: null, selectedAcabId: null, dirty: true };
    });
  },
  updateAbertura(id, patch, commit = true) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      const aberturas = est.aberturas.map((a) => (a.id === id ? { ...a, ...patch } : a));
      return { past: commit ? [...s.past, clone(s.cena)] : s.past, future: commit ? [] : s.future, cena: { ...s.cena, estrutura: { ...est, aberturas } }, dirty: true };
    });
  },
  removerAbertura(id) {
    set((s) => {
      const est = s.cena.estrutura ?? estruturaVazia();
      return { past: [...s.past, clone(s.cena)], future: [], cena: { ...s.cena, estrutura: { ...est, aberturas: est.aberturas.filter((a) => a.id !== id) } }, selEstrutura: null, dirty: true };
    });
  },

  undo() {
    set((s) => {
      if (!s.past.length) return {};
      const previous = s.past[s.past.length - 1];
      return { cena: previous, past: s.past.slice(0, -1), future: [clone(s.cena), ...s.future], dirty: true, selectedId: null, selEstrutura: null };
    });
  },

  redo() {
    set((s) => {
      if (!s.future.length) return {};
      const next = s.future[0];
      return { cena: next, future: s.future.slice(1), past: [...s.past, clone(s.cena)], dirty: true, selectedId: null, selEstrutura: null };
    });
  },

  async salvar() {
    const { projeto, cena } = get();
    if (!projeto?.id || projeto.id === "heritage") { set({ dirty: false }); return; }
    set({ salvando: true });
    try {
      await salvarCena(projeto.id, cena);
      set({ dirty: false });
    } finally {
      set({ salvando: false });
    }
  },
}));
