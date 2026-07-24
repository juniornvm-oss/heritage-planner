#!/usr/bin/env node
/**
 * relatorio.js — gera o Relatório Executivo de assessoria (HTML → PDF) a partir
 * de um projeto exportado do Heritage Planner. Roda local, zero dependências.
 *
 * Cobre os entregáveis: 01 (Diagnóstico), 03 (Lista Técnica), 06 (Cenários de
 * Investimento), 08 (Relatório Executivo) e 09 (Infraestrutura).
 *
 * Uso:
 *   node tools/relatorio.js exemplo-projeto.json
 *   node tools/relatorio.js projeto.json --out relatorio.html
 *   # depois abra o HTML no navegador e use Imprimir → Salvar como PDF.
 *
 * Formato de entrada (JSON):
 *   {
 *     "projeto": { "nome","sindico","contato","orcamento_teto",
 *                  "perfil": {...}, "infraestrutura": {...}, "observacoes" },
 *     "sala":    { "nome","largura_cm","profundidade_cm" },
 *     "itens":   [ { "nome","marca","modelo","zona","preco","cenario",
 *                    "impacto","valor_percebido","necessidade" } ]
 *   }
 */

"use strict";
const fs = require("fs");
const path = require("path");

const TAXA_ASSESSORIA = 0.005;
const ZONAS = { ergo: "Ergometria", forca: "Força guiada", livre: "Peso livre", prep: "Preparação" };
const CENARIOS = { essencial: { label: "Essencial", ordem: 1 }, balanceado: { label: "Balanceado", ordem: 2 }, premium: { label: "Premium", ordem: 3 } };
const cenarioDe = (it) => (it && CENARIOS[it.cenario]) ? it.cenario : "balanceado";
const BRL = (n) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const k = a.slice(2); const n = argv[i + 1]; if (n && !n.startsWith("--")) { o[k] = n; i++; } else o[k] = true; }
    else o._.push(a);
  }
  return o;
}

function tabelaPorZona(itens) {
  const grupos = {};
  itens.forEach((it) => { const z = it.zona || "outros"; (grupos[z] = grupos[z] || []).push(it); });
  let html = "";
  Object.keys(grupos).forEach((z) => {
    const nome = ZONAS[z] || z;
    const linhas = grupos[z].map((it) => `
      <tr>
        <td>${esc(it.nome)}</td>
        <td>${esc(it.marca)}</td>
        <td>${esc(it.modelo)}</td>
        <td>${CENARIOS[cenarioDe(it)].label}</td>
        <td class="num">${BRL(it.preco)}</td>
      </tr>`).join("");
    const sub = grupos[z].reduce((s, it) => s + (Number(it.preco) || 0), 0);
    html += `
      <tr class="zona"><td colspan="5">${esc(nome)}</td></tr>
      ${linhas}
      <tr class="sub"><td colspan="4">Subtotal ${esc(nome)}</td><td class="num">${BRL(sub)}</td></tr>`;
  });
  return html;
}

function totalCenario(itens, tier) {
  return itens.reduce((s, it) => CENARIOS[cenarioDe(it)].ordem <= CENARIOS[tier].ordem ? s + (Number(it.preco) || 0) : s, 0);
}

function matriz(itens) {
  const comMatriz = itens.filter((it) => it.impacto || it.valor_percebido || it.necessidade);
  if (!comMatriz.length) return "";
  const linhas = comMatriz
    .map((it) => ({ ...it, prio: (Number(it.impacto) || 0) + (Number(it.valor_percebido) || 0) + (Number(it.necessidade) || 0) }))
    .sort((a, b) => b.prio - a.prio)
    .map((it) => `<tr><td>${esc(it.nome)}</td><td class="num">${it.impacto || "-"}</td><td class="num">${it.valor_percebido || "-"}</td><td class="num">${it.necessidade || "-"}</td><td class="num"><b>${it.prio}</b></td></tr>`)
    .join("");
  return `
    <h2>05 · Matriz de Priorização</h2>
    <p class="hint">Classificação por impacto funcional × valor percebido × necessidade (1–5). Maior soma = maior prioridade — orienta o que preservar se o orçamento apertar.</p>
    <table><thead><tr><th>Equipamento</th><th class="num">Impacto</th><th class="num">Valor</th><th class="num">Necessidade</th><th class="num">Prioridade</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

function kvList(obj) {
  if (!obj || typeof obj !== "object") return "<p class='hint'>Não informado.</p>";
  const rows = Object.entries(obj).filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `<li><b>${esc(k.replace(/_/g, " "))}:</b> ${esc(typeof v === "object" ? JSON.stringify(v) : v)}</li>`).join("");
  return rows ? `<ul>${rows}</ul>` : "<p class='hint'>Não informado.</p>";
}

function render(data) {
  const p = data.projeto || {};
  const sala = data.sala || {};
  const itens = data.itens || [];
  const teto = Number(p.orcamento_teto) || 0;
  const assessoria = Math.round(teto * TAXA_ASSESSORIA);
  const cen = { essencial: totalCenario(itens, "essencial"), balanceado: totalCenario(itens, "balanceado"), premium: totalCenario(itens, "premium") };
  const dataStr = new Date().toLocaleDateString("pt-BR");
  const cenCard = (tier) => {
    const total = cen[tier]; const saldo = teto ? teto - total : null;
    return `<div class="card">
      <div class="card-h">${CENARIOS[tier].label}</div>
      <div class="card-v">${BRL(total)}</div>
      ${teto ? `<div class="card-s ${saldo >= 0 ? "ok" : "over"}">Saldo ${BRL(saldo)}</div>` : ""}
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — ${esc(p.nome)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1A1A1A; max-width: 900px; margin: 0 auto; padding: 40px; }
  h1 { font-size: 26px; margin: 0; letter-spacing: .02em; }
  h2 { font-size: 16px; border-bottom: 2px solid #C9A227; padding-bottom: 5px; margin: 34px 0 12px; letter-spacing: .04em; text-transform: uppercase; }
  .brand { color: #8A7212; font-weight: 700; font-size: 12px; letter-spacing: .18em; text-transform: uppercase; }
  .meta { color: #666; font-size: 13px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #E5E5E5; }
  th { background: #FAF6E9; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  td.num, th.num { text-align: right; }
  tr.zona td { background: #1A1A1A; color: #C9A227; font-weight: 700; font-size: 12px; letter-spacing: .05em; }
  tr.sub td { font-weight: 700; background: #FAFAFA; }
  .cards { display: flex; gap: 14px; margin-top: 10px; }
  .card { flex: 1; border: 1px solid #E0E0E0; border-radius: 8px; padding: 14px; }
  .card-h { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #666; }
  .card-v { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .card-s { font-size: 12px; margin-top: 4px; }
  .ok { color: #2E7D32; } .over { color: #C62828; }
  .fin { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; }
  .fin div { border: 1px solid #E0E0E0; border-radius: 8px; padding: 12px 16px; }
  .fin b { display: block; font-size: 20px; }
  .hint { color: #888; font-size: 12px; }
  ul { margin: 6px 0; padding-left: 20px; font-size: 13px; }
  @media print { body { padding: 0; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
</style></head><body>
  <div class="brand">Assessoria Técnica · Implantação de Academia</div>
  <h1>${esc(p.nome || "Condomínio")}</h1>
  <div class="meta">
    ${p.sindico ? "Síndico: " + esc(p.sindico) + " · " : ""}${p.contato ? esc(p.contato) + " · " : ""}${dataStr}
    ${sala.nome ? " · Sala: " + esc(sala.nome) + (sala.largura_cm ? ` (${sala.largura_cm}×${sala.profundidade_cm} cm)` : "") : ""}
  </div>

  <h2>01 · Diagnóstico — Perfil de Uso</h2>
  ${kvList(p.perfil)}

  <h2>09 · Análise de Infraestrutura</h2>
  ${kvList(p.infraestrutura)}
  ${p.observacoes ? `<p><b>Observações:</b> ${esc(p.observacoes)}</p>` : ""}

  <h2>03 · Lista Técnica de Equipamentos</h2>
  <table><thead><tr><th>Equipamento</th><th>Marca</th><th>Modelo</th><th>Cenário</th><th class="num">Valor</th></tr></thead>
  <tbody>${tabelaPorZona(itens)}
    <tr class="sub"><td colspan="4">Investimento total (Premium)</td><td class="num">${BRL(cen.premium)}</td></tr>
  </tbody></table>

  <h2>06 · Cenários de Investimento</h2>
  <p class="hint">Essencial ⊆ Balanceado ⊆ Premium. Cada cenário é cumulativo — do indispensável ao completo.</p>
  <div class="cards">${cenCard("essencial")}${cenCard("balanceado")}${cenCard("premium")}</div>

  ${matriz(itens)}

  <h2>08 · Resumo Financeiro</h2>
  <div class="fin">
    ${teto ? `<div>Orçamento-teto<b>${BRL(teto)}</b></div>` : ""}
    <div>Investimento Balanceado<b>${BRL(cen.balanceado)}</b></div>
    ${teto ? `<div>Assessoria (0,5%)<b>${BRL(assessoria)}</b></div>` : ""}
    <div>Equipamentos<b>${itens.length}</b></div>
  </div>

  <p class="hint" style="margin-top:40px">A academia mais funcional e bonita que o orçamento pode comprar. Capacidade técnica a serviço do melhor investimento.</p>
</body></html>`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const file = opts._[0];
  if (!file) { console.error("Uso: node tools/relatorio.js projeto.json [--out relatorio.html]"); process.exit(1); }
  if (!fs.existsSync(file)) { console.error("Arquivo não encontrado: " + file); process.exit(1); }
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error("JSON inválido: " + e.message); process.exit(1); }
  const html = render(data);
  const out = opts.out || path.join(path.dirname(file), "relatorio.html");
  fs.writeFileSync(out, html);
  console.error(`Relatório gerado: ${out}  (abra no navegador → Imprimir → PDF)`);
}

main();
