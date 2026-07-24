# Heritage Planner

Planejador de layout de sala/academia em escala real, rodando 100% no navegador.
Página estática única (`index.html`) com React + Babel via CDN e persistência
opcional no Supabase.

## O que faz

- Desenha a planta da sala em escala real (SVG) com pisos, pilar, corredor e paredes.
- Biblioteca de equipamentos: clique para adicionar, arraste para posicionar
  (grade de 5 cm), gire 90° e remova.
- Validação ao vivo: detecta colisões, itens fora da sala e obstrução do corredor.
- Indicadores de ocupação, contagem de equipamentos e subtotal de investimento.
- Exporta via **Imprimir / PDF**.
- Botão **Salvar layout** grava o arranjo no Supabase (upsert por nome).

## Configuração

1. Copie `config.example.js` para `config.js`.
2. Preencha `SUPABASE_URL` e `SUPABASE_KEY` (chave *publishable*/*anon*, pública por
   design — o acesso é controlado pelas RLS policies).

Sem `config.js` configurado o app roda em **modo local** (sem persistência).

## Backend (Supabase)

Os dados ficam no schema isolado **`planner`** (tabela `planner.layouts`), exposto
na API do projeto. O cliente é criado com `{ db: { schema: "planner" } }`. RLS
habilitado com policies de `select`/`insert`/`update` liberadas para `anon` (MVP).

## Deploy

Site estático. `vercel.json` desliga build/install e serve a raiz do diretório.
