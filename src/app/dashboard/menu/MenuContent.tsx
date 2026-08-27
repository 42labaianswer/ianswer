 

'use client'

import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  UtensilsCrossed, Plus, Search, Upload, Loader2, Star, ChevronDown,
  Edit2, Trash2, Folder, FolderPlus, Eye, EyeOff, GripVertical, Copy, CheckSquare, Square
} from 'lucide-react'
import BatchPublishBar, { PublishDot } from '../../../components/BatchPublishBar'

import { useAppCapability, useAppLimit, useFeature } from '../../../hooks/useAppCapability'
import MenuItemDrawer, { MenuItem } from '../../../components/MenuItemDrawer'
import MenuImportWizard from '../../../components/MenuImportWizard'
import PageHeader from '../../../components/PageHeader'

type Category = {
  id: string
  company_id: string
  name: string
  description?: string
  icon?: string
  display_order: number
  is_active: boolean
}

function MenuContent() {
  const queryClient = useQueryClient()
  const { primaryTemplate: vertical } = useWorkspace()
  const accentColor = vertical?.accent_color || '#ea580c'

  const canPdfImport     = useFeature('ai_pdf_wizard_menu')
  const canPublicCatalog = useAppCapability('menu', 'public_catalog')
  const maxItems         = useAppLimit('menu', 'max_menu_items')

  const [companyId, setCompanyId] = useState<string>('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState<MenuItem | null>(null)
  const [defaultCategoryForNew, setDefaultCategoryForNew] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<string | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)

  // === Resolver companyId UNA SOLA VEZ al montar (fuera de useQuery para evitar
  //     race condition: el wizard necesita un companyId estable antes de poder
  //     guardar items). ===
  useEffect(() => {
    let cancelled = false
    const resolveCompany = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled && profile?.company_id) {
        setCompanyId(profile.company_id)
      }
    }
    resolveCompany()
    return () => { cancelled = true }
  }, [])

  // === Load data ===
  // Solo arranca cuando companyId está listo (enabled: !!companyId).
  const { data, isLoading } = useQuery({
    queryKey: ['menu-items', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [catsRes, itemsRes] = await Promise.all([
        supabase.from('menu_categories').select('*').eq('company_id', companyId).order('display_order'),
        supabase.from('menu_items').select('*').eq('company_id', companyId).order('display_order')
      ])

      return {
        categories: (catsRes.data || []) as Category[],
        items: (itemsRes.data || []) as MenuItem[]
      }
    }
  })

  const categories = data?.categories || []
  const items = data?.items || []

  // Mutaciones para categorías
  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('menu_categories')
        .insert({
          company_id: companyId,
          name: name.trim(),
          display_order: categories.length
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Categoría creada')
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] })
    },
    onError: (err: any) => toast.error(err.message)
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('menu_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Categoría eliminada')
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
    },
    onError: (err: any) => toast.error(err.message)
  })

  // Batch: publicar/despublicar varios items a la vez
  const batchAvailability = useMutation({
    mutationFn: async ({ ids, is_available }: { ids: string[], is_available: boolean }) => {
      const { error } = await supabase.from('menu_items').update({ is_available }).in('id', ids)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', companyId] })
      toast.success(`${vars.ids.length} ${vars.ids.length === 1 ? 'platillo' : 'platillos'} ${vars.is_available ? 'publicados' : 'despublicados'}`)
      setSelectedIds(new Set())
      setSelectMode(false)
    },
    onError: (e: any) => toast.error(e?.message || 'Error al actualizar')
  })

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Borrar varios items a la vez
  const batchDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('menu_items').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: (_d, ids) => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', companyId] })
      toast.success(`${ids.length} ${ids.length === 1 ? 'platillo borrado' : 'platillos borrados'}`)
      setSelectedIds(new Set())
      setSelectMode(false)
    },
    onError: (e: any) => toast.error(e?.message || 'Error al borrar')
  })

  // Seleccionar todos / ninguno
  const allItemIds = items.map(i => i.id).filter(Boolean) as string[]
  const allSelected = allItemIds.length > 0 && allItemIds.every(id => selectedIds.has(id))
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(allItemIds))
  }

  const toggleItemAvailability = useMutation({
    mutationFn: async ({ id, is_available }: { id: string, is_available: boolean }) => {
      const { error } = await supabase.from('menu_items').update({ is_available }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items'] }),
    onError: (err: any) => toast.error(err.message)
  })

  // Filtros locales
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (activeCategoryId !== 'all' && item.category_id !== activeCategoryId) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${item.name} ${item.description || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, activeCategoryId, search])

  // Agrupar items por categoría
  const itemsByCategory: Record<string, MenuItem[]> = {}
  filteredItems.forEach(item => {
    const key = item.category_id || 'uncategorized'
    if (!itemsByCategory[key]) itemsByCategory[key] = []
    itemsByCategory[key].push(item)
  })

  const handleNewItem = (categoryId: string | null = null) => {
    setEditing(null)
    setDefaultCategoryForNew(categoryId)
    setDrawerOpen(true)
  }

  const handleEditItem = (item: MenuItem) => {
    setEditing(item)
    setDrawerOpen(true)
  }

  const promptCreateCategory = () => {
    const name = window.prompt('Nombre de la categoría (ej. Entradas, Bebidas, Postres):')
    if (name && name.trim()) createCategoryMutation.mutate(name.trim())
  }

  const reachedLimit = maxItems > 0 && items.length >= maxItems

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 size={32} className="text-orange-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="pb-12 animate-in fade-in duration-500">

      <PageHeader
        title="Menú digital"
        description={`${items.length} ${maxItems > 0 ? `de ${maxItems === 9999 ? '∞' : maxItems}` : ''} platillos · ${categories.length} categorías`}
        actions={
          <>
            <button
              onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 border transition-colors ${selectMode ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'}`}
            >
              {selectMode ? <CheckSquare size={14} /> : <Square size={14} />} Seleccionar
            </button>
            {canPdfImport && (
              <button
                onClick={() => setImportOpen(true)}
                disabled={reachedLimit || !companyId}
                title={!companyId ? 'Cargando...' : reachedLimit ? 'Llegaste al límite del plan' : ''}
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={14} /> Importar PDF
              </button>
            )}
            <button onClick={promptCreateCategory} className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2">
              <FolderPlus size={14} /> Categoría
            </button>
            <button
              onClick={() => handleNewItem()}
              disabled={reachedLimit}
              className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50"
            >
              <Plus size={14} /> Nuevo platillo
            </button>
          </>
        }
      />

      {/* Filtros + búsqueda */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar platillo, descripción..."
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-500"
          />
        </div>
      </div>

      {/* Pills de categorías */}
      {categories.length > 0 && (
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => setActiveCategoryId('all')}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
              activeCategoryId === 'all' ? 'text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            style={activeCategoryId === 'all' ? { backgroundColor: accentColor } : {}}
          >
            Todas <span className="opacity-70">({items.length})</span>
          </button>
          {categories.map(cat => {
            const count = items.filter(it => it.category_id === cat.id).length
            const active = activeCategoryId === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  active ? 'text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                style={active ? { backgroundColor: accentColor } : {}}
              >
                {cat.icon && <span className="mr-1">{cat.icon}</span>}
                {cat.name} <span className="opacity-70">({count})</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-200">
          <UtensilsCrossed size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">Tu menú está vacío</h3>
          <p className="text-slate-500 mt-1 mb-5">Agrega tu primer platillo o importa desde PDF.</p>
          <div className="flex gap-2 justify-center">
            {canPdfImport && (
              <button onClick={() => setImportOpen(true)} className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                <Upload size={14} /> Importar PDF
              </button>
            )}
            <button onClick={() => handleNewItem()} className="text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2" style={{ backgroundColor: accentColor }}>
              <Plus size={14} /> Nuevo platillo
            </button>
          </div>
        </div>
      )}

      {/* Items agrupados por categoría */}
      {items.length > 0 && (
        <div className="space-y-6">
          {/* Items SIN categoría primero */}
          {(itemsByCategory['uncategorized'] || []).length > 0 && (
            <CategorySection
              title="Sin categoría"
              icon="❓"
              items={itemsByCategory['uncategorized']}
              accentColor={accentColor}
              onAddItem={() => handleNewItem(null)}
              onEditItem={handleEditItem}
              onToggleAvailable={(id, val) => toggleItemAvailability.mutate({ id, is_available: val })}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              showDelete={false}
            />
          )}

          {/* Items por categoría */}
          {categories.map(cat => {
            const catItems = itemsByCategory[cat.id] || []
            if (activeCategoryId !== 'all' && activeCategoryId !== cat.id) return null
            if (activeCategoryId === 'all' && catItems.length === 0) return null
            return (
              <CategorySection
                key={cat.id}
                title={cat.name}
                icon={cat.icon}
                items={catItems}
                accentColor={accentColor}
                onAddItem={() => handleNewItem(cat.id)}
                onEditItem={handleEditItem}
                onToggleAvailable={(id, val) => toggleItemAvailability.mutate({ id, is_available: val })}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onDeleteCategory={() => {
                  if (confirm(`¿Eliminar categoría "${cat.name}"? Los platillos quedarán sin categoría.`)) {
                    deleteCategoryMutation.mutate(cat.id)
                  }
                }}
                showDelete
              />
            )
          })}
        </div>
      )}

      {/* Barra de acciones en lote */}
      <BatchPublishBar
        count={selectedIds.size}
        totalCount={allItemIds.length}
        allSelected={allSelected}
        isWorking={batchAvailability.isPending || batchDelete.isPending}
        onPublish={() => batchAvailability.mutate({ ids: Array.from(selectedIds), is_available: true })}
        onUnpublish={() => batchAvailability.mutate({ ids: Array.from(selectedIds), is_available: false })}
        onDelete={() => batchDelete.mutate(Array.from(selectedIds))}
        onSelectAll={toggleSelectAll}
        onClear={() => { setSelectedIds(new Set()); setSelectMode(false) }}
        publishLabel="Publicar"
        unpublishLabel="Ocultar"
      />

      {/* Drawer */}
      <MenuItemDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        item={editing}
        defaultCategoryId={defaultCategoryForNew}
        companyId={companyId}
        accentColor={accentColor}
      />

      {/* Import */}
      {canPdfImport && (
        <MenuImportWizard
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
          companyId={companyId}
          accentColor={accentColor}
        />
      )}
    </div>
  )
}

// ============================================================================
// SECCIÓN DE CATEGORÍA con sus items
// ============================================================================
function CategorySection({ title, icon, items, accentColor, onAddItem, onEditItem, onToggleAvailable, onDeleteCategory, showDelete, selectMode, selectedIds, onToggleSelect }: {
  title: string
  icon?: string
  items: MenuItem[]
  accentColor: string
  onAddItem: () => void
  onEditItem: (item: MenuItem) => void
  onToggleAvailable: (id: string, val: boolean) => void
  onDeleteCategory?: () => void
  showDelete: boolean
  selectMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
          {icon && <span>{icon}</span>}
          {title}
          <span className="text-sm text-slate-400 font-bold">({items.length})</span>
        </h2>
        <div className="flex gap-2">
          <button onClick={onAddItem} className="text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Plus size={12} /> Agregar
          </button>
          {showDelete && onDeleteCategory && (
            <button onClick={onDeleteCategory} className="text-xs font-bold text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(item => (
          <MenuItemCard
            key={item.id}
            item={item}
            accentColor={accentColor}
            onEdit={() => onEditItem(item)}
            onToggleAvailable={(val) => item.id && onToggleAvailable(item.id, val)}
            selectMode={selectMode}
            selected={item.id ? selectedIds?.has(item.id) ?? false : false}
            onToggleSelect={() => item.id && onToggleSelect?.(item.id)}
          />
        ))}
      </div>
    </section>
  )
}

// ============================================================================
// CARD DE ITEM
// ============================================================================
function MenuItemCard({ item, accentColor, onEdit, onToggleAvailable, selectMode, selected, onToggleSelect }: {
  item: MenuItem
  accentColor: string
  onEdit: () => void
  onToggleAvailable: (val: boolean) => void
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const isAvailable = item.is_available !== false

  return (
    <div className={`bg-white border-2 rounded-2xl overflow-hidden transition-all hover:shadow-md ${selected ? 'border-emerald-400 ring-2 ring-emerald-100' : isAvailable ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
      <div className="flex gap-3 p-3">
        {/* Checkbox de selección (modo batch) */}
        {selectMode && (
          <button
            onClick={onToggleSelect}
            className="shrink-0 flex items-start pt-1"
            title={selected ? 'Deseleccionar' : 'Seleccionar'}
          >
            {selected ? (
              <CheckSquare size={20} className="text-emerald-600" />
            ) : (
              <Square size={20} className="text-slate-300" />
            )}
          </button>
        )}

        {/* Foto */}
        <div className="shrink-0">
          {item.photo_url ? (
            <img src={item.photo_url} alt={item.name} className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-xl bg-slate-100 flex items-center justify-center">
              <UtensilsCrossed size={20} className="text-slate-300" />
            </div>
          )}
        </div>

        {/* Body clickable */}
        <button onClick={onEdit} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <PublishDot published={isAvailable} />
            {item.is_recommended && <Star size={11} className="text-amber-500 fill-current shrink-0" />}
            <p className="font-black text-slate-800 text-sm truncate">{item.name}</p>
          </div>
          {item.description && <p className="text-[10px] text-slate-500 line-clamp-1">{item.description}</p>}
          <div className="flex items-center justify-between mt-1">
            {item.price != null && <p className="text-base font-black" style={{ color: accentColor }}>${item.price}</p>}
            <div className="flex flex-wrap gap-1">
              {(item.modifiers || []).length > 0 && (
                <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                  {(item.modifiers || []).length} mod.
                </span>
              )}
              {(item.allergens || []).length > 0 && (
                <span className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full">⚠</span>
              )}
            </div>
          </div>
        </button>

        {/* Toggle availability */}
        <button
          onClick={() => onToggleAvailable(!isAvailable)}
          className={`shrink-0 p-2 rounded-lg transition-colors ${isAvailable ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}
          title={isAvailable ? 'Disponible' : 'No disponible'}
        >
          {isAvailable ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      </div>
    </div>
  )
}

export default MenuContent
