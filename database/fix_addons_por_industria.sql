-- ============================================================================
-- fix_addons_por_industria.sql
-- get_company_available_addons decidía la industria de un add-on solo con
-- available_for_templates. Propiedades (realestate_properties) y Menú
-- (restaurant_menu) solo tienen requires_template, así que salían como
-- "Universales" para todas las industrias (un restaurante veía Propiedades).
--
-- Ahora las industrias de un add-on son available_for_templates más
-- requires_template. Un add-on con alguna de las dos solo aparece si la empresa
-- tiene esa plantilla instalada, y se agrupa en "Específicos de <industria>".
--
-- Idempotente. Primero pruebas, luego producción.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_company_available_addons(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_installed_templates text[];
  v_result jsonb;
BEGIN
  SELECT coalesce(array_agg(template_id), '{}'::text[]) INTO v_installed_templates
    FROM public.company_templates
   WHERE company_id = p_company_id;

  WITH catalogo AS (
    SELECT a.*,
           ARRAY(
             SELECT DISTINCT t
               FROM unnest(coalesce(a.available_for_templates, '{}'::text[])
                           || CASE WHEN a.requires_template IS NULL THEN '{}'::text[]
                                   ELSE ARRAY[a.requires_template] END) AS t
           ) AS templates
      FROM public.addons a
     WHERE a.is_active = true
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'short_name', c.short_name,
    'description', c.description,
    'category', c.category,
    'icon', c.icon,
    'price_monthly_cents', c.price_monthly_cents,
    'price_one_time_cents', c.price_one_time_cents,
    'currency', c.currency,
    'is_recurring', c.is_recurring,
    'is_one_time', c.is_one_time,
    'feature_flags', c.feature_flags,
    'capacity_grants', c.capacity_grants,
    'requires_plan_min', c.requires_plan_min,
    'available_for_templates', to_jsonb(c.templates),
    'is_featured', c.is_featured,
    'display_order', c.display_order,
    'is_template_specific', cardinality(c.templates) > 0
  ) ORDER BY c.display_order, c.name), '[]'::jsonb)
  INTO v_result
  FROM catalogo c
  WHERE cardinality(c.templates) = 0
     OR c.templates && v_installed_templates;

  RETURN v_result;
END;
$$;

-- Verificación: cómo queda cada add-on activo.
SELECT a.id, a.short_name, a.requires_template, a.available_for_templates
  FROM public.addons a
 WHERE a.is_active
 ORDER BY a.display_order;
