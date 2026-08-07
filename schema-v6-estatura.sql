-- Esquema v6: estatura (para poder calcular el IMC).
-- Correr en Supabase → SQL Editor → New query → pega esto → Run.

alter table public.alumnas add column if not exists estatura_cm numeric(5,1);
