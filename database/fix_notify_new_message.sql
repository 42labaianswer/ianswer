-- ============================================================================
-- Notificación "Nuevo Mensaje" (plan-agente-semana06, bloque 1 — hallazgo del 5-oct)
--
-- Bug: notify_new_message buscaba el contacto con contacts.id = NEW.patient_id,
-- pero messages.patient_id guarda el external_id (teléfono WA / PSID / IGSID).
-- Confirmado en producción el 5-oct: nunca coincide por id, siempre por
-- external_id → la notificación nunca se creaba.
--
-- Decisión de Rubén (5-oct): avisar SOLO si la conversación está en Modo Humano
-- (ai_active = false). Con el bot activo no hace falta, y la campana se llenaría
-- con cada mensaje y taparía los avisos de "necesita hablar con un humano".
--
-- Además:
--   - se busca por (company_id, external_id), no solo por external_id: el mismo
--     número puede existir en dos empresas;
--   - si ya hay un aviso "Nuevo Mensaje" sin leer de ese contacto, no se crea
--     otro (ráfagas de mensajes);
--   - el link usa contacts.id, que es lo que lee la bandeja en ?contactId=.
--
-- Correr primero en pruebas y luego en producción. El trigger
-- trigger_notify_new_message no cambia (AFTER INSERT ON messages).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_new_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_contact_id text;
  v_contact_name text;
  v_contact_phone text;
  v_ai_active boolean;
BEGIN
  -- Solo mensajes del cliente, y solo si sabemos de qué empresa son
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

  -- Ya hay un aviso sin leer de esta conversación
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE company_id = NEW.company_id
      AND type = 'new_message'
      AND is_read = false
      AND link = '/dashboard/inbox?contactId=' || v_contact_id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (company_id, title, message, type, link)
  VALUES (
    NEW.company_id,
    'Nuevo Mensaje',
    'Mensaje de ' || coalesce(nullif(trim(v_contact_name), ''), v_contact_phone, NEW.patient_id),
    'new_message',
    '/dashboard/inbox?contactId=' || v_contact_id
  );

  RETURN NEW;
END;
$$;
