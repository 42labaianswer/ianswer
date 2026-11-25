-- Cada agenda guarda su propio horario: la unicidad de working_hours es por
-- (agenda_id, day_of_week), no por empresa. Con UNIQUE (company_id, day_of_week)
-- solo la primera agenda de la empresa puede tener horario.

-- 1. Ver qué restricciones únicas tiene hoy la tabla
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.working_hours'::regclass and contype = 'u';

-- 2. Debe devolver 0 filas antes de crear la nueva restricción
select agenda_id, day_of_week, count(*)
from public.working_hours
group by agenda_id, day_of_week
having count(*) > 1;

-- 3. Cambiar la restricción
begin;
alter table public.working_hours drop constraint if exists working_hours_company_id_day_of_week_key;
alter table public.working_hours add constraint working_hours_agenda_id_day_of_week_key unique (agenda_id, day_of_week);
commit;

-- 4. Agendas sin horario (las creadas mientras la restricción vieja lo impedía).
--    Después del paso 3 se les puede poner el horario desde Configuración > Horarios.
select a.id, a.company_id, a.name
from public.agendas a
where not exists (select 1 from public.working_hours w where w.agenda_id = a.id);
