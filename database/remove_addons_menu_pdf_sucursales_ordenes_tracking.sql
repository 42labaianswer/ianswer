-- ============================================================================
-- remove_addons_menu_pdf_sucursales_ordenes_tracking.sql
-- Se eliminan 4 add-ons (decisión de Roy):
--   - pdf_wizard_menu  "Menú PDF": el import de PDF del menú ya viene con el
--     plan (MenuContent revisa ai_pdf_wizard, que tienen los 3 planes).
--   - multi_location   "Sucursales": multi-sucursal ya no se ofrece.
--   - restaurant_orders "Órdenes": ningún código revisaba sus flags; las
--     órdenes dependen de la plantilla de Restaurantes.
--   - "Tracking de Pedidos": el seguimiento de pedidos pasa a ser parte de la
--     plantilla de Restaurantes (active_modules.tracking ya es true). Se busca
--     por su flag order_tracking porque su id es un uuid que puede no ser el
--     mismo en pruebas y en producción.
-- "Entrenamiento PRO" NO se toca aquí: su pantalla depende del add-on.
--
-- company_addons.addon_id tiene ON DELETE RESTRICT, así que primero se borran
-- las filas de company_addons de esos add-ons y después los add-ons.
--
-- Correr como postgres (selector "Role" del SQL Editor), sin texto
-- seleccionado. Primero pruebas, luego producción.
-- ============================================================================

-- Antes de correr: empresas que tienen o tuvieron alguno de estos add-ons.
-- Si alguno está active o past_due con stripe_subscription_item_id, hay que
-- cancelar ese cobro en Stripe ANTES de correr el resto (el script lo frena).
SELECT a.id AS addon_id, a.short_name, c.name AS empresa, ca.status,
       ca.stripe_subscription_item_id, ca.current_period_end
  FROM public.company_addons ca
  JOIN public.addons a   ON a.id = ca.addon_id
  JOIN public.companies c ON c.id = ca.company_id
 WHERE a.id IN ('pdf_wizard_menu', 'multi_location', 'restaurant_orders')
    OR a.feature_flags ? 'order_tracking'
 ORDER BY a.id, ca.status;

BEGIN;

CREATE TEMP TABLE addons_a_borrar ON COMMIT DROP AS
SELECT id FROM public.addons
 WHERE id IN ('pdf_wizard_menu', 'multi_location', 'restaurant_orders')
    OR feature_flags ? 'order_tracking';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.company_addons
     WHERE addon_id IN (SELECT id FROM addons_a_borrar)
       AND status IN ('active', 'past_due')
       AND stripe_subscription_item_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Hay add-ons con cobro activo en Stripe. Cancélalos en Stripe y vuelve a correr.';
  END IF;
END $$;

DELETE FROM public.company_addons
 WHERE addon_id IN (SELECT id FROM addons_a_borrar);

DELETE FROM public.addons
 WHERE id IN (SELECT id FROM addons_a_borrar);

-- Nadie la llama: revisaba si la empresa tenía el add-on de tracking.
DROP FUNCTION IF EXISTS public.has_order_tracking_active(uuid);

-- Con un rol distinto de postgres, RLS deja los DELETE en 0 filas sin error.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.addons
     WHERE id IN ('pdf_wizard_menu', 'multi_location', 'restaurant_orders')
        OR feature_flags ? 'order_tracking'
  ) THEN
    RAISE EXCEPTION 'No se borraron los add-ons (rol actual: %). Correr como postgres.', current_user;
  END IF;
END $$;

COMMIT;

-- Add-ons que quedan.
SELECT id, short_name, name, is_active, requires_template, available_for_templates
  FROM public.addons
 ORDER BY display_order;
