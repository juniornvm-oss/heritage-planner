-- Marcas comerciais da biblioteca de maquinário (Nautilus já estava na 018).
-- Idempotente: não sobrescreve texto que o consultor já tiver editado.

insert into planner.marcas (nome, chaves, tipo, origem, grupo, resumo, site, fonte, ordem)
select 'Life Fitness', array['life fitness','lifefitness'], 'equipamento',
  'Estados Unidos · Franklin Park/IL', 'Life Fitness',
  'Marca norte-americana de equipamentos de ginástica fundada em 1977, conhecida pelas esteiras e elípticos da linha Integrity e pelas máquinas de musculação Optima e Circuit. É uma das marcas mais presentes em academias comerciais no mundo, com assistência técnica e peças no Brasil.',
  'https://www.lifefitness.com',
  'Site oficial da marca e imprensa especializada', 4
where not exists (select 1 from planner.marcas where nome = 'Life Fitness');

insert into planner.marcas (nome, chaves, tipo, origem, grupo, resumo, site, fonte, ordem)
select 'Hammer Strength', array['hammer strength','hammerstrength'], 'equipamento',
  'Estados Unidos', 'Life Fitness',
  'Linha de musculação de carga livre (plate loaded) do grupo Life Fitness, criada para o treino de força com anilhas e movimento independente por lado (Iso-Lateral). É a linha que costuma acompanhar a Life Fitness em academias que separam cardio guiado e peso livre.',
  'https://www.lifefitness.com',
  'Site oficial da marca e imprensa especializada', 5
where not exists (select 1 from planner.marcas where nome = 'Hammer Strength');

insert into planner.marcas (nome, chaves, tipo, origem, grupo, resumo, site, fonte, ordem)
select 'Matrix', array['matrix'], 'equipamento',
  'Estados Unidos · Cottage Grove/WI', 'Johnson Health Tech',
  'Marca do grupo taiwanês Johnson Health Tech, com fabricação e sede comercial nos Estados Unidos. No segmento comercial é conhecida pelas esteiras da série T, pelo ClimbMill e pelas linhas Ultra e Versa de musculação guiada, com presença consolidada em academias e condomínios no Brasil.',
  'https://pt-br.matrixfitness.com',
  'Site oficial da marca e imprensa especializada', 6
where not exists (select 1 from planner.marcas where nome = 'Matrix');

insert into planner.marcas (nome, chaves, tipo, origem, grupo, resumo, site, fonte, ordem)
select 'Technogym', array['technogym','tecnogym','techno gym'], 'equipamento',
  'Itália · Cesena', 'Technogym',
  'Fabricante italiana fundada em 1983 em Cesena, fornecedora oficial de equipamentos de várias edições dos Jogos Olímpicos. No comercial brasileiro entram as linhas Excite (cardio), Selection (carga selecionada), Pure Strength (peso livre) e Skill (Skillmill e Skillrow).',
  'https://www.technogym.com',
  'Site oficial da marca e imprensa especializada', 7
where not exists (select 1 from planner.marcas where nome = 'Technogym');
