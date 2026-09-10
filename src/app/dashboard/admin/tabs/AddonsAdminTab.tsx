 

'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import toast from 'react-hot-toast'
import {
  PackageOpen, Plus, Save, Loader2, Copy, Trash2,
  Phone, Plug, Sparkles, Building, Wrench, GraduationCap,
  LifeBuoy, TrendingUp, Palette, ExternalLink, X, AlertCircle
} from 'lucide-react'
import { useConfirm } from '../../../../hooks/useConfirm'

// ============================================================================
// AddonsAdminTab v2.26
// ----------------------------------------------------------------------------
// CRUD completo de addons del catálogo. Edita identidad, precio, Stripe,
// feature_flags, capacity_grants y gating por plan/template.
// ============================================================================

const AVAILABLE_ICONS = {
  Sparkles, Phone, Plug, Building, Wrench, GraduationCap,
  LifeBuoy, TrendingUp, Palette, PackageOpen
}

const CATEGORIES = [
  { id: 'channel',  label: 'Canal',         desc: 'Conexión adicional (WA, FB, IG, web)' },
  { id: 'ai',       label: 'Inteligencia',  desc: 'Modelos IA mejores o capacidades extras' },
  { id: 'feature',  label: 'Función',       desc: 'Funcionalidad específica de producto' },
  { id: 'capacity', label: 'Capacidad',     desc: 'Más volumen sin cambiar plan' },
  { id: 'service',  label: 'Servicio',      desc: 'Servicios humanos (implementación, training)' },
  { id: 'support',  label: 'Soporte',       desc: 'Niveles de soporte mejorados' }
]

const KNOWN_FEATURE_FLAGS = [
  'ai_premium_model', 'ai_priority_inference', 'ai_voice_notes', 'ai_image_analysis',
  'ai_pdf_wizard', 'ai_off_topic_wizard',
  'channel_extra_whatsapp', 'channel_extra_generic',
  'multi_location_enabled', 'reports_by_location', 'location_aware_routing',
  'sla_dedicated', 'support_24_7', 'account_manager',
  'whitelabel_full', 'custom_domain', 'branded_emails',
  'crm_advanced_filters', 'crm_export_csv', 'crm_bulk_actions'
]

const KNOWN_CAPACITY_KEYS = [
  'max_sessions_per_month', 'max_team_members', 'max_internal_users',
  'max_channels', 'max_locations', 'max_agendas', 'max_bots'
]

type Addon = {
  id: string
  name: string
  short_name: string | null
  description: string | null
  category: string
  icon: string
  price_monthly_cents: number
  price_one_time_cents: number
  currency: string
  stripe_price_id: string | null
  is_recurring: boolean
  is_one_time: boolean
  feature_flags: Record<string, boolean>
  capacity_grants: Record<string, number>
  requires_plan_min: string | null
  available_for_templates: string[]
  is_active: boolean
  is_featured: boolean
  display_order: number
}

const EMPTY_ADDON: Addon = {
  id: '',
  name: '',
  short_name: '',
  description: '',
  category: 'feature',
  icon: 'Sparkles',
  price_monthly_cents: 0,
  price_one_time_cents: 0,
  currency: 'MXN',
  stripe_price_id: '',
  is_recurring: true,
  is_one_time: false,
  feature_flags: {},
  capacity_grants: {},
  requires_plan_min: null,
  available_for_templates: [],
  is_active: true,
  is_featured: false,
  display_order: 100
}

function centsToMxn(cents: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(cents / 100)
}

export default function AddonsAdminTab() {
  const { confirm, ConfirmDialog } = useConfirm()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Addon | null>(null)
  const [creating, setCreating] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const { data: addons = [], isLoading } = useQuery({
    queryKey: ['admin-addons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('addons')
        .select('*')
        .order('display_order')
      if (error) throw error
      return (data || []) as Addon[]
    }
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['admin-templates-list'],
    queryFn: async () => {
      const { data } = await supabase.from('templates').select('id, name').eq('is_active', true).order('display_order')
      return data || []
    }
  })

  const saveMutation = useMutation({
    mutationFn: async ({ addon, isNew }: { addon: Addon, isNew: boolean }) => {
      const payload = {
        ...addon,
        stripe_price_id: addon.stripe_price_id || null,
        requires_plan_min: addon.requires_plan_min || null,
        available_for_templates: addon.available_for_templates || [],
        updated_at: new Date().toISOString()
      }
      if (isNew) {
        const { error } = await supabase.from('addons').insert(payload)
        if (error) throw error
      } else {
        const { error } = await supabase.from('addons').update(payload).eq('id', addon.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Addon guardado')
      qc.invalidateQueries({ queryKey: ['admin-addons'] })
      qc.invalidateQueries({ queryKey: ['addons-catalog'] })
      qc.invalidateQueries({ queryKey: ['entitlements'] })
      setEditing(null)
      setCreating(false)
    },
    onError: (e: any) => toast.error(e?.message)
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('addons').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Addon desactivado')
      qc.invalidateQueries({ queryKey: ['admin-addons'] })
      setEditing(null)
    },
    onError: (e: any) => toast.error(e?.message)
  })

  const duplicate = (source: Addon) => {
    setEditing({
      ...source,
      id: `${source.id}_copy_${Date.now().toString(36)}`,
      name: `${source.name} (copia)`,
      stripe_price_id: ''
    })
    setCreating(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
      </div>
    )
  }

  const filtered = addons.filter(a => categoryFilter === 'all' || a.category === categoryFilter)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
            <PackageOpen size={18} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Addons</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Extras vendibles. Cada addon activa features o añade capacidad.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setEditing({ ...EMPTY_ADDON }); setCreating(true) }}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl flex items-center gap-2"
        >
          <Plus size={16} />
          Nuevo
        </button>
      </div>

      {/* Filtros de categoría */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
            categoryFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          Todos ({addons.length})
        </button>
        {CATEGORIES.map(c => {
          const count = addons.filter(a => a.category === c.id).length
          return (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                categoryFilter === c.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {c.label} ({count})
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filtered.map(addon => {
          const Icon = (AVAILABLE_ICONS as any)[addon.icon] || Sparkles
          const cat = CATEGORIES.find(c => c.id === addon.category)
          const stripeOk = !!addon.stripe_price_id && !addon.stripe_price_id.includes('...')

          return (
            <button
              key={addon.id}
              type="button"
              onClick={() => { setEditing(addon); setCreating(false) }}
              className={`text-left p-4 bg-white border-2 rounded-2xl transition-all ${
                addon.is_active ? 'border-slate-100 hover:border-slate-300 hover:shadow-md' : 'border-slate-100 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3 mb-2">
                <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="font-black text-slate-900 text-sm tracking-tight truncate">{addon.name}</h3>
                    {addon.is_featured && <span className="text-[8px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase">Top</span>}
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 truncate">{addon.id}</p>
                </div>
                {!stripeOk && <AlertCircle size={14} className="text-amber-600 shrink-0" />}
              </div>

              <div className="flex items-center justify-between mt-2 mb-2">
                <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                  {cat?.label}
                </span>
                <span className="text-sm font-black text-slate-900">
                  {addon.is_recurring
                    ? `${centsToMxn(addon.price_monthly_cents)}/mes`
                    : centsToMxn(addon.price_one_time_cents)}
                </span>
              </div>

              <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-snug">
                {addon.description}
              </p>

              {!stripeOk && (
                <p className="mt-2 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded inline-block">
                  Stripe pendiente
                </p>
              )}
            </button>
          )
        })}
      </div>

      {editing && (
        <EditAddonSheet
          addon={editing}
          isNew={creating}
          templates={templates}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSave={(addon) => saveMutation.mutate({ addon, isNew: creating })}
          onDuplicate={() => duplicate(editing)}
          onDelete={async () => {
            if (await confirm(`¿Desactivar "${editing.name}"? Las companies que ya lo tienen seguirán cobrándose.`, { title: 'Desactivar addon', danger: true, confirmText: 'Desactivar' })) {
              deleteMutation.mutate(editing.id)
            }
          }}
          saving={saveMutation.isPending}
        />
      )}
      {ConfirmDialog}
    </div>
  )
}

// ============================================================================
// EditAddonSheet
// ============================================================================
function EditAddonSheet({
  addon, isNew, templates, onClose, onSave, onDuplicate, onDelete, saving
}: {
  addon: Addon
  isNew: boolean
  templates: Array<{ id: string, name: string }>
  onClose: () => void
  onSave: (a: Addon) => void
  onDuplicate: () => void
  onDelete: () => void
  saving: boolean
}) {
  const [draft, setDraft] = useState<Addon>(addon)
  const [customFlag, setCustomFlag] = useState('')
  const [customCapacity, setCustomCapacity] = useState({ key: '', value: 0 })
  const Icon = (AVAILABLE_ICONS as any)[draft.icon] || Sparkles

  // Mantener coherencia recurring/one_time
  useEffect(() => {
    if (draft.is_recurring && draft.is_one_time) {
      setDraft(d => ({ ...d, is_one_time: false }))
    }
  }, [draft.is_recurring])

  const handleSave = () => {
    if (!draft.id || !draft.name) {
      toast.error('id y nombre son obligatorios')
      return
    }
    if (!/^[a-z0-9_]+$/.test(draft.id)) {
      toast.error('id debe ser snake_case')
      return
    }
    if (!draft.is_recurring && !draft.is_one_time) {
      toast.error('Debe ser recurrente, one-time, o ambos')
      return
    }
    onSave(draft)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-md">
              <Icon size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                {isNew ? 'Nuevo addon' : draft.name}
              </h3>
              <p className="text-xs text-slate-500 font-medium font-mono">{draft.id || 'sin_id'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isNew && (
              <>
                <button onClick={onDuplicate} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg" title="Duplicar">
                  <Copy size={16} />
                </button>
                <button onClick={onDelete} className="p-2 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg" title="Desactivar">
                  <Trash2 size={16} />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Identidad */}
          <Section title="Identidad">
            <Field label="ID (snake_case)" required>
              <input
                value={draft.id}
                onChange={e => setDraft({ ...draft, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                className={inputCls + ' font-mono'}
                placeholder="extra_whatsapp, medical_memory_pro, etc."
                disabled={!isNew}
              />
            </Field>
            <Field label="Nombre" required>
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Nombre corto">
              <input value={draft.short_name || ''} onChange={e => setDraft({ ...draft, short_name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Descripción">
              <textarea value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} className={inputCls + ' h-20 resize-none'} />
            </Field>

            <Field label="Categoría">
              <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} className={inputCls}>
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label} — {c.desc}</option>)}
              </select>
            </Field>

            <Field label="Ícono">
              <div className="grid grid-cols-10 gap-2">
                {Object.entries(AVAILABLE_ICONS).map(([name, IconComp]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setDraft({ ...draft, icon: name })}
                    className={`p-2.5 rounded-lg flex items-center justify-center transition-all ${
                      draft.icon === name ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={name}
                  >
                    <IconComp size={16} />
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Orden">
                <input type="number" value={draft.display_order} onChange={e => setDraft({ ...draft, display_order: parseInt(e.target.value) || 100 })} className={inputCls} />
              </Field>
              <Field label="Activo">
                <Toggle value={draft.is_active} onChange={v => setDraft({ ...draft, is_active: v })} />
              </Field>
              <Field label="Destacado">
                <Toggle value={draft.is_featured} onChange={v => setDraft({ ...draft, is_featured: v })} />
              </Field>
            </div>
          </Section>

          {/* Precio */}
          <Section title="Precio">
            {/* Checkbox: Es gratis */}
            <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-sm font-black text-emerald-900">🎁 Es gratis</p>
                  <p className="text-xs text-emerald-700">Se activa al instante, sin pasar por Stripe. Ideal para funciones incluidas o ganchos.</p>
                </div>
                <Toggle
                  value={draft.price_monthly_cents === 0 && draft.price_one_time_cents === 0}
                  onChange={v => {
                    if (v) {
                      // Marcar gratis: precio 0 y limpiar stripe
                      setDraft({ ...draft, price_monthly_cents: 0, price_one_time_cents: 0, stripe_price_id: null })
                    } else {
                      // Quitar gratis: poner un precio base para que el admin lo ajuste
                      setDraft({ ...draft, price_monthly_cents: 9900 })
                    }
                  }}
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Recurrente (mensual)">
                <Toggle value={draft.is_recurring} onChange={v => setDraft({ ...draft, is_recurring: v, is_one_time: v ? false : draft.is_one_time })} />
              </Field>
              <Field label="Pago único">
                <Toggle value={draft.is_one_time} onChange={v => setDraft({ ...draft, is_one_time: v, is_recurring: v ? false : draft.is_recurring })} />
              </Field>
            </div>

            {draft.is_recurring && !(draft.price_monthly_cents === 0 && draft.price_one_time_cents === 0) && (
              <Field label="Precio mensual (centavos MXN)">
                <div className="flex items-center gap-2">
                  <input type="number" value={draft.price_monthly_cents} onChange={e => setDraft({ ...draft, price_monthly_cents: parseInt(e.target.value) || 0 })} className={inputCls} />
                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">= {centsToMxn(draft.price_monthly_cents)}/mes</span>
                </div>
              </Field>
            )}

            {draft.is_one_time && !(draft.price_monthly_cents === 0 && draft.price_one_time_cents === 0) && (
              <Field label="Precio único (centavos MXN)">
                <div className="flex items-center gap-2">
                  <input type="number" value={draft.price_one_time_cents} onChange={e => setDraft({ ...draft, price_one_time_cents: parseInt(e.target.value) || 0 })} className={inputCls} />
                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">= {centsToMxn(draft.price_one_time_cents)}</span>
                </div>
              </Field>
            )}
          </Section>

          {/* Stripe — solo si NO es gratis */}
          {!(draft.price_monthly_cents === 0 && draft.price_one_time_cents === 0) && (
          <Section title="Stripe">
            <Field label="Price ID">
              <div className="flex gap-2">
                <input
                  value={draft.stripe_price_id || ''}
                  onChange={e => setDraft({ ...draft, stripe_price_id: e.target.value })}
                  placeholder="price_1ABC..."
                  className={inputCls + ' font-mono text-xs'}
                />
                {draft.stripe_price_id && !draft.stripe_price_id.includes('...') && (
                  <a
                    href={`https://dashboard.stripe.com/prices/${draft.stripe_price_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Crea el price en Stripe Dashboard ({draft.is_one_time ? 'modo "One time"' : 'modo "Recurring monthly"'}) y pega el ID aquí.
              </p>
            </Field>
          </Section>
          )}

          {/* Feature flags */}
          <Section title="Feature flags que activa">
            <p className="text-xs text-slate-500 font-medium mb-3">
              Cuando este addon está activo, estos flags se prenden en <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">entitlements.features</code>.
            </p>

            <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto border border-slate-200 rounded-xl p-3">
              {KNOWN_FEATURE_FLAGS.map(flag => (
                <label key={flag} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!draft.feature_flags[flag]}
                    onChange={e => setDraft({ ...draft, feature_flags: { ...draft.feature_flags, [flag]: e.target.checked } })}
                    className="rounded"
                  />
                  <span className="font-mono text-[10px] text-slate-700">{flag}</span>
                </label>
              ))}
            </div>

            {/* Custom flag */}
            <div className="mt-3 flex gap-2">
              <input
                placeholder="custom_flag"
                value={customFlag}
                onChange={e => setCustomFlag(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                className={inputCls + ' font-mono text-xs'}
              />
              <button
                type="button"
                onClick={() => {
                  if (customFlag.trim()) {
                    setDraft({ ...draft, feature_flags: { ...draft.feature_flags, [customFlag]: true } })
                    setCustomFlag('')
                  }
                }}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg whitespace-nowrap"
              >
                Añadir
              </button>
            </div>

            {Object.keys(draft.feature_flags).filter(k => !KNOWN_FEATURE_FLAGS.includes(k)).length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 rounded-xl">
                {Object.entries(draft.feature_flags).filter(([k]) => !KNOWN_FEATURE_FLAGS.includes(k)).map(([k]) => (
                  <div key={k} className="flex items-center justify-between py-0.5">
                    <span className="font-mono text-[10px]">{k}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const copy = { ...draft.feature_flags }
                        delete copy[k]
                        setDraft({ ...draft, feature_flags: copy })
                      }}
                      className="text-[10px] font-bold text-rose-700"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Capacity grants */}
          <Section title="Capacidad que añade">
            <p className="text-xs text-slate-500 font-medium mb-3">
              Estos valores se SUMAN al plan base. Si el plan da 1,000 sesiones y el addon da 5,000, la company tiene 6,000.
            </p>

            <div className="space-y-2">
              {Object.entries(draft.capacity_grants).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                  <span className="font-mono text-xs font-bold flex-1">{k}</span>
                  <span className="text-xs text-slate-500">+</span>
                  <input
                    type="number"
                    value={v}
                    onChange={e => setDraft({ ...draft, capacity_grants: { ...draft.capacity_grants, [k]: parseInt(e.target.value) || 0 } })}
                    className={inputCls + ' w-32'}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const copy = { ...draft.capacity_grants }
                      delete copy[k]
                      setDraft({ ...draft, capacity_grants: copy })
                    }}
                    className="p-1.5 text-slate-500 hover:text-rose-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <select
                value={customCapacity.key}
                onChange={e => setCustomCapacity({ ...customCapacity, key: e.target.value })}
                className={inputCls + ' text-xs'}
              >
                <option value="">Seleccionar métrica...</option>
                {KNOWN_CAPACITY_KEYS.filter(k => !Object.keys(draft.capacity_grants).includes(k)).map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              <input
                type="number"
                placeholder="0"
                value={customCapacity.value || ''}
                onChange={e => setCustomCapacity({ ...customCapacity, value: parseInt(e.target.value) || 0 })}
                className={inputCls + ' w-24'}
              />
              <button
                type="button"
                onClick={() => {
                  if (customCapacity.key && customCapacity.value > 0) {
                    setDraft({ ...draft, capacity_grants: { ...draft.capacity_grants, [customCapacity.key]: customCapacity.value } })
                    setCustomCapacity({ key: '', value: 0 })
                  }
                }}
                className="px-3 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg whitespace-nowrap"
              >
                Añadir
              </button>
            </div>
          </Section>

          {/* Gating */}
          <Section title="Gating (restricciones)">
            <Field label="Plan mínimo requerido">
              <select
                value={draft.requires_plan_min || ''}
                onChange={e => setDraft({ ...draft, requires_plan_min: e.target.value || null })}
                className={inputCls}
              >
                <option value="">Cualquier plan</option>
                <option value="start">Start o superior</option>
                <option value="growth">Growth o superior</option>
                <option value="scale">Solo Scale</option>
              </select>
            </Field>

            <Field label="Disponible para templates">
              <p className="text-[10px] text-slate-500 mb-2">
                Selecciona los templates donde este addon aparece. Si no marcas ninguno, se mostrará a todas las companies (addon universal).
              </p>
              <div className="grid grid-cols-2 gap-1.5 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto">
                {templates.map(t => {
                  const isSelected = (draft.available_for_templates || []).includes(t.id)
                  return (
                    <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const current = draft.available_for_templates || []
                          if (e.target.checked) {
                            setDraft({ ...draft, available_for_templates: [...current, t.id] })
                          } else {
                            setDraft({ ...draft, available_for_templates: current.filter(x => x !== t.id) })
                          }
                        }}
                        className="rounded"
                      />
                      <span className="font-bold text-slate-700">{t.name}</span>
                    </label>
                  )
                })}
              </div>
              {(draft.available_for_templates || []).length === 0 && (
                <p className="text-[10px] font-bold text-emerald-700 mt-2">Universal: visible para todas las companies</p>
              )}
            </Field>
          </Section>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// helpers
const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none text-sm font-medium'

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, required, children }: { label: string, required?: boolean, children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1.5">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean, onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-12 h-7 rounded-full p-1 transition-colors ${value ? 'bg-slate-900' : 'bg-slate-300'}`}
    >
      <div className={`h-5 w-5 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}
