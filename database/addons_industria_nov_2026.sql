-- ============================================================================
-- addons_industria_nov_2026.sql — add-ons de función (mensuales)
--
-- Requiere addons_paquetes_nov_2026.sql. Idempotente. Pruebas y producción.
--
-- Quedan estos add-ons de función, $199 al mes más IVA:
--   Menú digital           Restaurantes   página pública del menú + importar
--                                         el menú desde PDF. Desde Start
--                                         (en Lite el Menú está bloqueado).
--   Propiedades desde PDF  Inmobiliaria   importar propiedades desde un PDF.
--   Catálogo web           Inmobiliaria   página pública ianswer.pro/p/tu-marca
--                                         y fichas públicas de propiedades.
--   Entrenamiento PRO      Todas          pestaña Entrenamiento del agente.
--                                         Growth y Pro ya lo incluyen, así
--                                         que la tienda solo lo muestra en
--                                         Lite y Start.
--
-- Se ocultan (is_active = false) "Catálogo de Propiedades con IA" y el
-- "Catálogo Web" gratis. Ocultar no quita nada a quien ya los tiene:
-- get_company_entitlements suma los add-ons activos de la empresa sin mirar
-- addons.is_active.
--
-- La tienda deja de ofrecer un add-on cuando el plan de la empresa ya trae
-- todo lo que da (p. ej. Entrenamiento PRO en Growth) y marca los que piden
-- un plan mayor (plan_ok = false). El checkout revisa lo mismo.
--
-- Los stripe_price_id de los precios mensuales nuevos se pegan en
-- Admin → Add-ons (recurrente mensual, MXN, sin impuestos incluidos).
-- ============================================================================

BEGIN;

-- ─── Add-ons que quedan ─────────────────────────────────────────────────────

UPDATE public.addons SET
  name = 'Menú digital',
  short_name = 'Menú',
  description = 'Digitaliza tu carta: sube tu menú en PDF y la IA lo carga por ti, y compártelo en una página pública con foto, precio y descripción de cada platillo.',
  category = 'feature',
  icon = 'Utensils',
  price_monthly_cents = 19900,
  price_one_time_cents = 0,
  is_recurring = true,
  is_one_time = false,
  feature_flags = '{"menu_public_catalog": true, "menu_pdf_import": true}'::jsonb,
  capacity_grants = '{}'::jsonb,
  requires_plan_min = 'start',
  requires_template = 'restaurant',
  available_for_templates = ARRAY['restaurant'],
  is_active = true,
  display_order = 10,
  stripe_price_id = NULL,
  updated_at = now()
WHERE id = 'restaurant_menu';

UPDATE public.addons SET
  name = 'Propiedades desde PDF',
  short_name = 'Propiedades PDF',
  description = 'Sube tu inventario en PDF y la IA crea las propiedades por ti, con precio, zona, recámaras y amenidades.',
  category = 'feature',
  icon = 'FileText',
  price_monthly_cents = 19900,
  price_one_time_cents = 0,
  is_recurring = true,
  is_one_time = false,
  feature_flags = '{"ai_pdf_wizard_properties": true}'::jsonb,
  capacity_grants = '{}'::jsonb,
  requires_plan_min = NULL,
  requires_template = 'real_estate',
  available_for_templates = ARRAY['real_estate'],
  is_active = true,
  display_order = 11,
  stripe_price_id = NULL,
  updated_at = now()
WHERE id = 'pdf_wizard_properties';

UPDATE public.addons SET
  name = 'Catálogo web',
  short_name = 'Catálogo web',
  description = 'Tu inventario en una página pública (ianswer.pro/p/tu-marca) con filtros por zona, precio y recámaras, y un botón directo a tu WhatsApp. Cada propiedad tiene su propio link para compartir.',
  category = 'feature',
  icon = 'Globe',
  price_monthly_cents = 19900,
  price_one_time_cents = 0,
  is_recurring = true,
  is_one_time = false,
  feature_flags = '{"properties_public_directory": true, "public_catalog": true}'::jsonb,
  capacity_grants = '{}'::jsonb,
  requires_plan_min = NULL,
  requires_template = 'real_estate',
  available_for_templates = ARRAY['real_estate'],
  is_active = true,
  display_order = 12,
  stripe_price_id = NULL,
  updated_at = now()
WHERE id = 'fb9e125d-f4c9-4b03-89c7-75aac5126fcf';

INSERT INTO public.addons (
  id, name, short_name, description, category, icon,
  price_monthly_cents, price_one_time_cents, currency,
  is_recurring, is_one_time, feature_flags, requires_plan_min,
  is_active, display_order, available_for_templates
) VALUES (
  'agent_training_pro', 'Entrenamiento PRO del agente', 'Entrenamiento PRO',
  'Entrena a tu agente como a un empleado nuevo: un asistente te entrevista sobre cómo trabaja tu negocio y arma un documento que tu agente consulta en cada conversación. Growth y Pro ya lo incluyen.',
  'ai', 'GraduationCap', 19900, 0, 'MXN', true, false,
  '{"agent_training_pro": true}'::jsonb, NULL, true, 20, '{}'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  is_recurring = EXCLUDED.is_recurring,
  is_one_time = EXCLUDED.is_one_time,
  feature_flags = EXCLUDED.feature_flags,
  is_active = true,
  updated_at = now();

-- ─── Add-ons que se ocultan ─────────────────────────────────────────────────

UPDATE public.addons SET is_active = false, updated_at = now()
WHERE id IN ('realestate_properties', '7681da90-c77b-4eab-9073-3ed60389f9f6');

-- ─── Tienda ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.plan_rank(p_slug text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_slug WHEN 'lite' THEN 0 WHEN 'start' THEN 1 WHEN 'growth' THEN 2 WHEN 'scale' THEN 3 ELSE 1 END;
$$;

-- Por qué la empresa no puede comprar un add-on, o NULL si puede.
--   'plan'      pide un plan mayor (requires_plan_min)
--   'included'  su plan ya trae todo lo que da
CREATE OR REPLACE FUNCTION public.addon_unavailable_reason(p_company_id uuid, p_addon_id text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_addon    public.addons%ROWTYPE;
  v_plan     text;
  v_features jsonb;
BEGIN
  SELECT * INTO v_addon FROM public.addons WHERE id = p_addon_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  SELECT coalesce(plan_slug, selected_plan_slug) INTO v_plan FROM public.companies WHERE id = p_company_id;
  IF v_addon.requires_plan_min IS NOT NULL AND public.plan_rank(v_plan) < public.plan_rank(v_addon.requires_plan_min) THEN
    RETURN 'plan';
  END IF;

  IF v_addon.feature_flags <> '{}'::jsonb
     AND v_addon.credit_grants = '{}'::jsonb
     AND NOT EXISTS (SELECT 1 FROM public.company_addons
                     WHERE company_id = p_company_id AND addon_id = p_addon_id AND status = 'active') THEN
    v_features := public.get_company_entitlements(p_company_id) -> 'features';
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_each(v_addon.feature_flags) f
      WHERE f.value = 'true'::jsonb AND coalesce((v_features ->> f.key)::boolean, false) = false
    ) THEN
      RETURN 'included';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

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
           ) AS templates,
           public.addon_unavailable_reason(p_company_id, a.id) AS unavailable
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
    'credit_grants', c.credit_grants,
    'pack_group', c.pack_group,
    'requires_plan_min', c.requires_plan_min,
    'plan_ok', c.unavailable IS DISTINCT FROM 'plan',
    'available_for_templates', to_jsonb(c.templates),
    'is_featured', c.is_featured,
    'display_order', c.display_order,
    'is_template_specific', cardinality(c.templates) > 0
  ) ORDER BY c.display_order, c.name), '[]'::jsonb)
  INTO v_result
  FROM catalogo c
  WHERE (cardinality(c.templates) = 0 OR c.templates && v_installed_templates)
    AND c.unavailable IS DISTINCT FROM 'included';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.addon_unavailable_reason(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.addon_unavailable_reason(uuid, text) TO service_role;

COMMIT;

-- Verificación
-- select id, name, price_monthly_cents, is_recurring, requires_plan_min, requires_template, is_active
--   from addons order by is_active desc, display_order;
