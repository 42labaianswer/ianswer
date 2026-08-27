 

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useWorkspace } from '../../../../components/WorkspaceContext' 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Image as ImageIcon, Key, Upload, Save, Loader2, Share2, Globe, LayoutTemplate } from 'lucide-react'

export default function BrandingAdminTab() {
  const queryClient = useQueryClient()
  const { refreshWorkspace } = useWorkspace()
  
  const [platform, setPlatform] = useState({ 
    name: '', 
    description: '', 
    logo_url: '', 
    icon_url: '', 
    favicon_url: '', 
    og_image_url: '', 
    google_service_account: '' 
  })

  const { data, isLoading } = useQuery({
    queryKey: ['platformSettings'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_settings').select('*').single()
      return data || {}
    }
  })

  useEffect(() => { if (data) setPlatform(prev => ({ ...prev, ...data })) }, [data])

  const updatePlatformMutation = useMutation({
    mutationFn: async (payload: typeof platform) => {
      const { error } = await supabase.from('platform_settings').upsert({ id: 1, ...payload })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Ajustes guardados correctamente')
      refreshWorkspace()
      queryClient.invalidateQueries({ queryKey: ['platformSettings'] })
    }
  })

  const uploadImageMutation = useMutation({
    mutationFn: async ({ file, field }: { file: File, field: 'logo_url' | 'icon_url' | 'og_image_url' | 'favicon_url' }) => {
      const fileName = `${field}-${Date.now()}.${file.name.split('.').pop()}` 
      await supabase.storage.from('branding').upload(fileName, file, { upsert: true })
      const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(fileName)
      await supabase.from('platform_settings').update({ [field]: publicUrl }).eq('id', 1)
      return { field, publicUrl }
    },
    onSuccess: ({ field, publicUrl }) => {
      setPlatform(prev => ({ ...prev, [field]: publicUrl }))
      toast.success('Imagen subida correctamente')
      refreshWorkspace()
      queryClient.invalidateQueries({ queryKey: ['platformSettings'] })
    }
  })

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'logo_url' | 'icon_url' | 'og_image_url' | 'favicon_url') => {
    const file = e.target.files?.[0]
    if (file) uploadImageMutation.mutate({ file, field })
  }

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-10 h-10 text-blue-600 animate-spin" /></div>

  return (
    <section className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <ImageIcon className="text-blue-600" /> Configuraciones Generales
        </h2>
      </div>
      
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-8">
        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="flex-1 w-full">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-1">
              <Key size={18} className="text-slate-500" /> Cuenta de Servicio (Google Calendar API)
            </h3>
            <p className="text-sm text-slate-500 mb-3">Este correo es el que tus clientes verán en su configuración para darle permisos de edición.</p>
            <input value={platform.google_service_account || ''} onChange={e => setPlatform({...platform, google_service_account: e.target.value})} placeholder="ejemplo@proyecto.iam.gserviceaccount.com" className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm text-slate-700" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4 border-t border-slate-100">
          
          {/* Textos y SEO */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Nombre de la Plataforma (SaaS)</label>
              <input value={platform.name || ''} onChange={e => setPlatform({...platform, name: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-semibold" />
              <p className="text-[10px] text-slate-400 mt-1">Este nombre aparecerá en la pestaña del navegador.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Descripción Corta (SEO)</label>
              <textarea value={platform.description || ''} onChange={e => setPlatform({...platform, description: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl h-24 outline-none focus:ring-2 focus:ring-blue-500"></textarea>
              <p className="text-[10px] text-slate-400 mt-1">Esta descripción se mostrará en Google y al compartir links en redes sociales.</p>
            </div>
          </div>
          
          {/* Imágenes y Branding (4 Módulos) */}
          <div className="space-y-4">
            
            {/* Fila 1: Logo e Iconos Pequeños */}
            <div className="grid grid-cols-3 gap-4">
              
              {/* Logo Largo */}
              <div className="col-span-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 p-4 relative">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest text-center flex items-center justify-center gap-1"><LayoutTemplate size={12}/> Logo</p>
                {platform.logo_url ? <img src={platform.logo_url} className="max-h-8 mb-3 object-contain" alt="Logo" /> : <ImageIcon size={24} className="text-slate-300 mb-3" />}
                <label className="cursor-pointer flex items-center gap-1.5 bg-white px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors shadow-sm">
                  {uploadImageMutation.isPending && uploadImageMutation.variables?.field === 'logo_url' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} 
                  <span>Subir</span>
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'logo_url')} className="hidden" />
                </label>
              </div>

              {/* Ícono Cuadrado */}
              <div className="col-span-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 p-4 relative">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest text-center">Ícono</p>
                {platform.icon_url ? <img src={platform.icon_url} className="h-8 w-8 mb-3 object-contain rounded-lg" alt="Ícono" /> : <ImageIcon size={24} className="text-slate-300 mb-3" />}
                <label className="cursor-pointer flex items-center gap-1.5 bg-white px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors shadow-sm">
                  {uploadImageMutation.isPending && uploadImageMutation.variables?.field === 'icon_url' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} 
                  <span>Subir</span>
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'icon_url')} className="hidden" />
                </label>
              </div>

              {/* Favicon */}
              <div className="col-span-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 p-4 relative">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest text-center flex items-center justify-center gap-1"><Globe size={12}/> Favicon</p>
                {platform.favicon_url ? <img src={platform.favicon_url} className="h-8 w-8 mb-3 object-contain" alt="Favicon" /> : <Globe size={24} className="text-slate-300 mb-3" />}
                <label className="cursor-pointer flex items-center gap-1.5 bg-white px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors shadow-sm">
                  {uploadImageMutation.isPending && uploadImageMutation.variables?.field === 'favicon_url' ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} 
                  <span>Subir</span>
                  <input type="file" accept=".ico,image/png" onChange={(e) => handleImageUpload(e, 'favicon_url')} className="hidden" />
                </label>
              </div>

            </div>

            {/* Fila 2: Portada OG (Ocupa todo el ancho) */}
            <div className="flex flex-col border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 p-6 relative">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Share2 size={12}/> Portada de Redes (OpenGraph)</p>
                <label className="cursor-pointer flex items-center gap-1.5 bg-white px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-50 transition-colors shadow-sm">
                  {uploadImageMutation.isPending && uploadImageMutation.variables?.field === 'og_image_url' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 
                  <span>Subir Portada Ancha (1200x630)</span>
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'og_image_url')} className="hidden" />
                </label>
              </div>
              
              {/* Previsualizador tipo Card de Facebook/Twitter */}
              <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm mx-auto max-w-[400px] w-full">
                {platform.og_image_url ? (
                  <div className="aspect-[1200/630] bg-slate-100 relative">
                    <img src={platform.og_image_url} className="w-full h-full object-cover" alt="OpenGraph Preview" />
                  </div>
                ) : (
                  <div className="aspect-[1200/630] bg-slate-100 flex items-center justify-center">
                    <ImageIcon size={48} className="text-slate-300" />
                  </div>
                )}
                <div className="p-3 bg-slate-50 border-t border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 truncate">{platform.name || 'Tu Plataforma'}</p>
                  <p className="text-sm font-bold text-slate-800 truncate mb-1">{platform.name || 'Título del Sitio'}</p>
                  <p className="text-xs text-slate-500 line-clamp-1">{platform.description || 'Descripción corta que aparecerá en redes sociales...'}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-slate-100">
          <button onClick={() => updatePlatformMutation.mutate(platform)} disabled={updatePlatformMutation.isPending} className="w-full md:w-auto px-8 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg">
            {updatePlatformMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} 
            Guardar Configuración Global
          </button>
        </div>
      </div>
    </section>
  )
}
