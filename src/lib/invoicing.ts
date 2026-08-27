 

// ============================================================================
// src/lib/invoicing.ts
// ----------------------------------------------------------------------------
// Abstracción del proveedor PAC (Proveedor Autorizado de Certificación).
//
// HOY: stub que retorna "PAC no configurado" hasta que se contrate uno.
// MAÑANA: cambiar PAC_PROVIDER env y configurar credenciales — todo lo demás
//         (UI, DB, webhook) no se toca.
//
// Proveedores soportados (cuando los implementes):
//   - Facturama (https://docs.facturama.mx) — más popular en MX
//   - Konecta   (https://konectamigo.com)
//   - Factura.com (https://www.factura.com/docs/api)
//
// El contrato exportado es PACProvider con métodos:
//   - stampInvoice(invoiceData)   → llama al PAC y devuelve UUID + XML + PDF URL
//   - cancelInvoice(uuid, reason) → cancela en SAT
//   - validateRFCAgainstLCO(rfc)  → algunos PACs ofrecen validación contra Lista del SAT
// ============================================================================

export const IVA_RATE = 0.16

/**
 * Calcula IVA dado un subtotal en centavos.
 * Para SaaS estándar en México: 16% IVA trasladado.
 *
 * Si en el futuro quieres soporte para tasa 0% (exportación) o exento, agrega
 * un parámetro opcional `rate`.
 */
export function calculateIVA(subtotalCents: number): {
  subtotalCents: number
  ivaCents:      number
  totalCents:    number
} {
  // Redondeo bancario para evitar centavos perdidos
  const ivaCents   = Math.round(subtotalCents * IVA_RATE)
  const totalCents = subtotalCents + ivaCents
  return { subtotalCents, ivaCents, totalCents }
}

/**
 * Dado un total con IVA incluido (lo que cobra Stripe normalmente), separa el
 * subtotal y el IVA. Útil cuando recibes el monto post-impuesto y necesitas
 * desglosar para el CFDI.
 */
export function reverseCalculateIVA(totalCents: number): {
  subtotalCents: number
  ivaCents:      number
  totalCents:    number
} {
  const subtotalCents = Math.round(totalCents / (1 + IVA_RATE))
  const ivaCents      = totalCents - subtotalCents
  return { subtotalCents, ivaCents, totalCents }
}

export function formatCurrency(cents: number, currency: string = 'MXN'): string {
  const amount = cents / 100
  return new Intl.NumberFormat('es-MX', {
    style:                'currency',
    currency:             currency,
    minimumFractionDigits: 2
  }).format(amount)
}

// ─── Interface del PAC ───────────────────────────────────────────────────

export interface InvoiceStampInput {
  invoiceId:           string
  invoiceNumber:       string
  emisor: {
    rfc:                string
    legalName:          string
    regimeCode:         string
    zip:                string
  }
  receptor: {
    rfc:                string
    legalName:          string
    regimeCode:         string
    zip:                string
    useCfdi:            string
    email?:             string
  }
  items: Array<{
    description:        string
    quantity:           number
    unitPriceCents:     number
    satProductCode:     string
    satUnitCode:        string
  }>
  subtotalCents:        number
  ivaCents:             number
  totalCents:           number
  currency:             string
  formaPago:            string
  metodoPago:           string
}

export interface InvoiceStampResult {
  success:        boolean
  uuid?:          string
  xmlUrl?:        string
  pdfUrl?:        string
  xmlRaw?:        string
  pacExternalId?: string
  pacProvider?:   string
  stampedAt?:    Date
  error?:         string
}

export interface PACProvider {
  name: string
  isConfigured(): boolean
  stampInvoice(input: InvoiceStampInput): Promise<InvoiceStampResult>
  cancelInvoice(uuid: string, reason: string, substituteUuid?: string): Promise<InvoiceStampResult>
}

// ─── Stub provider (cuando no hay PAC contratado) ────────────────────────
class StubPACProvider implements PACProvider {
  name = 'stub'

  isConfigured(): boolean {
    return false
  }

  async stampInvoice(_input: InvoiceStampInput): Promise<InvoiceStampResult> {
    return {
      success: false,
      error:   'PAC no configurado. Contrata Facturama/Konecta y configura PAC_PROVIDER en .env'
    }
  }

  async cancelInvoice(_uuid: string, _reason: string): Promise<InvoiceStampResult> {
    return {
      success: false,
      error:   'PAC no configurado.'
    }
  }
}

// ─── Facturama provider (STUB — implementar cuando contrates) ────────────
// Doc: https://docs.facturama.mx/cfdi/intro
class FacturamaPACProvider implements PACProvider {
  name = 'facturama'

  isConfigured(): boolean {
    return !!(
      process.env.PAC_API_URL &&
      process.env.PAC_USERNAME &&
      process.env.PAC_PASSWORD
    )
  }

  async stampInvoice(_input: InvoiceStampInput): Promise<InvoiceStampResult> {
    // TODO Phase 2: implementar llamada real a Facturama
    //
    // Paso 1: armar payload CFDI 4.0 según docs Facturama
    //   const payload = {
    //     NameId: 1,  // 1 = Factura
    //     CfdiType: 'I',
    //     PaymentForm: input.formaPago,
    //     PaymentMethod: input.metodoPago,
    //     Currency: input.currency,
    //     ExpeditionPlace: input.emisor.zip,
    //     Exportation: '01',
    //     Issuer: {
    //       Rfc: input.emisor.rfc,
    //       Name: input.emisor.legalName,
    //       FiscalRegime: input.emisor.regimeCode
    //     },
    //     Receiver: {
    //       Rfc: input.receptor.rfc,
    //       Name: input.receptor.legalName,
    //       FiscalRegime: input.receptor.regimeCode,
    //       TaxZipCode: input.receptor.zip,
    //       CfdiUse: input.receptor.useCfdi
    //     },
    //     Items: input.items.map(item => ({
    //       ProductCode: item.satProductCode,
    //       UnitCode: item.satUnitCode,
    //       Description: item.description,
    //       Quantity: item.quantity,
    //       UnitPrice: item.unitPriceCents / 100,
    //       Subtotal: (item.unitPriceCents * item.quantity) / 100,
    //       Taxes: [{
    //         Total: ((item.unitPriceCents * item.quantity) * 0.16) / 100,
    //         Name: 'IVA',
    //         Base: (item.unitPriceCents * item.quantity) / 100,
    //         Rate: 0.16,
    //         IsRetention: false
    //       }],
    //       Total: ((item.unitPriceCents * item.quantity) * 1.16) / 100
    //     }))
    //   }
    //
    // Paso 2: POST a https://api.facturama.mx/cfdi
    //   const auth = Buffer.from(`${PAC_USERNAME}:${PAC_PASSWORD}`).toString('base64')
    //   const res = await fetch(process.env.PAC_API_URL!, {
    //     method: 'POST',
    //     headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    //     body: JSON.stringify(payload)
    //   })
    //   const data = await res.json()
    //
    // Paso 3: descargar XML y PDF, subirlos a Supabase Storage
    //   const xmlRes = await fetch(`${PAC_API_URL}/${data.Id}/xml`, ...)
    //   const pdfRes = await fetch(`${PAC_API_URL}/${data.Id}/pdf`, ...)
    //   ... upload a Supabase Storage bucket 'invoices' ...
    //
    // Paso 4: retornar
    //   return {
    //     success: true,
    //     uuid:    data.Complement.TaxStamp.Uuid,
    //     xmlUrl:  publicXmlUrl,
    //     pdfUrl:  publicPdfUrl,
    //     pacExternalId: data.Id,
    //     pacProvider: 'facturama',
    //     stampedAt: new Date()
    //   }

    return {
      success: false,
      error:   'Facturama provider no implementado todavía. Implementa en lib/invoicing.ts Phase 2.'
    }
  }

  async cancelInvoice(_uuid: string, _reason: string): Promise<InvoiceStampResult> {
    return {
      success: false,
      error:   'Facturama cancel no implementado todavía.'
    }
  }
}

// ─── Factory: devuelve el provider configurado ───────────────────────────
export function getPACProvider(): PACProvider {
  const provider = (process.env.PAC_PROVIDER || 'stub').toLowerCase()

  switch (provider) {
    case 'facturama':
      return new FacturamaPACProvider()
    case 'stub':
    default:
      return new StubPACProvider()
  }
}

// ─── Helpers para CFDI ───────────────────────────────────────────────────

/**
 * Valida el formato del RFC (regex SAT).
 * NO valida contra la Lista de Contribuyentes Obligados — eso lo hace el PAC.
 */
export function validateRFCFormat(rfc: string): {
  valid:       boolean
  type?:       'fisica' | 'moral' | 'generic'
  error?:      string
  normalized?: string
} {
  if (!rfc || rfc.trim().length === 0) {
    return { valid: false, error: 'RFC vacío' }
  }

  const normalized = rfc.toUpperCase().trim()

  // RFCs genéricos
  if (normalized === 'XAXX010101000') return { valid: true, type: 'generic', normalized }
  if (normalized === 'XEXX010101000') return { valid: true, type: 'generic', normalized }

  // Persona Moral: 3 letras + 6 dígitos + 3 alfanuméricos
  if (/^[A-Z&Ñ]{3}[0-9]{6}[A-Z0-9]{3}$/.test(normalized)) {
    return { valid: true, type: 'moral', normalized }
  }

  // Persona Física: 4 letras + 6 dígitos + 3 alfanuméricos
  if (/^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$/.test(normalized)) {
    return { valid: true, type: 'fisica', normalized }
  }

  return { valid: false, error: 'Formato de RFC inválido' }
}

/**
 * Valida código postal mexicano (5 dígitos).
 */
export function validateZipCode(zip: string): boolean {
  return /^\d{5}$/.test(zip.trim())
}
