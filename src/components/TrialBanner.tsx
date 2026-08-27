 

'use client'

// ============================================================================
// src/components/TrialBanner.tsx
// ----------------------------------------------------------------------------
// Banner que se muestra en el dashboard cuando la compañía está en trial.
// Resuelve su propio companyId desde el usuario autenticado.
// ============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { Sparkles, AlertTriangle, X, ArrowRight } from 'lucide-react'

interface CompanyTrialInfo {
  id: string
  subscription_status: string | null
  trial_ends_at: string | null
  selected_plan_slug: string | null
}

export default function TrialBanner({ companyId: companyIdProp }: { companyId?: string | null } = {}) {
  const [info, setInfo] = useState<CompanyTrialInfo | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      let companyId = companyIdProp

      // Si no se pasó por prop, lo buscamos desde el user autenticado
      if (!companyId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('id', user.id)
          .maybeSingle()

        companyId = profile?.company_id
        if (!companyId) return
      }

      const { data } = await supabase
        .from('companies')
        .select('id, subscription_status, trial_ends_at, selected_plan_slug')
        .eq('id', companyId)
        .maybeSingle()

      if (!cancelled && data) setInfo(data as any)
    }

    load()
    return () => { cancelled = true }
  }, [companyIdProp])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(sessionStorage.getItem('trial_banner_dismissed') === '1')
    }
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('trial_banner_dismissed', '1')
    }
  }

  if (!info || dismissed) return null
  if (!['trialing', 'past_due', 'expired'].includes(info.subscription_status || '')) return null
  if (!info.trial_ends_at) return null

  const trialEnd = new Date(info.trial_ends_at)
  const now = new Date()
  const msRemaining = trialEnd.getTime() - now.getTime()
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)))

  const isExpired = msRemaining <= 0 || info.subscription_status === 'expired' || info.subscription_status === 'past_due'
  const isUrgent  = !isExpired && daysRemaining <= 3

  const variant = isExpired
    ? { bg: 'bg-rose-50',   border: 'border-rose-200',  text: 'text-rose-900',   accent: 'text-rose-600',  icon: AlertTriangle, btnBg: 'bg-rose-600 hover:bg-rose-700' }
    : isUrgent
    ? { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-900',  accent: 'text-amber-700', icon: AlertTriangle, btnBg: 'bg-amber-600 hover:bg-amber-700' }
    : { bg: 'bg-lime-50',   border: 'border-lime-200',  text: 'text-slate-900',  accent: 'text-lime-700',  icon: Sparkles,      btnBg: 'bg-slate-950 hover:bg-slate-800' }

  const Icon = variant.icon

  const message = isExpired
    ? 'Tu período de prueba terminó. Activa un plan para seguir usando iAnswer.'
    : isUrgent
    ? `Quedan ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'} de prueba. Configura tu plan antes de que termine.`
    : `Estás en período de prueba — ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'} restantes`

  return (
    <div className={`${variant.bg} ${variant.border} border-b px-4 md:px-8 py-3`}>
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <Icon size={18} className={`shrink-0 ${variant.accent}`} />
        <p className={`flex-1 text-sm font-bold ${variant.text} truncate`}>
          {message}
        </p>
        <Link
          href="/dashboard/billing"
          className={`shrink-0 px-4 py-2 rounded-xl text-xs font-black text-white ${variant.btnBg} transition-colors flex items-center gap-1.5`}
        >
          {isExpired ? 'Activar ahora' : 'Configurar plan'}
          <ArrowRight size={12} />
        </Link>
        {!isExpired && (
          <button onClick={handleDismiss} className={`shrink-0 p-1.5 rounded-lg ${variant.accent} hover:bg-white/50 transition-colors`} aria-label="Ocultar">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
