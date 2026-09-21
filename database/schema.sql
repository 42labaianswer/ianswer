--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: channel_platform; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.channel_platform AS ENUM (
    'whatsapp',
    'instagram',
    'facebook'
);


--
-- Name: message_sender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_sender AS ENUM (
    'patient',
    'ai',
    'human'
);


--
-- Name: activate_addon(uuid, text, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_addon(p_company_id uuid, p_addon_id text, p_quantity integer DEFAULT 1, p_stripe_subscription_item_id text DEFAULT NULL::text, p_stripe_checkout_session_id text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.company_addons (
    company_id, addon_id, quantity, status, activated_at,
    stripe_subscription_item_id, stripe_checkout_session_id
  )
  VALUES (
    p_company_id, p_addon_id, GREATEST(1, p_quantity), 'active', now(),
    p_stripe_subscription_item_id, p_stripe_checkout_session_id
  )
  ON CONFLICT (company_id, addon_id)
  DO UPDATE SET
    quantity                    = GREATEST(1, EXCLUDED.quantity),
    status                      = 'active',
    activated_at                = COALESCE(public.company_addons.activated_at, now()),
    stripe_subscription_item_id = COALESCE(EXCLUDED.stripe_subscription_item_id, public.company_addons.stripe_subscription_item_id),
    stripe_checkout_session_id  = COALESCE(EXCLUDED.stripe_checkout_session_id,  public.company_addons.stripe_checkout_session_id),
    canceled_at                 = NULL,
    updated_at                  = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: advance_order_status(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.advance_order_status(p_order_id uuid, p_changed_by text DEFAULT 'system'::text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_company_id UUID;
  v_current_step INTEGER;
  v_statuses JSONB;
  v_next_status JSONB;
  v_current_pos INTEGER;
BEGIN
  -- Obtener company_id y step actual
  SELECT company_id, status_step INTO v_company_id, v_current_step
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden no encontrada';
  END IF;

  -- Obtener los estados configurados de la compañía
  SELECT order_statuses INTO v_statuses
  FROM companies
  WHERE id = v_company_id;

  IF v_statuses IS NULL OR jsonb_array_length(v_statuses) = 0 THEN
    RAISE EXCEPTION 'La compañía no tiene estados configurados';
  END IF;

  -- Encontrar la posición del estado actual (ordenado por step)
  SELECT pos - 1 INTO v_current_pos
  FROM (
    SELECT row_number() OVER (ORDER BY (value->>'step')::int) AS pos,
           value
    FROM jsonb_array_elements(v_statuses)
  ) t
  WHERE (value->>'step')::int = v_current_step;

  -- Si es el último estado, no se puede avanzar
  IF v_current_pos IS NULL OR v_current_pos >= jsonb_array_length(v_statuses) - 1 THEN
    RAISE EXCEPTION 'No hay siguiente estado para esta orden';
  END IF;

  -- Obtener el siguiente estado
  v_next_status := v_statuses->(v_current_pos + 1);

  -- Actualizar la orden
  UPDATE orders
  SET
    status_step = (v_next_status->>'step')::int,
    status_label = v_next_status->>'name',
    status_semantic = v_next_status->>'semantic'
  WHERE id = p_order_id;

  -- Registrar en historial
  INSERT INTO order_status_history (
    order_id,
    status_step,
    status_label,
    status_semantic,
    changed_by
  ) VALUES (
    p_order_id,
    (v_next_status->>'step')::int,
    v_next_status->>'name',
    v_next_status->>'semantic',
    p_changed_by
  );
END;
$$;


--
-- Name: can_bot_respond_v2(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_bot_respond_v2(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_company    record;
  v_used       integer;
  v_limit      integer;
  v_ent        jsonb;
BEGIN
  SELECT id, plan_slug, account_status, subscription_status, trial_ends_at
    INTO v_company
    FROM public.companies
   WHERE id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('can_respond', false, 'reason', 'company_not_found');
  END IF;

  -- Verificar estado de cuenta
  IF v_company.account_status = 'expired' THEN
    RETURN jsonb_build_object('can_respond', false, 'reason', 'account_expired');
  END IF;

  -- Si está en trial, verificar fecha
  IF v_company.account_status = 'trial' AND v_company.trial_ends_at IS NOT NULL AND v_company.trial_ends_at < now() THEN
    RETURN jsonb_build_object('can_respond', false, 'reason', 'trial_expired');
  END IF;

  -- Obtener entitlements para revisar límite
  v_ent := public.get_company_entitlements(p_company_id);
  v_limit := (v_ent->'capacity'->>'max_sessions_per_month')::integer;

  -- Contar sesiones del mes actual
  SELECT COALESCE(SUM(value), 0) INTO v_used
    FROM public.usage_counters
   WHERE company_id = p_company_id
     AND metric     = 'sessions'
     AND period_start = date_trunc('month', now());

  IF v_limit IS NOT NULL AND v_used >= v_limit THEN
    RETURN jsonb_build_object(
      'can_respond', false,
      'reason',      'sessions_limit_reached',
      'used',        v_used,
      'limit',       v_limit
    );
  END IF;

  RETURN jsonb_build_object(
    'can_respond',     true,
    'used',            v_used,
    'limit',           v_limit,
    'ai_premium',      COALESCE((v_ent->'features'->>'ai_premium_model')::boolean, false),
    'voice_notes',     COALESCE((v_ent->'features'->>'ai_voice_notes')::boolean,   false),
    'image_analysis',  COALESCE((v_ent->'features'->>'ai_image_analysis')::boolean, false),
    'pdf_wizard',      COALESCE((v_ent->'features'->>'ai_pdf_wizard')::boolean,    false)
  );
END;
$$;


--
-- Name: FUNCTION can_bot_respond_v2(p_company_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.can_bot_respond_v2(p_company_id uuid) IS 'Llamada por n8n al inicio del workflow: dice si puede responder + flags de features.';


--
-- Name: can_open_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_open_session(p_company_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_used   integer;
  v_limit  integer;
BEGIN
  SELECT sessions_used, sessions_limit INTO v_used, v_limit
  FROM get_usage_current_month(p_company_id);

  -- Si el límite es 0 (no configurado), permitir
  IF v_limit = 0 THEN RETURN TRUE; END IF;

  RETURN v_used < v_limit;
END;
$$;


--
-- Name: cancel_addon(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_addon(p_company_id uuid, p_addon_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.company_addons
     SET status      = 'canceled',
         canceled_at = now(),
         updated_at  = now()
   WHERE company_id = p_company_id
     AND addon_id   = p_addon_id;
END;
$$;


--
-- Name: cancelar_proxima_cita_ai(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancelar_proxima_cita_ai(p_contact_id text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  target_id uuid;
BEGIN
  -- Encuentra la próxima cita programada o confirmada
  SELECT id INTO target_id
  FROM public.appointments
  WHERE patient_id = p_contact_id
    AND status IN ('scheduled', 'confirmed')
    AND (appointment_date > CURRENT_DATE OR (appointment_date = CURRENT_DATE AND appointment_time >= CURRENT_TIME))
  ORDER BY appointment_date ASC, appointment_time ASC
  LIMIT 1;

  IF target_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró cita futura para cancelar');
  END IF;

  UPDATE public.appointments
  SET
    status = 'cancelled',
    notes = COALESCE(notes || E'\n', '') || '[Cancelada por el paciente vía WhatsApp' || COALESCE(': ' || p_reason, '') || ']'
  WHERE id = target_id;

  RETURN jsonb_build_object('success', true, 'appointment_id', target_id);
END
$$;


--
-- Name: FUNCTION cancelar_proxima_cita_ai(p_contact_id text, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cancelar_proxima_cita_ai(p_contact_id text, p_reason text) IS 'Helper para n8n: el bot llama con (contact_id, razón opcional) y la función cancela la próxima cita programada del paciente.';


--
-- Name: capturar_razon_no_show_ai(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.capturar_razon_no_show_ai(p_contact_id text, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  target_id uuid;
  updated_count integer;
BEGIN
  -- Encuentra el último appointment no_show del paciente sin razón aún
  SELECT id INTO target_id
  FROM public.appointments
  WHERE patient_id = p_contact_id
    AND status = 'no_show'
    AND no_show_reason IS NULL
  ORDER BY appointment_date DESC, appointment_time DESC
  LIMIT 1;

  IF target_id IS NULL THEN
    -- Fallback: el más reciente sin importar si ya tenía razón
    SELECT id INTO target_id
    FROM public.appointments
    WHERE patient_id = p_contact_id
      AND status = 'no_show'
    ORDER BY appointment_date DESC, appointment_time DESC
    LIMIT 1;
  END IF;

  IF target_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se encontró cita con no_show para este paciente');
  END IF;

  UPDATE public.appointments
  SET
    no_show_reason = p_reason,
    no_show_reason_captured_at = now()
  WHERE id = target_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'appointment_id', target_id, 'updated', updated_count);
END
$$;


--
-- Name: FUNCTION capturar_razon_no_show_ai(p_contact_id text, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.capturar_razon_no_show_ai(p_contact_id text, p_reason text) IS 'Helper para n8n: el bot llama con (contact_id, razón) y la función actualiza el último appointment no_show del paciente.';


--
-- Name: change_company_plan(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.change_company_plan(p_company_id uuid, p_new_plan_slug text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE slug = p_new_plan_slug AND is_active = true) THEN
    RAISE EXCEPTION 'Plan no existe o está inactivo: %', p_new_plan_slug;
  END IF;

  UPDATE public.companies
     SET plan_slug  = p_new_plan_slug,
         updated_at = now()
   WHERE id = p_company_id;
END;
$$;


--
-- Name: check_opt_out_keyword(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_opt_out_keyword(p_message text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
DECLARE
  v_normalized TEXT;
  v_keyword    TEXT;
  v_keywords   TEXT[] := ARRAY[
    'baja', 'bajame', 'darme baja', 'dame de baja', 'cancelar', 'cancela',
    'detener', 'detente', 'detenerme', 'alto', 'parar', 'para',
    'no quiero', 'no quiero mas', 'no me escribas',
    'eliminar', 'eliminame', 'borrar', 'borrame', 'remover', 'remueveme',
    'desuscribir', 'desuscribirme', 'unsuscribir',
    'stop', 'unsubscribe', 'cancel', 'end', 'quit', 'remove',
    'no more', 'opt out', 'optout', 'leave me alone'
  ];
BEGIN
  IF p_message IS NULL OR TRIM(p_message) = '' THEN
    RETURN jsonb_build_object('is_opt_out', FALSE, 'keyword', NULL);
  END IF;

  v_normalized := LOWER(TRIM(p_message));
  v_normalized := regexp_replace(v_normalized, '[áàâã]', 'a', 'g');
  v_normalized := regexp_replace(v_normalized, '[éèê]',  'e', 'g');
  v_normalized := regexp_replace(v_normalized, '[íìî]',  'i', 'g');
  v_normalized := regexp_replace(v_normalized, '[óòôõ]', 'o', 'g');
  v_normalized := regexp_replace(v_normalized, '[úùû]',  'u', 'g');
  v_normalized := regexp_replace(v_normalized, '[!?.,;:]', '', 'g');
  v_normalized := regexp_replace(v_normalized, '\s+', ' ', 'g');

  FOREACH v_keyword IN ARRAY v_keywords LOOP
    IF v_normalized = v_keyword THEN
      RETURN jsonb_build_object('is_opt_out', TRUE, 'keyword', v_keyword);
    END IF;
    IF v_normalized ~ ('(^|\s)' || v_keyword || '($|\s)') THEN
      RETURN jsonb_build_object('is_opt_out', TRUE, 'keyword', v_keyword);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('is_opt_out', FALSE, 'keyword', NULL);
END;
$_$;


--
-- Name: check_rate_limit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer) RETURNS TABLE(allowed boolean, remaining integer, reset_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_inicio timestamptz;
  v_hits   integer;
begin
  if p_limit is null or p_limit <= 0 then
    return query select true, 2147483647, now();
    return;
  end if;

  -- Ventana fija: se redondea el instante actual hacia abajo.
  v_inicio := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (bucket, window_start, hits)
  values (p_bucket, v_inicio, 1)
  on conflict (bucket, window_start)
  do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  return query select
    v_hits <= p_limit,
    greatest(p_limit - v_hits, 0),
    v_inicio + make_interval(secs => p_window_seconds);
end;
$$;


--
-- Name: companies_set_trial_ends_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.companies_set_trial_ends_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  plan_trial_days INT;
BEGIN
  -- Si no se especificó trial_ends_at y hay un plan elegido, calculamos
  IF NEW.trial_ends_at IS NULL AND NEW.selected_plan_slug IS NOT NULL THEN
    SELECT trial_days INTO plan_trial_days
    FROM plans
    WHERE slug = NEW.selected_plan_slug;

    IF plan_trial_days IS NOT NULL THEN
      NEW.trial_starts_at := coalesce(NEW.trial_starts_at, now());
      NEW.trial_ends_at   := NEW.trial_starts_at + (plan_trial_days || ' days')::interval;
      NEW.subscription_status := coalesce(NEW.subscription_status, 'trialing');
    END IF;
  END IF;

  -- Si no hay plan elegido pero está en trial, default 14 días
  IF NEW.trial_ends_at IS NULL AND NEW.subscription_status = 'trialing' THEN
    NEW.trial_starts_at := coalesce(NEW.trial_starts_at, now());
    NEW.trial_ends_at   := NEW.trial_starts_at + INTERVAL '14 days';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: company_has_catalog(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.company_has_catalog(p_company_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_has BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM company_addons ca
    JOIN addons a ON a.id = ca.addon_id
    WHERE ca.company_id = p_company_id
      AND ca.status IN ('active', 'trialing')
      AND (
        (a.feature_flags->>'public_catalog')::boolean IS TRUE
        OR lower(a.name) LIKE '%catálogo%'
        OR lower(a.name) LIKE '%catalogo%'
      )
  ) INTO v_has;
  RETURN COALESCE(v_has, false);
END;
$$;


--
-- Name: complete_data_deletion(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_data_deletion(p_request_id uuid, p_processed_by uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request       RECORD;
  v_msg_count     INTEGER := 0;
  v_contact_count INTEGER := 0;
  v_external_id   TEXT;
BEGIN
  SELECT * INTO v_request
  FROM data_deletion_requests
  WHERE id = p_request_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Request no encontrado');
  END IF;

  IF v_request.status = 'completed' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Ya fue completado');
  END IF;

  v_external_id := regexp_replace(COALESCE(v_request.requester_phone, ''), '\D', '', 'g');

  -- Si tenemos teléfono y company, borrar
  IF v_request.company_id IS NOT NULL AND v_external_id != '' THEN
    -- Borrar mensajes del contacto (patient_id en messages = external_id)
    DELETE FROM messages
    WHERE company_id = v_request.company_id
      AND patient_id = v_external_id;
    GET DIAGNOSTICS v_msg_count = ROW_COUNT;

    -- Si scope full, también borrar contact
    IF v_request.scope = 'full' THEN
      DELETE FROM contacts
      WHERE company_id = v_request.company_id
        AND external_id = v_external_id;
      GET DIAGNOSTICS v_contact_count = ROW_COUNT;
    END IF;
  END IF;

  -- Marcar como completado
  UPDATE data_deletion_requests
  SET status          = 'completed',
      completed_at    = NOW(),
      processed_by    = p_processed_by,
      records_deleted = jsonb_build_object('messages', v_msg_count, 'contacts', v_contact_count)
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success',         TRUE,
    'records_deleted', jsonb_build_object('messages', v_msg_count, 'contacts', v_contact_count)
  );
END;
$$;


--
-- Name: create_invoice_draft_from_stripe(uuid, text, text, bigint, bigint, bigint, text, text, timestamp with time zone, timestamp with time zone, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_invoice_draft_from_stripe(p_company_id uuid, p_stripe_invoice_id text, p_stripe_payment_intent text, p_subtotal_cents bigint, p_iva_cents bigint, p_total_cents bigint, p_currency text, p_description text, p_billing_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_billing_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_emisor_rfc text DEFAULT NULL::text, p_emisor_legal_name text DEFAULT NULL::text, p_emisor_regime_code text DEFAULT NULL::text, p_emisor_zip text DEFAULT NULL::text, p_sat_product_code text DEFAULT '81111508'::text, p_sat_unit_code text DEFAULT 'E48'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company         RECORD;
  v_invoice_id      UUID;
  v_folio           INTEGER;
  v_invoice_number  TEXT;
  v_items           JSONB;
BEGIN
  -- Validar que ya no exista una invoice para este stripe_invoice_id
  IF EXISTS (SELECT 1 FROM invoices WHERE stripe_invoice_id = p_stripe_invoice_id) THEN
    RETURN jsonb_build_object(
      'success',  FALSE,
      'error',    'Ya existe una invoice para este pago de Stripe',
      'duplicate', TRUE
    );
  END IF;

  -- Leer datos fiscales de la company
  SELECT
    tax_rfc, tax_legal_name, tax_regime_code, tax_address_zip,
    tax_use_cfdi, invoice_email, requires_invoice, name
  INTO v_company
  FROM companies
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Company no encontrada');
  END IF;

  -- Generar folio
  v_folio := next_invoice_folio();
  v_invoice_number := 'A-' || LPAD(v_folio::TEXT, 6, '0');

  -- Construir items array
  v_items := jsonb_build_array(jsonb_build_object(
    'description',       p_description,
    'quantity',          1,
    'unit_price_cents',  p_subtotal_cents,
    'subtotal_cents',    p_subtotal_cents,
    'iva_cents',         p_iva_cents,
    'total_cents',       p_total_cents,
    'sat_product_code',  p_sat_product_code,
    'sat_unit_code',     p_sat_unit_code
  ));

  -- Crear el draft. Si el cliente NO tiene datos fiscales, queda en status 'draft'
  -- (no se podrá timbrar hasta que el cliente los capture).
  INSERT INTO invoices (
    company_id, invoice_number, series, folio, status,
    emisor_rfc, emisor_legal_name, emisor_regime_code, emisor_zip,
    receptor_rfc, receptor_legal_name, receptor_regime_code, receptor_zip,
    receptor_use_cfdi, receptor_email,
    subtotal_cents, iva_cents, total_cents, currency,
    items,
    billing_period_start, billing_period_end,
    stripe_invoice_id, stripe_payment_intent_id,
    paid_at, issued_at
  )
  VALUES (
    p_company_id, v_invoice_number, 'A', v_folio, 'draft',
    COALESCE(p_emisor_rfc, 'PENDING'),
    COALESCE(p_emisor_legal_name, 'PENDING'),
    COALESCE(p_emisor_regime_code, '612'),
    COALESCE(p_emisor_zip, '00000'),
    COALESCE(v_company.tax_rfc, 'XAXX010101000'),
    COALESCE(v_company.tax_legal_name, v_company.name, 'PÚBLICO EN GENERAL'),
    v_company.tax_regime_code,
    v_company.tax_address_zip,
    COALESCE(v_company.tax_use_cfdi, 'G03'),
    v_company.invoice_email,
    p_subtotal_cents, p_iva_cents, p_total_cents, COALESCE(p_currency, 'MXN'),
    v_items,
    p_billing_period_start, p_billing_period_end,
    p_stripe_invoice_id, p_stripe_payment_intent,
    NOW(), NOW()
  )
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'success',          TRUE,
    'invoice_id',       v_invoice_id,
    'invoice_number',   v_invoice_number,
    'requires_invoice', COALESCE(v_company.requires_invoice, FALSE),
    'has_tax_data',     v_company.tax_rfc IS NOT NULL
  );
END;
$$;


--
-- Name: ensure_order_tokens(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_order_tokens() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.tracking_token IS NULL THEN
    NEW.tracking_token := COALESCE(NEW.public_token, encode(gen_random_bytes(12), 'hex'));
  END IF;
  IF NEW.public_token IS NULL THEN
    NEW.public_token := NEW.tracking_token;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fill_template_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_template_company_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.waba_id IS NOT NULL THEN
    SELECT id INTO NEW.company_id
    FROM companies
    WHERE waba_id = NEW.waba_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: find_eligible_team_members(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_eligible_team_members(p_company_id uuid, p_service_id uuid) RETURNS TABLE(team_member_id uuid, full_name text, title text, email text, phone text, is_explicit boolean, priority integer, notes text)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  -- Caso 1: Miembros con SÍ ofrece explícito (prioridad 1)
  SELECT
    t.id           AS team_member_id,
    t.full_name,
    t.title,
    t.email,
    t.phone,
    TRUE           AS is_explicit,
    1              AS priority,
    tms.notes
  FROM team t
  INNER JOIN team_member_services tms
    ON tms.team_member_id = t.id
    AND tms.service_id    = p_service_id
    AND tms.offered       = TRUE
  WHERE t.company_id = p_company_id
    AND COALESCE(t.is_active, TRUE) = TRUE

  UNION ALL

  -- Caso 2: Miembros sin asignación explícita (prioridad 2)
  -- (excluye automáticamente a los que tienen offered=FALSE)
  SELECT
    t.id           AS team_member_id,
    t.full_name,
    t.title,
    t.email,
    t.phone,
    FALSE          AS is_explicit,
    2              AS priority,
    NULL           AS notes
  FROM team t
  WHERE t.company_id = p_company_id
    AND COALESCE(t.is_active, TRUE) = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM team_member_services tms
      WHERE tms.team_member_id = t.id
        AND tms.service_id     = p_service_id
    )

  ORDER BY priority ASC, full_name ASC;
$$;


--
-- Name: FUNCTION find_eligible_team_members(p_company_id uuid, p_service_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.find_eligible_team_members(p_company_id uuid, p_service_id uuid) IS 'Devuelve miembros elegibles para un servicio, ordenados por prioridad (explícitos primero). Excluye a los marcados con offered=FALSE.';


--
-- Name: generar_estructura(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generar_estructura() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  output_text TEXT := '';
  rec RECORD;
BEGIN

  -- SECUENCIAS
  output_text := output_text || E'\n-- ============================================================\n-- SECUENCIAS\n-- ============================================================\n';
  
  FOR rec IN (
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  ) LOOP
    output_text := output_text || format('CREATE SEQUENCE IF NOT EXISTS %I.%I;', rec.sequence_schema, rec.sequence_name) || E'\n';
  END LOOP;

  -- TABLAS
  output_text := output_text || E'\n-- ============================================================\n-- TABLAS\n-- ============================================================\n';
  
  FOR rec IN (
    SELECT 
      table_name,
      string_agg(
        format(
          '  %I %s%s%s%s',
          column_name,
          data_type,
          CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END,
          CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
          CASE WHEN data_type = 'USER-DEFINED' AND udt_name IS NOT NULL THEN ' (' || udt_name || ')' ELSE '' END
        ),
        E',\n'
        ORDER BY ordinal_position
      ) AS columns_def
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name NOT IN ('schema_migrations', 'migrations')
    GROUP BY table_name
  ) LOOP
    output_text := output_text || format('CREATE TABLE IF NOT EXISTS public.%I (', rec.table_name) || E'\n';
    output_text := output_text || rec.columns_def || E'\n';
    output_text := output_text || ');' || E'\n\n';
  END LOOP;

  -- CLAVES PRIMARIAS
  output_text := output_text || E'\n-- ============================================================\n-- CLAVES PRIMARIAS\n-- ============================================================\n';
  
  FOR rec IN (
    SELECT
      tc.table_name,
      tc.constraint_name,
      string_agg(kcu.column_name, ', ') AS columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name
  ) LOOP
    output_text := output_text || format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (%s);',
      rec.table_name, rec.constraint_name, rec.columns
    ) || E'\n';
  END LOOP;

  -- CLAVES FORÁNEAS
  output_text := output_text || E'\n-- ============================================================\n-- CLAVES FORÁNEAS\n-- ============================================================\n';
  
  FOR rec IN (
    SELECT
      tc.table_name,
      tc.constraint_name,
      string_agg(kcu.column_name, ', ') AS columns,
      ccu.table_name AS ref_table,
      string_agg(ccu.column_name, ', ') AS ref_columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    GROUP BY tc.table_name, tc.constraint_name, ccu.table_name
  ) LOOP
    output_text := output_text || format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES public.%I (%s);',
      rec.table_name, rec.constraint_name, rec.columns, rec.ref_table, rec.ref_columns
    ) || E'\n';
  END LOOP;

  -- ÍNDICES
  output_text := output_text || E'\n-- ============================================================\n-- ÍNDICES\n-- ============================================================\n';
  
  FOR rec IN (
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname NOT LIKE '%_pkey'
      AND indexname NOT LIKE '%_fkey'
  ) LOOP
    output_text := output_text || rec.indexdef || ';' || E'\n';
  END LOOP;

  -- FUNCIONES
  output_text := output_text || E'\n-- ============================================================\n-- FUNCIONES\n-- ============================================================\n';
  
  FOR rec IN (
    SELECT pg_get_functiondef(p.oid) AS func_def
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND proname NOT LIKE 'pg_%'
      AND proname NOT LIKE '_%'
      AND proname NOT LIKE 'plpgsql_%'
  ) LOOP
    output_text := output_text || rec.func_def || E'\n';
  END LOOP;

  -- TRIGGERS
  output_text := output_text || E'\n-- ============================================================\n-- TRIGGERS\n-- ============================================================\n';
  
  FOR rec IN (
    SELECT pg_get_triggerdef(t.oid) AS trigger_def
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND t.tgenabled = 'O'
  ) LOOP
    output_text := output_text || rec.trigger_def || ';' || E'\n';
  END LOOP;

  -- POLÍTICAS RLS
  output_text := output_text || E'\n-- ============================================================\n-- POLÍTICAS RLS\n-- ============================================================\n';
  
  FOR rec IN (
    SELECT
      pol.polname AS policy_name,
      c.relname AS table_name,
      CASE pol.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        ELSE 'ALL'
      END AS command,
      pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
      pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
    FROM pg_policy pol
    JOIN pg_class c ON pol.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
  ) LOOP
    output_text := output_text || format(
      'CREATE POLICY %I ON public.%I FOR %s TO PUBLIC USING (%s) WITH CHECK (%s);',
      rec.policy_name,
      rec.table_name,
      rec.command,
      COALESCE(rec.using_expr, 'TRUE'),
      COALESCE(rec.with_check_expr, 'TRUE')
    ) || E'\n';
  END LOOP;

  -- ENABLE RLS
  output_text := output_text || E'\n-- ============================================================\n-- ENABLE ROW LEVEL SECURITY\n-- ============================================================\n';
  
  FOR rec IN (
    SELECT relname
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND relkind = 'r'
      AND relrowsecurity = true
  ) LOOP
    output_text := output_text || format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', rec.relname) || E'\n';
  END LOOP;

  RETURN output_text;
END;
$$;


--
-- Name: generate_unique_company_slug(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_unique_company_slug(p_name text, p_exclude_id uuid DEFAULT NULL::uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  base_slug   TEXT;
  final_slug  TEXT;
  counter     INTEGER := 0;
BEGIN
  -- Normalizar:
  --   1. Reemplazar acentos
  --   2. lowercase
  --   3. quitar caracteres no alfanuméricos (excepto guión)
  --   4. trim guiones de los extremos
  --   5. cortar a 50 caracteres
  base_slug := translate(
    coalesce(p_name, ''),
    'áéíóúñÁÉÍÓÚÑüÜ',
    'aeiounAEIOUNuU'
  );
  base_slug := lower(base_slug);
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  base_slug := substring(base_slug from 1 for 50);

  -- Si quedó vacío, usar fallback
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'company';
  END IF;

  -- Buscar slug único (agrega -1, -2, -3... si está ocupado)
  final_slug := base_slug;
  WHILE EXISTS (
    SELECT 1 FROM companies
    WHERE slug = final_slug
      AND (p_exclude_id IS NULL OR id <> p_exclude_id)
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
    -- Safety: no infinitamente
    IF counter > 999 THEN
      final_slug := base_slug || '-' || gen_random_uuid()::text;
      EXIT;
    END IF;
  END LOOP;

  RETURN final_slug;
END;
$$;


--
-- Name: FUNCTION generate_unique_company_slug(p_name text, p_exclude_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.generate_unique_company_slug(p_name text, p_exclude_id uuid) IS 'Genera un slug URL-friendly único desde el nombre de la company. Si choca, agrega -1, -2, etc.';


--
-- Name: get_company_agendas(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_company_agendas(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_has_is_active boolean;
  v_result jsonb;
BEGIN
  -- ¿tiene is_active la tabla agendas?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'agendas'
       AND column_name = 'is_active'
  ) INTO v_has_is_active;

  IF v_has_is_active THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
      INTO v_result
      FROM public.agendas a
     WHERE a.company_id = p_company_id
       AND a.is_active = true;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
      INTO v_result
      FROM public.agendas a
     WHERE a.company_id = p_company_id;
  END IF;

  RETURN v_result;
END;
$$;


--
-- Name: get_company_available_addons(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_company_available_addons(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_installed_templates text[];
  v_result jsonb;
BEGIN
  -- IDs de templates instalados por la company
  SELECT array_agg(template_id) INTO v_installed_templates
    FROM public.company_templates
   WHERE company_id = p_company_id;

  IF v_installed_templates IS NULL THEN
    v_installed_templates := '{}'::text[];
  END IF;

  -- Addons disponibles: universales O cuyo available_for_templates intersecta
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'name', a.name,
    'short_name', a.short_name,
    'description', a.description,
    'category', a.category,
    'icon', a.icon,
    'price_monthly_cents', a.price_monthly_cents,
    'price_one_time_cents', a.price_one_time_cents,
    'currency', a.currency,
    'is_recurring', a.is_recurring,
    'is_one_time', a.is_one_time,
    'feature_flags', a.feature_flags,
    'capacity_grants', a.capacity_grants,
    'requires_plan_min', a.requires_plan_min,
    'available_for_templates', a.available_for_templates,
    'is_featured', a.is_featured,
    'display_order', a.display_order,
    'is_template_specific', cardinality(a.available_for_templates) > 0
  ) ORDER BY a.display_order, a.name), '[]'::jsonb)
  INTO v_result
  FROM public.addons a
  WHERE a.is_active = true
    AND (
      -- Universal: available_for_templates está vacío
      cardinality(a.available_for_templates) = 0
      -- O al menos un template requerido está instalado
      OR a.available_for_templates && v_installed_templates
    );

  RETURN v_result;
END;
$$;


--
-- Name: get_company_entitlements(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_company_entitlements(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
DECLARE
  v_company        record;
  v_plan           record;
  v_templates      jsonb;
  v_addons         jsonb;
  v_features       jsonb;
  v_capacity       jsonb;
  v_addon_features jsonb;
  v_addon_capacity jsonb;
BEGIN
  -- Company + plan en una sola query
  SELECT c.id, c.plan_slug, c.account_status, c.subscription_status, c.trial_ends_at,
         p.tier, p.name AS plan_name, p.description AS plan_description,
         p.price_monthly_cents, p.price_yearly_cents,
         p.max_sessions_per_month, p.max_team_members, p.max_internal_users,
         p.max_channels, p.max_locations, p.max_agendas, p.max_bots,
         p.feature_flags AS plan_features
    INTO v_company
    FROM public.companies c
    JOIN public.plans p ON p.slug = c.plan_slug
   WHERE c.id = p_company_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Templates instalados con su info completa
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',             t.id,
      'name',           t.name,
      'icon',           t.icon,
      'theme_color',    t.theme_color,
      'accent_color',   t.accent_color,
      'tenant_label',   t.tenant_label,
      'ui_labels',      t.ui_labels,
      'active_modules', t.active_modules,
      'funnels',        t.funnels,
      'is_primary',     ct.is_primary,
      'config',         ct.config
    )
    ORDER BY ct.is_primary DESC, t.display_order ASC
  ), '[]'::jsonb)
    INTO v_templates
    FROM public.company_templates ct
    JOIN public.templates t ON t.id = ct.template_id
   WHERE ct.company_id = p_company_id;

  -- Addons activos
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                 a.id,
      'name',               a.name,
      'category',           a.category,
      'quantity',           ca.quantity,
      'feature_flags',      a.feature_flags,
      'capacity_grants',    a.capacity_grants,
      'status',             ca.status,
      'activated_at',       ca.activated_at,
      'current_period_end', ca.current_period_end
    )
  ), '[]'::jsonb)
    INTO v_addons
    FROM public.company_addons ca
    JOIN public.addons a ON a.id = ca.addon_id
   WHERE ca.company_id = p_company_id
     AND ca.status = 'active';

  -- Fusionar feature_flags del plan + cada addon activo
  v_features := v_company.plan_features;
  SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_addon_features
    FROM (
      SELECT k, bool_or(v::boolean) AS v
        FROM public.company_addons ca
        JOIN public.addons a ON a.id = ca.addon_id,
             jsonb_each(a.feature_flags) AS f(k, v)
       WHERE ca.company_id = p_company_id
         AND ca.status = 'active'
       GROUP BY k
    ) AS addon_flags;
  v_features := v_features || v_addon_features;

  -- Construir capacity sumando lo que dan los addons
  v_capacity := jsonb_build_object(
    'max_sessions_per_month', v_company.max_sessions_per_month,
    'max_team_members',       v_company.max_team_members,
    'max_internal_users',     v_company.max_internal_users,
    'max_channels',           v_company.max_channels,
    'max_locations',          v_company.max_locations,
    'max_agendas',            v_company.max_agendas,
    'max_bots',               v_company.max_bots
  );

  SELECT COALESCE(jsonb_object_agg(k, base_v + grant_v), '{}'::jsonb)
    INTO v_addon_capacity
    FROM (
      SELECT k,
             (v_capacity->>k)::integer AS base_v,
             SUM((v::text)::integer * ca.quantity)::integer AS grant_v
        FROM public.company_addons ca
        JOIN public.addons a ON a.id = ca.addon_id,
             jsonb_each(a.capacity_grants) AS g(k, v)
       WHERE ca.company_id = p_company_id
         AND ca.status = 'active'
       GROUP BY k
    ) AS addon_caps;

  IF v_addon_capacity IS NOT NULL AND v_addon_capacity != '{}'::jsonb THEN
    v_capacity := v_capacity || v_addon_capacity;
  END IF;

  RETURN jsonb_build_object(
    'plan', jsonb_build_object(
      'slug',                v_company.plan_slug,
      'tier',                v_company.tier,
      'name',                v_company.plan_name,
      'description',         v_company.plan_description,
      'price_monthly_cents', v_company.price_monthly_cents,
      'price_yearly_cents',  v_company.price_yearly_cents
    ),
    'features',       v_features,
    'features_jsonb', v_features,
    'capacity',       v_capacity,
    'templates',      v_templates,
    'addons',         v_addons,
    'account_status', v_company.account_status,
    'computed_at',    now()
  );
END;
$$;


--
-- Name: FUNCTION get_company_entitlements(p_company_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_company_entitlements(p_company_id uuid) IS 'Devuelve plan + features + capacity + templates + addons en un único JSON. Contrato del frontend v2.26.';


--
-- Name: get_company_features(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_company_features(p_company_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    -- 1. flags del plan
    COALESCE(
      (SELECT p.feature_flags
       FROM companies c
       LEFT JOIN plans p ON p.slug = c.plan_slug
       WHERE c.id = p_company_id),
      '{}'::jsonb
    )
    ||
    -- 2. flags de TODOS los addons activos (se superponen sobre el plan)
    COALESCE(
      (SELECT jsonb_object_agg(key, value)
       FROM (
         SELECT DISTINCT ON (kv.key) kv.key, kv.value
         FROM company_addons ca
         JOIN addons a ON a.id = ca.addon_id
         CROSS JOIN LATERAL jsonb_each(COALESCE(a.feature_flags, '{}'::jsonb)) AS kv(key, value)
         WHERE ca.company_id = p_company_id
           AND ca.status IN ('active', 'trialing', 'trial')
           AND (ca.current_period_end IS NULL OR ca.current_period_end > NOW())
           AND kv.value = 'true'::jsonb
       ) merged),
      '{}'::jsonb
    );
$$;


--
-- Name: get_contact_tags_for_ai(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_contact_tags_for_ai(p_contact_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  result text;
BEGIN
  SELECT string_agg(
    '- ' || t.name || CASE
      WHEN t.ai_context IS NOT NULL AND length(trim(t.ai_context)) > 0
      THEN ': ' || t.ai_context
      ELSE ''
    END,
    E'\n'
  )
  INTO result
  FROM public.contact_tags ct
  JOIN public.tags t ON t.id = ct.tag_id
  WHERE ct.contact_id = p_contact_id
    AND t.ai_aware = true;

  RETURN jsonb_build_object('text', COALESCE(result, ''));
END
$$;


--
-- Name: FUNCTION get_contact_tags_for_ai(p_contact_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_contact_tags_for_ai(p_contact_id text) IS 'Devuelve JSONB {"text": "..."} con las tags ai_aware del contacto. Llamada desde n8n.';


--
-- Name: get_modules_with_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_modules_with_data(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  result jsonb := '{}'::jsonb;
BEGIN
  -- Propiedades
  IF EXISTS (SELECT 1 FROM properties WHERE company_id = p_company_id LIMIT 1) THEN
    result := result || '{"properties": true, "propiedades": true}'::jsonb;
  END IF;

  -- Menú
  IF EXISTS (SELECT 1 FROM menu_items WHERE company_id = p_company_id LIMIT 1) THEN
    result := result || '{"menu": true}'::jsonb;
  END IF;

  -- Órdenes (si tiene órdenes, mantener el módulo)
  IF EXISTS (SELECT 1 FROM orders WHERE company_id = p_company_id LIMIT 1) THEN
    result := result || '{"orders": true, "ordenes": true}'::jsonb;
  END IF;

  RETURN result;
END;
$$;


--
-- Name: FUNCTION get_modules_with_data(p_company_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_modules_with_data(p_company_id uuid) IS 'Devuelve los módulos que tienen datos reales, para no ocultar sus tabs al cambiar de plantilla.';


--
-- Name: get_order_status_for_bot(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_status_for_bot(p_company_id uuid, p_phone text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text) RETURNS TABLE(found boolean, order_number text, status_label text, status_semantic text, status_step integer, total_steps integer, delivery_type text, estimated_ready_at timestamp with time zone, tracking_url text, bot_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order        orders%ROWTYPE;
  v_total_steps  integer;
  v_base_url     text := 'https://ianswer.pro';
  v_eta_text     text := '';
BEGIN
  -- Buscar el pedido: por order_number si se da, si no el más reciente del teléfono
  IF p_order_number IS NOT NULL AND p_order_number <> '' THEN
    SELECT * INTO v_order
    FROM orders
    WHERE company_id = p_company_id
      AND order_number = p_order_number
    ORDER BY created_at DESC
    LIMIT 1;
  ELSIF p_phone IS NOT NULL AND p_phone <> '' THEN
    SELECT * INTO v_order
    FROM orders
    WHERE company_id = p_company_id
      AND contact_phone = regexp_replace(p_phone, '\D', '', 'g')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- No encontrado
  IF v_order.id IS NULL THEN
    RETURN QUERY SELECT
      FALSE,
      NULL::text, NULL::text, NULL::text, NULL::integer, NULL::integer,
      NULL::text, NULL::timestamptz, NULL::text,
      'No encontré ningún pedido reciente con esos datos. ¿Me confirmas el número de pedido?'::text;
    RETURN;
  END IF;

  -- Total de pasos configurados por el restaurante
  SELECT jsonb_array_length(COALESCE(order_statuses, '[]'::jsonb))
  INTO v_total_steps
  FROM companies WHERE id = p_company_id;

  IF v_total_steps IS NULL OR v_total_steps = 0 THEN
    v_total_steps := 4;
  END IF;

  -- Texto de ETA si existe
  IF v_order.estimated_ready_at IS NOT NULL THEN
    IF v_order.estimated_ready_at > NOW() THEN
      v_eta_text := ' Tiempo estimado: ' ||
        to_char(v_order.estimated_ready_at AT TIME ZONE 'America/Mexico_City', 'HH24:MI') || ' hrs.';
    END IF;
  END IF;

  -- Armar mensaje amigable para el bot
  RETURN QUERY SELECT
    TRUE,
    v_order.order_number,
    v_order.status_label,
    v_order.status_semantic,
    v_order.status_step,
    v_total_steps,
    v_order.delivery_type,
    v_order.estimated_ready_at,
    (v_base_url || '/tracking/' || v_order.tracking_token)::text,
    (
      'Tu pedido #' || v_order.order_number || ' está en estado: ' ||
      v_order.status_label ||
      ' (paso ' || (v_order.status_step + 1) || ' de ' || v_total_steps || ').' ||
      v_eta_text ||
      ' Puedes seguirlo aquí: ' || v_base_url || '/tracking/' || v_order.tracking_token
    )::text;
END;
$$;


--
-- Name: FUNCTION get_order_status_for_bot(p_company_id uuid, p_phone text, p_order_number text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_order_status_for_bot(p_company_id uuid, p_phone text, p_order_number text) IS 'El bot llama esto cuando un cliente pregunta por su pedido. Devuelve estado + mensaje listo para leer + link de tracking.';


--
-- Name: get_order_tracking(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_tracking(p_token text) RETURNS TABLE(id uuid, company_id uuid, company_name text, order_number text, contact_name text, items jsonb, total numeric, delivery_type text, status_semantic text, status_label text, status_step integer, estimated_ready_at timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    o.id,
    o.company_id,
    c.name AS company_name,
    o.order_number,
    o.contact_name,
    o.items,
    o.total,
    o.delivery_type,
    o.status_semantic,
    o.status_label,
    o.status_step,
    o.estimated_ready_at,
    o.created_at
  FROM orders o
  JOIN companies c ON c.id = o.company_id
  WHERE o.tracking_token = p_token
  LIMIT 1;
$$;


--
-- Name: get_services_for_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_services_for_member(p_team_member_id uuid) RETURNS TABLE(service_id uuid, service_name text, service_category text, duration_minutes integer, default_price numeric, assignment_id uuid, offered boolean, notes text)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT
    s.id            AS service_id,
    s.name          AS service_name,
    s.category      AS service_category,
    s.duration_minutes,
    s.default_price,
    tms.id          AS assignment_id,
    tms.offered,
    tms.notes
  FROM services s
  LEFT JOIN team_member_services tms
    ON tms.service_id = s.id
    AND tms.team_member_id = p_team_member_id
  WHERE s.company_id = (
    SELECT company_id FROM team WHERE id = p_team_member_id
  )
    AND s.is_active = TRUE
  ORDER BY s.display_order ASC, s.name ASC;
$$;


--
-- Name: FUNCTION get_services_for_member(p_team_member_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_services_for_member(p_team_member_id uuid) IS 'Devuelve TODOS los servicios de la company con el estado de asignación del miembro (LEFT JOIN). Útil para el UI del editor.';


--
-- Name: get_usage_current_month(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_usage_current_month(p_company_id uuid) RETURNS TABLE(sessions_used integer, sessions_limit integer, period_start timestamp with time zone, period_end timestamp with time zone, pct_used numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with periodo as (
    select
      date_trunc('month', now())                            as inicio,
      date_trunc('month', now()) + interval '1 month'       as fin
  ),
  ordenados as (
    select
      m.patient_id,
      m.created_at,
      lag(m.created_at) over (
        partition by m.patient_id order by m.created_at
      ) as anterior
    from public.messages m, periodo p
    where m.company_id = p_company_id
      and m.created_at >= p.inicio
      and m.created_at <  p.fin
      and m.patient_id is not null
  ),
  sesiones as (
    -- Una sesión nueva por cada primer mensaje del contacto en el mes
    -- y por cada hueco mayor a 24 h.
    select count(*)::integer as usadas
    from ordenados
    where anterior is null
       or created_at - anterior > interval '24 hours'
  ),
  limite as (
    select coalesce(pl.max_sessions_per_month, 1000)::integer as tope
    from public.companies c
    left join public.plans pl on pl.slug = c.plan_slug
    where c.id = p_company_id
  )
  select
    s.usadas,
    l.tope,
    p.inicio,
    p.fin,
    case when l.tope > 0
         then round((s.usadas::numeric / l.tope) * 100, 1)
         else 0 end
  from sesiones s, limite l, periodo p;
$$;


--
-- Name: get_whatsapp_config(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_whatsapp_config(p_company_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company companies%ROWTYPE;
  v_result  jsonb;
BEGIN
  SELECT * INTO v_company FROM companies WHERE id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'company_not_found');
  END IF;

  -- Determinar status derivado
  v_result := jsonb_build_object(
    'business_phone_id',      v_company.business_phone_id,
    'waba_id',                v_company.waba_id,
    'display_phone',          v_company.waba_display_phone,
    'verified_name',          v_company.waba_verified_name,
    'quality_rating',         v_company.waba_quality_rating,
    'messaging_tier',         v_company.waba_messaging_tier,
    'last_verified_at',       v_company.waba_last_verified_at,
    'connected_at',           v_company.waba_connected_at,
    'meta_business_verified', COALESCE(v_company.meta_business_verified, FALSE),
    'has_token',              v_company.system_user_access_token IS NOT NULL,
    'token_preview',          CASE
                                WHEN v_company.system_user_access_token IS NOT NULL
                                  THEN LEFT(v_company.system_user_access_token, 8) || '...' || RIGHT(v_company.system_user_access_token, 4)
                                ELSE NULL
                              END
  );

  RETURN v_result;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_company_id uuid;
  user_name text;
BEGIN
  -- Obtener nombre del usuario
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- 1. Crear la compañía con plan_slug por defecto (asumiendo que existe 'start')
  INSERT INTO public.companies (
    name,
    plan_slug,
    created_at,
    account_status
  )
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'company_name', 'Mi Negocio'),
    'start',           -- ← CAMBIO CLAVE: ahora se incluye plan_slug
    NOW(),
    'active'
  )
  RETURNING id INTO new_company_id;

  -- 2. Crear el perfil del usuario con role = 'user' por defecto
  INSERT INTO public.profiles (
    id,
    company_id,
    full_name,
    email,
    role,
    is_admin,
    created_at
  )
  VALUES (
    NEW.id,
    new_company_id,
    user_name,
    NEW.email,
    'user',            -- ← CAMBIO: 'user' en lugar de 'member'
    false,
    NOW()
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error en handle_new_user: %', SQLERRM;
    RAISE;
END;
$$;


--
-- Name: has_agent_training_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_agent_training_active(p_company_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM company_addons ca
    JOIN addons a ON a.id = ca.addon_id
    WHERE ca.company_id = p_company_id
      AND ca.status IN ('active', 'trialing', 'trial')
      AND a.feature_flags ? 'agent_training_pro'
      AND (a.feature_flags->>'agent_training_pro')::boolean = TRUE
      -- El periodo no ha expirado (si tiene fecha)
      AND (ca.current_period_end IS NULL OR ca.current_period_end > NOW())
  );
$$;


--
-- Name: has_hubspot_sync_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_hubspot_sync_active(p_company_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM company_addons ca
    JOIN addons a ON a.id = ca.addon_id
    WHERE ca.company_id = p_company_id
      AND ca.status = 'active'
      AND a.feature_flags ? 'hubspot_sync'
      AND (a.feature_flags->>'hubspot_sync')::boolean = TRUE
  );
$$;


--
-- Name: has_order_tracking_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_order_tracking_active(p_company_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM company_addons ca
    JOIN addons a ON a.id = ca.addon_id
    WHERE ca.company_id = p_company_id
      AND ca.status = 'active'
      AND a.feature_flags ? 'order_tracking'
      AND (a.feature_flags->>'order_tracking')::boolean = TRUE
  );
$$;


--
-- Name: has_public_directory_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_public_directory_active(p_company_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_has BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM company_addons ca
    JOIN addons a ON a.id = ca.addon_id
    WHERE ca.company_id = p_company_id
      AND ca.status IN ('active', 'trialing')
      AND (
        (a.feature_flags->>'public_catalog')::boolean IS TRUE
        OR lower(a.name) LIKE '%catálogo%'
        OR lower(a.name) LIKE '%catalogo%'
      )
  ) INTO v_has;
  RETURN COALESCE(v_has, false);
END;
$$;


--
-- Name: FUNCTION has_public_directory_active(p_company_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.has_public_directory_active(p_company_id uuid) IS 'Verifica si una company tiene el addon Directorio Público de Propiedades activo. Usado por el server component /p/[slug]/page.tsx y por workflows N8N.';


--
-- Name: help_articles_autoslug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.help_articles_autoslug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := lower(regexp_replace(
      regexp_replace(coalesce(NEW.title, ''), '[áàä]', 'a', 'gi'),
      '[^a-zA-Z0-9]+', '-', 'g'
    ));
    NEW.slug := trim(both '-' from NEW.slug);
    IF length(NEW.slug) = 0 THEN
      NEW.slug := 'art-' || substr(NEW.id::text, 1, 8);
    ELSE
      NEW.slug := NEW.slug || '-' || substr(NEW.id::text, 1, 6);
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: increment_usage(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_usage(p_company_id uuid, p_metric text, p_delta integer DEFAULT 1) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_value integer;
BEGIN
  INSERT INTO public.usage_counters (company_id, metric, value, period_start)
  VALUES (p_company_id, p_metric, p_delta, date_trunc('month', now()))
  ON CONFLICT (company_id, metric, period_start)
  DO UPDATE SET
    value      = public.usage_counters.value + p_delta,
    updated_at = now()
  RETURNING value INTO v_value;

  RETURN v_value;
END;
$$;


--
-- Name: install_template(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.install_template(p_company_id uuid, p_template_id text, p_make_primary boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_make_primary THEN
    UPDATE public.company_templates
       SET is_primary = false, updated_at = now()
     WHERE company_id = p_company_id AND is_primary = true;
  END IF;

  INSERT INTO public.company_templates (company_id, template_id, is_primary)
  VALUES (p_company_id, p_template_id, p_make_primary)
  ON CONFLICT (company_id, template_id)
  DO UPDATE SET
    is_primary = EXCLUDED.is_primary OR public.company_templates.is_primary,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: is_current_user_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_current_user_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;


--
-- Name: is_platform_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false);
$$;


--
-- Name: limpiar_bot_locks(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limpiar_bot_locks() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.bot_locks
  where created_at < now() - interval '1 hour';
$$;


--
-- Name: limpiar_rate_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limpiar_rate_limits() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.rate_limits
  where window_start < now() - interval '1 day';
$$;


--
-- Name: log_appointment_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_appointment_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO public.appointment_history (
    appointment_id, company_id, patient_id, action,
    new_date, new_time, new_status
  )
  VALUES (
    NEW.id, NEW.company_id, NEW.patient_id, 'created',
    NEW.appointment_date, NEW.appointment_time, NEW.status
  );
  RETURN NEW;
END;
$$;


--
-- Name: log_appointment_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_appointment_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Reagendado: cambio fecha o hora
  IF (OLD.appointment_date <> NEW.appointment_date) OR (OLD.appointment_time <> NEW.appointment_time) THEN
    INSERT INTO public.appointment_history (
      appointment_id, company_id, patient_id, action,
      old_date, old_time, new_date, new_time
    )
    VALUES (
      NEW.id, NEW.company_id, NEW.patient_id, 'rescheduled',
      OLD.appointment_date, OLD.appointment_time, NEW.appointment_date, NEW.appointment_time
    );
    NEW.rescheduled_count := COALESCE(OLD.rescheduled_count, 0) + 1;
  END IF;

  -- Cambio de status
  IF OLD.status <> NEW.status THEN
    INSERT INTO public.appointment_history (
      appointment_id, company_id, patient_id, action,
      old_status, new_status, reason
    )
    VALUES (
      NEW.id, NEW.company_id, NEW.patient_id,
      CASE NEW.status
        WHEN 'cancelled' THEN 'cancelled'
        WHEN 'completed' THEN 'completed'
        WHEN 'no_show'   THEN 'no_show'
        ELSE 'rescheduled'
      END,
      OLD.status, NEW.status, NEW.cancelled_reason
    );

    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: log_operator_action(uuid, uuid, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_operator_action(p_company_id uuid, p_operator_id uuid, p_action_type text, p_target_type text DEFAULT NULL::text, p_target_id text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email TEXT;
  v_log_id UUID;
BEGIN
  IF p_company_id IS NULL OR p_action_type IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'company_id y action_type son obligatorios');
  END IF;

  -- Snapshot del email del operador (si existe)
  IF p_operator_id IS NOT NULL THEN
    SELECT email INTO v_email FROM profiles WHERE id = p_operator_id LIMIT 1;
  END IF;

  INSERT INTO operator_audit_log (
    company_id, operator_id, operator_email,
    action_type, target_type, target_id, description, metadata
  )
  VALUES (
    p_company_id, p_operator_id, v_email,
    p_action_type, p_target_type, p_target_id, p_description, COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('success', TRUE, 'log_id', v_log_id);
EXCEPTION WHEN OTHERS THEN
  -- Nunca rompe el flujo principal por audit; solo loggear
  RAISE WARNING 'log_operator_action failed: %', SQLERRM;
  RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM);
END;
$$;


--
-- Name: mark_lost_contacts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_lost_contacts() RETURNS void
    LANGUAGE sql
    AS $$
  UPDATE public.contacts
     SET recovery_status = 'lost'
   WHERE recovery_status = 'pending_followup'
     AND follow_up_sent_at < (now() - interval '48 hours');
$$;


--
-- Name: next_invoice_folio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_invoice_folio() RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN nextval('invoice_folio_seq')::INTEGER;
END;
$$;


--
-- Name: notify_human_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_human_request() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Si antes estaba activa y ahora está apagada
  IF OLD.ai_active = true AND NEW.ai_active = false THEN
    INSERT INTO public.notifications (company_id, title, message, type, link)
    VALUES (
      NEW.company_id, 
      'Atención Requerida', 
      NEW.name || ' necesita hablar con un asesor humano.', 
      'human_request', 
      '/dashboard/inbox?contactId=' || NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: notify_new_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  target_company_id uuid;
  contact_name text;
BEGIN
  -- Solo notificamos si el mensaje viene del PACIENTE
  IF NEW.sender = 'patient' THEN
    
    -- Buscamos el nombre y la empresa del contacto usando su ID (teléfono)
    SELECT company_id, name INTO target_company_id, contact_name 
    FROM public.contacts 
    WHERE id = NEW.patient_id;

    -- Si encontramos la empresa, insertamos la notificación
    IF target_company_id IS NOT NULL THEN
      INSERT INTO public.notifications (company_id, title, message, type, link)
      VALUES (
        target_company_id, 
        'Nuevo Mensaje', 
        'Mensaje de ' || COALESCE(contact_name, NEW.patient_id), 
        'new_message', 
        '/dashboard/inbox?contactId=' || NEW.patient_id
      );
    END IF;

  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: on_appointment_insert_schedule_reminders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_appointment_insert_schedule_reminders() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM public.schedule_reminders_for_appointment(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: on_appointment_update_adjust_reminders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_appointment_update_adjust_reminders() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Si la cita se canceló, marcar pending como cancelled
  IF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
    UPDATE public.reminder_queue
      SET status = 'cancelled'
      WHERE appointment_id = NEW.id AND status = 'pending';
    RETURN NEW;
  END IF;

  -- Si cambió la fecha o la hora, borrar pending viejos y re-programar
  IF (OLD.appointment_date <> NEW.appointment_date) OR (OLD.appointment_time <> NEW.appointment_time) THEN
    DELETE FROM public.reminder_queue
      WHERE appointment_id = NEW.id AND status = 'pending';
    PERFORM public.schedule_reminders_for_appointment(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: on_message_detect_reminder_response(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.on_message_detect_reminder_response() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_normalized  text;
  v_response    text;
  v_recent      record;
BEGIN
  IF NEW.sender <> 'patient' THEN RETURN NEW; END IF;
  IF NEW.content IS NULL THEN RETURN NEW; END IF;

  v_normalized := upper(trim(NEW.content));

  -- Detectar palabra clave (acepta variaciones leves)
  IF v_normalized IN ('CONFIRMO', 'CONFIRMAR', 'CONFIRMADO', 'SI CONFIRMO', 'SÍ CONFIRMO') THEN
    v_response := 'confirmed';
  ELSIF v_normalized IN ('CANCELAR', 'CANCELO', 'CANCELADO', 'CANCELARLO') THEN
    v_response := 'cancelled';
  ELSE
    RETURN NEW;
  END IF;

  -- Buscar el recordatorio más reciente del paciente sin respuesta (últimas 48h)
  SELECT * INTO v_recent
    FROM public.reminder_queue
    WHERE contact_id = NEW.patient_id
      AND status = 'sent'
      AND patient_response IS NULL
      AND sent_at > now() - interval '48 hours'
    ORDER BY sent_at DESC
    LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Marcar la respuesta del paciente
  UPDATE public.reminder_queue
    SET patient_response = v_response,
        patient_responded_at = now(),
        patient_response_message = NEW.content
    WHERE id = v_recent.id;

  -- Si la regla está configurada para reaccionar Y hay appointment vinculada
  IF v_response = 'confirmed' AND v_recent.appointment_id IS NOT NULL THEN
    UPDATE public.appointments
      SET status = 'confirmed'
      WHERE id = v_recent.appointment_id AND status IN ('scheduled');
  ELSIF v_response = 'cancelled' AND v_recent.appointment_id IS NOT NULL THEN
    UPDATE public.appointments
      SET status = 'cancelled',
          cancelled_reason = 'Cancelado por el paciente vía recordatorio'
      WHERE id = v_recent.appointment_id AND status IN ('scheduled', 'confirmed');
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: process_reminder_queue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_reminder_queue() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_config      record;
  v_interval    integer;
  v_last_run    timestamptz;
  v_now         timestamptz := now();
  v_should_run  boolean := true;
  v_item        record;
  v_request_id  bigint;
  v_processed   integer := 0;
  v_failed      integer := 0;
BEGIN
  -- 1) Leer configuracion
  SELECT reminder_cron_interval_minutes, reminder_last_run_at, reminder_max_attempts
    INTO v_config
    FROM public.platform_settings
    WHERE id = 1;

  v_interval := COALESCE(v_config.reminder_cron_interval_minutes, 5);
  v_last_run := v_config.reminder_last_run_at;

  -- 2) Decidir si toca correr
  IF v_last_run IS NOT NULL THEN
    IF EXTRACT(EPOCH FROM (v_now - v_last_run)) < (v_interval * 60) THEN
      v_should_run := false;
    END IF;
  END IF;

  IF NOT v_should_run THEN
    RETURN jsonb_build_object(
      'ran', false,
      'reason', 'waiting',
      'next_run_in_seconds', (v_interval * 60) - EXTRACT(EPOCH FROM (v_now - v_last_run))::integer
    );
  END IF;

  -- 3) Marcar last_run_at INMEDIATAMENTE (idempotencia entre ticks)
  UPDATE public.platform_settings
    SET reminder_last_run_at = v_now
    WHERE id = 1;

  -- 4) Procesar la cola
  FOR v_item IN
    SELECT * FROM public.v_reminders_due
    ORDER BY scheduled_at ASC
    LIMIT 50    -- maximo 50 por tick para no saturar pg_net (max 200/s pero somos conservadores)
  LOOP
    -- Inc attempts y last_attempt_at
    UPDATE public.reminder_queue
      SET attempts = attempts + 1,
          last_attempt_at = v_now
      WHERE id = v_item.id;

    -- POST asincrono al webhook admin
    BEGIN
      SELECT net.http_post(
        url := v_item.whatsapp_admin_url,
        body := jsonb_build_object(
          'patient_id', v_item.patient_phone,
          'content',    v_item.rendered_content,
          'company_id', v_item.company_id
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 15000
      ) INTO v_request_id;

      -- Como pg_net es asincrono, asumimos exito (el net._http_response
      -- guarda el resultado, pero marcaremos sent ya).
      -- Si quieres validacion real, agrega un job posterior que lea net._http_response
      UPDATE public.reminder_queue
        SET status = 'sent',
            sent_at = v_now,
            error_message = NULL
        WHERE id = v_item.id;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.reminder_queue
        SET status = CASE
              WHEN attempts >= v_item.reminder_max_attempts THEN 'failed'
              ELSE 'pending'    -- vuelve a intentarse en el proximo tick
            END,
            error_message = SQLERRM
        WHERE id = v_item.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ran', true,
    'processed', v_processed,
    'failed', v_failed,
    'timestamp', v_now
  );
END;
$$;


--
-- Name: FUNCTION process_reminder_queue(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.process_reminder_queue() IS 'Procesa la cola de recordatorios. Lee v_reminders_due y hace POST al webhook admin via pg_net. Respeta reminder_cron_interval_minutes para skipping.';


--
-- Name: reconcile_reminder_http_responses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconcile_reminder_http_responses() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_resp        record;
  v_marked      integer := 0;
BEGIN
  -- net._http_response tiene un retencion de ~6h. Revisar errores ahi.
  FOR v_resp IN
    SELECT id, status_code, error_msg, created
      FROM net._http_response
      WHERE created > now() - interval '1 hour'
        AND (status_code IS NULL OR status_code >= 400)
  LOOP
    -- Marcar como failed si encontramos respuestas en error
    -- (esto solo es info — la queue puede ya estar marcada como 'sent' optimisticamente)
    UPDATE public.reminder_queue
      SET status = 'failed',
          error_message = COALESCE(v_resp.error_msg, 'HTTP ' || v_resp.status_code::text)
      WHERE sent_at > now() - interval '1 hour'
        AND status = 'sent'
        AND error_message IS NULL
        AND id = (
          SELECT id FROM public.reminder_queue
          WHERE sent_at IS NOT NULL
            AND status = 'sent'
          ORDER BY sent_at DESC
          LIMIT 1
        );
    v_marked := v_marked + 1;
  END LOOP;

  RETURN jsonb_build_object('reconciled', v_marked);
END;
$$;


--
-- Name: register_data_deletion_request(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_data_deletion_request(p_requester_email text, p_requester_phone text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_scope text DEFAULT 'full'::text, p_source text DEFAULT 'web_form'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request_id   UUID;
  v_company_id   UUID;
  v_confirmation TEXT;
BEGIN
  -- Validación
  IF p_requester_email IS NULL OR LENGTH(TRIM(p_requester_email)) = 0 THEN
    IF p_requester_phone IS NULL OR LENGTH(TRIM(p_requester_phone)) = 0 THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error',   'Se requiere email o teléfono del solicitante'
      );
    END IF;
  END IF;

  -- Intentar identificar la company del usuario por teléfono (más común en WhatsApp)
  IF p_requester_phone IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM contacts
    WHERE external_id = regexp_replace(p_requester_phone, '\D', '', 'g')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Generar código de confirmación único
  v_confirmation := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

  INSERT INTO data_deletion_requests (
    company_id, requester_type, requester_email, requester_phone,
    reason, scope, source, status, meta_confirmation_code
  )
  VALUES (
    v_company_id, 'end_user', p_requester_email, p_requester_phone,
    p_reason, p_scope, p_source, 'pending', v_confirmation
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'success',           TRUE,
    'request_id',        v_request_id,
    'confirmation_code', v_confirmation,
    'message',           'Solicitud registrada. Recibirás email de confirmación.'
  );
END;
$$;


--
-- Name: register_opt_in(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_opt_in(p_company_id uuid, p_external_id text, p_triggered_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'Reactivación manual'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_contact_id TEXT;   -- ★ TEXT
BEGIN
  SELECT id::TEXT INTO v_contact_id
  FROM contacts
  WHERE company_id = p_company_id AND external_id = p_external_id
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Contact no encontrado');
  END IF;

  UPDATE contacts
     SET opted_out         = FALSE,
         opted_out_at      = NULL,
         opted_out_reason  = NULL,
         opted_out_keyword = NULL,
         updated_at        = NOW()
   WHERE id::TEXT = v_contact_id;

  INSERT INTO contact_opt_outs (company_id, external_id, contact_id, action, source, reason, triggered_by)
  VALUES (p_company_id, p_external_id, v_contact_id, 'opt_in', 'manual_admin', p_reason, p_triggered_by);

  RETURN jsonb_build_object('success', TRUE, 'contact_id', v_contact_id);
END;
$$;


--
-- Name: register_opt_out(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_opt_out(p_company_id uuid, p_external_id text, p_keyword text DEFAULT NULL::text, p_message_id text DEFAULT NULL::text, p_source text DEFAULT 'whatsapp_keyword'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_contact_id TEXT;   -- ★ TEXT en vez de UUID
BEGIN
  -- Buscar contact existente
  SELECT id::TEXT INTO v_contact_id
  FROM contacts
  WHERE company_id = p_company_id AND external_id = p_external_id
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    -- No existe: crear uno marcado como opted_out
    INSERT INTO contacts (company_id, external_id, opted_out, opted_out_at, opted_out_reason, opted_out_keyword)
    VALUES (p_company_id, p_external_id, TRUE, NOW(), 'Usuario solicitó opt-out vía WhatsApp', p_keyword)
    RETURNING id::TEXT INTO v_contact_id;
  ELSE
    -- Existe: actualizar
    UPDATE contacts
       SET opted_out         = TRUE,
           opted_out_at      = NOW(),
           opted_out_reason  = 'Usuario solicitó opt-out vía WhatsApp',
           opted_out_keyword = p_keyword,
           updated_at        = NOW()
     WHERE id::TEXT = v_contact_id;
  END IF;

  INSERT INTO contact_opt_outs (company_id, external_id, contact_id, action, source, keyword, message_id)
  VALUES (p_company_id, p_external_id, v_contact_id, 'opt_out', p_source, p_keyword, p_message_id);

  RETURN jsonb_build_object(
    'success',     TRUE,
    'contact_id',  v_contact_id,
    'message',     'Usuario registrado como opted-out'
  );
END;
$$;


--
-- Name: register_quality_event(text, text, text, text, jsonb, jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_quality_event(p_business_phone_id text, p_event_type text, p_new_quality_rating text DEFAULT NULL::text, p_new_messaging_tier text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_raw_webhook jsonb DEFAULT NULL::jsonb, p_meta_event_time timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_company_id          UUID;
  v_old_quality_rating  TEXT;
  v_old_messaging_tier  TEXT;
BEGIN
  -- Buscar la company por business_phone_id
  SELECT id, waba_quality_rating, waba_messaging_tier
    INTO v_company_id, v_old_quality_rating, v_old_messaging_tier
  FROM companies
  WHERE business_phone_id = p_business_phone_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'No company found with business_phone_id: ' || p_business_phone_id
    );
  END IF;

  -- Insertar en histórico
  INSERT INTO whatsapp_quality_events (
    company_id, business_phone_id, event_type,
    old_quality_rating, new_quality_rating,
    old_messaging_tier, new_messaging_tier,
    metadata, raw_webhook, meta_event_time
  )
  VALUES (
    v_company_id, p_business_phone_id, p_event_type,
    v_old_quality_rating, p_new_quality_rating,
    v_old_messaging_tier, p_new_messaging_tier,
    p_metadata, p_raw_webhook, p_meta_event_time
  );

  -- Actualizar companies con el valor más reciente
  IF p_new_quality_rating IS NOT NULL THEN
    UPDATE companies
       SET waba_quality_rating   = p_new_quality_rating,
           waba_last_verified_at = NOW(),
           updated_at            = NOW()
     WHERE id = v_company_id;
  END IF;

  IF p_new_messaging_tier IS NOT NULL THEN
    UPDATE companies
       SET waba_messaging_tier   = p_new_messaging_tier,
           waba_last_verified_at = NOW(),
           updated_at            = NOW()
     WHERE id = v_company_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'company_id', v_company_id,
    'old_quality', v_old_quality_rating,
    'new_quality', p_new_quality_rating
  );
END;
$$;


--
-- Name: render_reminder_template(text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.render_reminder_template(p_template text, p_contact_id text, p_appointment_id uuid) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_out        text := p_template;
  v_contact    record;
  v_appt       record;
  v_doctor     text := '';
  v_ubicacion  text := '';
  v_motivo     text := '';
  v_fecha      text := '';
  v_hora       text := '';
  v_nombre     text := '';
BEGIN
  -- Contacto
  SELECT * INTO v_contact FROM public.contacts WHERE id = p_contact_id;
  IF v_contact.name IS NOT NULL AND length(trim(v_contact.name)) > 0 THEN
    v_nombre := split_part(v_contact.name, ' ', 1);
  END IF;

  -- Si hay cita, carga sus datos
  IF p_appointment_id IS NOT NULL THEN
    SELECT a.*, ag.name AS agenda_name, ag.location AS agenda_location
      INTO v_appt
      FROM public.appointments a
      LEFT JOIN public.agendas ag ON ag.id = a.agenda_id
      WHERE a.id = p_appointment_id;

    v_doctor    := COALESCE(v_appt.agenda_name, '');
    v_ubicacion := COALESCE(v_appt.agenda_location, '');
    v_motivo    := COALESCE(REPLACE(v_appt.notes, 'Motivo: ', ''), '');
    v_fecha     := to_char(v_appt.appointment_date, 'TMDay, DD "de" TMMonth');    -- "lunes, 12 de junio"
    v_hora      := to_char(v_appt.appointment_time, 'HH24:MI');
  END IF;

  -- Reemplazos
  v_out := REPLACE(v_out, '{nombre}',    v_nombre);
  v_out := REPLACE(v_out, '{fecha}',     v_fecha);
  v_out := REPLACE(v_out, '{hora}',      v_hora);
  v_out := REPLACE(v_out, '{doctor}',    v_doctor);
  v_out := REPLACE(v_out, '{ubicacion}', v_ubicacion);
  v_out := REPLACE(v_out, '{motivo}',    v_motivo);

  RETURN v_out;
END;
$$;


--
-- Name: FUNCTION render_reminder_template(p_template text, p_contact_id text, p_appointment_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.render_reminder_template(p_template text, p_contact_id text, p_appointment_id uuid) IS 'Resuelve variables {nombre}, {fecha}, {hora}, {doctor}, {ubicacion}, {motivo} en un template.';


--
-- Name: schedule_reminders_for_appointment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.schedule_reminders_for_appointment(p_appointment_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_appt    record;
  v_rule    record;
  v_when    timestamptz;
  v_buttons text;
  v_content text;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND OR v_appt.status = 'cancelled' THEN RETURN; END IF;

  FOR v_rule IN
    SELECT * FROM public.reminder_rules
    WHERE company_id = v_appt.company_id
      AND is_active = true
      AND trigger_source = 'appointment'
      AND (agenda_id IS NULL OR agenda_id = v_appt.agenda_id)
      AND (applies_to_status IS NULL OR v_appt.status = ANY(applies_to_status))
  LOOP
    -- Calcular cuándo se manda
    v_when := (v_appt.appointment_date::timestamp + v_appt.appointment_time::interval)
              AT TIME ZONE 'UTC'
              - make_interval(mins => v_rule.trigger_offset_minutes);

    -- No programar en pasado
    IF v_when <= now() THEN CONTINUE; END IF;

    -- Renderizar contenido
    v_content := public.render_reminder_template(v_rule.message_template, v_appt.patient_id, p_appointment_id);

    -- Agregar botones si aplica
    IF v_rule.include_action_buttons THEN
      v_buttons := E'\n\nResponde *CONFIRMO* para confirmar o *CANCELAR* para reagendar.';
      v_content := v_content || v_buttons;
    END IF;

    INSERT INTO public.reminder_queue (
      company_id, rule_id, appointment_id, contact_id,
      scheduled_at, status, rendered_content, channel
    )
    VALUES (
      v_appt.company_id, v_rule.id, p_appointment_id, v_appt.patient_id,
      v_when, 'pending', v_content, v_rule.channel
    );
  END LOOP;
END;
$$;


--
-- Name: set_company_trial_expiry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_company_trial_expiry() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    days_limit INT;
BEGIN
    -- Obtener los días por defecto de platform_settings
    SELECT default_trial_days INTO days_limit FROM platform_settings LIMIT 1;
    IF days_limit IS NULL THEN
        days_limit := 7; -- Fallback por seguridad
    END IF;
    
    -- Asignar la fecha de expiración sumando los días actuales
    NEW.trial_ends_at := NOW() + (days_limit || ' days')::INTERVAL;
    NEW.account_status := 'trial';
    RETURN NEW;
END;
$$;


--
-- Name: set_menu_item_public_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_menu_item_public_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.public_slug IS NULL OR NEW.public_slug = '' THEN
    NEW.public_slug :=
      trim(both '-' from
        regexp_replace(lower(coalesce(NEW.name, 'platillo')), '[^a-z0-9]+', '-', 'g')
        || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6)
      );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_property_public_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_property_public_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.public_slug IS NULL OR NEW.public_slug = '' THEN
    -- slug legible del título + sufijo corto único
    NEW.public_slug :=
      regexp_replace(
        lower(coalesce(NEW.title, 'propiedad')),
        '[^a-z0-9]+', '-', 'g'
      ) || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6);
    -- limpiar guiones sobrantes al inicio/fin
    NEW.public_slug := trim(both '-' from NEW.public_slug);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;


--
-- Name: storage_path_company_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_path_company_id(p_name text) RETURNS uuid
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  first_segment TEXT;
  result UUID;
BEGIN
  first_segment := (storage.foldername(p_name))[1];
  IF first_segment IS NULL OR first_segment = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    result := first_segment::UUID;
    RETURN result;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END;
$$;


--
-- Name: FUNCTION storage_path_company_id(p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.storage_path_company_id(p_name text) IS 'Extrae el primer segmento del path de storage como UUID. Retorna NULL si no es UUID válido.';


--
-- Name: touch_session(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_session(p_company_id uuid, p_contact_ref text, p_channel text DEFAULT 'whatsapp'::text) RETURNS TABLE(session_id uuid, is_new_session boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session   usage_sessions%ROWTYPE;
BEGIN
  -- Buscar sesión activa (último mensaje hace menos de 24h)
  SELECT * INTO v_session
  FROM usage_sessions
  WHERE company_id = p_company_id
    AND contact_ref = p_contact_ref
    AND last_msg_at > (NOW() - INTERVAL '24 hours')
  ORDER BY last_msg_at DESC
  LIMIT 1;

  IF v_session.id IS NOT NULL THEN
    -- Extender la sesión existente
    UPDATE usage_sessions
    SET last_msg_at = NOW(), msg_count = msg_count + 1
    WHERE id = v_session.id;

    RETURN QUERY SELECT v_session.id, FALSE;
  ELSE
    -- Abrir sesión nueva
    INSERT INTO usage_sessions (company_id, contact_ref, channel)
    VALUES (p_company_id, p_contact_ref, p_channel)
    RETURNING id INTO v_session.id;

    RETURN QUERY SELECT v_session.id, TRUE;
  END IF;
END;
$$;


--
-- Name: FUNCTION touch_session(p_company_id uuid, p_contact_ref text, p_channel text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.touch_session(p_company_id uuid, p_contact_ref text, p_channel text) IS 'Abre o extiende una sesión de 24h para un contacto. El workflow n8n la llama en cada mensaje entrante. is_new_session=true cuando consume del límite.';


--
-- Name: touch_tags_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_tags_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;


--
-- Name: touch_waitlist_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_waitlist_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;


--
-- Name: track_message_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_message_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.sender = 'patient' THEN
    UPDATE public.contacts
       SET last_inbound_at = COALESCE(NEW.created_at, now()),
           recovery_status = CASE
             WHEN recovery_status = 'pending_followup' THEN 'recovered'
             ELSE recovery_status
           END
     WHERE id = NEW.patient_id;
  ELSE
    -- 'asistente' (IA) o 'admin' (humano)
    UPDATE public.contacts
       SET last_outbound_at = COALESCE(NEW.created_at, now())
     WHERE id = NEW.patient_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_companies_autogenerate_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_companies_autogenerate_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Solo generar si slug está vacío o NULL
  IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
    NEW.slug := generate_unique_company_slug(NEW.name, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_hubspot_integrations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_hubspot_integrations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: trg_invoice_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_invoice_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: trg_log_manual_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_log_manual_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Solo loggea mensajes salientes de operador humano (no del bot)
  IF NEW.sender = 'admin' AND NEW.company_id IS NOT NULL THEN
    PERFORM public.log_operator_action(
      NEW.company_id,
      NULLIF(NEW.admin_user_id, NULL),  -- admin_user_id puede no existir si la columna no está
      'message_sent_manual',
      'message',
      NEW.id::TEXT,
      'Mensaje enviado manualmente al contacto ' || COALESCE(NEW.patient_id, 'desconocido'),
      jsonb_build_object(
        'patient_id',    NEW.patient_id,
        'content_length', LENGTH(COALESCE(NEW.content, '')),
        'message_type',  COALESCE(NEW.message_type, 'text')
      )
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Si falla audit, no romper el insert del mensaje
  RAISE WARNING 'trg_log_manual_message audit failed: %', SQLERRM;
  RETURN NEW;
END;
$$;


--
-- Name: trg_orders_explode_items(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_explode_items() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  item        jsonb;
  v_name      text;
  v_qty       integer;
  v_price     numeric;
  v_subtotal  numeric;
  v_menu_id   uuid;
BEGIN
  -- Solo re-explotar si items cambió (o es insert)
  IF TG_OP = 'UPDATE' AND NEW.items IS NOT DISTINCT FROM OLD.items THEN
    RETURN NEW;
  END IF;

  -- Borrar las filas viejas de esta orden (re-sync completo)
  DELETE FROM order_items WHERE order_id = NEW.id;

  -- Recorrer el JSON de items
  IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      -- Nombre: acepta item_name o name
      v_name := COALESCE(item->>'item_name', item->>'name', 'Item');
      -- Cantidad: acepta quantity o qty
      v_qty := COALESCE((item->>'quantity')::integer, (item->>'qty')::integer, 1);
      -- Precio: acepta unit_price o price
      v_price := COALESCE((item->>'unit_price')::numeric, (item->>'price')::numeric, 0);
      -- Subtotal: si viene lo usa, si no calcula
      v_subtotal := COALESCE((item->>'subtotal')::numeric, v_price * v_qty);

      -- Intentar linkear con menu_items:
      --   1. Si el JSON trae menu_item_id, úsalo
      --   2. Si no, buscar por nombre (case-insensitive) en el menú de la company
      v_menu_id := NULL;
      IF item ? 'menu_item_id' AND (item->>'menu_item_id') <> '' THEN
        BEGIN
          v_menu_id := (item->>'menu_item_id')::uuid;
        EXCEPTION WHEN others THEN
          v_menu_id := NULL;
        END;
      END IF;

      IF v_menu_id IS NULL THEN
        SELECT id INTO v_menu_id
        FROM menu_items
        WHERE company_id = NEW.company_id
          AND lower(name) = lower(v_name)
        LIMIT 1;
      END IF;

      INSERT INTO order_items (
        order_id, company_id, menu_item_id, item_name, quantity, unit_price, subtotal
      ) VALUES (
        NEW.id, NEW.company_id, v_menu_id, v_name, v_qty, v_price, v_subtotal
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_orders_sync_mirror_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_sync_mirror_columns() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- ── Nombre ──
  -- Si cambió customer_name (workflow) y no contact_name, copiar a contact_name
  IF NEW.customer_name IS DISTINCT FROM OLD.customer_name
     AND NEW.contact_name IS NOT DISTINCT FROM OLD.contact_name THEN
    NEW.contact_name := NEW.customer_name;
  -- Si cambió contact_name (app), copiar a customer_name
  ELSIF NEW.contact_name IS DISTINCT FROM OLD.contact_name THEN
    NEW.customer_name := NEW.contact_name;
  END IF;

  -- ── Teléfono ──
  IF NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
     AND NEW.contact_phone IS NOT DISTINCT FROM OLD.contact_phone THEN
    NEW.contact_phone := NEW.customer_phone;
  ELSIF NEW.contact_phone IS DISTINCT FROM OLD.contact_phone THEN
    NEW.customer_phone := NEW.contact_phone;
  END IF;

  -- ── Status ──
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status_semantic IS NOT DISTINCT FROM OLD.status_semantic THEN
    NEW.status_semantic := NEW.status;
  ELSIF NEW.status_semantic IS DISTINCT FROM OLD.status_semantic THEN
    NEW.status := NEW.status_semantic;
  END IF;

  -- status_changed_at se actualiza si cambió el estado
  IF NEW.status_semantic IS DISTINCT FROM OLD.status_semantic THEN
    NEW.status_changed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_orders_sync_mirror_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_sync_mirror_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Nombre: el que venga lleno llena al otro
  IF NEW.contact_name IS NULL AND NEW.customer_name IS NOT NULL THEN
    NEW.contact_name := NEW.customer_name;
  ELSIF NEW.customer_name IS NULL AND NEW.contact_name IS NOT NULL THEN
    NEW.customer_name := NEW.contact_name;
  END IF;

  -- Teléfono
  IF NEW.contact_phone IS NULL AND NEW.customer_phone IS NOT NULL THEN
    NEW.contact_phone := NEW.customer_phone;
  ELSIF NEW.customer_phone IS NULL AND NEW.contact_phone IS NOT NULL THEN
    NEW.customer_phone := NEW.contact_phone;
  END IF;

  -- Status: si viene 'status' (workflow) úsalo, si no usa status_semantic
  IF NEW.status IS NOT NULL AND (NEW.status_semantic IS NULL OR NEW.status_semantic = 'received') THEN
    NEW.status_semantic := NEW.status;
  ELSIF NEW.status IS NULL THEN
    NEW.status := COALESCE(NEW.status_semantic, 'received');
  END IF;

  IF NEW.status_changed_at IS NULL THEN
    NEW.status_changed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_orders_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_orders_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: trg_services_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_services_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: uninstall_template(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uninstall_template(p_company_id uuid, p_template_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.company_templates
     WHERE company_id = p_company_id AND template_id = p_template_id AND is_primary = true
  ) THEN
    RAISE EXCEPTION 'No se puede desinstalar el template primario. Marca otro como primario primero.';
  END IF;

  DELETE FROM public.company_templates
   WHERE company_id = p_company_id AND template_id = p_template_id;
END;
$$;


--
-- Name: user_belongs_to_company(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_belongs_to_company(p_company_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND company_id = p_company_id
  );
$$;


--
-- Name: FUNCTION user_belongs_to_company(p_company_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.user_belongs_to_company(p_company_id uuid) IS 'Verifica si el user autenticado pertenece a una company. SECURITY DEFINER para bypasear RLS de profiles cuando se llama desde policies de storage.';


--
-- Name: validate_rfc(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_rfc(p_rfc text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
DECLARE
  v_rfc TEXT;
  v_is_persona_moral BOOLEAN;
  v_is_persona_fisica BOOLEAN;
BEGIN
  IF p_rfc IS NULL OR LENGTH(TRIM(p_rfc)) = 0 THEN
    RETURN jsonb_build_object('valid', FALSE, 'error', 'RFC vacío');
  END IF;

  v_rfc := UPPER(TRIM(p_rfc));

  -- Persona Moral: 3 letras + 6 dígitos + 3 alfanuméricos
  v_is_persona_moral := v_rfc ~ '^[A-Z&Ñ]{3}[0-9]{6}[A-Z0-9]{3}$';

  -- Persona Física: 4 letras + 6 dígitos + 3 alfanuméricos
  v_is_persona_fisica := v_rfc ~ '^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$';

  IF NOT (v_is_persona_moral OR v_is_persona_fisica) THEN
    RETURN jsonb_build_object('valid', FALSE, 'error', 'Formato de RFC inválido');
  END IF;

  -- RFCs genéricos válidos
  IF v_rfc IN ('XAXX010101000', 'XEXX010101000') THEN
    RETURN jsonb_build_object(
      'valid', TRUE,
      'type',  'generic',
      'description', CASE WHEN v_rfc = 'XAXX010101000' THEN 'Público en general' ELSE 'Extranjero sin RFC' END
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'type',  CASE WHEN v_is_persona_moral THEN 'moral' ELSE 'fisica' END,
    'rfc',   v_rfc
  );
END;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    patient_id text,
    appointment_date date NOT NULL,
    appointment_time time without time zone NOT NULL,
    status text DEFAULT 'scheduled'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    agenda_id uuid,
    google_event_id text,
    duration_minutes integer DEFAULT 30 NOT NULL,
    notes text,
    cancelled_at timestamp with time zone,
    cancelled_reason text,
    rescheduled_count integer DEFAULT 0 NOT NULL,
    source text DEFAULT 'unknown'::text NOT NULL,
    no_show_reason text,
    no_show_reason_captured_at timestamp with time zone,
    rescheduled_at timestamp with time zone,
    patient_name text,
    patient_phone text,
    staff_id uuid,
    CONSTRAINT appointments_source_check CHECK ((source = ANY (ARRAY['ai_bot'::text, 'widget_public'::text, 'manual_dashboard'::text, 'unknown'::text])))
);


--
-- Name: COLUMN appointments.google_event_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.appointments.google_event_id IS 'ID del evento en Google Calendar. NULL = no sincronizado (cita pre-sprint o agenda sin Google).';


--
-- Name: COLUMN appointments.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.appointments.source IS 'De dónde nació la cita: ai_bot, widget_public, manual_dashboard o unknown.';


--
-- Name: COLUMN appointments.no_show_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.appointments.no_show_reason IS 'Razón por la que el paciente no se presentó. Texto libre. Sugerencias en UI: olvidó, trabajo, enfermedad, transporte, no_quiso, otro.';


--
-- Name: COLUMN appointments.no_show_reason_captured_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.appointments.no_show_reason_captured_at IS 'Cuándo se capturó la razón (manualmente por el operador o por respuesta del paciente vía bot).';


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    company_id uuid,
    name text,
    phone text,
    external_id text NOT NULL,
    platform public.channel_platform DEFAULT 'whatsapp'::public.channel_platform,
    bot_active boolean DEFAULT true,
    status text DEFAULT 'lead'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    assigned_to uuid,
    chat_status text DEFAULT 'open'::text,
    lifecycle_stage text DEFAULT 'new_lead'::text,
    unread_count integer DEFAULT 0,
    symptoms text,
    notes text,
    custom_data jsonb DEFAULT '{}'::jsonb,
    ai_active boolean DEFAULT true NOT NULL,
    gender text,
    staff_id uuid,
    birth_date date,
    stage_updated_by text DEFAULT 'system'::text,
    stage_updated_at timestamp with time zone,
    last_inbound_at timestamp with time zone,
    last_outbound_at timestamp with time zone,
    follow_up_sent_at timestamp with time zone,
    follow_up_count integer DEFAULT 0,
    recovery_status text DEFAULT 'none'::text,
    referral_source text,
    referred_by_contact_id text,
    source text,
    email text,
    last_appointment_at timestamp with time zone,
    opted_out boolean DEFAULT false,
    opted_out_at timestamp with time zone,
    opted_out_reason text,
    opted_out_keyword text,
    hubspot_id text,
    source_external_id text,
    external_updated_at timestamp with time zone,
    avatar_url text,
    CONSTRAINT contacts_recovery_status_check CHECK ((recovery_status = ANY (ARRAY['none'::text, 'pending_followup'::text, 'recovered'::text, 'lost'::text]))),
    CONSTRAINT contacts_referral_source_check CHECK (((referral_source IS NULL) OR (referral_source = ANY (ARRAY['patient'::text, 'doctor'::text, 'google'::text, 'facebook'::text, 'instagram'::text, 'direct'::text, 'event'::text, 'other'::text])))),
    CONSTRAINT contacts_stage_updated_by_check CHECK ((stage_updated_by = ANY (ARRAY['system'::text, 'ai'::text, 'human'::text]))),
    CONSTRAINT patients_chat_status_check CHECK ((chat_status = ANY (ARRAY['open'::text, 'closed'::text, 'snoozed'::text]))),
    CONSTRAINT patients_lifecycle_stage_check CHECK ((lifecycle_stage = ANY (ARRAY['new_lead'::text, 'hot_lead'::text, 'payment'::text, 'customer'::text])))
);

ALTER TABLE ONLY public.contacts REPLICA IDENTITY FULL;


--
-- Name: COLUMN contacts.referral_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.referral_source IS 'De dónde vino el paciente: patient (otro paciente), doctor, google, facebook, instagram, direct (recomendación directa), event, other.';


--
-- Name: COLUMN contacts.referred_by_contact_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.referred_by_contact_id IS 'Si referral_source=patient, FK al contacto que lo refirió. NULL en otros casos.';


--
-- Name: COLUMN contacts.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.source IS 'De dónde viene este contacto: manual, whatsapp, instagram, messenger, hubspot, api, import_csv';


--
-- Name: COLUMN contacts.hubspot_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.hubspot_id IS 'ID del contacto en HubSpot CRM. Usado para deduplicación y sync bidireccional.';


--
-- Name: COLUMN contacts.external_updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contacts.external_updated_at IS 'Timestamp de última modificación en el sistema externo (HubSpot lastmodifieddate). Se usa para sync incremental.';


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    patient_id text NOT NULL,
    content text,
    sender text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    whatsapp_mid text,
    message_type text DEFAULT 'text'::text NOT NULL,
    media_url text,
    media_caption text,
    channel text,
    CONSTRAINT messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'audio'::text, 'image'::text, 'other'::text])))
);


--
-- Name: COLUMN messages.message_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.messages.message_type IS 'Tipo de contenido: text (default), audio (transcripción + URL), image (descripción + URL), other (no procesado).';


--
-- Name: COLUMN messages.media_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.messages.media_url IS 'URL pública en Supabase Storage del audio o imagen original. NULL para text.';


--
-- Name: COLUMN messages.media_caption; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.messages.media_caption IS 'Caption original que el paciente envió con la imagen (si lo hubo).';


--
-- Name: reminder_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    rule_id uuid,
    appointment_id uuid,
    contact_id text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    rendered_content text,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    patient_response text,
    patient_responded_at timestamp with time zone,
    patient_response_message text,
    attempts integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    sent_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reminder_queue_patient_response_check CHECK ((patient_response = ANY (ARRAY['confirmed'::text, 'cancelled'::text, 'other'::text]))),
    CONSTRAINT reminder_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'cancelled'::text, 'skipped'::text])))
);


--
-- Name: TABLE reminder_queue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reminder_queue IS 'Cola de recordatorios programados, enviados, fallidos. Fuente única de verdad para el cron de n8n.';


--
-- Name: COLUMN reminder_queue.rule_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminder_queue.rule_id IS 'Regla origen del recordatorio. NULL = recordatorio manual one-shot creado desde el calendar.';


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    meta_token text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    doctor_name text,
    contact_email text,
    contact_phone text,
    address text,
    plan_type text DEFAULT 'personal'::text NOT NULL,
    stripe_customer_id text,
    subscription_status text DEFAULT 'inactive'::text NOT NULL,
    subscription_start_date timestamp with time zone,
    business_phone_id text,
    ai_tone text DEFAULT 'warm'::text,
    ai_emojis boolean DEFAULT false,
    ai_length text DEFAULT 'concise'::text,
    ai_fallback_message text DEFAULT 'Lo siento, estoy teniendo un problema técnico.'::text,
    system_prompt text,
    stripe_subscription_id text,
    trial_ends_at timestamp with time zone,
    account_status text DEFAULT 'trial'::text,
    agent_mode text DEFAULT 'per_staff'::text,
    plan_slug text DEFAULT 'start'::text NOT NULL,
    onboarding_completed boolean DEFAULT false,
    onboarding_finished_at timestamp with time zone,
    onboarding_step integer DEFAULT 0,
    selected_plan_slug text,
    trial_starts_at timestamp with time zone DEFAULT now(),
    subscription_started_at timestamp with time zone,
    current_period_ends_at timestamp with time zone,
    billing_cycle text DEFAULT 'monthly'::text,
    waba_id text,
    waba_display_phone text,
    waba_verified_name text,
    waba_quality_rating text,
    waba_messaging_tier text DEFAULT 'TIER_TEST'::text,
    waba_last_verified_at timestamp with time zone,
    waba_connected_at timestamp with time zone,
    meta_business_verified boolean DEFAULT false,
    system_user_access_token text,
    tax_rfc text,
    tax_legal_name text,
    tax_regime_code text,
    tax_address_zip text,
    tax_use_cfdi text DEFAULT 'G03'::text,
    invoice_email text,
    requires_invoice boolean DEFAULT false,
    tax_data_verified_at timestamp with time zone,
    slug text,
    logo_url text,
    description text,
    tagline text,
    primary_color text DEFAULT '#0f172a'::text,
    secondary_color text DEFAULT '#64748b'::text,
    phone_e164 text,
    website text,
    public_directory_settings jsonb DEFAULT '{}'::jsonb,
    tax_rate numeric DEFAULT 0.16,
    delivery_fee_default numeric DEFAULT 0,
    tip_suggestions jsonb DEFAULT '[10, 15, 20]'::jsonb,
    min_order_amount numeric,
    order_statuses jsonb DEFAULT '[{"name": "Recibida", "step": 0, "semantic": "received"}, {"name": "En preparación", "step": 1, "semantic": "preparing"}, {"name": "Lista", "step": 2, "semantic": "ready"}, {"name": "Entregada", "step": 3, "semantic": "delivered"}]'::jsonb,
    order_auto_simulate boolean DEFAULT false,
    order_enable_tracking boolean DEFAULT true,
    fb_page_id text,
    ig_account_id text,
    fb_page_name text,
    ig_username text,
    CONSTRAINT companies_agent_mode_check CHECK ((agent_mode = ANY (ARRAY['general'::text, 'per_staff'::text]))),
    CONSTRAINT companies_billing_cycle_check CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'yearly'::text]))),
    CONSTRAINT companies_messaging_tier_check CHECK (((waba_messaging_tier IS NULL) OR (waba_messaging_tier = ANY (ARRAY['TIER_TEST'::text, 'TIER_250'::text, 'TIER_1K'::text, 'TIER_10K'::text, 'TIER_100K'::text, 'UNLIMITED'::text])))),
    CONSTRAINT companies_quality_rating_check CHECK (((waba_quality_rating IS NULL) OR (waba_quality_rating = ANY (ARRAY['GREEN'::text, 'YELLOW'::text, 'RED'::text, 'UNKNOWN'::text]))))
);


--
-- Name: COLUMN companies.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.slug IS 'Identificador URL-friendly único de la company. Usado para ianswer.pro/p/{slug}. Se autogenera del name si está vacío.';


--
-- Name: COLUMN companies.logo_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.logo_url IS 'URL pública del logo en el bucket branding. Mostrado en el directorio público y OG image.';


--
-- Name: COLUMN companies.tagline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.tagline IS 'Frase corta opcional bajo el nombre en la página pública (ej. "Tu hogar te espera").';


--
-- Name: COLUMN companies.phone_e164; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.phone_e164 IS 'Número de WhatsApp en formato E.164 (sin +) usado por el botón flotante del directorio público. Ej. 5219991234567.';


--
-- Name: COLUMN companies.public_directory_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.public_directory_settings IS 'Configuración adicional del directorio público en formato JSON. Campos opcionales: { whatsapp_message_template, show_address, show_amenities, hide_status_apartada, custom_footer_text }';


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id integer DEFAULT 1 NOT NULL,
    name text DEFAULT '42 LABS'::text,
    logo_url text,
    description text,
    legal_settings jsonb DEFAULT '{"legal_name": "", "minimum_age": "18", "website_url": "https://...", "data_purpose": "Crear el perfil de usuario, vincular WhatsApp y habilitar las funciones de IA.", "support_email": "", "data_collected": "Nombre, email, foto de perfil (vía Meta/Facebook Login).", "payment_processor": "Stripe", "third_party_services": "Supabase (Hosting y BD), OpenAI/Anthropic (Procesamiento IA).", "deletion_instructions": "Envía un correo a soporte o usa el botón Eliminar Cuenta en la Configuración de tu perfil."}'::jsonb,
    icon_url text,
    google_service_account text DEFAULT 'ianswer@asistente-494806.iam.gserviceaccount.com'::text,
    n8n_webhook_calendar text,
    n8n_webhook_whatsapp text,
    n8n_webhook_whatsapp_admin text,
    n8n_webhook_calendar_verify text,
    default_trial_days integer DEFAULT 7,
    favicon_url text,
    og_image_url text,
    n8n_webhook_widget text,
    n8n_webhook_follow_up_24h text,
    n8n_workflow_calendar_json text,
    n8n_workflow_calendar_verify_json text,
    n8n_workflow_whatsapp_json text,
    n8n_workflow_whatsapp_admin_json text,
    n8n_workflow_widget_json text,
    n8n_workflow_follow_up_24h_json text,
    n8n_webhook_cancel_appointment text,
    n8n_webhook_reschedule_appointment text,
    n8n_workflow_cancel_json text,
    n8n_workflow_reschedule_json text,
    reminder_cron_interval_minutes integer DEFAULT 5 NOT NULL,
    reminder_max_attempts integer DEFAULT 3 NOT NULL,
    reminder_last_run_at timestamp with time zone,
    n8n_webhook_reminder_processor text,
    n8n_workflow_reminder_json text,
    n8n_webhook_url_menu text,
    n8n_webhook_url_propiedades text,
    n8n_webhook_url_orders text,
    CONSTRAINT platform_settings_id_check CHECK ((id = 1))
);


--
-- Name: COLUMN platform_settings.n8n_webhook_url_menu; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_settings.n8n_webhook_url_menu IS 'URL pública del workflow n8n Tool: Menú Restaurante';


--
-- Name: COLUMN platform_settings.n8n_webhook_url_propiedades; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_settings.n8n_webhook_url_propiedades IS 'URL pública del workflow n8n Tool: Propiedades Inmobiliaria';


--
-- Name: COLUMN platform_settings.n8n_webhook_url_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_settings.n8n_webhook_url_orders IS 'URL pública del workflow n8n Tool: Órdenes Restaurante';


--
-- Name: contact_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_tags (
    contact_id text NOT NULL,
    tag_id uuid NOT NULL,
    assigned_by text DEFAULT 'human'::text NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_tags_assigned_by_check CHECK ((assigned_by = ANY (ARRAY['human'::text, 'ai'::text, 'import'::text])))
);


--
-- Name: TABLE contact_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contact_tags IS 'Asignación de tags a contactos. assigned_by audita si fue puesta por humano, bot o import.';


--
-- Name: tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3b82f6'::text NOT NULL,
    description text,
    ai_aware boolean DEFAULT false NOT NULL,
    ai_context text,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tags IS 'Etiquetas personalizables por compañía. Algunas pueden marcarse como ai_aware para que el bot las lea al responder.';


--
-- Name: COLUMN tags.ai_aware; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tags.ai_aware IS 'Si true, el bot recibe esta tag y su ai_context cuando responde a un contacto que la tiene.';


--
-- Name: COLUMN tags.ai_context; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tags.ai_context IS 'Instrucción al bot. Ej: "Paciente diabético — confirmar ayuno antes de citas que lo requieran".';


--
-- Name: reminder_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    agenda_id uuid,
    name text NOT NULL,
    description text,
    trigger_source text NOT NULL,
    trigger_offset_minutes integer DEFAULT 0 NOT NULL,
    applies_to_status text[] DEFAULT ARRAY['confirmed'::text, 'scheduled'::text],
    applies_to_lifecycle_stage text[] DEFAULT ARRAY['hot_lead'::text, 'payment'::text],
    message_template text NOT NULL,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    include_action_buttons boolean DEFAULT false NOT NULL,
    auto_respond_to_actions boolean DEFAULT true NOT NULL,
    response_on_confirm text DEFAULT 'Perfecto, te esperamos. ¡Gracias por confirmar!'::text,
    response_on_cancel text DEFAULT 'Entendido, cancelamos tu cita. Cuando quieras, escríbenos para reagendar.'::text,
    is_active boolean DEFAULT true NOT NULL,
    vertical_source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reminder_rules_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'sms'::text, 'email'::text]))),
    CONSTRAINT reminder_rules_trigger_source_check CHECK ((trigger_source = ANY (ARRAY['appointment'::text, 'contact_inactivity'::text, 'specific_datetime'::text])))
);


--
-- Name: TABLE reminder_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reminder_rules IS 'Reglas configurables que generan recordatorios automáticos en la queue.';


--
-- Name: COLUMN reminder_rules.agenda_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminder_rules.agenda_id IS 'NULL = la regla aplica a TODAS las agendas. Con valor = solo esa agenda.';


--
-- Name: COLUMN reminder_rules.trigger_offset_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.reminder_rules.trigger_offset_minutes IS 'Para appointment: minutos antes (+) o después (-) de la cita. Para contact_inactivity: minutos sin actividad para disparar.';


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    due_at timestamp with time zone,
    completed_at timestamp with time zone,
    contact_id text,
    assigned_to uuid,
    created_by uuid,
    priority text DEFAULT 'normal'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text])))
);


--
-- Name: TABLE tasks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tasks IS 'Tareas internas del operador. NO se envían al paciente. Pueden estar ancladas a un contacto y/o asignadas a staff.';


--
-- Name: team; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    full_name text NOT NULL,
    specialty text DEFAULT ''::text,
    medical_license text DEFAULT ''::text,
    bio_for_ai text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    gender text DEFAULT 'M'::text,
    title text DEFAULT 'Dr.'::text,
    custom_data jsonb DEFAULT '{}'::jsonb,
    ai_tone text DEFAULT 'warm'::text,
    ai_emojis boolean DEFAULT false,
    ai_length text DEFAULT 'concise'::text,
    ai_fallback_message text DEFAULT 'Lo siento, tuve un problema. ¿Me indicas qué necesitas?'::text,
    system_prompt text,
    ai_identity text DEFAULT 'bot'::text,
    ai_name text DEFAULT 'Asistente Virtual'::text,
    ai_proactivity text DEFAULT 'proactive'::text,
    ai_medical_disclaimer boolean DEFAULT true,
    avatar_url text,
    email text,
    phone text,
    color text DEFAULT '#4f46e5'::text,
    short_bio text,
    tags jsonb DEFAULT '[]'::jsonb,
    languages jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    subspecialty text DEFAULT ''::text,
    studies text DEFAULT ''::text,
    years_experience integer,
    insurances_accepted jsonb DEFAULT '[]'::jsonb,
    realtor_license text DEFAULT ''::text,
    property_specialties jsonb DEFAULT '[]'::jsonb,
    zones_covered jsonb DEFAULT '[]'::jsonb,
    "position" text DEFAULT ''::text,
    shift text DEFAULT ''::text,
    certifications jsonb DEFAULT '[]'::jsonb,
    portfolio_url text DEFAULT ''::text,
    extra_fields jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    ai_forbidden_phrases text,
    ai_greeting text,
    ai_farewell text,
    ai_formality text DEFAULT 'auto'::text,
    ai_availability_note text,
    team_name text,
    CONSTRAINT team_ai_identity_check CHECK ((ai_identity = ANY (ARRAY['doctor'::text, 'assistant'::text, 'bot'::text]))),
    CONSTRAINT team_ai_proactivity_check CHECK ((ai_proactivity = ANY (ARRAY['proactive'::text, 'reactive'::text])))
);


--
-- Name: COLUMN team.ai_forbidden_phrases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team.ai_forbidden_phrases IS 'Frases o cosas que el agente NUNCA debe decir. Una por línea. Se inyecta como prohibición al prompt.';


--
-- Name: COLUMN team.ai_greeting; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team.ai_greeting IS 'Saludo personalizado / primer mensaje del agente.';


--
-- Name: COLUMN team.ai_farewell; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team.ai_farewell IS 'Despedida personalizada al cerrar conversaciones.';


--
-- Name: COLUMN team.ai_formality; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team.ai_formality IS 'Nivel de formalidad: auto | tu | usted. Fuerza el trato explícitamente.';


--
-- Name: COLUMN team.ai_availability_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team.ai_availability_note IS 'Qué dice el agente sobre disponibilidad: horario del bot vs cuándo contesta un humano.';


--
-- Name: agendas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agendas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bot_id uuid,
    type text NOT NULL,
    name text NOT NULL,
    schedule_rules text,
    google_calendar_id text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    company_id uuid,
    is_verified boolean DEFAULT false,
    location_id uuid,
    staff_id uuid,
    room_name text
);


--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    contact_id text NOT NULL,
    agenda_id uuid,
    preferred_date_from date,
    preferred_date_to date,
    preferred_time_of_day text DEFAULT 'any'::text NOT NULL,
    notes text,
    status text DEFAULT 'active'::text NOT NULL,
    notified_at timestamp with time zone,
    notified_slot_date date,
    notified_slot_time time without time zone,
    notified_agenda_id uuid,
    expires_at timestamp with time zone DEFAULT (now() + '60 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT waitlist_preferred_time_of_day_check CHECK ((preferred_time_of_day = ANY (ARRAY['morning'::text, 'afternoon'::text, 'evening'::text, 'any'::text]))),
    CONSTRAINT waitlist_status_check CHECK ((status = ANY (ARRAY['active'::text, 'notified'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'archived'::text])))
);


--
-- Name: TABLE waitlist; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.waitlist IS 'Lista de espera: pacientes que quieren cita pero no hay slot, listos para ser notificados cuando se libere uno.';


--
-- Name: addons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addons (
    id text NOT NULL,
    name text NOT NULL,
    short_name text,
    description text,
    category text NOT NULL,
    icon text DEFAULT 'Sparkles'::text NOT NULL,
    price_monthly_cents integer DEFAULT 0 NOT NULL,
    price_one_time_cents integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'MXN'::text NOT NULL,
    stripe_price_id text,
    is_recurring boolean DEFAULT true NOT NULL,
    is_one_time boolean DEFAULT false NOT NULL,
    feature_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    capacity_grants jsonb DEFAULT '{}'::jsonb NOT NULL,
    requires_plan_min text,
    requires_template text,
    is_active boolean DEFAULT true NOT NULL,
    is_featured boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    available_for_templates text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT addons_category_check CHECK ((category = ANY (ARRAY['channel'::text, 'ai'::text, 'feature'::text, 'service'::text, 'support'::text, 'capacity'::text]))),
    CONSTRAINT addons_check CHECK ((is_recurring OR is_one_time)),
    CONSTRAINT addons_price_monthly_cents_check CHECK ((price_monthly_cents >= 0)),
    CONSTRAINT addons_price_one_time_cents_check CHECK ((price_one_time_cents >= 0)),
    CONSTRAINT addons_requires_plan_min_check CHECK ((requires_plan_min = ANY (ARRAY['start'::text, 'growth'::text, 'scale'::text])))
);


--
-- Name: TABLE addons; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.addons IS 'Catálogo de extras vendibles. Pueden ser recurrentes (subs) o pagos únicos.';


--
-- Name: COLUMN addons.feature_flags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.addons.feature_flags IS 'Features que se prenden cuando el addon está activo. Ej: { "ai_premium_model": true }';


--
-- Name: COLUMN addons.capacity_grants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.addons.capacity_grants IS 'Capacidad numérica que se suma al plan base. Ej: { "max_sessions_per_month": 5000 }';


--
-- Name: appointment_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    appointment_id uuid NOT NULL,
    company_id uuid,
    patient_id text,
    action text NOT NULL,
    old_date date,
    old_time time without time zone,
    new_date date,
    new_time time without time zone,
    old_status text,
    new_status text,
    reason text,
    actor text DEFAULT 'system'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT appointment_history_action_check CHECK ((action = ANY (ARRAY['created'::text, 'rescheduled'::text, 'cancelled'::text, 'completed'::text, 'no_show'::text]))),
    CONSTRAINT appointment_history_actor_check CHECK ((actor = ANY (ARRAY['ai'::text, 'human'::text, 'system'::text])))
);


--
-- Name: bot_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bot_locks (
    id bigint NOT NULL,
    company_id uuid NOT NULL,
    clave text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE bot_locks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bot_locks IS 'Candado de concurrencia del bot: garantiza una sola respuesta por mensaje entrante, aunque n8n ejecute en paralelo.';


--
-- Name: bot_locks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bot_locks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bot_locks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bot_locks_id_seq OWNED BY public.bot_locks.id;


--
-- Name: bots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    business_phone_id text NOT NULL,
    name text NOT NULL,
    system_prompt text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    ai_tone text DEFAULT 'warm'::text,
    ai_emojis boolean DEFAULT false,
    ai_length text DEFAULT 'concise'::text,
    ai_fallback_message text DEFAULT 'Lamento el inconveniente, estoy teniendo una pequeña demora técnica. ¿Me podrías indicar qué necesitas y le paso tu solicitud al equipo para atenderte personalmente?'::text
);


--
-- Name: companies_with_trial_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.companies_with_trial_status AS
 SELECT id,
    name,
    meta_token,
    created_at,
    doctor_name,
    contact_email,
    contact_phone,
    address,
    plan_type,
    stripe_customer_id,
    subscription_status,
    subscription_start_date,
    business_phone_id,
    ai_tone,
    ai_emojis,
    ai_length,
    ai_fallback_message,
    system_prompt,
    stripe_subscription_id,
    trial_ends_at,
    account_status,
    agent_mode,
    plan_slug,
    onboarding_completed,
    onboarding_finished_at,
    onboarding_step,
    selected_plan_slug,
    trial_starts_at,
    subscription_started_at,
    current_period_ends_at,
    billing_cycle,
        CASE
            WHEN (subscription_status = 'active'::text) THEN 'active'::text
            WHEN (subscription_status = 'canceled'::text) THEN 'canceled'::text
            WHEN (subscription_status = 'past_due'::text) THEN 'past_due'::text
            WHEN (trial_ends_at IS NULL) THEN 'no_trial'::text
            WHEN (trial_ends_at < now()) THEN 'trial_expired'::text
            WHEN (trial_ends_at < (now() + '3 days'::interval)) THEN 'trial_ending_soon'::text
            ELSE 'trialing'::text
        END AS effective_status,
    (GREATEST((0)::numeric, (EXTRACT(epoch FROM (trial_ends_at - now())) / (86400)::numeric)))::integer AS trial_days_remaining
   FROM public.companies c;


--
-- Name: company_addons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_addons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    addon_id text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    stripe_subscription_item_id text,
    stripe_invoice_id text,
    stripe_checkout_session_id text,
    activated_at timestamp with time zone,
    current_period_end timestamp with time zone,
    canceled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT company_addons_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT company_addons_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'expired'::text])))
);


--
-- Name: company_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    template_id text NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    installed_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE company_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_templates IS 'Templates instalados por cada company. Uno es is_primary=true (define colores/labels).';


--
-- Name: contact_opt_outs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_opt_outs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    external_id text NOT NULL,
    contact_id text,
    action text NOT NULL,
    source text NOT NULL,
    keyword text,
    reason text,
    triggered_by uuid,
    message_id text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT contact_opt_outs_action_check CHECK ((action = ANY (ARRAY['opt_out'::text, 'opt_in'::text]))),
    CONSTRAINT contact_opt_outs_source_check CHECK ((source = ANY (ARRAY['whatsapp_keyword'::text, 'manual_admin'::text, 'api'::text, 'csv_import'::text])))
);


--
-- Name: data_deletion_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    requester_type text NOT NULL,
    requester_email text,
    requester_phone text,
    requester_id text,
    reason text,
    scope text DEFAULT 'full'::text NOT NULL,
    source text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    meta_confirmation_code text,
    created_at timestamp with time zone DEFAULT now(),
    verified_at timestamp with time zone,
    completed_at timestamp with time zone,
    processed_by uuid,
    records_deleted jsonb DEFAULT '{}'::jsonb,
    raw_payload jsonb,
    CONSTRAINT data_deletion_requests_requester_type_check CHECK ((requester_type = ANY (ARRAY['end_user'::text, 'admin'::text, 'meta_callback'::text]))),
    CONSTRAINT data_deletion_requests_scope_check CHECK ((scope = ANY (ARRAY['full'::text, 'messages_only'::text, 'profile_only'::text]))),
    CONSTRAINT data_deletion_requests_source_check CHECK ((source = ANY (ARRAY['web_form'::text, 'meta_callback'::text, 'arco_request'::text, 'admin_initiated'::text]))),
    CONSTRAINT data_deletion_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'processing'::text, 'completed'::text, 'rejected'::text, 'failed'::text])))
);


--
-- Name: disabled_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disabled_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    date date NOT NULL,
    "time" time without time zone NOT NULL
);


--
-- Name: help_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category text NOT NULL,
    media_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    category_icon text DEFAULT 'BookOpen'::text,
    is_public boolean DEFAULT false,
    slug text,
    summary text,
    reading_time_minutes integer DEFAULT 3,
    views_count integer DEFAULT 0,
    meta_description text,
    display_order integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: hubspot_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hubspot_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    access_token text NOT NULL,
    hub_id text,
    hub_domain text,
    scopes text[],
    user_email text,
    connected_at timestamp with time zone DEFAULT now() NOT NULL,
    last_sync_at timestamp with time zone,
    last_sync_status text,
    last_sync_message text,
    total_contacts_synced integer DEFAULT 0 NOT NULL,
    auto_sync_enabled boolean DEFAULT true NOT NULL,
    sync_direction text DEFAULT 'pull'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hubspot_integrations_last_sync_status_check CHECK (((last_sync_status = ANY (ARRAY['success'::text, 'partial'::text, 'failed'::text])) OR (last_sync_status IS NULL))),
    CONSTRAINT hubspot_integrations_sync_direction_check CHECK ((sync_direction = ANY (ARRAY['pull'::text, 'push'::text, 'bidirectional'::text])))
);


--
-- Name: TABLE hubspot_integrations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.hubspot_integrations IS 'Integración con HubSpot vía Private App Token por company. Los tokens NO caducan.';


--
-- Name: COLUMN hubspot_integrations.access_token; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hubspot_integrations.access_token IS 'HubSpot Private App Access Token (formato pat-xx-xxxxxxxx). No caduca a menos que el user lo revoque en HubSpot.';


--
-- Name: COLUMN hubspot_integrations.sync_direction; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hubspot_integrations.sync_direction IS 'pull: solo trae contactos de HubSpot. push: solo envía. bidirectional: ambos (v2).';


--
-- Name: integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integrations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid,
    platform text NOT NULL,
    access_token text,
    phone_number_id text,
    page_id text,
    status text DEFAULT 'disconnected'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    account_id text,
    CONSTRAINT integrations_platform_check CHECK ((platform = ANY (ARRAY['whatsapp'::text, 'messenger'::text, 'instagram'::text]))),
    CONSTRAINT integrations_status_check CHECK ((status = ANY (ARRAY['connected'::text, 'active'::text, 'pending'::text, 'disconnected'::text, 'expired'::text, 'error'::text, 'inactive'::text])))
);


--
-- Name: invoice_folio_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_folio_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    invoice_number text,
    series text DEFAULT 'A'::text,
    folio integer,
    status text DEFAULT 'draft'::text NOT NULL,
    error_message text,
    emisor_rfc text NOT NULL,
    emisor_legal_name text NOT NULL,
    emisor_regime_code text NOT NULL,
    emisor_zip text NOT NULL,
    receptor_rfc text NOT NULL,
    receptor_legal_name text NOT NULL,
    receptor_regime_code text,
    receptor_zip text,
    receptor_use_cfdi text DEFAULT 'G03'::text NOT NULL,
    receptor_email text,
    subtotal_cents bigint DEFAULT 0 NOT NULL,
    iva_cents bigint DEFAULT 0 NOT NULL,
    total_cents bigint DEFAULT 0 NOT NULL,
    currency text DEFAULT 'MXN'::text NOT NULL,
    exchange_rate numeric,
    cfdi_type text DEFAULT 'I'::text,
    forma_pago text DEFAULT '04'::text,
    metodo_pago text DEFAULT 'PUE'::text,
    exportacion text DEFAULT '01'::text,
    billing_period_start timestamp with time zone,
    billing_period_end timestamp with time zone,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    cfdi_uuid text,
    cfdi_xml_url text,
    cfdi_pdf_url text,
    cfdi_stamped_at timestamp with time zone,
    cfdi_xml_raw text,
    pac_provider text,
    pac_external_id text,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    cancellation_substitute_uuid text,
    stripe_invoice_id text,
    stripe_payment_intent_id text,
    stripe_charge_id text,
    created_at timestamp with time zone DEFAULT now(),
    issued_at timestamp with time zone,
    paid_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_stamp'::text, 'stamped'::text, 'paid'::text, 'cancelled'::text, 'refunded'::text, 'errored'::text])))
);


--
-- Name: knowledge_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    file_name text NOT NULL,
    file_url text NOT NULL,
    module_source text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: landing_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_features (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    icon text,
    title text,
    description text,
    col_span integer DEFAULT 1,
    order_index integer DEFAULT 0
);


--
-- Name: landing_hero_slides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_hero_slides (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text,
    subtitle text,
    image_url text,
    order_index integer DEFAULT 0,
    button_text text DEFAULT 'Comienza una prueba gratis'::text
);


--
-- Name: landing_scroll_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_scroll_sections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    image_url text,
    title text,
    description text,
    tag_text text,
    image_position text DEFAULT 'left'::text,
    order_index integer DEFAULT 0
);


--
-- Name: landing_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_settings (
    id integer DEFAULT 1 NOT NULL,
    primary_color text DEFAULT '#134e4a'::text,
    contact_email text DEFAULT 'contacto@empresa.com'::text,
    footer_text text DEFAULT '© 2026 Todos los derechos reservados.'::text,
    nav_links jsonb DEFAULT '["Inicio", "Características", "Planes", "Contacto"]'::jsonb,
    features_title text DEFAULT 'Potencia operativa'::text,
    features_subtitle text DEFAULT 'Características pensadas para que no pierdas un solo prospecto y optimices tu tiempo al máximo.'::text,
    plans_title text DEFAULT 'Suscripciones'::text,
    plans_subtitle text DEFAULT 'Planes transparentes ajustados a las necesidades reales de tu firma.'::text,
    contact_title text DEFAULT 'Contáctanos'::text,
    contact_subtitle text DEFAULT 'Llena el formulario y nos pondremos en contacto contigo a la brevedad.'::text
);


--
-- Name: locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    name text NOT NULL,
    business_phone_id text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: menu_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    icon text
);


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    name text NOT NULL,
    description text,
    price numeric,
    category text,
    is_available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    category_id uuid,
    public_slug text,
    is_recommended boolean DEFAULT false,
    allergens text[],
    tags text[],
    display_order integer DEFAULT 0,
    photo_url text
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL,
    is_read boolean DEFAULT false,
    link text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE ONLY public.notifications FORCE ROW LEVEL SECURITY;


--
-- Name: operator_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    operator_id uuid,
    operator_email text,
    action_type text NOT NULL,
    target_type text,
    target_id text,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT operator_audit_log_action_type_check CHECK ((action_type = ANY (ARRAY['message_sent_manual'::text, 'opt_in_manual'::text, 'contact_deleted'::text, 'contact_modified'::text, 'data_deletion_processed'::text, 'whatsapp_connected'::text, 'whatsapp_disconnected'::text, 'template_submitted'::text, 'settings_changed'::text, 'login'::text, 'export_data'::text])))
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    company_id uuid NOT NULL,
    menu_item_id uuid,
    item_name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE order_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.order_items IS 'Items de órdenes normalizados para analytics (más vendidos, ingresos por platillo). Alimentada por trigger desde orders.items (JSON). El JSON se mantiene como snapshot.';


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    status_semantic text NOT NULL,
    status_label text NOT NULL,
    status_step integer NOT NULL,
    changed_by text DEFAULT 'system'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_at timestamp with time zone DEFAULT now(),
    status_name text
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    contact_id text,
    status text DEFAULT 'received'::text,
    total numeric(10,2) DEFAULT 0,
    items jsonb DEFAULT '[]'::jsonb,
    notes text,
    public_token text,
    eta_minutes integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    customer_name text,
    customer_phone text,
    status_changed_at timestamp with time zone DEFAULT now(),
    delivery_type text DEFAULT 'pickup'::text,
    delivery_address text,
    delivery_driver_id uuid,
    payment_method text DEFAULT 'cash'::text,
    payment_status text DEFAULT 'pending'::text,
    source text DEFAULT 'whatsapp_ai'::text,
    order_number text,
    contact_name text,
    contact_phone text,
    subtotal numeric DEFAULT 0 NOT NULL,
    tax numeric DEFAULT 0 NOT NULL,
    tip numeric DEFAULT 0 NOT NULL,
    delivery_fee numeric DEFAULT 0 NOT NULL,
    status_semantic text DEFAULT 'received'::text NOT NULL,
    status_label text DEFAULT 'Recibida'::text NOT NULL,
    status_step integer DEFAULT 0 NOT NULL,
    tracking_token text DEFAULT encode(extensions.gen_random_bytes(12), 'hex'::text) NOT NULL,
    estimated_ready_at timestamp with time zone,
    currency text DEFAULT 'MXN'::text,
    CONSTRAINT orders_delivery_type_check CHECK ((delivery_type = ANY (ARRAY['pickup'::text, 'delivery'::text, 'dine_in'::text]))),
    CONSTRAINT orders_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'refunded'::text, 'failed'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['received'::text, 'preparing'::text, 'ready'::text, 'out_for_delivery'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: COLUMN orders.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.status IS 'Espejo de status_semantic para compatibilidad con el workflow n8n. Sincronizado por trigger.';


--
-- Name: COLUMN orders.customer_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.customer_name IS 'Espejo de contact_name para compatibilidad con el workflow n8n. Sincronizado por trigger.';


--
-- Name: COLUMN orders.payment_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.payment_method IS 'Método de pago del pedido: cash, card, transfer, etc. Lo setea el bot.';


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    slug text NOT NULL,
    tier text NOT NULL,
    name text NOT NULL,
    description text,
    price_monthly_cents integer DEFAULT 0 NOT NULL,
    price_yearly_cents integer,
    max_sessions_per_month integer DEFAULT 1000 NOT NULL,
    max_team_members integer DEFAULT 1 NOT NULL,
    max_internal_users integer DEFAULT 0 NOT NULL,
    max_channels integer DEFAULT 1 NOT NULL,
    max_locations integer DEFAULT 1 NOT NULL,
    max_agendas integer DEFAULT 1 NOT NULL,
    max_bots integer DEFAULT 1 NOT NULL,
    features text,
    feature_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    features_jsonb jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_legacy boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 100 NOT NULL,
    stripe_price_id text,
    stripe_price_yearly_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    trial_days integer DEFAULT 14,
    CONSTRAINT plans_tier_check CHECK ((tier = ANY (ARRAY['start'::text, 'growth'::text, 'scale'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    company_id uuid,
    full_name text,
    role text DEFAULT 'admin'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    email text,
    is_admin boolean DEFAULT false
);


--
-- Name: properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    title text NOT NULL,
    description text,
    price numeric,
    status text DEFAULT 'available'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    public_slug text,
    display_order integer DEFAULT 0,
    features text[],
    images text[],
    property_type text,
    operation_type text,
    currency text DEFAULT 'MXN'::text,
    bedrooms numeric,
    bathrooms numeric,
    parking_spots integer,
    area_total_m2 numeric,
    area_built_m2 numeric,
    year_built integer,
    address text,
    zone text,
    city text,
    state text,
    country text DEFAULT 'México'::text,
    photos jsonb DEFAULT '[]'::jsonb,
    external_ref text,
    updated_at timestamp with time zone DEFAULT now(),
    assigned_to_team_id uuid,
    is_featured boolean DEFAULT false,
    public_url text,
    amenities jsonb DEFAULT '[]'::jsonb
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    bucket text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    hits integer DEFAULT 0 NOT NULL
);


--
-- Name: TABLE rate_limits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rate_limits IS 'Contadores de límite de tasa por ventana fija. Compartidos entre instancias serverless.';


--
-- Name: reminder_rule_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_rule_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vertical_slug text NOT NULL,
    name text NOT NULL,
    description text,
    trigger_source text NOT NULL,
    trigger_offset_minutes integer NOT NULL,
    applies_to_status text[],
    applies_to_lifecycle_stage text[],
    message_template text NOT NULL,
    include_action_buttons boolean DEFAULT false NOT NULL,
    recommended_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE reminder_rule_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reminder_rule_templates IS 'Plantillas predefinidas por vertical (salud, bienes_raices, restaurantes). El usuario las importa con un click desde el panel.';


--
-- Name: sat_clave_prodserv; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sat_clave_prodserv (
    code text NOT NULL,
    description text NOT NULL,
    recommended_for text
);


--
-- Name: sat_clave_unidad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sat_clave_unidad (
    code text NOT NULL,
    description text NOT NULL
);


--
-- Name: sat_forma_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sat_forma_pago (
    code text NOT NULL,
    description text NOT NULL
);


--
-- Name: sat_metodo_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sat_metodo_pago (
    code text NOT NULL,
    description text NOT NULL
);


--
-- Name: sat_regimen_fiscal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sat_regimen_fiscal (
    code text NOT NULL,
    description text NOT NULL,
    for_persons text NOT NULL,
    CONSTRAINT sat_regimen_fiscal_for_persons_check CHECK ((for_persons = ANY (ARRAY['fisica'::text, 'moral'::text, 'both'::text])))
);


--
-- Name: sat_uso_cfdi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sat_uso_cfdi (
    code text NOT NULL,
    description text NOT NULL,
    applies_to text NOT NULL,
    CONSTRAINT sat_uso_cfdi_applies_to_check CHECK ((applies_to = ANY (ARRAY['fisica'::text, 'moral'::text, 'both'::text])))
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    duration_minutes integer,
    default_price numeric(10,2),
    currency text DEFAULT 'MXN'::text,
    category text,
    bot_keywords text[] DEFAULT ARRAY[]::text[],
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT services_currency_check CHECK ((currency = ANY (ARRAY['MXN'::text, 'USD'::text]))),
    CONSTRAINT services_default_price_check CHECK (((default_price IS NULL) OR (default_price >= (0)::numeric))),
    CONSTRAINT services_duration_minutes_check CHECK (((duration_minutes IS NULL) OR (duration_minutes > 0)))
);


--
-- Name: TABLE services; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.services IS 'Catálogo de servicios que ofrece una company. Se asocian con miembros del equipo via team_member_services.';


--
-- Name: COLUMN services.bot_keywords; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.services.bot_keywords IS 'Palabras clave para que el bot identifique este servicio. Ejemplo: ["limpieza", "profilaxis"] para limpieza dental.';


--
-- Name: site_faqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    category text DEFAULT 'general'::text,
    display_order integer DEFAULT 0,
    visible boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: site_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_features (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    short_description text,
    long_description text,
    icon_name text DEFAULT 'Sparkles'::text,
    category text DEFAULT 'core'::text,
    benefits jsonb DEFAULT '[]'::jsonb,
    display_order integer DEFAULT 0,
    visible boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: site_industries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_industries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    tagline text,
    description text,
    icon_name text DEFAULT 'Building2'::text,
    accent_color text DEFAULT '#4f46e5'::text,
    bullet_points jsonb DEFAULT '[]'::jsonb,
    template_id text,
    display_order integer DEFAULT 0,
    visible boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: site_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'channels'::text,
    description text,
    logo_url text,
    brand_color text,
    display_order integer DEFAULT 0,
    available boolean DEFAULT true,
    visible boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    key text NOT NULL,
    value jsonb NOT NULL,
    category text DEFAULT 'general'::text,
    description text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: site_testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_name text NOT NULL,
    author_role text,
    company_name text,
    avatar_url text,
    quote text NOT NULL,
    metric_label text,
    metric_value text,
    industry_slug text,
    display_order integer DEFAULT 0,
    featured boolean DEFAULT false,
    visible boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: team_member_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_member_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid NOT NULL,
    service_id uuid NOT NULL,
    offered boolean NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE team_member_services; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.team_member_services IS 'Asignación explícita de servicios por miembro. offered=TRUE → ofrece. offered=FALSE → no ofrece.';


--
-- Name: COLUMN team_member_services.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_member_services.notes IS 'Notas internas opcionales. Ej. "solo casos leves", "solo niños", "solo viernes".';


--
-- Name: templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.templates (
    id text NOT NULL,
    name text NOT NULL,
    short_name text,
    description text,
    icon text DEFAULT 'Sparkles'::text NOT NULL,
    theme_color text DEFAULT '#020617'::text NOT NULL,
    accent_color text DEFAULT '#4f46e5'::text NOT NULL,
    tenant_label text DEFAULT 'Plataforma'::text NOT NULL,
    ui_labels jsonb DEFAULT '{}'::jsonb NOT NULL,
    active_modules jsonb DEFAULT '{}'::jsonb NOT NULL,
    funnels jsonb DEFAULT '{}'::jsonb NOT NULL,
    custom_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    default_prompts jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_generic boolean DEFAULT false NOT NULL,
    is_legacy boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.templates IS 'Plantillas verticales instalables. Cada company puede tener varias.';


--
-- Name: COLUMN templates.ui_labels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.templates.ui_labels IS 'Etiquetas dinámicas: client, clients, staff, location, appointment, pipeline_kanban_title.';


--
-- Name: COLUMN templates.active_modules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.templates.active_modules IS 'Flags que activan módulos en el sidebar: calendar, properties, menu, team, etc.';


--
-- Name: COLUMN templates.funnels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.templates.funnels IS 'Etiquetas del kanban: new_lead, hot_lead, payment, customer.';


--
-- Name: usage_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_counters (
    id bigint NOT NULL,
    company_id uuid NOT NULL,
    metric text NOT NULL,
    value integer DEFAULT 0 NOT NULL,
    period_start timestamp with time zone DEFAULT date_trunc('month'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT usage_counters_value_check CHECK ((value >= 0))
);


--
-- Name: usage_counters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usage_counters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usage_counters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usage_counters_id_seq OWNED BY public.usage_counters.id;


--
-- Name: usage_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usage_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    contact_ref text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_msg_at timestamp with time zone DEFAULT now() NOT NULL,
    msg_count integer DEFAULT 1 NOT NULL,
    channel text DEFAULT 'whatsapp'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE usage_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.usage_sessions IS 'Sesiones de conversación (ventanas de 24h por contacto, estilo Meta). Cuenta contra el límite mensual del plan.';


--
-- Name: v_admin_usage; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_admin_usage AS
 SELECT c.id AS company_id,
    c.name AS company_name,
    COALESCE(c.plan_slug, c.selected_plan_slug) AS plan_slug,
    p.max_sessions_per_month AS sessions_limit,
    ( SELECT count(*) AS count
           FROM public.usage_sessions us
          WHERE ((us.company_id = c.id) AND (us.started_at >= date_trunc('month'::text, now())) AND (us.started_at < (date_trunc('month'::text, now()) + '1 mon'::interval)))) AS sessions_used
   FROM (public.companies c
     LEFT JOIN public.plans p ON ((p.slug = COALESCE(c.plan_slug, c.selected_plan_slug))));


--
-- Name: VIEW v_admin_usage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_admin_usage IS 'Uso mensual de sesiones por company. Para el panel admin.';


--
-- Name: v_company_active; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_company_active AS
 SELECT c.id,
    c.name,
    c.plan_slug,
    c.account_status,
    c.subscription_status,
    c.trial_ends_at,
    p.tier,
    p.name AS plan_name,
    p.max_sessions_per_month,
    p.max_team_members,
    p.max_channels,
    pt.template_id AS primary_template_id,
    t.name AS primary_template_name,
    t.theme_color AS primary_theme_color,
    t.accent_color AS primary_accent_color
   FROM (((public.companies c
     JOIN public.plans p ON ((p.slug = c.plan_slug)))
     LEFT JOIN public.company_templates pt ON (((pt.company_id = c.id) AND (pt.is_primary = true))))
     LEFT JOIN public.templates t ON ((t.id = pt.template_id)));


--
-- Name: v_contacts_enriched; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_contacts_enriched AS
 SELECT id,
    company_id,
    name,
    phone,
    external_id,
    platform,
    bot_active,
    status,
    created_at,
    assigned_to,
    chat_status,
    lifecycle_stage,
    unread_count,
    symptoms,
    notes,
    custom_data,
    ai_active,
    gender,
    staff_id,
    birth_date,
    stage_updated_by,
    stage_updated_at,
    last_inbound_at,
    last_outbound_at,
    follow_up_sent_at,
    follow_up_count,
    recovery_status,
    ( SELECT jsonb_build_object('id', a.id, 'date', a.appointment_date, 'time', a.appointment_time, 'status', a.status, 'agenda_id', a.agenda_id) AS jsonb_build_object
           FROM public.appointments a
          WHERE ((a.patient_id = c.id) AND (a.status = ANY (ARRAY['confirmed'::text, 'scheduled'::text])) AND ((a.appointment_date > CURRENT_DATE) OR ((a.appointment_date = CURRENT_DATE) AND ((a.appointment_time)::time with time zone > CURRENT_TIME))))
          ORDER BY a.appointment_date, a.appointment_time
         LIMIT 1) AS next_appointment,
    ( SELECT count(*) AS count
           FROM public.appointments a
          WHERE (a.patient_id = c.id)) AS total_appointments,
    ( SELECT count(*) AS count
           FROM public.appointments a
          WHERE ((a.patient_id = c.id) AND (a.status = 'completed'::text))) AS completed_appointments,
    ( SELECT count(*) AS count
           FROM public.appointments a
          WHERE ((a.patient_id = c.id) AND (a.status = 'cancelled'::text))) AS cancelled_appointments,
    ( SELECT count(*) AS count
           FROM public.appointments a
          WHERE ((a.patient_id = c.id) AND (a.status = 'no_show'::text))) AS no_show_appointments,
    ( SELECT count(*) AS count
           FROM public.messages m
          WHERE (m.patient_id = c.id)) AS total_messages,
    ( SELECT count(*) AS count
           FROM public.messages m
          WHERE ((m.patient_id = c.id) AND (m.sender = 'patient'::text))) AS inbound_messages,
    ( SELECT count(*) AS count
           FROM public.reminder_queue rq
          WHERE ((rq.contact_id = c.id) AND (rq.status = 'sent'::text))) AS reminders_sent,
    ( SELECT count(*) AS count
           FROM public.reminder_queue rq
          WHERE ((rq.contact_id = c.id) AND (rq.patient_response = 'confirmed'::text))) AS reminders_confirmed,
    ( SELECT count(*) AS count
           FROM public.reminder_queue rq
          WHERE ((rq.contact_id = c.id) AND (rq.patient_response = 'cancelled'::text))) AS reminders_cancelled,
        CASE
            WHEN (last_inbound_at IS NULL) THEN NULL::numeric
            ELSE (EXTRACT(epoch FROM (now() - last_inbound_at)) / 86400.0)
        END AS days_since_inbound,
    ( SELECT a.appointment_date
           FROM public.appointments a
          WHERE ((a.patient_id = c.id) AND (a.status = ANY (ARRAY['completed'::text, 'confirmed'::text, 'scheduled'::text])))
          ORDER BY a.appointment_date, a.appointment_time
         LIMIT 1) AS first_visit_at,
    ( SELECT a.appointment_date
           FROM public.appointments a
          WHERE ((a.patient_id = c.id) AND (a.status = 'completed'::text))
          ORDER BY a.appointment_date DESC, a.appointment_time DESC
         LIMIT 1) AS last_visit_at
   FROM public.contacts c;


--
-- Name: VIEW v_contacts_enriched; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_contacts_enriched IS 'Vista enriquecida de contactos con proxima cita, primera/ultima visita, metricas y temperatura. Usada por /dashboard/contacts.';


--
-- Name: v_contacts_pending_followup; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_contacts_pending_followup WITH (security_invoker='on') AS
 SELECT c.id,
    c.company_id,
    c.name,
    c.external_id,
    c.phone,
    c.lifecycle_stage,
    c.last_inbound_at,
    c.last_outbound_at,
    ps.n8n_webhook_whatsapp_admin AS webhook_url
   FROM ((public.contacts c
     JOIN public.companies cmp ON ((cmp.id = c.company_id)))
     LEFT JOIN public.platform_settings ps ON ((ps.id = 1)))
  WHERE ((c.chat_status = 'open'::text) AND (c.ai_active = true) AND (c.follow_up_sent_at IS NULL) AND (c.last_outbound_at IS NOT NULL) AND (c.last_outbound_at > COALESCE(c.last_inbound_at, '1970-01-01 00:00:00+00'::timestamp with time zone)) AND (c.last_outbound_at < (now() - '24:00:00'::interval)));


--
-- Name: v_contacts_with_tags; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_contacts_with_tags AS
 SELECT id AS contact_id,
    company_id,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'ai_aware', t.ai_aware) ORDER BY t.display_order, t.name) AS jsonb_agg
           FROM (public.contact_tags ct
             JOIN public.tags t ON ((t.id = ct.tag_id)))
          WHERE (ct.contact_id = c.id)), '[]'::jsonb) AS tags
   FROM public.contacts c;


--
-- Name: VIEW v_contacts_with_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_contacts_with_tags IS 'Cada contacto con sus tags como array JSONB. Para join rápido con v_contacts_enriched en el frontend.';


--
-- Name: v_menu_item_sales; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_menu_item_sales AS
 SELECT company_id,
    menu_item_id,
    item_name,
    count(DISTINCT order_id) AS num_orders,
    sum(quantity) AS total_quantity,
    sum(subtotal) AS total_revenue,
    max(created_at) AS last_ordered_at
   FROM public.order_items oi
  GROUP BY company_id, menu_item_id, item_name;


--
-- Name: VIEW v_menu_item_sales; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_menu_item_sales IS 'Analytics de ventas por platillo. Úsala para "más vendidos", ingresos por item, etc.';


--
-- Name: v_noshow_metrics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_noshow_metrics AS
 SELECT company_id,
    COALESCE(no_show_reason, 'sin_razon'::text) AS reason,
    count(*) AS count_30d
   FROM public.appointments a
  WHERE ((status = 'no_show'::text) AND (appointment_date >= (CURRENT_DATE - '30 days'::interval)))
  GROUP BY company_id, COALESCE(no_show_reason, 'sin_razon'::text);


--
-- Name: VIEW v_noshow_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_noshow_metrics IS 'Conteo de no-shows por razón en los últimos 30 días por compañía. Para reports y análisis de patrones.';


--
-- Name: v_orders_full; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_orders_full AS
 SELECT o.id,
    o.company_id,
    o.order_number,
    o.contact_name,
    o.contact_phone,
    o.items,
    o.subtotal,
    o.tax,
    o.tip,
    o.delivery_fee,
    o.total,
    o.delivery_type,
    o.delivery_address,
    o.status_semantic,
    o.status_label,
    o.status_step,
    o.tracking_token,
    o.estimated_ready_at,
    o.notes,
    o.source,
    o.created_at,
    o.updated_at,
    c.name AS company_name
   FROM (public.orders o
     JOIN public.companies c ON ((c.id = o.company_id)));


--
-- Name: v_reactivation_metrics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_reactivation_metrics AS
 SELECT id AS company_id,
    ( SELECT count(DISTINCT rq.contact_id) AS count
           FROM (public.reminder_queue rq
             JOIN public.reminder_rules rr ON ((rr.id = rq.rule_id)))
          WHERE ((rq.company_id = c.id) AND (rr.trigger_source = 'contact_inactivity'::text) AND (rq.status = 'sent'::text) AND (rq.sent_at >= (now() - '30 days'::interval)) AND (rq.patient_response IS NOT NULL))) AS pacientes_reactivados_30d,
    ( SELECT count(DISTINCT rq.contact_id) AS count
           FROM (public.reminder_queue rq
             JOIN public.reminder_rules rr ON ((rr.id = rq.rule_id)))
          WHERE ((rq.company_id = c.id) AND (rr.trigger_source = 'contact_inactivity'::text) AND (rq.status = 'sent'::text) AND (rq.sent_at >= (now() - '30 days'::interval)))) AS pacientes_contactados_30d,
    ( SELECT count(*) AS count
           FROM public.contacts ct
          WHERE ((ct.company_id = c.id) AND (ct.lifecycle_stage = ANY (ARRAY['payment'::text, 'customer'::text])) AND ((ct.last_inbound_at IS NULL) OR (ct.last_inbound_at < (now() - '90 days'::interval))) AND (NOT (EXISTS ( SELECT 1
                   FROM (public.reminder_queue rq
                     JOIN public.reminder_rules rr ON ((rr.id = rq.rule_id)))
                  WHERE ((rq.contact_id = ct.id) AND (rr.trigger_source = 'contact_inactivity'::text) AND (rq.sent_at >= (now() - '30 days'::interval)))))))) AS pacientes_dormidos_elegibles
   FROM public.companies c;


--
-- Name: VIEW v_reactivation_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_reactivation_metrics IS 'Métricas de retención por compañía: pacientes reactivados, contactados, y dormidos elegibles para reactivar.';


--
-- Name: v_referral_breakdown; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_referral_breakdown AS
 SELECT company_id,
    COALESCE(referral_source, 'unknown'::text) AS source,
    count(*) AS total_contacts,
    count(*) FILTER (WHERE (lifecycle_stage = ANY (ARRAY['payment'::text, 'customer'::text]))) AS converted_contacts,
    count(*) FILTER (WHERE (created_at >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))) AS new_this_month
   FROM public.contacts
  GROUP BY company_id, COALESCE(referral_source, 'unknown'::text);


--
-- Name: VIEW v_referral_breakdown; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_referral_breakdown IS 'Desglose de pacientes por fuente de referido (Google, paciente, doctor, etc.) con conversión.';


--
-- Name: v_reminder_metrics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_reminder_metrics AS
 SELECT company_id,
    count(*) FILTER (WHERE ((status = 'sent'::text) AND (sent_at >= CURRENT_DATE))) AS sent_today,
    count(*) FILTER (WHERE ((status = 'sent'::text) AND (sent_at >= date_trunc('week'::text, (CURRENT_DATE)::timestamp with time zone)))) AS sent_this_week,
    count(*) FILTER (WHERE ((status = 'sent'::text) AND (sent_at >= date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone)))) AS sent_this_month,
    count(*) FILTER (WHERE ((status = 'pending'::text) AND ((scheduled_at)::date = CURRENT_DATE))) AS pending_today,
    count(*) FILTER (WHERE (status = 'pending'::text)) AS pending_total,
    count(*) FILTER (WHERE (status = 'failed'::text)) AS failed_total,
    count(*) FILTER (WHERE (patient_response = 'confirmed'::text)) AS confirmed_responses,
    count(*) FILTER (WHERE (patient_response = 'cancelled'::text)) AS cancelled_responses,
    count(*) FILTER (WHERE ((status = 'sent'::text) AND (patient_response IS NULL))) AS no_response
   FROM public.reminder_queue
  GROUP BY company_id;


--
-- Name: VIEW v_reminder_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_reminder_metrics IS 'KPIs agregados de la cola de recordatorios por company.';


--
-- Name: v_reminders_due; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_reminders_due AS
 SELECT rq.id,
    rq.company_id,
    rq.rule_id,
    rq.appointment_id,
    rq.contact_id,
    rq.scheduled_at,
    rq.rendered_content,
    rq.channel,
    rq.attempts,
    c.name AS patient_name,
    c.phone AS patient_phone,
    rr.name AS rule_name,
    ps.n8n_webhook_whatsapp_admin AS whatsapp_admin_url,
    ps.reminder_max_attempts
   FROM (((public.reminder_queue rq
     JOIN public.contacts c ON ((c.id = rq.contact_id)))
     JOIN public.reminder_rules rr ON ((rr.id = rq.rule_id)))
     JOIN public.platform_settings ps ON ((ps.id = 1)))
  WHERE ((rq.status = 'pending'::text) AND (rq.scheduled_at <= now()) AND (rq.attempts < ps.reminder_max_attempts) AND (rr.is_active = true));


--
-- Name: VIEW v_reminders_due; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_reminders_due IS 'Recordatorios pendientes listos para enviar. Lee n8n cada N minutos.';


--
-- Name: v_retention_metrics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_retention_metrics AS
 WITH month_bounds AS (
         SELECT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date AS start_of_month,
            ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) + '1 mon'::interval))::date AS start_of_next_month,
            ((date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) - '1 mon'::interval))::date AS start_of_prev_month,
            (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date AS end_of_prev_month
        )
 SELECT id AS company_id,
    ( SELECT count(*) AS count
           FROM public.contacts ct,
            month_bounds mb
          WHERE ((ct.company_id = c.id) AND (ct.created_at >= mb.start_of_month) AND (ct.created_at < mb.start_of_next_month))) AS pacientes_nuevos_mes,
    ( SELECT count(DISTINCT a.patient_id) AS count
           FROM public.appointments a,
            month_bounds mb
          WHERE ((a.company_id = c.id) AND (a.status = 'completed'::text) AND (a.appointment_date >= mb.start_of_month) AND (a.appointment_date < mb.start_of_next_month) AND (EXISTS ( SELECT 1
                   FROM public.appointments a2
                  WHERE ((a2.patient_id = a.patient_id) AND (a2.status = 'completed'::text) AND (a2.appointment_date < mb.start_of_month)))))) AS pacientes_volvieron_mes,
    ( SELECT count(*) AS count
           FROM public.contacts ct
          WHERE ((ct.company_id = c.id) AND (ct.lifecycle_stage = ANY (ARRAY['payment'::text, 'customer'::text])) AND ((ct.last_inbound_at IS NULL) OR (ct.last_inbound_at < (now() - '90 days'::interval))))) AS pacientes_inactivos_90d,
    ( SELECT count(*) AS count
           FROM public.contacts ct
          WHERE ((ct.company_id = c.id) AND (ct.lifecycle_stage = ANY (ARRAY['payment'::text, 'customer'::text])))) AS pacientes_activos_total,
    ( SELECT count(*) AS count
           FROM public.contacts ct,
            month_bounds mb
          WHERE ((ct.company_id = c.id) AND (ct.created_at >= mb.start_of_prev_month) AND (ct.created_at < mb.start_of_month))) AS pacientes_nuevos_mes_anterior
   FROM public.companies c;


--
-- Name: VIEW v_retention_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_retention_metrics IS 'Métricas de retención por compañía: nuevos del mes, volvieron, inactivos 90d. Para /reports.';


--
-- Name: v_retention_monthly; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_retention_monthly AS
 WITH months AS (
         SELECT (generate_series((date_trunc('month'::text, (CURRENT_DATE - '11 mons'::interval)))::timestamp with time zone, date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone), '1 mon'::interval))::date AS month_start
        )
 SELECT c.id AS company_id,
    m.month_start,
    to_char((m.month_start)::timestamp with time zone, 'YYYY-MM'::text) AS month_key,
    to_char((m.month_start)::timestamp with time zone, 'TMmon'::text) AS month_label,
    ( SELECT count(*) AS count
           FROM public.contacts ct
          WHERE ((ct.company_id = c.id) AND (ct.created_at >= m.month_start) AND (ct.created_at < (m.month_start + '1 mon'::interval)))) AS nuevos,
    ( SELECT count(DISTINCT a.patient_id) AS count
           FROM public.appointments a
          WHERE ((a.company_id = c.id) AND (a.status = 'completed'::text) AND (a.appointment_date >= m.month_start) AND (a.appointment_date < (m.month_start + '1 mon'::interval)) AND (EXISTS ( SELECT 1
                   FROM public.appointments a2
                  WHERE ((a2.patient_id = a.patient_id) AND (a2.status = 'completed'::text) AND (a2.appointment_date < m.month_start)))))) AS volvieron,
    ( SELECT count(*) AS count
           FROM public.appointments a
          WHERE ((a.company_id = c.id) AND (a.status = 'completed'::text) AND (a.appointment_date >= m.month_start) AND (a.appointment_date < (m.month_start + '1 mon'::interval)))) AS citas_completadas
   FROM (public.companies c
     CROSS JOIN months m);


--
-- Name: VIEW v_retention_monthly; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_retention_monthly IS 'Métricas de retención mensual (últimos 12 meses) por compañía. Para gráficas de tendencia en /reports.';


--
-- Name: v_tag_usage_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_tag_usage_stats AS
 SELECT t.id AS tag_id,
    t.company_id,
    t.name,
    t.color,
    t.ai_aware,
    count(ct.contact_id) AS contacts_count
   FROM (public.tags t
     LEFT JOIN public.contact_tags ct ON ((ct.tag_id = t.id)))
  GROUP BY t.id, t.company_id, t.name, t.color, t.ai_aware;


--
-- Name: VIEW v_tag_usage_stats; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_tag_usage_stats IS 'Conteo de contactos por tag. Para mostrar en /dashboard/tags cuántos pacientes tienen cada tag.';


--
-- Name: v_tasks_enriched; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_tasks_enriched AS
 SELECT t.id,
    t.company_id,
    t.title,
    t.description,
    t.due_at,
    t.completed_at,
    t.contact_id,
    t.assigned_to,
    t.created_by,
    t.priority,
    t.created_at,
    t.updated_at,
    c.name AS contact_name,
    c.phone AS contact_phone,
    tm.full_name AS assigned_name,
        CASE
            WHEN (t.completed_at IS NOT NULL) THEN 'completed'::text
            WHEN (t.due_at IS NULL) THEN 'pending'::text
            WHEN (t.due_at < now()) THEN 'overdue'::text
            WHEN ((t.due_at)::date = CURRENT_DATE) THEN 'today'::text
            WHEN ((t.due_at)::date = (CURRENT_DATE + 1)) THEN 'tomorrow'::text
            ELSE 'upcoming'::text
        END AS bucket
   FROM ((public.tasks t
     LEFT JOIN public.contacts c ON ((c.id = t.contact_id)))
     LEFT JOIN public.team tm ON ((tm.id = t.assigned_to)));


--
-- Name: VIEW v_tasks_enriched; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_tasks_enriched IS 'Vista de tareas con nombres resueltos + categoría temporal (overdue/today/tomorrow/upcoming/pending/completed).';


--
-- Name: v_top_referrers; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_top_referrers AS
 SELECT c_ref.company_id,
    c_ref.id AS referrer_contact_id,
    c_ref.name AS referrer_name,
    c_ref.phone AS referrer_phone,
    count(c_new.id) AS referrals_count,
    count(c_new.id) FILTER (WHERE (c_new.lifecycle_stage = ANY (ARRAY['payment'::text, 'customer'::text]))) AS referrals_converted
   FROM (public.contacts c_ref
     JOIN public.contacts c_new ON ((c_new.referred_by_contact_id = c_ref.id)))
  GROUP BY c_ref.company_id, c_ref.id, c_ref.name, c_ref.phone;


--
-- Name: VIEW v_top_referrers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_top_referrers IS 'Pacientes ordenados por cantidad de referidos que han traído. Para identificar quién cuidar extra bien.';


--
-- Name: v_waitlist_enriched; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_waitlist_enriched AS
 SELECT w.id,
    w.company_id,
    w.contact_id,
    w.agenda_id,
    w.preferred_date_from,
    w.preferred_date_to,
    w.preferred_time_of_day,
    w.notes,
    w.status,
    w.notified_at,
    w.notified_slot_date,
    w.notified_slot_time,
    w.notified_agenda_id,
    w.expires_at,
    w.created_at,
    w.updated_at,
    c.name AS contact_name,
    c.phone AS contact_phone,
    c.symptoms AS contact_symptoms,
    c.lifecycle_stage AS contact_lifecycle_stage,
    a.name AS agenda_name,
    (EXTRACT(epoch FROM (now() - w.created_at)) / 86400.0) AS days_waiting
   FROM ((public.waitlist w
     LEFT JOIN public.contacts c ON ((c.id = w.contact_id)))
     LEFT JOIN public.agendas a ON ((a.id = w.agenda_id)));


--
-- Name: VIEW v_waitlist_enriched; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_waitlist_enriched IS 'Lista de espera con datos del contacto y agenda. Usada por /dashboard/waitlist.';


--
-- Name: whatsapp_quality_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_quality_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    business_phone_id text NOT NULL,
    event_type text NOT NULL,
    old_quality_rating text,
    new_quality_rating text,
    old_messaging_tier text,
    new_messaging_tier text,
    metadata jsonb DEFAULT '{}'::jsonb,
    raw_webhook jsonb,
    meta_event_time timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT whatsapp_quality_events_event_type_check CHECK ((event_type = ANY (ARRAY['quality_update'::text, 'messaging_tier_update'::text, 'name_update'::text, 'account_review'::text, 'phone_number_status'::text])))
);


--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    template_id text NOT NULL,
    waba_id text NOT NULL,
    company_id uuid,
    name text NOT NULL,
    language text DEFAULT 'es_MX'::text NOT NULL,
    category text,
    status text NOT NULL,
    rejection_reason text,
    components jsonb,
    quality_score text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT whatsapp_templates_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'PAUSED'::text, 'DISABLED'::text, 'FLAGGED'::text, 'IN_APPEAL'::text])))
);


--
-- Name: working_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.working_hours (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    day_of_week integer NOT NULL,
    start_time time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    end_time time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL,
    slot_duration integer DEFAULT 30,
    is_active boolean DEFAULT true,
    has_break boolean DEFAULT false,
    break_start_time time without time zone DEFAULT '13:00:00'::time without time zone,
    break_end_time time without time zone DEFAULT '14:00:00'::time without time zone,
    agenda_id uuid
);


--
-- Name: bot_locks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_locks ALTER COLUMN id SET DEFAULT nextval('public.bot_locks_id_seq'::regclass);


--
-- Name: usage_counters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_counters ALTER COLUMN id SET DEFAULT nextval('public.usage_counters_id_seq'::regclass);


--
-- Name: addons addons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addons
    ADD CONSTRAINT addons_pkey PRIMARY KEY (id);


--
-- Name: agendas agendas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_pkey PRIMARY KEY (id);


--
-- Name: appointment_history appointment_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_history
    ADD CONSTRAINT appointment_history_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: bot_locks bot_locks_company_clave_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_locks
    ADD CONSTRAINT bot_locks_company_clave_uk UNIQUE (company_id, clave);


--
-- Name: bot_locks bot_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bot_locks
    ADD CONSTRAINT bot_locks_pkey PRIMARY KEY (id);


--
-- Name: bots bots_business_phone_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bots
    ADD CONSTRAINT bots_business_phone_id_key UNIQUE (business_phone_id);


--
-- Name: bots bots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bots
    ADD CONSTRAINT bots_pkey PRIMARY KEY (id);


--
-- Name: companies companies_business_phone_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_business_phone_id_key UNIQUE (business_phone_id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: company_addons company_addons_company_id_addon_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_addons
    ADD CONSTRAINT company_addons_company_id_addon_id_key UNIQUE (company_id, addon_id);


--
-- Name: company_addons company_addons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_addons
    ADD CONSTRAINT company_addons_pkey PRIMARY KEY (id);


--
-- Name: company_templates company_templates_company_id_template_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_templates
    ADD CONSTRAINT company_templates_company_id_template_id_key UNIQUE (company_id, template_id);


--
-- Name: company_templates company_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_templates
    ADD CONSTRAINT company_templates_pkey PRIMARY KEY (id);


--
-- Name: contact_opt_outs contact_opt_outs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_opt_outs
    ADD CONSTRAINT contact_opt_outs_pkey PRIMARY KEY (id);


--
-- Name: contact_tags contact_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_pkey PRIMARY KEY (contact_id, tag_id);


--
-- Name: contacts contacts_company_external_uk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_external_uk UNIQUE (company_id, external_id);


--
-- Name: data_deletion_requests data_deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_deletion_requests
    ADD CONSTRAINT data_deletion_requests_pkey PRIMARY KEY (id);


--
-- Name: disabled_slots disabled_slots_company_id_date_time_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disabled_slots
    ADD CONSTRAINT disabled_slots_company_id_date_time_key UNIQUE (company_id, date, "time");


--
-- Name: disabled_slots disabled_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disabled_slots
    ADD CONSTRAINT disabled_slots_pkey PRIMARY KEY (id);


--
-- Name: team doctors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);


--
-- Name: help_articles help_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_articles
    ADD CONSTRAINT help_articles_pkey PRIMARY KEY (id);


--
-- Name: hubspot_integrations hubspot_integrations_company_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hubspot_integrations
    ADD CONSTRAINT hubspot_integrations_company_id_key UNIQUE (company_id);


--
-- Name: hubspot_integrations hubspot_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hubspot_integrations
    ADD CONSTRAINT hubspot_integrations_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_company_id_platform_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_company_id_platform_key UNIQUE (company_id, platform);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: knowledge_files knowledge_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_files
    ADD CONSTRAINT knowledge_files_pkey PRIMARY KEY (id);


--
-- Name: landing_features landing_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_features
    ADD CONSTRAINT landing_features_pkey PRIMARY KEY (id);


--
-- Name: landing_hero_slides landing_hero_slides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_hero_slides
    ADD CONSTRAINT landing_hero_slides_pkey PRIMARY KEY (id);


--
-- Name: landing_scroll_sections landing_scroll_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_scroll_sections
    ADD CONSTRAINT landing_scroll_sections_pkey PRIMARY KEY (id);


--
-- Name: landing_settings landing_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_settings
    ADD CONSTRAINT landing_settings_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: menu_categories menu_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operator_audit_log operator_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_audit_log
    ADD CONSTRAINT operator_audit_log_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: orders orders_company_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_company_order_number_key UNIQUE (company_id, order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_public_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_public_token_key UNIQUE (public_token);


--
-- Name: orders orders_public_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_public_token_unique UNIQUE (public_token);


--
-- Name: orders orders_tracking_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tracking_token_key UNIQUE (tracking_token);


--
-- Name: contacts patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (slug);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket, window_start);


--
-- Name: reminder_queue reminder_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_queue
    ADD CONSTRAINT reminder_queue_pkey PRIMARY KEY (id);


--
-- Name: reminder_rule_templates reminder_rule_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rule_templates
    ADD CONSTRAINT reminder_rule_templates_pkey PRIMARY KEY (id);


--
-- Name: reminder_rules reminder_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_pkey PRIMARY KEY (id);


--
-- Name: sat_clave_prodserv sat_clave_prodserv_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sat_clave_prodserv
    ADD CONSTRAINT sat_clave_prodserv_pkey PRIMARY KEY (code);


--
-- Name: sat_clave_unidad sat_clave_unidad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sat_clave_unidad
    ADD CONSTRAINT sat_clave_unidad_pkey PRIMARY KEY (code);


--
-- Name: sat_forma_pago sat_forma_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sat_forma_pago
    ADD CONSTRAINT sat_forma_pago_pkey PRIMARY KEY (code);


--
-- Name: sat_metodo_pago sat_metodo_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sat_metodo_pago
    ADD CONSTRAINT sat_metodo_pago_pkey PRIMARY KEY (code);


--
-- Name: sat_regimen_fiscal sat_regimen_fiscal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sat_regimen_fiscal
    ADD CONSTRAINT sat_regimen_fiscal_pkey PRIMARY KEY (code);


--
-- Name: sat_uso_cfdi sat_uso_cfdi_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sat_uso_cfdi
    ADD CONSTRAINT sat_uso_cfdi_pkey PRIMARY KEY (code);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: site_faqs site_faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_faqs
    ADD CONSTRAINT site_faqs_pkey PRIMARY KEY (id);


--
-- Name: site_features site_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_features
    ADD CONSTRAINT site_features_pkey PRIMARY KEY (id);


--
-- Name: site_features site_features_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_features
    ADD CONSTRAINT site_features_slug_key UNIQUE (slug);


--
-- Name: site_industries site_industries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_industries
    ADD CONSTRAINT site_industries_pkey PRIMARY KEY (id);


--
-- Name: site_industries site_industries_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_industries
    ADD CONSTRAINT site_industries_slug_key UNIQUE (slug);


--
-- Name: site_integrations site_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_integrations
    ADD CONSTRAINT site_integrations_pkey PRIMARY KEY (id);


--
-- Name: site_integrations site_integrations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_integrations
    ADD CONSTRAINT site_integrations_slug_key UNIQUE (slug);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (key);


--
-- Name: site_testimonials site_testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_testimonials
    ADD CONSTRAINT site_testimonials_pkey PRIMARY KEY (id);


--
-- Name: tags tags_company_id_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_company_id_name_key UNIQUE (company_id, name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: team_member_services team_member_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_member_services
    ADD CONSTRAINT team_member_services_pkey PRIMARY KEY (id);


--
-- Name: team_member_services team_member_services_team_member_id_service_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_member_services
    ADD CONSTRAINT team_member_services_team_member_id_service_id_key UNIQUE (team_member_id, service_id);


--
-- Name: templates templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.templates
    ADD CONSTRAINT templates_pkey PRIMARY KEY (id);


--
-- Name: contacts unique_external_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT unique_external_id UNIQUE (external_id);


--
-- Name: messages unique_whatsapp_mid; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT unique_whatsapp_mid UNIQUE (whatsapp_mid);


--
-- Name: usage_counters usage_counters_company_id_metric_period_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_counters
    ADD CONSTRAINT usage_counters_company_id_metric_period_start_key UNIQUE (company_id, metric, period_start);


--
-- Name: usage_counters usage_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_counters
    ADD CONSTRAINT usage_counters_pkey PRIMARY KEY (id);


--
-- Name: usage_sessions usage_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_sessions
    ADD CONSTRAINT usage_sessions_pkey PRIMARY KEY (id);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_quality_events whatsapp_quality_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_quality_events
    ADD CONSTRAINT whatsapp_quality_events_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (template_id);


--
-- Name: whatsapp_templates whatsapp_templates_waba_id_name_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_waba_id_name_language_key UNIQUE (waba_id, name, language);


--
-- Name: working_hours working_hours_company_id_day_of_week_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_hours
    ADD CONSTRAINT working_hours_company_id_day_of_week_key UNIQUE (company_id, day_of_week);


--
-- Name: working_hours working_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_hours
    ADD CONSTRAINT working_hours_pkey PRIMARY KEY (id);


--
-- Name: addons_available_templates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX addons_available_templates_idx ON public.addons USING gin (available_for_templates);


--
-- Name: companies_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX companies_slug_unique ON public.companies USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: idx_addons_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_addons_active ON public.addons USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_addons_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_addons_category ON public.addons USING btree (category);


--
-- Name: idx_appointments_agenda_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_agenda_date ON public.appointments USING btree (agenda_id, appointment_date, appointment_time) WHERE (status <> 'cancelled'::text);


--
-- Name: idx_appointments_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_company_status ON public.appointments USING btree (company_id, status);


--
-- Name: idx_appointments_noshow_reason; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_noshow_reason ON public.appointments USING btree (company_id, status, no_show_reason) WHERE ((status = 'no_show'::text) AND (no_show_reason IS NOT NULL));


--
-- Name: idx_appointments_patient_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_patient_active ON public.appointments USING btree (patient_id, appointment_date, appointment_time) WHERE (status = ANY (ARRAY['confirmed'::text, 'scheduled'::text]));


--
-- Name: idx_appt_history_appt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_history_appt ON public.appointment_history USING btree (appointment_id, created_at DESC);


--
-- Name: idx_appt_history_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appt_history_patient ON public.appointment_history USING btree (patient_id, created_at DESC);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.operator_audit_log USING btree (action_type);


--
-- Name: idx_audit_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_company ON public.operator_audit_log USING btree (company_id);


--
-- Name: idx_audit_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_created_desc ON public.operator_audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_operator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_operator ON public.operator_audit_log USING btree (operator_id);


--
-- Name: idx_audit_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_target ON public.operator_audit_log USING btree (target_type, target_id);


--
-- Name: idx_bot_locks_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bot_locks_created_at ON public.bot_locks USING btree (created_at);


--
-- Name: idx_companies_fb_page_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_fb_page_id ON public.companies USING btree (fb_page_id);


--
-- Name: idx_companies_ig_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_ig_account_id ON public.companies USING btree (ig_account_id);


--
-- Name: idx_companies_plan_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_plan_slug ON public.companies USING btree (plan_slug);


--
-- Name: idx_companies_requires_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_requires_invoice ON public.companies USING btree (requires_invoice) WHERE (requires_invoice = true);


--
-- Name: idx_companies_subscription_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_subscription_status ON public.companies USING btree (subscription_status);


--
-- Name: idx_companies_tax_rfc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_tax_rfc ON public.companies USING btree (tax_rfc) WHERE (tax_rfc IS NOT NULL);


--
-- Name: idx_companies_trial_ends_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_trial_ends_at ON public.companies USING btree (trial_ends_at) WHERE (subscription_status = 'trialing'::text);


--
-- Name: idx_companies_waba_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_waba_id ON public.companies USING btree (waba_id) WHERE (waba_id IS NOT NULL);


--
-- Name: idx_company_addons_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_addons_company ON public.company_addons USING btree (company_id);


--
-- Name: idx_company_addons_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_addons_status ON public.company_addons USING btree (company_id, status) WHERE (status = 'active'::text);


--
-- Name: idx_company_addons_stripe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_addons_stripe ON public.company_addons USING btree (stripe_subscription_item_id) WHERE (stripe_subscription_item_id IS NOT NULL);


--
-- Name: idx_company_templates_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_templates_company ON public.company_templates USING btree (company_id);


--
-- Name: idx_company_templates_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_templates_primary ON public.company_templates USING btree (company_id, is_primary) WHERE (is_primary = true);


--
-- Name: idx_contact_tags_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_tags_contact ON public.contact_tags USING btree (contact_id);


--
-- Name: idx_contact_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_tags_tag ON public.contact_tags USING btree (tag_id);


--
-- Name: idx_contacts_company_external; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_company_external ON public.contacts USING btree (company_id, external_id);


--
-- Name: idx_contacts_hubspot_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_contacts_hubspot_unique ON public.contacts USING btree (company_id, hubspot_id) WHERE (hubspot_id IS NOT NULL);


--
-- Name: idx_contacts_last_inbound; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_last_inbound ON public.contacts USING btree (last_inbound_at DESC) WHERE (last_inbound_at IS NOT NULL);


--
-- Name: idx_contacts_opted_out; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_opted_out ON public.contacts USING btree (company_id, opted_out) WHERE (opted_out = true);


--
-- Name: idx_contacts_recovery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_recovery ON public.contacts USING btree (company_id, recovery_status);


--
-- Name: idx_contacts_referral_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_referral_source ON public.contacts USING btree (company_id, referral_source) WHERE (referral_source IS NOT NULL);


--
-- Name: idx_contacts_referred_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_referred_by ON public.contacts USING btree (referred_by_contact_id) WHERE (referred_by_contact_id IS NOT NULL);


--
-- Name: idx_contacts_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_source ON public.contacts USING btree (company_id, source);


--
-- Name: idx_ddr_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ddr_company ON public.data_deletion_requests USING btree (company_id);


--
-- Name: idx_ddr_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ddr_created_desc ON public.data_deletion_requests USING btree (created_at DESC);


--
-- Name: idx_ddr_requester_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ddr_requester_email ON public.data_deletion_requests USING btree (requester_email);


--
-- Name: idx_ddr_requester_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ddr_requester_phone ON public.data_deletion_requests USING btree (requester_phone);


--
-- Name: idx_ddr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ddr_status ON public.data_deletion_requests USING btree (status);


--
-- Name: idx_help_articles_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_help_articles_slug_unique ON public.help_articles USING btree (slug) WHERE (slug IS NOT NULL);


--
-- Name: idx_hubspot_integrations_auto_sync; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hubspot_integrations_auto_sync ON public.hubspot_integrations USING btree (auto_sync_enabled, last_sync_at) WHERE (auto_sync_enabled = true);


--
-- Name: idx_hubspot_integrations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hubspot_integrations_company ON public.hubspot_integrations USING btree (company_id);


--
-- Name: idx_invoices_cfdi_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_cfdi_uuid ON public.invoices USING btree (cfdi_uuid);


--
-- Name: idx_invoices_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_company ON public.invoices USING btree (company_id);


--
-- Name: idx_invoices_created_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_created_desc ON public.invoices USING btree (created_at DESC);


--
-- Name: idx_invoices_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_period ON public.invoices USING btree (billing_period_start, billing_period_end);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_invoices_stripe_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_stripe_invoice ON public.invoices USING btree (stripe_invoice_id);


--
-- Name: idx_menu_items_public_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_menu_items_public_slug ON public.menu_items USING btree (public_slug) WHERE (public_slug IS NOT NULL);


--
-- Name: idx_messages_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_company_created ON public.messages USING btree (company_id, created_at DESC);


--
-- Name: idx_messages_company_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_company_sender ON public.messages USING btree (company_id, sender);


--
-- Name: idx_messages_patient_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_patient_sender ON public.messages USING btree (patient_id, sender);


--
-- Name: idx_opt_outs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opt_outs_company ON public.contact_opt_outs USING btree (company_id);


--
-- Name: idx_opt_outs_created_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opt_outs_created_at_desc ON public.contact_opt_outs USING btree (created_at DESC);


--
-- Name: idx_opt_outs_external_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_opt_outs_external_id ON public.contact_opt_outs USING btree (external_id);


--
-- Name: idx_order_items_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_company ON public.order_items USING btree (company_id, created_at);


--
-- Name: idx_order_items_menu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_menu ON public.order_items USING btree (menu_item_id) WHERE (menu_item_id IS NOT NULL);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_order_status_history_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_history_order ON public.order_status_history USING btree (order_id, created_at);


--
-- Name: idx_orders_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_company ON public.orders USING btree (company_id);


--
-- Name: idx_orders_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_company_created ON public.orders USING btree (company_id, created_at DESC);


--
-- Name: idx_orders_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_contact ON public.orders USING btree (contact_id) WHERE (contact_id IS NOT NULL);


--
-- Name: idx_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_phone ON public.orders USING btree (customer_phone);


--
-- Name: idx_orders_public_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_public_token ON public.orders USING btree (public_token);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_tracking_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_tracking_token ON public.orders USING btree (tracking_token);


--
-- Name: idx_osh_order_changed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_osh_order_changed ON public.order_status_history USING btree (order_id, changed_at);


--
-- Name: idx_patients_lifecycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_lifecycle ON public.contacts USING btree (lifecycle_stage);


--
-- Name: idx_patients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_status ON public.contacts USING btree (chat_status);


--
-- Name: idx_plans_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plans_active ON public.plans USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_properties_public_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_properties_public_slug ON public.properties USING btree (public_slug) WHERE (public_slug IS NOT NULL);


--
-- Name: idx_quality_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quality_company ON public.whatsapp_quality_events USING btree (company_id);


--
-- Name: idx_quality_created_at_desc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quality_created_at_desc ON public.whatsapp_quality_events USING btree (created_at DESC);


--
-- Name: idx_quality_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quality_event_type ON public.whatsapp_quality_events USING btree (event_type);


--
-- Name: idx_quality_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quality_phone ON public.whatsapp_quality_events USING btree (business_phone_id);


--
-- Name: idx_rate_limits_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_window ON public.rate_limits USING btree (window_start);


--
-- Name: idx_reminder_queue_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_queue_appointment ON public.reminder_queue USING btree (appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: idx_reminder_queue_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_queue_company ON public.reminder_queue USING btree (company_id, status, scheduled_at DESC);


--
-- Name: idx_reminder_queue_contact_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_queue_contact_sent ON public.reminder_queue USING btree (contact_id, sent_at DESC) WHERE (status = 'sent'::text);


--
-- Name: idx_reminder_queue_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_queue_due ON public.reminder_queue USING btree (status, scheduled_at) WHERE (status = 'pending'::text);


--
-- Name: idx_reminder_rules_agenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_agenda ON public.reminder_rules USING btree (agenda_id) WHERE (agenda_id IS NOT NULL);


--
-- Name: idx_reminder_rules_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_company ON public.reminder_rules USING btree (company_id, is_active);


--
-- Name: idx_reminder_rules_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_rules_source ON public.reminder_rules USING btree (trigger_source, is_active);


--
-- Name: idx_reminder_templates_vertical; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_templates_vertical ON public.reminder_rule_templates USING btree (vertical_slug, display_order);


--
-- Name: idx_services_bot_keywords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_bot_keywords ON public.services USING gin (bot_keywords);


--
-- Name: idx_services_company_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_company_active ON public.services USING btree (company_id, is_active);


--
-- Name: idx_services_company_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_services_company_order ON public.services USING btree (company_id, display_order);


--
-- Name: idx_tags_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_company ON public.tags USING btree (company_id, display_order);


--
-- Name: idx_tasks_assigned; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_assigned ON public.tasks USING btree (assigned_to) WHERE (assigned_to IS NOT NULL);


--
-- Name: idx_tasks_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_company ON public.tasks USING btree (company_id, completed_at, due_at);


--
-- Name: idx_tasks_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_contact ON public.tasks USING btree (contact_id) WHERE (contact_id IS NOT NULL);


--
-- Name: idx_tasks_pending_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tasks_pending_due ON public.tasks USING btree (company_id, due_at) WHERE (completed_at IS NULL);


--
-- Name: idx_templates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_active ON public.templates USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_templates_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_company ON public.whatsapp_templates USING btree (company_id);


--
-- Name: idx_templates_display_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_display_order ON public.templates USING btree (display_order);


--
-- Name: idx_templates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_status ON public.whatsapp_templates USING btree (status);


--
-- Name: idx_templates_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_updated ON public.whatsapp_templates USING btree (updated_at DESC);


--
-- Name: idx_templates_waba; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_waba ON public.whatsapp_templates USING btree (waba_id);


--
-- Name: idx_tms_by_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tms_by_member ON public.team_member_services USING btree (team_member_id);


--
-- Name: idx_tms_by_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tms_by_service ON public.team_member_services USING btree (service_id);


--
-- Name: idx_tms_offered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tms_offered ON public.team_member_services USING btree (service_id, offered) WHERE (offered = true);


--
-- Name: idx_usage_counters_company_metric; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_counters_company_metric ON public.usage_counters USING btree (company_id, metric, period_start);


--
-- Name: idx_usage_sessions_company_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_sessions_company_started ON public.usage_sessions USING btree (company_id, started_at DESC);


--
-- Name: idx_usage_sessions_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_sessions_contact ON public.usage_sessions USING btree (company_id, contact_ref, started_at DESC);


--
-- Name: idx_waitlist_agenda; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_agenda ON public.waitlist USING btree (agenda_id, status) WHERE (status = 'active'::text);


--
-- Name: idx_waitlist_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_company_status ON public.waitlist USING btree (company_id, status, created_at DESC);


--
-- Name: idx_waitlist_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_waitlist_contact ON public.waitlist USING btree (contact_id, status);


--
-- Name: menu_items_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menu_items_category_idx ON public.menu_items USING btree (category_id);


--
-- Name: menu_items_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX menu_items_company_idx ON public.menu_items USING btree (company_id);


--
-- Name: orders_company_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_company_status_idx ON public.orders USING btree (company_id);


--
-- Name: orders_public_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_public_token_idx ON public.orders USING btree (public_token);


--
-- Name: properties_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_company_idx ON public.properties USING btree (company_id);


--
-- Name: properties_public_slug_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX properties_public_slug_idx ON public.properties USING btree (public_slug);


--
-- Name: uniq_company_template_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_company_template_primary ON public.company_templates USING btree (company_id) WHERE (is_primary = true);


--
-- Name: uq_messages_wamid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_messages_wamid ON public.messages USING btree (whatsapp_mid) WHERE (whatsapp_mid IS NOT NULL);


--
-- Name: waitlist_company_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX waitlist_company_status_idx ON public.waitlist USING btree (company_id);


--
-- Name: companies companies_autogenerate_slug_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER companies_autogenerate_slug_trigger BEFORE INSERT OR UPDATE OF name, slug ON public.companies FOR EACH ROW EXECUTE FUNCTION public.trg_companies_autogenerate_slug();


--
-- Name: companies companies_set_trial_ends_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER companies_set_trial_ends_at_trigger BEFORE INSERT OR UPDATE OF selected_plan_slug ON public.companies FOR EACH ROW EXECUTE FUNCTION public.companies_set_trial_ends_at();


--
-- Name: help_articles help_articles_autoslug_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER help_articles_autoslug_trigger BEFORE INSERT OR UPDATE ON public.help_articles FOR EACH ROW EXECUTE FUNCTION public.help_articles_autoslug();


--
-- Name: hubspot_integrations hubspot_integrations_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER hubspot_integrations_updated_at_trigger BEFORE UPDATE ON public.hubspot_integrations FOR EACH ROW EXECUTE FUNCTION public.trg_hubspot_integrations_updated_at();


--
-- Name: orders orders_explode_items_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_explode_items_trigger AFTER INSERT OR UPDATE OF items ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_explode_items();


--
-- Name: orders orders_sync_mirror_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_sync_mirror_insert BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_sync_mirror_insert();


--
-- Name: orders orders_sync_mirror_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_sync_mirror_update BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_sync_mirror_columns();


--
-- Name: orders orders_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_updated_at_trigger BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_orders_updated_at();


--
-- Name: services services_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER services_updated_at_trigger BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.trg_services_updated_at();


--
-- Name: team_member_services team_member_services_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER team_member_services_updated_at_trigger BEFORE UPDATE ON public.team_member_services FOR EACH ROW EXECUTE FUNCTION public.trg_services_updated_at();


--
-- Name: orders trg_ensure_order_tokens; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_order_tokens BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.ensure_order_tokens();


--
-- Name: whatsapp_templates trg_fill_template_company; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_fill_template_company BEFORE INSERT OR UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.fill_template_company_id();


--
-- Name: invoices trg_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_set_updated_at();


--
-- Name: menu_items trg_menu_item_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_menu_item_slug BEFORE INSERT OR UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.set_menu_item_public_slug();


--
-- Name: properties trg_property_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_property_slug BEFORE INSERT OR UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_property_public_slug();


--
-- Name: tags trg_tags_touch_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tags_touch_updated BEFORE UPDATE ON public.tags FOR EACH ROW EXECUTE FUNCTION public.touch_tags_updated_at();


--
-- Name: waitlist trg_waitlist_touch_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_waitlist_touch_updated BEFORE UPDATE ON public.waitlist FOR EACH ROW EXECUTE FUNCTION public.touch_waitlist_updated_at();


--
-- Name: appointments trigger_appointment_adjust_reminders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_appointment_adjust_reminders AFTER UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.on_appointment_update_adjust_reminders();


--
-- Name: appointments trigger_appointment_schedule_reminders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_appointment_schedule_reminders AFTER INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.on_appointment_insert_schedule_reminders();


--
-- Name: appointments trigger_log_appointment_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_appointment_insert AFTER INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.log_appointment_insert();


--
-- Name: appointments trigger_log_appointment_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_log_appointment_update BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.log_appointment_update();


--
-- Name: messages trigger_message_detect_reminder_response; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_message_detect_reminder_response AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.on_message_detect_reminder_response();


--
-- Name: contacts trigger_notify_human_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_human_request AFTER UPDATE OF ai_active ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.notify_human_request();


--
-- Name: messages trigger_notify_new_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_new_message AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();


--
-- Name: reminder_rules trigger_reminder_rules_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_reminder_rules_updated BEFORE UPDATE ON public.reminder_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: companies trigger_set_trial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_trial BEFORE INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_company_trial_expiry();


--
-- Name: tasks trigger_tasks_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trigger_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: messages trigger_track_message_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_track_message_activity AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.track_message_activity();


--
-- Name: addons addons_requires_template_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addons
    ADD CONSTRAINT addons_requires_template_fkey FOREIGN KEY (requires_template) REFERENCES public.templates(id) ON DELETE SET NULL;


--
-- Name: agendas agendas_bot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_bot_id_fkey FOREIGN KEY (bot_id) REFERENCES public.bots(id) ON DELETE CASCADE;


--
-- Name: agendas agendas_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: agendas agendas_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: agendas agendas_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agendas
    ADD CONSTRAINT agendas_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.team(id) ON DELETE CASCADE;


--
-- Name: appointment_history appointment_history_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_history
    ADD CONSTRAINT appointment_history_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: appointment_history appointment_history_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_history
    ADD CONSTRAINT appointment_history_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: appointment_history appointment_history_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_history
    ADD CONSTRAINT appointment_history_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.contacts(id);


--
-- Name: appointments appointments_agenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_agenda_id_fkey FOREIGN KEY (agenda_id) REFERENCES public.agendas(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.team(id);


--
-- Name: bots bots_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bots
    ADD CONSTRAINT bots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: companies companies_plan_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_plan_slug_fkey FOREIGN KEY (plan_slug) REFERENCES public.plans(slug) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: companies companies_selected_plan_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_selected_plan_slug_fkey FOREIGN KEY (selected_plan_slug) REFERENCES public.plans(slug) ON DELETE SET NULL;


--
-- Name: company_addons company_addons_addon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_addons
    ADD CONSTRAINT company_addons_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES public.addons(id) ON DELETE RESTRICT;


--
-- Name: company_addons company_addons_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_addons
    ADD CONSTRAINT company_addons_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_templates company_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_templates
    ADD CONSTRAINT company_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_templates company_templates_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_templates
    ADD CONSTRAINT company_templates_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE RESTRICT;


--
-- Name: contact_opt_outs contact_opt_outs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_opt_outs
    ADD CONSTRAINT contact_opt_outs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: contact_tags contact_tags_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_tags contact_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_tags
    ADD CONSTRAINT contact_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_referred_by_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_referred_by_contact_id_fkey FOREIGN KEY (referred_by_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.team(id) ON DELETE SET NULL;


--
-- Name: data_deletion_requests data_deletion_requests_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_deletion_requests
    ADD CONSTRAINT data_deletion_requests_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: disabled_slots disabled_slots_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disabled_slots
    ADD CONSTRAINT disabled_slots_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: team doctors_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team
    ADD CONSTRAINT doctors_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: hubspot_integrations hubspot_integrations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hubspot_integrations
    ADD CONSTRAINT hubspot_integrations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: knowledge_files knowledge_files_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_files
    ADD CONSTRAINT knowledge_files_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: locations locations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: menu_categories menu_categories_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_categories
    ADD CONSTRAINT menu_categories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: messages messages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: operator_audit_log operator_audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator_audit_log
    ADD CONSTRAINT operator_audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_menu_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: contacts patients_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT patients_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id);


--
-- Name: contacts patients_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT patients_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: properties properties_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.properties
    ADD CONSTRAINT properties_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: reminder_queue reminder_queue_appointment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_queue
    ADD CONSTRAINT reminder_queue_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: reminder_queue reminder_queue_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_queue
    ADD CONSTRAINT reminder_queue_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: reminder_queue reminder_queue_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_queue
    ADD CONSTRAINT reminder_queue_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: reminder_queue reminder_queue_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_queue
    ADD CONSTRAINT reminder_queue_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.reminder_rules(id) ON DELETE CASCADE;


--
-- Name: reminder_rules reminder_rules_agenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_agenda_id_fkey FOREIGN KEY (agenda_id) REFERENCES public.agendas(id) ON DELETE CASCADE;


--
-- Name: reminder_rules reminder_rules_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rules
    ADD CONSTRAINT reminder_rules_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: services services_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: site_industries site_industries_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_industries
    ADD CONSTRAINT site_industries_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.templates(id) ON DELETE SET NULL;


--
-- Name: tags tags_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.team(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: team_member_services team_member_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_member_services
    ADD CONSTRAINT team_member_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: team_member_services team_member_services_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_member_services
    ADD CONSTRAINT team_member_services_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team(id) ON DELETE CASCADE;


--
-- Name: usage_counters usage_counters_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_counters
    ADD CONSTRAINT usage_counters_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: usage_sessions usage_sessions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usage_sessions
    ADD CONSTRAINT usage_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: waitlist waitlist_agenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_agenda_id_fkey FOREIGN KEY (agenda_id) REFERENCES public.agendas(id) ON DELETE SET NULL;


--
-- Name: waitlist waitlist_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: waitlist waitlist_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: waitlist waitlist_notified_agenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_notified_agenda_id_fkey FOREIGN KEY (notified_agenda_id) REFERENCES public.agendas(id) ON DELETE SET NULL;


--
-- Name: whatsapp_quality_events whatsapp_quality_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_quality_events
    ADD CONSTRAINT whatsapp_quality_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_templates whatsapp_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: working_hours working_hours_agenda_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_hours
    ADD CONSTRAINT working_hours_agenda_id_fkey FOREIGN KEY (agenda_id) REFERENCES public.agendas(id) ON DELETE CASCADE;


--
-- Name: working_hours working_hours_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.working_hours
    ADD CONSTRAINT working_hours_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: locations Acceso a locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Acceso a locations" ON public.locations USING ((auth.role() = 'authenticated'::text));


--
-- Name: notifications Actualizar notificaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Actualizar notificaciones" ON public.notifications FOR UPDATE USING (true);


--
-- Name: addons Addons: admin escribe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Addons: admin escribe" ON public.addons TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());


--
-- Name: addons Addons: lectura pública de activos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Addons: lectura pública de activos" ON public.addons FOR SELECT USING (((is_active = true) OR (auth.role() = 'service_role'::text)));


--
-- Name: addons Addons: service_role escribe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Addons: service_role escribe" ON public.addons USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: companies Admins pueden ver todo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins pueden ver todo" ON public.companies USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));


--
-- Name: contacts Aislamiento de Pacientes por Clínica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Aislamiento de Pacientes por Clínica" ON public.contacts USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: company_addons CompanyAddons: select por miembro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "CompanyAddons: select por miembro" ON public.company_addons FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: company_addons CompanyAddons: service_role escribe (webhook); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "CompanyAddons: service_role escribe (webhook)" ON public.company_addons USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: company_templates CompanyTemplates: insert/update/delete por miembro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "CompanyTemplates: insert/update/delete por miembro" ON public.company_templates USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (auth.role() = 'service_role'::text))) WITH CHECK (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: company_templates CompanyTemplates: select por miembro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "CompanyTemplates: select por miembro" ON public.company_templates FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: companies Duenos ven su propia clinica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Duenos ven su propia clinica" ON public.companies FOR SELECT USING (true);


--
-- Name: contacts Empresas ven sus pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Empresas ven sus pacientes" ON public.contacts USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: notifications Insertar notificaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insertar notificaciones" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: notifications Lectura de notificaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura de notificaciones" ON public.notifications FOR SELECT USING (true);


--
-- Name: landing_features Lectura pública landing_features; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública landing_features" ON public.landing_features FOR SELECT USING (true);


--
-- Name: landing_hero_slides Lectura pública landing_hero_slides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública landing_hero_slides" ON public.landing_hero_slides FOR SELECT USING (true);


--
-- Name: landing_scroll_sections Lectura pública landing_scroll_sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública landing_scroll_sections" ON public.landing_scroll_sections FOR SELECT USING (true);


--
-- Name: landing_settings Lectura pública landing_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lectura pública landing_settings" ON public.landing_settings FOR SELECT USING (true);


--
-- Name: contact_tags Members can manage their company contact_tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can manage their company contact_tags" ON public.contact_tags USING ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_tags.contact_id) AND (c.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_tags.contact_id) AND (c.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))));


--
-- Name: tags Members can manage their company tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can manage their company tags" ON public.tags USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: waitlist Members can manage their company waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can manage their company waitlist" ON public.waitlist USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_tags Members can view their company contact_tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their company contact_tags" ON public.contact_tags FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_tags.contact_id) AND (c.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))));


--
-- Name: tags Members can view their company tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their company tags" ON public.tags FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: waitlist Members can view their company waitlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their company waitlist" ON public.waitlist FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Pase libre para actualizar perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pase libre para actualizar perfil" ON public.profiles FOR UPDATE USING (true);


--
-- Name: companies Pase libre para crear clinica; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pase libre para crear clinica" ON public.companies FOR INSERT WITH CHECK (true);


--
-- Name: profiles Pase libre para crear perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pase libre para crear perfil" ON public.profiles FOR INSERT WITH CHECK (true);


--
-- Name: landing_features Permitir actualizaciones landing_features; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir actualizaciones landing_features" ON public.landing_features USING (true) WITH CHECK (true);


--
-- Name: landing_hero_slides Permitir actualizaciones landing_hero_slides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir actualizaciones landing_hero_slides" ON public.landing_hero_slides USING (true) WITH CHECK (true);


--
-- Name: landing_scroll_sections Permitir actualizaciones landing_scroll_sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir actualizaciones landing_scroll_sections" ON public.landing_scroll_sections USING (true) WITH CHECK (true);


--
-- Name: landing_settings Permitir actualizaciones landing_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir actualizaciones landing_settings" ON public.landing_settings USING (true) WITH CHECK (true);


--
-- Name: companies Permitir actualizar companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir actualizar companies" ON public.companies FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: contacts Permitir actualizar pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir actualizar pacientes" ON public.contacts FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: contacts Permitir borrar pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir borrar pacientes" ON public.contacts FOR DELETE USING (true);


--
-- Name: messages Permitir gestión de mensajes por empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir gestión de mensajes por empresa" ON public.messages TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: messages Permitir inserción desde n8n; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir inserción desde n8n" ON public.messages FOR INSERT WITH CHECK (true);


--
-- Name: contacts Permitir insertar pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir insertar pacientes" ON public.contacts FOR INSERT WITH CHECK (true);


--
-- Name: help_articles Permitir lectura a todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir lectura a todos" ON public.help_articles FOR SELECT USING (true);


--
-- Name: messages Permitir lectura de mensajes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir lectura de mensajes" ON public.messages FOR SELECT USING (true);


--
-- Name: contacts Permitir lectura de pacientes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir lectura de pacientes" ON public.contacts FOR SELECT USING (true);


--
-- Name: help_articles Permitir todo a service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo a service role" ON public.help_articles USING (true);


--
-- Name: appointments Permitir todo en appointments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo en appointments" ON public.appointments USING (true) WITH CHECK (true);


--
-- Name: disabled_slots Permitir todo en disabled_slots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo en disabled_slots" ON public.disabled_slots USING (true) WITH CHECK (true);


--
-- Name: working_hours Permitir todo en working_hours; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir todo en working_hours" ON public.working_hours USING (true) WITH CHECK (true);


--
-- Name: plans Plans: admin escribe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Plans: admin escribe" ON public.plans TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());


--
-- Name: plans Plans: lectura pública; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Plans: lectura pública" ON public.plans FOR SELECT USING (true);


--
-- Name: plans Plans: service_role escribe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Plans: service_role escribe" ON public.plans USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: profiles Privacidad de perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Privacidad de perfil" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: notifications Sistema inserta notificaciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sistema inserta notificaciones" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: templates Templates: admin escribe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Templates: admin escribe" ON public.templates TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());


--
-- Name: templates Templates: lectura pública de activos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Templates: lectura pública de activos" ON public.templates FOR SELECT USING (((is_active = true) OR (auth.role() = 'service_role'::text)));


--
-- Name: templates Templates: service_role escribe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Templates: service_role escribe" ON public.templates USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: usage_counters Usage: select por miembro; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usage: select por miembro" ON public.usage_counters FOR SELECT USING (((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))) OR (auth.role() = 'service_role'::text)));


--
-- Name: usage_counters Usage: service_role escribe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usage: service_role escribe" ON public.usage_counters USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: contacts Users can manage company contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage company contacts" ON public.contacts USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: messages Users can manage company messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage company messages" ON public.messages USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: team Users can manage company team; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage company team" ON public.team USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: companies Users can see their own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can see their own company" ON public.companies FOR SELECT USING ((id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contacts Users can see their own contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can see their own contacts" ON public.contacts FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can see their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can see their own profile" ON public.profiles FOR SELECT USING ((id = auth.uid()));


--
-- Name: companies Users can update their own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own company" ON public.companies FOR UPDATE USING ((id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: companies Users can view their own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own company" ON public.companies FOR SELECT USING ((id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: companies Usuarios editan su propia empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios editan su propia empresa" ON public.companies FOR UPDATE USING ((id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: integrations Usuarios gestionan sus propias integraciones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios gestionan sus propias integraciones" ON public.integrations TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: agendas Usuarios pueden gestionar agendas de su empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden gestionar agendas de su empresa" ON public.agendas TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: disabled_slots Usuarios pueden gestionar bloqueos de su empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden gestionar bloqueos de su empresa" ON public.disabled_slots TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: working_hours Usuarios pueden gestionar horarios de su empresa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden gestionar horarios de su empresa" ON public.working_hours TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: addons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;

--
-- Name: agendas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agendas ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointment_history ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: appointment_history appt_history_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appt_history_insert ON public.appointment_history FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = appointment_history.company_id)))));


--
-- Name: appointment_history appt_history_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY appt_history_select ON public.appointment_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = appointment_history.company_id)))));


--
-- Name: operator_audit_log audit_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_company_read ON public.operator_audit_log FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: operator_audit_log audit_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_service_all ON public.operator_audit_log USING (true);


--
-- Name: bot_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bot_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: bot_locks bot_locks_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bot_locks_insert ON public.bot_locks FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: bot_locks bot_locks_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bot_locks_select_own ON public.bot_locks FOR SELECT TO authenticated, anon USING (true);


--
-- Name: bots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_addons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_addons ENABLE ROW LEVEL SECURITY;

--
-- Name: services company_admins_can_write_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_admins_can_write_services ON public.services TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((COALESCE(profiles.is_admin, false) = true) OR (profiles.role = 'admin'::text)))))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((COALESCE(profiles.is_admin, false) = true) OR (profiles.role = 'admin'::text))))));


--
-- Name: team_member_services company_admins_can_write_tms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_admins_can_write_tms ON public.team_member_services TO authenticated USING ((team_member_id IN ( SELECT t.id
   FROM (public.team t
     JOIN public.profiles p ON ((p.company_id = t.company_id)))
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_admin, false) = true))))) WITH CHECK ((team_member_id IN ( SELECT t.id
   FROM (public.team t
     JOIN public.profiles p ON ((p.company_id = t.company_id)))
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_admin, false) = true)))));


--
-- Name: hubspot_integrations company_admins_write_hubspot; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_admins_write_hubspot ON public.hubspot_integrations TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((COALESCE(profiles.is_admin, false) = true) OR (profiles.role = 'admin'::text)))))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((COALESCE(profiles.is_admin, false) = true) OR (profiles.role = 'admin'::text))))));


--
-- Name: menu_categories company_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_select ON public.menu_categories FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: menu_items company_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_select ON public.menu_items FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: orders company_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_select ON public.orders FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: properties company_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_select ON public.properties FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: waitlist company_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_select ON public.waitlist FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: menu_categories company_isolation_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_write ON public.menu_categories USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: menu_items company_isolation_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_write ON public.menu_items USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: orders company_isolation_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_write ON public.orders USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: properties company_isolation_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_write ON public.properties USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: waitlist company_isolation_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_isolation_write ON public.waitlist USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: services company_members_can_read_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_members_can_read_services ON public.services FOR SELECT TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: team_member_services company_members_can_read_tms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_members_can_read_tms ON public.team_member_services FOR SELECT TO authenticated USING ((team_member_id IN ( SELECT t.id
   FROM (public.team t
     JOIN public.profiles p ON ((p.company_id = t.company_id)))
  WHERE (p.id = auth.uid()))));


--
-- Name: hubspot_integrations company_members_read_hubspot; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_members_read_hubspot ON public.hubspot_integrations FOR SELECT TO authenticated USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: company_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_opt_outs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_opt_outs ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: data_deletion_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: data_deletion_requests ddr_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ddr_admin_all ON public.data_deletion_requests USING (true);


--
-- Name: data_deletion_requests ddr_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ddr_admin_read ON public.data_deletion_requests FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: disabled_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.disabled_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: help_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: help_articles help_articles_read_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY help_articles_read_public ON public.help_articles FOR SELECT USING ((is_public = true));


--
-- Name: hubspot_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hubspot_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_company_read ON public.invoices FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: invoices invoices_service_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_service_all ON public.invoices USING (true);


--
-- Name: knowledge_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_features; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_features ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_features landing_features_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_features_admin_write ON public.landing_features TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: landing_features landing_features_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_features_read_all ON public.landing_features FOR SELECT USING (true);


--
-- Name: landing_hero_slides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_hero_slides ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_hero_slides landing_hero_slides_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_hero_slides_admin_write ON public.landing_hero_slides TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: landing_hero_slides landing_hero_slides_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_hero_slides_read_all ON public.landing_hero_slides FOR SELECT USING (true);


--
-- Name: landing_scroll_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_scroll_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_scroll_sections landing_scroll_sections_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_scroll_sections_admin_write ON public.landing_scroll_sections TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: landing_scroll_sections landing_scroll_sections_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_scroll_sections_read_all ON public.landing_scroll_sections FOR SELECT USING (true);


--
-- Name: landing_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: landing_settings landing_settings_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_settings_admin_write ON public.landing_settings TO authenticated USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());


--
-- Name: landing_settings landing_settings_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY landing_settings_read_all ON public.landing_settings FOR SELECT USING (true);


--
-- Name: locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories menu_categories_company_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_company_all ON public.menu_categories TO authenticated USING (public.user_belongs_to_company(company_id)) WITH CHECK (public.user_belongs_to_company(company_id));


--
-- Name: menu_categories menu_categories_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_categories_public_read ON public.menu_categories FOR SELECT USING (true);


--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_items menu_items_company_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_items_company_all ON public.menu_items TO authenticated USING (public.user_belongs_to_company(company_id)) WITH CHECK (public.user_belongs_to_company(company_id));


--
-- Name: menu_items menu_items_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY menu_items_public_read ON public.menu_items FOR SELECT USING (true);


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: operator_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operator_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_opt_outs opt_outs_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY opt_outs_company_read ON public.contact_opt_outs FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_opt_outs opt_outs_company_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY opt_outs_company_write ON public.contact_opt_outs USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_company_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_company_all ON public.order_items TO authenticated USING (public.user_belongs_to_company(company_id)) WITH CHECK (public.user_belongs_to_company(company_id));


--
-- Name: order_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_history order_status_history_company_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_status_history_company_all ON public.order_status_history TO authenticated USING ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE public.user_belongs_to_company(orders.company_id)))) WITH CHECK ((order_id IN ( SELECT orders.id
   FROM public.orders
  WHERE public.user_belongs_to_company(orders.company_id))));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_company_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_company_all ON public.orders TO authenticated USING (public.user_belongs_to_company(company_id)) WITH CHECK (public.user_belongs_to_company(company_id));


--
-- Name: orders orders_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_company_read ON public.orders FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: orders orders_company_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_company_write ON public.orders USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: orders orders_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_public_read ON public.orders FOR SELECT USING (true);


--
-- Name: orders orders_public_token_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_public_token_read ON public.orders FOR SELECT TO anon USING ((public_token IS NOT NULL));


--
-- Name: order_status_history osh_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY osh_insert ON public.order_status_history FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: order_status_history osh_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY osh_select ON public.order_status_history FOR SELECT USING (true);


--
-- Name: plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: platform_settings platform_settings_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_settings_admin_write ON public.platform_settings TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.is_admin = true)))));


--
-- Name: platform_settings platform_settings_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platform_settings_select_all ON public.platform_settings FOR SELECT TO authenticated, anon USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: properties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_categories public_menu_cats_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_menu_cats_select ON public.menu_categories FOR SELECT USING ((is_active = true));


--
-- Name: menu_items public_menu_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_menu_select ON public.menu_items FOR SELECT USING (((is_available = true) AND (public_slug IS NOT NULL)));


--
-- Name: orders public_orders_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_orders_select ON public.orders FOR SELECT USING ((public_token IS NOT NULL));


--
-- Name: properties public_properties_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_properties_select ON public.properties FOR SELECT USING (((status = 'active'::text) AND (public_slug IS NOT NULL)));


--
-- Name: whatsapp_quality_events quality_events_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quality_events_company_read ON public.whatsapp_quality_events FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: whatsapp_quality_events quality_events_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quality_events_service_write ON public.whatsapp_quality_events FOR INSERT WITH CHECK (true);


--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_queue reminder_queue_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reminder_queue_select ON public.reminder_queue FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = reminder_queue.company_id)))));


--
-- Name: reminder_rule_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_rule_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: reminder_rules reminder_rules_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reminder_rules_select ON public.reminder_rules FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = reminder_rules.company_id)))));


--
-- Name: reminder_rules reminder_rules_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reminder_rules_write ON public.reminder_rules TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = reminder_rules.company_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = reminder_rules.company_id)))));


--
-- Name: reminder_rule_templates reminder_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reminder_templates_select ON public.reminder_rule_templates FOR SELECT TO authenticated USING (true);


--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: site_faqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_faqs ENABLE ROW LEVEL SECURITY;

--
-- Name: site_faqs site_faqs_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_faqs_admin_write ON public.site_faqs USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.role = 'admin'::text))))));


--
-- Name: site_faqs site_faqs_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_faqs_read_all ON public.site_faqs FOR SELECT USING ((visible = true));


--
-- Name: site_features; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_features ENABLE ROW LEVEL SECURITY;

--
-- Name: site_features site_features_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_features_admin_write ON public.site_features USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.role = 'admin'::text))))));


--
-- Name: site_features site_features_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_features_read_all ON public.site_features FOR SELECT USING ((visible = true));


--
-- Name: site_industries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_industries ENABLE ROW LEVEL SECURITY;

--
-- Name: site_industries site_industries_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_industries_admin_write ON public.site_industries USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.role = 'admin'::text))))));


--
-- Name: site_industries site_industries_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_industries_read_all ON public.site_industries FOR SELECT USING ((visible = true));


--
-- Name: site_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: site_integrations site_integrations_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_integrations_admin_write ON public.site_integrations USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.role = 'admin'::text))))));


--
-- Name: site_integrations site_integrations_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_integrations_read_all ON public.site_integrations FOR SELECT USING ((visible = true));


--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings site_settings_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_settings_admin_write ON public.site_settings USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.role = 'admin'::text))))));


--
-- Name: site_settings site_settings_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_settings_read_all ON public.site_settings FOR SELECT USING (true);


--
-- Name: site_testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: site_testimonials site_testimonials_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_testimonials_admin_write ON public.site_testimonials USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_admin = true) OR (profiles.role = 'admin'::text))))));


--
-- Name: site_testimonials site_testimonials_read_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY site_testimonials_read_all ON public.site_testimonials FOR SELECT USING ((visible = true));


--
-- Name: tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = tasks.company_id)))));


--
-- Name: tasks tasks_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_write ON public.tasks TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = tasks.company_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.company_id = tasks.company_id)))));


--
-- Name: team; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team ENABLE ROW LEVEL SECURITY;

--
-- Name: team_member_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_member_services ENABLE ROW LEVEL SECURITY;

--
-- Name: templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_templates templates_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY templates_company_read ON public.whatsapp_templates FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: whatsapp_templates templates_service_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY templates_service_write ON public.whatsapp_templates USING (true);


--
-- Name: usage_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.usage_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: usage_sessions usage_sessions_company_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY usage_sessions_company_read ON public.usage_sessions FOR SELECT TO authenticated USING (public.user_belongs_to_company(company_id));


--
-- Name: waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_quality_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_quality_events ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: working_hours; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


