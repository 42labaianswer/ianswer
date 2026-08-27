 

// ============================================================================
// src/app/api/meta/data-deletion-callback/route.ts
// ----------------------------------------------------------------------------
// Endpoint que Meta llama cuando un usuario solicita borrar sus datos vía
// Facebook/WhatsApp directamente.
//
// Configurar en developers.facebook.com → Settings → Basic →
//
// Spec: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
//
// Meta envía POST con `signed_request` que contiene `user_id`.
// Debemos:
//   1. Validar la firma con el app_secret
//   2. Crear un data_deletion_request
//   3. Responder con { url, confirmation_code } para que Meta lo muestre al usuario
// ============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const META_APP_SECRET           = process.env.META_APP_SECRET
const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PUBLIC_BASE_URL           = process.env.NEXT_PUBLIC_BASE_URL 

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    if (!META_APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Servidor mal configurado' },
        { status: 500 }
      )
    }

    // Meta manda x-www-form-urlencoded con campo signed_request
    const formData = await req.formData()
    const signedRequest = formData.get('signed_request')?.toString()

    if (!signedRequest) {
      return NextResponse.json(
        { success: false, error: 'signed_request faltante' },
        { status: 400 }
      )
    }

    // Validar y parsear signed_request
    const parsed = parseSignedRequest(signedRequest, META_APP_SECRET)
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'Firma inválida' },
        { status: 401 }
      )
    }

    const userId: string = parsed.user_id || 'unknown'

    // Registrar la solicitud
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: result } = await (supabase.rpc as any)('register_data_deletion_request', {
      p_requester_email: null,
      p_requester_phone: null,
      p_reason:          `Meta Data Deletion Callback · user_id=${userId}`,
      p_scope:           'full',
      p_source:          'meta_callback'
    })

    const confirmationCode = result?.confirmation_code || 'PENDING'
    const requestId        = result?.request_id || crypto.randomUUID()

    // Responder con el formato que Meta espera
    return NextResponse.json({
      url:               `${PUBLIC_BASE_URL}/legal/eliminar-datos?req=${requestId}`,
      confirmation_code: confirmationCode
    })

  } catch (err: any) {
    console.error('[MetaDataDeletionCallbackError]', err)
    return NextResponse.json(
      { success: false, error: 'Error inesperado' },
      { status: 500 }
    )
  }
}

/**
 * Valida y parsea el signed_request de Meta.
 * Formato: base64url(signature).base64url(payload)
 */
function parseSignedRequest(signedRequest: string, appSecret: string): any | null {
  const parts = signedRequest.split('.')
  if (parts.length !== 2) return null

  const [encodedSig, encodedPayload] = parts

  // Decodificar payload
  let payload: any
  try {
    const payloadJson = Buffer.from(base64UrlToBase64(encodedPayload), 'base64').toString('utf-8')
    payload = JSON.parse(payloadJson)
  } catch {
    return null
  }

  // Verificar algoritmo
  if (payload.algorithm !== 'HMAC-SHA256') return null

  // Validar firma
  const expectedSig = crypto
    .createHmac('sha256', appSecret)
    .update(encodedPayload)
    .digest('base64')

  const expectedSigUrl = expectedSig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  if (expectedSigUrl !== encodedSig) return null

  return payload
}

function base64UrlToBase64(input: string): string {
  let str = input.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  return str
}
