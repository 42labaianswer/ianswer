-- ============================================================================
-- training_pro_growth_scale.sql
-- Entrenamiento PRO deja de ser add-on y pasa a venir incluido en los planes
-- Growth y Scale (decisión de Roy).
--
-- - Flag agent_training_pro: true en Growth y Scale, false en Start.
-- - Growth anuncia "Entrenamiento PRO del agente" en sus features; Scale lo
--   hereda con "Todo lo de Growth, escalado".
-- - has_agent_training_active (la usan la pestaña Entrenamiento de Agente AI
--   y /api/agent-training) lee el flag de get_company_entitlements en vez de
--   buscar el add-on.
-- - Se borra el add-on y sus filas de company_addons (company_addons.addon_id
--   tiene ON DELETE RESTRICT). Se busca por su flag porque su id es un uuid
--   que puede no ser el mismo en pruebas y en producción.
--
-- Los documentos de entrenamiento ya guardados (companies.agent_training y
-- team.custom_data.training) no se tocan.
--
-- Correr como postgres (selector "Role" del SQL Editor), sin texto
-- seleccionado. Primero pruebas, luego producción.
-- ============================================================================

-- Antes de correr: empresas que tienen o tuvieron el add-on. Las que estén en
-- Start pierden la pestaña Entrenamiento. Si alguna está active o past_due con
-- stripe_subscription_item_id, hay que cancelar ese cobro en Stripe ANTES de
-- correr el resto (el script lo frena).
SELECT c.name AS empresa, c.plan_slug, ca.status,
       ca.stripe_subscription_item_id, ca.current_period_end
  FROM public.company_addons ca
  JOIN public.addons a    ON a.id = ca.addon_id
  JOIN public.companies c ON c.id = ca.company_id
 WHERE a.feature_flags ? 'agent_training_pro'
 ORDER BY ca.status, c.name;

BEGIN;

CREATE TEMP TABLE addon_training ON COMMIT DROP AS
SELECT id FROM public.addons WHERE feature_flags ? 'agent_training_pro';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.company_addons
     WHERE addon_id IN (SELECT id FROM addon_training)
       AND status IN ('active', 'past_due')
       AND stripe_subscription_item_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Hay Entrenamiento PRO con cobro activo en Stripe. Cancélalo en Stripe y vuelve a correr.';
  END IF;
END $$;

UPDATE public.plans
   SET feature_flags = coalesce(feature_flags, '{}'::jsonb)
                       || jsonb_build_object('agent_training_pro', slug IN ('growth', 'scale'))
 WHERE slug IN ('start', 'growth', 'scale');

UPDATE public.plans
   SET features = E'Todo lo de Start, escalado
3 canales
Entrenamiento PRO del agente
Hasta 750 conversaciones/mes
10 miembros · 15 agendas
100 mensajes de campaña de publicidad'
 WHERE slug = 'growth';

UPDATE public.plans
   SET features = E'Todo lo de Growth, escalado
Hasta 2,000 conversaciones/mes
50 miembros · 50 agendas
250 mensajes de campaña de publicidad'
 WHERE slug = 'scale';

CREATE OR REPLACE FUNCTION public.has_agent_training_active(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce((get_company_entitlements(p_company_id) -> 'features' ->> 'agent_training_pro')::boolean, false);
$$;

DELETE FROM public.company_addons
 WHERE addon_id IN (SELECT id FROM addon_training);

DELETE FROM public.addons
 WHERE id IN (SELECT id FROM addon_training);

-- Con un rol distinto de postgres, RLS deja los UPDATE/DELETE en 0 filas sin error.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.addons WHERE feature_flags ? 'agent_training_pro')
     OR (SELECT count(*) FROM public.plans
          WHERE slug IN ('start', 'growth', 'scale')
            AND (feature_flags->>'agent_training_pro')::boolean = (slug IN ('growth', 'scale'))) <> 3
     OR (SELECT features FROM public.plans WHERE slug = 'growth') NOT LIKE '%Entrenamiento PRO%' THEN
    RAISE EXCEPTION 'No se aplicaron los cambios (rol actual: %). Correr como postgres.', current_user;
  END IF;
END $$;

COMMIT;

SELECT slug,
       feature_flags->>'agent_training_pro' AS agent_training_pro,
       features
  FROM public.plans
 WHERE slug IN ('start', 'growth', 'scale')
 ORDER BY display_order;
