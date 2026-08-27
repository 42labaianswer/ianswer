 

// src/hooks/useServices.ts
// ----------------------------------------------------------------------------
// Sprint I · Hooks para el catálogo de servicios de la company.
// Usa TanStack Query siguiendo el patrón del resto del proyecto.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────
export interface Service {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  default_price: number | null;
  currency: 'MXN' | 'USD';
  category: string | null;
  bot_keywords: string[];
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type ServiceDraft = Omit<
  Service,
  'id' | 'company_id' | 'created_at' | 'updated_at'
> & {
  id?: string;
};

// ─── Query: lista de servicios ─────────────────────────────────────────────
export function useServices(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['services', companyId],
    queryFn: async (): Promise<Service[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('company_id', companyId)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data as Service[]) ?? [];
    },
    enabled: Boolean(companyId),
    staleTime: 30 * 1000, // 30s
  });
}

// ─── Mutación: crear servicio ──────────────────────────────────────────────
export function useCreateService(companyId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (draft: ServiceDraft): Promise<Service> => {
      if (!companyId) throw new Error('companyId requerido');

      const payload = {
        company_id: companyId,
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        duration_minutes: draft.duration_minutes,
        default_price: draft.default_price,
        currency: draft.currency,
        category: draft.category?.trim() || null,
        bot_keywords: draft.bot_keywords ?? [],
        is_active: draft.is_active,
        display_order: draft.display_order ?? 0,
      };

      const { data, error } = await supabase
        .from('services')
        .insert(payload)
        .select('*')
        .single();

      if (error) throw error;
      return data as Service;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', companyId] });
    },
  });
}

// ─── Mutación: actualizar servicio ─────────────────────────────────────────
export function useUpdateService(companyId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      patch: Partial<ServiceDraft>;
    }): Promise<Service> => {
      const { id, patch } = params;
      if (!id) throw new Error('id requerido');

      const cleanPatch: Record<string, unknown> = {};
      if (patch.name !== undefined) cleanPatch.name = patch.name.trim();
      if (patch.description !== undefined)
        cleanPatch.description = patch.description?.trim() || null;
      if (patch.duration_minutes !== undefined)
        cleanPatch.duration_minutes = patch.duration_minutes;
      if (patch.default_price !== undefined)
        cleanPatch.default_price = patch.default_price;
      if (patch.currency !== undefined) cleanPatch.currency = patch.currency;
      if (patch.category !== undefined)
        cleanPatch.category = patch.category?.trim() || null;
      if (patch.bot_keywords !== undefined)
        cleanPatch.bot_keywords = patch.bot_keywords;
      if (patch.is_active !== undefined) cleanPatch.is_active = patch.is_active;
      if (patch.display_order !== undefined)
        cleanPatch.display_order = patch.display_order;

      const { data, error } = await supabase
        .from('services')
        .update(cleanPatch)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data as Service;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', companyId] });
      // También invalidar las asignaciones de miembros porque pueden mostrar
      // info denormalizada (nombre del servicio, precio, duración).
      queryClient.invalidateQueries({ queryKey: ['team_member_services'] });
    },
  });
}

// ─── Mutación: eliminar servicio ───────────────────────────────────────────
export function useDeleteService(companyId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!id) throw new Error('id requerido');

      const { error } = await supabase.from('services').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services', companyId] });
      // Las asignaciones se borran en cascada por la FK, pero invalidamos
      // la cache de TanStack también.
      queryClient.invalidateQueries({ queryKey: ['team_member_services'] });
    },
  });
}
