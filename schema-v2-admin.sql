-- ============================================================
-- Kathia Coach — Portal de Alumnas — Esquema v2
-- Agrega: rol de administradora (Kathia), permisos para que ella
-- vea y edite el progreso de TODAS las alumnas, y permiso para que
-- cada alumna pueda poner su propio nombre al registrarse.
--
-- CÓMO USAR: SQL Editor -> New query -> pega todo -> Run.
-- Es seguro correrlo aunque ya hayas corrido schema.sql antes.
-- ============================================================

-- 1) Columna para marcar quién es administradora
alter table public.alumnas add column if not exists es_admin boolean not null default false;

-- 2) Función que revisa si el usuario actual es administradora,
--    sin caer en recursión de políticas (patrón estándar de Supabase)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select es_admin from public.alumnas where id = auth.uid()), false);
$$;

-- 3) Kathia puede ver y modificar el progreso de TODAS las alumnas
drop policy if exists "admin ve todo el progreso" on public.progreso;
create policy "admin ve todo el progreso"
  on public.progreso for select
  using (public.is_admin());

drop policy if exists "admin inserta progreso" on public.progreso;
create policy "admin inserta progreso"
  on public.progreso for insert
  with check (public.is_admin());

drop policy if exists "admin actualiza progreso" on public.progreso;
create policy "admin actualiza progreso"
  on public.progreso for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admin borra progreso" on public.progreso;
create policy "admin borra progreso"
  on public.progreso for delete
  using (public.is_admin());

-- 4) Kathia puede ver la lista completa de alumnas (para el dashboard)
drop policy if exists "admin ve todas las alumnas" on public.alumnas;
create policy "admin ve todas las alumnas"
  on public.alumnas for select
  using (public.is_admin());

-- 5) Una alumna puede actualizar SU PROPIO nombre (para completar su
--    perfil al registrarse), pero NUNCA puede marcarse a sí misma
--    como administradora (el "with check" lo impide).
drop policy if exists "alumna actualiza su propio nombre" on public.alumnas;
create policy "alumna actualiza su propio nombre"
  on public.alumnas for update
  using (auth.uid() = id)
  with check (auth.uid() = id and es_admin = false);

-- ============================================================
-- ÚLTIMO PASO MANUAL: marca a Kathia (o tu usuario de prueba)
-- como administradora. Reemplaza el correo por el real y corre
-- esto por separado:
-- ============================================================
-- update public.alumnas set es_admin = true where email = 'TU-CORREO-AQUI';
