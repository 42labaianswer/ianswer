-- ============================================================================
-- fix_change_company_plan.sql
-- change_company_plan escribía companies.updated_at, columna que no existe:
-- el modo admin de /dashboard/plans fallaba con
--   column "updated_at" of relation "companies" does not exist
--
-- Misma función que en fix_billing_bypass.sql (solo admins de la plataforma o
-- el servidor), sin updated_at. Idempotente. Pruebas y después producción.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.change_company_plan(p_company_id uuid, p_new_plan_slug text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF public.is_regular_user_call() THEN
    RAISE EXCEPTION 'No autorizado para cambiar el plan' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE slug = p_new_plan_slug AND is_active = true) THEN
    RAISE EXCEPTION 'Plan no existe o está inactivo: %', p_new_plan_slug;
  END IF;

  UPDATE public.companies
     SET plan_slug = p_new_plan_slug
   WHERE id = p_company_id;
END;
$$;
