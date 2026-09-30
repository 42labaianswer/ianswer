-- ============================================================================
-- fix_locations_open_policy.sql
-- Seguridad — encontrado el 28-sep-2026 en la auditoría de planes.
--
-- En schema.sql (export de producción) la tabla locations (sedes) tiene una
-- sola política, sin FOR ni TO:
--
--   "Acceso a locations"  USING (auth.role() = 'authenticated')
--
-- Aplica a SELECT/INSERT/UPDATE/DELETE: cualquier usuario con sesión podía
-- leer, crear, editar y BORRAR las sedes de TODAS las empresas (y, por el
-- ON DELETE CASCADE de agendas.location_id, borrar también sus agendas).
--
-- Este script la reemplaza por dos políticas limitadas a la empresa del
-- usuario (mismo patrón que tags / company_addons), con acceso para los
-- admins de la plataforma (is_platform_admin()):
--
--   "Locations: select por miembro"          FOR SELECT
--   "Locations: insert/update/delete por miembro"  FOR ALL (USING + WITH CHECK)
--
-- Quién usa la tabla (revisado en src/ el 28-sep):
--   - LocationTab.tsx: select/insert/update/delete filtrando por company_id.
--   - AgendaTab.tsx: select por company_id.
--   Ninguna página pública ni sin sesión la lee. El servidor, los webhooks y
--   n8n usan service_role, que no pasa por RLS.
--
-- ANTES de correrlo, confirmar que la política sigue así:
--   select policyname, cmd, roles, qual, with_check
--     from pg_policies where schemaname = 'public' and tablename = 'locations'
--    order by cmd, policyname;
--
-- Correr primero en el proyecto de pruebas y probar Configuración → Sedes
-- (crear, renombrar, borrar) y Calendario → Agendas (el selector de sede).
-- Después en producción. Idempotente.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Acceso a locations" ON public.locations;
DROP POLICY IF EXISTS "Locations: select por miembro" ON public.locations;
DROP POLICY IF EXISTS "Locations: insert/update/delete por miembro" ON public.locations;

CREATE POLICY "Locations: select por miembro" ON public.locations
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.is_platform_admin()
  );

CREATE POLICY "Locations: insert/update/delete por miembro" ON public.locations
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.is_platform_admin()
  )
  WITH CHECK (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR public.is_platform_admin()
  );

-- Verificación: deben quedar solo las 2 políticas nuevas, ambas con TO authenticated.
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'locations'
 ORDER BY cmd, policyname;

COMMIT;
