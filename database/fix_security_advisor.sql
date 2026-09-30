-- ============================================================================
-- fix_security_advisor.sql
-- Seguridad — avisos "CRITICAL" del Security Advisor de Supabase (29-sep-2026).
--
-- 1. "Security Definer View" (18 vistas): en Postgres una vista corre con los
--    permisos de su DUEÑO, no de quien la consulta → se salta la RLS de las
--    tablas de abajo. Como las vistas tienen SELECT para anon/authenticated,
--    cualquiera con la clave pública (incluso sin sesión) podía leer los datos
--    de TODAS las empresas: contactos (v_contacts_enriched, con teléfonos y
--    último mensaje), órdenes (v_orders_full), tareas, métricas, etc. La app
--    filtra por company_id, pero ese filtro lo pone el navegador.
--    Arreglo: security_invoker = on → la vista respeta la RLS de quien la
--    consulta. (v_contacts_pending_followup ya lo tenía.)
--
-- 2. "RLS Disabled in Public" (6 tablas sat_*): catálogos del SAT para CFDI.
--    Sin RLS, cualquiera con la clave anónima podía MODIFICARLOS o borrarlos.
--    Arreglo: activar RLS con lectura para usuarios con sesión (la usa
--    /dashboard/billing/datos-fiscales). Escritura solo service_role / editor SQL.
--
-- 3. v_admin_usage (Panel Admin → Uso) lee usage_sessions de todas las
--    empresas. Con security_invoker, la política actual (solo la empresa del
--    usuario) dejaría al admin viendo solo la suya → se agrega una política de
--    lectura para admins de la plataforma.
--
-- Revisado en src/ el 29-sep: ninguna de estas vistas la usa una página
-- pública (sin sesión). Las que usa el dashboard (contacts, orders, tasks,
-- tags, reports, reminders) tienen políticas por empresa en sus tablas base.
--
-- NO incluye (tareas aparte):
--   - "Auth RLS Initialization Plan" (avisos amarillos): son de RENDIMIENTO,
--     no de seguridad (auth.uid() se evalúa por fila). Se optimiza después.
--   - appointments tiene la política "Permitir todo en appointments" USING
--     (true) para todos los roles → abierta igual que lo estaba locations.
--
-- Correr primero en el proyecto de pruebas y revisar con una cuenta normal:
--   Gestor de clientes (lista de contactos), Tareas, Etiquetas, Métricas,
--   Recordatorios, Órdenes (si la cuenta tiene el módulo), Datos fiscales.
--   Con una cuenta admin: Panel Admin → Uso.
-- Todo debe verse igual que antes. Después en producción. Idempotente.
-- ============================================================================

BEGIN;

-- ── 1. Vistas: respetar la RLS de quien consulta ───────────────────────────
ALTER VIEW public.companies_with_trial_status SET (security_invoker = on);
ALTER VIEW public.v_admin_usage              SET (security_invoker = on);
ALTER VIEW public.v_company_active           SET (security_invoker = on);
ALTER VIEW public.v_contacts_enriched        SET (security_invoker = on);
ALTER VIEW public.v_contacts_with_tags       SET (security_invoker = on);
ALTER VIEW public.v_menu_item_sales          SET (security_invoker = on);
ALTER VIEW public.v_noshow_metrics           SET (security_invoker = on);
ALTER VIEW public.v_orders_full              SET (security_invoker = on);
ALTER VIEW public.v_reactivation_metrics     SET (security_invoker = on);
ALTER VIEW public.v_referral_breakdown       SET (security_invoker = on);
ALTER VIEW public.v_reminder_metrics         SET (security_invoker = on);
ALTER VIEW public.v_reminders_due            SET (security_invoker = on);
ALTER VIEW public.v_retention_metrics        SET (security_invoker = on);
ALTER VIEW public.v_retention_monthly        SET (security_invoker = on);
ALTER VIEW public.v_tag_usage_stats          SET (security_invoker = on);
ALTER VIEW public.v_tasks_enriched           SET (security_invoker = on);
ALTER VIEW public.v_top_referrers            SET (security_invoker = on);
ALTER VIEW public.v_waitlist_enriched        SET (security_invoker = on);

-- ── 2. Catálogos del SAT: RLS con solo lectura ─────────────────────────────
ALTER TABLE public.sat_clave_prodserv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sat_clave_unidad   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sat_forma_pago     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sat_metodo_pago    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sat_regimen_fiscal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sat_uso_cfdi       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SAT: lectura con sesión" ON public.sat_clave_prodserv;
DROP POLICY IF EXISTS "SAT: lectura con sesión" ON public.sat_clave_unidad;
DROP POLICY IF EXISTS "SAT: lectura con sesión" ON public.sat_forma_pago;
DROP POLICY IF EXISTS "SAT: lectura con sesión" ON public.sat_metodo_pago;
DROP POLICY IF EXISTS "SAT: lectura con sesión" ON public.sat_regimen_fiscal;
DROP POLICY IF EXISTS "SAT: lectura con sesión" ON public.sat_uso_cfdi;

CREATE POLICY "SAT: lectura con sesión" ON public.sat_clave_prodserv FOR SELECT TO authenticated USING (true);
CREATE POLICY "SAT: lectura con sesión" ON public.sat_clave_unidad   FOR SELECT TO authenticated USING (true);
CREATE POLICY "SAT: lectura con sesión" ON public.sat_forma_pago     FOR SELECT TO authenticated USING (true);
CREATE POLICY "SAT: lectura con sesión" ON public.sat_metodo_pago    FOR SELECT TO authenticated USING (true);
CREATE POLICY "SAT: lectura con sesión" ON public.sat_regimen_fiscal FOR SELECT TO authenticated USING (true);
CREATE POLICY "SAT: lectura con sesión" ON public.sat_uso_cfdi       FOR SELECT TO authenticated USING (true);

-- ── 3. Panel Admin → Uso (v_admin_usage) ───────────────────────────────────
DROP POLICY IF EXISTS usage_sessions_admin_read ON public.usage_sessions;
CREATE POLICY usage_sessions_admin_read ON public.usage_sessions
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- Verificación 1: ninguna vista de public debe quedar sin security_invoker.
SELECT c.relname AS vista_sin_invoker
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'v'
   AND NOT coalesce(c.reloptions::text[] @> ARRAY['security_invoker=on'], false)
   AND NOT coalesce(c.reloptions::text[] @> ARRAY['security_invoker=true'], false);

-- Verificación 2: ninguna tabla de public debe quedar sin RLS.
SELECT c.relname AS tabla_sin_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

COMMIT;
