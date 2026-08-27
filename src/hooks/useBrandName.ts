// hooks/useBrandName.ts
import { useWorkspace } from '../components/WorkspaceContext'
/**
 * Hook para obtener el nombre de la marca en componentes cliente.
 * Usa el workspace que ya tiene la info de platform_settings.
 */
export function useBrandName(): string {
  const platform = useWorkspace((state) => state.platform)
  return platform.name || 'Plataforma'
}

/**
 * Versión síncrona para reemplazar en textos ya con el brandName en mano.
 */
export function replaceBrandInText(text: string, brandName: string): string {
  return text.replace(/\bPlataforma\b/gi, brandName)
}