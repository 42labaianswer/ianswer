-- ============================================================================
-- SOLO PRUEBAS: agrega el plan Lite para ver Mi Plan con 4 planes.
--
-- No correr en producción. Lite todavía no tiene precio en Stripe, y sus
-- límites definitivos (respuestas de IA y recordatorios en vez de
-- conversaciones) llegan con el bloque A del plan de lanzamiento.
--
-- Precio y volumen del documento del 13-nov: $499 + IVA, anual con 17% de
-- descuento, 1 usuario, solo WhatsApp. "max_sessions_per_month = 500" es un
-- marcador mientras no existan los contadores por mensaje.
--
-- Se puede correr más de una vez. Para quitarlo:
--   DELETE FROM public.plans WHERE slug = 'lite';
-- ============================================================================

BEGIN;

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_tier_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_tier_check CHECK (tier = ANY (ARRAY['lite'::text, 'start'::text, 'growth'::text, 'scale'::text]));

INSERT INTO public.plans (
  slug, tier, name, description,
  price_monthly_cents, price_yearly_cents,
  max_sessions_per_month, max_team_members, max_internal_users,
  max_channels, max_locations, max_agendas, max_bots,
  max_campaign_messages_per_month,
  features, feature_flags,
  is_active, is_legacy, display_order, trial_days
)
SELECT
  'lite', 'lite', 'Lite', 'Para independientes que empiezan: la IA contesta y agenda por WhatsApp.',
  49900, 497000,
  500, 1, 1,
  1, 1, 1, 1,
  0,
  E'Solo WhatsApp\nCalendario y mensajes\nLa IA contesta y agenda\n1 usuario · 1 agenda\nAdd-ons disponibles',
  (SELECT feature_flags FROM public.plans WHERE slug = 'start')
    || '{"crm_kanban": false, "crm_tasks": false, "crm_advanced_filters": false, "crm_bulk_actions": false,
         "reports_kpis": false, "reports_export": false, "reports_executive": false,
         "agent_training_pro": false, "ai_multi_agent_mode": false}'::jsonb,
  true, false,
  (SELECT coalesce(min(display_order), 1) - 1 FROM public.plans WHERE slug <> 'lite'),
  14
ON CONFLICT (slug) DO UPDATE SET
  tier = EXCLUDED.tier, name = EXCLUDED.name, description = EXCLUDED.description,
  price_monthly_cents = EXCLUDED.price_monthly_cents, price_yearly_cents = EXCLUDED.price_yearly_cents,
  max_sessions_per_month = EXCLUDED.max_sessions_per_month, max_team_members = EXCLUDED.max_team_members,
  max_internal_users = EXCLUDED.max_internal_users, max_channels = EXCLUDED.max_channels,
  max_locations = EXCLUDED.max_locations, max_agendas = EXCLUDED.max_agendas, max_bots = EXCLUDED.max_bots,
  max_campaign_messages_per_month = EXCLUDED.max_campaign_messages_per_month,
  features = EXCLUDED.features, feature_flags = EXCLUDED.feature_flags,
  is_active = EXCLUDED.is_active, is_legacy = EXCLUDED.is_legacy, display_order = EXCLUDED.display_order;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE slug = 'lite' AND is_active) THEN
    RAISE EXCEPTION 'Lite no quedó guardado (rol actual: %). Corre el SQL como postgres.', current_user;
  END IF;
END $$;

SELECT slug, name, price_monthly_cents, display_order, is_active FROM public.plans ORDER BY display_order;

COMMIT;
