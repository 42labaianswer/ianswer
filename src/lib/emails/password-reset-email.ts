 

// src/lib/emails/password-reset-email.ts
// ----------------------------------------------------------------------------
// Template HTML del email de recuperación de contraseña.
// Estilo sobrio, sin emojis, branding, mobile-first.
// Probado en Gmail, Outlook web, Apple Mail, móvil.
// ----------------------------------------------------------------------------
import { loadPlatformBranding } from '../../lib/siteSettings'
export interface PasswordResetEmailParams {
  recoveryLink: string;
  recipientEmail: string;
  appName?: string;       // Default: "Plataforma"
  expiresInHours?: number; // Default: 1 (Supabase default es 1 hora)
}
  const branding = await loadPlatformBranding()
  const brandName = branding.name || 'Plataforma'
export function buildPasswordResetEmail(params: PasswordResetEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const appName = params.appName ?? '{brandName}';
  const expiresInHours = params.expiresInHours ?? 1;

  const subject = `Restablece tu contraseña de ${appName}`;

  // Plain text fallback (importante para deliverability + screen readers)
  const text = [
    `Hola,`,
    ``,
    `Recibimos una solicitud para restablecer la contraseña de tu cuenta de ${appName}`,
    `asociada a ${params.recipientEmail}.`,
    ``,
    `Para crear una nueva contraseña, abre el siguiente enlace:`,
    `${params.recoveryLink}`,
    ``,
    `Este enlace expira en ${expiresInHours} ${expiresInHours === 1 ? 'hora' : 'horas'}.`,
    ``,
    `Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña`,
    `actual sigue siendo válida y nadie tiene acceso a tu cuenta.`,
    ``,
    `Saludos,`,
    `Equipo de ${appName}`,
  ].join('\n');

  // HTML con inline styles (es la forma estándar para máxima compatibilidad
  // con clientes de correo; CSS externo / clases NO funcionan en Outlook).
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fafaf7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1c1917;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fafaf7;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">

          <!-- Header con marca -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; border-bottom: 1px solid #e7e5e4;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #78716c;">
                      ${escapeHtml(appName)}
                    </p>
                    <h1 style="margin: 6px 0 0 0; font-size: 22px; font-weight: 700; color: #1c1917; line-height: 1.3;">
                      Restablece tu contraseña
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #1c1917;">
                Hola,
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #44403c;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta de
                <strong style="color: #1c1917;">${escapeHtml(appName)}</strong>
                asociada a <strong style="color: #1c1917;">${escapeHtml(params.recipientEmail)}</strong>.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #44403c;">
                Para crear una nueva contraseña, haz clic en el siguiente botón:
              </p>

              <!-- Botón principal -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="left" style="margin: 0 0 24px 0;">
                <tr>
                  <td bgcolor="#0f172a" style="border-radius: 8px;">
                    <a href="${escapeHtmlAttr(params.recoveryLink)}"
                       style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                      Restablecer contraseña
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.6; color: #78716c;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 13px; line-height: 1.6; color: #57534e; word-break: break-all;">
                <a href="${escapeHtmlAttr(params.recoveryLink)}" style="color: #0f172a; text-decoration: underline;">${escapeHtml(params.recoveryLink)}</a>
              </p>

              <!-- Aviso de expiración -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 24px; background-color: #f5f5f4; border-radius: 8px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #57534e;">
                      Este enlace expira en <strong style="color: #1c1917;">${expiresInHours} ${expiresInHours === 1 ? 'hora' : 'horas'}</strong>.
                      Después tendrás que solicitar uno nuevo.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.6; color: #78716c;">
                Si no solicitaste este cambio, puedes ignorar este correo. Tu contraseña
                actual sigue siendo válida y nadie tiene acceso a tu cuenta.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e7e5e4; background-color: #fafaf7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a8a29e; text-align: center;">
                Este mensaje fue enviado por ${escapeHtml(appName)}.<br>
                Si tienes alguna duda, responde a este correo y un humano te atenderá.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

// ─── Helpers de escape ──────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(s: string): string {
  // En atributos solo necesitamos escapar comillas y &
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
