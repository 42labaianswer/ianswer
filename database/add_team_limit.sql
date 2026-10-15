-- Límite de miembros de Equipo por plan (max_team_members + add-ons),
-- aplicado en la base. Cuentan los miembros activos (is_active distinto de
-- false): desactivar a alguien libera su lugar.
-- Los administradores de plataforma pueden pasarse del límite. Las empresas
-- que ya están por encima no se tocan: solo se valida al agregar o reactivar.
-- Primero pruebas, luego producción.

CREATE OR REPLACE FUNCTION public.company_team_limit(p_company_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((get_company_entitlements(p_company_id) -> 'capacity' ->> 'max_team_members')::integer, 1);
$$;

CREATE OR REPLACE FUNCTION public.trg_team_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activos integer;
  v_max integer;
BEGIN
  IF NEW.is_active IS FALSE OR is_platform_admin() THEN
    RETURN NEW;
  END IF;
  -- En un UPDATE solo cuenta si la fila pasa a ocupar un lugar nuevo
  IF TG_OP = 'UPDATE' AND OLD.is_active IS DISTINCT FROM false AND OLD.company_id = NEW.company_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_activos
  FROM team
  WHERE company_id = NEW.company_id
    AND is_active IS DISTINCT FROM false
    AND id <> NEW.id;

  v_max := company_team_limit(NEW.company_id);
  IF v_activos + 1 > v_max THEN
    RAISE EXCEPTION 'Tu plan permite % % en el equipo y ya tienes %. Desactiva a alguien o cambia de plan para agregar otro.',
      v_max, CASE WHEN v_max = 1 THEN 'miembro' ELSE 'miembros' END, v_activos
      USING ERRCODE = 'P0001', HINT = 'team_limit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_limit ON public.team;
CREATE TRIGGER team_limit
  BEFORE INSERT OR UPDATE OF is_active, company_id ON public.team
  FOR EACH ROW EXECUTE FUNCTION public.trg_team_limit();

REVOKE ALL ON FUNCTION public.company_team_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_team_limit(uuid) TO service_role;

-- Verificación: miembros activos y límite por empresa
-- select c.name, count(t.id) filter (where t.is_active is distinct from false) as activos,
--        company_team_limit(c.id) as limite
-- from companies c left join team t on t.company_id = c.id
-- group by c.id, c.name order by activos desc;
