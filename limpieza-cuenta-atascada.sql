-- ============================================================
-- Kathia Coach — Portal de Alumnas
-- Limpieza puntual: libera el correo augusto@darwinoptima.com
--
-- Cuando probaste "Eliminar alumna" con esta cuenta, se borró su
-- ficha y su historial, pero en ese momento el sistema todavía no
-- borraba también su acceso de inicio de sesión (eso se acaba de
-- corregir, con la nueva función eliminar-cuenta.js). Por eso el
-- correo seguía "atrapado" y no dejaba volver a registrarse.
--
-- Este script libera esa cuenta puntual, a mano, una sola vez.
-- De ahora en adelante, "Eliminar alumna" ya libera el correo solo.
--
-- CÓMO USAR: Supabase -> SQL Editor -> New query -> pega todo -> Run.
-- ============================================================

delete from auth.users where email = 'augusto@darwinoptima.com';

-- Verifica que ya no existe (debería salir vacío):
select id, email from auth.users where email = 'augusto@darwinoptima.com';
