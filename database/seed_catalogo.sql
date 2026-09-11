-- ============================================================================
-- iAnswer — Seed de datos base de catálogo para el Supabase DE PRUEBAS
-- ============================================================================
-- Qué hace este script:
--   1) platform_settings  → nombre de marca ("iAnswer") que usa el navbar/footer
--   2) plans               → los 3 planes que exige el onboarding (start/growth/scale)
--   3) templates            → 6 plantillas verticales (genérico + 5 industrias)
--   4) site_industries      → las 6 industrias públicas reales (copiadas de
--                             producción, ver nota más abajo), enlazadas a sus templates
--   5) site_settings        → los textos editables de Home, Precios, Contacto, Footer
--   6) (BONUS, opcional)    → site_features, para que la sección "Features" del Home
--                             no se quede vacía
--
-- Todo usa slugs/keys reales verificados contra el código (no inventados):
--   - plans.slug DEBE ser 'start' | 'growth' | 'scale' porque
--     src/app/api/onboarding/complete/route.ts:22 valida VALID_PLANS contra eso.
--   - templates se lee dinámicamente (SELECT * WHERE is_active) desde
--     src/components/OnboardingWizard.tsx:104-114 — no hay id fijo esperado.
--   - site_settings.key son exactamente los que declara
--     src/app/dashboard/admin/tabs/SiteContentAdminTab.tsx (SETTING_GROUPS),
--     así que ya se pueden editar desde /dashboard/admin → Contenido del sitio.
--
-- Cómo correrlo: Supabase (proyecto de pruebas) → SQL Editor → pegar y Run.
-- Es seguro correrlo más de una vez (usa ON CONFLICT DO NOTHING).
--
-- IMPORTANTE — datos que son PLACEHOLDER y hay que reemplazar antes de que esto
-- se vea "real":
--   - plans.stripe_price_id / stripe_price_yearly_id → NULL (no hay Price ID de
--     Stripe todavía; el checkout de pago fallaría hasta que se llenen).
--   - plans.price_monthly_cents / price_yearly_cents → precios inventados en MXN,
--     solo para que /precios se vea con datos reales. Ajustar en
--     /dashboard/admin → Planes cuando se defina el pricing real.
--   - site_settings.contact_email / contact_whatsapp / contact_address → datos
--     de ejemplo, hay que poner los reales de iAnswer.
--
-- ACTUALIZADO 11-sep-2026:
--   - Los IDs de `templates` (y los `template_id` de `site_industries`) se
--     corrigieron para coincidir EXACTO con producción ('health', 'real_estate',
--     'restaurant', 'marketing_agency', 'ventas', 'generic'), confirmado con
--     `select id, name, display_order from templates` en producción. La versión
--     anterior de este archivo usaba IDs inventados (ej. 'clinica-dental',
--     'inmobiliaria') que no coincidían — rompía la FK real
--     addons.requires_template → templates.id.
--   - Se agregó el bloque 4.1) addons, copia real de los 12 addons de
--     producción (`select * from addons`), no inventados.
--   - Se agregaron las 4 keys de site_settings categoría "social" que faltaban
--     (social_instagram/linkedin/twitter/youtube, vacías también en producción).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) platform_settings (singleton, id = 1)
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_settings (id, name, description, default_trial_days)
VALUES (
  1,
  'iAnswer',
  'Asistentes de IA por WhatsApp para negocios que no pueden perder ni un mensaje.',
  7
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  default_trial_days = EXCLUDED.default_trial_days;


-- ----------------------------------------------------------------------------
-- 2) plans (PK = slug; tier CHECK exige 'start' | 'growth' | 'scale')
-- ----------------------------------------------------------------------------
INSERT INTO public.plans (
  slug, tier, name, description,
  price_monthly_cents, price_yearly_cents,
  max_sessions_per_month, max_team_members, max_internal_users,
  max_channels, max_locations, max_agendas, max_bots,
  is_active, is_legacy, display_order, trial_days
) VALUES
  ('start', 'start', 'Start',
   'Para empezar a automatizar tu WhatsApp sin complicarte.',
   99900, 959000,
   300, 1, 0, 1, 1, 1, 1,
   true, false, 1, 7),

  ('growth', 'growth', 'Growth',
   'Para negocios que ya reciben volumen y necesitan más equipo y canales.',
   249900, 2399000,
   1500, 5, 2, 2, 2, 3, 1,
   true, false, 2, 7),

  ('scale', 'scale', 'Scale',
   'Para operaciones grandes con varias sucursales y soporte dedicado.',
   499900, 4799000,
   5000, 15, 5, 4, 5, 10, 3,
   true, false, 3, 7)
ON CONFLICT (slug) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 3) templates (PK = id, texto libre; is_active=true para que
--    OnboardingWizard y /industrias/[slug] los encuentren)
-- ----------------------------------------------------------------------------
INSERT INTO public.templates (
  id, name, short_name, description, icon, theme_color, accent_color, tenant_label,
  ui_labels, active_modules, funnels, custom_fields, default_prompts,
  is_active, is_generic, is_legacy, display_order
) VALUES

  ('generic', 'Otro', 'Genérico',
   'Bloques base para cualquier negocio: CRM, calendario y WhatsApp.',
   'Sparkles', '#0f172a', '#4f46e5', 'Negocio',
   '{"client":"Cliente","clients":"Clientes","staff":"Miembro","staff_plural":"Equipo","location":"Sucursal","location_plural":"Sucursales","appointment":"Cita","appointments":"Citas","pipeline_kanban_title":"Pipeline"}'::jsonb,
   '{"calendar":true,"team":true,"leads":true}'::jsonb,
   '{"new_lead":"Nuevo Lead","hot_lead":"Interesado","payment":"En Proceso","customer":"Cliente"}'::jsonb,
   '[]'::jsonb,
   '{"system_role":"Eres el asistente de WhatsApp de {{company_name}}. Responde de forma breve, clara y amable.","greeting":"¡Hola! 👋 Soy el asistente virtual de {{company_name}}, ¿en qué puedo ayudarte hoy?"}'::jsonb,
   true, true, false, 99),

  ('health', 'Salud y Clínicas', 'Clínica',
   'Agenda citas, atiende pacientes y da seguimiento a su historial desde WhatsApp.',
   'Stethoscope', '#0f172a', '#0ea5e9', 'Clínica',
   '{"client":"Paciente","clients":"Pacientes","staff":"Doctor(a)","staff_plural":"Equipo médico","location":"Consultorio","location_plural":"Consultorios","appointment":"Cita","appointments":"Citas","pipeline_kanban_title":"Seguimiento de pacientes"}'::jsonb,
   '{"calendar":true,"team":true,"patients":true,"reminders":true,"waitlist":true}'::jsonb,
   '{"new_lead":"Nuevo Contacto","hot_lead":"Interesado","payment":"Pago Pendiente","customer":"Paciente Activo"}'::jsonb,
   '[]'::jsonb,
   '{"system_role":"Eres el asistente de WhatsApp de {{company_name}}, una clínica. Agenda citas y responde dudas generales sin dar diagnósticos médicos.","greeting":"¡Hola! 👋 Bienvenido a {{company_name}}. ¿Quieres agendar una cita o tienes alguna duda?"}'::jsonb,
   true, false, false, 1),

  ('real_estate', 'Bienes Raíces', 'Inmobiliaria',
   'Publica propiedades, atiende prospectos y agenda visitas desde WhatsApp.',
   'Home', '#0f172a', '#059669', 'Inmobiliaria',
   '{"client":"Prospecto","clients":"Prospectos","staff":"Asesor(a)","staff_plural":"Asesores","location":"Sucursal","location_plural":"Sucursales","appointment":"Visita","appointments":"Visitas","pipeline_kanban_title":"Embudo de ventas"}'::jsonb,
   '{"calendar":true,"team":true,"properties":true,"visits":true,"leads":true}'::jsonb,
   '{"new_lead":"Nuevo Prospecto","hot_lead":"Interesado","payment":"Apartado","customer":"Cliente Cerrado"}'::jsonb,
   '[]'::jsonb,
   '{"system_role":"Eres el asistente de WhatsApp de {{company_name}}, una inmobiliaria. Ayuda a los prospectos a encontrar propiedades y agenda visitas.","greeting":"¡Hola! 👋 Soy el asistente de {{company_name}}. ¿Buscas comprar, rentar o tienes una propiedad en mente?"}'::jsonb,
   true, false, false, 2),

  ('restaurant', 'Restaurantes', 'Restaurante',
   'Recibe pedidos, comparte tu menú y confirma reservaciones por WhatsApp.',
   'Utensils', '#0f172a', '#f97316', 'Restaurante',
   '{"client":"Cliente","clients":"Clientes","staff":"Mesero(a)","staff_plural":"Equipo","location":"Sucursal","location_plural":"Sucursales","appointment":"Reservación","appointments":"Reservaciones","pipeline_kanban_title":"Pedidos"}'::jsonb,
   '{"calendar":true,"team":true,"menu":true,"orders":true,"reservations":true}'::jsonb,
   '{"new_lead":"Nuevo Contacto","hot_lead":"Cotizando","payment":"Pago Pendiente","customer":"Cliente Frecuente"}'::jsonb,
   '[]'::jsonb,
   '{"system_role":"Eres el asistente de WhatsApp de {{company_name}}, un restaurante. Comparte el menú, toma pedidos y confirma reservaciones.","greeting":"¡Hola! 👋 Bienvenido a {{company_name}}. ¿Quieres ver el menú, hacer un pedido o reservar mesa?"}'::jsonb,
   true, false, false, 3),

  ('marketing_agency', 'Agencia de Marketing', 'Agencia',
   'Conecta tus campañas de Meta y Google Ads, y califica leads en automático antes de pasarlos al cliente.',
   'Megaphone', '#0f172a', '#ec4899', 'Agencia',
   '{"client":"Cliente","clients":"Clientes","staff":"Ejecutivo(a)","staff_plural":"Equipo","location":"Cuenta","location_plural":"Cuentas","appointment":"Reunión","appointments":"Reuniones","pipeline_kanban_title":"Pipeline de leads"}'::jsonb,
   '{"calendar":true,"team":true,"leads":true,"campaigns":true,"accounts":true,"reports_executive":true}'::jsonb,
   '{"new_lead":"Nuevo Lead","hot_lead":"Calificado","payment":"Propuesta Enviada","customer":"Cliente Activo"}'::jsonb,
   '[]'::jsonb,
   '{"system_role":"Eres el asistente de WhatsApp de {{company_name}}, una agencia de marketing. Califica leads de campañas y agenda reuniones.","greeting":"¡Hola! 👋 Gracias por tu interés en {{company_name}}. ¿En qué campaña o servicio estás interesado?"}'::jsonb,
   true, false, false, 4),

  ('ventas', 'Ventas', 'Ventas',
   'Cotizaciones automáticas y atención comercial impulsada por IA para negocios que venden productos o servicios.',
   'Briefcase', '#0f172a', '#0f172a', 'Negocio',
   '{"client":"Cliente","clients":"Clientes","staff":"Vendedor(a)","staff_plural":"Equipo de ventas","location":"Sucursal","location_plural":"Sucursales","appointment":"Cita","appointments":"Citas","pipeline_kanban_title":"Embudo de ventas"}'::jsonb,
   '{"calendar":true,"team":true,"leads":true}'::jsonb,
   '{"new_lead":"Nuevo Lead","hot_lead":"Cotizando","payment":"Pago Pendiente","customer":"Cliente"}'::jsonb,
   '[]'::jsonb,
   '{"system_role":"Eres el asistente de WhatsApp de {{company_name}}. Cotiza productos o servicios y agenda seguimiento comercial.","greeting":"¡Hola! 👋 Bienvenido a {{company_name}}. ¿Qué producto o servicio te interesa?"}'::jsonb,
   true, false, false, 35)

ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 4) site_industries (slug es UNIQUE; template_id referencia a templates.id)
-- ----------------------------------------------------------------------------
-- ⚠ Estos 6 renglones NO son copy inventado: se extrajeron el 2026-09-09
-- directamente del DOM de producción (https://www.ianswer.pro/industrias y
-- cada /industrias/<slug>) vía JavaScript, incluyendo el accent_color exacto
-- (computado de los estilos inline) y el ícono lucide realmente usado. Así que
-- esto no es "contenido de ejemplo" — es una copia fiel de lo que ya está
-- sembrado en el Supabase de PRODUCCIÓN. Si Roy/marketing cambian ese texto
-- en producción más adelante, este seed quedará desactualizado (es un
-- snapshot, no un espejo en vivo).
INSERT INTO public.site_industries (
  slug, name, tagline, description, icon_name, accent_color,
  bullet_points, template_id, display_order, visible
) VALUES

  ('restaurantes', 'Restaurantes',
   'Reservas, menú y pedidos',
   'Tu bot toma reservas, comparte el menú, registra pedidos y notifica a cocina. Sin saturar tu staff en hora pico.',
   'Utensils', '#f97316',
   '["Reservas automáticas","Menú digital editable","Pedidos para llevar","Encuesta post-visita"]'::jsonb,
   'restaurant', 1, true),

  ('salud', 'Clínicas y consultorios',
   'Agenda, pacientes, recordatorios',
   'Diseñado para clínicas dentales, médicos, fisioterapeutas, psicólogos. Cumple HIPAA y respeta la privacidad.',
   'Stethoscope', '#0ea5e9',
   '["Agenda por especialista","Recordatorios pre-cita","Historial básico de paciente","Lista de espera"]'::jsonb,
   'health', 2, true),

  ('inmobiliaria', 'Inmobiliaria',
   'Propiedades, leads, visitas',
   'Catálogo vivo, califica leads por intención y presupuesto, agenda visitas. Tu agente trabaja como un primer SDR.',
   'Home', '#10b981',
   '["Catálogo importable por PDF","Calificación automática","Agenda de visitas","Importación masiva"]'::jsonb,
   'real_estate', 3, true),

  ('marketing', 'Agencias de marketing',
   'Leads de campañas, CRM unificado',
   'Conecta tus campañas de Meta y Google Ads. Califica leads en automático antes de pasarlos al cliente.',
   'Megaphone', '#ec4899',
   '["Tracking UTM nativo","Calificación BANT","Webhook a tu CRM","Multi-cliente"]'::jsonb,
   'marketing_agency', 4, true),

  ('ventas', 'Ventas',
   NULL,
   'Para negocios que venden productos o servicios. Cotizaciones automáticas y atención comercial por IA.',
   NULL, '#0f172a',
   '[]'::jsonb,
   'ventas', 5, true),

  ('generico', 'Cualquier otro negocio',
   'Flexibilidad total',
   'Si tu negocio no encaja en una vertical, la plantilla genérica te da todos los bloques para armar el flujo que necesites.',
   'Sparkles', '#6366f1',
   '["Campos personalizables","Flujos a medida","Webhooks abiertos","Integraciones por API"]'::jsonb,
   'generic', 6, true)

ON CONFLICT (slug) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 4.1) addons — copia real de producción (12 filas), verificada el 11-sep-2026
--      (select * from public.addons order by display_order en producción).
--      requires_template usa los IDs reales de templates de arriba.
-- ----------------------------------------------------------------------------
INSERT INTO public.addons (
  id, name, short_name, description, category, icon,
  price_monthly_cents, price_one_time_cents, currency, stripe_price_id,
  is_recurring, is_one_time, feature_flags, capacity_grants,
  requires_plan_min, requires_template, is_active, is_featured, display_order,
  available_for_templates
) VALUES

  ('health_calendar', 'Agenda y Citas con Google Calendar', 'Agenda Salud',
   'Convierte tu WhatsApp en una recepcionista 24/7. El agente IA toma citas, las sincroniza en Google Calendar, manda recordatorios automáticos, gestiona reagendamientos y cancelaciones, y registra el motivo de no-show. Pensado para consultorios médicos, dentistas, terapeutas y clínicas.',
   'feature', 'CalendarCheck',
   9900, 0, 'mxn', null,
   true, false,
   '{"agenda_waitlist":true,"agenda_reminders":true,"agenda_reschedule_ai":true,"agenda_appointments_ai":true,"agenda_google_calendar":true,"agenda_no_show_tracking":true}'::jsonb,
   '{}'::jsonb,
   null, 'health', false, true, 1, '{}'),

  ('realestate_properties', 'Catálogo de Propiedades con IA', 'Propiedades',
   'Carga tus propiedades (venta o renta) y el agente IA las muestra automáticamente al cliente cuando pregunta por casas, depas, terrenos o locales. Incluye filtros inteligentes (zona, precio, recámaras), ficha pública compartible y agendado de visitas. Importación masiva desde PDF.',
   'feature', 'Building',
   29900, 0, 'mxn', null,
   true, false,
   '{"public_catalog":true,"realestate_catalog":true,"realestate_ai_search":true,"realestate_pdf_import":true,"realestate_visit_booking":true,"realestate_public_listings":true,"realestate_lead_qualification":true}'::jsonb,
   '{}'::jsonb,
   null, 'real_estate', true, true, 2, '{}'),

  ('extra_channel', 'Otro canal de mensajes', 'Canal extra',
   'Conecta un canal más: WhatsApp, Instagram o Messenger.',
   'channel', 'Plug',
   29900, 0, 'mxn', null,
   true, false,
   '{"channel_extra_generic":true}'::jsonb,
   '{"max_channels":1,"extra_channels":1}'::jsonb,
   null, null, false, true, 2, '{}'),

  ('restaurant_menu', 'Menú Digital con IA', 'Menú',
   'Digitaliza tu carta con el wizard de importación desde PDF. El agente IA puede recomendar platillos, responder dudas de ingredientes/alérgenos, gestionar disponibilidad por horario, y compartir un menú público con foto, precio y descripción. Soporta categorías, tags y platillos destacados.',
   'feature', 'Sparkles',
   39900, 0, 'mxn', null,
   true, false,
   '{"menu_digital":true,"menu_pdf_import":true,"menu_public_catalog":true,"menu_ai_recommendations":true,"menu_allergens_management":true,"menu_availability_schedule":true}'::jsonb,
   '{}'::jsonb,
   null, 'restaurant', true, true, 3, '{}'),

  ('multi_location', 'Múltiples sucursales', 'Sucursales',
   'Maneja varias sedes desde una sola cuenta.',
   'feature', 'Building',
   39900, 0, 'mxn', null,
   true, false,
   '{"reports_by_location":true,"location_aware_routing":true,"multi_location_enabled":true}'::jsonb,
   '{"extra_locations":5}'::jsonb,
   null, null, true, true, 4, '{}'),

  ('restaurant_orders', 'Órdenes y Tracking en tiempo real', 'Órdenes',
   'Recibe pedidos por WhatsApp con el agente IA. Tablero kanban por estado (recibida → en preparación → lista → entregada), tracking público que el cliente abre desde su celular, notificaciones automáticas en cada cambio de estado, e integración con repartidores. Reportes de ventas por día/platillo.',
   'feature', 'TrendingUp',
   39900, 0, 'mxn', null,
   true, false,
   '{"orders_kanban":true,"orders_ai_intake":true,"orders_notifications":true,"orders_sales_reports":true,"orders_public_tracking":true,"orders_delivery_routing":true}'::jsonb,
   '{}'::jsonb,
   null, 'restaurant', true, true, 4, '{}'),

  ('pdf_wizard_menu', 'Subir menú con IA', 'Menú PDF',
   'Sube tu menú en PDF y la IA lo carga por ti en minutos.',
   'ai', 'FileText',
   29900, 0, 'MXN', null,
   true, false,
   '{"ai_pdf_wizard_menu":true}'::jsonb,
   '{}'::jsonb,
   'start', null, true, true, 50, '{restaurant}'),

  ('pdf_wizard_properties', 'Subir propiedades con IA', 'Propiedades PDF',
   'Sube tu catálogo en PDF y la IA lo carga por ti en minutos.',
   'ai', 'Building',
   29900, 0, 'MXN', null,
   true, false,
   '{"ai_pdf_wizard_properties":true}'::jsonb,
   '{}'::jsonb,
   'start', null, true, true, 51, '{real_estate}'),

  ('fb9e125d-f4c9-4b03-89c7-75aac5126fcf', 'Directorio Público de Propiedades', 'Catálogo Web',
   'Página whitelabel con todo tu inventario activo, filtros por zona/precio/recámaras y botón directo a WhatsApp. URL bonita estilo ianswer.pro/p/tu-marca para compartir en redes y campañas.',
   'feature', 'Globe',
   29900, 0, 'MXN', null,
   true, false,
   '{"properties_public_directory":true}'::jsonb,
   '{}'::jsonb,
   'start', 'real_estate', true, false, 100, '{real_estate}'),

  ('7681da90-c77b-4eab-9073-3ed60389f9f6', 'Catálogo Web', 'Catálogo Web',
   'Publica tu catálogo en línea con una página pública que puedes compartir. Tus clientes ven tus propiedades o tu menú desde cualquier link, sin necesidad de app. Cada elemento publicado tiene su propia URL para compartir por WhatsApp o redes.',
   'feature', 'Globe',
   0, 0, 'MXN', null,
   true, false,
   '{"public_catalog":true}'::jsonb,
   '{}'::jsonb,
   'start', null, true, true, 120, '{}'),

  ('3eeeea1b-fcf8-462e-96df-3e2224e31c05', 'Entrenamiento PRO del Agente', 'Entrenamiento PRO',
   'Entrena a tu agente IA como si fuera un empleado nuevo. Un asistente te entrevista sobre cómo trabaja tu empresa, tu flujo de ventas, qué información dar y qué no, y casos comunes. Genera un documento de procesos que tu agente consulta en cada conversación, haciéndolo sonar como alguien que de verdad trabaja ahí.',
   'ai', 'GraduationCap',
   39900, 0, 'MXN', null,
   true, false,
   '{"agent_training_pro":true}'::jsonb,
   '{}'::jsonb,
   'growth', null, true, true, 140, '{}'),

  ('77b908d1-722b-4256-b193-a2ee594b1698', 'Tracking de Pedidos', 'Tracking',
   'Página pública de rastreo estilo Domino''s para cada pedido. El cliente ve el estado en tiempo real con timeline animado y tu branding. Además, tu bot puede responder el estado del pedido cuando el cliente pregunta por WhatsApp.',
   'feature', 'MapPin',
   19900, 0, 'MXN', null,
   true, false,
   '{"order_tracking":true}'::jsonb,
   '{}'::jsonb,
   'start', null, true, true, 160, '{restaurant}')

ON CONFLICT (id) DO NOTHING;


-- ----------------------------------------------------------------------------
-- 5) site_settings (PK = key; upsert porque es editable desde el admin y no
--    queremos pisar cambios ya guardados si el script se vuelve a correr)
-- ----------------------------------------------------------------------------
INSERT INTO public.site_settings (key, value, category) VALUES

  -- Marca
  ('brand_name',    '"iAnswer"'::jsonb, 'brand'),
  ('brand_tagline', '"Tu negocio responde. Tú descansas."'::jsonb, 'brand'),

  -- Home
  ('hero_eyebrow',            '"Asistentes AI por WhatsApp"'::jsonb, 'home'),
  ('hero_title',              '"Tu negocio responde. Tú descansas."'::jsonb, 'home'),
  ('hero_subtitle',           '"iAnswer conecta tu WhatsApp a un agente de IA que agenda, cotiza y da seguimiento a tus clientes las 24 horas, para que tú te enfoques en crecer tu negocio."'::jsonb, 'home'),
  ('hero_cta_primary',        '{"text":"Probar 7 días gratis","href":"/login?signup=1"}'::jsonb, 'home'),
  ('hero_cta_secondary',      '{"text":"Hablar con ventas","href":"/contacto"}'::jsonb, 'home'),
  ('hero_social_proof',       '"Negocios en salud, bienes raíces y restaurantes ya confían en iAnswer"'::jsonb, 'home'),
  ('home_features_title',     '"Todo lo que necesitas en un solo lugar"'::jsonb, 'home'),
  ('home_features_subtitle',  '"CRM, calendario, reportes y un agente de IA entrenado para tu industria, todo conectado a tu WhatsApp."'::jsonb, 'home'),
  ('home_industries_title',   '"Hecho para tu industria"'::jsonb, 'home'),
  ('home_industries_subtitle','"Cada industria tiene su propio vocabulario, flujo y campos. Elige la tuya y arranca en minutos."'::jsonb, 'home'),
  ('home_steps_title',        '"En 3 pasos tu bot está activo"'::jsonb, 'home'),
  ('home_steps_list',         '[{"number":"01","title":"Conecta tu WhatsApp","description":"Vincula tu número de WhatsApp Business en minutos, sin cambiar de número."},{"number":"02","title":"Elige tu industria","description":"Selecciona la plantilla que mejor se adapta a tu negocio y personalízala."},{"number":"03","title":"Tu agente responde","description":"La IA agenda, cotiza y da seguimiento mientras tú monitoreas todo desde el panel."}]'::jsonb, 'home'),
  ('home_final_cta_title',    '"Empieza tu prueba de 7 días"'::jsonb, 'home'),
  ('home_final_cta_subtitle', '"Sin tarjeta. Cancela cuando quieras."'::jsonb, 'home'),

  -- Precios
  ('pricing_title',            '"Planes que crecen contigo"'::jsonb, 'pricing'),
  ('pricing_subtitle',         '"Elige el plan según el volumen de conversaciones y el tamaño de tu equipo. Todos incluyen las mismas funciones."'::jsonb, 'pricing'),
  ('pricing_currency',         '"MXN"'::jsonb, 'pricing'),
  ('pricing_recommended_slug', '"growth"'::jsonb, 'pricing'),

  -- Addons
  ('addons_show_prices', 'true'::jsonb, 'addons'),

  -- Contacto (⚠ placeholders — reemplazar con los datos reales de iAnswer)
  ('contact_title',    '"Contáctanos"'::jsonb, 'contact'),
  ('contact_subtitle', '"Llena el formulario y nos pondremos en contacto contigo a la brevedad."'::jsonb, 'contact'),
  ('contact_email',    '"hola@ianswer.pro"'::jsonb, 'contact'),
  ('contact_whatsapp', '"+529990000000"'::jsonb, 'contact'),
  ('contact_address',  '"Mérida, Yucatán, México"'::jsonb, 'contact'),

  -- Footer
  ('footer_tagline', '"Asistentes de IA por WhatsApp para negocios que no pueden perder ni un mensaje."'::jsonb, 'footer'),

  -- Social (vacíos en producción también — no hay redes configuradas todavía)
  ('social_instagram', '""'::jsonb, 'social'),
  ('social_linkedin',  '""'::jsonb, 'social'),
  ('social_twitter',   '""'::jsonb, 'social'),
  ('social_youtube',   '""'::jsonb, 'social')

ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- 6) BONUS (opcional) — site_features para que la sección "Features" del Home
--    no se quede oculta (solo se muestra si features.length > 0).
--    Si no lo quieres correr, borra este bloque; el sitio funciona igual sin él.
-- ============================================================================
INSERT INTO public.site_features (slug, title, short_description, icon_name, category, display_order, visible) VALUES
  ('whatsapp-api',   'WhatsApp Business API',   'Un solo número, conectado directo a la API oficial de WhatsApp.', 'MessageSquare', 'core', 1, true),
  ('crm',            'CRM con pipeline',        'Organiza a tus clientes por etapas, desde el primer mensaje hasta la venta cerrada.', 'Layers',        'core', 2, true),
  ('calendario',     'Calendario integrado',    'Agenda, confirma y reagenda citas sin salir de la conversación.', 'Calendar',      'core', 3, true),
  ('reportes',       'Reportes en tiempo real', 'Ve conversaciones, conversiones y tiempos de respuesta al momento.', 'BarChart3',    'core', 4, true),
  ('multicanal',     'Multi-canal',             'Suma Instagram y tu sitio web al mismo bot que ya responde tu WhatsApp.', 'Globe',      'core', 5, true),
  ('recordatorios',  'Recordatorios automáticos','Reduce las inasistencias con recordatorios que se envían solos.', 'BellRing',     'core', 6, true)
ON CONFLICT (slug) DO NOTHING;
