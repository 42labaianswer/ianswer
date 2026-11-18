-- ============================================================================
-- planes_nov_2026.sql — los 4 planes del documento del 13-nov-2026
-- ("iAnswer — Planes, costos y estrategia vs AgendaPro", sección 4).
--
-- Se corre en PRUEBAS y en PRODUCCIÓN. Idempotente.
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
-- NO toca stripe_price_id / stripe_price_yearly_id ni feature_flags de
-- Start/Growth/Scale (clientes vivos). Después de correrlo hay que dar de
-- alta los precios nuevos en Stripe y pegar los price_id en Admin → Planes;
-- hasta entonces el checkout cobra el precio viejo, y Lite no se puede
-- contratar (no tiene price_id).
-- ============================================================================

BEGIN;

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_ai_replies_per_month integer NOT NULL DEFAULT 0;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS max_reminders_per_month  integer NOT NULL DEFAULT 0;

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
  true, false, 0, 7
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

-- Subtítulo de /precios: ya no se cuenta por conversaciones y los planes se
-- separan por funciones (documento del 13-nov, sección 1).
UPDATE public.site_settings
   SET value = to_jsonb('Elige el plan según tus canales, tu equipo y tus sucursales. Todos traen la IA que contesta y agenda, y add-ons cuando necesites más.'::text),
       updated_at = now()
 WHERE key = 'pricing_subtitle';

DO $$
BEGIN
  IF (SELECT count(*) FROM public.plans WHERE slug IN ('lite','start','growth','scale') AND is_active) <> 4 THEN
    RAISE EXCEPTION 'No quedaron los 4 planes activos (rol actual: %). Corre el SQL como postgres.', current_user;
  END IF;
END $$;

SELECT slug, name, price_monthly_cents, price_yearly_cents,
       max_ai_replies_per_month, max_reminders_per_month, max_campaign_messages_per_month,
       max_internal_users, max_channels, max_locations, display_order,
       stripe_price_id IS NOT NULL AS tiene_price_mensual
  FROM public.plans
 ORDER BY display_order;

COMMIT;
