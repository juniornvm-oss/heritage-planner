-- Fase A (app iPad): coluna de cena do editor + biblioteca de acabamentos.

alter table planner.projetos add column if not exists cena jsonb;

create table if not exists planner.acabamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text check (tipo in ('piso','parede','teto','outro')),
  categoria text,
  cor text,
  textura_url text,
  preco_m2 numeric,
  fornecedor text,
  imagem_url text,
  criado_em timestamptz default now()
);

alter table planner.acabamentos enable row level security;

drop policy if exists planner_acabamentos_select_anon on planner.acabamentos;
drop policy if exists planner_acabamentos_insert_anon on planner.acabamentos;
drop policy if exists planner_acabamentos_update_anon on planner.acabamentos;
drop policy if exists planner_acabamentos_delete_anon on planner.acabamentos;
create policy planner_acabamentos_select_anon on planner.acabamentos for select to anon using (true);
create policy planner_acabamentos_insert_anon on planner.acabamentos for insert to anon with check (true);
create policy planner_acabamentos_update_anon on planner.acabamentos for update to anon using (true) with check (true);
create policy planner_acabamentos_delete_anon on planner.acabamentos for delete to anon using (true);
