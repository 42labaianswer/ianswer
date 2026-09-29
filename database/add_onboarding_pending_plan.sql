-- ============================================================================
-- add_onboarding_pending_plan.sql
-- plan-agente-semana04, sección 4 (wizard + Stripe obligatorio) — 25-sep-2026
--
-- El wizard de onboarding deja de asignar plan: el plan y la prueba solo los
-- escribe el webhook de Stripe. Mientras tanto, lo que el usuario eligió en el
-- wizard se guarda aquí, SIN tocar plan_slug ni selected_plan_slug (este último
-- dispara el trigger companies_set_trial_ends_at, que armaba una "prueba"
-- fantasma sin pasar por Stripe — ver reporte 3.1).
--
--   pending_plan_slug     plan elegido en el paso 5 (start | growth | scale),
--                         para regresar al usuario ahí si sale sin pagar.
--   onboarding_addon_ids  complementos marcados en el paso 4. Ya NO se activan
--                         (se activaban gratis); quedan como "de interés" para
--                         sugerirlos después en /dashboard/addons.
--
-- Idempotente. Correr primero en el proyecto de pruebas y después en producción.
-- ============================================================================

BEGIN;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pending_plan_slug text,
  ADD COLUMN IF NOT EXISTS onboarding_addon_ids text[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_pending_plan_slug_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_pending_plan_slug_check
      CHECK (pending_plan_slug IS NULL OR pending_plan_slug IN ('start', 'growth', 'scale'));
  END IF;
END $$;

COMMENT ON COLUMN public.companies.pending_plan_slug IS
  'Plan elegido en el paso 5 del wizard, pendiente de confirmarse en Stripe. El plan real (plan_slug) solo lo escribe el webhook.';
COMMENT ON COLUMN public.companies.onboarding_addon_ids IS
  'Complementos marcados como de interés en el paso 4 del wizard. No se activan: se contratan después desde Extras (Stripe).';

-- Verificación
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'companies'
   AND column_name IN ('pending_plan_slug', 'onboarding_addon_ids');

COMMIT;
