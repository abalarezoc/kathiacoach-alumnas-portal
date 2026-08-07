-- Esquema v4: ícono de ánimo por registro.
-- Correr en Supabase → SQL Editor → New query → pega esto → Run.

alter table public.progreso add column if not exists animo text;
