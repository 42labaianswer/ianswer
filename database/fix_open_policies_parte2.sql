-- ============================================================================
-- fix_open_policies_parte2.sql
-- Seguridad — políticas con `true` en tablas que usa n8n, 29-sep-2026.
--
-- REQUISITO (ya cumplido el 29-sep): n8n usa la clave service_role en TODOS
-- sus accesos a Supabase (credencial "Supabase account" + los 9 nodos HTTP de
-- "Asistente Pro V2.14", verificado en la exportación "+ Update"). service_role
-- no pasa por RLS, así que este script no afecta al bot.
--
-- REQUISITO de código (mismo commit): /p/[slug], /menu/[slug] y su opengraph
-- leen companies con lib/publicCompany.ts (servidor, solo columnas públicas).
-- ⚠️ Desplegar ese código ANTES de correr esto en producción, o el directorio
--    y el menú públicos dejarán de encontrar la empresa.
--
-- Qué estaba abierto a cualquiera con la clave pública (incluso sin sesión):
--   companies     "Duenos ven su propia clinica" SELECT true → tokens de Meta
--                 (system_user_access_token), IDs de Stripe, etc. de TODAS
--   contacts      SELECT / INSERT / UPDATE / DELETE true
--   messages      SELECT / INSERT true → todas las conversaciones
--   appointments  "Permitir todo" ALL true
--   working_hours "Permitir todo" ALL true
--   disabled_slots "Permitir todo" ALL true
--   bot_locks     SELECT / INSERT para anon y authenticated
--   orders        orders_public_read true + public_orders_select /
--                 orders_public_token_read (public_token IS NOT NULL: toda
--                 orden tiene token → equivalían a abierto)
--   order_status_history  osh_select true; osh_insert (cualquier usuario con
--                 sesión podía insertar historial en órdenes ajenas)
--
-- Qué queda (revisado contra src/ y los workflows de n8n el 29-sep):
--   companies: "Users can see/view their own company", "Admins pueden ver
--     todo", y las de UPDATE del dueño (con el trigger de facturación).
--   contacts / messages: sus políticas por empresa ("Users can manage company
--     contacts", "Permitir gestión de mensajes por empresa", etc.).
--   working_hours / disabled_slots: "Usuarios pueden gestionar ... de su
--     empresa". El widget público (api/widget/[agendaId]) usa service_role.
--   orders / order_status_history: sus políticas por empresa. El seguimiento
--     público (/tracking/[token]) usa la RPC get_order_tracking (SECURITY DEFINER).
--   appointments: NO tenía otra política → se crean dos, por empresa (por
--     company_id o por la agenda) + admins. Las citas que agenda el bot o el
--     widget pasan por n8n (service_role).
--   bot_locks: solo n8n (service_role) y limpiar_bot_locks (SECURITY DEFINER).
--
-- Probar en el proyecto de pruebas (cuenta normal, con datos):
--   Gestor de clientes, Mensajes (leer y responder), Calendario (ver/crear/
--   cancelar cita), Horarios de agenda, Órdenes (kanban, cambiar estado),
--   /tracking/<token> de una orden, y con cuenta admin el Panel Admin.
--   Sin sesión, con la clave pública: companies, contacts, messages,
--   appointments, orders → 0 filas.
-- Idempotente.
-- ============================================================================

BEGIN;

-- ── companies ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Duenos ven su propia clinica" ON public.companies;

-- ── contacts ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir lectura de pacientes" ON public.contacts;
DROP POLICY IF EXISTS "Permitir insertar pacientes" ON public.contacts;
DROP POLICY IF EXISTS "Permitir actualizar pacientes" ON public.contacts;
DROP POLICY IF EXISTS "Permitir borrar pacientes" ON public.contacts;

-- ── messages ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir lectura de mensajes" ON public.messages;
DROP POLICY IF EXISTS "Permitir inserción desde n8n" ON public.messages;

-- ── working_hours / disabled_slots ─────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo en working_hours" ON public.working_hours;
DROP POLICY IF EXISTS "Permitir todo en disabled_slots" ON public.disabled_slots;

-- ── bot_locks ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS bot_locks_insert ON public.bot_locks;
DROP POLICY IF EXISTS bot_locks_select_own ON public.bot_locks;

-- ── orders / order_status_history ──────────────────────────────────────────
DROP POLICY IF EXISTS orders_public_read ON public.orders;
DROP POLICY IF EXISTS public_orders_select ON public.orders;
DROP POLICY IF EXISTS orders_public_token_read ON public.orders;
DROP POLICY IF EXISTS osh_select ON public.order_status_history;
DROP POLICY IF EXISTS osh_insert ON public.order_status_history;

-- ── appointments ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Permitir todo en appointments" ON public.appointments;
DROP POLICY IF EXISTS "Appointments: select por miembro" ON public.appointments;
DROP POLICY IF EXISTS "Appointments: insert/update/delete por miembro" ON public.appointments;

CREATE POLICY "Appointments: select por miembro" ON public.appointments
  FOR SELECT TO authenticated
  USING (
    public.user_belongs_to_company(company_id)
    OR agenda_id IN (SELECT a.id FROM public.agendas a WHERE public.user_belongs_to_company(a.company_id))
    OR public.is_platform_admin()
  );

CREATE POLICY "Appointments: insert/update/delete por miembro" ON public.appointments
  FOR ALL TO authenticated
  USING (
    public.user_belongs_to_company(company_id)
    OR agenda_id IN (SELECT a.id FROM public.agendas a WHERE public.user_belongs_to_company(a.company_id))
    OR public.is_platform_admin()
  )
  WITH CHECK (
    public.user_belongs_to_company(company_id)
    OR agenda_id IN (SELECT a.id FROM public.agendas a WHERE public.user_belongs_to_company(a.company_id))
    OR public.is_platform_admin()
  );

-- Verificación 1: lo que siga con `true` debe ser solo lectura pública de
-- catálogos (plans, site_settings, landing_*, help_articles, menu_*,
-- platform_settings, reminder_rule_templates, sat_*).
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public' AND (qual = 'true' OR with_check = 'true')
 ORDER BY tablename, cmd;

COMMIT;

-- Verificación 2 (aparte): ninguna tabla de la parte 2 debe quedar SIN
-- políticas (si alguna sale aquí, la app ya no podría leerla).
-- SELECT t.tablename
--   FROM (VALUES ('companies'),('contacts'),('messages'),('appointments'),
--                ('working_hours'),('disabled_slots'),('orders'),
--                ('order_status_history')) AS t(tablename)
--  WHERE NOT EXISTS (SELECT 1 FROM pg_policies p
--                     WHERE p.schemaname = 'public' AND p.tablename = t.tablename);
