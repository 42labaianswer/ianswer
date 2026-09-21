// src/app/api/auth/resend-code/route.ts
// ----------------------------------------------------------------------------
// POST /api/auth/resend-code
//
// Body: { email: string }
//
// Reenvía el código de verificación de registro (reemplaza el anterior).
// Solo tiene sentido llamarlo desde la pantalla de "revisa tu correo" que
// aparece justo después de registrarse con ese correo, así que -a diferencia
// de /api/auth/forgot-password- sí es correcto decir directamente si la
// cuenta no existe o ya está verificada (no hay riesgo real de enumeración
// en ese contexto).
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendEmail } from '../../../../lib/resend';
import { buildVerificationCodeEmail } from '../../../../lib/emails/verify-email-code';
import { loadPlatformBranding } from '../../../../lib/siteSettings';
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../../lib/rateLimit';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CODE_EXPIRES_MINUTES = 15;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit('signup-resend-code', clientKey(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados reenvíos. Espera unos minutos antes de volver a intentar.' },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS['signup-resend-code']) }
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[resend-code] Configuración Supabase incompleta');
    return NextResponse.json({ error: 'Configuración del servidor incompleta' }, { status: 500 });
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profileRow } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (!profileRow?.id) {
    return NextResponse.json(
      { error: 'No encontramos una cuenta pendiente de verificar con ese correo.' },
      { status: 404 }
    );
  }

  const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(profileRow.id);
  if (existingUser?.user?.email_confirmed_at) {
    return NextResponse.json(
      { error: 'Esta cuenta ya está verificada. Inicia sesión.' },
      { status: 409 }
    );
  }

  const code = generateCode();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + CODE_EXPIRES_MINUTES * 60 * 1000).toISOString();

  const { error: upsertError } = await supabaseAdmin
    .from('email_verification_codes')
    .upsert(
      { user_id: profileRow.id, email, code_hash: codeHash, attempts: 0, expires_at: expiresAt },
      { onConflict: 'user_id' }
    );

  if (upsertError) {
    console.error('[resend-code] no se pudo guardar el código:', upsertError.message);
    return NextResponse.json({ error: 'No se pudo reenviar el código. Intenta de nuevo.' }, { status: 500 });
  }

  const branding = await loadPlatformBranding();
  const { subject, html, text } = buildVerificationCodeEmail({
    code,
    recipientEmail: email,
    appName: branding.name || 'iAnswer',
    expiresInMinutes: CODE_EXPIRES_MINUTES,
  });

  const sendResult = await sendEmail({
    to: email,
    subject,
    html,
    text,
    tags: [
      { name: 'category', value: 'auth' },
      { name: 'type', value: 'signup_verification_resend' },
    ],
  });

  if (sendResult.error) {
    console.error('[resend-code] Resend falló:', sendResult.error);
    return NextResponse.json({ error: 'No pudimos reenviar el correo. Intenta de nuevo en unos segundos.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
