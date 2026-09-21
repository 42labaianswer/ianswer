// src/app/api/auth/verify-code/route.ts
// ----------------------------------------------------------------------------
// POST /api/auth/verify-code
//
// Body: { email: string, code: string }
//
// Valida el código de 6 dígitos contra el hash guardado en
// email_verification_codes. Si coincide, marca el correo como confirmado
// (email_confirm: true) con el cliente admin -- el cliente (navegador) es
// quien después llama a supabase.auth.signInWithPassword() para obtener la
// sesión, con las credenciales que el usuario ya escribió en el paso 1.
//
// Protección contra fuerza bruta del código: máximo 5 intentos por código
// (columna `attempts`), además del rate limit por IP de abajo.
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../../lib/rateLimit';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit('signup-verify-code', clientKey(req));
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS['signup-verify-code']) }
    );
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[verify-code] Configuración Supabase incompleta');
    return NextResponse.json({ error: 'Configuración del servidor incompleta' }, { status: 500 });
  }

  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';

  if (!email || !code) {
    return NextResponse.json({ error: 'Faltan datos.' }, { status: 400 });
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
    return NextResponse.json({ error: 'No encontramos una cuenta pendiente de verificar con ese correo.' }, { status: 404 });
  }

  const { data: codeRow } = await supabaseAdmin
    .from('email_verification_codes')
    .select('id, code_hash, attempts, expires_at')
    .eq('user_id', profileRow.id)
    .maybeSingle();

  if (!codeRow) {
    return NextResponse.json({ error: 'No hay un código pendiente para este correo. Solicita uno nuevo.' }, { status: 404 });
  }

  if (new Date(codeRow.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from('email_verification_codes').delete().eq('id', codeRow.id);
    return NextResponse.json({ error: 'El código expiró. Solicita uno nuevo.' }, { status: 410 });
  }

  if (codeRow.attempts >= MAX_ATTEMPTS) {
    await supabaseAdmin.from('email_verification_codes').delete().eq('id', codeRow.id);
    return NextResponse.json({ error: 'Demasiados intentos con este código. Solicita uno nuevo.' }, { status: 429 });
  }

  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  if (codeHash !== codeRow.code_hash) {
    await supabaseAdmin
      .from('email_verification_codes')
      .update({ attempts: codeRow.attempts + 1 })
      .eq('id', codeRow.id);

    const restantes = MAX_ATTEMPTS - (codeRow.attempts + 1);
    return NextResponse.json(
      {
        error:
          restantes > 0
            ? `Código incorrecto. Te quedan ${restantes} ${restantes === 1 ? 'intento' : 'intentos'}.`
            : 'Código incorrecto. Solicita uno nuevo.',
      },
      { status: 400 }
    );
  }

  // Código correcto: consumirlo y confirmar el correo.
  await supabaseAdmin.from('email_verification_codes').delete().eq('id', codeRow.id);

  const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(profileRow.id, {
    email_confirm: true,
  });

  if (confirmError) {
    console.error('[verify-code] no se pudo confirmar el correo:', confirmError.message);
    return NextResponse.json({ error: 'No se pudo verificar tu cuenta. Intenta de nuevo.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
