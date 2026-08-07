-- Esquema v3: medidas adicionales, fotos de progreso, y meta de peso.
-- Correr esto completo en Supabase → SQL Editor → New query → Run.

-- 1. Nuevas columnas en progreso: cintura, cadera, y referencia a la foto
alter table public.progreso add column if not exists cintura_cm numeric(5,2);
alter table public.progreso add column if not exists cadera_cm numeric(5,2);
alter table public.progreso add column if not exists foto_path text;

-- 2. Meta de peso por alumna (la fija Kathia desde el panel admin)
alter table public.alumnas add column if not exists peso_objetivo numeric(5,2);

-- 3. Permitir que la administradora actualice cualquier fila de alumnas
--    (necesario para poder guardar la meta de peso desde admin.html)
drop policy if exists "admin actualiza alumnas" on public.alumnas;
create policy "admin actualiza alumnas"
  on public.alumnas for update
  using (public.is_admin())
  with check (public.is_admin());

-- 4. Bucket de Storage privado para las fotos de progreso
insert into storage.buckets (id, name, public)
values ('progreso-fotos', 'progreso-fotos', false)
on conflict (id) do nothing;

-- 5. Políticas del bucket: cada foto vive en una carpeta con el id de la alumna
--    (ej. "6cd155d2-.../2026-08-07.jpg"), así se sabe de quién es cada una.
drop policy if exists "alumna ve sus propias fotos" on storage.objects;
create policy "alumna ve sus propias fotos"
  on storage.objects for select
  using (
    bucket_id = 'progreso-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "admin ve todas las fotos" on storage.objects;
create policy "admin ve todas las fotos"
  on storage.objects for select
  using (bucket_id = 'progreso-fotos' and public.is_admin());

drop policy if exists "admin sube fotos" on storage.objects;
create policy "admin sube fotos"
  on storage.objects for insert
  with check (bucket_id = 'progreso-fotos' and public.is_admin());

drop policy if exists "admin borra fotos" on storage.objects;
create policy "admin borra fotos"
  on storage.objects for delete
  using (bucket_id = 'progreso-fotos' and public.is_admin());
