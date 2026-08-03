import { create } from "zustand";
import type { Equipamento, Acabamento, ConfigConsultor } from "../lib/types";
import { listarEquipamentos, listarAcabamentos, obterConfigConsultor } from "../lib/supabase";
import { CATALOGO_LOCAL, ACABAMENTOS_LOCAL } from "../lib/seed";

interface LibraryState {
  equipamentos: Equipamento[];
  acabamentos: Acabamento[];
  /** Cadastro do consultor — honorário, identidade e rodapé do PDF. */
  config: ConfigConsultor | null;
  setConfig: (c: ConfigConsultor) => void;
  carregado: boolean;
  carregar: () => Promise<void>;
  recarregar: () => Promise<void>; // força nova busca (ex.: ao abrir um projeto)
  addEquipamentos: (rows: Equipamento[]) => void;
  updateEquipamento: (ref: string, eq: Equipamento) => void;
  removerEquipamento: (ref: string) => void;
  addAcabamentos: (rows: Acabamento[]) => void;
}

// Casa um equipamento pelo id (banco) ou, na falta, pelo nome (catálogo local).
const casa = (e: Equipamento, ref: string) => (e.id ? e.id === ref : e.nome === ref);

export const useLibrary = create<LibraryState>((set, get) => ({
  equipamentos: CATALOGO_LOCAL,
  acabamentos: ACABAMENTOS_LOCAL,
  config: null,
  setConfig(c) { set({ config: c }); },
  carregado: false,
  async carregar() {
    if (get().carregado) return;
    return get().recarregar();
  },
  async recarregar() {
    try {
      const [eq, ac, cfg] = await Promise.all([listarEquipamentos(), listarAcabamentos(), obterConfigConsultor()]);
      set({
        equipamentos: eq.length ? eq : CATALOGO_LOCAL,
        acabamentos: ac.length ? ac : ACABAMENTOS_LOCAL,
        config: cfg,
        carregado: true,
      });
    } catch {
      // Falha transitória (rede/login ainda subindo): NÃO marca carregado —
      // a próxima chamada tenta de novo. Antes isso travava o catálogo local
      // de fallback para sempre e o editor "sumia" com os equipamentos reais.
    }
  },
  addEquipamentos(rows) {
    set((s) => ({ equipamentos: [...s.equipamentos, ...rows] }));
  },
  updateEquipamento(ref, eq) {
    set((s) => ({ equipamentos: s.equipamentos.map((e) => (casa(e, ref) ? eq : e)) }));
  },
  removerEquipamento(ref) {
    set((s) => ({ equipamentos: s.equipamentos.filter((e) => !casa(e, ref)) }));
  },
  addAcabamentos(rows) {
    set((s) => ({ acabamentos: [...s.acabamentos, ...rows] }));
  },
}));
