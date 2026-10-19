 

'use client'

// ============================================================================
// src/components/SubscriptionGuard.tsx
// ----------------------------------------------------------------------------
// Componente que se monta en el layout del dashboard. Sin una suscripción de
// Stripe viva (en prueba, activa, o past_due dentro de la gracia) no se entra:
// redirige a /dashboard/plans, que explica el motivo del bloqueo.
//
// LISTA BLANCA vía hasDashboardAccess(): todo estado no permitido se bloquea,
// incluido 'inactive' (cuentas del wizard sin pagar y suscripciones canceladas).
//
// Las cuentas que todavía no terminan el onboarding o que nunca iniciaron una
// suscripción las atiende el OnboardingWizard (paso 5 → Stripe); aquí solo se
// bloquea a quien ya tuvo suscripción y se le venció o se canceló.
//
// EXCEPCIONES (no redirige si la ruta actual es una de estas):
//   - /dashboard/plans (donde tiene que estar para pagar)
//   - /dashboard/admin (admin sigue funcionando para evitar bloqueos accidentales)
//
// El TrialBanner sigue mostrando aviso durante el trial. Este componente solo
// actúa cuando realmente venció el plazo.
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { hasDashboardAccess } from '../lib/subscription'
import { BLOCKED_ALLOWED_PATHS } from '../lib/dashboardGate'

// Misma lista que usa proxy.ts para el bloqueo en el servidor.
const ALLOWED_PATHS = BLOCKED_ALLOWED_PATHS

interface CompanyStatus {
  subscription_status: string | null
  trial_ends_at: string | null
  onboarding_completed: boolean | null
  stripe_subscription_id: string | null
}

export default function SubscriptionGuard() {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = useState<CompanyStatus | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setChecked(true); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.company_id) { setChecked(true); return }

      const { data: company } = await supabase
        .from('companies')
        .select('subscription_status, trial_ends_at, onboarding_completed, stripe_subscription_id')
        .eq('id', profile.company_id)
        .maybeSingle()

      setStatus(company as any)
      setChecked(true)
    }
    check()
  }, [pathname])

  // Cuentas sin onboarding o que nunca se suscribieron → las atiende el wizard.
  // La regla vive en src/lib/subscription.ts (hasDashboardAccess).
  const shouldBlock = checked && !!status &&
    !!status.onboarding_completed && !!status.stripe_subscription_id &&
    !hasDashboardAccess({ status: status.subscription_status, trialEndsAt: status.trial_ends_at })

  const isAllowedRoute = ALLOWED_PATHS.some(path => pathname.startsWith(path))

  // Sin modal: proxy.ts ya redirige a /dashboard/plans en el servidor y un
  // modal aquí solo alcanzaba a parpadear antes de esa redirección. Planes
  // explica el bloqueo; esto cubre el caso en que el proxy dejó pasar ('ok'
  // ante un error al calcular el acceso).
  useEffect(() => {
    if (shouldBlock && !isAllowedRoute) router.replace('/dashboard/plans')
  }, [shouldBlock, isAllowedRoute, router])

  return null
}
