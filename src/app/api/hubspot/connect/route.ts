 

// src/app/api/hubspot/connect/route.ts
// ----------------------------------------------------------------------------
// POST /api/hubspot/connect
//
// Body: { private_app_token: string }
//
// Reemplaza el flow OAuth del Sprint J. En lugar de authorize + callback,
// el user pega su Private App Token directamente. Validamos que:
//   1. El addon esté activo
//   2. El token sea válido (llamando a HubSpot account-info)
//   3. Tenga los scopes necesarios (haciendo un fetch de prueba de contactos)
// Si todo pasa, guardamos en hubspot_integrations.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { validatePrivateAppToken } from '../../../../lib/hubspot';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // 1. Validar body
    let body: { private_app_token?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
    }

    const token =
      typeof body.private_app_token === 'string' ? body.private_app_token.trim() : '';

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Falta el Private App Token' },
        { status: 400 }
      );
    }

    // 2. Autenticación
    const cookieStore = await cookies();
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
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.company_id) {
      return NextResponse.json({ ok: false, error: 'Sin company' }, { status: 400 });
    }

    const companyId = profile.company_id;

    // 3. Verificar addon activo
    const { data: hasAddon, error: gatingError } = await supabase.rpc(
      'has_hubspot_sync_active',
      { p_company_id: companyId }
    );

    if (gatingError) {
      console.error('[hubspot/connect] Error verificando addon:', gatingError);
      return NextResponse.json(
        { ok: false, error: 'Error verificando addon' },
        { status: 500 }
      );
    }

    if (!hasAddon) {
      return NextResponse.json(
        {
          ok: false,
          error: 'El addon Sync HubSpot no está activo. Actívalo desde el marketplace.',
          code: 'ADDON_NOT_ACTIVE',
        },
        { status: 402 }
      );
    }

    // 4. Validar el token contra HubSpot API
    const validation = await validatePrivateAppToken(token);

    if (!validation.ok) {
      const status =
        validation.error_code === 'invalid_token'
          ? 401
          : validation.error_code === 'missing_scope'
          ? 403
          : validation.error_code === 'rate_limited'
          ? 429
          : 400;

      return NextResponse.json(
        {
          ok: false,
          error: validation.error,
          error_code: validation.error_code,
        },
        { status }
      );
    }

    // 5. Guardar (upsert por company_id)
    const { error: upsertError } = await supabase
      .from('hubspot_integrations')
      .upsert(
        {
          company_id: companyId,
          access_token: token,
          hub_id: validation.portal_id ?? null,
          user_email: user.email ?? null,
          scopes: ['crm.objects.contacts.read', 'crm.schemas.contacts.read'],
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'company_id' }
      );

    if (upsertError) {
      console.error('[hubspot/connect] Error guardando:', upsertError);
      return NextResponse.json(
        { ok: false, error: 'Error guardando la conexión' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      portal_id: validation.portal_id,
      account_type: validation.account_type,
    });
  } catch (err) {
    console.error('[hubspot/connect] Exception:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error inesperado' },
      { status: 500 }
    );
  }
}
