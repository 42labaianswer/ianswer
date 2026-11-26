-- ============================================================================
-- "Nuevo mensaje" con el texto del mensaje
--
-- notify_new_message avisa cuando un cliente escribe en una conversación en modo
-- humano (bot pausado). La notificación lleva quién escribió en el título y el
-- mensaje (o "Nota de voz" / "Imagen") en el cuerpo. Si ya hay un aviso sin leer
-- de esa conversación, se actualiza con el último mensaje y sube al inicio, en
-- lugar de ignorar el mensaje nuevo.
--
-- SECURITY DEFINER y search_path van en la definición: un CREATE OR REPLACE sin
-- ellos deja la función como SECURITY INVOKER y deja de poder insertar.
--
-- Idempotente. Correr en pruebas y luego en producción.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_new_message() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_contact_id text;
  v_contact_name text;
  v_contact_phone text;
  v_ai_active boolean;
  v_titulo text;
  v_texto text;
  v_link text;
BEGIN
  IF NEW.sender <> 'patient' OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, name, phone, ai_active
    INTO v_contact_id, v_contact_name, v_contact_phone, v_ai_active
  FROM public.contacts
  WHERE company_id = NEW.company_id
    AND external_id = NEW.patient_id
  LIMIT 1;

  -- Sin contacto, o con el bot contestando: no se avisa
  IF v_contact_id IS NULL OR v_ai_active IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  v_titulo := 'Nuevo mensaje de ' || coalesce(nullif(trim(v_contact_name), ''), v_contact_phone, NEW.patient_id);
  v_texto := CASE
    WHEN NEW.message_type = 'audio' THEN 'Nota de voz'
    WHEN NEW.message_type = 'image' THEN coalesce(nullif(trim(NEW.media_caption), ''), 'Imagen')
    ELSE coalesce(nullif(left(regexp_replace(trim(NEW.content), '\s+', ' ', 'g'), 140), ''), 'Mensaje nuevo')
  END;
  v_link := '/dashboard/inbox?contactId=' || v_contact_id;

  UPDATE public.notifications
     SET title = v_titulo, message = v_texto, created_at = now()
   WHERE company_id = NEW.company_id
     AND type = 'new_message'
     AND is_read = false
     AND link = v_link;

  IF NOT FOUND THEN
    INSERT INTO public.notifications (company_id, title, message, type, link)
    VALUES (NEW.company_id, v_titulo, v_texto, 'new_message', v_link);
  END IF;

  RETURN NEW;
END;
$$;

-- Verificación: prosecdef = true
SELECT proname, prosecdef, proconfig
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname = 'notify_new_message';
