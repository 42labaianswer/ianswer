 

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Building2, User, Phone, Mail, MapPin, Save } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import IAnswerLoader from './IAnswerLoader'

export default function ProfileTab({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  
  const [settings, setSettings] = useState({
    id: companyId, name: '', doctor_name: '', contact_email: '', contact_phone: '', address: ''
  })

  // 1. TanStack Query: Trae los datos automáticamente y maneja el estado de carga
  const { data: profileData, isLoading } = useQuery({
    queryKey: ['companyProfile', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single()
      
      if (error) throw error
      return data
    }
  })

  // Sincronizamos los datos de TanStack con nuestro estado local para el formulario
  useEffect(() => {
    if (profileData) {
      setSettings({
        id: profileData.id,
        name: profileData.name || '',
        doctor_name: profileData.doctor_name || '',
        contact_email: profileData.contact_email || '',
        contact_phone: profileData.contact_phone || '',
        address: profileData.address || ''
      })
    }
  }, [profileData])

  // 2. TanStack Mutation: Maneja el guardado, los errores y el éxito
  const updateProfileMutation = useMutation({
    mutationFn: async (updatedSettings: typeof settings) => {
      const { error } = await supabase
        .from('companies')
        .update({
          name: updatedSettings.name, 
          doctor_name: updatedSettings.doctor_name, 
          contact_email: updatedSettings.contact_email, 
          contact_phone: updatedSettings.contact_phone, 
          address: updatedSettings.address
        })
        .eq('id', updatedSettings.id)
      
      if (error) throw error
    },
    onSuccess: () => {
      // 3. Toaster: Notificación de éxito
      toast.success('Perfil guardado exitosamente')
      
      // Invalida la caché para asegurar que la app tenga la info más fresca
      queryClient.invalidateQueries({ queryKey: ['companyProfile', companyId] })
    },
    onError: (error) => {
      // 3. Toaster: Notificación de error
      toast.error(`Error al guardar: ${error.message}`)
    }
  })

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault()
    // Disparamos la mutación
    updateProfileMutation.mutate(settings)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSettings({ ...settings, [e.target.name]: e.target.value })
  }

  // isLoading viene directo de TanStack
  if (isLoading) {
    return (
      <div className="h-64 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-center">
        <IAnswerLoader size={32} />
      </div>
    )
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <form onSubmit={handleSaveProfile} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm relative z-10">
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 size={20} className="text-slate-400" />
            <h2 className="text-lg font-bold text-slate-800">Perfil de la Empresa</h2>
          </div>
          
          {/* El botón reacciona a isPending de la mutación de TanStack */}
          <button 
            type="submit" 
            disabled={updateProfileMutation.isPending} 
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {updateProfileMutation.isPending ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <><Save size={16} /> Guardar Perfil</>
            )}
          </button>
        </div>
        
        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Building2 size={14} className="text-slate-400"/> Nombre de la Empresa</label>
            <input type="text" name="name" value={settings.name} onChange={handleChange} required className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-slate-900" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><User size={14} className="text-slate-400"/> Contacto Principal</label>
            <input type="text" name="doctor_name" value={settings.doctor_name} onChange={handleChange} placeholder="Ej. Dr. Ramiro Juárez" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-slate-900" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Phone size={14} className="text-slate-400"/> Teléfono Público</label>
            <input type="text" name="contact_phone" value={settings.contact_phone} onChange={handleChange} placeholder="Ej. +52 999 123 4567" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-slate-900" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><Mail size={14} className="text-slate-400"/> Correo de Contacto</label>
            <input type="email" name="contact_email" value={settings.contact_email} onChange={handleChange} placeholder="contacto@tuempresa.com" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-slate-900" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-bold text-slate-700 flex items-center gap-2"><MapPin size={14} className="text-slate-400"/> Dirección Principal</label>
            <input type="text" name="address" value={settings.address} onChange={handleChange} placeholder="Ej. Calle 60 #123, Mérida, Yucatán" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium text-slate-900" />
          </div>
        </div>
      </form>
    </div>
  )
}
