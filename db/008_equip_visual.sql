-- Cadastro de equipamento com visual: imagem de referência (dataURL) e contorno
-- (footprint vetorial normalizado 0..1) para desenhar o equipamento no editor.

alter table planner.equipamentos add column if not exists imagem text;
alter table planner.equipamentos add column if not exists contorno jsonb;
