 

// src/app/api/hubspot/sync/route.ts
// ----------------------------------------------------------------------------
// POST /api/hubspot/sync
//
// Sprint J.5 · Sync manual. Sin cambios estructurales vs Sprint J,
// solo importa el nuevo hubspot-sync que ya no maneja refresh de tokens.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { syncCompanyFromHubSpot } from '../../../../lib/hubspot-sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  try {
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

    // Verificar addon activo
    const { data: hasAddon } = await supabase.rpc('has_hubspot_sync_active', {
      p_company_id: profile.company_id,
    });

    if (hasAddon !== true) {
      return NextResponse.json(
        { ok: false, error: 'Addon Sync HubSpot no está activo' },
        { status: 402 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const result = await syncCompanyFromHubSpot(profile.company_id, supabaseAdmin);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[hubspot/sync] Exception:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error inesperado' },
      { status: 500 }
    );
  }
}
