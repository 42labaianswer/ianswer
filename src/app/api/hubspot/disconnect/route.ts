 

// src/app/api/hubspot/disconnect/route.ts
// ----------------------------------------------------------------------------
// POST /api/hubspot/disconnect
//
// Sprint J.5 · Desconecta la integración HubSpot. Con Private App Tokens
// no hay endpoint público de revocación: el user debe borrar el Private App
// desde HubSpot Settings → Integrations → Private Apps si quiere invalidarlo.
// Nosotros solo eliminamos el token de nuestra BD.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

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

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Borrar integración
    const { error: delError } = await supabaseAdmin
      .from('hubspot_integrations')
      .delete()
      .eq('company_id', profile.company_id);

    if (delError) {
      console.error('[hubspot/disconnect] Error borrando:', delError);
      return NextResponse.json(
        { ok: false, error: 'Error al desconectar' },
        { status: 500 }
      );
    }

    // Marcar los contactos importados como hubspot_disconnected (no los borramos)
    await supabaseAdmin
      .from('contacts')
      .update({ source: 'hubspot_disconnected' })
      .eq('company_id', profile.company_id)
      .eq('source', 'hubspot');

    return NextResponse.json({
      ok: true,
      message:
        'HubSpot desconectado. Si quieres invalidar el token completamente, bórralo desde HubSpot Settings → Integrations → Private Apps.',
    });
  } catch (err) {
    console.error('[hubspot/disconnect] Exception:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error inesperado' },
      { status: 500 }
    );
  }
}
