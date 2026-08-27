 

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================================================
// GET /api/cron/check-expired-trials
// ----------------------------------------------------------------------------
// Cron que corre diario para mover trials vencidos a 'past_due'.
//
// Configuración Vercel (vercel.json):
//   {
//     "crons": [{
//       "path": "/api/cron/check-expired-trials",
//       "schedule": "0 6 * * *"
//     }]
//   }
//
// Stripe normalmente se encarga de mover trial→active/past_due automáticamente
// via webhooks, pero este cron es una red de seguridad para casos donde:
//   - El usuario nunca activó suscripción (trial sin Stripe involucrado)
//   - El webhook falló y la DB quedó desincronizada
// ============================================================================

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // Seguridad: solo Vercel Cron tiene esta header automáticamente
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date().toISOString()

  // Mover trials vencidos a 'past_due' (no expired, para dar gracia)
  const { data: expired, error } = await supabase
    .from('companies')
    .update({
      subscription_status: 'past_due',
      account_status: 'expired'
    } as never)
    .eq('subscription_status', 'trialing')
    .lt('trial_ends_at', now)
    .select('id, name')

  if (error) {
    console.error('[Cron expire-trials] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[Cron expire-trials] ${expired?.length || 0} trials movidos a past_due`)

  return NextResponse.json({
    ok: true,
    expired_count: expired?.length || 0,
    expired: expired?.map((c: any) => ({ id: c.id, name: c.name })) || []
  })
}
