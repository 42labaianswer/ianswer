// src/lib/emails/verify-email-code.ts
// ----------------------------------------------------------------------------
// Template HTML del correo con el código de verificación de registro.
// Mismo estilo que password-reset-email.ts (sobrio, sin emojis, mobile-first,
// probado en Gmail/Outlook/Apple Mail) pero mostrando un código en vez de un
// botón con link.
// ----------------------------------------------------------------------------

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

  const text = [
    `Hola,`,
    ``,
    `Recibimos una solicitud para crear una cuenta en ${appName}`,
    `con el correo ${params.recipientEmail}.`,
    ``,
    `Tu código de verificación es:`,
    ``,
    `  ${params.code}`,
    ``,
    `Escríbelo en la pantalla de registro para confirmar tu correo.`,
    `Este código expira en ${expiresInMinutes} minutos.`,
    ``,
    `Si no fuiste tú quien intentó crear esta cuenta, puedes ignorar este`,
    `correo -- no se creará ninguna cuenta sin verificar este código.`,
    ``,
    `Saludos,`,
    `Equipo de ${appName}`,
  ].join('\n');

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
                      Confirma tu correo
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
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #44403c;">
                Recibimos una solicitud para crear una cuenta en
                <strong style="color: #1c1917;">${escapeHtml(appName)}</strong>
                con el correo <strong style="color: #1c1917;">${escapeHtml(params.recipientEmail)}</strong>.
                Usa este código para confirmarlo:
              </p>

              <!-- Código -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" bgcolor="#f5f5f4" style="border-radius: 12px; padding: 24px;">
                    <p style="margin: 0; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0f172a; font-family: 'Courier New', Courier, monospace;">
                      ${escapeHtml(params.code)}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Aviso de expiración -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 8px; background-color: #f5f5f4; border-radius: 8px;">
                <tr>
                  <td style="padding: 14px 16px;">
                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #57534e;">
                      Este código expira en <strong style="color: #1c1917;">${expiresInMinutes} minutos</strong>.
                      Después tendrás que pedir uno nuevo.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.6; color: #78716c;">
                Si no fuiste tú quien intentó crear esta cuenta, puedes ignorar este correo --
                no se creará ninguna cuenta sin verificar este código.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #e7e5e4; background-color: #fafaf7; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a8a29e; text-align: center;">
                Este mensaje fue enviado por ${escapeHtml(appName)}.<br>
                Si tienes alguna duda, responde a este correo y nosotros te contactaremos.
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
