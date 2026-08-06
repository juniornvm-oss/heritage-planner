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

// ── Layouts REAIS (Maison Heritage) ─────────────────────────────────────────
// Reproduzem a estrutura dos três orçamentos que chegaram, com os dados de
// contato trocados. Cada um quebrou o leitor de um jeito diferente.

// 1) Coluna QTD com zero à esquerda, "R$" separado do número, condição de
//    pagamento com vários valores e telefone na mesma linha da validade.
const MOVEMENT = `Movement Londrina
CNPJ: 57.155.016/0001- 90
Av. Maringá 2331 - Londrina PR
CNPJ: 21.213.298/0001-98
Contato: Fulano
Cliente : Edificio Maison Heritage
ORÇAMENTO
Qtd.  Marca  Descrição  Preço Unit.  Preço Total
1  Movement Elíptico Profissional RTS  R$  24.500,00 R$  24.500,00
01  Movement Wire Cross Smith Rack  R$  40.900,00 R$  40.900,00
01  Movement Leg Press 45° Next  R$  40.600,00 R$  40.600,00
Valor Total:  R$ 106.000,00
Condições de Pagamento:
Valor da Prosposta: R$95.000,00 - Entrada de R$50.000,00 + saldo em 2x sem Juros de R$22.500,00 (30/60dd)
Frete e Montagem: Cortesia
Obs: Garantia de 1 Ano e Assistencia Técnica Permanente
Prazo de Entrega: 100 dias para Produção
Validade da Proposta: 10 dias  41 90000-0000`;

// 2) Bloco por produto: descrição numa linha, preço na seguinte junto do SKU,
//    e no documento só existe o CNPJ do CLIENTE.
const CORE = `Documento
StairMaster
NAUTILUS®
Tipo Doc: Orçamento  ID: 5206
Cliente
Nome: EDIFICIO MAISON HERITAGE  CNPJ: 21.213.298/0001-98
Razao: EDIFICIO MAISON HERITAGE
Tipo Frete: Sem Ocorrência de Transporte  Data Entrega: Não Informado
Lista de Produtos
DESCRIÇÃO DO PRODUTO
Qtd:  1
MAQUINA DE MUSC MEMB INF CADEIRA ADUTORA E ABDUTORA. MODELO INSTINCT, MARCA NAUTILUS, COR
PRETA (60)  Unitário: 18.013,17
SKU 9NL-D1015-60AGS
Total:  18.013,17
DESCRIÇÃO DO PRODUTO
Qtd:  1
MAQ DE MUSC PARA MEMB INF, MESA FLEXORA, MODELO IMPACT, MARCA NAUTILUS, COR PRETA (60)
SKU 9NA-S1301-60AGS  Unitário: 23.134,42
Total:  23.134,42
DA GARANTIA
TODA LINHA DE MUSCULAÇÃO: 10 ANOS DE GARANTIA NA ESTRUTURA (EXCETO PINTURA), 5 ANOS NAS PLACAS`;

// 3) Quantidade escrita com casas decimais ("8,00"), medida dentro da
//    descrição ("1,20 UN") e rodapé com rótulos numa linha e números na outra.
const G2 = `G2 FITNESS EQUIPAMENTOS E ACESSORIOS LTDA
CNPJ: 21.344.344/0001-98
Proposta Nº 4093
Para
EDIFICIO MAISON HERITAGE
CNPJ: 21213298000198, IE: ISENTO
Data  21/07/2026
Descrição do produto/serviço  Código  Un  Qtd.  Preço un.  Preço total
ESPALDAR ALUMINIO  UN  1,00  2.450,00  2.450,00
ANILHA OLIMPICA BV 20KG  UN  8,00  740,00  5.920,00
ANILHA OLIMPICA BV 2,5KG  UN  6,00  94,75  568,50
BARRA OLIMPICA CROMADA 1,20  UN  1,00  900,00  900,00
COLCHONETE EMBORRACHADO D80  UN  10,00  190,00  1.900,00
CONJUNTO DE HALTERES SEXTAVADOS 1 A
UN  1,00  3.990,00  3.990,00
10KG EMBORRACHADO C/ SUPORTE
PUXADOR CORDA  UN  1,00  247,50  247,50
Nº de Itens  Soma das Qtdes  Total outros itens  Total dos itens  Frete  Total da proposta
7,00  28  0,00  15.976,00  0,00  15.976,00
Condições comerciais
Frete e montagem por conta do cliente.
Prazo de validade da proposta: 10 dias corridos.`;

describe("leitor — layouts reais do Maison Heritage", () => {
  it("Movement: lê os itens e não confunde a condição de pagamento com item", () => {
    const o = interpretarOrcamento(MOVEMENT);
    expect(o.fornecedor).toBe("Movement Londrina");
    // O CNPJ do fornecedor vem primeiro, com o espaço que o PDF deixou.
    expect(o.cnpj).toBe("57.155.016/0001-90");
    expect(o.total).toBe(106000);
    expect(o.linhas.length).toBe(3);
    expect(somaLinhas(o.linhas)).toBe(106000);
    expect(o.linhas.every((l) => l.qtd === 1)).toBe(true);
    // "Entrada de R$50.000,00 + saldo…" tem valores mas não é item.
    expect(o.linhas.some((l) => /entrada|saldo/i.test(l.descricao))).toBe(false);
    // Sem número de proposta no PDF: não inventa o "10" da validade.
    expect(o.documento).toBeNull();
    expect(o.validade).toBe("10 dias"); // sem o telefone da coluna ao lado
    expect(o.prazo_entrega).toContain("100 dias");
    expect(o.frete).toBe("Cortesia");
  });

  it("CORE: monta o item com a descrição quebrada em duas linhas", () => {
    const o = interpretarOrcamento(CORE);
    expect(o.linhas.length).toBe(2);
    expect(o.linhas[0].descricao).toContain("CADEIRA ADUTORA E ABDUTORA");
    expect(o.linhas[0].descricao).toContain("PRETA (60)");
    expect(o.linhas[0].total).toBe(18013.17);
    // A linha do preço começa com "SKU" e mesmo assim vira item.
    expect(o.linhas[1].descricao).toContain("MESA FLEXORA");
    expect(o.linhas[1].total).toBe(23134.42);
    expect(o.linhas[1].modelo).toBe("9NA-S1301-60AGS");
    // Só existe o CNPJ do CLIENTE: não atribui ao fornecedor nem chuta o nome
    // do condomínio — a tela de conferência pergunta.
    expect(o.cnpj).toBeNull();
    expect(o.fornecedor).toBeNull();
    expect(o.garantia).toContain("10 ANOS DE GARANTIA");
  });

  it("G2: o rodapé de totalizadores é descartado com motivo, não em silêncio", () => {
    const o = interpretarOrcamento(G2, "acessorio");
    // "7,00  28  0,00  15.976,00  0,00  15.976,00" tem valores mas não tem
    // descrição: some da lista de itens, e por isso precisa aparecer aqui.
    const rodape = o.descartadas.find((d) => d.linha.startsWith("7,00"))!;
    expect(rodape.motivo).toMatch(/sem descrição/);
  });

  it("G2: quantidade com casas decimais e medida na descrição", () => {
    const o = interpretarOrcamento(G2, "acessorio");
    expect(o.fornecedor).toContain("G2 FITNESS");
    expect(o.documento).toBe("4093");
    expect(o.validade).toBe("10 dias corridos");
    expect(o.frete).toBe("por conta do cliente");
    // Total vem do rodapé com rótulos numa linha e números na outra.
    expect(o.total).toBe(15976);

    const porNome = (re: RegExp) => o.linhas.find((l) => re.test(l.descricao))!;
    // "UN 8,00 740,00 5.920,00": o 8,00 é quantidade, não preço.
    const anilha = porNome(/ANILHA OLIMPICA BV 20KG/);
    expect(anilha.qtd).toBe(8);
    expect(anilha.preco_un).toBe(740);
    expect(anilha.total).toBe(5920);
    expect(porNome(/2,5KG/).qtd).toBe(6);
    // A medida fica na descrição, não vira quantidade nem preço.
    expect(porNome(/BARRA OLIMPICA/).descricao).toBe("BARRA OLIMPICA CROMADA 1,20");
    expect(porNome(/BARRA OLIMPICA/).qtd).toBe(1);
    expect(porNome(/COLCHONETE/).descricao).toBe("COLCHONETE EMBORRACHADO D80");
    expect(porNome(/COLCHONETE/).qtd).toBe(10);
    // Item curto não gruda na sobra do item anterior.
    expect(porNome(/PUXADOR CORDA/).descricao).toBe("PUXADOR CORDA");
    // O rodapé de totalizadores não vira item.
    expect(o.linhas.length).toBe(7);
    expect(somaLinhas(o.linhas)).toBe(15976);
    expect(o.linhas.every((l) => l.tipo === "acessorio")).toBe(true);
  });
});

// ── O que o leitor perdia em silêncio ───────────────────────────────────────
// Três defeitos com a mesma assinatura: a linha existia no PDF, não virava
// item e não aparecia em lugar nenhum. O consultor só descobria conferindo o
// papel ao lado da tela — quando descobria.

// Prefixo de ruído aplicado como veredito: "Banco", "Para" e "Garantia" no
// começo da linha derrubavam o item inteiro, mesmo com preço ao lado.
const PREFIXO = `HERITAGE FITNESS ACESSORIOS LTDA
CNPJ: 10.111.222/0001-33
Orçamento nº 77

Banco Regulável 0-90 graus                    R$ 4.600,00
Paralela para calistenia                      R$ 1.250,00
Banco Scott em aço                            R$ 1.890
Garantia estendida do banco (24 meses)        R$ 300,00

Banco: Itaú  Agência: 0001  Conta: 12345-6
Garantia: 12 meses
Total: R$ 8.040,00`;

// O prefixo com dois-pontos continua sendo rótulo, e o rodapé financeiro
// continua sendo rodapé — mesmo carregando valor.
const ROTULOS = `Fornecedor Teste LTDA
Banco: Itaú  Agência: 0001  Conta: 12345-6
Cadeira Extensora Dual                        R$ 8.040,00
Pagamento: 3x de R$ 2.680,00
Frete: R$ 250,00
Total: R$ 8.290,00`;

describe("leitor — o que era descartado em silêncio", () => {
  it("prefixo de ruído não derruba linha que tem preço", () => {
    const o = interpretarOrcamento(PREFIXO, "acessorio");
    const desc = o.linhas.map((l) => l.descricao);
    expect(desc).toContain("Banco Regulável 0-90 graus");
    expect(desc).toContain("Paralela para calistenia");
    expect(desc).toContain("Garantia estendida do banco (24 meses)");
    expect(o.linhas.length).toBe(4);
    // A prova de que nada ficou de fora: a soma fecha com o total impresso.
    expect(somaLinhas(o.linhas)).toBe(8040);
    expect(o.total).toBe(8040);
  });

  it("prefixo com dois-pontos e rodapé financeiro continuam fora dos itens", () => {
    const o = interpretarOrcamento(ROTULOS);
    expect(o.linhas.length).toBe(1);
    expect(o.linhas[0].descricao).toBe("Cadeira Extensora Dual");
    expect(o.total).toBe(8290);
    const pag = o.descartadas.find((d) => d.linha.startsWith("Pagamento:"))!;
    expect(pag.motivo).toMatch(/rótulo/);
    const frete = o.descartadas.find((d) => d.linha.startsWith("Frete:"))!;
    expect(frete.motivo).toMatch(/totalizador/);
    // Sem preço, o bloco bancário cai por falta de valor — não por prefixo.
    const banco = o.descartadas.find((d) => d.linha.startsWith("Banco:"))!;
    expect(banco.motivo).toMatch(/sem valor/);
  });

  it("aceita inteiro sem centavos quando o R$ está colado", () => {
    const o = interpretarOrcamento("Banco Scott em aço    R$ 1.890");
    expect(o.linhas.length).toBe(1);
    expect(o.linhas[0].descricao).toBe("Banco Scott em aço");
    expect(o.linhas[0].total).toBe(1890);
    expect(o.linhas[0].preco_un).toBe(1890);
    // Sem o cifrão o inteiro continua sendo medida ou código, nunca preço —
    // é o "R$" que autoriza a leitura sem centavos.
    expect(interpretarOrcamento("Barra olímpica cromada 220").linhas).toEqual([]);
    expect(interpretarOrcamento("Leg Press  21.213.298/0001-98").linhas).toEqual([]);
  });

  it("descartadas cobre toda linha que não virou item, com o motivo", () => {
    const o = interpretarOrcamento(A);
    // Invariante: item ou motivo. Nenhuma linha do PDF pode desaparecer sem uma
    // das duas coisas — é isso que separa "leu tudo" de "leu o que quis".
    expect(o.linhas.length + o.descartadas.length).toBe(o.texto.split("\n").length);
    expect(o.descartadas.find((d) => d.linha.startsWith("TOTAL GERAL"))!.motivo).toMatch(/totalizador/);
    expect(o.descartadas.find((d) => d.linha.startsWith("Garantia:"))!.motivo).toMatch(/rótulo/);
    expect(o.descartadas.some((d) => /Leg Press/.test(d.linha))).toBe(false);
  });

  it("a linha absorvida pela descrição de baixo não conta como perdida", () => {
    const o = interpretarOrcamento(CORE);
    const absorvida = o.descartadas.find((d) => d.linha.startsWith("MAQUINA DE MUSC"))!;
    expect(absorvida.motivo).toMatch(/juntada/);
    expect(o.linhas.length + o.descartadas.length).toBe(o.texto.split("\n").length);
  });
});
