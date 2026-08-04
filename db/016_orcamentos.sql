-- Orçamentos de fornecedor lidos de PDF (Fase 03 · Curadoria).
--
-- `planner.orcamentos` guarda o CABEÇALHO de cada proposta recebida (um PDF =
-- um orçamento: fornecedor, validade, prazo, garantia, pagamento, total) e
-- `planner.cotacoes` passa a guardar as LINHAS daquele orçamento, apontando
-- para ele por `orcamento_id`.
--
-- Aditiva e reversível: as colunas novas de `cotacoes` são opcionais, então as
-- cotações digitadas à mão continuam funcionando exatamente como antes.
--   Reverter: drop table planner.orcamentos cascade;
--             alter table planner.cotacoes drop column orcamento_id, ... ;

create table if not exists planner.orcamentos (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid references planner.projetos(id) on delete cascade,
  fornecedor_id uuid references planner.fornecedores(id) on delete set null,
  fornecedor_nome text,          -- nome lido do PDF (antes de virar fornecedor)
  cnpj text,
  arquivo_nome text,             -- nome original do PDF
  arquivo_path text,             -- caminho no bucket "orcamentos" (014)
  documento text,                -- nº da proposta/orçamento
  data_orcamento text,
  validade text,
  prazo_entrega text,
  garantia text,
  pagamento text,
  frete text,
  total numeric,                 -- total do PDF (conferido na tela)
  escolhido boolean default false, -- é uma das propostas finais
  observacoes text,
  criado_em timestamptz default now()
);

alter table planner.orcamentos enable row level security;

-- Policies são recriadas (o Postgres não tem "create policy if not exists"),
-- para o arquivo poder rodar de novo sem erro.
drop policy if exists planner_orcamentos_select_anon on planner.orcamentos;
drop policy if exists planner_orcamentos_insert_anon on planner.orcamentos;
drop policy if exists planner_orcamentos_update_anon on planner.orcamentos;
drop policy if exists planner_orcamentos_delete_anon on planner.orcamentos;

create policy planner_orcamentos_select_anon on planner.orcamentos for select to anon using (true);
create policy planner_orcamentos_insert_anon on planner.orcamentos for insert to anon with check (true);
create policy planner_orcamentos_update_anon on planner.orcamentos for update to anon using (true) with check (true);
create policy planner_orcamentos_delete_anon on planner.orcamentos for delete to anon using (true);

drop policy if exists planner_orcamentos_auth on planner.orcamentos;
create policy planner_orcamentos_auth on planner.orcamentos
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on planner.orcamentos to authenticated;

create index if not exists orcamentos_projeto_idx on planner.orcamentos (projeto_id);

-- Linhas do orçamento (reaproveita planner.cotacoes)
alter table planner.cotacoes add column if not exists orcamento_id uuid
  references planner.orcamentos(id) on delete cascade;
alter table planner.cotacoes add column if not exists qtd numeric;
alter table planner.cotacoes add column if not exists preco_un numeric;
alter table planner.cotacoes add column if not exists tipo text;        -- 'equipamento' | 'acessorio'
alter table planner.cotacoes add column if not exists escolhida boolean default false;

create index if not exists cotacoes_orcamento_idx on planner.cotacoes (orcamento_id);
