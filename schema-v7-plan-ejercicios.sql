-- Esquema v7: plan de ejercicios (para que Kathia prepare las próximas sesiones).
-- Correr en Supabase → SQL Editor → New query → pega esto → Run.

alter table public.alumnas add column if not exists plan_ejercicios text;
