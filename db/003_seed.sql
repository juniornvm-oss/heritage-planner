-- Seeds: catálogo de equipamentos + sala Heritage (config atual).
-- Idempotente: só insere se as tabelas estiverem vazias / sem a sala.

-- Catálogo (migrado do CATALOGO hardcoded do index.html)
insert into planner.equipamentos (nome, marca, modelo, largura_cm, profundidade_cm, zona, preco, fonte_arquivo)
select v.nome, null, null, v.largura_cm, v.profundidade_cm, v.zona, v.preco, 'seed'
from (values
  ('Esteira', 90, 205, 'ergo', 0),
  ('Escada', 86, 147, 'ergo', 45000),
  ('Elíptico', 66, 165, 'ergo', 15000),
  ('Bike Horizontal', 66, 168, 'ergo', 14800),
  ('Bike Spinning', 51, 110, 'ergo', 8200),
  ('Cross + Smith', 219, 163, 'livre', 40900),
  ('Squat Machine', 224, 133, 'forca', 27700),
  ('Leg Press 45°', 246, 158, 'forca', 40600),
  ('Elevação Pélvica', 158, 152, 'forca', 13800),
  ('Lying Leg Curl', 178, 99, 'forca', 29100),
  ('Dual Leg Extension', 142, 94, 'forca', 23200),
  ('Dual Inner', 145, 69, 'forca', 21500),
  ('Impact Delt Raise', 130, 117, 'forca', 21500),
  ('Puxada + Remada', 198, 82, 'forca', 21800),
  ('Cross Over Angular', 120, 270, 'forca', 0),
  ('Estante Dumbbells', 60, 240, 'livre', 0),
  ('Torre Halteres', 60, 90, 'livre', 0),
  ('Banco 0-90°', 155, 64, 'livre', 4600),
  ('Banco Declinado', 135, 86, 'livre', 0),
  ('Banco Supino', 130, 55, 'livre', 0),
  ('Espaldar', 120, 20, 'prep', 0),
  ('Colchonetes', 80, 35, 'prep', 0)
) as v(nome, largura_cm, profundidade_cm, zona, preco)
where not exists (select 1 from planner.equipamentos);

-- Sala Heritage (1100×1120) com a config atual
insert into planner.salas (nome, largura_cm, profundidade_cm, config)
select 'Heritage', 1100, 1120, '{
  "pisos": [
    {"nome":"Vinílico 240","y0":0,"y1":240,"cor":"#241C12"},
    {"nome":"Borracha 480","y0":240,"y1":720,"cor":"#14161A"},
    {"nome":"Pista 100","y0":720,"y1":820,"cor":"#4A1E1E"},
    {"nome":"Vinílico 300","y0":820,"y1":1120,"cor":"#241C12"}
  ],
  "pilar": {"x":358,"y":302,"w":33,"h":47},
  "corredor": {"x":750,"w":100},
  "paredes": {"top":"PAREDE PILAR · 1100","bottom":"PAREDE PORTA","left":"ESPELHO · 1120","right":"VIDRAÇA"},
  "pista_label": "PISTA · VIDRAÇA ↔ ESPELHO"
}'::jsonb
where not exists (select 1 from planner.salas where nome = 'Heritage');

-- Vincula o layout existente ("heritage") à sala Heritage
update planner.layouts set sala_id = (select id from planner.salas where nome = 'Heritage' limit 1)
where nome = 'heritage' and sala_id is null;
