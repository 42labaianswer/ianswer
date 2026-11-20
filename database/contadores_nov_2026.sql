-- ============================================================================
-- contadores_nov_2026.sql — bloque B: tres contadores por periodo de cobro
--
-- Requiere planes_nov_2026.sql (columnas max_ai_replies_per_month y
-- max_reminders_per_month). Idempotente. Se puede correr en producción en
-- cualquier momento después de planes_nov_2026.sql.
--
-- Métricas en usage_counters (una fila por empresa, métrica y periodo):
--   ai_replies         cada mensaje que guarda el asistente (sender
--                      'asistente'). Lo cuenta un trigger en messages, así
--                      que cubre WhatsApp, Instagram, Facebook y el widget
--                      web sin tocar los flujos. No cuentan los mensajes del
--                      cliente ni los que manda una persona desde el inbox.
--   reminders          cada recordatorio que pasa a 'sent' en reminder_queue.
--   campaign_messages  mensajes de marketing (ya existía; se reserva al
--                      crear la campaña y se devuelve lo que Meta rechaza).
--
-- El periodo es mensual y empieza el día de corte de cada empresa (el día
-- de current_period_ends_at de Stripe; en prueba, el día en que empezó la
-- prueba). Los planes anuales también se cuentan por mes. Los límites salen
-- de get_company_entitlements, así que los add-ons que den capacity_grants
-- con max_ai_replies_per_month, max_reminders_per_month o
-- max_campaign_messages_per_month suman solos.
--
-- Avisos: al cruzar el 80% y el 100% de cada métrica se crea una
-- notificación en el panel y una fila en usage_alerts, que la ruta
-- /api/cron/usage-alerts manda por correo.
--
-- Al 100% de ai_replies, n8n llama a ai_reply_gate antes del agente: la
-- conversación pasa a una persona (ai_active = false) y el cliente recibe
-- un mensaje de que en un momento lo atienden.
--
-- No borra el contador de sesiones (usage_sessions, touch_session,
-- can_open_session, get_usage_current_month). Se retira cuando lo nuevo
-- lleve un tiempo funcionando.
-- ============================================================================

BEGIN;

-- ─── Periodo de cobro ───────────────────────────────────────────────────────

-- Inicio y fin del periodo mensual que contiene p_at, contado desde el día
-- de corte p_anchor. Si el día de corte no existe en el mes (31 en
-- febrero), Postgres usa el último día del mes.
CREATE OR REPLACE FUNCTION public.monthly_period_from_anchor(p_anchor timestamptz, p_at timestamptz DEFAULT now())
RETURNS TABLE(period_start timestamptz, period_end timestamptz)
LANGUAGE plpgsql STABLE
SET search_path = public
AS $$
DECLARE
  v_k integer;
BEGIN
  v_k := (extract(year FROM p_at)::integer - extract(year FROM p_anchor)::integer) * 12
       + (extract(month FROM p_at)::integer - extract(month FROM p_anchor)::integer);
  IF p_anchor + make_interval(months => v_k) > p_at THEN
    v_k := v_k - 1;
  END IF;
  period_start := p_anchor + make_interval(months => v_k);
  period_end   := p_anchor + make_interval(months => v_k + 1);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_billing_period(p_company_id uuid)
RETURNS TABLE(period_start timestamptz, period_end timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.period_start, p.period_end
  FROM public.companies c,
       LATERAL public.monthly_period_from_anchor(
         coalesce(c.current_period_ends_at, c.subscription_started_at, c.trial_starts_at, c.created_at, date_trunc('month', now()))
       ) p
  WHERE c.id = p_company_id;
$$;

-- ─── Límites ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.usage_capacity_key(p_metric text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_metric
    WHEN 'ai_replies'        THEN 'max_ai_replies_per_month'
    WHEN 'reminders'         THEN 'max_reminders_per_month'
    WHEN 'campaign_messages' THEN 'max_campaign_messages_per_month'
  END;
$$;

-- Límite del periodo (plan + add-ons). NULL = sin límite configurado.
CREATE OR REPLACE FUNCTION public.company_usage_limit(p_company_id uuid, p_metric text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.get_company_entitlements(p_company_id) -> 'capacity' ->> public.usage_capacity_key(p_metric))::integer;
$$;

-- ─── Avisos al 80% y al 100% ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.usage_alerts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric       text NOT NULL,
  period_start timestamptz NOT NULL,
  threshold    integer NOT NULL CHECK (threshold IN (80, 100)),
  used         integer NOT NULL,
  usage_limit  integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  emailed_at   timestamptz,
  UNIQUE (company_id, metric, period_start, threshold)
);

CREATE INDEX IF NOT EXISTS idx_usage_alerts_pending_email
  ON public.usage_alerts (created_at) WHERE emailed_at IS NULL;

ALTER TABLE public.usage_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usage alerts: select por miembro" ON public.usage_alerts;
CREATE POLICY "Usage alerts: select por miembro" ON public.usage_alerts
  FOR SELECT USING (
    company_id IN (SELECT profiles.company_id FROM public.profiles WHERE profiles.id = auth.uid())
    OR public.is_platform_admin()
  );

-- Crea el aviso (una vez por métrica, periodo y umbral) si p_old → p_new
-- cruzó el 80% o el 100% de p_limit.
CREATE OR REPLACE FUNCTION public.usage_check_alerts(
  p_company_id uuid, p_metric text, p_period_start timestamptz,
  p_old integer, p_new integer, p_limit integer
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_threshold integer;
  v_inserted  integer;
  v_label     text;
  v_title     text;
  v_message   text;
  v_end       timestamptz;
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN RETURN; END IF;

  v_label := CASE p_metric
    WHEN 'ai_replies'        THEN 'respuestas de IA'
    WHEN 'reminders'         THEN 'recordatorios'
    WHEN 'campaign_messages' THEN 'mensajes de marketing'
    ELSE p_metric
  END;

  SELECT period_end INTO v_end FROM public.company_billing_period(p_company_id);

  FOREACH v_threshold IN ARRAY ARRAY[80, 100] LOOP
    CONTINUE WHEN NOT (p_old * 100 < p_limit * v_threshold AND p_new * 100 >= p_limit * v_threshold);

    INSERT INTO public.usage_alerts (company_id, metric, period_start, threshold, used, usage_limit)
    VALUES (p_company_id, p_metric, p_period_start, v_threshold, p_new, p_limit)
    ON CONFLICT (company_id, metric, period_start, threshold) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    CONTINUE WHEN v_inserted = 0;

    IF v_threshold = 80 THEN
      v_title := 'Llevas el 80% de tus ' || v_label;
      v_message := 'Usaste ' || p_new || ' de ' || p_limit || ' ' || v_label || ' de este periodo. '
        || CASE p_metric
             WHEN 'ai_replies' THEN 'Al llegar al 100%, las conversaciones nuevas pasan a tu equipo.'
             WHEN 'reminders'  THEN 'Al llegar al 100%, se pausan los recordatorios.'
             ELSE 'Al llegar al 100%, no se podrán enviar más campañas.'
           END
        || ' Puedes sumar más con un complemento o subir de plan.';
    ELSE
      v_title := 'Se acabaron tus ' || v_label || ' del periodo';
      v_message := CASE p_metric
          WHEN 'ai_replies' THEN 'El asistente dejó de contestar y las conversaciones pasan a tu equipo'
          WHEN 'reminders'  THEN 'Los recordatorios quedaron en pausa'
          ELSE 'No se pueden enviar más campañas'
        END
        || ' hasta el ' || to_char(v_end AT TIME ZONE 'America/Mexico_City', 'DD/MM/YYYY')
        || '. Suma más con un complemento o sube de plan.';
    END IF;

    INSERT INTO public.notifications (company_id, title, message, type, link)
    VALUES (p_company_id, v_title, v_message, 'usage_' || v_threshold, '/dashboard/plans');
  END LOOP;
END;
$$;

-- ─── Registrar uso ──────────────────────────────────────────────────────────

-- Suma p_delta a la métrica del periodo actual y revisa los avisos.
-- Devuelve el valor nuevo.
CREATE OR REPLACE FUNCTION public.register_usage(p_company_id uuid, p_metric text, p_delta integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period timestamptz;
  v_new    integer;
BEGIN
  IF p_company_id IS NULL OR coalesce(p_delta, 0) = 0 THEN RETURN NULL; END IF;

  SELECT period_start INTO v_period FROM public.company_billing_period(p_company_id);
  IF v_period IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.usage_counters (company_id, metric, value, period_start)
  VALUES (p_company_id, p_metric, greatest(p_delta, 0), v_period)
  ON CONFLICT (company_id, metric, period_start)
  DO UPDATE SET value = greatest(public.usage_counters.value + p_delta, 0), updated_at = now()
  RETURNING value INTO v_new;

  IF p_delta > 0 THEN
    PERFORM public.usage_check_alerts(
      p_company_id, p_metric, v_period, v_new - p_delta, v_new,
      public.company_usage_limit(p_company_id, p_metric)
    );
  END IF;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.usage_used(p_company_id uuid, p_metric text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT uc.value FROM public.usage_counters uc, public.company_billing_period(p_company_id) bp
    WHERE uc.company_id = p_company_id AND uc.metric = p_metric AND uc.period_start = bp.period_start
  ), 0);
$$;

-- ─── Respuestas de IA ───────────────────────────────────────────────────────

-- ai_reply_gate guarda el mensaje de "te atiende una persona" con
-- ianswer.skip_usage = 'on' para que ese aviso no cuente como respuesta.
CREATE OR REPLACE FUNCTION public.trg_count_ai_reply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender = 'asistente' AND coalesce(current_setting('ianswer.skip_usage', true), '') <> 'on' THEN
    PERFORM public.register_usage(NEW.company_id, 'ai_replies', 1);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS count_ai_reply ON public.messages;
CREATE TRIGGER count_ai_reply
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_count_ai_reply();

-- n8n la llama antes del agente. Con saldo devuelve allowed = true. Sin
-- saldo pasa el contacto a una persona, guarda el aviso en el historial y
-- devuelve allowed = false con el texto que hay que mandar en "content".
CREATE OR REPLACE FUNCTION public.ai_reply_gate(p_company_id uuid, p_external_id text, p_channel text DEFAULT 'whatsapp')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit   integer := public.company_usage_limit(p_company_id, 'ai_replies');
  v_used    integer := public.usage_used(p_company_id, 'ai_replies');
  v_content text := 'Gracias por tu mensaje. En un momento te atiende una persona de nuestro equipo.';
BEGIN
  IF v_limit IS NULL OR v_limit <= 0 OR v_used < v_limit THEN
    RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit);
  END IF;

  UPDATE public.contacts
  SET ai_active = false
  WHERE company_id = p_company_id AND external_id = p_external_id;

  PERFORM set_config('ianswer.skip_usage', 'on', true);
  INSERT INTO public.messages (company_id, patient_id, content, sender, channel)
  VALUES (p_company_id, p_external_id, v_content, 'asistente', coalesce(p_channel, 'whatsapp'));
  PERFORM set_config('ianswer.skip_usage', 'off', true);

  RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', v_limit, 'content', v_content);
END;
$$;

-- ─── Recordatorios ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_count_reminder()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
    PERFORM public.register_usage(NEW.company_id, 'reminders', 1);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS count_reminder ON public.reminder_queue;
CREATE TRIGGER count_reminder
  AFTER INSERT OR UPDATE OF status ON public.reminder_queue
  FOR EACH ROW EXECUTE FUNCTION public.trg_count_reminder();

-- Para quien envíe los recordatorios (bloques D y E): false = en pausa.
CREATE OR REPLACE FUNCTION public.can_send_reminder(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(l <= 0, true) OR public.usage_used(p_company_id, 'reminders') < l
  FROM (SELECT public.company_usage_limit(p_company_id, 'reminders') AS l) x;
$$;

-- ─── Marketing: mismo periodo que los otros dos ─────────────────────────────

CREATE OR REPLACE FUNCTION public.get_campaign_usage(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period timestamptz;
  v_end timestamptz;
  v_used integer := public.usage_used(p_company_id, 'campaign_messages');
  v_limit integer := public.company_campaign_limit(p_company_id);
BEGIN
  SELECT period_start, period_end INTO v_period, v_end FROM public.company_billing_period(p_company_id);
  RETURN jsonb_build_object(
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_used, 0),
    'period_start', v_period,
    'period_end', v_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_campaign_messages(p_company_id uuid, p_count integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period timestamptz;
  v_used integer;
  v_limit integer;
BEGIN
  IF p_count IS NULL OR p_count <= 0 THEN
    RAISE EXCEPTION 'No hay destinatarios' USING ERRCODE = 'P0001';
  END IF;

  SELECT period_start INTO v_period FROM public.company_billing_period(p_company_id);

  INSERT INTO usage_counters (company_id, metric, value, period_start)
  VALUES (p_company_id, 'campaign_messages', 0, v_period)
  ON CONFLICT (company_id, metric, period_start) DO NOTHING;

  SELECT value INTO v_used
  FROM usage_counters
  WHERE company_id = p_company_id AND metric = 'campaign_messages' AND period_start = v_period
  FOR UPDATE;

  v_limit := company_campaign_limit(p_company_id);

  IF v_used + p_count > v_limit THEN
    RAISE EXCEPTION 'Tu plan permite % mensajes de marketing por periodo y te quedan %. Esta campaña necesita %.',
      v_limit, greatest(v_limit - v_used, 0), p_count
      USING ERRCODE = 'P0001', HINT = 'campaign_limit';
  END IF;

  UPDATE usage_counters
  SET value = value + p_count, updated_at = now()
  WHERE company_id = p_company_id AND metric = 'campaign_messages' AND period_start = v_period;

  PERFORM public.usage_check_alerts(p_company_id, 'campaign_messages', v_period, v_used, v_used + p_count, v_limit);

  RETURN jsonb_build_object(
    'used', v_used + p_count,
    'limit', v_limit,
    'remaining', v_limit - v_used - p_count,
    'period_start', v_period
  );
END;
$$;

-- Lo que ya se reservó este mes calendario pasa al periodo de cobro actual,
-- para que nadie recupere saldo por el cambio de periodo.
UPDATE public.usage_counters uc
SET period_start = bp.period_start, updated_at = now()
FROM public.companies c, LATERAL public.company_billing_period(c.id) bp
WHERE uc.company_id = c.id
  AND uc.metric = 'campaign_messages'
  AND uc.period_start = date_trunc('month', now())
  AND uc.period_start <> bp.period_start
  AND NOT EXISTS (
    SELECT 1 FROM public.usage_counters x
    WHERE x.company_id = uc.company_id AND x.metric = 'campaign_messages' AND x.period_start = bp.period_start
  );

-- ─── Resumen para el panel ──────────────────────────────────────────────────

-- { period_start, period_end, metrics: { ai_replies: {used, limit}, ... } }
-- limit NULL = sin límite configurado.
CREATE OR REPLACE FUNCTION public.get_usage_summary(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end   timestamptz;
  v_cap   jsonb;
  v_metrics jsonb := '{}'::jsonb;
  v_metric text;
BEGIN
  -- Desde el panel solo ve su empresa; el servidor (service_role) y el editor
  -- SQL (sin JWT) ven todas. current_user no sirve aquí: en SECURITY DEFINER
  -- es el dueño de la función.
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
     AND NOT public.is_platform_admin()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = p_company_id) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT period_start, period_end INTO v_start, v_end FROM public.company_billing_period(p_company_id);
  v_cap := public.get_company_entitlements(p_company_id) -> 'capacity';

  FOREACH v_metric IN ARRAY ARRAY['ai_replies', 'reminders', 'campaign_messages'] LOOP
    v_metrics := v_metrics || jsonb_build_object(v_metric, jsonb_build_object(
      'used',  coalesce((SELECT value FROM public.usage_counters
                         WHERE company_id = p_company_id AND metric = v_metric AND period_start = v_start), 0),
      'limit', (v_cap ->> public.usage_capacity_key(v_metric))::integer
    ));
  END LOOP;

  RETURN jsonb_build_object('period_start', v_start, 'period_end', v_end, 'metrics', v_metrics);
END;
$$;

-- ─── Panel admin (pestaña Uso) ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_usage_period()
RETURNS TABLE(
  company_id uuid, company_name text, plan_slug text,
  period_start timestamptz, period_end timestamptz,
  ai_replies_used integer, ai_replies_limit integer,
  reminders_used integer, reminders_limit integer,
  marketing_used integer, marketing_limit integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.name::text, coalesce(c.plan_slug, c.selected_plan_slug)::text,
    bp.period_start, bp.period_end,
    coalesce(ai.value, 0), p.max_ai_replies_per_month,
    coalesce(rm.value, 0), p.max_reminders_per_month,
    coalesce(mk.value, 0), p.max_campaign_messages_per_month
  FROM public.companies c
  LEFT JOIN public.plans p ON p.slug = coalesce(c.plan_slug, c.selected_plan_slug)
  CROSS JOIN LATERAL public.company_billing_period(c.id) bp
  LEFT JOIN public.usage_counters ai ON ai.company_id = c.id AND ai.metric = 'ai_replies'        AND ai.period_start = bp.period_start
  LEFT JOIN public.usage_counters rm ON rm.company_id = c.id AND rm.metric = 'reminders'         AND rm.period_start = bp.period_start
  LEFT JOIN public.usage_counters mk ON mk.company_id = c.id AND mk.metric = 'campaign_messages' AND mk.period_start = bp.period_start;
END;
$$;

-- ─── Permisos ───────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.company_billing_period(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.company_usage_limit(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage_check_alerts(uuid, text, timestamptz, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_usage(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usage_used(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_reply_gate(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_send_reminder(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_usage_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_campaign_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_campaign_messages(uuid, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.company_billing_period(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_usage_limit(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_usage(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.usage_used(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_reply_gate(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_send_reminder(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_usage_summary(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_campaign_messages(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.admin_usage_period() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_usage_period() TO authenticated;
GRANT SELECT ON public.usage_alerts TO authenticated;
GRANT ALL ON public.usage_alerts TO service_role;

COMMIT;

-- Verificación
-- select c.name, c.plan_slug, get_usage_summary(c.id) from companies c order by c.created_at desc limit 10;
-- select * from usage_alerts order by created_at desc limit 20;
