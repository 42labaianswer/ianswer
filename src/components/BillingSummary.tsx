 

'use client'

// src/components/BillingSummary.tsx
// ----------------------------------------------------------------------------
// Sprint U · Resumen de facturación: próximo pago (plan + addons) + gestión.
//
// Muestra:
//   - El desglose del próximo cobro: plan base + cada addon activo
//   - La fecha del próximo pago
//   - Botón para cancelar cada addon (con confirmación)
//   - Botón para cancelar/gestionar el plan (portal de Stripe)
// ----------------------------------------------------------------------------

import { useState } from 'react'
import {
  CreditCard, Calendar, Puzzle, X, Loader2, ExternalLink, AlertTriangle,
} from 'lucide-react'
import { getIcon } from '../lib/iconMap'
import { useActiveAddonsDetailed, useCancelAddon, useCancelPlan } from '../hooks/useBilling'

function formatMoney(cents: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(cents / 100)
}

export default function BillingSummary({
  companyId,
  planName,
  planPriceCents,
  planCurrency = 'MXN',
  nextPaymentDate,
  billingCycle = 'monthly',
  accentColor = '#4f46e5',
  stripeCustomerId = null,
}: {
  companyId: string
  planName: string
  planPriceCents: number
  planCurrency?: string
  nextPaymentDate: string | null
  billingCycle?: string
  accentColor?: string
  // Si es null, el plan actual fue asignado manualmente por un admin (o por el
  // onboarding automático) sin pasar por Stripe — no hay nada que gestionar/
  // cancelar en el portal de Stripe. Ver diagnóstico del P1 de Stripe, semana 4.
  stripeCustomerId?: string | null
}) {
  const { data: addons = [], isLoading } = useActiveAddonsDetailed(companyId)
  const cancelAddon = useCancelAddon()
  const cancelPlan = useCancelPlan()

  const [confirmingAddon, setConfirmingAddon] = useState<string | null>(null)
  const [confirmingPlan, setConfirmingPlan] = useState(false)

  const recurringAddons = addons.filter((a) => a.is_recurring)
  const addonsTotal = recurringAddons.reduce((sum, a) => sum + a.price_monthly_cents, 0)
  const grandTotal = planPriceCents + addonsTotal

  const nextDate = nextPaymentDate
    ? new Date(nextPaymentDate).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: accentColor }}>
          <CreditCard size={17} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Próximo pago</h3>
          {nextDate && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Calendar size={11} /> {nextDate}
            </p>
          )}
        </div>
      </div>

      {/* Desglose */}
      <div className="px-6 py-4 space-y-3">
        {/* Plan base */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">Plan {planName}</p>
            <p className="text-[11px] text-slate-400">{billingCycle === 'yearly' ? 'Anual' : 'Mensual'}</p>
          </div>
          <p className="text-sm font-bold text-slate-900">{formatMoney(planPriceCents, planCurrency)}</p>
        </div>

        {/* Addons */}
        {isLoading ? (
          <div className="py-2"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
        ) : recurringAddons.length > 0 ? (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Addons</p>
            {recurringAddons.map((addon) => {
              const Icon = getIcon(addon.icon)
              return (
                <div key={addon.addon_id} className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 shrink-0">
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{addon.name}</p>
                  </div>
                  <p className="text-sm font-medium text-slate-700">{formatMoney(addon.price_monthly_cents, addon.currency)}</p>
                  {confirmingAddon === addon.addon_id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setConfirmingAddon(null)}
                        className="text-[10px] font-bold text-slate-500 px-2 py-1 hover:bg-slate-100 rounded"
                      >
                        No
                      </button>
                      <button
                        onClick={() => {
                          cancelAddon.mutate({ companyId, addonId: addon.addon_id })
                          setConfirmingAddon(null)
                        }}
                        disabled={cancelAddon.isPending}
                        className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingAddon(addon.addon_id)}
                      className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                      title="Cancelar addon"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}

        {/* Total */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200">
          <p className="text-base font-black text-slate-900">Total</p>
          <p className="text-base font-black text-slate-900">
            {formatMoney(grandTotal, planCurrency)}
            <span className="text-xs font-medium text-slate-400">/{billingCycle === 'yearly' ? 'año' : 'mes'}</span>
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="px-6 py-4 border-t border-slate-100 space-y-2">
        {!stripeCustomerId ? (
          <p className="text-xs text-slate-500 font-medium bg-slate-50 border border-slate-200 rounded-xl p-3">
            Este plan fue asignado manualmente (sin pasar por Stripe), así que no hay una
            suscripción que gestionar o cancelar aquí. Para cambiarlo, pide a un admin que
            te asigne otro plan, o contrata uno pagando desde esta página.
          </p>
        ) : (
          <>
            <button
              onClick={() => cancelPlan.mutate(companyId)}
              disabled={cancelPlan.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors"
            >
              {cancelPlan.isPending ? <Loader2 size={15} className="animate-spin" /> : <><ExternalLink size={14} /> Gestionar suscripción</>}
            </button>

            {confirmingPlan ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-800 font-medium">
                    Cancelar el plan detiene tu servicio al fin del periodo. Tus datos se conservan.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmingPlan(false)} className="flex-1 py-2 text-xs font-bold text-slate-600 bg-white rounded-lg border border-slate-200">
                    Mantener
                  </button>
                  <button
                    onClick={() => cancelPlan.mutate(companyId)}
                    className="flex-1 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                  >
                    Cancelar plan
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingPlan(true)}
                className="w-full py-2 text-xs font-medium text-slate-400 hover:text-red-500 transition-colors"
              >
                Cancelar plan
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
