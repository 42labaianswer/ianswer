 

// src/components/ServerThemeHydrator.tsx
// ----------------------------------------------------------------------------
// Sprint N2 · Puente server → cliente para el theme.
//
// El dashboard layout (Server Component) resuelve la industria desde la BD con
// getServerTheme() y pasa el resultado a este componente. Aquí, en el primer
// render del cliente, llamamos hydrateServerTheme() para que el store de
// Zustand arranque ya con el nombre/icono/colores correctos de la industria.
//
// Resultado: el Sidebar muestra el branding correcto desde el primer frame,
// sin el "PLATAFORMA" genérico ni el ícono Zap por defecto.
//
// Usa useState(() => ...) para ejecutar la hidratación UNA sola vez, de forma
// síncrona en el primer render (antes del efecto), minimizando cualquier flash.
// ----------------------------------------------------------------------------

'use client';

import { useState } from 'react';
import { useWorkspace } from './WorkspaceContext';
import type { ServerTheme } from '../lib/getServerTheme';

export default function ServerThemeHydrator({ theme }: { theme: ServerTheme }) {
  // Solo hidratamos si el servidor realmente resolvió una industria.
  useState(() => {
    if (!theme.resolved) return null;
    // getState() para no suscribirnos ni causar renders extra.
    useWorkspace.getState().hydrateServerTheme({
      theme_color: theme.theme_color,
      accent_color: theme.accent_color,
      template_name: theme.template_name,
      template_icon: theme.template_icon,
      tenant_label: theme.tenant_label,
    });
    return null;
  });

  return null;
}
