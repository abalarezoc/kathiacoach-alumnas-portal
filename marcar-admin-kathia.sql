-- ============================================================
-- Kathia Coach — Portal de Alumnas
-- Marca la cuenta de Kathia como administradora
--
-- CÓMO USAR:
-- 1. Primero crea la cuenta en signup.html con el correo
--    kathiarodriguezb@gmail.com (dejando los campos de alumna en blanco).
-- 2. Luego corre este archivo en Supabase -> SQL Editor -> New query -> Run.
-- ============================================================

update public.alumnas
set es_admin = true
where email = 'kathiarodriguezb@gmail.com';

-- Verifica que quedó marcada:
select id, email, es_admin from public.alumnas where email = 'kathiarodriguezb@gmail.com';
