 

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

// ============================================================================
// useTemplates (v2.26)
// ----------------------------------------------------------------------------
// Lista templates del catálogo + templates instalados en la company.
// Incluye mutaciones para instalar, desinstalar y cambiar primario.
// ============================================================================

export function useTemplatesCatalog() {
  return useQuery({
    queryKey: ['templates-catalog'],
    queryFn: async () => {
      const { data } = await supabase
        .from('templates')
        .select('*')
        .eq('is_active', true)
        .order('display_order')
      return data || []
    },
    staleTime: 60 * 60 * 1000 // cache de 1 hora — el catálogo es estable
  })
}

export function useInstalledTemplates() {
  return useQuery({
    queryKey: ['installed-templates'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (!profile?.company_id) return []

      const { data } = await supabase
        .from('company_templates')
        .select(`
          id, template_id, is_primary, config, installed_at,
          template:templates(*)
        `)
        .eq('company_id', profile.company_id)

      return data || []
    },
    staleTime: 5 * 60 * 1000
  })
}

export function useTemplateMutations() {
  const queryClient = useQueryClient()

  const install = useMutation({
    mutationFn: async ({ templateId, makePrimary }: { templateId: string, makePrimary?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user!.id).single()
      const { error } = await supabase.rpc('install_template', {
        p_company_id: profile!.company_id,
        p_template_id: templateId,
        p_make_primary: !!makePrimary
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installed-templates'] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      toast.success('Plantilla instalada')
    }
  })

  const uninstall = useMutation({
    mutationFn: async (templateId: string) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user!.id).single()
      const { error } = await supabase.rpc('uninstall_template', {
        p_company_id: profile!.company_id,
        p_template_id: templateId
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installed-templates'] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      toast.success('Plantilla desinstalada')
    }
  })

  return { install, uninstall }
}
