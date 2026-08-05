-- Contatos múltiplos e endereço destrinchado (Fase 01 · Leitura).
--
-- `contatos`      — lista de pessoas do condomínio, cada uma com papel
--                   (síndico, administrador…), WhatsApp e e-mail.
-- `endereco_det`  — endereço em campos separados (rua, número, bairro,
--                   cidade, estado), preenchidos pelo CEP.
--
-- Aditiva: as colunas antigas `sindico`, `contato`, `contato_admin` e
-- `endereco` continuam preenchidas pelo app, então nada que já lê o projeto
-- (Dossiê, listas, formulário do síndico) precisa mudar.
--   Reverter: alter table planner.projetos drop column contatos, drop column endereco_det;

alter table planner.projetos add column if not exists contatos jsonb;
alter table planner.projetos add column if not exists endereco_det jsonb;
