-- ============================================================
-- Kathia Coach — Portal de Alumnas — Esquema v9
-- Elimina las columnas de cintura y cadera (ya no se usan en el
-- portal ni en el panel de Kathia) y todos los datos que tuvieran.
--
-- CÓMO USAR: Supabase -> SQL Editor -> New query -> pega todo -> Run.
-- Es seguro correrlo aunque alguna alumna ya tenga datos ahí —
-- se borran junto con la columna.
-- ============================================================

alter table public.progreso drop column if exists cintura_cm;
alter table public.progreso drop column if exists cadera_cm;
