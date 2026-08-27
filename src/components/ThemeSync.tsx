 

// src/components/ThemeSync.tsx
// ----------------------------------------------------------------------------
// Sprint N · Sincroniza las CSS variables --ia-theme / --ia-accent con el
// estado del workspace (Zustand) durante toda la sesión.
//
// El ThemeScript (en el <head>) hace la aplicación inicial ANTES del paint
// leyendo localStorage. Este componente cubre el resto del ciclo de vida:
//   - Cuando refreshWorkspace() trae datos frescos de Supabase
//   - Cuando el usuario cambia de industria primaria
//
// Es un componente "fantasma" (no renderiza nada visible), solo corre un
// useEffect que observa el primaryTemplate y actualiza las CSS vars.
//
// Con esto, cualquier componente puede usar `var(--ia-accent)` en su CSS y
// siempre estará correcto, sin depender del timing de React.
// ----------------------------------------------------------------------------

'use client';

import { useEffect } from 'react';
import { useWorkspace } from './WorkspaceContext';

export default function ThemeSync() {
  const primaryTemplate = useWorkspace((s) => s.primaryTemplate);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const theme = primaryTemplate?.theme_color || '#020617';
    const accent = primaryTemplate?.accent_color || '#4f46e5';

    root.style.setProperty('--ia-theme', theme);
    root.style.setProperty('--ia-accent', accent);
  }, [primaryTemplate?.theme_color, primaryTemplate?.accent_color]);

  return null;
}
