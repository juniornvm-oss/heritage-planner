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
- **Marcas** — biblioteca de fabricantes (equipamento, acabamento, mobiliário, acessório) com
  logo, origem, grupo controlador, garantia e o texto de apresentação que sai no Dossiê.
- **Novo projeto** — diagnóstico (condomínio, síndico, orçamento-teto com honorário 0,5%,
  perfil) e dimensões da sala.
- **Editor de Projeto Visual** — planta em escala real (Konva): pan/zoom/pinça, grade em cm,
  importar planta baixa (PDF/DWG/DXF/imagem) como fundo + **calibração de escala**, arrastar
  equipamentos, girar 90° com **proporção travada**, validação ao vivo e cenários. Exporta o
  PDF de entrega.
- **Curadoria & Investimento (Fase 03)** — sobe o **PDF do orçamento** do
  fornecedor: o app lê fornecedor, itens, quantidades, valores, prazo e garantia,
  abre a tela de conferência e só grava o que você confirmar. Vale para
  equipamentos e acessórios. Compara as propostas por item (meta de 3+) e marca a
  compra escolhida — que pode misturar fornecedores.
- **Curadoria (Etapa 5 do editor)** — classifica cada equipamento em **Essencial ·
  Balanceado · Premium** (em lote por categoria, com sugestão técnica automática) e
  escreve a nota de cada categoria. É o que separa os três cenários no Dossiê.
- **Biblioteca de equipamentos** — catálogo (com import de planilha/CSV), com
  descrição ("o que é / para que serve"), cenário padrão e a lista de exercícios
  de musculação de cada equipamento.
- **Biblioteca de acabamentos** — pisos/paredes/revestimentos.

## O editor, etapa a etapa

A trilha do editor segue a ordem em que o trabalho acontece — **Planta → Áreas → Layout →
Acabamento → Fichas → Cenários & Dossiê → Acessórios**. Cada aba mostra o que já entregou
(nº de paredes, de regiões, de itens, colisões a resolver) em vez de só o nome.

**Efeitos de edição.** Toda ferramenta de dois toques mostra em tempo real o que vai criar:
retângulo com medidas e m², linha com comprimento e ângulo (já endireitada quando o snap for
endireitar), polígono com o ponto de fechamento destacado. Arrastar um equipamento acende
guias de alinhamento contra bordas, centros e paredes, deixa um fantasma na posição de origem
e mostra a **folga em centímetros** até cada vizinho — vermelha abaixo da circulação mínima do
projeto. O encaixe é um só (`src/lib/snap.ts`) para desenho e para arraste.

**Análise funcional de espaço** (`src/lib/analiseEspaco.ts`): área útil, área de uso e área
livre por união de retângulos (sem contar sobreposição duas vezes), ocupação funcional com
semáforo, m² por aparelho, usuários simultâneos por conjunto independente de áreas de uso, e
os vãos de circulação classificados contra a régua do projeto. Cada número sai com a faixa de
referência ao lado. É a mesma fonte no rodapé, no painel e no Dossiê.

**Análise de exercícios** (`src/lib/musculatura.ts` + `analisarCobertura`): 14 grupos
musculares e 18 padrões de movimento; que grupos a academia cobre, quais ficam de fora, o que
comprar para fechar cada lacuna e quanta cobertura se perde ao cortar um cenário.

## Estrutura

```
src/
  lib/        types, units (cm), canvas, snap (encaixe + guias), supabase,
              readers (planilha), planta (PDF/DWG→fundo), validation,
              analiseEspaco (métricas de espaço), musculatura (grupos e padrões),
              marcas (detecção e biblioteca), export/pdfExport,
              curadoria (especificação das categorias, verbete de cada equipamento,
              exercícios por aparelho, capacidades musculares, cenário sugerido)
  store/      projetoStore (cena + undo/redo), libraryStore
  screens/    Projetos, NovoProjeto, Editor, Bibliotecas (equip./acab./marcas)
  editor/     EditorCanvas (Konva), PreviewFX (prévia elástica),
              TrilhaEtapas (stepper + HUD), konvaMotion (tweens), etapas
  ui/         tokens (espelho JS do CSS), anim (presença/stagger), EntradaPDF
db/           migrações SQL do schema planner (aplicadas no Supabase)
              016_orcamentos.sql — propostas em PDF + linhas em `cotacoes`
              018_marcas.sql — biblioteca de marcas
tools/        scripts locais (importar/ler/relatorio, derivar-capacidades) — auxiliares
docs/         plataforma.md (proposta → arquitetura), licencas.md (fontes de dados)
```

## Dossiê: tudo editável

O PDF é montado a partir de um registro de seções endereçáveis. Na etapa **Cenários & Dossiê**,
a *Central do Dossiê* lista as 18 seções na ordem real de saída e permite, para cada uma:
ligar/desligar, renomear o título, reescrever o texto de abertura e reordenar. Os dois textos
da capa e a data de emissão também são editáveis, e a especificação de cada categoria é
sobrescrita campo a campo. Campo em branco publica o texto padrão, mostrado como placeholder.

## Banco (Supabase — schema `planner`)

`equipamentos`, `salas`, `layouts`, `projetos` (com `cena jsonb`), `fornecedores`,
`cotacoes`, `acabamentos`. RLS anon (single-user). SQL versionado em `db/`. O schema
`public` do projeto não é tocado.

## Roadmap

Fase B: aplicar acabamentos na planta, cotações/fornecedores no app, matriz de priorização,
PDF refinado, Supabase Storage para a imagem da planta, modo celular (import/export),
calibração do leitor DWG. Fase C: 3D, viabilidade/ROI, import RoomPlan, empacotar nativo.
