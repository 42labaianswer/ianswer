// ============================================================================
// src/app/api/admin/change-industry/route.ts
// ----------------------------------------------------------------------------
// Cambio de industria de una cuenta, solo para administradores de plataforma.
// Los usuarios no pueden cambiarla (install_template lo bloquea después del
// onboarding, ver database/lock_industry_change.sql).
//
//   GET  ?email=...  → la empresa del usuario, su industria actual, las
//                      industrias disponibles (incluidas las ocultas del
//                      registro) y sus addons activos.
//   POST { companyId, templateId, removePrevious } → instala la industria
//                      como principal y deja registro en operator_audit_log.
// ============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePlatformAdmin } from '../../../../lib/apiAuth'

export const dynamic = 'force-dynamic'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

type AddonJoin = { name: string | null; available_for_templates: string[] | null }

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function GET(req: Request) {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return admin.response

  const db = adminClient()
  if (!db) return fail(500, 'Servidor mal configurado')

  const email = new URL(req.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email) return fail(400, 'Escribe un correo')

  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id, full_name, email, company_id')
    .ilike('email', email)
    .maybeSingle()
  if (profileErr) return fail(500, profileErr.message)
  if (!profile) return fail(404, 'No hay ningún usuario con ese correo')
  if (!profile.company_id) return fail(404, 'Ese usuario no tiene empresa asignada')

  const [company, installed, templates, addons] = await Promise.all([
    db.from('companies')
      .select('id, name, plan_slug, subscription_status, onboarding_completed')
      .eq('id', profile.company_id)
      .maybeSingle(),
    db.from('company_templates')
      .select('template_id, is_primary, installed_at')
      .eq('company_id', profile.company_id),
    db.from('templates')
      .select('id, name, is_active, is_selectable')
      .eq('is_active', true)
      .order('name'),
    db.from('company_addons')
      .select('addon_id, status, addons(name, available_for_templates)')
      .eq('company_id', profile.company_id)
      .eq('status', 'active'),
  ])

  const firstError = company.error || installed.error || templates.error || addons.error
  if (firstError) return fail(500, firstError.message)
  if (!company.data) return fail(404, 'La empresa del usuario no existe')

  return NextResponse.json({
    success: true,
    user: { full_name: profile.full_name, email: profile.email },
    company: company.data,
    installed: installed.data ?? [],
    templates: templates.data ?? [],
    addons: (addons.data ?? []).map(a => {
      const joined = a.addons as AddonJoin | AddonJoin[] | null
      const addon = Array.isArray(joined) ? joined[0] : joined
      return {
        addon_id: a.addon_id,
        name: addon?.name ?? a.addon_id,
        available_for_templates: addon?.available_for_templates ?? [],
      }
    }),
  })
}

export async function POST(req: Request) {
  const admin = await requirePlatformAdmin()
  if (!admin.ok) return admin.response

  const db = adminClient()
  if (!db) return fail(500, 'Servidor mal configurado')

  const body = await req.json().catch(() => ({}))
  const companyId: unknown = body.companyId
  const templateId: unknown = body.templateId
  const removePrevious = body.removePrevious === true
  if (typeof companyId !== 'string' || typeof templateId !== 'string' || !companyId || !templateId) {
    return fail(400, 'Faltan companyId o templateId')
  }

  const { data: template } = await db
    .from('templates')
    .select('id, name')
    .eq('id', templateId)
    .eq('is_active', true)
    .maybeSingle()
  if (!template) return fail(400, 'Esa industria no existe o está desactivada')

  const { data: company } = await db
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .maybeSingle()
  if (!company) return fail(404, 'La empresa no existe')

  const { data: previous } = await db
    .from('company_templates')
    .select('template_id')
    .eq('company_id', companyId)
    .eq('is_primary', true)
    .maybeSingle()
  const previousId: string | null = previous?.template_id ?? null
  if (previousId === templateId) return fail(400, 'La cuenta ya tiene esa industria')

  const { error: installErr } = await db.rpc('install_template', {
    p_company_id: companyId,
    p_template_id: templateId,
    p_make_primary: true,
  })
  if (installErr) return fail(500, `No se pudo instalar la industria: ${installErr.message}`)

  let removeError: string | null = null
  if (removePrevious && previousId) {
    const { error } = await db.rpc('uninstall_template', {
      p_company_id: companyId,
      p_template_id: previousId,
    })
    if (error) removeError = error.message
  }

  const { data: operator } = await db
    .from('profiles')
    .select('email')
    .eq('id', admin.userId)
    .maybeSingle()

  const { error: auditErr } = await db.from('operator_audit_log').insert({
    company_id: companyId,
    operator_id: admin.userId,
    operator_email: operator?.email ?? null,
    action_type: 'settings_changed',
    target_type: 'industry',
    target_id: templateId,
    description: `Industria cambiada por admin: ${previousId ?? '(ninguna)'} → ${templateId}`,
    metadata: {
      previous_template_id: previousId,
      new_template_id: templateId,
      previous_removed: removePrevious && !!previousId && !removeError,
      user_agent: req.headers.get('user-agent'),
    },
  })
  if (auditErr) console.error('[admin/change-industry] No se pudo registrar en auditoría:', auditErr)

  return NextResponse.json({
    success: true,
    previous: previousId,
    current: templateId,
    warning: removeError ? `La industria nueva quedó, pero no se pudo quitar la anterior: ${removeError}` : null,
  })
}
