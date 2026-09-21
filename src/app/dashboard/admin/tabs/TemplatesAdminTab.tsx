 

'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import toast from 'react-hot-toast'
import {
  Layers, Plus, Save, Loader2, Copy, Trash2, Sparkles,
  Stethoscope, Home, Utensils, Megaphone, ChevronRight, X,
  Dumbbell, Scale, Briefcase, ShoppingBag, Wrench, Camera,
  GraduationCap, Heart, Pizza, Car, Plane
} from 'lucide-react'
import { useConfirm } from '../../../../hooks/useConfirm'
import IAnswerLoader from '../../../../components/IAnswerLoader'

// ============================================================================
// TemplatesAdminTab v2.26
// ----------------------------------------------------------------------------
// CRUD completo de templates. Crear, editar, duplicar, soft-delete.
// Cada template define: identidad, colores, ui_labels, active_modules,
// funnels, custom_fields, default_prompts.
// ============================================================================

const AVAILABLE_ICONS = {
  Sparkles, Stethoscope, Home, Utensils, Megaphone, Dumbbell, Scale,
  Briefcase, ShoppingBag, Wrench, Camera, GraduationCap, Heart, Pizza, Car, Plane
}

const KNOWN_MODULES = [
  { key: 'calendar',         label: 'Calendario' },
  { key: 'properties',       label: 'Propiedades (inmobiliaria)' },
  { key: 'menu',             label: 'Menú digital (restaurante)' },
  { key: 'orders',           label: 'Órdenes' },
  { key: 'reservations',     label: 'Reservas' },
  { key: 'tracking',         label: 'Tracking de envíos' },
  { key: 'patients',         label: 'Historiales clínicos' },
  { key: 'medical_memory',   label: 'Memoria médica' },
  { key: 'waitlist',         label: 'Lista de espera' },
  { key: 'reminders',        label: 'Recordatorios' },
  { key: 'leads',            label: 'Leads' },
  { key: 'visits',           label: 'Visitas' },
  { key: 'team',             label: 'Equipo' },
  { key: 'campaigns',        label: 'Campañas' },
  { key: 'accounts',         label: 'Cuentas (agencia)' },
  { key: 'reports_executive', label: 'Reportes ejecutivos' }
]

const KNOWN_LABELS = [
  { key: 'client',          placeholder: 'Cliente' },
  { key: 'clients',         placeholder: 'Clientes' },
  { key: 'client_plural',   placeholder: 'Clientes (plural alternativo)' },
  { key: 'staff',           placeholder: 'Miembro del equipo' },
  { key: 'staff_plural',    placeholder: 'Equipo' },
  { key: 'location',        placeholder: 'Sucursal' },
  { key: 'location_plural', placeholder: 'Sucursales' },
  { key: 'appointment',     placeholder: 'Cita' },
  { key: 'appointments',    placeholder: 'Citas' },
  { key: 'pipeline_kanban_title', placeholder: 'Pipeline' }
]

const FUNNEL_KEYS = [
  { key: 'new_lead',  label: 'Nuevo lead',     placeholder: 'Nuevo Lead' },
  { key: 'hot_lead',  label: 'Lead caliente',   placeholder: 'Interesado' },
  { key: 'payment',   label: 'Pago en proceso', placeholder: 'En Proceso' },
  { key: 'customer',  label: 'Cliente activo',  placeholder: 'Cliente' }
]

type Template = {
  id: string
  name: string
  short_name: string | null
  description: string | null
  icon: string
  theme_color: string
  accent_color: string
  tenant_label: string
  ui_labels: Record<string, string>
  active_modules: Record<string, boolean>
  funnels: Record<string, string>
  custom_fields: Array<{ key: string, label: string, type: string, options?: string[] }>
  default_prompts: Record<string, string>
  is_active: boolean
  is_generic: boolean
  display_order: number
}

const EMPTY_TEMPLATE: Template = {
  id: '',
  name: '',
  short_name: '',
  description: '',
  icon: 'Sparkles',
  theme_color: '#0f172a',
  accent_color: '#4f46e5',
  tenant_label: 'Plataforma',
  ui_labels: { client: 'Cliente', clients: 'Clientes', staff: 'Miembro', staff_plural: 'Equipo', location: 'Sucursal', location_plural: 'Sucursales' },
  active_modules: { calendar: true, team: true },
  funnels: { new_lead: 'Nuevo Lead', hot_lead: 'Interesado', payment: 'En Proceso', customer: 'Cliente' },
  custom_fields: [],
  default_prompts: { system_role: '', greeting: '' },
  is_active: true,
  is_generic: false,
  display_order: 100
}

export default function TemplatesAdminTab() {
  const { confirm, ConfirmDialog } = useConfirm()
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['admin-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('display_order')
      if (error) throw error
      return (data || []) as Template[]
    }
  })

  const saveMutation = useMutation({
    mutationFn: async ({ tpl, isNew }: { tpl: Template, isNew: boolean }) => {
      if (isNew) {
        const { error } = await supabase.from('templates').insert({
          ...tpl,
          updated_at: new Date().toISOString()
        })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('templates')
          .update({ ...tpl, updated_at: new Date().toISOString() })
          .eq('id', tpl.id)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Industria guardada')
      qc.invalidateQueries({ queryKey: ['admin-templates'] })
      qc.invalidateQueries({ queryKey: ['templates-catalog'] })
      qc.invalidateQueries({ queryKey: ['entitlements'] })
      setEditing(null)
      setCreating(false)
    },
    onError: (e: any) => toast.error(e?.message)
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('templates')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Industria desactivada')
      qc.invalidateQueries({ queryKey: ['admin-templates'] })
      setEditing(null)
    },
    onError: (e: any) => toast.error(e?.message)
  })

  const duplicateTemplate = (source: Template) => {
    const dup: Template = {
      ...source,
      id: `${source.id}_copy_${Date.now().toString(36)}`,
      name: `${source.name} (copia)`,
      display_order: source.display_order + 1
    }
    setEditing(dup)
    setCreating(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <IAnswerLoader size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
            <Layers size={18} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Industrias</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Define industrias verticales. Cada industria configura UI, módulos, flujos y prompts.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing({ ...EMPTY_TEMPLATE })
            setCreating(true)
          }}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl flex items-center gap-2"
        >
          <Plus size={16} />
          Nueva
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map(tpl => {
          const Icon = (AVAILABLE_ICONS as any)[tpl.icon] || Sparkles
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => { setEditing(tpl); setCreating(false) }}
              className={`text-left p-4 bg-white border-2 rounded-2xl transition-all ${
                tpl.is_active ? 'border-slate-100 hover:border-slate-300 hover:shadow-md' : 'border-slate-100 opacity-60'
              }`}
            >
              <div className="flex items-start gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-md shrink-0" style={{ backgroundColor: tpl.theme_color }}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-slate-900 text-sm tracking-tight truncate">{tpl.name}</h3>
                  <p className="text-[10px] font-bold text-slate-500 truncate font-mono">{tpl.id}</p>
                </div>
                <ChevronRight size={14} className="text-slate-400 shrink-0 mt-1" />
              </div>
              <p className="text-xs text-slate-500 font-medium line-clamp-2 leading-snug">
                {tpl.description}
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {!tpl.is_active && <span className="text-[9px] font-black uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Inactiva</span>}
                {tpl.is_generic && <span className="text-[9px] font-black uppercase bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">Genérica</span>}
                <span className="text-[9px] font-bold text-slate-400">
                  {Object.values(tpl.active_modules).filter(Boolean).length} módulos
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {editing && (
        <EditTemplateSheet
          template={editing}
          isNew={creating}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSave={(tpl) => saveMutation.mutate({ tpl, isNew: creating })}
          onDuplicate={() => duplicateTemplate(editing)}
          onDelete={async () => {
            if (await confirm(`¿Desactivar la industria "${editing.name}"? No se borra, solo deja de aparecer.`, { title: 'Desactivar industria', danger: true, confirmText: 'Desactivar' })) {
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
// EditTemplateSheet
// ============================================================================
function EditTemplateSheet({
  template, isNew, onClose, onSave, onDuplicate, onDelete, saving
}: {
  template: Template
  isNew: boolean
  onClose: () => void
  onSave: (t: Template) => void
  onDuplicate: () => void
  onDelete: () => void
  saving: boolean
}) {
  const [draft, setDraft] = useState<Template>(template)
  const [activeTab, setActiveTab] = useState<'identity' | 'visual' | 'labels' | 'modules' | 'funnels' | 'fields' | 'prompts'>('identity')

  const Icon = (AVAILABLE_ICONS as any)[draft.icon] || Sparkles

  const handleSave = () => {
    if (!draft.id || !draft.name) {
      toast.error('id y nombre son obligatorios')
      return
    }
    if (!/^[a-z0-9_]+$/.test(draft.id)) {
      toast.error('id debe ser snake_case (minúsculas, números y guiones bajos)')
      return
    }
    onSave(draft)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center text-white shadow-md" style={{ backgroundColor: draft.theme_color }}>
              <Icon size={22} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">
                {isNew ? 'Nueva industria' : draft.name}
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

        {/* Tabs */}
        <div className="px-6 border-b border-slate-100 overflow-x-auto">
          <div className="flex gap-1">
            {[
              { id: 'identity',  label: 'Identidad' },
              { id: 'visual',    label: 'Visual' },
              { id: 'labels',    label: 'Etiquetas' },
              { id: 'modules',   label: 'Módulos' },
              { id: 'funnels',   label: 'Embudo' },
              { id: 'fields',    label: 'Campos' },
              { id: 'prompts',   label: 'Prompts IA' }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as any)}
                className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {activeTab === 'identity' && (
            <>
              <Field label="ID (snake_case)" required>
                <input
                  value={draft.id}
                  onChange={e => setDraft({ ...draft, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  className={inputCls + ' font-mono'}
                  disabled={!isNew}
                  placeholder="spa, fitness, law_firm, etc."
                />
                {!isNew && <p className="text-[10px] text-slate-500 mt-1">El ID no se puede cambiar después de crear.</p>}
              </Field>
              <Field label="Nombre" required>
                <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={inputCls} placeholder="Spa &amp; Bienestar" />
              </Field>
              <Field label="Nombre corto">
                <input value={draft.short_name || ''} onChange={e => setDraft({ ...draft, short_name: e.target.value })} className={inputCls} placeholder="Spa" />
              </Field>
              <Field label="Descripción">
                <textarea value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} className={inputCls + ' h-20 resize-none'} placeholder="Spas, masajistas, terapeutas..." />
              </Field>
              <Field label="Orden">
                <input type="number" value={draft.display_order} onChange={e => setDraft({ ...draft, display_order: parseInt(e.target.value) || 100 })} className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <Field label="Activa">
                  <Toggle value={draft.is_active} onChange={v => setDraft({ ...draft, is_active: v })} />
                </Field>
                <Field label="Genérica (catch-all)">
                  <Toggle value={draft.is_generic} onChange={v => setDraft({ ...draft, is_generic: v })} />
                </Field>
              </div>
            </>
          )}

          {activeTab === 'visual' && (
            <>
              <Field label="Ícono">
                <div className="grid grid-cols-8 gap-2">
                  {Object.entries(AVAILABLE_ICONS).map(([name, IconComp]) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setDraft({ ...draft, icon: name })}
                      className={`p-3 rounded-xl flex items-center justify-center transition-all ${
                        draft.icon === name ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={name}
                    >
                      <IconComp size={18} />
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Si necesitas otro ícono, añádelo a <code className="bg-slate-100 px-1 py-0.5 rounded">AVAILABLE_ICONS</code> en este archivo y en <code>Sidebar.tsx</code>.</p>
              </Field>

              <Field label="Color de fondo (sidebar)">
                <div className="flex items-center gap-2">
                  <input type="color" value={draft.theme_color} onChange={e => setDraft({ ...draft, theme_color: e.target.value })} className="h-10 w-16 rounded border" />
                  <input value={draft.theme_color} onChange={e => setDraft({ ...draft, theme_color: e.target.value })} className={inputCls + ' font-mono'} />
                </div>
              </Field>

              <Field label="Color de acento (botones activos)">
                <div className="flex items-center gap-2">
                  <input type="color" value={draft.accent_color} onChange={e => setDraft({ ...draft, accent_color: e.target.value })} className="h-10 w-16 rounded border" />
                  <input value={draft.accent_color} onChange={e => setDraft({ ...draft, accent_color: e.target.value })} className={inputCls + ' font-mono'} />
                </div>
              </Field>

              <Field label="Etiqueta debajo del nombre">
                <input value={draft.tenant_label} onChange={e => setDraft({ ...draft, tenant_label: e.target.value })} className={inputCls} placeholder="Centro de bienestar" />
              </Field>

              {/* Preview */}
              <div className="mt-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Vista previa</p>
                <div className="p-4 rounded-2xl flex items-center gap-3 shadow-lg" style={{ backgroundColor: draft.theme_color }}>
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: draft.accent_color }}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <p className="font-black text-white text-sm">{draft.name || 'Mi Industria'}</p>
                    <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">{draft.tenant_label}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'labels' && (
            <>
              <p className="text-xs text-slate-500 font-medium mb-2">
                Estas etiquetas reemplazan textos en toda la UI. Por ejemplo, &quot;client = Paciente&quot; cambia &quot;Nuevo Cliente&quot; por &quot;Nuevo Paciente&quot; en toda la app.
              </p>
              {KNOWN_LABELS.map(({ key, placeholder }) => (
                <Field key={key} label={key}>
                  <input
                    value={draft.ui_labels[key] || ''}
                    onChange={e => setDraft({ ...draft, ui_labels: { ...draft.ui_labels, [key]: e.target.value } })}
                    placeholder={placeholder}
                    className={inputCls}
                  />
                </Field>
              ))}
            </>
          )}

          {activeTab === 'modules' && (
            <>
              <p className="text-xs text-slate-500 font-medium mb-3">
                Cada módulo activo aparece como item en el sidebar. Los módulos se acumulan entre todos los templates instalados por una company.
              </p>
              <div className="space-y-1.5">
                {KNOWN_MODULES.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100">
                    <Toggle value={!!draft.active_modules[key]} onChange={v => setDraft({ ...draft, active_modules: { ...draft.active_modules, [key]: v } })} />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900">{label}</p>
                      <p className="text-[10px] font-mono text-slate-500">{key}</p>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {activeTab === 'funnels' && (
            <>
              <p className="text-xs text-slate-500 font-medium mb-3">
                Etapas del pipeline kanban. Las 4 keys son fijas; lo que cambia es el texto visible.
              </p>
              {FUNNEL_KEYS.map(({ key, label, placeholder }) => (
                <Field key={key} label={label}>
                  <input
                    value={draft.funnels[key] || ''}
                    onChange={e => setDraft({ ...draft, funnels: { ...draft.funnels, [key]: e.target.value } })}
                    placeholder={placeholder}
                    className={inputCls}
                  />
                  <p className="text-[10px] font-mono text-slate-500 mt-1">key: {key}</p>
                </Field>
              ))}
            </>
          )}

          {activeTab === 'fields' && (
            <CustomFieldsEditor
              fields={draft.custom_fields}
              onChange={(fields) => setDraft({ ...draft, custom_fields: fields })}
            />
          )}

          {activeTab === 'prompts' && (
            <>
              <Field label="System role del agente IA">
                <textarea
                  value={draft.default_prompts.system_role || ''}
                  onChange={e => setDraft({ ...draft, default_prompts: { ...draft.default_prompts, system_role: e.target.value } })}
                  placeholder="Eres una asistente cordial del [tipo de negocio]. Tu trabajo es..."
                  className={inputCls + ' h-48 resize-none font-mono text-xs'}
                />
                <p className="text-[10px] text-slate-500 mt-1">Este prompt se carga en n8n como base del agente IA. Puede usar variables tipo &#123;&#123; company_name &#125;&#125; que n8n reemplaza.</p>
              </Field>

              <Field label="Saludo de bienvenida">
                <textarea
                  value={draft.default_prompts.greeting || ''}
                  onChange={e => setDraft({ ...draft, default_prompts: { ...draft.default_prompts, greeting: e.target.value } })}
                  placeholder="¡Hola! Soy el asistente de..."
                  className={inputCls + ' h-20 resize-none'}
                />
              </Field>
            </>
          )}
        </div>

        {/* Footer */}
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

// ============================================================================
// CustomFieldsEditor — tabla de campos personalizados
// ============================================================================
function CustomFieldsEditor({
  fields,
  onChange
}: {
  fields: Template['custom_fields']
  onChange: (f: Template['custom_fields']) => void
}) {
  const addField = () => {
    onChange([...fields, { key: '', label: '', type: 'text' }])
  }
  const updateField = (idx: number, patch: any) => {
    const copy = [...fields]
    copy[idx] = { ...copy[idx], ...patch }
    onChange(copy)
  }
  const removeField = (idx: number) => {
    onChange(fields.filter((_, i) => i !== idx))
  }

  return (
    <>
      <p className="text-xs text-slate-500 font-medium mb-3">
        Campos adicionales que aparecen en el perfil de un contacto. Por ejemplo, &quot;alergias&quot; para un consultorio, &quot;presupuesto&quot; para un agente inmobiliario.
      </p>

      <div className="space-y-2">
        {fields.map((f, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-end p-3 bg-slate-50 rounded-xl">
            <div className="col-span-3">
              <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Key</label>
              <input
                value={f.key}
                onChange={e => updateField(idx, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                placeholder="allergies"
                className={inputCls + ' font-mono text-xs'}
              />
            </div>
            <div className="col-span-4">
              <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Label visible</label>
              <input
                value={f.label}
                onChange={e => updateField(idx, { label: e.target.value })}
                placeholder="Alergias"
                className={inputCls + ' text-xs'}
              />
            </div>
            <div className="col-span-3">
              <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Tipo</label>
              <select
                value={f.type}
                onChange={e => updateField(idx, { type: e.target.value })}
                className={inputCls + ' text-xs'}
              >
                <option value="text">Texto corto</option>
                <option value="textarea">Texto largo</option>
                <option value="number">Número</option>
                <option value="select">Lista (select)</option>
                <option value="date">Fecha</option>
                <option value="boolean">Sí/No</option>
              </select>
            </div>
            <div className="col-span-2 flex justify-end">
              <button
                type="button"
                onClick={() => removeField(idx)}
                className="p-2 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {f.type === 'select' && (
              <div className="col-span-12">
                <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Opciones (separadas por coma)</label>
                <input
                  value={(f.options || []).join(', ')}
                  onChange={e => updateField(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="Opción 1, Opción 2, Opción 3"
                  className={inputCls + ' text-xs'}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addField}
        className="mt-3 w-full px-4 py-3 border-2 border-dashed border-slate-300 hover:border-slate-500 text-slate-500 hover:text-slate-900 font-bold rounded-xl text-xs flex items-center justify-center gap-2"
      >
        <Plus size={14} />
        Añadir campo
      </button>
    </>
  )
}

// helpers
const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none text-sm font-medium'

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
      className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${value ? 'bg-slate-900' : 'bg-slate-300'}`}
    >
      <div className={`h-5 w-5 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}
