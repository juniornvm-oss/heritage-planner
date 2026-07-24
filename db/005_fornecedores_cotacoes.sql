-- planner.fornecedores e planner.cotacoes — entregáveis 04 (3+ cotações por
-- categoria) e 10 (contatos de fornecedores). RLS anon, mesmo padrão.

create table if not exists planner.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  marca text,
  contato text,
  telefone text,
  email text,
  condicoes text,
  criado_em timestamptz default now()
);

alter table planner.fornecedores enable row level security;

create policy planner_fornecedores_select_anon on planner.fornecedores for select to anon using (true);
create policy planner_fornecedores_insert_anon on planner.fornecedores for insert to anon with check (true);
create policy planner_fornecedores_update_anon on planner.fornecedores for update to anon using (true) with check (true);
create policy planner_fornecedores_delete_anon on planner.fornecedores for delete to anon using (true);

create table if not exists planner.cotacoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references planner.projetos(id) on delete cascade,
  categoria text,
  equipamento text,
  fornecedor_id uuid references planner.fornecedores(id) on delete set null,
  marca text,
  modelo text,
  valor numeric,
  garantia text,
  assistencia text,
  prazo text,
  criado_em timestamptz default now()
);

alter table planner.cotacoes enable row level security;

create policy planner_cotacoes_select_anon on planner.cotacoes for select to anon using (true);
create policy planner_cotacoes_insert_anon on planner.cotacoes for insert to anon with check (true);
create policy planner_cotacoes_update_anon on planner.cotacoes for update to anon using (true) with check (true);
create policy planner_cotacoes_delete_anon on planner.cotacoes for delete to anon using (true);
