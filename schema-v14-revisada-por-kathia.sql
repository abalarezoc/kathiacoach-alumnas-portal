-- ============================================================
-- Kathia Coach — Portal de Alumnas — Esquema v14
-- Aviso de "alumna nueva" basado en si Kathia ya la revisó.
--
-- Antes, la tarjeta "nueva" (y el contador en el botón Alumnas) se
-- basaba en si la alumna tenía algún registro de progreso — pero
-- como el peso que pone al registrarse ya cuenta como un registro,
-- dejaba de verse como "nueva" apenas se creaba la cuenta.
--
-- Ahora se basa en esta columna: entra en false cuando alguien crea
-- su cuenta, y Kathia la "apaga" sola con abrir la ficha de esa
-- alumna por primera vez — ahí ve sus datos y el horario que eligió.
--
-- Default true para que esto NO afecte a las alumnas que ya existen
-- (no queremos que de golpe todas se marquen como "nuevas").
--
-- CÓMO USAR: Supabase -> SQL Editor -> New query -> pega todo -> Run.
-- Es seguro correrlo más de una vez.
-- ============================================================

alter table public.alumnas
  add column if not exists revisada_por_kathia boolean not null default true;
