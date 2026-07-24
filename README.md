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

## Backend (Supabase — schema `planner`)

| Tabela | Papel |
|--------|-------|
| `planner.equipamentos` | Catálogo (nome, marca, modelo, largura/profundidade cm, zona, preço). |
| `planner.salas` | Salas: dimensões + `config` jsonb (pisos, pilar, corredor, paredes). |
| `planner.layouts` | Arranjo salvo por sala (`dados` jsonb, `sala_id` → `salas`). |

RLS habilitado em todas, com policies `select`/`insert`/`update`/`delete` para
`anon` (MVP single-user). O SQL aplicado está versionado em [`db/`](./db).
O schema `public` do projeto (jmp-gastronomia) **não é tocado**.

## Pipeline de importação (`tools/`)

Scripts locais para cadastrar equipamentos a partir de blocos **DXF** (bounding box
automático) ou **CSV** em lote. Geram JSON pronto para `planner.equipamentos`.

```bash
cd tools && npm install
node importar.js bloco.dxf --marca Movement --zona forca
node importar.js exemplo.csv --sql
```

Detalhes em [`tools/README.md`](./tools/README.md).

## Deploy

Site estático. `vercel.json` desliga build/install e serve a raiz do diretório.
`config.js` é incluído no envio do deploy (contém apenas a chave publishable).

## Roadmap (próximas fases)

Itens deliberadamente **fora** desta fase, priorizados para depois. As referências
vêm da análise dos repositórios-irmãos deste workspace:

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
