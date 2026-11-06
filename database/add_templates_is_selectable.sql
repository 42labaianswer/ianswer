-- ============================================================================
-- Industrias que se pueden elegir al registrarse.
--
-- templates.is_selectable = false oculta una industria del wizard de
-- onboarding (y /api/onboarding/complete la rechaza), pero la deja activa:
-- la política "Templates: lectura pública de activos" solo deja leer las
-- plantillas con is_active = true, así que desactivarla rompería a las
-- empresas que ya la tienen instalada.
--
-- Se usa para ocultar la industria genérica ("Personalizable") mientras no se
-- desarrolla. También se oculta su página en la landing
-- (site_industries.visible). Se puede correr más de una vez.
--
-- Correr primero en pruebas y luego en producción, ANTES de desplegar el
-- código (el wizard filtra por la columna nueva).
-- ============================================================================

BEGIN;

ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS is_selectable boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.templates.is_selectable IS
  'Si aparece en el wizard de onboarding. false = oculta para cuentas nuevas, pero sigue activa para las que ya la tienen.';

-- La plantilla genérica: "Otro" en el seed, "Personalizable" en producción.
UPDATE public.templates
   SET is_selectable = false, updated_at = now()
 WHERE id = 'generic'
RETURNING id, name, is_active, is_selectable;

-- Su página en la landing ("Cualquier otro negocio"); site_industries no
-- tiene template_id llenado, así que va por slug.
UPDATE public.site_industries
   SET visible = false
 WHERE slug = 'generico'
RETURNING slug, name, visible;

COMMIT;
