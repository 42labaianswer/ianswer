-- ============================================================================
-- Wizard de primeros pasos: se muestra una sola vez, al entrar con la prueba
-- activa. first_steps_completed_at se llena al terminarlo u omitirlo.
--
-- Las empresas que ya existen se marcan como hechas para que el wizard solo
-- aparezca a las cuentas nuevas.
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS first_steps_completed_at timestamptz;

UPDATE public.companies
   SET first_steps_completed_at = now()
 WHERE first_steps_completed_at IS NULL;

-- Comprobación
SELECT count(*) FILTER (WHERE first_steps_completed_at IS NULL) AS pendientes,
       count(*) AS total
  FROM public.companies;
