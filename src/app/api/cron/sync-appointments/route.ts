import { NextResponse } from 'next/server'
import { requestGoogleSync, serviceClient } from '../../../../lib/appointmentSync'

// GET /api/cron/sync-appointments
// Red de seguridad de la sincronización con Google: reintenta las citas
// futuras que quedaron en 'pending' (n8n no contestó) o 'failed'.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH = 50
const STUCK_AFTER_MS = 10 * 60_000

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const supabase = serviceClient()
  const today = new Date().toISOString().slice(0, 10)
  const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS).toISOString()

  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .in('google_sync', ['pending', 'failed'])
    .neq('status', 'cancelled')
    .gte('appointment_date', today)
    .lte('created_at', stuckBefore)
    .order('appointment_date', { ascending: true })
    .limit(BATCH)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const { id } of data ?? []) {
    await requestGoogleSync(id, supabase)
  }
  return NextResponse.json({ retried: data?.length ?? 0 })
}
