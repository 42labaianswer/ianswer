 

// src/lib/getServerTheme.ts
// ----------------------------------------------------------------------------
// Sprint N2 · Resuelve el theme de la industria EN EL SERVIDOR.
//
// Por qué existe:
//   El theme (theme_color / accent_color) vivía 100% en el cliente (Zustand +
//   fetch). El servidor mandaba HTML con el sidebar genérico, y el navegador
//   tenía que hidratar JS + fetchear antes de aplicar el theme correcto. Con
//   Cmd+Shift+R (que descarta cache de red) el JS tarda más → se ve el
//   "pre-tema" genérico encima del cual se pinta el real.
//
// Solución:
//   Este helper lee la cookie de sesión en el Server Component, saca la
//   company del usuario y su industria primaria, y devuelve el theme YA
//   RESUELTO. El layout lo inyecta en el HTML inicial (CSS vars en el <html>),
//   así el primer byte que recibe el navegador ya trae los colores correctos.
//   Sin JS, sin hidratación, sin flash.
// ----------------------------------------------------------------------------

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface ServerTheme {
  theme_color: string;
  accent_color: string;
  template_name: string | null;
  template_icon: string | null;
  tenant_label: string | null;
  resolved: boolean; // true si vino de la BD, false si es el default genérico
}

const DEFAULT_THEME: ServerTheme = {
  theme_color: '#020617',
  accent_color: '#4f46e5',
  template_name: null,
  template_icon: null,
  tenant_label: 'Plataforma',
  resolved: false,
};

/**
 * Lee la sesión del servidor y resuelve el theme de la industria primaria.
 * Se llama desde el Server Component del dashboard layout.
 *
 * Nunca lanza: ante cualquier error devuelve el theme genérico con resolved=false.
 */
export async function getServerTheme(): Promise<ServerTheme> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (n: string) => cookieStore.get(n)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return DEFAULT_THEME;

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.company_id) return DEFAULT_THEME;

    const { data: ent } = await supabase.rpc('get_company_entitlements', {
      p_company_id: profile.company_id,
    });

    if (!ent) return DEFAULT_THEME;

    const templates = ((ent as { templates?: unknown[] }).templates || []) as Array<{
      id: string;
      name?: string;
      icon?: string;
      is_primary?: boolean;
      theme_color?: string;
      accent_color?: string;
      tenant_label?: string;
    }>;

    const primary = templates.find((t) => t.is_primary) || templates[0];

    if (!primary) return DEFAULT_THEME;

    return {
      theme_color: primary.theme_color || DEFAULT_THEME.theme_color,
      accent_color: primary.accent_color || DEFAULT_THEME.accent_color,
      template_name: primary.name || null,
      template_icon: primary.icon || null,
      tenant_label: primary.tenant_label || 'Plataforma',
      resolved: true,
    };
  } catch (err) {
    console.error('[getServerTheme] error:', err);
    return DEFAULT_THEME;
  }
}
