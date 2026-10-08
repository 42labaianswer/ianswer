/**
 * ============================================================================
 * /track/[token]/page.tsx · redirect de compatibilidad
 * ----------------------------------------------------------------------------
 * La página real de tracking vive en /tracking/[token]. Esta ruta redirige
 * permanentemente cualquier /track/<token> a /tracking/<token>, para que los
 * links con esa forma ya compartidos con clientes (WhatsApp, etc.) sigan
 * funcionando. Los links se generan directo a /tracking/ (OrderDrawer /
 * OrderTrackingTab).
 * ============================================================================
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

export default async function TrackRedirect({ params }: Params) {
  const { token } = await params
  redirect(`/tracking/${token}`)
}