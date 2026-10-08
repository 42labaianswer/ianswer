 

'use client'

// ============================================================================
// src/components/SubscriptionGuard.tsx
// ----------------------------------------------------------------------------
// Componente que se monta en el layout del dashboard. Sin una suscripción de
// Stripe viva (en prueba, activa, o past_due dentro de la gracia) no se entra:
// muestra un overlay que manda a /dashboard/plans.
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
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
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

  if (!checked || !status) return null

  // Cuentas sin onboarding o que nunca se suscribieron → las atiende el wizard.
  if (!status.onboarding_completed || !status.stripe_subscription_id) return null

  // La regla vive en src/lib/subscription.ts (hasDashboardAccess).
  const shouldBlock = !hasDashboardAccess({
    status: status.subscription_status,
    trialEndsAt: status.trial_ends_at
  })

  // No bloquear si está en una ruta permitida
  const isAllowedRoute = ALLOWED_PATHS.some(path => pathname.startsWith(path))

  if (!shouldBlock || isAllowedRoute) return null

  // Mostrar overlay bloqueante
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="h-14 w-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={28} strokeWidth={2} />
        </div>
        <h2 className="text-2xl font-black text-slate-950 tracking-tight mb-3">
          Tu suscripción no está activa
        </h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-8">
          Tu suscripción se canceló o no pudimos cobrar tu plan.
          Activa un plan para seguir usando iAnswer; tu información se conserva.
        </p>
        <Link
          href="/dashboard/plans"
          className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-slate-950 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-colors"
        >
          Activar plan ahora <ArrowRight size={14} />
        </Link>
        <p className="text-xs text-slate-400 font-medium mt-4">
          ¿Problemas? <Link href="/dashboard/help" className="text-indigo-600 font-bold hover:underline">Contactar soporte</Link>
        </p>
      </div>
    </div>
  )
}
