-- Bucket privado para PDFs de orçamento anexados aos projetos.
-- Reversível: delete from storage.buckets where id = 'orcamentos' (após limpar objetos).
-- Acesso somente para usuários autenticados (mesmo modelo do restante da plataforma).

insert into storage.buckets (id, name, public)
values ('orcamentos', 'orcamentos', false)
on conflict (id) do nothing;

drop policy if exists orcamentos_select_auth on storage.objects;
create policy orcamentos_select_auth on storage.objects
  for select to authenticated using (bucket_id = 'orcamentos');

drop policy if exists orcamentos_insert_auth on storage.objects;
create policy orcamentos_insert_auth on storage.objects
  for insert to authenticated with check (bucket_id = 'orcamentos');

drop policy if exists orcamentos_delete_auth on storage.objects;
create policy orcamentos_delete_auth on storage.objects
  for delete to authenticated using (bucket_id = 'orcamentos');
