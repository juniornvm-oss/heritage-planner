-- Honorário por projeto: cada engajamento pode ter seu próprio percentual.
-- Antes o valor era fixo em 0,5% dentro da coluna gerada `taxa_assessoria`;
-- agora ela passa a usar planner.projetos.honorario_pct (em %, ex.: 0.5 = 0,5%),
-- caindo no padrão 0,5% quando o projeto não define nada.

alter table planner.projetos add column if not exists honorario_pct numeric;

-- Coluna gerada não aceita ALTER da expressão: recria com a nova fórmula.
alter table planner.projetos drop column if exists taxa_assessoria;
alter table planner.projetos add column taxa_assessoria numeric
  generated always as (
    round(coalesce(orcamento_teto, 0) * coalesce(honorario_pct, 0.5) / 100, 2)
  ) stored;

comment on column planner.projetos.honorario_pct is
  '% de honorário da assessoria neste projeto (0.5 = 0,5%). Null usa o padrão do cadastro.';
