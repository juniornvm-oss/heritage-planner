#!/usr/bin/env node
/**
 * ler.js — leitor unificado de documentos para o Heritage Planner (Fase 3).
 * Roda local. Lê PDF, CSV, planilha (.xlsx/.xls) e desenhos (.dxf/.dwg) e
 * normaliza para JSON pronto para inserir em planner.equipamentos ou
 * planner.cotacoes. Opcionalmente emite o SQL de INSERT.
 *
 * Uso:
 *   node tools/ler.js catalogo.xlsx                       # equipamentos (default)
 *   node tools/ler.js lista.csv --sql
 *   node tools/ler.js orcamento.pdf --tipo cotacoes --projeto <uuid> --sql
 *   node tools/ler.js bloco.dxf --marca Movement --zona forca
 *   node tools/ler.js bloco.dwg --marca Movement --zona forca   # requer conversor (ver README)
 *
 * Formatos:
 *   .csv / .xlsx / .xls  → tabela (cabeçalho na 1ª linha) → linhas
 *   .pdf                 → extração de texto + heurística (melhor esforço; revise)
 *   .dxf                 → bounding box (largura × profundidade) — 1 equipamento
 *   .dwg                 → convertido para DXF (dwg2dxf/ODA) e então como .dxf
 *
 * Flags: --tipo equipamentos|cotacoes  --projeto <uuid>  --marca --zona --modelo
 *        --sql  --out arquivo.json  --unit <cod DXF>
 */

"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const imp = require("./importar.js");

// ── util ─────────────────────────────────────────────────────────────────────
const norm = (s) => String(s == null ? "" : s).trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");
function pick(obj, aliases) {
  const keys = Object.keys(obj);
  for (const a of aliases) {
    const k = keys.find((k) => norm(k) === a);
    if (k != null && obj[k] !== "") return obj[k];
  }
  return undefined;
}
// Aceita 40600 · 40.600 · 40.600,00 · 40,600.00 · "R$ 8.200,00"
function parseNum(v) {
  if (v == null || v === "") return null;
  let s = String(v).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && hasD) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasC) {
    s = /,\d{2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasD && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // separador de milhar: 23.200 → 23200
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function parseDims(text) {
  const m = String(text).match(/(\d{2,3})\s*[x×]\s*(\d{2,3})/i);
  return m ? { largura_cm: Number(m[1]), profundidade_cm: Number(m[2]) } : {};
}

// ── leitores por formato → array de objetos (chaveados pelo cabeçalho) ───────
function lerCsv(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const linhas = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (linhas.length < 2) return [];
  const header = imp.splitCsvLine(linhas[0]);
  return linhas.slice(1).map((l) => {
    const c = imp.splitCsvLine(l);
    const o = {};
    header.forEach((h, i) => { o[h] = c[i] != null ? c[i] : ""; });
    return o;
  });
}
function lerXlsx(file) {
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}
async function lerPdfTexto(file) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: fs.readFileSync(file) });
  const res = await parser.getText();
  await parser.destroy && parser.destroy();
  return res.text || "";
}
// Heurística: cada linha com um valor monetário no fim vira uma linha de dados.
function pdfTextoParaLinhas(texto) {
  const linhas = [];
  for (const raw of texto.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    const mMoney = l.match(/(?:R\$\s*)?(\d[\d.,]*\d)\s*$/);
    if (!mMoney) continue;
    const valor = parseNum(mMoney[1]);
    if (valor == null || valor < 1) continue;
    const nome = l.slice(0, l.length - mMoney[0].length).replace(/[.\s]+$/, "").trim();
    if (!nome) continue;
    linhas.push({ nome, valor, ...parseDims(l) });
  }
  return linhas;
}
function converterDwg(file) {
  const dxfOut = path.join(path.dirname(file), path.basename(file, path.extname(file)) + ".dxf");
  const temDwg2dxf = spawnSync("sh", ["-c", "command -v dwg2dxf"]).status === 0;
  if (temDwg2dxf) {
    const r = spawnSync("dwg2dxf", [file], { encoding: "utf8" });
    if (r.status === 0 && fs.existsSync(dxfOut)) return dxfOut;
  }
  const temOda = spawnSync("sh", ["-c", "command -v ODAFileConverter"]).status === 0;
  if (temOda) {
    spawnSync("ODAFileConverter", [path.dirname(file), path.dirname(file), "ACAD2018", "DXF", "0", "1", path.basename(file)]);
    if (fs.existsSync(dxfOut)) return dxfOut;
  }
  console.error("Erro: nenhum conversor de DWG encontrado.\n" +
    "  Instale o LibreDWG (dwg2dxf) ou o ODA File Converter, OU converta o .dwg\n" +
    "  para .dxf no seu CAD e rode: node tools/ler.js arquivo.dxf");
  process.exit(1);
}

// ── mapeamento para as tabelas ───────────────────────────────────────────────
function mapEquipamento(o, opts) {
  const dims = parseDims([pick(o, ["dimensoes", "dimensao", "medidas"]) || "", pick(o, ["nome", "equipamento", "descricao"]) || ""].join(" "));
  return imp.normalizeRow({
    nome: pick(o, ["nome", "equipamento", "descricao", "item", "produto"]),
    marca: pick(o, ["marca", "fabricante"]) || opts.marca,
    modelo: pick(o, ["modelo"]) || opts.modelo,
    largura_cm: pick(o, ["largura_cm", "largura", "larg"]) || dims.largura_cm,
    profundidade_cm: pick(o, ["profundidade_cm", "profundidade", "comprimento", "prof"]) || dims.profundidade_cm,
    zona: pick(o, ["zona"]) || opts.zona,
    preco: parseNum(pick(o, ["preco", "valor", "preco_unitario", "price"])),
    fonte_arquivo: opts._fonte,
  });
}
function mapCotacao(o, opts) {
  return {
    projeto_id: opts.projeto && /^[0-9a-f-]{36}$/i.test(opts.projeto) ? opts.projeto : null,
    categoria: pick(o, ["categoria", "zona"]) || null,
    equipamento: (pick(o, ["equipamento", "nome", "item", "descricao"]) || "").toString().trim() || null,
    fornecedor: (pick(o, ["fornecedor", "fabricante"]) || opts.marca || "").toString().trim() || null,
    marca: pick(o, ["marca"]) || opts.marca || null,
    modelo: pick(o, ["modelo"]) || null,
    valor: parseNum(pick(o, ["valor", "preco", "preco_unitario", "price"])),
    garantia: pick(o, ["garantia"]) || null,
    assistencia: pick(o, ["assistencia", "suporte"]) || null,
    prazo: pick(o, ["prazo", "entrega", "prazo_entrega"]) || null,
    fonte_arquivo: opts._fonte,
  };
}

// ── SQL de cotações (equipamentos usa importar.toInsertSql) ──────────────────
function cotacoesSql(rows) {
  const cols = ["projeto_id", "categoria", "equipamento", "fornecedor_id", "marca", "modelo", "valor", "garantia", "assistencia", "prazo"];
  const lit = imp.sqlLiteral;
  const values = rows.map((r) => {
    const fornId = r.fornecedor
      ? `(select id from planner.fornecedores where nome = ${lit(r.fornecedor)} limit 1)`
      : "null";
    return "  (" + [lit(r.projeto_id), lit(r.categoria), lit(r.equipamento), fornId,
      lit(r.marca), lit(r.modelo), lit(r.valor), lit(r.garantia), lit(r.assistencia), lit(r.prazo)].join(", ") + ")";
  }).join(",\n");
  return `insert into planner.cotacoes (${cols.join(", ")})\nvalues\n${values};`;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const opts = imp.parseArgs(process.argv.slice(2));
  const file = opts._[0];
  if (!file) { console.error("Uso: node tools/ler.js <arquivo> [--tipo equipamentos|cotacoes] [--sql]"); process.exit(1); }
  if (!fs.existsSync(file)) { console.error("Arquivo não encontrado: " + file); process.exit(1); }
  const tipo = opts.tipo === "cotacoes" ? "cotacoes" : "equipamentos";
  opts._fonte = path.basename(file);
  let ext = path.extname(file).toLowerCase();

  // DWG → converte para DXF e segue como geometria
  let alvo = file;
  if (ext === ".dwg") { alvo = converterDwg(file); ext = ".dxf"; }

  let result;
  if (ext === ".dxf") {
    if (tipo === "cotacoes") { console.error("DXF/DWG geram equipamentos (geometria), não cotações."); process.exit(1); }
    result = imp.importDxf(alvo, opts); // 1 equipamento com bounding box
  } else {
    let linhas;
    if (ext === ".csv") linhas = lerCsv(file);
    else if (ext === ".xlsx" || ext === ".xls") linhas = lerXlsx(file);
    else if (ext === ".pdf") linhas = pdfTextoParaLinhas(await lerPdfTexto(file));
    else { console.error(`Extensão não suportada (${ext}). Use .pdf .csv .xlsx .dxf .dwg`); process.exit(1); }

    linhas = linhas.filter((o) => o && Object.keys(o).length);
    result = linhas.map((o) => tipo === "cotacoes" ? mapCotacao(o, opts) : mapEquipamento(o, opts))
      .filter((r) => (r.nome || r.equipamento));
    if (!result.length) { console.error("Nenhuma linha reconhecida no arquivo. Verifique o cabeçalho/colunas."); process.exit(1); }
  }

  const json = JSON.stringify(result, null, 2);
  if (opts.out) { fs.writeFileSync(opts.out, json + "\n"); console.error(`JSON gravado em ${opts.out}`); }
  else console.log(json);

  if (opts.sql) {
    const rows = Array.isArray(result) ? result : [result];
    if (tipo === "cotacoes") console.log("\n-- SQL para planner.cotacoes:\n" + cotacoesSql(rows));
    else console.log("\n-- SQL para planner.equipamentos:\n" + imp.toInsertSql(rows));
  }
}

main().catch((e) => { console.error("Erro: " + e.message); process.exit(1); });
