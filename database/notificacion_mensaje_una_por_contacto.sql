-- ============================================================================
-- Un solo aviso de "Nuevo mensaje" y de "Atención Requerida" por contacto
--
-- ── Nuevo mensaje ──
-- notify_new_message deja como máximo una notificación new_message por
-- conversación (mismo link /dashboard/inbox?contactId=...), esté leída o no.
-- Con cada mensaje del cliente, la más reciente se reutiliza: se pone como no
-- leída, con el último texto, y sube al inicio. Las demás de ese contacto se
-- borran. Si no había ninguna, se crea.
--
-- El borrado va antes del UPDATE: la campana (NotificationsWidget) recarga la
-- lista al recibir el UPDATE, así que la ve ya sin duplicados.
--
-- ── Atención Requerida ──
-- notify_human_request borra los avisos human_request anteriores del contacto
-- y crea uno nuevo. Se inserta en lugar de reutilizar para que cada pedido de
-- hablar con un humano saque su toast; la campana quita de su lista los avisos
-- del mismo tipo y link al recibir el INSERT.
-- Misma condición que en pausa_bot_quien.sql: solo si el bot se pausó y no lo
-- pausó alguien del equipo.
--
-- SECURITY DEFINER y search_path van en la definición: un CREATE OR REPLACE sin
-- ellos deja la función como SECURITY INVOKER y deja de poder insertar.
--
-- Al final, una limpieza única de los duplicados que ya existen.
--
-- Idempotente. Correr en pruebas y luego en producción.
-- ============================================================================

BEGIN;

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
  v_keep_id uuid;
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

  SELECT id INTO v_keep_id
    FROM public.notifications
   WHERE company_id = NEW.company_id
     AND type = 'new_message'
     AND link = v_link
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_keep_id IS NULL THEN
    INSERT INTO public.notifications (company_id, title, message, type, link)
    VALUES (NEW.company_id, v_titulo, v_texto, 'new_message', v_link);
    RETURN NEW;
  END IF;

  DELETE FROM public.notifications
   WHERE company_id = NEW.company_id
     AND type = 'new_message'
     AND link = v_link
     AND id <> v_keep_id;

  UPDATE public.notifications
     SET title = v_titulo, message = v_texto, is_read = false, created_at = now()
   WHERE id = v_keep_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_human_request() RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
DECLARE
  v_link text;
BEGIN
  IF OLD.ai_active = true AND NEW.ai_active = false
     AND NEW.ai_paused_by IS DISTINCT FROM 'human' THEN
    v_link := '/dashboard/inbox?contactId=' || NEW.id;

    DELETE FROM public.notifications
     WHERE company_id = NEW.company_id
       AND type = 'human_request'
       AND link = v_link;

    INSERT INTO public.notifications (company_id, title, message, type, link)
    VALUES (
      NEW.company_id,
      'Atención Requerida',
      coalesce(nullif(trim(NEW.name), ''), NEW.phone, 'Un cliente') || ' necesita hablar con un asesor humano.',
      'human_request',
      v_link
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Limpieza única: deja solo la notificación más reciente de cada tipo por contacto.
DELETE FROM public.notifications n
 USING (
   SELECT id,
          row_number() OVER (PARTITION BY company_id, type, link ORDER BY created_at DESC) AS rn
     FROM public.notifications
    WHERE type IN ('new_message', 'human_request')
      AND link IS NOT NULL
 ) d
 WHERE n.id = d.id
   AND d.rn > 1;

COMMIT;

-- Verificación 1: las dos funciones con prosecdef = true
SELECT proname, prosecdef, proconfig
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('notify_new_message', 'notify_human_request');

-- Verificación 2: debe devolver 0 filas
SELECT company_id, type, link, count(*)
  FROM public.notifications
 WHERE type IN ('new_message', 'human_request')
 GROUP BY company_id, type, link
HAVING count(*) > 1;
