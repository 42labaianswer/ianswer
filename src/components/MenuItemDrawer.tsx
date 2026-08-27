 

'use client'

/**
 * ============================================================================
 * MenuItemDrawer · v2.18
 * ----------------------------------------------------------------------------
 * Editor de un item de menú con 2 tabs:
 *   - Datos: name, description, price, category, tags, allergens, foto
 *   - Modifiers: editor de modificadores (sin cebolla, extra queso, etc.)
 *
 * Modifiers son los que permiten que el bot tome órdenes con personalización.
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  X, Save, Trash2, Loader2, Upload, Plus, UtensilsCrossed, Camera,
  ChefHat, Leaf, Flame, Star, ShieldAlert, AlertCircle, MinusCircle, PlusCircle, Settings2
} from 'lucide-react'

export type MenuItem = {
  id?: string
  company_id?: string
  category_id?: string | null
  name: string
  description?: string
  price?: number
  is_available?: boolean
  is_recommended?: boolean
  photo_url?: string | null
  tags?: string[]
  allergens?: string[]
  modifiers?: Modifier[]
  prep_minutes?: number
  display_order?: number
  public_slug?: string
}

export type Modifier = {
  name: string
  type: 'add' | 'remove' | 'option'
  price_delta: number
}

type Props = {
  isOpen: boolean
  onClose: () => void
  item: MenuItem | null
  defaultCategoryId?: string | null
  companyId: string
  accentColor: string
}

type Tab = 'data' | 'modifiers'

const COMMON_TAGS = ['vegano', 'vegetariano', 'sin gluten', 'sin lactosa', 'picante', 'spicy', 'dulce', 'frio', 'caliente']
const COMMON_ALLERGENS = ['gluten', 'lacteos', 'huevo', 'frutos secos', 'mariscos', 'soja', 'pescado']

export default function MenuItemDrawer({ isOpen, onClose, item, defaultCategoryId, companyId, accentColor }: Props) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('data')
  const [form, setForm] = useState<MenuItem>({
    company_id: companyId, name: '', tags: [], allergens: [], modifiers: [], is_available: true
  })
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const isNew = !item?.id

  // Categorías para selector
  const { data: categories = [] } = useQuery({
    queryKey: ['menu-categories', companyId],
    queryFn: async () => {
      if (!companyId) return []
      const { data } = await supabase
        .from('menu_categories').select('id, name, icon')
        .eq('company_id', companyId).order('display_order')
      return data || []
    },
    enabled: !!companyId
  })

  // Sync form al abrir
  useEffect(() => {
    if (isOpen) {
      if (item) {
        setForm({
          ...item,
          tags: item.tags || [],
          allergens: item.allergens || [],
          modifiers: item.modifiers || []
        })
      } else {
        setForm({
          company_id: companyId, name: '',
          category_id: defaultCategoryId || null,
          tags: [], allergens: [], modifiers: [],
          is_available: true
        })
      }
      setTab('data')
    }
  }, [isOpen, item, companyId, defaultCategoryId])

  // ----- MUTATIONS -----
  const saveMutation = useMutation({
    mutationFn: async (payload: MenuItem): Promise<MenuItem> => {
      const data: any = {
        company_id: payload.company_id || companyId,
        name: payload.name.trim(),
        tags: payload.tags || [],
        allergens: payload.allergens || [],
        modifiers: payload.modifiers || [],
        is_available: payload.is_available ?? true,
        is_recommended: payload.is_recommended ?? false
      }
      if (payload.category_id) data.category_id = payload.category_id
      if (payload.description) data.description = payload.description
      if (payload.price !== undefined && payload.price !== null) data.price = payload.price
      if (payload.photo_url) data.photo_url = payload.photo_url
      if (payload.prep_minutes !== undefined && payload.prep_minutes !== null) data.prep_minutes = payload.prep_minutes
      if (payload.display_order !== undefined) data.display_order = payload.display_order

      if (payload.id) {
        const { data: result, error } = await supabase.from('menu_items').update(data).eq('id', payload.id).select().single()
        if (error) throw error
        return result as MenuItem
      } else {
        const { data: result, error } = await supabase.from('menu_items').insert(data).select().single()
        if (error) throw error
        return result as MenuItem
      }
    },
    onSuccess: (saved) => {
      toast.success(isNew ? 'Item creado' : 'Item actualizado')
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      if (isNew) setForm({ ...form, id: saved.id })
      else onClose()
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`)
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menu_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Item eliminado')
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      onClose()
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`)
  })

  // ----- HANDLERS -----
  const updateField = <K extends keyof MenuItem>(key: K, value: MenuItem[K]) => setForm({ ...form, [key]: value })

  const toggleTag = (tag: string) => {
    const current = form.tags || []
    setForm({
      ...form,
      tags: current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    })
  }

  const toggleAllergen = (a: string) => {
    const current = form.allergens || []
    setForm({
      ...form,
      allergens: current.includes(a) ? current.filter(x => x !== a) : [...current, a]
    })
  }

  const addModifier = () => {
    setForm({
      ...form,
      modifiers: [...(form.modifiers || []), { name: '', type: 'add', price_delta: 0 }]
    })
  }

  const updateModifier = (idx: number, field: keyof Modifier, value: any) => {
    const mods = [...(form.modifiers || [])]
    mods[idx] = { ...mods[idx], [field]: value }
    setForm({ ...form, modifiers: mods })
  }

  const removeModifier = (idx: number) => {
    setForm({ ...form, modifiers: (form.modifiers || []).filter((_, i) => i !== idx) })
  }

  const handlePhotoUpload = async (file: File) => {
    if (!form.id) {
      toast.error('Guarda primero el item para poder subir foto')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Máximo 5 MB')
      return
    }

    setIsUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${companyId}/${form.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('menu-photos').upload(path, file, { contentType: file.type, upsert: true })
      if (error) throw error
      const { data: pub } = supabase.storage.from('menu-photos').getPublicUrl(path)
      setForm({ ...form, photo_url: pub.publicUrl })
      await supabase.from('menu_items').update({ photo_url: pub.publicUrl }).eq('id', form.id)
      toast.success('Foto subida')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const removePhoto = async () => {
    if (!form.id) return
    setForm({ ...form, photo_url: null })
    await supabase.from('menu_items').update({ photo_url: null }).eq('id', form.id)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full md:w-[640px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0" style={{ backgroundColor: `${accentColor}08` }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: accentColor }}>
              <UtensilsCrossed size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900 truncate">
                {isNew ? 'Nuevo platillo' : (form.name || 'Platillo')}
              </h2>
              {!isNew && form.price && (
                <p className="text-xs text-slate-500 font-medium">${form.price}</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0 px-3 pt-2">
          {([
            { id: 'data',      label: 'Datos',          icon: UtensilsCrossed },
            { id: 'modifiers', label: 'Modificadores',  icon: Settings2 }
          ] as { id: Tab, label: string, icon: any }[]).map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition-colors ${active ? 'text-slate-900 border-b-2' : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent'}`}
                style={active ? { borderColor: accentColor } : {}}
              >
                <Icon size={13} /> {t.label}
                {t.id === 'modifiers' && (form.modifiers?.length || 0) > 0 && (
                  <span className="ml-1 bg-slate-200 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{form.modifiers!.length}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* === TAB: DATOS === */}
          {tab === 'data' && (
            <div className="space-y-5">
              {/* Foto + nombre */}
              <div className="flex gap-4">
                <div className="shrink-0">
                  {form.photo_url ? (
                    <div className="relative group">
                      <img src={form.photo_url} alt={form.name} className="h-24 w-24 rounded-2xl object-cover border-2 border-slate-200" />
                      <button onClick={removePhoto} className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-rose-500 hover:text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-sm">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      disabled={isUploadingPhoto || !form.id}
                      className="h-24 w-24 rounded-2xl border-2 border-dashed border-slate-300 hover:border-orange-500 hover:bg-orange-50 flex flex-col items-center justify-center text-slate-500 hover:text-orange-700 disabled:opacity-50 transition-colors"
                    >
                      {isUploadingPhoto ? <Loader2 size={20} className="animate-spin" /> : (
                        <>
                          <Camera size={18} />
                          <span className="text-[10px] font-bold mt-1">Foto</span>
                        </>
                      )}
                    </button>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={e => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])}
                    className="hidden"
                  />
                </div>

                <div className="flex-1 space-y-2">
                  <div>
                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1">Nombre *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={e => updateField('name', e.target.value)}
                      placeholder="Ej. Tacos al pastor"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1">Descripción</label>
                <textarea
                  value={form.description || ''}
                  onChange={e => updateField('description', e.target.value)}
                  placeholder="Ingredientes, preparación, lo que el cliente debe saber..."
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:bg-white resize-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1">Precio</label>
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 focus-within:bg-white focus-within:border-orange-500">
                    <span className="text-xs font-bold text-slate-500">$</span>
                    <input
                      type="number"
                      value={form.price ?? ''}
                      onChange={e => updateField('price', e.target.value === '' ? undefined : Number(e.target.value))}
                      placeholder="0"
                      className="flex-1 py-2 text-sm bg-transparent outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1">Prep. (min)</label>
                  <input
                    type="number"
                    value={form.prep_minutes ?? ''}
                    onChange={e => updateField('prep_minutes', e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="15"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1">Categoría</label>
                  <select
                    value={form.category_id || ''}
                    onChange={e => updateField('category_id', e.target.value || null)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-500 focus:bg-white"
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-2">
                  <Leaf size={11} className="inline mr-1" /> Etiquetas
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_TAGS.map(t => {
                    const active = (form.tags || []).includes(t)
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTag(t)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                          active ? 'bg-emerald-100 border-emerald-500 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                        }`}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Allergens */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-2">
                  <ShieldAlert size={11} className="inline mr-1" /> Contiene (alérgenos)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_ALLERGENS.map(a => {
                    const active = (form.allergens || []).includes(a)
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => toggleAllergen(a)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 transition-all ${
                          active ? 'bg-rose-100 border-rose-500 text-rose-800' : 'border-slate-200 bg-white text-slate-600 hover:border-rose-300'
                        }`}
                      >
                        {a}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => updateField('is_available', !form.is_available)}
                  className={`p-3 rounded-xl border-2 text-xs font-bold transition-all ${form.is_available ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}
                >
                  {form.is_available ? '✓ Disponible' : 'No disponible'}
                </button>
                <button
                  type="button"
                  onClick={() => updateField('is_recommended', !form.is_recommended)}
                  className={`p-3 rounded-xl border-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${form.is_recommended ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-500'}`}
                >
                  <Star size={12} className={form.is_recommended ? 'fill-current' : ''} /> Recomendado
                </button>
              </div>
            </div>
          )}

          {/* === TAB: MODIFICADORES === */}
          {tab === 'modifiers' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
                <p className="font-bold mb-1">💡 ¿Para qué sirven?</p>
                <p>El bot ofrece estos al cliente cuando toma una orden. Ejemplos: "Sin cebolla", "Extra queso (+$15)", "Término medio".</p>
                <p className="mt-1.5">
                  <strong>add</strong>: agrega y suma al precio (extra queso +$15)<br/>
                  <strong>remove</strong>: quita ingrediente sin costo (sin cebolla)<br/>
                  <strong>option</strong>: opción sin costo (cocción, salsa)
                </p>
              </div>

              {(form.modifiers || []).length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <Settings2 size={32} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-600">Sin modificadores</p>
                  <p className="text-xs text-slate-500 mt-1 mb-4">Agrega opciones que el cliente pueda elegir al ordenar este platillo.</p>
                  <button
                    onClick={addModifier}
                    className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-2"
                  >
                    <Plus size={12} /> Agregar primero
                  </button>
                </div>
              ) : (
                <>
                  {(form.modifiers || []).map((m, idx) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-3 flex gap-2 items-center">
                      <select
                        value={m.type}
                        onChange={e => updateModifier(idx, 'type', e.target.value)}
                        className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-orange-500"
                      >
                        <option value="add">+ Add</option>
                        <option value="remove">− Sin</option>
                        <option value="option">○ Opción</option>
                      </select>
                      <input
                        type="text"
                        value={m.name}
                        onChange={e => updateModifier(idx, 'name', e.target.value)}
                        placeholder={m.type === 'remove' ? 'cebolla' : m.type === 'add' ? 'Extra queso' : 'Término medio'}
                        className="flex-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-500"
                      />
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 focus-within:border-orange-500">
                        <span className="text-[10px] font-bold text-slate-500">$</span>
                        <input
                          type="number"
                          value={m.price_delta ?? 0}
                          onChange={e => updateModifier(idx, 'price_delta', Number(e.target.value))}
                          disabled={m.type === 'remove' || m.type === 'option'}
                          className="w-16 py-1.5 text-sm bg-transparent outline-none disabled:opacity-40"
                        />
                      </div>
                      <button
                        onClick={() => removeModifier(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={addModifier}
                    className="w-full py-2.5 border-2 border-dashed border-slate-300 hover:border-orange-400 hover:bg-orange-50 rounded-2xl text-xs font-bold text-slate-600 hover:text-orange-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={12} /> Agregar modificador
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div>
            {!isNew && form.id && (
              <button
                onClick={() => {
                  if (confirm('¿Eliminar este item del menú?')) deleteMutation.mutate(form.id!)
                }}
                disabled={deleteMutation.isPending}
                className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-lg flex items-center gap-1.5"
              >
                {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Eliminar
              </button>
            )}
          </div>
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending || !form.name.trim()}
            className="text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md disabled:opacity-50"
            style={{ backgroundColor: accentColor }}
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isNew ? 'Crear platillo' : 'Guardar'}
          </button>
        </div>
      </div>
    </>
  )
}
