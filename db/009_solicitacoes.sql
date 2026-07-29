-- Caixa de entrada do formulário público do síndico.
-- O síndico (papel anon, sem login) só pode INSERIR aqui — não lê nada de
-- ninguém. O consultor (authenticated) lê, converte em projeto e arquiva.
--
-- Anexos (planta/fotos) ficam embutidos como dataURL no jsonb `anexos`
-- (mesmo padrão do foto_fachada), evitando bucket de storage e upload anônimo.

create table if not exists planner.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz default now(),
  status text not null default 'nova' check (status in ('nova','convertida','arquivada')),

  -- Bloco 1 · Condomínio & contato
  condominio text not null,
  cidade text,
  sindico text not null,
  whatsapp text not null,
  email text,
  unidades int,

  -- Bloco 2 · Espaço & moradores
  dimensoes text not null,           -- "11,0 x 11,2" (largura x comprimento, m)
  localizacao text,
  climatizacao text,
  faixa_etaria text,
  estilos text[] default '{}',       -- multi-seleção de estilo de treino

  -- Bloco 3 · Objetivo & investimento
  visao text not null,               -- "o que essa academia pode se tornar…"
  objetivo text,
  orcamento_teto numeric,
  aprovacao text,
  observacoes text,

  -- Anexos: [{ tipo:'foto'|'planta', nome, dataUrl }]
  anexos jsonb not null default '[]'::jsonb,

  -- Preenchido quando o consultor converte a solicitação em projeto.
  projeto_id uuid
);

alter table planner.solicitacoes enable row level security;

-- anon: SOMENTE inserir (enviar o formulário). Sem select/update/delete.
drop policy if exists solicitacoes_insert_anon on planner.solicitacoes;
create policy solicitacoes_insert_anon on planner.solicitacoes
  for insert to anon with check (true);

-- authenticated (consultor logado): acesso total.
drop policy if exists solicitacoes_all_auth on planner.solicitacoes;
create policy solicitacoes_all_auth on planner.solicitacoes
  for all to authenticated using (true) with check (true);

-- Defesa em profundidade: além da RLS, tira do anon qualquer leitura/edição.
-- (O 007 concedeu grants amplos ao anon via default privileges.)
revoke select, update, delete on planner.solicitacoes from anon;
grant insert on planner.solicitacoes to anon;
grant select, insert, update, delete on planner.solicitacoes to authenticated;

create index if not exists solicitacoes_status_idx on planner.solicitacoes (status, criado_em desc);
