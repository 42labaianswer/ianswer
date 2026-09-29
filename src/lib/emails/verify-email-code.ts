// src/lib/emails/verify-email-code.ts
// ----------------------------------------------------------------------------
// Correo con el código de verificación de registro. Usa el layout compartido
// (layout.ts) — mismo estilo que el de recuperación de contraseña.
// ----------------------------------------------------------------------------

import { escapeHtml, plainTextFooter, renderEmailLayout, small, strong } from './layout';

export interface VerificationCodeEmailParams {
  code: string;
  recipientEmail: string;
  appName?: string;          // Default: "Plataforma"
  expiresInMinutes?: number; // Default: 15
}

export function buildVerificationCodeEmail(params: VerificationCodeEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const appName = params.appName ?? 'Plataforma';
  const expiresInMinutes = params.expiresInMinutes ?? 15;

  const subject = `Tu código de verificación de ${appName}`;
  const footerReason = `Recibiste este correo porque alguien intentó crear una cuenta en ${appName} con ${params.recipientEmail}.`;

  const text = [
    `Tu código de verificación de ${appName}:`,
    ``,
    `  ${params.code}`,
    ``,
    `Escríbelo en la pantalla de registro para confirmar tu correo (${params.recipientEmail}).`,
    `Nunca compartas este código con nadie.`,
    `Nota: el código expira en ${expiresInMinutes} minutos.`,
    ``,
    `Si no fuiste tú quien intentó crear esta cuenta, puedes ignorar este correo:`,
    `no se creará ninguna cuenta sin verificar este código.`,
    ``,
    plainTextFooter(footerReason),
  ].join('\n');

  const html = renderEmailLayout({
    preheader: `Tu código es ${params.code}. Expira en ${expiresInMinutes} minutos.`,
    title: 'Este es tu código de verificación',
    introHtml: `Escríbelo en la pantalla de registro para confirmar tu correo ${strong(escapeHtml(params.recipientEmail))}.`,
    highlight: { type: 'code', value: params.code },
    notesHtml: [
      'Nunca compartas este código con nadie.',
      `${strong('Nota:')} el código expira en ${expiresInMinutes} minutos.`,
      small(`Si no fuiste tú, ignora este correo: no se creará ninguna cuenta sin este código.`),
    ],
    footerReason,
  });

  return { subject, html, text };
}
