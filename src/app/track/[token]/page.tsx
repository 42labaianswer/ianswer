/**
 * ============================================================================
 * /track/[token]/page.tsx · redirect de compatibilidad
 * ----------------------------------------------------------------------------
 * La página real de tracking vive en /tracking/[token]. Durante un tiempo se
 * generaron links como /track/<token> (sin la "ing"), que daban 404.
 *
 * Esta ruta redirige permanentemente cualquier /track/<token> a
 * /tracking/<token>, para que los links viejos que ya se compartieron con
 * clientes (WhatsApp, etc.) sigan funcionando. Los links nuevos ya se generan
 * directo a /tracking/ (fix en OrderDrawer / OrderTrackingTab).
 * ============================================================================
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

export default async function TrackRedirect({ params }: Params) {
  const { token } = await params
  redirect(`/tracking/${token}`)
}