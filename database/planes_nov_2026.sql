-- ============================================================================
-- planes_nov_2026.sql — los 4 planes del documento del 13-nov-2026
-- ("iAnswer — Planes, costos y estrategia vs AgendaPro", sección 4).
--
-- Se corre en pruebas y en producción. Idempotente. EN PRODUCCIÓN, SOLO
-- JUNTO CON LOS PRECIOS NUEVOS DE STRIPE (ver el final de este encabezado).
--
--   Lite   $499    · 500 respuestas de IA  · 100 recordatorios   · solo WhatsApp · 1 usuario
--   Start  $1,199  · 1,500 respuestas      · 500 recordatorios   · 3 canales     · 3 usuarios
--   Growth $2,999  · 5,000 respuestas      · 2,000 recordatorios · 3 canales     · 10 usuarios
--   Pro    $7,999  · 10,000 respuestas     · 5,000 recordatorios · 500 marketing · 50 usuarios · 10 sucursales
--
-- Precios mensuales más IVA; el anual lleva 17% de descuento (total del año).
-- Pro conserva slug/tier 'scale' para no romper suscripciones ni price_id;
-- solo cambia el nombre que se muestra.
--
-- Contadores nuevos: max_ai_replies_per_month y max_reminders_per_month.
-- Mientras no existan los contadores por mensaje (bloque B),
-- max_sessions_per_month queda igual a las respuestas de IA como tope
-- provisional.
--
-- También:
--   * allowed_channels: canales que cada plan puede conectar (Lite: solo
--     WhatsApp). Lo revisa assert_channel_capacity al conectar un canal.
--   * feature_flags: solo agrega llaves nuevas (plan_panel_full,
--     team_management, payment_links, import_contacts, api_access) que usan
--     los bloqueos del dashboard (lib/planLocks). A Lite le apaga además lo
--     que no incluye. No cambia los flags que ya tenían Start/Growth/Scale.
--   * get_company_entitlements devuelve los límites nuevos y los canales
--     permitidos.
--   * Lite: prueba de 14 días y 1 agenda (provisional, por confirmar).
--
-- NO toca stripe_price_id / stripe_price_yearly_id. Si se corre en
-- producción antes de pegar los price_id nuevos en Admin → Planes, la
-- pantalla muestra el precio nuevo y el checkout cobra el viejo, y Lite no
-- se puede contratar (no tiene price_id).
-- ============================================================================

BEGIN;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_ai_replies_per_month integer NOT NULL DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_reminders_per_month  integer NOT NULL DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS allowed_channels text[] NOT NULL DEFAULT ARRAY['whatsapp', 'instagram', 'facebook'];

COMMENT ON COLUMN public.plans.max_ai_replies_per_month IS 'Mensajes que puede enviar la IA al mes (una burbuja = 1). Los add-ons suman.';
COMMENT ON COLUMN public.plans.max_reminders_per_month IS 'Plantillas de utilidad (recordatorios) entregadas al mes. Los add-ons suman.';
COMMENT ON COLUMN public.plans.allowed_channels IS 'Canales que el plan puede conectar: whatsapp, instagram, facebook.';

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_tier_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_tier_check CHECK (tier = ANY (ARRAY['lite'::text, 'start'::text, 'growth'::text, 'scale'::text]));

-- Lite: flags de Start con CRM básico (solo calendario y mensajes).
INSERT INTO public.plans (slug, tier, name, feature_flags, is_active, is_legacy, display_order, trial_days)
SELECT 'lite', 'lite', 'Lite',
  (SELECT feature_flags FROM public.plans WHERE slug = 'start')
    || '{"crm_kanban": false, "crm_tasks": false, "crm_advanced_filters": false, "crm_bulk_actions": false,
         "reports_kpis": false, "reports_export": false, "reports_executive": false,
         "agent_training_pro": false, "ai_multi_agent_mode": false, "team_v2_rich_profiles": false}'::jsonb,
  true, false, 0, 14
ON CONFLICT (slug) DO NOTHING;

WITH v (slug, name, description, monthly, yearly, ai_replies, reminders, marketing,
        users, members, channels, locations, agendas, display_order, features) AS (
  VALUES
  ('lite', 'Lite', 'Para el independiente que empieza: la IA contesta y agenda por WhatsApp.',
   49900, 497000, 500, 100, 0, 1, 1, 1, 1, 1, 5,
   E'Solo WhatsApp\nCalendario y mensajes\nLa IA contesta y agenda\n500 respuestas de IA al mes\n100 recordatorios de cita al mes\n1 usuario\nEscala a humano en urgencias\nAdd-ons disponibles'),

  ('start', 'Start', 'Para negocios chicos de 1 a 3 personas.',
   119900, 1194200, 1500, 500, 0, 3, 3, 3, 1, 3, 10,
   E'Todo lo de Lite\nWhatsApp, Instagram y Facebook\nCRM completo\nReagenda y links de pago\n1,500 respuestas de IA al mes\n500 recordatorios de cita al mes\n3 usuarios\nCuestionario de personalización como add-on'),

  ('growth', 'Growth', 'Para un consultorio o clínica de una sucursal.',
   299900, 2987000, 5000, 2000, 0, 10, 10, 3, 1, 15, 20,
   E'Todo lo de Start\nEquipo de trabajo: quién atiende qué, horarios y especialidades\nCuestionario de personalización incluido\n5,000 respuestas de IA al mes\n2,000 recordatorios de cita al mes\n10 usuarios'),

  ('scale', 'Pro', 'Para clínicas, laboratorios y franquicias con varias sucursales.',
   799900, 7967000, 10000, 5000, 500, 50, 50, 3, 10, 50, 30,
   E'Todo lo de Growth\nHasta 10 sucursales, con equipo por sucursal\n10,000 respuestas de IA al mes\n5,000 recordatorios de cita al mes\n500 mensajes de marketing de regalo\n50 usuarios\nImportar contactos\nIntegraciones y API')
)
UPDATE public.plans p SET
  name                            = v.name,
  description                     = v.description,
  features                        = v.features,
  price_monthly_cents             = v.monthly,
  price_yearly_cents              = v.yearly,
  max_ai_replies_per_month        = v.ai_replies,
  max_reminders_per_month         = v.reminders,
  max_sessions_per_month          = v.ai_replies,
  max_campaign_messages_per_month = v.marketing,
  max_internal_users              = v.users,
  max_team_members                = v.members,
  max_channels                    = v.channels,
  max_locations                   = v.locations,
  max_agendas                     = v.agendas,
  display_order                   = v.display_order,
  trial_days                      = 14,
  is_active                       = true,
  updated_at                      = now()
FROM v
WHERE p.slug = v.slug;

-- Funciones por plan (sección 10-A del documento). Hoy solo las lee la tabla
-- comparativa; la columna ya existía y no se usaba. No prende ni apaga nada.
UPDATE public.plans p SET features_jsonb = v.f, updated_at = now()
FROM (VALUES
  ('lite',   '{"channels":["whatsapp"],"crm":"basic","payment_links":false,"questionnaire":false,"team":false,"escalation":true,"addons":true,"import_contacts":false,"api":false}'::jsonb),
  ('start',  '{"channels":["whatsapp","instagram","facebook"],"crm":"full","payment_links":true,"questionnaire":"addon","team":false,"escalation":true,"addons":true,"import_contacts":false,"api":false}'::jsonb),
  ('growth', '{"channels":["whatsapp","instagram","facebook"],"crm":"full","payment_links":true,"questionnaire":true,"team":true,"escalation":true,"addons":true,"import_contacts":false,"api":false}'::jsonb),
  ('scale',  '{"channels":["whatsapp","instagram","facebook"],"crm":"full","payment_links":true,"questionnaire":true,"team":"per_branch","escalation":true,"addons":true,"import_contacts":true,"api":true}'::jsonb)
) AS v (slug, f)
WHERE p.slug = v.slug;

-- Canales que se pueden conectar: los mismos de features_jsonb.channels.
UPDATE public.plans
   SET allowed_channels = ARRAY(SELECT jsonb_array_elements_text(features_jsonb -> 'channels'))
 WHERE slug IN ('lite', 'start', 'growth', 'scale')
   AND jsonb_typeof(features_jsonb -> 'channels') = 'array';

-- Llaves nuevas para los bloqueos del dashboard (lib/planLocks).
-- team_management sigue en true para Start aunque el documento diga que no
-- trae Equipo: está pendiente de confirmar con Roy.
UPDATE public.plans p SET feature_flags = p.feature_flags || v.flags, updated_at = now()
FROM (VALUES
  ('lite',   '{"plan_panel_full": false, "team_management": false, "payment_links": false, "import_contacts": false, "api_access": false}'::jsonb),
  ('start',  '{"plan_panel_full": true,  "team_management": true,  "payment_links": true,  "import_contacts": false, "api_access": false}'::jsonb),
  ('growth', '{"plan_panel_full": true,  "team_management": true,  "payment_links": true,  "import_contacts": false, "api_access": false}'::jsonb),
  ('scale',  '{"plan_panel_full": true,  "team_management": true,  "payment_links": true,  "import_contacts": true,  "api_access": true}'::jsonb)
) AS v (slug, flags)
WHERE p.slug = v.slug;

-- Subtítulo de /precios: ya no se cuenta por conversaciones y los planes se
-- separan por funciones (documento del 13-nov, sección 1).
UPDATE public.site_settings
   SET value = to_jsonb('Elige el plan según tus canales, tu equipo y tus sucursales. Todos traen la IA que contesta y agenda, y add-ons cuando necesites más.'::text),
       updated_at = now()
 WHERE key = 'pricing_subtitle';

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
BEGIN
  IF (SELECT count(*) FROM public.plans WHERE slug IN ('lite','start','growth','scale') AND is_active) <> 4 THEN
    RAISE EXCEPTION 'No quedaron los 4 planes activos (rol actual: %). Corre el SQL como postgres.', current_user;
  END IF;
END $$;

SELECT slug, name, price_monthly_cents, price_yearly_cents,
       max_ai_replies_per_month, max_reminders_per_month, max_campaign_messages_per_month,
       max_internal_users, max_channels, allowed_channels, max_locations, trial_days, display_order,
       stripe_price_id IS NOT NULL AS tiene_price_mensual
  FROM public.plans
 ORDER BY display_order;

COMMIT;
