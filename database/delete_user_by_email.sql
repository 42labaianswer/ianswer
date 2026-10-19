-- =============================================================================
-- Borrar un usuario por email para que pueda registrarse de nuevo desde cero
-- =============================================================================
-- IRREVERSIBLE: si el usuario es el único miembro de su empresa, se borra la
-- empresa y en cascada todos sus datos (mensajes, contactos, citas, bots, etc.).
--
-- Uso:
--   1. Ejecutar el PASO 1 (diagnóstico) con el email.
--      - Si la empresa tiene stripe_customer_id / stripe_subscription_id,
--        cancelar en Stripe a mano: este script no toca Stripe.
--      - Si miembros_empresa > 1, solo se borra el usuario y la empresa queda.
--        Si era el dueño, confirmarlo con Roy antes.
--   2. Cambiar v_email en el PASO 2 y ejecutarlo.
--   3. Si el RAISE NOTICE cuadra, COMMIT; si no, ROLLBACK.
--
-- Si falla por una FK, la transacción se revierte y no se borra nada. Ejecutar
-- el PASO 0 para ver qué tabla nueva bloquea y añadirla al PASO 2.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 0 (solo si el PASO 2 falla por FK): FKs que bloquean el borrado
-- -----------------------------------------------------------------------------
-- Lista las FKs hacia auth.users o companies sin CASCADE / SET NULL.
-- A día de hoy deben salir solo: contacts.assigned_to, agendas.company_id,
-- appointment_history.company_id (las tres ya manejadas en el PASO 2).

SELECT
  con.conname AS constraint_name,
  nsp.nspname || '.' || rel.relname AS tabla,
  att.attname AS columna,
  frel.relnamespace::regnamespace || '.' || frel.relname AS referencia,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'  WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT'
  END AS on_delete,
  NOT att.attnotnull AS nullable
FROM pg_constraint con
JOIN pg_class rel       ON rel.oid = con.conrelid
JOIN pg_namespace nsp   ON nsp.oid = rel.relnamespace
JOIN pg_class frel      ON frel.oid = con.confrelid
JOIN pg_attribute att   ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
WHERE con.contype = 'f'
  AND con.confrelid IN ('auth.users'::regclass, 'public.companies'::regclass)
  AND con.confdeltype IN ('a', 'r')
  AND nsp.nspname NOT IN ('auth', 'storage')
ORDER BY referencia, tabla;


-- -----------------------------------------------------------------------------
-- PASO 1: diagnóstico
-- -----------------------------------------------------------------------------

SELECT u.id AS user_id, u.email, u.created_at, u.email_confirmed_at,
       p.company_id, p.role, c.name AS company_name, c.stripe_customer_id,
       c.stripe_subscription_id, c.account_status,
       (SELECT count(*) FROM public.profiles p2 WHERE p2.company_id = p.company_id) AS miembros_empresa
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.companies c ON c.id = p.company_id
WHERE lower(u.email) = lower('correo@ejemplo.com');


-- -----------------------------------------------------------------------------
-- PASO 2: borrado
-- -----------------------------------------------------------------------------

BEGIN;

DO $$
DECLARE
  v_email   text := 'correo@ejemplo.com';
  v_user    uuid;
  v_company uuid;
  v_members int;
  v_agendas uuid[];
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario % no encontrado', v_email;
  END IF;

  SELECT company_id INTO v_company FROM public.profiles WHERE id = v_user;
  SELECT count(*) INTO v_members FROM public.profiles WHERE company_id = v_company;

  -- contacts.assigned_to → auth.users no tiene ON DELETE
  UPDATE public.contacts SET assigned_to = NULL WHERE assigned_to = v_user;

  -- La empresa solo se borra si este usuario es su único miembro
  IF v_company IS NOT NULL AND v_members = 1 THEN
    -- Las agendas se desvinculan primero y se borran al final: así el CASCADE
    -- de companies elimina antes las citas que puedan apuntar a ellas
    SELECT array_agg(id) INTO v_agendas FROM public.agendas WHERE company_id = v_company;
    UPDATE public.agendas SET company_id = NULL WHERE company_id = v_company;
    DELETE FROM public.appointment_history WHERE company_id = v_company;

    DELETE FROM public.companies WHERE id = v_company;

    IF v_agendas IS NOT NULL THEN
      DELETE FROM public.agendas WHERE id = ANY (v_agendas);
    END IF;
  END IF;

  -- Borra en cascada profiles, email_verification_codes, sesiones, identities, etc.
  DELETE FROM auth.users WHERE id = v_user;

  RAISE NOTICE 'Borrado user % | company % | miembros %', v_user, v_company, v_members;
END $$;

COMMIT;  -- o ROLLBACK;
