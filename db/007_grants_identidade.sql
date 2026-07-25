-- Fase de ajustes (Leitura): corrige o "permission denied for table projetos"
-- e enriquece a identificação do condomínio.
--
-- Causa do erro: as tabelas do schema planner foram criadas via SQL, então têm
-- as POLÍTICAS RLS mas NÃO os GRANTs de tabela para o papel anon (a chave
-- publishable). RLS + GRANT são necessários juntos. Este bloco concede os
-- privilégios ao anon/authenticated em todo o schema planner (atual e futuro).

grant usage on schema planner to anon, authenticated;
grant select, insert, update, delete on all tables in schema planner to anon, authenticated;
grant usage, select on all sequences in schema planner to anon, authenticated;

alter default privileges in schema planner
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema planner
  grant usage, select on sequences to anon, authenticated;

-- Identificação de alto padrão: CEP, foto da fachada e contato administrativo.
alter table planner.projetos add column if not exists cep text;
alter table planner.projetos add column if not exists foto_fachada text;   -- dataURL (JPEG reduzido)
alter table planner.projetos add column if not exists contato_admin text;
