// ============================================================================
// src/lib/iva.ts  (solo servidor)
// ----------------------------------------------------------------------------
// IVA de los cobros de Stripe. Los precios de planes y complementos no incluyen
// IVA: Stripe lo suma al cobrar con una tasa de impuesto exclusiva del 16 %
// ($1,500 + IVA = $1,740). Hay una tasa por modo (sandbox y live), cada una con
// su id en STRIPE_IVA_TAX_RATE_ID.
// ============================================================================

export const IVA = 0.16

/** Tasas que se aplican a cada cobro; vacío si falta configurar la variable. */
export function ivaTaxRates(): string[] {
  const id = process.env.STRIPE_IVA_TAX_RATE_ID
  if (!id) {
    console.warn('[Stripe] Falta STRIPE_IVA_TAX_RATE_ID: se cobrará sin IVA.')
    return []
  }
  return [id]
}

/**
 * Subtotal e IVA de un cobro para el CFDI. Con la tasa de IVA, la factura de
 * Stripe trae el subtotal sin impuesto (total_excluding_tax). Las suscripciones
 * creadas antes de la tasa no lo separan: ahí el total se toma como IVA incluido.
 */
export function desgloseIva(
  totalCents: number,
  totalExcludingTaxCents: number | null | undefined
): { subtotalCents: number; ivaCents: number } {
  const subtotalCents = totalExcludingTaxCents != null && totalExcludingTaxCents < totalCents
    ? totalExcludingTaxCents
    : Math.round(totalCents / (1 + IVA))
  return { subtotalCents, ivaCents: totalCents - subtotalCents }
}
