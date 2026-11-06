-- ============================================================================
-- remove_multi_sucursal_plans.sql
-- Multi-sucursal deja de ofrecerse en todos los planes (decisión de Roy: no
-- encaja con cómo funciona el negocio). Lo que el bot responde sobre la
-- ubicación sale de companies.address ("Dirección principal"), no de las sedes.
--
-- - Scale pierde las líneas "Multi-sucursal..." y "10 sucursales".
-- - max_locations = 1 en todos los planes.
-- - reports_by_location y location_aware_routing se apagan: ninguna pantalla
--   ni el bot los usaban.
-- - multi_location_enabled se queda encendido: también muestra los tipos de
--   agenda "Por Especialista" y "Por Sala/Cuarto" (AgendaTab).
--
-- Las sedes que ya existan no se borran.
-- Idempotente. Correr como postgres (selector "Role" del SQL Editor), sin
-- texto seleccionado. Primero pruebas, luego producción.
-- ============================================================================

-- Antes de correr: empresas con más de 1 sede. Siguen funcionando, pero ya no
-- podrán agregar más.
SELECT c.id, c.name, c.plan_slug, count(l.id) AS sedes
  FROM public.companies c
  JOIN public.locations l ON l.company_id = c.id
 GROUP BY c.id, c.name, c.plan_slug
HAVING count(l.id) > 1;

BEGIN;

UPDATE public.plans
   SET features = E'Todo lo de Growth, escalado
Hasta 2,000 conversaciones/mes
50 miembros · 50 agendas
250 mensajes de campaña de publicidad'
 WHERE slug = 'scale';

UPDATE public.plans
   SET max_locations = 1,
       feature_flags = coalesce(feature_flags, '{}'::jsonb)
                       || '{"reports_by_location":false,"location_aware_routing":false}'::jsonb
 WHERE slug IN ('start', 'growth', 'scale');

-- Con un rol distinto de postgres, RLS deja los UPDATE en 0 filas sin error.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.plans
       WHERE slug IN ('start', 'growth', 'scale')
         AND max_locations = 1
         AND features NOT LIKE '%sucursal%'
         AND (feature_flags->>'reports_by_location')::boolean IS FALSE) <> 3 THEN
    RAISE EXCEPTION 'No se actualizaron los 3 planes (rol actual: %). Correr como postgres.', current_user;
  END IF;
END $$;

COMMIT;

SELECT slug, max_locations,
       feature_flags->>'multi_location_enabled' AS multi_location_enabled,
       feature_flags->>'reports_by_location'    AS reports_by_location,
       feature_flags->>'location_aware_routing' AS location_aware_routing,
       features
  FROM public.plans
 WHERE slug IN ('start', 'growth', 'scale')
 ORDER BY display_order;
