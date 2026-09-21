-- ============================================================================
-- database/add_email_verification_codes.sql
-- ----------------------------------------------------------------------------
-- Tarea 6, parte 2 (verificación de correo en el registro).
--
-- Guarda el código de 6 dígitos (hasheado, no en texto plano) que se manda
-- por correo cuando alguien se registra. Solo se accede desde rutas de API
-- con el cliente admin (service_role) -- igual que `rate_limits`, por eso
-- RLS está activo pero sin policies para anon/authenticated.
--
-- Un solo código vivo por usuario (`user_id` es UNIQUE): registrar de nuevo
-- o pedir "reenviar código" reemplaza el código anterior con ON CONFLICT.
--
-- Cómo aplicar: pegar este script completo en el SQL Editor de Supabase
-- (Dashboard → SQL Editor → New query) y correrlo una sola vez, en el
-- proyecto de pruebas y en producción.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_verification_codes IS
  'Código de 6 dígitos (hasheado) para verificar el correo al registrarse. Un registro por usuario; se reemplaza en cada reenvío. Solo accesible vía service_role desde las rutas de API.';

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email
  ON public.email_verification_codes (email);

ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
-- Sin policies a propósito: nadie con anon/authenticated puede leer ni
-- escribir esta tabla directo. Todo el acceso pasa por rutas de API que usan
-- el cliente admin (service_role), que ignora RLS. Mismo criterio que
-- `rate_limits`.
