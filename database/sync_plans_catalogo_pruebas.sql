-- ============================================================================
-- sync_plans_catalogo_pruebas.sql
-- 23-sep-2026 — CORRER SOLO EN EL PROYECTO DE PRUEBAS.
--
-- El catálogo de planes de pruebas venía del seed viejo (precios, textos y
-- límites distintos a producción), así que localhost mostraba otra cosa.
-- Esto lo iguala a producción (datos exportados de producción el 23-sep).
-- Incluye feature_flags: el seed viejo nunca los cargó, así que en pruebas
-- todos los planes tenían '{}' → todas las features apagadas (p. ej. Scale
-- mostraba "Tareas no disponibles en tu plan").
--
-- NO toca stripe_price_id / stripe_price_yearly_id: en pruebas deben quedar
-- los price_id de modo TEST de Stripe, no los live de producción.
-- Idempotente.
-- ============================================================================

BEGIN;

INSERT INTO public.plans (
  slug, tier, name, description, features, feature_flags,
  price_monthly_cents, price_yearly_cents,
  max_sessions_per_month, max_team_members, max_internal_users,
  max_channels, max_locations, max_agendas, max_bots,
  is_active, is_legacy, display_order, trial_days
) VALUES
  ('start', 'start', 'Start',
   'Para emprendedores que arrancan con un asistente automatizado.',
   E'WhatsApp + 1 canal
CRM completo (kanban, tareas, filtros avanzados)
Reportes avanzados con KPIs y exportación
Notas de voz y análisis de imagen con IA
Multi-sucursal con reportes por ubicación
Hasta 300 conversaciones/mes
3 usuarios · 3 agendas',
   '{"crm_kpis":true,"crm_tasks":true,"crm_kanban":true,"crm_waitlist":true,"reports_kpis":true,"support_24_7":false,"ai_pdf_wizard":true,"crm_reminders":true,"custom_domain":false,"sla_dedicated":false,"ai_voice_notes":true,"branded_emails":false,"crm_export_csv":true,"reports_export":true,"account_manager":false,"crm_tags_visual":true,"whitelabel_full":false,"ai_premium_model":false,"crm_bulk_actions":true,"ai_image_analysis":true,"crm_tags_ai_aware":true,"reports_executive":true,"ai_agent_simulator":true,"ai_multi_agent_mode":true,"ai_off_topic_wizard":true,"reports_by_location":true,"crm_advanced_filters":true,"crm_no_show_tracking":true,"crm_unified_timeline":true,"crm_referral_tracking":true,"crm_retention_metrics":true,"team_v2_rich_profiles":true,"location_aware_routing":true,"multi_location_enabled":true,"ai_advanced_personality":true}'::jsonb,
   150000, 1494000,
   300, 3, 3, 1, 1, 3, 1,
   true, false, 10, 7),

  ('growth', 'growth', 'Growth',
   'Para equipos en crecimiento con varios canales y más usuarios.',
   E'Todo lo de Start, escalado
3 canales (WhatsApp + Instagram + Messenger)
3 sucursales con reportes independientes
Hasta 750 conversaciones/mes
10 usuarios · 15 agendas · 3 bots',
   '{"crm_kpis":true,"crm_tasks":true,"crm_kanban":true,"crm_waitlist":true,"reports_kpis":true,"support_24_7":false,"ai_pdf_wizard":true,"crm_reminders":true,"custom_domain":false,"sla_dedicated":false,"ai_voice_notes":true,"branded_emails":false,"crm_export_csv":true,"reports_export":true,"account_manager":false,"crm_tags_visual":true,"whitelabel_full":false,"ai_premium_model":false,"crm_bulk_actions":true,"ai_image_analysis":true,"crm_tags_ai_aware":true,"reports_executive":true,"ai_agent_simulator":true,"ai_multi_agent_mode":true,"ai_off_topic_wizard":true,"reports_by_location":true,"crm_advanced_filters":true,"crm_no_show_tracking":true,"crm_unified_timeline":true,"crm_referral_tracking":true,"crm_retention_metrics":true,"team_v2_rich_profiles":true,"location_aware_routing":true,"multi_location_enabled":true,"ai_advanced_personality":true}'::jsonb,
   300000, 3000000,
   750, 10, 10, 3, 3, 15, 3,
   true, false, 20, 7),

  ('scale', 'scale', 'Scale',
   'Para operaciones con múltiples sucursales y altos volúmenes.',
   E'Todo lo de Growth, sin tope práctico
10 canales en paralelo
10 sucursales con dashboards ejecutivos
Hasta 2,000 conversaciones/mes
50 usuarios · 100 agendas · 10 bots',
   '{"crm_kpis":true,"crm_tasks":true,"crm_kanban":true,"crm_waitlist":true,"reports_kpis":true,"support_24_7":false,"ai_pdf_wizard":true,"crm_reminders":true,"custom_domain":false,"sla_dedicated":false,"ai_voice_notes":true,"branded_emails":false,"crm_export_csv":true,"reports_export":true,"account_manager":false,"crm_tags_visual":true,"whitelabel_full":false,"ai_premium_model":false,"crm_bulk_actions":true,"ai_image_analysis":true,"crm_tags_ai_aware":true,"reports_executive":true,"ai_agent_simulator":true,"ai_multi_agent_mode":true,"ai_off_topic_wizard":true,"reports_by_location":true,"crm_advanced_filters":true,"crm_no_show_tracking":true,"crm_unified_timeline":true,"crm_referral_tracking":true,"crm_retention_metrics":true,"team_v2_rich_profiles":true,"location_aware_routing":true,"multi_location_enabled":true,"ai_advanced_personality":true}'::jsonb,
   750000, 7470000,
   2000, 50, 50, 3, 10, 100, 10,
   true, false, 30, 7)
ON CONFLICT (slug) DO UPDATE SET
  tier                   = EXCLUDED.tier,
  name                   = EXCLUDED.name,
  description            = EXCLUDED.description,
  features               = EXCLUDED.features,
  feature_flags          = EXCLUDED.feature_flags,
  price_monthly_cents    = EXCLUDED.price_monthly_cents,
  price_yearly_cents     = EXCLUDED.price_yearly_cents,
  max_sessions_per_month = EXCLUDED.max_sessions_per_month,
  max_team_members       = EXCLUDED.max_team_members,
  max_internal_users     = EXCLUDED.max_internal_users,
  max_channels           = EXCLUDED.max_channels,
  max_locations          = EXCLUDED.max_locations,
  max_agendas            = EXCLUDED.max_agendas,
  max_bots               = EXCLUDED.max_bots,
  is_active              = EXCLUDED.is_active,
  is_legacy              = EXCLUDED.is_legacy,
  display_order          = EXCLUDED.display_order,
  trial_days             = EXCLUDED.trial_days;

SELECT slug, name, price_monthly_cents, max_sessions_per_month,
       (feature_flags->>'crm_tasks')::boolean AS crm_tasks,
       max_team_members, display_order,
       stripe_price_id IS NOT NULL AS tiene_price_mensual,
       stripe_price_yearly_id IS NOT NULL AS tiene_price_anual
  FROM public.plans
 ORDER BY display_order;

COMMIT;
