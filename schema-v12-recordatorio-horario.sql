-- ============================================================
-- Kathia Coach — Portal de Alumnas — Esquema v12
-- Recordatorio suave de horario fijo.
--
-- Agrega una fecha "próxima_confirmacion" a cada horario fijo. El
-- portal de la alumna la usa para mostrar, una semana antes, un
-- aviso amigable: "Tu horario sigue siendo X, ¿todo bien o quieres
-- cambiar?" — sin bloquear nada. Las clases se siguen reservando
-- solas de fondo (eso ya lo hace renovar-horarios-fijos.js); esto
-- es solo el recordatorio.
--
-- CÓMO USAR: Supabase -> SQL Editor -> New query -> pega todo -> Run.
-- Es seguro correrlo más de una vez.
-- ============================================================

alter table public.horario_fijo
  add column if not exists proxima_confirmacion date not null default (current_date + 30);
