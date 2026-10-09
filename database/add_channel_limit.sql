-- Límite de canales por plan (max_channels + add-ons) aplicado en la base.
-- Un canal cuenta como conectado si tiene fila en integrations con status
-- connected/active, o su id en companies (business_phone_id, fb_page_id,
-- ig_account_id), que es lo que usa n8n para identificar la empresa.
-- Los administradores de plataforma pueden pasarse del límite.
-- Las empresas que ya están por encima del límite no se tocan: solo se valida
-- al conectar un canal nuevo.
-- Primero pruebas, luego producción.

CREATE OR REPLACE FUNCTION public.company_connected_channels(p_company_id uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT ch ORDER BY ch), '{}'::text[])
  FROM (
    SELECT i.platform AS ch
    FROM integrations i
    WHERE i.company_id = p_company_id AND i.status IN ('connected', 'active')
    UNION
    SELECT unnest(array_remove(ARRAY[
      CASE WHEN c.business_phone_id IS NOT NULL THEN 'whatsapp' END,
      CASE WHEN c.fb_page_id IS NOT NULL THEN 'messenger' END,
      CASE WHEN c.ig_account_id IS NOT NULL THEN 'instagram' END
    ], NULL))
    FROM companies c
    WHERE c.id = p_company_id
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.company_channel_limit(p_company_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((get_company_entitlements(p_company_id) -> 'capacity' ->> 'max_channels')::integer, 1);
$$;

-- Lanza error si conectar p_channel pasa del límite. El HINT 'channel_limit'
-- lo usan las rutas de la API para responder 403.
CREATE OR REPLACE FUNCTION public.assert_channel_capacity(p_company_id uuid, p_channel text)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channels text[];
  v_max integer;
BEGIN
  IF p_company_id IS NULL OR is_platform_admin() THEN
    RETURN;
  END IF;

  v_channels := company_connected_channels(p_company_id);
  IF p_channel = ANY (v_channels) THEN
    RETURN;
  END IF;

  v_max := company_channel_limit(p_company_id);
  IF cardinality(v_channels) + 1 > v_max THEN
    RAISE EXCEPTION 'Tu plan permite % % y ya tienes % %. Cambia de plan para conectar otro.',
      v_max, CASE WHEN v_max = 1 THEN 'canal' ELSE 'canales' END,
      cardinality(v_channels), CASE WHEN cardinality(v_channels) = 1 THEN 'conectado' ELSE 'conectados' END
      USING ERRCODE = 'P0001', HINT = 'channel_limit';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_integrations_channel_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('connected', 'active') THEN
    PERFORM assert_channel_capacity(NEW.company_id, NEW.platform);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_companies_channel_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.business_phone_id IS NOT NULL AND OLD.business_phone_id IS NULL THEN
    PERFORM assert_channel_capacity(NEW.id, 'whatsapp');
  END IF;
  IF NEW.fb_page_id IS NOT NULL AND OLD.fb_page_id IS NULL THEN
    PERFORM assert_channel_capacity(NEW.id, 'messenger');
  END IF;
  IF NEW.ig_account_id IS NOT NULL AND OLD.ig_account_id IS NULL THEN
    PERFORM assert_channel_capacity(NEW.id, 'instagram');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS integrations_channel_limit ON public.integrations;
CREATE TRIGGER integrations_channel_limit
  BEFORE INSERT OR UPDATE OF status, platform ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.trg_integrations_channel_limit();

DROP TRIGGER IF EXISTS companies_channel_limit ON public.companies;
CREATE TRIGGER companies_channel_limit
  BEFORE UPDATE OF business_phone_id, fb_page_id, ig_account_id ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.trg_companies_channel_limit();

-- Solo los triggers y el servidor (service_role) llaman a estas funciones.
REVOKE ALL ON FUNCTION public.company_connected_channels(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.company_channel_limit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_channel_capacity(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_connected_channels(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.company_channel_limit(uuid) TO service_role;

-- Verificación: canales y límite de cada empresa con canal conectado
-- select c.name, company_connected_channels(c.id) as canales, company_channel_limit(c.id) as limite
-- from companies c
-- where c.business_phone_id is not null or c.fb_page_id is not null or c.ig_account_id is not null;
