-- Artículo del centro de ayuda al que enlaza el toast de error "(#200)
-- Permissions error" del editor de perfil de WhatsApp Business.
-- El slug debe coincidir con META_PERMISSIONS_HELP_SLUG en
-- src/lib/whatsappProfileErrors.ts.

INSERT INTO public.help_articles
  (title, slug, category, category_icon, is_public, summary, reading_time_minutes, content)
VALUES (
  'No puedo editar mi perfil de WhatsApp: error de permisos',
  'whatsapp-permisos-perfil',
  'WhatsApp',
  'MessageCircle',
  true,
  'Qué hacer si Meta rechaza los cambios de tu perfil de WhatsApp Business por falta de permisos.',
  3,
  $html$
<p>Si al guardar tu perfil de WhatsApp Business (foto, "acerca de", descripción, etc.) ves el mensaje <strong>"Meta no dio permiso para editar el perfil"</strong> o <strong>"(#200) Permissions error"</strong>, tu conexión con Meta puede <em>leer</em> el perfil pero no tiene permiso para <em>modificarlo</em>. No es un fallo de iAnswer: se arregla desde tu cuenta de Meta.</p>

<h2>Si conectaste WhatsApp con el botón de Meta</h2>
<ol>
  <li>En iAnswer, ve a <strong>Conectividad → WhatsApp</strong> y desconecta el número.</li>
  <li>Vuelve a conectarlo con el botón de Meta.</li>
  <li>En la ventana de Meta, <strong>acepta todos los permisos</strong> que se piden, sin desmarcar ninguno.</li>
</ol>

<h2>Si conectaste WhatsApp con un token manual</h2>
<ol>
  <li>Entra a <strong>Meta Business Suite → Configuración del negocio → Usuarios → Usuarios del sistema</strong>.</li>
  <li>Selecciona el usuario del sistema que usas con iAnswer y haz clic en <strong>Asignar activos</strong>.</li>
  <li>Elige tu <strong>cuenta de WhatsApp</strong> y activa <strong>Control total</strong> (no solo acceso parcial).</li>
  <li>Haz clic en <strong>Generar token</strong> y marca los permisos <code>whatsapp_business_management</code> y <code>whatsapp_business_messaging</code>.</li>
  <li>Copia el token nuevo (empieza con "EAA") y pégalo en <strong>Conectividad → WhatsApp</strong> en iAnswer.</li>
</ol>

<h2>Si usas el mismo número en la app de WhatsApp Business</h2>
<p>Cuando el número funciona a la vez en la app del teléfono y en iAnswer (coexistencia), Meta puede limitar algunos cambios del perfil desde fuera de la app. Si después de los pasos anteriores sigue fallando, edita el perfil desde la app de WhatsApp Business en tu teléfono.</p>

<p>¿Sigue sin funcionar? Escríbenos desde el asistente de esta página y lo revisamos contigo.</p>
$html$
)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  title                = EXCLUDED.title,
  category             = EXCLUDED.category,
  category_icon        = EXCLUDED.category_icon,
  is_public            = EXCLUDED.is_public,
  summary              = EXCLUDED.summary,
  reading_time_minutes = EXCLUDED.reading_time_minutes,
  content              = EXCLUDED.content;
