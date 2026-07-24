# Heritage Planner

Ferramenta **interna** de assessoria para implementação de academias (foco em
condomínios). Planejador de layout de sala em escala real, rodando no navegador.
Página estática única (`index.html`) com React + Babel via CDN e persistência no
Supabase (schema isolado **`planner`**).

## O que faz

- Desenha a planta da sala em escala real (SVG) com pisos, pilar, corredor e paredes.
- **Catálogo de equipamentos no banco** (`planner.equipamentos`): clique para
  adicionar, arraste para posicionar (grade de 5 cm), gire 90° e remova.
- **Múltiplas salas** (`planner.salas`): seletor no header + "Nova sala". Cada sala
  guarda dimensões e uma `config` (pisos, pilar, corredor, paredes nomeadas).
- Validação ao vivo: colisões, itens fora da sala e obstrução do corredor.
- Indicadores de ocupação, contagem de equipamentos e subtotal de investimento.
- Exporta via **Imprimir / PDF**. **Salvar layout** grava o arranjo por sala no Supabase.

Sem `config.js` configurado o app roda em **modo local**: catálogo e sala Heritage
embutidos como fallback, sem persistência.

## Configuração

1. Copie `config.example.js` para `config.js`.
2. Preencha `SUPABASE_URL` e `SUPABASE_KEY` (chave *publishable*/*anon*, pública por
   design — o acesso é controlado pelas RLS policies do schema `planner`).

`config.js` fica fora do git (veja `.gitignore`) e é injetado no deploy.

## Plataforma de assessoria (Fase 2)

Além do planner, a ferramenta modela o **serviço de assessoria** descrito na proposta
comercial (veja [`docs/plataforma.md`](./docs/plataforma.md) para a análise completa
da proposta → arquitetura):

- **Projetos**: cada engajamento com um condomínio (síndico, contato, **orçamento-teto**
  com honorário de **0,5%** calculado ao vivo, diagnóstico de perfil/infraestrutura),
  vinculado a uma sala. Seletor de projeto + "Novo projeto" no header.
- **Cenários de investimento**: cada equipamento do layout recebe uma etiqueta
  Essencial / Balanceado / Premium (cumulativo); a UI mostra o total de cada cenário
  e o saldo vs. orçamento-teto.
- **Relatório Executivo**: `tools/relatorio.js` gera o documento de entrega
  (diagnóstico, lista técnica por zona, matriz de priorização, cenários, resumo
  financeiro) em HTML → PDF.

## Backend (Supabase — schema `planner`)

| Tabela | Papel |
|--------|-------|
| `planner.equipamentos` | Catálogo (nome, marca, modelo, largura/profundidade cm, zona, preço). |
| `planner.salas` | Salas: dimensões + `config` jsonb (pisos, pilar, corredor, paredes). |
| `planner.layouts` | Arranjo salvo por sala (`dados` jsonb; item ganha `cenario`; `sala_id`). |
| `planner.projetos` | Engajamento: condomínio, orçamento-teto, `taxa_assessoria` gerada (0,5%), diagnóstico. |
| `planner.fornecedores` | Cadastro de fornecedores/marcas (entregável 10). |
| `planner.cotacoes` | Cotações por projeto/categoria (entregáveis 03/04). |

RLS habilitado em todas, com policies `select`/`insert`/`update`/`delete` para
`anon` (MVP single-user). O SQL aplicado está versionado em [`db/`](./db).
O schema `public` do projeto (jmp-gastronomia) **não é tocado**.

## Pipeline local (`tools/`)

Scripts que rodam na sua máquina (não no app) para alimentar e entregar material:

- **`ler.js`** — leitor unificado: ingere **PDF, CSV, planilha (.xlsx) e DXF/DWG**
  e gera JSON/SQL para `planner.equipamentos` ou `planner.cotacoes`.
- **`importar.js`** — importação de blocos DXF (bounding box) / CSV de equipamentos.
- **`relatorio.js`** — gera o Relatório Executivo (HTML → PDF) de um projeto.

```bash
cd tools && npm install
node ler.js catalogo.xlsx --sql                 # planilha → equipamentos
node ler.js orcamento.pdf --tipo cotacoes --projeto <uuid> --sql
node ler.js bloco.dxf --marca Movement --zona forca
node relatorio.js exemplo-projeto.json           # relatório executivo
```

Detalhes em [`tools/README.md`](./tools/README.md).

## Deploy

Site estático. `vercel.json` desliga build/install e serve a raiz do diretório.
`config.js` é incluído no envio do deploy (contém apenas a chave publishable).

## Roadmap (próximas fases)

Mapeamento completo proposta → recursos em [`docs/plataforma.md`](./docs/plataforma.md).

**Fase 3** — UI de cotações e fornecedores + comparativo (entregáveis 04/10);
matriz de priorização editável no app (05); checklist guiado de infraestrutura (09).

**Fase 4** — os itens abaixo. As referências vêm da análise dos repositórios-irmãos
deste workspace:

- **Editor de paredes estilo blueprint** — desenhar/editar paredes livres.
  Base: modelo de dados plano de `open3dFloorplan` (`src/lib/models/types.ts` —
  `Wall`/`Room`/`Floor`/`Project`) e a lógica de snap/merge de cantos do
  `blueprint3d` (`corner.ts`, `floorplanner.ts` modo DRAW). Adotar como `jsonb`,
  não o código pesado.
- **Visualização 3D** — extrudar o layout 2D. Base: `three-gltf-viewer`
  (`src/viewer.js`: loader glTF + auto-frame `Box3` + iluminação PMREM) e o
  padrão GLB-com-fallback-procedural de `open3dFloorplan` (`furnitureModelLoader.ts`).
- **Módulo de viabilidade** (lib financial) — orçamento/ROI da montagem.
- **Import RoomPlan** — importar plantas capturadas via LiDAR (iOS).

Nota de arquitetura (da análise): formalizar a separação **definição de catálogo**
(equipamento, dimensões) × **instância posicionada** (`catalogId` + posição/rotação
+ overrides) — é a mudança de maior alavancagem antes de paredes/3D/multi-sala
avançarem. Ferramentas de export de documento (PDF/DOCX/PPTX) são o caminho natural
para "entrega de material" de consultoria numa fase futura.
