-- ============================================================================
-- update_plans_features_copy.sql
-- Textos de features de Start / Growth / Scale tal como se muestran en
-- /dashboard/plans (PlanCard).
--
-- "Usuarios" pasa a "miembros" (lo que cuenta max_team_members), se agregan
-- los mensajes de campaña de publicidad y Multi-sucursal queda solo en Scale.
-- Scale anuncia 50 agendas, así que max_agendas baja de 100 a 50 para que el
-- límite coincida con el texto.
--
-- Los mensajes de campaña son solo texto: todavía no hay columna ni límite
-- que los aplique.
--
-- Idempotente. Correr primero en el proyecto de pruebas y después en
-- producción.
-- ============================================================================

-- Antes de correr: empresas en Scale que ya pasan de 50 agendas. Si sale
-- alguna, avisar antes de bajar el límite.
SELECT c.id, c.name, count(a.id) AS agendas
  FROM public.companies c
  JOIN public.agendas a ON a.company_id = c.id
 WHERE c.plan_slug = 'scale'
 GROUP BY c.id, c.name
HAVING count(a.id) > 50;

BEGIN;

UPDATE public.plans
   SET features = E'1 canal
CRM completo (kanban, tareas, filtros avanzados)
Reportes avanzados con KPIs y exportación
Notas de voz y análisis de imagen con IA
Hasta 300 conversaciones/mes
3 miembros · 3 agendas
50 mensajes de campaña de publicidad'
 WHERE slug = 'start';

UPDATE public.plans
   SET features = E'Todo lo de Start, escalado
3 canales
Hasta 750 conversaciones/mes
10 miembros · 15 agendas
100 mensajes de campaña de publicidad'
 WHERE slug = 'growth';

UPDATE public.plans
   SET features = E'Todo lo de Growth, escalado
Multi-sucursal con reportes por ubicación
10 sucursales
Hasta 2,000 conversaciones/mes
50 miembros · 50 agendas
250 mensajes de campaña de publicidad',
       max_agendas = 50
 WHERE slug = 'scale';

-- Con un rol distinto de postgres (selector "Role" del SQL Editor), RLS deja
-- los UPDATE en 0 filas sin dar error; esto lo convierte en error y revierte.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.plans
       WHERE slug IN ('start', 'growth', 'scale')
         AND features LIKE '%mensajes de campaña de publicidad') <> 3 THEN
    RAISE EXCEPTION 'No se actualizaron los 3 planes (rol actual: %). Correr como postgres.', current_user;
  END IF;
END $$;

COMMIT;

-- Verificación: los números del texto deben coincidir con las columnas.
SELECT slug, max_sessions_per_month, max_team_members, max_agendas,
       max_channels, max_locations, features
  FROM public.plans
 WHERE slug IN ('start', 'growth', 'scale')
 ORDER BY display_order;
