-- Revisa el estado real de la cuenta de MariaKatia:
-- ¿existe la cuenta? ¿tiene algún registro de progreso (peso incluido)?

select id, nombre, email, es_admin, creado_en
from public.alumnas
where email ilike '%mariakatia%' or nombre ilike '%maria%katia%' or nombre ilike '%mariakatia%';

-- Reemplaza el UUID de abajo por el id que salga arriba para ver su progreso:
-- select * from public.progreso where alumna_id = 'PEGA-AQUI-EL-ID';
