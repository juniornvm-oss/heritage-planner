# Heritage Planner

Aplicativo (iPad, paisagem) de assessoria para implantação de academias em condomínios.
Editor de projeto visual em escala real + geração do PDF de entrega.

Ferramenta interna, single-user. Stack: **Vite + React + TypeScript + Konva**, Supabase
(schema isolado `planner`), PWA. Deploy pelo Vercel (build do Vite).

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit && vite build → dist/
```

Config do Supabase em `public/config.js` (chave publishable, pública por design; acesso
controlado por RLS). Sem ela, o app roda em modo local com o projeto "Heritage (modelo)".

## Telas

- **Projetos** — lista de projetos salvos (inclui o modelo Heritage) + novo projeto.
- **Novo projeto** — diagnóstico (condomínio, síndico, orçamento-teto com honorário ajustável por projeto (padrão 0,5%),
  perfil) e dimensões da sala.
- **Editor de Projeto Visual** — planta em escala real (Konva): pan/zoom/pinça, grade em cm,
  importar planta baixa (PDF/DWG/DXF/imagem) como fundo + **calibração de escala**, arrastar
  equipamentos, girar 90° com **proporção travada**, validação ao vivo e cenários. Exporta o
  PDF de entrega.
- **Biblioteca de equipamentos** — catálogo (com import de planilha/CSV).
- **Biblioteca de acabamentos** — pisos/paredes/revestimentos.

## Estrutura

```
src/
  lib/        types, units (cm), canvas (coordenadas/snapping), supabase,
              readers (planilha), planta (PDF/DWG→fundo), validation, export/pdfExport
  store/      projetoStore (cena + undo/redo), libraryStore
  screens/    Projetos, NovoProjeto, Editor, Bibliotecas, OrientationGuard
  editor/     EditorCanvas (Konva)
db/           migrações SQL do schema planner (aplicadas no Supabase)
tools/        scripts locais (importar/ler/relatorio) — pipeline auxiliar
docs/         plataforma.md (proposta → arquitetura)
```

## Banco (Supabase — schema `planner`)

`equipamentos`, `salas`, `layouts`, `projetos` (com `cena jsonb`), `fornecedores`,
`cotacoes`, `acabamentos`. RLS anon (single-user). SQL versionado em `db/`. O schema
`public` do projeto não é tocado.

## Roadmap

Fase B: aplicar acabamentos na planta, cotações/fornecedores no app, matriz de priorização,
PDF refinado, Supabase Storage para a imagem da planta, modo celular (import/export),
calibração do leitor DWG. Fase C: 3D, viabilidade/ROI, import RoomPlan, empacotar nativo.
