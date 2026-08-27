 

// src/components/ServerThemeStyle.tsx
// ----------------------------------------------------------------------------
// Sprint N2 · Inyecta las CSS variables del theme YA RESUELTO en el servidor.
//
// Este es un Server Component (sin 'use client'). Recibe el theme que
// getServerTheme() resolvió desde la BD y lo escribe como un <style> inline
// en el HTML inicial. Como viene en el primer byte del servidor, el navegador
// aplica los colores ANTES de ejecutar cualquier JS.
//
// Combinado con el ThemeScript (localStorage), tenemos doble garantía:
//   - Server-resuelto: funciona incluso con JS deshabilitado o cache limpio
//   - localStorage: cubre navegaciones cliente-side subsecuentes
// ----------------------------------------------------------------------------

import type { ServerTheme } from '../lib/getServerTheme';

export default function ServerThemeStyle({ theme }: { theme: ServerTheme }) {
  // Inyectamos las CSS vars directo en :root vía <style>. El servidor ya
  // resolvió los valores, así que el HTML llega con los colores correctos.
  const css = `:root{--ia-theme:${theme.theme_color};--ia-accent:${theme.accent_color};}`;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
