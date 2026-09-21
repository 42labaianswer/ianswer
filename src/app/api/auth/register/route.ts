// src/app/api/auth/register/route.ts
// ----------------------------------------------------------------------------
// POST /api/auth/register
//
// Body: { email: string, password: string }
//
// Crea la cuenta con el cliente admin de Supabase (email_confirm: false, sin
// disparar el correo de confirmación por defecto de Supabase) y manda un
// código de 6 dígitos por Resend con plantilla propia -- mismo criterio que
// /api/auth/forgot-password.
//
// Si el correo ya existe pero todavía no se verificó (intento anterior
// abandonado), se trata como un reintento: se actualiza la contraseña por si
// la cambiaron y se manda un código nuevo, en vez de rechazarlo.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { sendEmail } from '../../../../lib/resend';
import { buildVerificationCodeEmail } from '../../../../lib/emails/verify-email-code';
import { loadPlatformBranding } from '../../../../lib/siteSettings';
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../../lib/rateLimit';

export const runtime = 'nodejs'; // Necesitamos service_role; no edge

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CODE_EXPIRES_MINUTES = 15;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit('signup', clientKey(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS['signup']) }
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[register] Configuración Supabase incompleta');
    return NextResponse.json({ error: 'Configuración del servidor incompleta' }, { status: 500 });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, { status: 400 });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId: string | null = null;

  // 1. Crear la cuenta sin confirmar (esto ya dispara el trigger que crea
  //    company + profile -- ver handle_new_user en database/schema.sql).
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });

  if (createError) {
    // ¿Ya existe una cuenta con este correo? Puede ser una cuenta confirmada
    // (error real) o un intento de registro anterior sin terminar (permitir
    // reintentar: actualiza contraseña + manda un código nuevo).
    const yaExiste =
      (createError as { code?: string }).code === 'email_exists' ||
      /already been registered|already registered|already exists/i.test(createError.message || '');

    if (!yaExiste) {
      console.error('[register] createUser falló:', createError.message);
      return NextResponse.json({ error: 'No se pudo crear la cuenta. Intenta de nuevo.' }, { status: 500 });
    }

    const { data: profileRow } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (!profileRow?.id) {
      // No debería pasar (createUser dijo que ya existe), pero por si acaso.
      return NextResponse.json(
        { error: 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.' },
        { status: 409 }
      );
    }

    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(profileRow.id);
    if (existingUser?.user?.email_confirmed_at) {
      return NextResponse.json(
        { error: 'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.' },
        { status: 409 }
      );
    }

    // Cuenta pendiente de verificar: reintento válido. Actualizamos la
    // contraseña por si la cambiaron entre intentos.
    await supabaseAdmin.auth.admin.updateUserById(profileRow.id, { password });
    userId = profileRow.id;
  } else {
    userId = created.user?.id ?? null;
  }

  if (!userId) {
    console.error('[register] no se obtuvo userId tras crear/reutilizar la cuenta');
    return NextResponse.json({ error: 'No se pudo crear la cuenta. Intenta de nuevo.' }, { status: 500 });
  }

  // 2. Generar y guardar el código (hasheado, no en texto plano).
  const code = generateCode();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + CODE_EXPIRES_MINUTES * 60 * 1000).toISOString();

  const { error: upsertError } = await supabaseAdmin
    .from('email_verification_codes')
    .upsert(
      { user_id: userId, email, code_hash: codeHash, attempts: 0, expires_at: expiresAt },
      { onConflict: 'user_id' }
    );

  if (upsertError) {
    console.error('[register] no se pudo guardar el código:', upsertError.message);
    return NextResponse.json({ error: 'No se pudo generar el código de verificación. Intenta de nuevo.' }, { status: 500 });
  }

  // 3. Enviar el código por Resend con la plantilla de marca.
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
      { name: 'type', value: 'signup_verification' },
    ],
  });

  if (sendResult.error) {
    console.error('[register] Resend falló:', sendResult.error);
    return NextResponse.json(
      { error: 'La cuenta se creó pero no pudimos enviar el correo con el código. Usa "Reenviar código" en unos segundos.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
