-- ============================================================================
-- fix_profiles_open_policies.sql
-- Seguridad — encontrado el 26-sep-2026 (continuación de fix_companies_open_policies).
--
-- En producción, la tabla profiles tiene dos políticas SIN cláusula TO
-- (aplican a todos los roles, incluido `anon`):
--
--   "Pase libre para actualizar perfil"  FOR UPDATE USING (true)
--   "Pase libre para crear perfil"       FOR INSERT WITH CHECK (true)
--
-- Con ellas cualquiera podía modificar CUALQUIER perfil, por ejemplo:
--   - ponerse role = 'admin' → la política "Admins pueden ver todo" de
--     companies (FOR ALL) le daba acceso total a todas las empresas;
--   - ponerse is_admin = true → acceso al panel admin de la plataforma;
--   - cambiar su company_id al de otra empresa → entrar a los datos de otro
--     cliente.
--
-- Qué hace este script:
--   1. Quita las dos políticas abiertas. Nada en la app escribe en profiles
--      desde el navegador; la única escritura es handle_new_user(), que es
--      SECURITY DEFINER y no depende de estas políticas. Las lecturas del
--      propio perfil siguen cubiertas por las políticas de SELECT existentes.
--   2. Cambia el DEFAULT de profiles.role de 'admin' a 'user': un perfil
--      creado sin rol explícito ya no nace como admin.
--   3. Muestra cuántos perfiles hay por rol, para revisar a mano quién tiene
--      'admin' (NO se modifica ningún perfil existente).
--
-- Correr primero en el proyecto de pruebas y después en producción. Idempotente.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Pase libre para actualizar perfil" ON public.profiles;
DROP POLICY IF EXISTS "Pase libre para crear perfil" ON public.profiles;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';

-- Verificación 1: políticas que quedan (solo deben quedar las de SELECT del propio perfil).
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'profiles'
 ORDER BY cmd, policyname;

COMMIT;

-- Verificación 2 (solo lectura): perfiles por rol y por is_admin.
SELECT role, is_admin, count(*) AS perfiles
  FROM public.profiles
 GROUP BY role, is_admin
 ORDER BY perfiles DESC;
