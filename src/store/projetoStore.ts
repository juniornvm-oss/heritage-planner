import { create } from "zustand";
import type { Projeto, Cena, ItemPosicionado, PlantaFundo, AreaAcabamento, PlantaVetorial } from "../lib/types";
import { salvarCena } from "../lib/supabase";

const CENA_VAZIA: Cena = { sala: { largura_cm: 1000, profundidade_cm: 800 }, planta: null, itens: [] };

interface ProjetoState {
  projeto: Projeto | null;
  cena: Cena;
  selectedId: string | null;
  selectedAcabId: string | null;
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
  dirty: false,
  salvando: false,
  past: [],
  future: [],

  abrir(projeto) {
    const cena = projeto.cena && projeto.cena.sala ? clone(projeto.cena) : clone(CENA_VAZIA);
    set({ projeto, cena, selectedId: null, selectedAcabId: null, dirty: false, past: [], future: [] });
  },

  selecionar(id) {
    set({ selectedId: id, selectedAcabId: null });
  },

  selecionarAcab(id) {
    set({ selectedAcabId: id, selectedId: null });
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

  undo() {
    set((s) => {
      if (!s.past.length) return {};
      const previous = s.past[s.past.length - 1];
      return { cena: previous, past: s.past.slice(0, -1), future: [clone(s.cena), ...s.future], dirty: true, selectedId: null };
    });
  },

  redo() {
    set((s) => {
      if (!s.future.length) return {};
      const next = s.future[0];
      return { cena: next, future: s.future.slice(1), past: [...s.past, clone(s.cena)], dirty: true, selectedId: null };
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
