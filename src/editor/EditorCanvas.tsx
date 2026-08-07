import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Rect, Line, Group, Text, Image as KImage, Circle } from "react-konva";
import type Konva from "konva";
import { useProjeto } from "../store/projetoStore";
import { ZONAS, type ItemPosicionado, type Parede, type PilarPlanta, type Abertura } from "../lib/types";
import { problemasDaCena, type Problema } from "../lib/validation";
import { GRID_CM } from "../lib/canvas";
import { folgaAte, resolverSnapItem, tolCmPorZoom, type AlvoSnap, type CtxSnap, type FolgaViva } from "../lib/snap";
import { formatLength } from "../lib/units";
import { arred } from "../lib/estrutura";
import { areaPoligonoM2, projetarNoSegmento, m2, type Ponto } from "../lib/geometria";
import { analisarEspaco } from "../lib/analiseEspaco";
import {
  MATERIAIS_PILAR, MODELO_JANELA_PADRAO, MODELO_PORTA_PADRAO, PAREDES, PORTAS, JANELAS,
  centroDaEstrutura, contornoPilar, defParede, simboloAbertura,
  type FormaJanela, type FormaPilar, type LadoAbertura, type MaterialParede,
  type MaterialPilar, type ModeloJanela, type ModeloPorta, type SentidoAbertura,
} from "../lib/esquadrias";
import { gerarCotasAutomaticas } from "../lib/lamina";
import { MATERIAIS_PISO, ELEMENTOS_PAREDE, PAPEL_LADO, LADOS_PADRAO, TIPOS_AREA, type CamadasLamina, type TipoElementoParede, type LadoRect } from "../lib/types";
import { CANVAS, TOKENS } from "../ui/tokens";
import { CIRCULACAO_PADRAO } from "../lib/types";
import PreviewFX, { type PreviewProps } from "./PreviewFX";
import { halo } from "./konvaMotion";

export type Etapa = "planta" | "acabamento" | "areas" | "layout" | "fichas" | "curadoria" | "acessorios";
export type FerramentaEstrutura = "parede" | "porta" | "janela" | "pilar" | "apagar" | null;
export type FerramentaAcab = "rect" | "poligono" | "cota" | "espelho" | "itemParede" | "apagar" | null;

/**
 * Os PADRÕES DA FERRAMENTA — o que a próxima parede/porta/janela/pilar vai
 * ser, escolhido no flyout da caixa de ferramentas e editável na barra de
 * propriedades enquanto nada está selecionado.
 *
 * É a metade do modelo do CorelDraw que costuma faltar: lá, a barra de
 * propriedades sem seleção configura a PRÓXIMA forma. Sem isto, escolher
 * "porta de correr" no flyout desenharia uma porta de giro assim mesmo.
 */
export interface PadroesPlanta {
  materialParede: MaterialParede;
  espessuraParede: number;
  paredeReforcada: boolean;
  modeloPorta: ModeloPorta;
  larguraPorta: number;
  ladoPorta: LadoAbertura;
  sentidoPorta: SentidoAbertura;
  modeloJanela: ModeloJanela;
  larguraJanela: number;
  formaJanela: FormaJanela;
  formaPilar: FormaPilar;
  materialPilar: MaterialPilar;
}

/** Espelho vivo do ponteiro para a barra de status (cm de mundo + zoom). */
export interface EstadoPonteiro { x: number; y: number; zoom: number; dentro: boolean }

export const PADROES_PLANTA: PadroesPlanta = {
  materialParede: "alvenaria", espessuraParede: PAREDES.alvenaria.espessura_cm, paredeReforcada: false,
  modeloPorta: MODELO_PORTA_PADRAO, larguraPorta: PORTAS[MODELO_PORTA_PADRAO].vao_cm,
  ladoPorta: "direita", sentidoPorta: "dentro",
  modeloJanela: MODELO_JANELA_PADRAO, larguraJanela: JANELAS[MODELO_JANELA_PADRAO].vao_cm,
  formaJanela: "retangular",
  formaPilar: "retangular", materialPilar: "concreto",
};

// Ponto mais próximo sobre um segmento (parede) e distância — para encaixar aberturas.
function projetarNaParede(px: number, py: number, w: Parede) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len2 = dx * dx + dy * dy || 1;
  let t = ((px - w.x1) * dx + (py - w.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = w.x1 + t * dx, cy = w.y1 + t * dy;
  return { t, cx, cy, dist: Math.hypot(px - cx, py - cy), len: Math.hypot(dx, dy) };
}

function useHtmlImage(src?: string) {
  const [img, setImg] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    if (!src) { setImg(undefined); return; }
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  return img;
}

interface Cam { zoom: number; x: number; y: number } // x,y = posição da layer em px

export default function EditorCanvas({ modoCalibrar, onCalibrar, ferrAcab, tipoElemParede, snapPasso, camadas, apresentacao, lamina, modoVista, onVista, onArea, modoRecorte, onRecorte, modoParede, onParede, modoMoverPlanta, stageRef, somenteLeitura, etapa, ferrEstrutura, padroes, ponteiroExternoRef, camadasLamina }: {
  modoCalibrar: boolean;
  onCalibrar: (distanciaMundoCm: number) => void;
  ferrAcab?: FerramentaAcab; // ferramentas da Etapa 2 (área/polígono/cota/apagar)
  tipoElemParede?: TipoElementoParede; // tipo a inserir quando ferrAcab === "itemParede"
  snapPasso?: number; // 0 = snap de grade desligado; 1/5/10 cm
  camadas?: "tudo" | "uso" | "nada"; // camadas técnicas do equipamento (uso/segurança)
  apresentacao?: boolean; // modo limpo para apresentar ao condomínio
  lamina?: boolean; // Lâmina do Arquiteto: cotas automáticas de afastamento
  modoVista?: boolean; // Vista IA: 2 toques (câmera + direção) geram prompt
  onVista?: (p1: Ponto, p2: Ponto) => void;
  onArea: (pontos: Ponto[]) => void;
  modoRecorte: boolean;
  onRecorte: (rect: { x: number; y: number; w: number; h: number }) => void;
  modoParede: boolean;
  onParede: (p1: { x: number; y: number }, p2: { x: number; y: number }) => void;
  modoMoverPlanta: boolean;
  stageRef?: React.RefObject<Konva.Stage>;
  somenteLeitura?: boolean;
  etapa?: Etapa;
  ferrEstrutura?: FerramentaEstrutura;
  /** O que a próxima parede/porta/janela/pilar vai ser (flyout + barra de propriedades). */
  padroes?: PadroesPlanta;
  /** Espelho do ponteiro e do zoom para a barra de status ler por rAF, sem
   *  re-renderizar o canvas a cada movimento do dedo. */
  ponteiroExternoRef?: React.MutableRefObject<EstadoPonteiro>;
  /**
   * MODO LÂMINA: desenha exatamente as camadas pedidas, e nada além.
   *
   * É o que permite ao mesmo canvas servir de prévia viva no editor de lâminas
   * e de fonte da captura que vai ao PDF — a lâmina impressa não pode ser uma
   * segunda implementação do desenho, ou ela diverge do que foi aprovado na
   * tela. Presente = a vista é uma lâmina: sem seleção, sem realce de problema
   * e sem nada que não esteja ligado.
   */
  camadasLamina?: CamadasLamina | null;
}) {
  const etapaAtual: Etapa = etapa ?? "layout";
  const pad = padroes ?? PADROES_PLANTA;
  /** `null` no editor normal; em modo lâmina, o que pode aparecer. */
  const LAM = camadasLamina ?? null;
  const ver = (c: keyof CamadasLamina) => !LAM || LAM[c];
  const cena = useProjeto((s) => s.cena);
  const selectedId = useProjeto((s) => s.selectedId);
  const selectedAcabId = useProjeto((s) => s.selectedAcabId);
  const selEstrutura = useProjeto((s) => s.selEstrutura);
  const selecionar = useProjeto((s) => s.selecionar);
  const selecionarAcab = useProjeto((s) => s.selecionarAcab);
  const selecionarEstrutura = useProjeto((s) => s.selecionarEstrutura);
  const addParede = useProjeto((s) => s.addParede);
  const addPilar = useProjeto((s) => s.addPilar);
  const addAbertura = useProjeto((s) => s.addAbertura);
  const updateParede = useProjeto((s) => s.updateParede);
  const updatePilar = useProjeto((s) => s.updatePilar);
  const removerParede = useProjeto((s) => s.removerParede);
  const removerPilar = useProjeto((s) => s.removerPilar);
  const removerAbertura = useProjeto((s) => s.removerAbertura);
  const updateItem = useProjeto((s) => s.updateItem);
  const updateArea = useProjeto((s) => s.updateArea);
  const updateAreaFuncional = useProjeto((s) => s.updateAreaFuncional);
  const moverArea = useProjeto((s) => s.moverArea);
  const removerArea = useProjeto((s) => s.removerArea);
  const addCota = useProjeto((s) => s.addCota);
  const removerCota = useProjeto((s) => s.removerCota);
  const selElemParedeId = useProjeto((s) => s.selElemParedeId);
  const selecionarElemParede = useProjeto((s) => s.selecionarElemParede);
  const addElemParede = useProjeto((s) => s.addElemParede);
  const updateElemParede = useProjeto((s) => s.updateElemParede);
  const removerElemParede = useProjeto((s) => s.removerElemParede);
  const selInfraId = useProjeto((s) => s.selInfraId);
  const selecionarInfra = useProjeto((s) => s.selecionarInfra);
  const updateInfra = useProjeto((s) => s.updateInfra);
  const removerInfra = useProjeto((s) => s.removerInfra);
  const updatePlanta = useProjeto((s) => s.updatePlanta);
  const updatePlantaVetorial = useProjeto((s) => s.updatePlantaVetorial);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [cam, setCam] = useState<Cam>({ zoom: 0.4, x: 60, y: 60 });
  const pan = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const [calPts, setCalPts] = useState<{ x: number; y: number }[]>([]);
  const [areaPts, setAreaPts] = useState<{ x: number; y: number }[]>([]);
  const [recPts, setRecPts] = useState<{ x: number; y: number }[]>([]);
  const [pardPts, setPardPts] = useState<{ x: number; y: number }[]>([]);
  const [estPts, setEstPts] = useState<{ x: number; y: number }[]>([]); // paredes/pilares da Etapa 1
  const [polyPts, setPolyPts] = useState<Ponto[]>([]); // polígono de piso em desenho
  const [cotaPts, setCotaPts] = useState<Ponto[]>([]); // cota em desenho
  const [vistaPts, setVistaPts] = useState<Ponto[]>([]); // câmera da Vista IA
  /** Ponteiro em coordenadas de mundo, já encaixado — alimenta o `PreviewFX`. */
  const ponteiroRef = useRef<Ponto | null>(null);
  // Estado VIVO do arraste. Em refs, não em estado do React: são lidos por
  // requestAnimationFrame dentro do `ArrasteFX`, que é o único componente que
  // re-renderiza durante o movimento do dedo.
  const origemArraste = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const guiasRef = useRef<AlvoSnap[]>([]);
  const folgasRef = useRef<FolgaViva[]>([]);

  const plantaImg = useHtmlImage(cena.planta?.dataUrl);

  // Ajusta tamanho ao container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const sala = cena.sala;

  /** Enquadra a sala inteira na área visível. */
  const enquadrar = useCallback((w = size.w, h = size.h) => {
    const margem = 1.2;
    const zoom = Math.min(w / (sala.largura_cm * margem), h / (sala.profundidade_cm * margem));
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 0.4;
    setCam({ zoom: z, x: w / 2 - (sala.largura_cm / 2) * z, y: h / 2 - (sala.profundidade_cm / 2) * z });
  }, [sala.largura_cm, sala.profundidade_cm, size.w, size.h]);

  /**
   * ENQUADRAMENTO: só na primeira medida real e quando a SALA muda de tamanho.
   *
   * Antes este efeito também dependia de `size`, e `size` vem de um
   * ResizeObserver na div do canvas — que dispara sempre que a barra de
   * propriedades cresce (a prévia da esquadria é mais alta que o texto de
   * ajuda) ou um rail entra em cena. Resultado: trocar de ferramenta
   * reenquadrava a sala e jogava fora o zoom que o consultor tinha acabado de
   * ajustar. Agora um redimensionamento do CONTAINER só recentraliza: mantém o
   * mesmo ponto do mundo no meio da tela, e o zoom fica onde estava.
   */
  const enquadre = useRef({ w: 0, h: 0, larg: 0, prof: 0, feito: false });
  useEffect(() => {
    if (!size.w || !size.h) return;
    const e = enquadre.current;
    const mudouSala = e.larg !== sala.largura_cm || e.prof !== sala.profundidade_cm;
    if (e.feito && !mudouSala) {
      setCam((c) => ({ ...c, x: c.x + (size.w - e.w) / 2, y: c.y + (size.h - e.h) / 2 }));
    } else {
      enquadrar(size.w, size.h);
    }
    enquadre.current = { w: size.w, h: size.h, larg: sala.largura_cm, prof: sala.profundidade_cm, feito: true };
  }, [sala.largura_cm, sala.profundidade_cm, size.w, size.h, enquadrar]);

  const toWorld = (sx: number, sy: number) => ({ x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom });

  // ── Snap avançado (Fase 1): vértice → parede → grade ─────────────────────
  // Vértices (de áreas e pontas de parede) têm prioridade, depois a linha da
  // parede, depois a grade (1/5/10 cm; 0 = desligada, valor cru).
  function snapPonto(w: Ponto): Ponto {
    const thr = 14 / cam.zoom; // raio de imã em px de tela
    let melhor: { p: Ponto; d: number } | null = null;
    const tenta = (x: number, y: number) => {
      const d = Math.hypot(w.x - x, w.y - y);
      if (d < thr && (!melhor || d < melhor.d)) melhor = { p: { x, y }, d };
    };
    for (const pr of cena.estrutura?.paredes ?? []) { tenta(pr.x1, pr.y1); tenta(pr.x2, pr.y2); }
    for (const a of cena.acabamentos ?? []) for (const pt of a.pontos ?? []) tenta(pt.x, pt.y);
    if (melhor) return (melhor as { p: Ponto; d: number }).p;
    // linha da parede
    let melhorSeg: { p: Ponto; d: number } | null = null;
    for (const pr of cena.estrutura?.paredes ?? []) {
      const pj = projetarNoSegmento(w, { x: pr.x1, y: pr.y1 }, { x: pr.x2, y: pr.y2 });
      if (pj.dist < thr && (!melhorSeg || pj.dist < melhorSeg.d)) melhorSeg = { p: { x: pj.x, y: pj.y }, d: pj.dist };
    }
    if (melhorSeg) return (melhorSeg as { p: Ponto; d: number }).p; // fica exatamente sobre a parede
    const passo = snapPasso ?? 0;
    if (passo > 0) return { x: Math.round(w.x / passo) * passo, y: Math.round(w.y / passo) * passo };
    return { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10 }; // sem snap: precisão de 1 mm
  }

  const zoomAt = (sx: number, sy: number, factor: number) => {
    setCam((c) => {
      const zoom = Math.min(4, Math.max(0.03, c.zoom * factor));
      // mantém o ponto do mundo fixo sob (sx,sy)
      const wx = (sx - c.x) / c.zoom, wy = (sy - c.y) / c.zoom;
      return { zoom, x: sx - wx * zoom, y: sy - wy * zoom };
    });
  };

  /**
   * A análise, UMA vez por cena. Ela é a conta mais cara do editor e era
   * chamada duas vezes aqui dentro (uma direta, outra por dentro de
   * `problemasDaCena`) — agora a instância é compartilhada, e a varredura das
   * portas chega ao mapa de problemas sem custo novo.
   */
  const espaco = useMemo(() => analisarEspaco(cena), [cena]);
  const problemas = useMemo(() => problemasDaCena(cena, espaco), [cena, espaco]);
  /** Diagnóstico por abertura: setor de varredura + se está travada. */
  const diagAberturas = useMemo(() => new Map(espaco.aberturas.map((a) => [a.id, a])), [espaco]);
  /** Elementos de parede com problema de fixação (drywall, vidro, vão atrás). */
  const fixaProblema = useMemo(
    () => new Map(espaco.fixacoes.map((f) => [f.elementoId, f])),
    [espaco],
  );
  /** Referência de "para dentro" das folhas — o centro do conjunto de paredes. */
  const centroSala = useMemo(
    () => centroDaEstrutura(cena.estrutura, { x: sala.largura_cm / 2, y: sala.profundidade_cm / 2 }),
    [cena.estrutura, sala.largura_cm, sala.profundidade_cm],
  );

  // Pulso de seleção: um anel que nasce, cresce e some sobre a peça escolhida.
  // Sem ele, num canvas com quarenta retângulos, a única pista da seleção é a
  // espessura da borda — que passa despercebida no toque.
  const layerRef = useRef<Konva.Layer>(null);
  useEffect(() => {
    const camada = layerRef.current;
    const it = cena.itens.find((i) => i.id === selectedId);
    if (!camada || !it) return;
    halo(camada, { x: it.x_cm, y: it.y_cm, w: it.w_cm, h: it.h_cm }, CANVAS.selecao);
    // Só quando MUDA a seleção — não a cada arraste do mesmo item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  // Área, itens contidos e ocupação de cada região funcional — a mesma conta
  // do painel de análise, para o canvas e o relatório nunca discordarem.
  const resumoDaArea = useMemo(
    () => new Map(espaco.porArea.map((z) => [z.id, z])),
    [espaco],
  );

  /**
   * Contexto de encaixe para o arraste de objeto.
   * Tolerância mais apertada que a das ferramentas de desenho (8 px de tela
   * contra 14): aqui há uma dúzia de candidatos disputando — bordas, centros,
   * paredes e grade — e um ímã largo faria o item pular entre alinhamentos.
   */
  const ctxSnap = (ignorarId: string): CtxSnap => ({
    cena,
    passoGrade: snapPasso ?? 0,
    tolCm: tolCmPorZoom(8, cam.zoom),
    ignorarId,
  });
  const cotasAuto = useMemo(
    () => ((LAM ? LAM.afastamentos : lamina) ? gerarCotasAutomaticas(cena) : []),
    [LAM, lamina, cena],
  );

  function onWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const p = stage?.getPointerPosition();
    if (!p) return;
    zoomAt(p.x, p.y, e.evt.deltaY < 0 ? 1.1 : 1 / 1.1);
  }

  function stageDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    // `hasName` e não `name() === "bg"`: o fundo da sala é `name="bg bg-externo"`
    // (o segundo nome é o que a exportação procura). Comparar a string inteira
    // deixava o retângulo de fundo engolir todo o toque — sem pan, sem
    // desseleção e com as ferramentas de dois toques mortas em qualquer projeto
    // sem `sala.config` (ou seja, todos, menos o modelo Heritage).
    const emVazio = e.target === stage || e.target.hasName("bg");
    if (modoCalibrar && emVazio) {
      const w = toWorld(p.x, p.y);
      const pts = [...calPts, w];
      if (pts.length === 2) {
        const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        setCalPts([]);
        onCalibrar(d);
      } else setCalPts(pts);
      return;
    }
    // ── Etapa 2: área retangular (2 toques, com snap) ─────────────────────
    if (ferrAcab === "rect" && emVazio) {
      const w = snapPonto(toWorld(p.x, p.y));
      const pts = [...areaPts, w];
      if (pts.length === 2) {
        const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
        const wcm = Math.abs(pts[1].x - pts[0].x), hcm = Math.abs(pts[1].y - pts[0].y);
        setAreaPts([]);
        if (wcm >= 10 && hcm >= 10) onArea([{ x, y }, { x: x + wcm, y }, { x: x + wcm, y: y + hcm }, { x, y: y + hcm }]);
      } else setAreaPts(pts);
      return;
    }
    // ── Etapa 2: polígono (vários toques; toque no 1º ponto fecha) ────────
    if (ferrAcab === "poligono" && emVazio) {
      const w = snapPonto(toWorld(p.x, p.y));
      if (polyPts.length >= 3) {
        const d0 = Math.hypot(w.x - polyPts[0].x, w.y - polyPts[0].y);
        if (d0 < 20 / cam.zoom) { // fechou no 1º ponto
          const pts = polyPts;
          setPolyPts([]);
          onArea(pts);
          return;
        }
      }
      setPolyPts([...polyPts, w]);
      return;
    }
    // ── Etapa 2: cota (2 toques; quase-reto vira reto) ────────────────────
    if (ferrAcab === "cota" && emVazio) {
      const w = snapPonto(toWorld(p.x, p.y));
      const pts = [...cotaPts, w];
      if (pts.length === 2) {
        let [a, b] = pts;
        const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
        if (dy < dx * 0.09) b = { x: b.x, y: a.y }; // ortogonaliza cotas quase retas
        else if (dx < dy * 0.09) b = { x: a.x, y: b.y };
        setCotaPts([]);
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 2) addCota({ id: crypto.randomUUID(), x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      } else setCotaPts(pts);
      return;
    }
    // ── Etapa 2: espelho / item de parede (toque na parede insere) ────────
    if (ferrAcab === "espelho" || ferrAcab === "itemParede") {
      const w = toWorld(p.x, p.y);
      const paredes = cena.estrutura?.paredes ?? [];
      let melhor: { parede: Parede; t: number; len: number; dist: number } | null = null;
      for (const pr of paredes) {
        const pj = projetarNaParede(w.x, w.y, pr);
        if (!melhor || pj.dist < melhor.dist) melhor = { parede: pr, t: pj.t, len: pj.len, dist: pj.dist };
      }
      if (melhor && melhor.dist < 100) {
        const tipo: TipoElementoParede = ferrAcab === "espelho" ? "espelho" : (tipoElemParede ?? "tv");
        const def = ELEMENTOS_PAREDE[tipo];
        addElemParede({
          id: crypto.randomUUID(), tipo, paredeId: melhor.parede.id,
          offset_cm: arred(melhor.t * melhor.len),
          largura_cm: def.largura, altura_cm: def.altura, dist_piso_cm: def.distPiso,
          ...(tipo === "espelho" ? { espessura_cm: 0.4, luz_superior: false, luz_inferior: false, preco_m2: 320 } : {}),
        });
      }
      return;
    }
    if (modoRecorte && emVazio) {
      const w = toWorld(p.x, p.y);
      const pts = [...recPts, w];
      if (pts.length === 2) {
        const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
        const wcm = Math.abs(pts[1].x - pts[0].x), hcm = Math.abs(pts[1].y - pts[0].y);
        setRecPts([]);
        if (wcm > 1 && hcm > 1) onRecorte({ x, y, w: wcm, h: hcm });
      } else setRecPts(pts);
      return;
    }
    if (modoVista) {
      const w = toWorld(p.x, p.y);
      const pts = [...vistaPts, w];
      if (pts.length === 2) {
        setVistaPts([]);
        if (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) > 5) onVista?.(pts[0], pts[1]);
      } else setVistaPts(pts);
      return;
    }
    if (modoParede) {
      const w = toWorld(p.x, p.y);
      const pts = [...pardPts, w];
      if (pts.length === 2) {
        setPardPts([]);
        if (Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) > 1) onParede(pts[0], pts[1]);
      } else setPardPts(pts);
      return;
    }
    // ── Etapa 1: ferramentas de estrutura ──────────────────────────────────
    if (ferrEstrutura === "parede" || ferrEstrutura === "pilar") {
      // MESMO encaixe do resto do editor. Antes aqui era `toWorld` cru + `arred`
      // (passo fixo de 5 cm): o controle "Encaixe" da barra não valia para a
      // Etapa 1, e a prévia elástica — que lê o ponteiro JÁ encaixado — mostrava
      // um ponto e o traço nascia em outro.
      const w = snapPonto(toWorld(p.x, p.y));
      const pts = [...estPts, w];
      if (pts.length === 2) {
        setEstPts([]);
        if (ferrEstrutura === "parede") {
          // ortogonaliza se estiver quase na horizontal/vertical
          let x1 = pts[0].x, y1 = pts[0].y, x2 = pts[1].x, y2 = pts[1].y;
          const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
          if (dy < dx * 0.2) y2 = y1; else if (dx < dy * 0.2) x2 = x1;
          if (Math.hypot(x2 - x1, y2 - y1) >= GRID_CM) addParede({
            id: crypto.randomUUID(), x1, y1, x2, y2,
            espessura_cm: pad.espessuraParede,
            material: pad.materialParede,
            ...(pad.paredeReforcada ? { reforcada: true } : {}),
          });
        } else {
          const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
          const w2 = Math.abs(pts[1].x - pts[0].x), h2 = Math.abs(pts[1].y - pts[0].y);
          if (w2 >= GRID_CM && h2 >= GRID_CM) addPilar({
            id: crypto.randomUUID(), x_cm: x, y_cm: y, w_cm: w2, h_cm: h2,
            forma: pad.formaPilar, material: pad.materialPilar,
          });
        }
      } else setEstPts(pts);
      return;
    }
    if (ferrEstrutura === "porta" || ferrEstrutura === "janela") {
      const w = toWorld(p.x, p.y);
      const paredes = cena.estrutura?.paredes ?? [];
      let melhor: { parede: Parede; t: number; len: number; dist: number } | null = null;
      for (const pr of paredes) {
        const pj = projetarNaParede(w.x, w.y, pr);
        if (!melhor || pj.dist < melhor.dist) melhor = { parede: pr, t: pj.t, len: pj.len, dist: pj.dist };
      }
      if (melhor && melhor.dist < 80) {
        const passo = snapPasso ?? 0;
        const offset = melhor.t * melhor.len;
        const base = {
          id: crypto.randomUUID(), paredeId: melhor.parede.id,
          centro_cm: passo > 0 ? Math.round(offset / passo) * passo : Math.round(offset * 10) / 10,
        };
        // A abertura nasce COM a variante escolhida no flyout. Antes nascia
        // sempre porta de giro de 90 / janela de 120, e trocar exigia
        // selecionar e reeditar peça a peça.
        addAbertura(ferrEstrutura === "porta"
          ? { ...base, tipo: "porta", largura_cm: pad.larguraPorta, modelo: pad.modeloPorta, lado: pad.ladoPorta, sentido: pad.sentidoPorta }
          : { ...base, tipo: "janela", largura_cm: pad.larguraJanela, modelo: pad.modeloJanela, forma: pad.formaJanela });
      }
      return;
    }
    const touches = (e.evt as TouchEvent).touches;
    if (touches && touches.length === 2) {
      const [a, b] = [touches[0], touches[1]];
      pinch.current = { dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
      return;
    }
    if (emVazio) { pan.current = { x: p.x, y: p.y }; if (!modoCalibrar) selecionar(null); }
  }

  function stageMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;

    // Posição do ponteiro em coordenadas de mundo, para a pré-visualização
    // elástica. Vai num REF, não em estado: em estado, cada movimento do dedo
    // re-renderizaria a cena inteira (inclusive os traços da planta vetorial).
    const pp = stage.getPointerPosition();
    ponteiroRef.current = pp ? snapPonto(toWorld(pp.x, pp.y)) : null;
    if (ponteiroExternoRef) {
      const p = ponteiroRef.current;
      ponteiroExternoRef.current = p
        ? { x: p.x, y: p.y, zoom: cam.zoom, dentro: true }
        : { ...ponteiroExternoRef.current, zoom: cam.zoom, dentro: false };
    }

    const touches = (e.evt as TouchEvent).touches;
    // Captura os refs em locais ANTES do setCam: o updater roda depois e o
    // stageUp pode zerar pinch/pan nesse meio-tempo (crash "current.x" no iPad).
    const pinchAtual = pinch.current;
    if (touches && touches.length === 2 && pinchAtual) {
      const [a, b] = [touches[0], touches[1]];
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) zoomAt(cx - rect.left, cy - rect.top, dist / (pinchAtual.dist || dist));
      setCam((c) => ({ ...c, x: c.x + (cx - pinchAtual.cx), y: c.y + (cy - pinchAtual.cy) }));
      pinch.current = { dist, cx, cy };
      return;
    }
    const panAtual = pan.current;
    if (panAtual) {
      const p = stage.getPointerPosition();
      if (!p) return;
      setCam((c) => ({ ...c, x: c.x + (p.x - panAtual.x), y: c.y + (p.y - panAtual.y) }));
      pan.current = { x: p.x, y: p.y };
    }
  }
  const stageUp = () => { pan.current = null; pinch.current = null; };
  // O zoom muda sem o dedo se mexer (roda, pinça, enquadramento inicial): sem
  // este espelho a barra de status mostraria a escala anterior.
  useEffect(() => {
    if (ponteiroExternoRef) ponteiroExternoRef.current = { ...ponteiroExternoRef.current, zoom: cam.zoom };
  }, [cam.zoom, ponteiroExternoRef]);

  // Grade adaptativa (evita milhares de linhas quando muito afastado)
  const gridLines = useMemo(() => {
    const step = cam.zoom < 0.12 ? GRID_CM * 20 : cam.zoom < 0.3 ? GRID_CM * 4 : GRID_CM;
    const lines: number[][] = [];
    const x0 = -step, x1 = sala.largura_cm + step, y0 = -step, y1 = sala.profundidade_cm + step;
    for (let x = 0; x <= x1; x += step) lines.push([x, y0, x, y1]);
    for (let y = 0; y <= y1; y += step) lines.push([x0, y, x1, y]);
    return lines;
  }, [cam.zoom, sala.largura_cm, sala.profundidade_cm]);

  const cfg = sala.config || {};
  const planta = cena.planta;
  const pv = cena.plantaVetorial;
  const desenhandoEst = ferrEstrutura === "parede" || ferrEstrutura === "pilar" || ferrEstrutura === "porta" || ferrEstrutura === "janela";
  const desenhandoAcab = ferrAcab === "rect" || ferrAcab === "poligono" || ferrAcab === "cota" || ferrAcab === "espelho" || ferrAcab === "itemParede";
  const drawing = modoCalibrar || desenhandoAcab || modoRecorte || modoParede || desenhandoEst || !!modoVista; // enquanto desenha, nada captura o toque
  // Interatividade por etapa: só o que pertence à etapa ativa responde ao toque.
  const itensAtivos = (etapaAtual === "layout" || etapaAtual === "fichas") && !drawing && !somenteLeitura && !modoMoverPlanta;
  const areasAtivas = etapaAtual === "acabamento" && !drawing && !somenteLeitura && !modoMoverPlanta;
  const estAtiva = etapaAtual === "planta" && !drawing && !somenteLeitura && !modoMoverPlanta;
  const apagando = estAtiva && ferrEstrutura === "apagar"; // toque no elemento = apagar
  // Toque num elemento da estrutura: apaga (modo ⌫) ou seleciona.
  const tocarEstrutura = (tipo: "parede" | "pilar" | "abertura", id: string) => {
    if (apagando) {
      if (tipo === "parede") removerParede(id); else if (tipo === "pilar") removerPilar(id); else removerAbertura(id);
    } else selecionarEstrutura({ tipo, id });
  };
  const apagandoAcab = etapaAtual === "acabamento" && ferrAcab === "apagar" && !somenteLeitura;
  const areasEscutam = areasAtivas || apagandoAcab; // no modo apagar, o toque precisa chegar na área
  const selAreaFuncId = useProjeto((s) => s.selAreaFuncId);
  const selecionarAreaFunc = useProjeto((s) => s.selecionarAreaFunc);
  const camVis = useMemo(() => new Map((pv?.camadas ?? []).map((c) => [c.nome, c.visivel])), [pv]);

  // Trocar de ferramenta cancela desenhos parciais.
  // `estPts` (o 1º toque de parede/pilar) faltava aqui: cancelar a ferramenta
  // deixava o ponto vivo, e a ferramenta seguinte o herdava — dois toques
  // depois nascia uma parede começando onde o consultor havia desistido.
  useEffect(() => {
    setAreaPts([]); setPolyPts([]); setCotaPts([]); setVistaPts([]); setEstPts([]);
  }, [ferrAcab, ferrEstrutura, etapaAtual, modoVista]);

  /**
   * Qual pré-visualização mostrar, a partir da ferramenta ativa e dos pontos
   * já tocados. Uma tabela só, para nunca haver duas prévias na tela ao mesmo
   * tempo dizendo coisas diferentes.
   */
  const previewAtual: Omit<PreviewProps, "ponteiroRef" | "zoom"> = (() => {
    if (polyPts.length) return { forma: "poligono", ancoras: polyPts, raioFechar: 20 / cam.zoom };
    if (areaPts.length) return { forma: "retangulo", ancoras: areaPts };
    if (recPts.length) return { forma: "retangulo", ancoras: recPts, cor: CANVAS.ok };
    if (cotaPts.length) return { forma: "linha", ancoras: cotaPts, cor: CANVAS.guia, ortogonaliza: true };
    if (calPts.length) return { forma: "linha", ancoras: calPts, cor: CANVAS.guia };
    if (pardPts.length) return { forma: "linha", ancoras: pardPts, cor: "#C97BE0" };
    if (vistaPts.length) return { forma: "linha", ancoras: vistaPts, cor: "#C97BE0" };
    if (estPts.length) {
      return ferrEstrutura === "pilar"
        ? { forma: "retangulo", ancoras: estPts }
        // A ferramenta de parede endireita o traço quase-reto; o preview
        // mostra isso ANTES, para o consultor não ser surpreendido no solte.
        : { forma: "linha", ancoras: estPts, ortogonaliza: true };
    }
    return { forma: null, ancoras: [] };
  })();

  return (
    <div ref={wrapRef} style={{
      position: "absolute", inset: 0,
      cursor: apagando || apagandoAcab ? "not-allowed" : drawing ? "crosshair" : modoMoverPlanta ? "grab" : pan.current ? "grabbing" : "default",
      background: TOKENS.canvas,
      // Apple Pencil / toque no iPad: sem isso o Safari trata o traço como
      // rolagem/gesto da página e o canvas nunca recebe o evento.
      touchAction: "none", WebkitUserSelect: "none", userSelect: "none",
    }}>
      <Stage ref={stageRef} width={size.w} height={size.h} onWheel={onWheel}
        onMouseDown={stageDown} onMouseMove={stageMove} onMouseUp={stageUp}
        onTouchStart={stageDown} onTouchMove={stageMove} onTouchEnd={stageUp}>
        <Layer ref={layerRef} x={cam.x} y={cam.y} scaleX={cam.zoom} scaleY={cam.zoom}>
          {/* fundo/hit-area da sala */}
          {/* Fundo da área de trabalho. O nome extra `bg-externo` é o que a
              exportação do Dossiê procura para pintar de branco no papel. */}
          <Rect name="bg bg-externo" x={-2000} y={-2000} width={sala.largura_cm + 4000} height={sala.profundidade_cm + 4000} fill={TOKENS.canvas} />

          {/* faixas de piso */}
          {ver("acabamento") && (cfg.pisos || []).map((f) => (
            <Rect key={f.nome} name="bg" x={0} y={f.y0} width={sala.largura_cm} height={f.y1 - f.y0} fill={f.cor} />
          ))}

          {/* planta baixa (fundo em escala real) */}
          {planta && plantaImg && ver("plantaFundo") && (
            <KImage image={plantaImg} x={planta.x_cm} y={planta.y_cm} rotation={planta.rotacao || 0}
              width={planta.larguraPx * planta.cmPorPx} height={planta.alturaPx * planta.cmPorPx}
              opacity={planta.opacidade} listening={modoMoverPlanta && !planta.bloqueada} draggable={modoMoverPlanta && !planta.bloqueada}
              onDragEnd={(e) => updatePlanta({ x_cm: e.target.x(), y_cm: e.target.y() })} />
          )}

          {/* planta VETORIAL (desenho separado do texto) */}
          {pv && ver("plantaFundo") && (
            <Group x={pv.x_cm} y={pv.y_cm} rotation={pv.rotacao || 0} scaleX={pv.escala || 1} scaleY={pv.escala || 1} opacity={pv.opacidade}
              listening={modoMoverPlanta && !pv.bloqueada} draggable={modoMoverPlanta && !pv.bloqueada}
              onDragEnd={(e) => updatePlantaVetorial({ x_cm: e.target.x(), y_cm: e.target.y() })}>
              {pv.tracos.map((tr, i) => (
                camVis.get(tr.camada ?? "0") === false ? null :
                <Line key={i} points={tr.pts} closed={tr.fechado} stroke={tr.cor || CANVAS.planta} strokeWidth={1 / (cam.zoom * (pv.escala || 1))} />
              ))}
              {pv.mostrarTexto && pv.rotulos.map((r, i) => (
                camVis.get(r.camada ?? "0") === false ? null :
                <Text key={`t${i}`} x={r.x_cm} y={r.y_cm} text={r.texto} fontSize={Math.max(1, r.altura)} rotation={r.rotacao} fill={CANVAS.selecao} />
              ))}
            </Group>
          )}

          {/* grade */}
          {!apresentacao && ver("grade") && gridLines.map((l, i) => <Line key={i} points={l} stroke="#ffffff" strokeWidth={0.6 / cam.zoom} opacity={0.05} listening={false} />)}

          {/* corredor */}
          {cfg.corredor && ver("areas") && <Rect name="bg" x={cfg.corredor.x} y={0} width={cfg.corredor.w} height={sala.profundidade_cm} fill={CANVAS.selecao} opacity={0.06} listening={false} />}

          {/* contorno da sala — só uma GUIA de referência (dimensões do projeto);
              some quando existem paredes reais desenhadas na Etapa 1 */}
          {/* A guia tracejada é andaime de edição: numa lâmina de apresentação
              ela seria uma parede que não existe. */}
          {!(cena.estrutura?.paredes.length) && !LAM && (
            <>
              <Rect x={0} y={0} width={sala.largura_cm} height={sala.profundidade_cm} stroke="#3A3A3C" strokeWidth={4 / cam.zoom}
                dash={[18 / cam.zoom, 12 / cam.zoom]} listening={false} />
              {etapaAtual === "planta" && (
                <Text x={0} y={-26 / cam.zoom} text={`sala (guia) · ${formatLength(sala.largura_cm)} × ${formatLength(sala.profundidade_cm)} — edite no painel ao lado`}
                  fontSize={14 / cam.zoom} fill="#6e6e73" listening={false} />
              )}
            </>
          )}

          {/* pilar (config legado) */}
          {cfg.pilar && !cena.estrutura && ver("estrutura") && <Rect name="bg" x={cfg.pilar.x} y={cfg.pilar.y} width={cfg.pilar.w} height={cfg.pilar.h} fill="#2B2B2E" stroke="#8A8A8F" strokeWidth={2 / cam.zoom} listening={false} />}

          {/* ── Etapa 1: estrutura (pilares, paredes, portas/janelas) ── */}
          {cena.estrutura && ver("estrutura") && (() => {
            const est = cena.estrutura!;
            const pmap = new Map(est.paredes.map((p) => [p.id, p]));
            const ctx = etapaAtual === "planta" ? 1 : 0.5; // esmaece fora da Etapa 1
            return (
              <Group opacity={ctx}>
                {/* pilares — a seção real (retangular, circular ou em L) e a
                    cor do material. O contorno vem de `contornoPilar`, em
                    coordenadas absolutas, então o Group arrasta a partir de
                    (0,0) e o commit devolve o deslocamento ao canto. */}
                {est.pilares.map((p) => {
                  const sel = selEstrutura?.tipo === "pilar" && selEstrutura.id === p.id;
                  const mat = MATERIAIS_PILAR[p.material ?? "concreto"] ?? MATERIAIS_PILAR.concreto;
                  return (
                    <Group key={p.id} listening={estAtiva} draggable={estAtiva && !apagando}
                      onMouseDown={() => tocarEstrutura("pilar", p.id)} onTap={() => tocarEstrutura("pilar", p.id)}
                      onDragEnd={(e) => {
                        const dx = e.target.x(), dy = e.target.y();
                        e.target.position({ x: 0, y: 0 });
                        if (dx || dy) {
                          const passo = snapPasso ?? 0;
                          const q = (v: number) => (passo > 0 ? Math.round(v / passo) * passo : Math.round(v * 10) / 10);
                          updatePilar(p.id, { x_cm: q(p.x_cm + dx), y_cm: q(p.y_cm + dy) });
                        }
                      }}>
                      <Line points={contornoPilar(p)} closed fill="#2B2B2E"
                        stroke={sel ? CANVAS.selecao : mat.cor} strokeWidth={(sel ? 4 : 2) / cam.zoom} />
                    </Group>
                  );
                })}
                {/* paredes — o material aparece no traço: alvenaria e concreto
                    cheios, drywall e madeira com o miolo aberto (duas linhas de
                    face), vidro numa linha fina. É a convenção de prancha, e é
                    o que faz "posso pendurar o espelho aqui?" ter resposta
                    visual antes de o alerta aparecer. */}
                {est.paredes.map((w) => {
                  const sel = selEstrutura?.tipo === "parede" && selEstrutura.id === w.id;
                  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
                  const dp = defParede(w.material);
                  const esp = Math.max(w.espessura_cm, 4);
                  const ux = len ? (w.x2 - w.x1) / len : 1, uy = len ? (w.y2 - w.y1) / len : 0;
                  const nx = -uy, ny = ux, meia = esp / 2;
                  const face = (s: number) => [
                    w.x1 + nx * meia * s, w.y1 + ny * meia * s,
                    w.x2 + nx * meia * s, w.y2 + ny * meia * s,
                  ];
                  const cheia = dp.hachura === "solida" || dp.hachura === "diagonal";
                  return (
                    <Group key={w.id}>
                      {cheia ? (
                        <Line points={[w.x1, w.y1, w.x2, w.y2]} stroke={sel ? CANVAS.selecao : dp.cor} strokeWidth={esp}
                          lineCap="butt" opacity={dp.hachura === "diagonal" ? 0.9 : 1} listening={false} />
                      ) : dp.hachura === "vidro" ? (
                        <Line points={[w.x1, w.y1, w.x2, w.y2]} stroke={sel ? CANVAS.selecao : dp.cor} strokeWidth={Math.max(2 / cam.zoom, esp * 0.3)} listening={false} />
                      ) : (
                        <>
                          <Line points={[w.x1, w.y1, w.x2, w.y2]} stroke={TOKENS.canvas} strokeWidth={esp} lineCap="butt" listening={false} />
                          <Line points={face(1)} stroke={sel ? CANVAS.selecao : dp.cor} strokeWidth={2 / cam.zoom} listening={false} />
                          <Line points={face(-1)} stroke={sel ? CANVAS.selecao : dp.cor} strokeWidth={2 / cam.zoom} listening={false} />
                          {dp.hachura === "listrada" && (
                            <Line points={[w.x1, w.y1, w.x2, w.y2]} stroke={dp.cor} strokeWidth={1 / cam.zoom} dash={[8 / cam.zoom, 6 / cam.zoom]} listening={false} />
                          )}
                        </>
                      )}
                      {/* Parede reforçada: o tracinho que diz "aqui pode pendurar". */}
                      {w.reforcada && (
                        <Line points={[w.x1, w.y1, w.x2, w.y2]} stroke={CANVAS.ok} strokeWidth={Math.max(1.5 / cam.zoom, esp * 0.18)}
                          dash={[14 / cam.zoom, 8 / cam.zoom]} opacity={0.85} listening={false} />
                      )}
                      {/* Área de toque separada do desenho: com o traço fino do
                          vidro, a parede era quase impossível de acertar no dedo. */}
                      <Line points={[w.x1, w.y1, w.x2, w.y2]} stroke="transparent" strokeWidth={esp}
                        hitStrokeWidth={Math.max(esp, 34 / cam.zoom)} listening={estAtiva}
                        onMouseDown={() => tocarEstrutura("parede", w.id)} onTap={() => tocarEstrutura("parede", w.id)} />
                      {sel && (
                        <Text x={(w.x1 + w.x2) / 2} y={(w.y1 + w.y2) / 2 - 22 / cam.zoom} text={`${formatLength(len)} · ${dp.label}`}
                          fontSize={15 / cam.zoom} fill={CANVAS.selecao} listening={false} />
                      )}
                      {sel && estAtiva && [{ k: "a", x: w.x1, y: w.y1 }, { k: "b", x: w.x2, y: w.y2 }].map((h) => (
                        <Circle key={h.k} x={h.x} y={h.y} radius={9 / cam.zoom} fill={TOKENS.canvas} stroke={CANVAS.selecao} strokeWidth={2 / cam.zoom} draggable
                          onDragMove={(e) => updateParede(w.id, h.k === "a" ? { x1: e.target.x(), y1: e.target.y() } : { x2: e.target.x(), y2: e.target.y() }, false)}
                          onDragEnd={(e) => {
                            const q = snapPonto({ x: e.target.x(), y: e.target.y() });
                            e.target.position(q);
                            updateParede(w.id, h.k === "a" ? { x1: q.x, y1: q.y } : { x2: q.x, y2: q.y });
                          }} />
                      ))}
                    </Group>
                  );
                })}
                {/* ABERTURAS — o símbolo real de cada variante.
                    Antes toda porta saía igual: uma folha a 90° e um tracejado,
                    fosse ela de giro, de correr ou um vão sem folha. Agora a
                    geometria vem de `simboloAbertura`, a mesma função que
                    desenha o ícone do flyout — botão e planta não podem
                    divergir. E a varredura da folha é PINTADA: o piso que a
                    porta reserva deixa de ser invisível, e fica vermelho no
                    instante em que um equipamento entra nele. */}
                {est.aberturas.map((ab) => {
                  const w = pmap.get(ab.paredeId); if (!w) return null;
                  const sim = simboloAbertura(ab, w, centroSala, est.paredes);
                  const [P, Q] = sim.vao;
                  const cx = (P.x + Q.x) / 2, cy = (P.y + Q.y) / 2;
                  const sel = selEstrutura?.tipo === "abertura" && selEstrutura.id === ab.id;
                  const diag = diagAberturas.get(ab.id);
                  const travada = !!diag?.ids.length;
                  const cor = sel ? CANVAS.selecao : travada ? CANVAS.colisao : ab.tipo === "porta" ? CANVAS.ok : CANVAS.guia;
                  return (
                    <Group key={ab.id} listening={estAtiva}
                      onMouseDown={() => tocarEstrutura("abertura", ab.id)} onTap={() => tocarEstrutura("abertura", ab.id)}>
                      {/* setor de varredura, por baixo de tudo */}
                      {(diag?.setores ?? []).map((s, i) => (
                        <Line key={`v${i}`} points={s.flatMap((p) => [p.x, p.y])} closed
                          fill={travada ? CANVAS.colisao : CANVAS.ok} opacity={travada ? 0.18 : 0.07}
                          stroke={travada ? CANVAS.colisao : "transparent"} strokeWidth={1 / cam.zoom} listening={false} />
                      ))}
                      {/* "corta" a parede no vão */}
                      <Line points={[P.x, P.y, Q.x, Q.y]} stroke={TOKENS.canvas} strokeWidth={w.espessura_cm + 3} lineCap="butt" listening={false} />
                      {sim.tracejadas.map((p, i) => (
                        <Line key={`t${i}`} points={p} stroke={cor} strokeWidth={1.4 / cam.zoom}
                          dash={[7 / cam.zoom, 5 / cam.zoom]} opacity={0.8} listening={false} />
                      ))}
                      {sim.finas.map((p, i) => <Line key={`f${i}`} points={p} stroke={cor} strokeWidth={1.6 / cam.zoom} opacity={0.85} listening={false} />)}
                      {sim.setas.map((p, i) => <Line key={`s${i}`} points={p} stroke={cor} strokeWidth={2 / cam.zoom} listening={false} />)}
                      {sim.cheias.map((p, i) => (
                        <Line key={`c${i}`} points={p} stroke={cor} strokeWidth={Math.max(sim.espFolha_cm, 2 / cam.zoom)}
                          lineCap="round" lineJoin="round" listening={false} />
                      ))}
                      {sel && (
                        <Text x={cx} y={cy - 26 / cam.zoom} text={diag?.rotulo ?? `${ab.tipo} · ${Math.round(ab.largura_cm)} cm`}
                          fontSize={13 / cam.zoom} fill={CANVAS.selecao} listening={false} />
                      )}
                      {/* alça de clique */}
                      <Circle x={cx} y={cy} radius={(sel ? 8 : 6) / cam.zoom} fill={cor} listening={estAtiva} />
                    </Group>
                  );
                })}
                {/* marcadores da ferramenta em uso */}
                {estPts.map((pp, i) => <Circle key={`e${i}`} x={pp.x} y={pp.y} radius={7 / cam.zoom} fill={CANVAS.selecao} listening={false} />)}
                {estPts.length === 1 && <Text x={estPts[0].x} y={estPts[0].y} text={ferrEstrutura === "pilar" ? " canto oposto do pilar" : " outra ponta da parede"} fontSize={16 / cam.zoom} fill={CANVAS.selecao} listening={false} />}
              </Group>
            );
          })()}

          {/* áreas de acabamento (piso/parede pintados) */}
          {ver("acabamento") && (cena.acabamentos ?? []).map((a) => {
            const sel = selectedAcabId === a.id;
            const pts = a.pontos ?? [];
            if (pts.length < 3) return null;
            const flat = pts.flatMap((p) => [p.x, p.y]);
            const areaM2v = areaPoligonoM2(pts);
            const cor = a.material && a.material !== "outro" ? MATERIAIS_PISO[a.material].cor : a.cor;
            const podeMexer = areasAtivas && !a.bloqueado;
            const rot = ((a.rotacaoTextura ?? 0) * Math.PI) / 180;
            // linhas do sentido do piso, recortadas pelo polígono (clipFunc)
            const diag = Math.hypot(a.w_cm, a.h_cm), cxA = a.x_cm + a.w_cm / 2, cyA = a.y_cm + a.h_cm / 2;
            const nTex = Math.max(2, Math.ceil(diag / 40));
            const texLines: number[][] = [];
            for (let i = -nTex; i <= nTex; i++) {
              const off = i * 40;
              const ox = -Math.sin(rot) * off, oy = Math.cos(rot) * off;
              texLines.push([cxA + ox - Math.cos(rot) * diag, cyA + oy - Math.sin(rot) * diag, cxA + ox + Math.cos(rot) * diag, cyA + oy + Math.sin(rot) * diag]);
            }
            return (
              <Group key={a.id} listening={areasEscutam}>
                <Group
                  onMouseDown={() => (apagandoAcab ? removerArea(a.id) : selecionarAcab(a.id))}
                  onTap={() => (apagandoAcab ? removerArea(a.id) : selecionarAcab(a.id))}
                  draggable={podeMexer}
                  onDragEnd={(e) => {
                    const dx = e.target.x(), dy = e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    const passo = snapPasso ?? 0;
                    const sn = (v: number) => (passo > 0 ? Math.round(v / passo) * passo : Math.round(v * 10) / 10);
                    if (dx || dy) moverArea(a.id, sn(dx), sn(dy));
                  }}>
                  <Line points={flat} closed fill={cor} opacity={a.tipo === "parede" ? 0.3 : 0.45}
                    stroke={sel ? CANVAS.selecao : cor} strokeWidth={(sel ? 6 : 2) / cam.zoom}
                    dash={a.tipo === "parede" ? [14 / cam.zoom, 8 / cam.zoom] : undefined} />
                  {/* sentido do piso */}
                  <Group listening={false} clipFunc={(ctx) => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); }}>
                    {texLines.map((l, i) => <Line key={i} points={l} stroke="#000000" opacity={0.14} strokeWidth={1.2 / cam.zoom} />)}
                  </Group>
                  <Text x={a.x_cm} y={a.y_cm + a.h_cm / 2 - 9} width={a.w_cm} align="center"
                    text={`${a.nome}${a.bloqueado ? " 🔒" : ""}\n${m2(areaM2v)}`}
                    fontSize={13} fill="#F2F2F0" fontStyle="600" listening={false} />
                </Group>
                {/* vértices editáveis */}
                {sel && podeMexer && pts.map((pt, i) => (
                  <Circle key={i} x={pt.x} y={pt.y} radius={8 / cam.zoom} fill={TOKENS.canvas} stroke={CANVAS.selecao} strokeWidth={2 / cam.zoom} draggable
                    onDragMove={(e) => {
                      const novo = [...pts]; novo[i] = { x: e.target.x(), y: e.target.y() };
                      updateArea(a.id, { pontos: novo }, false);
                    }}
                    onDragEnd={(e) => {
                      const w = snapPonto({ x: e.target.x(), y: e.target.y() });
                      e.target.position(w);
                      const novo = [...pts]; novo[i] = w;
                      updateArea(a.id, { pontos: novo });
                    }} />
                ))}
              </Group>
            );
          })}

          {/* ── Fase 02: LAYOUT DE ÁREA — regiões funcionais da sala ──
              A peça central da análise de espaço e, até aqui, a MENOS editável
              do canvas: não arrastava, não tinha vértice e não mostrava área.
              Ganha o mesmo tratamento das áreas de acabamento, mais o m² e a
              contagem de equipamentos contidos — que é o que transforma a
              região desenhada em análise. */}
          {ver("areas") && (cena.areas ?? []).map((a) => {
            const def = TIPOS_AREA[a.tipo] ?? TIPOS_AREA.apoio;
            const sel = selAreaFuncId === a.id;
            const naEtapa = etapaAtual === "areas";
            const podeMexer = naEtapa && !drawing && !somenteLeitura;
            const pts = a.pontos;
            const flat = pts.flatMap((p) => [p.x, p.y]);
            const info = naEtapa ? resumoDaArea.get(a.id) : undefined;
            return (
              <Group key={a.id} listening={podeMexer}
                onMouseDown={() => selecionarAreaFunc(a.id)} onTap={() => selecionarAreaFunc(a.id)}>
                <Group draggable={podeMexer}
                  onDragEnd={(e) => {
                    const dx = e.target.x(), dy = e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    if (dx || dy) {
                      const passo = snapPasso ?? 0;
                      const sn = (v: number) => (passo > 0 ? Math.round(v / passo) * passo : Math.round(v * 10) / 10);
                      updateAreaFuncional(a.id, { pontos: pts.map((p) => ({ x: p.x + sn(dx), y: p.y + sn(dy) })) });
                    }
                  }}>
                  <Line points={flat} closed fill={def.cor}
                    opacity={naEtapa ? (sel ? 0.3 : 0.18) : 0.1}
                    stroke={def.cor} strokeWidth={(sel ? 3 : 1.5) / cam.zoom}
                    dash={a.tipo === "circulacao" ? [14 / cam.zoom, 9 / cam.zoom] : undefined} />
                  <Text x={a.x_cm + 8} y={a.y_cm + 8} text={(a.nome || def.label).toUpperCase()}
                    fontSize={15 / cam.zoom} fontStyle="700" fill={def.cor}
                    opacity={naEtapa ? 1 : 0.55} listening={false} />
                  {/* Área, itens contidos e ocupação: a região deixa de ser um
                      contorno decorativo e passa a informar. */}
                  {info && (
                    <Text x={a.x_cm + 8} y={a.y_cm + 8 + 17 / cam.zoom}
                      text={`${m2(info.m2)}  ·  ${info.nItens} ${info.nItens === 1 ? "item" : "itens"}${info.nItens ? `  ·  ${Math.round(info.ocupacaoPct)}%` : ""}`}
                      fontSize={12 / cam.zoom} fill={def.cor} opacity={0.8} listening={false} />
                  )}
                </Group>
                {/* Vértices editáveis, como nas áreas de acabamento. */}
                {sel && podeMexer && pts.map((pt, i) => (
                  <Circle key={i} x={pt.x} y={pt.y} radius={8 / cam.zoom} fill={TOKENS.canvas}
                    stroke={def.cor} strokeWidth={2 / cam.zoom} draggable
                    onDragMove={(e) => {
                      const novo = [...pts]; novo[i] = { x: e.target.x(), y: e.target.y() };
                      updateAreaFuncional(a.id, { pontos: novo }, false);
                    }}
                    onDragEnd={(e) => {
                      const w = snapPonto({ x: e.target.x(), y: e.target.y() });
                      e.target.position(w);
                      const novo = [...pts]; novo[i] = w;
                      updateAreaFuncional(a.id, { pontos: novo });
                    }} />
                ))}
              </Group>
            );
          })}

          {/* cotas fixadas na planta */}
          {!apresentacao && ver("cotas") && (cena.cotas ?? []).map((c) => {
            const len = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
            const mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
            const ux = (c.x2 - c.x1) / (len || 1), uy = (c.y2 - c.y1) / (len || 1);
            const px = -uy, py = ux, t = 8 / cam.zoom; // traços das pontas
            const escutando = etapaAtual === "acabamento" && (apagandoAcab || areasAtivas);
            return (
              <Group key={c.id} listening={escutando}
                onMouseDown={() => { if (apagandoAcab) removerCota(c.id); }}
                onTap={() => { if (apagandoAcab) removerCota(c.id); }}>
                <Line points={[c.x1, c.y1, c.x2, c.y2]} stroke={CANVAS.guia} strokeWidth={1.4 / cam.zoom} hitStrokeWidth={26 / cam.zoom} />
                <Line points={[c.x1 - px * t, c.y1 - py * t, c.x1 + px * t, c.y1 + py * t]} stroke={CANVAS.guia} strokeWidth={1.4 / cam.zoom} listening={false} />
                <Line points={[c.x2 - px * t, c.y2 - py * t, c.x2 + px * t, c.y2 + py * t]} stroke={CANVAS.guia} strokeWidth={1.4 / cam.zoom} listening={false} />
                <Text x={mx + px * (14 / cam.zoom)} y={my + py * (14 / cam.zoom) - 8 / cam.zoom} text={formatLength(len)}
                  fontSize={14 / cam.zoom} fill="#8fd6f0" listening={false} />
              </Group>
            );
          })}

          {/* ── Etapa 2: mobiliário / infraestrutura ── */}
          {ver("mobiliario") && (cena.infra ?? []).map((it) => {
            const sel = selInfraId === it.id;
            const escuta = areasEscutam;
            const podeMexer = areasAtivas && !it.bloqueado;
            return (
              <Group key={it.id} x={it.x_cm + it.w_cm / 2} y={it.y_cm + it.h_cm / 2} rotation={it.rotacao || 0}
                offsetX={it.w_cm / 2} offsetY={it.h_cm / 2}
                listening={escuta} draggable={podeMexer}
                onMouseDown={() => (apagandoAcab ? removerInfra(it.id) : selecionarInfra(it.id))}
                onTap={() => (apagandoAcab ? removerInfra(it.id) : selecionarInfra(it.id))}
                onDragEnd={(e) => {
                  const passo = snapPasso ?? 0;
                  const sn = (v: number) => (passo > 0 ? Math.round(v / passo) * passo : Math.round(v * 10) / 10);
                  updateInfra(it.id, { x_cm: sn(e.target.x() - it.w_cm / 2), y_cm: sn(e.target.y() - it.h_cm / 2) });
                }}>
                <Rect width={it.w_cm} height={it.h_cm} cornerRadius={3} fill="#1A2126"
                  stroke={sel ? CANVAS.selecao : "#6FA8C4"} strokeWidth={(sel ? 5 : 2.5) / cam.zoom} />
                <Text x={0} y={it.h_cm / 2 - 8} width={it.w_cm} align="center" text={`${it.nome}${it.bloqueado ? " 🔒" : ""}`}
                  fontSize={Math.min(13, Math.max(8, it.w_cm / 8))} fill="#CDE3EE" fontStyle="600" listening={false} />
              </Group>
            );
          })}

          {/* ── Etapa 2: elementos de parede (espelho, TV, elétrica…) ── */}
          {ver("mobiliario") && (() => {
            const pmap = new Map((cena.estrutura?.paredes ?? []).map((p) => [p.id, p]));
            return (cena.elementosParede ?? []).map((el) => {
              const w = pmap.get(el.paredeId); if (!w) return null;
              const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
              const ux = (w.x2 - w.x1) / len, uy = (w.y2 - w.y1) / len;
              const px = -uy, py = ux; // perpendicular
              const cx = w.x1 + ux * el.offset_cm, cy = w.y1 + uy * el.offset_cm;
              const half = el.largura_cm / 2;
              const sel = selElemParedeId === el.id;
              const def = ELEMENTOS_PAREDE[el.tipo];
              // Fixação impossível (vidro, vão atrás) em vermelho; que exige
              // reforço, em âmbar. O elemento de parede era o único objeto do
              // canvas sem nenhum canal de problema — o espelho de 40 kg no
              // drywall desenhava igual ao espelho na alvenaria.
              const fx = fixaProblema.get(el.id);
              const cor = sel ? CANVAS.selecao : fx ? (fx.nivel === "critico" ? CANVAS.colisao : CANVAS.aviso) : def.cor;
              const escuta = areasEscutam;
              const podeMexer = areasAtivas && !el.bloqueado;
              const off = (w.espessura_cm / 2 + 6); // desloca para a face da parede
              const ax = cx - ux * half + px * off, ay = cy - uy * half + py * off;
              const bx = cx + ux * half + px * off, by = cy + uy * half + py * off;
              return (
                <Group key={el.id} listening={escuta} draggable={podeMexer}
                  onMouseDown={() => (apagandoAcab ? removerElemParede(el.id) : selecionarElemParede(el.id))}
                  onTap={() => (apagandoAcab ? removerElemParede(el.id) : selecionarElemParede(el.id))}
                  onDragEnd={(e) => {
                    // solta: projeta o deslocamento de volta na parede e vira offset
                    const nx = cx + e.target.x(), ny = cy + e.target.y();
                    e.target.position({ x: 0, y: 0 });
                    const pj = projetarNaParede(nx, ny, w);
                    updateElemParede(el.id, { offset_cm: arred(pj.t * pj.len) });
                  }}>
                  {el.tipo === "espelho" ? (
                    <>
                      {/* espelho: linha dupla na face da parede */}
                      <Line points={[ax, ay, bx, by]} stroke={cor} strokeWidth={4 / cam.zoom} hitStrokeWidth={30 / cam.zoom} />
                      <Line points={[ax + px * (6 / cam.zoom), ay + py * (6 / cam.zoom), bx + px * (6 / cam.zoom), by + py * (6 / cam.zoom)]} stroke={cor} strokeWidth={1.5 / cam.zoom} listening={false} />
                      {(el.luz_superior || el.luz_inferior) && <Line points={[ax + px * (12 / cam.zoom), ay + py * (12 / cam.zoom), bx + px * (12 / cam.zoom), by + py * (12 / cam.zoom)]} stroke="#F2E29B" strokeWidth={2 / cam.zoom} dash={[5 / cam.zoom, 5 / cam.zoom]} listening={false} />}
                      <Text x={(ax + bx) / 2} y={(ay + by) / 2 + py * (18 / cam.zoom)} text={`Espelho ${formatLength(el.largura_cm)}${el.bloqueado ? " 🔒" : ""}`} fontSize={13 / cam.zoom} fill={cor} listening={false} />
                    </>
                  ) : (
                    <>
                      <Line points={[ax, ay, bx, by]} stroke={cor} strokeWidth={5 / cam.zoom} hitStrokeWidth={30 / cam.zoom} />
                      <Circle x={cx + px * off} y={cy + py * off} radius={Math.max(9 / cam.zoom, Math.min(14, half) )} fill="#141518" stroke={cor} strokeWidth={2 / cam.zoom} />
                      <Text x={cx + px * off - 10 / cam.zoom} y={cy + py * off - 8 / cam.zoom} text={def.icone} fontSize={16 / cam.zoom} listening={false} />
                      {sel && <Text x={cx + px * (off + 20)} y={cy + py * (off + 20)} text={def.label} fontSize={13 / cam.zoom} fill={cor} listening={false} />}
                    </>
                  )}
                </Group>
              );
            });
          })()}

          {/* Lâmina do Arquiteto: cotas de afastamento automáticas */}
          {(LAM ? LAM.afastamentos : lamina) && cotasAuto.map((c, i) => {
            const len = c.valor;
            const mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
            const ux = (c.x2 - c.x1) / (len || 1), uy = (c.y2 - c.y1) / (len || 1);
            const px = -uy, py = ux, t = 6 / cam.zoom;
            const horiz = Math.abs(ux) > Math.abs(uy);
            return (
              <Group key={`la${i}`} listening={false}>
                <Line points={[c.x1, c.y1, c.x2, c.y2]} stroke="#8FD6F0" strokeWidth={1 / cam.zoom} />
                <Line points={[c.x1 - px * t, c.y1 - py * t, c.x1 + px * t, c.y1 + py * t]} stroke="#8FD6F0" strokeWidth={1 / cam.zoom} />
                <Line points={[c.x2 - px * t, c.y2 - py * t, c.x2 + px * t, c.y2 + py * t]} stroke="#8FD6F0" strokeWidth={1 / cam.zoom} />
                <Text x={mx + (horiz ? -16 / cam.zoom : 5 / cam.zoom)} y={my + (horiz ? -14 / cam.zoom : -5 / cam.zoom)}
                  text={String(Math.round(len))} fontSize={11 / cam.zoom} fill="#8FD6F0" fontStyle="600" />
              </Group>
            );
          })}

          {/* equipamentos */}
          {ver("equipamentos") && cena.itens.map((it, idx) => (
            <ItemView key={it.id} it={it} numero={etapaAtual === "fichas" && !LAM ? idx + 1 : undefined} zoom={cam.zoom}
              selected={!apresentacao && !LAM && selectedId === it.id}
              problema={apresentacao || LAM ? null : problemas[it.id]}
              listening={itensAtivos && !apresentacao && !LAM}
              camadas={LAM ? (LAM.areasUso ? "tudo" : "nada") : apresentacao || lamina ? "nada" : (camadas ?? "tudo")}
              lamina={LAM ? LAM.medidas : lamina}
              rotulos={!LAM || LAM.rotulos} medidas={!LAM || LAM.medidas} orientacao={!LAM || LAM.orientacao}
              onSelect={() => selecionar(it.id)}
              onDragStart={() => { origemArraste.current = { x: it.x_cm, y: it.y_cm, w: it.w_cm, h: it.h_cm }; }}
              /**
               * Encaixe do equipamento durante o arraste. Passa pelo MESMO
               * resolvedor das ferramentas de desenho — antes o item usava
               * `snapCm` fixo em 5 cm, ignorando o controle de encaixe da
               * toolbar e sem enxergar parede, borda ou centro de vizinho.
               */
              onDragBound={(x, y) => {
                const ctx = ctxSnap(it.id);
                // O snap compara AABBs: com o item girado, o retângulo cru
                // (w×h sem rotação) alinharia uma borda que o consultor não vê.
                const th = ((it.rotacao || 0) * Math.PI) / 180;
                const co = Math.abs(Math.cos(th)), se = Math.abs(Math.sin(th));
                const wA = it.w_cm * co + it.h_cm * se, hA = it.w_cm * se + it.h_cm * co;
                const cx = x + it.w_cm / 2, cy = y + it.h_cm / 2;
                const bbox = { x_cm: cx - wA / 2, y_cm: cy - hA / 2, w_cm: wA, h_cm: hA };
                const { dx, dy, alvos } = resolverSnapItem(bbox, ctx);
                const final = { ...bbox, x_cm: bbox.x_cm + dx, y_cm: bbox.y_cm + dy };
                guiasRef.current = alvos;
                folgasRef.current = folgaAte(final, ctx);
                return { x: x + dx, y: y + dy };
              }}
              onDrag={(x, y, commit) => {
                // Durante o arraste o Konva já move o nó: gravar na store a
                // cada frame re-renderizaria a cena inteira (e recalcularia a
                // validação, que é O(n²)) 120 vezes por segundo no iPad.
                if (!commit) return;
                guiasRef.current = [];
                folgasRef.current = [];
                origemArraste.current = null;
                updateItem(it.id, { x_cm: x, y_cm: y }, true);
              }} />
          ))}

          {/* ── Feedback vivo do arraste: fantasma, guias e folga em cm ──── */}
          <ArrasteFX origemRef={origemArraste} guiasRef={guiasRef} folgasRef={folgasRef} zoom={cam.zoom}
            circulacaoMin={cena.circulacaoMin ?? CIRCULACAO_PADRAO} />

          {/* marcadores de calibração */}
          {calPts.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={7 / cam.zoom} fill={CANVAS.guia} />)}

          {/* marcadores de área de acabamento (retângulo) */}
          {areaPts.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={7 / cam.zoom} fill={CANVAS.selecao} />)}

          {/* Vértices já confirmados do polígono. A aresta que acompanha o
              dedo, a área parcial e o realce do fechamento ficam por conta do
              PreviewFX, logo abaixo — aqui só os pontos fixados. */}
          {polyPts.map((p, i) => (
            <Circle key={`poly${i}`} x={p.x} y={p.y} radius={(i === 0 && polyPts.length >= 3 ? 11 : 7) / cam.zoom}
              fill={i === 0 && polyPts.length >= 3 ? CANVAS.ok : CANVAS.selecao} listening={false} />
          ))}

          {/* cota em desenho */}
          {cotaPts.map((p, i) => <Circle key={`c${i}`} x={p.x} y={p.y} radius={7 / cam.zoom} fill={CANVAS.guia} listening={false} />)}

          {/* marcadores de recorte */}
          {recPts.map((p, i) => <Circle key={`r${i}`} x={p.x} y={p.y} radius={7 / cam.zoom} fill={CANVAS.ok} />)}

          {/* marcadores da Vista IA (câmera + direção) */}
          {vistaPts.map((pp, i) => <Circle key={`v${i}`} x={pp.x} y={pp.y} radius={9 / cam.zoom} fill="#C97BE0" listening={false} />)}

          {/* marcadores da parede de referência */}
          {pardPts.map((p, i) => <Circle key={`p${i}`} x={p.x} y={p.y} radius={7 / cam.zoom} fill="#C97BE0" />)}

          {/* ── Pré-visualização elástica ────────────────────────────────
              O que a ferramenta VAI criar, acompanhando o dedo: retângulo com
              medidas e m², linha com comprimento e ângulo (já endireitada se
              a ferramenta for endireitar), polígono com o ponto de fechamento
              destacado. Antes daqui, o segundo toque era às cegas. */}
          <PreviewFX {...previewAtual} ponteiroRef={ponteiroRef} zoom={cam.zoom} />
        </Layer>
      </Stage>

      {/* ── ZOOM ──────────────────────────────────────────────────────────
          Até aqui só havia roda do mouse e pinça. No iPad a pinça exige dois
          dedos sobre o desenho — o mesmo lugar onde se desenha —, e quem está
          com a Apple Pencil na mão não tem como fazê-la. Três botões no canto,
          ao alcance do polegar, resolvem: −, o próprio percentual (que
          reenquadra) e +. */}
      {!apresentacao && (
        <div className="zoombar" role="group" aria-label="Zoom">
          <button type="button" className="zb-b" aria-label="Afastar"
            onClick={() => zoomAt(size.w / 2, size.h / 2, 1 / 1.3)}>−</button>
          <button type="button" className="zb-pct" title="Enquadrar a sala inteira"
            onClick={() => enquadrar()}>{Math.round(cam.zoom * 100)}%</button>
          <button type="button" className="zb-b" aria-label="Aproximar"
            onClick={() => zoomAt(size.w / 2, size.h / 2, 1.3)}>+</button>
          <button type="button" className="zb-b" aria-label="Enquadrar a sala"
            title="Enquadrar a sala inteira" onClick={() => enquadrar()}>⤢</button>
        </div>
      )}
    </div>
  );
}

/**
 * Feedback vivo do arraste: fantasma na posição de origem, guias de
 * alinhamento e a folga em centímetros até cada vizinho.
 *
 * As guias respondem ao objetivo "efeitos intuitivos"; as cotas de folga
 * respondem ao de "análise funcional de espaço" — o consultor vê a circulação
 * em centímetros enquanto posiciona, e não só depois, no relatório.
 *
 * Lê tudo de refs por rAF: só este componente re-renderiza durante o arraste.
 */
function ArrasteFX({ origemRef, guiasRef, folgasRef, zoom, circulacaoMin }: {
  origemRef: React.MutableRefObject<{ x: number; y: number; w: number; h: number } | null>;
  guiasRef: React.MutableRefObject<AlvoSnap[]>;
  folgasRef: React.MutableRefObject<FolgaViva[]>;
  zoom: number;
  /** Régua DO PROJETO (cena.circulacaoMin) — a cota viva tem de acender com o
   *  mesmo limite que o painel de análise e o Dossiê usam. */
  circulacaoMin: number;
}) {
  const [, forcar] = useState(0);
  const ativo = !!origemRef.current;
  useEffect(() => {
    let vivo = true;
    let anterior = "";
    const tick = () => {
      if (!vivo) return;
      // Assinatura barata do que está desenhado: evita re-render por frame
      // quando nada mudou (dedo parado em cima de um alinhamento).
      const assin = (origemRef.current ? "1" : "0")
        + guiasRef.current.map((g) => `${g.tipo}${g.valor ?? ""}`).join(",")
        + "|" + folgasRef.current.map((f) => `${f.dir}${Math.round(f.cm)}`).join(",");
      if (assin !== anterior) { anterior = assin; forcar((n) => n + 1); }
      requestAnimationFrame(tick);
    };
    const h = requestAnimationFrame(tick);
    return () => { vivo = false; cancelAnimationFrame(h); };
  }, [origemRef, guiasRef, folgasRef]);

  if (!ativo) return null;
  const o = origemRef.current!;
  const guias = guiasRef.current;
  const folgas = folgasRef.current;

  return (
    <Group listening={false}>
      {/* Fantasma: de onde a peça saiu. Sem ele, um arraste acidental não tem
          referência visual do quanto andou. */}
      <Rect x={o.x} y={o.y} width={o.w} height={o.h} cornerRadius={4}
        stroke={CANVAS.ghost} strokeWidth={1.5 / zoom} dash={[10 / zoom, 7 / zoom]} />

      {/* Guias de alinhamento — no máximo uma por eixo, para não poluir. */}
      {guias.filter((g) => g.linha).map((g, i) => (
        <Group key={`g${i}`}>
          <Line points={[g.linha![0].x, g.linha![0].y, g.linha![1].x, g.linha![1].y]}
            stroke={CANVAS.guia} strokeWidth={1 / zoom} dash={[6 / zoom, 6 / zoom]} />
          {g.contraRotulo && (
            <Text x={g.linha![1].x + 6 / zoom} y={g.linha![1].y - 7 / zoom}
              text={g.contraRotulo} fontSize={11 / zoom} fill={CANVAS.guia} opacity={0.85} />
          )}
        </Group>
      ))}

      {/* Cota viva: a folga real até o vizinho, em cm, enquanto arrasta.
          Vermelho abaixo da circulação mínima do projeto. */}
      {folgas.map((f) => {
        const [a, b] = f.linha;
        const apertado = f.cm < circulacaoMin;
        const cor = apertado ? CANVAS.aviso : CANVAS.guia;
        return (
          <Group key={f.dir}>
            <Line points={[a.x, a.y, b.x, b.y]} stroke={cor} strokeWidth={1.2 / zoom} />
            <Text x={(a.x + b.x) / 2 + 5 / zoom} y={(a.y + b.y) / 2 - 8 / zoom}
              text={`${Math.round(f.cm)}`} fontSize={12 / zoom} fontStyle="700" fill={cor} />
          </Group>
        );
      })}
    </Group>
  );
}

function ItemView({ it, zoom, selected, problema, listening, camadas, lamina, numero, rotulos = true, medidas = true, orientacao = true, onSelect, onDrag, onDragStart, onDragBound }: {
  it: ItemPosicionado; zoom: number; selected: boolean;
  /** Importado de `validation`, nunca reescrito à mão: a cópia literal desta
   *  união já deixou passar um tipo de problema que nunca chegou à tela. */
  problema: Problema; listening?: boolean;
  camadas?: "tudo" | "uso" | "nada"; lamina?: boolean; numero?: number;
  /** Camadas de TEXTO do aparelho. Uma lâmina de apresentação normalmente as
   *  desliga: nome e medida em cima do desenho são ruído para quem só quer
   *  entender a sala. */
  rotulos?: boolean; medidas?: boolean; orientacao?: boolean;
  onSelect: () => void; onDrag: (x: number, y: number, commit: boolean) => void;
  onDragStart?: () => void;
  /** Posição corrigida pelo encaixe — recebe e devolve o canto superior-esquerdo. */
  onDragBound?: (x: number, y: number) => { x: number; y: number };
}) {
  // Tabela, não cadeia de ternários: com o `default` caindo na cor da zona, um
  // problema novo pintava o item como se estivesse saudável.
  const CorDoProblema: Record<Exclude<Problema, null>, string> = {
    colisao: CANVAS.colisao, giro: CANVAS.aviso, corredor: CANVAS.aviso, uso: CANVAS.aviso,
  };
  const cor = problema ? CorDoProblema[problema] : (ZONAS[it.zona]?.cor || "#888");
  // Footprint técnico: área de uso (margens frontal/lateral) e de segurança (margem extra).
  const usoF = it.uso_frontal_cm || 0, usoL = it.uso_lateral_cm || 0, seg = it.seguranca_cm || 0;
  const temUso = usoF > 0 || usoL > 0, temSeg = seg > 0;
  const mostraUso = camadas !== "nada" && temUso;
  const mostraSeg = camadas === "tudo" && temSeg;
  const vert = it.h_cm > it.w_cm * 1.3;
  const img = useHtmlImage(it.imagem || undefined);
  const temDesenho = !!(it.contorno?.length || it.imagem);
  const cx = it.x_cm + it.w_cm / 2, cy = it.y_cm + it.h_cm / 2;
  const lados = { ...LADOS_PADRAO, ...(it.lados ?? {}) };
  const distE = it.dist_entrada_cm || 0;
  // Geometria de cada lado no sistema local do item (para letras e vão de entrada).
  const geomLado: Record<LadoRect, { lx: number; ly: number; nx: number; ny: number; len: number }> = {
    topo: { lx: it.w_cm / 2, ly: 0, nx: 0, ny: -1, len: it.w_cm },
    base: { lx: it.w_cm / 2, ly: it.h_cm, nx: 0, ny: 1, len: it.w_cm },
    esq: { lx: 0, ly: it.h_cm / 2, nx: -1, ny: 0, len: it.h_cm },
    dir: { lx: it.w_cm, ly: it.h_cm / 2, nx: 1, ny: 0, len: it.h_cm },
  };
  return (
    <Group x={cx} y={cy} offsetX={it.w_cm / 2} offsetY={it.h_cm / 2} rotation={it.rotacao || 0}
      draggable={listening !== false && !it.bloqueado} listening={listening}
      onMouseDown={onSelect} onTouchStart={onSelect} onClick={onSelect} onTap={onSelect}
      onDragStart={onDragStart}
      // O encaixe acontece aqui, e não no `onDragMove`: `dragBoundFunc` corrige
      // a posição ANTES de o Konva desenhar, então o item nunca aparece fora do
      // alinhamento por um frame — e a store não é tocada durante o movimento.
      // ATENÇÃO ao espaço de coordenadas: o Konva entrega e espera aqui a
      // posição ABSOLUTA do nó, em pixels do stage — e a Layer tem pan e zoom
      // aplicados, então px absoluto NÃO é cm de mundo. É preciso inverter a
      // transformada da Layer para entrar no resolvedor de snap (que é puro em
      // cm) e aplicá-la de volta na saída. `function`, não arrow: o Konva
      // chama com `this` = nó. E `pos` é o CENTRO do item (offsetX/offsetY).
      dragBoundFunc={onDragBound
        ? function (this: Konva.Node, pos: Konva.Vector2d) {
            const layer = this.getLayer();
            if (!layer) return pos;
            const paraMundo = layer.getAbsoluteTransform().copy().invert();
            const centro = paraMundo.point(pos);
            const r = onDragBound(centro.x - it.w_cm / 2, centro.y - it.h_cm / 2);
            return layer.getAbsoluteTransform().point({ x: r.x + it.w_cm / 2, y: r.y + it.h_cm / 2 });
          }
        : undefined}
      onDragEnd={(e) => onDrag(e.target.x() - it.w_cm / 2, e.target.y() - it.h_cm / 2, true)}>
      {mostraSeg && (
        <Rect x={-usoL - seg} y={-usoF - seg} width={it.w_cm + 2 * (usoL + seg)} height={it.h_cm + 2 * (usoF + seg)}
          cornerRadius={6} fill={CANVAS.colisao} opacity={0.05} stroke={CANVAS.colisao} strokeWidth={1 / zoom} dash={[5 / zoom, 7 / zoom]} listening={false} />
      )}
      {mostraUso && (
        <Rect x={-usoL} y={-usoF} width={it.w_cm + 2 * usoL} height={it.h_cm + 2 * usoF}
          cornerRadius={5} fill={CANVAS.aviso} opacity={0.08} stroke={CANVAS.aviso} strokeWidth={1 / zoom} dash={[8 / zoom, 6 / zoom]} listening={false} />
      )}
      {/* corpo: SEM preenchimento (o piso aparece por baixo). Com desenho próprio,
          o retângulo só aparece selecionado ou com problema; sem desenho, fica o contorno fino. */}
      <Rect width={it.w_cm} height={it.h_cm} cornerRadius={4} fill="transparent"
        stroke={cor} strokeWidth={(selected ? 5 : 2) / zoom}
        opacity={temDesenho && !selected && !problema ? 0 : 1}
        dash={problema ? [10 / zoom, 7 / zoom] : undefined} />
      {/* área de toque (invisível) — sem ela o miolo transparente não seleciona */}
      <Rect width={it.w_cm} height={it.h_cm} fill="#000" opacity={0.001} />
      {/* numeração da ficha (Etapa 4) */}
      {numero != null && (
        <>
          <Circle x={0} y={0} radius={14 / zoom} fill={CANVAS.selecao} listening={false} />
          <Text x={-14 / zoom} y={-7 / zoom} width={28 / zoom} align="center" text={String(numero)}
            fontSize={13 / zoom} fontStyle="700" fill={TOKENS.canvas} listening={false} />
        </>
      )}
      {/* faixas de orientação: banda suave em cada lado (entrada/frente/costas/
          lateral), com a cor do papel — aparecem também na planta do Dossiê */}
      {orientacao && camadas !== "nada" && (Object.keys(geomLado) as LadoRect[]).map((k) => {
        const g = geomLado[k], papel = lados[k], info = PAPEL_LADO[papel];
        const horiz = g.ny !== 0; // topo/base → banda deitada
        const esp = Math.max(4, Math.min(10, (horiz ? it.h_cm : it.w_cm) * 0.09));
        const bx = horiz ? 0 : (g.nx < 0 ? 0 : it.w_cm - esp);
        const by = horiz ? (g.ny < 0 ? 0 : it.h_cm - esp) : 0;
        return (
          <Rect key={`b${k}`} x={bx} y={by}
            width={horiz ? it.w_cm : esp} height={horiz ? esp : it.h_cm}
            fill={info.cor} opacity={papel === "lateral" ? 0.14 : 0.32}
            cornerRadius={2} listening={false} />
        );
      })}
      {/* letras dos lados (E/F/C/L) — giram junto com o equipamento */}
      {orientacao && (Object.keys(geomLado) as LadoRect[]).map((k) => {
        const g = geomLado[k], papel = lados[k], info = PAPEL_LADO[papel];
        if (papel === "lateral" && !selected) return null; // laterais só quando selecionado
        const fs = 12 / zoom;
        return (
          <Text key={k} x={g.lx - g.nx * (10 / zoom) - fs / 2} y={g.ly - g.ny * (10 / zoom) - fs / 2}
            text={info.letra} fontSize={fs} fontStyle="700" fill={info.cor} listening={false} />
        );
      })}
      {/* vão livre da ENTRADA (dist_entrada_cm a partir do lado marcado como entrada) */}
      {distE > 0 && (Object.keys(geomLado) as LadoRect[]).filter((k) => lados[k] === "entrada").map((k) => {
        const g = geomLado[k];
        const horiz = g.ny !== 0; // entrada no topo/base → vão se estende na vertical
        const x = horiz ? 0 : (g.nx < 0 ? -distE : it.w_cm);
        const yv = horiz ? (g.ny < 0 ? -distE : it.h_cm) : 0;
        const wv = horiz ? it.w_cm : distE;
        const hv = horiz ? distE : it.h_cm;
        const acx = g.lx + g.nx * (distE / 2), acy = g.ly + g.ny * (distE / 2);
        return (
          <Group key={`e${k}`} listening={false}>
            <Rect x={x} y={yv} width={wv} height={hv} stroke={CANVAS.ok} strokeWidth={1.2 / zoom}
              dash={[7 / zoom, 5 / zoom]} fill={CANVAS.ok} opacity={0.35} fillEnabled={false} />
            <Line points={[g.lx, g.ly, g.lx + g.nx * distE, g.ly + g.ny * distE]}
              stroke={CANVAS.ok} strokeWidth={1.4 / zoom} dash={[4 / zoom, 4 / zoom]} />
            <Text x={acx - 20 / zoom} y={acy - 7 / zoom} text={`↦ ${Math.round(distE)}`}
              fontSize={11 / zoom} fill={CANVAS.ok} rotation={horiz ? 90 : 0} />
          </Group>
        );
      })}
      <Group x={it.w_cm / 2} y={it.h_cm / 2} offsetX={it.w_cm / 2} offsetY={it.h_cm / 2}
        scaleX={it.flipH ? -1 : 1} scaleY={it.flipV ? -1 : 1} listening={false}>
        {it.imagem && img && <KImage image={img} x={0} y={0} width={it.w_cm} height={it.h_cm} opacity={0.85} listening={false} />}
        {(it.contorno || []).map((pl, i) => (
          <Line key={i} points={pl.map((v, j) => (j % 2 === 0 ? v * it.w_cm : v * it.h_cm))} stroke={cor} strokeWidth={2 / zoom} listening={false} />
        ))}
      </Group>
      {(() => {
        // Rótulo sempre LEGÍVEL: os textos giram junto com o grupo do
        // equipamento, então em rotações de 90°–270° ficariam de cabeça para
        // baixo. Cada rótulo gira 180° em torno do próprio centro quando a
        // rotação efetiva o deixaria invertido.
        const rotN = (((it.rotacao || 0) % 360) + 360) % 360;
        const deCabeca = (base: number) => { const t = (rotN + base + 360) % 360; return t > 90 && t < 270; };
        const fsNome = Math.min(it.w_cm, it.h_cm) >= 85 ? 20 : 15;
        const rotulo = (chave: string, cy: number, larg: number, texto: string, fs: number, fill: string, peso: string, base: number, vis = true) => (
          <Group key={chave} x={it.w_cm / 2} y={cy} rotation={base + (deCabeca(base) ? 180 : 0)} listening={false} visible={vis}>
            <Text x={-larg / 2} y={-fs / 2} width={larg} align="center" text={texto} fontSize={fs} fill={fill} fontStyle={peso} listening={false} />
          </Group>
        );
        return (
          <>
            {rotulos && !temDesenho && rotulo("nome", it.h_cm / 2 - (vert ? 0 : 4), vert ? it.h_cm : it.w_cm, it.nome, fsNome, "#F2F2F0", "600", vert ? -90 : 0)}
            {rotulos && temDesenho && rotulo("nomeD", it.h_cm - 10, it.w_cm, it.nome, 12, "#F2F2F0", "600", 0)}
            {medidas && rotulo("medidas", it.h_cm / 2 + 16, it.w_cm, `${formatLength(it.w_cm)} × ${formatLength(it.h_cm)}`, 12,
              lamina ? "#E9E9E6" : "#9A9AA0", lamina ? "700" : "400", 0, lamina || (!vert && !temDesenho))}
          </>
        );
      })()}
    </Group>
  );
}
