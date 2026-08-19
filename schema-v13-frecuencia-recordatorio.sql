-- ============================================================
-- Kathia Coach — Portal de Alumnas — Esquema v13
-- Frecuencia del recordatorio de horario fijo.
--
-- Agrega recordatorio_intervalo_dias: cada cuántos días la alumna
-- quiere que le vuelva a aparecer el aviso de "¿todo sigue igual?"
-- (30 = cada mes, 60 = cada 2 meses, 90 = cada 3 meses, 0 = nunca).
-- Ella misma lo elige desde el aviso en su portal.
--
-- CÓMO USAR: Supabase -> SQL Editor -> New query -> pega todo -> Run.
-- Es seguro correrlo más de una vez.
-- ============================================================

alter table public.horario_fijo
  add column if not exists recordatorio_intervalo_dias integer not null default 30;
