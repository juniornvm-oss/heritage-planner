#!/usr/bin/env node
/**
 * importar.js — pipeline local de cadastro de equipamentos para o Heritage Planner.
 *
 * Roda na sua máquina (não no app). Gera JSON pronto para inserir em
 * planner.equipamentos (Supabase) a partir de:
 *
 *   1) um bloco .dxf de equipamento — calcula o bounding box (largura ×
 *      profundidade em cm) e produz {nome, marca, largura_cm, profundidade_cm, ...};
 *   2) um .csv em lote (nome,marca,largura,profundidade,zona,preco) — para
 *      cadastro sem DXF.
 *
 * Uso:
 *   node tools/importar.js bloco.dxf --marca Movement --zona forca
 *   node tools/importar.js bloco.dxf --nome "Leg Press" --marca Movement --zona forca --preco 40600
 *   node tools/importar.js equipamentos.csv
 *   node tools/importar.js bloco.dxf --marca Movement --zona forca --sql   # imprime também o INSERT
 *
 * Flags:
 *   --marca <txt>     marca do equipamento
 *   --modelo <txt>    modelo
 *   --nome <txt>      nome (default: nome do bloco DXF ou nome do arquivo)
 *   --zona <z>        ergo | forca | livre | prep
 *   --preco <n>       preço (numérico)
 *   --unit <code>     força a unidade do DXF ($INSUNITS): 1=pol 4=mm 5=cm 6=m (default: header ou mm)
 *   --sql             além do JSON, imprime uma instrução SQL INSERT
 *   --out <arquivo>   grava a saída JSON em arquivo em vez de stdout
 *
 * Dependência: dxf-parser  (npm i)  — só é necessária para entrada .dxf.
 */

"use strict";
const fs = require("fs");
const path = require("path");

const ZONAS_VALIDAS = ["ergo", "forca", "livre", "prep"];

// ── CLI parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (key === "sql") opts.sql = true;
      else if (next !== undefined && !next.startsWith("--")) {
        opts[key] = next;
        i++;
      } else opts[key] = true;
    } else opts._.push(a);
  }
  return opts;
}

// ── Bounding box a partir das entidades DXF ─────────────────────────────────
// Espelha o acumulador min/max do dxf-viewer (_UpdateBounds), sem tesselar
// curvas: círculos/arcos são expandidos por center ± radius / amostragem.
function computeBounds(parsed) {
  let b = null;
  const hit = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!b) b = { minX: x, maxX: x, minY: y, maxY: y };
    else {
      if (x < b.minX) b.minX = x; else if (x > b.maxX) b.maxX = x;
      if (y < b.minY) b.minY = y; else if (y > b.maxY) b.maxY = y;
    }
  };

  const accEntities = (entities, tf) => {
    for (const e of entities || []) {
      switch (e.type) {
        case "LINE":
        case "LWPOLYLINE":
        case "POLYLINE":
          for (const v of e.vertices || []) tf(v.x, v.y);
          break;
        case "POINT":
          if (e.position) tf(e.position.x, e.position.y);
          break;
        case "CIRCLE":
          if (e.center) {
            tf(e.center.x - e.radius, e.center.y - e.radius);
            tf(e.center.x + e.radius, e.center.y + e.radius);
          }
          break;
        case "ARC":
          if (e.center) {
            let a0 = e.startAngle, a1 = e.endAngle;
            if (a1 < a0) a1 += 2 * Math.PI;
            const N = 24;
            for (let i = 0; i <= N; i++) {
              const a = a0 + ((a1 - a0) * i) / N;
              tf(e.center.x + e.radius * Math.cos(a), e.center.y + e.radius * Math.sin(a));
            }
          }
          break;
        case "ELLIPSE":
          if (e.center) {
            const rx = Math.hypot(e.majorAxisEndPoint?.x || 0, e.majorAxisEndPoint?.y || 0);
            const ry = rx * (e.axisRatio || 1);
            tf(e.center.x - rx, e.center.y - ry);
            tf(e.center.x + rx, e.center.y + ry);
          }
          break;
        case "INSERT": {
          // Resolve o bloco referenciado e transforma seus pontos.
          const block = parsed.blocks && parsed.blocks[e.name];
          if (!block || !block.entities) break;
          const pos = e.position || { x: 0, y: 0 };
          const xs = e.xScale || 1, ys = e.yScale || 1;
          const rot = -((e.rotation || 0) * Math.PI) / 180; // graus → rad, negado (dxf-viewer)
          const s = Math.sin(rot), c = Math.cos(rot);
          const insertTf = (bx, by) => {
            const x = pos.x + bx * xs * c - by * ys * s;
            const y = pos.y + bx * xs * s + by * ys * c;
            tf(x, y);
          };
          accEntities(block.entities, insertTf);
          break;
        }
        default:
          break;
      }
    }
  };

  accEntities(parsed.entities, hit);
  return b;
}

// $INSUNITS → fator para cm.  1=pol 4=mm 5=cm 6=m 0=sem unidade (assume mm).
function unitToCm(code) {
  const map = { 1: 2.54, 4: 0.1, 5: 1, 6: 100, 0: 0.1 };
  return map[code] != null ? map[code] : 0.1;
}

function importDxf(file, opts) {
  let DxfParser;
  try {
    DxfParser = require("dxf-parser");
  } catch (_) {
    console.error("Erro: dependência 'dxf-parser' não instalada. Rode:  cd tools && npm install");
    process.exit(1);
  }
  const text = fs.readFileSync(file, "utf8");
  const parser = new DxfParser();
  const parsed = parser.parseSync(text);

  const b = computeBounds(parsed);
  if (!b) {
    console.error(`Erro: nenhuma geometria encontrada em ${file}.`);
    process.exit(1);
  }

  const unit = opts.unit != null ? Number(opts.unit)
    : (parsed.header && parsed.header["$INSUNITS"] != null ? parsed.header["$INSUNITS"] : 4);
  const k = unitToCm(unit);
  const largura_cm = Math.round((b.maxX - b.minX) * k);
  const profundidade_cm = Math.round((b.maxY - b.minY) * k);

  // nome: --nome > primeiro bloco não-anônimo > nome do arquivo
  let nome = opts.nome;
  if (!nome && parsed.blocks) {
    const blockName = Object.keys(parsed.blocks).find((n) => n && !n.startsWith("*"));
    if (blockName) nome = blockName;
  }
  if (!nome) nome = path.basename(file, path.extname(file));

  return normalizeRow({
    nome,
    marca: opts.marca,
    modelo: opts.modelo,
    largura_cm,
    profundidade_cm,
    zona: opts.zona,
    preco: opts.preco,
    fonte_arquivo: path.basename(file),
  });
}

// ── CSV em lote ─────────────────────────────────────────────────────────────
// Cabeçalho esperado: nome,marca,largura,profundidade,zona,preco
function splitCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function importCsv(file, opts) {
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    console.error("Erro: CSV vazio ou sem linhas de dados.");
    process.exit(1);
  }
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name) => header.indexOf(name);
  const iNome = idx("nome"), iMarca = idx("marca"), iLarg = idx("largura"),
    iProf = idx("profundidade"), iZona = idx("zona"), iPreco = idx("preco");
  if (iNome < 0 || iLarg < 0 || iProf < 0) {
    console.error("Erro: CSV precisa ter ao menos as colunas: nome,largura,profundidade");
    process.exit(1);
  }
  const rows = [];
  for (let l = 1; l < lines.length; l++) {
    const c = splitCsvLine(lines[l]);
    rows.push(normalizeRow({
      nome: c[iNome],
      marca: iMarca >= 0 ? c[iMarca] : opts.marca,
      largura_cm: c[iLarg],
      profundidade_cm: c[iProf],
      zona: iZona >= 0 ? c[iZona] : opts.zona,
      preco: iPreco >= 0 ? c[iPreco] : opts.preco,
      fonte_arquivo: path.basename(file),
    }));
  }
  return rows;
}

// ── Normalização / validação de uma linha ───────────────────────────────────
function normalizeRow(r) {
  const row = {
    nome: (r.nome || "").toString().trim(),
    marca: r.marca != null && r.marca !== "" ? r.marca.toString().trim() : null,
    modelo: r.modelo != null && r.modelo !== "" ? r.modelo.toString().trim() : null,
    largura_cm: r.largura_cm != null && r.largura_cm !== "" ? Math.round(Number(r.largura_cm)) : null,
    profundidade_cm: r.profundidade_cm != null && r.profundidade_cm !== "" ? Math.round(Number(r.profundidade_cm)) : null,
    zona: r.zona != null && r.zona !== "" ? r.zona.toString().trim() : null,
    preco: r.preco != null && r.preco !== "" ? Number(r.preco) : 0,
    fonte_arquivo: r.fonte_arquivo || null,
  };
  if (row.zona && !ZONAS_VALIDAS.includes(row.zona)) {
    console.error(`Aviso: zona "${row.zona}" inválida (use ${ZONAS_VALIDAS.join("/")}). Mantida como null.`);
    row.zona = null;
  }
  return row;
}

// ── SQL opcional ────────────────────────────────────────────────────────────
function sqlLiteral(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function toInsertSql(rows) {
  const cols = ["nome", "marca", "modelo", "largura_cm", "profundidade_cm", "zona", "preco", "fonte_arquivo"];
  const values = rows.map((r) => "  (" + cols.map((c) => sqlLiteral(r[c])).join(", ") + ")").join(",\n");
  return `insert into planner.equipamentos (${cols.join(", ")})\nvalues\n${values};`;
}

// ── main ────────────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const file = opts._[0];
  if (!file) {
    console.error("Uso: node tools/importar.js <arquivo.dxf|arquivo.csv> [--marca M --zona forca ...]");
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`Erro: arquivo não encontrado: ${file}`);
    process.exit(1);
  }

  const ext = path.extname(file).toLowerCase();
  let result;
  if (ext === ".dxf") result = importDxf(file, opts);
  else if (ext === ".csv") result = importCsv(file, opts);
  else {
    console.error(`Erro: extensão não suportada (${ext}). Use .dxf ou .csv.`);
    process.exit(1);
  }

  const json = JSON.stringify(result, null, 2);
  if (opts.out) {
    fs.writeFileSync(opts.out, json + "\n");
    console.error(`JSON gravado em ${opts.out}`);
  } else {
    console.log(json);
  }
  if (opts.sql) {
    const rows = Array.isArray(result) ? result : [result];
    console.log("\n-- SQL para planner.equipamentos:\n" + toInsertSql(rows));
  }
}

main();
