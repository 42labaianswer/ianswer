-- ============================================================================
-- La industria solo se elige en el wizard de onboarding.
--
-- 1. install_template: un usuario normal solo puede instalar la plantilla
--    cuando su empresa todavía no tiene una principal (lo que hace
--    /api/onboarding/complete). Cambiarla después queda para los admins de
--    la plataforma y el servidor (service_role).
-- 2. company_templates: los miembros ya no pueden escribir directo en la
--    tabla (la política anterior era FOR ALL por miembro). Siguen pudiendo
--    leerla con "CompanyTemplates: select por miembro".
--
-- Correr primero en pruebas y luego en producción.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.install_template(p_company_id uuid, p_template_id text, p_make_primary boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF public.is_regular_user_call() THEN
    IF NOT public.user_belongs_to_company(p_company_id) THEN
      RAISE EXCEPTION 'No autorizado para esta empresa' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.company_templates
       WHERE company_id = p_company_id AND is_primary = true
    ) THEN
      RAISE EXCEPTION 'La industria ya está elegida. Para cambiarla, contacta a soporte.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_make_primary THEN
    UPDATE public.company_templates
       SET is_primary = false, updated_at = now()
     WHERE company_id = p_company_id AND is_primary = true;
  END IF;

  INSERT INTO public.company_templates (company_id, template_id, is_primary)
  VALUES (p_company_id, p_template_id, p_make_primary)
  ON CONFLICT (company_id, template_id)
  DO UPDATE SET
    is_primary = EXCLUDED.is_primary OR public.company_templates.is_primary,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.install_template(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.install_template(uuid, text, boolean) TO authenticated, service_role;

DROP POLICY IF EXISTS "CompanyTemplates: insert/update/delete por miembro" ON public.company_templates;
DROP POLICY IF EXISTS "CompanyTemplates: escritura solo admins" ON public.company_templates;
CREATE POLICY "CompanyTemplates: escritura solo admins" ON public.company_templates
  FOR ALL
  USING (public.is_platform_admin() OR auth.role() = 'service_role')
  WITH CHECK (public.is_platform_admin() OR auth.role() = 'service_role');

-- Comprobación: deben quedar la de lectura por miembro y la de escritura de admins.
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'company_templates' ORDER BY policyname;

COMMIT;
