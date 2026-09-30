-- ============================================================================
-- fix_billing_bypass.sql
-- Seguridad — encontrado el 29-sep-2026 al revisar si quedaba algún bypass
-- después de mover el acceso al dashboard al servidor (proxy.ts).
--
-- El proxy decide con companies.subscription_status, pero ese valor lo podía
-- cambiar el propio usuario desde la consola del navegador (la clave anónima
-- y el cliente de Supabase están en el JavaScript del sitio):
--
--   1. Política "Users can update their own company" / "Usuarios editan su
--      propia empresa": el dueño puede hacer UPDATE de CUALQUIER columna de su
--      empresa → supabase.from('companies').update({ subscription_status:
--      'active' }) y entra sin pagar, para siempre.
--   2. RPCs SECURITY DEFINER sin revisar quién llama (se ejecutan como dueño de
--      la base, saltándose la RLS, y cualquiera con la clave anónima puede
--      llamarlas):
--        - change_company_plan(company, plan)   → subir a Scale gratis, a
--                                                  CUALQUIER empresa.
--        - activate_addon(company, addon, ...)  → activar add-ons de pago
--                                                  gratis, a cualquier empresa.
--        - cancel_addon(company, addon)         → cancelar add-ons de OTRA empresa.
--        - install_template / uninstall_template → cambiar la industria de
--                                                  otra empresa.
--
-- Qué hace este script:
--   A. Trigger zz_protect_company_billing: si quien actualiza es un usuario
--      normal (JWT 'authenticated' o 'anon', y no admin de la plataforma), las
--      columnas de facturación se quedan con su valor anterior. Se llama "zz_"
--      para correr DESPUÉS de companies_set_trial_ends_at_trigger (los triggers
--      corren en orden alfabético) y revertir también lo que ese ponga.
--      Siguen pudiendo escribirlas: service_role (webhook de Stripe, checkout,
--      cron), el editor SQL de Supabase (sin JWT) y los admins de la plataforma
--      (modo admin de /dashboard/plans).
--   B. Las 5 RPCs revisan quién llama. Los usuarios normales solo pueden actuar
--      sobre SU empresa; change_company_plan solo admins/servidor;
--      activate_addon solo add-ons GRATIS (los de pago los activa el webhook
--      con service_role).
--
-- Código que ya está preparado para esto (revisado en src/ el 29-sep):
--   - Webhook, checkout de plan, cron, lib/stripePlan.ts → service_role.
--   - api/stripe/checkout-addon guardaba stripe_customer_id con la sesión del
--     usuario: se cambió a service_role en el mismo commit (si no, el trigger
--     lo descartaría y se crearía un cliente de Stripe nuevo en cada compra).
--   - SignupBootstrap escribe selected_plan_slug: NO se protege (no da acceso);
--     lo que su trigger ponga en trial_* / subscription_status se revierte.
--
-- ANTES de correrlo (pruebas y producción):
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'companies' and cmd = 'UPDATE';
--   select routine_name, grantee from information_schema.routine_privileges
--    where routine_schema = 'public'
--      and routine_name in ('activate_addon','cancel_addon','change_company_plan',
--                           'install_template','uninstall_template')
--    order by 1, 2;
--
-- Probar en el proyecto de pruebas:
--   1. Con sesión de usuario normal, en la consola del navegador:
--      supabase.from('companies').update({ subscription_status: 'active' }).eq('id', '<su empresa>')
--      → no da error, pero el valor NO cambia.
--   2. Editar Configuración (nombre, dirección, etc.) → sí se guarda.
--   3. Wizard completo con la tarjeta 4242 → entra al dashboard (webhook/confirm).
--   4. Instalar una industria desde /dashboard/templates → funciona.
--   5. Comprar un add-on de pago → sin pago no se activa; activar uno gratis → funciona.
-- Después en producción. Idempotente.
-- ============================================================================

BEGIN;

-- ── Helper: ¿quien llama es un usuario normal (no servidor, no admin)? ──────
CREATE OR REPLACE FUNCTION public.is_regular_user_call() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT coalesce(auth.role(), '') IN ('authenticated', 'anon')
         AND NOT public.is_platform_admin();
$$;

-- ── A. Columnas de facturación de companies ────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_company_billing_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_regular_user_call() THEN
    RETURN NEW;
  END IF;

  NEW.subscription_status     := OLD.subscription_status;
  NEW.account_status          := OLD.account_status;
  NEW.plan_slug               := OLD.plan_slug;
  NEW.trial_starts_at         := OLD.trial_starts_at;
  NEW.trial_ends_at           := OLD.trial_ends_at;
  NEW.subscription_started_at := OLD.subscription_started_at;
  NEW.current_period_ends_at  := OLD.current_period_ends_at;
  NEW.billing_cycle           := OLD.billing_cycle;
  NEW.stripe_customer_id      := OLD.stripe_customer_id;
  NEW.stripe_subscription_id  := OLD.stripe_subscription_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_protect_company_billing ON public.companies;
CREATE TRIGGER zz_protect_company_billing
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_billing_columns();

-- ── B. RPCs SECURITY DEFINER ───────────────────────────────────────────────

-- change_company_plan: solo admins de la plataforma o el servidor.
CREATE OR REPLACE FUNCTION public.change_company_plan(p_company_id uuid, p_new_plan_slug text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF public.is_regular_user_call() THEN
    RAISE EXCEPTION 'No autorizado para cambiar el plan' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE slug = p_new_plan_slug AND is_active = true) THEN
    RAISE EXCEPTION 'Plan no existe o está inactivo: %', p_new_plan_slug;
  END IF;

  UPDATE public.companies
     SET plan_slug  = p_new_plan_slug,
         updated_at = now()
   WHERE id = p_company_id;
END;
$$;

-- activate_addon: usuarios normales solo en su empresa y solo add-ons gratis.
CREATE OR REPLACE FUNCTION public.activate_addon(p_company_id uuid, p_addon_id text, p_quantity integer DEFAULT 1, p_stripe_subscription_item_id text DEFAULT NULL::text, p_stripe_checkout_session_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF public.is_regular_user_call() THEN
    IF NOT public.user_belongs_to_company(p_company_id) THEN
      RAISE EXCEPTION 'No autorizado para esta empresa' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.addons
       WHERE id = p_addon_id
         AND (coalesce(price_monthly_cents, 0) > 0 OR coalesce(price_one_time_cents, 0) > 0)
    ) THEN
      RAISE EXCEPTION 'Este complemento requiere pago' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.company_addons (
    company_id, addon_id, quantity, status, activated_at,
    stripe_subscription_item_id, stripe_checkout_session_id
  )
  VALUES (
    p_company_id, p_addon_id, GREATEST(1, p_quantity), 'active', now(),
    p_stripe_subscription_item_id, p_stripe_checkout_session_id
  )
  ON CONFLICT (company_id, addon_id)
  DO UPDATE SET
    quantity                    = GREATEST(1, EXCLUDED.quantity),
    status                      = 'active',
    activated_at                = COALESCE(public.company_addons.activated_at, now()),
    stripe_subscription_item_id = COALESCE(EXCLUDED.stripe_subscription_item_id, public.company_addons.stripe_subscription_item_id),
    stripe_checkout_session_id  = COALESCE(EXCLUDED.stripe_checkout_session_id,  public.company_addons.stripe_checkout_session_id),
    canceled_at                 = NULL,
    updated_at                  = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- cancel_addon: usuarios normales solo en su empresa.
CREATE OR REPLACE FUNCTION public.cancel_addon(p_company_id uuid, p_addon_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF public.is_regular_user_call() AND NOT public.user_belongs_to_company(p_company_id) THEN
    RAISE EXCEPTION 'No autorizado para esta empresa' USING ERRCODE = '42501';
  END IF;

  UPDATE public.company_addons
     SET status      = 'canceled',
         canceled_at = now(),
         updated_at  = now()
   WHERE company_id = p_company_id
     AND addon_id   = p_addon_id;
END;
$$;

-- install_template: usuarios normales solo en su empresa.
CREATE OR REPLACE FUNCTION public.install_template(p_company_id uuid, p_template_id text, p_make_primary boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF public.is_regular_user_call() AND NOT public.user_belongs_to_company(p_company_id) THEN
    RAISE EXCEPTION 'No autorizado para esta empresa' USING ERRCODE = '42501';
  END IF;

  IF p_make_primary THEN
    UPDATE public.company_templates
       SET is_primary = false, updated_at = now()
     WHERE company_id = p_company_id AND is_primary = true;
  END IF;

  INSERT INTO public.company_templates (company_id, template_id, is_primary)
  VALUES (p_company_id, p_template_id, p_make_primary)
  ON CONFLICT (company_id, template_id)
  DO UPDATE SET
    is_primary = EXCLUDED.is_primary OR public.company_templates.is_primary,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- uninstall_template: usuarios normales solo en su empresa.
CREATE OR REPLACE FUNCTION public.uninstall_template(p_company_id uuid, p_template_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF public.is_regular_user_call() AND NOT public.user_belongs_to_company(p_company_id) THEN
    RAISE EXCEPTION 'No autorizado para esta empresa' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.company_templates
     WHERE company_id = p_company_id AND template_id = p_template_id AND is_primary = true
  ) THEN
    RAISE EXCEPTION 'No se puede desinstalar el template primario. Marca otro como primario primero.';
  END IF;

  DELETE FROM public.company_templates
   WHERE company_id = p_company_id AND template_id = p_template_id;
END;
$$;

-- ── C. Sin sesión nadie las necesita: quitar EXECUTE a anon y PUBLIC ────────
-- (verificado en pruebas el 29-sep: las 5 tenían EXECUTE para PUBLIC y anon).
-- La app las llama con sesión (authenticated) o con service_role.
REVOKE EXECUTE ON FUNCTION public.change_company_plan(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.activate_addon(uuid, text, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_addon(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.install_template(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.uninstall_template(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_company_plan(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_addon(uuid, text, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_addon(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.install_template(uuid, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.uninstall_template(uuid, text) TO authenticated, service_role;

-- Verificación: debe aparecer el trigger zz_protect_company_billing.
SELECT tgname FROM pg_trigger
 WHERE tgrelid = 'public.companies'::regclass AND NOT tgisinternal
 ORDER BY tgname;

COMMIT;
