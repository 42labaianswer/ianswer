 

// ============================================================================
// src/app/api/invoices/preview/route.ts
// ----------------------------------------------------------------------------
// Preview de cálculo de IVA dado un subtotal. Útil para mostrar al cliente
// en checkout "Vas a pagar $1,000 + IVA = $1,160" antes de confirmar.
// ============================================================================

import { NextResponse } from 'next/server'
import { calculateIVA, reverseCalculateIVA, formatCurrency } from '../../../../lib/invoicing'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ success: false, error: 'Body inválido' }, { status: 400 })
    }

    const subtotalCents: number | undefined = body.subtotal_cents
    const totalCents:    number | undefined = body.total_cents
    const currency:      string             = body.currency || 'MXN'

    if (subtotalCents === undefined && totalCents === undefined) {
      return NextResponse.json(
        { success: false, error: 'Provide subtotal_cents or total_cents' },
        { status: 400 }
      )
    }

    const result = subtotalCents !== undefined
      ? calculateIVA(subtotalCents)
      : reverseCalculateIVA(totalCents!)

    return NextResponse.json({
      success: true,
      ...result,
      formatted: {
        subtotal: formatCurrency(result.subtotalCents, currency),
        iva:      formatCurrency(result.ivaCents, currency),
        total:    formatCurrency(result.totalCents, currency)
      },
      currency,
      iva_rate: 0.16
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Error inesperado', details: err?.message },
      { status: 500 }
    )
  }
}
