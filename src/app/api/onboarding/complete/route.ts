 

// ============================================================================
// src/app/api/onboarding/complete/route.ts · v3.0 DEFENSIVO
// ----------------------------------------------------------------------------
// Endpoint atómico que completa el onboarding:
//   1. Actualiza company.name + plan_slug + onboarding_completed
//      (intenta también onboarding_finished_at y onboarding_step si existen,
//       pero si no existen NO falla — usa fallback)
//   2. Instala el template principal vía RPC install_template
//   3. (opcional) Activa addons elegidos vía RPC activate_addon
//
// Devuelve errores específicos (no genéricos) para que el frontend muestre
// exactamente qué pasó.
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const TRIAL_DAYS_FALLBACK = 7 // fallback solo si plans.trial_days viene vacío en la base de datos
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

    // ---- 4) UPDATE company DEFENSIVO ----
    // Intentamos primero con TODOS los campos. Si falla por columna inexistente,
    // reintentamos sin los campos opcionales.
    // NOTA: además de plan_slug, mandamos selected_plan_slug con el mismo valor.
    // El trigger companies_set_trial_ends_at_trigger de la base de datos solo se
    // dispara con "BEFORE INSERT OR UPDATE OF selected_plan_slug" — si solo
    // actualizábamos plan_slug (como hacía antes este endpoint), el trigger nunca
    // corría y la cuenta se quedaba sin trial_ends_at/subscription_status = 'trialing',
    // con acceso indefinido al plan sin pagar. Ver diagnóstico del P1 de Stripe,
    // semana 4.
    const fullPayload: Record<string, any> = {
      name: company_name.trim(),
      plan_slug,
      selected_plan_slug: plan_slug,
      onboarding_completed: true,
      onboarding_finished_at: new Date().toISOString(),
      onboarding_step: 4,
    }

    let updateErr = (await supabase.from('companies').update(fullPayload).eq('id', companyId)).error

    if (updateErr) {
      console.warn('[onboarding] UPDATE companies con campos completos falló:', updateErr.message)
      
      // Reintento 1: sin onboarding_finished_at y onboarding_step
      const minimalPayload: Record<string, any> = {
        name: company_name.trim(),
        plan_slug,
        selected_plan_slug: plan_slug,
        onboarding_completed: true,
      }
      updateErr = (await supabase.from('companies').update(minimalPayload).eq('id', companyId)).error

      if (updateErr) {
        console.warn('[onboarding] UPDATE companies sin opcionales también falló:', updateErr.message)

        // Reintento 2: sin onboarding_completed (puede que sea columna nueva)
        const barePayload: Record<string, any> = {
          name: company_name.trim(),
          plan_slug,
          selected_plan_slug: plan_slug,
        }
        updateErr = (await supabase.from('companies').update(barePayload).eq('id', companyId)).error

        if (updateErr) {
          console.error('[onboarding] UPDATE companies definitivamente falló:', updateErr)
          return NextResponse.json(
            {
              error: 'No se pudo actualizar la company',
              detail: updateErr.message,
              hint: 'Verifica que la tabla companies tenga las columnas: name, plan_slug. Si plan_slug no existe agregala con ALTER TABLE.'
            },
            { status: 500 }
          )
        }
      }
    }

    // ---- 5) Instalar template primario vía RPC ----
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

    // ---- 6) Activar addons (opcional) ----
    // Lee trial_days del plan igual que stripe/checkout/route.ts, en vez de un valor fijo.
    const { data: planRow } = await supabase
      .from('plans')
      .select('trial_days')
      .eq('slug', plan_slug)
      .maybeSingle()
    const trialDays = planRow?.trial_days ?? TRIAL_DAYS_FALLBACK
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
    let activatedAddons = 0
    const addonErrors: string[] = []

    for (const addonId of addon_ids) {
      const { error: addonErr } = await supabase.rpc('activate_addon', {
        p_company_id: companyId,
        p_addon_id: addonId,
        p_quantity: 1,
      })
      if (addonErr) {
        console.warn('[onboarding] activate_addon failed for', addonId, addonErr.message)
        addonErrors.push(`${addonId}: ${addonErr.message}`)
        continue
      }

      // Setear current_period_end (trial) — opcional, no falla si la columna no existe
      await supabase
        .from('company_addons')
        .update({ current_period_end: trialEndsAt })
        .eq('company_id', companyId)
        .eq('addon_id', addonId)

      activatedAddons++
    }

    return NextResponse.json({
      success: true,
      template_installed: template_id,
      addons_activated: activatedAddons,
      addon_errors: addonErrors.length > 0 ? addonErrors : undefined,
      trial_ends_at: addon_ids.length > 0 ? trialEndsAt : null,
    })

  } catch (err: any) {
    console.error('[onboarding] unexpected:', err)
    return NextResponse.json(
      { error: 'Error inesperado en el onboarding', detail: err?.message || String(err) },
      { status: 500 }
    )
  }
}
