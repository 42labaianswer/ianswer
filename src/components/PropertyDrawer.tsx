 

'use client'

/**
 * ============================================================================
 * PropertyDrawer · v2.17
 * ----------------------------------------------------------------------------
 * Drawer lateral para crear/editar propiedades con 3 tabs:
 *
 *   1. Datos     — tipo, operación, precio, recámaras, baños, m²
 *   2. Ubicación — dirección, ciudad, zona, coordenadas (Google Maps embed)
 *   3. Fotos     — uploader múltiple (max 5 por propiedad)
 *
 * Estado de la propiedad (disponible/apartada/vendida/rentada/borrador) se
 * controla en la card de listing, no aquí — para que sea rápido cambiar status
 * sin abrir todo el editor.
 * ============================================================================
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  X, Save, Loader2, Home, MapPin, Camera, Trash2, Plus, Upload,
  DollarSign, Bed, Bath, Car, Square, ChevronDown, AlertCircle
} from 'lucide-react'

export type Property = {
  id?: string
  company_id?: string
  title: string
  description?: string
  property_type?: 'casa' | 'depto' | 'terreno' | 'local' | 'oficina' | 'bodega' | 'quinta' | 'otro'
  operation_type?: 'venta' | 'renta' | 'preventa' | 'renta_temporal'
  status?: 'disponible' | 'apartada' | 'vendida' | 'rentada' | 'borrador'
  price?: number
  currency?: string
  maintenance_fee?: number
  bedrooms?: number
  bathrooms?: number
  parking_spots?: number
  area_total_m2?: number
  area_built_m2?: number
  year_built?: number
  address?: string
  city?: string
  state?: string
  zone?: string
  latitude?: number
  longitude?: number
  features?: string[]
  photos?: string[]
  assigned_to_team_id?: string | null
  external_id?: string
  public_slug?: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  property: Property | null
  companyId: string
  accentColor: string
}

type DrawerTab = 'data' | 'location' | 'photos'

const PROPERTY_TYPES = [
  { id: 'casa',     label: 'Casa' },
  { id: 'depto',    label: 'Departamento' },
  { id: 'terreno',  label: 'Terreno' },
  { id: 'local',    label: 'Local' },
  { id: 'oficina',  label: 'Oficina' },
  { id: 'bodega',   label: 'Bodega' },
  { id: 'quinta',   label: 'Quinta' },
  { id: 'otro',     label: 'Otro' }
] as const

const OPERATION_TYPES = [
  { id: 'venta',           label: 'Venta' },
  { id: 'renta',           label: 'Renta' },
  { id: 'preventa',        label: 'Preventa' },
  { id: 'renta_temporal',  label: 'Renta temporal' }
] as const

export default function PropertyDrawer({ isOpen, onClose, property, companyId, accentColor }: Props) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<DrawerTab>('data')
  const [form, setForm] = useState<Property>({
    company_id: companyId,
    title: '',
    currency: 'MXN',
    features: [],
    photos: []
  })
  const [featureInput, setFeatureInput] = useState('')
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const isNew = !property?.id

  // Team list para asignar agente
  const { data: team = [] } = useQuery({
    queryKey: ['team-list-for-property', companyId],
    queryFn: async () => {
      if (!companyId) return []
      const { data } = await supabase.from('team').select('id, full_name, title').eq('company_id', companyId).order('full_name')
      return data || []
    },
    enabled: !!companyId
  })

  // Sync form on open
  useEffect(() => {
    if (isOpen) {
      if (property) {
        setForm({ ...property, photos: property.photos || [], features: property.features || [] })
      } else {
        setForm({
          company_id: companyId, title: '', currency: 'MXN',
          features: [], photos: [], status: 'borrador'
        })
      }
      setTab('data')
    }
  }, [isOpen, property, companyId])

  // ----- MUTATIONS -----
  const saveMutation = useMutation({
    mutationFn: async (payload: Property): Promise<Property> => {
      // Sanitizar: quitar campos vacíos/undefined
      const data: any = {
        company_id: payload.company_id || companyId,
        title: payload.title.trim()
      }
      const optionalNum = ['price','maintenance_fee','bedrooms','bathrooms','parking_spots','area_total_m2','area_built_m2','year_built','latitude','longitude']
      const optionalStr = ['description','property_type','operation_type','status','currency','address','city','state','zone','external_id','assigned_to_team_id']

      for (const k of optionalStr) {
        const v = (payload as any)[k]
        if (v !== undefined && v !== '' && v !== null) data[k] = v
      }
      for (const k of optionalNum) {
        const v = (payload as any)[k]
        if (v !== undefined && v !== '' && v !== null && !isNaN(Number(v))) data[k] = Number(v)
      }
      data.features = payload.features || []
      data.photos = payload.photos || []

      if (payload.id) {
        const { data: result, error } = await supabase.from('properties').update(data).eq('id', payload.id).select().single()
        if (error) throw error
        return result as Property
      } else {
        const { data: result, error } = await supabase.from('properties').insert(data).select().single()
        if (error) throw error
        return result as Property
      }
    },
    onSuccess: (saved) => {
      toast.success(isNew ? 'Propiedad creada' : 'Propiedad actualizada')
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      if (isNew) {
        setForm({ ...form, id: saved.id })
      } else {
        onClose()
      }
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`)
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('properties').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Propiedad eliminada')
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      onClose()
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`)
  })

  // ----- HANDLERS -----
  const updateField = <K extends keyof Property>(key: K, value: Property[K]) => {
    setForm({ ...form, [key]: value })
  }

  const addFeature = () => {
    const f = featureInput.trim()
    if (!f) return
    if ((form.features || []).includes(f)) return
    setForm({ ...form, features: [...(form.features || []), f] })
    setFeatureInput('')
  }

  const removeFeature = (idx: number) => {
    setForm({ ...form, features: (form.features || []).filter((_, i) => i !== idx) })
  }

  const handlePhotoUpload = async (files: FileList) => {
    if (!form.id) {
      toast.error('Guarda la propiedad primero para poder agregar fotos')
      return
    }
    if ((form.photos || []).length + files.length > 5) {
      toast.error('Máximo 5 fotos por propiedad')
      return
    }

    setIsUploadingPhoto(true)
    const newUrls: string[] = []
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`"${file.name}" excede 5 MB`)
          continue
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
        const path = `${companyId}/${form.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('property-photos').upload(path, file, { contentType: file.type })
        if (uploadErr) throw uploadErr
        const { data: pub } = supabase.storage.from('property-photos').getPublicUrl(path)
        newUrls.push(pub.publicUrl)
      }
      const updatedPhotos = [...(form.photos || []), ...newUrls]
      setForm({ ...form, photos: updatedPhotos })

      // Persistir inmediatamente las fotos
      await supabase.from('properties').update({ photos: updatedPhotos }).eq('id', form.id)
      toast.success(`${newUrls.length} foto(s) subida(s)`)
    } catch (err: any) {
      toast.error(`Error: ${err.message}`)
    } finally {
      setIsUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  const removePhoto = async (url: string) => {
    if (!form.id) return
    const updatedPhotos = (form.photos || []).filter(p => p !== url)
    setForm({ ...form, photos: updatedPhotos })
    await supabase.from('properties').update({ photos: updatedPhotos }).eq('id', form.id)
    // No borramos del Storage por defecto (puede haber referencias). Si quieres, agrega aquí .remove().
    toast.success('Foto removida')
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 animate-in fade-in" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full md:w-[720px] bg-white shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0" style={{ backgroundColor: `${accentColor}08` }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: accentColor }}>
              <Home size={22} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900 truncate">
                {isNew ? 'Nueva propiedad' : (form.title || 'Propiedad')}
              </h2>
              {!isNew && (
                <p className="text-xs text-slate-500 font-medium">
                  {form.property_type ? PROPERTY_TYPES.find(t => t.id === form.property_type)?.label : ''}
                  {form.price ? ` · $${form.price.toLocaleString()} ${form.currency || 'MXN'}` : ''}
                </p>
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
            { id: 'data',     label: 'Datos',     icon: Home },
            { id: 'location', label: 'Ubicación', icon: MapPin },
            { id: 'photos',   label: 'Fotos',     icon: Camera }
          ] as { id: DrawerTab, label: string, icon: any }[]).map(t => {
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
                {t.id === 'photos' && (form.photos?.length || 0) > 0 && (
                  <span className="ml-1 bg-slate-200 text-slate-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{form.photos!.length}</span>
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
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Título *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={e => updateField('title', e.target.value)}
                  placeholder="Ej. Casa moderna en Polanco con vista al parque"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Descripción</label>
                <textarea
                  value={form.description || ''}
                  onChange={e => updateField('description', e.target.value)}
                  placeholder="Detalles, características, vecindario..."
                  rows={3}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Tipo</label>
                  <select
                    value={form.property_type || ''}
                    onChange={e => updateField('property_type', e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    <option value="">Selecciona...</option>
                    {PROPERTY_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Operación</label>
                  <select
                    value={form.operation_type || ''}
                    onChange={e => updateField('operation_type', e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  >
                    <option value="">Selecciona...</option>
                    {OPERATION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">
                    <DollarSign size={11} className="inline" /> Precio
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={form.price ?? ''}
                      onChange={e => updateField('price', e.target.value === '' ? undefined : Number(e.target.value))}
                      placeholder="5000000"
                      className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                    />
                    <select
                      value={form.currency || 'MXN'}
                      onChange={e => updateField('currency', e.target.value)}
                      className="w-20 px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 focus:bg-white"
                    >
                      <option value="MXN">MXN</option>
                      <option value="USD">USD</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Mantenimiento mensual</label>
                  <input
                    type="number"
                    value={form.maintenance_fee ?? ''}
                    onChange={e => updateField('maintenance_fee', e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="2500"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">
                    <Bed size={11} className="inline" /> Recámaras
                  </label>
                  <input
                    type="number"
                    value={form.bedrooms ?? ''}
                    onChange={e => updateField('bedrooms', e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">
                    <Bath size={11} className="inline" /> Baños
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={form.bathrooms ?? ''}
                    onChange={e => updateField('bathrooms', e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">
                    <Car size={11} className="inline" /> Estac.
                  </label>
                  <input
                    type="number"
                    value={form.parking_spots ?? ''}
                    onChange={e => updateField('parking_spots', e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">
                    <Square size={11} className="inline" /> Terreno (m²)
                  </label>
                  <input
                    type="number"
                    value={form.area_total_m2 ?? ''}
                    onChange={e => updateField('area_total_m2', e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">
                    <Square size={11} className="inline" /> Construcción (m²)
                  </label>
                  <input
                    type="number"
                    value={form.area_built_m2 ?? ''}
                    onChange={e => updateField('area_built_m2', e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Año construcción</label>
                  <input
                    type="number"
                    value={form.year_built ?? ''}
                    onChange={e => updateField('year_built', e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="2020"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Amenidades */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Amenidades</label>
                {(form.features || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(form.features || []).map((f, i) => (
                      <span key={`${f}-${i}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                        {f}
                        <button onClick={() => removeFeature(i)} className="hover:bg-purple-200 rounded-full p-0.5">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={featureInput}
                    onChange={e => setFeatureInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                    placeholder="Alberca, gym, vista al mar, jacuzzi..."
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                  <button onClick={addFeature} disabled={!featureInput.trim()} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-30 text-white rounded-xl text-xs font-bold flex items-center gap-1">
                    <Plus size={12} /> Agregar
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Presiona Enter para agregar</p>
              </div>

              {/* Agente asignado */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Agente asignado</label>
                <select
                  value={form.assigned_to_team_id || ''}
                  onChange={e => updateField('assigned_to_team_id', e.target.value || null)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                >
                  <option value="">Sin asignar</option>
                  {team.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.title} {m.full_name}</option>
                  ))}
                </select>
              </div>

              {/* External ID */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">ID externo / Referencia MLS</label>
                <input
                  type="text"
                  value={form.external_id || ''}
                  onChange={e => updateField('external_id', e.target.value)}
                  placeholder="Ej. MLS-12345"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white font-mono"
                />
              </div>
            </div>
          )}

          {/* === TAB: UBICACIÓN === */}
          {tab === 'location' && (
            <div className="space-y-5">
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Dirección</label>
                <input
                  type="text"
                  value={form.address || ''}
                  onChange={e => updateField('address', e.target.value)}
                  placeholder="Av. Presidente Masaryk 123, Polanco"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Zona / Colonia</label>
                  <input
                    type="text"
                    value={form.zone || ''}
                    onChange={e => updateField('zone', e.target.value)}
                    placeholder="Polanco"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Ciudad</label>
                  <input
                    type="text"
                    value={form.city || ''}
                    onChange={e => updateField('city', e.target.value)}
                    placeholder="Ciudad de México"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Estado</label>
                <input
                  type="text"
                  value={form.state || ''}
                  onChange={e => updateField('state', e.target.value)}
                  placeholder="Yucatán"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Latitud</label>
                  <input
                    type="number"
                    step="any"
                    value={form.latitude ?? ''}
                    onChange={e => updateField('latitude', e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="19.4326"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-700 uppercase tracking-widest block mb-1.5">Longitud</label>
                  <input
                    type="number"
                    step="any"
                    value={form.longitude ?? ''}
                    onChange={e => updateField('longitude', e.target.value === '' ? undefined : Number(e.target.value))}
                    placeholder="-99.1332"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white font-mono"
                  />
                </div>
              </div>

              {/* Google Maps embed */}
              {form.latitude && form.longitude && (
                <div className="aspect-video rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                  <iframe
                    title="Mapa"
                    src={`https://www.google.com/maps?q=${form.latitude},${form.longitude}&z=15&output=embed`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                  />
                </div>
              )}

              {(!form.latitude || !form.longitude) && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
                  <p className="font-bold mb-1">💡 Cómo obtener coordenadas</p>
                  <p>Abre <a href="https://maps.google.com" target="_blank" rel="noreferrer" className="underline">Google Maps</a>, busca la dirección, click derecho en el pin → copia las coordenadas (lat, lng).</p>
                </div>
              )}
            </div>
          )}

          {/* === TAB: FOTOS === */}
          {tab === 'photos' && (
            <div className="space-y-4">
              {!form.id && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-900">Guarda primero la propiedad para poder subir fotos.</p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(form.photos || []).map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-2xl overflow-hidden border border-slate-200">
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(url)}
                      className="absolute top-2 right-2 p-1.5 bg-white/90 hover:bg-rose-500 hover:text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                      title="Eliminar foto"
                    >
                      <Trash2 size={12} />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-2 left-2 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">PRINCIPAL</span>
                    )}
                  </div>
                ))}

                {(form.photos?.length || 0) < 5 && form.id && (
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="aspect-square rounded-2xl border-2 border-dashed border-slate-300 hover:border-purple-500 hover:bg-purple-50 transition-colors flex flex-col items-center justify-center text-slate-500 hover:text-purple-700 disabled:opacity-50"
                  >
                    {isUploadingPhoto ? (
                      <Loader2 size={24} className="animate-spin" />
                    ) : (
                      <>
                        <Upload size={24} />
                        <span className="text-xs font-bold mt-1">Subir foto</span>
                        <span className="text-[10px]">Max 5 MB</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => e.target.files && handlePhotoUpload(e.target.files)}
                className="hidden"
              />

              <p className="text-[10px] text-slate-500">
                Hasta 5 fotos por propiedad. La primera se usará como principal en el catálogo público y como portada cuando el bot mande el link al cliente.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div>
            {!isNew && form.id && (
              <button
                onClick={() => {
                  if (confirm('¿Eliminar esta propiedad? No se puede deshacer.')) {
                    deleteMutation.mutate(form.id!)
                  }
                }}
                disabled={deleteMutation.isPending}
                className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
              >
                {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Eliminar
              </button>
            )}
          </div>
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending || !form.title.trim()}
            className="text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md disabled:opacity-50"
            style={{ backgroundColor: accentColor }}
          >
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {isNew ? 'Crear propiedad' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </>
  )
}
