-- ============================================================================
-- fix_open_policies_parte1.sql
-- Seguridad — políticas con `true` y sin TO (aplican a anon), 29-sep-2026.
--
-- Parte 1: tablas que n8n NO usa (revisado en la exportación de los 10
-- workflows de n8n del 29-sep) y que la app solo usa con sesión o con
-- service_role. La parte 2 (contacts, messages, appointments, working_hours,
-- disabled_slots, bot_locks, orders, order_status_history, companies) espera a
-- que n8n use la clave service_role.
--
-- Qué estaba abierto a cualquiera, incluso sin sesión:
--   invoices               invoices_service_all  ALL  → leer/modificar facturas (RFC) de todas las empresas
--   operator_audit_log     audit_service_all     ALL
--   data_deletion_requests ddr_admin_all         ALL
--   whatsapp_templates     templates_service_write ALL
--   whatsapp_quality_events quality_events_service_write INSERT
--   help_articles          "Permitir todo a service role" ALL → editar el centro de ayuda
--   landing_* (4 tablas)   "Permitir actualizaciones ..." ALL → modificar la landing
--   notifications          SELECT / INSERT / UPDATE con true → leer y cambiar
--                          notificaciones de todas las empresas
-- (Los nombres "service_*" engañan: sin TO service_role aplican a todos.
--  service_role no necesita políticas: no pasa por RLS.)
--
-- Qué queda después (revisado contra src/ el 29-sep):
--   - invoices: invoices_company_read (la empresa ve las suyas, /billing/facturas)
--     + NUEVA invoices_admin_all (Panel Admin → Facturación). Timbrado y
--     cancelación (api/invoices/[id]/*) y el webhook usan service_role.
--   - operator_audit_log: audit_company_read + NUEVA audit_admin_read
--     (Panel Admin → Auditoría). Escriben log_operator_action y
--     trg_log_manual_message (SECURITY DEFINER).
--   - data_deletion_requests: ddr_admin_read + NUEVA ddr_admin_all (solo admins).
--     Alta vía register_data_deletion_request (SECURITY DEFINER).
--   - whatsapp_templates / whatsapp_quality_events: sus políticas *_company_read.
--     Escribe register_quality_event (SECURITY DEFINER).
--   - help_articles: lectura pública (se conserva) + NUEVA help_articles_admin_write
--     (Panel Admin → Ayuda).
--   - landing_*: lectura pública (se conserva) + las *_admin_write que ya existían.
--   - notifications: NUEVAS políticas por empresa (leer, marcar leída, borrar).
--     Las crean los triggers notify_new_message (INSERT en messages) y
--     notify_human_request (UPDATE de contacts.ai_active). Esos triggers NO eran
--     SECURITY DEFINER: corrían con la clave de quien inserta el mensaje (n8n).
--     Se vuelven SECURITY DEFINER para que sigan creando la notificación sin
--     importar la clave, y así se puede quitar el INSERT abierto sin romper el bot.
--
-- ANTES de correrlo: la consulta de políticas con true del 29-sep (producción)
-- coincide con esta lista.
-- Probar en el proyecto de pruebas (cuenta normal): Facturas, campana de
-- notificaciones (marcar leída / borrar), centro de ayuda público (/recursos/ayuda).
-- Con cuenta admin: Panel Admin → Landing, Ayuda, Facturación, Auditoría.
-- Idempotente.
-- ============================================================================

BEGIN;

-- ── invoices ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS invoices_service_all ON public.invoices;
DROP POLICY IF EXISTS invoices_admin_all ON public.invoices;
CREATE POLICY invoices_admin_all ON public.invoices
  TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- ── operator_audit_log ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS audit_service_all ON public.operator_audit_log;
DROP POLICY IF EXISTS audit_admin_read ON public.operator_audit_log;
CREATE POLICY audit_admin_read ON public.operator_audit_log
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ── data_deletion_requests ─────────────────────────────────────────────────
DROP POLICY IF EXISTS ddr_admin_all ON public.data_deletion_requests;
CREATE POLICY ddr_admin_all ON public.data_deletion_requests
  TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- ── whatsapp_templates / whatsapp_quality_events ───────────────────────────
DROP POLICY IF EXISTS templates_service_write ON public.whatsapp_templates;
DROP POLICY IF EXISTS quality_events_service_write ON public.whatsapp_quality_events;

-- ── help_articles ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo a service role" ON public.help_articles;
DROP POLICY IF EXISTS help_articles_admin_write ON public.help_articles;
CREATE POLICY help_articles_admin_write ON public.help_articles
  TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- ── landing_* (las *_admin_write ya existen) ───────────────────────────────
DROP POLICY IF EXISTS "Permitir actualizaciones landing_features" ON public.landing_features;
DROP POLICY IF EXISTS "Permitir actualizaciones landing_hero_slides" ON public.landing_hero_slides;
DROP POLICY IF EXISTS "Permitir actualizaciones landing_scroll_sections" ON public.landing_scroll_sections;
DROP POLICY IF EXISTS "Permitir actualizaciones landing_settings" ON public.landing_settings;

-- ── notifications ──────────────────────────────────────────────────────────
ALTER FUNCTION public.notify_new_message() SECURITY DEFINER;
ALTER FUNCTION public.notify_new_message() SET search_path = public;
ALTER FUNCTION public.notify_human_request() SECURITY DEFINER;
ALTER FUNCTION public.notify_human_request() SET search_path = public;

DROP POLICY IF EXISTS "Lectura de notificaciones" ON public.notifications;
DROP POLICY IF EXISTS "Actualizar notificaciones" ON public.notifications;
DROP POLICY IF EXISTS "Insertar notificaciones" ON public.notifications;
DROP POLICY IF EXISTS "Sistema inserta notificaciones" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: select por miembro" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: update por miembro" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: delete por miembro" ON public.notifications;

CREATE POLICY "Notifications: select por miembro" ON public.notifications
  FOR SELECT TO authenticated USING (public.user_belongs_to_company(company_id) OR public.is_platform_admin());
CREATE POLICY "Notifications: update por miembro" ON public.notifications
  FOR UPDATE TO authenticated USING (public.user_belongs_to_company(company_id))
  WITH CHECK (public.user_belongs_to_company(company_id));
CREATE POLICY "Notifications: delete por miembro" ON public.notifications
  FOR DELETE TO authenticated USING (public.user_belongs_to_company(company_id));

-- Verificación: lo que siga con `true` debe ser solo lectura pública
-- (catálogos, landing, menú, planes, ayuda) o tablas de la parte 2.
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
 ORDER BY tablename, cmd;

COMMIT;
