-- ============================================================
-- Kathia Coach — Portal de Alumnas — Esquema v11
-- Horario fijo para alumnas antiguas.
--
-- Qué agrega:
-- 1. public.horario_fijo — la "regla" semanal de una alumna
--    (ej. "Martes a las 6:00 pm"). Puede tener más de una fila
--    si entrena 2 veces por semana.
-- 2. public.citas_fijas — cada clase individual ya agendada en
--    Cal.com a partir de esa regla (con su propio uid de Cal.com,
--    para poder reagendar o cancelar esa sesión puntual sin tocar
--    las demás).
--
-- Los datos los crean/borran las funciones de Netlify (con la
-- service_role key, que evita estas políticas). Estas políticas
-- son para que la alumna y Kathia puedan LEER esta información
-- directamente desde el navegador.
--
-- CÓMO USAR: Supabase -> SQL Editor -> New query -> pega todo -> Run.
-- Es seguro correrlo más de una vez.
-- ============================================================

create table if not exists public.horario_fijo (
  id bigint generated always as identity primary key,
  alumna_id uuid not null references public.alumnas(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0=domingo ... 6=sábado
  hora time not null,
  calcom_recurring_uid text, -- uid de la primera cita de la serie recurrente en Cal.com
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create index if not exists horario_fijo_alumna_id_idx on public.horario_fijo(alumna_id);

create table if not exists public.citas_fijas (
  id bigint generated always as identity primary key,
  alumna_id uuid not null references public.alumnas(id) on delete cascade,
  horario_fijo_id bigint not null references public.horario_fijo(id) on delete cascade,
  fecha date not null,
  hora time not null,
  calcom_booking_uid text not null unique,
  estado text not null default 'programada' check (estado in ('programada', 'reagendada', 'cancelada', 'completada')),
  creado_en timestamptz not null default now()
);

create index if not exists citas_fijas_alumna_id_idx on public.citas_fijas(alumna_id);
create index if not exists citas_fijas_horario_fijo_id_idx on public.citas_fijas(horario_fijo_id);

alter table public.horario_fijo enable row level security;
alter table public.citas_fijas enable row level security;

-- Una alumna ve su propio horario fijo y sus propias citas.
do $$
begin
  create policy "alumna ve su propio horario fijo"
  on public.horario_fijo for select
  using (auth.uid() = alumna_id);
exception when duplicate_object then
  raise notice 'La política "alumna ve su propio horario fijo" ya existía — sin cambios.';
end $$;

do $$
begin
  create policy "alumna ve sus propias citas fijas"
  on public.citas_fijas for select
  using (auth.uid() = alumna_id);
exception when duplicate_object then
  raise notice 'La política "alumna ve sus propias citas fijas" ya existía — sin cambios.';
end $$;

-- Kathia (administradora) ve el horario fijo y las citas de todas.
do $$
begin
  create policy "admin ve todo el horario fijo"
  on public.horario_fijo for select
  using (public.is_admin());
exception when duplicate_object then
  raise notice 'La política "admin ve todo el horario fijo" ya existía — sin cambios.';
end $$;

do $$
begin
  create policy "admin ve todas las citas fijas"
  on public.citas_fijas for select
  using (public.is_admin());
exception when duplicate_object then
  raise notice 'La política "admin ve todas las citas fijas" ya existía — sin cambios.';
end $$;
