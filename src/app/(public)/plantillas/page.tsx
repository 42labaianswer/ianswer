 

// ============================================================================
// src/app/(public)/plantillas/page.tsx
// ----------------------------------------------------------------------------
// "Plantillas" e "industrias" son el mismo concepto: esta ruta redirige a
// /industrias para que los enlaces existentes sigan funcionando.
// ============================================================================

import { redirect } from 'next/navigation'

export default function PlantillasRedirect() {
  redirect('/industrias')
}
