import { NextResponse, after } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '../../../../lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { loadPlatformBranding } from '../../../../lib/siteSettings'
import {
  applyPlanSubscription, customerContact, invoiceSubscriptionId, toIso
} from '../../../../lib/stripePlan'
import { getAppBaseUrl } from '../../../../lib/appUrl'
import { sendEmail } from '../../../../lib/resend'
import {
  buildPaymentFailedEmail, buildSubscriptionCanceledEmail, buildTrialEndingEmail
} from '../../../../lib/emails/subscription-emails'

// ============================================================================
// POST /api/stripe/webhook
// ----------------------------------------------------------------------------
// Webhook unificado v3.0 (plan-agente-semana04, sección 4 + 4.4). Maneja:
//
// PLAN BASE (Start / Growth / Scale) — el plan y la prueba SOLO se escriben aquí
// (y en api/stripe/confirm-checkout, con la misma lógica de lib/stripePlan.ts):
//   - checkout.session.completed            → activar plan / iniciar prueba
//   - customer.subscription.updated         → cambio de estado o de plan
//   - customer.subscription.deleted         → 'canceled' (+ correo)
//   - customer.subscription.trial_will_end  → correo "tu prueba termina en 3 días"
//   - invoice.payment_succeeded             → renovación (+ borrador CFDI)
//   - invoice.payment_failed                → 'past_due' (+ correo)
//
// ADDONS:
//   - checkout.session.completed (subscription o payment) → activate_addon
//   - customer.subscription.deleted/updated (sub de addon) → cancel / status
//
// El metadata.checkoutType discrimina entre 'plan' y 'addon'.
//
// Versión de API 2026-04-22.dahlia: la factura ya no trae `subscription` en la
// raíz (ahora invoice.parent.subscription_details.subscription) — antes de este
// cambio, payment_succeeded/payment_failed llegaban pero no hacían nada.
// Eventos suscritos en Stripe (destino ianswer.pro): los 6 de arriba.
// ============================================================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type CompanyRow = { id: string, name: string | null, plan_slug: string | null }

async function companyBySubscription(subscriptionId: string): Promise<CompanyRow | null> {
  const { data } = await supabaseAdmin
    .from('companies')
    .select('id, name, plan_slug')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle()
  return (data as CompanyRow | null) || null
}

async function planName(slug: string | null | undefined): Promise<string> {
  if (!slug) return 'iAnswer'
  const { data } = await supabaseAdmin.from('plans').select('name').eq('slug', slug).maybeSingle()
  return data?.name || slug
}

function formatAmount(cents: number | null | undefined, currency: string | null | undefined): string | null {
  if (!cents) return null
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: (currency || 'mxn').toUpperCase(), maximumFractionDigits: 2,
  }).format(cents / 100)
}

/** Manda un aviso por Resend después de responder a Stripe. Nunca rompe el webhook. */
function sendAfter(kind: string, build: () => Promise<{ to: string | null, subject: string, html: string, text: string } | null>) {
  after(async () => {
    try {
      const msg = await build()
      if (!msg?.to) { console.warn(`[Webhook] ${kind}: sin correo de destino, no se envía`); return }
      const res = await sendEmail({
        to: msg.to, subject: msg.subject, html: msg.html, text: msg.text,
        tags: [{ name: 'category', value: 'billing' }, { name: 'type', value: kind }],
      })
      if (res.error) console.error(`[Webhook] ${kind}: Resend falló:`, res.error)
      else console.log(`[Webhook] ${kind}: correo enviado a ${msg.to} (${res.id})`)
    } catch (e) {
      console.error(`[Webhook] ${kind}: no se pudo enviar el correo:`, e)
    }
  })
}

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('Stripe-Signature') as string

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (error: any) {
    console.error('[Webhook] Signature verification failed:', error.message)
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 })
  }

  const plansUrl = `${getAppBaseUrl()}/dashboard/plans`
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
        if (checkoutType === 'plan' && obj.subscription) {
          const subId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId)
          const { normalized, planSlug } = await applyPlanSubscription(supabaseAdmin, sub, { companyId, markStarted: true })
          console.log(`[Webhook] Plan ${planSlug} → ${normalized} para company ${companyId}`)
        }

        // ── ADDON ──
        if (checkoutType === 'addon') {
          const addonId         = obj.metadata?.addonId
          const isOneTime       = obj.metadata?.isOneTime === 'true'
          const subscriptionId  = obj.subscription              // null si es one-time

          let subscriptionItemId: string | null = null
          if (!isOneTime && subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId)
            subscriptionItemId = sub.items.data[0]?.id || null
          }

          await supabaseAdmin.rpc('activate_addon', {
            p_company_id: companyId,
            p_addon_id: addonId,
            p_quantity: 1,
            p_stripe_subscription_item_id: subscriptionItemId,
            p_stripe_checkout_session_id: obj.id
          })

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
      // SUSCRIPCIÓN CANCELADA (plan o addon)
      // ──────────────────────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = obj as Stripe.Subscription
        if (sub.metadata?.checkoutType === 'addon') {
          await supabaseAdmin
            .from('company_addons')
            .update({ status: 'canceled', canceled_at: new Date().toISOString() })
            .eq('stripe_subscription_item_id', sub.items?.data?.[0]?.id || '')
          break
        }

        // Plan base. Antes escribía 'inactive', que no bloqueaba el dashboard.
        const company = await companyBySubscription(sub.id)
        await supabaseAdmin
          .from('companies')
          .update({ subscription_status: 'canceled', account_status: 'expired' })
          .eq('stripe_subscription_id', sub.id)

        sendAfter('subscription_canceled', async () => {
          const { email } = await customerContact(stripe, sub.customer)
          return email ? {
            to: email,
            ...buildSubscriptionCanceledEmail({ recipientEmail: email, planName: await planName(company?.plan_slug), plansUrl }),
          } : null
        })
        break
      }

      // ──────────────────────────────────────────────────────────────
      // SUSCRIPCIÓN ACTUALIZADA (estado, upgrade, downgrade)
      // ──────────────────────────────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub = obj as Stripe.Subscription
        const checkoutType = sub.metadata?.checkoutType

        if (checkoutType === 'addon') {
          const subItemId = sub.items?.data?.[0]?.id
          const itemEnd = (sub.items?.data?.[0] as any)?.current_period_end
          await supabaseAdmin
            .from('company_addons')
            .update({
              status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled',
              current_period_end: toIso(itemEnd ?? (sub as any).current_period_end)
            })
            .eq('stripe_subscription_item_id', subItemId)
          break
        }

        // Plan base (con o sin metadata: las suscripciones creadas antes del
        // cambio también tienen checkoutType 'plan').
        await applyPlanSubscription(supabaseAdmin, sub)
        break
      }

      // ──────────────────────────────────────────────────────────────
      // LA PRUEBA TERMINA EN 3 DÍAS
      // ──────────────────────────────────────────────────────────────
      case 'customer.subscription.trial_will_end': {
        const sub = obj as Stripe.Subscription
        if (sub.metadata?.checkoutType === 'addon') break
        const company = await companyBySubscription(sub.id)

        sendAfter('trial_will_end', async () => {
          const { email } = await customerContact(stripe, sub.customer)
          return email ? {
            to: email,
            ...buildTrialEndingEmail({
              recipientEmail: email,
              planName: await planName(company?.plan_slug || sub.metadata?.planSlug),
              plansUrl,
              trialEndsAt: toIso(sub.trial_end),
            }),
          } : null
        })
        break
      }

      // ──────────────────────────────────────────────────────────────
      // PAGO EXITOSO (renovación)
      // ──────────────────────────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = obj as Stripe.Invoice
        const subscriptionId = invoiceSubscriptionId(invoice)
        if (!subscriptionId) break

        // La factura de $0 que Stripe emite al iniciar la prueba NO es un pago:
        // antes pisaba 'trialing' con 'active' y creaba un CFDI de $0.
        const totalCents = invoice.amount_paid ?? invoice.total ?? 0
        if (totalCents <= 0) break

        await supabaseAdmin
          .from('companies')
          .update({ subscription_status: 'active', account_status: 'active' } as never)
          .eq('stripe_subscription_id', subscriptionId)

        // ── Sprint G: crear invoice draft (CFDI México) ──
        // El draft se queda en status 'draft' hasta que el admin (o un cron) lo
        // timbre con el PAC contratado.
        try {
          const company = await companyBySubscription(subscriptionId)
          if (company?.id && invoice.id) {
            const branding = await loadPlatformBranding()
            const brandName = branding.name || 'Plataforma'
            const currency = (invoice.currency || 'mxn').toUpperCase()

            // El precio cobrado incluye IVA (lo normal en MX).
            const subtotalCents = Math.round(totalCents / 1.16)
            const ivaCents      = totalCents - subtotalCents

            const line = invoice.lines?.data?.[0]
            const description = line?.description
              || invoice.description
              || `Suscripción ${brandName} - ${company.name || 'Plan'}`

            const paymentIntent =
              (invoice as any).payments?.data?.[0]?.payment?.payment_intent
              ?? (invoice as any).payment_intent
              ?? null

            await (supabaseAdmin.rpc as any)('create_invoice_draft_from_stripe', {
              p_company_id:            company.id,
              p_stripe_invoice_id:     invoice.id,
              p_stripe_payment_intent: typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id || null,
              p_subtotal_cents:        subtotalCents,
              p_iva_cents:             ivaCents,
              p_total_cents:           totalCents,
              p_currency:              currency,
              p_description:           description,
              p_billing_period_start:  toIso(line?.period?.start),
              p_billing_period_end:    toIso(line?.period?.end),
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
        const invoice = obj as Stripe.Invoice
        const subscriptionId = invoiceSubscriptionId(invoice)
        if (!subscriptionId) break

        // past_due con account_status 'active': el dashboard da los días de
        // gracia de lib/subscription.ts mientras Stripe reintenta. Si se agotan
        // los reintentos, Stripe cancela → customer.subscription.deleted.
        const company = await companyBySubscription(subscriptionId)
        await supabaseAdmin
          .from('companies')
          .update({ subscription_status: 'past_due', account_status: 'active' })
          .eq('stripe_subscription_id', subscriptionId)

        sendAfter('payment_failed', async () => {
          const { email } = await customerContact(stripe, invoice.customer)
          return email ? {
            to: email,
            ...buildPaymentFailedEmail({
              recipientEmail: email,
              planName: await planName(company?.plan_slug),
              plansUrl,
              amountLabel: formatAmount(invoice.amount_due, invoice.currency),
              nextAttemptAt: toIso(invoice.next_payment_attempt),
            }),
          } : null
        })
        break
      }
    }
  } catch (error: any) {
    console.error('[Webhook] Handler error:', error)
    return new NextResponse('Webhook handler failed', { status: 500 })
  }

  return new NextResponse('OK', { status: 200 })
}
