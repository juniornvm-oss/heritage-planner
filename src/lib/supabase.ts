import { createClient } from "@supabase/supabase-js";
import type { Projeto, Equipamento, Acabamento, Fornecedor, Cotacao, Orcamento } from "./types";
import { CAMPOS_TECNICOS } from "./types";

// Empacota a ficha técnica no jsonb `tecnico` (coluna aditiva 013) e separa as
// colunas nativas. Se a migração ainda não foi aplicada, o catch das telas
// mantém o equipamento salvo localmente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function empacotarEquip(eq: Equipamento): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alvo: any = { ...eq };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tecnico: any = {};
  let tem = false;
  for (const k of CAMPOS_TECNICOS) {
    if (alvo[k] !== undefined) { if (alvo[k] !== null && alvo[k] !== "") { tecnico[k] = alvo[k]; tem = true; } delete alvo[k]; }
  }
  if (tem) alvo.tecnico = tecnico;
  return alvo;
}

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
    ...(e.tecnico && typeof e.tecnico === "object" ? e.tecnico : {}),
  }));
}

export async function inserirEquipamentos(rows: Equipamento[]): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.from("equipamentos").insert(rows.map(empacotarEquip));
  if (error) throw error;
}

export async function atualizarEquipamento(eq: Equipamento): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  if (!eq.id) throw new Error("Equipamento sem id");
  const { id, ...patch } = empacotarEquip(eq);
  const { error } = await sb.from("equipamentos").update(patch).eq("id", id);
  if (error) throw error;
}

export async function removerEquipamento(id: string): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.from("equipamentos").delete().eq("id", id);
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

export async function atualizarCotacao(id: string, patch: Partial<Cotacao>): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { id: _i, criado_em: _c, ...limpo } = patch;
  const { error } = await sb.from("cotacoes").update(limpo).eq("id", id);
  if (error) throw error;
}

export async function removerCotacao(id: string): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.from("cotacoes").delete().eq("id", id);
  if (error) throw error;
}

// ── Orçamentos em PDF (migração 016) ─────────────────────────────────────────

export async function listarOrcamentos(projetoId: string): Promise<Orcamento[]> {
  if (!sb) return [];
  const { data, error } = await sb.from("orcamentos").select("*").eq("projeto_id", projetoId).order("criado_em");
  if (error) return [];
  return (data as Orcamento[]) || [];
}

/** Grava o cabeçalho + todas as linhas conferidas de uma proposta. */
export async function inserirOrcamento(o: Orcamento, linhas: Cotacao[]): Promise<Orcamento> {
  if (!sb) throw new Error("Supabase não configurado");
  const { id: _id, criado_em: _c, ...cab } = o;
  const { data, error } = await sb.from("orcamentos").insert(cab).select().single();
  if (error) throw error;
  const salvo = data as Orcamento;
  if (linhas.length) {
    const payload = linhas.map(({ id: _li, criado_em: _lc, ...l }) => ({
      ...l, projeto_id: o.projeto_id, orcamento_id: salvo.id, fornecedor_id: o.fornecedor_id ?? null,
    }));
    const { error: e2 } = await sb.from("cotacoes").insert(payload);
    if (e2) {
      // Cabeçalho sem linhas é lixo — desfaz para não sujar a tela.
      await sb.from("orcamentos").delete().eq("id", salvo.id!);
      throw e2;
    }
  }
  return salvo;
}

export async function atualizarOrcamento(id: string, patch: Partial<Orcamento>): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { id: _i, criado_em: _c, ...limpo } = patch;
  const { error } = await sb.from("orcamentos").update(limpo).eq("id", id);
  if (error) throw error;
}

/** Remove a proposta; as linhas caem junto pelo `on delete cascade`. */
export async function removerOrcamento(id: string): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.from("orcamentos").delete().eq("id", id);
  if (error) throw error;
}

// ── Formulário público do síndico → caixa de entrada ─────────────────────────
import type { Solicitacao, ConfigConsultor } from "./types";

/** Envio do formulário público. Roda como anon (síndico sem login). */
export async function criarSolicitacao(s: Solicitacao): Promise<void> {
  if (!sb) throw new Error("Envio indisponível (Supabase não configurado).");
  const { id: _i, criado_em: _c, status: _s, projeto_id: _p, ...limpo } = s;
  const { error } = await sb.from("solicitacoes").insert(limpo);
  if (error) throw error;
}

// Lista enxuta — sem `anexos`, que carrega planta e fotos em dataURL. Trazer a
// coluna aqui fazia a caixa de entrada baixar os anexos de TODAS as solicitações
// de uma vez (mesmo motivo pelo qual COLS_LISTA omite foto_fachada).
const COLS_SOLICITACAO_LISTA = "id,criado_em,status,condominio,cidade,sindico,whatsapp,email,unidades,dimensoes,localizacao,climatizacao,faixa_etaria,estilos,visao,objetivo,orcamento_teto,aprovacao,observacoes,projeto_id";

/** Lista as solicitações (consultor logado) — sem os anexos. */
export async function listarSolicitacoes(): Promise<Solicitacao[]> {
  if (!sb) return [];
  const { data, error } = await sb.from("solicitacoes").select(COLS_SOLICITACAO_LISTA).order("criado_em", { ascending: false });
  if (error) throw error;
  return (data as Solicitacao[]) || [];
}

/** Uma solicitação completa, com os anexos — buscada ao abrir o detalhe. */
export async function obterSolicitacao(id: string): Promise<Solicitacao | null> {
  if (!sb) return null;
  const { data, error } = await sb.from("solicitacoes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Solicitacao) || null;
}

export async function atualizarStatusSolicitacao(
  id: string, status: Solicitacao["status"], projeto_id?: string,
): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const patch: Record<string, unknown> = { status };
  if (projeto_id) patch.projeto_id = projeto_id;
  const { error } = await sb.from("solicitacoes").update(patch).eq("id", id);
  if (error) throw error;
}

/** "11,0 x 11,2" (metros) → { largura_cm, profundidade_cm }. `null` quando não dá
 *  para ler os dois números — quem chama decide o que fazer (antes virava 10 × 8 m
 *  em silêncio e o projeto nascia com a sala errada). */
export function dimensoesParaCm(txt?: string | null): { largura_cm: number; profundidade_cm: number } | null {
  const nums = String(txt ?? "").replace(/,/g, ".").match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const [l, p] = nums;
  if (!(l > 0) || !(p > 0)) return null;
  return { largura_cm: Math.round(l * 100), profundidade_cm: Math.round(p * 100) };
}

/** Converte uma solicitação em projeto editável e marca a solicitação.
 *  `dimensoes` só é necessário quando o texto do síndico não é legível. */
export async function converterSolicitacaoEmProjeto(
  s: Solicitacao,
  dimensoes?: { largura_cm: number; profundidade_cm: number },
): Promise<Projeto> {
  if (!sb) throw new Error("Supabase não configurado");
  const medida = dimensoes ?? dimensoesParaCm(s.dimensoes);
  if (!medida) throw new Error(`Não consegui ler as dimensões "${s.dimensoes}".`);
  const { largura_cm, profundidade_cm } = medida;
  const foto = (s.anexos ?? []).find((a) => a.tipo === "foto")?.dataUrl ?? null;
  const obs = [
    s.visao && `Visão do síndico: ${s.visao}`,
    s.objetivo && `Objetivo: ${s.objetivo}`,
    s.estilos?.length && `Estilo de treino: ${s.estilos.join(", ")}`,
    s.aprovacao && `Aprovação: ${s.aprovacao}`,
    s.unidades != null && `Unidades: ${s.unidades}`,
    s.localizacao && `Localização: ${s.localizacao}`,
    s.observacoes && `Obs.: ${s.observacoes}`,
  ].filter(Boolean).join("\n");

  const projeto: Partial<Projeto> = {
    nome: s.condominio,
    sindico: s.sindico,
    contato: s.whatsapp,
    endereco: s.cidade ?? null,
    orcamento_teto: s.orcamento_teto ?? null,
    foto_fachada: foto,
    perfil: { faixa_etaria: s.faixa_etaria ?? undefined, objetivo: s.objetivo ?? undefined },
    infraestrutura: { climatizacao: s.climatizacao ?? undefined },
    observacoes: obs || null,
    cena: { sala: { largura_cm, profundidade_cm }, itens: [], planta: null },
  };
  const p = await criarProjeto(projeto);
  if (s.id) await atualizarStatusSolicitacao(s.id, "convertida", p.id);
  return p;
}

// ── Cadastro do consultor (dados do PDF) ─────────────────────────────────────
export async function obterConfigConsultor(): Promise<ConfigConsultor | null> {
  if (!sb) return null;
  const { data, error } = await sb.from("config_consultor").select("*").eq("id", 1).maybeSingle();
  if (error) return null; // tabela pode não existir ainda
  return (data as ConfigConsultor) || null;
}

export async function salvarConfigConsultor(patch: ConfigConsultor): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { id: _i, atualizado_em: _a, ...limpo } = patch;
  // upsert, não update: se a linha semente (id=1) não existir, um update acertaria
  // zero linhas sem erro e a tela diria "salvo" tendo perdido tudo.
  const { error } = await sb
    .from("config_consultor")
    .upsert({ ...limpo, id: 1, atualizado_em: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
}

/** Troca a senha do consultor logado. */
export async function trocarSenha(nova: string): Promise<void> {
  if (!sb) throw new Error("Supabase não configurado");
  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) throw error;
}

// ── Anexos de orçamento (PDFs no Storage, bucket "orcamentos") ───────────────
const BUCKET_ORCAMENTOS = "orcamentos";

/** Sobe um PDF de orçamento; retorna o path no bucket. */
export async function uploadOrcamento(projetoId: string, file: File): Promise<string> {
  if (!sb) throw new Error("Supabase não configurado");
  const seguro = file.name.replace(/[^\w.\-()% ]+/g, "_");
  const path = `${projetoId}/${Date.now()}_${seguro}`;
  const { error } = await sb.storage.from(BUCKET_ORCAMENTOS).upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) throw error;
  return path;
}

/** URL temporária (5 min) para abrir/baixar o PDF. */
export async function urlOrcamento(path: string): Promise<string> {
  if (!sb) throw new Error("Supabase não configurado");
  const { data, error } = await sb.storage.from(BUCKET_ORCAMENTOS).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/** Remove o arquivo do bucket (best effort — metadados saem da cena de todo modo). */
export async function removerOrcamentoArquivo(path: string): Promise<void> {
  if (!sb) return;
  try { await sb.storage.from(BUCKET_ORCAMENTOS).remove([path]); } catch { /* best effort */ }
}
