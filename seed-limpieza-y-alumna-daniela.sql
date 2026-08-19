-- ============================================================
-- Kathia Coach — Portal de Alumnas
-- 1) Limpia abalarezoc@gmail.com como "alumna" (deja el login de
--    administradora intacto, solo borra su rastro de datos de alumna)
-- 2) Crea el historial de progreso para la nueva alumna de prueba
--    "Daniela Vargas"
--
-- CÓMO USAR: Supabase -> SQL Editor -> New query -> pega todo -> Run.
--
-- Nota importante sobre el paso 1: NO borramos la fila de
-- abalarezoc@gmail.com en la tabla "alumnas" — esa fila es la que
-- guarda el flag es_admin=true que te deja entrar al panel de Kathia.
-- Si se borrara, se perdería el acceso de administradora. Lo que
-- hacemos es borrar solo sus registros de progreso y limpiar los
-- campos de "alumna" (peso objetivo, fecha de nacimiento, estatura).
-- Además, admin.html ya se actualizó para nunca mostrar cuentas
-- administradoras en la lista/grilla de alumnas, así que de todas
-- formas no volverá a aparecer ahí.
-- ============================================================

-- 1) Limpieza de abalarezoc@gmail.com
do $$
declare
  v_admin_id uuid;
begin
  select id into v_admin_id from public.alumnas where email = 'abalarezoc@gmail.com';

  if v_admin_id is not null then
    delete from public.progreso where alumna_id = v_admin_id;

    update public.alumnas
    set peso_objetivo = null,
        fecha_nacimiento = null,
        estatura_cm = null,
        plan_ejercicios = null
    where id = v_admin_id;
  end if;
end $$;

-- 2) Historial de progreso para "Daniela Vargas" (ya registrada en signup.html)
do $$
declare
  v_id uuid;
begin
  select id into v_id from public.alumnas where email = 'abalarezoc+daniela@gmail.com';

  if v_id is null then
    raise exception 'No se encontró una alumna con ese correo.';
  end if;

  -- Meta de peso
  update public.alumnas set peso_objetivo = 58 where id = v_id;

  -- Historial de 4 evaluaciones (últimas 3 semanas + hoy)
  insert into public.progreso (alumna_id, fecha, peso_kg, cintura_cm, cadera_cm, notas, animo)
  values
    (v_id, current_date - 21, 64.0, 88.0, 106.0, 'Primera evaluación. Objetivo: bajar grasa y ganar fuerza en tren inferior.', '💪'),
    (v_id, current_date - 14, 63.2, 86.8, 105.0, 'Buena semana, sin molestias. Subimos carga en prensa.', null),
    (v_id, current_date - 7,  62.5, 85.9, 104.3, 'Sigue constante, buena técnica en sentadilla goblet.', '🔥'),
    (v_id, current_date,      61.8, 85.0, 103.5, 'Tercera semana de progreso sostenido.', '🌟');
end $$;
