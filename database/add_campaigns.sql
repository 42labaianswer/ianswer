-- Campañas de publicidad por WhatsApp con límite mensual de mensajes por plan.
--
-- Reglas (confirmadas por Rubén / Roy):
--   * 1 mensaje = 1 contacto al que Meta aceptó el envío. Lo que Meta rechaza
--     no descuenta.
--   * Se mandan plantillas de marketing ya aprobadas en el WABA del cliente.
--   * Destinatarios: contactos de WhatsApp que no se dieron de baja
--     (opted_out = false), todos o filtrados por etiqueta / etapa del CRM.
--   * El contador se reinicia cada mes calendario (usage_counters, métrica
--     'campaign_messages', igual que las sesiones).
--   * Límite: plans.max_campaign_messages_per_month (Start 50, Growth 100,
--     Scale 250, cualquier otro plan 0) + capacity_grants de add-ons con la
--     misma clave.
--
-- El servidor reserva los mensajes antes de enviar (reserve_campaign_messages,
-- con bloqueo de fila para que dos envíos simultáneos no se pasen del límite)
-- y devuelve los que Meta rechazó (release_campaign_messages).
--
-- Primero pruebas, luego producción.

-- ── Paso 0 (diagnóstico) ──
-- Este archivo vuelve a crear get_company_entitlements a partir de
-- database/schema.sql, agregando solo max_campaign_messages_per_month. Antes
-- de correrlo, revisar que la versión de la base sea la misma que la de
-- schema.sql (líneas ~1146-1280). Si tiene algo distinto, no seguir y avisar.
--
-- SELECT pg_get_functiondef('public.get_company_entitlements(uuid)'::regprocedure);

-- ── Paso 1 ──
BEGIN;

-- Límite por plan
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_campaign_messages_per_month integer NOT NULL DEFAULT 0;

ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_max_campaign_messages_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_max_campaign_messages_check CHECK (max_campaign_messages_per_month >= 0);

COMMENT ON COLUMN public.plans.max_campaign_messages_per_month IS
  'Mensajes de campaña de publicidad por mes calendario (1 por contacto enviado con éxito).';

UPDATE public.plans SET max_campaign_messages_per_month = 50  WHERE slug = 'start';
UPDATE public.plans SET max_campaign_messages_per_month = 100 WHERE slug = 'growth';
UPDATE public.plans SET max_campaign_messages_per_month = 250 WHERE slug = 'scale';

-- Entitlements: igual que schema.sql + max_campaign_messages_per_month en capacity
CREATE OR REPLACE FUNCTION public.get_company_entitlements(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_company        record;
  v_plan           record;
  v_templates      jsonb;
  v_addons         jsonb;
  v_features       jsonb;
  v_capacity       jsonb;
  v_addon_features jsonb;
  v_addon_capacity jsonb;
BEGIN
  -- Company + plan en una sola query
  SELECT c.id, c.plan_slug, c.account_status, c.subscription_status, c.trial_ends_at,
         p.tier, p.name AS plan_name, p.description AS plan_description,
         p.price_monthly_cents, p.price_yearly_cents,
         p.max_sessions_per_month, p.max_team_members, p.max_internal_users,
         p.max_channels, p.max_locations, p.max_agendas, p.max_bots,
         p.max_campaign_messages_per_month,
         p.feature_flags AS plan_features
    INTO v_company
    FROM public.companies c
    JOIN public.plans p ON p.slug = c.plan_slug
   WHERE c.id = p_company_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Templates instalados con su info completa
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',             t.id,
      'name',           t.name,
      'icon',           t.icon,
      'theme_color',    t.theme_color,
      'accent_color',   t.accent_color,
      'tenant_label',   t.tenant_label,
      'ui_labels',      t.ui_labels,
      'active_modules', t.active_modules,
      'funnels',        t.funnels,
      'is_primary',     ct.is_primary,
      'config',         ct.config
    )
    ORDER BY ct.is_primary DESC, t.display_order ASC
  ), '[]'::jsonb)
    INTO v_templates
    FROM public.company_templates ct
    JOIN public.templates t ON t.id = ct.template_id
   WHERE ct.company_id = p_company_id;

  -- Addons activos
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                 a.id,
      'name',               a.name,
      'category',           a.category,
      'quantity',           ca.quantity,
      'feature_flags',      a.feature_flags,
      'capacity_grants',    a.capacity_grants,
      'status',             ca.status,
      'activated_at',       ca.activated_at,
      'current_period_end', ca.current_period_end
    )
  ), '[]'::jsonb)
    INTO v_addons
    FROM public.company_addons ca
    JOIN public.addons a ON a.id = ca.addon_id
   WHERE ca.company_id = p_company_id
     AND ca.status = 'active';

  -- Fusionar feature_flags del plan + cada addon activo
  v_features := v_company.plan_features;
  SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_addon_features
    FROM (
      SELECT k, bool_or(v::boolean) AS v
        FROM public.company_addons ca
        JOIN public.addons a ON a.id = ca.addon_id,
             jsonb_each(a.feature_flags) AS f(k, v)
       WHERE ca.company_id = p_company_id
         AND ca.status = 'active'
       GROUP BY k
    ) AS addon_flags;
  v_features := v_features || v_addon_features;

  -- Construir capacity sumando lo que dan los addons
  v_capacity := jsonb_build_object(
    'max_sessions_per_month',          v_company.max_sessions_per_month,
    'max_team_members',                v_company.max_team_members,
    'max_internal_users',              v_company.max_internal_users,
    'max_channels',                    v_company.max_channels,
    'max_locations',                   v_company.max_locations,
    'max_agendas',                     v_company.max_agendas,
    'max_bots',                        v_company.max_bots,
    'max_campaign_messages_per_month', v_company.max_campaign_messages_per_month
  );

  SELECT COALESCE(jsonb_object_agg(k, base_v + grant_v), '{}'::jsonb)
    INTO v_addon_capacity
    FROM (
      SELECT k,
             (v_capacity->>k)::integer AS base_v,
             SUM((v::text)::integer * ca.quantity)::integer AS grant_v
        FROM public.company_addons ca
        JOIN public.addons a ON a.id = ca.addon_id,
             jsonb_each(a.capacity_grants) AS g(k, v)
       WHERE ca.company_id = p_company_id
         AND ca.status = 'active'
       GROUP BY k
    ) AS addon_caps;

  IF v_addon_capacity IS NOT NULL AND v_addon_capacity != '{}'::jsonb THEN
    v_capacity := v_capacity || v_addon_capacity;
  END IF;

  RETURN jsonb_build_object(
    'plan', jsonb_build_object(
      'slug',                v_company.plan_slug,
      'tier',                v_company.tier,
      'name',                v_company.plan_name,
      'description',         v_company.plan_description,
      'price_monthly_cents', v_company.price_monthly_cents,
      'price_yearly_cents',  v_company.price_yearly_cents
    ),
    'features',       v_features,
    'features_jsonb', v_features,
    'capacity',       v_capacity,
    'templates',      v_templates,
    'addons',         v_addons,
    'account_status', v_company.account_status,
    'computed_at',    now()
  );
END;
$$;

-- Campañas
CREATE TABLE IF NOT EXISTS public.campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name              text NOT NULL,
  template_name     text NOT NULL,
  template_language text NOT NULL,
  template_params   jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'sending'
                    CHECK (status IN ('sending', 'completed', 'failed')),
  total_recipients  integer NOT NULL DEFAULT 0,
  sent_count        integer NOT NULL DEFAULT 0,
  failed_count      integer NOT NULL DEFAULT 0,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz
);

COMMENT ON TABLE public.campaigns IS
  'Campañas de publicidad por WhatsApp (plantilla de marketing aprobada + destinatarios). Solo el servidor escribe.';
COMMENT ON COLUMN public.campaigns.audience IS
  'Filtro usado: {"tag_ids": [...], "stages": [...]}; vacío = todos los contactos de WhatsApp sin baja.';

CREATE INDEX IF NOT EXISTS idx_campaigns_company_created
  ON public.campaigns (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id   uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id    text NOT NULL,
  phone         text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'sent', 'failed')),
  wa_message_id text,
  error         text,
  sent_at       timestamptz,
  UNIQUE (campaign_id, contact_id)
);

COMMENT ON TABLE public.campaign_recipients IS
  'Un renglón por contacto de cada campaña. status = sent es lo que cuenta contra el límite mensual.';

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign
  ON public.campaign_recipients (campaign_id);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Campaigns: select por miembro" ON public.campaigns;
CREATE POLICY "Campaigns: select por miembro" ON public.campaigns
  FOR SELECT USING (
    company_id IN (SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid())
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Campaign recipients: select por miembro" ON public.campaign_recipients;
CREATE POLICY "Campaign recipients: select por miembro" ON public.campaign_recipients
  FOR SELECT USING (
    company_id IN (SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid())
    OR public.is_platform_admin()
  );

-- Límite y contador
CREATE OR REPLACE FUNCTION public.company_campaign_limit(p_company_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((get_company_entitlements(p_company_id) -> 'capacity' ->> 'max_campaign_messages_per_month')::integer, 0);
$$;

-- Uso del mes calendario actual: {used, limit, remaining, period_start}
CREATE OR REPLACE FUNCTION public.get_campaign_usage(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period timestamptz := date_trunc('month', now());
  v_used integer;
  v_limit integer;
BEGIN
  SELECT value INTO v_used
  FROM usage_counters
  WHERE company_id = p_company_id AND metric = 'campaign_messages' AND period_start = v_period;

  v_used := coalesce(v_used, 0);
  v_limit := company_campaign_limit(p_company_id);

  RETURN jsonb_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'period_start', v_period
  );
END;
$$;

-- Aparta p_count mensajes del mes. Lanza error con HINT 'campaign_limit' si no
-- alcanzan; las rutas de la API lo traducen a 403.
CREATE OR REPLACE FUNCTION public.reserve_campaign_messages(p_company_id uuid, p_count integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period timestamptz := date_trunc('month', now());
  v_used integer;
  v_limit integer;
BEGIN
  IF p_count IS NULL OR p_count <= 0 THEN
    RAISE EXCEPTION 'No hay destinatarios' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO usage_counters (company_id, metric, value, period_start)
  VALUES (p_company_id, 'campaign_messages', 0, v_period)
  ON CONFLICT (company_id, metric, period_start) DO NOTHING;

  SELECT value INTO v_used
  FROM usage_counters
  WHERE company_id = p_company_id AND metric = 'campaign_messages' AND period_start = v_period
  FOR UPDATE;

  v_limit := company_campaign_limit(p_company_id);

  IF v_used + p_count > v_limit THEN
    RAISE EXCEPTION 'Tu plan permite % mensajes de campaña al mes y te quedan %. Esta campaña necesita %.',
      v_limit, greatest(v_limit - v_used, 0), p_count
      USING ERRCODE = 'P0001', HINT = 'campaign_limit';
  END IF;

  UPDATE usage_counters
  SET value = value + p_count, updated_at = now()
  WHERE company_id = p_company_id AND metric = 'campaign_messages' AND period_start = v_period;

  RETURN jsonb_build_object(
    'used', v_used + p_count,
    'limit', v_limit,
    'remaining', v_limit - v_used - p_count,
    'period_start', v_period
  );
END;
$$;

-- Devuelve al mes de la reserva los mensajes que Meta no aceptó.
CREATE OR REPLACE FUNCTION public.release_campaign_messages(p_company_id uuid, p_period_start timestamptz, p_count integer)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE usage_counters
  SET value = greatest(value - greatest(p_count, 0), 0), updated_at = now()
  WHERE company_id = p_company_id AND metric = 'campaign_messages' AND period_start = p_period_start;
$$;

-- Solo el servidor (service_role) llama a estas funciones.
REVOKE ALL ON FUNCTION public.company_campaign_limit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_campaign_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_campaign_messages(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_campaign_messages(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_campaign_limit(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_campaign_messages(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_campaign_messages(uuid, timestamptz, integer) TO service_role;

COMMIT;

-- Verificación: límite y uso del mes por plan
-- select slug, max_campaign_messages_per_month from plans order by display_order;
-- select c.name, c.plan_slug, get_campaign_usage(c.id) from companies c order by c.created_at desc limit 20;
