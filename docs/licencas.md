# Licenças de fontes externas

Registro do que vem de fora do time e sob que condição pode ser usado. O
Heritage GymBuilder é produto **comercial** (assessoria paga, Dossiê entregue
ao condomínio), então "de graça na internet" não basta: cada fonte precisa de
uma linha aqui dizendo o que entra no produto e o que fica de fora.

**Regra da casa:** fonte nova sem entrada neste arquivo não entra no bundle.

---

## exercises-dataset — base de exercícios (uso de BUILD TIME)

| | |
|---|---|
| **O que é** | 1.324 exercícios com músculo-alvo, músculos secundários, equipamento, imagens, GIFs e instruções em EN/IT/TR. |
| **Origem** | `github.com/juniornvm-oss/exercises-dataset` (fork de dataset público de terceiros). |
| **Onde fica** | Fora do repositório do app. Nada dele é versionado aqui. |
| **Como é usado** | Só por `tools/derivar-capacidades.mjs`, na máquina do consultor, para produzir um RASCUNHO revisado à mão. |
| **O que entra no produto** | Nada do arquivo. Ver "A fronteira", abaixo. |

### O que a licença diz

O `README.md` do dataset, em `## 📄 License`, é explícito:

> This project is for **educational and non-commercial purposes only**.
>
> - You **may** use this dataset for personal projects, research, and learning.
> - You **may not** use this dataset or its media for any commercial
>   application or product.
> - All images and videos are property of their respective copyright holders.
> - For commercial use, please contact the original content owners directly.

E no `## ⚠️ Disclaimer`:

> All exercise media (images, videos) belong to their respective copyright
> holders. **Commercial use is strictly prohibited.**

### A fronteira

O que **não** atravessa, em hipótese alguma, para dentro de `src/`:

- imagem, thumbnail, GIF ou vídeo;
- texto de instrução (`instructions`, `instruction_steps`), em qualquer idioma;
- nome de exercício vindo do dataset;
- qualquer arquivo derivado (JSON compilado, índice, embedding) embarcado no
  app ou baixado em runtime — o app é offline-first e **não faz rede em
  runtime**.

O que atravessa é o **veredito do consultor**: os códigos dos 14 grupos
musculares e dos 18 padrões de movimento definidos em `src/lib/musculatura.ts`,
escritos à mão em `capacidades`, dentro de `BASE_EQUIP` (`src/lib/curadoria.ts`).
O script mostra contagem ("86% dos exercícios desta amostra têm glúteos como
alvo"); quem decide se a máquina declara glúteo é a pessoa.

As listas de exercícios em português que já existem em `BASE_EQUIP` são
redação do consultor sobre a mecânica de cada aparelho — anteriores a este
dataset e independentes dele.

### Risco conhecido, decisão em aberto

A frase da licença é mais larga que o disclaimer: o disclaimer fala em mídia,
mas a licença diz "this dataset **or** its media", o que numa leitura estrita
alcança o arquivo inteiro, inclusive a tabela de fatos.

O que sustenta o uso atual:

1. o dataset não é distribuído, embarcado nem consultado pelo produto;
2. o que o script extrai é fato anatômico não autoral ("leg press recruta
   quadríceps"), e ainda assim nenhum número dele vai para o app: vai a
   decisão humana tomada depois de olhar o número;
3. a associação músculo × equipamento é conhecimento técnico corrente da área,
   verificável em qualquer manual — o dataset acelerou a conferência, não é a
   fonte do conhecimento.

**Pendência para o responsável pelo produto:** se quiser eliminar o risco por
completo, basta parar de rodar o script — `capacidades` já está preenchida e o
app não depende dele para nada. A alternativa é trocar a fonte de conferência
por uma de licença permissiva ou por bibliografia impressa.

### Como reproduzir o rascunho

```bash
cd tools
node derivar-capacidades.mjs                      # usa ../../exercises-dataset
node derivar-capacidades.mjs --dados=/caminho/exercises.json
node derivar-capacidades.mjs --alvo="Leg Press" --evidencia
```

O script lê os 14 grupos, a tabela de normalização e os 18 padrões direto de
`src/lib/musculatura.ts` (não duplica nada), imprime um bloco TypeScript e
termina listando os rótulos da fonte que ainda não têm tradução na tabela. Não
escreve arquivo nenhum: a saída é para o terminal, e a colagem é manual e
revisada item a item.

---

## Demais fontes

| Fonte | Onde | Condição |
|---|---|---|
| Dependências npm (`package.json`) | runtime e build | Licenças MIT/Apache-2.0/BSD das próprias bibliotecas — uso comercial permitido. |
| Fontes tipográficas do PDF | `pdf-lib` (Standard 14) | Embutidas no leitor de PDF, não distribuídas por nós. |
| Preços, marcas e fotos de equipamento | cadastro do consultor | Material do fornecedor, usado com autorização comercial dele. Não vem de dataset público. |
