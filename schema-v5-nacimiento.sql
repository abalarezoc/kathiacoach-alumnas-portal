-- Esquema v5: fecha de nacimiento (para edad y cumpleaños en el panel de Kathia).
-- Correr en Supabase → SQL Editor → New query → pega esto → Run.

alter table public.alumnas add column if not exists fecha_nacimiento date;
