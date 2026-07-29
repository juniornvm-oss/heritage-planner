-- Cadastro do consultor (dados que entram no PDF de entrega).
-- Linha única (id = 1). Só o consultor logado acessa; anon não vê nada.

create table if not exists planner.config_consultor (
  id int primary key default 1 check (id = 1),
  consultor text,          -- nome do responsável técnico
  empresa text,            -- marca/empresa (ex.: Heritage)
  registro text,           -- CREF/CAU/CREA, se houver
  documento text,          -- CNPJ ou CPF
  whatsapp text,
  email text,
  site text,               -- site / Instagram
  cidade_uf text,
  honorario_pct numeric default 0.5,   -- % de honorário (hoje travado em 0,5)
  logo text,               -- dataURL (opcional) — logotipo no PDF
  rodape text,             -- assinatura/rodapé do dossiê
  atualizado_em timestamptz default now()
);

alter table planner.config_consultor enable row level security;

drop policy if exists config_consultor_all_auth on planner.config_consultor;
create policy config_consultor_all_auth on planner.config_consultor
  for all to authenticated using (true) with check (true);

-- anon não tem NENHUMA policy aqui: RLS nega tudo para o anon.
revoke all on planner.config_consultor from anon;
grant select, insert, update, delete on planner.config_consultor to authenticated;

-- Semente da linha única (fica em branco até o consultor preencher).
insert into planner.config_consultor (id) values (1) on conflict (id) do nothing;
