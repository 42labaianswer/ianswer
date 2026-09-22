 

// src/app/api/auth/forgot-password/route.ts
// ----------------------------------------------------------------------------
// POST /api/auth/forgot-password
//
// Body: { email: string }
//
// Genera un link de recuperación de contraseña usando Supabase Admin
// (sin pasar por el envío de email default de Supabase) y lo manda al
// usuario por Resend con nuestro template branded.
//
// Importante: SIEMPRE responde 200 incluso si el email no existe en la BD,
// para evitar leakage de información (técnica estándar de seguridad).
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../../../lib/resend';
import { buildPasswordResetEmail } from '../../../../lib/emails/password-reset-email';
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../../lib/rateLimit'

export const runtime = 'nodejs'; // Necesitamos service_role; no edge

// ─── Configuración ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL;

// ─── Helper de respuesta neutral ───────────────────────────────────────────
// Siempre devolvemos el mismo mensaje para no revelar si el email existe.
function neutralResponse() {
  return NextResponse.json({
    ok: true,
    message:
      'Si tu correo está registrado, recibirás un enlace para restablecer tu contraseña en los próximos minutos.',
  });
}

// ─── POST ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Límite de tasa: esta ruta es pública y cada llamada envía un correo.
  const rl = await checkRateLimit('forgot-password', clientKey(req))
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos antes de volver a pedir el enlace.' },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS['forgot-password']) }
    )
  }

  // 1. Validar configuración
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[forgot-password] Configuración Supabase incompleta');
    return NextResponse.json(
      { ok: false, error: 'Configuración del servidor incompleta' },
      { status: 500 }
    );
  }

  // 2. Validar body
  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'JSON inválido' },
      { status: 400 }
    );
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  // Validación básica de formato
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return NextResponse.json(
      { ok: false, error: 'Email inválido' },
      { status: 400 }
    );
  }

  // 3. Cliente admin de Supabase
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 4. Generar link de recuperación
  // generateLink con type='recovery' devuelve el link SIN enviar email automático.
  // Eso nos permite tomarlo y mandarlo por Resend con nuestro branding.
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${APP_BASE_URL}/reset-password`,
      },
    });

  // Si el email no existe en auth.users, Supabase devuelve error.
  // NO revelamos esto al cliente; siempre devolvemos la respuesta neutral.
  if (linkError) {
    console.warn('[forgot-password] generateLink falló (email puede no existir):', linkError.message);
    return neutralResponse();
  }

  const recoveryLink = linkData?.properties?.action_link;
  if (!recoveryLink) {
    console.error('[forgot-password] generateLink no devolvió action_link');
    return neutralResponse();
  }

  // 5. Enviar email vía Resend -- se manda DESPUÉS de responder (after()),
  // para no sumar la latencia de Resend al tiempo de respuesta de esta ruta.
  // Region mismatch Vercel(iad1)/Supabase(us-west-2) hace que cada round-trip
  // ya sea lento -- sacar este del camino crítico evita que la función se pase
  // del límite de ejecución de Vercel (10s en plan Hobby) y devuelva una
  // respuesta vacía/incompleta ("Unexpected end of JSON input" en el cliente).
  const { subject, html, text } = buildPasswordResetEmail({
    recoveryLink,
    recipientEmail: email,
    appName: 'iAnswer',
    expiresInHours: 1, // Supabase default
  });

  after(async () => {
  const sendResult = await sendEmail({
    to: email,
    subject,
    html,
    text,
    tags: [
      { name: 'category', value: 'auth' },
      { name: 'type', value: 'password_reset' },
    ],
  });

  if (sendResult.error) {
    // Loggeamos pero ya respondimos neutral al cliente
    console.error('[forgot-password] Resend falló:', sendResult.error);
  } else {
    console.log(`[forgot-password] Email enviado a ${email}, Resend ID: ${sendResult.id}`);
  }
  });

  return neutralResponse();
}
