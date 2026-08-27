 

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useWorkspace } from './WorkspaceContext'
import { useEntitlements } from '../hooks/useEntitlements'
import ConnectMetaButton from './ConnectMetaButton'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MapPinned, Plus, Building2, Trash2, Edit2, X, Save, Loader2, Check, Lock } from 'lucide-react'

type Location = {
  id: string
  company_id: string
  name: string
  business_phone_id: string | null
  created_at: string
}

export default function LocationTab({ companyId, planSlug }: { companyId: string, planSlug: string }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { labels, primaryTemplate } = useWorkspace()
  const { data: entitlements } = useEntitlements()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [formData, setFormData] = useState({ name: '', phone_id: '' })

  // v3.0 Sprint 5: maxLocations viene de entitlements (que ya mergea plan + addon multi_location)
  // Fallback al hardcoded por plan si entitlements aún no cargó
  const maxLocations = (entitlements as any)?.capacity?.max_locations
    ?? (planSlug === 'scale' ? 10 : planSlug === 'growth' ? 3 : 1)

  // 1. TANSTACK QUERY: Obtener sedes reales de la tabla locations
  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locationsData', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('*').eq('company_id', companyId).order('created_at')
      if (error) throw error
      return (data as Location[]) || []
    }
  })

  // 2. TANSTACK MUTATION: Guardar o Actualizar Sede
  const saveLocationMutation = useMutation({
    mutationFn: async (payload: { name: string, id?: string }) => {
      if (payload.id) {
        const { error } = await supabase.from('locations').update({ name: payload.name }).eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('locations').insert([{ company_id: companyId, name: payload.name }])
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locationsData', companyId] })
      toast.success(editingLocation ? `${labels?.location || 'Sede'} actualizada` : `${labels?.location || 'Sede'} creada`)
      closeModal()
    },
    onError: () => toast.error(`Error guardando ${labels?.location || 'Sede'}`)
  })

  // 3. TANSTACK MUTATION: Eliminar Sede
  const deleteLocationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('locations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locationsData', companyId] })
      toast.success(`${labels?.location || 'Sede'} eliminada`)
    },
    onError: () => toast.error('Error al eliminar')
  })

  const openModal = (loc?: Location) => {
    if (loc) {
      setEditingLocation(loc)
      setFormData({ name: loc.name, phone_id: loc.business_phone_id || '' })
    } else {
      setEditingLocation(null)
      setFormData({ name: '', phone_id: '' })
    }
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingLocation(null)
    setFormData({ name: '', phone_id: '' })
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    saveLocationMutation.mutate({ name: formData.name, id: editingLocation?.id })
  }

  const handleDelete = (id: string) => {
    if (!confirm(`¿Estás seguro de eliminar esta ${labels?.location || 'Sede'}? Se perderá la conexión.`)) return
    deleteLocationMutation.mutate(id)
  }

  if (isLoading) return <div className="animate-pulse h-64 bg-slate-50 rounded-3xl border border-slate-100"></div>

  const atLimit = locations.length >= maxLocations
  const accentColor = primaryTemplate?.accent_color || '#0f172a'

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      {atLimit && (
        <div className="mb-4 p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl flex items-center gap-3">
          <Lock className="text-amber-600 shrink-0" size={20} />
          <div className="flex-1">
            <p className="font-bold text-amber-900 text-sm">
              Has alcanzado el máximo de {labels?.location_plural || 'sedes'} ({locations.length}/{maxLocations})
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              Activa el addon <strong>Multi Sucursal</strong> para añadir más sin cambiar de plan.
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/addons?highlight=multi_location')}
            className="px-3 py-2 bg-amber-900 hover:bg-amber-950 text-white text-xs font-bold rounded-lg whitespace-nowrap shrink-0"
          >
            Ver addon
          </button>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 text-white rounded-xl flex items-center justify-center shadow-sm" style={{ backgroundColor: accentColor }}>
              <Building2 size={20} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Mis {labels?.location_plural || 'Sedes'}</h3>
              <p className="text-xs text-slate-500 font-medium">Plan permite ({locations.length}/{maxLocations}) activas.</p>
            </div>
          </div>
          <button 
            onClick={() => {
              if (atLimit) {
                router.push('/dashboard/addons?highlight=multi_location')
              } else {
                openModal()
              }
            }}
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-colors shadow-sm hover:brightness-110 disabled:opacity-50"
            style={{ backgroundColor: atLimit ? '#92400e' : accentColor }}
          >
            {atLimit ? <Lock size={14} /> : <Plus size={16} />}
            {atLimit ? 'Activar addon' : `Añadir ${labels?.location || 'Sede'}`}
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-black text-slate-400 uppercase tracking-[0.1em] bg-white border-b border-slate-100">
                <th className="px-6 py-5 w-1/3">Nombre de {labels?.location || 'Sede'}</th>
                <th className="px-6 py-5">Integración Meta (WhatsApp)</th>
                <th className="px-6 py-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-slate-500 font-medium">
                    No tienes {labels?.location_plural?.toLowerCase() || 'sedes'} registradas.
                  </td>
                </tr>
              ) : (
                locations.map((c) => (
                  <tr key={c.id} className="group hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-6">
                      <div className="font-bold text-slate-900 flex items-center gap-2"><MapPinned size={16} className="text-slate-400" /> {c.name}</div>
                    </td>
                    <td className="px-6 py-6">
                      {c.business_phone_id ? (
                        <span className="flex w-fit items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold ring-1 ring-emerald-200"><Check size={12} strokeWidth={3} /> Activo</span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold border border-slate-200">Sin Conexión</span>
                      )}
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!c.business_phone_id && <ConnectMetaButton companyId={c.id} />} {/* OJO: Aquí podrías necesitar ajustar ConnectMetaButton para soportar location_id en el futuro */}
                        <button onClick={() => openModal(c)} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Edit2 size={16} /></button>
                        <button onClick={() => handleDelete(c.id)} disabled={deleteLocationMutation.isPending} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><MapPinned size={18} className="text-slate-500"/> {editingLocation ? `Editar Sede` : `Nueva Sede`}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700 bg-white rounded-full p-1 border border-slate-200"><X size={16} /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6">
              {atLimit && !editingLocation && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs font-bold">Tu plan actual permite 1 sede. Mejora tu plan para agregar sucursales.</div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre Comercial / Sucursal</label>
                <input type="text" autoFocus required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ej. Sede Norte" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancelar</button>
                <button type="submit" disabled={saveLocationMutation.isPending || (atLimit && !editingLocation)} className="flex-1 px-4 py-3 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 bg-slate-900">
                  {saveLocationMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Guardar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
