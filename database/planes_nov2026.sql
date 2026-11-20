-- ============================================================================
-- Planes de noviembre 2026: Lite, Start, Growth y Pro (documento del 13-nov).
--
-- * Lite nuevo: $499, solo WhatsApp, panel de calendario y mensajes,
--   1 usuario, 1 agenda, prueba de 14 días (agendas y prueba: valores
--   provisionales, por confirmar con Roy).
-- * Start $1,199, Growth $2,999 y Pro $7,999 (Pro es el plan "scale": se
--   conserva el slug para no romper suscripciones ni código).
-- * Columnas nuevas para los contadores por mensaje (respuestas de IA y
--   recordatorios) y los canales permitidos. Marketing incluido sigue en
--   max_campaign_messages_per_month (solo Pro trae 500).
-- * Anual con 17% de descuento, igual que antes.
--
-- IMPORTANTE: en producción correr SOLO junto con los precios nuevos de
-- Stripe (stripe_price_id / stripe_price_yearly_id). Si se corre antes, la
-- pantalla muestra el precio nuevo y Stripe cobra el viejo. Lite queda sin
-- precio de Stripe: Mi Plan lo muestra, pero el checkout avisa que falta.
--
-- También actualiza get_company_entitlements (expone los límites nuevos y los
-- canales permitidos) y assert_channel_capacity (Lite no puede conectar
-- Instagram ni Facebook).
--
-- Los límites por mensaje todavía no se aplican (eso es el bloque B); hoy se
-- sigue contando por conversaciones con max_sessions_per_month.
--
-- Se puede correr más de una vez.
-- ============================================================================

BEGIN;

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_tier_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_tier_check CHECK (tier = ANY (ARRAY['lite'::text, 'start'::text, 'growth'::text, 'scale'::text]));

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_ai_replies_per_month integer NOT NULL DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_reminders_per_month integer NOT NULL DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS allowed_channels text[] NOT NULL DEFAULT ARRAY['whatsapp', 'instagram', 'facebook'];

COMMENT ON COLUMN public.plans.max_ai_replies_per_month IS 'Mensajes que puede enviar la IA al mes (una burbuja = 1). Los add-ons suman.';
COMMENT ON COLUMN public.plans.max_reminders_per_month IS 'Plantillas de utilidad (recordatorios) entregadas al mes. Los add-ons suman.';
COMMENT ON COLUMN public.plans.allowed_channels IS 'Canales que el plan puede conectar: whatsapp, instagram, facebook.';

-- Lite toma los flags de Start y apaga lo que no incluye.
INSERT INTO public.plans (slug, tier, name, description, price_monthly_cents, price_yearly_cents,
                          max_sessions_per_month, max_team_members, max_internal_users, max_channels,
                          max_locations, max_agendas, max_bots, features, feature_flags,
                          is_active, is_legacy, display_order, trial_days)
SELECT 'lite', 'lite', 'Lite', '', 49900, 497000, 500, 1, 1, 1, 1, 1, 1, '',
       (SELECT feature_flags FROM public.plans WHERE slug = 'start'),
       true, false, 0, 14
ON CONFLICT (slug) DO NOTHING;

UPDATE public.plans p SET
  name = v.name,
  description = v.description,
  price_monthly_cents = v.monthly,
  price_yearly_cents = v.yearly,
  max_ai_replies_per_month = v.ai_replies,
  max_reminders_per_month = v.reminders,
  max_campaign_messages_per_month = v.marketing,
  max_internal_users = v.users,
  max_team_members = v.users,
  max_locations = v.branches,
  max_agendas = v.agendas,
  max_channels = cardinality(v.channels),
  allowed_channels = v.channels,
  display_order = v.ord,
  trial_days = 14,
  features = v.features,
  feature_flags = p.feature_flags || v.flags,
  is_active = true,
  is_legacy = false,
  updated_at = now()
FROM (VALUES
  ('lite', 'Lite', 'Para independientes que empiezan: la IA contesta y agenda por WhatsApp.',
   49900, 497000, 500, 100, 0, 1, 1, 1, ARRAY['whatsapp'], 0,
   E'Solo WhatsApp\n500 respuestas de IA al mes\n100 recordatorios de cita al mes\nCalendario y mensajes\n1 usuario · 1 agenda\nAdd-ons disponibles',
   '{"plan_panel_full": false, "payment_links": false, "agent_training_pro": false, "team_management": false,
     "import_contacts": false, "api_access": false,
     "crm_kanban": false, "crm_tasks": false, "crm_advanced_filters": false, "crm_bulk_actions": false,
     "reports_kpis": false, "reports_export": false, "reports_executive": false, "ai_multi_agent_mode": false}'::jsonb),
  ('start', 'Start', 'Para negocios chicos de 1 a 3 personas.',
   119900, 1194200, 1500, 500, 0, 3, 1, 3, ARRAY['whatsapp', 'instagram', 'facebook'], 1,
   E'WhatsApp, Instagram y Facebook\n1,500 respuestas de IA al mes\n500 recordatorios de cita al mes\nCRM completo\nAgenda, reagenda y links de pago\n3 usuarios · 3 agendas\nCuestionario de personalización como add-on',
   '{"plan_panel_full": true, "payment_links": true, "agent_training_pro": false, "team_management": true,
     "import_contacts": false, "api_access": false}'::jsonb),
  ('growth', 'Growth', 'Para un consultorio o clínica de una sucursal.',
   299900, 2987000, 5000, 2000, 0, 10, 1, 15, ARRAY['whatsapp', 'instagram', 'facebook'], 2,
   E'5,000 respuestas de IA al mes\n2,000 recordatorios de cita al mes\nEquipo de trabajo: quién atiende qué, horarios y especialidades\nCuestionario de personalización incluido\n10 usuarios · 15 agendas',
   '{"plan_panel_full": true, "payment_links": true, "agent_training_pro": true, "team_management": true,
     "import_contacts": false, "api_access": false}'::jsonb),
  ('scale', 'Pro', 'Para clínicas, laboratorios y franquicias con varias sucursales.',
   799900, 7967000, 10000, 5000, 500, 50, 10, 50, ARRAY['whatsapp', 'instagram', 'facebook'], 3,
   E'10,000 respuestas de IA al mes\n5,000 recordatorios de cita al mes\n500 mensajes de marketing de regalo\nHasta 10 sucursales\nImportar contactos\nIntegraciones y API\n50 usuarios · 50 agendas',
   '{"plan_panel_full": true, "payment_links": true, "agent_training_pro": true, "team_management": true,
     "import_contacts": true, "api_access": true}'::jsonb)
) AS v(slug, name, description, monthly, yearly, ai_replies, reminders, marketing, users, branches, agendas,
       channels, ord, features, flags)
WHERE p.slug = v.slug;

-- Entitlements: igual que add_campaigns.sql + respuestas de IA y recordatorios
-- en capacity (los add-ons suman con capacity_grants) y los canales
-- permitidos en plan.allowed_channels.
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
         p.max_ai_replies_per_month, p.max_reminders_per_month, p.allowed_channels,
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
    'max_campaign_messages_per_month', v_company.max_campaign_messages_per_month,
    'max_ai_replies_per_month',        v_company.max_ai_replies_per_month,
    'max_reminders_per_month',         v_company.max_reminders_per_month
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
      'price_yearly_cents',  v_company.price_yearly_cents,
      'allowed_channels',    to_jsonb(v_company.allowed_channels)
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

-- Límite de canales: además del número (max_channels), el plan decide qué
-- canales se pueden conectar (Lite: solo WhatsApp). En la base el canal de
-- Facebook se llama 'messenger'. Mismo HINT 'channel_limit' para que las
-- rutas de la API respondan 403 con el mensaje.
CREATE OR REPLACE FUNCTION public.assert_channel_capacity(p_company_id uuid, p_channel text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channels text[];
  v_max integer;
  v_allowed jsonb;
  v_plan_channel text;
BEGIN
  IF p_company_id IS NULL OR is_platform_admin() THEN
    RETURN;
  END IF;

  v_channels := company_connected_channels(p_company_id);
  IF p_channel = ANY (v_channels) THEN
    RETURN;
  END IF;

  v_allowed := get_company_entitlements(p_company_id) -> 'plan' -> 'allowed_channels';
  v_plan_channel := CASE WHEN p_channel = 'messenger' THEN 'facebook' ELSE p_channel END;
  IF v_allowed IS NOT NULL AND jsonb_typeof(v_allowed) = 'array' AND NOT (v_allowed ? v_plan_channel) THEN
    RAISE EXCEPTION 'Tu plan no incluye %. Cambia de plan para conectarlo.',
      CASE v_plan_channel WHEN 'facebook' THEN 'Facebook' WHEN 'instagram' THEN 'Instagram' WHEN 'whatsapp' THEN 'WhatsApp' ELSE v_plan_channel END
      USING ERRCODE = 'P0001', HINT = 'channel_limit';
  END IF;

  v_max := company_channel_limit(p_company_id);
  IF cardinality(v_channels) + 1 > v_max THEN
    RAISE EXCEPTION 'Tu plan permite % % y ya tienes % %. Cambia de plan para conectar otro.',
      v_max, CASE WHEN v_max = 1 THEN 'canal' ELSE 'canales' END,
      cardinality(v_channels), CASE WHEN cardinality(v_channels) = 1 THEN 'conectado' ELSE 'conectados' END
      USING ERRCODE = 'P0001', HINT = 'channel_limit';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_channel_capacity(uuid, text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.plans
   WHERE slug IN ('lite', 'start', 'growth', 'scale') AND max_ai_replies_per_month > 0;
  IF n <> 4 THEN
    RAISE EXCEPTION 'Solo % de 4 planes quedaron actualizados (rol actual: %). Corre el SQL como postgres.', n, current_user;
  END IF;
END $$;

SELECT slug, name, price_monthly_cents, price_yearly_cents, max_ai_replies_per_month, max_reminders_per_month,
       max_campaign_messages_per_month, allowed_channels, max_agendas, display_order, stripe_price_id
  FROM public.plans
 WHERE slug IN ('lite', 'start', 'growth', 'scale')
 ORDER BY display_order;

COMMIT;
