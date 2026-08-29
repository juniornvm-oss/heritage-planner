/**
 * O que comprar DEPOIS — a academia já treina com o que está na planta;
 * isto fecha o que ainda falta para ficar completa (músculo, padrão, exercício).
 */

import { BASE_EQUIP, analisarCobertura, baseDoNome, exerciciosDoItem, normalizar } from "./curadoria";
import { CENARIOS, type Cenario, type Equipamento, type Cena } from "./types";
import { MUSCULOS, PADROES, type Musculo, type PadraoMovimento } from "./musculatura";
import { catalogoRelevante, familiaDoNome, sugerirAcessorios } from "./acessorios";

export interface SugestaoFutura {
  nome: string;
  tipo: "equipamento" | "acessorio";
  cenario?: Cenario;
  motivo: string;
  musculos: string[];
  padroes: string[];
  exercicios: string[];
}

const LIMITE = 8;

function presentesNaCena(cena: Cena, catalogo?: Equipamento[]): Set<string> {
  const nomes = new Set<string>();
  for (const it of cena.itens ?? []) {
    nomes.add(normalizar(it.nome));
    const b = baseDoNome(it.nome);
    if (b) nomes.add(normalizar(b.nome));
    const cat = catalogo?.find((e) => (it.equipamentoId && e.id === it.equipamentoId) || normalizar(e.nome) === normalizar(it.nome));
    if (cat) nomes.add(normalizar(cat.nome));
  }
  for (const a of cena.acessorios ?? []) nomes.add(normalizar(a.nome));
  return nomes;
}

/**
 * Depois da cobertura atual (e das compras imediatas para fechar lacunas),
 * o que ainda dá para especificar numa segunda fase.
 */
export function sugerirFuturo(cena: Cena, catalogo?: Equipamento[]): SugestaoFutura[] {
  const cob = analisarCobertura(cena, catalogo);
  const ja = presentesNaCena(cena, catalogo);
  for (const s of cob.sugestoes) ja.add(normalizar(s.equipamento));

  const out: SugestaoFutura[] = [];

  const faltaMus = new Set(cob.musculos.filter((l) => l.status !== "coberto").map((l) => l.musculo));
  for (const s of cob.sugestoes) for (const m of s.musculos) faltaMus.delete(m);
  const faltaPad = new Set(cob.padroes.filter((l) => !l.coberto).map((l) => l.padrao));
  for (const s of cob.sugestoes) for (const p of s.padroes) faltaPad.delete(p);

  const fracos = cob.musculos.filter((l) => l.status === "fraco").map((l) => l.musculo);

  while (out.length < LIMITE) {
    let melhor: {
      b: (typeof BASE_EQUIP)[number];
      mus: Musculo[];
      pad: PadraoMovimento[];
      ganho: number;
    } | null = null;
    for (const b of BASE_EQUIP) {
      if (!b.capacidades || ja.has(normalizar(b.nome))) continue;
      const mus = [
        ...b.capacidades.primario.filter((m) => faltaMus.has(m)),
        ...b.capacidades.primario.filter((m) => fracos.includes(m) && !faltaMus.has(m)),
      ].filter((m, i, xs) => xs.indexOf(m) === i);
      const pad = b.capacidades.padroes.filter((p) => faltaPad.has(p));
      const ganho = mus.length * 2 + pad.length + (b.cenario === "premium" ? 0.2 : 0);
      if (ganho < 1) continue;
      const melhorEste = !melhor
        || ganho > melhor.ganho
        || (ganho === melhor.ganho && CENARIOS[b.cenario].ordem > CENARIOS[melhor.b.cenario].ordem);
      if (melhorEste) melhor = { b, mus, pad, ganho };
    }
    if (!melhor) break;
    for (const m of melhor.mus) faltaMus.delete(m);
    for (const p of melhor.pad) faltaPad.delete(p);
    ja.add(normalizar(melhor.b.nome));
    const alvos = [
      ...melhor.mus.map((m) => MUSCULOS[m].label.toLowerCase()),
      ...melhor.pad.map((p) => PADROES[p].label.toLowerCase()),
    ];
    const fase = cob.sugestoes.length
      ? "Depois das compras que fecham as lacunas de agora"
      : "A sala já treina o essencial; isto completa o repertório";
    out.push({
      nome: melhor.b.nome,
      tipo: "equipamento",
      cenario: melhor.b.cenario,
      motivo: `${fase}: ${alvos.length ? `ganha ${alvos.join(", ")}` : "expande o que já está coberto"}. Entra como ${CENARIOS[melhor.b.cenario].label}.`,
      musculos: melhor.mus.map((m) => MUSCULOS[m].label),
      padroes: melhor.pad.map((p) => PADROES[p].label),
      exercicios: (melhor.b.exercicios ?? []).slice(0, 6),
    });
  }

  if (out.length < 5) {
    const extras = BASE_EQUIP
      .filter((b) => b.capacidades && !ja.has(normalizar(b.nome)))
      .sort((a, b) => CENARIOS[b.cenario].ordem - CENARIOS[a.cenario].ordem);
    for (const b of extras) {
      if (out.length >= LIMITE) break;
      ja.add(normalizar(b.nome));
      out.push({
        nome: b.nome,
        tipo: "equipamento",
        cenario: b.cenario,
        motivo: "Não está nesta planta. Quando o orçamento permitir, completa exercícios que hoje não têm aparelho próprio.",
        musculos: (b.capacidades?.primario ?? []).map((m) => MUSCULOS[m].label),
        padroes: (b.capacidades?.padroes ?? []).map((p) => PADROES[p].label),
        exercicios: (b.exercicios ?? []).slice(0, 6),
      });
    }
  }

  const acessJa = new Set((cena.acessorios ?? []).map((a) => normalizar(a.nome)));
  const pedidos = sugerirAcessorios(cena);
  const relevantes = catalogoRelevante(cena);
  for (const c of relevantes) {
    if (out.length >= LIMITE) break;
    if (acessJa.has(normalizar(c.nome))) continue;
    if (pedidos.some((p) => normalizar(p.nome) === normalizar(c.nome))) continue;
    const fam = familiaDoNome(c.nome);
    if (fam === "guarda") continue;
    out.push({
      nome: c.nome,
      tipo: "acessorio",
      motivo: "Complemento de acessório que o espaço admite, fora da lista imediata.",
      musculos: [],
      padroes: [],
      exercicios: [],
    });
    acessJa.add(normalizar(c.nome));
  }

  return out;
}

/** Exercícios que a sala já executa (união das fichas). */
export function exerciciosDaCena(cena: Cena, catalogo?: Equipamento[]): string[] {
  const set = new Set<string>();
  const porId = new Map((catalogo ?? []).filter((e) => e.id).map((e) => [e.id!, e]));
  const porNome = new Map((catalogo ?? []).map((e) => [normalizar(e.nome), e]));
  for (const it of cena.itens ?? []) {
    const cat = (it.equipamentoId ? porId.get(it.equipamentoId) : undefined) ?? porNome.get(normalizar(it.nome));
    for (const ex of exerciciosDoItem(it, cat)) set.add(ex);
  }
  return [...set];
}
