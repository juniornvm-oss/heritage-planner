-- Teto de tamanho no formulário público do síndico.
--
-- O anon pode INSERIR em planner.solicitacoes sem login (é o formulário público).
-- Sem limite no banco, quem tiver a URL pode gravar linhas de dezenas de MB —
-- o app limita no cliente, mas o cliente é o navegador do síndico e não vale
-- como controle. Aqui o limite é do servidor.
--
-- Os valores acompanham o formulário: 25 MB de anexos (dataURL base64) e textos
-- com folga sobre o que um síndico escreve de verdade.
--
-- Reversível: alter table planner.solicitacoes drop constraint <nome>;

-- Linhas já existentes podem estourar o limite; NOT VALID aplica a regra só aos
-- INSERTs novos. Rode o `validate` do fim depois de conferir/limpar o histórico.

alter table planner.solicitacoes
  drop constraint if exists solicitacoes_anexos_tamanho;
alter table planner.solicitacoes
  add constraint solicitacoes_anexos_tamanho
  check (octet_length(anexos::text) <= 26214400)  -- 25 MB
  not valid;

alter table planner.solicitacoes
  drop constraint if exists solicitacoes_textos_tamanho;
alter table planner.solicitacoes
  add constraint solicitacoes_textos_tamanho
  check (
    length(condominio)  <= 200
    and length(sindico) <= 200
    and length(whatsapp) <= 40
    and length(coalesce(cidade, ''))      <= 200
    and length(coalesce(email, ''))       <= 200
    and length(dimensoes)                 <= 100
    and length(visao)                     <= 5000
    and length(coalesce(observacoes, '')) <= 5000
    and coalesce(array_length(estilos, 1), 0) <= 20
  )
  not valid;

-- Depois de conferir que o histórico cabe nos limites:
--   select id, condominio, octet_length(anexos::text) as bytes
--     from planner.solicitacoes order by bytes desc limit 10;
--   alter table planner.solicitacoes validate constraint solicitacoes_anexos_tamanho;
--   alter table planner.solicitacoes validate constraint solicitacoes_textos_tamanho;
