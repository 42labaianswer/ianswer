 

// src/hooks/useTeamMemberServices.ts
// ----------------------------------------------------------------------------
// Sprint I · Hooks para gestionar las asignaciones de servicios SÍ/NO ofrecidos
// por miembro del equipo. Usa la RPC `get_services_for_member` que devuelve
// TODOS los servicios de la company con LEFT JOIN al estado de asignación.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────
/**
 * Resultado de la RPC `get_services_for_member`.
 * Cada fila representa un servicio del catálogo y su estado de asignación
 * para el miembro consultado (estado puede ser null = sin definir).
 */
export interface MemberServiceRow {
  service_id: string;
  service_name: string;
  service_category: string | null;
  duration_minutes: number | null;
  default_price: number | null;
  assignment_id: string | null;
  offered: boolean | null;
  notes: string | null;
}

/** Estado tri-estado del switch de servicio por miembro. */
export type ServiceAssignmentState = 'unset' | 'yes' | 'no';

export function getAssignmentState(row: MemberServiceRow): ServiceAssignmentState {
  if (row.offered === null) return 'unset';
  return row.offered ? 'yes' : 'no';
}

// ─── Query: servicios + asignaciones de un miembro ─────────────────────────
export function useMemberServices(teamMemberId: string | null | undefined) {
  return useQuery({
    queryKey: ['team_member_services', teamMemberId],
    queryFn: async (): Promise<MemberServiceRow[]> => {
      if (!teamMemberId) return [];

      const { data, error } = await supabase.rpc('get_services_for_member', {
        p_team_member_id: teamMemberId,
      });

      if (error) throw error;
      return (data as MemberServiceRow[]) ?? [];
    },
    enabled: Boolean(teamMemberId),
    staleTime: 10 * 1000,
  });
}

// ─── Mutación: setear el estado de un servicio para un miembro ─────────────
/**
 * Actualiza/crea/borra la asignación dependiendo del estado destino:
 *   - 'unset' → borra la fila si existe
 *   - 'yes'   → upsert con offered = TRUE
 *   - 'no'    → upsert con offered = FALSE
 */
export function useSetMemberServiceState(teamMemberId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      serviceId: string;
      state: ServiceAssignmentState;
      notes?: string | null;
      assignmentId?: string | null;
    }): Promise<void> => {
      const { serviceId, state, notes, assignmentId } = params;

      if (!teamMemberId) throw new Error('teamMemberId requerido');
      if (!serviceId) throw new Error('serviceId requerido');

      // Caso 1: deshacer asignación (borrar fila)
      if (state === 'unset') {
        if (!assignmentId) return; // ya está unset, nada que hacer
        const { error } = await supabase
          .from('team_member_services')
          .delete()
          .eq('id', assignmentId);
        if (error) throw error;
        return;
      }

      // Caso 2: asignar SÍ o NO (upsert)
      const offered = state === 'yes';
      const cleanNotes = notes?.trim() || null;

      if (assignmentId) {
        // Update
        const { error } = await supabase
          .from('team_member_services')
          .update({ offered, notes: cleanNotes })
          .eq('id', assignmentId);
        if (error) throw error;
      } else {
        // Insert (UNIQUE constraint protege contra duplicados)
        const { error } = await supabase.from('team_member_services').insert({
          team_member_id: teamMemberId,
          service_id: serviceId,
          offered,
          notes: cleanNotes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['team_member_services', teamMemberId],
      });
    },
  });
}

// ─── Mutación: actualizar solo las notas de una asignación ─────────────────
export function useUpdateMemberServiceNotes(teamMemberId: string | null | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      assignmentId: string;
      notes: string | null;
    }): Promise<void> => {
      const { assignmentId, notes } = params;
      if (!assignmentId) throw new Error('assignmentId requerido');

      const { error } = await supabase
        .from('team_member_services')
        .update({ notes: notes?.trim() || null })
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['team_member_services', teamMemberId],
      });
    },
  });
}
