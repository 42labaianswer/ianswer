 

'use client'

import { useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { 
  BookOpen, Plus, Save, Trash2, Edit2, UploadCloud, Loader2, Image as ImageIcon, X,
  FileText, Settings, CreditCard, Users, Zap, Shield, Star, PlayCircle, MessageCircle
} from 'lucide-react'
import RichTextEditor from './RichTextEditor'
import { useConfirm } from '../hooks/useConfirm'
import IAnswerLoader from './IAnswerLoader'

type HelpArticle = {
  id: string
  title: string
  content: string
  category: string
  category_icon: string
  media_url: string | null
  // ── v2: campos para publicación pública ──────────────────────────────────
  is_public?: boolean
  summary?: string | null
  slug?: string | null
  reading_time_minutes?: number | null
}

const DEFAULT_CATEGORIES = ['Primeros Pasos', 'Configuración', 'Facturación']

// Catálogo de íconos para elegir
const ICON_OPTIONS = [
  { name: 'BookOpen', icon: BookOpen },
  { name: 'FileText', icon: FileText },
  { name: 'Settings', icon: Settings },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'Users', icon: Users },
  { name: 'Zap', icon: Zap },
  { name: 'Shield', icon: Shield },
  { name: 'Star', icon: Star },
  { name: 'PlayCircle', icon: PlayCircle },
  { name: 'MessageCircle', icon: MessageCircle },
]

export default function HelpCenterAdminTab() {
  const { confirm, ConfirmDialog } = useConfirm()
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isNewCategory, setIsNewCategory] = useState(false)
  
  const [formData, setFormData] = useState({
    title: '',
    category: 'Primeros Pasos',
    category_icon: 'BookOpen',
    content: '',
    media_url: '',
    // v2: publicación pública
    is_public: false,
    summary: '',
    reading_time_minutes: 3
  })

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['helpArticlesAdmin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('help_articles').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as HelpArticle[]
    }
  })

  const availableCategories = useMemo(() => {
    const dbCategories = articles.map(a => a.category)
    const unique = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCategories]))
    return unique.sort()
  }, [articles])

  const uploadMediaMutation = useMutation({
    mutationFn: async (file: File) => {
      const fileExt = file.name.split('.').pop()
      const fileName = `help-${Date.now()}.${fileExt}`
      const { error } = await supabase.storage.from('help_media').upload(fileName, file)
      if (error) throw error
      const { data } = supabase.storage.from('help_media').getPublicUrl(fileName)
      return data.publicUrl
    },
    onSuccess: (url) => {
      setFormData(prev => ({ ...prev, media_url: url }))
      toast.success('Archivo subido')
    },
    onError: (err) => toast.error(`Error al subir: ${err.message}`)
  })

  const saveArticleMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase.from('help_articles').update(formData).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('help_articles').insert([formData])
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Artículo guardado exitosamente')
      queryClient.invalidateQueries({ queryKey: ['helpArticlesAdmin'] })
      resetForm()
    },
    onError: (err) => toast.error(`Error al guardar: ${err.message}`)
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('help_articles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Artículo eliminado')
      queryClient.invalidateQueries({ queryKey: ['helpArticlesAdmin'] })
    }
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) uploadMediaMutation.mutate(e.target.files[0])
  }

  const resetForm = () => {
    setEditingId(null)
    setIsNewCategory(false)
    setFormData({ title: '', category: availableCategories[0] || 'Primeros Pasos', category_icon: 'BookOpen', content: '', media_url: '', is_public: false, summary: '', reading_time_minutes: 3 })
  }

  const editArticle = (art: HelpArticle) => {
    setEditingId(art.id)
    setIsNewCategory(false)
    setFormData({
      title: art.title,
      category: art.category,
      category_icon: art.category_icon || 'BookOpen',
      content: art.content,
      media_url: art.media_url || '',
      is_public: art.is_public ?? false,
      summary: art.summary ?? '',
      reading_time_minutes: art.reading_time_minutes ?? 3
    })
  }

  const handleCategorySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    if (value === 'NEW') {
      setIsNewCategory(true)
      setFormData({ ...formData, category: '' })
    } else {
      setIsNewCategory(false)
      // Auto-seleccionar el ícono si ya existe otro artículo en esta categoría
      const existingArt = articles.find(a => a.category === value)
      setFormData({ ...formData, category: value, category_icon: existingArt?.category_icon || 'BookOpen' })
    }
  }

  if (isLoading) return <div className="flex justify-center p-10"><IAnswerLoader size={32} /></div>

  return (
    <section className="space-y-6 animate-in fade-in">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BookOpen className="text-blue-600" /> Maker del Centro de Ayuda
        </h2>
        <p className="text-sm text-slate-500 mt-1">Crea artículos y tutoriales con formato enriquecido. Asigna íconos para tus colecciones.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* FORMULARIO */}
        <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-5">
          <h3 className="font-bold text-slate-800 mb-2">{editingId ? 'Editar Artículo' : 'Nuevo Artículo'}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Título del artículo</label>
              <input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-semibold outline-none" placeholder="Ej. ¿Cómo agendar una cita?" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Colección (Categoría)</label>
              {isNewCategory ? (
                <div className="flex items-center gap-2">
                  <input autoFocus value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full p-3 bg-white border border-blue-300 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-semibold outline-none shadow-sm" placeholder="Nueva categoría..." />
                  <button onClick={() => { setIsNewCategory(false); setFormData({...formData, category: availableCategories[0]}) }} className="p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200"><X size={16} /></button>
                </div>
              ) : (
                <select value={formData.category} onChange={handleCategorySelect} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm font-semibold outline-none cursor-pointer">
                  {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option disabled>──────────</option>
                  <option value="NEW" className="font-bold text-blue-600">+ Crear Nueva Categoría...</option>
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ícono de la Colección</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map(opt => {
                const IconComp = opt.icon
                const isSelected = formData.category_icon === opt.name
                return (
                  <button 
                    key={opt.name}
                    onClick={() => setFormData({...formData, category_icon: opt.name})}
                    className={`p-3 rounded-xl transition-all border ${isSelected ? 'bg-blue-100 border-blue-300 text-blue-700 shadow-sm scale-105' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                    title={opt.name}
                  >
                    <IconComp size={20} />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contenido / Respuesta</label>
            <RichTextEditor value={formData.content} onChange={(val) => setFormData({...formData, content: val})} placeholder="Explica paso a paso. Puedes agregar negritas, listas o imágenes..." />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Video o Portada Principal (Opcional)</label>
            {formData.media_url ? (
              <div className="relative border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between">
                <a href={formData.media_url} target="_blank" className="text-sm text-blue-600 font-bold truncate pr-4 hover:underline" rel="noreferrer">{formData.media_url}</a>
                <button onClick={() => setFormData({...formData, media_url: ''})} className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-md transition-colors"><X size={16}/></button>
              </div>
            ) : (
              <label className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors text-slate-500 text-sm font-bold">
                {uploadMediaMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />} 
                {uploadMediaMutation.isPending ? 'Subiendo...' : 'Subir Archivo de Portada'}
                <input type="file" onChange={handleFileChange} className="hidden" accept="image/*,video/*" disabled={uploadMediaMutation.isPending} />
              </label>
            )}
          </div>

          {/* ── v2: Publicación en sitio público ────────────────────────── */}
          <div className="border-t border-slate-100 pt-5 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={formData.is_public}
                onChange={e => setFormData({...formData, is_public: e.target.checked})}
                className="h-5 w-5 rounded-md border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
              />
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">Publicar en sitio web</p>
                <p className="text-xs text-slate-500 font-medium">Si está activo, aparece en /recursos/ayuda del sitio público.</p>
              </div>
            </label>

            {formData.is_public && (
              <div className="grid sm:grid-cols-3 gap-3 pl-8 pt-1">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Resumen (1-2 líneas)</label>
                  <input
                    value={formData.summary}
                    onChange={e => setFormData({...formData, summary: e.target.value})}
                    placeholder="Aparece debajo del título en el sitio público"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Tiempo lectura</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={formData.reading_time_minutes}
                      onChange={e => setFormData({...formData, reading_time_minutes: parseInt(e.target.value) || 3})}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <span className="text-xs text-slate-500 font-bold">min</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-2 border-t border-slate-100 pt-5">
            {editingId && <button onClick={resetForm} className="px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">Cancelar</button>}
            <button onClick={() => saveArticleMutation.mutate()} disabled={!formData.title || !formData.content || saveArticleMutation.isPending} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-600 disabled:opacity-50 transition-colors shadow-md shadow-slate-900/10">
              {saveArticleMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar Artículo
            </button>
          </div>
        </div>

        {/* LISTA DE ARTICULOS */}
        <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[700px]">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Publicados ({articles.length})</h3>
            <button onClick={resetForm} className="text-xs bg-white border border-slate-200 font-bold px-3 py-1.5 rounded-lg text-blue-600 hover:bg-blue-50 shadow-sm">+ Nuevo</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {articles.length === 0 ? (
              <p className="text-center text-slate-400 mt-10 text-sm font-medium">No hay artículos publicados.</p>
            ) : (
              articles.map(art => {
                const IconC = ICON_OPTIONS.find(i => i.name === art.category_icon)?.icon || BookOpen
                return (
                  <div key={art.id} className={`p-4 border rounded-2xl transition-all flex gap-3 cursor-pointer
                    ${editingId === art.id ? 'border-blue-400 bg-blue-50/30 shadow-sm' : 'border-slate-100 bg-white hover:border-blue-200 hover:shadow-sm'}`}
                    onClick={() => editArticle(art)}
                  >
                    <div className="mt-1 text-slate-400"><IconC size={16} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className={`font-bold truncate text-sm ${editingId === art.id ? 'text-blue-700' : 'text-slate-900'}`}>{art.title}</h4>
                        {art.is_public && (
                          <span className="shrink-0 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider rounded border border-emerald-200">
                            Público
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider bg-slate-100 px-2 py-0.5 rounded-md">{art.category}</span>
                    </div>
                    <div className="flex flex-col items-center justify-between">
                      <button onClick={async (e) => { e.stopPropagation(); if (await confirm('¿Seguro que deseas eliminar este artículo?', { title: 'Eliminar artículo', danger: true, confirmText: 'Eliminar' })) deleteMutation.mutate(art.id) }} className="text-slate-300 hover:text-rose-600 p-1"><Trash2 size={16}/></button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>
      {ConfirmDialog}
    </section>
  )
}
