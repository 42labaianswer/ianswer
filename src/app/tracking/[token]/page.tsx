/**
 * ============================================================================
 * /track/[token]/page.tsx · v2.20
 * ----------------------------------------------------------------------------
 * Página pública (sin auth) de tracking de orden.
 *
 * URL:/track/<public_token>
 *
 * Branding del restaurante:
 *   - Logo en header
 *   - Colores primary y accent
 *   - Sin marca iAnswer
 *
 * Lo que muestra:
 *   - Timeline de estados (configurables por el restaurante)
 *   - Estado actual destacado con animación sutil
 *   - Items del pedido con sus modifiers
 *   - Total
 *   - ETA si la orden está activa
 *   - Auto-refresh cada 30 segundos
 *
 * Es Client Component porque queremos polling. La data inicial viene SSR para
 * que el primer load sea instantáneo y haya Open Graph data.
 * ============================================================================
 */

import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import OrderTrackingClient from './OrderTrackingClient'
import { hasFullBranding, getPlatformName } from '../../../lib/branding'

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = 'force-dynamic'
export const revalidate = 30

type Params = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Params) {
  const { token } = await params
  const { data } = await supabaseAnon.rpc('get_order_tracking', { p_token: token })
  const order = data?.[0]
  if (!order) return { title: 'Pedido no encontrado' }
  return {
    title: `#${order.order_number} · ${order.status_label} · ${order.company_name}`,
    description: `Sigue tu pedido en tiempo real`,
    openGraph: {
      title: `Tu pedido #${order.order_number}`,
      description: order.status_label
    }
  }
}

export default async function TrackPage({ params }: Params) {
  const { token } = await params
  // Initial fetch SSR
  const { data, error } = await supabaseAnon.rpc('get_order_tracking', { p_token: token })
  if (error || !data || data.length === 0) return notFound()
  const order = data[0]

  // v3.0 Sprint 5: Gate full_branding
  const [fullBranding, platformName] = await Promise.all([
    hasFullBranding(order.company_id),
    getPlatformName()
  ])

  return (
    <OrderTrackingClient
      initialOrder={order}
      token={token}
      fullBranding={fullBranding}
      platformName={platformName}
    />
  )
}