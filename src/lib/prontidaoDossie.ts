/**
 * Checklist de emissão do Dossiê — o que o consultor precisa ter pronto
 * antes de gerar o PDF, e o que ainda é só recomendação.
 *
 * Vive fora do EditorScreen para o mesmo critério alimentar a Central, o
 * botão de emitir e os testes — sem depender do React.
 */

import type { Cena, Projeto } from "./types";
import { classificacaoPendente } from "./curadoria";
import { analisarEspaco } from "./analiseEspaco";
import { resumo } from "./validation";

export type SeveridadeItem = "obrigatorio" | "recomendado" | "ok";

export interface ItemProntidao {
  id: string;
  label: string;
  detalhe?: string;
  severidade: SeveridadeItem;
  ok: boolean;
}

export interface ProntidaoDossie {
  itens: ItemProntidao[];
  /** Há algo obrigatório faltando — o PDF ainda sai, mas o aviso é vermelho. */
  bloqueios: ItemProntidao[];
  avisos: ItemProntidao[];
  pronto: boolean;
}

export function checarProntidaoDossie(projeto: Projeto, cena: Cena): ProntidaoDossie {
  const itensCena = cena.itens ?? [];
  const laminasAtivas = (cena.laminas ?? []).filter((l) => l.ativa);
  const cenarios = new Set(itensCena.map((i) => i.cenario));
  const esp = analisarEspaco(cena);
  const r = resumo(cena);
  const temPlanta = !!(cena.planta || cena.plantaVetorial || (cena.estrutura?.paredes.length ?? 0) > 0);
  // A sala do projeto já nasce dimensionada (cadastro); paredes/fundo são
  // o ideal, mas o modelo Heritage e projetos novos sem import ainda têm
  // a caixa métrica — o PDF desenha a sala a partir dela.
  const temSala = (cena.sala?.largura_cm ?? 0) > 0 && (cena.sala?.profundidade_cm ?? 0) > 0;
  const temFachada = !!projeto.foto_fachada;
  const perfil = projeto.perfil ?? {};
  const temDiagnostico = [perfil.padrao, perfil.moradores, perfil.faixa_etaria, perfil.frequencia, perfil.uso, perfil.objetivo]
    .some((v) => v && String(v).trim());

  const itens: ItemProntidao[] = [
    {
      id: "equipamentos",
      label: "Equipamentos na planta",
      detalhe: itensCena.length ? `${itensCena.length} itens` : "Posicione na etapa Layout",
      severidade: "obrigatorio",
      ok: itensCena.length > 0,
    },
    {
      id: "planta",
      label: "Sala medida (planta ou paredes)",
      detalhe: temPlanta ? "com planta/paredes" : temSala ? "caixa da sala" : "Importe a planta ou desenhe as paredes",
      severidade: temSala ? "recomendado" : "obrigatorio",
      ok: temPlanta || temSala,
    },
    {
      id: "cenarios",
      label: "Cenários Essencial · Balanceado · Premium",
      detalhe: classificacaoPendente(cena)
        ? "Tudo ainda em Balanceado — classifique na Curadoria"
        : cenarios.size >= 2 ? `${cenarios.size} níveis` : "Classifique os equipamentos",
      severidade: "obrigatorio",
      ok: cenarios.size >= 2 && !classificacaoPendente(cena),
    },
    {
      id: "parecer",
      label: "Parecer técnico escrito",
      detalhe: cena.parecer?.trim() ? undefined : "A defesa do layout para o síndico",
      severidade: "obrigatorio",
      ok: !!cena.parecer?.trim(),
    },
    {
      id: "laminas",
      label: "Lâminas da apresentação",
      detalhe: laminasAtivas.length
        ? `${laminasAtivas.length} ativa(s)`
        : "Sem lâminas: sai a planta completa de sempre",
      severidade: "recomendado",
      ok: laminasAtivas.length > 0,
    },
    {
      id: "diagnostico",
      label: "Diagnóstico da Leitura",
      detalhe: temDiagnostico ? undefined : "Preencha o perfil na Leitura do condomínio",
      severidade: "recomendado",
      ok: temDiagnostico,
    },
    {
      id: "fachada",
      label: "Foto da fachada na capa",
      detalhe: temFachada ? undefined : "Opcional, mas eleva o padrão da capa",
      severidade: "recomendado",
      ok: temFachada,
    },
    {
      id: "colisoes",
      label: "Sem colisões no layout",
      detalhe: r.nCol ? `${r.nCol} a resolver na etapa Layout` : undefined,
      severidade: "recomendado",
      ok: r.nCol === 0,
    },
    {
      id: "espaco",
      label: "Circulação sem alerta crítico",
      detalhe: esp.alertas.some((a) => a.nivel === "critico")
        ? esp.alertas.filter((a) => a.nivel === "critico").map((a) => a.texto).join(" · ")
        : undefined,
      severidade: "recomendado",
      ok: !esp.alertas.some((a) => a.nivel === "critico"),
    },
    {
      id: "emissao",
      label: "Data de emissão definida",
      detalhe: cena.dossieEmissao ? undefined : "Define o carimbo do documento",
      severidade: "recomendado",
      ok: !!cena.dossieEmissao,
    },
  ];

  const bloqueios = itens.filter((i) => i.severidade === "obrigatorio" && !i.ok);
  const avisos = itens.filter((i) => i.severidade === "recomendado" && !i.ok);
  return { itens, bloqueios, avisos, pronto: bloqueios.length === 0 };
}
