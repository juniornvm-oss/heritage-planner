-- planner.salas — salas/ambientes (antes a sala Heritage era hardcoded).
-- config jsonb guarda pisos, pilar, corredor e paredes nomeadas.
-- planner.layouts ganha sala_id referenciando planner.salas.

create table if not exists planner.salas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  largura_cm int,
  profundidade_cm int,
  config jsonb,
  criado_em timestamptz default now()
);

alter table planner.salas enable row level security;

create policy planner_salas_select_anon on planner.salas
  for select to anon using (true);
create policy planner_salas_insert_anon on planner.salas
  for insert to anon with check (true);
create policy planner_salas_update_anon on planner.salas
  for update to anon using (true) with check (true);
create policy planner_salas_delete_anon on planner.salas
  for delete to anon using (true);

alter table planner.layouts
  add column if not exists sala_id uuid references planner.salas(id) on delete set null;
