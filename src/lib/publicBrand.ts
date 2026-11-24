// Colores de las páginas públicas (menú en línea, seguimiento de pedido).
// Son marca blanca: si el negocio eligió sus colores se usan esos; si no, los
// de iAnswer (--ia-theme y --ia-accent, que fija ThemeScript en todo el sitio).

/** Valores por omisión de companies.primary_color y secondary_color: equivalen a "no eligió". */
const DEFAULT_PRIMARY = '#0f172a'
const DEFAULT_SECONDARY = '#64748b'

const isCustom = (color: string | null | undefined, fallback: string) =>
  !!color && color.trim() !== '' && color.trim().toLowerCase() !== fallback

export function publicBrandColors(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): { primary: string; accent: string } {
  const hasPrimary = isCustom(primary, DEFAULT_PRIMARY)
  const hasSecondary = isCustom(secondary, DEFAULT_SECONDARY)
  return {
    primary: hasPrimary ? primary!.trim() : 'var(--ia-theme)',
    accent: hasSecondary ? secondary!.trim() : hasPrimary ? primary!.trim() : 'var(--ia-accent)',
  }
}

/** Fondo suave a partir de un color (hex o var(...)). */
export function tint(color: string, percent = 12): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}
