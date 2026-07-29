-- ETAPA 1 da segurança (ADITIVA — pode rodar a qualquer momento, não quebra nada).
-- Dá acesso ao papel `authenticated` (usuário logado) SEM tirar o `anon`.
-- Assim o app atual (anon) e o app novo com login (authenticated) funcionam
-- ao mesmo tempo — permite testar o login antes do go-live.

do $$
declare
  t text;
  tabelas text[] := array['equipamentos','salas','layouts','projetos','fornecedores','cotacoes','acabamentos'];
begin
  foreach t in array tabelas loop
    execute format('drop policy if exists planner_%s_auth on planner.%I', t, t);
    execute format(
      'create policy planner_%s_auth on planner.%I for all to authenticated using (true) with check (true)',
      t, t);
  end loop;
end $$;

grant usage on schema planner to authenticated;
grant select, insert, update, delete on all tables in schema planner to authenticated;
grant usage, select on all sequences in schema planner to authenticated;
