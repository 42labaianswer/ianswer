 

'use client'

// ============================================================================
// src/components/SubscriptionGuard.tsx
// ----------------------------------------------------------------------------
// Componente que se monta en el layout del dashboard. Si la suscripción está
// en 'expired' o 'past_due' (Y ya pasaron más de 3 días de gracia), redirige
// al usuario a /dashboard/plans forzosamente.
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
import { isSubscriptionBlocked } from '../lib/subscription'

const ALLOWED_PATHS = ['/dashboard/plans', '/dashboard/admin', '/dashboard/help', '/dashboard/profile']

interface CompanyStatus {
  subscription_status: string | null
  trial_ends_at: string | null
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
        .select('subscription_status, trial_ends_at')
        .eq('id', profile.company_id)
        .maybeSingle()

      setStatus(company as any)
      setChecked(true)
    }
    check()
  }, [pathname])

  if (!checked || !status) return null

  // La regla vive en src/lib/subscription.ts (probada en
  // src/lib/__tests__/subscription.test.ts) y está replicada en el nodo
  // "5. Validar Suscripcion" de n8n. Si cambias una, cambia la otra.
  const shouldBlock = isSubscriptionBlocked({
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
          Tu suscripción expiró
        </h2>
        <p className="text-sm text-slate-600 font-medium leading-relaxed mb-8">
          Tu período de prueba terminó y todavía no tienes un plan activo.
          Activa un plan para seguir usando iAnswer.
        </p>
        <Link
          href="/dashboard/plans"
          className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 bg-slate-950 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-colors"
        >
          Activar plan ahora <ArrowRight size={14} />
        </Link>
        <p className="text-xs text-slate-400 font-medium mt-4">
          ¿Problemas? <Link href="/dashboard/help" className="text-lime-700 font-bold hover:underline">Contactar soporte</Link>
        </p>
      </div>
    </div>
  )
}
