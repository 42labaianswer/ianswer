-- fix_templates_addons_settings.sql
-- Reconstruido el 15-sep-2026 (el archivo original del 11-sep se perdió sin llegar a GitHub).
-- Corre esto UNA SOLA VEZ en el SQL Editor del proyecto de PRUEBAS de Supabase.
-- Los valores fueron copiados directo de PRODUCCIÓN el 15-sep-2026 (select * de templates,
-- site_industries, addons y site_settings social_*), así que este script deja al proyecto
-- de pruebas con el catálogo idéntico a producción.
--
-- Qué hace:
--   1) Si alguna empresa de PRUEBA ya quedó apuntando a los IDs viejos/incorrectos de
--      templates (clinica-dental, inmobiliaria, restaurante, marketing, generico), la
--      migra a los IDs correctos antes de borrar esas filas (evita violar la FK).
--   2) Borra y re-inserta templates (6 filas) y site_industries (6 filas) con los IDs/])
--      datos reales de producción.
--   3) Inserta addons (12 filas) — no existían en pruebas, por eso ON CONFLICT DO NOTHING.
--   4) Inserta/actualiza las 4 site_settings de categoría "social".
--
-- Es seguro correrlo más de una vez (idempotente).

begin;

-- 1) Migración defensiva: busca TODAS las tablas que tengan una foreign key real
--    hacia templates.id y remapea los IDs viejos a los correctos antes de borrar esas filas.
--    Usa pg_constraint directo (más confiable que information_schema para esto).
do $mig$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl,
           a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.templates'::regclass
  loop
    raise notice 'Migrando FK hacia templates.id en %.%', r.tbl, r.col;
    execute format('update %s set %I = %L where %I = %L', r.tbl, r.col, 'health',           r.col, 'clinica-dental');
    execute format('update %s set %I = %L where %I = %L', r.tbl, r.col, 'real_estate',      r.col, 'inmobiliaria');
    execute format('update %s set %I = %L where %I = %L', r.tbl, r.col, 'restaurant',       r.col, 'restaurante');
    execute format('update %s set %I = %L where %I = %L', r.tbl, r.col, 'marketing_agency', r.col, 'marketing');
    execute format('update %s set %I = %L where %I = %L', r.tbl, r.col, 'generic',          r.col, 'generico');
  end loop;
end;
$mig$;

-- 1b) Red de seguridad explícita: ya sabemos por el error real que company_templates.template_id
--     es una de las tablas afectadas. Este bloque la cubre a propósito, aunque el bloque
--     dinámico de arriba también debería haberla encontrado.
do $mig2$
begin
  if to_regclass('public.company_templates') is not null
     and exists (
       select 1 from information_schema.columns
       where table_name = 'company_templates' and column_name = 'template_id'
     )
  then
    update company_templates set template_id = 'health'            where template_id = 'clinica-dental';
    update company_templates set template_id = 'real_estate'       where template_id = 'inmobiliaria';
    update company_templates set template_id = 'restaurant'        where template_id = 'restaurante';
    update company_templates set template_id = 'marketing_agency'  where template_id = 'marketing';
    update company_templates set template_id = 'generic'           where template_id = 'generico';
  end if;
end;
$mig2$;

-- 2a) templates: fuera lo viejo, dentro lo real de producción.
delete from templates;

insert into templates (
  id, name, short_name, description, icon, theme_color, accent_color, tenant_label,
  ui_labels, active_modules, funnels, custom_fields, default_prompts,
  is_active, is_generic, is_legacy, display_order, created_at, updated_at
) values
(
  'health', 'Salud y Clínicas', 'Salud',
  $x$Para clínicas, consultorios y profesionales de la salud. Gestiona pacientes, citas, recordatorios y memoria médica.$x$,
  'Stethoscope', '#1a1a29', '#5A5AF0', 'Clínica',
  $x${"staff":"Especialista","client":"Paciente","clients":"Pacientes","location":"Consultorio","appointment":"Cita","appointments":"Citas","staff_plural":"Especialistas","client_plural":"Pacientes","location_plural":"Consultorios","pipeline_kanban_title":"Pacientes del consultorio"}$x$::jsonb,
  $x${"menu":false,"team":true,"agenda":true,"calendar":true,"patients":true,"waitlist":true,"reminders":true,"properties":false,"medical_memory":true}$x$::jsonb,
  $x${"payment":"En Tratamiento","customer":"Paciente Recurrente","hot_lead":"Interesado","new_lead":"Nuevo Paciente"}$x$::jsonb,
  $x$[{"key":"birth_date","type":"date","label":"Fecha de nacimiento"},{"key":"allergies","type":"text","label":"Alergias"},{"key":"medical_notes","type":"textarea","label":"Notas médicas"},{"key":"insurance","type":"text","label":"Seguro médico"},{"key":"emergency_contact","type":"phone","label":"Contacto de emergencia"}]$x$::jsonb,
  $x${"tone_hint":"cálido, empático, profesional","agent_role":"asistente médico virtual","domain_keywords":["paciente","cita","consulta","tratamiento","diagnóstico"]}$x$::jsonb,
  true, false, false, 1, '2026-06-20 05:43:38.222703+00', '2026-09-07 22:58:37.305+00'
),
(
  'real_estate', 'Bienes Raíces', 'Inmobiliaria',
  $x$Para inmobiliarias y agentes. Catálogo de propiedades, leads y seguimiento de prospectos.$x$,
  'Home', '#1a1a29', '#5A5AF0', 'Inmobiliaria',
  $x${"staff":"Agente","client":"Prospecto","clients":"Prospectos","location":"Oficina","appointment":"Visita","appointments":"Visitas","staff_plural":"Agentes","client_plural":"Prospectos","location_plural":"Oficinas","pipeline_kanban_title":"Pipeline de ventas"}$x$::jsonb,
  $x${"menu":false,"team":true,"leads":true,"visits":true,"calendar":true,"reminders":true,"properties":true}$x$::jsonb,
  $x${"payment":"Negociando","customer":"Cliente Cerrado","hot_lead":"Interesado","new_lead":"Nuevo Lead"}$x$::jsonb,
  $x$[{"key":"budget_min","type":"number","label":"Presupuesto mín"},{"key":"budget_max","type":"number","label":"Presupuesto máx"},{"key":"zone_interest","type":"text","label":"Zona de interés"},{"key":"property_type","type":"select","label":"Tipo de propiedad"},{"key":"purchase_intent","type":"select","label":"Intención","options":["compra","renta","inversión"]}]$x$::jsonb,
  $x${"tone_hint":"profesional, persuasivo, conocedor del mercado","agent_role":"asesor inmobiliario","domain_keywords":["propiedad","casa","depto","terreno","venta","renta","metros"]}$x$::jsonb,
  true, false, false, 2, '2026-06-20 05:43:38.222703+00', '2026-09-07 22:58:17.581+00'
),
(
  'restaurant', 'Restaurantes', 'Restaurante',
  $x$Para restaurantes, cafés y bares. Menú digital, reservas y órdenes con tracking.$x$,
  'Utensils', '#1a1a29', '#5A5AF0', 'Restaurante',
  $x${"staff":"Staff","client":"Comensal","clients":"Comensales","location":"Sucursal","appointment":"Reserva","appointments":"Reservas","staff_plural":"Equipo","client_plural":"Comensales","location_plural":"Sucursales","pipeline_kanban_title":"Órdenes activas"}$x$::jsonb,
  $x${"menu":true,"team":true,"orders":true,"calendar":true,"tracking":true,"waitlist":true,"properties":false,"reservations":true}$x$::jsonb,
  $x${"payment":"En preparación","customer":"Entregada","hot_lead":"Confirmada","new_lead":"Nueva orden"}$x$::jsonb,
  $x$[{"key":"favorite_items","type":"tags","label":"Platillos favoritos"},{"key":"allergies","type":"tags","label":"Alergias"},{"key":"delivery_address","type":"text","label":"Dirección de entrega"},{"key":"table_preference","type":"text","label":"Preferencia de mesa"}]$x$::jsonb,
  $x${"tone_hint":"amable, ágil, conoce el menú al detalle","agent_role":"tomador de órdenes y reservas","domain_keywords":["menú","orden","reserva","entrega","mesa","platillo"]}$x$::jsonb,
  true, false, false, 3, '2026-06-20 05:43:38.222703+00', '2026-09-07 18:32:04.623+00'
),
(
  'marketing_agency', 'Agencia de Marketing', 'Agencia',
  $x$Para agencias y consultoras. Multi-cuenta, campañas y reportes ejecutivos.$x$,
  'Megaphone', '#1a1a29', '#5A5AF0', 'Agencia',
  $x${"staff":"Account Manager","client":"Lead","clients":"Leads","location":"Cuenta cliente","appointment":"Reunión","appointments":"Reuniones","staff_plural":"Equipo","client_plural":"Leads","location_plural":"Cuentas","pipeline_kanban_title":"Pipeline comercial"}$x$::jsonb,
  $x${"menu":false,"team":true,"accounts":true,"calendar":true,"campaigns":true,"properties":false,"reports_executive":true}$x$::jsonb,
  $x${"payment":"Propuesta","customer":"Cliente Activo","hot_lead":"Calificado","new_lead":"Nuevo Lead"}$x$::jsonb,
  $x$[{"key":"company_name","type":"text","label":"Empresa"},{"key":"industry","type":"text","label":"Industria"},{"key":"budget_range","type":"text","label":"Presupuesto mensual"},{"key":"services_interest","type":"tags","label":"Servicios de interés"},{"key":"source","type":"select","label":"Fuente del lead","options":["referido","ads","orgánico","evento"]}]$x$::jsonb,
  $x${"tone_hint":"estratégico, consultivo, orientado a resultados","agent_role":"ejecutivo de cuentas de agencia","domain_keywords":["campaña","ROI","leads","conversión","branding","ads"]}$x$::jsonb,
  true, false, false, 4, '2026-06-20 05:43:38.222703+00', '2026-09-07 22:58:23.944+00'
),
(
  'ventas', 'Ventas', 'Ventas',
  $x$Para negocios que venden productos o servicios. Cotizaciones automáticas y atención comercial por IA.$x$,
  'ShoppingBag', '#1a1a29', '#5A5AF0', 'Atención y cotizaciones',
  $x${"staff":"Vendedor","client":"Cliente","clients":"Clientes","location":"Sala","appointment":"Cita","appointments":"Citas","staff_plural":"Equipo de vendedores ","client_plural":"Clientela","location_plural":"Salas","pipeline_kanban_title":"Camino del cliente"}$x$::jsonb,
  $x${"team":true,"leads":true,"visits":true,"calendar":true,"patients":false,"waitlist":true,"reminders":true,"reports_executive":true}$x$::jsonb,
  $x${"payment":"Reservó","customer":"Cliente recurrente","hot_lead":"Interesado","new_lead":"Primera visita"}$x$::jsonb,
  $x$[]$x$::jsonb,
  $x${"greeting":"Hola, soy tu asesor comercial ¿En qué puedo ayudarte hoy?","system_role":"Eres un asesor de ventas experto en comunicación digital para WhatsApp. Tu único objetivo es convertir leads en clientes pagados. Tu tono es seguro, persuasivo y directo, pero manteniendo la cercanía para no generar rechazo en el chat. Escuchas activamente la necesidad del cliente (relajación, alivio de estrés o mejora física) y, en lugar de dar largas, le presentas tu servicio como la solución definitiva a su problema, destacando el valor transformador y los beneficios tangibles. Manejas las objeciones de precio con seguridad: si el cliente duda, le recuerdas el costo de no atenderse (malestar, pérdida de bienestar) y le ofreces alternativas de pago o paquetes que aumentan el ticket promedio. Saca la información necesaria del cliente para que puedas atender sus necesidades , por ejemplo, si requiere cotización para paneles solares, pídele su recibo de luz o pregúntale cuánto paga aproximadamente para que con datos concisos y precisos puedas generar una cotización atinada. Al generar la cotización mandar notificación para que intervenga un humano y pueda cerrar la venta."}$x$::jsonb,
  true, false, false, 35, '2026-06-20 05:53:21.301694+00', '2026-09-07 22:57:22.352+00'
),
(
  'generic', 'Otro', 'Genérico',
  $x$Plantilla universal con CRM y conversación IA. Edita todo para adaptarlo a tu industria.$x$,
  'Sparkles', '#020617', '#5A5AF0', 'Plataforma',
  $x${"staff":"Miembro","client":"Cliente","clients":"Clientes","location":"Sucursal","appointment":"Cita","appointments":"Citas","staff_plural":"Equipo","client_plural":"Clientes","location_plural":"Sucursales","pipeline_kanban_title":"Pipeline"}$x$::jsonb,
  $x${"menu":false,"team":true,"calendar":true,"properties":false}$x$::jsonb,
  $x${"payment":"En Proceso","customer":"Cliente","hot_lead":"Interesado","new_lead":"Nuevo Lead"}$x$::jsonb,
  $x$[]$x$::jsonb,
  $x${"tone_hint":"profesional, amable","agent_role":"asistente virtual","domain_keywords":[]}$x$::jsonb,
  true, true, false, 99, '2026-06-20 05:43:38.222703+00', '2026-09-07 22:58:02.868+00'
);

-- 2b) site_industries: mismo criterio, fuera lo viejo, dentro lo real de producción.
delete from site_industries;

insert into site_industries (
  id, slug, name, tagline, description, icon_name, accent_color, bullet_points,
  template_id, display_order, visible, updated_at
) values
(
  '855608b8-73cc-43b4-996e-54f353a5ccb6', 'restaurantes', 'Restaurantes',
  $x$Reservas, menú y pedidos$x$,
  $x$Tu bot toma reservas, comparte el menú, registra pedidos y notifica a cocina. Sin saturar tu staff en hora pico.$x$,
  'Utensils', '#f97316',
  $x$["Reservas automáticas","Menú digital editable","Pedidos para llevar","Encuesta post-visita"]$x$::jsonb,
  null, 1, true, '2026-06-21 05:58:22.722923+00'
),
(
  'fe5aa10c-2d4c-48de-aeb4-724bfcfb789b', 'salud', 'Clínicas y consultorios',
  $x$Agenda, pacientes, recordatorios$x$,
  $x$Diseñado para clínicas dentales, médicos, fisioterapeutas, psicólogos. Cumple HIPAA y respeta la privacidad.$x$,
  'Stethoscope', '#0ea5e9',
  $x$["Agenda por especialista","Recordatorios pre-cita","Historial básico de paciente","Lista de espera"]$x$::jsonb,
  null, 2, true, '2026-06-21 05:58:22.722923+00'
),
(
  'f0f62025-6e22-4b83-9259-96a293d0a6c7', 'inmobiliaria', 'Inmobiliaria',
  $x$Propiedades, leads, visitas$x$,
  $x$Catálogo vivo, califica leads por intención y presupuesto, agenda visitas. Tu agente trabaja como un primer SDR.$x$,
  'Home', '#10b981',
  $x$["Catálogo importable por PDF","Calificación automática","Agenda de visitas","Importación masiva"]$x$::jsonb,
  null, 3, true, '2026-06-21 05:58:22.722923+00'
),
(
  '88706d52-a293-49de-bcbe-2edad011108a', 'marketing', 'Agencias de marketing',
  $x$Leads de campañas, CRM unificado$x$,
  $x$Conecta tus campañas de Meta y Google Ads. Califica leads en automático antes de pasarlos al cliente.$x$,
  'Megaphone', '#ec4899',
  $x$["Tracking UTM nativo","Calificación BANT","Webhook a tu CRM","Multi-cliente"]$x$::jsonb,
  null, 5, true, '2026-06-21 05:58:22.722923+00'
),
(
  '68810268-62db-4971-973c-1951fb809226', 'ventas', 'Ventas',
  '', '',
  '', '',
  $x$[]$x$::jsonb,
  null, 5, true, '2026-08-30 03:58:07.652092+00'
),
(
  'b46647f6-bd9e-41fa-a461-cef0c51be952', 'generico', 'Cualquier otro negocio',
  $x$Flexibilidad total$x$,
  $x$Si tu negocio no encaja en una vertical, la plantilla genérica te da todos los bloques para armar el flujo que necesites.$x$,
  'Sparkles', '#6366f1',
  $x$["Campos personalizables","Flujos a medida","Webhooks abiertos","Integraciones por API"]$x$::jsonb,
  null, 6, true, '2026-06-21 05:58:22.722923+00'
);

-- Nota: en producción la fila "ventas" trae tagline, icon_name y accent_color vacíos ("") —
-- se copió tal cual, no es un error de este script.

-- 3) addons: no existían en pruebas, se insertan de una. ON CONFLICT por si ya corriste esto antes.
insert into addons (
  id, name, short_name, description, category, icon,
  price_monthly_cents, price_one_time_cents, currency, stripe_price_id,
  is_recurring, is_one_time, feature_flags, capacity_grants,
  requires_plan_min, requires_template, is_active, is_featured, display_order,
  created_at, updated_at, available_for_templates
) values
(
  'health_calendar', 'Agenda y Citas con Google Calendar', 'Agenda Salud',
  $x$Convierte tu WhatsApp en una recepcionista 24/7. El agente IA toma citas, las sincroniza en Google Calendar, manda recordatorios automáticos, gestiona reagendamientos y cancelaciones, y registra el motivo de no-show. Pensado para consultorios médicos, dentistas, terapeutas y clínicas.$x$,
  'feature', 'CalendarCheck', 9900, 0, 'mxn', null, true, false,
  $x${"agenda_waitlist":true,"agenda_reminders":true,"agenda_reschedule_ai":true,"agenda_appointments_ai":true,"agenda_google_calendar":true,"agenda_no_show_tracking":true}$x$::jsonb,
  $x${}$x$::jsonb,
  null, 'health', false, true, 1,
  '2026-06-23 01:14:04.952807+00', '2026-08-20 21:43:42.077+00', ARRAY[]::text[]
),
(
  'realestate_properties', 'Catálogo de Propiedades con IA', 'Propiedades',
  $x$Carga tus propiedades (venta o renta) y el agente IA las muestra automáticamente al cliente cuando pregunta por casas, depas, terrenos o locales. Incluye filtros inteligentes (zona, precio, recámaras), ficha pública compartible y agendado de visitas. Importación masiva desde PDF.$x$,
  'feature', 'Building', 29900, 0, 'mxn', null, true, false,
  $x${"public_catalog":true,"realestate_catalog":true,"realestate_ai_search":true,"realestate_pdf_import":true,"realestate_visit_booking":true,"realestate_public_listings":true,"realestate_lead_qualification":true}$x$::jsonb,
  $x${}$x$::jsonb,
  null, 'real_estate', true, true, 2,
  '2026-06-23 01:14:04.952807+00', '2026-09-07 23:03:18.309+00', ARRAY[]::text[]
),
(
  'extra_channel', 'Otro canal de mensajes', 'Canal extra',
  $x$Conecta un canal más: WhatsApp, Instagram o Messenger.$x$,
  'channel', 'Plug', 29900, 0, 'mxn', null, true, false,
  $x${"channel_extra_generic":true}$x$::jsonb,
  $x${"max_channels":1,"extra_channels":1}$x$::jsonb,
  null, null, false, true, 2,
  '2026-06-20 05:43:53.212565+00', '2026-08-20 21:31:43.345+00', ARRAY[]::text[]
),
(
  'restaurant_menu', 'Menú Digital con IA', 'Menú',
  $x$Digitaliza tu carta con el wizard de importación desde PDF. El agente IA puede recomendar platillos, responder dudas de ingredientes/alérgenos, gestionar disponibilidad por horario, y compartir un menú público con foto, precio y descripción. Soporta categorías, tags y platillos destacados.$x$,
  'feature', 'Sparkles', 39900, 0, 'mxn', null, true, false,
  $x${"menu_digital":true,"menu_pdf_import":true,"menu_public_catalog":true,"menu_ai_recommendations":true,"menu_allergens_management":true,"menu_availability_schedule":true}$x$::jsonb,
  $x${}$x$::jsonb,
  null, 'restaurant', true, true, 3,
  '2026-06-23 01:14:04.952807+00', '2026-09-07 23:03:55.696+00', ARRAY[]::text[]
),
(
  'multi_location', 'Múltiples sucursales', 'Sucursales',
  $x$Maneja varias sedes desde una sola cuenta.$x$,
  'feature', 'Building', 39900, 0, 'mxn', null, true, false,
  $x${"reports_by_location":true,"location_aware_routing":true,"multi_location_enabled":true}$x$::jsonb,
  $x${"extra_locations":5}$x$::jsonb,
  null, null, true, true, 4,
  '2026-06-20 05:43:53.212565+00', '2026-08-26 14:55:02.77+00', ARRAY[]::text[]
),
(
  'restaurant_orders', 'Órdenes y Tracking en tiempo real', 'Órdenes',
  $x$Recibe pedidos por WhatsApp con el agente IA. Tablero kanban por estado (recibida → en preparación → lista → entregada), tracking público que el cliente abre desde su celular, notificaciones automáticas en cada cambio de estado, e integración con repartidores. Reportes de ventas por día/platillo.$x$,
  'feature', 'TrendingUp', 39900, 0, 'mxn', null, true, false,
  $x${"orders_kanban":true,"orders_ai_intake":true,"orders_notifications":true,"orders_sales_reports":true,"orders_public_tracking":true,"orders_delivery_routing":true}$x$::jsonb,
  $x${}$x$::jsonb,
  null, 'restaurant', true, true, 4,
  '2026-06-23 01:14:04.952807+00', '2026-09-07 23:04:04.292+00', ARRAY[]::text[]
),
(
  'pdf_wizard_menu', 'Subir menú con IA', 'Menú PDF',
  $x$Sube tu menú en PDF y la IA lo carga por ti en minutos.$x$,
  'ai', 'FileText', 29900, 0, 'MXN', null, true, false,
  $x${"ai_pdf_wizard_menu":true}$x$::jsonb,
  $x${}$x$::jsonb,
  'start', null, true, true, 50,
  '2026-06-20 05:53:21.301694+00', '2026-06-20 05:53:21.301694+00', ARRAY['restaurant']::text[]
),
(
  'pdf_wizard_properties', 'Subir propiedades con IA', 'Propiedades PDF',
  $x$Sube tu catálogo en PDF y la IA lo carga por ti en minutos.$x$,
  'ai', 'Building', 29900, 0, 'MXN', null, true, false,
  $x${"ai_pdf_wizard_properties":true}$x$::jsonb,
  $x${}$x$::jsonb,
  'start', null, true, true, 51,
  '2026-06-20 05:53:21.301694+00', '2026-09-07 23:04:15.034+00', ARRAY['real_estate']::text[]
),
(
  'fb9e125d-f4c9-4b03-89c7-75aac5126fcf', 'Directorio Público de Propiedades', 'Catálogo Web',
  $x$Página whitelabel con todo tu inventario activo, filtros por zona/precio/recámaras y botón directo a WhatsApp. URL bonita estilo ianswer.pro/p/tu-marca para compartir en redes y campañas.$x$,
  'feature', 'Globe', 29900, 0, 'MXN', null, true, false,
  $x${"properties_public_directory":true}$x$::jsonb,
  $x${}$x$::jsonb,
  'start', 'real_estate', true, false, 100,
  '2026-06-29 04:17:26.450897+00', '2026-06-29 04:17:26.450897+00', ARRAY['real_estate']::text[]
),
(
  '7681da90-c77b-4eab-9073-3ed60389f9f6', 'Catálogo Web', 'Catálogo Web',
  $x$Publica tu catálogo en línea con una página pública que puedes compartir. Tus clientes ven tus propiedades o tu menú desde cualquier link, sin necesidad de app. Cada elemento publicado tiene su propia URL para compartir por WhatsApp o redes.$x$,
  'feature', 'Globe', 0, 0, 'MXN', null, true, false,
  $x${"public_catalog":true}$x$::jsonb,
  $x${}$x$::jsonb,
  'start', null, true, true, 120,
  '2026-07-13 20:46:05.720713+00', '2026-07-13 20:46:05.720713+00', ARRAY[]::text[]
),
(
  '3eeeea1b-fcf8-462e-96df-3e2224e31c05', 'Entrenamiento PRO del Agente', 'Entrenamiento PRO',
  $x$Entrena a tu agente IA como si fuera un empleado nuevo. Un asistente te entrevista sobre cómo trabaja tu empresa, tu flujo de ventas, qué información dar y qué no, y casos comunes. Genera un documento de procesos que tu agente consulta en cada conversación, haciéndolo sonar como alguien que de verdad trabaja ahí.$x$,
  'ai', 'GraduationCap', 39900, 0, 'MXN', null, true, false,
  $x${"agent_training_pro":true}$x$::jsonb,
  $x${}$x$::jsonb,
  'growth', null, true, true, 140,
  '2026-07-05 17:08:48.619579+00', '2026-07-05 17:08:48.619579+00', ARRAY[]::text[]
),
(
  '77b908d1-722b-4256-b193-a2ee594b1698', 'Tracking de Pedidos', 'Tracking',
  $x$Página pública de rastreo estilo Domino's para cada pedido. El cliente ve el estado en tiempo real con timeline animado y tu branding. Además, tu bot puede responder el estado del pedido cuando el cliente pregunta por WhatsApp.$x$,
  'feature', 'MapPin', 19900, 0, 'MXN', null, true, false,
  $x${"order_tracking":true}$x$::jsonb,
  $x${}$x$::jsonb,
  'start', null, true, true, 160,
  '2026-07-02 10:35:03.024397+00', '2026-07-02 10:35:03.024397+00', ARRAY['restaurant']::text[]
)
on conflict (id) do nothing;

-- 4) site_settings sociales: faltaban por completo, se insertan/actualizan.
insert into site_settings (key, value, category, description, updated_at) values
('social_twitter',   '""'::jsonb, 'social', '', '2026-06-21 05:58:22.722923+00'),
('social_linkedin',  '""'::jsonb, 'social', '', '2026-06-21 05:58:22.722923+00'),
('social_instagram', '""'::jsonb, 'social', '', '2026-06-21 05:58:22.722923+00'),
('social_youtube',   '""'::jsonb, 'social', '', '2026-06-21 05:58:22.722923+00')
on conflict (key) do update set
  value = excluded.value,
  category = excluded.category,
  updated_at = excluded.updated_at;

commit;

-- Verificación rápida después de correrlo (deben dar: 6, 6, 12, 4):
-- select count(*) from templates;
-- select count(*) from site_industries;
-- select count(*) from addons;
-- select count(*) from site_settings where key like 'social_%';
