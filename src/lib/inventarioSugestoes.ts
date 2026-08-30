/**
 * Inventário do condomínio sincronizado com o layout.
 *
 * Preço zero na planta (Heritage: esteiras, bancos, estante, torre, colchonetes)
 * quer dizer reaproveitamento — não compra. O que está no inventário e não
 * entrou no layout novo vira sugestão de venda (residual).
 */

import { baseDoNome, normalizar } from "./curadoria";
import { familiaDoNome, papelGuardaDoNome } from "./acessorios";
import type { Cena, ItemInventario, ItemPosicionado } from "./types";

function chaveItem(nome: string): string {
  return normalizar(nome);
}

function chaveTecnica(nome: string): string {
  return normalizar(baseDoNome(nome)?.nome ?? nome);
}

function agruparLayout(itens: ItemPosicionado[]): Map<string, ItemPosicionado[]> {
  const mapa = new Map<string, ItemPosicionado[]>();
  for (const it of itens) {
    const k = chaveItem(it.nome);
    const arr = mapa.get(k) ?? [];
    arr.push(it);
    mapa.set(k, arr);
  }
  return mapa;
}

function tipoInventarioDoNome(nome: string): "equipamento" | "acessorio" {
  const fam = familiaDoNome(nome);
  const papel = papelGuardaDoNome(nome);
  if (papel && /estante|torre|suporte/i.test(nome)) return "equipamento";
  if (fam === "carga" || fam === "halteres" || fam === "puxadores" || fam === "funcional" || fam === "alongamento") {
    return "acessorio";
  }
  return "equipamento";
}

export interface SugestaoInventario {
  nome: string;
  qtd: number;
  destino: ItemInventario["destino"];
  sugestao: NonNullable<ItemInventario["sugestao"]>;
  tipo: NonNullable<ItemInventario["tipo"]>;
  observacao: string;
  layoutItemId?: string | null;
  valor_estimado?: number | null;
}

/**
 * Lê a planta e o inventário já lançado: reaproveitar o que está no layout
 * (sobretudo preço 0 / "incluso") e vender o que o condomínio tem e a sala nova não usa.
 */
export function sugerirInventario(cena: Cena): SugestaoInventario[] {
  const itens = cena.itens ?? [];
  const grupos = agruparLayout(itens);
  const out: SugestaoInventario[] = [];
  const cobertos = new Set<string>();

  for (const [, grupo] of grupos) {
    const amostra = grupo[0];
    const reuso = grupo.filter((it) => !it.preco).length;
    const compra = grupo.length - reuso;
    if (reuso > 0) {
      const k = chaveItem(amostra.nome);
      cobertos.add(k);
      cobertos.add(chaveTecnica(amostra.nome));
      out.push({
        nome: amostra.nome,
        qtd: reuso,
        destino: "reaproveitado",
        sugestao: "reaproveitar",
        tipo: tipoInventarioDoNome(amostra.nome),
        observacao: reuso === grupo.length
          ? "já no layout, sem custo de aquisição — reaproveitar no projeto"
          : `${reuso} de ${grupo.length} no layout sem custo; ${compra} entra como compra`,
        layoutItemId: amostra.id,
        valor_estimado: amostra.preco || null,
      });
    }
  }

  for (const inv of cena.inventario ?? []) {
    const k = chaveItem(inv.nome);
    if (cobertos.has(k) || cobertos.has(chaveTecnica(inv.nome))) continue;
    let noLayout = grupos.get(k);
    if (!noLayout) {
      const tec = chaveTecnica(inv.nome);
      for (const [, g] of grupos) {
        if (chaveTecnica(g[0].nome) === tec) { noLayout = g; break; }
      }
    }
    if (noLayout?.length) {
      cobertos.add(k);
      out.push({
        nome: inv.nome,
        qtd: inv.qtd,
        destino: "reaproveitado",
        sugestao: "reaproveitar",
        tipo: inv.tipo ?? tipoInventarioDoNome(inv.nome),
        observacao: inv.observacao || `casa com ${noLayout.length} peça(s) no layout — reaproveitar`,
        layoutItemId: noLayout[0].id,
        valor_estimado: inv.valor_estimado,
      });
    } else {
      out.push({
        nome: inv.nome,
        qtd: inv.qtd,
        destino: "residual",
        sugestao: "vender",
        tipo: inv.tipo ?? tipoInventarioDoNome(inv.nome),
        observacao: inv.observacao || "não entra no layout novo — sugerir venda ou descarte",
        layoutItemId: null,
        valor_estimado: inv.valor_estimado,
      });
    }
  }

  return out;
}

/** Junta as sugestões no inventário existente, sem duplicar o mesmo nome. */
export function mesclarInventario(atuais: ItemInventario[], cena: Cena, novoId: () => string): ItemInventario[] {
  const porNome = new Map(atuais.map((i) => [chaveItem(i.nome), i]));
  const out = [...atuais];
  for (const s of sugerirInventario({ ...cena, inventario: atuais })) {
    const k = chaveItem(s.nome);
    const ja = porNome.get(k);
    if (ja) {
      const idx = out.findIndex((x) => x.id === ja.id);
      if (idx >= 0) {
        out[idx] = {
          ...ja,
          qtd: Math.max(ja.qtd, s.qtd),
          sugestao: s.sugestao,
          tipo: ja.tipo ?? s.tipo,
          layoutItemId: s.layoutItemId ?? ja.layoutItemId,
          observacao: ja.observacao || s.observacao,
          // Preenche o valor só quando a linha ainda não tem: o número
          // digitado pelo consultor nunca é sobrescrito por re-sincronização.
          valor_estimado: ja.valor_estimado ?? s.valor_estimado ?? null,
          destino: ja.destino === s.destino ? ja.destino : ja.destino,
        };
      }
      continue;
    }
    const row: ItemInventario = {
      id: novoId(),
      nome: s.nome,
      qtd: s.qtd,
      destino: s.destino,
      sugestao: s.sugestao,
      tipo: s.tipo,
      observacao: s.observacao,
      layoutItemId: s.layoutItemId,
      valor_estimado: s.valor_estimado,
    };
    out.push(row);
    porNome.set(k, row);
  }
  return out;
}

/** Totais de um destino do inventário — por peça, não por linha. */
export interface ResumoDestino {
  pecas: number;
  /** Soma de valor_estimado × qtd. No residual é o valor de anúncio. */
  valor: number;
  /** Faixa de fechamento somada. Item sem faixa cai no próprio anúncio. */
  fechamentoMin: number;
  fechamentoMax: number;
  /** Alguém preencheu faixa de fechamento? Decide se a coluna sai no Dossiê. */
  temFaixa: boolean;
}

export interface ResumoInventario {
  reaproveitado: ResumoDestino;
  residual: ResumoDestino;
}

function somar(lista: ItemInventario[]): ResumoDestino {
  const r: ResumoDestino = { pecas: 0, valor: 0, fechamentoMin: 0, fechamentoMax: 0, temFaixa: false };
  for (const i of lista) {
    const qtd = Math.max(1, i.qtd || 1);
    const un = i.valor_estimado ?? 0;
    const min = i.valor_fechamento_min ?? null;
    const max = i.valor_fechamento_max ?? null;
    r.pecas += qtd;
    r.valor += un * qtd;
    // Sem faixa, o item entra pelo próprio anúncio: o total continua somando
    // o inventário inteiro em vez de só as linhas que o consultor detalhou.
    r.fechamentoMin += (min ?? un) * qtd;
    r.fechamentoMax += (max ?? min ?? un) * qtd;
    if (min != null || max != null) r.temFaixa = true;
  }
  return r;
}

/**
 * Fecha as contas do inventário para o Dossiê: o patrimônio que permanece e
 * o que o condomínio levanta vendendo o residual. Até aqui o PDF só somava o
 * reaproveitado — justamente o número que NÃO entra na negociação.
 */
export function resumoInventario(inventario: ItemInventario[] | undefined): ResumoInventario {
  const lista = inventario ?? [];
  return {
    reaproveitado: somar(lista.filter((i) => i.destino === "reaproveitado")),
    residual: somar(lista.filter((i) => i.destino === "residual")),
  };
}
