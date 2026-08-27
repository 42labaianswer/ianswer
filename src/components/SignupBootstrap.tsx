 

'use client'

// ============================================================================
// src/components/SignupBootstrap.tsx
// ----------------------------------------------------------------------------
// Aplica las opciones de signup (plan + template) que el usuario eligió desde
// la landing pública al onboardear su company.
//
// Flujo:
//   1. Usuario hace click en "Probar gratis" en /precios?plan=growth → /login?signup=1&plan=growth
//   2. Hace signup, plan se guarda en localStorage como `signup_pending_plan`
//   3. Va al onboarding del dashboard, llena nombre de empresa, se crea company
//   4. Este componente, montado en el layout del dashboard, detecta el localStorage
//      y aplica los valores a la company. El trigger SQL del 09_trial_billing
//      seteará automáticamente trial_ends_at = now() + trial_days del plan.
//   5. Borra localStorage al aplicar.
// ============================================================================

import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SignupBootstrap() {
  useEffect(() => {
    const apply = async () => {
      if (typeof window === 'undefined') return

      const pendingPlan     = localStorage.getItem('signup_pending_plan')
      const pendingTemplate = localStorage.getItem('signup_pending_template')

      // Si no hay pendientes, salir
      if (!pendingPlan && !pendingTemplate) return

      // Buscar user actual
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Buscar profile.company_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()

      // Si todavía no hay company asociada (usuario aún no completó onboarding),
      // esperar y reintentar en la próxima carga
      if (!profile?.company_id) return

      // Leer company actual
      const { data: company } = await supabase
        .from('companies')
        .select('id, selected_plan_slug, template_id, plan_slug')
        .eq('id', profile.company_id)
        .maybeSingle()

      if (!company) return

      // Construir updates solo si la company NO los tiene ya
      const updates: any = {}
      if (pendingPlan && !company.selected_plan_slug && !company.plan_slug) {
        updates.selected_plan_slug = pendingPlan
      }
      if (pendingTemplate && !company.template_id) {
        updates.template_id = pendingTemplate
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('companies')
          .update(updates as never)
          .eq('id', company.id)

        if (!error) {
          // Borrar pendientes para no reaplicar
          if (pendingPlan)     localStorage.removeItem('signup_pending_plan')
          if (pendingTemplate) localStorage.removeItem('signup_pending_template')
        } else {
          console.warn('[SignupBootstrap] No se pudo aplicar:', error)
        }
      } else {
        // La company ya tiene plan, limpiar pendientes
        if (pendingPlan)     localStorage.removeItem('signup_pending_plan')
        if (pendingTemplate) localStorage.removeItem('signup_pending_template')
      }
    }

    apply()
  }, [])

  return null
}
