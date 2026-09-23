// Testes do traço livre da prancheta de cadastro. O que sai daqui vira o
// footprint na planta — um polígono torto ou um ponto perdido aparece como
// máquina deformada no Dossiê. `npm test`.
import { describe, it, expect } from "vitest";
import {
  caixaPrancheta, clamp01, distPontoSegmento, fecharSeProximo, filtrarEspacamento,
  finalizarTraco, marcasGrade, passoGradeCm, passoMaiorCm, pontoNormalizado,
  simplificarRdp, snapNorm,
} from "./tracoLivre";

describe("clamp e ponto normalizado", () => {
  it("prende o traço dentro da caixa 0..1", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(1.4)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });

  it("converte o ponteiro em 0..1 e não deixa sair da prancheta", () => {
    const r = { left: 100, top: 50, width: 200, height: 100 };
    expect(pontoNormalizado(100, 50, r)).toEqual([0, 0]);
    expect(pontoNormalizado(200, 100, r)).toEqual([0.5, 0.5]);
    expect(pontoNormalizado(300, 150, r)).toEqual([1, 1]);
    expect(pontoNormalizado(20, 10, r)).toEqual([0, 0]);
    expect(pontoNormalizado(900, 900, r)).toEqual([1, 1]);
  });

  it("retângulo sem tamanho não explode", () => {
    expect(pontoNormalizado(10, 10, { left: 0, top: 0, width: 0, height: 10 })).toEqual([0, 0]);
  });
});

describe("grade em cm", () => {
  it("peças de academia usam grade de 5 cm", () => {
    expect(passoGradeCm(100, 80)).toBe(5);
    expect(passoGradeCm(200, 90)).toBe(5);
  });

  it("peças enormes abrem o passo para a grade não virar um emaranhado", () => {
    expect(passoGradeCm(300, 200)).toBe(10);
    expect(passoGradeCm(500, 400)).toBe(20);
  });

  it("marcas vão de 0 até o tamanho, inclusive", () => {
    expect(marcasGrade(100, 25)).toEqual([0, 25, 50, 75, 100]);
    expect(marcasGrade(12, 5)).toEqual([0, 5, 10, 12]);
  });

  it("linha grossa cai em 50 cm quando a peça cabe", () => {
    expect(passoMaiorCm(5, 150)).toBe(50);
    expect(passoMaiorCm(5, 60)).toBe(10);
  });

  it("snap encaixa no cruzamento da grade sem sair da caixa", () => {
    expect(snapNorm(0.23, 100, 5)).toBe(0.25);
    expect(snapNorm(0, 100, 5)).toBe(0);
    expect(snapNorm(1, 100, 5)).toBe(1);
    expect(snapNorm(1.4, 100, 5)).toBe(1);
  });
});

describe("simplificação do traço", () => {
  it("descarta pontos colados e guarda as pontas", () => {
    expect(filtrarEspacamento([0, 0, 0.001, 0, 1, 1], 0.01)).toEqual([0, 0, 1, 1]);
  });

  it("RDP reduz uma reta amostrada a duas pontas", () => {
    const pts: number[] = [];
    for (let i = 0; i <= 10; i++) pts.push(i / 10, i / 10);
    expect(simplificarRdp(pts, 0.001)).toEqual([0, 0, 1, 1]);
  });

  it("RDP conserva a quina de um L", () => {
    const pts = [0, 0, 0.5, 0, 1, 0, 1, 0.5, 1, 1];
    expect(simplificarRdp(pts, 0.01)).toEqual([0, 0, 1, 0, 1, 1]);
  });

  it("distância ao segmento cai em zero em cima da reta", () => {
    expect(distPontoSegmento(0.5, 0, 0, 0, 1, 0)).toBeCloseTo(0, 8);
    expect(distPontoSegmento(0.5, 1, 0, 0, 1, 0)).toBeCloseTo(1, 8);
  });

  it("fecha a silhueta quando a ponta volta para a origem", () => {
    expect(fecharSeProximo([0, 0, 1, 0, 1, 1, 0.01, 0.01])).toEqual([0, 0, 1, 0, 1, 1, 0.01, 0.01, 0, 0]);
    expect(fecharSeProximo([0, 0, 1, 0, 1, 1])).toEqual([0, 0, 1, 0, 1, 1]);
  });

  it("uma linha de dois pontos passa direto", () => {
    expect(finalizarTraco([0, 0, 1, 1])).toEqual([0, 0, 1, 1]);
  });

  it("gesto curto demais não vira contorno", () => {
    expect(finalizarTraco([0.2, 0.2])).toBeNull();
    expect(finalizarTraco([0.2, 0.2, 0.201, 0.201])).toBeNull();
  });

  it("um retângulo desenhado à mão vira quatro cantos e fecha", () => {
    const pts = [
      0.1, 0.1, 0.3, 0.1, 0.5, 0.1, 0.8, 0.1,
      0.8, 0.3, 0.8, 0.6, 0.8, 0.8,
      0.5, 0.8, 0.2, 0.8, 0.1, 0.8,
      0.1, 0.5, 0.1, 0.2, 0.11, 0.11,
    ];
    const t = finalizarTraco(pts, 0.02)!;
    expect(t.length).toBeGreaterThanOrEqual(8);
    expect(t[0]).toBeCloseTo(t[t.length - 2], 3);
    expect(t[1]).toBeCloseTo(t[t.length - 1], 3);
  });
});

describe("caixa da prancheta", () => {
  it("respeita o aspecto L×P e o teto de tela", () => {
    const quad = caixaPrancheta(100, 100, 400, 300);
    expect(quad).toEqual({ w: 300, h: 300 });
    const fundo = caixaPrancheta(200, 80, 400, 300);
    expect(fundo.w).toBe(400);
    expect(fundo.h).toBe(160);
    const fundoAlto = caixaPrancheta(80, 200, 400, 300);
    expect(fundoAlto.h).toBe(300);
    expect(fundoAlto.w).toBe(120);
  });
});
