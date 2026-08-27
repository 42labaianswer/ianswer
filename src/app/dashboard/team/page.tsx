 

'use client'

// ============================================================================
// src/app/dashboard/team/page.tsx · v2.0
// Directorio CRM de miembros del equipo, adaptable por plantilla.
// ============================================================================

import { useState, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTemplateConfig } from '../../../lib/teamFieldsByTemplate'
import TeamDrawer, { TeamMember } from '../../../components/TeamDrawer'
import {
  Users, Plus, Search, Mail, Phone, Sparkles
} from 'lucide-react'
import toast from 'react-hot-toast'
import { normalizeTeamPayload } from '../../../lib/teamPayload'

export default function TeamPage() {
  const { primaryTemplate, isLoadingWorkspace } = useWorkspace()
  const qc = useQueryClient()
  const templateId = primaryTemplate?.id || 'generic'
  const tplConfig = getTemplateConfig(templateId)

  const [companyId, setCompanyId] = useState<string>('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [search, setSearch] = useState('')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('active')
  const [filterTag, setFilterTag] = useState<string>('')

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team', companyId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No hay sesión')
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) throw new Error('Sin company')
      setCompanyId(profile.company_id)

      const { data, error } = await supabase
        .from('team')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('full_name', { ascending: true })
      if (error) throw error
      return data as TeamMember[]
    }
  })

  const saveMutation = useMutation({
    mutationFn: async (m: TeamMember) => {
      if (!companyId) throw new Error('Sin company')
      const payload: any = normalizeTeamPayload({
        ...m, company_id: companyId, updated_at: new Date().toISOString()
      })
      if (m.id) {
        const { error } = await supabase.from('team').update(payload).eq('id', m.id)
        if (error) throw error
      } else {
        delete payload.id
        const { error } = await supabase.from('team').insert([payload])
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', companyId] })
      toast.success('Guardado')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('team').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team', companyId] })
      toast.success('Eliminado')
    }
  })

  const allTags = useMemo(() => {
    const set = new Set<string>()
    members.forEach(m => {
      ;(m.tags || []).forEach(t => set.add(t))
      if (m.specialty) set.add(m.specialty)
      if (m.position) set.add(m.position)
    })
    return Array.from(set).sort()
  }, [members])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return members.filter(m => {
      if (filterActive === 'active' && m.is_active === false) return false
      if (filterActive === 'inactive' && m.is_active !== false) return false
      if (filterTag) {
        const has = (m.tags || []).includes(filterTag) || m.specialty === filterTag || m.position === filterTag
        if (!has) return false
      }
      if (s) {
        const hay = `${m.full_name} ${m.title || ''} ${m.specialty || ''} ${m.position || ''} ${m.email || ''} ${(m.tags || []).join(' ')}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [members, search, filterActive, filterTag])

  const openNew = () => { setEditing(null); setDrawerOpen(true) }
  const openEdit = (m: TeamMember) => { setEditing(m); setDrawerOpen(true) }

  if (isLoadingWorkspace || isLoading) {
    return <div className="p-8 text-slate-400">Cargando...</div>
  }

  return (
    <div className="px-4 md:px-8 py-4 md:py-6">
      {/* Header */}
      {/* Action bar: botón Nuevo + contador */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-500 font-medium">
          {members.length} {members.length === 1 ? 'registrado' : 'registrados'}
        </p>
        <button
          onClick={openNew}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition-colors"
        >
          <Plus size={16} />
          Nuevo {tplConfig.noun_singular.toLowerCase()}
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Buscar ${tplConfig.noun_plural.toLowerCase()}...`}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-slate-300 outline-none text-sm font-medium"
            style={{ color: '#0f172a', WebkitTextFillColor: '#0f172a' }}
          />
        </div>

        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
          {(['active', 'all', 'inactive'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterActive(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                filterActive === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {s === 'active' ? 'Activos' : s === 'all' ? 'Todos' : 'Inactivos'}
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <select
            value={filterTag}
            onChange={e => setFilterTag(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-transparent rounded-xl focus:border-slate-300 outline-none text-xs font-bold text-slate-700"
            style={{ color: '#0f172a' }}
          >
            <option value="">Todas las especialidades</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* Grid de cards */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-16 text-center">
          <div className="inline-flex h-16 w-16 bg-slate-100 text-slate-400 rounded-2xl items-center justify-center mb-4">
            <Users size={28} />
          </div>
          <h3 className="text-lg font-black text-slate-900 mb-1">
            {members.length === 0
              ? `Aún no tienes ${tplConfig.noun_plural.toLowerCase()}`
              : 'Sin resultados con esos filtros'}
          </h3>
          <p className="text-sm text-slate-500 font-medium mb-6">
            {members.length === 0
              ? `Agrega al primer miembro para que el bot pueda responder sobre el equipo.`
              : 'Prueba ajustar la búsqueda o quitar los filtros.'}
          </p>
          {members.length === 0 && (
            <button
              onClick={openNew}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800"
            >
              <Plus size={16} />
              Agregar el primero
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(m => (
            <TeamCard key={m.id} member={m} onClick={() => openEdit(m)} />
          ))}
        </div>
      )}

      {/* Drawer */}
      {companyId && (
        <TeamDrawer
          open={drawerOpen}
          member={editing}
          companyId={companyId}
          templateId={templateId}
          onClose={() => { setDrawerOpen(false); setEditing(null) }}
          onSave={async (m) => { await saveMutation.mutateAsync(m) }}
          onDelete={async (id) => { await deleteMutation.mutateAsync(id) }}
        />
      )}
    </div>
  )
}

// ── Card ────────────────────────────────────────────────────────────────────
function TeamCard({ member, onClick }: { member: TeamMember, onClick: () => void }) {
  const initials = (member.full_name || '?')
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const badges: string[] = []
  if (member.specialty) badges.push(member.specialty)
  if (member.position) badges.push(member.position)
  ;(member.tags || []).slice(0, 2).forEach(t => badges.push(t))

  const isInactive = member.is_active === false

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={`cursor-pointer text-left bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-lg hover:border-slate-300 transition-all group ${isInactive ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3 mb-4">
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 border-2"
          style={{
            borderColor: member.color || '#4f46e5',
            backgroundColor: member.avatar_url ? 'transparent' : (member.color || '#4f46e5') + '20',
            color: member.color || '#4f46e5'
          }}
        >
          {member.avatar_url ? (
            <img src={member.avatar_url} alt={member.full_name} className="h-full w-full object-cover" />
          ) : (
            <span className="font-black text-base">{initials || '?'}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-slate-900 truncate group-hover:text-slate-700 transition-colors">
            {member.full_name || 'Sin nombre'}
          </h3>
          {member.title && (
            <p className="text-xs text-slate-500 font-medium truncate">{member.title}</p>
          )}
        </div>
        {isInactive && (
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded">
            Inactivo
          </span>
        )}
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {badges.slice(0, 4).map(b => (
            <span
              key={b}
              className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-bold uppercase tracking-wider"
            >
              {b}
            </span>
          ))}
          {badges.length > 4 && (
            <span className="px-2 py-0.5 text-slate-400 text-[10px] font-bold">
              +{badges.length - 4}
            </span>
          )}
        </div>
      )}

      {member.short_bio && (
        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mb-3">
          {member.short_bio}
        </p>
      )}

      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-3 border-t border-slate-100">
        {member.email && (
          <span className="flex items-center gap-1 truncate">
            <Mail size={11} />
            <span className="truncate">{member.email}</span>
          </span>
        )}
        {member.phone && (
          <span className="flex items-center gap-1">
            <Phone size={11} />
            {member.phone}
          </span>
        )}
        {member.bio_for_ai && (
          <span className="flex items-center gap-1 text-amber-600" title="Tiene info para el bot">
            <Sparkles size={11} />
          </span>
        )}
      </div>
    </div>
  )
}
