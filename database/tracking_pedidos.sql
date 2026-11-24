-- ============================================================================
-- tracking_pedidos.sql — aviso al cliente cuando cambia su pedido
--
-- companies.order_notify_customer: si está prendido (por omisión), cada
-- cambio de estado de un pedido hecho desde el panel le manda al cliente un
-- WhatsApp con el estado nuevo y el link de seguimiento (/api/orders/status).
-- Se apaga en Órdenes → Configuración.
--
-- Idempotente. Pruebas y producción.
-- ============================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS order_notify_customer boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.companies.order_notify_customer IS
  'Avisar al cliente por WhatsApp cada cambio de estado de su pedido (dentro de la ventana de 24 h de Meta).';

NOTIFY pgrst, 'reload schema';

-- ─── Página pública de seguimiento ──────────────────────────────────────────
-- get_order_tracking no devolvía los estados del restaurante, el historial,
-- la dirección ni el logo y colores: la sección "Progreso" salía vacía y la
-- página usaba colores genéricos. Cambia la forma del resultado, así que se
-- borra y se vuelve a crear.

DROP FUNCTION IF EXISTS public.get_order_tracking(text);

CREATE FUNCTION public.get_order_tracking(p_token text)
RETURNS TABLE(
  id uuid, company_id uuid, company_name text, order_number text, contact_name text,
  items jsonb, total numeric, delivery_type text, delivery_address text,
  status_semantic text, status_label text, status_step integer,
  estimated_ready_at timestamptz, created_at timestamptz,
  order_statuses jsonb, history jsonb,
  company_logo text, company_primary_color text, company_accent_color text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    o.id, o.company_id, c.name, o.order_number, o.contact_name,
    o.items, o.total, o.delivery_type, o.delivery_address,
    o.status_semantic, o.status_label, o.status_step,
    o.estimated_ready_at, o.created_at,
    coalesce(c.order_statuses, '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'status_step', h.status_step,
               'status_label', h.status_label,
               'changed_at', coalesce(h.changed_at, h.created_at)
             ) ORDER BY coalesce(h.changed_at, h.created_at))
      FROM public.order_status_history h
      WHERE h.order_id = o.id
    ), '[]'::jsonb),
    c.logo_url, c.primary_color, c.secondary_color
  FROM public.orders o
  JOIN public.companies c ON c.id = o.company_id
  WHERE o.tracking_token = p_token OR o.public_token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_tracking(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
