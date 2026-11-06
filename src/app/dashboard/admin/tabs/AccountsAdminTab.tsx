'use client'

// ============================================================================
// AccountsAdminTab
// ----------------------------------------------------------------------------
// Buscar una cuenta por el correo de cualquiera de sus usuarios y cambiarle la
// industria principal. La lógica vive en /api/admin/change-industry.
// ============================================================================

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Users, Search, Loader2, AlertTriangle, ArrowRight, Building2 } from 'lucide-react'
import { useConfirm } from '../../../../hooks/useConfirm'

interface AccountTemplate { id: string; name: string; is_active: boolean; is_selectable: boolean }
interface ActiveAddon { addon_id: string; name: string; available_for_templates: string[] }
interface Account {
  user: { full_name: string | null; email: string | null }
  company: { id: string; name: string; plan_slug: string | null; subscription_status: string | null; onboarding_completed: boolean | null }
  installed: Array<{ template_id: string; is_primary: boolean }>
  templates: AccountTemplate[]
  addons: ActiveAddon[]
}

export default function AccountsAdminTab() {
  const [email, setEmail] = useState('')
  const [searching, setSearching] = useState(false)
  const [account, setAccount] = useState<Account | null>(null)
  const [newTemplate, setNewTemplate] = useState('')
  const [removePrevious, setRemovePrevious] = useState(true)
  const [saving, setSaving] = useState(false)
  const { confirm, ConfirmDialog } = useConfirm()

  async function load(target: string) {
    const res = await fetch(`/api/admin/change-industry?email=${encodeURIComponent(target)}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo cargar la cuenta')
    return data as Account
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const target = email.trim()
    if (!target) return
    setSearching(true)
    setAccount(null)
    setNewTemplate('')
    try {
      setAccount(await load(target))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  const primaryId = account?.installed.find(t => t.is_primary)?.template_id ?? null
  const templateName = (id: string | null) =>
    id ? account?.templates.find(t => t.id === id)?.name ?? id : 'Sin industria'

  // Addons ligados a una industria que no incluye la nueva: siguen cobrándose,
  // pero dejan de tener sentido para la cuenta.
  const orphanAddons = account && newTemplate
    ? account.addons.filter(a => a.available_for_templates.length > 0 && !a.available_for_templates.includes(newTemplate))
    : []

  async function handleChange() {
    if (!account || !newTemplate) return
    const ok = await confirm(
      `La cuenta "${account.company.name}" pasa de ${templateName(primaryId)} a ${templateName(newTemplate)}. ` +
      'Cambian los módulos del dashboard y el agente del bot.',
      { title: 'Cambiar industria', confirmText: 'Cambiar' }
    )
    if (!ok) return

    setSaving(true)
    try {
      const res = await fetch('/api/admin/change-industry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: account.company.id, templateId: newTemplate, removePrevious }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo cambiar la industria')
      if (data.warning) toast.error(data.warning)
      else toast.success(`Industria cambiada a ${templateName(newTemplate)}`)
      setAccount(await load(email.trim()))
      setNewTemplate('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl">
          <Users size={20} className="text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-950">Cuentas</h2>
          <p className="text-sm text-slate-600 font-medium">
            Busca una cuenta por el correo de uno de sus usuarios para cambiarle la industria.
          </p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2 max-w-xl">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="correo@empresa.com"
          className="flex-1 min-w-[220px] px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        />
        <button
          type="submit"
          disabled={searching || !email.trim()}
          className="px-4 py-2.5 text-sm font-bold bg-slate-900 text-white rounded-xl disabled:opacity-40 flex items-center gap-2"
        >
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Buscar
        </button>
      </form>

      {account && (
        <div className="max-w-xl bg-white border border-slate-200 rounded-3xl p-6 space-y-5">
          <div className="flex items-start gap-3">
            <Building2 size={18} className="text-slate-400 mt-0.5" />
            <div className="min-w-0">
              <p className="font-black text-slate-900 truncate">{account.company.name}</p>
              <p className="text-xs text-slate-500 font-medium">
                {account.user.full_name ? `${account.user.full_name} · ` : ''}{account.user.email}
              </p>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Plan {account.company.plan_slug ?? '—'} · {account.company.subscription_status ?? 'sin suscripción'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Industria actual</p>
            <p className="text-sm font-bold text-slate-900">{templateName(primaryId)}</p>
            {account.installed.length > 1 && (
              <p className="text-xs text-slate-500 mt-1">
                También instaladas: {account.installed.filter(t => !t.is_primary).map(t => templateName(t.template_id)).join(', ')}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Nueva industria
            </label>
            <select
              value={newTemplate}
              onChange={e => setNewTemplate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
            >
              <option value="">Elige una industria…</option>
              {account.templates.filter(t => t.id !== primaryId).map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.is_selectable ? '' : ' (oculta en el registro)'}
                </option>
              ))}
            </select>
          </div>

          {primaryId && (
            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={removePrevious}
                onChange={e => setRemovePrevious(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Quitar {templateName(primaryId)} de la cuenta
                <span className="block text-xs text-slate-500">
                  Si no, queda instalada como secundaria. La configuración que se haya guardado en ella se borra al quitarla.
                </span>
              </span>
            </label>
          )}

          {orphanAddons.length > 0 && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Addons activos que no son de la nueva industria</p>
                <p>{orphanAddons.map(a => a.name).join(', ')}. Siguen activos y cobrándose; revísalos con el cliente.</p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleChange}
            disabled={!newTemplate || saving}
            className="w-full px-4 py-3 text-sm font-bold bg-slate-900 text-white rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            Cambiar industria
          </button>
        </div>
      )}

      {ConfirmDialog}
    </div>
  )
}
