 

'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Home, Plus, Search, FileText, Filter, Building2, MapPin, Bed, Bath,
  Loader2, Upload, ChevronDown, ExternalLink, Eye, EyeOff,
  CheckCircle2, Clock, XCircle, Copy, Globe, CheckSquare, Square
} from 'lucide-react'

import { useAppCapability, useAppLimit, useFeature } from '../../../hooks/useAppCapability'
import { useEntitlements } from '../../../hooks/useEntitlements'
import PropertyDrawer, { Property } from '../../../components/PropertyDrawer'
import PropertyImportWizard from '../../../components/PropertyImportWizard'
import BatchPublishBar, { PublishDot } from '../../../components/BatchPublishBar'
import PageHeader from '../../../components/PageHeader'

type StatusKey = 'disponible' | 'apartada' | 'vendida' | 'rentada' | 'borrador'

const STATUS_META: Record<StatusKey, { label: string, color: string, bg: string, icon: any }> = {
  disponible: { label: 'Disponible', color: 'text-emerald-700', bg: 'bg-emerald-100',  icon: CheckCircle2 },
  apartada:   { label: 'Apartada',   color: 'text-amber-700',   bg: 'bg-amber-100',    icon: Clock },
  vendida:    { label: 'Vendida',    color: 'text-slate-700',   bg: 'bg-slate-200',    icon: XCircle },
  rentada:    { label: 'Rentada',    color: 'text-purple-700',  bg: 'bg-purple-100',   icon: CheckCircle2 },
  borrador:   { label: 'Borrador',   color: 'text-slate-500',   bg: 'bg-slate-100',    icon: FileText }
}

function PropertiesContent() {
  const queryClient = useQueryClient()
  const { labels, primaryTemplate: vertical } = useWorkspace()
  const accentColor = vertical?.accent_color || '#7c3aed'

  const canPdfImport     = useFeature('ai_pdf_wizard_properties')
  // El botón de catálogo se prende si el flag public_catalog está en features
  // (merge del plan) O si hay un addon activo cuyo feature_flags lo incluya.
  // Este fallback evita depender de que get_company_entitlements mergee el flag.
  // El botón de catálogo se prende si CUALQUIERA de estas fuentes lo confirma.
  // La fuente DEFINITIVA es la RPC company_has_catalog (SECURITY DEFINER): salta
  // RLS y responde directo si la company tiene el addon de catálogo activo. Se
  // usa porque la query directa a company_addons puede quedar bloqueada por RLS
  // en el navegador (los datos existen pero el rol authenticated no los ve).
  const catalogFromFeatures = useAppCapability('propiedades', 'public_catalog')
  const { data: entitlements } = useEntitlements()
  const catalogFromEntitlements = !!entitlements?.addons?.some(
    a => a.status === 'active' && a.feature_flags?.public_catalog === true
  )

  const { data: catalogViaRpc } = useQuery({
    queryKey: ['catalog-has-check'],
    queryFn: async (): Promise<boolean> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false
      const { data: profile } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) return false
      // RPC SECURITY DEFINER: salta RLS
      const { data, error } = await supabase
        .rpc('company_has_catalog', { p_company_id: profile.company_id })
      if (error) {
        // Fallback: intento leer company_addons directo (por si la RPC no existe aún)
        const { data: rows } = await supabase
          .from('company_addons')
          .select('status, addon:addons(name, feature_flags)')
          .eq('company_id', profile.company_id)
          .in('status', ['active', 'trialing'])
        return !!(rows || []).some((ca: any) => {
          const flags = ca?.addon?.feature_flags || {}
          const name = String(ca?.addon?.name || '').toLowerCase()
          return flags.public_catalog === true || name.includes('catálogo') || name.includes('catalogo')
        })
      }
      return data === true
    },
    staleTime: 60 * 1000
  })

  const canPublicCatalog = catalogFromFeatures || catalogFromEntitlements || !!catalogViaRpc
  const maxProperties    = useAppLimit('propiedades', 'max_properties')

  const [companyId, setCompanyId] = useState<string>('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<Property | null>(null)

  // Selección en lote (batch publicar / despublicar / borrar) — mismo patrón que Menú
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Filtros
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // 1) Cargar
  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['properties', companyId],
    queryFn: async (): Promise<Property[]> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sin sesión')
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) throw new Error('Sin company')
      setCompanyId(profile.company_id)
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as Property[]
    }
  })

  // 2) Cambiar status rápido (sin abrir drawer)
  const changeStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: StatusKey }) => {
      const { error } = await supabase.from('properties').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Estado actualizado')
      queryClient.invalidateQueries({ queryKey: ['properties'] })
    },
    onError: (err: any) => toast.error(err.message)
  })

  // 2.5) BATCH — publicar/despublicar/borrar varias a la vez.
  // En propiedades, "publicar" = status 'disponible' (lo que la página pública
  // /propiedad/[slug] muestra); "despublicar" = status 'borrador'.
  const batchStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[], status: StatusKey }) => {
      const { error } = await supabase.from('properties').update({ status }).in('id', ids)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      const n = vars.ids.length
      const noun = n === 1 ? 'propiedad' : 'propiedades'
      toast.success(`${n} ${noun} ${vars.status === 'disponible' ? 'publicada(s)' : 'a borrador'}`)
      setSelectedIds(new Set())
      setSelectMode(false)
    },
    onError: (e: any) => toast.error(e?.message || 'Error al actualizar')
  })

  const batchDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('properties').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: (_d, ids) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      toast.success(`${ids.length} ${ids.length === 1 ? 'propiedad borrada' : 'propiedades borradas'}`)
      setSelectedIds(new Set())
      setSelectMode(false)
    },
    onError: (e: any) => toast.error(e?.message || 'Error al borrar')
  })

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const filtered = useMemo(() => {
    return properties.filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (typeFilter !== 'all' && p.property_type !== typeFilter) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${p.title} ${p.description || ''} ${p.zone || ''} ${p.city || ''} ${p.address || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [properties, statusFilter, typeFilter, search])

  // Métricas
  const stats = useMemo(() => ({
    disponible: properties.filter(p => p.status === 'disponible').length,
    apartada:   properties.filter(p => p.status === 'apartada').length,
    vendida:    properties.filter(p => p.status === 'vendida').length,
    rentada:    properties.filter(p => p.status === 'rentada').length,
    borrador:   properties.filter(p => p.status === 'borrador').length
  }), [properties])

  const reachedLimit = maxProperties > 0 && properties.length >= maxProperties

  // Seleccionar todas / ninguna (sobre las visibles según filtros)
  const visibleIds = filtered.map(p => p.id).filter(Boolean) as string[]
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(visibleIds))
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 size={32} className="text-purple-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="pb-12 animate-in fade-in duration-500">

      <PageHeader
        title="Propiedades"
        description={`${properties.length} ${maxProperties > 0 ? `de ${maxProperties === 9999 ? '∞' : maxProperties}` : ''} · catálogo vivo para tu bot`}
        actions={
          <>
            <button
              onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 border transition-colors ${selectMode ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'}`}
            >
              {selectMode ? <CheckSquare size={14} /> : <Square size={14} />} Seleccionar
            </button>
            {canPublicCatalog && (
              <Link
                href="/dashboard/properties/catalogo-web"
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2"
              >
                <Globe size={14} /> Catálogo web
              </Link>
            )}
            {canPdfImport && (
              <button
                onClick={() => setImportOpen(true)}
                disabled={reachedLimit}
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              >
                <Upload size={14} /> Importar PDF
              </button>
            )}
            <button
              onClick={() => { setEditing(null); setDrawerOpen(true) }}
              disabled={reachedLimit}
              className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <Plus size={14} /> Nueva propiedad
            </button>
          </>
        }
      />

      {/* MÉTRICAS rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {(['disponible', 'apartada', 'vendida', 'rentada', 'borrador'] as StatusKey[]).map(s => {
          const meta = STATUS_META[s]
          const Icon = meta.icon
          const active = statusFilter === s
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(active ? 'all' : s)}
              className={`p-4 rounded-2xl border-2 text-left transition-all ${active ? 'shadow-md' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              style={active ? { borderColor: accentColor, backgroundColor: `${accentColor}10` } : {}}
            >
              <div className="flex items-center justify-between mb-1">
                <Icon size={16} className={meta.color} />
                <span className="text-2xl font-black text-slate-900">{stats[s]}</span>
              </div>
              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{meta.label}</p>
            </button>
          )
        })}
      </div>

      {/* Búsqueda */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título, zona, ciudad..."
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none"
        >
          <option value="all">Todos los tipos</option>
          <option value="casa">Casas</option>
          <option value="depto">Departamentos</option>
          <option value="terreno">Terrenos</option>
          <option value="local">Locales</option>
          <option value="oficina">Oficinas</option>
          <option value="bodega">Bodegas</option>
          <option value="quinta">Quintas</option>
          <option value="otro">Otros</option>
        </select>
      </div>

      {/* Grid de propiedades */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-200">
          <Home size={48} className="mx-auto text-slate-300 mb-4" />
          {properties.length === 0 ? (
            <>
              <h3 className="text-lg font-bold text-slate-800">Tu catálogo está vacío</h3>
              <p className="text-slate-500 mt-1 mb-5">Agrega tu primera propiedad para que el bot pueda recomendarla.</p>
              <div className="flex gap-2 justify-center">
                {canPdfImport && (
                  <button onClick={() => setImportOpen(true)} className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                    <Upload size={14} /> Importar PDF
                  </button>
                )}
                <button onClick={() => { setEditing(null); setDrawerOpen(true) }} className="text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2" style={{ backgroundColor: accentColor }}>
                  <Plus size={14} /> Nueva propiedad
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-bold text-slate-800">No hay resultados</h3>
              <p className="text-slate-500 mt-1">Ajusta los filtros para ver más propiedades.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <PropertyCard
              key={p.id}
              property={p}
              accentColor={accentColor}
              canPublicCatalog={canPublicCatalog}
              selectMode={selectMode}
              selected={p.id ? selectedIds.has(p.id) : false}
              onToggleSelect={() => p.id && toggleSelect(p.id)}
              onEdit={() => { setEditing(p); setDrawerOpen(true) }}
              onChangeStatus={(s) => changeStatusMutation.mutate({ id: p.id!, status: s })}
            />
          ))}
        </div>
      )}

      {/* Drawer */}
      <PropertyDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        property={editing}
        companyId={companyId}
        accentColor={accentColor}
      />

      {/* Import wizard */}
      {canPdfImport && (
        <PropertyImportWizard
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
          companyId={companyId}
          accentColor={accentColor}
        />
      )}

      {/* Barra flotante de acciones en lote */}
      <BatchPublishBar
        count={selectedIds.size}
        totalCount={visibleIds.length}
        allSelected={allSelected}
        isWorking={batchStatus.isPending || batchDelete.isPending}
        accentColor={accentColor}
        publishLabel="Publicar"
        unpublishLabel="A borrador"
        onPublish={() => batchStatus.mutate({ ids: Array.from(selectedIds), status: 'disponible' })}
        onUnpublish={() => batchStatus.mutate({ ids: Array.from(selectedIds), status: 'borrador' })}
        onDelete={() => batchDelete.mutate(Array.from(selectedIds))}
        onSelectAll={toggleSelectAll}
        onClear={() => { setSelectedIds(new Set()); setSelectMode(false) }}
      />
    </div>
  )
}

// ============================================================================
// PROPERTY CARD
// ============================================================================
function PropertyCard({ property, accentColor, canPublicCatalog, selectMode, selected, onToggleSelect, onEdit, onChangeStatus }: {
  property: Property
  accentColor: string
  canPublicCatalog: boolean
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onEdit: () => void
  onChangeStatus: (s: StatusKey) => void
}) {
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const status = (property.status || 'borrador') as StatusKey
  const meta = STATUS_META[status]
  const StatusIcon = meta.icon
  const isPublished = status === 'disponible'

  const mainPhoto = property.photos && property.photos.length > 0 ? property.photos[0] : null

  const copyPublicUrl = async () => {
    let slug = property.public_slug
    if (!slug) {
      slug = (property.title || 'propiedad')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        + '-' + Math.random().toString(36).slice(2, 8)
      try {
        await supabase.from('properties').update({ public_slug: slug }).eq('id', property.id)
      } catch {
        // si el guardado falla, igual copiamos la URL con el slug generado
      }
    }
    const url = `${window.location.origin}/propiedad/${slug}`
    navigator.clipboard.writeText(url)
    toast.success('URL copiada')
  }

  return (
    <div
      className={`bg-white rounded-2xl border-2 transition-all overflow-hidden flex flex-col ${selected ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300 hover:shadow-lg'} ${selectMode ? 'cursor-pointer' : ''}`}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      {/* Foto principal */}
      <div className="aspect-video bg-slate-100 relative overflow-hidden">
        {mainPhoto ? (
          <img src={mainPhoto} alt={property.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home size={32} className="text-slate-300" />
          </div>
        )}
        {/* Checkbox de selección (modo batch) */}
        {selectMode && (
          <div className="absolute top-2 left-2 z-10 bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow-sm">
            {selected ? (
              <CheckSquare size={20} className="text-emerald-600" />
            ) : (
              <Square size={20} className="text-slate-400" />
            )}
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-2 right-2 relative">
          <button
            onClick={(e) => { if (selectMode) { e.stopPropagation(); onToggleSelect?.(); return } setStatusMenuOpen(!statusMenuOpen) }}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${meta.bg} ${meta.color} shadow-sm hover:opacity-90`}
          >
            <StatusIcon size={10} />
            {meta.label}
            <ChevronDown size={10} />
          </button>

          {statusMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setStatusMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 min-w-[140px] py-1">
                {(['disponible', 'apartada', 'vendida', 'rentada', 'borrador'] as StatusKey[]).map(s => {
                  const m = STATUS_META[s]
                  const SIcon = m.icon
                  return (
                    <button
                      key={s}
                      onClick={() => { onChangeStatus(s); setStatusMenuOpen(false) }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs font-bold flex items-center gap-2"
                    >
                      <SIcon size={12} className={m.color} />
                      <span className="text-slate-700">{m.label}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Tipo badge */}
        {property.property_type && (
          <span className="absolute top-2 left-2 text-[10px] font-black text-white bg-slate-900/80 backdrop-blur-sm px-2 py-1 rounded-full uppercase tracking-widest">
            {property.property_type}
            {property.operation_type && ` · ${property.operation_type}`}
          </span>
        )}
      </div>

      {/* Body */}
      <button
        onClick={(e) => { if (selectMode) { e.stopPropagation(); onToggleSelect?.(); return } onEdit() }}
        className="flex-1 p-4 text-left hover:bg-slate-50 transition-colors flex flex-col gap-2"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <PublishDot published={isPublished} />
          <h4 className="font-black text-slate-800 line-clamp-1">{property.title}</h4>
        </div>

        {property.price && (
          <p className="text-lg font-black" style={{ color: accentColor }}>
            ${property.price.toLocaleString()} <span className="text-xs font-bold text-slate-400">{property.currency || 'MXN'}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {property.bedrooms != null && (
            <span className="flex items-center gap-0.5"><Bed size={11} /> {property.bedrooms}</span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-0.5"><Bath size={11} /> {property.bathrooms}</span>
          )}
          {property.area_built_m2 && (
            <span>{property.area_built_m2}m²</span>
          )}
        </div>

        {(property.zone || property.city) && (
          <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
            <MapPin size={11} className="shrink-0" />
            {[property.zone, property.city].filter(Boolean).join(', ')}
          </p>
        )}
      </button>

      {/* Footer */}
      {canPublicCatalog && !selectMode && (
        <div className="px-4 pb-3 pt-1 border-t border-slate-100">
          <button onClick={copyPublicUrl} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-800">
            <Copy size={10} /> Copiar URL pública
          </button>
        </div>
      )}
    </div>
  )
}

export default PropertiesContent
