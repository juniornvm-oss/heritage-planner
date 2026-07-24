-- planner.projetos — engajamento de assessoria com um condomínio (Fase 2).
-- Fase 1 da metodologia (diagnóstico) + orçamento-teto. taxa_assessoria é gerada
-- automaticamente como 0,5% do teto. RLS anon, mesmo padrão das demais tabelas.

create table if not exists planner.projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sindico text,
  contato text,
  endereco text,
  orcamento_teto numeric,
  taxa_assessoria numeric generated always as (round(coalesce(orcamento_teto,0) * 0.005, 2)) stored,
  perfil jsonb,
  infraestrutura jsonb,
  observacoes text,
  sala_id uuid references planner.salas(id) on delete set null,
  status text default 'diagnostico',
  criado_em timestamptz default now()
);

alter table planner.projetos enable row level security;

create policy planner_projetos_select_anon on planner.projetos for select to anon using (true);
create policy planner_projetos_insert_anon on planner.projetos for insert to anon with check (true);
create policy planner_projetos_update_anon on planner.projetos for update to anon using (true) with check (true);
create policy planner_projetos_delete_anon on planner.projetos for delete to anon using (true);
