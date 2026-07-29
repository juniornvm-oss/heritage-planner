-- ⚠️ APLICAR SÓ NO "GO-LIVE" — junto com o deploy da versão COM login.
--
-- Tranca o banco: troca as policies das tabelas existentes de `anon` para
-- `authenticated`. A partir daqui, a chave publishable sozinha (sem login)
-- NÃO lê nem escreve mais nada — o link da plataforma passa a exigir sessão.
--
-- NÃO aplicar antes de a versão com login estar em produção, senão o app
-- no ar (que hoje usa anon) para de funcionar até alguém logar.
--
-- A única porta que continua aberta ao anon é planner.solicitacoes
-- (INSERT), definida em 009 — é o formulário público do síndico.

do $$
declare
  t text;
  tabelas text[] := array['equipamentos','salas','layouts','projetos','fornecedores','cotacoes','acabamentos'];
  acao text;
begin
  foreach t in array tabelas loop
    -- Remove as policies anon existentes (nomes usados em 001–006).
    foreach acao in array array['select','insert','update','delete'] loop
      execute format('drop policy if exists planner_%s_%s_anon on planner.%I', t, acao, t);
    end loop;
    -- Recria como authenticated, cobrindo tudo numa policy só.
    execute format('drop policy if exists planner_%s_auth on planner.%I', t, t);
    execute format(
      'create policy planner_%s_auth on planner.%I for all to authenticated using (true) with check (true)',
      t, t);
  end loop;
end $$;

-- Tira do anon os grants amplos concedidos no 007 (mantém só o insert em
-- solicitacoes, que é reconcedido no 009).
revoke select, insert, update, delete on all tables in schema planner from anon;
grant insert on planner.solicitacoes to anon;

-- Garante que o consultor logado continua com acesso a tudo.
grant select, insert, update, delete on all tables in schema planner to authenticated;
