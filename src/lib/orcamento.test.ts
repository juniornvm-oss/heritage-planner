import { describe, it, expect } from "vitest";
import { interpretarOrcamento, somaLinhas } from "./orcamentoPdf";

// Layout de orçamento de ACESSÓRIOS (muitos itens, quantidades altas).
const C = `FITNESS ACESSORIOS EIRELI
CNPJ 11.222.333/0001-44
Orçamento nº A-2026/118

QTD  ITEM                                        UNITÁRIO     TOTAL
8    Anilha olímpica emborrachada 20 kg          R$ 740,00    R$ 5.920,00
10   Colchonete emborrachado D80                 R$ 190,00    R$ 1.900,00
3    Barra olímpica cromada 2,20 m               R$ 950,00    R$ 2.850,00
1    Kit puxador anatômico 8 pçs                 R$ 4.990,00  R$ 4.990,00

Total: R$ 15.660,00
Prazo de entrega: 20 dias`;

const A = `MOVIMENT EQUIPAMENTOS ESPORTIVOS LTDA
CNPJ: 12.345.678/0001-90
Rua das Indústrias, 1200 - Londrina/PR
Fone: (43) 3333-4444  contato@moviment.com.br

ORÇAMENTO Nº 2026-4471
Data: 15/07/2026
Cliente: Condomínio Maison Heritage

ITEM  DESCRIÇÃO                                   QTD   VL UNIT      TOTAL
01    Leg Press 45° Next - Mod. LP450              1    R$ 40.600,00  R$ 40.600,00
02    Cadeira Extensora Dual - Mod. DX22           1    R$ 23.200,00  R$ 23.200,00
03    Esteira Ergométrica RT250                    4    R$ 14.800,00  R$ 59.200,00
04    Banco Regulável 0-90°                        2    R$ 4.600,00   R$ 9.200,00

TOTAL GERAL                                                          R$ 132.200,00

Condições de pagamento: 30/60/90 dias
Prazo de entrega: 45 dias úteis após confirmação
Garantia: 12 meses contra defeitos de fabricação
Validade da proposta: 15 dias
Frete: CIF - incluso`;

const B = `NAUTILUS DO BRASIL S/A
CNPJ 98.765.432/0001-10

Proposta Comercial 8890

Leg Press 45 Graus                     42.900,00
Cadeira Extensora Instinct             21.900,00
Esteira 8Gx (4 un)                     72.000,00

Total .................. 136.800,00
Pagamento: à vista com 5% de desconto
Entrega: 60 dias
Garantia: 24 meses`;

describe("leitor de orçamento em PDF", () => {
  it("lê o cabeçalho de uma proposta com colunas", () => {
    const o = interpretarOrcamento(A);
    expect(o.fornecedor).toContain("MOVIMENT");
    expect(o.cnpj).toBe("12.345.678/0001-90");
    expect(o.documento).toBe("2026-4471");
    expect(o.validade).toContain("15 dias");
    expect(o.prazo_entrega).toContain("45 dias");
    expect(o.garantia).toContain("12 meses");
    expect(o.pagamento).toContain("30/60/90");
    expect(o.total).toBe(132200);
  });

  it("lê as linhas com quantidade, unitário e total", () => {
    const o = interpretarOrcamento(A);
    expect(o.linhas.length).toBe(4);
    const esteira = o.linhas.find((l) => /Esteira/i.test(l.descricao))!;
    expect(esteira.qtd).toBe(4);
    expect(esteira.preco_un).toBe(14800);
    expect(esteira.total).toBe(59200);
    expect(esteira.incerta).toBe(false);
    const leg = o.linhas[0];
    expect(leg.descricao).toContain("Leg Press");
    expect(leg.modelo).toBe("LP450");
    expect(somaLinhas(o.linhas)).toBe(132200);
  });

  it("não confunde totalizador e rodapé com item", () => {
    const o = interpretarOrcamento(A);
    const desc = o.linhas.map((l) => l.descricao.toLowerCase());
    expect(desc.some((d) => d.includes("total"))).toBe(false);
    expect(desc.some((d) => d.includes("frete"))).toBe(false);
  });

  it("lê o layout de coluna única e marca como incerto o que deduziu", () => {
    const o = interpretarOrcamento(B);
    expect(o.fornecedor).toContain("NAUTILUS");
    expect(o.total).toBe(136800);
    expect(o.linhas.length).toBe(3);
    const esteira = o.linhas.find((l) => /Esteira/i.test(l.descricao))!;
    expect(esteira.qtd).toBe(4);
    expect(esteira.total).toBe(72000);
    expect(esteira.preco_un).toBe(18000);
    expect(esteira.incerta).toBe(true); // unitário deduzido, não lido
    expect(o.linhas[0].incerta).toBe(false); // qtd 1 → sem dedução
  });

  it("lê orçamento de acessórios e respeita o tipo escolhido", () => {
    const o = interpretarOrcamento(C, "acessorio");
    expect(o.linhas.length).toBe(4);
    expect(o.linhas.every((l) => l.tipo === "acessorio")).toBe(true);
    const anilha = o.linhas[0];
    expect(anilha.qtd).toBe(8);
    expect(anilha.preco_un).toBe(740);
    expect(anilha.total).toBe(5920);
    expect(anilha.incerta).toBe(false);
    expect(somaLinhas(o.linhas)).toBe(15660);
    expect(o.total).toBe(15660);
  });

  it("a quantidade só sai de coluna isolada — medida na descrição não vira qtd", () => {
    // "45 Graus", "2,20 m" e "20 kg" são descrição, não quantidade.
    const o = interpretarOrcamento("Leg Press 45 Graus reforçado    42.900,00");
    expect(o.linhas[0].qtd).toBe(1);
    expect(o.linhas[0].total).toBe(42900);
    const c = interpretarOrcamento(C, "acessorio");
    expect(c.linhas.find((l) => /Barra/.test(l.descricao))!.qtd).toBe(3);
  });

  it("avisa quando o PDF não tem camada de texto (escaneado)", () => {
    const o = interpretarOrcamento("");
    expect(o.temTexto).toBe(false);
    expect(o.linhas).toEqual([]);
  });

  it("a soma das linhas serve de conferência contra o total impresso", () => {
    const o = interpretarOrcamento(A);
    expect(somaLinhas(o.linhas)).toBe(o.total);
  });
});
