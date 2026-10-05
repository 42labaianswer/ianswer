-- ============================================================================
-- Notificaciones en tiempo real (plan-agente-semana06, bloque 1)
--
-- Diagnóstico del 5-oct en producción:
--   - El trigger notify_human_request SÍ inserta en notifications (fila del 2-oct).
--   - notifications NO está en la publicación supabase_realtime, así que
--     NotificationsWidget nunca recibe el INSERT: la campana solo se actualiza
--     al recargar la página.
--   - Las políticas RLS de SELECT están bien (user_belongs_to_company).
--
-- Correr primero en pruebas y luego en producción. Es idempotente.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- Mensaje a prueba de contactos sin nombre: con name NULL el mensaje quedaba
-- NULL, notifications.message es NOT NULL y fallaba el UPDATE de ai_active.
CREATE OR REPLACE FUNCTION public.notify_human_request() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Si antes estaba activa y ahora está apagada
  IF OLD.ai_active = true AND NEW.ai_active = false THEN
    INSERT INTO public.notifications (company_id, title, message, type, link)
    VALUES (
      NEW.company_id,
      'Atención Requerida',
      coalesce(nullif(trim(NEW.name), ''), NEW.phone, 'Un cliente') || ' necesita hablar con un asesor humano.',
      'human_request',
      '/dashboard/inbox?contactId=' || NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Verificación: debe devolver una fila
-- select * from pg_publication_tables
-- where pubname = 'supabase_realtime' and tablename = 'notifications';
