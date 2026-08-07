-- ============================================================
-- Kathia Coach — Portal de Alumnas
-- Esquema de base de datos para Supabase (Postgres)
--
-- CÓMO USAR ESTE ARCHIVO:
-- 1. Entra a tu proyecto en supabase.com -> SQL Editor -> New query
-- 2. Pega todo este archivo y dale "Run"
-- 3. Listo, las tablas y la seguridad quedan configuradas
-- ============================================================

-- Tabla de alumnas (perfil, vinculado 1:1 con el usuario de Supabase Auth)
create table if not exists public.alumnas (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Tabla de registro de progreso (una fila por medición/sesión)
create table if not exists public.progreso (
  id bigint generated always as identity primary key,
  alumna_id uuid not null references public.alumnas(id) on delete cascade,
  fecha date not null default current_date,
  peso_kg numeric(5,2),
  medidas text,       -- texto libre: cintura, cadera, etc. (o divídelo en más columnas si prefieres)
  notas text,          -- comentario de Kathia sobre la sesión
  creado_en timestamptz not null default now()
);

create index if not exists progreso_alumna_id_idx on public.progreso(alumna_id);

-- ============================================================
-- Seguridad: Row Level Security (RLS)
-- Cada alumna SOLO puede leer su propia fila y su propio progreso.
-- Nadie puede escribir desde el portal — los datos los entra Kathia
-- directamente en el Table Editor de Supabase (con su cuenta de dueña
-- del proyecto, que no está sujeta a estas políticas).
-- ============================================================

alter table public.alumnas enable row level security;
alter table public.progreso enable row level security;

drop policy if exists "alumna ve su propio perfil" on public.alumnas;
create policy "alumna ve su propio perfil"
  on public.alumnas for select
  using (auth.uid() = id);

drop policy if exists "alumna ve su propio progreso" on public.progreso;
create policy "alumna ve su propio progreso"
  on public.progreso for select
  using (auth.uid() = alumna_id);

-- ============================================================
-- Automatización: cuando Kathia crea una alumna nueva en
-- Authentication -> Users (con su email), se crea automáticamente
-- su fila en "alumnas" para que puedas completarle el nombre.
-- ============================================================

create or replace function public.crear_perfil_alumna()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.alumnas (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_alumna();

-- ============================================================
-- Datos de ejemplo (BORRA este bloque si no quieres datos de prueba)
-- Reemplaza el UUID por el id real de una alumna una vez creada,
-- lo encuentras en Authentication -> Users.
-- ============================================================
-- insert into public.progreso (alumna_id, fecha, peso_kg, medidas, notas)
-- values ('00000000-0000-0000-0000-000000000000', current_date, 68.5, 'Cintura 78cm', 'Buena sesión, subimos peso en sentadilla');
