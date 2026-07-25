// Leitores de documentos de DADOS (planilha/CSV) → linhas → Equipamento.
// Para PLANTA BAIXA (geometria em escala), veja src/lib/planta.ts.
import * as XLSX from "xlsx";
import type { Equipamento, Zona } from "./types";

const ZONAS_VALIDAS: Zona[] = ["ergo", "forca", "livre", "prep"];

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function pick(o: Record<string, unknown>, aliases: string[]): unknown {
  const keys = Object.keys(o);
  for (const a of aliases) {
    const k = keys.find((k) => norm(k) === a);
    if (k != null && o[k] !== "") return o[k];
  }
  return undefined;
}

export function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && hasD) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (hasC) s = /,\d{2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  else if (hasD && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDims(text: unknown): { w?: number; h?: number } {
  const m = String(text ?? "").match(/(\d{2,3})\s*[x×]\s*(\d{2,3})/i);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : {};
}

export function mapEquipamento(o: Record<string, unknown>): Equipamento | null {
  const nome = String(pick(o, ["nome", "equipamento", "descricao", "item", "produto"]) ?? "").trim();
  if (!nome) return null;
  const dims = parseDims([pick(o, ["dimensoes", "medidas"]) ?? "", nome].join(" "));
  let zona = String(pick(o, ["zona"]) ?? "").toLowerCase() as Zona;
  if (!ZONAS_VALIDAS.includes(zona)) zona = "livre";
  return {
    nome,
    marca: (pick(o, ["marca", "fabricante"]) as string) || null,
    modelo: (pick(o, ["modelo"]) as string) || null,
    largura_cm: parseNum(pick(o, ["largura_cm", "largura", "larg"])) || dims.w || 100,
    profundidade_cm: parseNum(pick(o, ["profundidade_cm", "profundidade", "comprimento", "prof"])) || dims.h || 100,
    zona,
    preco: parseNum(pick(o, ["preco", "valor", "price"])) || 0,
  };
}

function csvParaObjetos(txt: string): Record<string, unknown>[] {
  const linhas = txt.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length < 2) return [];
  const split = (l: string): string[] => {
    const out: string[] = []; let c = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
      else if (ch === '"') q = true; else if (ch === ",") { out.push(c); c = ""; } else c += ch;
    }
    out.push(c); return out.map((s) => s.trim());
  };
  const hdr = split(linhas[0]);
  return linhas.slice(1).map((l) => {
    const cs = split(l); const o: Record<string, unknown> = {};
    hdr.forEach((h, i) => { o[h] = cs[i] ?? ""; });
    return o;
  });
}

/** Lê CSV/XLSX e devolve equipamentos normalizados. */
export async function lerEquipamentos(file: File): Promise<Equipamento[]> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  let rows: Record<string, unknown>[] = [];
  if (ext === "csv") rows = csvParaObjetos(await file.text());
  else if (ext === "xlsx" || ext === "xls") {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  } else {
    throw new Error("Use um arquivo .csv ou .xlsx (planilha).");
  }
  return rows.map(mapEquipamento).filter((r): r is Equipamento => !!r);
}
