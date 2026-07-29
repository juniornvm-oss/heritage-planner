-- ETAPA 2 da segurança (GO-LIVE — rodar SÓ depois da versão com login estar
-- em produção e você conseguir logar). Remove o acesso anônimo às tabelas,
-- fechando o banco: a chave publishable sozinha deixa de ler/escrever.
--
-- A única porta que continua aberta ao anon é planner.solicitacoes (INSERT) —
-- o formulário público do síndico.

do $$
declare
  t text;
  tabelas text[] := array['equipamentos','salas','layouts','projetos','fornecedores','cotacoes','acabamentos'];
  acao text;
begin
  foreach t in array tabelas loop
    foreach acao in array array['select','insert','update','delete'] loop
      execute format('drop policy if exists planner_%s_%s_anon on planner.%I', t, acao, t);
    end loop;
  end loop;
end $$;

revoke select, insert, update, delete on all tables in schema planner from anon;
grant insert on planner.solicitacoes to anon;
