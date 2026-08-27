 

'use client'

import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '../../../components/WorkspaceContext'
import TemplateCard from '../../../components/TemplateCard'
import toast from 'react-hot-toast'
import { Layers, Sparkles, Loader2 } from 'lucide-react'
import PageHeader from '../../../components/PageHeader'

type Template = {
  id: string
  name: string
  description: string | null
  icon: string
  theme_color: string
  accent_color: string
  is_generic: boolean
  display_order: number
}

type InstalledRow = {
  template_id: string
  is_primary: boolean
}

export default function TemplatesPage() {
  const queryClient = useQueryClient()
  const { primaryTemplate } = useWorkspace()
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['templates-page'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuario no autenticado')

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (!profile?.company_id) throw new Error('Sin compañía')

      const [tplRes, instRes] = await Promise.all([
        supabase
          .from('templates')
          .select('*')
          .eq('is_active', true)
          .order('display_order'),
        supabase
          .from('company_templates')
          .select('template_id, is_primary')
          .eq('company_id', profile.company_id)
      ])

      return {
        companyId: profile.company_id,
        templates: (tplRes.data as Template[]) || [],
        installed: (instRes.data as InstalledRow[]) || []
      }
    }
  })

  // v3.2: Solo UNA plantilla activa a la vez.
  // Esta mutation borra todas las plantillas instaladas y deja solo la nueva.
  const switchTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      if (!data?.companyId) throw new Error('Sin company')

      // 1) Borrar todas las plantillas actuales
      const { error: delErr } = await supabase
        .from('company_templates')
        .delete()
        .eq('company_id', data.companyId)
      if (delErr) throw delErr

      // 2) Instalar la nueva como primaria
      const { error: insErr } = await supabase.rpc('install_template', {
        p_company_id: data.companyId,
        p_template_id: templateId,
        p_make_primary: true
      })
      if (insErr) throw insErr

      // 3) Limpiar el cache del workspace para que se vea el cambio
      if (typeof window !== 'undefined') {
        Object.keys(localStorage).filter(k => k.includes('workspace-cache')).forEach(k => localStorage.removeItem(k))
      }
    },
    onSuccess: () => {
      toast.success('Plantilla cambiada. Recargando...')
      queryClient.invalidateQueries({ queryKey: ['templates-page'] })
      queryClient.invalidateQueries({ queryKey: ['entitlements'] })
      setTimeout(() => window.location.reload(), 700)
    },
    onError: (e: any) => toast.error(e?.message || 'Error cambiando plantilla')
  })

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="w-10 h-10 text-slate-700 animate-spin" />
      </div>
    )
  }

  const templates = data?.templates || []
  const installedMap = new Map(data?.installed.map(i => [i.template_id, i]) || [])

  return (
    <div className="animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <PageHeader
        title="Plantillas"
        description="Elige la plantilla que mejor describe tu negocio."
      />

      {/* Info banner — estilo limpio sin gradient */}
      <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
        <div className="h-9 w-9 bg-white border border-slate-200 text-slate-700 rounded-xl flex items-center justify-center shrink-0">
          <Sparkles size={15} />
        </div>
        <div className="text-sm text-slate-600 leading-relaxed">
          Cada plantilla activa <strong className="text-slate-900 font-bold">módulos, campos y flujos</strong> específicos
          de una industria. Puedes <strong className="text-slate-900 font-bold">cambiar de plantilla en cualquier momento</strong>,
          pero solo puedes tener una activa a la vez. Tus datos se conservan al cambiar.
        </div>
      </div>

      {/* Grid de templates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map(tpl => {
          const installed = installedMap.get(tpl.id)
          const isPrimary = !!installed?.is_primary
          const isBusy = busyTemplateId === tpl.id

          return (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              isInstalled={isPrimary}
              isPrimary={isPrimary}
              isLoading={isBusy}
              onInstall={async () => {
                if (isPrimary) return
                if (!confirm(`¿Cambiar tu plantilla actual por "${tpl.name}"? Tus datos se conservan, pero los módulos y etiquetas del panel cambiarán.`)) return
                setBusyTemplateId(tpl.id)
                await switchTemplateMutation.mutateAsync(tpl.id)
                setBusyTemplateId(null)
              }}
              onMakePrimary={async () => {
                if (isPrimary) return
                setBusyTemplateId(tpl.id)
                await switchTemplateMutation.mutateAsync(tpl.id)
                setBusyTemplateId(null)
              }}
              onUninstall={async () => {
                // En el modelo de 1 plantilla, no se puede desinstalar la única plantilla.
                toast.error('Para quitar esta plantilla, cambia a otra primero.')
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
