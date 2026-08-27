 

// src/lib/hubspot-sync.ts
// ----------------------------------------------------------------------------
// Sprint J.5 · Sync HubSpot → contacts usando Private App Token.
//
// Cambios vs Sprint J:
//   - Ya NO refresca tokens (Private Apps no caducan)
//   - Si el token es inválido, se marca la integración como failed y se pide
//     al user que actualice manualmente en HubSpot Settings → Private Apps
// ----------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchContactsPage,
  normalizeHubSpotContact,
  sleep,
  HubSpotAuthError,
  HubSpotRateLimitError,
} from './hubspot';

export interface SyncResult {
  ok: boolean;
  synced: number;
  updated: number;
  errors: number;
  message?: string;
}

/**
 * Sincroniza los contactos de HubSpot de una company hacia la tabla contacts.
 * Usa Private App Token (no caduca, no refresh).
 */
export async function syncCompanyFromHubSpot(
  companyId: string,
  supabaseAdmin: SupabaseClient
): Promise<SyncResult> {
  // 1. Cargar integración
  const { data: integrationRaw, error: findError } = await supabaseAdmin
    .from('hubspot_integrations')
    .select('id, access_token')
    .eq('company_id', companyId)
    .maybeSingle();

  if (findError || !integrationRaw) {
    return {
      ok: false,
      synced: 0,
      updated: 0,
      errors: 1,
      message: 'Integración no encontrada',
    };
  }

  const integration = integrationRaw as {
    id: string;
    access_token: string;
  };

  if (!integration.access_token) {
    return {
      ok: false,
      synced: 0,
      updated: 0,
      errors: 1,
      message: 'Falta configurar el Private App Token',
    };
  }

  const accessToken = integration.access_token;

  // 2. Paginar y upsertear contactos
  let synced = 0;
  let updated = 0;
  let errors = 0;
  let after: string | undefined = undefined;
  let iterations = 0;
  const MAX_ITERATIONS = 50; // 50 páginas × 100 = 5000 contactos por sync

  try {
    do {
      iterations++;
      if (iterations > MAX_ITERATIONS) {
        console.warn(`[hubspot-sync] Cap alcanzado en company=${companyId}`);
        break;
      }

      const page = await fetchContactsPage(accessToken, { after, limit: 100 });

      for (const hc of page.results) {
        const normalized = normalizeHubSpotContact(hc);

        // Solo importamos si tiene al menos email o phone
        if (!normalized.email && !normalized.phone) {
          continue;
        }

        // Buscar si ya existe por hubspot_id
        const { data: existing } = await supabaseAdmin
          .from('contacts')
          .select('id')
          .eq('company_id', companyId)
          .eq('hubspot_id', normalized.hubspot_id)
          .maybeSingle();

        if (existing) {
          const { error: updErr } = await supabaseAdmin
            .from('contacts')
            .update({
              name: normalized.name,
              phone: normalized.phone,
              external_updated_at: normalized.external_updated_at,
            })
            .eq('id', existing.id);

          if (updErr) errors++;
          else updated++;
        } else {
          const contactId =
            normalized.phone ||
            normalized.email ||
            `hs-${normalized.hubspot_id}`;

          const { error: insErr } = await supabaseAdmin.from('contacts').insert([
            {
              id: contactId,
              company_id: companyId,
              name: normalized.name,
              phone: normalized.phone,
              external_id: normalized.phone || normalized.email,
              hubspot_id: normalized.hubspot_id,
              source: 'hubspot',
              source_external_id: normalized.hubspot_id,
              platform: 'hubspot',
              status: 'lead',
              external_updated_at: normalized.external_updated_at,
            },
          ]);

          if (insErr) {
            if (insErr.code === '23505') {
              // Conflict PK: linkear el hubspot_id al contact existente
              const { error: linkErr } = await supabaseAdmin
                .from('contacts')
                .update({
                  hubspot_id: normalized.hubspot_id,
                  source: 'hubspot',
                  source_external_id: normalized.hubspot_id,
                  external_updated_at: normalized.external_updated_at,
                })
                .eq('id', contactId)
                .eq('company_id', companyId);

              if (linkErr) errors++;
              else updated++;
            } else {
              errors++;
              console.error('[hubspot-sync] Insert error:', insErr);
            }
          } else {
            synced++;
          }
        }
      }

      after = page.paging?.next?.after;

      if (after) {
        await sleep(300); // rate limit protection
      }
    } while (after);

    // 3. Actualizar last_sync_at
    const totalSynced = synced + updated;
    await supabaseAdmin
      .from('hubspot_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: errors > 0 ? 'partial' : 'success',
        last_sync_message:
          errors > 0
            ? `${totalSynced} sincronizados, ${errors} con error`
            : `${totalSynced} contactos sincronizados`,
        total_contacts_synced: totalSynced,
      })
      .eq('id', integration.id);

    return {
      ok: true,
      synced,
      updated,
      errors,
      message: `${synced} nuevos, ${updated} actualizados${
        errors > 0 ? `, ${errors} errores` : ''
      }`,
    };
  } catch (err) {
    const message =
      err instanceof HubSpotAuthError
        ? 'El Private App Token fue revocado o modificado en HubSpot. Ve a HubSpot Settings → Integrations → Private Apps y verifica el token, luego reconecta en iAnswer.'
        : err instanceof HubSpotRateLimitError
        ? 'HubSpot rate limit alcanzado. Intenta en unos minutos.'
        : err instanceof Error
        ? err.message
        : 'Error desconocido';

    await supabaseAdmin
      .from('hubspot_integrations')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'failed',
        last_sync_message: message,
      })
      .eq('id', integration.id);

    return { ok: false, synced, updated, errors: errors + 1, message };
  }
}
