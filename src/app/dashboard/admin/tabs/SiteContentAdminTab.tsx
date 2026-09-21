 

'use client'

// ============================================================================
// src/app/dashboard/admin/tabs/SiteContentAdminTab.tsx
// ----------------------------------------------------------------------------
// Editor central del CMS público. Sub-tabs internos para no abrumar:
//   General · Features · Industrias · Testimonios · FAQs · Integraciones
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import toast from 'react-hot-toast'
import {
  Save, Plus, Trash2, Loader2, GripVertical, Eye, EyeOff,
  Settings, Sparkles, Building2, MessageSquare, HelpCircle, Plug
} from 'lucide-react'
import { useConfirm } from '../../../../hooks/useConfirm'
import IAnswerLoader from '../../../../components/IAnswerLoader'

type SubTab = 'general' | 'features' | 'industries' | 'testimonials' | 'faqs' | 'integrations'

const SUB_TABS: { id: SubTab; label: string; icon: any }[] = [
  { id: 'general',       label: 'General',       icon: Settings },
  { id: 'features',      label: 'Features',      icon: Sparkles },
  { id: 'industries',    label: 'Industrias',    icon: Building2 },
  { id: 'testimonials',  label: 'Testimonios',   icon: MessageSquare },
  { id: 'faqs',          label: 'FAQs',          icon: HelpCircle },
  { id: 'integrations',  label: 'Integraciones', icon: Plug }
]

export default function SiteContentAdminTab() {
  const [active, setActive] = useState<SubTab>('general')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Contenido del sitio público</h2>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Edita los textos, features, industrias, testimonios y FAQs que aparecen en iAnswer.pro
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {SUB_TABS.map(t => {
          const Icon = t.icon
          const isActive = active === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Contenido del sub-tab */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        {active === 'general'      && <GeneralEditor />}
        {active === 'features'     && <CRUDList table="site_features"     fields={featureFields}     title="Features" />}
        {active === 'industries'   && <CRUDList table="site_industries"   fields={industryFields}    title="Industrias" />}
        {active === 'testimonials' && <CRUDList table="site_testimonials" fields={testimonialFields} title="Testimonios" />}
        {active === 'faqs'         && <CRUDList table="site_faqs"         fields={faqFields}         title="FAQs" />}
        {active === 'integrations' && <CRUDList table="site_integrations" fields={integrationFields} title="Integraciones" />}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// EDITOR GENERAL — site_settings
// ════════════════════════════════════════════════════════════════════════════

const SETTING_GROUPS: { category: string; label: string; keys: { key: string; label: string; type: 'text' | 'textarea' | 'cta' | 'json' | 'boolean'; description?: string }[] }[] = [
  {
    category: 'brand',
    label: 'Marca',
    keys: [
      { key: 'brand_name',     label: 'Nombre de la marca',   type: 'text' },
      { key: 'brand_tagline',  label: 'Tagline corto',         type: 'text' }
    ]
  },
  {
    category: 'home',
    label: 'Página principal (Home)',
    keys: [
      { key: 'hero_eyebrow',          label: 'Eyebrow (texto pequeño arriba)', type: 'text' },
      { key: 'hero_title',            label: 'Título principal',                type: 'text' },
      { key: 'hero_subtitle',         label: 'Subtítulo',                       type: 'textarea' },
      { key: 'hero_cta_primary',      label: 'CTA principal (texto + href)',    type: 'cta' },
      { key: 'hero_cta_secondary',    label: 'CTA secundario (texto + href)',   type: 'cta' },
      { key: 'hero_social_proof',     label: 'Texto sobre social proof',        type: 'text' },
      { key: 'home_features_title',   label: 'Título de sección Features',      type: 'text' },
      { key: 'home_features_subtitle',label: 'Subtítulo de sección Features',   type: 'textarea' },
      { key: 'home_industries_title', label: 'Título de sección Industrias',    type: 'text' },
      { key: 'home_industries_subtitle', label: 'Subtítulo Industrias',         type: 'textarea' },
      { key: 'home_steps_title',      label: 'Título sección 3 pasos',          type: 'text' },
      { key: 'home_steps_list',       label: '3 pasos (JSON array)',            type: 'json' },
      { key: 'home_final_cta_title',  label: 'Título CTA final del Home',       type: 'text' },
      { key: 'home_final_cta_subtitle', label: 'Subtítulo CTA final',           type: 'textarea' }
    ]
  },
  {
    category: 'pricing',
    label: 'Página de precios',
    keys: [
      { key: 'pricing_title',            label: 'Título',                       type: 'text' },
      { key: 'pricing_subtitle',         label: 'Subtítulo',                    type: 'textarea' },
      { key: 'pricing_currency',         label: 'Moneda (MXN, USD)',            type: 'text' },
      { key: 'pricing_recommended_slug', label: 'Slug del plan destacado',      type: 'text' }
    ]
  },
  {
    category: 'addons',
    label: 'Página de Addons',
    keys: [
      {
        key: 'addons_show_prices',
        label: 'Mostrar precios de addons en sitio público',
        type: 'boolean',
        description: 'Si está desactivado, las cards y secciones de addons en /addons no mostrarán precios. Útil mientras defines tu pricing.'
      }
    ]
  },
  {
    category: 'contact',
    label: 'Contacto',
    keys: [
      { key: 'contact_title',     label: 'Título',     type: 'text' },
      { key: 'contact_subtitle',  label: 'Subtítulo',  type: 'textarea' },
      { key: 'contact_email',     label: 'Email',      type: 'text' },
      { key: 'contact_whatsapp',  label: 'WhatsApp (con código país, ej. +529997012393)',   type: 'text' },
      { key: 'contact_address',   label: 'Dirección',  type: 'text' }
    ]
  },
  {
    category: 'footer',
    label: 'Footer',
    keys: [
      { key: 'footer_tagline',    label: 'Tagline en el footer', type: 'textarea' },
      { key: 'social_twitter',    label: 'URL Twitter/X',         type: 'text' },
      { key: 'social_linkedin',   label: 'URL LinkedIn',          type: 'text' },
      { key: 'social_instagram',  label: 'URL Instagram',         type: 'text' },
      { key: 'social_youtube',    label: 'URL YouTube',           type: 'text' }
    ]
  }
]

function GeneralEditor() {
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('site_settings').select('key, value')
      if (data) {
        const map = data.reduce((acc: any, r: any) => { acc[r.key] = r.value; return acc }, {})
        setSettings(map)
      }
      setLoading(false)
    }
    load()
  }, [])

  const updateValue = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const saveAll = async () => {
    setSaving(true)
    try {
      // upsert por cada key
      const rows = Object.entries(settings).map(([key, value]) => ({ key, value }))
      const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' })
      if (error) throw error
      toast.success('Cambios guardados')
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <IAnswerLoader size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {SETTING_GROUPS.map(group => (
        <div key={group.category}>
          <h3 className="text-base font-black text-slate-900 mb-4">{group.label}</h3>
          <div className="space-y-4">
            {group.keys.map(field => {
              const val = settings[field.key]
              return (
                <div key={field.key}>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
                    {field.label} <span className="text-slate-300 normal-case font-mono normal">{field.key}</span>
                  </label>

                  {field.type === 'text' && (
                    <input
                      value={typeof val === 'string' ? val : ''}
                      onChange={e => updateValue(field.key, e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  )}

                  {field.type === 'textarea' && (
                    <textarea
                      rows={3}
                      value={typeof val === 'string' ? val : ''}
                      onChange={e => updateValue(field.key, e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  )}

                  {field.type === 'cta' && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        placeholder="Texto del botón"
                        value={val?.text || ''}
                        onChange={e => updateValue(field.key, { ...val, text: e.target.value })}
                        className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        placeholder="URL (ej. /precios)"
                        value={val?.href || ''}
                        onChange={e => updateValue(field.key, { ...val, href: e.target.value })}
                        className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                      />
                    </div>
                  )}

                  {field.type === 'json' && (
                    <textarea
                      rows={6}
                      value={typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? '')}
                      onChange={e => {
                        try { updateValue(field.key, JSON.parse(e.target.value)) }
                        catch { updateValue(field.key, e.target.value) }
                      }}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                  )}

                  {field.type === 'boolean' && (
                    <label className="inline-flex items-center gap-3 cursor-pointer group">
                      <button
                        type="button"
                        onClick={() => updateValue(field.key, !val)}
                        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          val ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-200 border-slate-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ${
                            val ? 'translate-x-5' : 'translate-x-0.5'
                          } mt-0.5`}
                        />
                      </button>
                      <span className="text-sm font-bold text-slate-700">
                        {val ? 'Activado' : 'Desactivado'}
                      </span>
                    </label>
                  )}

                  {(field as any).description && (
                    <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
                      {(field as any).description}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Botón guardar pegado abajo */}
      <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white border-t border-slate-200 mt-8">
        <button
          onClick={saveAll}
          disabled={saving}
          className="px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-md transition-colors flex items-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar todos los cambios
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// CRUD LIST genérico — para features, industries, testimonials, faqs, integrations
// ════════════════════════════════════════════════════════════════════════════

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'color' | 'icon' | 'number' | 'boolean' | 'json'
  required?: boolean
  hidden?: boolean
}

const featureFields: FieldDef[] = [
  { key: 'slug',              label: 'Slug (único)',         type: 'text',     required: true },
  { key: 'title',             label: 'Título',                type: 'text',     required: true },
  { key: 'short_description', label: 'Descripción corta',     type: 'textarea' },
  { key: 'long_description',  label: 'Descripción larga',     type: 'textarea' },
  { key: 'icon_name',         label: 'Icono lucide',          type: 'icon' },
  { key: 'category',          label: 'Categoría',             type: 'text' },
  { key: 'benefits',          label: 'Beneficios (JSON array de strings)', type: 'json' },
  { key: 'display_order',     label: 'Orden',                 type: 'number' },
  { key: 'visible',           label: 'Visible',               type: 'boolean' }
]

const industryFields: FieldDef[] = [
  { key: 'slug',          label: 'Slug',          type: 'text',     required: true },
  { key: 'name',          label: 'Nombre',        type: 'text',     required: true },
  { key: 'tagline',       label: 'Tagline',       type: 'text' },
  { key: 'description',   label: 'Descripción',   type: 'textarea' },
  { key: 'icon_name',     label: 'Icono lucide',  type: 'icon' },
  { key: 'accent_color',  label: 'Color hex',     type: 'color' },
  { key: 'bullet_points', label: 'Bullets (JSON array)', type: 'json' },
  { key: 'display_order', label: 'Orden',         type: 'number' },
  { key: 'visible',       label: 'Visible',       type: 'boolean' }
]

const testimonialFields: FieldDef[] = [
  { key: 'author_name',   label: 'Nombre autor',  type: 'text', required: true },
  { key: 'author_role',   label: 'Cargo',         type: 'text' },
  { key: 'company_name',  label: 'Empresa',       type: 'text' },
  { key: 'quote',         label: 'Cita',          type: 'textarea', required: true },
  { key: 'metric_label',  label: 'Etiqueta métrica (ej. "menos cancelaciones")', type: 'text' },
  { key: 'metric_value',  label: 'Valor métrica (ej. "−45%")', type: 'text' },
  { key: 'industry_slug', label: 'Industria slug',type: 'text' },
  { key: 'featured',      label: 'Destacado',     type: 'boolean' },
  { key: 'display_order', label: 'Orden',         type: 'number' },
  { key: 'visible',       label: 'Visible',       type: 'boolean' }
]

const faqFields: FieldDef[] = [
  { key: 'question',      label: 'Pregunta', type: 'text', required: true },
  { key: 'answer',        label: 'Respuesta',type: 'textarea', required: true },
  { key: 'category',      label: 'Categoría (general/pricing/product/security)', type: 'text' },
  { key: 'display_order', label: 'Orden',    type: 'number' },
  { key: 'visible',       label: 'Visible',  type: 'boolean' }
]

const integrationFields: FieldDef[] = [
  { key: 'slug',          label: 'Slug',           type: 'text', required: true },
  { key: 'name',          label: 'Nombre',         type: 'text', required: true },
  { key: 'category',      label: 'Categoría (channels/automations/productivity/payments)', type: 'text' },
  { key: 'description',   label: 'Descripción',    type: 'textarea' },
  { key: 'logo_url',      label: 'URL del logo',   type: 'text' },
  { key: 'brand_color',   label: 'Color hex',      type: 'color' },
  { key: 'display_order', label: 'Orden',          type: 'number' },
  { key: 'available',     label: 'Disponible',     type: 'boolean' },
  { key: 'visible',       label: 'Visible',        type: 'boolean' }
]

function CRUDList({ table, fields, title }: { table: string; fields: FieldDef[]; title: string }) {
  const { confirm, ConfirmDialog } = useConfirm()
  const [items, setItems]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draft, setDraft]   = useState<any>({})

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from(table).select('*').order('display_order', { ascending: true })
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [table])

  const startNew = () => {
    const empty: any = { visible: true, display_order: items.length + 1 }
    fields.forEach(f => {
      if (f.type === 'json') empty[f.key] = []
      else if (f.type === 'boolean') empty[f.key] = empty[f.key] ?? true
      else if (f.type === 'number') empty[f.key] = empty[f.key] ?? 0
      else empty[f.key] = empty[f.key] ?? ''
    })
    setDraft(empty)
    setEditingId('new')
  }

  const startEdit = (item: any) => {
    setDraft({ ...item })
    setEditingId(item.id)
  }

  const cancel = () => {
    setEditingId(null)
    setDraft({})
  }

  const save = async () => {
    try {
      if (editingId === 'new') {
        const { error } = await supabase.from(table).insert(draft)
        if (error) throw error
        toast.success('Creado')
      } else {
        const { id, ...rest } = draft
        const { error } = await supabase.from(table).update(rest).eq('id', editingId)
        if (error) throw error
        toast.success('Actualizado')
      }
      cancel()
      load()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    }
  }

  const remove = async (id: string) => {
    if (!(await confirm(`¿Eliminar este ${title.toLowerCase()}?`, { title: 'Eliminar', danger: true, confirmText: 'Eliminar' }))) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) toast.error('Error: ' + error.message)
    else { toast.success('Eliminado'); load() }
  }

  if (loading) return <div className="text-center py-12"><IAnswerLoader size={32} /></div>

  // Form de edición/creación
  if (editingId) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-black text-slate-900">
            {editingId === 'new' ? `Nuevo ${title.toLowerCase()}` : `Editar ${title.toLowerCase()}`}
          </h3>
          <button onClick={cancel} className="text-xs font-bold text-slate-500 hover:text-slate-700">
            Cancelar
          </button>
        </div>

        <div className="space-y-4">
          {fields.map(field => (
            <div key={field.key}>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              {renderFieldInput(field, draft, setDraft)}
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200 flex gap-2">
          <button
            onClick={save}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-sm shadow-md transition-colors flex items-center gap-2"
          >
            <Save size={14} /> Guardar
          </button>
          <button
            onClick={cancel}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  // Lista
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base font-black text-slate-900">{items.length} {title.toLowerCase()}</h3>
        <button
          onClick={startNew}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs shadow-md transition-colors flex items-center gap-1.5"
        >
          <Plus size={14} /> Nuevo
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-sm text-slate-400 font-bold py-12">Aún no hay {title.toLowerCase()}.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const primaryField = fields.find(f => f.key === 'title' || f.key === 'name' || f.key === 'author_name' || f.key === 'question')
            const titleText = primaryField ? item[primaryField.key] : item.slug || item.id

            return (
              <div
                key={item.id}
                className="group flex items-center gap-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-3 transition-colors"
              >
                <GripVertical size={14} className="text-slate-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{titleText}</p>
                  {item.slug && primaryField?.key !== 'slug' && (
                    <p className="text-xs text-slate-500 font-mono truncate">{item.slug}</p>
                  )}
                </div>
                <button
                  onClick={() => startEdit(item)}
                  className="px-3 py-1.5 bg-white text-slate-700 rounded-lg text-xs font-black border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => remove(item.id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
      {ConfirmDialog}
    </div>
  )
}

function renderFieldInput(field: FieldDef, draft: any, setDraft: (d: any) => void) {
  const val = draft[field.key]
  const update = (v: any) => setDraft({ ...draft, [field.key]: v })

  if (field.type === 'text' || field.type === 'icon') {
    return (
      <input
        value={val || ''}
        onChange={e => update(e.target.value)}
        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
      />
    )
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        rows={3}
        value={val || ''}
        onChange={e => update(e.target.value)}
        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
      />
    )
  }

  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={val ?? 0}
        onChange={e => update(parseInt(e.target.value) || 0)}
        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
      />
    )
  }

  if (field.type === 'color') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={val || '#4f46e5'}
          onChange={e => update(e.target.value)}
          className="h-11 w-16 rounded-xl border border-slate-200 cursor-pointer"
        />
        <input
          value={val || ''}
          onChange={e => update(e.target.value)}
          placeholder="#4f46e5"
          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    )
  }

  if (field.type === 'boolean') {
    return (
      <button
        type="button"
        onClick={() => update(!val)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black border transition-colors ${
          val ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}
      >
        {val ? <Eye size={14} /> : <EyeOff size={14} />}
        {val ? 'Sí' : 'No'}
      </button>
    )
  }

  if (field.type === 'json') {
    return (
      <textarea
        rows={5}
        value={typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val ?? '[]')}
        onChange={e => {
          try { update(JSON.parse(e.target.value)) }
          catch { update(e.target.value) }
        }}
        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
      />
    )
  }

  return null
}
