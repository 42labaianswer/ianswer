-- Bucket para las fotos de perfil del equipo (/dashboard/team).
-- TeamDrawer sube a `team-photos/<company_id>/<archivo>`. Público para que la
-- card y el directorio muestren la foto sin URL firmada; solo los usuarios de
-- la empresa pueden escribir en su carpeta. Primero pruebas, luego producción.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-photos', 'team-photos', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- La primera carpeta del path es el company_id. El regex evita que un path
-- mal formado truene el cast a uuid.
DROP POLICY IF EXISTS "team_photos_insert_own_company" ON storage.objects;
CREATE POLICY "team_photos_insert_own_company" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.user_belongs_to_company(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "team_photos_update_own_company" ON storage.objects;
CREATE POLICY "team_photos_update_own_company" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'team-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.user_belongs_to_company(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "team_photos_delete_own_company" ON storage.objects;
CREATE POLICY "team_photos_delete_own_company" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.user_belongs_to_company(((storage.foldername(name))[1])::uuid)
  );

-- upsert:true en el cliente necesita leer el objeto existente.
DROP POLICY IF EXISTS "team_photos_select_own_company" ON storage.objects;
CREATE POLICY "team_photos_select_own_company" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'team-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    AND public.user_belongs_to_company(((storage.foldername(name))[1])::uuid)
  );

-- Verificación
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'team-photos';
-- select policyname, cmd from pg_policies where tablename = 'objects' and policyname like 'team_photos%';
