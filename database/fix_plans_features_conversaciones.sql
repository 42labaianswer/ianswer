-- ============================================================================
-- fix_plans_features_conversaciones.sql
-- plan-agente-semana04, tarea 1.5 — 23-sep-2026
--
-- En producción, plans.max_sessions_per_month ya vale 300 / 750 / 2000
-- (los números reales de Roy), pero el texto libre de plans.features seguía
-- diciendo "Hasta 1,000 / 5,000 / 25,000 conversaciones/mes". /dashboard/plans
-- (PlanCard) muestra ambos, así que la misma tarjeta se contradecía.
--
-- En vez de escribir los números a mano, la línea se regenera desde la
-- columna: max_sessions_per_month sigue siendo la única fuente de verdad.
-- Idempotente: se puede correr varias veces sin efecto adicional.
--
-- Correr primero en el proyecto de pruebas y después en producción.
-- ============================================================================

BEGIN;

UPDATE public.plans
   SET features = regexp_replace(
         features,
         'Hasta [0-9.,]+ conversaciones/mes',
         'Hasta ' || to_char(max_sessions_per_month, 'FM999,999,999') || ' conversaciones/mes'
       )
 WHERE features ~ 'Hasta [0-9.,]+ conversaciones/mes';

-- Verificación: la línea debe coincidir con la columna en todos los planes.
SELECT slug,
       max_sessions_per_month,
       substring(features from 'Hasta [0-9.,]+ conversaciones/mes') AS linea_features
  FROM public.plans
 WHERE is_active AND NOT is_legacy
 ORDER BY display_order;

COMMIT;
