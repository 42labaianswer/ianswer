 

'use client'

// ============================================================================
// src/app/dashboard/addons/page.tsx — Marketplace estilo Google Play/App Store
// ----------------------------------------------------------------------------
// Rediseño v4.0: tiles cuadrados con iconos grandes (sin texto descriptivo).
// Al hacer click en una tile se abre AddonDetailModal con la info + instalar.
// ============================================================================

import { useState, useMemo } from 'react'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { useAddonsCatalog, useActiveAddons, useAddonMutations } from '../../../hooks/useAddons'
import { useIsAdmin } from '../../../hooks/useIsAdmin'
import AddonTile from '../../../components/AddonTile'
import AddonDetailModal from '../../../components/AddonDetailModal'
import AddonInstallModal from '../../../components/AddonInstallModal'
import { useAddonRefresh } from '../../../hooks/useAddonRefresh'
import PageHeader from '../../../components/PageHeader'
import { PackageOpen, Sparkles, Loader2, Search, Layers, X } from 'lucide-react'

type AddonRow = {
  id: string
  name: string
  short_name?: string
  description: string | null
  category: string
  icon: string
  price_monthly_cents: number
  price_one_time_cents: number
  currency: string
  is_recurring: boolean
  is_one_time: boolean
  is_featured: boolean
  requires_plan_min: string | null
  requires_template?: string | null
  available_for_templates: string[]
  is_template_specific: boolean
  display_order: number
  feature_flags?: Record<string, boolean>
  capacity_grants?: Record<string, number>
}

const CATEGORIES = [
  { id: 'all',      label: 'Todos' },
  { id: 'channel',  label: 'Canales' },
  { id: 'ai',       label: 'Inteligencia' },
  { id: 'feature',  label: 'Funciones' },
  { id: 'capacity', label: 'Capacidad' },
  { id: 'service',  label: 'Servicios' },
  { id: 'support',  label: 'Soporte' }
]

export default function AddonsPage() {
  const { data: catalog = [], isLoading: loadingCatalog } = useAddonsCatalog()
  const { data: active = [] } = useActiveAddons()
  const { activate, activateAsAdmin, deactivateAsAdmin } = useAddonMutations()
  const { refreshAll } = useAddonRefresh()
  const isAdmin = useIsAdmin()

  const installedTemplates = useWorkspace(s => s.installedTemplates)

  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedAddon, setSelectedAddon] = useState<AddonRow | null>(null)
  const [installingAddon, setInstallingAddon] = useState<AddonRow | null>(null)

  const activeIds = useMemo(
    () => new Set((Array.isArray(active) ? active : []).map((a: any) => a.addon_id)),
    [active]
  )

  // Loading state de la mutación
  const isMutating = activate.isPending || activateAsAdmin.isPending

  const handleActivate = (addon: AddonRow) => {
    if (isAdmin) {
      // Admin: activa directo y muestra la animación de instalación
      activateAsAdmin.mutate(
        { addonId: addon.id },
        {
          onSuccess: () => {
            setSelectedAddon(null)
            setInstallingAddon(addon)   // dispara el modal animado
          }
        }
      )
    } else {
      // Detectar si es gratis (precio 0)
      const price = addon.is_recurring ? addon.price_monthly_cents : addon.price_one_time_cents
      const isFree = price === 0

      activate.mutate(
        { addonId: addon.id, isOneTime: addon.is_one_time, isFree },
        {
          onSuccess: () => {
            setSelectedAddon(null)
            // Si es gratis, mostrar la animación (los de pago van a Stripe)
            if (isFree) setInstallingAddon(addon)
          }
        }
      )
    }
  }

  // ─── Agrupar + filtrar ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const universal: AddonRow[] = []
    const byTemplate: Record<string, AddonRow[]> = {}
    const searchLower = search.trim().toLowerCase()

    try {
      const safeCatalog = Array.isArray(catalog) ? (catalog as AddonRow[]) : []

      for (const addon of safeCatalog) {
        if (!addon || typeof addon !== 'object' || !addon.id) continue

        // Filtro de categoría
        if (categoryFilter !== 'all' && addon.category !== categoryFilter) continue

        // Filtro de búsqueda (nombre + descripción)
        if (searchLower) {
          const haystack = `${addon.name || ''} ${addon.short_name || ''} ${addon.description || ''}`.toLowerCase()
          if (!haystack.includes(searchLower)) continue
        }

        const availableFor = Array.isArray(addon.available_for_templates) ? addon.available_for_templates : []
        const isTemplateSpecific = addon.is_template_specific ?? (availableFor.length > 0)

        if (!isTemplateSpecific) {
          universal.push(addon)
        } else {
          for (const tplId of availableFor) {
            if (!tplId) continue
            if (!byTemplate[tplId]) byTemplate[tplId] = []
            byTemplate[tplId].push(addon)
          }
        }
      }
    } catch (err) {
      console.error('[AddonsPage] Error agrupando addons:', err)
    }

    return { universal, byTemplate }
  }, [catalog, categoryFilter, search])

  if (loadingCatalog) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
      </div>
    )
  }

  const safeInstalledTemplates = installedTemplates || []
  const totalShown =
    grouped.universal.length +
    Object.values(grouped.byTemplate).reduce((sum, arr) => sum + arr.length, 0)

  return (
    <div className="pb-20">
      <PageHeader
        title="Marketplace"
        description="Instala funcionalidades extra para tu negocio. Toca un ícono para ver el detalle."
      />

      {/* Banner admin */}
      {isAdmin && (
        <div className="mb-6 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <div className="p-2.5 rounded-xl border border-slate-100 bg-emerald-50 text-emerald-600 shrink-0">
            <Sparkles size={18} strokeWidth={2} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-slate-900">Modo administrador</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Activa cualquier addon sin pasar por Stripe. Se activa por 30 días para pruebas.
            </p>
          </div>
        </div>
      )}

      {/* Barra de búsqueda */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar addons..."
          className="
            w-full pl-11 pr-10 py-3
            bg-white border border-slate-200
            rounded-2xl text-sm font-medium
            placeholder:text-slate-400
            outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900
            transition-all
          "
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-slate-100"
            aria-label="Limpiar búsqueda"
          >
            <X size={14} className="text-slate-500" />
          </button>
        )}
      </div>

      {/* Chips de categoría */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCategoryFilter(c.id)}
            className={`
              px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-all shrink-0
              ${categoryFilter === c.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'}
            `}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Secciones por template instalado */}
      {safeInstalledTemplates.map(tpl => {
        const addonsForTpl = grouped.byTemplate[tpl.id] || []
        if (addonsForTpl.length === 0) return null

        return (
          <section key={tpl.id} className="mb-10">
            <div className="flex items-center gap-2 mb-5">
              <Layers size={16} className="text-slate-700" />
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Específicos de {tpl.name}
              </h2>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {addonsForTpl.length}
              </span>
            </div>
            {/* Grid denso estilo apps: más columnas, tiles más chicas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {addonsForTpl.map(addon => (
                <AddonTile
                  key={addon.id}
                  addon={addon}
                  isActive={activeIds.has(addon.id)}
                  onClick={() => setSelectedAddon(addon)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {/* Sección universal */}
      {grouped.universal.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles size={16} className="text-slate-700" />
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Universales
            </h2>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {grouped.universal.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {grouped.universal.map(addon => (
              <AddonTile
                key={addon.id}
                addon={addon}
                isActive={activeIds.has(addon.id)}
                onClick={() => setSelectedAddon(addon)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {totalShown === 0 && (
        <div className="text-center py-20">
          <PackageOpen size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500">
            {search
              ? `Sin resultados para "${search}"`
              : 'No hay addons en esta categoría.'}
          </p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="mt-3 text-xs font-bold text-slate-700 hover:text-slate-950 underline"
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      )}

      {/* Modal de detalle */}
      <AddonDetailModal
        addon={selectedAddon}
        isActive={selectedAddon ? activeIds.has(selectedAddon.id) : false}
        isAdmin={isAdmin}
        isLoading={isMutating}
        isDeactivating={deactivateAsAdmin.isPending}
        onClose={() => setSelectedAddon(null)}
        onActivate={() => selectedAddon && handleActivate(selectedAddon)}
        onDeactivate={() =>
          selectedAddon &&
          deactivateAsAdmin.mutate(
            { addonId: selectedAddon.id },
            { onSuccess: () => setSelectedAddon(null) }
          )
        }
      />

      {/* Modal de instalación animado */}
      {installingAddon && (
        <AddonInstallModal
          addonName={installingAddon.name}
          addonIcon={installingAddon.icon}
          accentColor="#4f46e5"
          onComplete={async () => {
            await refreshAll()          // refresca todo en tiempo real
            setInstallingAddon(null)
          }}
        />
      )}
    </div>
  )
}
