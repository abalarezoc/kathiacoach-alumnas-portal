-- ============================================================
-- Kathia Coach — Portal de Alumnas — Esquema v15
-- Clases adicionales (puntuales), además del horario fijo.
--
-- Qué agrega:
-- citas_fijas.horario_fijo_id ahora puede ser NULL. Hasta ahora toda
-- fila de citas_fijas venía de un horario_fijo (la regla semanal de
-- una alumna). Con esto, una fila con horario_fijo_id = NULL es una
-- clase suelta que la alumna agendó por su cuenta además de su
-- horario fijo (o sin tener ninguno) — se cancela o reagenda igual
-- que cualquier otra cita, solo que no pertenece a ninguna serie
-- semanal.
--
-- CÓMO USAR: Supabase -> SQL Editor -> New query -> pega todo -> Run.
-- Es seguro correrlo más de una vez.
-- ============================================================

alter table public.citas_fijas alter column horario_fijo_id drop not null;
