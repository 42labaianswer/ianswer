import { NextResponse, after } from 'next/server'
import { requireActiveCompany } from '../../../../../lib/apiAuth'
import { requestGoogleSync } from '../../../../../lib/appointmentSync'

// POST /api/appointments/:id/sync
// Reintenta a mano la sincronización con Google de una cita que quedó en 'failed'.

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveCompany()
  if (!auth.ok) return auth.response
  const { supabase, companyId } = auth
  const { id } = await params

  const { data: appointment } = await supabase
    .from('appointments')
    .update({ google_sync: 'pending', google_sync_error: null })
    .eq('id', id)
    .eq('company_id', companyId)
    .in('google_sync', ['failed', 'pending'])
    .select('id')
    .maybeSingle()
  if (!appointment) {
    return NextResponse.json({ success: false, error: 'La cita no existe o no necesita sincronizarse' }, { status: 404 })
  }

  after(() => requestGoogleSync(id))
  return NextResponse.json({ success: true })
}
