# Plataforma de Assessoria — análise da proposta e arquitetura

Este documento traduz a **proposta comercial** (assessoria técnica de implantação de
academia em condomínios) em arquitetura de software: o que cada entregável exige,
onde vive no sistema e em que fase é construído.

## Modelo de negócio (resumo)

- Serviço: assessoria técnica que transforma o orçamento-teto do condomínio na
  academia mais funcional/estética possível, em **4 fases** com **10 entregáveis**.
- Honorário: **0,5% do teto máximo** de investimento estipulado pelo condomínio.
- Usuário da plataforma: **único** (o consultor). Ferramenta interna de produção.

## Os 4 pilares → como o software ajuda

| Pilar | Suporte na plataforma |
|-------|-----------------------|
| Custo-benefício | Catálogo com preço + cenários Essencial/Balanceado/Premium + matriz de priorização |
| Espaço otimizado | Planner de layout em escala real (já existe) com zonas e validação de circulação |
| Perfil de uso | Diagnóstico estruturado (faixa etária, frequência, uso assistido/autônomo) |
| Valorização imobiliária | Relatório executivo com justificativa técnica para o síndico |

## Entregáveis → recursos → onde vive

| # | Entregável | Recurso na plataforma | Camada |
|---|-----------|-----------------------|--------|
| 01 | Relatório de Diagnóstico | `projetos.perfil`/`infraestrutura` + seção no relatório | DB + tools |
| 02 | Layout Funcional da Planta | Planner SVG em escala real | app (existe) |
| 03 | Lista Técnica de Equipamentos | Itens do layout + catálogo (`equipamentos`) | app + DB |
| 04 | 3+ Cotações por Categoria | `cotacoes` + `fornecedores` | DB (+ UI futura) |
| 05 | Matriz de Priorização | impacto × valor percebido × necessidade por item | tools (+ UI futura) |
| 06 | Cenários de Investimento | tag Essencial/Balanceado/Premium por item + totais | app |
| 07 | Planta Renderizada | Export "Imprimir/PDF" da planta | app (existe) |
| 08 | Relatório Executivo | `tools/relatorio.js` → HTML/PDF branded | tools |
| 09 | Análise de Infraestrutura | `projetos.infraestrutura` (checklist) + seção no relatório | DB + tools |
| 10 | Contatos de Fornecedores | `fornecedores` | DB (+ UI futura) |

## Modelo de dados (schema `planner`)

Tudo isolado no schema `planner` (o `public` do jmp-gastronomia não é tocado),
RLS `anon` (single-user), no mesmo padrão de `layouts`/`equipamentos`/`salas`.

```
projetos      — o engajamento com um condomínio (Fase 1 diagnóstico + orçamento)
  id, nome(condomínio), sindico, contato, endereco,
  orcamento_teto numeric, taxa_assessoria (gerada = teto × 0,5%),
  perfil jsonb, infraestrutura jsonb, observacoes,
  sala_id → salas, status, criado_em
fornecedores  — cadastro de fornecedores/marcas (entregável 10)
  id, nome, marca, contato, telefone, email, condicoes, criado_em
cotacoes      — cotações por projeto/categoria (entregáveis 04/03)
  id, projeto_id → projetos, categoria, equipamento, fornecedor_id → fornecedores,
  marca, modelo, valor, garantia, assistencia, prazo, criado_em
equipamentos  — catálogo (já existe)
salas         — ambientes/plantas (já existe)
layouts       — arranjo por sala; item ganha campo `cenario` (E/B/P) no jsonb `dados`
```

Decisão de design: **cenário vive no próprio item do layout** (`dados[].cenario`),
não em tabela separada — o layout já é a lista de equipamentos selecionados, então
Essencial/Balanceado/Premium é só uma etiqueta por item. Regra good/better/best:
`essencial ⊆ balanceado ⊆ premium` (itens sem tag contam como balanceado).

## Fases de construção

- **Fase 1 (feita)** — catálogo no banco, pipeline DXF/CSV, múltiplas salas.
- **Fase 2 (esta entrega)** — camada de **projeto/assessoria**: tabelas `projetos`,
  `fornecedores`, `cotacoes`; app fica *projeto-aware* (seletor + novo projeto +
  diagnóstico + orçamento-teto com honorário 0,5% ao vivo + barra de orçamento);
  **cenários** Essencial/Balanceado/Premium por item; `tools/relatorio.js` gera o
  Relatório Executivo (HTML→PDF) com diagnóstico, lista técnica por zona, cenários
  e resumo financeiro.
- **Fase 3 (roadmap)** — UI de cotações/fornecedores e comparativo (04/10); matriz
  de priorização editável no app (05); checklist de infraestrutura guiado (09).
- **Fase 4 (roadmap)** — editor de paredes (blueprint), 3D (three-gltf-viewer),
  módulo de viabilidade/ROI, import RoomPlan; export DOCX/PPTX além do HTML/PDF.
