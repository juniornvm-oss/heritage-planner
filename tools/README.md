# tools/ — pipeline de importação de equipamentos

Scripts que rodam **na sua máquina** (não no app) para cadastrar equipamentos
na tabela `planner.equipamentos` do Supabase. Geram JSON pronto para insert
(e, opcionalmente, o `INSERT` SQL).

## Instalação

```bash
cd tools
npm install        # instala dxf-parser (só necessário para entrada .dxf)
```

## Uso

### A partir de um bloco DXF

Lê o `.dxf`, calcula o *bounding box* (largura × profundidade) e converte para
cm usando o `$INSUNITS` do arquivo (ou o override `--unit`). Resolve blocos
`INSERT` referenciados.

```bash
node importar.js bloco.dxf --marca Movement --zona forca
node importar.js bloco.dxf --nome "Leg Press 45°" --marca Movement --zona forca --preco 40600
node importar.js bloco.dxf --marca Movement --zona forca --sql   # imprime também o INSERT
```

Saída:

```json
{
  "nome": "Leg Press 45°",
  "marca": "Movement",
  "modelo": null,
  "largura_cm": 246,
  "profundidade_cm": 158,
  "zona": "forca",
  "preco": 40600,
  "fonte_arquivo": "bloco.dxf"
}
```

### A partir de um CSV em lote

Cabeçalho esperado: `nome,marca,largura,profundidade,zona,preco`
(só `nome,largura,profundidade` são obrigatórios). Veja `exemplo.csv`.

```bash
node importar.js exemplo.csv
node importar.js exemplo.csv --sql > equipamentos.sql
```

## Flags

| Flag | Descrição |
|------|-----------|
| `--marca <txt>` | Marca do equipamento |
| `--modelo <txt>` | Modelo |
| `--nome <txt>` | Nome (default: nome do bloco DXF ou do arquivo) |
| `--zona <z>` | `ergo` · `forca` · `livre` · `prep` |
| `--preco <n>` | Preço (numérico) |
| `--unit <code>` | Força a unidade do DXF: `1`=pol `4`=mm `5`=cm `6`=m (default: header ou mm) |
| `--sql` | Além do JSON, imprime a instrução SQL `INSERT` |
| `--out <arquivo>` | Grava a saída JSON em arquivo em vez do stdout |

## Relatório Executivo (`relatorio.js`)

Gera o **Relatório Executivo de assessoria** (HTML → PDF) a partir de um projeto
exportado. Zero dependências. Cobre os entregáveis 01 (Diagnóstico), 03 (Lista
Técnica), 05 (Matriz de Priorização), 06 (Cenários) e 09 (Infraestrutura).

```bash
node relatorio.js exemplo-projeto.json                 # gera relatorio.html ao lado
node relatorio.js projeto.json --out relatorio.html    # depois: navegador → Imprimir → PDF
```

Formato de entrada em `exemplo-projeto.json`: `{ projeto, sala, itens[] }`. Os
cenários são cumulativos (Essencial ⊆ Balanceado ⊆ Premium); itens sem tag contam
como Balanceado. Campos `impacto`/`valor_percebido`/`necessidade` (1–5) por item
alimentam a Matriz de Priorização.

## Como inserir no Supabase

- **Via SQL** (`--sql`): cole o `INSERT` no SQL Editor do projeto, schema `planner`.
- **Via JSON**: use o JSON com o cliente Supabase (`.from("equipamentos").insert(...)`)
  ou cole no editor de tabela.

Notas sobre unidades: blocos DXF de equipamento costumam ser desenhados em **mm**.
Se o resultado sair 10× maior/menor que o esperado, ajuste com `--unit` (ex.:
`--unit 5` para um DXF já em cm).
