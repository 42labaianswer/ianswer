-- Origen de los mensajes que llegan por coexistencia de WhatsApp.
--   'echo'    = el dueño contestó desde la app de WhatsApp Business del celular.
--   'history' = mensaje viejo importado al conectar el número (solo una vez).
--   NULL      = todo lo demás (cliente, bot, bandeja), como hasta ahora.
-- Los mensajes importados no deben disparar nada: ni avisos de "Nuevo Mensaje"
-- (notify_new_message), ni respuestas a recordatorios por un "CONFIRMO" viejo
-- (on_message_detect_reminder_response), ni mover last_inbound_at /
-- last_outbound_at a fechas viejas (track_message_activity), que activaría los
-- seguimientos automáticos sobre contactos viejos. Para no tocar el cuerpo de
-- esas funciones, sus triggers se vuelven a crear con una condición WHEN.
-- Primero pruebas, luego producción.

-- ── Paso 0 (diagnóstico, correr primero y mandar el resultado) ──
-- Debe listar exactamente los tres triggers de abajo (AFTER INSERT ... FOR
-- EACH ROW) y las restricciones unique_whatsapp_mid y
-- contacts_company_external_uk. Si aparece algo distinto, no seguir.
--
-- SELECT tgname, pg_get_triggerdef(oid)
-- FROM pg_trigger
-- WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal;
--
-- SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname IN ('unique_whatsapp_mid', 'contacts_company_external_uk', 'unique_external_id');

-- ── Paso 1 ──
BEGIN;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_source_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_source_check CHECK (source IS NULL OR source IN ('echo', 'history'));

COMMENT ON COLUMN public.messages.source IS
  'Origen por coexistencia: echo (enviado desde la app de WhatsApp Business), history (importado al conectar). NULL en lo demás.';

DROP TRIGGER IF EXISTS trigger_notify_new_message ON public.messages;
CREATE TRIGGER trigger_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.source IS DISTINCT FROM 'history')
  EXECUTE FUNCTION public.notify_new_message();

DROP TRIGGER IF EXISTS trigger_message_detect_reminder_response ON public.messages;
CREATE TRIGGER trigger_message_detect_reminder_response
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.source IS DISTINCT FROM 'history')
  EXECUTE FUNCTION public.on_message_detect_reminder_response();

DROP TRIGGER IF EXISTS trigger_track_message_activity ON public.messages;
CREATE TRIGGER trigger_track_message_activity
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.source IS DISTINCT FROM 'history')
  EXECUTE FUNCTION public.track_message_activity();

COMMIT;
