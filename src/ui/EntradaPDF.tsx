// Porta de entrada ÚNICA de documento — planta, orçamento, anexo.
//
// Hoje o app tem três `<input type="file">` soltos (planta no editor, anexo de
// orçamento, leitura da Curadoria) e cada um erra de um jeito diferente: um
// não valida nada, outro valida só a extensão, nenhum avisa quando o mesmo PDF
// sobe duas vezes — e é por isso que a mesma proposta vira duas na lista. Aqui
// o caminho é um só: valida, lê com progresso REAL, mostra a primeira página,
// calcula o SHA-256 e só então entrega o arquivo para quem chamou.
//
// O que este componente NÃO faz: interpretar o conteúdo. Quem sabe o que fazer
// com o documento é a tela (`lerOrcamentoPdf`, `lerPlanta`, `uploadOrcamento`).

import { useCallback, useEffect, useRef, useState } from "react";
import { carregarPdfjs } from "../lib/parsers";

/** Papel do documento renderizado — cor do PAPEL, não da interface: um PDF
 *  com fundo transparente tem que sair branco em qualquer tema. */
const PAPEL = "#ffffff";

/** Lado maior da miniatura, em pixels de tela. */
const PREVIA_PX = 460;

export interface TipoAceito {
  /** MIME oficial. Vem vazio em muitos arquivos do app Arquivos do iPadOS. */
  mimes: readonly string[];
  /** Extensões, em minúsculas e sem ponto — o desempate quando o MIME falta. */
  extensoes: readonly string[];
  /** Como dizer isso ao consultor ("PDF", "PDF, DWG, DXF ou imagem"). */
  rotulo: string;
}

/** Orçamento, anexo de proposta: só PDF. */
export const ACEITA_PDF: TipoAceito = {
  mimes: ["application/pdf"],
  extensoes: ["pdf"],
  rotulo: "PDF",
};

/** Planta baixa: o que `lerPlanta`/`lerPlantaVetorial` sabem abrir. */
export const ACEITA_PLANTA: TipoAceito = {
  mimes: ["application/pdf", "image/png", "image/jpeg", "image/webp"],
  extensoes: ["pdf", "dwg", "dxf", "png", "jpg", "jpeg", "webp"],
  rotulo: "PDF, DWG, DXF ou imagem",
};

export interface DocumentoEntrada {
  arquivo: File;
  /**
   * SHA-256 do conteúdo, em hexa. `null` só quando o navegador não expõe
   * `crypto.subtle` (contexto inseguro) — a entrada não se recusa a funcionar
   * por causa disso, mas aí não há como detectar reenvio.
   */
  hash: string | null;
  /** Miniatura da 1ª página, em data URL. `null` quando não é PDF. */
  previa: string | null;
  /** Páginas do PDF. `null` quando não é PDF. */
  paginas: number | null;
  /** Bytes já lidos — evita que a tela leia o arquivo do disco outra vez. */
  bytes: ArrayBuffer;
}

export interface EntradaPDFProps {
  /** Recebe o documento conferido. Se lançar, a mensagem aparece na entrada. */
  onDocumento: (doc: DocumentoEntrada) => void | Promise<void>;
  titulo?: string;
  ajuda?: string;
  aceita?: TipoAceito;
  /** Teto de tamanho, em MB. */
  maxMB?: number;
  /**
   * Hashes dos documentos que a tela já tem. Bate com o SHA-256 do arquivo
   * novo → a entrada avisa ANTES de duplicar, em vez de criar a segunda
   * proposta idêntica e deixar o consultor descobrir na lista.
   */
  hashesConhecidos?: readonly string[];
  rotuloConfirmar?: string;
  desabilitado?: boolean;
  /** Por que está desabilitado — "sem conexão", "projeto ainda não salvo". */
  motivoDesabilitado?: string;
  /** Trabalho da TELA em andamento (upload, leitura). Trava os botões. */
  ocupado?: string | null;
}

type Estado = "vazio" | "arrastando" | "lendo" | "erro" | "pronto";

interface Lido {
  arquivo: File;
  hash: string | null;
  previa: string | null;
  paginas: number | null;
  bytes: ArrayBuffer;
  duplicado: boolean;
}

// ── Leitura do arquivo ──────────────────────────────────────────────────────

/** Sinaliza "o consultor cancelou" — não é falha, não vira mensagem de erro. */
class Cancelado extends Error {}

const ehPdf = (file: File): boolean =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

const extensaoDe = (nome: string): string => (nome.split(".").pop() ?? "").toLowerCase();

/** `null` quando o arquivo serve; senão, a frase que explica a recusa. */
function recusar(file: File, aceita: TipoAceito, maxMB: number): string | null {
  const ext = extensaoDe(file.name);
  // MIME **ou** extensão: o app Arquivos do iPadOS entrega PDF com `type`
  // vazio, e recusar por isso seria recusar o caminho normal do usuário.
  const tipoOk = aceita.mimes.includes(file.type) || aceita.extensoes.includes(ext);
  if (!tipoOk) return `Este arquivo é .${ext || "?"}. Aqui entra ${aceita.rotulo}.`;
  if (file.size === 0) return "O arquivo chegou vazio (0 KB). Envie de novo.";
  if (file.size > maxMB * 1024 * 1024) {
    return `O arquivo tem ${formatarTamanho(file.size)} e o limite é ${maxMB} MB. Reduza a resolução ou divida o documento.`;
  }
  return null;
}

/**
 * Bytes do arquivo com progresso REAL (fração de bytes lidos), porque numa
 * proposta de 20 MB no iPad a leitura do disco é a espera que o consultor
 * sente. Sem `File.stream` (navegador antigo) cai no `arrayBuffer`, que não
 * reporta nada — e aí a barra fica parada em vez de mentir.
 */
async function lerBytes(
  file: File,
  aoProgredir: (fracao: number) => void,
  cancelado: () => boolean,
): Promise<ArrayBuffer> {
  if (typeof file.stream !== "function") return file.arrayBuffer();
  const leitor = file.stream().getReader();
  const pedacos: Uint8Array[] = [];
  let lidos = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    if (cancelado()) { await leitor.cancel(); throw new Cancelado(); }
    pedacos.push(value);
    lidos += value.byteLength;
    if (file.size > 0) aoProgredir(Math.min(1, lidos / file.size));
  }
  const todos = new Uint8Array(lidos);
  let off = 0;
  for (const p of pedacos) { todos.set(p, off); off += p.byteLength; }
  return todos.buffer;
}

/** SHA-256 em hexa. `null` fora de contexto seguro (http:// puro). */
async function sha256Hex(bytes: ArrayBuffer): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Primeira página do PDF como imagem — o mesmo raster que `src/lib/planta.ts`
 * faz para o fundo do editor, só que em tamanho de miniatura e devolvendo
 * também a contagem de páginas.
 *
 * Recebe os bytes já lidos: `getDocument` TRANSFERE o ArrayBuffer para o
 * worker e o deixa inutilizável, então quem chama passa uma cópia.
 */
export async function rasterizarPrimeiraPaginaPdf(
  bytes: ArrayBuffer,
  maxPx = PREVIA_PX,
): Promise<{ dataUrl: string; paginas: number }> {
  const pdfjs = await carregarPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const escala = Math.min(2, maxPx / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale: escala });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Este navegador não conseguiu abrir um canvas 2D.");
    ctx.fillStyle = PAPEL;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.8), paginas: doc.numPages };
  } finally {
    // Sem isto cada prévia deixa um documento vivo no worker do pdf.js.
    void doc.destroy();
  }
}

// ── Formatação ──────────────────────────────────────────────────────────────

export function formatarTamanho(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ── Componente ──────────────────────────────────────────────────────────────

export default function EntradaPDF({
  onDocumento,
  titulo = "Suba o documento",
  ajuda,
  aceita = ACEITA_PDF,
  maxMB = 25,
  hashesConhecidos,
  rotuloConfirmar = "Usar este documento",
  desabilitado = false,
  motivoDesabilitado,
  ocupado = null,
}: EntradaPDFProps) {
  const [estado, setEstado] = useState<Estado>("vazio");
  const [progresso, setProgresso] = useState(0);
  const [fase, setFase] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [lido, setLido] = useState<Lido | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  /** Cada leitura ganha um número. Cancelar/recomeçar incrementa, e o que
   *  estava em voo descobre que não é mais o atual em vez de sobrescrever. */
  const execRef = useRef(0);

  useEffect(() => () => { execRef.current++; }, []); // desmontou: solta o que estiver lendo

  const travado = desabilitado || !!ocupado;

  const limpar = useCallback(() => {
    execRef.current++;
    setEstado("vazio");
    setProgresso(0);
    setFase("");
    setErro(null);
    setLido(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const processar = useCallback(async (file: File) => {
    const exec = ++execRef.current;
    const vivo = () => execRef.current === exec;

    const recusa = recusar(file, aceita, maxMB);
    if (recusa) { setErro(recusa); setEstado("erro"); setLido(null); return; }

    setEstado("lendo");
    setErro(null);
    setLido(null);
    setProgresso(0);
    setFase("Lendo o arquivo…");

    try {
      // As três etapas dividem a barra na proporção em que custam: a leitura
      // do disco domina, o hash é rápido, o raster depende do PDF.
      const bytes = await lerBytes(file, (f) => { if (vivo()) setProgresso(f * 0.7); }, () => !vivo());
      if (!vivo()) return;

      setFase("Identificando o documento…");
      setProgresso(0.78);
      const hash = await sha256Hex(bytes);
      if (!vivo()) return;

      let previa: string | null = null;
      let paginas: number | null = null;
      if (ehPdf(file)) {
        setFase("Gerando a prévia…");
        setProgresso(0.88);
        try {
          // Cópia: `getDocument` transfere o buffer para o worker.
          const r = await rasterizarPrimeiraPaginaPdf(bytes.slice(0));
          previa = r.dataUrl;
          paginas = r.paginas;
        } catch {
          // PDF protegido ou corrompido só na camada de desenho: a prévia é
          // conveniência, não pode impedir o documento de entrar.
          previa = null;
        }
      }
      if (!vivo()) return;

      setProgresso(1);
      setFase("");
      setLido({
        arquivo: file,
        hash,
        previa,
        paginas,
        bytes,
        duplicado: !!hash && !!hashesConhecidos?.includes(hash),
      });
      setEstado("pronto");
    } catch (e) {
      if (!vivo() || e instanceof Cancelado) return;
      setErro(`Não consegui ler este arquivo: ${(e as Error).message || "falha desconhecida"}`);
      setEstado("erro");
    }
  }, [aceita, maxMB, hashesConhecidos]);

  async function confirmar() {
    if (!lido) return;
    try {
      await onDocumento({
        arquivo: lido.arquivo, hash: lido.hash, previa: lido.previa,
        paginas: lido.paginas, bytes: lido.bytes,
      });
      limpar();
    } catch (e) {
      setErro((e as Error).message || "Falha ao usar o documento.");
      setEstado("erro");
    }
  }

  function escolher(lista: FileList | null) {
    const file = lista?.[0];
    if (file) void processar(file);
    // Zera o input: sem isto, escolher o MESMO arquivo de novo não dispara
    // `change` e a entrada fica muda depois de um cancelamento.
    if (inputRef.current) inputRef.current.value = "";
  }

  const arrastando = estado === "arrastando";
  const corBorda = estado === "erro" ? "var(--red)"
    : arrastando ? "var(--gold)"
      : estado === "pronto" ? "var(--green)" : "var(--line-2)";

  return (
    <div className="card" style={{ padding: 14, display: "grid", gap: 12, maxWidth: 560 }}>
      <div>
        <div className="microlabel">{titulo}</div>
        {ajuda && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>{ajuda}</div>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={[...aceita.mimes, ...aceita.extensoes.map((e) => `.${e}`)].join(",")}
        style={{ display: "none" }}
        onChange={(e) => escolher(e.target.files)}
        tabIndex={-1}
        aria-hidden
      />

      {/* A zona é um <button> de verdade: Enter/Espaço, foco e leitor de tela
          vêm de graça, sem role/tabIndex/onKeyDown remendados por fora. */}
      <button
        type="button"
        disabled={travado || estado === "lendo"}
        aria-describedby={erro ? "entrada-pdf-erro" : undefined}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (travado || estado === "lendo") return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (estado !== "arrastando") setEstado("arrastando");
        }}
        onDragLeave={(e) => {
          // `dragleave` também dispara ao passar sobre os filhos; só sai do
          // estado quando o ponteiro deixa a zona inteira.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setEstado((s) => (s === "arrastando" ? "vazio" : s));
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (travado) { setEstado("vazio"); return; }
          escolher(e.dataTransfer.files);
        }}
        style={{
          display: "grid", gap: 6, placeItems: "center", textAlign: "center",
          padding: "20px 16px", minHeight: 132, width: "100%",
          background: arrastando ? "var(--gold-soft)" : "var(--panel-2)",
          border: `1px dashed ${corBorda}`, borderRadius: 12,
          color: "var(--text-3)", font: '600 13px "DM Sans"',
          cursor: travado ? "not-allowed" : "pointer",
          opacity: travado ? 0.45 : 1,
          // Só transform/opacity/cor: nada que force relayout durante o arrasto.
          transition: "border-color var(--mo-fast), background var(--mo-fast), transform var(--mo-press) var(--mo-standard)",
          transform: arrastando ? "scale(1.01)" : "none",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {estado === "pronto" && lido ? (
          <Previa lido={lido} />
        ) : estado === "lendo" ? (
          <span style={{ color: "var(--gold)" }}>{fase || "Lendo…"}</span>
        ) : (
          <>
            <span style={{ fontSize: 26, lineHeight: 1 }} aria-hidden>⭱</span>
            <span>{arrastando ? "Solte o arquivo aqui" : "Toque para escolher, ou arraste o arquivo"}</span>
            <span style={{ fontSize: 11, color: "var(--text-4)", fontWeight: 500 }}>
              {aceita.rotulo} · até {maxMB} MB
            </span>
          </>
        )}
      </button>

      {estado === "lendo" && (
        <div style={{ display: "grid", gap: 8 }}>
          {/* Barra por `scaleX`: o compositor resolve sem relayout. Animar
              `width` reflui a linha inteira a cada frame — no iPad isso rouba
              justamente os quadros da leitura do arquivo. */}
          <div
            role="progressbar"
            aria-label={fase || "Lendo o arquivo"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progresso * 100)}
            style={{ height: 4, borderRadius: 2, background: "var(--line-2)", overflow: "hidden" }}
          >
            <div style={{
              height: "100%", width: "100%", background: "var(--gold)",
              transformOrigin: "left center", transform: `scaleX(${progresso})`,
              transition: "transform var(--mo-fast) linear", willChange: "transform",
            }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{Math.round(progresso * 100)}%</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn btn--sm" onClick={limpar}>Cancelar</button>
          </div>
        </div>
      )}

      {estado === "erro" && erro && (
        <div id="entrada-pdf-erro" role="alert" style={{
          border: "1px solid var(--red)", borderRadius: 10, padding: "9px 11px",
          fontSize: 12, color: "#e9a0a0", lineHeight: 1.5,
        }}>
          {erro}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn--sm" onClick={limpar}>Tentar outro arquivo</button>
          </div>
        </div>
      )}

      {estado === "pronto" && lido && (
        <div style={{ display: "grid", gap: 9 }}>
          {lido.duplicado && (
            <div role="alert" style={{
              border: "1px solid var(--warn)", borderRadius: 10, padding: "9px 11px",
              fontSize: 12, color: "var(--warn)", lineHeight: 1.5,
            }}>
              Este documento já foi enviado antes — conteúdo idêntico, byte a byte.
              Confirmar cria uma segunda cópia.
            </div>
          )}
          {lido.hash === null && (
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45 }}>
              Sem conexão segura: não dá para conferir se este documento já subiu antes.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn btn--sm" disabled={!!ocupado} onClick={limpar}>Cancelar</button>
            <button
              type="button"
              className={lido.duplicado ? "btn btn--sm" : "btn btn-gold btn--sm"}
              disabled={travado}
              onClick={() => void confirmar()}
            >
              {ocupado || (lido.duplicado ? "Enviar assim mesmo" : rotuloConfirmar)}
            </button>
          </div>
        </div>
      )}

      {desabilitado && motivoDesabilitado && (
        <div style={{ fontSize: 11, color: "var(--muted)" }}>{motivoDesabilitado}</div>
      )}
    </div>
  );
}

/** Cara do documento pronto: a 1ª página, o nome e o que dá para conferir. */
function Previa({ lido }: { lido: Lido }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left" }}>
      {lido.previa ? (
        <img
          src={lido.previa}
          alt={`Primeira página de ${lido.arquivo.name}`}
          style={{
            width: 74, height: 96, objectFit: "cover", objectPosition: "top",
            borderRadius: 6, border: "1px solid var(--line-2)", background: PAPEL, flexShrink: 0,
          }}
        />
      ) : (
        <span style={{
          width: 74, height: 96, display: "grid", placeItems: "center", fontSize: 28,
          borderRadius: 6, border: "1px solid var(--line-2)", background: "var(--panel)", flexShrink: 0,
        }} aria-hidden>📄</span>
      )}
      <div style={{ minWidth: 0, display: "grid", gap: 3 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 700, color: "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{lido.arquivo.name}</div>
        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
          {formatarTamanho(lido.arquivo.size)}
          {lido.paginas != null && ` · ${lido.paginas} página(s)`}
        </div>
        {lido.hash && (
          // O prefixo do hash é a prova visível de "é o mesmo arquivo": dois
          // envios com o mesmo código são o mesmo documento, sem discussão.
          <div style={{ fontSize: 10, color: "var(--text-4)", fontFamily: "ui-monospace, monospace" }}>
            {lido.hash.slice(0, 12)}
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>Pronto para usar</div>
      </div>
    </div>
  );
}
