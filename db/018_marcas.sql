-- Biblioteca de MARCAS — a apresentação dos fabricantes envolvidos no projeto.
--
-- Até aqui os textos institucionais viviam hardcoded em `src/lib/marcas.ts`,
-- sem tela e sem como o consultor corrigir um fato ou trocar um logo. Esta
-- tabela é a versão editável: `chaves` são os trechos que identificam a marca
-- em nome e campo livre ("movimente" casa "Esteira · Movimente RT250"), e
-- `grupo` junta marcas irmãs sob o controlador ("Core Health & Fitness").
--
-- Compatível com o que já está no ar: nenhuma tela existente lê esta tabela e
-- `listarMarcas` devolve [] quando ela ainda não existe (mesmo padrão de
-- `listarAcabamentos`), então o app segue caindo na base local entre o deploy
-- do código e a aplicação desta migração.
--   Reverter: drop table planner.marcas;

create table if not exists planner.marcas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  chaves text[],           -- trechos minúsculos e sem acento usados na detecção
  tipo text check (tipo in ('equipamento','acabamento','mobiliario','acessorio')),
  origem text,             -- país/cidade ("Brasil · Pompéia/SP")
  grupo text,              -- controlador que agrupa marcas irmãs
  resumo text,             -- 2–3 frases factuais, sem adjetivo de vitrine
  site text,
  fonte text,              -- de onde veio o texto — honestidade editorial
  logo text,               -- dataURL (PNG/JPEG reduzido), como equipamentos.imagem (008)
  cor text,                -- cor institucional (#RRGGBB)
  garantia text,
  assistencia text,
  ordem int,               -- ordem sugerida na vitrine (o projeto pode sobrescrever)
  ativo boolean default true,
  criado_em timestamptz default now()
);

alter table planner.marcas enable row level security;

-- Policy é recriada (o Postgres não tem "create policy if not exists"), para o
-- arquivo poder rodar de novo sem erro.
drop policy if exists marcas_all_auth on planner.marcas;
create policy marcas_all_auth on planner.marcas
  for all to authenticated using (true) with check (true);

-- anon não ganha NENHUMA policy: RLS nega tudo para ele. O revoke é obrigatório
-- porque a 007 deixou `alter default privileges` concedendo a anon toda tabela
-- futura do schema — sem isto a tabela nasceria furando o lockdown da 012.
revoke all on planner.marcas from anon;
grant select, insert, update, delete on planner.marcas to authenticated;

-- Semente: as três marcas que já vinham hardcoded no app. Idempotente marca a
-- marca (mesmo `where not exists` da 003) — rodar de novo não duplica nem
-- sobrescreve o texto que o consultor já tiver corrigido.
insert into planner.marcas (nome, chaves, tipo, origem, grupo, resumo, fonte, ordem)
select 'Movement', array['movement','moviment','movimente'], 'equipamento',
  'Brasil · Pompéia/SP', 'Brudden',
  'Marca de equipamentos de ginástica do grupo Brudden, fundado em 1980 em Pompéia (SP), no mercado fitness desde 1987 — primeiro como Moviment, depois Movement. É uma das líderes nacionais do segmento, presente em grande parte das academias do país, com fabricação própria e rede de assistência técnica no Brasil. A linha de musculação EDGE recebeu o iF Design Award (2015), premiação internacional de design industrial.',
  'Site oficial da marca e imprensa especializada', 1
where not exists (select 1 from planner.marcas where nome = 'Movement');

insert into planner.marcas (nome, chaves, tipo, origem, grupo, resumo, fonte, ordem)
select 'Nautilus', array['nautilus'], 'equipamento',
  'Estados Unidos', 'Core Health & Fitness',
  'Marca norte-americana criada por Arthur Jones, que patenteou em 1970 as primeiras máquinas de resistência variável por came — o desenho que ajustou a carga à curva de força do músculo e definiu o padrão das máquinas de musculação modernas. Hoje a linha comercial Nautilus pertence ao grupo Core Health & Fitness, o mesmo das marcas StairMaster, Star Trac e Schwinn.',
  'Site oficial da marca e imprensa especializada', 2
where not exists (select 1 from planner.marcas where nome = 'Nautilus');

insert into planner.marcas (nome, chaves, tipo, origem, grupo, resumo, fonte, ordem)
select 'StairMaster', array['stairmaster','stair master'], 'equipamento',
  'Estados Unidos', 'Core Health & Fitness',
  'Marca norte-americana especializada em simuladores de escada, criadora do StepMill — o aparelho de degraus rolantes contínuos. Pertence ao grupo Core Health & Fitness, o mesmo da Nautilus, Star Trac e Schwinn.',
  'Site oficial da marca e imprensa especializada', 3
where not exists (select 1 from planner.marcas where nome = 'StairMaster');
