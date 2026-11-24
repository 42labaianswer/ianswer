-- ============================================================================
-- admin_cuentas.sql — lista de cuentas para Panel Admin → Cuentas
--
-- admin_list_accounts: cuentas paginadas con búsqueda (nombre de la empresa o
-- correo de cualquiera de sus usuarios), orden por más recientes o
-- alfabético, y filtro por letra inicial. Solo admins de la plataforma.
--
-- Idempotente. Pruebas y producción.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_list_accounts(
  p_search text DEFAULT NULL,
  p_sort   text DEFAULT 'recent',
  p_letter text DEFAULT NULL,
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  company_id uuid, company_name text, owner_email text, owner_name text,
  plan_slug text, subscription_status text, industry text,
  created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_letter text := nullif(upper(left(trim(coalesce(p_letter, '')), 1)), '');
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      c.id,
      c.name::text AS name,
      owner.email::text AS email,
      owner.full_name::text AS full_name,
      coalesce(c.plan_slug, c.selected_plan_slug)::text AS plan,
      c.subscription_status::text AS status,
      tpl.name::text AS industry,
      c.created_at
    FROM public.companies c
    LEFT JOIN LATERAL (
      SELECT p.email, p.full_name FROM public.profiles p
      WHERE p.company_id = c.id
      ORDER BY p.created_at
      LIMIT 1
    ) owner ON true
    LEFT JOIN LATERAL (
      SELECT t.name FROM public.company_templates ct
      JOIN public.templates t ON t.id = ct.template_id
      WHERE ct.company_id = c.id
      ORDER BY ct.is_primary DESC NULLS LAST
      LIMIT 1
    ) tpl ON true
    WHERE (v_search IS NULL
           OR c.name ILIKE '%' || v_search || '%'
           OR EXISTS (SELECT 1 FROM public.profiles p2
                      WHERE p2.company_id = c.id AND p2.email ILIKE '%' || v_search || '%'))
      AND (v_letter IS NULL
           OR (v_letter = '#' AND translate(upper(left(trim(c.name), 1)), 'ÁÉÍÓÚÜ', 'AEIOUU') !~ '^[A-ZÑ]')
           OR translate(upper(left(trim(c.name), 1)), 'ÁÉÍÓÚÜ', 'AEIOUU') = v_letter)
  )
  SELECT b.id, b.name, b.email, b.full_name, b.plan, b.status, b.industry, b.created_at,
         count(*) OVER ()
  FROM base b
  ORDER BY
    CASE WHEN p_sort = 'alpha' THEN lower(b.name) END ASC,
    b.created_at DESC
  LIMIT greatest(least(coalesce(p_limit, 20), 100), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_accounts(text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_accounts(text, text, text, integer, integer) TO authenticated, service_role;
