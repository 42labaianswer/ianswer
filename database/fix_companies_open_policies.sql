-- ============================================================================
-- fix_companies_open_policies.sql
-- Seguridad — encontrado el 25-sep-2026 al revisar el bloque 7 del plan.
--
-- En schema.sql (export de producción del 9-sep) la tabla companies tiene tres
-- políticas SIN cláusula TO (aplican a todos los roles, incluido `anon`, cuya
-- clave es pública en el JavaScript del sitio):
--
--   "Pase libre para crear clinica"   FOR INSERT WITH CHECK (true)
--   "Permitir actualizar companies"   FOR UPDATE USING (true) WITH CHECK (true)
--   "Duenos ven su propia clinica"    FOR SELECT USING (true)
--
-- Las políticas de Postgres se combinan con OR: con estas, cualquiera podía
-- crear empresas, MODIFICAR CUALQUIER EMPRESA (p. ej. activarse un plan o
-- cambiar datos de otro cliente) y leerlas todas.
--
-- Este script quita las de INSERT y UPDATE. Lo legítimo sigue cubierto:
--   - Altas: handle_new_user() es SECURITY DEFINER (no necesita la política).
--   - Ediciones del dueño: "Users can update their own company" /
--     "Usuarios editan su propia empresa" (solo su propia empresa).
--   - Webhook/servidor: usan service_role, que no pasa por RLS.
--
-- La de SELECT NO se quita aquí: /p/[slug] y /menu/[slug] leen companies sin
-- sesión. Arreglarla requiere una vista pública con columnas seguras — tarea
-- aparte (ver archivo maestro).
--
-- ANTES de correrlo, confirmar en producción que las políticas siguen así:
--   select policyname, cmd, roles, qual, with_check
--     from pg_policies where schemaname = 'public' and tablename = 'companies'
--    order by cmd, policyname;
--
-- Correr primero en el proyecto de pruebas, probar registro + onboarding +
-- editar Configuración, y después en producción. Idempotente.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Pase libre para crear clinica" ON public.companies;
DROP POLICY IF EXISTS "Permitir actualizar companies" ON public.companies;

-- Verificación: ya no debe quedar ninguna política de INSERT/UPDATE con `true`.
SELECT policyname, cmd, roles, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'companies'
 ORDER BY cmd, policyname;

COMMIT;
