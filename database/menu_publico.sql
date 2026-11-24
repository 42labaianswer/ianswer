-- ============================================================================
-- menu_publico.sql — la página pública del menú pide el add-on Menú digital
--
-- /menu/<id de la empresa> se mostraba a cualquier restaurante. La página
-- pública del menú es parte del add-on Menú digital ($199 al mes), así que la
-- página la consulta con esta función (igual que /p/<slug> con
-- has_public_directory_active).
--
-- Lee el flag menu_public_catalog de get_company_entitlements (plan +
-- add-ons activos). La llama la página pública sin sesión (anon).
--
-- Idempotente. Pruebas y producción.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_menu_public_catalog(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((public.get_company_entitlements(p_company_id) -> 'features' ->> 'menu_public_catalog')::boolean, false);
$$;

REVOKE ALL ON FUNCTION public.has_menu_public_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_menu_public_catalog(uuid) TO anon, authenticated, service_role;
