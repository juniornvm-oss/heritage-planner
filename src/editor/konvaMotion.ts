// Movimento no lado KONVA — o gêmeo de `ui/anim.ts` para dentro do <canvas>.
//
// Por que um módulo próprio: `anim.ts` e `global.css` movem nós do DOM, que o
// compositor do Safari resolve sozinho. O editor de layout desenha em <canvas>,
// onde não existe `transition` nem `@media (prefers-reduced-motion)` — cada
// quadro precisa ser escrito à mão. A física e a disciplina vêm do mesmo lugar
// (motion-dev-animations-skill), só o motor muda.
//
// A biblioteca `motion` NÃO é usada: ela não anima nós Konva, e o app é PWA
// offline-first, que paga o peso dela no precache.
//
// Armadilha nº 1 do Konva: `DUR` está em MILISSEGUNDOS e `Konva.Tween`/`node.to()`
// medem duração em SEGUNDOS. Toda conversão mora em `MO` — nenhum call-site
// deveria dividir por 1000 de novo.

import Konva from "konva";
import { DUR, reduzMovimento } from "../ui/tokens";

/** Assinatura das funções de `Konva.Easings` (o d.ts da lib as declara com `any`). */
type FuncaoEasing = (t: number, b: number, c: number, d: number) => number;

export interface PresetMovimento {
  /** SEGUNDOS. Convertido de `DUR` (ms) uma única vez, aqui. */
  readonly duration: number;
  readonly easing: FuncaoEasing;
}

const seg = (ms: number): number => ms / 1000;

/**
 * Presets de movimento do canvas.
 *
 * Sobre o overshoot: o skill de animação oferece `Bouncy` (37% de ultrapassagem)
 * e o Konva oferece `ElasticEaseOut`/`BounceEaseOut`. Os três são PROIBIDOS aqui,
 * e não por gosto — esta é uma ferramenta de MEDIÇÃO. Quando um equipamento
 * desliza até 1,06× do destino e volta, o síndico vê a peça ocupando um espaço
 * que ela não ocupa; num app que existe para responder "cabe ou não cabe?",
 * overshoot em posição é informação falsa, não charme.
 *
 * `BackEaseOut` (~10% de ultrapassagem) fica isolado num único preset,
 * `confirma`, justamente para que a exceção seja explícita no call-site. Ele
 * responde a uma pergunta diferente — "o toque foi registrado?" — e vale só em
 * CONFIRMAÇÃO (seleção, item recém-adicionado), sobre atributos que não medem
 * nada: `scale`, `opacity`, `strokeWidth`. Nunca sobre `x`/`y`/`points`.
 */
export const MO = {
  /** Resposta ao toque: sai na hora, pousa macio. */
  press: { duration: seg(DUR.press), easing: Konva.Easings.EaseOut },
  /** Realce, troca de cor de estado. */
  fast: { duration: seg(DUR.fast), easing: Konva.Easings.EaseOut },
  /** Entrada de elemento, troca de estado. Quint-out é o tween mais próximo de
   *  uma mola criticamente amortecida: arranca rápido e assenta sem voltar. */
  base: { duration: seg(DUR.base), easing: Konva.Easings.StrongEaseOut },
  /** Painel, gaveta, sobreposição. */
  panel: { duration: seg(DUR.panel), easing: Konva.Easings.StrongEaseOut },
  /** Câmera programática. Ease-IN-out, e não out puro: uma câmera tem massa nas
   *  duas pontas — sem a aceleração inicial o começo do movimento lê como corte. */
  cam: { duration: seg(DUR.panel), easing: Konva.Easings.EaseInOut },
  /** ÚNICO preset com ultrapassagem. Ver o bloco acima antes de usar. */
  confirma: { duration: seg(DUR.fast), easing: Konva.Easings.BackEaseOut },
} as const satisfies Record<string, PresetMovimento>;

/** Atributos Konva animáveis (números, cores, e `points` de Line). */
export type AtributosTween = Readonly<Record<string, number | string | number[]>>;

/** Função de limpeza. Chame-a no cleanup do `useEffect`. */
export type Disposer = () => void;

/**
 * Um tween por nó. WeakMap e não Map: quando o React desmonta o nó, a entrada
 * some junto — um Map manteria o Konva.Node vivo para sempre.
 */
const tweensAtivos = new WeakMap<Konva.Node, Konva.Tween>();

/**
 * Interrompe o tween em curso do nó, deixando-o onde parou.
 *
 * A remoção do registro vem ANTES do `destroy()` de propósito: `Tween.destroy()`
 * do Konva apaga `Tween.attrs[nodeId][tweenId]`, então destruir o mesmo tween
 * duas vezes estoura em `delete undefined[id]`. Com a entrada já removida, um
 * segundo `cancelarTween` é inofensivo.
 */
export function cancelarTween(no: Konva.Node): void {
  const anterior = tweensAtivos.get(no);
  if (!anterior) return;
  tweensAtivos.delete(no);
  anterior.destroy();
}

/**
 * Anima `no` até `atributos` — ou aplica de uma vez, se o usuário pediu menos
 * movimento. O tween anterior do mesmo nó é cancelado antes: dois tweens
 * disputando `x` deixam a peça tremendo entre dois destinos.
 *
 * ```ts
 * tw(grupoDoItem, { opacity: 1 }, MO.fast);
 * ```
 */
export function tw(no: Konva.Node, atributos: AtributosTween, preset: PresetMovimento = MO.base): void {
  const camada = no.getLayer();

  // Sem camada o `Konva.Tween` só imprime erro no console e não anima nada
  // (acontece no intervalo entre criar o nó e o react-konva anexá-lo).
  if (!camada || reduzMovimento()) {
    cancelarTween(no);
    no.setAttrs(atributos);
    camada?.batchDraw();
    return;
  }

  cancelarTween(no);
  const tween: Konva.Tween = new Konva.Tween({
    node: no,
    ...atributos,
    duration: preset.duration,
    easing: preset.easing,
    // Todo tween criado aqui se destrói ao terminar: o `Konva.Animation` que o
    // move só para quando ele para, e um tween esquecido é um rAF eterno.
    onFinish: () => {
      tweensAtivos.delete(no);
      tween.destroy();
    },
  });
  tweensAtivos.set(no, tween);
  tween.play();
}

/** Caixa em coordenadas de MUNDO (centímetros), como todo o resto do editor. */
export interface CaixaMundo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Duração do pulso de seleção. Entre `DUR.base` e `DUR.panel`: precisa durar
 *  mais que um realce comum para o olho achá-lo, e menos que um painel para não
 *  competir com o próximo toque. */
const MS_HALO = 320;

/** No máximo um halo por camada — toques repetidos não podem empilhar anéis. */
const halosAtivos = new WeakMap<Konva.Layer, Konva.Rect>();

/**
 * Pulso one-shot de seleção: um anel que cresce de 0,92× a 1,06× enquanto some.
 *
 * O crescimento aqui é legítimo mesmo na regra anti-overshoot do `MO`: o anel é
 * um nó DESCARTÁVEL, não a peça medida — ele nasce, pulsa e se destrói sozinho
 * no `onFinish`, sem nunca mexer na geometria do item. Nasce com
 * `listening: false` porque um anel que engole o toque durante 320 ms é um bug
 * de seleção disfarçado de enfeite.
 */
export function halo(camada: Konva.Layer, caixa: CaixaMundo, cor: string): void {
  // O pulso é reforço puro: a borda de seleção já mudou de cor. Sem movimento,
  // simplesmente não existe — nada de informação se perde.
  if (reduzMovimento()) return;

  halosAtivos.get(camada)?.destroy();

  // A camada é escalada pelo zoom, então medidas de TELA (traço, canto) entram
  // divididas pela escala — mesma convenção do `/ cam.zoom` no EditorCanvas.
  const escala = camada.scaleX() || 1;

  const anel = new Konva.Rect({
    x: caixa.x + caixa.w / 2,
    y: caixa.y + caixa.h / 2,
    offsetX: caixa.w / 2,
    offsetY: caixa.h / 2, // escala a partir do centro, não do canto
    width: caixa.w,
    height: caixa.h,
    cornerRadius: 6 / escala,
    stroke: cor,
    strokeWidth: 3 / escala,
    scaleX: 0.92,
    scaleY: 0.92,
    opacity: 0.5,
    listening: false,
    perfectDrawEnabled: false,
    shadowForStrokeEnabled: false,
  });
  camada.add(anel);
  halosAtivos.set(camada, anel);

  // `node.to()` destrói o próprio tween ao terminar — para um nó descartável é
  // exatamente o ciclo de vida desejado. Duração em SEGUNDOS.
  anel.to({
    scaleX: 1.06,
    scaleY: 1.06,
    opacity: 0,
    duration: seg(MS_HALO),
    easing: Konva.Easings.EaseOut,
    onFinish: () => {
      if (halosAtivos.get(camada) === anel) halosAtivos.delete(camada);
      anel.destroy();
      camada.batchDraw();
    },
  });
}

/** Ciclos de tracejado por segundo. Em CICLOS e não em cm/s de propósito: o
 *  padrão do traço é escrito em pixels de tela (`10 / cam.zoom`), então uma
 *  velocidade em unidades de mundo faria as formigas dispararem ao dar zoom. */
const CICLOS_POR_SEGUNDO = 1.2;

/**
 * "Formigas marchantes" no contorno de COLISÃO: o tracejado escorre pela borda.
 *
 * Por que só na colisão: é o único estado do canvas que exige ação do
 * projetista. Movimento contínuo é caro em atenção — gastá-lo em decoração
 * treina o olho a ignorá-lo, e aí ele não serve quando importa.
 *
 * Devolve um disposer. Uso previsto, em que `ativo: false` já para a animação
 * pela limpeza do efeito anterior:
 *
 * ```ts
 * useEffect(() => marchingAnts(refContorno.current, temColisao), [temColisao]);
 * ```
 */
export function marchingAnts(no: Konva.Shape | null, ativo: boolean): Disposer {
  const inerte: Disposer = () => {};
  if (!no) return inerte;

  const camada = no.getLayer();
  if (!ativo || reduzMovimento() || !camada) {
    // Traço parado na posição canônica — o contorno segue tracejado, só não
    // escorre. (`_setAttr` do Konva ignora reatribuição do mesmo valor, então
    // repetir isso a cada render não força redesenho.)
    no.dashOffset(0);
    return inerte;
  }

  const padrao = no.dash() ?? [];
  const ciclo = padrao.reduce((s, v) => s + v, 0) || 1; // um período do tracejado

  const anim = new Konva.Animation((quadro) => {
    if (!quadro) return false;
    // Rede de segurança: se o React desmontou o nó sem chamar o disposer, a
    // animação se desliga em vez de virar um rAF órfão pelo resto da sessão.
    if (!no.getLayer()) {
      anim.stop();
      return false;
    }
    // O módulo mantém o offset pequeno: sem ele o valor cresceria sem limite e
    // perderia precisão numa sessão longa, e o tracejado se repete a cada
    // `ciclo` mesmo — visualmente é a mesma coisa.
    no.dashOffset(-(((quadro.time / 1000) * CICLOS_POR_SEGUNDO) % 1) * ciclo);
  }, camada);

  anim.start();

  let vivo = true;
  return () => {
    if (!vivo) return; // idempotente: React pode chamar a limpeza mais de uma vez
    vivo = false;
    anim.stop();
    no.dashOffset(0);
    camada.batchDraw();
  };
}

/** Estado da câmera do editor: escala e posição da Layer, em px de tela. */
export interface AlvoCamera {
  zoom: number;
  x: number;
  y: number;
}

/**
 * Movimento PROGRAMÁTICO de câmera — enquadrar a sala, focar no item
 * selecionado, voltar ao 100%.
 *
 * Pinch e wheel NÃO passam por aqui, e isso é regra, não omissão: naquele
 * caminho a câmera segue o dedo 1:1, e interpor uma animação de 400 ms entre o
 * gesto e o desenho não seria efeito — seria bug de responsividade, com a
 * planta chegando atrasada onde o dedo já está. Animação de câmera só se
 * justifica quando o deslocamento foi decidido pelo app e o usuário precisa
 * entender PARA ONDE ele foi levado.
 *
 * A Layer é tweenada direto no nó, e só no fim `aoTerminar` devolve o valor ao
 * estado React — 400 ms de `setState` a 60 fps seriam 24 re-renders da árvore
 * inteira do editor. Isso funciona porque o react-konva só reescreve as props
 * que MUDARAM entre renders: enquanto `cam` estiver parado no estado, ele não
 * desfaz o que o tween escreveu. Como `aoTerminar` recebe exatamente o alvo do
 * tween, o handoff para o React acontece sem salto visível.
 */
export function tweenCamera(camada: Konva.Layer, alvo: AlvoCamera, aoTerminar: (alvo: AlvoCamera) => void): void {
  const destino = { x: alvo.x, y: alvo.y, scaleX: alvo.zoom, scaleY: alvo.zoom };

  if (reduzMovimento()) {
    cancelarTween(camada);
    camada.setAttrs(destino);
    camada.batchDraw();
    aoTerminar(alvo); // o React precisa do valor final nos dois caminhos
    return;
  }

  cancelarTween(camada);
  const tween: Konva.Tween = new Konva.Tween({
    node: camada,
    ...destino,
    duration: MO.cam.duration,
    easing: MO.cam.easing,
    onFinish: () => {
      tweensAtivos.delete(camada);
      tween.destroy();
      aoTerminar(alvo);
    },
  });
  tweensAtivos.set(camada, tween);
  tween.play();
}
