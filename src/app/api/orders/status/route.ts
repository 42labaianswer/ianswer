import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { GRAPH, postGraphMessage } from '../../../../lib/metaGraph'
import { getAppBaseUrl } from '../../../../lib/appUrl'
import { insideServiceWindow, orderStatusMessage, prepMinutes } from '../../../../lib/orderNotify'

// ============================================================================
// POST /api/orders/status
// ----------------------------------------------------------------------------
// Cambia el estado de un pedido desde el panel (kanban, botón rápido o el
// detalle) y le avisa al cliente por WhatsApp con el link de seguimiento.
//
// Entrada: { orderId, action: 'next' | 'step' | 'cancel', step?, reason? }
//   next    pasa al siguiente estado de companies.order_statuses
//   step    pasa al estado con ese step (arrastrar en el kanban)
//   cancel  cancela (cancel_order)
//
// Al pasar a "preparing" sin hora estimada, la calcula con el platillo que
// más tarda (menu_items.prep_minutes).
//
// El aviso solo sale si el restaurante lo tiene prendido
// (companies.order_notify_customer) y el cliente escribió en las últimas
// 24 h: fuera de esa ventana Meta exige plantilla aprobada, así que se omite
// y el cliente sigue viendo el estado en la página de seguimiento.
// ============================================================================

export const dynamic = 'force-dynamic'

type Action = 'next' | 'step' | 'cancel'
type StatusDef = { name: string, step: number, semantic: string }

const ORDER_FIELDS =
  'id, company_id, order_number, status_semantic, status_label, status_step, delivery_type, items, ' +
  'customer_name, customer_phone, contact_phone, contact_id, estimated_ready_at, tracking_token, public_token'

type OrderRow = {
  id: string
  company_id: string
  order_number: string | null
  status_semantic: string
  status_label: string
  status_step: number
  delivery_type: string | null
  items: { menu_item_id?: string | null }[] | null
  customer_name: string | null
  customer_phone: string | null
  contact_phone: string | null
  contact_id: string | null
  estimated_ready_at: string | null
  tracking_token: string | null
  public_token: string | null
}

export async function POST(req: Request) {
  try {
    const { orderId, action, step, reason } = (await req.json()) as {
      orderId?: string, action?: Action, step?: number, reason?: string | null
    }
    if (!orderId || !action || !['next', 'step', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    // RLS: solo regresa el pedido si es de la empresa del usuario.
    const { data: before } = await supabase.from('orders').select(ORDER_FIELDS).eq('id', orderId).maybeSingle()
    if (!before) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    const order0 = before as unknown as OrderRow

    const { data: company } = await supabase
      .from('companies')
      .select('order_statuses, order_enable_tracking, order_notify_customer, business_phone_id, system_user_access_token')
      .eq('id', order0.company_id)
      .maybeSingle()

    // ── 1. Cambiar el estado ──────────────────────────────────────────────
    if (action === 'next') {
      const { error } = await supabase.rpc('advance_order_status', { p_order_id: orderId, p_changed_by: 'admin' })
      if (error) throw error
    } else if (action === 'cancel') {
      const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId, p_reason: reason || null })
      if (error) throw error
    } else {
      const target = ((company?.order_statuses as StatusDef[] | null) || []).find(s => s.step === step)
      if (!target) return NextResponse.json({ error: 'Estado destino no encontrado' }, { status: 400 })
      const { error } = await supabase.from('orders').update({
        status_semantic: target.semantic,
        status_label: target.name,
        status_step: target.step,
      }).eq('id', orderId)
      if (error) throw error
      await supabase.from('order_status_history').insert({
        order_id: orderId,
        status_semantic: target.semantic,
        status_label: target.name,
        status_step: target.step,
        changed_by: 'admin',
      })
    }

    const { data: after } = await supabase.from('orders').select(ORDER_FIELDS).eq('id', orderId).maybeSingle()
    const order = (after || before) as unknown as OrderRow
    if (order.status_semantic === order0.status_semantic) {
      return NextResponse.json({ ok: true, notified: false, reason: 'same_status' })
    }

    // ── 2. Hora estimada al empezar a preparar ────────────────────────────
    if (order.status_semantic === 'preparing' && !order.estimated_ready_at) {
      const ids = (order.items || []).map(i => i.menu_item_id).filter((x): x is string => !!x)
      const { data: menu } = ids.length
        ? await supabase.from('menu_items').select('id, prep_minutes').in('id', ids)
        : { data: [] as { id: string, prep_minutes: number | null }[] }
      const byItem = Object.fromEntries((menu || []).map(m => [m.id, m.prep_minutes]))
      const eta = new Date(Date.now() + prepMinutes(order.items, byItem) * 60_000).toISOString()
      await supabase.from('orders').update({ estimated_ready_at: eta }).eq('id', orderId)
      order.estimated_ready_at = eta
    }

    // ── 3. Aviso al cliente ───────────────────────────────────────────────
    if (company?.order_notify_customer === false) {
      return NextResponse.json({ ok: true, notified: false, reason: 'disabled' })
    }
    const phone = order.customer_phone || order.contact_phone || order.contact_id
    if (!phone) return NextResponse.json({ ok: true, notified: false, reason: 'no_phone' })

    const token = order.tracking_token || order.public_token
    const text = orderStatusMessage({
      semantic: order.status_semantic,
      orderNumber: order.order_number,
      deliveryType: order.delivery_type,
      customerName: order.customer_name,
      trackingUrl: company?.order_enable_tracking !== false && token ? `${getAppBaseUrl()}/tracking/${token}` : null,
      estimatedReadyAt: order.estimated_ready_at,
    })
    if (!text) return NextResponse.json({ ok: true, notified: false, reason: 'not_notified_status' })

    const { data: lastIn } = await supabase
      .from('messages')
      .select('created_at')
      .eq('company_id', order.company_id)
      .eq('patient_id', phone)
      .eq('sender', 'patient')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!insideServiceWindow(lastIn?.created_at)) {
      return NextResponse.json({ ok: true, notified: false, reason: 'window' })
    }

    if (!company?.business_phone_id || !company?.system_user_access_token) {
      return NextResponse.json({ ok: true, notified: false, reason: 'no_whatsapp' })
    }
    const sent = await postGraphMessage(
      `${GRAPH}/${company.business_phone_id}/messages`,
      company.system_user_access_token,
      { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } },
    )
    if (!sent.ok) {
      console.error('[orders/status] Meta rechazó el aviso:', sent.error)
      return NextResponse.json({ ok: true, notified: false, reason: 'send_failed', error: sent.error })
    }

    await supabase.from('messages').insert({
      company_id: order.company_id,
      patient_id: phone,
      content: text,
      sender: 'admin',
      message_type: 'text',
      channel: 'whatsapp',
    })

    return NextResponse.json({ ok: true, notified: true })
  } catch (error) {
    console.error('[orders/status] Error:', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
