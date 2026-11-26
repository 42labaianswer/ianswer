-- ============================================================================
-- Triggers de notificaciones como SECURITY DEFINER
--
-- notify_human_request (AFTER UPDATE OF ai_active ON contacts) y
-- notify_new_message (AFTER INSERT ON messages) insertan en notifications, que
-- no tiene política de INSERT para usuarios. Deben correr como SECURITY DEFINER;
-- si no, pasar un chat a modo humano desde Mensajes falla con
-- "Error al cambiar el estado de la IA".
--
-- Ojo: un CREATE OR REPLACE FUNCTION sin SECURITY DEFINER vuelve la función a
-- SECURITY INVOKER. Cualquier cambio futuro a estas funciones debe repetir
-- estas dos líneas.
--
-- Idempotente. Correr en pruebas y luego en producción.
-- ============================================================================

-- 1) Diagnóstico: prosecdef = false confirma el problema.
SELECT proname, prosecdef, proconfig
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('notify_human_request', 'notify_new_message');

-- 2) Arreglo
ALTER FUNCTION public.notify_human_request() SECURITY DEFINER;
ALTER FUNCTION public.notify_human_request() SET search_path = public;
ALTER FUNCTION public.notify_new_message() SECURITY DEFINER;
ALTER FUNCTION public.notify_new_message() SET search_path = public;

-- 3) Verificación: ambas filas con prosecdef = true
SELECT proname, prosecdef, proconfig
  FROM pg_proc
 WHERE pronamespace = 'public'::regnamespace
   AND proname IN ('notify_human_request', 'notify_new_message');
