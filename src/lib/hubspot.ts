 

// src/lib/hubspot.ts
// ----------------------------------------------------------------------------
// Sprint J.5 · Helpers de HubSpot API v3 con Private App Tokens.
//
// Cambios vs Sprint J (OAuth):
//   - QUITADO: buildAuthorizeUrl, exchangeCodeForTokens, refreshAccessToken,
//     generateOAuthState, revokeToken (ya no aplican con Private Apps)
//   - AGREGADO: validatePrivateAppToken() que verifica que el token funciona
//   - AGREGADO: getAccountInfo() para obtener portal_id + info del portal
//   - fetchContactsPage y normalizeHubSpotContact SIN CAMBIOS
// ----------------------------------------------------------------------------

// ─── Config ────────────────────────────────────────────────────────────────
const HUBSPOT_API_BASE = 'https://api.hubapi.com';

// ─── Types ─────────────────────────────────────────────────────────────────
export interface HubSpotContact {
  id: string;
  properties: {
    email?: string;
    firstname?: string;
    lastname?: string;
    phone?: string;
    mobilephone?: string;
    company?: string;
    jobtitle?: string;
    lifecyclestage?: string;
    createdate?: string;
    lastmodifieddate?: string;
    [key: string]: string | undefined;
  };
  createdAt: string;
  updatedAt: string;
}

export interface HubSpotContactsPage {
  results: HubSpotContact[];
  paging?: {
    next?: { after: string; link?: string };
  };
}

export interface HubSpotAccountInfo {
  portalId: number;
  accountType: string;
  timeZone: string;
  companyCurrency: string;
  utcOffset?: string;
  utcOffsetMilliseconds?: number;
}

export interface ValidationResult {
  ok: boolean;
  portal_id?: string;
  account_type?: string;
  time_zone?: string;
  error?: string;
  error_code?: 'invalid_token' | 'missing_scope' | 'rate_limited' | 'network' | 'unknown';
}

// ─── 1. Obtener info del portal (validar que el token funciona) ────────────
export async function getAccountInfo(token: string): Promise<HubSpotAccountInfo> {
  const res = await fetch(`${HUBSPOT_API_BASE}/account-info/v3/details`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 401) {
    throw new HubSpotAuthError('Token inválido o no autorizado');
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HubSpot account-info falló (${res.status}): ${errText}`);
  }

  return (await res.json()) as HubSpotAccountInfo;
}

// ─── 2. Validar Private App Token end-to-end ───────────────────────────────
/**
 * Verifica que un Private App Token:
 *   1. Sea válido (no rechazado con 401)
 *   2. Tenga el scope crm.objects.contacts.read (haciendo un fetch de prueba)
 *
 * Devuelve un objeto con `ok: boolean` para uso desde endpoints.
 */
export async function validatePrivateAppToken(token: string): Promise<ValidationResult> {
  // Sanity check de formato
  if (!token || typeof token !== 'string') {
    return { ok: false, error: 'Token vacío', error_code: 'invalid_token' };
  }

  const trimmed = token.trim();
  if (trimmed.length < 20) {
    return {
      ok: false,
      error: 'Token demasiado corto. Debe ser el token completo de HubSpot.',
      error_code: 'invalid_token',
    };
  }

  try {
    // Paso 1: obtener info de la cuenta (verifica que el token es válido)
    const account = await getAccountInfo(trimmed);

    // Paso 2: intentar fetch de 1 contacto (verifica scope crm.objects.contacts.read)
    const testRes = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?limit=1&properties=email`,
      {
        headers: {
          Authorization: `Bearer ${trimmed}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (testRes.status === 401) {
      return {
        ok: false,
        error: 'Token inválido',
        error_code: 'invalid_token',
      };
    }

    if (testRes.status === 403) {
      return {
        ok: false,
        error:
          'El token no tiene permiso para leer contactos. Verifica que hayas marcado el scope "crm.objects.contacts.read" al crear el Private App.',
        error_code: 'missing_scope',
      };
    }

    if (testRes.status === 429) {
      return {
        ok: false,
        error: 'HubSpot rate limit alcanzado. Intenta en un minuto.',
        error_code: 'rate_limited',
      };
    }

    if (!testRes.ok) {
      const errText = await testRes.text().catch(() => '');
      return {
        ok: false,
        error: `HubSpot devolvió ${testRes.status}: ${errText.slice(0, 200)}`,
        error_code: 'unknown',
      };
    }

    return {
      ok: true,
      portal_id: String(account.portalId),
      account_type: account.accountType,
      time_zone: account.timeZone,
    };
  } catch (err) {
    if (err instanceof HubSpotAuthError) {
      return { ok: false, error: err.message, error_code: 'invalid_token' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Error de red',
      error_code: 'network',
    };
  }
}

// ─── 3. Fetch contactos paginados ──────────────────────────────────────────
export async function fetchContactsPage(
  token: string,
  options: { after?: string; limit?: number } = {}
): Promise<HubSpotContactsPage> {
  const properties = [
    'email',
    'firstname',
    'lastname',
    'phone',
    'mobilephone',
    'company',
    'jobtitle',
    'lifecyclestage',
    'createdate',
    'lastmodifieddate',
  ];

  const params = new URLSearchParams({
    limit: String(options.limit ?? 100),
    properties: properties.join(','),
    archived: 'false',
  });

  if (options.after) params.set('after', options.after);

  const url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 401) {
    throw new HubSpotAuthError('Token inválido o revocado desde HubSpot');
  }

  if (res.status === 429) {
    throw new HubSpotRateLimitError('Rate limit alcanzado');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HubSpot fetch contactos falló (${res.status}): ${errText}`);
  }

  return (await res.json()) as HubSpotContactsPage;
}

// ─── 4. Normalizar contacto HubSpot → shape de nuestros contacts ────────────
export function normalizeHubSpotContact(hc: HubSpotContact): {
  hubspot_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  external_updated_at: string | null;
} {
  const p = hc.properties;

  const fullName =
    [p.firstname, p.lastname].filter(Boolean).join(' ').trim() ||
    p.email ||
    null;

  const rawPhone = p.mobilephone || p.phone || '';
  const cleanPhone = rawPhone.replace(/\D/g, '') || null;

  return {
    hubspot_id: hc.id,
    name: fullName,
    phone: cleanPhone,
    email: p.email || null,
    external_updated_at: p.lastmodifieddate || hc.updatedAt || null,
  };
}

// ─── Errores especiales ────────────────────────────────────────────────────
export class HubSpotAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HubSpotAuthError';
  }
}

export class HubSpotRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HubSpotRateLimitError';
  }
}

// ─── Helper: sleep para respetar rate limits ───────────────────────────────
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
