-- Ficha técnica do equipamento (Etapa Layout profissional).
-- Uma única coluna jsonb aditiva — reversível com `alter table ... drop column tecnico`.
-- Campos armazenados: categoria, subcategoria, altura_cm, peso_kg, fornecedor,
-- codigo, precisa_tomada, voltagem, ponto_internet, dist_parede_cm,
-- dist_lateral_cm, dist_frontal_cm, uso_frontal_cm, uso_lateral_cm,
-- seguranca_cm, obs, ativo.
-- O app funciona sem esta coluna (fallback local); aplicar quando conveniente.

alter table planner.equipamentos add column if not exists tecnico jsonb;
