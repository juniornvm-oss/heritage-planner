import { create } from "zustand";
import type { Equipamento, Acabamento } from "../lib/types";
import { listarEquipamentos, listarAcabamentos } from "../lib/supabase";
import { CATALOGO_LOCAL, ACABAMENTOS_LOCAL } from "../lib/seed";

interface LibraryState {
  equipamentos: Equipamento[];
  acabamentos: Acabamento[];
  carregado: boolean;
  carregar: () => Promise<void>;
  addEquipamentos: (rows: Equipamento[]) => void;
  addAcabamentos: (rows: Acabamento[]) => void;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  equipamentos: CATALOGO_LOCAL,
  acabamentos: ACABAMENTOS_LOCAL,
  carregado: false,
  async carregar() {
    if (get().carregado) return;
    try {
      const [eq, ac] = await Promise.all([listarEquipamentos(), listarAcabamentos()]);
      set({
        equipamentos: eq.length ? eq : CATALOGO_LOCAL,
        acabamentos: ac.length ? ac : ACABAMENTOS_LOCAL,
        carregado: true,
      });
    } catch {
      set({ carregado: true }); // mantém fallback local
    }
  },
  addEquipamentos(rows) {
    set((s) => ({ equipamentos: [...s.equipamentos, ...rows] }));
  },
  addAcabamentos(rows) {
    set((s) => ({ acabamentos: [...s.acabamentos, ...rows] }));
  },
}));
