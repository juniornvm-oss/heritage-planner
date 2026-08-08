// Análise funcional de espaço — a fonte ÚNICA de "quanto da sala está ocupado
// e o que isso significa".
//
// A mesma pergunta tinha três respostas divergentes no app:
//   · `resumo()` (validation.ts): soma(w×h) ÷ retângulo da sala. Conta duas
//     vezes o que se sobrepõe e ignora pilar e mobiliário.
//   · pdfExport.ts, seção "Capacidade & Ocupação": refaz a conta como corpo +
//     uso e fecha com `livre = sala − Σuso`, que zera (ou ficaria negativo, se
//     não fosse o `Math.max`) em sala densa — justamente quando o número
//     importa.
//   · lamina.ts: mede as folgas REAIS entre equipamentos e só as desenha; não
//     diz se 42 cm é aceitável.
//
// Aqui as três viram uma. Duas decisões sustentam o módulo:
//   1. toda área sai de UNIÃO de retângulos, então interseção nunca é contada
//      duas vezes e `útil = uso + livre` fecha sempre;
//   2. nenhum número sai sozinho — cada métrica carrega a faixa de referência
//      e o status. "Ocupação 43%" sem régua não é informação, é curiosidade.
//
// Função pura sobre a cena: sem React, sem DOM, sem rede.

import type { Cena, ItemPosicionado, TipoArea, TipoInfra } from "./types";
import { CIRCULACAO_PADRAO, CIRCULACAO_ROTA, ELEMENTOS_PAREDE, TIPOS_AREA } from "./types";
import { areaPoligonoM2, convexoTocaRetangulo, pontoNoPoligono, type Ponto } from "./geometria";
import { gerarCotasAutomaticas } from "./lamina";
import { avaliarFixacao, centroDaEstrutura, defParede, fichaAbertura, setoresGiro } from "./esquadrias";

// ── Réguas ──────────────────────────────────────────────────────────────────

/** Ocupação funcional (área de uso ÷ área útil) até aqui é confortável. */
export const OCUPACAO_VERDE_PCT = 55;
/** Entre verde e este limite a sala funciona, mas sem folga para pico. */
export const OCUPACAO_AMBAR_PCT = 70;

/** Faixa de referência de área útil por aparelho, em m².
 *  Abaixo do mínimo não sobra piso para circular entre as estações; acima do
 *  máximo a sala está subaproveitada e cabe mais equipamento. */
export const M2_APARELHO_MIN = 4;
export const M2_APARELHO_MAX = 7;

/** Vão em que uma pessoa ainda passa de lado. Abaixo disto o espaço não é
 *  "apertado", é intransponível — daí ser o corte do vermelho, mesmo quando o
 *  projeto pede uma circulação mínima maior. */
export const PASSAGEM_MINIMA_CM = 60;

/**
 * Abaixo disto dois equipamentos estão ENCOSTADOS de propósito — bateria de
 * máquinas, esteiras em linha. Não cabe nem o tronco de uma pessoa de lado,
 * então ninguém projetou aquele vão como passagem e cobrar circulação dele é
 * alarme falso: medido cru, só o modelo Heritage acusava 31 "vãos críticos",
 * quase todos recuo de parede e esteira lado a lado. O que interessa de
 * verdade é a fenda entre 30 e 60 cm — parece passagem, e não é.
 */
export const VAO_BATERIA_CM = 30;

/** Mobiliário que NÃO tira metro quadrado: dá para pisar e treinar em cima. */
const INFRA_TRANSPONIVEL: TipoInfra[] = ["tapete"];

/** Tolerância de contato, em cm. Dois retângulos que só encostam não colidem. */
const EPS = 0.5;

// ── Tipos ───────────────────────────────────────────────────────────────────

/** `neutro` = número descritivo, sem bom nem ruim (área da sala, por exemplo). */
export type Status = "neutro" | "ok" | "atencao" | "critico";
export type ClasseVao = "ok" | "apertada" | "critica";
export type NivelAlerta = "info" | "atencao" | "critico";
export type Unidade = "m2" | "%" | "cm" | "un" | "m2/un";

/** Limites da faixa BOA, na mesma unidade da métrica. Ausente = lado aberto. */
export interface Faixa { min?: number; max?: number }

export interface Metrica {
  valor: number;
  unidade: Unidade;
  status: Status;
  /** A régua em uma linha — é o que falta hoje quando o PDF imprime só o número. */
  referencia: string;
  faixa?: Faixa;
}

/** Retângulo ortogonal em cm (mundo), cantos mínimo/máximo. */
export interface Ret { x0: number; y0: number; x1: number; y1: number }

/**
 * O que o vão É, antes de julgar quanto ele mede:
 *   · `circulacao` — entre dois equipamentos (ou equipamento e pilar/móvel).
 *     É o único que a régua de circulação julga.
 *   · `bateria`    — equipamentos encostados de propósito (< `VAO_BATERIA_CM`).
 *   · `parede`     — recuo entre equipamento e parede ou limite da sala.
 *     Aparelho encostado na parede é projeto, não defeito.
 */
export type TipoVao = "circulacao" | "bateria" | "parede";

/** Um vão medido pela lâmina, já julgado contra a circulação do projeto. */
export interface VaoClassificado {
  valorCm: number;
  /** Régua de circulação. Só significa julgamento quando `tipo` é "circulacao". */
  classe: ClasseVao;
  tipo: TipoVao;
  /** Mesmo segmento da cota desenhada na planta (cm, mundo). */
  x1: number; y1: number; x2: number; y2: number;
  /** Equipamentos nas duas pontas do vão. Vão contra parede traz um id só. */
  ids: string[];
}

export interface Folgas {
  /** Régua aplicada (cm): `cena.circulacaoMin` ou `CIRCULACAO_PADRAO`. */
  circulacaoMinCm: number;
  /** Menor vão DE CIRCULAÇÃO. `null` quando a sala não tem nenhum. */
  menorVaoCm: number | null;
  menorVao: Metrica;
  /** Contagens sobre os vãos de circulação — somam `nCirculacao`. */
  nOk: number;
  nApertada: number;
  nCritica: number;
  nCirculacao: number;
  /** Equipamentos encostados de propósito: informativo, não é defeito. */
  nBateria: number;
  /** Recuos contra parede/limite da sala, e o menor deles. */
  nRecuoParede: number;
  menorRecuoParedeCm: number | null;
  /** Todos os vãos medidos, de qualquer tipo — para desenhar na planta. */
  vaos: VaoClassificado[];
  /** Só os críticos de circulação, do mais estreito para o mais largo. */
  criticos: VaoClassificado[];
}

export interface Capacidade {
  simultaneos: Metrica;
  nAparelhos: number;
  /** Ids das estações que contam como usuário simultâneo. */
  estacoes: string[];
  /** Ids que dividem área de uso com uma estação já contada (banco colado no
   *  rack, halteres na frente da estante) — não somam usuário. */
  compartilhados: string[];
  m2UtilPorUsuario: number;
}

export interface AnaliseArea {
  id: string;
  tipo: TipoArea;
  nome: string;
  cor: string;
  m2: number;
  nItens: number;
  ids: string[];
  areaUsoM2: number;
  ocupacaoPct: number;
  status: Status;
}

export interface Alerta {
  nivel: NivelAlerta;
  texto: string;
  /** Ids dos itens envolvidos — a UI destaca na planta, o PDF lista. */
  ids?: string[];
}

/**
 * Uma abertura julgada pelo que a folha faz com o piso.
 *
 * É aqui que a variante deixa de ser rótulo: a mesma passagem de 90 cm, como
 * porta de giro, reserva 0,64 m² de piso que nenhum equipamento pode ocupar;
 * como porta de correr, reserva zero. Trocar o modelo na barra de propriedades
 * muda este registro — e, com ele, o alerta e o semáforo da planta.
 */
export interface AnaliseAbertura {
  id: string;
  tipo: "porta" | "janela";
  /** "Porta de giro · 90 cm" — o que aparece no alerta e na planta. */
  rotulo: string;
  /** A folha varre piso? Correr, sanfonada e vão livre não varrem. */
  varre: boolean;
  /** Polígonos da varredura, em cm de mundo (vazio quando não varre). */
  setores: Ponto[][];
  /** Equipamentos que invadem a varredura — a porta não abre. */
  ids: string[];
  /** Mobiliário fixo dentro da varredura (catraca, armário, bebedouro).
   *  Separado de `ids` porque a UI destaca EQUIPAMENTO por id — um id de
   *  mobiliário misturado ali viraria um realce que nunca acende. */
  idsInfra: string[];
  status: Status;
}

/** Um elemento de parede julgado contra a parede em que está preso. */
export interface AnaliseFixacao {
  elementoId: string;
  paredeId: string;
  nivel: NivelAlerta;
  /** Frase pronta: já diz o problema E a saída. */
  motivo: string;
}

export interface AnaliseEspaco {
  circulacaoMinCm: number;
  areaBrutaM2: Metrica;
  areaUtilM2: Metrica;
  areaCorpoM2: Metrica;
  areaUsoM2: Metrica;
  areaLivreM2: Metrica;
  ocupacaoFuncional: Metrica;
  m2PorAparelho: Metrica;
  capacidade: Capacidade;
  folgas: Folgas;
  porArea: AnaliseArea[];
  /** Portas e janelas da Etapa 1, julgadas pela varredura da folha. */
  aberturas: AnaliseAbertura[];
  /** Espelhos, TVs e afins julgados contra o material da parede e as aberturas. */
  fixacoes: AnaliseFixacao[];
  alertas: Alerta[];
}

// ── Geometria de retângulos ─────────────────────────────────────────────────

const areaRet = (r: Ret): number => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);

const sobrepoe = (a: Ret, b: Ret): boolean =>
  a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS;

/** Recorta pelo limite; devolve retângulo vazio (ou invertido) quando não há
 *  interseção — `areaUniaoCm2` descarta esses. */
const recortar = (r: Ret, lim: Ret): Ret => ({
  x0: Math.max(r.x0, lim.x0), y0: Math.max(r.y0, lim.y0),
  x1: Math.min(r.x1, lim.x1), y1: Math.min(r.y1, lim.y1),
});

/**
 * Área da UNIÃO de retângulos ortogonais, em cm².
 *
 * Varredura por faixas: as bordas horizontais distintas cortam o plano em
 * faixas e, dentro de cada faixa, o conjunto de retângulos ativos não muda —
 * basta somar o comprimento da união dos intervalos em X e multiplicar pela
 * altura da faixa. Para retângulos alinhados aos eixos o resultado é EXATO.
 *
 * A aproximação do módulo não está aqui: está em representar o corpo girado
 * pelo seu AABB (mesma convenção de `validation.ts` e `lamina.ts`), o que
 * superestima levemente a área de um equipamento em diagonal.
 *
 * Custo O(n² log n). Com algumas dezenas de equipamentos por sala, roda em
 * fração de milissegundo — não vale complicar com árvore de segmentos.
 */
export function areaUniaoCm2(rets: Ret[]): number {
  const validos = rets.filter((r) => r.x1 - r.x0 > 0 && r.y1 - r.y0 > 0);
  if (!validos.length) return 0;

  const cortes = Array.from(new Set(validos.flatMap((r) => [r.y0, r.y1]))).sort((a, b) => a - b);
  let total = 0;

  for (let i = 0; i < cortes.length - 1; i++) {
    const y0 = cortes[i], y1 = cortes[i + 1];
    const altura = y1 - y0;
    if (altura <= 0) continue;

    const intervalos = validos
      .filter((r) => r.y0 <= y0 && r.y1 >= y1)
      .map((r) => [r.x0, r.x1] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    let largura = 0;
    let ini: number | null = null;
    let fim = 0;
    for (const [x0, x1] of intervalos) {
      if (ini === null) { ini = x0; fim = x1; continue; }
      if (x0 > fim) { largura += fim - ini; ini = x0; fim = x1; }
      else if (x1 > fim) fim = x1;
    }
    if (ini !== null) largura += fim - ini;

    total += largura * altura;
  }
  return total;
}

/**
 * AABB do item inflado por margens LOCAIS (`mx` lateral, `my` frontal) e
 * girado em torno do centro.
 *
 * Diferença consciente em relação a `validation.ts`, que infla o AABB já
 * girado: lá, um aparelho a 90° recebe a margem frontal no eixo Y da sala em
 * vez de na frente do próprio aparelho. Aqui a margem nasce colada ao corpo e
 * gira com ele, que é o que a folga significa em obra.
 */
function caixaGirada(it: ItemPosicionado, mx: number, my: number): Ret {
  const th = ((it.rotacao || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  const w = it.w_cm + 2 * mx, h = it.h_cm + 2 * my;
  const lw = w * c + h * s, lh = w * s + h * c;
  const cx = it.x_cm + it.w_cm / 2, cy = it.y_cm + it.h_cm / 2;
  return { x0: cx - lw / 2, y0: cy - lh / 2, x1: cx + lw / 2, y1: cy + lh / 2 };
}

/** Retângulo do CORPO do equipamento (o que ele ocupa parado). */
export const corpoDe = (it: ItemPosicionado): Ret => caixaGirada(it, 0, 0);

/** Retângulo da ÁREA DE USO: corpo + margem de operação do catálogo. Sem
 *  margem cadastrada, uso = corpo (e a análise avisa que está subestimada). */
export const usoDe = (it: ItemPosicionado): Ret =>
  caixaGirada(it, it.uso_lateral_cm || 0, it.uso_frontal_cm || 0);

/** Pilares e mobiliário fixo: o que tira metro quadrado do piso aproveitável. */
function obstaculosDe(cena: Cena): Ret[] {
  const rets: Ret[] = [];
  const legado = cena.sala.config?.pilar;
  if (legado) rets.push({ x0: legado.x, y0: legado.y, x1: legado.x + legado.w, y1: legado.y + legado.h });
  for (const p of cena.estrutura?.pilares ?? []) {
    rets.push({ x0: p.x_cm, y0: p.y_cm, x1: p.x_cm + p.w_cm, y1: p.y_cm + p.h_cm });
  }
  for (const i of cena.infra ?? []) {
    if (INFRA_TRANSPONIVEL.includes(i.tipo)) continue;
    // Mobiliário gira na tela: o AABB do corpo girado é o piso que ele tira.
    const th = ((i.rotacao || 0) * Math.PI) / 180;
    const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    const w = i.w_cm * c + i.h_cm * s, h = i.w_cm * s + i.h_cm * c;
    const cx = i.x_cm + i.w_cm / 2, cy = i.y_cm + i.h_cm / 2;
    rets.push({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });
  }
  return rets;
}

// ── Formatação e status ─────────────────────────────────────────────────────

const arred = (v: number, casas = 2): number => {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};
const num = (v: number, casas = 1): string => v.toFixed(casas).replace(".", ",");

const metrica = (valor: number, unidade: Unidade, status: Status, referencia: string, faixa?: Faixa): Metrica =>
  ({ valor, unidade, status, referencia, ...(faixa ? { faixa } : {}) });

/** Semáforo da ocupação funcional: verde < 55%, âmbar até 70%, vermelho acima. */
export function statusOcupacao(pct: number): Status {
  if (pct < OCUPACAO_VERDE_PCT) return "ok";
  if (pct <= OCUPACAO_AMBAR_PCT) return "atencao";
  return "critico";
}

/**
 * Julga um vão contra a circulação exigida no projeto.
 * `apertada` = passa uma pessoa, mas duas não se cruzam; `critica` = ninguém
 * passa. O corte do crítico nunca sobe acima de `PASSAGEM_MINIMA_CM`, senão um
 * projeto que exigisse 120 cm marcaria como intransponível um vão de 100 cm.
 */
export function classificarVao(valorCm: number, circulacaoMinCm: number): ClasseVao {
  if (valorCm >= circulacaoMinCm) return "ok";
  return valorCm < Math.min(PASSAGEM_MINIMA_CM, circulacaoMinCm) ? "critica" : "apertada";
}

// ── Análise ─────────────────────────────────────────────────────────────────

export function analisarEspaco(cena: Cena): AnaliseEspaco {
  const itens = cena.itens ?? [];
  const largura = Math.max(0, cena.sala?.largura_cm || 0);
  const profundidade = Math.max(0, cena.sala?.profundidade_cm || 0);
  const salaRet: Ret = { x0: 0, y0: 0, x1: largura, y1: profundidade };
  const circulacaoMinCm = Math.max(1, cena.circulacaoMin || CIRCULACAO_PADRAO);

  // Tudo recortado pela sala: equipamento que extrapola o limite não inventa
  // metro quadrado que não existe (a colisão é problema da validação).
  const corpos = itens.map((i) => recortar(corpoDe(i), salaRet));
  const usos = itens.map((i) => recortar(usoDe(i), salaRet));
  const obstaculos = obstaculosDe(cena).map((r) => recortar(r, salaRet));

  const brutaCm2 = largura * profundidade;
  const obstCm2 = areaUniaoCm2(obstaculos);
  const utilCm2 = Math.max(0, brutaCm2 - obstCm2);

  // União(X ∪ obstáculos) − obstáculos = a parte de X que cai em piso ÚTIL.
  // É o truque que faz `útil = uso + livre` fechar sem subtração de polígonos.
  const soUtil = (rets: Ret[]): number => Math.max(0, areaUniaoCm2([...rets, ...obstaculos]) - obstCm2);
  const corpoCm2 = soUtil(corpos);
  const usoCm2 = soUtil(usos);
  const livreCm2 = Math.max(0, utilCm2 - usoCm2);

  const brutaM2 = arred(brutaCm2 / 10000);
  const utilM2 = arred(utilCm2 / 10000);
  const corpoM2 = arred(corpoCm2 / 10000);
  const usoM2 = arred(usoCm2 / 10000);
  const livreM2 = arred(livreCm2 / 10000);
  const ocupPct = utilCm2 > 0 ? arred((usoCm2 / utilCm2) * 100, 1) : 0;
  const statusOcup = statusOcupacao(ocupPct);

  const m2Aparelho = itens.length ? arred(utilM2 / itens.length) : 0;
  // Fora da faixa dos dois lados é "atenção", mas por motivos opostos: apertado
  // demais embaixo, dinheiro parado em cima. O texto do alerta separa os dois.
  const statusM2Aparelho: Status = !itens.length ? "neutro"
    : m2Aparelho < M2_APARELHO_MIN || m2Aparelho > M2_APARELHO_MAX ? "atencao" : "ok";

  // ── Capacidade: estações que podem ser usadas AO MESMO TEMPO ──
  // `itens.length` conta halter, banco e rack como três usuários mesmo quando
  // as três áreas de uso se sobrepõem. Aqui vale conjunto independente:
  // guloso pela menor área de uso (aproximação — o conjunto independente
  // máximo é NP-difícil; guloso dá um piso honesto, nunca infla o número).
  const porUso = [...itens].sort((a, b) => areaRet(usoDe(a)) - areaRet(usoDe(b)) || a.id.localeCompare(b.id));
  const estacoes: ItemPosicionado[] = [];
  const compartilhados: string[] = [];
  for (const it of porUso) {
    const r = usoDe(it);
    if (estacoes.some((e) => sobrepoe(usoDe(e), r))) compartilhados.push(it.id);
    else estacoes.push(it);
  }
  const simultaneos = estacoes.length;
  const perda = itens.length ? 1 - simultaneos / itens.length : 0;
  const statusCap: Status = !itens.length ? "neutro" : perda <= 0.15 ? "ok" : perda <= 0.35 ? "atencao" : "critico";

  // ── Folgas: as cotas da lâmina, agora julgadas ──
  const TOL = 1.5;
  const caixasItens = itens.map((i) => corpoDe(i));
  const tocaCaixa = (x: number, y: number, b: Ret): boolean =>
    x >= b.x0 - TOL && x <= b.x1 + TOL && y >= b.y0 - TOL && y <= b.y1 + TOL;

  // Paredes ortogonais da Etapa 1 (mesmo recorte da lâmina) — servem só para
  // separar RECUO de CIRCULAÇÃO, já que `CotaAuto` não diz quem é o vizinho.
  const paredesRet: Ret[] = (cena.estrutura?.paredes ?? [])
    .filter((w) => Math.abs(w.x1 - w.x2) < 0.5 || Math.abs(w.y1 - w.y2) < 0.5)
    .map((w) => {
      const e = Math.max(w.espessura_cm, 4) / 2;
      return {
        x0: Math.min(w.x1, w.x2) - e, y0: Math.min(w.y1, w.y2) - e,
        x1: Math.max(w.x1, w.x2) + e, y1: Math.max(w.y1, w.y2) + e,
      };
    });
  const naParede = (x: number, y: number): boolean =>
    Math.abs(x) <= TOL || Math.abs(x - largura) <= TOL
    || Math.abs(y) <= TOL || Math.abs(y - profundidade) <= TOL
    || paredesRet.some((r) => x >= r.x0 - TOL && x <= r.x1 + TOL && y >= r.y0 - TOL && y <= r.y1 + TOL);

  const vaos: VaoClassificado[] = gerarCotasAutomaticas(cena).map((c) => {
    const ids = itens
      .filter((_, k) => tocaCaixa(c.x1, c.y1, caixasItens[k]) || tocaCaixa(c.x2, c.y2, caixasItens[k]))
      .map((i) => i.id);
    const tipo: TipoVao = naParede(c.x1, c.y1) || naParede(c.x2, c.y2)
      ? "parede"
      : c.valor < VAO_BATERIA_CM ? "bateria" : "circulacao";
    return {
      valorCm: arred(c.valor, 1),
      classe: classificarVao(c.valor, circulacaoMinCm),
      tipo,
      x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2,
      ids,
    };
  });

  const circulacao = vaos.filter((v) => v.tipo === "circulacao");
  const recuos = vaos.filter((v) => v.tipo === "parede");
  const criticos = circulacao.filter((v) => v.classe === "critica").sort((a, b) => a.valorCm - b.valorCm);
  const nApertada = circulacao.filter((v) => v.classe === "apertada").length;
  const menorVaoCm = circulacao.length ? Math.min(...circulacao.map((v) => v.valorCm)) : null;
  const limiteCritico = Math.min(PASSAGEM_MINIMA_CM, circulacaoMinCm);

  // ── Por área funcional ──
  const porArea: AnaliseArea[] = (cena.areas ?? []).map((a) => {
    const pts = a.pontos ?? [];
    const bbox: Ret = { x0: a.x_cm, y0: a.y_cm, x1: a.x_cm + a.w_cm, y1: a.y_cm + a.h_cm };
    // Polígono é a fonte da verdade; áreas legadas só têm o bbox.
    const m2Area = pts.length >= 3 ? arred(areaPoligonoM2(pts)) : arred(areaRet(bbox) / 10000);
    const dentro = itens.filter((i) => {
      const centro = { x: i.x_cm + i.w_cm / 2, y: i.y_cm + i.h_cm / 2 };
      return pts.length >= 3
        ? pontoNoPoligono(centro, pts)
        : centro.x >= bbox.x0 && centro.x <= bbox.x1 && centro.y >= bbox.y0 && centro.y <= bbox.y1;
    });
    // Aproximação: a área de uso é recortada pelo BBOX da região, não pelo
    // polígono — recorte poligonal exigiria clipping e o ganho não paga.
    // Como o bbox de um polígono é MAIOR que ele, o quociente pode passar de
    // 100% — e "122% de ocupação" num documento técnico mina a confiança em
    // todos os outros números. O teto em 100% é o preço honesto da aproximação.
    const usoAreaCm2 = areaUniaoCm2(dentro.map((i) => recortar(usoDe(i), recortar(bbox, salaRet))));
    const ocup = m2Area > 0 ? Math.min(100, arred((usoAreaCm2 / 10000 / m2Area) * 100, 1)) : 0;
    return {
      id: a.id,
      tipo: a.tipo,
      nome: a.nome || TIPOS_AREA[a.tipo].label,
      cor: TIPOS_AREA[a.tipo].cor,
      m2: m2Area,
      nItens: dentro.length,
      ids: dentro.map((i) => i.id),
      areaUsoM2: arred(usoAreaCm2 / 10000),
      ocupacaoPct: ocup,
      // Circulação é área que existe para ficar VAZIA: qualquer ocupação já é
      // desvio, então ela não usa o semáforo das zonas de treino.
      status: a.tipo === "circulacao" ? (dentro.length ? "critico" : "ok") : statusOcupacao(ocup),
    };
  });

  // ── Aberturas: o piso que a folha da porta reserva ──
  //
  // Um leque de 90° com 90 cm de raio come 0,64 m² de piso. Até aqui esse piso
  // era invisível para o app: o consultor encostava a esteira na porta, o
  // desenho não reclamava e a descoberta acontecia na entrega. Note o que NÃO
  // se faz aqui: o setor não entra em `obstaculosDe` nem sai da área útil. Ele
  // não é obstáculo (dá para treinar ali, só não dá para deixar máquina), e
  // subtraí-lo quebraria a identidade `útil = uso + livre`.
  const paredesCena = cena.estrutura?.paredes ?? [];
  const paredesPorId = new Map(paredesCena.map((p) => [p.id, p]));
  const centroSala = centroDaEstrutura(cena.estrutura, { x: largura / 2, y: profundidade / 2 });
  const aberturasCena = cena.estrutura?.aberturas ?? [];
  const aberturas: AnaliseAbertura[] = [];
  for (const ab of aberturasCena) {
    const w = paredesPorId.get(ab.paredeId);
    if (!w) continue; // abertura órfã: a parede foi apagada
    const f = fichaAbertura(ab);
    // `paredesCena` vai junto: é o que permite acertar o "para dentro" em
    // planta em L, onde o centro do conjunto cai fora da sala.
    const setores = setoresGiro(ab, w, centroSala, paredesCena);
    const toca = (r: Ret) => {
      const ret = { x_cm: r.x0, y_cm: r.y0, w_cm: r.x1 - r.x0, h_cm: r.y1 - r.y0 };
      return setores.some((s) => convexoTocaRetangulo(s, ret));
    };
    // Mobiliário fixo bloqueia a folha tanto quanto um aparelho: a catraca na
    // entrada é o caso clássico, e ela mora em `cena.infra`, não em `itens`.
    const dentro = setores.length ? itens.filter((i) => toca(corpoDe(i))) : [];
    const dentroInfra = setores.length
      ? (cena.infra ?? []).filter((i) => {
          if (INFRA_TRANSPONIVEL.includes(i.tipo)) return false;
          // AABB do mobiliário girado — a catraca a 45° bloqueia a folha
          // exatamente como aparece na tela.
          const th = ((i.rotacao || 0) * Math.PI) / 180;
          const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
          const w2 = (i.w_cm * c + i.h_cm * s) / 2, h2 = (i.w_cm * s + i.h_cm * c) / 2;
          const cx = i.x_cm + i.w_cm / 2, cy = i.y_cm + i.h_cm / 2;
          return toca({ x0: cx - w2, y0: cy - h2, x1: cx + w2, y1: cy + h2 });
        })
      : [];
    aberturas.push({
      id: ab.id,
      tipo: ab.tipo,
      rotulo: `${f.label} · ${Math.round(f.largura_cm)} cm`,
      varre: setores.length > 0,
      setores,
      ids: dentro.map((i) => i.id),
      idsInfra: dentroInfra.map((i) => i.id),
      status: dentro.length || dentroInfra.length ? "critico" : setores.length ? "ok" : "neutro",
    });
  }

  // ── Fixações: o que a parede aguenta e o que a abertura atrapalha ──
  const fixacoes: AnaliseFixacao[] = [];
  for (const el of cena.elementosParede ?? []) {
    const w = paredesPorId.get(el.paredeId);
    if (!w) continue; // elemento órfão de parede apagada
    const rotuloEl = ELEMENTOS_PAREDE[el.tipo]?.label ?? el.tipo;
    const fix = avaliarFixacao(w.material, el.tipo, w.reforcada);
    if (!fix.ok) {
      fixacoes.push({
        elementoId: el.id, paredeId: el.paredeId,
        nivel: fix.nivel === "nao_recebe" ? "critico" : "atencao",
        motivo: `${rotuloEl} em ${defParede(w.material).label}: ${fix.motivo}`,
      });
    }
    // Sobreposição com abertura: o vão não tem parede atrás para receber
    // parafuso, e tapar janela com espelho tira a iluminação que a esquadria
    // existe para dar. Testa nos dois eixos — elemento acima da verga passa.
    const e0 = el.offset_cm - el.largura_cm / 2, e1 = el.offset_cm + el.largura_cm / 2;
    const eBaixo = el.dist_piso_cm, eAlto = el.dist_piso_cm + el.altura_cm;
    for (const ab of aberturasCena) {
      if (ab.paredeId !== el.paredeId) continue;
      const f = fichaAbertura(ab);
      const a0 = ab.centro_cm - f.largura_cm / 2, a1 = ab.centro_cm + f.largura_cm / 2;
      if (e1 <= a0 + EPS || e0 >= a1 - EPS) continue;
      const aBaixo = f.peitoril_cm ?? 0, aAlto = aBaixo + f.altura_cm;
      if (eAlto <= aBaixo + EPS || eBaixo >= aAlto - EPS) continue;
      fixacoes.push({
        elementoId: el.id, paredeId: el.paredeId,
        nivel: "critico",
        motivo: `${rotuloEl} sobrepõe ${f.label.toLowerCase()} de ${Math.round(f.largura_cm)} cm — não há parede atrás do vão para fixar, e a esquadria fica tapada.`,
      });
      break; // um conflito por elemento basta para o consultor agir
    }
  }

  // ── Alertas ──
  const alertas: Alerta[] = [];
  const push = (nivel: NivelAlerta, texto: string, ids?: string[]) => {
    alertas.push(ids && ids.length ? { nivel, texto, ids } : { nivel, texto });
  };

  if (brutaCm2 <= 0) {
    push("critico", "Sala sem dimensões: informe largura e profundidade para a análise valer.");
  } else if (!itens.length) {
    push("info", `Sala de ${num(brutaM2)} m² sem equipamento posicionado — nada a analisar ainda.`);
  }

  if (itens.length) {
    if (statusOcup === "critico") {
      push("critico", `Ocupação funcional de ${num(ocupPct)}% da área útil (limite ${OCUPACAO_AMBAR_PCT}%). A sala trava no horário de pico.`);
    } else if (statusOcup === "atencao") {
      push("atencao", `Ocupação funcional de ${num(ocupPct)}% da área útil — funciona, mas sem folga para pico (confortável até ${OCUPACAO_VERDE_PCT}%).`);
    }

    if (m2Aparelho < M2_APARELHO_MIN) {
      push("atencao", `${num(m2Aparelho)} m² úteis por aparelho, abaixo dos ${M2_APARELHO_MIN} m² de referência: revise a quantidade de estações antes do layout.`);
    } else if (m2Aparelho > M2_APARELHO_MAX) {
      push("info", `${num(m2Aparelho)} m² úteis por aparelho, acima dos ${M2_APARELHO_MAX} m² de referência: há espaço para ampliar o programa.`);
    }

    const semUso = itens.filter((i) => !i.uso_frontal_cm && !i.uso_lateral_cm);
    if (semUso.length) {
      push("info", `${semUso.length} de ${itens.length} equipamentos sem área de uso cadastrada — a ocupação funcional está subestimada.`, semUso.map((i) => i.id));
    }

    const fora = itens.filter((i) => {
      const c = corpoDe(i);
      return c.x0 < -EPS || c.y0 < -EPS || c.x1 > largura + EPS || c.y1 > profundidade + EPS;
    });
    if (fora.length) {
      push("atencao", `${fora.length} equipamento(s) ultrapassam o limite da sala; a parte de fora não entra na conta de área.`, fora.map((i) => i.id));
    }

    if (compartilhados.length) {
      push("atencao", `${simultaneos} usuários simultâneos para ${itens.length} aparelhos: ${compartilhados.length} estação(ões) dividem área de uso com a vizinha.`, compartilhados);
    }
  }

  if (criticos.length) {
    const ids = Array.from(new Set(criticos.flatMap((v) => v.ids)));
    push("critico", `${criticos.length} vão(s) de circulação abaixo de ${limiteCritico} cm — o menor tem ${num(criticos[0].valorCm, 0)} cm: espaço morto, ninguém passa por ele.`, ids);
  }
  if (nApertada) {
    push("atencao", `${nApertada} vão(s) entre ${limiteCritico} e ${circulacaoMinCm} cm: passa uma pessoa, duas não se cruzam.`);
  }

  for (const a of porArea) {
    if (a.tipo === "circulacao" && a.nItens) {
      push("critico", `${a.nome}: ${a.nItens} equipamento(s) dentro de área que deveria ficar livre.`, a.ids);
    } else if (a.status === "critico") {
      push("atencao", `${a.nome}: ${num(a.ocupacaoPct)}% de ocupação em ${num(a.m2)} m² — acima do limite de ${OCUPACAO_AMBAR_PCT}%.`, a.ids);
    }
  }
  for (const ab of aberturas) {
    const nE = ab.ids.length, nM = ab.idsInfra.length;
    if (!nE && !nM) continue;
    const quem = [nE ? `${nE} equipamento(s)` : "", nM ? `${nM} item(ns) de mobiliário` : ""].filter(Boolean).join(" e ");
    push(
      "critico",
      `${ab.rotulo}: ${quem} dentro da varredura da folha — a porta não abre. Recuar a peça, inverter o lado de abertura ou trocar por porta de correr resolve.`,
      ab.ids,
    );
  }
  for (const f of fixacoes) push(f.nivel, f.motivo);

  // Largura da circulação: o bbox é o que existe em toda área, com ou sem
  // polígono, e o lado menor é o gargalo por onde a rota passa.
  for (const a of cena.areas ?? []) {
    if (a.tipo !== "circulacao") continue;
    const lado = Math.min(a.w_cm, a.h_cm);
    if (lado > 0 && lado < CIRCULACAO_ROTA) {
      push("atencao", `${a.nome || TIPOS_AREA[a.tipo].label}: ${num(lado, 0)} cm de largura, abaixo dos ${CIRCULACAO_ROTA} cm exigidos em rota de saída.`);
    }
  }

  const ordem: Record<NivelAlerta, number> = { critico: 0, atencao: 1, info: 2 };
  alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);

  return {
    circulacaoMinCm,
    areaBrutaM2: metrica(brutaM2, "m2", "neutro", "Retângulo da sala (largura × profundidade), antes de descontar qualquer obstáculo."),
    areaUtilM2: metrica(utilM2, "m2", "neutro", "Piso aproveitável: área bruta menos pilares e mobiliário fixo. É o denominador de tudo aqui."),
    areaCorpoM2: metrica(corpoM2, "m2", "neutro", "Piso sob os equipamentos parados, sem margem de operação (união — sobreposição não conta duas vezes)."),
    areaUsoM2: metrica(usoM2, "m2", "neutro", "Corpo + margem de operação, em união. É o que a sala perde enquanto o aparelho está em uso."),
    areaLivreM2: metrica(
      livreM2, "m2", statusOcup,
      `Piso útil fora de qualquer área de uso. Referência: pelo menos ${100 - OCUPACAO_AMBAR_PCT}% da área útil (${num(arred((utilM2 * (100 - OCUPACAO_AMBAR_PCT)) / 100))} m² nesta sala).`,
      { min: arred((utilM2 * (100 - OCUPACAO_AMBAR_PCT)) / 100) },
    ),
    ocupacaoFuncional: metrica(
      ocupPct, "%", statusOcup,
      `Área de uso ÷ área útil. Confortável abaixo de ${OCUPACAO_VERDE_PCT}%, aceitável até ${OCUPACAO_AMBAR_PCT}%, saturada acima.`,
      { max: OCUPACAO_VERDE_PCT },
    ),
    m2PorAparelho: metrica(
      m2Aparelho, "m2/un", statusM2Aparelho,
      `Área útil ÷ nº de aparelhos. Referência de ${M2_APARELHO_MIN} a ${M2_APARELHO_MAX} m²: abaixo não sobra circulação, acima a sala está subaproveitada.`,
      { min: M2_APARELHO_MIN, max: M2_APARELHO_MAX },
    ),
    capacidade: {
      simultaneos: metrica(
        simultaneos, "un", statusCap,
        "Estações utilizáveis ao mesmo tempo sem invadir a área de uso da vizinha. Referência: perder no máximo 15% dos aparelhos por sobreposição.",
        { min: Math.ceil(itens.length * 0.85) },
      ),
      nAparelhos: itens.length,
      estacoes: estacoes.map((i) => i.id),
      compartilhados,
      m2UtilPorUsuario: simultaneos ? arred(utilM2 / simultaneos) : 0,
    },
    folgas: {
      circulacaoMinCm,
      menorVaoCm,
      menorVao: metrica(
        menorVaoCm ?? 0, "cm",
        menorVaoCm === null ? "neutro"
          : classificarVao(menorVaoCm, circulacaoMinCm) === "ok" ? "ok"
            : classificarVao(menorVaoCm, circulacaoMinCm) === "apertada" ? "atencao" : "critico",
        `Menor passagem entre equipamentos (recuo de parede e aparelho encostado não entram). Mínimo do projeto: ${circulacaoMinCm} cm; rota de saída pede ${CIRCULACAO_ROTA} cm.`,
        { min: circulacaoMinCm },
      ),
      nOk: circulacao.length - nApertada - criticos.length,
      nApertada,
      nCritica: criticos.length,
      nCirculacao: circulacao.length,
      nBateria: vaos.filter((v) => v.tipo === "bateria").length,
      nRecuoParede: recuos.length,
      menorRecuoParedeCm: recuos.length ? Math.min(...recuos.map((v) => v.valorCm)) : null,
      vaos,
      criticos,
    },
    porArea,
    aberturas,
    fixacoes,
    alertas,
  };
}
