// src/lib/emails/password-reset-email.ts
// ----------------------------------------------------------------------------
// Correo de recuperación de contraseña. Usa el layout compartido (layout.ts) —
// mismo estilo que el del código de verificación.
// ----------------------------------------------------------------------------

import { escapeHtml, escapeHtmlAttr, plainTextFooter, renderEmailLayout, small, strong } from './layout';

export interface PasswordResetEmailParams {
  recoveryLink: string;
  recipientEmail: string;
  appName?: string;       // Default: "Plataforma"
  expiresInHours?: number; // Default: 1 (Supabase default es 1 hora)
}

export function buildPasswordResetEmail(params: PasswordResetEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const appName = params.appName ?? 'Plataforma';
  const expiresInHours = params.expiresInHours ?? 1;
  const expiresLabel = `${expiresInHours} ${expiresInHours === 1 ? 'hora' : 'horas'}`;

  const subject = `Restablece tu contraseña de ${appName}`;
  const footerReason = `Recibiste este correo porque se pidió restablecer la contraseña de la cuenta de ${appName} asociada a ${params.recipientEmail}.`;

  // Plain text fallback (importante para deliverability + screen readers)
  const text = [
    `Restablece tu contraseña de ${appName}`,
    ``,
    `Recibimos una solicitud para restablecer la contraseña de tu cuenta`,
    `asociada a ${params.recipientEmail}.`,
    ``,
    `Para crear una nueva contraseña, abre este enlace:`,
    `${params.recoveryLink}`,
    ``,
    `Nota: el enlace expira en ${expiresLabel}.`,
    ``,
    `Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña`,
    `actual sigue siendo válida y nadie tiene acceso a tu cuenta.`,
    ``,
    plainTextFooter(footerReason),
  ].join('\n');

  const html = renderEmailLayout({
    preheader: `Crea una nueva contraseña para tu cuenta de ${appName}. El enlace expira en ${expiresLabel}.`,
    title: 'Restablece tu contraseña',
    introHtml: `Recibimos una solicitud para restablecer la contraseña de la cuenta asociada a ${strong(escapeHtml(params.recipientEmail))}.`,
    highlight: { type: 'button', label: 'Crear nueva contraseña', href: params.recoveryLink },
    notesHtml: [
      `${strong('Nota:')} el enlace expira en ${expiresLabel}.`,
      small(`Si no solicitaste este cambio, ignora este correo. Tu contraseña actual sigue siendo válida.`),
    ],
    afterHtml: `<p class="ia-muted" style="margin: 0 0 6px 0; font-family: 'Plus Jakarta Sans', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.6; color: #6B6E80; text-align: center;">¿El botón no funciona? Copia y pega este enlace en tu navegador:</p>
              <p style="margin: 0; font-family: 'Plus Jakarta Sans', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.6; text-align: center; word-break: break-all;"><a href="${escapeHtmlAttr(params.recoveryLink)}" class="ia-a" style="color: #5B2BE8; text-decoration: underline;">${escapeHtml(params.recoveryLink)}</a></p>`,
    footerReason,
  });

  return { subject, html, text };
}
