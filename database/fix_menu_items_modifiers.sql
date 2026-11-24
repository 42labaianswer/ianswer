-- ============================================================================
-- fix_menu_items_modifiers.sql — columnas que usa el editor de platillos
--
-- MenuItemDrawer guarda modifiers (extras y opciones del platillo) y
-- prep_minutes (tiempo de preparación), pero menu_items no tenía esas
-- columnas: crear o editar un platillo fallaba con "Could not find the
-- 'modifiers' column of 'menu_items' in the schema cache".
--
-- modifiers: arreglo de { name, type: 'add' | 'remove' | 'option', price_delta }.
--
-- Idempotente. Pruebas y producción.
-- ============================================================================

BEGIN;

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS modifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS prep_minutes integer;

ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_prep_minutes_check;
ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_prep_minutes_check CHECK (prep_minutes IS NULL OR prep_minutes >= 0);

COMMIT;

-- PostgREST guarda el esquema en caché; esto lo recarga para que la app vea
-- las columnas nuevas sin esperar.
NOTIFY pgrst, 'reload schema';
