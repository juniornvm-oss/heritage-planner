-- Segurança — fecha o buraco que reabriu o banco ao anon depois do go-live.
--
-- O problema, em três atos:
--   1. A 007 concedeu `alter default privileges … grant … to anon` no schema
--      planner: TODA tabela criada dali em diante nasce com grant para anon.
--   2. A 012 (lockdown) revogou os grants das tabelas EXISTENTES, mas não
--      desfez os default privileges — a porta ficou armada para o futuro.
--   3. A 016 criou `planner.orcamentos` DEPOIS do lockdown, com policies
--      `to anon using (true)` completas (select/insert/update/delete) e sem
--      revoke. Resultado: qualquer pessoa com a chave publishable (que está em
--      public/config.js, como esperado) lia, alterava e apagava cabeçalhos de
--      proposta — CNPJ, totais, caminhos de arquivo.
--
-- Este arquivo é idempotente (pode rodar de novo sem erro) e não muda nada
-- para o consultor logado (authenticated segue com acesso total).

-- ── 1 · planner.orcamentos: anon perde policies e grants ─────────────────────
drop policy if exists planner_orcamentos_select_anon on planner.orcamentos;
drop policy if exists planner_orcamentos_insert_anon on planner.orcamentos;
drop policy if exists planner_orcamentos_update_anon on planner.orcamentos;
drop policy if exists planner_orcamentos_delete_anon on planner.orcamentos;
revoke all on planner.orcamentos from anon;

-- ── 2 · Desarma os default privileges da 007 para o anon ─────────────────────
-- Sem isto, cada `create table` futuro no schema planner nasce com grant para
-- anon e o lockdown vira um alvo móvel (o revoke da 018 em marcas foi manual
-- justamente por isso). O authenticated continua recebendo os defaults da 007.
alter default privileges in schema planner
  revoke select, insert, update, delete on tables from anon;
alter default privileges in schema planner
  revoke usage, select on sequences from anon;

-- Varredura de segurança: revoga de novo TODAS as tabelas atuais (pega a
-- orcamentos e qualquer outra criada entre a 012 e agora)…
revoke select, insert, update, delete on all tables in schema planner from anon;
-- …e reabre a única porta pública que deve existir: o formulário do síndico.
grant insert on planner.solicitacoes to anon;

-- ── 3 · Formulário público: anon não escolhe status nem projeto_id ───────────
-- O cliente já não envia esses campos, mas RLS não pode confiar no cliente:
-- com `with check (true)`, qualquer um podia inserir direto pela API uma
-- solicitação já 'arquivada' (invisível na caixa "nova") ou apontando para um
-- projeto_id de outro condomínio.
drop policy if exists solicitacoes_insert_anon on planner.solicitacoes;
create policy solicitacoes_insert_anon on planner.solicitacoes
  for insert to anon
  with check (status = 'nova' and projeto_id is null);

-- ── 4 · Índice que faltava: toda carga da Curadoria filtra por projeto_id ────
create index if not exists cotacoes_projeto_idx on planner.cotacoes (projeto_id);
