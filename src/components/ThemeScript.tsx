 

// src/components/ThemeScript.tsx
// ----------------------------------------------------------------------------
// Sprint N · Script anti-FOUC (flash of unstyled content)
//
// PROBLEMA que resuelve:
//   El theme de la industria (theme_color / accent_color) se cargaba en 2 fases:
//     1. Defaults genéricos (#020617 / #4f46e5) en el primer render
//     2. Zustand hidrata localStorage → primer repintado
//     3. refreshWorkspace() trae de Supabase → segundo repintado
//   El usuario veía "carga sobre carga": theme básico → theme de industria.
//
// SOLUCIÓN:
//   Este script corre ANTES de que React monte (es un <script> síncrono en el
//   <head>). Lee el mismo localStorage que usa Zustand ('workspace-cache-v3'),
//   extrae theme_color/accent_color del primaryTemplate cacheado, y los inyecta
//   como CSS variables en :root ANTES del primer paint.
//
//   Así, desde el primer pixel que se pinta, los colores ya son los de la
//   industria correcta. Sin flash.
//
// Cómo se usa:
//   Se coloca en el <head> del layout raíz (app/layout.tsx), antes de <body>.
//   Al ser dangerouslySetInnerHTML con un script IIFE, se ejecuta inline y
//   síncrono durante el parse del HTML.
// ----------------------------------------------------------------------------

export default function ThemeScript() {
  // Este string se ejecuta como <script> síncrono en el navegador antes del paint.
  // Lee el cache de Zustand y aplica las CSS vars. Envuelto en try/catch para
  // que nunca rompa el render si el localStorage está corrupto o ausente.
  const script = `
(function() {
  try {
    var DEFAULT_THEME = '#020617';
    var DEFAULT_ACCENT = '#4f46e5';

    var raw = localStorage.getItem('workspace-cache-v3');
    var theme = DEFAULT_THEME;
    var accent = DEFAULT_ACCENT;

    if (raw) {
      var parsed = JSON.parse(raw);
      var pt = parsed && parsed.state && parsed.state.primaryTemplate;
      if (pt) {
        if (pt.theme_color) theme = pt.theme_color;
        if (pt.accent_color) accent = pt.accent_color;
      }
    }

    var root = document.documentElement;
    root.style.setProperty('--ia-theme', theme);
    root.style.setProperty('--ia-accent', accent);
  } catch (e) {
    // Si algo falla, quedan los defaults del CSS. Nunca rompemos el render.
  }
})();
`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
