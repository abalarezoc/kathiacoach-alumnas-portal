-- Esquema v8: permite que la alumna registre su propio peso inicial al crear su cuenta
-- (hasta ahora, solo Kathia podía insertar registros de progreso).
-- Correr en Supabase → SQL Editor → New query → pega esto → Run.

drop policy if exists "alumna registra su propio progreso" on public.progreso;
create policy "alumna registra su propio progreso"
  on public.progreso for insert
  with check (auth.uid() = alumna_id);
