import { createClient } from "@supabase/supabase-js";
import type { Projeto, Equipamento, Acabamento, Fornecedor, Cotacao } from "./types";

declare global {
  interface Window {
    HP_CONFIG?: { SUPABASE_URL: string; SUPABASE_KEY: string };
  }
}

const cfg = typeof window !== "undefined" ? window.HP_CONFIG : undefined;

export const sb =
  cfg && cfg.SUPABASE_URL
    ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { db: { schema: "planner" } })
    : null;

export const online = !!sb;

// ── Projetos ─────────────────────────────────────────────────────────────────
// Lista enxuta — não traz foto_fachada (dataURL pesado); a foto vem no obterProjeto.
const COLS_LISTA = "id,nome,sindico,contato,endereco,orcamento_teto,taxa_assessoria,perfil,infraestrutura,status,cena,criado_em";
export async function listarProjetos(): Promise<Projeto[]> {
  if (!sb) return [];
  const { data, error } = await sb.from("projetos").select(COLS_LISTA).order("criado_em");
  if (error) throw error;
  return (data as Projeto[]) || [];
}

export async function obterProjeto(id: string): Promise<Projeto | null> {
  if (!sb) return null;
  const { data, error } = await sb.from("projetos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Projeto) || null;
}

export async function criarProjeto(p: Partial<Projeto>): Promise<Projeto> {
  if (!sb) throw new Error("Supabase não configurado");
  const { data, error } = await sb.from("projetos").insert(p).select().single();
  if (error) throw error;
  return data as Projeto;
}

export async function salvarCena(id: string, cena: unknown): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.from("projetos").update({ cena }).eq("id", id);
  if (error) throw error;
}

/** Atualiza campos do projeto (ex.: diagnóstico da Leitura). `taxa_assessoria` é gerada
 *  no banco e é removida do patch para não quebrar o update. */
export async function atualizarProjeto(id: string, patch: Partial<Projeto>): Promise<Projeto> {
  if (!sb) throw new Error("Supabase não configurado");
  const { taxa_assessoria: _omit, id: _id, criado_em: _c, ...limpo } = patch;
  const { data, error } = await sb.from("projetos").update(limpo).eq("id", id).select().single();
  if (error) throw error;
  return data as Projeto;
}

// ── Bibliotecas ──────────────────────────────────────────────────────────────
export async function listarEquipamentos(): Promise<Equipamento[]> {
  if (!sb) return [];
  const { data, error } = await sb.from("equipamentos").select("*").order("nome");
  if (error) throw error;
  return ((data as any[]) || []).map((e) => ({
    id: e.id, nome: e.nome, marca: e.marca, modelo: e.modelo,
    largura_cm: e.largura_cm, profundidade_cm: e.profundidade_cm,
    zona: (e.zona || "livre"), preco: e.preco || 0,
    imagem: e.imagem ?? null, contorno: e.contorno ?? null,
  }));
}

export async function inserirEquipamentos(rows: Equipamento[]): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.from("equipamentos").insert(rows);
  if (error) throw error;
}

export async function listarAcabamentos(): Promise<Acabamento[]> {
  if (!sb) return [];
  const { data, error } = await sb.from("acabamentos").select("*").order("nome");
  if (error) return []; // tabela pode não existir ainda
  return (data as Acabamento[]) || [];
}

export async function inserirAcabamento(a: Acabamento): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.from("acabamentos").insert(a);
  if (error) throw error;
}

// ── Fornecedores (global) e Cotações (por projeto) ───────────────────────────
export async function listarFornecedores(): Promise<Fornecedor[]> {
  if (!sb) return [];
  const { data, error } = await sb.from("fornecedores").select("*").order("nome");
  if (error) return []; // tabela pode não existir ainda
  return (data as Fornecedor[]) || [];
}

export async function inserirFornecedor(f: Fornecedor): Promise<Fornecedor> {
  if (!sb) throw new Error("Supabase não configurado");
  const { data, error } = await sb.from("fornecedores").insert(f).select().single();
  if (error) throw error;
  return data as Fornecedor;
}

export async function removerFornecedor(id: string): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.from("fornecedores").delete().eq("id", id);
  if (error) throw error;
}

export async function listarCotacoes(projetoId: string): Promise<Cotacao[]> {
  if (!sb) return [];
  const { data, error } = await sb.from("cotacoes").select("*").eq("projeto_id", projetoId).order("criado_em");
  if (error) return [];
  return (data as Cotacao[]) || [];
}

export async function inserirCotacao(c: Cotacao): Promise<Cotacao> {
  if (!sb) throw new Error("Supabase não configurado");
  const { id: _id, criado_em: _c, ...limpo } = c;
  const { data, error } = await sb.from("cotacoes").insert(limpo).select().single();
  if (error) throw error;
  return data as Cotacao;
}

export async function removerCotacao(id: string): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.from("cotacoes").delete().eq("id", id);
  if (error) throw error;
}
