 

// ============================================================================
// src/hooks/useIsAdmin.ts
// ----------------------------------------------------------------------------
// Devuelve true si el usuario actual tiene profiles.is_admin = true.
// Cacheado 10 minutos. Pensado para mostrar UI extra (activar sin pagar, etc).
// ============================================================================
// src/hooks/useIsAdmin.ts
// src/hooks/useIsAdmin.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useEffect } from 'react'

export function useIsAdmin(): boolean {
  const { data, refetch } = useQuery({
    queryKey: ['profile-is-admin'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.log('[useIsAdmin] No user')
        return false
      }

      console.log('[useIsAdmin] User:', user.email, user.id)

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin, role')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error('[useIsAdmin] Error:', error)
        return false
      }

      console.log('[useIsAdmin] Profile:', profile)
      const isAdmin = profile?.is_admin === true
      console.log('[useIsAdmin] isAdmin:', isAdmin)
      return isAdmin
    },
    // 🔥 Sin caché para forzar consulta siempre
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  // 🔄 Refetch cuando cambia la sesión
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      console.log('[useIsAdmin] Auth changed, refetching...')
      refetch()
    })
    return () => listener?.subscription?.unsubscribe()
  }, [refetch])

  return data ?? false
}