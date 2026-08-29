/**
 * O REGISTRO DE FERRAMENTAS do editor — quem existe em cada etapa, e que
 * variantes cada uma oferece.
 *
 * Vem do modelo do CorelDraw, e do problema concreto que ele resolve aqui: a
 * faixa de ferramentas tinha quinze botões idênticos numa linha que quebrava
 * em duas no iPad, e "Parede", "Porta" e "Janela" eram botões SEM OPÇÃO —
 * toda parede nascia com 15 cm e nenhum material, toda porta era um giro de
 * 90 cm. As opções que existiam estavam escondidas em outro lugar: os tipos de
 * região viviam como chips na mesma faixa, e os itens de parede viviam numa
 * lista no rail esquerdo. Eram flyouts disfarçados.
 *
 * Aqui tudo isso vira uma estrutura só: ferramenta → variantes. A caixa
 * vertical desenha o rail e o flyout a partir dela; a barra de propriedades lê
 * a variante ativa para configurar a PRÓXIMA peça. Nenhuma das duas conhece
 * regra de negócio.
 *
 * Arquivo de DADOS: sem React, sem estado. As ações continuam no EditorScreen,
 * que é quem sabe ligar e desligar modo.
 */

import type { Etapa } from "./EditorCanvas";
import {
  JANELAS, PAREDES, PORTAS, FORMAS_PILAR, MATERIAIS_PILAR,
  type ModeloJanela, type ModeloPorta,
} from "../lib/esquadrias";
import { ELEMENTOS_PAREDE, TIPOS_AREA, type TipoArea, type TipoElementoParede, type FamiliaAcessorio } from "../lib/types";
import { FAMILIAS_ACESSORIO } from "../lib/acessorios";

export type IdFerramenta =
  | "selecionar"
  | "importarPlanta" | "alinhar" | "calibrar" | "moverPlanta" | "recortar" | "auto"
  | "parede" | "porta" | "janela" | "pilar" | "apagarEstrutura"
  | "regiao" | "regiaoPoligono"
  | "areaRect" | "areaPoligono" | "cota" | "espelho" | "itemParede" | "apagarAcabamento"
  | "vista"
  | "sugerirAcessorios" | "organizarAcessorios" | "sincronizarAcessorios" | "fixarAcessorio" | "apagarAcessorio";

export interface Variante {
  id: string;
  label: string;
  descricao: string;
  /** Medida de fábrica, mostrada no flyout ("90 × 210 cm"). */
  medida?: string;
  /** Desenha o símbolo de planta real como ícone. */
  esquadria?: { tipo: "porta" | "janela"; modelo: ModeloPorta | ModeloJanela };
  /** Ícone textual, quando não há símbolo de planta. */
  glifo?: string;
  cor?: string;
}

export interface DefFerramenta {
  id: IdFerramenta;
  label: string;
  glifo: string;
  /** Uma frase: o que a ferramenta faz. Vira `title` e texto do flyout. */
  dica: string;
  atalho?: string;
  /** Ferramenta destrutiva — o rail pinta de vermelho. */
  perigo?: boolean;
  /** Ação de um toque só (não fica ativa): ✨ Auto, ⭱ Planta. */
  acao?: boolean;
  tituloVariantes?: string;
  variantes?: Variante[];
}

export interface GrupoFerramentas {
  titulo: string;
  ferramentas: DefFerramenta[];
}

/** O que a etapa tem disponível — desabilita o que não faz sentido ainda. */
export interface ContextoFerramentas {
  temFundo: boolean;
  temVetorial: boolean;
}

const cm = (v: number) => `${v} cm`;

const VARIANTES_PAREDE: Variante[] = (Object.keys(PAREDES) as (keyof typeof PAREDES)[]).map((k) => ({
  id: k,
  label: PAREDES[k].label,
  descricao: PAREDES[k].descricao,
  medida: cm(PAREDES[k].espessura_cm),
  glifo: PAREDES[k].icone,
  cor: PAREDES[k].cor,
}));

const VARIANTES_PORTA: Variante[] = (Object.keys(PORTAS) as ModeloPorta[]).map((k) => ({
  id: k,
  label: PORTAS[k].label,
  descricao: PORTAS[k].descricao,
  medida: `${PORTAS[k].vao_cm} × ${PORTAS[k].altura_cm} cm`,
  esquadria: { tipo: "porta", modelo: k },
}));

const VARIANTES_JANELA: Variante[] = (Object.keys(JANELAS) as ModeloJanela[]).map((k) => ({
  id: k,
  label: JANELAS[k].label,
  descricao: JANELAS[k].descricao,
  medida: `${JANELAS[k].vao_cm} × ${JANELAS[k].altura_cm} cm · peit. ${JANELAS[k].peitoril_cm}`,
  esquadria: { tipo: "janela", modelo: k },
}));

const VARIANTES_PILAR: Variante[] = (Object.keys(FORMAS_PILAR) as (keyof typeof FORMAS_PILAR)[]).map((k) => ({
  id: k,
  label: FORMAS_PILAR[k].label,
  descricao: FORMAS_PILAR[k].descricao,
  glifo: FORMAS_PILAR[k].icone,
}));

const VARIANTES_MATERIAL_PILAR: Variante[] = (Object.keys(MATERIAIS_PILAR) as (keyof typeof MATERIAIS_PILAR)[]).map((k) => ({
  id: k,
  label: MATERIAIS_PILAR[k].label,
  descricao: MATERIAIS_PILAR[k].descricao,
  glifo: "▮",
  cor: MATERIAIS_PILAR[k].cor,
}));

const VARIANTES_AREA: Variante[] = (Object.keys(TIPOS_AREA) as TipoArea[]).map((k) => ({
  id: k,
  label: TIPOS_AREA[k].label,
  descricao: TIPOS_AREA[k].descricao,
  glifo: "▭",
  cor: TIPOS_AREA[k].cor,
}));

const VARIANTES_ITEM_PAREDE: Variante[] = (Object.keys(ELEMENTOS_PAREDE) as TipoElementoParede[]).map((k) => ({
  id: k,
  label: ELEMENTOS_PAREDE[k].label,
  descricao: `${ELEMENTOS_PAREDE[k].largura} × ${ELEMENTOS_PAREDE[k].altura} cm, a ${ELEMENTOS_PAREDE[k].distPiso} cm do piso.`,
  medida: `${ELEMENTOS_PAREDE[k].largura} × ${ELEMENTOS_PAREDE[k].altura} cm`,
  glifo: ELEMENTOS_PAREDE[k].icone,
  cor: ELEMENTOS_PAREDE[k].cor,
}));

const SELECIONAR: DefFerramenta = {
  id: "selecionar", label: "Selecionar", glifo: "➤", atalho: "Esc",
  dica: "Selecionar e mover. Toque para escolher, arraste para mover, alças para redimensionar.",
};

export function ferramentasDaEtapa(etapa: Etapa, ctx: ContextoFerramentas): GrupoFerramentas[] {
  if (etapa === "planta") {
    const grupos: GrupoFerramentas[] = [
      { titulo: "Base", ferramentas: [SELECIONAR] },
      {
        titulo: "Arquivo",
        ferramentas: [
          { id: "importarPlanta", label: "Planta", glifo: "⭱", acao: true, dica: "Subir a planta baixa: PDF, DWG, DXF ou imagem." },
          ...(ctx.temFundo || ctx.temVetorial ? [
            { id: "alinhar" as const, label: "Alinhar", glifo: "📐", dica: "Toque as 2 pontas de uma parede de medida conhecida — a planta é escalada, girada e encaixada." },
            { id: "calibrar" as const, label: "Calibrar", glifo: "📏", dica: "Ajustar só a escala: toque 2 pontos de medida conhecida." },
            { id: "moverPlanta" as const, label: "Mover", glifo: "🖐", dica: "Arrastar a planta de fundo para posicionar." },
          ] : []),
          ...(ctx.temVetorial ? [{ id: "recortar" as const, label: "Recortar", glifo: "✂", dica: "Isolar a planta do carimbo e das observações: toque 2 cantos." }] : []),
          ...(ctx.temFundo || ctx.temVetorial ? [{ id: "auto" as const, label: "Auto", glifo: "✨", acao: true, dica: "Gerar paredes e pilares a partir da planta importada, já em escala." }] : []),
        ],
      },
      {
        titulo: "Construir",
        ferramentas: [
          {
            id: "parede", label: "Parede", glifo: "▮",
            dica: "Toque as 2 pontas da parede. O traço quase reto é endireitado sozinho.",
            tituloVariantes: "Sistema construtivo",
            variantes: VARIANTES_PAREDE,
          },
          {
            id: "porta", label: "Porta", glifo: "🚪",
            dica: "Toque sobre a parede onde fica a porta.",
            tituloVariantes: "Tipo de abertura",
            variantes: VARIANTES_PORTA,
          },
          {
            id: "janela", label: "Janela", glifo: "🪟",
            dica: "Toque sobre a parede onde fica a janela.",
            tituloVariantes: "Tipo de esquadria",
            variantes: VARIANTES_JANELA,
          },
          {
            id: "pilar", label: "Pilar", glifo: "◼",
            dica: "Toque 2 cantos do pilar.",
            tituloVariantes: "Seção",
            variantes: VARIANTES_PILAR,
          },
        ],
      },
      {
        titulo: "Editar",
        ferramentas: [
          { id: "apagarEstrutura", label: "Apagar", glifo: "⌫", perigo: true, dica: "Toque no elemento para apagar. Apagar a parede leva junto as suas aberturas e o que estiver pendurado nela." },
        ],
      },
    ];
    return grupos;
  }

  if (etapa === "areas") {
    return [
      { titulo: "Base", ferramentas: [SELECIONAR] },
      {
        titulo: "Zonear",
        ferramentas: [
          { id: "regiao", label: "Região", glifo: "▭", dica: "Toque 2 cantos da região.", tituloVariantes: "Tipo de região", variantes: VARIANTES_AREA },
          { id: "regiaoPoligono", label: "Polígono", glifo: "⬠", dica: "Toque os cantos; toque o 1º ponto para fechar.", tituloVariantes: "Tipo de região", variantes: VARIANTES_AREA },
        ],
      },
    ];
  }

  if (etapa === "acabamento") {
    return [
      { titulo: "Base", ferramentas: [SELECIONAR] },
      {
        titulo: "Pintar",
        ferramentas: [
          { id: "areaRect", label: "Área", glifo: "▭", dica: "Toque 2 cantos da área de piso ou parede." },
          { id: "areaPoligono", label: "Polígono", glifo: "⬠", dica: "Toque os cantos; toque o 1º ponto para fechar." },
        ],
      },
      {
        titulo: "Fixar",
        ferramentas: [
          { id: "espelho", label: "Espelho", glifo: "🪞", dica: "Toque na parede onde fica o espelho." },
          {
            id: "itemParede", label: "Na parede", glifo: "🔌",
            dica: "Toque na parede onde o item fica fixado.",
            tituloVariantes: "O que fixar",
            variantes: VARIANTES_ITEM_PAREDE,
          },
          { id: "cota", label: "Cota", glifo: "📏", dica: "Toque 2 pontos para fixar a medida na planta." },
        ],
      },
      { titulo: "Editar", ferramentas: [{ id: "apagarAcabamento", label: "Apagar", glifo: "⌫", perigo: true, dica: "Toque no elemento para apagar." }] },
    ];
  }

  if (etapa === "layout") {
    return [
      { titulo: "Base", ferramentas: [SELECIONAR] },
      { titulo: "Ver", ferramentas: [{ id: "vista", label: "Vista IA", glifo: "📷", dica: "Toque onde fica a câmera e depois para onde ela olha — gera um prompt de imagem." }] },
    ];
  }

  if (etapa === "acessorios") {
    const VARIANTES_FAMILIA: Variante[] = (Object.keys(FAMILIAS_ACESSORIO) as FamiliaAcessorio[]).map((k) => ({
      id: k,
      label: FAMILIAS_ACESSORIO[k].label,
      descricao: FAMILIAS_ACESSORIO[k].descricao,
      glifo: FAMILIAS_ACESSORIO[k].glifo,
      cor: FAMILIAS_ACESSORIO[k].cor,
    }));
    return [
      { titulo: "Base", ferramentas: [SELECIONAR] },
      {
        titulo: "Projeto",
        ferramentas: [
          { id: "sugerirAcessorios", label: "Sugerir", glifo: "✨", acao: true, dica: "Monta a lista a partir dos aparelhos e das regiões DESTE projeto — e ancora cada item no lugar." },
          { id: "sincronizarAcessorios", label: "Sincronizar", glifo: "⇄", acao: true, dica: "Cruza orçamento e planta: estante/torre, chifres de anilha, suporte de barra e de colchonete não se pagam duas vezes." },
          { id: "organizarAcessorios", label: "Organizar", glifo: "▦", acao: true, dica: "Ancora os acessórios que já estão na lista: rack, polia, região. Não acrescenta item novo." },
        ],
      },
      {
        titulo: "Espaço",
        ferramentas: [
          {
            id: "fixarAcessorio", label: "Fixar", glifo: "⊕",
            dica: "Toque na planta, num aparelho ou numa região para dar endereço ao acessório selecionado.",
            tituloVariantes: "Família (filtra o catálogo)",
            variantes: VARIANTES_FAMILIA,
          },
        ],
      },
      { titulo: "Editar", ferramentas: [{ id: "apagarAcessorio", label: "Apagar", glifo: "⌫", perigo: true, dica: "Toque no pino do acessório para tirá-lo da lista." }] },
    ];
  }

  return [];
}

/** Variantes de material do pilar — flyout secundário, na barra de propriedades. */
export { VARIANTES_MATERIAL_PILAR };
