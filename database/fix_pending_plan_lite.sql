-- ============================================================================
-- fix_pending_plan_lite.sql — el onboarding no dejaba elegir Lite
--
-- companies.pending_plan_slug tenía un CHECK con la lista fija
-- ('start', 'growth', 'scale'), de antes de que existiera Lite. Se cambia por
-- una llave foránea a plans(slug), igual que companies.plan_slug, para que
-- cualquier plan de la tabla sea válido.
--
-- Idempotente. Pruebas y producción.
-- ============================================================================

BEGIN;

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_pending_plan_slug_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_pending_plan_slug_fkey') THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_pending_plan_slug_fkey
      FOREIGN KEY (pending_plan_slug) REFERENCES public.plans(slug)
      ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
