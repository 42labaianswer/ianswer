 

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useWorkspace } from '../../../../components/WorkspaceContext' 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Briefcase, Palette, Filter, Users, ShieldCheck, Building2, Save, Loader2 } from 'lucide-react'

export default function TenantAdminTab() {
  const queryClient = useQueryClient()
  const { refreshWorkspace } = useWorkspace()
  const [verticals, setVerticals] = useState<any[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['adminVerticals'],
    queryFn: async () => {
      const { data } = await supabase.from('verticals').select('*').order('name', { ascending: true })
      return data || []
    }
  })

  useEffect(() => {
    if (data) setVerticals(data)
  }, [data])

  const updateVerticalMutation = useMutation({
    mutationFn: async (vertical: any) => {
      const { error } = await supabase.from('verticals')
        .update({ 
          name: vertical.name, ui_labels: vertical.ui_labels,
          theme_color: vertical.theme_color, accent_color: vertical.accent_color,
          tenant_label: vertical.tenant_label, funnels: vertical.funnels
        }).eq('id', vertical.id)
      if (error) throw error
      return vertical.name
    },
    onSuccess: (name) => {
      toast.success(`Industria ${name} actualizada.`)
      refreshWorkspace()
      queryClient.invalidateQueries({ queryKey: ['adminVerticals'] })
    },
    onError: (err) => toast.error(`Error al guardar: ${err.message}`)
  })

  const handleLabelChange = (id: string, key: string, value: string) => {
    setVerticals(verticals.map(v => v.id === id ? { ...v, ui_labels: { ...v.ui_labels, [key]: value } } : v))
  }

  const handleFunnelChange = (id: string, key: string, value: string) => {
    setVerticals(verticals.map(v => v.id === id ? { ...v, funnels: { ...v.funnels, [key]: value } } : v))
  }

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-10 h-10 text-indigo-600 animate-spin" /></div>

  return (
    <section className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Briefcase className="text-indigo-600" /> Configuración Multi-Tenant
        </h2>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">Controla los colores, subtítulos y palabras que el sistema usará en los menús según la industria del cliente.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {verticals.map(vert => (
          <div key={vert.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-indigo-200 transition-colors">
            <div className="bg-slate-900 px-5 py-4 shrink-0">
              <input value={vert.name} onChange={e => setVerticals(verticals.map(v => v.id === vert.id ? { ...v, name: e.target.value } : v))} className="text-lg font-black text-white bg-transparent w-full outline-none border-b border-transparent focus:border-indigo-500 transition-colors" />
              <p className="text-[10px] text-slate-400 font-mono mt-1 uppercase">ID: {vert.id}</p>
            </div>
            
            <div className="p-5 space-y-4 flex-1">
              <div className="p-3.5 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                <label className="flex items-center gap-2 text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-2">
                  <Palette size={14} /> Apariencia
                </label>
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Subtítulo (Ej. Centro)</span>
                    <input value={vert.tenant_label || ''} onChange={e => setVerticals(verticals.map(v => v.id === vert.id ? { ...v, tenant_label: e.target.value } : v))} className="w-full py-1.5 px-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-500 font-semibold mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fondo</span>
                      <div className="flex items-center gap-2 mt-1 bg-white p-1 rounded-lg border border-slate-200">
                        <input type="color" value={vert.theme_color || '#020617'} onChange={e => setVerticals(verticals.map(v => v.id === vert.id ? { ...v, theme_color: e.target.value } : v))} className="h-6 w-6 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0" />
                        <span className="text-[10px] font-mono text-slate-600 uppercase font-bold truncate">{vert.theme_color || '#020617'}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Botón</span>
                      <div className="flex items-center gap-2 mt-1 bg-white p-1 rounded-lg border border-slate-200">
                        <input type="color" value={vert.accent_color || '#4f46e5'} onChange={e => setVerticals(verticals.map(v => v.id === vert.id ? { ...v, accent_color: e.target.value } : v))} className="h-6 w-6 rounded cursor-pointer border-0 p-0 bg-transparent shrink-0" />
                        <span className="text-[10px] font-mono text-slate-600 uppercase font-bold truncate">{vert.accent_color || '#4f46e5'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-orange-50/50 rounded-2xl border border-orange-100">
                <label className="flex items-center gap-2 text-[11px] font-bold text-orange-600 uppercase tracking-wider mb-2">
                  <Filter size={14} /> Etapas (Funnels)
                </label>
                <div className="space-y-2">
                  {['new_lead', 'hot_lead', 'payment', 'customer'].map((step, idx) => (
                    <div key={step} className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-500 uppercase w-12 shrink-0">Paso {idx + 1}</span>
                      <input value={vert.funnels?.[step] || ''} onChange={e => handleFunnelChange(vert.id, step, e.target.value)} className="w-full py-1.5 px-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-orange-500 font-semibold" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { icon: <Users size={12}/>, title: 'Cliente Final', singular: 'client', plural: 'clients' },
                  { icon: <ShieldCheck size={12}/>, title: 'Equipo / Staff', singular: 'staff', plural: 'staff_plural' },
                  { icon: <Building2 size={12}/>, title: 'Locación', singular: 'location', plural: 'location_plural' }
                ].map(group => (
                  <div key={group.title} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                    <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{group.icon} {group.title}</label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Singular</span>
                        <input value={vert.ui_labels?.[group.singular] || ''} onChange={e => handleLabelChange(vert.id, group.singular, e.target.value)} className="w-full py-1 px-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-indigo-500 font-semibold mt-0.5" />
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">Plural</span>
                        <input value={vert.ui_labels?.[group.plural] || ''} onChange={e => handleLabelChange(vert.id, group.plural, e.target.value)} className="w-full py-1 px-2 text-xs bg-white border border-slate-200 rounded-md outline-none focus:border-indigo-500 font-semibold mt-0.5" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 mt-auto rounded-b-3xl">
              <button 
                onClick={() => updateVerticalMutation.mutate(vert)} 
                disabled={updateVerticalMutation.isPending && updateVerticalMutation.variables?.id === vert.id}
                className="w-full py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20"
              >
                {updateVerticalMutation.isPending && updateVerticalMutation.variables?.id === vert.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar Industria
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
