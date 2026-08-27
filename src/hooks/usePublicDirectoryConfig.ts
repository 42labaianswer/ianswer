 

// src/hooks/usePublicDirectoryConfig.ts
// ----------------------------------------------------------------------------
// Sprint H.5 · Hooks para gestionar el branding del directorio público de
// propiedades de una company.
//
// Lee/escribe en la tabla companies (las columnas se agregaron en
// database/28_companies_public_branding_columns.sql) y sube logos al
// bucket 'branding' (el mismo que usa el master control admin).
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────
export interface PublicDirectoryConfig {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  description: string | null;
  tagline: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  phone_e164: string | null;
  website: string | null;
  public_directory_settings: Record<string, unknown>;
}

export type PublicDirectoryConfigPatch = Partial<
  Omit<PublicDirectoryConfig, 'id' | 'name'>
>;

// ─── Query: cargar config de mi company ────────────────────────────────────
export function usePublicDirectoryConfig() {
  return useQuery({
    queryKey: ['public-directory-config'],
    queryFn: async (): Promise<PublicDirectoryConfig | null> => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return null;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle();

      if (!profile?.company_id) return null;

      const { data, error } = await supabase
        .from('companies')
        .select(
          'id, name, slug, logo_url, description, tagline, primary_color, secondary_color, phone_e164, website, public_directory_settings'
        )
        .eq('id', profile.company_id)
        .maybeSingle();

      if (error) throw error;
      return data as PublicDirectoryConfig | null;
    },
    staleTime: 30 * 1000,
  });
}

// ─── Query: ¿tiene el addon activo? ────────────────────────────────────────
export function useHasPublicDirectoryAddon() {
  return useQuery({
    queryKey: ['has-public-directory-addon'],
    queryFn: async (): Promise<boolean> => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return false;

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle();

      if (!profile?.company_id) return false;

      const { data, error } = await supabase.rpc('has_public_directory_active', {
        p_company_id: profile.company_id,
      });

      if (error) {
        console.error('[useHasPublicDirectoryAddon] error:', error);
        return false;
      }
      return data === true;
    },
    staleTime: 60 * 1000,
  });
}

// ─── Mutación: actualizar config ───────────────────────────────────────────
export function useUpdatePublicDirectoryConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: PublicDirectoryConfigPatch): Promise<PublicDirectoryConfig> => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error('No autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle();

      if (!profile?.company_id) throw new Error('No se encontró la company');

      // Limpiar el patch: solo campos definidos, trim strings
      const cleanPatch: Record<string, unknown> = {};
      if (patch.slug !== undefined) {
        const cleaned = (patch.slug ?? '').trim().toLowerCase();
        // Validar formato slug: solo a-z, 0-9, guiones
        if (cleaned && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleaned)) {
          throw new Error(
            'El slug solo puede contener letras minúsculas, números y guiones (sin acentos ni espacios).'
          );
        }
        cleanPatch.slug = cleaned || null;
      }
      if (patch.logo_url !== undefined) cleanPatch.logo_url = patch.logo_url;
      if (patch.description !== undefined)
        cleanPatch.description = patch.description?.trim() || null;
      if (patch.tagline !== undefined)
        cleanPatch.tagline = patch.tagline?.trim() || null;
      if (patch.primary_color !== undefined)
        cleanPatch.primary_color = patch.primary_color || null;
      if (patch.secondary_color !== undefined)
        cleanPatch.secondary_color = patch.secondary_color || null;
      if (patch.phone_e164 !== undefined) {
        // Limpiar phone: solo dígitos
        const digits = (patch.phone_e164 ?? '').replace(/\D/g, '');
        cleanPatch.phone_e164 = digits || null;
      }
      if (patch.website !== undefined)
        cleanPatch.website = patch.website?.trim() || null;
      if (patch.public_directory_settings !== undefined)
        cleanPatch.public_directory_settings = patch.public_directory_settings;

      const { data, error } = await supabase
        .from('companies')
        .update(cleanPatch)
        .eq('id', profile.company_id)
        .select(
          'id, name, slug, logo_url, description, tagline, primary_color, secondary_color, phone_e164, website, public_directory_settings'
        )
        .single();

      if (error) {
        // Detectar conflicto de slug
        if (error.code === '23505' || /unique/i.test(error.message)) {
          throw new Error('Ese link ya está en uso por otra cuenta. Elige otro.');
        }
        throw error;
      }

      return data as PublicDirectoryConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-directory-config'] });
    },
  });
}

// ─── Mutación: subir logo al bucket 'branding' ─────────────────────────────
export function useUploadCompanyLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error('No autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle();

      if (!profile?.company_id) throw new Error('No se encontró la company');

      // Validar tipo
      if (!file.type.startsWith('image/')) {
        throw new Error('El archivo debe ser una imagen (PNG, JPG, SVG, WebP).');
      }
      // Validar tamaño (max 2MB para logos)
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('La imagen no puede pesar más de 2MB.');
      }

      const ext = file.name.split('.').pop() || 'png';
      const fileName = `company-logos/${profile.company_id}/logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('branding').getPublicUrl(fileName);

      // Actualizar la company con la nueva URL
      const { error: updateError } = await supabase
        .from('companies')
        .update({ logo_url: publicUrl })
        .eq('id', profile.company_id);

      if (updateError) throw updateError;

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-directory-config'] });
    },
  });
}
