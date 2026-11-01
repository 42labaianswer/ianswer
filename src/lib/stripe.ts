 

import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is missing. Please set the environment variable.')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true
})

// Tasa de impuesto "IVA 16%" de Stripe, exclusiva: los precios de planes y
// complementos no incluyen IVA y Stripe lo suma al cobrar ($1,500 + IVA).
// Hay una por modo (sandbox y live), cada una con su id en la variable.
const IVA_TAX_RATE_ID = process.env.STRIPE_IVA_TAX_RATE_ID

/** Tasas que se aplican a cada cobro; vacío si falta configurar la variable. */
export function ivaTaxRates(): string[] {
  if (!IVA_TAX_RATE_ID) {
    console.warn('[Stripe] Falta STRIPE_IVA_TAX_RATE_ID: se cobrará sin IVA.')
    return []
  }
  return [IVA_TAX_RATE_ID]
}
