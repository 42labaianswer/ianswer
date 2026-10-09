-- Quita la unicidad global de contacts.external_id: un mismo número puede ser
-- cliente de varias empresas. La unicidad por empresa la mantiene
-- contacts_company_external_uk (company_id, external_id).
--
-- Requisito: los nodos de n8n que buscan o actualizan contacts deben filtrar
-- también por company_id con "Must Match: All Select Conditions"
-- (docs/Semana 6/n8n-cambios-bloque4.md, paso 2).

-- 1. Debe devolver 1 fila
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.contacts'::regclass
  and conname = 'contacts_company_external_uk';

-- 2.
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS unique_external_id;
