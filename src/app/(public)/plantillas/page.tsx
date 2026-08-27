 

// ============================================================================
// src/app/(public)/plantillas/page.tsx
// ----------------------------------------------------------------------------
// Esta ruta antiguamente listaba "plantillas". Ahora el concepto se unificó
// con "industrias" — los enlaces viejos se redirigen.
// ============================================================================

import { redirect } from 'next/navigation'

export default function PlantillasRedirect() {
  redirect('/industrias')
}
