-- planner.equipamentos — catálogo de equipamentos (antes hardcoded no index.html).
-- RLS igual à planner.layouts: policies anon para select/insert/update (+ delete).
-- Aplicado no projeto Supabase gdxxbhgpleuivyxmaxnm (schema "planner").

create table if not exists planner.equipamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  marca text,
  modelo text,
  largura_cm int,
  profundidade_cm int,
  zona text check (zona in ('ergo','forca','livre','prep')),
  preco numeric default 0,
  fonte_arquivo text,
  criado_em timestamptz default now()
);

alter table planner.equipamentos enable row level security;

create policy planner_equipamentos_select_anon on planner.equipamentos
  for select to anon using (true);
create policy planner_equipamentos_insert_anon on planner.equipamentos
  for insert to anon with check (true);
create policy planner_equipamentos_update_anon on planner.equipamentos
  for update to anon using (true) with check (true);
create policy planner_equipamentos_delete_anon on planner.equipamentos
  for delete to anon using (true);
