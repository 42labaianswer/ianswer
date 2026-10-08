 

// ============================================================================
// src/app/api/onboarding/complete/route.ts
// ----------------------------------------------------------------------------
// Endpoint que completa el onboarding:
//   1. Guarda company.name, el plan elegido como pendiente (pending_plan_slug),
//      los complementos de interés y onboarding_completed.
//   2. Instala el template principal vía RPC install_template.
// NO asigna plan ni activa complementos: eso pasa por Stripe (checkout +
// webhook). Requiere database/add_onboarding_pending_plan.sql.
//
// Devuelve errores específicos (no genéricos) para que el frontend muestre
// exactamente qué pasó.
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const VALID_PLANS = ['start', 'growth', 'scale'] as const

type CompletePayload = {
  template_id: string
  company_name: string
  plan_slug: string
  addon_ids?: string[]
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<CompletePayload>
    const { template_id, company_name, plan_slug, addon_ids = [] } = body

    // ---- 1) Validaciones ----
    if (!template_id || typeof template_id !== 'string') {
      return NextResponse.json({ error: 'template_id requerido' }, { status: 400 })
    }
    if (!company_name || typeof company_name !== 'string' || !company_name.trim()) {
      return NextResponse.json({ error: 'company_name requerido' }, { status: 400 })
    }
    if (!plan_slug || !VALID_PLANS.includes(plan_slug as any)) {
      return NextResponse.json({ error: 'plan_slug inválido (start|growth|scale)' }, { status: 400 })
    }
    if (!Array.isArray(addon_ids)) {
      return NextResponse.json({ error: 'addon_ids debe ser array' }, { status: 400 })
    }

    // ---- 2) Cliente Supabase con sesión ----
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (n: string) => cookieStore.get(n)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile?.company_id) {
      console.error('[onboarding] profile error:', profileErr)
      return NextResponse.json(
        { error: 'Sin company asociada al usuario', detail: profileErr?.message },
        { status: 403 }
      )
    }
    const companyId = profile.company_id

    // ---- 3) Verificar que el template exista ----
    const { data: tpl, error: tplExistsErr } = await supabase
      .from('templates')
      .select('id')
      .eq('id', template_id)
      .eq('is_active', true)
      .maybeSingle()

    if (tplExistsErr) {
      console.error('[onboarding] templates lookup error:', tplExistsErr)
      return NextResponse.json(
        { error: 'No se pudo consultar templates. Revisa que el SQL 02_seed_templates.sql se haya aplicado.', detail: tplExistsErr.message },
        { status: 500 }
      )
    }
    if (!tpl) {
      return NextResponse.json({ error: `template_id "${template_id}" no existe o está inactivo` }, { status: 400 })
    }

    // ---- 4) Guardar lo del onboarding (SIN plan) ----
    // Este endpoint NO asigna plan ni activa complementos. El plan y la prueba
    // solo los escribe el webhook de Stripe (lib/stripePlan.ts). Aquí se guarda
    // el plan elegido como *pendiente* y los complementos como "de interés".
    // No se toca selected_plan_slug: dispara el trigger
    // companies_set_trial_ends_at, que arma una prueba sin pasar por Stripe.
    const cleanAddonIds = addon_ids.filter((a): a is string => typeof a === 'string').slice(0, 20)
    const { error: updateErr } = await supabase
      .from('companies')
      .update({
        name: company_name.trim(),
        pending_plan_slug: plan_slug,
        onboarding_addon_ids: cleanAddonIds,
        onboarding_completed: true,
        onboarding_finished_at: new Date().toISOString(),
        onboarding_step: 4,
      })
      .eq('id', companyId)

    if (updateErr) {
      console.error('[onboarding] UPDATE companies falló:', updateErr)
      return NextResponse.json(
        {
          error: 'No se pudo guardar la configuración de tu negocio',
          detail: updateErr.message,
          hint: updateErr.message.includes('pending_plan_slug') || updateErr.message.includes('onboarding_addon_ids')
            ? 'Falta correr la migración database/add_onboarding_pending_plan.sql.'
            : undefined,
        },
        { status: 500 }
      )
    }

    // ---- 5) Instalar template primario vía RPC (una sola vez) ----
    const { data: existingPrimary } = await supabase
      .from('company_templates')
      .select('template_id')
      .eq('company_id', companyId)
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle()

    if (!existingPrimary) {
      const { error: tplErr } = await supabase.rpc('install_template', {
        p_company_id: companyId,
        p_template_id: template_id,
        p_make_primary: true,
      })

      if (tplErr) {
        console.error('[onboarding] install_template error:', tplErr)
        return NextResponse.json(
          {
            error: 'Error al instalar template principal',
            detail: tplErr.message,
            hint: 'Verifica que la RPC install_template(p_company_id uuid, p_template_id text, p_make_primary boolean) exista. Está en SQL 01_migration_v2.26_fresh.sql.'
          },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      template_installed: template_id,
      pending_plan_slug: plan_slug,
    })

  } catch (err: any) {
    console.error('[onboarding] unexpected:', err)
    return NextResponse.json(
      { error: 'Error inesperado en el onboarding', detail: err?.message || String(err) },
      { status: 500 }
    )
  }
}
