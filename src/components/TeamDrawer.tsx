 

'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { getTemplateConfig, FieldConfig } from '../lib/teamFieldsByTemplate'
import toast from 'react-hot-toast'
import {
  X, User, Briefcase, Sparkles, Trash2, Save, Loader2,
  Camera, Plus, Mail, Phone, Palette, Tag as TagIcon
} from 'lucide-react'

export type TeamMember = {
  id?: string
  company_id?: string
  full_name: string
  title?: string
  email?: string
  phone?: string
  avatar_url?: string
  color?: string
  short_bio?: string
  bio_for_ai?: string
  tags?: string[]
  languages?: string[]
  is_active?: boolean
  // Salud
  specialty?: string
  subspecialty?: string
  medical_license?: string
  studies?: string
  years_experience?: number
  insurances_accepted?: string[]
  // Bienes raíces
  realtor_license?: string
  property_specialties?: string[]
  zones_covered?: string[]
  // Restaurantes / Marketing
  position?: string
  shift?: string
  // Bienestar / Marketing
  certifications?: string[]
  portfolio_url?: string
  // Custom
  extra_fields?: Record<string, any>
}

type Props = {
  open: boolean
  member: TeamMember | null
  companyId: string
  templateId: string
  onClose: () => void
  onSave: (member: TeamMember) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

const COLOR_PRESETS = [
  '#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'
]

type Section = 'profile' | 'professional' | 'bot'

export default function TeamDrawer({
  open, member, companyId, templateId, onClose, onSave, onDelete
}: Props) {
  const tplConfig = getTemplateConfig(templateId)
  const [section, setSection] = useState<Section>('profile')
  const [data, setData] = useState<TeamMember>({ full_name: '', company_id: companyId })
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [mounted, setMounted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Detectar montaje en cliente para safe createPortal
  useEffect(() => { setMounted(true) }, [])

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setData(member ? { ...member } : {
        full_name: '', company_id: companyId, color: COLOR_PRESETS[0],
        is_active: true, tags: [], languages: []
      })
      setSection('profile')
    }
  }, [open, member, companyId])

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = original }
  }, [open])

  if (!open) return null
  if (!mounted) return null

  const update = (patch: Partial<TeamMember>) => setData(prev => ({ ...prev, ...patch }))

  const handleSave = async () => {
    if (!data.full_name?.trim()) {
      toast.error('El nombre es requerido')
      return
    }
    setSaving(true)
    try {
      await onSave(data)
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!data.id || !onDelete) return
    if (!confirm(`¿Eliminar a ${data.full_name}? Esta acción no se puede deshacer.`)) return
    setSaving(true)
    try {
      await onDelete(data.id)
      onClose()
    } catch (e: any) {
      toast.error(e?.message || 'Error eliminando')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Máximo 5 MB')
      return
    }
    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${companyId}/team/${data.id || 'new'}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('user_media')
        .upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('user_media').getPublicUrl(path)
      update({ avatar_url: pub.publicUrl })
      toast.success('Foto subida')
    } catch (e: any) {
      toast.error(e?.message || 'Error subiendo foto')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // ── Render helpers ───────────────────────────────────────────────────────
  const renderField = (cfg: FieldConfig) => {
    const value = (data as any)[cfg.key]
    const colSpan = cfg.cols === 1 ? 'col-span-1' : 'col-span-2'

    switch (cfg.type) {
      case 'text':
      case 'number':
        return (
          <div key={cfg.key} className={colSpan}>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {cfg.label}
            </label>
            <input
              type={cfg.type === 'number' ? 'number' : 'text'}
              value={value ?? ''}
              onChange={e => update({ [cfg.key]: cfg.type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value })}
              placeholder={cfg.placeholder}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium text-slate-900"
              style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
            />
            {cfg.helpText && <p className="text-[10px] text-slate-400 mt-1">{cfg.helpText}</p>}
          </div>
        )
      case 'textarea':
        return (
          <div key={cfg.key} className={colSpan}>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {cfg.label}
            </label>
            <textarea
              value={value ?? ''}
              onChange={e => update({ [cfg.key]: e.target.value })}
              placeholder={cfg.placeholder}
              rows={4}
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium text-slate-900 resize-y"
              style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
            />
            {cfg.helpText && <p className="text-[10px] text-slate-400 mt-1">{cfg.helpText}</p>}
          </div>
        )
      case 'select':
        return (
          <div key={cfg.key} className={colSpan}>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {cfg.label}
            </label>
            <select
              value={value ?? ''}
              onChange={e => update({ [cfg.key]: e.target.value })}
              className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium text-slate-900"
              style={{ color: '#0f172a' }}
            >
              <option value="">{cfg.placeholder || 'Selecciona...'}</option>
              {cfg.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            {cfg.helpText && <p className="text-[10px] text-slate-400 mt-1">{cfg.helpText}</p>}
          </div>
        )
      case 'tags':
        return <TagsField key={cfg.key} cfg={cfg} value={value || []} onChange={v => update({ [cfg.key]: v })} colSpan={colSpan} />
      case 'multiselect':
        return <MultiSelectField key={cfg.key} cfg={cfg} value={value || []} onChange={v => update({ [cfg.key]: v })} colSpan={colSpan} />
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center sm:justify-end"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:w-[560px] h-[90vh] sm:h-full sm:max-h-screen overflow-hidden flex flex-col rounded-t-3xl sm:rounded-l-3xl sm:rounded-tr-none shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {tplConfig.noun_singular}
            </p>
            <h2 className="text-xl font-black text-slate-900 truncate">
              {data.id ? data.full_name || 'Editar' : `Nuevo ${tplConfig.noun_singular.toLowerCase()}`}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Tabs de secciones */}
        <div className="px-6 py-3 border-b border-slate-100 flex gap-1 overflow-x-auto">
          {([
            { id: 'profile' as Section,      icon: User,      label: 'Perfil' },
            { id: 'professional' as Section, icon: Briefcase, label: tplConfig.professional_section_title.split(' ')[0] },
            { id: 'bot' as Section,          icon: Sparkles,  label: 'Para el asistente' }
          ]).map(s => {
            const Icon = s.icon
            const active = section === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} />
                {s.label}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {section === 'profile' && (
            <div className="space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div
                    className="h-20 w-20 rounded-2xl bg-slate-100 flex items-center justify-center overflow-hidden border-2"
                    style={{ borderColor: data.color || '#4f46e5' }}
                  >
                    {data.avatar_url ? (
                      <img src={data.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <User size={28} className="text-slate-400" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    {uploadingAvatar ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">Foto de perfil</p>
                  <p className="text-xs text-slate-500">JPG o PNG, máximo 5 MB</p>
                </div>
              </div>

              {/* Nombre + Puesto */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    value={data.full_name}
                    onChange={e => update({ full_name: e.target.value })}
                    placeholder="Dr. Juan Pérez García"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Puesto / Título
                  </label>
                  <input
                    type="text"
                    value={data.title ?? ''}
                    onChange={e => update({ title: e.target.value })}
                    placeholder={tplConfig.noun_singular === 'Especialista' ? 'Médico cardiólogo' : 'Cargo o puesto'}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                  />
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Color de identificación
                </label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update({ color: c })}
                      className={`h-9 w-9 rounded-xl transition-all ${data.color === c ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Contacto */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Mail size={11} /> Email
                  </label>
                  <input
                    type="email"
                    value={data.email ?? ''}
                    onChange={e => update({ email: e.target.value })}
                    placeholder="juan@ejemplo.com"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Phone size={11} /> WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={data.phone ?? ''}
                    onChange={e => update({ phone: e.target.value })}
                    placeholder="+52 999 123 4567"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium"
                    style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                  />
                </div>
              </div>

              {/* Bio corta */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Bio corta (pública)
                </label>
                <textarea
                  value={data.short_bio ?? ''}
                  onChange={e => update({ short_bio: e.target.value })}
                  placeholder="Una frase que describa a esta persona."
                  rows={2}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium resize-y"
                  style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                />
              </div>

              {/* Idiomas */}
              <TagsField
                cfg={{ key: 'languages', label: 'Idiomas', type: 'tags', placeholder: 'Español, Inglés...', helpText: 'El bot lo usa para clientes extranjeros.' }}
                value={data.languages || []}
                onChange={v => update({ languages: v })}
                colSpan="col-span-2"
              />

              {/* Estado activo */}
              <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.is_active !== false}
                  onChange={e => update({ is_active: e.target.checked })}
                  className="h-4 w-4 rounded text-slate-900"
                />
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">Miembro activo</p>
                  <p className="text-xs text-slate-500">Aparece en agendas, búsquedas y al bot</p>
                </div>
              </label>
            </div>
          )}

          {section === 'professional' && (
            <div className="grid grid-cols-2 gap-4">
              {tplConfig.fields.map(renderField)}
            </div>
          )}

          {section === 'bot' && (
            <div className="space-y-6">
              <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                <Sparkles size={16} className="text-amber-700 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 font-medium leading-relaxed">
                  El bot AI usa esta información para responder preguntas SOBRE este miembro
                  (como su recepcionista). Mientras más detalle, mejor.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Información detallada
                </label>
                <textarea
                  value={data.bio_for_ai ?? ''}
                  onChange={e => update({ bio_for_ai: e.target.value })}
                  placeholder="Ej: El Dr. Juan solo atiende menores de 16 años. Especializado en alergias respiratorias. Consulta dura 40 minutos. Acepta efectivo, transferencia y tarjeta. Sus horarios son lunes a viernes 9am-2pm..."
                  rows={8}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium resize-y"
                  style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Incluye: a quién atiende, qué hace y qué no hace, costos, formas de pago, restricciones especiales.
                </p>
              </div>

              <TagsField
                cfg={{
                  key: 'tags', label: 'Palabras clave', type: 'tags',
                  placeholder: 'pediatría, alergias, embarazo...',
                  helpText: 'El bot las usa para detectar cuándo el cliente busca a alguien con esta especialidad.'
                }}
                value={data.tags || []}
                onChange={v => update({ tags: v })}
                colSpan="col-span-2"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50">
          {data.id && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-3 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
              Eliminar
            </button>
          ) : <div />}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Componentes auxiliares ──────────────────────────────────────────────────

function TagsField({ cfg, value, onChange, colSpan }: { cfg: FieldConfig, value: string[], onChange: (v: string[]) => void, colSpan: string }) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const v = input.trim()
    if (!v) return
    if (value.includes(v)) {
      setInput('')
      return
    }
    onChange([...value, v])
    setInput('')
  }

  const removeTag = (t: string) => onChange(value.filter(x => x !== t))

  return (
    <div className={colSpan}>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {cfg.label}
      </label>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addTag()
            }
          }}
          placeholder={cfg.placeholder}
          className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-slate-900 outline-none text-sm font-medium"
          style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
        />
        <button
          type="button"
          onClick={addTag}
          className="px-3 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(t => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold"
            >
              {t}
              <button type="button" onClick={() => removeTag(t)} className="hover:text-rose-600">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {cfg.helpText && <p className="text-[10px] text-slate-400 mt-1">{cfg.helpText}</p>}
    </div>
  )
}

function MultiSelectField({ cfg, value, onChange, colSpan }: { cfg: FieldConfig, value: string[], onChange: (v: string[]) => void, colSpan: string }) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter(x => x !== opt))
    else onChange([...value, opt])
  }

  return (
    <div className={colSpan}>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {cfg.label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {cfg.options?.map(opt => {
          const active = value.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {cfg.helpText && <p className="text-[10px] text-slate-400 mt-1">{cfg.helpText}</p>}
    </div>
  )
}
