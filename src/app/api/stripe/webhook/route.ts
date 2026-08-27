 

import { NextResponse } from 'next/server'
import { stripe } from '../../../../lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformBranding } from '../../../../lib/siteSettings'  
// ============================================================================
// POST /api/stripe/webhook
// ----------------------------------------------------------------------------
// Webhook unificado  2.0. Maneja:
//
// PLAN BASE (Start / Growth / Scale):
//   - checkout.session.completed        → activar plan
//   - customer.subscription.deleted     → bloquear cuenta
//   - customer.subscription.updated     → cambio de plan
//   - invoice.payment_succeeded         → renovación exitosa
//   - invoice.payment_failed            → bloquear cuenta
//
// ADDONS:
//   - checkout.session.completed (subscription o payment) → activate_addon
//   - customer.subscription.deleted (sub de addon)        → cancel_addon
//
// El metadata.checkoutType discrimina entre 'plan' y 'addon'.
// ============================================================================
  const branding = await loadPlatformBranding()
  const brandName = branding.name || 'Plataforma' 
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('Stripe-Signature') as string

  let event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error: any) {
    console.error('[Webhook] Signature verification failed:', error.message)
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 })
  }

  const obj = event.data.object as any

  try {
    switch (event.type) {

      // ──────────────────────────────────────────────────────────────
      // CHECKOUT COMPLETADO
      // ──────────────────────────────────────────────────────────────
      case 'checkout.session.completed': {
        const checkoutType = obj.metadata?.checkoutType
        const companyId    = obj.metadata?.companyId

        if (!companyId) {
          console.warn('[Webhook] checkout.session.completed sin companyId')
          break
        }

        // ── PLAN BASE ──
        if (checkoutType === 'plan') {
          const subscriptionId = obj.subscription
          const planSlug       = obj.metadata?.planSlug
          const billingMode    = obj.metadata?.billingMode || 'monthly'

          // Traer la subscription completa de Stripe para conocer su status real
          // (puede ser 'trialing' si checkout incluyó trial_period_days)
          let subscriptionStatus = 'active'
          let trialEndsAt: string | null = null
          let currentPeriodEndsAt: string | null = null

          if (subscriptionId) {
            try {
              const sub = await stripe.subscriptions.retrieve(subscriptionId)
              subscriptionStatus = sub.status === 'trialing' ? 'trialing'
                                 : sub.status === 'active'   ? 'active'
                                 : sub.status === 'past_due' ? 'past_due'
                                 : sub.status === 'canceled' ? 'canceled'
                                 : sub.status
              if (sub.trial_end) {
                trialEndsAt = new Date(sub.trial_end * 1000).toISOString()
              }
              if ((sub as any).current_period_end) {
                currentPeriodEndsAt = new Date((sub as any).current_period_end * 1000).toISOString()
              }
            } catch (e: any) {
              console.warn('[Webhook] No se pudo leer subscription de Stripe:', e.message)
            }
          }

          await supabaseAdmin
            .from('companies')
            .update({
              stripe_subscription_id: subscriptionId,
              plan_slug: planSlug,
              selected_plan_slug: planSlug,
              subscription_status: subscriptionStatus,
              account_status: subscriptionStatus === 'canceled' ? 'expired' : 'active',
              billing_cycle: billingMode,
              ...(trialEndsAt ? { trial_ends_at: trialEndsAt } : {}),
              ...(currentPeriodEndsAt ? { current_period_ends_at: currentPeriodEndsAt } : {}),
              subscription_started_at: new Date().toISOString()
            })
            .eq('id', companyId)

          console.log(`[Webhook] Plan ${planSlug} → ${subscriptionStatus} para company ${companyId}`)
        }

        // ── ADDON ──
        if (checkoutType === 'addon') {
          const addonId         = obj.metadata?.addonId
          const isOneTime       = obj.metadata?.isOneTime === 'true'
          const subscriptionId  = obj.subscription              // null si es one-time

          // Si es recurrente: el subscription item es el line item de la sub
          let subscriptionItemId: string | null = null
          if (!isOneTime && subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            subscriptionItemId = sub.items.data[0]?.id || null
          }

          // Activar addon vía RPC
          await supabaseAdmin.rpc('activate_addon', {
            p_company_id: companyId,
            p_addon_id: addonId,
            p_quantity: 1,
            p_stripe_subscription_item_id: subscriptionItemId,
            p_stripe_checkout_session_id: obj.id
          })

          // Si es one-time, marcar también el invoice id
          if (isOneTime && obj.invoice) {
            await supabaseAdmin
              .from('company_addons')
              .update({ stripe_invoice_id: obj.invoice })
              .eq('company_id', companyId)
              .eq('addon_id', addonId)
          }

          console.log(`[Webhook] Addon ${addonId} activado para company ${companyId}`)
        }
        break
      }

      // ──────────────────────────────────────────────────────────────
      // SUBSCRIPCIÓN CANCELADA (puede ser plan o addon)
      // ──────────────────────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscriptionId = obj.id
        const meta = obj.metadata || {}
        const checkoutType = meta.checkoutType

        if (checkoutType === 'addon') {
          // Cancelar addon
          await supabaseAdmin
            .from('company_addons')
            .update({
              status: 'canceled',
              canceled_at: new Date().toISOString()
            })
            .eq('stripe_subscription_item_id', obj.items?.data?.[0]?.id || '')
        } else {
          // Plan base — bloquear cuenta
          await supabaseAdmin
            .from('companies')
            .update({
              subscription_status: 'inactive',
              account_status: 'expired'
            })
            .eq('stripe_subscription_id', subscriptionId)
        }
        break
      }

      // ──────────────────────────────────────────────────────────────
      // SUBSCRIPCIÓN ACTUALIZADA (cambio de plan, upgrade, downgrade)
      // ──────────────────────────────────────────────────────────────
      case 'customer.subscription.updated': {
        const meta = obj.metadata || {}
        const checkoutType = meta.checkoutType

        if (checkoutType === 'plan') {
          const newPlanSlug = meta.planSlug

          // Status normalizado a nuestro enum
          const statusMap: Record<string, string> = {
            trialing: 'trialing',
            active:   'active',
            past_due: 'past_due',
            canceled: 'canceled',
            unpaid:   'past_due',
            paused:   'paused'
          }
          const normalizedStatus = statusMap[obj.status] || obj.status

          const updates: any = {
            subscription_status: normalizedStatus,
            account_status: normalizedStatus === 'canceled' || normalizedStatus === 'expired' ? 'expired' : 'active'
          }

          if (newPlanSlug) {
            updates.plan_slug = newPlanSlug
            updates.selected_plan_slug = newPlanSlug
          }

          if (obj.trial_end) {
            updates.trial_ends_at = new Date(obj.trial_end * 1000).toISOString()
          }
          if (obj.current_period_end) {
            updates.current_period_ends_at = new Date(obj.current_period_end * 1000).toISOString()
          }

          await supabaseAdmin
            .from('companies')
            .update(updates)
            .eq('stripe_subscription_id', obj.id)
        }

        if (checkoutType === 'addon') {
          const subItemId = obj.items?.data?.[0]?.id
          await supabaseAdmin
            .from('company_addons')
            .update({
              status: obj.status === 'active' ? 'active' : obj.status === 'past_due' ? 'past_due' : 'canceled',
              current_period_end: obj.current_period_end
                ? new Date(obj.current_period_end * 1000).toISOString()
                : null
            })
            .eq('stripe_subscription_item_id', subItemId)
        }
        break
      }

      // ──────────────────────────────────────────────────────────────
      // RENOVACIÓN EXITOSA
      // ──────────────────────────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const subscriptionId = obj.subscription
        if (!subscriptionId) break

        await supabaseAdmin
          .from('companies')
          .update({
            subscription_status: 'active',
            account_status: 'active'
          } as never)
          .eq('stripe_subscription_id', subscriptionId)

        // ── Sprint G: crear invoice draft (CFDI México) ──
        // Buscar la company y crear draft de invoice si no existe ya para este pago.
        // El draft se queda en status 'draft' hasta que el admin (o un cron) lo timbre
        // con el PAC contratado. Si PAC no está configurado, simplemente queda registrado.
        try {
          const { data: company } = await supabaseAdmin
            .from('companies')
            .select('id, name')
            .eq('stripe_subscription_id', subscriptionId)
            .maybeSingle() as { data: any | null }

          if (company?.id && obj.id) {
            // Stripe entrega los montos en centavos USD-like (no MXN cents)
            // En MX, Stripe usa MXN con escala normal (1 MXN = 100 centavos)
            // obj.amount_paid viene ya en la unidad mínima de la moneda
            const totalCents = obj.amount_paid ?? obj.total ?? 0
            const currency   = (obj.currency || 'mxn').toUpperCase()

            // Calcular subtotal e IVA asumiendo que el precio cobrado incluye IVA
            // (esto es lo normal en MX). Si quieres precios pre-IVA, ajusta aquí.
            const subtotalCents = Math.round(totalCents / 1.16)
            const ivaCents      = totalCents - subtotalCents

            const description = obj.lines?.data?.[0]?.description
              || obj.description
              || `Suscripción  {brandName} - ${company.name || 'Plan'}`

            const periodStart = obj.lines?.data?.[0]?.period?.start
              ? new Date(obj.lines.data[0].period.start * 1000).toISOString()
              : null
            const periodEnd = obj.lines?.data?.[0]?.period?.end
              ? new Date(obj.lines.data[0].period.end * 1000).toISOString()
              : null

            await (supabaseAdmin.rpc as any)('create_invoice_draft_from_stripe', {
              p_company_id:            company.id,
              p_stripe_invoice_id:     obj.id,
              p_stripe_payment_intent: obj.payment_intent || null,
              p_subtotal_cents:        subtotalCents,
              p_iva_cents:             ivaCents,
              p_total_cents:           totalCents,
              p_currency:              currency,
              p_description:           description,
              p_billing_period_start:  periodStart,
              p_billing_period_end:    periodEnd,
              p_emisor_rfc:            process.env.EMISOR_RFC          || null,
              p_emisor_legal_name:     process.env.EMISOR_LEGAL_NAME   || null,
              p_emisor_regime_code:    process.env.EMISOR_REGIME       || null,
              p_emisor_zip:            process.env.EMISOR_ZIP          || null,
              p_sat_product_code:      '81111508',  // SaaS
              p_sat_unit_code:         'E48'         // Unidad de servicio
            })
          }
        } catch (invoiceErr) {
          // Si la creación del invoice falla, NO rompemos el flujo principal de Stripe
          console.error('[Webhook] No se pudo crear invoice draft:', invoiceErr)
        }

        break
      }

      // ──────────────────────────────────────────────────────────────
      // PAGO FALLIDO
      // ──────────────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const subscriptionId = obj.subscription
        if (!subscriptionId) break

        await supabaseAdmin
          .from('companies')
          .update({
            subscription_status: 'past_due',
            account_status: 'expired'
          })
          .eq('stripe_subscription_id', subscriptionId)
        break
      }
    }
  } catch (error: any) {
    console.error('[Webhook] Handler error:', error)
    return new NextResponse('Webhook handler failed', { status: 500 })
  }

  return new NextResponse('OK', { status: 200 })
}
