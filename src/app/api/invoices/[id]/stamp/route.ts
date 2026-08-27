// ============================================================================
// src/app/api/invoices/[id]/stamp/route.ts
// ----------------------------------------------------------------------------
// Timbra una invoice en estado 'draft' o 'errored'.
//
// HOY (sin PAC configurado): retorna error "PAC no configurado".
// MAÑANA: cambia PAC_PROVIDER en .env → este endpoint timbra real.
//
// Sólo admins de la company pueden timbrar.
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

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: invoiceId } = await context.params

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ success: false, error: 'Servidor mal configurado' }, { status: 500 })
    }

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

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice no encontrada' }, { status: 404 })
    }

    if (invoice.status === 'stamped') {
      return NextResponse.json({
        success: false,
        error:   'Invoice ya está timbrada',
        cfdi_uuid: invoice.cfdi_uuid
      }, { status: 400 })
    }

    if (invoice.receptor_rfc === 'XAXX010101000' && invoice.receptor_legal_name === 'PÚBLICO EN GENERAL') {
      return NextResponse.json({
        success: false,
        error:   'El cliente no tiene datos fiscales capturados. Pide que los capture en /dashboard/billing/datos-fiscales'
      }, { status: 400 })
    }

    if (!invoice.emisor_rfc || invoice.emisor_rfc === 'PENDING') {
      return NextResponse.json({
        success: false,
        error:   'Datos fiscales del emisor (iAnswer) no configurados. Configura EMISOR_* en .env'
      }, { status: 500 })
    }

    // ── Llamar al PAC ──
    const pac = getPACProvider()
    if (!pac.isConfigured()) {
      return NextResponse.json({
        success: false,
        error:   'PAC no configurado. Configura PAC_PROVIDER + credenciales en .env'
      }, { status: 503 })
    }

    // Marcar como pending_stamp mientras se procesa
    await supabaseAdmin
      .from('invoices')
      .update({ status: 'pending_stamp' } as any)
      .eq('id', invoiceId)

    const result = await pac.stampInvoice({
      invoiceId:     invoice.id,
      invoiceNumber: invoice.invoice_number,
      emisor: {
        rfc:        invoice.emisor_rfc,
        legalName:  invoice.emisor_legal_name,
        regimeCode: invoice.emisor_regime_code,
        zip:        invoice.emisor_zip
      },
      receptor: {
        rfc:        invoice.receptor_rfc,
        legalName:  invoice.receptor_legal_name,
        regimeCode: invoice.receptor_regime_code || '',
        zip:        invoice.receptor_zip || '',
        useCfdi:    invoice.receptor_use_cfdi,
        email:      invoice.receptor_email
      },
      items:         invoice.items || [],
      subtotalCents: invoice.subtotal_cents,
      ivaCents:      invoice.iva_cents,
      totalCents:    invoice.total_cents,
      currency:      invoice.currency,
      formaPago:     invoice.forma_pago || '04',
      metodoPago:    invoice.metodo_pago || 'PUE'
    })

    if (!result.success) {
      await supabaseAdmin
        .from('invoices')
        .update({
          status:        'errored',
          error_message: result.error || 'Error desconocido del PAC'
        } as any)
        .eq('id', invoiceId)

      return NextResponse.json({
        success: false,
        error:   result.error
      }, { status: 502 })
    }

    // ── Guardar resultado del PAC ──
    await supabaseAdmin
      .from('invoices')
      .update({
        status:           'stamped',
        cfdi_uuid:        result.uuid,
        cfdi_xml_url:     result.xmlUrl,
        cfdi_pdf_url:     result.pdfUrl,
        cfdi_xml_raw:     result.xmlRaw,
        cfdi_stamped_at:  result.stampedAt?.toISOString() || new Date().toISOString(),
        pac_provider:     result.pacProvider,
        pac_external_id:  result.pacExternalId,
        error_message:    null
      } as any)
      .eq('id', invoiceId)

    return NextResponse.json({
      success:    true,
      uuid:       result.uuid,
      xml_url:    result.xmlUrl,
      pdf_url:    result.pdfUrl
    })

  } catch (err: any) {
    console.error('[InvoiceStampError]', err)
    return NextResponse.json({
      success: false,
      error:   'Error inesperado',
      details: err?.message
    }, { status: 500 })
  }
}