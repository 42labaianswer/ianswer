// src/lib/emails/layout.ts
// ----------------------------------------------------------------------------
// Layout base compartido de los correos transaccionales de iAnswer.
// Estructura tomada de la referencia de Hostinger
// (tarjeta centrada, logo arriba, título claro, código o botón destacado, pie
// con avisos y enlaces), con la marca de iAnswer (README del paquete de logo):
// indigo #5B2BE8, ink #14162B, Plus Jakarta Sans con fallback Helvetica/Arial.
//
// Reglas de correo HTML que sigue:
// - Maquetado con tablas y estilos inline (Outlook ignora CSS externo/clases).
// - Ancho máximo 600 px.
// - Nada de SVG: el logo es un PNG alojado en ianswer.pro (public/email/).
//   Se usa el ícono de app (tile indigo con la "i" blanca) porque se ve igual
//   en modo claro y oscuro; el símbolo transparente tiene el asta en ink y
//   desaparece cuando el cliente invierte colores.
// - Arriba: ícono y debajo "iAnswer" como texto vivo en un solo color (ink).
//   En el pie solo va el texto, sin ícono.
// - El código de verificación es texto real (se puede seleccionar y copiar).
// ----------------------------------------------------------------------------

// Los assets se sirven siempre desde producción: un cliente de correo no puede
// descargar imágenes de localhost. Hasta que public/email/ esté desplegado, los
// correos de prueba mostrarán el texto alternativo en lugar del ícono.
const ASSETS_BASE = 'https://ianswer.pro'
const SITE = 'https://ianswer.pro'

const C = {
  indigo: '#5B2BE8',
  ink: '#14162B',
  text: '#3F4254',
  muted: '#6B6E80',
  faint: '#9A9CAB',
  border: '#E6E6EE',
  bg: '#F4F4F7',
  card: '#FFFFFF',
  codeBg: '#F7F5FF',
}

const FONT = `'Plus Jakarta Sans', Helvetica, Arial, sans-serif`

export type EmailHighlight =
  | { type: 'code'; value: string }
  | { type: 'button'; label: string; href: string }

export interface EmailLayoutParams {
  /** Texto oculto que Gmail/Outlook muestran como vista previa en la bandeja. */
  preheader: string
  title: string
  /** HTML ya escapado del párrafo principal. */
  introHtml: string
  highlight: EmailHighlight
  /** Líneas cortas debajo del código/botón (HTML ya escapado). */
  notesHtml?: string[]
  /** Bloque opcional extra, p. ej. el enlace de respaldo del botón (HTML ya escapado). */
  afterHtml?: string
  /** Por qué recibe este correo (texto plano, se escapa aquí). */
  footerReason: string
}

export function renderEmailLayout(p: EmailLayoutParams): string {
  const highlight = p.highlight.type === 'code'
    ? codeBlock(p.highlight.value)
    : buttonBlock(p.highlight.label, p.highlight.href)

  const notes = (p.notesHtml || [])
    .map(n => `<p class="ia-text" style="margin: 0 0 10px 0; font-family: ${FONT}; font-size: 14px; line-height: 1.6; color: ${C.text}; text-align: center;">${n}</p>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(p.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  /* Apple Mail / iOS / Outlook.com respetan esto; Gmail aplica su propia inversión. */
  @media (prefers-color-scheme: dark) {
    .ia-bg { background-color: #0B0D1A !important; }
    .ia-card { background-color: #15172A !important; border-color: #2A2D45 !important; }
    .ia-ink { color: #FFFFFF !important; }
    .ia-text { color: #C9CAD6 !important; }
    .ia-muted { color: #9A9CAB !important; }
    .ia-code { background-color: #1E2038 !important; border-color: #3A3D60 !important; }
    .ia-code-text { color: #A88CFF !important; }
    .ia-a { color: #A88CFF !important; }
    .ia-rule { border-color: #2A2D45 !important; }
  }
  [data-ogsc] .ia-ink { color: #FFFFFF !important; }
  [data-ogsc] .ia-text { color: #C9CAD6 !important; }
  [data-ogsc] .ia-code-text { color: #A88CFF !important; }
  @media only screen and (max-width: 620px) {
    .ia-pad { padding-left: 24px !important; padding-right: 24px !important; }
    .ia-title { font-size: 22px !important; }
    .ia-code-text { font-size: 30px !important; letter-spacing: 6px !important; }
  }
</style>
</head>
<body class="ia-bg" style="margin: 0; padding: 0; background-color: ${C.bg}; -webkit-text-size-adjust: 100%;">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; color: ${C.bg};">${escapeHtml(p.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" class="ia-bg" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${C.bg};">
    <tr>
      <td align="center" style="padding: 32px 12px;">
        <table role="presentation" class="ia-card" cellspacing="0" cellpadding="0" border="0" width="600" style="width: 100%; max-width: 600px; background-color: ${C.card}; border: 1px solid ${C.border}; border-radius: 16px;">

          <!-- Logo -->
          <tr>
            <td align="center" class="ia-pad" style="padding: 40px 48px 8px 48px;">
              ${logoHeader()}
            </td>
          </tr>

          <!-- Título -->
          <tr>
            <td align="center" class="ia-pad" style="padding: 24px 48px 8px 48px;">
              <h1 class="ia-ink ia-title" style="margin: 0; font-family: ${FONT}; font-size: 26px; font-weight: 800; line-height: 1.25; color: ${C.ink}; letter-spacing: -0.3px;">${escapeHtml(p.title)}</h1>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td align="center" class="ia-pad" style="padding: 8px 48px 24px 48px;">
              <p class="ia-text" style="margin: 0; font-family: ${FONT}; font-size: 15px; line-height: 1.6; color: ${C.text}; text-align: center;">${p.introHtml}</p>
            </td>
          </tr>

          <!-- Código o botón -->
          <tr>
            <td align="center" class="ia-pad" style="padding: 0 48px 24px 48px;">
              ${highlight}
            </td>
          </tr>

          <!-- Avisos -->
          ${notes ? `<tr><td class="ia-pad ia-text" style="padding: 0 48px 16px 48px;">${notes}</td></tr>` : ''}
          ${p.afterHtml ? `<tr><td class="ia-pad" style="padding: 0 48px 24px 48px;">${p.afterHtml}</td></tr>` : ''}

          <!-- Separador -->
          <tr>
            <td class="ia-pad" style="padding: 8px 48px 0 48px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td class="ia-rule" style="border-top: 1px solid ${C.border}; font-size: 0; line-height: 0;">&nbsp;</td></tr></table>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td align="center" class="ia-pad" style="padding: 28px 48px 36px 48px;">
              ${wordmark(16)}
              <p class="ia-muted" style="margin: 16px 0 0 0; font-family: ${FONT}; font-size: 12px; line-height: 1.6; color: ${C.muted}; text-align: center;">${escapeHtml(p.footerReason)}</p>
              <p style="margin: 16px 0 0 0; font-family: ${FONT}; font-size: 12px; line-height: 1.6; text-align: center;">
                <a class="ia-muted" href="${SITE}/legal/privacidad" style="color: ${C.muted}; text-decoration: underline;">Aviso de privacidad</a>
                <span class="ia-muted" style="color: ${C.faint};">&nbsp;|&nbsp;</span>
                <a class="ia-muted" href="${SITE}/legal/terminos" style="color: ${C.muted}; text-decoration: underline;">Términos</a>
                <span class="ia-muted" style="color: ${C.faint};">&nbsp;|&nbsp;</span>
                <a class="ia-muted" href="${SITE}/recursos/ayuda" style="color: ${C.muted}; text-decoration: underline;">Centro de ayuda</a>
              </p>
              <p class="ia-muted" style="margin: 12px 0 0 0; font-family: ${FONT}; font-size: 12px; line-height: 1.6; color: ${C.faint}; text-align: center;">&copy; ${new Date().getFullYear()} iAnswer</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Fragmentos de texto para intro/avisos con su versión de modo oscuro (un color
// inline fijo, p. ej. ink, desaparece sobre el fondo oscuro de Apple Mail).
export function strong(html: string): string {
  return `<strong class="ia-ink" style="color: ${C.ink};">${html}</strong>`
}
export function small(html: string): string {
  return `<span class="ia-muted" style="font-size: 13px; color: ${C.muted};">${html}</span>`
}

// Pie común para la versión de texto plano.
export function plainTextFooter(reason: string): string {
  return [
    '--',
    'iAnswer',
    reason,
    `Aviso de privacidad: ${SITE}/legal/privacidad`,
    `Centro de ayuda: ${SITE}/recursos/ayuda`,
  ].join('\n')
}

// ─── Bloques ───────────────────────────────────────────────────────────────

function logoHeader(): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td align="center">
                    <img src="${ASSETS_BASE}/email/ianswer-icon.png" width="48" height="48" alt="iAnswer" style="display: block; width: 48px; height: 48px; border: 0; border-radius: 12px;">
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 10px;">
                    ${wordmark(20)}
                  </td>
                </tr>
              </table>`
}

function wordmark(textPx: number): string {
  return `<span class="ia-ink" style="font-family: ${FONT}; font-size: ${textPx}px; line-height: 1; font-weight: 700; letter-spacing: -0.02em; color: ${C.ink}; white-space: nowrap;">iAnswer</span>`
}

function codeBlock(code: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 420px;">
                <tr>
                  <td align="center" class="ia-code" style="padding: 22px 16px; background-color: ${C.codeBg}; border: 1px solid ${C.border}; border-radius: 14px;">
                    <span class="ia-code-text" style="font-family: ${FONT}; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: ${C.indigo}; -webkit-user-select: all; user-select: all;">${escapeHtml(code)}</span>
                  </td>
                </tr>
              </table>`
}

function buttonBlock(label: string, href: string): string {
  // Botón "a prueba de Outlook": el color va en la celda (bgcolor) y en el <a>.
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td align="center" bgcolor="${C.indigo}" style="border-radius: 12px; background-color: ${C.indigo};">
                    <a href="${escapeHtmlAttr(href)}" target="_blank" style="display: inline-block; padding: 15px 32px; font-family: ${FONT}; font-size: 15px; font-weight: 700; color: #FFFFFF; text-decoration: none; border-radius: 12px;">${escapeHtml(label)}</a>
                  </td>
                </tr>
              </table>`
}

// ─── Helpers de escape ─────────────────────────────────────────────────────
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
