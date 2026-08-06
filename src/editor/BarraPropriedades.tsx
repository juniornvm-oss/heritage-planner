/**
 * A BARRA DE PROPRIEDADES — a faixa contextual acima do canvas.
 *
 * No CorelDraw ela é a peça que faz o resto funcionar: mostra as propriedades
 * do que está selecionado e, quando não há seleção, as da PRÓXIMA forma que a
 * ferramenta vai criar. Os dois casos moram aqui.
 *
 * Por que não bastava o inspetor da direita: no iPad, a mão que desenha está
 * no canvas e o inspetor fica a 900 px de distância; e o inspetor só existe
 * DEPOIS que a peça existe — não havia onde dizer "a próxima porta é de
 * correr, de 100". Era por isso que toda porta nascia igual e era corrigida
 * uma a uma.
 *
 * O inspetor da direita continua: ele tem espaço para o que é longo (nota,
 * fonte, memorial). A barra tem o que se ajusta em um toque enquanto se olha
 * para a planta.
 */

import { useEffect, useRef, useState } from "react";
import { useProjeto } from "../store/projetoStore";
import type { Etapa, PadroesPlanta } from "./EditorCanvas";
import type { IdFerramenta } from "./ferramentas";
import { ElevacaoEsquadria } from "./PreviaEsquadria";
import { formatLength } from "../lib/units";
import {
  FORMAS_JANELA, FORMAS_PILAR, JANELAS, MATERIAIS_PILAR, PAREDES, PORTAS,
  defParede, fichaAbertura, modeloDaAbertura,
  type FormaJanela, type FormaPilar, type MaterialParede, type MaterialPilar,
  type ModeloJanela, type ModeloPorta,
} from "../lib/esquadrias";

// ── Peças de interface da barra ─────────────────────────────────────────────

/**
 * Rótulo minúsculo + conteúdo, na horizontal. É a célula da barra.
 *
 * `grupo` troca o `<label>` por um `role="group"`. Não é preciosismo: `<button>`
 * é elemento rotulável, então um `<label>` em volta de um grupo de botões faz o
 * navegador encaminhar o toque na LEGENDA como clique no primeiro botão — tocar
 * a palavra "Dobradiça" mudava a porta para "esquerda" sem ninguém pedir.
 */
function Campo({ label, children, largura, grupo }: {
  label: string; children: React.ReactNode; largura?: number; grupo?: boolean;
}) {
  const estilo = largura ? { width: largura } : undefined;
  if (grupo) {
    return (
      <div className="bp-campo" style={estilo} role="group" aria-label={label}>
        <span className="bp-label" aria-hidden>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className="bp-campo" style={estilo}>
      <span className="bp-label">{label}</span>
      {children}
    </label>
  );
}

/**
 * Número em cm que só confirma no blur/Enter — digitar "1" para chegar em
 * "120" não pode reposicionar a peça em 1 cm no meio do caminho.
 */
function Num({ valor, min, max, passo, onSet, largura = 62, rotulo }: {
  valor: number; min?: number; max?: number; passo?: number; onSet: (v: number) => void;
  largura?: number; rotulo?: string;
}) {
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  const [txt, setTxt] = useState(fmt(valor));
  // `editado` guarda duas coisas de uma vez: que o blur NÃO deve gravar quando
  // ninguém digitou (só passar o dedo pelo campo materializava o padrão de
  // catálogo na peça e empilhava um passo de desfazer), e que o valor de fora
  // não deve atropelar o que está sendo digitado agora.
  const editado = useRef(false);
  useEffect(() => { if (!editado.current) setTxt(fmt(valor)); }, [valor]);
  const confirmar = () => {
    if (!editado.current) return;
    editado.current = false;
    const n = parseFloat(txt.replace(",", "."));
    if (!Number.isFinite(n)) { setTxt(fmt(valor)); return; }
    const v = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    // Ressincroniza SEMPRE, e não por efeito: quando o limite devolve o valor
    // que já estava lá, a prop não muda, o efeito não dispara e o campo ficaria
    // exibindo para sempre o número recusado.
    setTxt(fmt(v));
    if (v !== valor) onSet(v);
  };
  return (
    <input className="fld bp-num" inputMode="decimal" value={txt} step={passo} style={{ width: largura }}
      aria-label={rotulo}
      onChange={(e) => { editado.current = true; setTxt(e.target.value); }} onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

/** Botões mutuamente exclusivos. Dois ou três estados curtos. */
function Segmento<T extends string>({ valor, opcoes, onSet }: {
  valor: T; opcoes: [T, string, string?][]; onSet: (v: T) => void;
}) {
  return (
    <span className="bp-seg" role="radiogroup">
      {opcoes.map(([v, lbl, dica]) => (
        <button key={v} type="button" role="radio" aria-checked={v === valor} title={dica}
          className={`bp-seg-b${v === valor ? " on" : ""}`} onClick={() => onSet(v)}>{lbl}</button>
      ))}
    </span>
  );
}

function Sel<T extends string>({ valor, opcoes, onSet, largura = 148 }: {
  valor: T; opcoes: [T, string][]; onSet: (v: T) => void; largura?: number;
}) {
  return (
    <select className="fld bp-sel" style={{ width: largura }} value={valor} onChange={(e) => onSet(e.target.value as T)}>
      {opcoes.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
    </select>
  );
}

const opcoesDe = <K extends string>(cat: Record<K, { label: string }>): [K, string][] =>
  (Object.keys(cat) as K[]).map((k) => [k, cat[k].label]);

/** Atalhos de medida usual — o que o flyout promete e o dedo confirma. */
function Atalhos({ valores, atual, onSet }: { valores: number[]; atual: number; onSet: (v: number) => void }) {
  return (
    <span className="bp-atalhos">
      {valores.map((v) => (
        <button key={v} type="button" className={`bp-chip${Math.abs(v - atual) < 0.01 ? " on" : ""}`}
          onClick={() => onSet(v)} title={`${v} cm`}>{v}</button>
      ))}
    </span>
  );
}

const Divisor = () => <span className="bp-div" aria-hidden />;

// ── A barra ─────────────────────────────────────────────────────────────────

export function BarraPropriedades({ etapa, ferramenta, padroes, onPadroes, ajuda, children }: {
  etapa: Etapa;
  ferramenta: IdFerramenta | null;
  padroes: PadroesPlanta;
  onPadroes: (p: Partial<PadroesPlanta>) => void;
  /** A frase da etapa, quando não há nada mais útil a mostrar. */
  ajuda: string;
  /** Grupos próprios da etapa (encaixe, camadas, ações do item). */
  children?: React.ReactNode;
}) {
  const selEstrutura = useProjeto((s) => s.selEstrutura);
  const estrutura = useProjeto((s) => s.cena.estrutura);
  const selecionarEstrutura = useProjeto((s) => s.selecionarEstrutura);

  const alvo = etapa === "planta" && selEstrutura ? selEstrutura : null;
  const parede = alvo?.tipo === "parede" ? estrutura?.paredes.find((p) => p.id === alvo.id) : undefined;
  const abertura = alvo?.tipo === "abertura" ? estrutura?.aberturas.find((a) => a.id === alvo.id) : undefined;
  const pilar = alvo?.tipo === "pilar" ? estrutura?.pilares.find((p) => p.id === alvo.id) : undefined;

  const desenhando = etapa === "planta" && !!ferramenta && ["parede", "porta", "janela", "pilar"].includes(ferramenta);

  let conteudo: React.ReactNode = null;
  if (parede) conteudo = <PropsParede id={parede.id} />;
  else if (abertura) conteudo = <PropsAbertura id={abertura.id} />;
  else if (pilar) conteudo = <PropsPilar id={pilar.id} />;
  else if (desenhando) conteudo = <PropsPadrao ferramenta={ferramenta!} padroes={padroes} onPadroes={onPadroes} />;

  return (
    <div className="barraprops">
      {conteudo ?? <span className="bp-ajuda">{ajuda}</span>}
      {/* O CAMINHO DE VOLTA. Toda peça nasce selecionada, e com a ferramenta
          ligada o canvas não escuta toque na estrutura — sem este botão, depois
          da primeira parede a barra ficava presa nela e os padrões da PRÓXIMA
          peça viravam inalcançáveis sem trocar de ferramenta. */}
      {desenhando && !!selEstrutura && (
        <button type="button" className="bp-acao" onClick={() => selecionarEstrutura(null)}
          title="Voltar a configurar a PRÓXIMA peça, em vez da que acabou de ser desenhada">
          Próxima ▸
        </button>
      )}
      {children && <>{conteudo && <Divisor />}{children}</>}
    </div>
  );
}

// ── Objeto selecionado ──────────────────────────────────────────────────────

function PropsParede({ id }: { id: string }) {
  const p = useProjeto((s) => s.cena.estrutura?.paredes.find((x) => x.id === id));
  const updateParede = useProjeto((s) => s.updateParede);
  const removerParede = useProjeto((s) => s.removerParede);
  const girar = useProjeto((s) => s.girarEstruturaSel);
  if (!p) return null;
  const dp = defParede(p.material);
  const len = Math.hypot(p.x2 - p.x1, p.y2 - p.y1);
  const podeReforcar = dp.fixacao === "requer_reforco";

  return (
    <>
      <span className="bp-titulo">PAREDE</span>
      <span className="bp-medida" title="Comprimento da parede">{formatLength(len)}</span>
      <Campo label="Sistema">
        {/* Trocar o sistema apaga o reforço herdado: "alvenaria reforçada" não
            quer dizer nada, o botão ⊕ nem aparece para ela, e a listra verde
            de "aqui pode pendurar" ficaria acesa sem ninguém poder apagá-la. */}
        <Sel<MaterialParede> valor={p.material ?? "alvenaria"} opcoes={opcoesDe(PAREDES)} largura={168}
          onSet={(m) => updateParede(p.id, {
            material: m, espessura_cm: PAREDES[m].espessura_cm,
            ...(PAREDES[m].fixacao === "requer_reforco" ? {} : { reforcada: undefined }),
          })} />
      </Campo>
      <Campo label="Espessura">
        <Num valor={p.espessura_cm} min={1} onSet={(v) => updateParede(p.id, { espessura_cm: v })} />
      </Campo>
      <Atalhos valores={dp.espessuras} atual={p.espessura_cm} onSet={(v) => updateParede(p.id, { espessura_cm: v })} />
      {podeReforcar && (
        <button type="button" className="bp-toggle" aria-pressed={!!p.reforcada}
          title={p.reforcada
            ? "Reforço embutido previsto: espelho, TV e espaldar liberados nesta parede."
            : `${dp.label} não recebe carga pesada sem reforço. Marque quando o projeto previr montante duplo ou chapa de OSB no miolo.`}
          onClick={() => updateParede(p.id, { reforcada: !p.reforcada })}>
          ⊕ Reforçada
        </button>
      )}
      <Divisor />
      <button type="button" className="bp-acao" title="Girar 90° em torno do centro" onClick={() => girar()}>↻ 90°</button>
      <button type="button" className="bp-acao bp-acao--perigo" title="Remover a parede (leva junto aberturas e itens fixados nela)"
        onClick={() => removerParede(p.id)}>✕</button>
    </>
  );
}

function PropsAbertura({ id }: { id: string }) {
  const ab = useProjeto((s) => s.cena.estrutura?.aberturas.find((x) => x.id === id));
  const parede = useProjeto((s) => s.cena.estrutura?.paredes.find((p) => p.id === ab?.paredeId));
  const update = useProjeto((s) => s.updateAbertura);
  const remover = useProjeto((s) => s.removerAbertura);
  if (!ab) return null;

  const f = fichaAbertura(ab);
  const modelo = modeloDaAbertura(ab);
  const ehPorta = ab.tipo === "porta";
  const defP = ehPorta ? PORTAS[modelo as ModeloPorta] : undefined;
  const comprimentoParede = parede ? Math.hypot(parede.x2 - parede.x1, parede.y2 - parede.y1) : undefined;

  return (
    <>
      {/* A prévia em elevação: a parte da esquadria que a planta não mostra. */}
      <span className="bp-previa" title={`${f.label} — ${f.largura_cm} × ${f.altura_cm} cm`}>
        <ElevacaoEsquadria esp={{ ...ab, modelo }} altura={46} compacta />
      </span>
      <span className="bp-titulo">{ehPorta ? "PORTA" : "JANELA"}</span>
      <Campo label="Família" grupo>
        {/* Trocar de família RESETA o modelo: "giro" não existe no catálogo de
            janelas, e deixar o valor morto para trás faria a peça cair no
            padrão sem o consultor entender por quê. */}
        <Segmento<"porta" | "janela"> valor={ab.tipo}
          opcoes={[["porta", "Porta"], ["janela", "Janela"]]}
          onSet={(t) => {
            if (t === ab.tipo) return;
            update(ab.id, t === "porta"
              ? { tipo: "porta", modelo: "giro", largura_cm: PORTAS.giro.vao_cm, altura_cm: undefined, peitoril_cm: undefined, forma: undefined }
              : { tipo: "janela", modelo: "correr", largura_cm: JANELAS.correr.vao_cm, altura_cm: undefined, peitoril_cm: undefined, lado: undefined, sentido: undefined });
          }} />
      </Campo>
      <Campo label="Modelo">
        {ehPorta
          ? <Sel<ModeloPorta> valor={modelo as ModeloPorta} opcoes={opcoesDe(PORTAS)} largura={158}
              onSet={(m) => update(ab.id, { modelo: m, largura_cm: PORTAS[m].vao_cm })} />
          : <Sel<ModeloJanela> valor={modelo as ModeloJanela} opcoes={opcoesDe(JANELAS)} largura={158}
              onSet={(m) => update(ab.id, { modelo: m, largura_cm: JANELAS[m].vao_cm })} />}
      </Campo>
      <Campo label="Vão L × A">
        <span className="bp-par">
          <Num valor={f.largura_cm} min={30} onSet={(v) => update(ab.id, { largura_cm: v })} largura={56} />
          <span className="bp-x">×</span>
          <Num valor={f.altura_cm} min={30} onSet={(v) => update(ab.id, { altura_cm: v })} largura={56} />
        </span>
      </Campo>
      {!ehPorta && (
        <>
          <Campo label="Peitoril">
            <Num valor={f.peitoril_cm ?? 0} min={0} onSet={(v) => update(ab.id, { peitoril_cm: v })} />
          </Campo>
          <Campo label="Forma do vão">
            <Sel<FormaJanela> valor={ab.forma ?? "retangular"} opcoes={opcoesDe(FORMAS_JANELA)} largura={140}
              onSet={(v) => update(ab.id, { forma: v })} />
          </Campo>
        </>
      )}
      {ehPorta && defP?.temLado && (
        <>
          <Campo label="Dobradiça" grupo>
            <Segmento valor={ab.lado ?? "direita"} opcoes={[["esquerda", "◀ Esq"], ["direita", "Dir ▶"]]}
              onSet={(v) => update(ab.id, { lado: v })} />
          </Campo>
          <Campo label="Abre para" grupo>
            <Segmento valor={ab.sentido ?? "dentro"}
              opcoes={[["dentro", "Dentro", "A folha varre o piso da sala"], ["fora", "Fora", "A folha varre o lado de fora"]]}
              onSet={(v) => update(ab.id, { sentido: v })} />
          </Campo>
        </>
      )}
      <Campo label="Posição na parede">
        <Num valor={Math.round(ab.centro_cm)} min={0} max={comprimentoParede} onSet={(v) => update(ab.id, { centro_cm: v })} largura={70} />
      </Campo>
      {defP && !defP.varre && (
        <span className="bp-nota" title="Modelo que não consome piso — é o que libera a área na frente do vão.">
          não varre piso
        </span>
      )}
      <Divisor />
      <button type="button" className="bp-acao bp-acao--perigo" title="Remover a abertura" onClick={() => remover(ab.id)}>✕</button>
    </>
  );
}

function PropsPilar({ id }: { id: string }) {
  const p = useProjeto((s) => s.cena.estrutura?.pilares.find((x) => x.id === id));
  const update = useProjeto((s) => s.updatePilar);
  const remover = useProjeto((s) => s.removerPilar);
  const girar = useProjeto((s) => s.girarEstruturaSel);
  if (!p) return null;
  return (
    <>
      <span className="bp-titulo">PILAR</span>
      <Campo label="Seção">
        <Sel<FormaPilar> valor={p.forma ?? "retangular"} opcoes={opcoesDe(FORMAS_PILAR)} largura={124}
          onSet={(v) => update(p.id, { forma: v })} />
      </Campo>
      <Campo label="Material">
        <Sel<MaterialPilar> valor={p.material ?? "concreto"} opcoes={opcoesDe(MATERIAIS_PILAR)} largura={140}
          onSet={(v) => update(p.id, { material: v })} />
      </Campo>
      <Campo label="L × P">
        <span className="bp-par">
          <Num valor={p.w_cm} min={5} onSet={(v) => update(p.id, { w_cm: v })} largura={56} />
          <span className="bp-x">×</span>
          <Num valor={p.h_cm} min={5} onSet={(v) => update(p.id, { h_cm: v })} largura={56} />
        </span>
      </Campo>
      <Campo label="Posição X · Y">
        <span className="bp-par">
          <Num valor={p.x_cm} onSet={(v) => update(p.id, { x_cm: v })} largura={62} />
          <Num valor={p.y_cm} onSet={(v) => update(p.id, { y_cm: v })} largura={62} />
        </span>
      </Campo>
      <Divisor />
      <button type="button" className="bp-acao" title="Girar 90°" onClick={() => girar()}>↻ 90°</button>
      <button type="button" className="bp-acao bp-acao--perigo" title="Remover o pilar" onClick={() => remover(p.id)}>✕</button>
    </>
  );
}

// ── Padrões da ferramenta (sem seleção) ─────────────────────────────────────

function PropsPadrao({ ferramenta, padroes, onPadroes }: {
  ferramenta: IdFerramenta;
  padroes: PadroesPlanta;
  onPadroes: (p: Partial<PadroesPlanta>) => void;
}) {
  if (ferramenta === "parede") {
    const dp = PAREDES[padroes.materialParede];
    return (
      <>
        <span className="bp-titulo">PRÓXIMA PAREDE</span>
        <Campo label="Sistema">
          <Sel<MaterialParede> valor={padroes.materialParede} opcoes={opcoesDe(PAREDES)} largura={168}
            onSet={(m) => onPadroes({
              materialParede: m, espessuraParede: PAREDES[m].espessura_cm,
              ...(PAREDES[m].fixacao === "requer_reforco" ? {} : { paredeReforcada: false }),
            })} />
        </Campo>
        <Campo label="Espessura">
          <Num valor={padroes.espessuraParede} min={1} onSet={(v) => onPadroes({ espessuraParede: v })} />
        </Campo>
        <Atalhos valores={dp.espessuras} atual={padroes.espessuraParede} onSet={(v) => onPadroes({ espessuraParede: v })} />
        {dp.fixacao === "requer_reforco" && (
          <button type="button" className="bp-toggle" aria-pressed={padroes.paredeReforcada}
            title="Já nasce com reforço embutido previsto para carga pendurada."
            onClick={() => onPadroes({ paredeReforcada: !padroes.paredeReforcada })}>⊕ Reforçada</button>
        )}
        <span className="bp-nota">{dp.descricao}</span>
      </>
    );
  }

  if (ferramenta === "porta") {
    const d = PORTAS[padroes.modeloPorta];
    return (
      <>
        <span className="bp-previa">
          <ElevacaoEsquadria esp={{ tipo: "porta", modelo: padroes.modeloPorta, largura_cm: padroes.larguraPorta, lado: padroes.ladoPorta }} altura={46} compacta />
        </span>
        <span className="bp-titulo">PRÓXIMA PORTA</span>
        <Campo label="Modelo">
          <Sel<ModeloPorta> valor={padroes.modeloPorta} opcoes={opcoesDe(PORTAS)} largura={158}
            onSet={(m) => onPadroes({ modeloPorta: m, larguraPorta: PORTAS[m].vao_cm })} />
        </Campo>
        <Campo label="Vão">
          <Num valor={padroes.larguraPorta} min={40} onSet={(v) => onPadroes({ larguraPorta: v })} />
        </Campo>
        <Atalhos valores={d.vaos} atual={padroes.larguraPorta} onSet={(v) => onPadroes({ larguraPorta: v })} />
        {d.temLado && (
          <>
            <Campo label="Dobradiça" grupo>
              <Segmento valor={padroes.ladoPorta} opcoes={[["esquerda", "◀ Esq"], ["direita", "Dir ▶"]]}
                onSet={(v) => onPadroes({ ladoPorta: v })} />
            </Campo>
            <Campo label="Abre para" grupo>
              <Segmento valor={padroes.sentidoPorta} opcoes={[["dentro", "Dentro"], ["fora", "Fora"]]}
                onSet={(v) => onPadroes({ sentidoPorta: v })} />
            </Campo>
          </>
        )}
        {padroes.larguraPorta < 80 && (
          <span className="bp-nota bp-nota--aviso" title="NBR 9050: vão livre mínimo de 80 cm em porta de uso comum.">
            abaixo dos 80 cm de acessibilidade
          </span>
        )}
      </>
    );
  }

  if (ferramenta === "janela") {
    const d = JANELAS[padroes.modeloJanela];
    return (
      <>
        <span className="bp-previa">
          <ElevacaoEsquadria esp={{ tipo: "janela", modelo: padroes.modeloJanela, largura_cm: padroes.larguraJanela, forma: padroes.formaJanela }} altura={46} compacta />
        </span>
        <span className="bp-titulo">PRÓXIMA JANELA</span>
        <Campo label="Modelo">
          <Sel<ModeloJanela> valor={padroes.modeloJanela} opcoes={opcoesDe(JANELAS)} largura={158}
            onSet={(m) => onPadroes({ modeloJanela: m, larguraJanela: JANELAS[m].vao_cm })} />
        </Campo>
        <Campo label="Vão">
          <Num valor={padroes.larguraJanela} min={30} onSet={(v) => onPadroes({ larguraJanela: v })} />
        </Campo>
        <Atalhos valores={d.vaos} atual={padroes.larguraJanela} onSet={(v) => onPadroes({ larguraJanela: v })} />
        <Campo label="Forma do vão">
          <Sel<FormaJanela> valor={padroes.formaJanela} opcoes={opcoesDe(FORMAS_JANELA)} largura={140}
            onSet={(v) => onPadroes({ formaJanela: v })} />
        </Campo>
        <span className="bp-nota">altura {d.altura_cm} cm · peitoril {d.peitoril_cm} cm</span>
      </>
    );
  }

  if (ferramenta === "pilar") {
    return (
      <>
        <span className="bp-titulo">PRÓXIMO PILAR</span>
        <Campo label="Seção">
          <Sel<FormaPilar> valor={padroes.formaPilar} opcoes={opcoesDe(FORMAS_PILAR)} largura={124}
            onSet={(v) => onPadroes({ formaPilar: v })} />
        </Campo>
        <Campo label="Material">
          <Sel<MaterialPilar> valor={padroes.materialPilar} opcoes={opcoesDe(MATERIAIS_PILAR)} largura={140}
            onSet={(v) => onPadroes({ materialPilar: v })} />
        </Campo>
        <span className="bp-nota">{MATERIAIS_PILAR[padroes.materialPilar].descricao}</span>
      </>
    );
  }
  return null;
}
