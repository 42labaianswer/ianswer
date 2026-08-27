 

// ============================================================================
// src/lib/tenancy.ts
// ----------------------------------------------------------------------------
// Invariantes de aislamiento multi-tenant.
//
// La identidad de un contacto es el par (company_id, external_id) — NUNCA el
// teléfono solo. `external_id` es el teléfono en WhatsApp, el PSID en
// Messenger y el IGSID en Instagram; `id` es un identificador interno opaco.
//
// Historia: el alta de contactos usaba  id = teléfono. Como `id` es la llave
// primaria, resultaba único en toda la plataforma: dos empresas no podían
// tener al mismo cliente y la importación de CSV se saltaba filas en silencio.
// Corregido en agosto de 2026 (hallazgo D-1), con la restricción
// `unique (company_id, external_id)` respaldándolo en la base.
// ============================================================================

import { toChannelPlatform, type ChannelPlatform } from './channels'

/** Llave estable de un contacto dentro de su empresa. */
export function contactKey(companyId: string, externalId: string): string {
  return `${companyId}:${externalId}`
}

export interface TenantScopedContact {
  company_id: string
  external_id: string
}

/** Dos contactos son el mismo solo si coinciden empresa Y external_id. */
export function isSameTenantContact(
  a: TenantScopedContact,
  b: TenantScopedContact
): boolean {
  return a.company_id === b.company_id && a.external_id === b.external_id
}

export interface NewContactInput {
  companyId: string
  externalId: string
  name?: string | null
  phone?: string | null
  channel?: string | null
}

export interface ContactRecord {
  id: string
  company_id: string
  external_id: string
  name: string
  phone: string | null
  platform: ChannelPlatform
  ai_active: boolean
  lifecycle_stage: string
  status: string
}

/**
 * Construye la fila de un contacto nuevo respetando las invariantes.
 * Genera siempre un `id` opaco: el teléfono vive en `external_id`.
 */
export function buildContactRecord(input: NewContactInput): ContactRecord {
  if (!input.companyId) throw new Error('buildContactRecord: falta companyId')
  if (!input.externalId) throw new Error('buildContactRecord: falta externalId')

  return {
    id: newContactId(),
    company_id: input.companyId,
    external_id: input.externalId,
    name: (input.name || '').trim() || 'Sin Nombre',
    phone: input.phone ?? (/^\d+$/.test(input.externalId) ? input.externalId : null),
    platform: toChannelPlatform(input.channel),
    ai_active: true,
    lifecycle_stage: 'new_lead',
    status: 'lead',
  }
}

/** uuid v4, con respaldo para entornos sin `crypto.randomUUID`. */
function newContactId(): string {
  const c: any = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

