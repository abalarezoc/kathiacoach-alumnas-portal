-- ============================================================
-- Kathia Coach — Portal de Alumnas — Esquema v10
-- Permite eliminar (borrar para siempre) a una alumna desde el panel.
--
-- Sin correr esto, el botón "Eliminar definitivamente" del panel de
-- Kathia no va a funcionar — Supabase bloqueará el borrado por
-- seguridad (RLS), aunque el botón de "Archivar" seguirá funcionando
-- normalmente porque ese ya tenía permiso desde antes.
--
-- CÓMO USAR: Supabase -> SQL Editor -> New query -> pega todo -> Run.
-- Es seguro correrlo aunque ya exista alguna de estas políticas —
-- el script lo detecta y no hace nada en ese caso.
-- ============================================================

-- Permite que una cuenta administradora borre la ficha de una alumna
-- (su fila en la tabla alumnas).
do $$
begin
  create policy "admin elimina alumnas"
  on public.alumnas for delete
  to authenticated
  using (public.is_admin());
exception when duplicate_object then
  raise notice 'La política "admin elimina alumnas" ya existía — sin cambios.';
end $$;

-- Permite que una cuenta administradora borre las fotos de progreso
-- guardadas de cualquier alumna, para que no queden fotos huérfanas
-- en el almacenamiento después de eliminarla.
do $$
begin
  create policy "admin elimina fotos de progreso"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'progreso-fotos' and public.is_admin());
exception when duplicate_object then
  raise notice 'La política "admin elimina fotos de progreso" ya existía — sin cambios.';
end $$;
