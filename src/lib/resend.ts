 

// src/lib/resend.ts
// ----------------------------------------------------------------------------
// Cliente Resend centralizado. Lo importan todos los endpoints que envían
// emails (forgot password, facturas, recordatorios, CFDIs, etc.).
//
// Requiere variables de entorno:
//   RESEND_API_KEY  → API key del dashboard de Resend
//   EMAIL_FROM      → Email remitente verificado (obligatorio)
//   EMAIL_REPLY_TO  → (opcional) Email para responder
// ----------------------------------------------------------------------------

import { Resend } from 'resend';

let resendClient: Resend | null = null;

/**
 * Devuelve un cliente Resend inicializado (singleton).
 * Lanza error si RESEND_API_KEY no está configurada.
 */
export function getResendClient(): Resend {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY no está configurada en las variables de entorno. ' +
      'Agrégala en .env.local o en Vercel/Hostinger.'
    );
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

/**
 * Configuración default para todos los envíos.
 * El remitente (EMAIL_FROM) es obligatorio. Si no está definido, lanza error.
 */
export function getDefaultEmailConfig(): {
  from: string;
  replyTo: string | undefined;
} {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error(
      'EMAIL_FROM no está configurada. Debes definir un remitente verificado ' +
      'para enviar correos (ej. "Mi Plataforma <hola@midominio.com>").'
    );
  }
  const replyTo = process.env.EMAIL_REPLY_TO ?? undefined;
  return { from, replyTo };
}

/**
 * Envía un email genérico. Wrapper sobre resend.emails.send que centraliza
 * los defaults (from, reply_to) y el logging de errores.
 */
export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string; // Plain text fallback (recomendado para deliverability)
  tags?: { name: string; value: string }[]; // Para analytics en Resend dashboard
}

export interface SendEmailResult {
  id: string | null;
  error: string | null;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { from, replyTo } = getDefaultEmailConfig();
  const client = getResendClient();

  try {
    const { data, error } = await client.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      replyTo,
      tags: params.tags,
    });

    if (error) {
      console.error('[Resend] Error enviando email:', error);
      return { id: null, error: error.message ?? 'Error desconocido de Resend' };
    }

    return { id: data?.id ?? null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado';
    console.error('[Resend] Exception enviando email:', err);
    return { id: null, error: message };
  }
}