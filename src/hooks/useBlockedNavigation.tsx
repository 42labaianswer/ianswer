'use client'

// ============================================================================
// src/hooks/useBlockedNavigation.tsx
// ----------------------------------------------------------------------------
// Con la suscripción inactiva, los enlaces del sidebar a secciones bloqueadas
// no navegan: muestran un toast. Sin esto el clic llegaba a proxy.ts, que
// redirigía a /dashboard/plans sin explicar nada.
//
// Al hacer clic se vuelve a consultar el estado (la suscripción pudo
// reactivarse en otra pestaña): si ya no está bloqueada, navega normal.
// La entrada por URL la sigue cubriendo proxy.ts.
// ============================================================================

import type { MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { hasDashboardAccess } from '../lib/subscription'
import { isBlockedAllowedPath } from '../lib/dashboardGate'

const QUERY_KEY = ['account-blocked']

/** Misma condición que computeDashboardGate → 'blocked'. */
async function fetchIsBlocked(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.company_id) return false

  const { data: company } = await supabase
    .from('companies')
    .select('subscription_status, trial_ends_at, onboarding_completed, stripe_subscription_id')
    .eq('id', profile.company_id)
    .maybeSingle()
  if (!company) return false

  return !!company.onboarding_completed && !!company.stripe_subscription_id &&
    !hasDashboardAccess({ status: company.subscription_status, trialEndsAt: company.trial_ends_at })
}

function showBlockedToast() {
  toast(
    <div>
      <p className="text-sm font-bold text-white">Tu suscripción no está activa.</p>
      <p className="text-xs text-white/75 font-medium">
        Reactívala en{' '}
        <Link href="/dashboard/plans" className="text-white font-bold underline hover:no-underline">Mi Plan</Link>
      </p>
    </div>,
    // Un solo toast aunque se hagan varios clics seguidos.
    { id: 'subscription-inactive', icon: <Lock size={16} className="text-amber-400 shrink-0" /> }
  )
}

export function useBlockedNavigation() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: isBlocked = false } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchIsBlocked })

  /** onClick para un enlace: con la cuenta bloqueada, verifica y muestra el toast en vez de navegar. */
  return (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (!isBlocked || isBlockedAllowedPath(href)) return
    e.preventDefault()
    queryClient.fetchQuery({ queryKey: QUERY_KEY, queryFn: fetchIsBlocked, staleTime: 0 })
      .then(stillBlocked => stillBlocked ? showBlockedToast() : router.push(href))
      .catch(() => router.push(href))
  }
}
