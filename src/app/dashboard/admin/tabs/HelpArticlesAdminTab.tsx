 

'use client'

// ============================================================================
// src/app/dashboard/admin/tabs/HelpArticlesAdminTab.tsx
// ----------------------------------------------------------------------------
// CRUD de help_collections + help_articles. Editor markdown simple (textarea
// con preview opcional).
// ============================================================================

import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import toast from 'react-hot-toast'
import {
  Save, Plus, Trash2, Loader2, BookOpen, FileText,
  Eye, EyeOff, ChevronRight, ChevronDown
} from 'lucide-react'
import { useConfirm } from '../../../../hooks/useConfirm'

type Mode = 'list' | 'edit-collection' | 'edit-article'

export default function HelpArticlesAdminTab() {
  const [mode, setMode] = useState<Mode>('list')
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null)

  const [collections, setCollections] = useState<any[]>([])
  const [articles, setArticles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCol, setExpandedCol] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    const [colsRes, artsRes] = await Promise.all([
      supabase.from('help_collections').select('*').order('display_order'),
      supabase.from('help_articles').select('*').order('display_order')
    ])
    setCollections(colsRes.data || [])
    setArticles(artsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const articlesByCol = articles.reduce((acc: Record<string, any[]>, a) => {
    const k = a.collection_id || 'sin-coleccion'
    if (!acc[k]) acc[k] = []
    acc[k].push(a)
    return acc
  }, {})

  if (mode === 'edit-collection') {
    return (
      <CollectionEditor
        id={editingId!}
        onDone={() => { setMode('list'); load() }}
      />
    )
  }

  if (mode === 'edit-article') {
    return (
      <ArticleEditor
        id={editingId!}
        defaultCollectionId={editingCollectionId}
        collections={collections}
        onDone={() => { setMode('list'); load() }}
      />
    )
  }

  if (loading) {
    return <div className="text-center py-12"><Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Centro de ayuda</h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Colecciones y artículos del Helpdesk público
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setEditingId('new'); setMode('edit-collection') }}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-black text-xs transition-colors flex items-center gap-1.5"
          >
            <Plus size={14} /> Colección
          </button>
          <button
            onClick={() => { setEditingId('new'); setEditingCollectionId(collections[0]?.id || null); setMode('edit-article') }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs shadow-md transition-colors flex items-center gap-1.5"
          >
            <Plus size={14} /> Artículo
          </button>
        </div>
      </div>

      {collections.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <BookOpen size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">Aún no hay colecciones.</p>
          <p className="text-xs text-slate-400 mt-1">Crea una colección primero para empezar a publicar artículos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {collections.map(col => {
            const colArticles = articlesByCol[col.id] || []
            const isExpanded = expandedCol.has(col.id)
            return (
              <div key={col.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => {
                      const next = new Set(expandedCol)
                      if (isExpanded) next.delete(col.id)
                      else next.add(col.id)
                      setExpandedCol(next)
                    }}
                    className="text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center text-white"
                    style={{ backgroundColor: col.accent_color || '#4f46e5' }}
                  >
                    <BookOpen size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{col.title}</p>
                    <p className="text-xs text-slate-500 font-medium truncate">
                      {colArticles.length} artículo(s) · /{col.slug}
                    </p>
                  </div>
                  <button
                    onClick={() => { setEditingId(col.id); setMode('edit-collection') }}
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-black transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => {
                      setEditingId('new')
                      setEditingCollectionId(col.id)
                      setMode('edit-article')
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-black transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} /> Artículo
                  </button>
                </div>

                {isExpanded && colArticles.length > 0 && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 space-y-1">
                    {colArticles.map((art: any) => (
                      <div
                        key={art.id}
                        className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg"
                      >
                        <FileText size={14} className="text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{art.title}</p>
                          <p className="text-xs text-slate-500 font-mono truncate">/{art.slug}</p>
                        </div>
                        {!art.published && (
                          <span className="text-[10px] font-black bg-amber-100 text-amber-700 uppercase tracking-wider px-2 py-0.5 rounded-full">
                            Borrador
                          </span>
                        )}
                        <button
                          onClick={() => { setEditingId(art.id); setMode('edit-article') }}
                          className="px-3 py-1 text-xs font-black text-slate-700 hover:text-slate-900 transition-colors"
                        >
                          Editar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Editor de colecciones
// ════════════════════════════════════════════════════════════════════════════

function CollectionEditor({ id, onDone }: { id: string | 'new'; onDone: () => void }) {
  const { confirm, ConfirmDialog } = useConfirm()
  const [draft, setDraft] = useState<any>({
    slug: '', title: '', description: '', icon_name: 'BookOpen',
    accent_color: '#4f46e5', display_order: 0, visible: true
  })
  const [loading, setLoading] = useState(id !== 'new')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (id === 'new') return
    supabase.from('help_collections').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) setDraft(data)
      setLoading(false)
    })
  }, [id])

  const save = async () => {
    setSaving(true)
    try {
      if (id === 'new') {
        const { error } = await supabase.from('help_collections').insert(draft)
        if (error) throw error
        toast.success('Colección creada')
      } else {
        const { id: _id, ...rest } = draft
        const { error } = await supabase.from('help_collections').update(rest).eq('id', id)
        if (error) throw error
        toast.success('Colección actualizada')
      }
      onDone()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    }
    setSaving(false)
  }

  const remove = async () => {
    if (id === 'new') return
    if (!(await confirm('¿Eliminar esta colección? Los artículos quedarán huérfanos.', { title: 'Eliminar colección', danger: true, confirmText: 'Eliminar' }))) return
    await supabase.from('help_collections').delete().eq('id', id)
    toast.success('Eliminada')
    onDone()
  }

  if (loading) return <div className="text-center py-12"><Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-900">
          {id === 'new' ? 'Nueva colección' : 'Editar colección'}
        </h2>
        <button onClick={onDone} className="text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <Field label="Slug (URL)" required>
          <input value={draft.slug} onChange={e => setDraft({ ...draft, slug: e.target.value })} className={inputCls + ' font-mono'} placeholder="primeros-pasos" />
        </Field>
        <Field label="Título" required>
          <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Descripción corta">
          <input value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Icono lucide">
            <input value={draft.icon_name} onChange={e => setDraft({ ...draft, icon_name: e.target.value })} className={inputCls + ' font-mono'} placeholder="BookOpen" />
          </Field>
          <Field label="Color hex">
            <div className="flex gap-2">
              <input type="color" value={draft.accent_color} onChange={e => setDraft({ ...draft, accent_color: e.target.value })} className="h-11 w-16 rounded-xl border border-slate-200 cursor-pointer" />
              <input value={draft.accent_color} onChange={e => setDraft({ ...draft, accent_color: e.target.value })} className={inputCls + ' font-mono'} />
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Orden">
            <input type="number" value={draft.display_order} onChange={e => setDraft({ ...draft, display_order: parseInt(e.target.value) || 0 })} className={inputCls} />
          </Field>
          <Field label="Visible">
            <button type="button" onClick={() => setDraft({ ...draft, visible: !draft.visible })} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black border transition-colors ${draft.visible ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
              {draft.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              {draft.visible ? 'Sí' : 'No'}
            </button>
          </Field>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-md transition-colors flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar
        </button>
        {id !== 'new' && (
          <button onClick={remove} className="px-6 py-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-black text-sm transition-colors flex items-center gap-2">
            <Trash2 size={14} /> Eliminar
          </button>
        )}
      </div>
      {ConfirmDialog}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Editor de artículos
// ════════════════════════════════════════════════════════════════════════════

function ArticleEditor({ id, defaultCollectionId, collections, onDone }: {
  id: string | 'new'
  defaultCollectionId: string | null
  collections: any[]
  onDone: () => void
}) {
  const { confirm, ConfirmDialog } = useConfirm()
  const [draft, setDraft] = useState<any>({
    collection_id: defaultCollectionId,
    slug: '', title: '', summary: '', content_markdown: '',
    reading_time_minutes: 3, display_order: 0, published: true
  })
  const [loading, setLoading] = useState(id !== 'new')
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (id === 'new') return
    supabase.from('help_articles').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) setDraft(data)
      setLoading(false)
    })
  }, [id])

  const save = async () => {
    setSaving(true)
    try {
      if (id === 'new') {
        const { error } = await supabase.from('help_articles').insert(draft)
        if (error) throw error
        toast.success('Artículo creado')
      } else {
        const { id: _id, ...rest } = draft
        const { error } = await supabase.from('help_articles').update(rest).eq('id', id)
        if (error) throw error
        toast.success('Artículo actualizado')
      }
      onDone()
    } catch (e: any) {
      toast.error('Error: ' + e.message)
    }
    setSaving(false)
  }

  const remove = async () => {
    if (id === 'new') return
    if (!(await confirm('¿Eliminar este artículo?', { title: 'Eliminar artículo', danger: true, confirmText: 'Eliminar' }))) return
    await supabase.from('help_articles').delete().eq('id', id)
    toast.success('Eliminado')
    onDone()
  }

  if (loading) return <div className="text-center py-12"><Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-900">
          {id === 'new' ? 'Nuevo artículo' : 'Editar artículo'}
        </h2>
        <button onClick={onDone} className="text-xs font-bold text-slate-500 hover:text-slate-700">Cancelar</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <Field label="Colección" required>
          <select
            value={draft.collection_id || ''}
            onChange={e => setDraft({ ...draft, collection_id: e.target.value })}
            className={inputCls}
          >
            <option value="">— Selecciona una colección —</option>
            {collections.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Slug (URL)" required>
            <input value={draft.slug} onChange={e => setDraft({ ...draft, slug: e.target.value })} className={inputCls + ' font-mono'} placeholder="como-conectar-whatsapp" />
          </Field>
          <Field label="Tiempo de lectura (min)">
            <input type="number" value={draft.reading_time_minutes} onChange={e => setDraft({ ...draft, reading_time_minutes: parseInt(e.target.value) || 3 })} className={inputCls} />
          </Field>
        </div>

        <Field label="Título" required>
          <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} className={inputCls} />
        </Field>

        <Field label="Resumen (1-2 líneas)">
          <input value={draft.summary || ''} onChange={e => setDraft({ ...draft, summary: e.target.value })} className={inputCls} />
        </Field>

        <Field label={
          <div className="flex items-center justify-between">
            <span>Contenido (Markdown)</span>
            <button type="button" onClick={() => setShowPreview(!showPreview)} className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-wider">
              {showPreview ? 'Editar' : 'Vista previa'}
            </button>
          </div>
        }>
          {showPreview ? (
            <div className="px-4 py-4 bg-slate-50 border border-slate-200 rounded-xl min-h-[300px] text-sm whitespace-pre-wrap font-mono">
              {draft.content_markdown || <span className="text-slate-400 italic">Sin contenido</span>}
            </div>
          ) : (
            <textarea
              rows={16}
              value={draft.content_markdown || ''}
              onChange={e => setDraft({ ...draft, content_markdown: e.target.value })}
              className={inputCls + ' font-mono resize-none text-xs leading-relaxed'}
              placeholder={`# Título del artículo

## Sección\n\nTexto del párrafo con **negrita** y [enlaces](/precios).\n\n- Lista con bullets\n- Otro item\n\n1. Lista numerada\n2. Segundo paso\n\n\`código inline\`\n`}
            />
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Orden">
            <input type="number" value={draft.display_order} onChange={e => setDraft({ ...draft, display_order: parseInt(e.target.value) || 0 })} className={inputCls} />
          </Field>
          <Field label="Publicado">
            <button type="button" onClick={() => setDraft({ ...draft, published: !draft.published })} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black border transition-colors ${draft.published ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
              {draft.published ? <Eye size={14} /> : <EyeOff size={14} />}
              {draft.published ? 'Publicado' : 'Borrador'}
            </button>
          </Field>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="px-6 py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-black text-sm shadow-md transition-colors flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar
        </button>
        {id !== 'new' && (
          <button onClick={remove} className="px-6 py-3 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-black text-sm transition-colors flex items-center gap-2">
            <Trash2 size={14} /> Eliminar
          </button>
        )}
      </div>
      {ConfirmDialog}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers de UI

const inputCls = 'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500'

function Field({ label, required, children }: { label: React.ReactNode; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
