-- team.title es "Puesto / Título" para todas las industrias: sin valor por
-- defecto médico. Primero pruebas, luego producción.
ALTER TABLE public.team ALTER COLUMN title SET DEFAULT '';

-- Miembros que se quedaron con el 'Dr.' por defecto (revisar antes de limpiar:
-- en una clínica puede ser un título real)
-- select t.full_name, t.title, c.name as empresa, ct.template_id
-- from team t
-- join companies c on c.id = t.company_id
-- left join company_templates ct on ct.company_id = c.id and ct.is_primary
-- where t.title = 'Dr.';
