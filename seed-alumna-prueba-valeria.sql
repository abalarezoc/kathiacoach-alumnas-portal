-- ============================================================
-- Kathia Coach — Portal de Alumnas
-- Datos de prueba: historial de progreso para "Valeria Campos"
--
-- CÓMO USAR:
-- 1. Primero regístrala en signup.html (correo abalarezoc+valeria@gmail.com,
--    dejando el campo "Peso actual" en blanco).
-- 2. Luego corre este archivo completo en Supabase -> SQL Editor -> New query -> Run.
--    Busca a la alumna por su correo, así que no necesitas copiar ningún UUID.
-- ============================================================

do $$
declare
  v_id uuid;
begin
  select id into v_id from public.alumnas where email = 'abalarezoc+valeria@gmail.com';

  if v_id is null then
    raise exception 'No se encontró una alumna con ese correo. Regístrala primero en signup.html';
  end if;

  -- Meta de peso que Kathia le fijó
  update public.alumnas set peso_objetivo = 62 where id = v_id;

  -- Historial de 5 evaluaciones (últimas 4 semanas + hoy), tendencia de mejora
  insert into public.progreso (alumna_id, fecha, peso_kg, cintura_cm, cadera_cm, notas, animo)
  values
    (v_id, current_date - 28, 68.5, 82.0, 102.0, 'Primera evaluación. Buena disposición, empezamos con rutina de fuerza 3x/semana.', '💪'),
    (v_id, current_date - 21, 67.6, 81.0, 101.3, 'Buena adherencia esta semana. Ajustamos peso en sentadilla.', null),
    (v_id, current_date - 14, 67.0, 80.2, 100.6, 'Notamos mejora en resistencia. Sigue con la alimentación indicada.', '🔥'),
    (v_id, current_date - 7,  66.2, 79.3, 99.8,  'Buen avance, bajó casi 1kg esta semana.', null),
    (v_id, current_date,      65.6, 78.2, 99.2,  'Cuarta semana consecutiva de progreso. Vamos muy bien.', '🌟');
end $$;
