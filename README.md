# 📘 README — Plataforma Multi-Tenant de Asistente IA

**Versión 3.0** · Next.js 15 · Supabase · Stripe · Meta WhatsApp Business · n8n

---

## 🧭 Índice

- [Requisitos previos](#requisitos-previos)
- [Configuración del entorno](#configuración-del-entorno)
  - Variables de entorno (`.env.local`)
- [Configuración de Supabase](#configuración-de-supabase)
  - Migraciones SQL
  - Importación de datos CSV
- [Despliegue en Vercel](#despliegue-en-vercel)
- [Configuración de Meta (Facebook / WhatsApp)](#configuración-de-meta)
- [Configuración de Stripe](#configuración-de-stripe)
- [Configuración de n8n (workflows)](#configuración-de-n8n)
- [Cron jobs y webhooks](#cron-jobs-y-webhooks)
- [Checklist final](#checklist-final)

---

## Requisitos previos

- Node.js 20+ y npm / yarn
- Cuenta en [Supabase](https://supabase.com) (plan gratuito o superior)
- Cuenta en [Vercel](https://vercel.com) (plan gratuito)
- Cuenta de [Meta for Developers](https://developers.facebook.com) (para WhatsApp Business API y Facebook Login)
- Cuenta de [Stripe](https://stripe.com) (para suscripciones y pagos)
- Cuenta de [n8n](https://n8n.io) (self‑hosted o en la nube) — opcional pero recomendado para automatizaciones
- (Opcional) Clave API de [DeepSeek](https://deepseek.com) para el agente IA

---

## Configuración del entorno

Crea un archivo `.env.local` en la raíz del proyecto con **todas** las variables que se listan a continuación.  
El proyecto ya incluye un `.env.example` con los nombres, pero debes llenar los valores reales.

### Variables obligatorias (plataforma)

- **`NEXT_PUBLIC_SUPABASE_URL`** – URL de tu proyecto Supabase.  
  _Dónde obtenerla:_ Dashboard de Supabase → Settings → API.

- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** – Clave anónima de Supabase.  
  _Dónde obtenerla:_ Mismo lugar que la URL.

- **`SUPABASE_SERVICE_ROLE_KEY`** – Clave de servicio (para operaciones admin).  
  _Dónde obtenerla:_ Mismo lugar (¡guárdala segura!).

- **`NEXT_PUBLIC_BASE_URL`** – URL pública de tu aplicación (ej. `https://tudominio.com`).  
  _Dónde obtenerla:_ Tu dominio o `http://localhost:3000` en desarrollo.

- **`CRON_SECRET`** – Secreto para autenticar los cron jobs de Vercel.  
  _Dónde obtenerla:_ Genera una cadena aleatoria (ej. `openssl rand -hex 32`).

- **`AGENT_API_SECRET`** – Secreto que usan las herramientas del agente (puedes usar el mismo que `CRON_SECRET`).  
  _Dónde obtenerla:_ Genera otra cadena aleatoria.

### Variables para autenticación (Resend)

- **`RESEND_API_KEY`** – Clave API de Resend para envío de emails.  
  _Dónde obtenerla:_ Dashboard de Resend → API Keys.

- **`EMAIL_FROM`** – Email verificado desde el que se envían los correos (ej. `"Mi App <no-reply@tudominio.com>"`).  
  _Dónde obtenerla:_ Debes verificar un dominio en Resend.

### Variables para Stripe

- **`STRIPE_SECRET_KEY`** – Clave secreta de Stripe (comienza con `sk_`).  
  _Dónde obtenerla:_ Dashboard de Stripe → Developers → API Keys.

- **`STRIPE_WEBHOOK_SECRET`** – Secreto del webhook de Stripe.  
  _Dónde obtenerla:_ Dashboard de Stripe → Webhooks → Endpoint details.

- **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** – Clave publicable de Stripe (comienza con `pk_`).  
  _Dónde obtenerla:_ Mismo lugar que la secreta.

### Variables para Meta (Facebook / WhatsApp)

- **`NEXT_PUBLIC_META_APP_ID`** – ID de tu app en Meta for Developers.  
  _Dónde obtenerla:_ developers.facebook.com → tu app → Dashboard.

- **`NEXT_PUBLIC_META_CONFIG_ID`** – ID de configuración de Embedded Signup.  
  _Dónde obtenerla:_ developers.facebook.com → WhatsApp → Embedded Signup.

- **`META_APP_SECRET`** – App Secret de Meta.  
  _Dónde obtenerla:_ developers.facebook.com → tu app → Settings → Basic.

- **`META_GRAPH_VERSION`** – Versión de la Graph API (por defecto `v22.0`).  
  _Dónde obtenerla:_ Puedes dejarlo fijo.

- **`META_WA_REGISTER_PIN`** – PIN de 6 dígitos para registrar números en la Cloud API.  
  _Dónde obtenerla:_ Tú lo defines (ej. `000000`).

### Variables para n8n (opcional, pero necesarias para el asistente)

- **`N8N_WEBHOOK_URL`** – URL base de tu instancia de n8n (ej. `https://n8n.tudominio.com`).  
  _Dónde obtenerla:_ Tu instancia de n8n.

- **`N8N_API_KEY`** – (Opcional) Clave API de n8n si usas autenticación.  
  _Dónde obtenerla:_ n8n → Settings → API.

### Variables para el agente IA (DeepSeek)

- **`DEEPSEEK_API_KEY`** – Clave API de DeepSeek.  
  _Dónde obtenerla:_ platform.deepseek.com → API Keys.

### Variables para el PAC (Proveedor Autorizado de Certificación) – facturación CFDI

- **`PAC_PROVIDER`** – `stub` (sin PAC) o `facturama` (cuando contrates).  
- **`PAC_API_URL`** – URL del endpoint de Facturama.  
- **`PAC_USERNAME`** – Usuario de Facturama.  
- **`PAC_PASSWORD`** – Contraseña de Facturama.  
- **`EMISOR_RFC`** – RFC del emisor (tu empresa).  
- **`EMISOR_LEGAL_NAME`** – Razón social.  
- **`EMISOR_REGIME`** – Código de régimen fiscal (ej. `601`).  
- **`EMISOR_ZIP`** – Código postal del domicilio fiscal.

_Las credenciales del PAC se obtienen desde el dashboard de Facturama o de tu proveedor._

---

## Configuración de Supabase

### 1. Crear el proyecto

- Ve a [supabase.com](https://supabase.com) y crea un nuevo proyecto.
- Anota la URL y las claves (anon y service role).
- Espera a que la base de datos esté lista (unos 2 minutos).

### 2. Ejecutar las migraciones SQL

El proyecto incluye una carpeta `database/` con varios archivos SQL que crean las tablas, funciones RPC, políticas RLS, triggers y datos base. **Debes ejecutarlos en orden** (los nombres comienzan con `01_`, `02_`, ...).

Desde el SQL Editor de Supabase:

1. Abre el SQL Editor.
2. Crea una nueva consulta.
3. Copia el contenido de cada archivo de `database/` en orden numérico.
4. Ejecuta cada uno (puedes ejecutar todos en una sola consulta si los pegas seguidos, pero es mejor uno por uno para detectar errores).

> ⚠️ **Importante:** Asegúrate de que el esquema `public` sea el predeterminado.

### 3. Importar los datos iniciales (CSV)

El proyecto incluye archivos CSV con datos de ejemplo para tablas como `plans`, `addons`, `templates`, `site_settings`, etc. Están en la carpeta `seed/` (o `data/`).

Desde el panel de Supabase:

1. Ve a la sección **Table Editor**.
2. Selecciona una tabla (ej. `plans`).
3. Haz clic en **Import** y selecciona el archivo CSV correspondiente.
4. Repite para cada tabla.

📌 **Orden recomendado:**  
`plans` → `templates` → `addons` → `site_settings` → `help_articles` → `site_features` → etc.

Si no tienes los CSV, puedes insertar manualmente los registros base usando las instrucciones en el archivo `seed.sql` (si existe).

---

## Despliegue en Vercel

### 1. Subir el código a GitHub

- Crea un repositorio en GitHub (privado o público).
- Sube todo el código (incluyendo `.gitignore`).

### 2. Conectar Vercel con GitHub

- Inicia sesión en Vercel.
- Haz clic en **Add New... → Project**.
- Importa el repositorio desde GitHub.
- Vercel detectará automáticamente que es un proyecto Next.js.

### 3. Configurar variables de entorno en Vercel

- Ve a la pestaña **Settings → Environment Variables** de tu proyecto en Vercel.
- Añade **todas** las variables que definiste en `.env.local` (excepto `NEXT_PUBLIC_BASE_URL` que Vercel asigna automáticamente).
- Marca las que sean secretas (claves) como **Secret** (aunque Vercel las oculta igual).
- Asegúrate de que estén disponibles para los entornos **Production**, **Preview** y **Development** según necesites.

### 4. Desplegar

- Vercel desplegará automáticamente al hacer push a la rama principal.
- Puedes forzar un despliegue manual desde el panel de Vercel.

---

## Configuración de Meta (Facebook / WhatsApp)

### 1. Crear una app en Meta for Developers

- Ve a [developers.facebook.com](https://developers.facebook.com) y crea una nueva app (tipo **Business**).
- Anota el **App ID** y el **App Secret**.
- En **Settings → Basic**, agrega tu dominio (el de Vercel) en el campo **App Domains**.

### 2. Configurar WhatsApp Business Platform

- En el panel de tu app, ve a **WhatsApp → Configuration**.
- Genera un **Access Token** permanente (System User) y guárdalo (lo usarás para conectar números).
- Configura el **Webhook**:
  - URL de callback: `https://tudominio.com/api/whatsapp/webhook` (o la que tengas en el código).
  - Verifica el token con `CRON_SECRET`.
- Suscribe los eventos: `messages`, `message_deliveries`, `message_reads`.

### 3. Configurar Facebook Login (para autenticación)

- En **Products**, añade **Facebook Login**.
- Configura el URI de redirección: `https://tudominio.com/api/auth/callback`.
- Marca los permisos necesarios: `email`, `public_profile`.

### 4. Configurar Embedded Signup (conexión rápida de WhatsApp)

- En la sección **WhatsApp → Embedded Signup**, genera una configuración (`config_id`) y guárdala en `NEXT_PUBLIC_META_CONFIG_ID`.

---

## Configuración de Stripe

### 1. Crear una cuenta y obtener claves

- Ve a [stripe.com](https://stripe.com) y crea una cuenta.
- Obtén las claves publicable y secreta (modo **test** inicialmente).

### 2. Crear productos y precios

- En el panel de Stripe, ve a **Products**.
- Crea un producto por cada plan (Start, Growth, Scale) con precios mensual y anual.
- Anota los IDs de los precios (ej. `price_1ABC...`) y guárdalos en la tabla `plans` (columnas `stripe_price_id` y `stripe_price_yearly_id`).

### 3. Configurar webhook

- En Stripe, ve a **Webhooks** y añade un endpoint: `https://tudominio.com/api/stripe/webhook`.
- Selecciona los eventos:  
  `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
- Copia el **Webhook Secret** y ponlo en `STRIPE_WEBHOOK_SECRET`.

---

## Configuración de n8n (workflows)

Los workflows de n8n se incluyen en la carpeta `src/workflows/`. Debes importarlos en tu instancia de n8n y ajustar las credenciales:

1. Inicia sesión en n8n.
2. Ve a **Workflows** y usa **Import from File** para subir cada archivo `.json`.
3. Revisa los nodos que requieren credenciales (Supabase, Google Calendar, WhatsApp, etc.) y conéctalos con tus cuentas.
4. Publica los workflows (actívalos).

**Workflows principales:**

- `main.json` – el asistente conversacional que recibe mensajes de WhatsApp.
- `sincronizar-calendario.json` – extrae eventos de Google Calendar para la agenda.
- `verificar-calendario.json` – valida que el calendario de Google tenga acceso.
- `web-a-paciente.json` – envía mensajes desde el panel administrativo (Inbox) al cliente.

---

## Cron jobs y webhooks

Vercel permite ejecutar funciones serverless en un horario programado mediante **crons** (definidos en `vercel.json`).

Asegúrate de que en `vercel.json` tengas definidos:

```json
{
  "crons": [
    { "path": "/api/cron/check-expired-trials", "schedule": "0 6 * * *" },
    { "path": "/api/cron/cleanup-old-messages", "schedule": "0 3 * * *" },
    { "path": "/api/cron/hubspot-sync",         "schedule": "0 */6 * * *" }
  ]
}
```

Estos endpoints requieren el header `Authorization: Bearer ${CRON_SECRET}`.

---

## Checklist final

Antes de dar por finalizado el despliegue, verifica:

- [ ] Todos los `.env.local` están reflejados en Vercel.
- [ ] Supabase tiene todas las tablas y RPCs creadas.
- [ ] Los datos CSV están importados.
- [ ] Stripe tiene los productos y precios configurados (y los IDs en la tabla `plans`).
- [ ] El webhook de Stripe está activo y apunta a tu endpoint.
- [ ] La app de Meta está configurada con tu dominio y el Embedded Signup.
- [ ] Los workflows de n8n están importados y activos.
- [ ] Las URLs de los webhooks de Meta apuntan a tu instancia de n8n (o a las rutas de API de Next.js si decides no usar n8n).
- [ ] Prueba el flujo completo: registro de usuario, conexión de WhatsApp, envío de mensaje, respuesta del agente, agendamiento de cita.

---

## Soporte

Si encuentras algún problema, revisa los logs en Vercel (Functions) y en Supabase (Logs). La mayoría de los errores provienen de variables de entorno faltantes o credenciales incorrectas.