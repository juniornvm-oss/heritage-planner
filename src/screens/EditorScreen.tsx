import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type Konva from "konva";
import EditorCanvas, { PADROES_PLANTA, type EstadoPonteiro, type Etapa, type FerramentaEstrutura, type FerramentaAcab, type FerramentaAcess, type PadroesPlanta } from "../editor/EditorCanvas";
import { TrilhaEtapas, ModoHUD, type ModoAtivo } from "../editor/TrilhaEtapas";
import { CaixaFerramentas } from "../editor/CaixaFerramentas";
import { BarraPropriedades } from "../editor/BarraPropriedades";
import { PosicaoPonteiro } from "../editor/BarraStatus";
import { ferramentasDaEtapa, type IdFerramenta } from "../editor/ferramentas";
import { ElevacaoEsquadria } from "../editor/PreviaEsquadria";
import { EditorLaminas, LaminasPanel } from "../editor/LaminasDossie";
import {
  JANELAS, PAREDES, PORTAS, defParede, fichaAbertura, medidaEsquadria, modeloDaAbertura, quadroDeEsquadrias,
  type FormaPilar, type MaterialParede, type ModeloJanela, type ModeloPorta,
} from "../lib/esquadrias";
import { defDaEtapa } from "../editor/etapas";
import { usePresenca } from "../ui/anim";
import EntradaPDF, { ACEITA_PDF, ACEITA_PLANTA } from "../ui/EntradaPDF";
import { useProjeto } from "../store/projetoStore";
import { useLibrary } from "../store/libraryStore";
import { obterProjeto, criarProjeto } from "../lib/supabase";
import { heritageProjeto } from "../lib/seed";
import { lerPlanta } from "../lib/planta";
import { reduzirImagem } from "../lib/imagem";
import { lerPlantaVetorial } from "../lib/plantaVetorial";
import { montarDossie, baixarPdf, type LaminaRender } from "../lib/export/pdfExport";
import { checarProntidaoDossie } from "../lib/prontidaoDossie";
import { resumo, type Problema } from "../lib/validation";
import { snapCm } from "../lib/canvas";
import { BRL, formatLength, parseLength } from "../lib/units";
import { ZONAS, CENARIOS, DESTINOS_INVENTARIO, OPCOES_DOSSIE_PADRAO, ROTULO_SECAO_DOSSIE, ORDEM_DOSSIE_PADRAO, SECAO_EXIGE_DADO, CIRCULACAO_PADRAO, TIPOS_AREA, taxaDe, MATERIAIS_PISO, ELEMENTOS_PAREDE, MOBILIARIO_CATALOGO, ACESSORIOS_CATALOGO, LADOS_PADRAO, PRESETS_LAMINA, type AcessorioProjeto, type LadoRect, type AreaFuncional, type TipoArea, type DestinoInventario, type ItemInventario, type OpcoesDossie, type SecaoDossie, type CamadasLamina, type LaminaDossie, type Cena, type MaterialPiso, type TipoElementoParede, type Zona, type Cenario, type ItemPosicionado, type Equipamento, type AreaAcabamento, type ElementoParede, type ItemInfraestrutura, type Projeto, type FamiliaAcessorio } from "../lib/types";
import { areaPoligonoM2, perimetroCm, bboxPoligono, ehRetangulo, retanguloParaPontos, transladar, m2 } from "../lib/geometria";
import { CAMPOS_ESPEC, CENARIO_DEF, ESPEC_ZONA, analisarCobertura, cenarioSugerido, composicaoZonas, detalheCenarios, explicarItem, normalizarExercicios } from "../lib/curadoria";
import { sugerirFuturo, exerciciosDaCena } from "../lib/sugestoesFuturas";
import { MUSCULOS, PADROES, REGIOES, type RegiaoCorpo } from "../lib/musculatura";
import { marcasDaCena, presencaDaMarca, refDaMarca } from "../lib/marcas";
import { analisarEspaco } from "../lib/analiseEspaco";
import { gerarPromptVista } from "../lib/promptVista";
import {
  FAMILIAS_ACESSORIO, acessorioDoCatalogo, agruparPorLugar, ancoraNoPonto, catalogoRelevante,
  custoAcessorio, familiaDoNome, familiaServida, rotuloDaAncora,
} from "../lib/acessorios";
import { uploadOrcamento, urlOrcamento, removerOrcamentoArquivo, listarCotacoes, online } from "../lib/supabase";

export default function EditorScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const somenteLeitura = id === "heritage"; // projeto legado: só visualização (evita os bugs de edição)
  const { projeto, cena, selectedId, selectedAcabId, selEstrutura, dirty, salvando } = useProjeto();
  const { abrir, selecionar, addItem, updateItem, removerSelecionado, girarSelecionado, setPlanta, updatePlanta, setPlantaVetorial, updatePlantaVetorial, recortarVetorial, addArea, undo, redo, salvar } = useProjeto();
  const { gerarEstruturaAuto, limparEstrutura, girarEstruturaSel, selecionarEstrutura } = useProjeto();
  const { removerParede, removerPilar, removerAbertura, removerArea } = useProjeto();
  const { selElemParedeId, selInfraId } = useProjeto();
  const { removerElemParede, removerInfra, addInfra } = useProjeto();
  const { duplicarItem, espelharItem } = useProjeto();
  const { selAreaFuncId, selecionarAreaFunc, addAreaFuncional, updateAreaFuncional, removerAreaFuncional } = useProjeto();
  const { addAcessorio, updateAcessorio, removerAcessorio, selecionarAcessorio, sugerirAcessoriosDoProjeto, sincronizarAcessoriosDoProjeto, organizarAcessoriosNoEspaco, selAcessorioId } = useProjeto();
  const equipamentos = useLibrary((s) => s.equipamentos);
  const acabamentos = useLibrary((s) => s.acabamentos);
  const marcasBiblioteca = useLibrary((s) => s.marcas);
  const recarregarBiblioteca = useLibrary((s) => s.recarregar);
  const config = useLibrary((s) => s.config);
  const taxa = taxaDe(config);
  useEffect(() => { void recarregarBiblioteca(); }, [recarregarBiblioteca]);

  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null); // mensagem não-fatal (import/export) — não derruba o editor
  const [modoCalibrar, setModoCalibrar] = useState(false);
  const [ferrAcab, setFerrAcab] = useState<FerramentaAcab>(null); // ferramentas da Etapa 2
  const [snapPasso, setSnapPasso] = useState(5); // 0 = snap desligado
  const [tipoElemParede, setTipoElemParede] = useState<TipoElementoParede>("tv");
  const [buscaEquip, setBuscaEquip] = useState("");
  const [filtroZona, setFiltroZona] = useState<Zona | "">("");
  const [filtroCat, setFiltroCat] = useState("");
  const [camadas, setCamadas] = useState<"tudo" | "uso" | "nada">("tudo"); // uso/segurança no canvas
  const [nudgePasso, setNudgePasso] = useState(5); // nudge do equipamento (1/5/10/20 cm)
  const [apresentacao, setApresentacao] = useState(false); // modo limpo p/ condomínio
  const [modoVista, setModoVista] = useState(false); // câmera da Vista IA
  const [lamina, setLamina] = useState(false); // Lâmina do Arquiteto (cotas automáticas)
  const [promptVista, setPromptVista] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [modoRecorte, setModoRecorte] = useState(false);
  const [modoParede, setModoParede] = useState(false);
  const [modoMoverPlanta, setModoMoverPlanta] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("planta");
  const [tipoArea, setTipoArea] = useState<TipoArea>("circulacao"); // Fase 02 · layout de área
  const [ferrEstrutura, setFerrEstrutura] = useState<FerramentaEstrutura>(null);
  const [ferrAcess, setFerrAcess] = useState<FerramentaAcess>(null);
  const [familiaAcess, setFamiliaAcess] = useState<FamiliaAcessorio>("carga");
  const [busy, setBusy] = useState<string | null>(null);
  /** O que a PRÓXIMA parede/porta/janela/pilar vai ser (flyout + barra de propriedades). */
  const [padroes, setPadroesState] = useState<PadroesPlanta>(PADROES_PLANTA);
  const setPadroes = (p: Partial<PadroesPlanta>) => setPadroesState((a) => ({ ...a, ...p }));
  /** Espelho do ponteiro e do zoom, lido por rAF só pela barra de status. */
  const ponteiroRef = useRef<EstadoPonteiro>({ x: 0, y: 0, zoom: 1, dentro: false });
  /** Camadas aplicadas ao canvas durante a captura das lâminas do Dossiê. */
  const [laminaCaptura, setLaminaCaptura] = useState<CamadasLamina | null>(null);
  const [vistaLamina, setVistaLamina] = useState<string | null>(null);
  const vistaCamadas = useMemo(() => PRESETS_LAMINA.find((p) => p.id === vistaLamina)?.camadas ?? null, [vistaLamina]);
  /** Enquadramento da sala — o export chama antes de fotografar. */
  const enquadrarRef = useRef<(() => void) | null>(null);
  /** Prévia do PDF gerado (blob URL + bytes para baixar). */
  const [previaPdf, setPreviaPdf] = useState<{ url: string; bytes: Uint8Array } | null>(null);

  // Desliga todos os modos/ferramentas (usado ao trocar de etapa).
  function limparModos() {
    setModoCalibrar(false); setFerrAcab(null); setModoRecorte(false);
    setModoParede(false); setModoMoverPlanta(false); setFerrEstrutura(null); setModoVista(false);
    setFerrAcess(null);
  }
  function irParaEtapa(e: Etapa) { limparModos(); selecionar(null); setEtapa(e); }

  // Salvar com feedback: uma falha de rede/RLS não pode morrer em silêncio
  // enquanto o botão volta a dizer "Salvar" sem explicação.
  function salvarComAviso() {
    return salvar().catch((e: unknown) => setAviso(`Não consegui salvar: ${e instanceof Error ? e.message : String(e)}`));
  }

  // Apaga o que estiver selecionado (estrutura, equipamento ou área de acabamento).
  function apagarSelecionado() {
    const s = useProjeto.getState();
    if (s.selEstrutura) {
      const { tipo, id } = s.selEstrutura;
      if (tipo === "parede") removerParede(id); else if (tipo === "pilar") removerPilar(id); else removerAbertura(id);
    } else if (s.selectedId) removerSelecionado();
    else if (s.selectedAcabId) removerArea(s.selectedAcabId);
    else if (s.selElemParedeId) removerElemParede(s.selElemParedeId);
    else if (s.selInfraId) removerInfra(s.selInfraId);
    else if (s.selAreaFuncId) removerAreaFuncional(s.selAreaFuncId);
    else if (s.selAcessorioId) removerAcessorio(s.selAcessorioId);
  }

  // ── Atalhos de teclado ────────────────────────────────────────────────
  // Com teclado acoplado ao iPad (ou no desktop), o editor deixa de exigir
  // uma viagem à toolbar para desfazer, salvar, sair de um modo ou empurrar
  // um equipamento um centímetro.
  useEffect(() => {
    if (somenteLeitura) return;
    const emCampo = (alvo: EventTarget | null) => {
      const el = alvo as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const onKey = (ev: KeyboardEvent) => {
      const mod = ev.metaKey || ev.ctrlKey;

      // Esc cancela o modo/ferramenta ativo — funciona até dentro de campo,
      // porque é a saída de emergência de quem entrou numa ferramenta sem querer.
      if (ev.key === "Escape") {
        if (promptVista) { setPromptVista(null); return; }
        ev.preventDefault();
        limparModos();
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      if (emCampo(ev.target)) return;

      if (mod && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) redo(); else undo();
        return;
      }
      if (mod && ev.key.toLowerCase() === "s") { ev.preventDefault(); void salvarComAviso(); return; }
      if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); apagarSelecionado(); return; }

      // Setas empurram o item selecionado pelo passo de nudge (Shift = 10×).
      const setas: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      const dir = setas[ev.key];
      if (dir) {
        const sel = useProjeto.getState().selectedId;
        if (!sel) return;
        ev.preventDefault();
        const passo = (nudgePasso || 1) * (ev.shiftKey ? 10 : 1);
        const it = useProjeto.getState().cena.itens.find((i) => i.id === sel);
        if (it) updateItem(sel, { x_cm: it.x_cm + dir[0] * passo, y_cm: it.y_cm + dir[1] * passo });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [somenteLeitura, nudgePasso, promptVista]);

  // Fechar a aba com alteração não salva pede confirmação ao navegador.
  useEffect(() => {
    if (!dirty || somenteLeitura) return;
    const aviso = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ""; };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [dirty, somenteLeitura]);
  const [entradaPlanta, setEntradaPlanta] = useState(false);
  const stageRef = useRef<Konva.Stage>(null);

  useEffect(() => {
    // Guarda contra corrida: se o usuário trocar de projeto antes de a resposta
    // chegar, a resposta antiga (mais lenta) não pode sobrescrever a nova.
    let cancelado = false;
    (async () => {
      if (!id) return;
      if (id === "heritage") { abrir(heritageProjeto()); return; }
      try {
        const p = await obterProjeto(id);
        if (cancelado) return;
        if (!p) { setErro("Projeto não encontrado."); return; }
        abrir(p);
      } catch {
        // offline / sem Supabase → abre o modelo Heritage como demonstração
        if (!cancelado) abrir(heritageProjeto());
      }
    })();
    return () => { cancelado = true; };
  }, [id, abrir]);

  // Cadastro → layout, sem passo manual: sempre que o projeto abre (ou a
  // biblioteca recarrega), os itens posicionados espelham o catálogo atual.
  const sincronizarAuto = useProjeto((s) => s.sincronizarComCatalogo);
  useEffect(() => {
    if (!projeto || somenteLeitura || !equipamentos.length) return;
    sincronizarAuto(equipamentos);
  }, [projeto, somenteLeitura, equipamentos, sincronizarAuto]);

  // Análise funcional de espaço: uma fonte só, consumida pelo rodapé, pela
  // gaveta, pelo mapa de problemas e pelo Dossiê. `resumo` recebe a mesma
  // instância — antes ele refazia a conta por dentro, e como não era
  // memoizado, o editor recalculava a análise inteira a cada render.
  const analise = useMemo(() => analisarEspaco(cena), [cena]);
  const r = useMemo(() => resumo(cena, analise), [cena, analise]);
  const podeDesfazer = useProjeto((s) => s.past.length > 0);
  const podeRefazer = useProjeto((s) => s.future.length > 0);

  /**
   * O modo/ferramenta ativo, descrito para o HUD sobre o canvas.
   * Antes eram treze `<span>` soltos no canto superior direito da toolbar —
   * longe do centro da planta, que é para onde o consultor está olhando
   * enquanto desenha. Um só objeto também garante que dois modos nunca
   * apareçam ao mesmo tempo dizendo coisas diferentes.
   */
  const modoAtivo: ModoAtivo | null = (() => {
    const G = "var(--gold)", I = "var(--info-soft)", V = "#C97BE0", OK = "var(--green)", X = "var(--red)";
    if (modoCalibrar) return { nome: "Calibrar escala", cor: I, instrucao: "toque 2 pontos de medida conhecida", passo: "1 de 2" };
    if (modoParede) return { nome: "Alinhar planta", cor: V, instrucao: "toque as 2 pontas de uma parede de medida conhecida", passo: "1 de 2" };
    if (modoMoverPlanta) return { nome: "Mover planta", cor: OK, instrucao: "arraste a planta de fundo para posicionar" };
    if (modoRecorte) return { nome: "Recortar", cor: OK, instrucao: "toque 2 cantos: fica só o que estiver dentro" };
    if (modoVista) return { nome: "Vista IA", cor: V, instrucao: "toque onde fica a câmera, depois para onde ela olha", passo: "1 de 2" };
    // O HUD nomeia a VARIANTE ativa, não só a ferramenta: quem escolheu
    // "porta de correr" no flyout precisa ver que é ela que vai sair do
    // próximo toque — senão descobre depois de desenhar cinco.
    if (ferrEstrutura === "parede") return { nome: `Parede · ${PAREDES[padroes.materialParede].label} ${padroes.espessuraParede} cm`, cor: G, instrucao: "toque as 2 pontas da parede", passo: "1 de 2" };
    if (ferrEstrutura === "pilar") return { nome: `Pilar · ${padroes.formaPilar === "L" ? "em L" : padroes.formaPilar}`, cor: G, instrucao: "toque 2 cantos do pilar", passo: "1 de 2" };
    if (ferrEstrutura === "porta") return { nome: `${PORTAS[padroes.modeloPorta].label} · ${padroes.larguraPorta} cm`, cor: G, instrucao: "toque sobre a parede onde fica a porta" };
    if (ferrEstrutura === "janela") return { nome: `Janela ${JANELAS[padroes.modeloJanela].label.toLowerCase()} · ${padroes.larguraJanela} cm`, cor: G, instrucao: "toque sobre a parede onde fica a janela" };
    if (ferrEstrutura === "apagar") return { nome: "Apagar", cor: X, instrucao: "toque no elemento para apagar" };
    if (ferrAcab === "rect") return { nome: etapa === "areas" ? "Região" : "Área", cor: G, instrucao: "toque 2 cantos", passo: "1 de 2" };
    if (ferrAcab === "poligono") return { nome: "Polígono", cor: G, instrucao: "toque os cantos; toque o 1º ponto (verde) para fechar" };
    if (ferrAcab === "cota") return { nome: "Cota", cor: I, instrucao: "toque 2 pontos para fixar a medida", passo: "1 de 2" };
    if (ferrAcab === "espelho") return { nome: "Espelho", cor: I, instrucao: "toque na parede onde fica o espelho" };
    if (ferrAcab === "itemParede") return { nome: ELEMENTOS_PAREDE[tipoElemParede].label, cor: G, instrucao: "toque na parede onde o item fica fixado" };
    if (ferrAcab === "apagar") return { nome: "Apagar", cor: X, instrucao: "toque no elemento para apagar" };
    if (ferrAcess === "fixar") return { nome: `Fixar · ${FAMILIAS_ACESSORIO[familiaAcess].label}`, cor: G, instrucao: "toque no aparelho, na região ou no ponto da planta" };
    if (ferrAcess === "apagar") return { nome: "Apagar acessório", cor: X, instrucao: "toque no pino para tirar da lista" };
    return null;
  })();

  // ── A caixa de ferramentas ────────────────────────────────────────────
  //
  // Os modos continuam sendo sete booleanos e dois enums, como sempre foram —
  // trocar isso por uma máquina de estados nova seria reescrever o editor
  // inteiro para ganhar zero. O que muda é que existe UM nome por ferramenta,
  // e a tradução entre esse nome e as flags mora nestas três funções. A caixa
  // vertical, o HUD e a barra de propriedades falam só o nome.

  /** Qual ferramenta está ligada agora. Sem nenhuma = "selecionar". */
  const ferramentaAtiva: IdFerramenta =
    modoCalibrar ? "calibrar"
    : modoParede ? "alinhar"
    : modoMoverPlanta ? "moverPlanta"
    : modoRecorte ? "recortar"
    : modoVista ? "vista"
    : ferrEstrutura === "apagar" ? "apagarEstrutura"
    : ferrEstrutura ? ferrEstrutura
    : ferrAcab === "rect" ? (etapa === "areas" ? "regiao" : "areaRect")
    : ferrAcab === "poligono" ? (etapa === "areas" ? "regiaoPoligono" : "areaPoligono")
    : ferrAcab === "cota" ? "cota"
    : ferrAcab === "espelho" ? "espelho"
    : ferrAcab === "itemParede" ? "itemParede"
    : ferrAcab === "apagar" ? "apagarAcabamento"
    : ferrAcess === "fixar" ? "fixarAcessorio"
    : ferrAcess === "apagar" ? "apagarAcessorio"
    : "selecionar";

  /** Liga a ferramenta, sem alternar. Usado quando a variante já foi escolhida. */
  function ligarFerramenta(id: IdFerramenta) {
    limparModos();
    switch (id) {
      case "calibrar": setModoCalibrar(true); break;
      case "alinhar": setModoParede(true); break;
      case "moverPlanta": setModoMoverPlanta(true); break;
      case "recortar": setModoRecorte(true); break;
      case "vista": setModoVista(true); break;
      case "parede": case "porta": case "janela": case "pilar": setFerrEstrutura(id); break;
      case "apagarEstrutura": setFerrEstrutura("apagar"); break;
      case "regiao": case "areaRect": setFerrAcab("rect"); break;
      case "regiaoPoligono": case "areaPoligono": setFerrAcab("poligono"); break;
      case "cota": setFerrAcab("cota"); break;
      case "espelho": setFerrAcab("espelho"); break;
      case "itemParede": setFerrAcab("itemParede"); break;
      case "apagarAcabamento": setFerrAcab("apagar"); break;
      case "fixarAcessorio": setFerrAcess("fixar"); break;
      case "apagarAcessorio": setFerrAcess("apagar"); break;
      default: break; // "selecionar" e as ações de um toque
    }
  }

  /** Toque no botão: ação de um toque, alternância, ou entrada na ferramenta. */
  function ativarFerramenta(id: IdFerramenta) {
    if (id === "importarPlanta") { setEntradaPlanta(true); return; }
    if (id === "auto") {
      // Gerar a estrutura recria TODAS as paredes com ids novos, então o que
      // estava pendurado nelas fica órfão e o store limpa. Quem já pendurou
      // precisa saber disso antes, não depois.
      const nEls = cena.elementosParede?.length ?? 0;
      if (nEls && !confirm(`Gerar a estrutura recria todas as paredes. Os ${nEls} ${nEls === 1 ? "item fixado nelas será removido" : "itens fixados nelas serão removidos"} (espelhos, TVs, pontos elétricos). Continuar?`)) return;
      gerarEstruturaAuto();
      return;
    }
    if (id === "sugerirAcessorios") {
      const n = sugerirAcessoriosDoProjeto();
      setAviso(n
        ? `${n} acessório(s) que este projeto pede — já ancorados no espaço.`
        : (cena.acessorios?.length
          ? "A lista já cobre o que o layout pede. Organizei de novo no espaço."
          : "Este layout ainda não pede acessório (não há rack, polia, peso livre, funcional ou alongamento)."));
      return;
    }
    if (id === "organizarAcessorios") {
      if (!(cena.acessorios?.length)) { setAviso("A lista está vazia — use Sugerir ou o catálogo à esquerda."); return; }
      organizarAcessoriosNoEspaco();
      setAviso("Acessórios ancorados nos aparelhos e nas regiões deste projeto.");
      return;
    }
    if (id === "sincronizarAcessorios") {
      if (!(cena.acessorios?.length)) { setAviso("A lista está vazia — use Sugerir primeiro, depois sincronize com a planta."); return; }
      const n = sincronizarAcessoriosDoProjeto();
      setAviso(n
        ? `${n} item(ns) marcados como incluso — guarda já coberta pela planta ou pelo inventário.`
        : "Nada duplicado: orçamento e planta já batem.");
      return;
    }
    // Tocar de novo na ferramenta ativa devolve o ponteiro — o mesmo idioma
    // de alternância dos botões antigos, agora num lugar só.
    if (id === ferramentaAtiva || id === "selecionar") { limparModos(); return; }
    ligarFerramenta(id);
  }

  /** Escolha no flyout: grava a variante E entra na ferramenta. */
  function escolherVariante(id: IdFerramenta, v: string) {
    switch (id) {
      case "parede": {
        const m = v as MaterialParede;
        // O reforço é uma propriedade do DRYWALL/madeira; trocar para alvenaria
        // com ele ligado marcava a parede como reforçada sem que o botão ⊕
        // sequer aparecesse para desmarcar.
        setPadroes({
          materialParede: m, espessuraParede: PAREDES[m].espessura_cm,
          ...(PAREDES[m].fixacao === "requer_reforco" ? {} : { paredeReforcada: false }),
        });
        break;
      }
      case "porta": setPadroes({ modeloPorta: v as ModeloPorta, larguraPorta: PORTAS[v as ModeloPorta].vao_cm }); break;
      case "janela": setPadroes({ modeloJanela: v as ModeloJanela, larguraJanela: JANELAS[v as ModeloJanela].vao_cm }); break;
      case "pilar": setPadroes({ formaPilar: v as FormaPilar }); break;
      case "regiao": case "regiaoPoligono": setTipoArea(v as TipoArea); break;
      case "itemParede": setTipoElemParede(v as TipoElementoParede); break;
      case "fixarAcessorio": setFamiliaAcess(v as FamiliaAcessorio); break;
      default: break;
    }
    ligarFerramenta(id);
  }

  const gruposFerramentas = useMemo(
    () => ferramentasDaEtapa(etapa, { temFundo: !!cena.planta, temVetorial: !!cena.plantaVetorial }),
    [etapa, cena.planta, cena.plantaVetorial],
  );
  const variantesAtivas: Partial<Record<IdFerramenta, string>> = {
    parede: padroes.materialParede,
    porta: padroes.modeloPorta,
    janela: padroes.modeloJanela,
    pilar: padroes.formaPilar,
    regiao: tipoArea, regiaoPoligono: tipoArea,
    itemParede: tipoElemParede,
    fixarAcessorio: familiaAcess,
  };

  // Mantém o aviso montado durante a animação de saída (sem AnimatePresence).
  const avisoPresenca = usePresenca(!!aviso);

  const [analiseAberta, setAnaliseAberta] = useState(false);

  /** Ids dos equipamentos com um dado problema — alimenta os chips clicáveis.
   *  O parâmetro é o tipo IMPORTADO: escrito à mão, ele ficava mais estreito
   *  que o valor comparado, e um tipo de problema novo sumia em silêncio —
   *  sem chip, sem ids e sem erro de compilação. */
  const idsComProblema = (tipo: Exclude<Problema, null>) =>
    Object.entries(r.problemas).filter(([, v]) => v === tipo).map(([id]) => id);

  /** Seleciona o item e vai para a etapa em que ele é editável. O consultor
   *  toca no número do problema e o editor o leva até a peça. */
  const focarItem = (itemId: string) => {
    if (etapa !== "layout" && etapa !== "fichas") irParaEtapa("layout");
    selecionar(itemId);
  };
  const selItem = cena.itens.find((i) => i.id === selectedId) || null;
  const selAcab = (cena.acabamentos ?? []).find((a) => a.id === selectedAcabId) || null;
  const selElemParede = (cena.elementosParede ?? []).find((e) => e.id === selElemParedeId) || null;
  const selInfra = (cena.infra ?? []).find((i) => i.id === selInfraId) || null;
  const selAcessorio = (cena.acessorios ?? []).find((a) => a.id === selAcessorioId) || null;
  const teto = Number(projeto?.orcamento_teto) || 0;
  const saldo = teto - r.subtotal;

  // Cria a área de piso a partir dos vértices desenhados (retângulo ou polígono).
  function onArea(pontos: { x: number; y: number }[]) {
    const bb = bboxPoligono(pontos);
    // Na Etapa 3 o mesmo desenho cria uma REGIÃO funcional, não um acabamento.
    if (etapa === "areas") {
      const nova: AreaFuncional = {
        id: crypto.randomUUID(), tipo: tipoArea, nome: null, pontos,
        x_cm: bb.x, y_cm: bb.y, w_cm: bb.w, h_cm: bb.h,
      };
      addAreaFuncional(nova);
      setFerrAcab(null);
      return;
    }
    const area: AreaAcabamento = {
      id: crypto.randomUUID(),
      acabamentoId: null,
      nome: MATERIAIS_PISO.vinilico.label,
      tipo: "piso",
      material: "vinilico",
      cor: MATERIAIS_PISO.vinilico.cor,
      preco_m2: null,
      pontos,
      rotacaoTextura: 0,
      bloqueado: false,
      x_cm: bb.x, y_cm: bb.y, w_cm: bb.w, h_cm: bb.h,
    };
    addArea(area);
    setFerrAcab(null);
  }

  /** Toque com Fixar: ancora o selecionado, ou cria a partir do catálogo filtrado. */
  function onFixarAcessorio(p: { x: number; y: number }) {
    const ancora = ancoraNoPonto(cena, p);
    const ponto = { x_cm: Math.round(p.x), y_cm: Math.round(p.y) };
    if (selAcessorio) {
      updateAcessorio(selAcessorio.id, { ancora, ...ponto });
      return;
    }
    const doFiltro = ACESSORIOS_CATALOGO.filter((c) => (c.familia ?? familiaDoNome(c.nome)) === familiaAcess
      || familiaServida(c.nome, c.familia) === familiaAcess);
    const jaTem = new Set((cena.acessorios ?? []).map((a) => a.nome));
    const candidato = doFiltro.find((c) => !jaTem.has(c.nome)) ?? doFiltro[0];
    if (!candidato) {
      addAcessorio({ ...acessorioDoCatalogo("Novo acessório", () => crypto.randomUUID()), ancora, ...ponto, nome: "Novo acessório", familia: familiaAcess });
      return;
    }
    addAcessorio({ ...acessorioDoCatalogo(candidato.nome, () => crypto.randomUUID()), ancora, ...ponto });
  }

  function adicionar(m: Equipamento) {
    const w = m.largura_cm, h = m.profundidade_cm;
    const item: ItemPosicionado = {
      id: crypto.randomUUID(),
      equipamentoId: m.id ?? null,
      nome: m.nome,
      x_cm: snapCm(cena.sala.largura_cm / 2 - w / 2),
      y_cm: snapCm(cena.sala.profundidade_cm / 2 - h / 2),
      w_cm: w, h_cm: h, rotacao: 0, zona: m.zona,
      // Já nasce classificado: cadastro do equipamento > base técnica > padrão.
      cenario: m.cenario_padrao ?? cenarioSugerido(m.nome, m.zona),
      preco: m.preco,
      imagem: m.imagem ?? null, contorno: m.contorno ?? null,
      uso_frontal_cm: m.uso_frontal_cm ?? null, uso_lateral_cm: m.uso_lateral_cm ?? null,
      seguranca_cm: m.seguranca_cm ?? null, precisa_tomada: m.precisa_tomada ?? null,
      lados: m.lados ?? null, dist_entrada_cm: m.dist_entrada_cm ?? null,
    };
    addItem(item);
  }

  async function importarPlanta(file?: File | null) {
    if (!file) return;
    setBusy("Lendo planta…");
    setAviso(null);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    try {
      if (ext === "dxf" || ext === "dwg" || ext === "pdf") {
        const pv = await lerPlantaVetorial(file); // desenho vetorial separado do texto
        if (pv) { setPlantaVetorial(pv); return; }
        // sem geometria (ex.: PDF escaneado) → cai no raster
      }
      const bmp = await lerPlanta(file);
      const cmPorPx = cena.sala.largura_cm / bmp.larguraPx; // começa do tamanho da sala; calibre depois
      setPlanta({ dataUrl: bmp.dataUrl, larguraPx: bmp.larguraPx, alturaPx: bmp.alturaPx, x_cm: 0, y_cm: 0, cmPorPx, rotacao: 0, opacidade: 0.55, bloqueada: false });
    } catch (e) {
      // Falha ao ler a planta NÃO derruba o editor: mostra um aviso dispensável e
      // mantém o layout (equipamentos/acabamentos) intacto.
      const msg = (e as Error)?.message || "Falha ao ler o arquivo.";
      setAviso(ext === "dwg"
        ? "Não consegui ler este DWG. Tente exportar como DXF ou PDF no seu CAD e importar novamente."
        : `Não consegui importar esta planta (${ext.toUpperCase() || "arquivo"}): ${msg}`);
    } finally { setBusy(null); }
  }

  function onCalibrar(distanciaMundoCm: number) {
    setModoCalibrar(false);
    const entrada = window.prompt("Distância real entre os 2 pontos (ex.: 500 ou 5 m):", "500");
    const real = entrada ? parseLength(entrada) : null;
    if (!real || distanciaMundoCm <= 0) return;
    if (cena.plantaVetorial) { updatePlantaVetorial({ escala: (cena.plantaVetorial.escala || 1) * (real / distanciaMundoCm) }); return; }
    if (cena.planta) updatePlanta({ cmPorPx: cena.planta.cmPorPx * (real / distanciaMundoCm) });
  }

  // Enquadrar por parede de referência: escala (parede = comprimento real),
  // rotaciona (parede na horizontal) e encaixa o início da parede no canto (0,0) da sala.
  function onParede(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    setModoParede(false);
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (dist <= 0) return;
    const entrada = window.prompt("Comprimento real dessa parede (ex.: 500 ou 5 m):", "500");
    const real = entrada ? parseLength(entrada) : null;
    if (!real) return;

    const s = real / dist;
    const theta = -Math.atan2(p2.y - p1.y, p2.x - p1.x); // deixa a parede na horizontal (+X)
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const S = (qx: number, qy: number) => {
      const dx = qx - p1.x, dy = qy - p1.y;
      return { x: s * (cos * dx - sin * dy), y: s * (sin * dx + cos * dy) }; // âncora A = (0,0)
    };
    let thetaDeg = (theta * 180) / Math.PI;

    // rot atual + centro atual (para virar 180° se a planta cair acima da sala)
    const rot0 = cena.plantaVetorial?.rotacao ?? cena.planta?.rotacao ?? 0;
    const centro = centroPlanta();
    let nt = S(cena.plantaVetorial?.x_cm ?? cena.planta?.x_cm ?? 0, cena.plantaVetorial?.y_cm ?? cena.planta?.y_cm ?? 0);
    if (centro && S(centro.x, centro.y).y < 0) { // corpo caiu acima da parede → gira 180° em torno do meio da parede
      nt = { x: real - nt.x, y: -nt.y }; thetaDeg += 180;
    }

    if (cena.plantaVetorial) {
      const pv = cena.plantaVetorial;
      updatePlantaVetorial({ x_cm: nt.x, y_cm: nt.y, rotacao: (rot0 || 0) + thetaDeg, escala: (pv.escala || 1) * s });
    } else if (cena.planta) {
      const pl = cena.planta;
      updatePlanta({ x_cm: nt.x, y_cm: nt.y, rotacao: (rot0 || 0) + thetaDeg, cmPorPx: pl.cmPorPx * s });
    }
  }

  // Centro da planta no mundo atual (para heurística de virar 180°).
  function centroPlanta(): { x: number; y: number } | null {
    const rot = (g: number) => (g * Math.PI) / 180;
    if (cena.planta) {
      const pl = cena.planta;
      const hx = (pl.larguraPx * pl.cmPorPx) / 2, hy = (pl.alturaPx * pl.cmPorPx) / 2;
      const a = rot(pl.rotacao || 0);
      return { x: pl.x_cm + Math.cos(a) * hx - Math.sin(a) * hy, y: pl.y_cm + Math.sin(a) * hx + Math.cos(a) * hy };
    }
    if (cena.plantaVetorial) {
      const pv = cena.plantaVetorial;
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const t of pv.tracos) for (let i = 0; i < t.pts.length; i += 2) {
        mnx = Math.min(mnx, t.pts[i]); mxx = Math.max(mxx, t.pts[i]); mny = Math.min(mny, t.pts[i + 1]); mxy = Math.max(mxy, t.pts[i + 1]);
      }
      if (!Number.isFinite(mnx)) return { x: pv.x_cm, y: pv.y_cm };
      const cx = ((mnx + mxx) / 2) * (pv.escala || 1), cy = ((mny + mxy) / 2) * (pv.escala || 1);
      const a = rot(pv.rotacao || 0);
      return { x: pv.x_cm + Math.cos(a) * cx - Math.sin(a) * cy, y: pv.y_cm + Math.sin(a) * cx + Math.cos(a) * cy };
    }
    return null;
  }

  async function salvarComoNovo() {
    setBusy("Salvando…"); setErro(null);
    try {
      const p = await criarProjeto({ nome: projeto?.nome?.replace(" (modelo)", "") || "Heritage", orcamento_teto: projeto?.orcamento_teto ?? null, cena });
      nav(`/projeto/${p.id}`);
    } catch (e) { setErro((e as Error).message); setBusy(null); }
  }

  async function exportar() {
    if (!projeto) return;
    const etapaAntes = etapa;
    const voltarDepois = etapaAntes === "curadoria" || etapaAntes === "acessorios";
    setBusy("Preparando lâminas…");
    try {
      // Nas etapas de tela cheia o canvas não está montado. Vai ao Layout só
      // para capturar, enquadra a sala inteira e DEVOLVE o consultor à etapa
      // em que estava — antes o export teletransportava e deixava lá.
      if (!stageRef.current || voltarDepois) {
        irParaEtapa("layout");
        for (let i = 0; i < 30 && !stageRef.current; i++) await new Promise((r) => setTimeout(r, 100));
      }
      enquadrarRef.current?.();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      setBusy("Capturando lâminas…");
      const laminas = (cena.laminas ?? []).filter((l) => l.ativa);
      const paraCapturar: (LaminaDossie | null)[] = laminas.length ? laminas : [null];
      const render: LaminaRender[] = [];
      for (const lam of paraCapturar) {
        setLaminaCaptura(lam ? lam.camadas : null);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const png = stageRef.current ? capturarPlantaBranca(stageRef.current) : null;
        if (png) {
          render.push({
            png,
            legenda: lam?.legenda ?? null,
            indice: lam ? !!lam.indice : true,
            titulo: lam && !lam.indice ? lam.nome : null,
          });
        }
      }
      setLaminaCaptura(null);
      if (!render.length) setAviso("A planta não pôde ser capturada — o Dossiê saiu sem ela. Abra a etapa Layout e exporte de novo.");

      let cenaPdf = cena;
      if (!(cena.acessorios?.length) && online && projeto.id && projeto.id !== "heritage") {
        try {
          const cots = await listarCotacoes(projeto.id);
          const doTipo = cots.filter((c) => c.tipo === "acessorio" && c.equipamento);
          const fonte = doTipo.some((c) => c.escolhida) ? doTipo.filter((c) => c.escolhida) : doTipo;
          const porNome = new Map<string, (typeof fonte)[number]>();
          for (const c of fonte) {
            const k = c.equipamento!.trim().toLowerCase();
            const atual = porNome.get(k);
            if (!atual || (c.preco_un ?? Infinity) < (atual.preco_un ?? Infinity)) porNome.set(k, c);
          }
          const acess = [...porNome.values()].map((c) => ({
            id: c.id ?? crypto.randomUUID(),
            nome: c.equipamento!,
            qtd: Math.max(1, Math.round(Number(c.qtd) || 1)),
            preco_un: c.preco_un ?? (c.valor != null ? c.valor / Math.max(1, Math.round(Number(c.qtd) || 1)) : 0),
          }));
          if (acess.length) cenaPdf = { ...cena, acessorios: acess };
        } catch { /* sem rede: o Dossiê sai com o que a cena tiver */ }
      }

      // Data de emissão: se ainda não há, carimba hoje — o documento precisa
      // de data, e a fase 04 só fecha com ela.
      if (!cenaPdf.dossieEmissao) {
        const hoje = new Date();
        const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
        cenaPdf = { ...cenaPdf, dossieEmissao: iso };
        useProjeto.getState().setDossieEmissao(iso);
      }

      setBusy("Montando Dossiê…");
      const bytes = await montarDossie({ ...projeto, cena: cenaPdf }, render, equipamentos, config, marcasBiblioteca, acabamentos);
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (previaPdf?.url) URL.revokeObjectURL(previaPdf.url);
      setPreviaPdf({ url, bytes });
    } catch (e) {
      setAviso(`Falha ao gerar o PDF: ${(e as Error).message}`);
    } finally {
      setLaminaCaptura(null);
      setBusy(null);
      if (voltarDepois) irParaEtapa(etapaAntes);
    }
  }

  if (erro) return <Centro><p style={{ color: "var(--red)" }}>{erro}</p><button className="btn" onClick={() => nav("/")}>Voltar</button></Centro>;
  if (!projeto) return <Centro><p style={{ color: "var(--muted)" }}>Carregando projeto…</p></Centro>;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      {/* ── Faixa 1: onde estou e o que faço com o projeto inteiro ──────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "calc(7px + var(--sat)) calc(12px + var(--sar)) 7px calc(12px + var(--sal))", flexShrink: 0 }}>
        <button className="btn btn--sm" onClick={() => nav("/")} title="Voltar ao início">←</button>
        <span className="brandface" style={{ fontSize: 18, color: "var(--gold)" }}>{projeto.nome}</span>
        {somenteLeitura
          ? <span className="chip" style={{ padding: "3px 10px", fontSize: 10.5, borderColor: "var(--muted)", color: "var(--text-3)" }}>Referência · somente visualização</span>
          : <span className="chip" style={{ padding: "3px 10px", fontSize: 10.5, borderColor: "var(--gold)", color: "var(--gold)" }}>Fase 02 · Projeto Funcional</span>}
        {id && id !== "heritage" && (
          <button className="btn btn--sm" onClick={() => nav(`/projeto/${id}/leitura`)} title="Revisar a Leitura do Condomínio">◱ Leitura</button>
        )}
        {id && !somenteLeitura && (
          <button className="btn btn--sm" onClick={() => nav(`/projeto/${id}/curadoria`)} title="Orçamentos e cotações dos fornecedores">⚖ Orçamentos</button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {busy && <span style={{ fontSize: 12, color: "var(--gold)" }}>{busy}</span>}
          {!somenteLeitura && (
            <button className="btn btn--sm" aria-pressed={apresentacao}
              onClick={() => { limparModos(); selecionar(null); setApresentacao((v) => !v); }}
              title="Modo apresentação: esconde grade, medidas e painéis">🎦 Apresentar</button>
          )}
          {somenteLeitura
            ? <button className="btn btn-gold btn--sm" onClick={() => nav("/novo")}>＋ Começar meu Heritage</button>
            : <button className="btn btn-gold btn--sm" disabled={salvando} onClick={() => void salvarComAviso()}>{salvando ? "Salvando…" : dirty ? "💾 Salvar" : "✓ Salvo"}</button>}
          <button className="btn btn-blue btn--sm" onClick={exportar} disabled={!!busy}>
            {busy ? "…" : "⤓ Dossiê"}
          </button>
        </div>
      </div>

      {/* Prévia do PDF: revisar antes de baixar — o consultor vê o documento
          completo sem sair do app e sem mandar a primeira versão errada. */}
      {previaPdf && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.72)", display: "grid", placeItems: "center", padding: 16 }}
          onClick={() => { URL.revokeObjectURL(previaPdf.url); setPreviaPdf(null); }}>
          <div className="mo-pop" style={{
            width: "min(920px, 96vw)", height: "min(92vh, 1100px)",
            background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12,
            display: "flex", flexDirection: "column", overflow: "hidden",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)" }}>
              <span className="brandface" style={{ fontSize: 16, color: "var(--gold)", flex: 1 }}>PRÉVIA DO DOSSIÊ</span>
              <button className="btn btn-gold btn--sm" onClick={() => baixarPdf(previaPdf.bytes, projeto.nome)}>⤓ Baixar PDF</button>
              <button className="btn btn--sm" onClick={() => { URL.revokeObjectURL(previaPdf.url); setPreviaPdf(null); }}>Fechar</button>
            </div>
            <iframe title="Prévia do Dossiê" src={previaPdf.url} style={{ flex: 1, border: 0, background: "#525659" }} />
          </div>
        </div>
      )}

      {/* ── Faixa 2: a trilha das etapas, com o que cada uma já entregou ── */}
      {!somenteLeitura && !apresentacao && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, padding: "0 calc(12px + var(--sar)) 0 calc(12px + var(--sal))", borderBottom: "1px solid var(--line)", flexShrink: 0, overflowX: "auto" }}>
          <TrilhaEtapas etapa={etapa} cena={cena} nColisoes={r.nCol} onIr={irParaEtapa} />
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", paddingBottom: 6 }}>
            <button className="btn btn--sm" onClick={undo} disabled={!podeDesfazer} title="Desfazer (⌘Z)">⤺</button>
            <button className="btn btn--sm" onClick={redo} disabled={!podeRefazer} title="Refazer (⇧⌘Z)">⤻</button>
          </div>
        </div>
      )}

      {/* ── Faixa 3: a BARRA DE PROPRIEDADES ─────────────────────────────
          Era a faixa de ferramentas: quinze botões que quebravam em duas
          linhas no iPad e roubavam altura da planta. A escolha de ferramenta
          desceu para a caixa vertical; aqui fica só o que responde "como vai
          ser esta peça" — as propriedades do objeto selecionado ou, sem
          seleção, as da próxima peça que a ferramenta vai criar. */}
      {!somenteLeitura && !apresentacao && (
        <BarraPropriedades
          etapa={etapa}
          ferramenta={ferramentaAtiva}
          padroes={padroes}
          onPadroes={setPadroes}
          ajuda={defDaEtapa(etapa).ajuda}
        >
          {etapa === "planta" && (
            <>
              <span className="toolgroup">
                <span className="tg-label">Planta</span>
                {(cena.planta || cena.plantaVetorial) && (
                  <button className="btn btn--xs" onClick={() => { if (confirm("Remover o arquivo de fundo? O que você desenhou (paredes/portas/pilares) fica.")) { if (cena.plantaVetorial) setPlantaVetorial(null); else setPlanta(null); selecionarEstrutura(null); } }} title="Apagar o arquivo importado, mantendo o desenho">🗋 Tirar fundo</button>
                )}
                {cena.estrutura && <button className="btn btn--xs" data-tom="perigo" onClick={() => { if (confirm("Apagar toda a estrutura — paredes, portas, janelas, pilares e tudo que estiver fixado nas paredes (espelhos, TVs, pontos elétricos)?")) limparEstrutura(); }} title="Limpar a estrutura inteira e o que estiver fixado nas paredes">🗑 Limpar</button>}
              </span>
              <GrupoEncaixe snapPasso={snapPasso} onSnap={setSnapPasso} />
            </>
          )}

          {etapa === "areas" && (
            <span className="toolgroup">
              <span className="tg-label">Próxima região</span>
              {(Object.keys(TIPOS_AREA) as TipoArea[]).map((k) => (
                <button key={k} className="btn btn--xs" onClick={() => setTipoArea(k)}
                  style={tipoArea === k ? { borderColor: TIPOS_AREA[k].cor, color: TIPOS_AREA[k].cor } : undefined}
                  title={TIPOS_AREA[k].descricao}>{TIPOS_AREA[k].label}</button>
              ))}
            </span>
          )}

          {etapa === "acabamento" && (
            <>
              {ferrAcab === "itemParede" && (
                <span className="toolgroup">
                  <span className="tg-label">Fixar</span>
                  <span style={{ font: "600 11.5px 'DM Sans'", color: "var(--gold)" }}>
                    {ELEMENTOS_PAREDE[tipoElemParede].icone} {ELEMENTOS_PAREDE[tipoElemParede].label}
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>
                    {ELEMENTOS_PAREDE[tipoElemParede].largura} × {ELEMENTOS_PAREDE[tipoElemParede].altura} cm
                  </span>
                </span>
              )}
              <GrupoEncaixe snapPasso={snapPasso} onSnap={setSnapPasso} />
            </>
          )}

          {etapa === "layout" && (
            <>
              <span className="toolgroup">
                <span className="tg-label">Item</span>
                <button className="btn btn--sm" disabled={!selItem} onClick={() => girarSelecionado()} title="Girar 90°">↻ 90°</button>
                <button className="btn btn--sm" disabled={!selItem} onClick={() => selItem && duplicarItem(selItem.id)} title="Duplicar">⧉</button>
                <button className="btn btn--sm" disabled={!selItem} onClick={removerSelecionado} title="Remover (Delete)">✕</button>
              </span>
              <GrupoEncaixe snapPasso={snapPasso} onSnap={setSnapPasso} />
              <span className="toolgroup">
                <span className="tg-label">Ver</span>
                <button className="btn btn--sm" aria-pressed={lamina} data-tom="info" onClick={() => setLamina((v) => !v)}
                  title="Lâmina do Arquiteto: medidas dos equipamentos e distâncias entre eles e as paredes — entra no Dossiê PDF">📐 Lâmina</button>
                <button className="btn btn--sm" onClick={() => setCamadas(camadas === "tudo" ? "uso" : camadas === "uso" ? "nada" : "tudo")}
                  title="Alternar camadas técnicas: uso + segurança / só uso / nada">
                  👁 {camadas === "tudo" ? "Uso+Seg" : camadas === "uso" ? "Uso" : "Corpo"}
                </button>
                <details style={{ position: "relative" }}>
                  <summary className="btn btn--sm" style={{ listStyle: "none", cursor: "pointer" }}>
                    ▱ Lâminas{vistaLamina ? ` · ${PRESETS_LAMINA.find((p) => p.id === vistaLamina)?.nome}` : ""}
                  </summary>
                  <div className="card" style={{ position: "absolute", zIndex: 50, top: "calc(100% + 7px)", right: 0, width: 310, maxHeight: "min(62vh, 440px)", overflow: "auto", padding: 8, display: "grid", gap: 5, boxShadow: "0 14px 35px rgba(0,0,0,.55)" }}>
                    <button className="btn" onClick={() => setVistaLamina(null)} style={{ textAlign: "left", borderColor: !vistaLamina ? "var(--gold)" : undefined }}>
                      <b>Editor completo</b><br /><span style={{ fontSize: 10.5, color: "var(--muted)" }}>Voltar a mostrar todas as informações de trabalho.</span>
                    </button>
                    {PRESETS_LAMINA.map((p) => (
                      <button key={p.id} className="btn" onClick={() => setVistaLamina(p.id)}
                        style={{ textAlign: "left", whiteSpace: "normal", borderColor: vistaLamina === p.id ? "var(--gold)" : undefined }}>
                        <b>{p.nome}</b><br /><span style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.35 }}>{p.descricao}</span>
                      </button>
                    ))}
                  </div>
                </details>
              </span>
              {lamina && (
                <span style={{ fontSize: 11, color: "var(--info-soft)", whiteSpace: "nowrap" }}>
                  lâmina ativa — exporte o Dossiê para levá-la ao PDF
                </span>
              )}
            </>
          )}

          {etapa === "acessorios" && (
            <>
              <span className="toolgroup">
                <span className="tg-label">Lista</span>
                <button className="btn btn--sm" disabled={!selAcessorio} onClick={() => selAcessorio && removerAcessorio(selAcessorio.id)}>✕ Tirar</button>
              </span>
              <GrupoEncaixe snapPasso={snapPasso} onSnap={setSnapPasso} />
            </>
          )}
        </BarraPropriedades>
      )}

      {somenteLeitura && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px calc(12px + var(--sar)) 8px calc(12px + var(--sal))", background: "var(--panel-2)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>🏛️</span>
          <span style={{ fontSize: 12.5, color: "#b6b6b1", lineHeight: 1.5 }}>
            Este é o <b style={{ color: "var(--gold)" }}>Heritage de referência</b> — o projeto legado que deu origem à plataforma. Fica aqui só para consulta (não é editável).
            Para tocar o projeto de verdade, <b style={{ color: "#e9e9e6" }}>comece o seu Heritage do zero</b> e siga a trilha das quatro fases.
          </span>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* ── A caixa de ferramentas, colada no canvas ──────────────────────
            Vertical porque altura é o que falta na planta em paisagem, e
            porque é onde o polegar esquerdo já está quando a mão direita
            desenha. Cada ferramenta carrega a variante escolhida no flyout. */}
        {!somenteLeitura && !apresentacao && !!gruposFerramentas.length && (
          <CaixaFerramentas
            grupos={gruposFerramentas}
            ativa={ferramentaAtiva}
            variantes={variantesAtivas}
            onFerramenta={ativarFerramenta}
            onVariante={escolherVariante}
          />
        )}
        {/* Rail esquerdo: biblioteca de equipamentos — só na Etapa 3 (Layout) */}
        {!somenteLeitura && !apresentacao && etapa === "layout" && (() => {
          const q = buscaEquip.trim().toLowerCase();
          const lista = equipamentos.filter((m) =>
            m.ativo !== false
            && (!q || `${m.nome} ${m.marca ?? ""} ${m.modelo ?? ""}`.toLowerCase().includes(q))
            && (!filtroZona || m.zona === filtroZona)
            && (!filtroCat || m.categoria === filtroCat));
          const categorias = [...new Set(equipamentos.map((m) => m.categoria).filter(Boolean))] as string[];
          return (
            <aside style={{ width: 224, flexShrink: 0, borderRight: "1px solid var(--line)", overflow: "auto", padding: "10px 10px 10px calc(10px + var(--sal))", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="brandface" style={{ fontSize: 15, color: "var(--gold)" }}>BIBLIOTECA</div>
              <input className="fld" placeholder="🔍 Buscar…" value={buscaEquip} onChange={(e) => setBuscaEquip(e.target.value)} style={{ padding: "8px 10px", fontSize: 12.5 }} />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setFiltroZona("")} style={{ padding: "4px 8px", fontSize: 10.5, ...(filtroZona === "" ? { borderColor: "var(--gold)", color: "var(--gold)" } : {}) }}>Todas</button>
                {(Object.keys(ZONAS) as Zona[]).map((z) => (
                  <button key={z} className="btn" onClick={() => setFiltroZona(filtroZona === z ? "" : z)}
                    style={{ padding: "4px 8px", fontSize: 10.5, ...(filtroZona === z ? { borderColor: ZONAS[z].cor, color: ZONAS[z].cor } : {}) }}>{ZONAS[z].label}</button>
                ))}
              </div>
              {categorias.length > 0 && (
                <select className="fld" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} style={{ padding: "7px 9px", fontSize: 12 }}>
                  <option value="">Todas as categorias</option>
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{lista.length} equipamento(s)</div>
              <div style={{ display: "grid", gap: 5 }}>
                {lista.map((m, i) => (
                  <button key={(m.id || m.nome) + i} onClick={() => adicionar(m)} style={{
                    display: "grid", gap: 2,
                    background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px",
                    color: "#c9c9c4", font: "600 12px 'DM Sans'", textAlign: "left", cursor: "pointer",
                  }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: ZONAS[m.zona]?.cor, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nome}</span>
                      {m.precisa_tomada && <span title="Precisa tomada">⚡</span>}
                    </span>
                    <span style={{ display: "flex", justifyContent: "space-between", color: "#6e6e73", fontWeight: 400, fontSize: 10.5 }}>
                      <span>{[m.marca, m.modelo].filter(Boolean).join(" ") || (m.categoria ?? "")}</span>
                      <span>{m.largura_cm}×{m.profundidade_cm}{m.preco ? ` · ${BRL(m.preco)}` : ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          );
        })()}

        {/* Rail esquerdo da Etapa 2: itens de parede + mobiliário/infraestrutura */}
        {!somenteLeitura && !apresentacao && etapa === "acabamento" && (
          <aside style={{ width: 210, flexShrink: 0, borderRight: "1px solid var(--line)", overflow: "auto", padding: "10px 10px 10px calc(10px + var(--sal))" }}>
            <div className="brandface" style={{ fontSize: 15, color: "var(--gold)", marginBottom: 8 }}>ITENS DE PAREDE</div>
            <div style={{ display: "grid", gap: 4, marginBottom: 14 }}>
              {(Object.keys(ELEMENTOS_PAREDE) as TipoElementoParede[]).filter((t) => t !== "espelho").map((t) => (
                <button key={t} onClick={() => { limparModos(); setTipoElemParede(t); setFerrAcab("itemParede"); }} style={{
                  display: "flex", alignItems: "center", gap: 7,
                  background: ferrAcab === "itemParede" && tipoElemParede === t ? "var(--gold-soft)" : "var(--panel-2)",
                  border: `1px solid ${ferrAcab === "itemParede" && tipoElemParede === t ? "var(--gold)" : "var(--line)"}`,
                  borderRadius: 7, padding: "6px 9px", color: "#c9c9c4", font: "600 11.5px 'DM Sans'", textAlign: "left", cursor: "pointer",
                }}>
                  <span>{ELEMENTOS_PAREDE[t].icone}</span>{ELEMENTOS_PAREDE[t].label}
                  <span style={{ marginLeft: "auto", color: "#6e6e73", fontWeight: 400, fontSize: 10.5 }}>{ELEMENTOS_PAREDE[t].largura}×{ELEMENTOS_PAREDE[t].altura}</span>
                </button>
              ))}
            </div>
            <div className="brandface" style={{ fontSize: 15, color: "var(--gold)", marginBottom: 8 }}>MOBILIÁRIO</div>
            <div style={{ display: "grid", gap: 4 }}>
              {MOBILIARIO_CATALOGO.map((mob) => (
                <button key={mob.tipo + mob.nome} onClick={() => {
                  const item: ItemInfraestrutura = {
                    id: crypto.randomUUID(), tipo: mob.tipo, nome: mob.nome, categoria: mob.categoria,
                    x_cm: Math.round(cena.sala.largura_cm / 2 - mob.w / 2), y_cm: Math.round(cena.sala.profundidade_cm / 2 - mob.h / 2),
                    w_cm: mob.w, h_cm: mob.h, altura_cm: mob.alt ?? null, rotacao: 0,
                  };
                  limparModos(); addInfra(item);
                }} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
                  background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 7, padding: "6px 9px",
                  color: "#c9c9c4", font: "600 11.5px 'DM Sans'", textAlign: "left", cursor: "pointer",
                }}>
                  <span>{mob.nome}</span>
                  <span style={{ color: "#6e6e73", fontWeight: 400, fontSize: 10.5 }}>{mob.w}×{mob.h}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Rail da Etapa 4: lista numerada de todos os equipamentos do projeto */}
        {!somenteLeitura && !apresentacao && etapa === "fichas" && (
          <aside style={{ width: 230, flexShrink: 0, borderRight: "1px solid var(--line)", overflow: "auto", padding: "10px 10px 10px calc(10px + var(--sal))" }}>
            <div className="brandface" style={{ fontSize: 15, color: "var(--gold)", marginBottom: 4 }}>EQUIPAMENTOS</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>{cena.itens.length} no projeto — toque para abrir a ficha</div>
            <div style={{ display: "grid", gap: 4 }}>
              {cena.itens.map((it, i) => (
                <button key={it.id} onClick={() => selecionar(it.id)} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: selectedId === it.id ? "var(--gold-soft)" : "var(--panel-2)",
                  border: `1px solid ${selectedId === it.id ? "var(--gold)" : "var(--line)"}`,
                  borderRadius: 7, padding: "6px 8px", color: "#c9c9c4", font: "600 12px 'DM Sans'", textAlign: "left", cursor: "pointer",
                }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: "var(--gold)", color: "#0C0C0E", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{it.nome}</span>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: ZONAS[it.zona]?.cor, flexShrink: 0 }} />
                </button>
              ))}
              {cena.itens.length === 0 && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Nenhum equipamento posicionado — adicione na Etapa 3.</div>}
            </div>
          </aside>
        )}

        {/* Rail da etapa Acessórios: catálogo filtrado pelo que ESTE projeto pede. */}
        {!somenteLeitura && !apresentacao && etapa === "acessorios" && (() => {
          const relevante = catalogoRelevante(cena);
          const idsRel = new Set(relevante.map((c) => c.nome));
          const lista = ferrAcess === "fixar"
            ? ACESSORIOS_CATALOGO.filter((c) => familiaServida(c.nome, c.familia) === familiaAcess || c.familia === familiaAcess)
            : (relevante.length ? relevante : ACESSORIOS_CATALOGO);
          const jaTem = new Set((cena.acessorios ?? []).map((a) => a.nome));
          const vazioDeSinal = relevante.length === 0;
          return (
            <aside style={{ width: 240, flexShrink: 0, borderRight: "1px solid var(--line)", overflow: "auto", padding: "10px 10px 10px calc(10px + var(--sal))", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="brandface" style={{ fontSize: 15, color: "var(--gold)" }}>CATÁLOGO</div>
              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>
                {vazioDeSinal
                  ? "Layout ainda sem rack, polia, peso livre, funcional ou alongamento — a lista inteira fica disponível, mas nada é sugerido."
                  : ferrAcess === "fixar"
                    ? `Família ${FAMILIAS_ACESSORIO[familiaAcess].label} — toque o item e depois o lugar na planta.`
                    : "Só o que este projeto pede. Toque para lançar; use Fixar para escolher o lugar."}
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                {lista.map((c) => {
                  const tem = jaTem.has(c.nome);
                  const cabe = idsRel.has(c.nome) || vazioDeSinal;
                  return (
                    <button key={c.nome} disabled={tem}
                      onClick={() => {
                        const novo = acessorioDoCatalogo(c.nome, () => crypto.randomUUID());
                        limparModos();
                        addAcessorio(novo);
                        setFerrAcess("fixar");
                      }}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6,
                        background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px",
                        color: tem ? "#55565a" : cabe ? "#c9c9c4" : "#8a8a8f",
                        font: "600 11.5px 'DM Sans'", textAlign: "left",
                        cursor: tem ? "default" : "pointer", opacity: tem ? 0.55 : cabe ? 1 : 0.7,
                      }}>
                      <span style={{ flex: 1 }}>{tem ? "✓ " : "＋ "}{c.nome}</span>
                      <span style={{ color: "#6e6e73", fontWeight: 400, fontSize: 10, whiteSpace: "nowrap" }}>{c.qtd}×</span>
                    </button>
                  );
                })}
              </div>
              <button className="btn" onClick={() => addAcessorio(acessorioDoCatalogo("Novo acessório", () => crypto.randomUUID()))}>
                ＋ Personalizado
              </button>
            </aside>
          );
        })()}

        {/* Etapas de análise e decisão usam a largura toda: o inventário vem
            logo após a planta e a cobertura fecha o planejamento antes do dossiê. */}
        {etapa === "inventario" && !somenteLeitura ? (
          <PainelEtapaInventario />
        ) : etapa === "cobertura" && !somenteLeitura ? (
          <PainelEtapaCobertura />
        ) : etapa === "curadoria" && !somenteLeitura ? (
          <CuradoriaPanel onEmitir={exportar} />
        ) : (<>
        {/* Canvas */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <EditorCanvas modoCalibrar={modoCalibrar} onCalibrar={onCalibrar} ferrAcab={ferrAcab} tipoElemParede={tipoElemParede} snapPasso={snapPasso} camadas={camadas} apresentacao={apresentacao} onArea={onArea}
            modoVista={modoVista} onVista={(a, b) => { setModoVista(false); setCopiado(false); setPromptVista(gerarPromptVista(cena, a, b)); }}
            lamina={lamina && etapa === "layout"}
            modoRecorte={modoRecorte} onRecorte={(rect) => { recortarVetorial(rect); setModoRecorte(false); }}
            modoParede={modoParede} onParede={onParede} modoMoverPlanta={modoMoverPlanta}
            etapa={etapa} ferrEstrutura={ferrEstrutura}
            ferrAcess={ferrAcess} onFixarAcessorio={onFixarAcessorio}
            padroes={padroes} ponteiroExternoRef={ponteiroRef} camadasLamina={laminaCaptura} visualizacaoLamina={vistaCamadas}
            stageRef={stageRef} enquadrarRef={enquadrarRef} somenteLeitura={somenteLeitura} />

          {/* HUD do modo, no topo-centro do canvas — onde o olho já está. */}
          {modoAtivo && !apresentacao && <ModoHUD modo={modoAtivo} onCancelar={limparModos} />}

          {/* Entrada da planta baixa: uma porta só, com validação, prévia da
              primeira página e progresso — em vez do <input type=file> mudo
              que existia aqui e nos outros dois pontos de upload do app. */}
          {entradaPlanta && (
            <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.62)", display: "grid", placeItems: "center", padding: 16 }}
              onClick={() => setEntradaPlanta(false)}>
              <div className="mo-pop" style={{ width: "min(560px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
                <EntradaPDF
                  aceita={ACEITA_PLANTA} maxMB={40}
                  titulo="Planta baixa do espaço"
                  ajuda="PDF vetorial é o melhor: o app extrai as paredes. DWG e DXF também. Foto ou print entra como fundo para você calibrar a escala."
                  rotuloConfirmar="Usar esta planta"
                  ocupado={busy}
                  onDocumento={async (doc) => { await importarPlanta(doc.arquivo); setEntradaPlanta(false); }} />
              </div>
            </div>
          )}

          {/* Aviso como camada FLUTUANTE. Antes era uma faixa no flex-column:
              ao aparecer, empurrava o canvas para baixo e a planta pulava sob
              o dedo no meio de um arraste. */}
          {avisoPresenca.render && (
            <div className={"toast-canvas " + (avisoPresenca.estado === "saindo" ? "mo-saindo" : "mo-pop")} role="alert">
              <span style={{ fontSize: 15 }}>⚠️</span>
              <span style={{ fontSize: 12.5, color: "var(--warn)", lineHeight: 1.5, flex: 1 }}>{aviso}</span>
              <button className="btn btn--xs" onClick={() => setAviso(null)}>Dispensar</button>
            </div>
          )}
        </div>

        {/* Inspetor direito */}
        {!apresentacao && <aside style={{ width: etapa === "fichas" || etapa === "acessorios" ? 340 : 220, flexShrink: 0, borderLeft: "1px solid var(--line)", overflow: "auto", padding: "12px calc(12px + var(--sar)) 12px 12px" }}>
          {somenteLeitura ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>Sobre este projeto</div>
              <p style={{ color: "#b6b6b1", fontSize: 12.5, lineHeight: 1.6 }}>
                O <b style={{ color: "#e9e9e6" }}>Heritage</b> foi o primeiro estudo que originou esta assessoria — o layout, o orçamento e a lógica das quatro fases nasceram aqui.
              </p>
              <p style={{ color: "#b6b6b1", fontSize: 12.5, lineHeight: 1.6 }}>
                Ele fica como <b style={{ color: "var(--gold)" }}>referência</b>: dá para navegar, dar zoom e exportar o dossiê, mas não editar.
              </p>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {cena.itens.length} equipamentos · {BRL(r.subtotal)}
              </div>
              <button className="btn btn-gold" onClick={() => nav("/novo")}>＋ Começar meu Heritage</button>
              <div style={{ fontSize: 11, color: "#6e6e73", lineHeight: 1.5 }}>Use o pinch/scroll para dar zoom e arrastar a vista.</div>
            </div>
          ) : etapa === "fichas" ? (
            selItem
              ? <FichaEquipamento item={selItem} numero={cena.itens.findIndex((i) => i.id === selItem.id) + 1} />
              : <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>
                  <b style={{ color: "var(--gold)" }}>Etapa 4 · Fichas</b><br /><br />
                  Toque um equipamento na lista à esquerda (ou na planta) para abrir a ficha: características, entrada, posição, função, restrições e demais detalhes.
                </div>
          ) : etapa === "areas" ? (
            <AreasInspector sel={(cena.areas ?? []).find((a) => a.id === selAreaFuncId) ?? null}
              tipoAtual={tipoArea} onTipoAtual={setTipoArea}
              onUpdate={updateAreaFuncional} onRemover={removerAreaFuncional} onSelecionar={selecionarAreaFunc} />
          ) : etapa === "acessorios" ? (
            <AcessoriosInspector sel={selAcessorio} />
          ) : etapa === "planta" ? (
            selEstrutura ? <EstruturaInspector sel={selEstrutura} /> : <PlantaEtapaInspector temPlanta={!!(cena.planta || cena.plantaVetorial)} temEstrutura={!!cena.estrutura} />
          ) : selItem ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>{selItem.nome} {selItem.bloqueado && "🔒"}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Dimensões (proporção travada)<br />
                <b style={{ color: "#e9e9e6", fontSize: 14 }}>{formatLength(selItem.w_cm)} × {formatLength(selItem.h_cm)}</b>
              </div>
              <Bloco label="POSIÇÃO X × Y (cm)">
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <CampoCm valor={selItem.x_cm} onSet={(v) => updateItem(selItem.id, { x_cm: v })} />
                  <span style={{ color: "var(--muted)" }}>×</span>
                  <CampoCm valor={selItem.y_cm} onSet={(v) => updateItem(selItem.id, { y_cm: v })} />
                </div>
              </Bloco>
              <Bloco label={`ROTAÇÃO · ${Math.round(selItem.rotacao || 0)}°`}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[["-45", -45], ["-15", -15], ["-1", -1], ["+1", 1], ["+15", 15], ["+45", 45]].map(([lbl, d]) => (
                    <button key={lbl} className="btn" disabled={selItem.bloqueado} onClick={() => girarSelecionado(d as number)} style={{ flex: 1, padding: "7px 1px", fontSize: 10 }}>{lbl}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  <button className="btn" disabled={selItem.bloqueado} onClick={() => girarSelecionado(90)} style={{ flex: 1, padding: "7px 2px", fontSize: 10.5 }}>90°</button>
                  <button className="btn" disabled={selItem.bloqueado} onClick={() => updateItem(selItem.id, { rotacao: 0 })} style={{ flex: 1, padding: "7px 2px", fontSize: 10.5 }}>0°</button>
                  <button className="btn" disabled={selItem.bloqueado} onClick={() => espelharItem(selItem.id, "h")} style={{ flex: 1, padding: "7px 2px", fontSize: 10.5, ...(selItem.flipH ? { borderColor: "var(--gold)", color: "var(--gold)" } : {}) }}>⇋ H</button>
                  <button className="btn" disabled={selItem.bloqueado} onClick={() => espelharItem(selItem.id, "v")} style={{ flex: 1, padding: "7px 2px", fontSize: 10.5, ...(selItem.flipV ? { borderColor: "var(--gold)", color: "var(--gold)" } : {}) }}>⇵ V</button>
                </div>
              </Bloco>
              <Bloco label={`ENTRADA · vão de ${Math.round(selItem.dist_entrada_cm || 0)} cm`}>
                <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                  {([["topo", "↑ Topo"], ["base", "↓ Base"], ["esq", "← Esq"], ["dir", "Dir →"]] as [LadoRect, string][]).map(([k, lbl]) => {
                    const ladosAtual = { ...LADOS_PADRAO, ...(selItem.lados ?? {}) };
                    const ativo = ladosAtual[k] === "entrada";
                    return (
                      <button key={k} className="btn" disabled={selItem.bloqueado} onClick={() => {
                        const novo = { ...ladosAtual };
                        (Object.keys(novo) as LadoRect[]).forEach((s2) => { if (novo[s2] === "entrada") novo[s2] = "lateral"; });
                        novo[k] = "entrada";
                        updateItem(selItem.id, { lados: novo });
                      }} style={{ flex: 1, padding: "6px 2px", fontSize: 10, ...(ativo ? { borderColor: "#5FBF7A", color: "#5FBF7A" } : {}) }}>{lbl}</button>
                    );
                  })}
                </div>
                <CampoCm valor={selItem.dist_entrada_cm ?? 0} min={0} onSet={(v) => updateItem(selItem.id, { dist_entrada_cm: v })} />
              </Bloco>
              <Bloco label={`NUDGE (${nudgePasso} cm)`}>
                <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                  {[1, 5, 10, 20].map((n) => (
                    <button key={n} className="btn" onClick={() => setNudgePasso(n)} style={{ flex: 1, padding: "5px 2px", fontSize: 10, ...(nudgePasso === n ? { borderColor: "#5FC8E8", color: "#8fd6f0" } : {}) }}>{n}</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, maxWidth: 150 }}>
                  <span /><button className="btn" disabled={selItem.bloqueado} style={{ padding: "6px 0" }} onClick={() => updateItem(selItem.id, { y_cm: selItem.y_cm - nudgePasso })}>↑</button><span />
                  <button className="btn" disabled={selItem.bloqueado} style={{ padding: "6px 0" }} onClick={() => updateItem(selItem.id, { x_cm: selItem.x_cm - nudgePasso })}>←</button>
                  <button className="btn" disabled={selItem.bloqueado} style={{ padding: "6px 0" }} onClick={() => updateItem(selItem.id, { y_cm: selItem.y_cm + nudgePasso })}>↓</button>
                  <button className="btn" disabled={selItem.bloqueado} style={{ padding: "6px 0" }} onClick={() => updateItem(selItem.id, { x_cm: selItem.x_cm + nudgePasso })}>→</button>
                </div>
              </Bloco>
              <Bloco label="ZONA">
                <select className="fld" value={selItem.zona} onChange={(e) => updateItem(selItem.id, { zona: e.target.value as Zona })}>
                  {Object.entries(ZONAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Bloco>
              <Bloco label="CENÁRIO">
                <div style={{ display: "flex", gap: 4 }}>
                  {(Object.keys(CENARIOS) as Cenario[]).map((k) => (
                    <button key={k} className="btn" onClick={() => updateItem(selItem.id, { cenario: k })} style={{
                      flex: 1, padding: "8px 4px", fontSize: 10.5,
                      borderColor: selItem.cenario === k ? CENARIOS[k].cor : "var(--line-2)",
                      color: selItem.cenario === k ? CENARIOS[k].cor : "var(--muted)",
                    }}>{CENARIOS[k].label}</button>
                  ))}
                </div>
              </Bloco>
              <Bloco label="PRIORIDADE (1–5)">
                <Nota1a5 label="Impacto" valor={selItem.impacto} onSet={(n) => updateItem(selItem.id, { impacto: n })} />
                <Nota1a5 label="Valor percebido" valor={selItem.valor_percebido} onSet={(n) => updateItem(selItem.id, { valor_percebido: n })} />
                <Nota1a5 label="Necessidade" valor={selItem.necessidade} onSet={(n) => updateItem(selItem.id, { necessidade: n })} />
              </Bloco>
              {selItem.preco ? <div style={{ fontSize: 13, color: "var(--gold)" }}>{BRL(selItem.preco)}</div> : null}
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => duplicarItem(selItem.id)}>⧉ Duplicar</button>
                <button className="btn" style={{ flex: 1 }} onClick={() => updateItem(selItem.id, { bloqueado: !selItem.bloqueado })}>{selItem.bloqueado ? "🔓 Destravar" : "🔒 Travar"}</button>
              </div>
              <button className="btn" disabled={selItem.bloqueado} onClick={removerSelecionado}>✕ Remover</button>
            </div>
          ) : selElemParede ? (
            <ElemParedeInspector el={selElemParede} />
          ) : selInfra ? (
            <InfraInspector item={selInfra} snapPasso={snapPasso} />
          ) : selAcab ? (
            <AcabamentoInspector area={selAcab} />
          ) : cena.plantaVetorial ? (
            <PlantaVetorialInspector />
          ) : cena.planta ? (
            <PlantaInspector />
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.6 }}>
              Toque um equipamento da biblioteca para adicioná-lo. Arraste na planta para posicionar.
              <br /><br />Importe a <b>planta baixa</b> (PDF/DWG) e use <b>Calibrar</b> para deixar tudo em escala real.
              <br /><br />Use <b>▦ Acabamento</b> para pintar pisos/paredes com um revestimento da biblioteca.
            </div>
          )}
        </aside>}
        </>)}
      </div>

      {/* Modal: prompt da Vista IA */}
      {promptVista && (
        <div style={{ position: "absolute", inset: 0, zIndex: 40, display: "grid", placeItems: "center", background: "rgba(0,0,0,.55)" }}
          onClick={() => setPromptVista(null)}>
          <div className="card" style={{ width: "min(680px, 92vw)", padding: 18, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div className="brandface" style={{ fontSize: 18, color: "var(--gold)" }}>📷 PROMPT DA VISTA</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
              Cole no seu gerador de imagem (Midjourney, DALL-E, Flux…). O prompt está em inglês porque os geradores respondem melhor — descreve a sala, os acabamentos e o que está no campo de visão da câmera que você posicionou.
            </div>
            <textarea className="fld" readOnly value={promptVista} rows={9}
              style={{ resize: "vertical", fontSize: 12.5, lineHeight: 1.55, fontFamily: "inherit" }}
              onFocus={(e) => e.currentTarget.select()} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={async () => {
                try { await navigator.clipboard.writeText(promptVista); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
                catch { /* iPad sem permissão: o usuário seleciona e copia manualmente */ }
              }}>{copiado ? "✓ Copiado!" : "⧉ Copiar prompt"}</button>
              <button className="btn" onClick={() => { setPromptVista(null); setModoVista(true); }}>📷 Outro ângulo</button>
              <button className="btn" onClick={() => setPromptVista(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay do modo apresentação: título do projeto */}
      {apresentacao && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 18, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <span className="brandface" style={{ fontSize: 22, color: "var(--gold)", background: "rgba(10,10,11,.72)", padding: "8px 22px", borderRadius: 999, border: "1px solid var(--line-2)" }}>
            {projeto.nome}
          </span>
        </div>
      )}

      {/* Painel de análise funcional de espaço — gaveta do rodapé. */}
      {!apresentacao && analiseAberta && <AnaliseEspacoPanel cena={cena} onFechar={() => setAnaliseAberta(false)} />}

      {/* Rodapé: validação */}
      {!apresentacao && <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px calc(12px + var(--sar)) calc(7px + var(--sab)) calc(12px + var(--sal))", borderTop: "1px solid var(--line)", flexWrap: "wrap", flexShrink: 0 }}>
        {/* Chips CLICÁVEIS: tocar num problema leva ao equipamento culpado.
            Antes "3 colisão(ões)" era um número morto e o consultor caçava o
            contorno vermelho no olho, numa planta com quarenta peças. */}
        <ChipProblema ok={r.nCol === 0} txt={r.nCol === 0 ? "Sem colisões" : `${r.nCol} colisão(ões)`}
          ids={idsComProblema("colisao")} onIr={focarItem} />
        <ChipProblema ok={r.nCor === 0} warn txt={r.nCor === 0 ? "Corredor livre" : `${r.nCor} no corredor`}
          ids={idsComProblema("corredor")} onIr={focarItem} />
        {r.nUso > 0 && <ChipProblema warn txt={`${r.nUso} área(s) de uso invadida(s)`}
          ids={idsComProblema("uso")} onIr={focarItem} />}
        {/* Piso reservado pela folha da porta: só aparece quando há conflito,
            porque numa sala sem porta desenhada o chip seria ruído. */}
        {r.nGiro > 0 && <ChipProblema warn txt={`${r.nGiro} no giro de porta`}
          ids={idsComProblema("giro")} onIr={focarItem} />}
        <button className="chip" onClick={() => setAnaliseAberta((v) => !v)}
          aria-expanded={analiseAberta}
          style={{ borderColor: analise.ocupacaoFuncional.status === "critico" ? "var(--red)" : analise.ocupacaoFuncional.status === "atencao" ? "var(--warn)" : "var(--line-2)",
                   color: analise.ocupacaoFuncional.status === "critico" ? "var(--red)" : analise.ocupacaoFuncional.status === "atencao" ? "var(--warn)" : "var(--text-3)",
                   cursor: "pointer", background: "transparent" }}
          title="Abrir a análise funcional de espaço">
          📊 Ocupação {Math.round(analise.ocupacaoFuncional.valor)}%
          {analise.folgas.menorVaoCm != null && <> · vão {Math.round(analise.folgas.menorVaoCm)} cm</>}
          {analiseAberta ? " ▾" : " ▸"}
        </button>
        {(cena.acessorios?.length ?? 0) > 0 && <Chip gold txt={`Acessórios ${BRL(Math.round((cena.acessorios ?? []).reduce((t, a) => t + a.qtd * a.preco_un, 0)))}`} />}
        <Chip neutro txt={`Equipamentos ${cena.itens.length}`} />
        <Chip gold txt={BRL(r.subtotal)} />
        <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
        {(Object.keys(CENARIOS) as Cenario[]).map((k) => (
          <span key={k} style={{ border: `1px solid ${CENARIOS[k].cor}`, color: CENARIOS[k].cor, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 700 }}>
            {CENARIOS[k].label} {BRL(r.cenarios[k])}
          </span>
        ))}
        {/* A leitura da barra de status: onde está o dedo, em que escala, com
            que encaixe. Fica encostada à direita para não empurrar os chips, e
            re-renderiza sozinha por rAF — o resto do editor não sente. */}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {!somenteLeitura && <PosicaoPonteiro estadoRef={ponteiroRef} snapPasso={snapPasso} />}
          {teto > 0 && <span style={{ fontSize: 12, color: saldo >= 0 ? "var(--green)" : "var(--red)" }}>
            Teto {BRL(teto)} · Assessoria {BRL(Math.round(teto * taxa))} · Saldo {BRL(saldo)}
          </span>}
        </span>
      </div>}
    </div>
  );
}

/** Exporta o stage com o fundo em branco (o editor é escuro; o papel, não).
 *  Troca a cor do retângulo de fundo, captura e devolve como estava. */
function capturarPlantaBranca(stage: Konva.Stage): string {
  const bg = stage.findOne(".bg-externo") as Konva.Rect | undefined;
  const anterior = bg?.fill();
  try {
    bg?.fill("#FFFFFF");
    return stage.toDataURL({ pixelRatio: 2 });
  } finally {
    if (bg && anterior) bg.fill(anterior);
    stage.batchDraw();
  }
}

// Ajuste fino da planta de fundo: rotação e posição (usado por raster e vetorial).
function AjustePlanta({ rotacao, onRot, onNudge }: { rotacao: number; onRot: (delta: number) => void; onNudge: (dx: number, dy: number) => void }) {
  const passo = 20; // cm por toque
  return (
    <Bloco label={`ROTAÇÃO ${Math.round(((rotacao % 360) + 360) % 360)}°`}>
      <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
        <button className="btn" style={{ flex: 1, padding: "7px 4px", fontSize: 11 }} onClick={() => onRot(-90)}>↺ 90°</button>
        <button className="btn" style={{ flex: 1, padding: "7px 4px", fontSize: 11 }} onClick={() => onRot(-1)}>−1°</button>
        <button className="btn" style={{ flex: 1, padding: "7px 4px", fontSize: 11 }} onClick={() => onRot(1)}>+1°</button>
        <button className="btn" style={{ flex: 1, padding: "7px 4px", fontSize: 11 }} onClick={() => onRot(90)}>90° ↻</button>
      </div>
      <span className="microlabel">POSIÇÃO (nudge {passo} cm)</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginTop: 5, maxWidth: 150 }}>
        <span /><button className="btn" style={{ padding: "6px 0" }} onClick={() => onNudge(0, -passo)}>↑</button><span />
        <button className="btn" style={{ padding: "6px 0" }} onClick={() => onNudge(-passo, 0)}>←</button>
        <button className="btn" style={{ padding: "6px 0" }} onClick={() => onNudge(0, passo)}>↓</button>
        <button className="btn" style={{ padding: "6px 0" }} onClick={() => onNudge(passo, 0)}>→</button>
      </div>
    </Bloco>
  );
}

function PlantaInspector() {
  const planta = useProjeto((s) => s.cena.planta)!;
  const updatePlanta = useProjeto((s) => s.updatePlanta);
  const setPlanta = useProjeto((s) => s.setPlanta);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PLANTA BAIXA</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>Escala: <b style={{ color: "#e9e9e6" }}>{planta.cmPorPx.toFixed(3)} cm/px</b></div>
      <div style={{ fontSize: 11.5, color: "#b6b6b1", lineHeight: 1.5 }}>
        Para encaixar na sala: <b>📏 Parede</b> (toque as 2 pontas de uma parede e informe a medida — a planta é escalada, girada e encaixada). <b>🖐 Mover</b> arrasta; ajuste fino abaixo.
      </div>
      <AjustePlanta rotacao={planta.rotacao || 0}
        onRot={(d) => updatePlanta({ rotacao: (planta.rotacao || 0) + d })}
        onNudge={(dx, dy) => updatePlanta({ x_cm: planta.x_cm + dx, y_cm: planta.y_cm + dy })} />
      <Bloco label={`OPACIDADE ${Math.round(planta.opacidade * 100)}%`}>
        <input type="range" min={0} max={1} step={0.05} value={planta.opacidade} onChange={(e) => updatePlanta({ opacidade: +e.target.value })} style={{ width: "100%" }} />
      </Bloco>
      <button className="btn" onClick={() => setPlanta(null)}>Remover planta</button>
    </div>
  );
}

function PlantaVetorialInspector() {
  const pv = useProjeto((s) => s.cena.plantaVetorial)!;
  const updatePV = useProjeto((s) => s.updatePlantaVetorial);
  const toggleCamada = useProjeto((s) => s.toggleCamada);
  const setPV = useProjeto((s) => s.setPlantaVetorial);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PLANTA VETORIAL</div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {pv.origem.toUpperCase()} · {pv.tracos.length} traços · {pv.rotulos.length} textos
      </div>
      {Math.abs((pv.escala || 1) - 1) > 1e-6 && <div style={{ fontSize: 11, color: "var(--muted)" }}>Escala calibrada: ×{(pv.escala || 1).toFixed(3)}</div>}
      <div style={{ fontSize: 11.5, color: "#b6b6b1", lineHeight: 1.5 }}>
        Para encaixar na sala use <b>📏 Parede</b> (toque as 2 pontas de uma parede e informe a medida — escala, gira e encaixa). <b>🖐 Mover</b> arrasta; <b>📐 Calibrar</b> ajusta só a escala.
        {pv.origem === "pdf" && <> <b>✂ Recortar</b> isola a planta do carimbo/observações.</>}
      </div>
      <AjustePlanta rotacao={pv.rotacao || 0}
        onRot={(d) => updatePV({ rotacao: (pv.rotacao || 0) + d })}
        onNudge={(dx, dy) => updatePV({ x_cm: pv.x_cm + dx, y_cm: pv.y_cm + dy })} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#c9c9c4" }}>
        <input type="checkbox" checked={pv.mostrarTexto} onChange={(e) => updatePV({ mostrarTexto: e.target.checked })} />
        Mostrar texto / anotações
      </label>
      <Bloco label={`OPACIDADE ${Math.round(pv.opacidade * 100)}%`}>
        <input type="range" min={0.15} max={1} step={0.05} value={pv.opacidade} onChange={(e) => updatePV({ opacidade: +e.target.value })} style={{ width: "100%" }} />
      </Bloco>
      {pv.camadas.length > 1 && (
        <Bloco label="CAMADAS">
          <div style={{ display: "grid", gap: 3, maxHeight: 220, overflow: "auto" }}>
            {pv.camadas.map((c) => (
              <label key={c.nome} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#c9c9c4" }}>
                <input type="checkbox" checked={c.visivel} onChange={() => toggleCamada(c.nome)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
              </label>
            ))}
          </div>
        </Bloco>
      )}
      <button className="btn" onClick={() => setPV(null)}>Remover planta</button>
    </div>
  );
}

// Inspetor da Etapa 1 sem seleção: orientação + gerar estrutura.
function PlantaEtapaInspector({ temPlanta, temEstrutura }: { temPlanta: boolean; temEstrutura: boolean }) {
  const sala = useProjeto((s) => s.cena.sala);
  const temParedes = useProjeto((s) => !!s.cena.estrutura?.paredes.length);
  const updateSala = useProjeto((s) => s.updateSala);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>ETAPA 1 · PLANTA</div>
      {!temParedes && (
        <Bloco label="SALA (GUIA) — LARGURA × PROFUNDIDADE">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input className="fld" type="number" min={100} step={10} value={sala.largura_cm}
              onChange={(e) => updateSala({ largura_cm: Math.max(100, +e.target.value || 0) })} />
            <span style={{ color: "var(--muted)" }}>×</span>
            <input className="fld" type="number" min={100} step={10} value={sala.profundidade_cm}
              onChange={(e) => updateSala({ profundidade_cm: Math.max(100, +e.target.value || 0) })} />
          </div>
          <span style={{ fontSize: 11, color: "#6e6e73", lineHeight: 1.5 }}>
            O retângulo tracejado é só uma <b>guia</b> com as dimensões do projeto (em cm) — não é parede.
            Ele some sozinho quando você desenhar as paredes reais.
          </span>
        </Bloco>
      )}
      <p style={{ color: "#b6b6b1", fontSize: 12.5, lineHeight: 1.6 }}>
        <b style={{ color: "#e9e9e6" }}>1.</b> Suba o arquivo em <b>⭱ Planta</b> (PDF, DWG, DXF ou imagem).<br />
        <b style={{ color: "#e9e9e6" }}>2.</b> Ajuste a escala com <b>📏 Calibrar</b> e posicione com <b>🖐 Mover</b>.<br />
        <b style={{ color: "#e9e9e6" }}>3.</b> Toque <b style={{ color: "var(--gold)" }}>✨ Auto</b> para gerar paredes e pilares já em escala.
      </p>
      <p style={{ color: "#b6b6b1", fontSize: 12.5, lineHeight: 1.6 }}>
        Depois refine à mão com <b>▮ Parede</b>, <b>🚪 Porta</b>, <b>🪟 Janela</b> e <b>◼ Pilar</b>, na caixa à esquerda.
        Cada uma tem <b style={{ color: "var(--gold)" }}>opções</b>: toque o cantinho <b>◢</b> do botão (ou segure o botão)
        para escolher alvenaria ou drywall, porta de correr ou de giro, janela basculante ou de folhas.
        A escolha vale para a <b>próxima</b> peça e aparece na barra de cima; para mudar uma peça já desenhada, toque nela.
      </p>
      {!temPlanta && <div style={{ fontSize: 11.5, color: "#E09A45" }}>Comece subindo a planta em ⭱ Planta.</div>}
      {temPlanta && !temEstrutura && <div style={{ fontSize: 11.5, color: "var(--gold)" }}>Planta carregada — toque ✨ Auto para gerar a estrutura.</div>}
    </div>
  );
}

// Inspetor de um elemento da estrutura (parede / pilar / porta / janela).
function EstruturaInspector({ sel }: { sel: { tipo: "parede" | "pilar" | "abertura"; id: string } }) {
  const est = useProjeto((s) => s.cena.estrutura);
  const updateParede = useProjeto((s) => s.updateParede);
  const updatePilar = useProjeto((s) => s.updatePilar);
  const updateAbertura = useProjeto((s) => s.updateAbertura);
  const removerParede = useProjeto((s) => s.removerParede);
  const removerPilar = useProjeto((s) => s.removerPilar);
  const removerAbertura = useProjeto((s) => s.removerAbertura);
  if (!est) return null;

  if (sel.tipo === "parede") {
    const p = est.paredes.find((x) => x.id === sel.id); if (!p) return null;
    const len = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
    const dp = defParede(p.material);
    const nAberturas = est.aberturas.filter((a) => a.paredeId === p.id).length;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PAREDE</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Comprimento<br /><b style={{ color: "#e9e9e6", fontSize: 15 }}>{formatLength(len)}</b></div>
        {/* Espessura e material moram na barra de propriedades (é lá que se
            ajusta olhando a planta). Aqui fica o que é longo de ler. */}
        <div style={{ fontSize: 11.5, color: "#b6b6b1", lineHeight: 1.55, borderLeft: `2px solid ${dp.cor}`, paddingLeft: 9 }}>
          <b style={{ color: "#e9e9e6" }}>{dp.label}</b> · {p.espessura_cm} cm<br />{dp.descricao}
        </div>
        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: dp.fixacao === "livre" ? "var(--green)" : dp.fixacao === "nao_recebe" ? "var(--red)" : p.reforcada ? "var(--green)" : "var(--warn)" }}>
          {dp.fixacao === "livre"
            ? "✓ Recebe espelho, TV e espaldar direto no substrato."
            : dp.fixacao === "nao_recebe"
              ? "✕ Não recebe nada pendurado — leve o espelho e a TV para outra parede."
              : p.reforcada
                ? "✓ Reforço embutido previsto: carga pesada liberada."
                : "⚠ Exige reforço embutido (montante duplo ou chapa de OSB no miolo) antes do fechamento. Marque “⊕ Reforçada” na barra de cima quando o projeto previr."}
        </div>
        <Bloco label="ETIQUETA (opcional)">
          <input className="fld" value={p.nome ?? ""} placeholder="divisa do vestiário"
            onChange={(e) => updateParede(p.id, { nome: e.target.value || undefined })} />
        </Bloco>
        <Bloco label="PÉ-DIREITO LOCAL (cm)">
          <input className="fld" type="number" min={0} value={p.altura_cm ?? ""} placeholder="o da sala"
            onChange={(e) => updateParede(p.id, { altura_cm: e.target.value ? Math.max(0, +e.target.value) : undefined })} />
        </Bloco>
        <button className="btn" onClick={() => removerParede(p.id)}
          title={nAberturas ? `Leva junto ${nAberturas} abertura(s) e o que estiver fixado nesta parede.` : "Leva junto o que estiver fixado nesta parede."}>
          ✕ Remover parede{nAberturas ? ` (+${nAberturas} abertura${nAberturas > 1 ? "s" : ""})` : ""}
        </button>
      </div>
    );
  }
  if (sel.tipo === "pilar") {
    const p = est.pilares.find((x) => x.id === sel.id); if (!p) return null;
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PILAR</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Bloco label="LARGURA (cm)"><input className="fld" type="number" min={5} value={p.w_cm} onChange={(e) => updatePilar(p.id, { w_cm: Math.max(5, +e.target.value || 0) })} /></Bloco>
          <Bloco label="PROFUND. (cm)"><input className="fld" type="number" min={5} value={p.h_cm} onChange={(e) => updatePilar(p.id, { h_cm: Math.max(5, +e.target.value || 0) })} /></Bloco>
        </div>
        <button className="btn" onClick={() => removerPilar(p.id)}>✕ Remover pilar</button>
      </div>
    );
  }
  const a = est.aberturas.find((x) => x.id === sel.id); if (!a) return null;
  const f = fichaAbertura(a);
  const modelo = modeloDaAbertura(a);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>{a.tipo === "porta" ? "PORTA" : "JANELA"}</div>
      {/* A ELEVAÇÃO. Em planta o corte é sempre reto — é aqui que a forma do
          vão, a divisão das folhas e o peitoril aparecem. Sem este desenho,
          "janela em arco pleno" seria uma palavra guardada num campo. */}
      <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 2px", color: "var(--info-soft)" }}>
        <ElevacaoEsquadria esp={{ ...a, modelo }} altura={132} />
      </div>
      <div style={{ fontSize: 12.5, color: "#e9e9e6", textAlign: "center", fontWeight: 600 }}>{f.label}</div>
      <div style={{ fontSize: 11.5, color: "#b6b6b1", lineHeight: 1.55 }}>{f.descricao}</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.6 }}>
        Vão <b style={{ color: "#e9e9e6" }}>{medidaEsquadria(f.largura_cm, f.altura_cm)} m</b>
        {f.peitoril_cm != null && <> · peitoril <b style={{ color: "#e9e9e6" }}>{f.peitoril_cm} cm</b></>}
        <br />Medidas, modelo e sentido de abertura se ajustam na barra de cima.
      </div>
      <Bloco label="POSIÇÃO NA PAREDE (cm)">
        <input className="fld" type="number" min={0} value={Math.round(a.centro_cm)} onChange={(e) => updateAbertura(a.id, { centro_cm: Math.max(0, +e.target.value || 0) })} />
      </Bloco>
      <Bloco label="OBSERVAÇÃO (sai no quadro de esquadrias)">
        <textarea className="fld" rows={2} value={a.nota ?? ""} placeholder="ferragem, vidro, bandeira, tela mosquiteira…"
          onChange={(e) => updateAbertura(a.id, { nota: e.target.value || undefined })} />
      </Bloco>
      <button className="btn" onClick={() => removerAbertura(a.id)}>✕ Remover</button>
    </div>
  );
}

// Campo numérico em cm que confirma no blur/Enter (não "briga" com a digitação).
function CampoCm({ valor, min, onSet }: { valor: number; min?: number; onSet: (v: number) => void }) {
  const [txt, setTxt] = useState(String(Math.round(valor * 10) / 10));
  useEffect(() => { setTxt(String(Math.round(valor * 10) / 10)); }, [valor]);
  const confirmar = () => {
    const n = parseFloat(txt.replace(",", "."));
    if (Number.isFinite(n)) onSet(Math.max(min ?? -100000, n));
    else setTxt(String(Math.round(valor * 10) / 10));
  };
  return <input className="fld" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)}
    onBlur={confirmar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function AcabamentoInspector({ area }: { area: AreaAcabamento }) {
  const acabamentos = useLibrary((s) => s.acabamentos);
  const marcasBiblioteca = useLibrary((s) => s.marcas);
  const cena = useProjeto((s) => s.cena);
  const updateArea = useProjeto((s) => s.updateArea);
  const removerArea = useProjeto((s) => s.removerArea);
  const duplicarArea = useProjeto((s) => s.duplicarArea);
  const moverArea = useProjeto((s) => s.moverArea);

  const pontos = area.pontos ?? [];
  const rect = ehRetangulo(pontos);
  const areaM2 = areaPoligonoM2(pontos);
  const perim = perimetroCm(pontos);
  const custo = area.preco_m2 ? areaM2 * area.preco_m2 : 0;
  const travado = !!area.bloqueado;

  // Referência para distâncias: caixa das paredes desenhadas; senão, a sala-guia.
  const ref = (() => {
    const ps = cena.estrutura?.paredes ?? [];
    if (ps.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of ps) { x0 = Math.min(x0, p.x1, p.x2); x1 = Math.max(x1, p.x1, p.x2); y0 = Math.min(y0, p.y1, p.y2); y1 = Math.max(y1, p.y1, p.y2); }
      return { x0, y0, x1, y1, nome: "parede" };
    }
    return { x0: 0, y0: 0, x1: cena.sala.largura_cm, y1: cena.sala.profundidade_cm, nome: "sala" };
  })();
  const dEsq = area.x_cm - ref.x0, dTopo = area.y_cm - ref.y0;
  const dDir = ref.x1 - (area.x_cm + area.w_cm), dBase = ref.y1 - (area.y_cm + area.h_cm);

  const setRect = (x: number, y: number, w: number, h: number) =>
    updateArea(area.id, { pontos: retanguloParaPontos(x, y, Math.max(10, w), Math.max(10, h)) });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PISO / ÁREA {travado && "🔒"}</div>

      <Bloco label="MATERIAL">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {(Object.keys(MATERIAIS_PISO) as MaterialPiso[]).map((mkey) => (
            <button key={mkey} className="btn" disabled={travado}
              onClick={() => updateArea(area.id, { material: mkey, nome: area.acabamentoId ? area.nome : MATERIAIS_PISO[mkey].label, cor: MATERIAIS_PISO[mkey].cor })}
              style={{ padding: "7px 4px", fontSize: 10, display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-start",
                borderColor: area.material === mkey ? "var(--gold)" : "var(--line-2)", color: area.material === mkey ? "var(--gold)" : "#c9c9c4" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: MATERIAIS_PISO[mkey].cor, flexShrink: 0 }} />
              {MATERIAIS_PISO[mkey].label}
            </button>
          ))}
        </div>
      </Bloco>

      <Bloco label="ACABAMENTO (BIBLIOTECA · PREÇO)">
        <select className="fld" disabled={travado} value={area.acabamentoId ?? ""} onChange={(e) => {
          const ac = acabamentos.find((a) => a.id === e.target.value);
          updateArea(area.id, ac
            ? { acabamentoId: ac.id, nome: ac.nome, cor: ac.cor ?? area.cor, preco_m2: ac.preco_m2 ?? null, material: "outro" }
            : { acabamentoId: null });
        }}>
          <option value="">— selecione da biblioteca —</option>
          {acabamentos.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.preco_m2 ? ` · ${BRL(a.preco_m2)}/m²` : ""}</option>)}
        </select>
      </Bloco>

      {rect ? (
        <>
          <Bloco label="POSIÇÃO X × Y (cm)">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <CampoCm valor={area.x_cm} onSet={(v) => moverArea(area.id, v - area.x_cm, 0)} />
              <span style={{ color: "var(--muted)" }}>×</span>
              <CampoCm valor={area.y_cm} onSet={(v) => moverArea(area.id, 0, v - area.y_cm)} />
            </div>
          </Bloco>
          <Bloco label="LARGURA × COMPRIMENTO (cm)">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <CampoCm valor={area.w_cm} min={10} onSet={(v) => setRect(area.x_cm, area.y_cm, v, area.h_cm)} />
              <span style={{ color: "var(--muted)" }}>×</span>
              <CampoCm valor={area.h_cm} min={10} onSet={(v) => setRect(area.x_cm, area.y_cm, area.w_cm, v)} />
            </div>
          </Bloco>
          <Bloco label={`DISTÂNCIA ATÉ ${ref.nome === "parede" ? "AS PAREDES" : "A SALA"} (cm)`}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 5, alignItems: "center", fontSize: 11.5, color: "#b6b6b1" }}>
              <span>Esquerda</span><CampoCm valor={dEsq} onSet={(v) => moverArea(area.id, v - dEsq, 0)} />
              <span>Topo</span><CampoCm valor={dTopo} onSet={(v) => moverArea(area.id, 0, v - dTopo)} />
              <span>Direita</span><CampoCm valor={dDir} onSet={(v) => moverArea(area.id, dDir - v, 0)} />
              <span>Base</span><CampoCm valor={dBase} onSet={(v) => moverArea(area.id, 0, dBase - v)} />
            </div>
          </Bloco>
        </>
      ) : (
        <div style={{ fontSize: 11.5, color: "#b6b6b1", lineHeight: 1.5 }}>
          Polígono de <b style={{ color: "#e9e9e6" }}>{pontos.length} vértices</b> — selecione e arraste cada vértice na planta para ajustar.
        </div>
      )}

      <Bloco label={`SENTIDO DO PISO · ${Math.round(area.rotacaoTextura ?? 0)}°`}>
        <div style={{ display: "flex", gap: 5 }}>
          {[0, 45, 90].map((g) => (
            <button key={g} className="btn" disabled={travado} onClick={() => updateArea(area.id, { rotacaoTextura: g })}
              style={{ flex: 1, padding: "7px 4px", fontSize: 11, borderColor: (area.rotacaoTextura ?? 0) === g ? "var(--gold)" : "var(--line-2)", color: (area.rotacaoTextura ?? 0) === g ? "var(--gold)" : "var(--muted)" }}>{g}°</button>
          ))}
          <button className="btn" disabled={travado} onClick={() => updateArea(area.id, { rotacaoTextura: ((area.rotacaoTextura ?? 0) + 15) % 180 })} style={{ flex: 1, padding: "7px 4px", fontSize: 11 }}>+15°</button>
        </div>
      </Bloco>

      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
        Área: <b style={{ color: "#e9e9e6" }}>{m2(areaM2)}</b> · Perímetro: <b style={{ color: "#e9e9e6" }}>{formatLength(perim)}</b>
        {area.preco_m2 ? <><br />Custo: <b style={{ color: "var(--gold)" }}>{BRL(Math.round(custo))}</b> ({BRL(area.preco_m2)}/m²)</> : null}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => duplicarArea(area.id)}>⧉ Duplicar</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => updateArea(area.id, { bloqueado: !travado })}>{travado ? "🔓 Destravar" : "🔒 Travar"}</button>
      </div>
      <button className="btn" disabled={travado} onClick={() => removerArea(area.id)}>✕ Remover área</button>
    </div>
  );
}

// Inspetor de um elemento de parede (espelho / TV / elétrica…).
function ElemParedeInspector({ el }: { el: ElementoParede }) {
  const updateElemParede = useProjeto((s) => s.updateElemParede);
  const removerElemParede = useProjeto((s) => s.removerElemParede);
  const paredes = useProjeto((s) => s.cena.estrutura?.paredes ?? []);
  const def = ELEMENTOS_PAREDE[el.tipo];
  const espelho = el.tipo === "espelho";
  const areaM2 = (el.largura_cm / 100) * (el.altura_cm / 100);
  const custo = espelho ? areaM2 * (el.preco_m2 ?? 0) : (el.custo ?? 0);
  const travado = !!el.bloqueado;
  const idx = paredes.findIndex((p) => p.id === el.paredeId);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>{def.icone} {def.label.toUpperCase()} {travado && "🔒"}</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Parede {idx >= 0 ? idx + 1 : "?"} · deslocamento do início até o centro</div>
      <Bloco label="DESLOCAMENTO NA PAREDE (cm)">
        <CampoCm valor={el.offset_cm} min={0} onSet={(v) => updateElemParede(el.id, { offset_cm: v })} />
      </Bloco>
      <Bloco label={espelho ? "COMPRIMENTO × ALTURA (cm)" : "LARGURA × ALTURA (cm)"}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <CampoCm valor={el.largura_cm} min={5} onSet={(v) => updateElemParede(el.id, { largura_cm: v })} />
          <span style={{ color: "var(--muted)" }}>×</span>
          <CampoCm valor={el.altura_cm} min={5} onSet={(v) => updateElemParede(el.id, { altura_cm: v })} />
        </div>
      </Bloco>
      <Bloco label="DISTÂNCIA DO PISO (cm)">
        <CampoCm valor={el.dist_piso_cm} min={0} onSet={(v) => updateElemParede(el.id, { dist_piso_cm: v })} />
      </Bloco>
      {espelho && (
        <>
          <Bloco label="ILUMINAÇÃO">
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" disabled={travado} onClick={() => updateElemParede(el.id, { luz_superior: !el.luz_superior })}
                style={{ flex: 1, padding: "7px 4px", fontSize: 11, borderColor: el.luz_superior ? "var(--gold)" : "var(--line-2)", color: el.luz_superior ? "var(--gold)" : "var(--muted)" }}>☀ Superior</button>
              <button className="btn" disabled={travado} onClick={() => updateElemParede(el.id, { luz_inferior: !el.luz_inferior })}
                style={{ flex: 1, padding: "7px 4px", fontSize: 11, borderColor: el.luz_inferior ? "var(--gold)" : "var(--line-2)", color: el.luz_inferior ? "var(--gold)" : "var(--muted)" }}>☀ Inferior</button>
            </div>
          </Bloco>
          <Bloco label="PREÇO POR M² (R$)">
            <CampoCm valor={el.preco_m2 ?? 0} min={0} onSet={(v) => updateElemParede(el.id, { preco_m2: v })} />
          </Bloco>
        </>
      )}
      {!espelho && (
        <Bloco label="CUSTO (R$)">
          <CampoCm valor={el.custo ?? 0} min={0} onSet={(v) => updateElemParede(el.id, { custo: v })} />
        </Bloco>
      )}
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
        Área: <b style={{ color: "#e9e9e6" }}>{m2(areaM2)}</b>
        {custo ? <> · Custo: <b style={{ color: "var(--gold)" }}>{BRL(Math.round(custo))}</b></> : null}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => updateElemParede(el.id, { bloqueado: !travado })}>{travado ? "🔓 Destravar" : "🔒 Travar"}</button>
        <button className="btn" style={{ flex: 1 }} disabled={travado} onClick={() => removerElemParede(el.id)}>✕ Remover</button>
      </div>
    </div>
  );
}

// Inspetor de mobiliário / infraestrutura.
function InfraInspector({ item, snapPasso }: { item: ItemInfraestrutura; snapPasso: number }) {
  const updateInfra = useProjeto((s) => s.updateInfra);
  const removerInfra = useProjeto((s) => s.removerInfra);
  const duplicarInfra = useProjeto((s) => s.duplicarInfra);
  const travado = !!item.bloqueado;
  const passo = snapPasso || 5;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>{item.nome.toUpperCase()} {travado && "🔒"}</div>
      {item.categoria && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{item.categoria}</div>}
      <Bloco label="POSIÇÃO X × Y (cm)">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <CampoCm valor={item.x_cm} onSet={(v) => updateInfra(item.id, { x_cm: v })} />
          <span style={{ color: "var(--muted)" }}>×</span>
          <CampoCm valor={item.y_cm} onSet={(v) => updateInfra(item.id, { y_cm: v })} />
        </div>
      </Bloco>
      <Bloco label="LARGURA × PROFUNDIDADE (cm)">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <CampoCm valor={item.w_cm} min={5} onSet={(v) => updateInfra(item.id, { w_cm: v })} />
          <span style={{ color: "var(--muted)" }}>×</span>
          <CampoCm valor={item.h_cm} min={5} onSet={(v) => updateInfra(item.id, { h_cm: v })} />
        </div>
      </Bloco>
      <Bloco label={`ROTAÇÃO · ${Math.round(item.rotacao || 0)}°`}>
        <div style={{ display: "flex", gap: 5 }}>
          {[["-45", -45], ["-5", -5], ["+5", 5], ["+45", 45], ["90", 90]].map(([lbl, d]) => (
            <button key={lbl} className="btn" disabled={travado} onClick={() => updateInfra(item.id, { rotacao: ((item.rotacao || 0) + (d as number)) % 360 })}
              style={{ flex: 1, padding: "7px 2px", fontSize: 10.5 }}>{lbl}°</button>
          ))}
        </div>
      </Bloco>
      <Bloco label={`NUDGE (${passo} cm)`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, maxWidth: 150 }}>
          <span /><button className="btn" disabled={travado} style={{ padding: "6px 0" }} onClick={() => updateInfra(item.id, { y_cm: item.y_cm - passo })}>↑</button><span />
          <button className="btn" disabled={travado} style={{ padding: "6px 0" }} onClick={() => updateInfra(item.id, { x_cm: item.x_cm - passo })}>←</button>
          <button className="btn" disabled={travado} style={{ padding: "6px 0" }} onClick={() => updateInfra(item.id, { y_cm: item.y_cm + passo })}>↓</button>
          <button className="btn" disabled={travado} style={{ padding: "6px 0" }} onClick={() => updateInfra(item.id, { x_cm: item.x_cm + passo })}>→</button>
        </div>
      </Bloco>
      <Bloco label="CUSTO (R$)">
        <CampoCm valor={item.custo ?? 0} min={0} onSet={(v) => updateInfra(item.id, { custo: v })} />
      </Bloco>
      <Bloco label="OBSERVAÇÃO">
        <input className="fld" value={item.obs ?? ""} disabled={travado} onChange={(e) => updateInfra(item.id, { obs: e.target.value }, false)} onBlur={(e) => updateInfra(item.id, { obs: e.target.value })} />
      </Bloco>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => duplicarInfra(item.id)}>⧉ Duplicar</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => updateInfra(item.id, { bloqueado: !travado })}>{travado ? "🔓 Destravar" : "🔒 Travar"}</button>
      </div>
      <button className="btn" disabled={travado} onClick={() => removerInfra(item.id)}>✕ Remover</button>
    </div>
  );
}

// Texto livre da ficha que confirma no blur (não commita histórico a cada tecla).
function CampoTexto({ valor, linhas, placeholder, onSet }: { valor: string; linhas?: number; placeholder?: string; onSet: (v: string) => void }) {
  const [txt, setTxt] = useState(valor);
  useEffect(() => { setTxt(valor); }, [valor]);
  const estilo = { fontSize: 12.5, lineHeight: 1.5, fontFamily: "inherit" as const };
  return linhas && linhas > 1
    ? <textarea className="fld" rows={linhas} style={{ ...estilo, resize: "vertical" }} placeholder={placeholder} value={txt}
        onChange={(e) => setTxt(e.target.value)} onBlur={() => { if (txt !== valor) onSet(txt); }} />
    : <input className="fld" style={estilo} placeholder={placeholder} value={txt}
        onChange={(e) => setTxt(e.target.value)} onBlur={() => { if (txt !== valor) onSet(txt); }} />;
}

// Etapa 4 — ficha completa de um equipamento posicionado no projeto.
function FichaEquipamento({ item, numero }: { item: ItemPosicionado; numero: number }) {
  const updateItem = useProjeto((s) => s.updateItem);
  const equipamentos = useLibrary((s) => s.equipamentos);
  const cat = (item.equipamentoId && equipamentos.find((e) => e.id === item.equipamentoId)) || equipamentos.find((e) => e.nome === item.nome);
  const lados = { ...LADOS_PADRAO, ...(item.lados ?? {}) };
  const ladoEntrada = (Object.keys(lados) as LadoRect[]).find((k) => lados[k] === "entrada");
  const explicacao = explicarItem(item, cat);
  const nomeLado: Record<LadoRect, string> = { topo: "topo", base: "base", esq: "esquerda", dir: "direita" };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 999, background: "var(--gold)", color: "#0C0C0E", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800 }}>{numero}</span>
        <div>
          <div className="brandface" style={{ fontSize: 17, color: "var(--gold)" }}>{item.nome}</div>
          {(cat?.marca || cat?.modelo) && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{[cat?.marca, cat?.modelo].filter(Boolean).join(" · ")}</div>}
        </div>
      </div>

      {cat?.imagem && <img src={cat.imagem} alt={item.nome} style={{ width: "100%", maxHeight: 130, objectFit: "contain", background: "var(--panel-2)", borderRadius: 8, border: "1px solid var(--line)" }} />}

      <Bloco label="CARACTERÍSTICAS">
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 12, color: "#b6b6b1" }}>
          <span>Medidas</span><b style={{ color: "#e9e9e6" }}>{formatLength(item.w_cm)} × {formatLength(item.h_cm)}{cat?.altura_cm ? ` × ${formatLength(cat.altura_cm)} (A)` : ""}</b>
          {cat?.peso_kg ? <><span>Peso</span><b style={{ color: "#e9e9e6" }}>{cat.peso_kg} kg</b></> : null}
          <span>Zona</span><b style={{ color: ZONAS[item.zona]?.cor }}>{ZONAS[item.zona]?.label}</b>
          <span>Cenário</span><b style={{ color: CENARIOS[item.cenario]?.cor }}>{CENARIOS[item.cenario]?.label}</b>
          {cat?.categoria ? <><span>Categoria</span><b style={{ color: "#e9e9e6" }}>{cat.categoria}{cat.subcategoria ? ` · ${cat.subcategoria}` : ""}</b></> : null}
          {item.precisa_tomada ? <><span>Elétrica</span><b style={{ color: "#E09A45" }}>⚡ precisa tomada{cat?.voltagem ? ` · ${cat.voltagem} V` : ""}</b></> : null}
          {item.preco ? <><span>Investimento</span><b style={{ color: "var(--gold)" }}>{BRL(item.preco)}</b></> : null}
        </div>
      </Bloco>

      <Bloco label="POSIÇÃO NA PLANTA">
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 10px", fontSize: 12, color: "#b6b6b1" }}>
          <span>X × Y</span><b style={{ color: "#e9e9e6" }}>{Math.round(item.x_cm)} × {Math.round(item.y_cm)} cm</b>
          <span>Rotação</span><b style={{ color: "#e9e9e6" }}>{Math.round(item.rotacao || 0)}°</b>
          <span>Entrada</span><b style={{ color: "#5FBF7A" }}>pela {ladoEntrada ? nomeLado[ladoEntrada] : "base"}{item.dist_entrada_cm ? ` · vão de ${Math.round(item.dist_entrada_cm)} cm` : ""}</b>
        </div>
      </Bloco>

      <Bloco label="COMO SAI NO DOSSIÊ">
        <div style={{ display: "grid", gap: 6, fontSize: 11.5, color: "#a8a8a4", lineHeight: 1.5 }}>
          <div><b style={{ color: "var(--gold)" }}>O QUE É · </b>{explicacao.oque}</div>
          <div><b style={{ color: "var(--gold)" }}>TRABALHA · </b>{explicacao.trabalha}</div>
          <div><b style={{ color: "var(--gold)" }}>POR QUE ESTÁ AQUI · </b>{explicacao.indicacao}</div>
          <div><b style={{ color: "var(--gold)" }}>ATENÇÃO · </b>{explicacao.atencao}</div>
          {explicacao.exercicios.length > 0 && (
            <div><b style={{ color: "var(--gold)" }}>EXERCÍCIOS ({explicacao.exercicios.length}) · </b>{explicacao.exercicios.join(" · ")}</div>
          )}
          <div style={{ fontSize: 10.5, color: "#6e6e73", marginTop: 2 }}>
            {explicacao.padrao
              ? "Texto padrão da base técnica. Os campos abaixo substituem o que você escrever neles."
              : "Texto ajustado por você nos campos abaixo."}
          </div>
        </div>
      </Bloco>

      <Bloco label="FUNÇÃO NO PROJETO (substitui “por que está aqui”)">
        <CampoTexto valor={item.funcao ?? ""} placeholder="Ex.: aquecimento cardiovascular dos moradores"
          onSet={(v) => updateItem(item.id, { funcao: v || null })} />
      </Bloco>

      <Bloco label="ONDE NÃO UTILIZAR / RESTRIÇÕES (substitui “atenção”)">
        <CampoTexto valor={item.restricoes ?? ""} linhas={3} placeholder="Ex.: não usar sem instrutor; contraindicado para reabilitação de joelho…"
          onSet={(v) => updateItem(item.id, { restricoes: v || null })} />
      </Bloco>

      <Bloco label={`EXERCÍCIOS DE MUSCULAÇÃO (${explicacao.exercicios.length}) — um por linha`}>
        <CampoTexto valor={(item.exercicios ?? []).join("\n")} linhas={5}
          placeholder={explicacao.exercicios.length
            ? "Em branco, o Dossiê usa a lista da base técnica (acima). Escreva aqui para substituí-la."
            : "Este equipamento não tem lista padrão — só entram exercícios resistidos feitos no próprio aparelho."}
          onSet={(v) => {
            const lista = normalizarExercicios(v.split("\n"));
            updateItem(item.id, { exercicios: lista.length ? lista : null });
          }} />
        {!item.exercicios?.length && explicacao.exercicios.length > 0 && (
          <button className="btn" style={{ padding: "4px 9px", fontSize: 10.5, marginTop: 6 }}
            onClick={() => updateItem(item.id, { exercicios: explicacao.exercicios })}>
            ⧉ Copiar a lista padrão para editar
          </button>
        )}
      </Bloco>

      <Bloco label="DEMAIS DETALHES">
        <CampoTexto valor={item.detalhes ?? ""} linhas={4} placeholder="Instalação, entrega, manutenção, garantia, observações…"
          onSet={(v) => updateItem(item.id, { detalhes: v || null })} />
      </Bloco>

      {cat?.obs && <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}><b>Instalação (catálogo):</b> {cat.obs}</div>}
    </div>
  );
}

// Etapa 5 — Curadoria: classifica cada equipamento em Essencial · Balanceado ·
// Premium e escreve a nota de cada categoria. É o que dá conteúdo às seções
// 03, 04 e 06 do Dossiê.
function CuradoriaPanel({ onEmitir }: { onEmitir: () => void }) {
  // Qual lâmina está com o editor de camadas aberto.
  const [laminaEditando, setLaminaEditando] = useState<string | null>(null);
  const cena = useProjeto((s) => s.cena);
  const projeto = useProjeto((s) => s.projeto);
  const updateItem = useProjeto((s) => s.updateItem);
  const sincronizarComCatalogo = useProjeto((s) => s.sincronizarComCatalogo);
  const equipamentosCat = useLibrary((s) => s.equipamentos);
  const classificarEmLote = useProjeto((s) => s.classificarEmLote);
  const sugerirCenarios = useProjeto((s) => s.sugerirCenarios);
  const setEspecificacao = useProjeto((s) => s.setEspecificacao);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});

  const comp = composicaoZonas(cena);
  const niveis = detalheCenarios(cena);
  const naoClassificados = cena.itens.filter((i) => i.cenario !== cenarioSugerido(i.nome, i.zona)).length;

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "14px calc(16px + var(--sar)) 20px calc(16px + var(--sal))", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div>
          <div className="brandface" style={{ fontSize: 18, color: "var(--gold)" }}>CURADORIA POR CENÁRIO</div>
          <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 620, lineHeight: 1.5 }}>
            Classifique cada equipamento em <b style={{ color: "#e9e9e6" }}>Essencial</b>, <b style={{ color: "#e9e9e6" }}>Balanceado</b> ou <b style={{ color: "#e9e9e6" }}>Premium</b> —
            é isso que separa os três cenários no Dossiê. A especificação de cada categoria já vem pronta; a nota abaixo dela é o que você acrescenta sobre este condomínio.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn btn-gold" onClick={() => sugerirCenarios(false)} title="Aplica a classificação técnica sugerida em quem ainda está no padrão Balanceado">✨ Sugerir</button>
          <button className="btn" onClick={() => { if (confirm("Refazer a classificação de TODOS os equipamentos pela sugestão técnica? A classificação manual será substituída.")) sugerirCenarios(true); }} title="Reaplica a sugestão em todos, inclusive nos já classificados">↺ Refazer tudo</button>
          <button className="btn" title="Reaplica nos itens da planta o cadastro atual do catálogo (preço, medidas, desenho e ficha técnica) — isso também roda sozinho ao abrir o projeto"
            onClick={() => { const n = sincronizarComCatalogo(equipamentosCat); alert(n ? `${n} item(ns) atualizado(s) pelo catálogo.` : "Tudo já bate com o catálogo."); }}>
            ↺ Sincronizar catálogo</button>
        </div>
      </div>

      {/* Placar dos três cenários */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, margin: "12px 0 6px" }}>
        {niveis.map((n) => (
          <div key={n.cenario} className="card" style={{ padding: 12, borderTop: `3px solid ${n.cor}` }}>
            <div className="microlabel" style={{ color: n.cor }}>{n.label}</div>
            <div className="brandface" style={{ fontSize: 21, marginTop: 3 }}>{BRL(n.total)}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
              {n.nAcumulado} de {cena.itens.length} equipamentos
              {n.nNivel > 0 && <> · <span style={{ color: n.cor }}>+{n.nNivel} neste nível</span></>}
            </div>
            <div style={{ fontSize: 11, color: "#8a8a8f", marginTop: 6, lineHeight: 1.45 }}>{CENARIO_DEF[n.cenario].resumo}</div>
          </div>
        ))}
      </div>
      {naoClassificados === 0 && cena.itens.length > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>Classificação idêntica à sugestão técnica em todos os {cena.itens.length} equipamentos.</div>
      )}

      {projeto && <EmisaoDossiePanel projeto={projeto} cena={cena} onEmitir={onEmitir} />}

      {/* Uma seção por categoria */}
      {comp.map((c) => {
        const esp = ESPEC_ZONA[c.zona];
        const aberta = abertas[c.zona] ?? false;
        return (
          <section key={c.zona} className="card" style={{ padding: 14, marginTop: 12, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: c.cor }} />
              <span className="brandface" style={{ fontSize: 16, color: c.cor }}>{c.label.toUpperCase()}</span>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                {c.n} equipamentos · {c.areaM2.toFixed(1).replace(".", ",")} m² · {BRL(c.subtotal)}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".06em" }}>TODOS →</span>
              {(Object.keys(CENARIOS) as Cenario[]).map((k) => (
                <button key={k} className="btn" style={{ padding: "5px 9px", fontSize: 10.5, borderColor: CENARIOS[k].cor, color: CENARIOS[k].cor }}
                  onClick={() => classificarEmLote(k, c.zona)}>{CENARIOS[k].label}</button>
              ))}
            </div>

            {/* Especificação da categoria — TODOS os campos que saem no Dossiê
                são editáveis. Vazio = usa o texto padrão (mostrado como
                placeholder), preenchido = o do consultor vence. */}
            <div style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
              <button className="btn" style={{ padding: "3px 8px", fontSize: 10.5, float: "right" }}
                onClick={() => setAbertas((a) => ({ ...a, [c.zona]: !aberta }))}>
                {aberta ? "− Ocultar" : "✎ Editar especificação"}
              </button>
              <div style={{ fontSize: 11.5, color: "#b6b6b1", lineHeight: 1.55 }}>
                {cena.especificacoes?.[c.zona]?.oque?.trim() || esp.oque}
              </div>
              {aberta && (
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {CAMPOS_ESPEC.map(({ chave, rotulo }) => {
                    const padrao = chave === "nota" ? "" : esp[chave];
                    const proprio = cena.especificacoes?.[c.zona]?.[chave] ?? "";
                    return (
                      <div key={chave}>
                        <span className="microlabel">
                          {rotulo.toUpperCase()}
                          {proprio ? <b style={{ color: "var(--gold)", marginLeft: 6 }}>· reescrito</b>
                            : chave !== "nota" && <span style={{ marginLeft: 6, opacity: .7 }}>· texto padrão</span>}
                        </span>
                        <CampoTexto valor={proprio} linhas={chave === "nota" ? 2 : 3}
                          placeholder={padrao || "Ex.: 4 esteiras atendem o pico das 19h; zona junto à vidraça pela luz natural."}
                          onSet={(v) => setEspecificacao(c.zona, { [chave]: v })} />
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.5 }}>
                    Campo em branco publica o texto padrão que aparece em cinza. O que você escrever substitui esse texto no Dossiê.
                  </div>
                </div>
              )}
            </div>

            {/* Equipamentos da categoria */}
            <div style={{ display: "grid", gap: 5 }}>
              {c.itens.map((it) => {
                const numero = cena.itens.findIndex((x) => x.id === it.id) + 1;
                const sugerido = cenarioSugerido(it.nome, it.zona);
                return (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", flexWrap: "wrap" }}>
                    <span style={{ width: 21, height: 21, borderRadius: 999, background: "var(--gold)", color: "#0C0C0E", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 800, flexShrink: 0 }}>{numero}</span>
                    <span style={{ fontSize: 12.5, color: "#e9e9e6", fontWeight: 600, minWidth: 160, flex: 1 }}>{it.nome}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatLength(it.w_cm)} × {formatLength(it.h_cm)}</span>
                    <span style={{ fontSize: 12, color: it.preco ? "var(--gold)" : "#6e6e73", minWidth: 78, textAlign: "right", whiteSpace: "nowrap" }}>{it.preco ? BRL(it.preco) : "incluso"}</span>
                    {it.cenario !== sugerido && (
                      <button className="btn" style={{ padding: "3px 8px", fontSize: 10, color: "var(--muted)" }}
                        title={`A base técnica sugere ${CENARIOS[sugerido].label} para este equipamento`}
                        onClick={() => updateItem(it.id, { cenario: sugerido })}>sugerido: {CENARIOS[sugerido].label}</button>
                    )}
                    <div style={{ display: "flex", gap: 4 }}>
                      {(Object.keys(CENARIOS) as Cenario[]).map((k) => (
                        <button key={k} className="btn" onClick={() => updateItem(it.id, { cenario: k })}
                          style={{
                            padding: "5px 10px", fontSize: 10.5, whiteSpace: "nowrap",
                            borderColor: it.cenario === k ? CENARIOS[k].cor : "var(--line-2)",
                            color: it.cenario === k ? CENARIOS[k].cor : "var(--muted)",
                            background: it.cenario === k ? "rgba(255,255,255,.05)" : undefined,
                          }}>{CENARIOS[k].label}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {cena.itens.length === 0 && (
        <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 16 }}>Nenhum equipamento posicionado — adicione na etapa Layout.</div>
      )}

      <CoberturaInventarioFuturo />
      <MarcasPanel />
      <ParecerPanel />
      <LaminasPanel onEditar={setLaminaEditando} />
      <SecoesDossiePanel />
      {projeto && <EmisaoDossiePanel projeto={projeto} cena={cena} onEmitir={onEmitir} compacto />}
      {laminaEditando && (
        <EditorLaminas id={laminaEditando} onTrocar={setLaminaEditando} onFechar={() => setLaminaEditando(null)} />
      )}
    </div>
  );
}

/**
 * Checklist de emissão — o consultor vê o que falta para um dossiê de alto
 * padrão e dispara a prévia sem subir a tela até o botão da barra.
 */
function EmisaoDossiePanel({
  projeto, cena, onEmitir, compacto,
}: {
  projeto: Projeto;
  cena: Cena;
  onEmitir: () => void;
  compacto?: boolean;
}) {
  const pront = useMemo(() => checarProntidaoDossie(projeto, cena), [projeto, cena]);
  if (compacto) {
    return (
      <section className="card" style={{ padding: 14, marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="brandface" style={{ fontSize: 15, color: "var(--gold)" }}>EMITIR DOSSIÊ</span>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.45 }}>
            {pront.pronto
              ? `${pront.avisos.length ? `${pront.avisos.length} recomendação(ões) em aberto · ` : ""}Gera a prévia, carimba a data e baixa quando aprovar.`
              : `${pront.bloqueios.length} item(ns) obrigatório(s) faltando — a prévia ainda pode ser gerada.`}
          </div>
        </div>
        <button className="btn btn-gold" onClick={onEmitir}>👁 Prévia & emitir</button>
      </section>
    );
  }
  return (
    <section className="card" style={{ padding: 14, marginTop: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <span className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PRONTIDÃO DO DOSSIÊ</span>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>
            O que falta para um documento de alto padrão. Itens obrigatórios abrem o PDF incompleto; os recomendados elevam a apresentação.
          </div>
        </div>
        <button className="btn btn-gold" onClick={onEmitir}>👁 Prévia & emitir</button>
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        {pront.itens.map((it) => (
          <div key={it.id} style={{
            display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap",
            background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px",
          }}>
            <span style={{
              font: "700 12px 'DM Sans'",
              color: it.ok ? "var(--green)" : it.severidade === "obrigatorio" ? "var(--red)" : "var(--warn)",
              width: 16,
            }}>{it.ok ? "✓" : it.severidade === "obrigatorio" ? "!" : "◦"}</span>
            <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>{it.label}</span>
            {it.detalhe && <span style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>{it.detalhe}</span>}
            {!it.ok && (
              <span style={{ fontSize: 10, letterSpacing: ".04em", color: it.severidade === "obrigatorio" ? "var(--red)" : "var(--warn)" }}>
                {it.severidade === "obrigatorio" ? "OBRIGATÓRIO" : "RECOMENDADO"}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function CoberturaInventarioFuturo() {
  const [aba, setAba] = useState<"cobertura" | "inventario" | "futuro">("cobertura");
  const abas: { id: typeof aba; label: string }[] = [
    { id: "cobertura", label: "Cobertura" },
    { id: "inventario", label: "Inventário" },
    { id: "futuro", label: "Sugestões futuras" },
  ];
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {abas.map((a) => (
          <button key={a.id} className="btn" onClick={() => setAba(a.id)}
            style={{
              borderColor: aba === a.id ? "var(--gold)" : "var(--line-2)",
              color: aba === a.id ? "var(--gold)" : "var(--muted)",
            }}>{a.label}</button>
        ))}
      </div>
      {aba === "cobertura" && <CoberturaPanel />}
      {aba === "inventario" && <InventarioPanel />}
      {aba === "futuro" && <FuturoPanel />}
    </div>
  );
}

/** Tela dedicada do levantamento, mantida fora do Dossiê para que a primeira
 * decisão do projeto seja sempre o que pode ser preservado no orçamento. */
function PainelEtapaInventario() {
  return (
    <main style={{ flex: 1, overflow: "auto", padding: "16px calc(16px + var(--sar)) 24px calc(16px + var(--sal))" }}>
      <InventarioPanel />
    </main>
  );
}

/** Revisão imediatamente anterior ao Dossiê: reúne a cobertura técnica e as
 * compras de uma próxima fase, sem misturá-las ao investimento aprovado. */
function PainelEtapaCobertura() {
  return (
    <main style={{ flex: 1, overflow: "auto", padding: "16px calc(16px + var(--sar)) 24px calc(16px + var(--sal))", display: "grid", gap: 12 }}>
      <CoberturaPanel />
      <FuturoPanel />
    </main>
  );
}

/**
 * COBERTURA MUSCULAR & MOVIMENTO.
 *
 * Responde a pergunta que o síndico faz depois de olhar a planta — "esta
 * academia treina o corpo inteiro ou sobrou buraco?" — e, o que vende a
 * assessoria, diz o que comprar para fechar cada buraco e quanto de cobertura
 * se PERDE ao cortar um cenário. Até aqui o app sabia listar exercícios por
 * aparelho, mas nunca somava: ninguém conseguia dizer o que faltava.
 */
function CoberturaPanel() {
  const cena = useProjeto((s) => s.cena);
  const catalogo = useLibrary((s) => s.equipamentos);
  const [verPadroes, setVerPadroes] = useState(false);
  const cob = useMemo(() => analisarCobertura(cena, catalogo), [cena, catalogo]);

  if (!cena.itens.length) return null;
  const { resumo: rc } = cob;

  const COR: Record<string, string> = { coberto: "var(--green)", fraco: "var(--warn)", descoberto: "var(--red)" };
  const porRegiao = new Map<RegiaoCorpo, typeof cob.musculos>();
  for (const l of cob.musculos) {
    const reg = MUSCULOS[l.musculo].regiao;
    (porRegiao.get(reg) ?? porRegiao.set(reg, []).get(reg)!).push(l);
  }

  return (
    <section className="card" style={{ padding: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <span className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>COBERTURA MUSCULAR & MOVIMENTO</span>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>
            O que esta academia treina e o que ficou de fora — somando os {rc.itensAvaliados} equipamentos reconhecidos pela base técnica.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Chip txt={`${rc.cobertos} cobertos`} ok />
          {rc.fracos > 0 && <Chip txt={`${rc.fracos} fracos`} warn />}
          {rc.descobertos > 0 && <Chip txt={`${rc.descobertos} descobertos`} />}
          <Chip txt={`${rc.padroesCobertos}/${rc.padroesTotal} movimentos`} neutro />
        </div>
      </div>

      {/* Mapa corporal: uma caixa por grupo, agrupada por região. */}
      <div style={{ display: "grid", gap: 9 }}>
        {[...porRegiao.entries()].map(([reg, linhas]) => (
          <div key={reg}>
            <span className="microlabel">{REGIOES[reg].toUpperCase()}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
              {linhas.map((l) => (
                <span key={l.musculo} title={[
                  MUSCULOS[l.musculo].inclui,
                  l.primarios.length ? "Principal: " + l.primarios.join(", ") : "",
                  l.secundarios.length ? "Auxiliar: " + l.secundarios.join(", ") : "",
                  !l.primarios.length && !l.secundarios.length ? "Nenhum equipamento do projeto atende este grupo." : "",
                ].filter(Boolean).join(" · ")} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  border: `1px solid ${COR[l.status]}`, borderRadius: 8, padding: "5px 10px",
                  background: l.status === "coberto" ? "rgba(95,191,122,.10)" : l.status === "fraco" ? "rgba(224,154,69,.10)" : "transparent",
                  font: "600 11.5px 'DM Sans'", color: COR[l.status],
                }}>
                  {l.status === "coberto" ? "●" : l.status === "fraco" ? "◐" : "○"}
                  {MUSCULOS[l.musculo].label}
                  {l.primarios.length > 0 && <b style={{ opacity: .7, fontWeight: 600 }}>{l.primarios.length}</b>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* O que comprar para fechar o buraco — a parte que vira proposta. */}
      {cob.sugestoes.length > 0 && (
        <div style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", display: "grid", gap: 7 }}>
          <span className="microlabel">PARA FECHAR AS LACUNAS</span>
          {cob.sugestoes.map((s) => (
            <div key={s.equipamento} style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 11.5 }}>
              <span style={{ fontWeight: 700, color: "var(--text-2)" }}>{s.equipamento}</span>
              <span className="chip" style={{ padding: "1px 8px", fontSize: 10, borderColor: CENARIOS[s.cenario].cor, color: CENARIOS[s.cenario].cor }}>
                {CENARIOS[s.cenario].label}
              </span>
              <span style={{ color: "var(--muted)", lineHeight: 1.45 }}>{s.porque}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cortar orçamento tem consequência de TREINO, não só de preço. */}
      <div style={{ display: "grid", gap: 5 }}>
        <span className="microlabel">O QUE CADA CENÁRIO ENTREGA DE COBERTURA</span>
        {cob.porCenario.map((c) => (
          <div key={c.cenario} style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap", fontSize: 11.5 }}>
            <span style={{ width: 84, fontWeight: 700, color: CENARIOS[c.cenario].cor }}>{c.label}</span>
            <span style={{ color: "var(--green)" }}>{c.cobertos.length} cobertos</span>
            {c.descobertos.length > 0 && (
              <span style={{ color: "var(--muted)" }}>
                fora: {c.descobertos.map((m) => MUSCULOS[m].label).join(", ")}
              </span>
            )}
            {c.ganha.length > 0 && (
              <span style={{ color: "var(--gold)" }}>+ {c.ganha.map((m) => MUSCULOS[m].label).join(", ")}</span>
            )}
          </div>
        ))}
      </div>

      <div>
        <button className="btn btn--sm" aria-pressed={verPadroes} onClick={() => setVerPadroes((v) => !v)}>
          {verPadroes ? "− Ocultar" : "+ Ver"} padrões de movimento
        </button>
        {verPadroes && (
          <div className="mo-in-up" style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
            {cob.padroes.map((l) => (
              <span key={l.padrao} title={l.equipamentos.join(", ") || "Nenhum equipamento executa este padrão."} style={{
                border: `1px solid ${l.coberto ? "var(--green)" : "var(--line-2)"}`,
                borderRadius: 8, padding: "4px 9px", font: "600 11px 'DM Sans'",
                color: l.coberto ? "var(--green)" : "var(--text-4)",
              }}>{PADROES[l.padrao].label}</span>
            ))}
          </div>
        )}
      </div>

      {/* Análise que esconde o que ignorou não vale nada. */}
      {cob.naoReconhecidos.length > 0 && (
        <div style={{ fontSize: 10.5, color: "var(--warn)", lineHeight: 1.5 }}>
          Fora da conta ({cob.naoReconhecidos.length}): {cob.naoReconhecidos.join(", ")} — a base técnica não reconhece estes nomes.
          Renomeie no catálogo para eles entrarem na cobertura.
        </div>
      )}
    </section>
  );
}

/**
 * ÁREA DE APRESENTAÇÃO DAS MARCAS.
 *
 * As marcas eram detectadas em silêncio e só apareciam no PDF pronto. Aqui o
 * consultor vê quem foi detectado, de onde (equipamento, acessório, acabamento,
 * mobiliário ou inventário do condomínio), reescreve o texto de apresentação,
 * escolhe a marca âncora e tira da vitrine o que não quer mostrar.
 */
function MarcasPanel() {
  const cena = useProjeto((s) => s.cena);
  const [erroImg, setErroImg] = useState<string | null>(null);
  const setMarcaProjeto = useProjeto((s) => s.setMarcaProjeto);
  const setMarcasIntro = useProjeto((s) => s.setMarcasIntro);
  const catalogo = useLibrary((s) => s.equipamentos);
  const biblioteca = useLibrary((s) => s.marcas);
  const acabCatalogo = useLibrary((s) => s.acabamentos);
  const [aberta, setAberta] = useState<string | null>(null);

  const marcas = useMemo(
    () => marcasDaCena(cena, catalogo, biblioteca, acabCatalogo),
    [cena, catalogo, biblioteca, acabCatalogo],
  );
  const overrides = new Map((cena.marcas ?? []).map((m) => [m.ref, m]));
  // Marcas OCULTAS somem de `marcasDaCena` — sem esta lista, ocultar seria
  // porta de mão única: a linha desapareceria do painel junto com o botão
  // de trazê-la de volta.
  const ocultas = (cena.marcas ?? []).filter(
    (m) => m.ocultar && !marcas.some((d) => refDaMarca(d.nome) === m.ref),
  );
  if (!marcas.length && !ocultas.length) return null;

  return (
    <section className="card" style={{ padding: 14, marginTop: 12, display: "grid", gap: 11 }}>
      <div>
        <span className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>MARCAS DO PROJETO</span>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>
          {marcas.length} {marcas.length === 1 ? "marca detectada" : "marcas detectadas"} nos equipamentos, acessórios, acabamentos e mobiliário deste projeto.
          O texto vem da biblioteca; o que você escrever aqui vale só para este Dossiê.
        </div>
      </div>

      <div>
        <span className="microlabel">ABERTURA DA SEÇÃO NO DOSSIÊ</span>
        <CampoTexto valor={cena.marcasIntro ?? ""} linhas={2}
          placeholder="Fabricantes dos equipamentos especificados neste projeto (fontes: sites das marcas e imprensa especializada)."
          onSet={setMarcasIntro} />
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        {marcas.map((m) => {
          const ref = refDaMarca(m.nome);
          const ov = overrides.get(ref);
          const oculta = !!ov?.ocultar;
          const editando = aberta === ref;
          return (
            <div key={ref} style={{
              background: "var(--panel-2)", border: `1px solid ${editando ? "var(--gold)" : "var(--line)"}`,
              borderRadius: 8, padding: "8px 10px", opacity: oculta ? 0.5 : 1,
              transition: "opacity var(--mo-fast), border-color var(--mo-fast)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                {m.logo
                  ? <img src={m.logo} alt="" style={{ height: 22, maxWidth: 74, objectFit: "contain", background: "#fff", borderRadius: 4, padding: 2 }} />
                  : <span style={{ width: 10, height: 10, borderRadius: 3, background: m.cor || "var(--line-2)" }} />}
                <span style={{ font: "700 13px 'DM Sans'", color: "var(--text-2)" }}>{m.nome}</span>
                {m.destaque || ov?.destaque ? <span style={{ color: "var(--gold)" }} title="Marca âncora — sai primeiro no Dossiê">★</span> : null}
                {m.grupo && <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>{m.grupo}</span>}
                <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{presencaDaMarca(m)}</span>
                {!m.conhecida && (
                  <span style={{ fontSize: 10, color: "var(--warn)" }} title="Sem ficha na biblioteca: sai só com o nome">
                    sem apresentação
                  </span>
                )}
                {m.soInventario && (
                  <span style={{ fontSize: 10, color: "var(--text-4)" }} title="Só aparece no inventário — já é do condomínio, não é compra">
                    já no condomínio
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn btn--xs" aria-pressed={!!ov?.destaque}
                  onClick={() => setMarcaProjeto(ref, { destaque: !ov?.destaque })} title="Marca âncora">★</button>
                <button className="btn btn--xs" aria-pressed={!oculta}
                  onClick={() => setMarcaProjeto(ref, { ocultar: !oculta, nome: m.nome })} title={oculta ? "Mostrar no Dossiê" : "Ocultar do Dossiê"}>
                  {oculta ? "○" : "✓"}
                </button>
                <button className="btn btn--xs" aria-pressed={editando} onClick={() => setAberta(editando ? null : ref)} title="Editar texto">✎</button>
              </div>
              {editando && (
                <div className="mo-in-up" style={{ display: "grid", gap: 8, marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--line)" }}>
                  <div>
                    <span className="microlabel">
                      APRESENTAÇÃO NO DOSSIÊ
                      {ov?.resumo?.trim() && <b style={{ color: "var(--gold)", marginLeft: 6 }}>· reescrita</b>}
                    </span>
                    <CampoTexto valor={ov?.resumo ?? ""} linhas={4}
                      placeholder={m.resumo || "Sem texto na biblioteca — escreva aqui, ou cadastre a marca em Marcas para reaproveitar nos próximos projetos."}
                      onSet={(v) => setMarcaProjeto(ref, { resumo: v || null })} />
                  </div>
                  <div>
                    <span className="microlabel">OBSERVAÇÃO DESTE PROJETO</span>
                    <CampoTexto valor={ov?.nota ?? ""} linhas={2}
                      placeholder="Ex.: representante local, entrega em 20 dias, assistência técnica na cidade."
                      onSet={(v) => setMarcaProjeto(ref, { nota: v || null })} />
                  </div>
                  {/* A IMAGEM DA LINHA. O logo diz de quem é o aparelho; esta
                      prancha mostra O QUE o condomínio vai receber — a família
                      especificada, do jeito que o fabricante a apresenta. É a
                      página que o síndico olha primeiro. */}
                  <div>
                    <span className="microlabel">IMAGEM DA LINHA (sai no Dossiê)</span>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 5, flexWrap: "wrap" }}>
                      {ov?.imagem && (
                        <img src={ov.imagem} alt="" style={{ height: 74, maxWidth: 200, objectFit: "contain", background: "#fff", borderRadius: 6, padding: 3 }} />
                      )}
                      <div style={{ display: "grid", gap: 5, flex: 1, minWidth: 180 }}>
                        <label className="btn btn--xs" style={{ justifyContent: "center", cursor: "pointer" }}>
                          {ov?.imagem ? "⭱ Trocar imagem" : "⭱ Subir imagem da linha"}
                          <input type="file" accept="image/png,image/jpeg,image/webp" hidden
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.currentTarget.value = "";
                              if (!f) return;
                              try {
                                // Larga o suficiente para uma prancha em A4 sem
                                // inchar a cena: a cena inteira trafega em cada
                                // gravação do projeto.
                                setMarcaProjeto(ref, { imagem: await reduzirImagem(f, 1400, 0.82), nome: m.nome });
                              } catch (err) { setErroImg((err as Error).message); }
                            }} />
                        </label>
                        {ov?.imagem && (
                          <>
                            <input className="fld" style={{ padding: "6px 9px", fontSize: 12 }} value={ov.imagemLegenda ?? ""}
                              placeholder="Legenda (ex.: Linha EDGE — musculação)"
                              onChange={(ev) => setMarcaProjeto(ref, { imagemLegenda: ev.target.value || null })} />
                            <button className="btn btn--xs" data-tom="perigo" onClick={() => setMarcaProjeto(ref, { imagem: null, imagemLegenda: null })}>✕ Remover imagem</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {erroImg && <div style={{ fontSize: 11, color: "var(--red)" }}>Não consegui ler a imagem: {erroImg}</div>}
                  {m.fonte && <div style={{ fontSize: 10, color: "var(--text-4)" }}>Fonte do texto da biblioteca: {m.fonte}</div>}
                </div>
              )}
            </div>
          );
        })}
        {ocultas.map((m) => (
          <div key={m.ref} style={{
            display: "flex", alignItems: "center", gap: 9,
            background: "var(--panel-2)", border: "1px dashed var(--line)", borderRadius: 8,
            padding: "7px 10px", opacity: 0.55,
          }}>
            <span style={{ font: "600 12.5px 'DM Sans'", color: "var(--text-4)", textDecoration: "line-through" }}>
              {m.nome || m.ref}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-4)" }}>fora do Dossiê</span>
            <span style={{ flex: 1 }} />
            <button className="btn btn--xs" onClick={() => setMarcaProjeto(m.ref, { ocultar: false })}
              title="Voltar a mostrar no Dossiê">↩ Mostrar</button>
          </div>
        ))}
      </div>
    </section>
  );
}

// Etapa 3 · Fase 02 — inspetor do LAYOUT DE ÁREA: as regiões que decidem
// onde cada família de equipamento entra e por onde se circula.
function AreasInspector({ sel, tipoAtual, onTipoAtual, onUpdate, onRemover, onSelecionar }: {
  sel: AreaFuncional | null;
  tipoAtual: TipoArea;
  onTipoAtual: (t: TipoArea) => void;
  onUpdate: (id: string, patch: Partial<AreaFuncional>) => void;
  onRemover: (id: string) => void;
  onSelecionar: (id: string | null) => void;
}) {
  const areas = useProjeto((s) => s.cena.areas ?? []);
  const salaM2 = useProjeto((s) => (s.cena.sala.largura_cm / 100) * (s.cena.sala.profundidade_cm / 100));
  const m2De = (a: AreaFuncional) => areaPoligonoM2(a.pontos);
  const total = areas.reduce((t, a) => t + m2De(a), 0);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <div className="brandface" style={{ fontSize: 15, color: "var(--gold)" }}>LAYOUT DE ÁREA</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 3 }}>
          Com os aparelhos já postos: delimite a circulação, o cardio, o peso livre, o alongamento. Escolha o tipo na barra e desenhe a região em volta do que existe.
        </div>
      </div>

      {sel ? (
        <>
          <Bloco label="TIPO DA REGIÃO">
            <select className="fld" value={sel.tipo} onChange={(e) => onUpdate(sel.id, { tipo: e.target.value as TipoArea })}>
              {(Object.keys(TIPOS_AREA) as TipoArea[]).map((k) => <option key={k} value={k}>{TIPOS_AREA[k].label}</option>)}
            </select>
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45, marginTop: 5 }}>{TIPOS_AREA[sel.tipo].descricao}</div>
          </Bloco>
          <Bloco label="NOME (opcional)">
            <CampoTexto valor={sel.nome ?? ""} placeholder={TIPOS_AREA[sel.tipo].label}
              onSet={(v) => onUpdate(sel.id, { nome: v || null })} />
          </Bloco>
          <Bloco label="OBSERVAÇÃO">
            <CampoTexto valor={sel.observacao ?? ""} linhas={3} placeholder="Ex.: corredor de 1 m ligando a porta à saída de emergência."
              onSet={(v) => onUpdate(sel.id, { observacao: v || null })} />
          </Bloco>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Área: <b style={{ color: "#e9e9e6" }}>{m2De(sel).toFixed(1).replace(".", ",")} m²</b>
            {salaM2 > 0 && <> · {Math.round((m2De(sel) / salaM2) * 100)}% da sala</>}
          </div>
          <button className="btn" onClick={() => onRemover(sel.id)}>✕ Remover região</button>
        </>
      ) : (
        <Bloco label="PRÓXIMA REGIÃO">
          <select className="fld" value={tipoAtual} onChange={(e) => onTipoAtual(e.target.value as TipoArea)}>
            {(Object.keys(TIPOS_AREA) as TipoArea[]).map((k) => <option key={k} value={k}>{TIPOS_AREA[k].label}</option>)}
          </select>
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45, marginTop: 5 }}>{TIPOS_AREA[tipoAtual].descricao}</div>
        </Bloco>
      )}

      <div className="hairline" />
      <div>
        <span className="microlabel">REGIÕES ({areas.length})</span>
        <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
          {areas.map((a) => (
            <button key={a.id} onClick={() => onSelecionar(a.id)} style={{
              display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer",
              background: selDaLista(a, sel) ? "var(--gold-soft)" : "var(--panel-2)",
              border: `1px solid ${selDaLista(a, sel) ? "var(--gold)" : "var(--line)"}`,
              borderRadius: 7, padding: "6px 9px", color: "#c9c9c4", font: "600 11.5px 'DM Sans'",
            }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: TIPOS_AREA[a.tipo].cor, flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome || TIPOS_AREA[a.tipo].label}</span>
              <span style={{ color: "var(--muted)", fontWeight: 400 }}>{m2De(a).toFixed(1).replace(".", ",")} m²</span>
            </button>
          ))}
          {areas.length === 0 && <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Nenhuma região ainda — escolha o tipo e desenhe na planta.</div>}
        </div>
        {areas.length > 0 && salaM2 > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8 }}>
            Zoneado: <b style={{ color: "var(--gold)" }}>{total.toFixed(1).replace(".", ",")} m²</b> de {salaM2.toFixed(1).replace(".", ",")} m² ({Math.round((total / salaM2) * 100)}%)
          </div>
        )}
      </div>
    </div>
  );
}

const selDaLista = (a: AreaFuncional, sel: AreaFuncional | null) => !!sel && sel.id === a.id;

// Parecer técnico: a defesa do layout, nas palavras do consultor.
function ParecerPanel() {
  const parecer = useProjeto((s) => s.cena.parecer ?? "");
  const setParecer = useProjeto((s) => s.setParecer);
  return (
    <section className="card" style={{ padding: 14, marginTop: 16, display: "grid", gap: 8 }}>
      <div>
        <span className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>PARECER TÉCNICO</span>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
          A sua defesa do layout — por que a sala está organizada assim. Sai no Dossiê logo depois da planta.
        </div>
      </div>
      <CampoTexto valor={parecer} linhas={6}
        placeholder="Ex.: A ergometria ocupa a face da vidraça para aproveitar a vista e a luz natural; a força guiada forma um circuito de membros inferiores no fundo da sala; o corredor central de 1 m garante circulação e rota de fuga…"
        onSet={setParecer} />
    </section>
  );
}

// Inventário do condomínio: o que já existe, separado entre o que fica
// (reaproveitado) e o que sai (residual). Sai numa seção própria do Dossiê.
function FuturoPanel() {
  const cena = useProjeto((s) => s.cena);
  const catalogo = useLibrary((s) => s.equipamentos);
  const futuro = useMemo(() => sugerirFuturo(cena, catalogo), [cena, catalogo]);
  const exercicios = useMemo(() => exerciciosDaCena(cena, catalogo), [cena, catalogo]);
  const cob = useMemo(() => analisarCobertura(cena, catalogo), [cena, catalogo]);

  return (
    <section className="card" style={{ padding: 14, display: "grid", gap: 12 }}>
      <div>
        <span className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>SUGESTÕES FUTURAS</span>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>
          Com o que está na planta, esta academia já executa {exercicios.length} exercício(s) reconhecido(s)
          e cobre {cob.resumo.cobertos} grupos. O que falta para ficar completa entra aqui — não no investimento desta fase.
        </div>
      </div>
      {futuro.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          O mix atual já fecha o que a base técnica consegue sugerir. Quando crescer a sala, volte nesta aba.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 7 }}>
          {futuro.map((s) => (
            <div key={s.tipo + s.nome} style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 12px" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{s.nome}</span>
                <span className="chip" style={{ fontSize: 10, padding: "1px 8px" }}>{s.tipo === "acessorio" ? "acessório" : "equipamento"}</span>
                {s.cenario && (
                  <span className="chip" style={{ fontSize: 10, padding: "1px 8px", borderColor: CENARIOS[s.cenario].cor, color: CENARIOS[s.cenario].cor }}>
                    {CENARIOS[s.cenario].label}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 4 }}>{s.motivo}</div>
              {s.exercicios.length > 0 && (
                <div style={{ fontSize: 11, color: "#b6b6b1", marginTop: 4 }}>Passa a permitir: {s.exercicios.join(", ")}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Inventário do condomínio: o que já existe, separado entre o que fica
// (reaproveitado) e o que sai (residual). Sai numa seção própria do Dossiê.
function InventarioPanel() {
  const inventario = useProjeto((s) => s.cena.inventario ?? []);
  const addInventario = useProjeto((s) => s.addInventario);
  const updateInventario = useProjeto((s) => s.updateInventario);
  const removerInventario = useProjeto((s) => s.removerInventario);
  const sugerirInventarioDoProjeto = useProjeto((s) => s.sugerirInventarioDoProjeto);
  const porDestino = (d: DestinoInventario) => inventario.filter((i) => i.destino === d);
  const pecas = (xs: ItemInventario[]) => xs.reduce((t, i) => t + (i.qtd || 1), 0);

  return (
    <section className="card" style={{ padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>INVENTÁRIO DO CONDOMÍNIO</span>
        <span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1, minWidth: 240, lineHeight: 1.5 }}>
          O que já existe na sala, sincronizado com a planta. <b style={{ color: "var(--green)" }}>Reaproveitar</b> fica
          no projeto (Heritage: esteiras, bancos, estante); <b style={{ color: "#b6b6b1" }}>vender</b> é o residual que não entra no layout novo.
        </span>
        <button className="btn" style={{ padding: "5px 11px", fontSize: 11 }}
          onClick={() => {
            const n = sugerirInventarioDoProjeto();
            // n = só os novos; a sincronização também atualiza sugestão nos já lançados
            void n;
          }}>
          ⇄ Sincronizar com o layout
        </button>
        <button className="btn btn-gold" style={{ padding: "5px 11px", fontSize: 11 }}
          onClick={() => addInventario({ id: crypto.randomUUID(), nome: "Equipamento existente", qtd: 1, destino: "reaproveitado", tipo: "equipamento" })}>
          ＋ Item
        </button>
      </div>

      {inventario.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Nada levantado ainda. Use sincronizar para puxar o que está na planta com preço zero (reaproveitado), ou some à mão o que o condomínio já tem — inclusive o que vai ser vendido.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, fontSize: 11.5, flexWrap: "wrap" }}>
            {(Object.keys(DESTINOS_INVENTARIO) as DestinoInventario[]).map((d) => (
              <span key={d} style={{ color: DESTINOS_INVENTARIO[d].cor }}>
                {DESTINOS_INVENTARIO[d].label}: <b>{pecas(porDestino(d))}</b> peça(s)
              </span>
            ))}
          </div>
          <div style={{ display: "grid", gap: 5 }}>
            {inventario.map((i) => (
              <div key={i.id} style={{
                display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
                background: "var(--panel-2)", borderRadius: 8, padding: "7px 9px",
                border: `1px solid ${DESTINOS_INVENTARIO[i.destino].cor}44`,
              }}>
                <input className="fld" style={{ width: 52, padding: "5px 6px", fontSize: 12, textAlign: "right" }}
                  value={String(i.qtd)} title="Quantidade"
                  onChange={(e) => updateInventario(i.id, { qtd: Math.max(1, Math.round(Number(e.target.value.replace(/[^\d]/g, "")) || 1)) })} />
                <input className="fld" style={{ flex: 1, minWidth: 170, padding: "5px 8px", fontSize: 12 }}
                  value={i.nome} placeholder="Nome do equipamento"
                  onChange={(e) => updateInventario(i.id, { nome: e.target.value })} />
                <select className="fld" style={{ width: 118, padding: "5px 8px", fontSize: 11.5 }}
                  value={i.tipo ?? "equipamento"}
                  onChange={(e) => updateInventario(i.id, { tipo: e.target.value as "equipamento" | "acessorio" })}>
                  <option value="equipamento">equipamento</option>
                  <option value="acessorio">acessório</option>
                </select>
                {i.sugestao && (
                  <span style={{ fontSize: 10.5, color: i.sugestao === "reaproveitar" ? "var(--green)" : "var(--warn)" }}>
                    sugerido: {i.sugestao === "reaproveitar" ? "reaproveitar no layout" : "vender"}
                  </span>
                )}
                <input className="fld" style={{ width: 130, padding: "5px 8px", fontSize: 11.5 }}
                  value={i.estado ?? ""} placeholder="Estado"
                  onChange={(e) => updateInventario(i.id, { estado: e.target.value || null })} />
                <input className="fld" style={{ flex: 1, minWidth: 190, padding: "5px 8px", fontSize: 11.5 }}
                  value={i.observacao ?? ""} placeholder="Por que fica / por que sai / uso no projeto"
                  onChange={(e) => updateInventario(i.id, { observacao: e.target.value || null })} />
                <input className="fld" style={{ width: 118, padding: "5px 8px", fontSize: 11.5, textAlign: "right" }}
                  value={i.valor_estimado != null ? String(i.valor_estimado) : ""}
                  placeholder="R$ mercado" inputMode="numeric"
                  title="Valor de mercado estimado por unidade — soma no Dossiê como economia do reaproveitamento"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d]/g, ""));
                    updateInventario(i.id, { valor_estimado: n > 0 ? n : null });
                  }} />
                <div style={{ display: "flex", gap: 4 }}>
                  {(Object.keys(DESTINOS_INVENTARIO) as DestinoInventario[]).map((d) => (
                    <button key={d} className="btn" onClick={() => updateInventario(i.id, { destino: d, sugestao: d === "reaproveitado" ? "reaproveitar" : "vender" })}
                      style={{
                        padding: "5px 9px", fontSize: 10.5, whiteSpace: "nowrap",
                        borderColor: i.destino === d ? DESTINOS_INVENTARIO[d].cor : "var(--line-2)",
                        color: i.destino === d ? DESTINOS_INVENTARIO[d].cor : "var(--muted)",
                      }}>{d === "reaproveitado" ? "Reaproveitar" : "Vender"}</button>
                  ))}
                </div>
                <button className="btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => removerInventario(i.id)}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// O que entra no PDF: o consultor decide seção a seção.
/**
 * CENTRAL DO DOSSIÊ — todas as áreas do documento, editáveis num lugar só.
 *
 * Antes o consultor controlava o PDF por oito interruptores escondidos no
 * último bloco da última seção de uma aba, e nove das dezessete seções não
 * tinham nem interruptor: título, texto de abertura e ordem eram literais no
 * código. Aqui cada seção aparece na ordem real de saída, com o número que
 * vai sair impresso, e pode ser ligada, renomeada, reescrita e reordenada.
 */
function SecoesDossiePanel() {
  const cena = useProjeto((s) => s.cena);
  const setOpcaoDossie = useProjeto((s) => s.setOpcaoDossie);
  const setDossieTexto = useProjeto((s) => s.setDossieTexto);
  const moverSecaoDossie = useProjeto((s) => s.moverSecaoDossie);
  const resetOrdemDossie = useProjeto((s) => s.resetOrdemDossie);
  const setDossieEmissao = useProjeto((s) => s.setDossieEmissao);
  const [aberta, setAberta] = useState<SecaoDossie | null>(null);

  const ligadas = { ...OPCOES_DOSSIE_PADRAO, ...(cena.dossie ?? {}) };
  // A ordem GRAVADA não conhece seções criadas depois dela. O `pdfExport` já
  // reanexava as faltantes no fim; este painel não — então uma seção nova
  // saía impressa no Dossiê e ficava invisível aqui: sem como desligar,
  // renomear ou mover. Mesmo merge dos dois lados.
  const ordemSalva = cena.dossieOrdem?.length ? cena.dossieOrdem : ORDEM_DOSSIE_PADRAO;
  const ordem = [...ordemSalva, ...ORDEM_DOSSIE_PADRAO.filter((id) => !ordemSalva.includes(id))];
  const textos = cena.dossieTextos ?? {};
  const temConteudo = conteudoDaSecao(cena);

  // O número impresso é a posição entre as LIGADAS — o mesmo cálculo do PDF.
  let n = 0;
  const numeros = new Map<SecaoDossie, string>();
  for (const id of ordem) {
    if (ligadas[id] === false || !temConteudo(id)) continue;
    numeros.set(id, String(++n).padStart(2, "0"));
  }

  return (
    <section className="card" style={{ padding: 14, marginTop: 12, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <span className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>CENTRAL DO DOSSIÊ</span>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.5 }}>
            As {ordem.length} seções na ordem em que saem no papel. Ligue, desligue, renomeie, reescreva a abertura e reordene.
            Campo em branco publica o texto padrão.
          </div>
        </div>
        <label style={{ display: "grid", gap: 3 }}>
          <span className="microlabel">DATA DE EMISSÃO</span>
          <input className="fld" type="date" style={{ padding: "7px 10px", fontSize: 12, width: 170 }}
            value={(cena.dossieEmissao ?? "").slice(0, 10)}
            onChange={(e) => setDossieEmissao(e.target.value || null)} />
        </label>
        {cena.dossieOrdem?.length ? (
          <button className="btn btn--sm" onClick={resetOrdemDossie} title="Voltar à ordem padrão">↺ Ordem padrão</button>
        ) : null}
      </div>

      {/* Capa: os dois textos que não pertencem a nenhuma seção. */}
      <div style={{ background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", display: "grid", gap: 9 }}>
        <span className="microlabel">CAPA</span>
        <div>
          <span className="microlabel" style={{ opacity: .75 }}>LINHA DE ABERTURA</span>
          <CampoTexto valor={textos["capa:kicker"] ?? ""} linhas={1}
            placeholder="ASSESSORIA TÉCNICA · IMPLANTAÇÃO DE ACADEMIA"
            onSet={(v) => setDossieTexto("capa:kicker", v)} />
        </div>
        <div>
          <span className="microlabel" style={{ opacity: .75 }}>FRASE DO RODAPÉ DA CAPA</span>
          <CampoTexto valor={textos["capa:tagline"] ?? ""} linhas={2}
            placeholder="A academia mais funcional e bonita que o orçamento do condomínio pode ter."
            onSet={(v) => setDossieTexto("capa:tagline", v)} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 5 }}>
        {ordem.map((id, i) => {
          const ligada = ligadas[id] !== false;
          const numero = numeros.get(id);
          const vazia = !temConteudo(id);
          const editando = aberta === id;
          const tituloProprio = textos[`titulo:${id}`];
          const introPropria = textos[`intro:${id}`];
          return (
            <div key={id} style={{
              background: "var(--panel-2)",
              border: `1px solid ${editando ? "var(--gold)" : "var(--line)"}`,
              borderRadius: 8, padding: "7px 9px",
              opacity: ligada ? 1 : 0.55,
              transition: "border-color var(--mo-fast), opacity var(--mo-fast)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <button className="btn btn--xs" aria-pressed={ligada} onClick={() => setOpcaoDossie(id, !ligada)}
                  title={ligada ? "Tirar do Dossiê" : "Incluir no Dossiê"} style={{ minWidth: 34, justifyContent: "center" }}>
                  {ligada ? "✓" : "○"}
                </button>
                <span style={{ font: "700 11px 'DM Sans'", color: numero ? "var(--gold)" : "var(--text-4)", width: 22 }}>
                  {numero ?? "—"}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "var(--text-2)" }}>
                  {tituloProprio?.trim() || ROTULO_SECAO_DOSSIE[id]}
                  {tituloProprio?.trim() && <b style={{ color: "var(--gold)", fontWeight: 600, marginLeft: 7, fontSize: 10 }}>· renomeada</b>}
                </span>
                {/* Ligada mas sem dado: o consultor precisa saber POR QUE a
                    seção não vai aparecer, em vez de procurar no PDF. */}
                {ligada && vazia && (
                  <span style={{ fontSize: 10.5, color: "var(--warn)" }} title={`Falta: ${SECAO_EXIGE_DADO[id]}`}>
                    aguarda {SECAO_EXIGE_DADO[id]}
                  </span>
                )}
                <button className="btn btn--xs" onClick={() => moverSecaoDossie(id, -1)} disabled={i === 0} title="Subir">↑</button>
                <button className="btn btn--xs" onClick={() => moverSecaoDossie(id, 1)} disabled={i === ordem.length - 1} title="Descer">↓</button>
                <button className="btn btn--xs" aria-pressed={editando} onClick={() => setAberta(editando ? null : id)}
                  title="Editar título e abertura">✎</button>
              </div>
              {editando && (
                <div className="mo-in-up" style={{ display: "grid", gap: 8, marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--line)" }}>
                  <div>
                    <span className="microlabel">TÍTULO NO PAPEL</span>
                    <CampoTexto valor={tituloProprio ?? ""} linhas={1}
                      placeholder={ROTULO_SECAO_DOSSIE[id]}
                      onSet={(v) => setDossieTexto(`titulo:${id}`, v)} />
                  </div>
                  {INTRO_PADRAO[id] && (
                    <div>
                      <span className="microlabel">
                        TEXTO DE ABERTURA
                        {introPropria != null && <b style={{ color: "var(--gold)", marginLeft: 6 }}>· reescrito</b>}
                      </span>
                      <CampoTexto valor={introPropria ?? ""} linhas={3}
                        placeholder={INTRO_PADRAO[id]}
                        onSet={(v) => setDossieTexto(`intro:${id}`, v)} />
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
                        Em branco publica o texto acima. Para suprimir a abertura, escreva um espaço.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Textos de abertura padrão — os mesmos de `pdfExport.ts`, para o consultor
 *  ver o que vai sair antes de decidir reescrever. */
const INTRO_PADRAO: Partial<Record<SecaoDossie, string>> = {
  esquadrias: "Portas e janelas lançadas na planta, agrupadas por tipo. As medidas são de VÃO acabado (largura × altura, em metros); o peitoril é medido do piso acabado.",
  cenarios: "Como o investimento total se distribui: o núcleo indispensável (Essencial), o nível recomendado (Balanceado), os itens de acabamento do projeto (Premium) e os complementos orçados.",
  categorias: "À esquerda, os equipamentos da categoria com o cenário e o valor. À direita, o que aquele conjunto é, o que entrega e como foi dimensionado — mais a observação do consultor sobre este condomínio.",
  marcas: "Fabricantes dos equipamentos especificados neste projeto (fontes: sites das marcas e imprensa especializada).",
  memorial: "Um verbete por equipamento, agrupado por categoria: o que é, o que trabalha, por que está neste projeto e o que exige atenção.",
  exercicios: "Exercícios de musculação executáveis nos equipamentos deste projeto. A lista cobre as máquinas de trajetória definida; bancos, racks e estações de cabo ampliam o repertório com dezenas de variações com pesos livres.",
  inventario: "Levantamento do que o condomínio já tem. O reaproveitado permanece no projeto e não entra no investimento; o residual sai da sala.",
  futuro: "O que comprar numa segunda fase para completar a academia — depois do que o layout atual já treina.",
  matriz: "Impacto funcional · valor percebido · necessidade (1–5). Maior soma = maior prioridade — o que preservar se o orçamento apertar.",
};

/** A seção tem dado para sair? Espelha as condições de `pdfExport.ts`. */
function conteudoDaSecao(cena: Cena): (id: SecaoDossie) => boolean {
  const itens = cena.itens ?? [];
  const temCenarios = new Set(itens.map((i) => i.cenario)).size >= 1 && itens.length > 0;
  return (id) => {
    switch (id) {
      case "parecer": return !!cena.parecer?.trim();
      case "cenarios": return temCenarios;
      case "acessorios": return (cena.acessorios?.length ?? 0) > 0;
      case "esquadrias": return (cena.estrutura?.aberturas?.length ?? 0) > 0;
      case "inventario": return (cena.inventario?.length ?? 0) > 0;
      case "acabamentos": return (cena.acabamentos?.length ?? 0) > 0;
      case "mobiliario": return (cena.elementosParede?.length ?? 0) + (cena.infra?.length ?? 0) > 0;
      case "memorial":
      case "exercicios":
      case "cobertura":
      case "futuro":
      case "categorias": return itens.length > 0;
      // Planta depende da captura feita no momento da exportação; diagnóstico,
      // infraestrutura, financeiro, capacidade, matriz e validação sempre saem.
      default: return true;
    }
  };
}

// Etapa Acessórios — lista agrupada pelo lugar na planta.
function AcessoriosInspector({ sel }: { sel: AcessorioProjeto | null }) {
  const cena = useProjeto((s) => s.cena);
  const acessorios = cena.acessorios ?? [];
  const updateAcessorio = useProjeto((s) => s.updateAcessorio);
  const removerAcessorio = useProjeto((s) => s.removerAcessorio);
  const selecionarAcessorio = useProjeto((s) => s.selecionarAcessorio);
  const total = acessorios.reduce((t, a) => t + custoAcessorio(a), 0);
  const grupos = agruparPorLugar(acessorios, cena);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)" }}>ACESSÓRIOS</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>
        {acessorios.length
          ? `${acessorios.length} item(ns) agrupados pelo lugar na planta. Toque para editar; Sincronizar evita pagar estante/torre/suporte duas vezes.`
          : "Use Sugerir para montar a lista a partir DESTE layout, ou lance pelo catálogo à esquerda."}
      </div>
      {sel && (
        <div style={{ display: "grid", gap: 8, background: "var(--panel-2)", border: "1px solid var(--gold)", borderRadius: 8, padding: 10 }}>
          <CampoTexto valor={sel.nome} onSet={(v) => updateAcessorio(sel.id, { nome: v || sel.nome })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <label style={{ display: "grid", gap: 3, fontSize: 10, color: "var(--muted)" }}>QTD
              <CampoCm valor={sel.qtd} min={1} onSet={(v) => updateAcessorio(sel.id, { qtd: Math.max(1, Math.round(v)) })} />
            </label>
            <label style={{ display: "grid", gap: 3, fontSize: 10, color: "var(--muted)" }}>PREÇO UN.
              <CampoCm valor={sel.preco_un} min={0} onSet={(v) => updateAcessorio(sel.id, { preco_un: v })} />
            </label>
          </div>
          <div style={{ fontSize: 11, color: FAMILIAS_ACESSORIO[sel.familia ?? familiaDoNome(sel.nome)].cor }}>
            {FAMILIAS_ACESSORIO[sel.familia ?? familiaDoNome(sel.nome)].label} · {rotuloDaAncora(sel.ancora, cena)}
          </div>
          {sel.obs && <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>{sel.obs}</div>}
          <div style={{ fontSize: 13, fontWeight: 700, color: sel.incluso ? "#8A8A8F" : "var(--gold)" }}>
            {sel.incluso ? "incluso (não entra no investimento)" : BRL(Math.round(sel.qtd * sel.preco_un))}
          </div>
          <button className="btn" onClick={() => removerAcessorio(sel.id)}>✕ Remover</button>
        </div>
      )}
      {grupos.map((g) => (
        <div key={g.chave} style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".06em" }}>{g.titulo.toUpperCase()}</div>
          {g.itens.map((a) => {
            const ativo = sel?.id === a.id;
            const fam = a.familia ?? familiaDoNome(a.nome);
            return (
              <button key={a.id} onClick={() => selecionarAcessorio(a.id)} style={{
                display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center",
                background: ativo ? "var(--gold-soft)" : "var(--panel-2)",
                border: `1px solid ${ativo ? "var(--gold)" : "var(--line)"}`,
                borderRadius: 7, padding: "7px 9px", color: "#c9c9c4",
                font: "600 12px 'DM Sans'", textAlign: "left", cursor: "pointer",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: FAMILIAS_ACESSORIO[fam].cor, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</span>
                </span>
                <span style={{ color: "#6e6e73", fontWeight: 400, fontSize: 10.5, whiteSpace: "nowrap" }}>
                  {a.incluso ? "incluso" : `${a.qtd}× ${BRL(Math.round(custoAcessorio(a)))}`}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      {acessorios.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".06em" }}>TOTAL</span>
          <span className="brandface" style={{ fontSize: 20, color: "var(--gold)" }}>{BRL(Math.round(total))}</span>
        </div>
      )}
      <AnexosOrcamento />
    </div>
  );
}

// PDFs de orçamento do projeto: sobe para o Storage; metadados ficam na cena.
function AnexosOrcamento() {
  const projeto = useProjeto((s) => s.projeto);
  const anexos = useProjeto((s) => s.cena.anexos ?? []);
  const addAnexo = useProjeto((s) => s.addAnexo);
  const removerAnexo = useProjeto((s) => s.removerAnexo);
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const podeSubir = online && !!projeto?.id && projeto.id !== "heritage";
  // Hashes já anexados: subir duas vezes o mesmo PDF criava duas propostas
  // idênticas sem nenhum aviso.
  const hashesAnexos = anexos.map((a) => a.hash).filter((h): h is string => !!h);

  async function subir(file: File, hash: string | null) {
    if (!projeto?.id) return;
    setBusy("Enviando…"); setErro(null);
    try {
      const path = await uploadOrcamento(projeto.id, file);
      addAnexo({ id: crypto.randomUUID(), nome: file.name, path, tamanho: file.size, criado_em: new Date().toISOString(), hash });
    } catch (e) {
      setErro(`Falha no envio: ${(e as Error).message}`);
      throw e; // a EntradaPDF mostra o erro no próprio componente
    } finally { setBusy(null); }
  }

  async function abrir(path: string) {
    setErro(null);
    try { window.open(await urlOrcamento(path), "_blank"); }
    catch (e) { setErro(`Não consegui abrir: ${(e as Error).message}`); }
  }

  const kb = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

  return (
    <div style={{ marginTop: 26, maxWidth: 780 }}>
      <div className="hairline" />
      <div className="brandface" style={{ fontSize: 16, color: "var(--gold)", margin: "14px 0 2px" }}>ORÇAMENTOS EM PDF</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10 }}>
        Propostas de fornecedores anexadas a este projeto — os arquivos ficam guardados na nuvem.
      </div>
      <EntradaPDF
        aceita={ACEITA_PDF}
        titulo="Orçamento em PDF"
        ajuda="Arraste a proposta do fornecedor ou toque para escolher."
        rotuloConfirmar="Anexar ao projeto"
        desabilitado={!podeSubir}
        motivoDesabilitado="Disponível em projetos salvos no banco (com conexão)."
        ocupado={busy}
        hashesConhecidos={hashesAnexos}
        onDocumento={(doc) => subir(doc.arquivo, doc.hash)} />
      {erro && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{erro}</div>}
      <div style={{ display: "grid", gap: 5, marginTop: 12 }}>
        {anexos.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--panel-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px" }}>
            <span style={{ fontSize: 17 }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "#e9e9e6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{kb(a.tamanho)} · {dataBR(a.criado_em)}</div>
            </div>
            <button className="btn" style={{ padding: "6px 12px", fontSize: 11.5 }} onClick={() => void abrir(a.path)}>Abrir</button>
            <button className="btn" style={{ padding: "6px 9px" }} onClick={() => {
              if (!confirm(`Remover "${a.nome}" do projeto?`)) return;
              void removerOrcamentoArquivo(a.path);
              removerAnexo(a.id);
            }}>✕</button>
          </div>
        ))}
        {anexos.length === 0 && <div style={{ fontSize: 11.5, color: "#6e6e73" }}>Nenhum PDF anexado ainda.</div>}
      </div>
    </div>
  );
}

/** O controle de encaixe, igual nas três etapas que desenham. Antes ele
 *  existia em duas com aparências diferentes e faltava na Etapa 1 — que é
 *  justamente onde a medida precisa fechar redonda. */
function GrupoEncaixe({ snapPasso, onSnap }: { snapPasso: number; onSnap: (v: number) => void }) {
  return (
    <span className="toolgroup">
      <span className="tg-label">Encaixe</span>
      {([[1, "1"], [5, "5"], [10, "10"], [0, "livre"]] as [number, string][]).map(([v, lbl]) => (
        <button key={v} className="btn btn--xs" aria-pressed={snapPasso === v} data-tom="info" onClick={() => onSnap(v)}
          title={v === 0 ? "Sem grade: encaixa em parede, vértice, borda e centro dos vizinhos" : `Grade de ${v} cm (+ ímã de parede, borda e centro)`}>{lbl}</button>
      ))}
    </span>
  );
}

const Bloco = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "grid", gap: 5 }}>
    <span style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: ".08em" }}>{label}</span>
    {children}
  </div>
);

function Nota1a5({ label, valor, onSet }: { label: string; valor?: number; onSet: (n: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
      <span style={{ fontSize: 11, color: "#b6b6b1", flex: 1 }}>{label}</span>
      <div style={{ display: "flex", gap: 3 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onSet(valor === n ? 0 : n)} title={`${label}: ${n}`} style={{
            width: 20, height: 22, borderRadius: 5, cursor: "pointer",
            border: `1px solid ${valor && valor >= n ? "var(--gold)" : "var(--line-2)"}`,
            background: valor && valor >= n ? "var(--gold-soft)" : "transparent",
            color: valor && valor >= n ? "var(--gold)" : "#6e6e73", font: "700 11px 'DM Sans'",
          }}>{n}</button>
        ))}
      </div>
    </div>
  );
}

const Centro = ({ children }: { children: React.ReactNode }) => (
  <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center" }}>{children}</div>
);

/**
 * Chip de problema que LEVA ao problema. Cada toque percorre os equipamentos
 * culpados, um por vez — com quarenta peças na planta, achar o contorno
 * vermelho no olho é trabalho perdido.
 */
function ChipProblema({ txt, ids, onIr, ok, warn }: {
  txt: string; ids: string[]; onIr: (id: string) => void; ok?: boolean; warn?: boolean;
}) {
  const [i, setI] = useState(0);
  const cor = ok ? "var(--green)" : warn ? "var(--warn)" : "var(--red)";
  if (!ids.length) return <Chip txt={txt} ok={ok} warn={warn} />;
  return (
    <button className="chip" onClick={() => { onIr(ids[i % ids.length]); setI((v) => v + 1); }}
      style={{ borderColor: cor, color: cor, cursor: "pointer", background: "transparent" }}
      title={ids.length > 1 ? `Ir ao ${(i % ids.length) + 1}º de ${ids.length} — toque de novo para o próximo` : "Ir ao equipamento"}>
      {txt} <span aria-hidden>→</span>
    </button>
  );
}

/**
 * ANÁLISE FUNCIONAL DE ESPAÇO — a gaveta do rodapé.
 *
 * Cada número vem com a régua ao lado e o semáforo. Antes o editor mostrava
 * "Ocupação 43%" e o consultor não tinha como saber se 43% era bom, e o PDF
 * calculava a mesma coisa de outro jeito — dois números com o mesmo nome.
 */
function AnaliseEspacoPanel({ cena, onFechar }: { cena: Cena; onFechar: () => void }) {
  const a = useMemo(() => analisarEspaco(cena), [cena]);
  const setCirculacaoMin = useProjeto((s) => s.setCirculacaoMin);
  const COR: Record<string, string> = {
    ok: "var(--green)", atencao: "var(--warn)", critico: "var(--red)", neutro: "var(--text-3)",
  };
  const fmt = (m: { valor: number; unidade: string }) => {
    const v = m.unidade === "%" || m.unidade === "un" ? Math.round(m.valor) : Math.round(m.valor * 10) / 10;
    const txt = String(v).replace(".", ",");
    return m.unidade === "%" ? `${txt}%` : m.unidade === "m2" ? `${txt} m²` : m.unidade === "m2/un" ? `${txt} m²` : m.unidade === "cm" ? `${txt} cm` : txt;
  };
  const metricas: [string, typeof a.areaUtilM2][] = [
    ["Área útil", a.areaUtilM2],
    ["Área de uso", a.areaUsoM2],
    ["Área livre", a.areaLivreM2],
    ["Ocupação funcional", a.ocupacaoFuncional],
    ["m² por aparelho", a.m2PorAparelho],
    ["Usuários simultâneos", a.capacidade.simultaneos],
    ["Menor vão de circulação", a.folgas.menorVao],
  ];
  return (
    <div className="mo-in-up" style={{
      borderTop: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0,
      maxHeight: "42vh", overflow: "auto",
      padding: "12px calc(14px + var(--sar)) 12px calc(14px + var(--sal))",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <span className="brandface" style={{ fontSize: 15, color: "var(--gold)" }}>ANÁLISE FUNCIONAL DE ESPAÇO</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span className="microlabel">CIRCULAÇÃO MÍNIMA</span>
          <input className="fld" style={{ width: 74, padding: "4px 7px", fontSize: 11.5, textAlign: "right" }}
            value={String(a.circulacaoMinCm)} inputMode="numeric"
            title="A régua deste projeto. 90 cm deixa duas pessoas se cruzarem; rota de saída pede 120."
            onChange={(e) => setCirculacaoMin(Number(e.target.value.replace(/[^\d]/g, "")) || CIRCULACAO_PADRAO)} />
          <span style={{ color: "var(--muted)" }}>cm</span>
        </label>
        <span style={{ flex: 1 }} />
        <button className="btn btn--xs" onClick={onFechar}>Fechar ▾</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))", gap: 8, marginBottom: 12 }}>
        {metricas.map(([rot, m]) => (
          <div key={rot} style={{
            background: "var(--panel-2)", border: `1px solid ${m.status === "neutro" ? "var(--line)" : COR[m.status]}44`,
            borderRadius: 9, padding: "8px 10px",
          }}>
            <span className="microlabel">{rot.toUpperCase()}</span>
            <div style={{ font: "700 17px 'DM Sans'", color: COR[m.status], margin: "1px 0 2px" }}>{fmt(m)}</div>
            {/* A régua ao lado do número: é o que responde "43% é bom ou ruim?". */}
            <div style={{ fontSize: 10, color: "var(--text-4)", lineHeight: 1.4 }}>{m.referencia}</div>
          </div>
        ))}
      </div>

      {a.porArea.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span className="microlabel">POR REGIÃO FUNCIONAL</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
            {a.porArea.map((z) => (
              <span key={z.id} className="chip" style={{ borderColor: z.cor, color: z.cor }}
                title={`${z.nItens} equipamento(s) · ocupação ${Math.round(z.ocupacaoPct)}%`}>
                {z.nome} · {z.m2.toFixed(1).replace(".", ",")} m² · {z.nItens} itens
              </span>
            ))}
          </div>
        </div>
      )}

      {a.alertas.length > 0 ? (
        <div style={{ display: "grid", gap: 4 }}>
          <span className="microlabel">O QUE RESOLVER</span>
          {a.alertas.map((al, i) => (
            <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: 11.5, lineHeight: 1.5 }}>
              <span style={{ color: al.nivel === "critico" ? "var(--red)" : al.nivel === "atencao" ? "var(--warn)" : "var(--info)" }}>
                {al.nivel === "critico" ? "●" : al.nivel === "atencao" ? "◐" : "○"}
              </span>
              <span style={{ color: "var(--text-3)" }}>{al.texto}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: "var(--green)" }}>Nada a corrigir: circulação, folgas e ocupação dentro da régua do projeto.</div>
      )}
    </div>
  );
}

function Chip({ txt, ok, warn, gold, neutro }: { txt: string; ok?: boolean; warn?: boolean; gold?: boolean; neutro?: boolean }) {
  const cor = neutro ? "#8A8A8F" : gold ? "#C9A227" : ok ? "#5FBF7A" : warn ? "#E09A45" : "#E04545";
  return <span style={{ border: `1px solid ${cor}`, color: cor, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 700 }}>{txt}</span>;
}
