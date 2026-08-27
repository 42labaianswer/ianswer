// ============================================================================
// src/app/api/invoices/[id]/cancel/route.ts
// ----------------------------------------------------------------------------
// Cancela una invoice timbrada ante el SAT.
//
// Razones de cancelación:
//   01 - Comprobante emitido con errores con relación
//   02 - Comprobante emitido con errores sin relación
//   03 - No se llevó a cabo la operación
//   04 - Operación nominativa relacionada en una factura global
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getPACProvider } from '../../../../../lib/invoicing'

export const dynamic = 'force-dynamic'

const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY         = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: invoiceId } = await context.params

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ success: false, error: 'Servidor mal configurado' }, { status: 500 })
    }

    const body = await req.json().catch(() => ({}))
    const reason: string = body.reason || '02'
    const substituteUuid: string | undefined = body.substitute_uuid

    // ── Auth ──
    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      SUPABASE_URL, SUPABASE_ANON_KEY,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } }
    )
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── Cargar la invoice ──
    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle() as { data: any | null }

    if (!invoice) return NextResponse.json({ success: false, error: 'Invoice no encontrada' }, { status: 404 })
    if (invoice.status !== 'stamped') {
      return NextResponse.json({
        success: false,
        error:   `Solo se pueden cancelar invoices en status 'stamped'. Status actual: ${invoice.status}`
      }, { status: 400 })
    }
    if (!invoice.cfdi_uuid) {
      return NextResponse.json({ success: false, error: 'Invoice sin UUID' }, { status: 400 })
    }

    const pac = getPACProvider()
    if (!pac.isConfigured()) {
      return NextResponse.json({ success: false, error: 'PAC no configurado' }, { status: 503 })
    }

    const result = await pac.cancelInvoice(invoice.cfdi_uuid, reason, substituteUuid)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 })
    }

    await supabaseAdmin
      .from('invoices')
      .update({
        status:                    'cancelled',
        cancelled_at:              new Date().toISOString(),
        cancellation_reason:       reason,
        cancellation_substitute_uuid: substituteUuid || null
      } as any)
      .eq('id', invoiceId)

    return NextResponse.json({ success: true, message: 'Invoice cancelada' })

  } catch (err: any) {
    console.error('[InvoiceCancelError]', err)
    return NextResponse.json({
      success: false,
      error:   'Error inesperado',
      details: err?.message
    }, { status: 500 })
  }
}