-- Citas guardadas por la app (POST /api/appointments) y sincronizadas con
-- Google Calendar en segundo plano por el flujo de n8n "Sincronizar Cita Google".
--
-- appointments.google_sync:
--   pending  -> falta crear o mover el evento en Google
--   synced   -> el evento de Google está al día
--   failed   -> n8n no pudo sincronizar; se reintenta a mano o con el cron
--   skipped  -> la agenda no tiene Google Calendar conectado
--   NULL     -> citas creadas por otros flujos (agente, widget público)

begin;

alter table public.appointments
  add column if not exists google_sync text,
  add column if not exists google_sync_error text,
  add column if not exists google_synced_at timestamp with time zone;

alter table public.appointments drop constraint if exists appointments_google_sync_check;
alter table public.appointments
  add constraint appointments_google_sync_check
  check (google_sync is null or google_sync in ('pending', 'synced', 'failed', 'skipped'));

create index if not exists idx_appointments_google_sync_pending
  on public.appointments (google_sync, created_at)
  where google_sync in ('pending', 'failed');

alter table public.platform_settings
  add column if not exists n8n_webhook_sync_appointment text;

commit;

-- Verificación: deben salir las 3 columnas nuevas y la de platform_settings
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'appointments' and column_name in ('google_sync', 'google_sync_error', 'google_synced_at'))
    or (table_name = 'platform_settings' and column_name = 'n8n_webhook_sync_appointment')
  );
