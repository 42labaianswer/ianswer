-- ============================================================================
-- addons_paquetes_nov_2026.sql — paquetes de saldo de pago único
--
-- Requiere contadores_nov_2026.sql. Idempotente. Se corre en pruebas y en
-- producción.
--
--   +1,000 respuestas de IA          $499   (ai_replies_1000)
--   +1,000 recordatorios             $399   (reminders_1000)
--   Mensajes de marketing            500 $999 · 1,000 $1,899 · 2,000 $3,599 ·
--                                    5,000 $8,499 · 10,000 $15,999
--                                    (marketing_500 … marketing_10000; la
--                                    tienda los muestra como un solo add-on
--                                    con selector de cantidad: pack_group)
--
-- Precios sin IVA, pago único. Reglas (23-nov):
--   * Se pueden comprar las veces que sea; las compras se acumulan.
--   * Cada compra vale 3 meses. Al reiniciarse el periodo, lo comprado que
--     no se usó sigue disponible hasta que vence.
--   * Primero se usa lo que incluye el plan en el periodo; solo lo que pasa
--     de ahí se descuenta del saldo comprado (el que vence antes, primero).
--
-- A diferencia de los add-ons de función, los paquetes no quedan
-- "instalados". activate_addon reconoce los paquetes (credit_grants) y en
-- lugar de activar el add-on registra el saldo en usage_credits. Así
-- funcionan igual el webhook de Stripe, la activación de admin y la de
-- add-ons gratis.
--
-- Los stripe_price_id quedan vacíos: se pegan en Admin → Add-ons después de
-- crear los precios (pago único, MXN, sin impuestos incluidos) en Stripe.
-- ============================================================================

BEGIN;

-- ─── Catálogo ───────────────────────────────────────────────────────────────

ALTER TABLE public.addons
  ADD COLUMN IF NOT EXISTS credit_grants jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pack_group text;

COMMENT ON COLUMN public.addons.credit_grants IS
  'Saldo que suma una compra al periodo de cobro en curso, por métrica de usage_counters ({"ai_replies": 1000}). Si tiene algo, el add-on es un paquete y no se instala.';
COMMENT ON COLUMN public.addons.pack_group IS
  'Paquetes que la tienda muestra como un solo add-on con selector de cantidad.';

INSERT INTO public.addons (
  id, name, short_name, description, category, icon,
  price_monthly_cents, price_one_time_cents, currency,
  is_recurring, is_one_time, credit_grants, pack_group,
  is_active, display_order, available_for_templates
) VALUES
  ('ai_replies_1000', '+1,000 respuestas de IA', 'Respuestas de IA',
   'Tu asistente sigue contestando cuando se acaban las respuestas de tu plan. Valen 3 meses y se usan cuando se acaban las de tu plan.',
   'capacity', 'Bot', 0, 49900, 'MXN', false, true, '{"ai_replies": 1000}', NULL, true, 40, '{}'),
  ('reminders_1000', '+1,000 recordatorios', 'Recordatorios',
   'Más avisos de cita por WhatsApp para que tus clientes no falten. Valen 3 meses y se usan cuando se acaban las de tu plan.',
   'capacity', 'BellRing', 0, 39900, 'MXN', false, true, '{"reminders": 1000}', NULL, true, 41, '{}'),
  ('marketing_500', 'Mensajes de marketing', 'Marketing 500',
   'Mensajes para tus campañas de WhatsApp. Valen 3 meses desde la compra.',
   'capacity', 'Megaphone', 0, 99900, 'MXN', false, true, '{"campaign_messages": 500}', 'marketing', true, 42, '{}'),
  ('marketing_1000', 'Mensajes de marketing', 'Marketing 1,000',
   'Mensajes para tus campañas de WhatsApp. Valen 3 meses desde la compra.',
   'capacity', 'Megaphone', 0, 189900, 'MXN', false, true, '{"campaign_messages": 1000}', 'marketing', true, 43, '{}'),
  ('marketing_2000', 'Mensajes de marketing', 'Marketing 2,000',
   'Mensajes para tus campañas de WhatsApp. Valen 3 meses desde la compra.',
   'capacity', 'Megaphone', 0, 359900, 'MXN', false, true, '{"campaign_messages": 2000}', 'marketing', true, 44, '{}'),
  ('marketing_5000', 'Mensajes de marketing', 'Marketing 5,000',
   'Mensajes para tus campañas de WhatsApp. Valen 3 meses desde la compra.',
   'capacity', 'Megaphone', 0, 849900, 'MXN', false, true, '{"campaign_messages": 5000}', 'marketing', true, 45, '{}'),
  ('marketing_10000', 'Mensajes de marketing', 'Marketing 10,000',
   'Mensajes para tus campañas de WhatsApp. Valen 3 meses desde la compra.',
   'capacity', 'Megaphone', 0, 1599900, 'MXN', false, true, '{"campaign_messages": 10000}', 'marketing', true, 46, '{}')
ON CONFLICT (id) DO UPDATE SET
  name                 = EXCLUDED.name,
  short_name           = EXCLUDED.short_name,
  description          = EXCLUDED.description,
  category             = EXCLUDED.category,
  icon                 = EXCLUDED.icon,
  price_monthly_cents  = EXCLUDED.price_monthly_cents,
  price_one_time_cents = EXCLUDED.price_one_time_cents,
  is_recurring         = EXCLUDED.is_recurring,
  is_one_time          = EXCLUDED.is_one_time,
  credit_grants        = EXCLUDED.credit_grants,
  pack_group           = EXCLUDED.pack_group,
  display_order        = EXCLUDED.display_order,
  updated_at           = now();

-- ─── Saldo comprado ─────────────────────────────────────────────────────────

-- Una fila por compra y métrica. "used" es lo que ya se consumió de esa
-- compra; vence a los 3 meses de comprada.
CREATE TABLE IF NOT EXISTS public.usage_credits (
  id                         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id                 uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric                     text NOT NULL,
  amount                     integer NOT NULL CHECK (amount > 0),
  addon_id                   text REFERENCES public.addons(id) ON DELETE SET NULL,
  stripe_checkout_session_id text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_checkout_session_id, metric)
);

ALTER TABLE public.usage_credits
  ADD COLUMN IF NOT EXISTS used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE public.usage_credits SET expires_at = created_at + interval '3 months' WHERE expires_at IS NULL;
ALTER TABLE public.usage_credits ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE public.usage_credits ALTER COLUMN expires_at SET DEFAULT now() + interval '3 months';
DROP INDEX IF EXISTS public.idx_usage_credits_company_period;
ALTER TABLE public.usage_credits DROP COLUMN IF EXISTS period_start;
ALTER TABLE public.usage_credits DROP CONSTRAINT IF EXISTS usage_credits_used_check;
ALTER TABLE public.usage_credits ADD CONSTRAINT usage_credits_used_check CHECK (used >= 0 AND used <= amount);

CREATE INDEX IF NOT EXISTS idx_usage_credits_company_metric
  ON public.usage_credits (company_id, metric, expires_at);

ALTER TABLE public.usage_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usage credits: select por miembro" ON public.usage_credits;
CREATE POLICY "Usage credits: select por miembro" ON public.usage_credits
  FOR SELECT USING (
    company_id IN (SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid())
    OR public.is_platform_admin()
  );

-- Registra el saldo de un paquete (vence en 3 meses). Con el mismo
-- p_session_id no vuelve a sumar (Stripe puede reenviar el webhook).
-- Devuelve cuánto se sumó en total (0 si el add-on no es paquete).
CREATE OR REPLACE FUNCTION public.grant_addon_credits(p_company_id uuid, p_addon_id text, p_session_id text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grants jsonb;
  v_metric text;
  v_amount integer;
  v_total  integer := 0;
  v_rows   integer;
BEGIN
  SELECT credit_grants INTO v_grants FROM public.addons WHERE id = p_addon_id;
  IF v_grants IS NULL OR v_grants = '{}'::jsonb THEN RETURN 0; END IF;

  FOR v_metric, v_amount IN SELECT key, value::integer FROM jsonb_each_text(v_grants) LOOP
    CONTINUE WHEN v_amount IS NULL OR v_amount <= 0;
    INSERT INTO public.usage_credits (company_id, metric, amount, addon_id, stripe_checkout_session_id, expires_at)
    VALUES (p_company_id, v_metric, v_amount, p_addon_id, p_session_id, now() + interval '3 months')
    ON CONFLICT (stripe_checkout_session_id, metric) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows * v_amount;
  END LOOP;

  RETURN v_total;
END;
$$;

-- Saldo comprado que queda sin usar y sin vencer.
CREATE OR REPLACE FUNCTION public.usage_credit_total(p_company_id uuid, p_metric text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(amount - used), 0)::integer
  FROM public.usage_credits
  WHERE company_id = p_company_id AND metric = p_metric AND expires_at > now();
$$;

-- Primera fecha de vencimiento del saldo que queda (para avisar en el panel).
CREATE OR REPLACE FUNCTION public.usage_credit_next_expiry(p_company_id uuid, p_metric text)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT min(expires_at)
  FROM public.usage_credits
  WHERE company_id = p_company_id AND metric = p_metric AND expires_at > now() AND used < amount;
$$;

-- Lo que incluye el plan (más add-ons de capacidad) por periodo, sin
-- paquetes. NULL = sin límite.
CREATE OR REPLACE FUNCTION public.usage_plan_cap(p_company_id uuid, p_metric text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.get_company_entitlements(p_company_id) -> 'capacity' ->> public.usage_capacity_key(p_metric))::integer;
$$;

-- Mueve el saldo comprado cuando el uso del periodo pasa lo del plan.
-- p_delta > 0 consume primero el saldo que vence antes; p_delta < 0 (una
-- devolución, p. ej. mensajes de campaña que Meta rechazó) lo regresa a la
-- compra más reciente que siga vigente.
CREATE OR REPLACE FUNCTION public.usage_move_credits(p_company_id uuid, p_metric text, p_delta integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_left integer := abs(coalesce(p_delta, 0));
  v_take integer;
  r record;
BEGIN
  IF p_delta > 0 THEN
    FOR r IN SELECT id, amount - used AS free FROM public.usage_credits
             WHERE company_id = p_company_id AND metric = p_metric AND expires_at > now() AND used < amount
             ORDER BY expires_at, id FOR UPDATE LOOP
      EXIT WHEN v_left <= 0;
      v_take := least(v_left, r.free);
      UPDATE public.usage_credits SET used = used + v_take WHERE id = r.id;
      v_left := v_left - v_take;
    END LOOP;
  ELSIF p_delta < 0 THEN
    FOR r IN SELECT id, used FROM public.usage_credits
             WHERE company_id = p_company_id AND metric = p_metric AND expires_at > now() AND used > 0
             ORDER BY expires_at DESC, id DESC FOR UPDATE LOOP
      EXIT WHEN v_left <= 0;
      v_take := least(v_left, r.used);
      UPDATE public.usage_credits SET used = used - v_take WHERE id = r.id;
      v_left := v_left - v_take;
    END LOOP;
  END IF;
END;
$$;

-- ─── activate_addon: los paquetes suman saldo en lugar de instalarse ────────
-- Misma versión que fix_billing_bypass.sql más el caso de los paquetes.

CREATE OR REPLACE FUNCTION public.activate_addon(
  p_company_id uuid, p_addon_id text, p_quantity integer DEFAULT 1,
  p_stripe_subscription_item_id text DEFAULT NULL::text,
  p_stripe_checkout_session_id text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Igual que fix_billing_bypass.sql: un usuario normal solo actúa sobre su
  -- empresa y solo con add-ons gratis; los de pago los activa el webhook.
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

  IF EXISTS (SELECT 1 FROM public.addons WHERE id = p_addon_id AND credit_grants <> '{}'::jsonb) THEN
    PERFORM public.grant_addon_credits(p_company_id, p_addon_id, p_stripe_checkout_session_id);
    RETURN NULL;
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

-- ─── Límites con el saldo comprado ──────────────────────────────────────────

-- Total disponible en el periodo: lo del plan (o lo ya usado, si ya se pasó
-- y se está gastando saldo comprado) + el saldo comprado que queda.
-- NULL = el plan no tiene límite para esa métrica.
CREATE OR REPLACE FUNCTION public.company_usage_limit(p_company_id uuid, p_metric text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT greatest(cap, public.usage_used(p_company_id, p_metric)) + public.usage_credit_total(p_company_id, p_metric)
  FROM (SELECT public.usage_plan_cap(p_company_id, p_metric) AS cap) x;
$$;

CREATE OR REPLACE FUNCTION public.company_campaign_limit(p_company_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.company_usage_limit(p_company_id, 'campaign_messages'), 0);
$$;

-- Igual que en contadores_nov_2026.sql, más el saldo comprado: lo que pase
-- de lo del plan se descuenta de los paquetes.
CREATE OR REPLACE FUNCTION public.register_usage(p_company_id uuid, p_metric text, p_delta integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period timestamptz;
  v_old    integer;
  v_new    integer;
  v_cap    integer;
BEGIN
  IF p_company_id IS NULL OR coalesce(p_delta, 0) = 0 THEN RETURN NULL; END IF;

  SELECT period_start INTO v_period FROM public.company_billing_period(p_company_id);
  IF v_period IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.usage_counters (company_id, metric, value, period_start)
  VALUES (p_company_id, p_metric, 0, v_period)
  ON CONFLICT (company_id, metric, period_start) DO NOTHING;

  SELECT value INTO v_old FROM public.usage_counters
  WHERE company_id = p_company_id AND metric = p_metric AND period_start = v_period
  FOR UPDATE;

  v_new := greatest(v_old + p_delta, 0);
  UPDATE public.usage_counters SET value = v_new, updated_at = now()
  WHERE company_id = p_company_id AND metric = p_metric AND period_start = v_period;

  v_cap := public.usage_plan_cap(p_company_id, p_metric);
  IF v_cap IS NOT NULL THEN
    PERFORM public.usage_move_credits(
      p_company_id, p_metric,
      greatest(v_new - v_cap, 0) - greatest(v_old - v_cap, 0)
    );
  END IF;

  IF v_new > v_old THEN
    PERFORM public.usage_check_alerts(
      p_company_id, p_metric, v_period, v_old, v_new,
      public.company_usage_limit(p_company_id, p_metric)
    );
  END IF;

  RETURN v_new;
END;
$$;

-- Marketing: misma reserva y devolución, pero pasando por register_usage
-- para que se gaste y se regrese el saldo comprado.
CREATE OR REPLACE FUNCTION public.reserve_campaign_messages(p_company_id uuid, p_count integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period timestamptz;
  v_used integer;
  v_limit integer;
BEGIN
  IF p_count IS NULL OR p_count <= 0 THEN
    RAISE EXCEPTION 'No hay destinatarios' USING ERRCODE = 'P0001';
  END IF;

  SELECT period_start INTO v_period FROM public.company_billing_period(p_company_id);

  INSERT INTO usage_counters (company_id, metric, value, period_start)
  VALUES (p_company_id, 'campaign_messages', 0, v_period)
  ON CONFLICT (company_id, metric, period_start) DO NOTHING;

  SELECT value INTO v_used FROM usage_counters
  WHERE company_id = p_company_id AND metric = 'campaign_messages' AND period_start = v_period
  FOR UPDATE;

  v_limit := company_campaign_limit(p_company_id);

  IF v_used + p_count > v_limit THEN
    RAISE EXCEPTION 'Te quedan % mensajes de marketing y esta campaña necesita %.',
      greatest(v_limit - v_used, 0), p_count
      USING ERRCODE = 'P0001', HINT = 'campaign_limit';
  END IF;

  PERFORM public.register_usage(p_company_id, 'campaign_messages', p_count);

  RETURN jsonb_build_object(
    'used', v_used + p_count,
    'limit', v_limit,
    'remaining', v_limit - v_used - p_count,
    'period_start', v_period
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_campaign_messages(p_company_id uuid, p_period_start timestamptz, p_count integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current timestamptz;
BEGIN
  IF coalesce(p_count, 0) <= 0 THEN RETURN; END IF;
  SELECT period_start INTO v_current FROM public.company_billing_period(p_company_id);

  IF v_current = p_period_start THEN
    PERFORM public.register_usage(p_company_id, 'campaign_messages', -p_count);
  ELSE
    UPDATE usage_counters
    SET value = greatest(value - p_count, 0), updated_at = now()
    WHERE company_id = p_company_id AND metric = 'campaign_messages' AND period_start = p_period_start;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_usage_summary(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_metrics jsonb := '{}'::jsonb;
  v_metric text;
BEGIN
  -- Desde el panel solo ve su empresa; el servidor (service_role) y el editor
  -- SQL (sin JWT) ven todas. current_user no sirve aquí: en SECURITY DEFINER
  -- es el dueño de la función.
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
     AND NOT public.is_platform_admin()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT period_start, period_end INTO v_start, v_end FROM public.company_billing_period(p_company_id);

  FOREACH v_metric IN ARRAY ARRAY['ai_replies', 'reminders', 'campaign_messages'] LOOP
    v_metrics := v_metrics || jsonb_build_object(v_metric, jsonb_build_object(
      'used',          public.usage_used(p_company_id, v_metric),
      'limit',         CASE WHEN v_metric = 'campaign_messages'
                            THEN public.company_campaign_limit(p_company_id)
                            ELSE public.company_usage_limit(p_company_id, v_metric) END,
      'plan_limit',    public.usage_plan_cap(p_company_id, v_metric),
      'extra',         public.usage_credit_total(p_company_id, v_metric),
      'extra_expires', public.usage_credit_next_expiry(p_company_id, v_metric)
    ));
  END LOOP;

  RETURN jsonb_build_object('period_start', v_start, 'period_end', v_end, 'metrics', v_metrics);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_usage_period()
RETURNS TABLE(
  company_id uuid, company_name text, plan_slug text,
  period_start timestamptz, period_end timestamptz,
  ai_replies_used integer, ai_replies_limit integer,
  reminders_used integer, reminders_limit integer,
  marketing_used integer, marketing_limit integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.name::text, coalesce(c.plan_slug, c.selected_plan_slug)::text,
    bp.period_start, bp.period_end,
    coalesce(ai.value, 0), greatest(p.max_ai_replies_per_month, coalesce(ai.value, 0)) + public.usage_credit_total(c.id, 'ai_replies'),
    coalesce(rm.value, 0), greatest(p.max_reminders_per_month, coalesce(rm.value, 0)) + public.usage_credit_total(c.id, 'reminders'),
    coalesce(mk.value, 0), greatest(coalesce(p.max_campaign_messages_per_month, 0), coalesce(mk.value, 0)) + public.usage_credit_total(c.id, 'campaign_messages')
  FROM public.companies c
  LEFT JOIN public.plans p ON p.slug = coalesce(c.plan_slug, c.selected_plan_slug)
  CROSS JOIN LATERAL public.company_billing_period(c.id) bp
  LEFT JOIN public.usage_counters ai ON ai.company_id = c.id AND ai.metric = 'ai_replies'        AND ai.period_start = bp.period_start
  LEFT JOIN public.usage_counters rm ON rm.company_id = c.id AND rm.metric = 'reminders'         AND rm.period_start = bp.period_start
  LEFT JOIN public.usage_counters mk ON mk.company_id = c.id AND mk.metric = 'campaign_messages' AND mk.period_start = bp.period_start;
END;
$$;

-- ─── Tienda: el catálogo incluye credit_grants y pack_group ─────────────────

CREATE OR REPLACE FUNCTION public.get_company_available_addons(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_installed_templates text[];
  v_result jsonb;
BEGIN
  SELECT coalesce(array_agg(template_id), '{}'::text[]) INTO v_installed_templates
    FROM public.company_templates
   WHERE company_id = p_company_id;

  WITH catalogo AS (
    SELECT a.*,
           ARRAY(
             SELECT DISTINCT t
               FROM unnest(coalesce(a.available_for_templates, '{}'::text[])
                           || CASE WHEN a.requires_template IS NULL THEN '{}'::text[]
                                   ELSE ARRAY[a.requires_template] END) AS t
           ) AS templates
      FROM public.addons a
     WHERE a.is_active = true
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'short_name', c.short_name,
    'description', c.description,
    'category', c.category,
    'icon', c.icon,
    'price_monthly_cents', c.price_monthly_cents,
    'price_one_time_cents', c.price_one_time_cents,
    'currency', c.currency,
    'is_recurring', c.is_recurring,
    'is_one_time', c.is_one_time,
    'feature_flags', c.feature_flags,
    'capacity_grants', c.capacity_grants,
    'credit_grants', c.credit_grants,
    'pack_group', c.pack_group,
    'requires_plan_min', c.requires_plan_min,
    'available_for_templates', to_jsonb(c.templates),
    'is_featured', c.is_featured,
    'display_order', c.display_order,
    'is_template_specific', cardinality(c.templates) > 0
  ) ORDER BY c.display_order, c.name), '[]'::jsonb)
  INTO v_result
  FROM catalogo c
  WHERE cardinality(c.templates) = 0
     OR c.templates && v_installed_templates;

  RETURN v_result;
END;
$$;

-- ─── Permisos ───────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.grant_addon_credits(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage_credit_total(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage_credit_next_expiry(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage_plan_cap(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage_move_credits(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_campaign_messages(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_addon_credits(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage_credit_total(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage_credit_next_expiry(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage_plan_cap(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_campaign_messages(uuid, timestamptz, integer) TO service_role;
GRANT SELECT ON public.usage_credits TO authenticated;
GRANT ALL ON public.usage_credits TO service_role;

COMMIT;

-- Verificación
-- select id, name, price_one_time_cents, credit_grants, pack_group from addons where credit_grants <> '{}' order by display_order;
