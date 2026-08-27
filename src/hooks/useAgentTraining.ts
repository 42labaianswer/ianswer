 

// src/hooks/useAgentTraining.ts
// ----------------------------------------------------------------------------
// Sprint R · Hooks para el entrenamiento del agente.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface TrainingSections {
  company_overview?: string
  sales_flow?: string
  do_share?: string
  dont_share?: string
  faqs?: string
  common_scenarios?: string
  tone_examples?: string
  escalation_rules?: string
  updated_at?: string
}

export const SECTION_LABELS: Record<keyof Omit<TrainingSections, 'updated_at'>, string> = {
  company_overview: 'Sobre la empresa',
  sales_flow: 'Flujo de ventas / atención',
  do_share: 'Información que SÍ puede dar',
  dont_share: 'Información que NO debe dar',
  faqs: 'Preguntas frecuentes',
  common_scenarios: 'Casos comunes',
  tone_examples: 'Ejemplos de tono',
  escalation_rules: 'Cuándo escalar a humano',
}

// ─── ¿Tiene el addon? ──────────────────────────────────────────────────────
export function useHasAgentTrainingAddon() {
  return useQuery({
    queryKey: ['has-agent-training-addon'],
    queryFn: async (): Promise<boolean> => {
      const { data: userRes } = await supabase.auth.getUser()
      if (!userRes.user) return false
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', userRes.user.id)
        .maybeSingle()
      if (!profile?.company_id) return false
      const { data, error } = await supabase.rpc('has_agent_training_active', {
        p_company_id: profile.company_id,
      })
      if (error) return false
      return data === true
    },
    staleTime: 60 * 1000,
  })
}

// ─── Cargar el training (general o por miembro) ────────────────────────────
export function useAgentTraining(
  companyId: string | undefined,
  mode: 'general' | 'per_staff',
  teamMemberId: string | null
) {
  return useQuery({
    queryKey: ['agent-training', companyId, mode, teamMemberId],
    enabled: !!companyId,
    queryFn: async (): Promise<TrainingSections> => {
      if (!companyId) return {}

      if (mode === 'per_staff' && teamMemberId) {
        const { data } = await supabase
          .from('team')
          .select('custom_data')
          .eq('id', teamMemberId)
          .maybeSingle()
        const cd = (data?.custom_data as { training?: TrainingSections }) || {}
        return cd.training || {}
      }

      const { data } = await supabase
        .from('companies')
        .select('agent_training')
        .eq('id', companyId)
        .maybeSingle()
      return (data?.agent_training as TrainingSections) || {}
    },
    staleTime: 30 * 1000,
  })
}

// ─── Guardar el training ───────────────────────────────────────────────────
export function useSaveAgentTraining() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      companyId: string
      mode: 'general' | 'per_staff'
      teamMemberId: string | null
      sections: TrainingSections
    }) => {
      const sections = { ...params.sections, updated_at: new Date().toISOString() }

      if (params.mode === 'per_staff' && params.teamMemberId) {
        // Merge en custom_data->training
        const { data: existing } = await supabase
          .from('team')
          .select('custom_data')
          .eq('id', params.teamMemberId)
          .maybeSingle()

        const cd = (existing?.custom_data as Record<string, unknown>) || {}
        cd.training = sections

        const { error } = await supabase
          .from('team')
          .update({ custom_data: cd })
          .eq('id', params.teamMemberId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('companies')
          .update({ agent_training: sections })
          .eq('id', params.companyId)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-training'] })
    },
  })
}

// ─── Llamar al entrevistador ───────────────────────────────────────────────
export async function callInterviewer(
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  const res = await fetch('/api/agent-training', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'interview', messages }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Error en la entrevista')
  return data.message
}

// ─── Compilar la conversación en secciones ─────────────────────────────────
export async function compileTraining(
  messages: Array<{ role: string; content: string }>
): Promise<TrainingSections> {
  const res = await fetch('/api/agent-training', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'compile', messages }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || 'Error al compilar')
  return data.sections
}
