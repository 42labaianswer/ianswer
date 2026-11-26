-- ============================================================================
-- Quién pausó el bot en una conversación
--
-- contacts.ai_paused_by: 'human' (alguien del equipo lo pausó desde iAnswer) o
-- 'bot' (lo pausó el asistente porque el cliente pide a una persona, o por el
-- límite del plan). contacts.ai_paused_at: desde cuándo está pausado.
--
-- La app manda ai_paused_by = 'human' al pausar. n8n y las funciones de la BD
-- solo cambian ai_active, así que el trigger BEFORE marca 'bot' cuando nadie
-- dijo quién fue, y limpia ambos campos al reactivar.
-- La notificación "Atención Requerida" (y su toast) solo sale si pausó el bot.
--
-- Idempotente. Correr en pruebas y luego en producción.
-- ============================================================================

BEGIN;

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ai_paused_by text
  CHECK (ai_paused_by IN ('human', 'bot'));
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ai_paused_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_ai_paused_by() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
    AS $$
BEGIN
  IF NEW.ai_active IS DISTINCT FROM OLD.ai_active THEN
    IF NEW.ai_active = false THEN
      IF NEW.ai_paused_by IS NULL OR NEW.ai_paused_by IS NOT DISTINCT FROM OLD.ai_paused_by THEN
        NEW.ai_paused_by := 'bot';
      END IF;
      NEW.ai_paused_at := now();
    ELSE
      NEW.ai_paused_by := NULL;
      NEW.ai_paused_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_ai_paused_by ON public.contacts;
CREATE TRIGGER trigger_set_ai_paused_by BEFORE UPDATE OF ai_active ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_paused_by();

-- SECURITY DEFINER y search_path van aquí: un CREATE OR REPLACE sin ellos deja
-- la función como SECURITY INVOKER y el UPDATE de ai_active vuelve a fallar.
CREATE OR REPLACE FUNCTION public.notify_human_request() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
BEGIN
  IF OLD.ai_active = true AND NEW.ai_active = false
     AND NEW.ai_paused_by IS DISTINCT FROM 'human' THEN
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

COMMIT;

-- Verificación: notify_human_request con prosecdef = true y las dos columnas.
SELECT proname, prosecdef, proconfig
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('notify_human_request', 'set_ai_paused_by');
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'contacts'
   AND column_name IN ('ai_paused_by', 'ai_paused_at');
