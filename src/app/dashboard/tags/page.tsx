 

'use client'

import { useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { usePlanFeatures } from '../../../hooks/usePlanFeatures'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Tag, Plus, Edit2, Trash2, X, Save, Loader2, Search, Sparkles,
  AlertCircle, Wand2, Users, RefreshCw, ChevronDown, Info, Lock
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================
type TagRow = {
  id: string
  company_id: string
  name: string
  color: string
  description: string | null
  ai_aware: boolean
  ai_context: string | null
  display_order: number
  created_at: string
  updated_at: string
}

type TagStats = TagRow & { contacts_count: number }

// Paleta de colores disponibles
const COLOR_PALETTE = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#10b981', '#06b6d4', '#0ea5e9',
  '#64748b', '#78716c', '#a855f7', '#d946ef', '#f43f5e'
]

// ============================================================================
// PÁGINA
// ============================================================================
export default function TagsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: features, isLoading: isLoadingFeatures } = usePlanFeatures()

  const [search, setSearch] = useState('')
  const [editingTag, setEditingTag] = useState<TagRow | null>(null)
  const [creatingTag, setCreatingTag] = useState(false)

  // Profile
  const { data: profile } = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No autenticado')
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      return data
    }
  })
  const companyId = profile?.company_id || ''

  // Tags con stats
  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tagsStats', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('v_tag_usage_stats')
        .select('*, description, ai_context, display_order, created_at, updated_at')
        .eq('company_id', companyId)
      // v_tag_usage_stats no incluye description/ai_context. Necesitamos un join manual.
      // Ajusto: traer todo de tags y mergear con counts
      const { data: rawTags } = await supabase
        .from('tags')
        .select('*')
        .eq('company_id', companyId)
        .order('display_order', { ascending: true })
      const { data: counts } = await supabase
        .from('v_tag_usage_stats')
        .select('tag_id, contacts_count')
        .eq('company_id', companyId)
      const countMap = new Map((counts || []).map(c => [c.tag_id, c.contacts_count]))
      return (rawTags || []).map(t => ({
        ...t,
        contacts_count: countMap.get(t.id) || 0
      })) as TagStats[]
    }
  })

  // Filtered tags
  const filtered = useMemo(() => {
    if (!search.trim()) return tags
    const s = search.toLowerCase()
    return tags.filter(t =>
      t.name.toLowerCase().includes(s) ||
      (t.description || '').toLowerCase().includes(s)
    )
  }, [tags, search])

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Etiqueta eliminada')
      queryClient.invalidateQueries({ queryKey: ['tagsStats'] })
    },
    onError: (e: any) => toast.error(e.message)
  })

  // Guards
  if (isLoadingFeatures) {
    return <div className="flex justify-center items-center h-[60vh]"><Loader2 className="animate-spin text-slate-400" size={32} /></div>
  }
  if (!features?.crm_tags_visual) {
    return (
      <div className="max-w-2xl mx-auto py-20">
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 text-white flex items-center justify-center shadow-lg mb-5">
            <Tag size={28} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Etiquetas no disponibles en tu plan</h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
            Crea tus propias etiquetas (diabetes, VIP, seguro Metlife...) y úsalas para filtrar y agrupar pacientes. En el plan premium, las etiquetas que marques las lee también el agente IA.
          </p>
          <button onClick={() => router.push('/dashboard/plans')} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-md inline-flex items-center gap-2">
            Ver planes disponibles
          </button>
        </div>
      </div>
    )
  }

  const totalContacts = tags.reduce((acc, t) => acc + t.contacts_count, 0)
  const aiAwareTags = tags.filter(t => t.ai_aware).length

  return (
<div className="px-4 md:px-8 py-4 md:py-6 space-y-4 md:space-y-6">
      {/* Action bar */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setCreatingTag(true)}
          className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-black rounded-xl shadow-md flex items-center gap-2"
        >
          <Plus size={16} /> Nueva etiqueta
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard icon={Tag} label="Total etiquetas" value={tags.length} color="blue" />
        <KPICard icon={Users} label="Asignaciones" value={totalContacts} color="purple" />
        <KPICard icon={Wand2} label="Lee el bot" value={aiAwareTags} color="emerald" />
        <KPICard icon={Sparkles} label="Más usada" value={tags.length > 0 ? (tags.slice().sort((a, b) => b.contacts_count - a.contacts_count)[0]?.name || '—') : '—'} color="amber" />
      </div>

      {/* Banner sobre AI awareness */}
      {features?.crm_tags_ai_aware && (
        <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-2xl p-4 flex gap-3 items-start">
          <div className="h-9 w-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <Wand2 size={16} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-slate-900">El agente IA puede leer tus etiquetas</p>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Marca una etiqueta como <strong>"que lo lea el bot"</strong> y escribe el contexto. Cuando llegue un mensaje de un paciente con esa etiqueta, el bot lo considera antes de responder.
              Ejemplo: tag <code className="bg-white px-1 rounded">diabetes</code> + contexto <em>"avisar al paciente antes de citas que requieran ayuno"</em>.
            </p>
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text" placeholder="Buscar etiqueta..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:bg-white focus:border-blue-500"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center">
          <Tag size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-xl font-black text-slate-700 mb-2">
            {tags.length === 0 ? 'Aún no tienes etiquetas' : 'Sin coincidencias'}
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            {tags.length === 0
              ? 'Crea tu primera etiqueta. Ejemplos comunes: diabetes, hipertensión, VIP, seguro Metlife, revisión anual pendiente.'
              : 'Ajusta tu búsqueda o crea una nueva etiqueta.'}
          </p>
          {tags.length === 0 && (
            <button onClick={() => setCreatingTag(true)} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-black rounded-xl shadow-md inline-flex items-center gap-2">
              <Plus size={16} /> Crear primera etiqueta
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(tag => (
            <TagCard
              key={tag.id}
              tag={tag}
              canEditAi={!!features?.crm_tags_ai_aware}
              onEdit={() => setEditingTag(tag)}
              onDelete={() => {
                if (confirm(`¿Eliminar la etiqueta "${tag.name}"? Se quitará de ${tag.contacts_count} contacto(s).`)) {
                  deleteMutation.mutate(tag.id)
                }
              }}
            />
          ))}
        </div>
      )}

      {/* MODAL */}
      {(creatingTag || editingTag) && companyId && (
        <TagFormModal
          tag={editingTag}
          companyId={companyId}
          canEditAi={!!features?.crm_tags_ai_aware}
          onClose={() => { setCreatingTag(false); setEditingTag(null) }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['tagsStats'] })
            setCreatingTag(false)
            setEditingTag(null)
          }}
        />
      )}
    </div>
  )
}


// ============================================================================
// TagCard
// ============================================================================
function TagCard({ tag, canEditAi, onEdit, onDelete }: {
  tag: TagStats
  canEditAi: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="bg-white rounded-2xl border-2 border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm"
            style={{ backgroundColor: tag.color }}
          >
            <Tag size={14} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-slate-900 text-sm truncate">{tag.name}</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {tag.contacts_count === 0 ? 'Sin asignaciones' : `${tag.contacts_count} ${tag.contacts_count === 1 ? 'contacto' : 'contactos'}`}
            </p>
          </div>
        </div>
        {tag.ai_aware && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 uppercase tracking-wider">
            <Wand2 size={9} /> Bot
          </span>
        )}
      </div>

      {tag.description && (
        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-3 italic">
          {tag.description}
        </p>
      )}

      {tag.ai_aware && tag.ai_context && canEditAi && (
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-2.5 mb-3">
          <p className="text-[9px] font-black text-emerald-700 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            <Wand2 size={9} /> Contexto para el bot
          </p>
          <p className="text-[11px] text-emerald-900 leading-snug line-clamp-2">{tag.ai_context}</p>
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100">
        <button
          onClick={onEdit}
          className="flex-1 text-xs font-bold py-2 rounded-lg text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Edit2 size={11} /> Editar
        </button>
        <button
          onClick={onDelete}
          title="Eliminar"
          className="text-xs font-bold py-2 px-3 rounded-lg text-rose-500 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}


// ============================================================================
// KPICard
// ============================================================================
function KPICard({ icon: Icon, label, value, color }: { icon: any, label: string, value: number | string, color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600'
  }
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-xl font-black text-slate-900 tabular-nums leading-none mt-0.5 truncate">{value}</p>
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// TagFormModal — crear / editar
// ============================================================================
function TagFormModal({ tag, companyId, canEditAi, onClose, onSaved }: {
  tag: TagRow | null
  companyId: string
  canEditAi: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(tag?.name || '')
  const [color, setColor] = useState(tag?.color || COLOR_PALETTE[0])
  const [description, setDescription] = useState(tag?.description || '')
  const [aiAware, setAiAware] = useState(tag?.ai_aware || false)
  const [aiContext, setAiContext] = useState(tag?.ai_context || '')

  const isEditing = !!tag

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('La etiqueta necesita un nombre')

      const payload = {
        company_id: companyId,
        name: name.trim(),
        color,
        description: description.trim() || null,
        ai_aware: canEditAi ? aiAware : false,
        ai_context: canEditAi && aiAware ? (aiContext.trim() || null) : null
      }

      if (isEditing) {
        const { error } = await supabase.from('tags').update(payload).eq('id', tag!.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tags').insert([payload])
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? 'Etiqueta actualizada' : 'Etiqueta creada')
      onSaved()
    },
    onError: (e: any) => {
      if (e.message?.includes('duplicate')) {
        toast.error('Ya existe una etiqueta con ese nombre')
      } else {
        toast.error(e.message || 'Error al guardar')
      }
    }
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-br from-purple-50 to-white shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center shadow-sm"
              style={{ backgroundColor: color }}
            >
              <Tag size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                {isEditing ? `Editar "${tag?.name}"` : 'Nueva etiqueta'}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Define una categoría para clasificar contactos
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2 hover:bg-white rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Nombre */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Nombre</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej. diabetes, VIP, seguro Metlife"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-purple-500"
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-lg transition-all ${color === c ? 'ring-2 ring-offset-2 ring-slate-700 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
              Descripción interna <span className="font-medium normal-case text-slate-400">(opcional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Para qué usas esta etiqueta. Solo tu equipo lo ve."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-purple-500 resize-none"
            />
          </div>

          {/* AI awareness */}
          <div className={`border-2 rounded-2xl p-4 ${canEditAi ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/50 opacity-70'}`}>
            <label className={`flex items-start gap-3 ${canEditAi ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
              <input
                type="checkbox"
                checked={aiAware}
                disabled={!canEditAi}
                onChange={e => setAiAware(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="flex-1">
                <p className={`text-sm font-black flex items-center gap-1.5 ${canEditAi ? 'text-emerald-900' : 'text-slate-500'}`}>
                  {canEditAi ? <Wand2 size={13} className="text-emerald-700" /> : <Lock size={12} className="text-slate-400" />}
                  Que el bot la lea
                </p>
                <p className={`text-[11px] mt-0.5 ${canEditAi ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {canEditAi
                    ? 'Cuando un paciente con esta etiqueta escribe, el bot la considera antes de responder.'
                    : 'Disponible solo en el plan premium.'}
                </p>
              </div>
            </label>

            {canEditAi && aiAware && (
              <div className="mt-3 pl-7">
                <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider mb-1.5 block">
                  Contexto para el bot
                </label>
                <textarea
                  rows={3}
                  value={aiContext}
                  onChange={e => setAiContext(e.target.value)}
                  placeholder={'Ej. "Paciente con diabetes. Avisar antes de agendar citas que requieran ayuno y preguntar si toma medicamentos en la mañana."'}
                  className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-sm font-medium outline-none focus:border-emerald-500 resize-none"
                />
                <p className="text-[10px] text-emerald-700 font-medium mt-1.5 flex items-start gap-1">
                  <Info size={10} className="mt-0.5 shrink-0" />
                  Sé específico. El bot lo va a aplicar literalmente.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !name.trim()}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-black rounded-xl disabled:opacity-40 flex items-center gap-2 shadow-md"
          >
            {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {isEditing ? 'Guardar cambios' : 'Crear etiqueta'}
          </button>
        </div>
      </div>
    </div>
  )
}
