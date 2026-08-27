 

// src/app/api/cron/hubspot-sync/route.ts
// ----------------------------------------------------------------------------
// GET /api/cron/hubspot-sync
//
// Sprint J.5 · Cron cada 6 horas. Sin cambios vs Sprint J salvo por el import
// del nuevo hubspot-sync que ya no maneja refresh de tokens.
//
// Configurar en vercel.json:
//   { "crons": [{ "path": "/api/cron/hubspot-sync", "schedule": "0 star/6 * * *" }] }
//
// Autenticación: header Authorization: Bearer $CRON_SECRET
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { syncCompanyFromHubSpot } from '../../../../lib/hubspot-sync';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface CronResult {
  ok: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{
    company_id: string;
    ok: boolean;
    synced: number;
    updated: number;
    errors: number;
    message?: string;
  }>;
}

export async function GET(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[cron/hubspot-sync] CRON_SECRET no configurado');
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    // Buscar todas las companies con integración activa y auto_sync on
    const { data: integrations, error: findError } = await supabaseAdmin
      .from('hubspot_integrations')
      .select('company_id, last_sync_at, access_token')
      .eq('auto_sync_enabled', true)
      .not('access_token', 'is', null)
      .neq('access_token', '');

    if (findError) {
      console.error('[cron/hubspot-sync] Error listando integrations:', findError);
      return NextResponse.json({ ok: false, error: findError.message }, { status: 500 });
    }

    const activeIntegrations = (integrations ?? []) as Array<{
      company_id: string;
      last_sync_at: string | null;
      access_token: string;
    }>;

    if (activeIntegrations.length === 0) {
      return NextResponse.json<CronResult>({
        ok: true,
        processed: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      });
    }

    const results: CronResult['results'] = [];
    let succeeded = 0;
    let failed = 0;

    for (const integration of activeIntegrations) {
      // Defensa en profundidad: verificar addon activo
      const { data: hasAddon } = await supabaseAdmin.rpc('has_hubspot_sync_active', {
        p_company_id: integration.company_id,
      });

      if (hasAddon !== true) {
        results.push({
          company_id: integration.company_id,
          ok: false,
          synced: 0,
          updated: 0,
          errors: 0,
          message: 'Addon no activo, skip',
        });
        continue;
      }

      try {
        const result = await syncCompanyFromHubSpot(integration.company_id, supabaseAdmin);
        results.push({
          company_id: integration.company_id,
          ...result,
        });

        if (result.ok) succeeded++;
        else failed++;
      } catch (err) {
        failed++;
        results.push({
          company_id: integration.company_id,
          ok: false,
          synced: 0,
          updated: 0,
          errors: 1,
          message: err instanceof Error ? err.message : 'Error desconocido',
        });
      }
    }

    return NextResponse.json<CronResult>({
      ok: true,
      processed: activeIntegrations.length,
      succeeded,
      failed,
      results,
    });
  } catch (err) {
    console.error('[cron/hubspot-sync] Exception:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Error inesperado' },
      { status: 500 }
    );
  }
}
