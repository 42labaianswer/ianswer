 

'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import toast from 'react-hot-toast'
import {
  CreditCard, Save, Loader2, Sparkles, Zap, Crown,
  ExternalLink, AlertCircle, TrendingUp
} from 'lucide-react'
import IAnswerLoader from '../../../../components/IAnswerLoader'

// ============================================================================
// PlansAdminTab v2.26
// ----------------------------------------------------------------------------
// Admin de los 3 planes: Start / Growth / Scale.
// Edita: capacidades, precios, features (texto + flags), stripe price IDs.
// Cambios escriben directo a public.plans (RLS protegida por is_admin).
// ============================================================================

type Plan = {
  slug: string
  tier: 'start' | 'growth' | 'scale'
  name: string
  description: string | null
  price_monthly_cents: number
  price_yearly_cents: number | null
  max_sessions_per_month: number
  max_team_members: number
  max_internal_users: number
  max_channels: number
  max_locations: number
  max_agendas: number
  max_bots: number
  features: string | null
  feature_flags: Record<string, boolean>
  is_active: boolean
  is_legacy: boolean
  display_order: number
  stripe_price_id: string | null
  stripe_price_yearly_id: string | null
}

const KNOWN_FLAGS = [
  'crm_kpis', 'crm_kanban', 'crm_tasks', 'crm_advanced_filters',
  'crm_unified_timeline', 'crm_bulk_actions', 'crm_export_csv',
  'crm_reminders', 'crm_no_show_tracking', 'crm_waitlist',
  'crm_tags_visual', 'crm_tags_ai_aware', 'crm_referral_tracking',
  'crm_retention_metrics',
  'ai_advanced_personality', 'ai_multi_agent_mode',
  'ai_voice_notes', 'ai_image_analysis', 'ai_pdf_wizard',
  'ai_off_topic_wizard', 'ai_premium_model',
  'multi_location_enabled', 'reports_by_location', 'location_aware_routing',
  'team_v2_rich_profiles'
]

const TIER_BADGES: Record<string, { icon: any, color: string }> = {
  start:  { icon: Sparkles, color: 'text-sky-600' },
  growth: { icon: Zap,      color: 'text-violet-600' },
  scale:  { icon: Crown,    color: 'text-amber-600' }
}

function centsToMxn(cents: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(cents / 100)
}

export default function PlansAdminTab() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Plan | null>(null)

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('is_legacy', false)
        .order('display_order')
      if (error) throw error
      return (data || []) as Plan[]
    }
  })

  const updateMutation = useMutation({
    mutationFn: async (plan: Plan) => {
      const { error } = await supabase
        .from('plans')
        .update({
          name: plan.name,
          description: plan.description,
          price_monthly_cents: plan.price_monthly_cents,
          price_yearly_cents: plan.price_yearly_cents,
          max_sessions_per_month: plan.max_sessions_per_month,
          max_team_members: plan.max_team_members,
          max_internal_users: plan.max_internal_users,
          max_channels: plan.max_channels,
          max_locations: plan.max_locations,
          max_agendas: plan.max_agendas,
          max_bots: plan.max_bots,
          features: plan.features,
          feature_flags: plan.feature_flags,
          is_active: plan.is_active,
          display_order: plan.display_order,
          stripe_price_id: plan.stripe_price_id,
          stripe_price_yearly_id: plan.stripe_price_yearly_id,
          updated_at: new Date().toISOString()
        })
        .eq('slug', plan.slug)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Plan actualizado')
      qc.invalidateQueries({ queryKey: ['admin-plans'] })
      qc.invalidateQueries({ queryKey: ['entitlements'] })
      setEditing(null)
    },
    onError: (e: any) => toast.error(e?.message)
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <IAnswerLoader size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 bg-slate-900 text-white rounded-xl flex items-center justify-center">
          <CreditCard size={18} />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Planes</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Edita capacidades, precios y features de los 3 planes Start / Growth / Scale.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map(plan => {
          const tier = TIER_BADGES[plan.tier] || TIER_BADGES.start
          const TierIcon = tier.icon
          const yearlyDiscount = plan.price_yearly_cents
            ? Math.round((1 - (plan.price_yearly_cents / (plan.price_monthly_cents * 12))) * 100)
            : 0
          const stripeOk = !!plan.stripe_price_id && !plan.stripe_price_id.includes('...')

          return (
            <button
              key={plan.slug}
              type="button"
              onClick={() => setEditing(plan)}
              className="text-left p-5 bg-white border-2 border-slate-100 rounded-2xl hover:border-slate-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TierIcon size={18} className={tier.color} />
                  <h3 className="font-black text-slate-900 tracking-tight">{plan.name}</h3>
                </div>
                {!stripeOk && (
                  <AlertCircle size={14} className="text-amber-600" />
                )}
              </div>

              <div className="text-2xl font-black text-slate-900 mb-1">
                {centsToMxn(plan.price_monthly_cents)}
                <span className="text-xs text-slate-500 font-bold">/mes</span>
              </div>
              {yearlyDiscount > 0 && (
                <div className="text-[10px] font-bold text-emerald-700 mb-3">
                  Anual: {centsToMxn(plan.price_yearly_cents!)} (-{yearlyDiscount}%)
                </div>
              )}

              <div className="text-xs text-slate-500 font-medium space-y-1 mt-3 pt-3 border-t border-slate-100">
                <div className="flex justify-between"><span>Conversaciones:</span><strong className="text-slate-900">{plan.max_sessions_per_month.toLocaleString('es-MX')}</strong></div>
                <div className="flex justify-between"><span>Usuarios:</span><strong className="text-slate-900">{plan.max_team_members}</strong></div>
                <div className="flex justify-between"><span>Canales:</span><strong className="text-slate-900">{plan.max_channels}</strong></div>
                <div className="flex justify-between"><span>Sucursales:</span><strong className="text-slate-900">{plan.max_locations}</strong></div>
              </div>

              {!stripeOk && (
                <p className="mt-3 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded">
                  Stripe price ID pendiente
                </p>
              )}
            </button>
          )
        })}
      </div>

      {editing && (
        <EditPlanSheet
          plan={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => updateMutation.mutate(p)}
          saving={updateMutation.isPending}
        />
      )}
    </div>
  )
}

// ============================================================================
// EditPlanSheet
// ============================================================================
function EditPlanSheet({
  plan,
  onClose,
  onSave,
  saving
}: {
  plan: Plan
  onClose: () => void
  onSave: (p: Plan) => void
  saving: boolean
}) {
  const [draft, setDraft] = useState<Plan>(plan)
  const [flagInput, setFlagInput] = useState({ key: '', value: true })

  const tier = TIER_BADGES[draft.tier] || TIER_BADGES.start
  const TierIcon = tier.icon
  const yearlyDiscount = draft.price_yearly_cents
    ? Math.round((1 - (draft.price_yearly_cents / (draft.price_monthly_cents * 12))) * 100)
    : 0

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-3xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TierIcon size={22} className={tier.color} />
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">{draft.name}</h3>
              <p className="text-xs text-slate-500 font-medium">slug: {draft.slug} · tier: {draft.tier}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 p-2 rounded-lg hover:bg-slate-100">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ─── Identidad ─── */}
          <Section title="Identidad">
            <Field label="Nombre">
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Descripción">
              <textarea value={draft.description || ''} onChange={e => setDraft({ ...draft, description: e.target.value })} className={inputCls + ' h-20 resize-none'} />
            </Field>
            <Field label="Orden de despliegue">
              <input type="number" value={draft.display_order} onChange={e => setDraft({ ...draft, display_order: parseInt(e.target.value) || 100 })} className={inputCls} />
            </Field>
            <Field label="Activo">
              <Toggle value={draft.is_active} onChange={v => setDraft({ ...draft, is_active: v })} />
            </Field>
          </Section>

          {/* ─── Precios ─── */}
          <Section title="Precios (en centavos MXN)">
            <Field label="Mensual">
              <div className="flex items-center gap-2">
                <input type="number" value={draft.price_monthly_cents} onChange={e => setDraft({ ...draft, price_monthly_cents: parseInt(e.target.value) || 0 })} className={inputCls} />
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">= {centsToMxn(draft.price_monthly_cents)}/mes</span>
              </div>
            </Field>
            <Field label="Anual">
              <div className="flex items-center gap-2">
                <input type="number" value={draft.price_yearly_cents || ''} onChange={e => setDraft({ ...draft, price_yearly_cents: e.target.value ? parseInt(e.target.value) : null })} className={inputCls} placeholder="Opcional" />
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">
                  {draft.price_yearly_cents ? `= ${centsToMxn(draft.price_yearly_cents)}/año` : '—'}
                </span>
              </div>
              {yearlyDiscount > 0 && (
                <p className="text-xs font-bold text-emerald-700 mt-1.5 flex items-center gap-1.5">
                  <TrendingUp size={12} />
                  Descuento anual: {yearlyDiscount}%
                </p>
              )}
            </Field>
          </Section>

          {/* ─── Capacidad ─── */}
          <Section title="Capacidad">
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Conversaciones/mes" value={draft.max_sessions_per_month} onChange={v => setDraft({ ...draft, max_sessions_per_month: v })} />
              <NumField label="Usuarios" value={draft.max_team_members} onChange={v => setDraft({ ...draft, max_team_members: v })} />
              <NumField label="Internos" value={draft.max_internal_users} onChange={v => setDraft({ ...draft, max_internal_users: v })} />
              <NumField label="Canales" value={draft.max_channels} onChange={v => setDraft({ ...draft, max_channels: v })} />
              <NumField label="Sucursales" value={draft.max_locations} onChange={v => setDraft({ ...draft, max_locations: v })} />
              <NumField label="Agendas" value={draft.max_agendas} onChange={v => setDraft({ ...draft, max_agendas: v })} />
              <NumField label="Bots" value={draft.max_bots} onChange={v => setDraft({ ...draft, max_bots: v })} />
            </div>
          </Section>

          {/* ─── Features (texto) ─── */}
          <Section title="Features (texto, una por línea)">
            <textarea
              value={draft.features || ''}
              onChange={e => setDraft({ ...draft, features: e.target.value })}
              className={inputCls + ' h-32 resize-none font-mono text-xs'}
              placeholder={'WhatsApp + 1 canal\nCRM con kanban\n...'}
            />
            <p className="text-xs text-slate-500 font-medium mt-2">
              Estas líneas se muestran en la tarjeta del plan en /dashboard/plans y en la landing.
            </p>
          </Section>

          {/* ─── Feature flags ─── */}
          <Section title="Feature flags activos">
            <p className="text-xs text-slate-500 font-medium mb-3">
              Estos flags se reflejan en `entitlements.features` del frontend. Las apps consumen <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded">useFeature(&apos;clave&apos;)</code>.
            </p>
            <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto border border-slate-200 rounded-xl p-3">
              {KNOWN_FLAGS.map(flag => (
                <label key={flag} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={!!draft.feature_flags[flag]}
                    onChange={(e) => setDraft({ ...draft, feature_flags: { ...draft.feature_flags, [flag]: e.target.checked } })}
                    className="rounded"
                  />
                  <span className="font-mono text-[11px] text-slate-700">{flag}</span>
                </label>
              ))}
            </div>

            {/* Custom flag */}
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="custom_flag_name"
                value={flagInput.key}
                onChange={e => setFlagInput({ ...flagInput, key: e.target.value })}
                className={inputCls + ' font-mono text-xs'}
              />
              <button
                type="button"
                onClick={() => {
                  if (flagInput.key.trim()) {
                    setDraft({ ...draft, feature_flags: { ...draft.feature_flags, [flagInput.key.trim()]: flagInput.value } })
                    setFlagInput({ key: '', value: true })
                  }
                }}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg whitespace-nowrap"
              >
                Añadir
              </button>
            </div>

            {/* Custom flags (no conocidos) que el plan tiene */}
            {Object.keys(draft.feature_flags).filter(k => !KNOWN_FLAGS.includes(k)).length > 0 && (
              <div className="mt-3 p-3 bg-amber-50 rounded-xl">
                <p className="text-xs font-bold text-amber-900 mb-2">Flags personalizados:</p>
                {Object.entries(draft.feature_flags).filter(([k]) => !KNOWN_FLAGS.includes(k)).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-1">
                    <span className="font-mono text-xs">{k} = {String(v)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newFlags = { ...draft.feature_flags }
                        delete newFlags[k]
                        setDraft({ ...draft, feature_flags: newFlags })
                      }}
                      className="text-xs font-bold text-rose-700"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ─── Stripe ─── */}
          <Section title="Stripe">
            <Field label="Price ID mensual">
              <div className="flex gap-2">
                <input
                  value={draft.stripe_price_id || ''}
                  onChange={e => setDraft({ ...draft, stripe_price_id: e.target.value })}
                  placeholder="price_1ABC..."
                  className={inputCls + ' font-mono text-xs'}
                />
                {draft.stripe_price_id && (
                  <a
                    href={`https://dashboard.stripe.com/prices/${draft.stripe_price_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center"
                    title="Abrir en Stripe"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </Field>
            <Field label="Price ID anual">
              <div className="flex gap-2">
                <input
                  value={draft.stripe_price_yearly_id || ''}
                  onChange={e => setDraft({ ...draft, stripe_price_yearly_id: e.target.value })}
                  placeholder="price_1ABC..."
                  className={inputCls + ' font-mono text-xs'}
                />
                {draft.stripe_price_yearly_id && (
                  <a
                    href={`https://dashboard.stripe.com/prices/${draft.stripe_price_yearly_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </Field>
          </Section>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900">
            Cancelar
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={saving}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// helpers visuales compartidos
// ============================================================================
const inputCls = 'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 outline-none text-sm font-medium'

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">{label}</label>
      <input type="number" value={value} onChange={e => onChange(parseInt(e.target.value) || 0)} className={inputCls} />
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean, onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`w-12 h-7 rounded-full p-1 transition-colors ${value ? 'bg-slate-900' : 'bg-slate-300'}`}
    >
      <div className={`h-5 w-5 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}
