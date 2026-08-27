 

'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

// ============================================================================
// SubscriptionSyncOnSuccess
// Detecta cuando el usuario regresa de Stripe con ?success=true e invalida
// los caches relevantes (plan features, plan info, etc.) para que vea
// inmediatamente las features de su nuevo plan sin esperar al staleTime.
//
// USO: incluir este componente DENTRO de la página de settings/page.tsx
// (Stripe regresa a /dashboard/settings?success=true).
// ============================================================================

export default function SubscriptionSyncOnSuccess() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()

  // Evitar disparar dos veces (StrictMode en dev hace que useEffect corra 2x)
  const hasFired = useRef(false)

  useEffect(() => {
    if (hasFired.current) return
    const success = searchParams.get('success')
    if (success !== 'true') return

    hasFired.current = true

    // Toast inmediato confirmando
    toast.success('¡Suscripción activada! Cargando tus nuevas features...', {
      duration: 4000
    })

    // El webhook de Stripe puede tardar 1-3 segundos en propagar el cambio
    // de plan_slug en la tabla companies. Invalidamos en 2 momentos:
    //   1) inmediato — por si el webhook ya procesó
    //   2) a los 3 segundos — fallback por si tardó
    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ['planFeatures'] })
      queryClient.invalidateQueries({ queryKey: ['settingsCompanyData'] })
      queryClient.invalidateQueries({ queryKey: ['currentUserProfile'] })
      queryClient.invalidateQueries({ queryKey: ['adminPlans'] })
      queryClient.invalidateQueries({ queryKey: ['contactsEnriched'] })
      queryClient.invalidateQueries({ queryKey: ['overdueTasksCount'] })
    }

    invalidateAll()
    const t = setTimeout(invalidateAll, 3000)

    // Limpiamos el query param de la URL para que un F5 no re-dispare
    // ni quede ?success=true en la barra
    router.replace(pathname, { scroll: false })

    return () => clearTimeout(t)
  }, [searchParams, queryClient, router, pathname])

  // Componente headless — no renderiza nada
  return null
}
