 

'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { 
  Globe, Save, Plus, Trash2, Loader2, Type, LayoutTemplate, 
  Image as ImageIcon, UploadCloud, GripVertical, ChevronDown, List, MonitorPlay, TextCursorInput,
  Bot, Calendar, CreditCard, Users, MessageSquare, BellRing, 
  Sparkles, Building2, Stethoscope, HeartPulse, Activity, 
  ClipboardList, ShieldCheck, Zap, Laptop
} from 'lucide-react'
import IAnswerLoader from '../../../../components/IAnswerLoader'

const AVAILABLE_ICONS = [
  { name: 'Bot', icon: Bot }, { name: 'Calendar', icon: Calendar }, { name: 'CreditCard', icon: CreditCard },
  { name: 'Users', icon: Users }, { name: 'MessageSquare', icon: MessageSquare }, { name: 'BellRing', icon: BellRing },
  { name: 'Sparkles', icon: Sparkles }, { name: 'Building2', icon: Building2 }, { name: 'Stethoscope', icon: Stethoscope },
  { name: 'HeartPulse', icon: HeartPulse }, { name: 'Activity', icon: Activity }, { name: 'ClipboardList', icon: ClipboardList },
  { name: 'ShieldCheck', icon: ShieldCheck }, { name: 'Zap', icon: Zap }, { name: 'Laptop', icon: Laptop }
]

export default function LandingAdminTab() {
  const queryClient = useQueryClient()
  
  const [settings, setSettings] = useState<any>({ 
    nav_links: ['Inicio', 'Características', 'Planes', 'Contacto'],
    features_title: '', features_subtitle: '', 
    plans_title: '', plans_subtitle: '', 
    contact_title: '', contact_subtitle: '' 
  })
  const [slides, setSlides] = useState<any[]>([])
  const [features, setFeatures] = useState<any[]>([])
  const [sections, setSections] = useState<any[]>([])
  const [openIconDropdown, setOpenIconDropdown] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setOpenIconDropdown(null)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['landingDataAll'],
    queryFn: async () => {
      const [setRes, sldRes, featRes, secRes] = await Promise.all([
        supabase.from('landing_settings').select('*').single(),
        supabase.from('landing_hero_slides').select('*').order('order_index'),
        supabase.from('landing_features').select('*').order('order_index'),
        supabase.from('landing_scroll_sections').select('*').order('order_index')
      ])
      return { 
        settings: setRes.data || {},
        slides: sldRes.data || [],
        features: featRes.data || [], 
        sections: secRes.data || [] 
      }
    }
  })

  useEffect(() => {
    if (data) { 
      setSettings({...settings, ...data.settings})
      setSlides(data.slides)
      setFeatures(data.features)
      setSections(data.sections) 
    }
  }, [data])

  const saveSettings = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('landing_settings').upsert({ id: 1, ...settings })
      if (error) throw error
    },
    onSuccess: () => toast.success('Textos generales guardados exitosamente.')
  })

  const addSlide = useMutation({
    mutationFn: async () => { await supabase.from('landing_hero_slides').insert({ title: 'Nuevo Título', subtitle: 'Subtítulo', button_text: 'Empezar Prueba', order_index: slides.length }) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['landingDataAll'] })
  })

  const saveSlide = useMutation({
    mutationFn: async (sl: any) => { await supabase.from('landing_hero_slides').update(sl).eq('id', sl.id) },
    onSuccess: () => toast.success('Slide guardado')
  })

  const delSlide = useMutation({
    mutationFn: async (id: string) => { await supabase.from('landing_hero_slides').delete().eq('id', id) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['landingDataAll'] })
  })

  const uploadImageMutation = useMutation({
    mutationFn: async ({ file, id, index }: { file: File, id: string, index: number }) => {
      const fileName = `scroll-block-${id}-${Date.now()}.${file.name.split('.').pop()}`
      const { error: uploadError } = await supabase.storage.from('branding').upload(fileName, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('branding').getPublicUrl(fileName)
      
      const { data: updatedRow, error: dbError } = await supabase.from('landing_scroll_sections')
        .update({ image_url: publicUrl })
        .eq('id', id)
        .select()
        
      if (dbError) throw dbError
      if (!updatedRow || updatedRow.length === 0) throw new Error('Bloqueado por RLS en la base de datos.')
      
      return { index, publicUrl }
    },
    onSuccess: ({ index, publicUrl }) => {
      const updated = [...sections]
      updated[index].image_url = publicUrl
      setSections(updated)
      toast.success('Imagen sincronizada exitosamente.')
    },
    onError: (error: any) => toast.error(`Error al subir la imagen: ${error.message}`)
  })

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, id: string, index: number) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadImageMutation.mutate({ file, id, index })
    }
  }

  const addFeature = useMutation({
    mutationFn: async () => { await supabase.from('landing_features').insert({ title: 'Nueva Función', description: 'Beneficio...', icon: 'Bot' }) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['landingDataAll'] })
  })

  const saveFeature = useMutation({
    mutationFn: async (feat: any) => { await supabase.from('landing_features').update(feat).eq('id', feat.id) },
    onSuccess: () => toast.success('Tarjeta guardada')
  })

  const delFeature = useMutation({
    mutationFn: async (id: string) => { await supabase.from('landing_features').delete().eq('id', id) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['landingDataAll'] })
  })

  const addSection = useMutation({
    mutationFn: async () => { await supabase.from('landing_scroll_sections').insert({ title: 'Nuevo Bloque', description: 'Texto...', image_position: 'left' }) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['landingDataAll'] })
  })

  const saveSection = useMutation({
    mutationFn: async (sec: any) => { await supabase.from('landing_scroll_sections').update({ title: sec.title, description: sec.description, tag_text: sec.tag_text, image_position: sec.image_position }).eq('id', sec.id) },
    onSuccess: () => toast.success('Bloque guardado')
  })

  const delSection = useMutation({
    mutationFn: async (id: string) => { await supabase.from('landing_scroll_sections').delete().eq('id', id) },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['landingDataAll'] })
  })

  if (isLoading) return <div className="flex justify-center p-20"><IAnswerLoader size={40} /></div>

  return (
    <section className="animate-in fade-in space-y-10 pb-20 font-sans">
      
      <div className="mb-6 border-b border-slate-200 pb-6">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <Globe className="text-teal-700" /> Landing Page Builder
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-1">Personaliza el 100% de los textos, imágenes y estructura de tu landing pública.</p>
      </div>

      {/* TEXTOS GLOBALES DE LA PÁGINA */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><TextCursorInput size={18}/> Nombres de Secciones y Menú</h3>
          <button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-slate-800 flex items-center gap-2 transition-all">
            {saveSettings.isPending ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Guardar Textos
          </button>
        </div>
        
        <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest"><List size={14} className="inline mr-1 -mt-0.5"/> Menú de Navegación Top</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => (
              <input key={i} value={settings.nav_links?.[i] || ''} onChange={e => { const n = [...(settings.nav_links || [])]; n[i] = e.target.value; setSettings({...settings, nav_links: n}) }} className="w-full p-2.5 text-sm font-bold bg-white border border-slate-200 rounded-lg outline-none focus:border-teal-500" placeholder={`Link ${i+1}`} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Sec. Características</label>
            <input value={settings.features_title || ''} onChange={e => setSettings({...settings, features_title: e.target.value})} className="w-full p-2.5 text-sm font-bold border border-slate-200 rounded-lg outline-none" placeholder="Título" />
            <textarea value={settings.features_subtitle || ''} onChange={e => setSettings({...settings, features_subtitle: e.target.value})} className="w-full p-2.5 text-sm font-medium border border-slate-200 rounded-lg outline-none h-16 resize-none" placeholder="Subtítulo" />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Sec. Suscripciones</label>
            <input value={settings.plans_title || ''} onChange={e => setSettings({...settings, plans_title: e.target.value})} className="w-full p-2.5 text-sm font-bold border border-slate-200 rounded-lg outline-none" placeholder="Título" />
            <textarea value={settings.plans_subtitle || ''} onChange={e => setSettings({...settings, plans_subtitle: e.target.value})} className="w-full p-2.5 text-sm font-medium border border-slate-200 rounded-lg outline-none h-16 resize-none" placeholder="Subtítulo" />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Sec. Contacto</label>
            <input value={settings.contact_title || ''} onChange={e => setSettings({...settings, contact_title: e.target.value})} className="w-full p-2.5 text-sm font-bold border border-slate-200 rounded-lg outline-none" placeholder="Título" />
            <textarea value={settings.contact_subtitle || ''} onChange={e => setSettings({...settings, contact_subtitle: e.target.value})} className="w-full p-2.5 text-sm font-medium border border-slate-200 rounded-lg outline-none h-16 resize-none" placeholder="Subtítulo" />
          </div>
        </div>
      </div>

      {/* HERO SLIDER */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><MonitorPlay size={18}/> Slider del Inicio (Hero)</h3>
          <button onClick={() => addSlide.mutate()} className="bg-teal-50 text-teal-700 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm">+ Añadir Frase</button>
        </div>
        <div className="space-y-4">
          {slides.map((sl, i) => (
            <div key={sl.id} className="flex flex-col md:flex-row gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex-1 space-y-2">
                <input value={sl.title} onChange={e => {const n=[...slides]; n[i].title=e.target.value; setSlides(n)}} className="w-full p-2.5 text-lg font-black border border-slate-200 rounded-lg outline-none" placeholder="Título Principal" />
                <input value={sl.subtitle} onChange={e => {const n=[...slides]; n[i].subtitle=e.target.value; setSlides(n)}} className="w-full p-2.5 text-sm border border-slate-200 rounded-lg outline-none text-slate-600" placeholder="Subtítulo persuasivo" />
                <input value={sl.button_text} onChange={e => {const n=[...slides]; n[i].button_text=e.target.value; setSlides(n)}} className="w-full md:w-1/2 p-2.5 text-sm font-bold bg-teal-50 border border-teal-200 text-teal-800 rounded-lg outline-none" placeholder="Texto del botón (Ej. Comenzar Prueba)" />
              </div>
              <div className="flex md:flex-col gap-2 justify-center w-full md:w-24 mt-2 md:mt-0">
                <button onClick={() => saveSlide.mutate(sl)} className="flex-1 md:flex-none bg-slate-900 text-white text-xs py-2.5 rounded-lg font-bold shadow-sm">Guardar</button>
                <button onClick={() => delSlide.mutate(sl.id)} className="flex-1 md:flex-none bg-red-50 text-red-600 text-xs py-2.5 rounded-lg font-bold">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BLOQUES DE SCROLL MULTIMEDIA */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><Type className="text-slate-400" size={20}/> Bloques de Recorrido (Scroll)</h3>
          <button onClick={() => addSection.mutate()} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md flex items-center gap-2">
            <Plus size={16} /> Añadir Bloque
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {sections.map((sec, i) => (
            <div key={sec.id} className="bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row group transition-all">
              <div className="bg-slate-50 border-r border-slate-100 flex justify-center items-center p-4 w-12 shrink-0"><span className="text-xs font-black text-slate-400">#{i + 1}</span></div>
              <div className="p-6 md:w-[35%] flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50">
                {sec.image_url ? (
                  <div className="relative rounded-2xl overflow-hidden shadow-sm border aspect-[4/3] bg-slate-100 group/img">
                    <img src={sec.image_url} alt="Pre-view" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                      <label className="cursor-pointer bg-white text-slate-900 px-4 py-2 rounded-lg text-xs font-bold flex gap-2 hover:scale-105 transition-transform">
                        <UploadCloud size={16} /> Reemplazar
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, sec.id, i)} className="hidden" />
                      </label>
                    </div>
                  </div>
                ) : (
                  <label className="cursor-pointer w-full aspect-[4/3] flex flex-col items-center justify-center border-2 border-dashed rounded-2xl bg-white hover:bg-slate-50">
                    <ImageIcon className="text-slate-400 mb-2" size={28} />
                    <span className="text-xs font-bold text-slate-500">Subir imagen</span>
                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, sec.id, i)} className="hidden" />
                  </label>
                )}
                <select value={sec.image_position} onChange={e => {const n=[...sections]; n[i].image_position=e.target.value; setSections(n)}} className="mt-4 w-full p-2.5 text-sm font-bold bg-white border border-slate-200 rounded-xl outline-none">
                  <option value="left">Foto a la Izquierda</option>
                  <option value="right">Foto a la Derecha</option>
                </select>
              </div>

              <div className="p-6 flex-1 flex flex-col space-y-4">
                <input value={sec.tag_text || ''} onChange={e => {const n=[...sections]; n[i].tag_text=e.target.value; setSections(n)}} className="w-44 p-2 text-xs font-bold bg-teal-50 text-teal-700 border border-teal-100 rounded-lg outline-none" placeholder="Tag (Ej. AUTOMATIZACIÓN)" />
                <input value={sec.title} onChange={e => {const n=[...sections]; n[i].title=e.target.value; setSections(n)}} className="w-full p-2 text-xl font-black text-slate-900 border-b-2 border-transparent hover:border-slate-200 outline-none" placeholder="Escribe el Título..." />
                <textarea value={sec.description} onChange={e => {const n=[...sections]; n[i].description=e.target.value; setSections(n)}} className="w-full p-3 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-xl h-24 resize-none outline-none" placeholder="Cuerpo descriptivo..." />
                
                <div className="flex justify-end gap-3 pt-4 mt-auto border-t border-slate-100">
                  <button onClick={() => delSection.mutate(sec.id)} className="text-slate-400 hover:text-rose-600 p-2 rounded-lg"><Trash2 size={18} /></button>
                  <button onClick={() => saveSection.mutate(sec)} className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2">
                    <Save size={16} /> Guardar Bloque
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BENTO GRID (TARJETAS) */}
      <div className="space-y-6 pt-10 border-t border-slate-200" ref={dropdownRef}>
        <div className="flex items-center justify-between px-2">
          <h3 className="text-lg font-black text-slate-800 flex items-center gap-2"><LayoutTemplate className="text-slate-400" size={20}/> Grid de Características</h3>
          <button onClick={() => addFeature.mutate()} className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm flex gap-2">
            <Plus size={16} /> Añadir Tarjeta
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {features.map((feat, i) => {
            const CurrentIconObj = AVAILABLE_ICONS.find(ic => ic.name === feat.icon) || AVAILABLE_ICONS[0]
            const CurrentIcon = CurrentIconObj.icon
            return (
              <div key={feat.id} className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm flex flex-col gap-4 relative">
                <div className="flex gap-4">
                  <div className="space-y-1 relative">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Ícono</span>
                    <button onClick={() => setOpenIconDropdown(openIconDropdown === feat.id ? null : feat.id)} className="flex items-center gap-2 w-32 p-2 border border-slate-200 bg-slate-50 rounded-xl hover:bg-white text-sm font-bold justify-between">
                      <div className="flex items-center gap-2"><CurrentIcon size={18} className="text-teal-600" /> <span className="truncate">{feat.icon}</span></div>
                      <ChevronDown size={14} className="text-slate-400" />
                    </button>
                    {openIconDropdown === feat.id && (
                      <div className="absolute top-full left-0 mt-2 p-3 bg-white border border-slate-200 shadow-xl rounded-2xl grid grid-cols-5 gap-2 z-50 w-64">
                        {AVAILABLE_ICONS.map(ic => (
                          <button key={ic.name} onClick={() => { const n = [...features]; n[i].icon = ic.name; setFeatures(n); setOpenIconDropdown(null) }} className="p-2.5 flex items-center justify-center rounded-xl hover:bg-teal-50 text-slate-500" title={ic.name}>
                            <ic.icon size={22} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 flex-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Título Corto</span>
                    <input value={feat.title} onChange={e => {const n=[...features]; n[i].title=e.target.value; setFeatures(n)}} className="w-full p-2.5 text-sm font-black text-slate-800 border border-slate-200 rounded-xl outline-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Descripción</span>
                  <textarea value={feat.description} onChange={e => {const n=[...features]; n[i].description=e.target.value; setFeatures(n)}} className="w-full p-3 text-sm font-medium text-slate-600 bg-slate-50 border rounded-xl h-20 resize-none outline-none" />
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-1">
                  <select value={feat.col_span} onChange={e => {const n=[...features]; n[i].col_span=Number(e.target.value); setFeatures(n)}} className="p-1.5 text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg outline-none">
                    <option value={1}>Cuadrado (1 col)</option>
                    <option value={2}>Ancho (2 col)</option>
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => delFeature.mutate(feat.id)} className="text-slate-400 hover:text-rose-600 p-2"><Trash2 size={16}/></button>
                    <button onClick={() => saveFeature.mutate(feat)} className="bg-slate-900 text-white text-xs px-4 py-2 rounded-xl font-bold">Guardar</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </section>
  )
}
