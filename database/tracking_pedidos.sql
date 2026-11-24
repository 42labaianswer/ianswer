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
