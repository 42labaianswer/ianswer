-- Coexistencia de WhatsApp: el número sigue funcionando en la app de WhatsApp
-- Business del celular del cliente y además está conectado a iAnswer.
-- waba_coexistence marca cómo se conectó el número (lo escribe
-- api/whatsapp/embedded-signup/exchange). waba_coexistence_synced_at guarda
-- cuándo Meta aceptó las dos sincronizaciones (contactos e historial), que solo
-- se pueden pedir una vez y dentro de las 24 h siguientes a la conexión.
-- Solo agrega columnas con valor por defecto: no cambia nada de las empresas
-- que ya están conectadas.
-- Primero pruebas, luego producción.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS waba_coexistence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waba_coexistence_synced_at timestamptz;

COMMENT ON COLUMN public.companies.waba_coexistence IS
  'true si el número se conectó con coexistencia (sigue activo en la app de WhatsApp Business del cliente).';
COMMENT ON COLUMN public.companies.waba_coexistence_synced_at IS
  'Cuándo Meta aceptó las sincronizaciones de contactos e historial de un número en coexistencia.';
