 

'use client'

// ============================================================================
// src/components/whatsapp/ConnectWhatsAppButton.tsx
// ----------------------------------------------------------------------------
// Botón "Conectar con Facebook" que dispara Embedded Signup oficial de Meta.
//
// Flow:
//   1. Usuario hace click → llamamos FB.login() con config Embedded Signup
//   2. Se abre popup oficial de Meta — usuario:
//      - Logea con Facebook
//      - Selecciona Business Manager
//      - Selecciona/crea WABA
//      - Agrega número y verifica SMS
//      - Acepta términos
//   3. Meta envía via window.postMessage los datos del WABA conectado
//   4. FB.login callback nos da un `code` de autorización
//   5. Mandamos { code, phone_number_id, waba_id } al backend
//   6. Backend intercambia code por Business Integration Token (long-lived)
//   7. Backend suscribe webhook + guarda en companies
//   8. Frontend recarga estado de conexión
//
// Refs oficiales:
// https://developers.facebook.com/docs/whatsapp/embedded-signup/implementation
// ============================================================================

import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react'

// ─── Logo "f" de Facebook inline (lucide-react ya no incluye este icono) ──
// Es legal usar el logotipo "f" oficial en botones de login con Meta.
function FacebookLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>
    </svg>
  )
}

interface Props {
  /** Callback cuando la conexión termina con éxito */
  onSuccess?: (data: { phone_number_id: string; waba_id: string }) => void
  /** Callback cuando hay error */
  onError?: (error: string) => void
  /** Estilo: 'primary' (verde lime) o 'secondary' (gris) */
  variant?: 'primary' | 'secondary'
  /** Si el SDK aún no está cargado, mostrar este texto */
  className?: string
}

export default function ConnectWhatsAppButton({
  onSuccess, onError, variant = 'primary', className = ''
}: Props) {
  const [sdkReady, setSdkReady]   = useState(false)
  const [working, setWorking]     = useState(false)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)

  // ─── Esperar a que FB SDK esté cargado ──────────────────────────────────
  useEffect(() => {
    const check = () => {
      if (typeof window !== 'undefined' && window.FB) {
        setSdkReady(true)
        return true
      }
      return false
    }
    if (check()) return
    const interval = setInterval(() => {
      if (check()) clearInterval(interval)
    }, 300)
    // Timeout: si no carga en 10s, asumimos que está bloqueado
    const timeout = setTimeout(() => {
      clearInterval(interval)
      if (!window.FB) setErrorMsg('No se pudo cargar Facebook. ¿Bloqueador de anuncios activado?')
    }, 10000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [])

  // ─── Escuchar el evento postMessage de Embedded Signup ──────────────────
  // Meta envía un postMessage con { type: 'WA_EMBEDDED_SIGNUP', event: '...', data: {...} }
  useEffect(() => {
    // ⚠️ El popup de Embedded Signup v4 publica desde business.facebook.com.
    // Antes solo aceptábamos www/web.facebook.com, así que los datos de la
    // sesión (phone_number_id / waba_id) se descartaban en silencio.
    const ORIGENES_VALIDOS = [
      'https://www.facebook.com',
      'https://web.facebook.com',
      'https://business.facebook.com',
    ]

    function handleMessage(event: MessageEvent) {
      if (!ORIGENES_VALIDOS.includes(event.origin)) return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          // FINISH = número + WABA listos. FINISH_ONLY_WABA = solo se creó la
          // cuenta (el número se agrega después); igual guardamos lo que llegue.
          if ((data?.event === 'FINISH' || data?.event === 'FINISH_ONLY_WABA') && data?.data) {
            sessionStorage.setItem('wa_embedded_signup_data', JSON.stringify(data.data))
          }
          if (data?.event === 'CANCEL') {
            sessionStorage.removeItem('wa_embedded_signup_data')
            setErrorMsg('Conexión cancelada')
            setWorking(false)
          }
          if (data?.event === 'ERROR') {
            sessionStorage.removeItem('wa_embedded_signup_data')
            setErrorMsg(data?.data?.error_message || 'Meta reportó un error durante el registro')
            setWorking(false)
          }
        }
      } catch (e) {
        // Ignorar mensajes que no son JSON
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // ─── Procesar la respuesta del popup (async, fuera del callback de FB) ──
  async function procesarRespuesta(response: any) {
    try {
      if (response?.status !== 'connected' || !response?.authResponse) {
        setWorking(false)
        const reason = response?.status === 'not_authorized'
          ? 'No autorizaste el acceso a WhatsApp Business'
          : 'Conexión interrumpida'
        setErrorMsg(reason)
        onError?.(reason)
        return
      }

      const code = response.authResponse.code
      if (!code) {
        setWorking(false)
        setErrorMsg('No recibimos el código de autorización de Meta')
        return
      }

      // Recuperar los IDs que Meta mandó por postMessage durante el registro
      const signupRaw = sessionStorage.getItem('wa_embedded_signup_data')
      const signupData = signupRaw ? JSON.parse(signupRaw) : {}
      const phoneNumberId = signupData?.phone_number_id
      const wabaId        = signupData?.waba_id

      if (!phoneNumberId || !wabaId) {
        setWorking(false)
        setErrorMsg('No recibimos los datos del WhatsApp Business (número o cuenta). Vuelve a intentarlo y completa todos los pasos del popup.')
        return
      }

      // Mandar al backend para intercambiar code → token y guardar
      const res = await fetch('/api/whatsapp/embedded-signup/exchange', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          code,
          phone_number_id: phoneNumberId,
          waba_id:         wabaId
        })
      })

      const result = await res.json()
      if (!res.ok || !result.success) {
        const msg = result?.error || 'Error guardando la configuración'
        setWorking(false)
        setErrorMsg(msg)
        onError?.(msg)
        return
      }

      sessionStorage.removeItem('wa_embedded_signup_data')
      setWorking(false)

      // Avisar si el número quedó sin registrar: aparece conectado pero no
      // puede enviar ni recibir hasta completar el registro en Meta.
      if (result?.data && result.data.numero_registrado === false) {
        setErrorMsg(
          'Conectado, pero el número quedó "No registrado" en Meta y todavía no puede enviar ni recibir.'
          + (result.data.registro_error ? ` (${result.data.registro_error})` : '')
        )
      }

      onSuccess?.({ phone_number_id: phoneNumberId, waba_id: wabaId })
    } catch (err: any) {
      setWorking(false)
      setErrorMsg('Error inesperado: ' + (err?.message || 'desconocido'))
      onError?.(err?.message || 'unknown')
    }
  }

  // ─── Disparar Embedded Signup ──────────────────────────────────────────
  function handleClick() {
    const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID
    if (!configId) {
      setErrorMsg('Configuración de Meta no encontrada.')
      return
    }
    if (!window.FB) {
      setErrorMsg('Facebook SDK no cargó. Recarga la página.')
      return
    }

    setErrorMsg(null)
    setWorking(true)
    sessionStorage.removeItem('wa_embedded_signup_data')

    // Red de seguridad: si el popup se cierra sin devolver el callback (bloqueo
    // de ventanas, dominio no autorizado, o el usuario lo cierra con la X), el
    // botón no puede quedarse girando indefinidamente.
    let settled = false
    const safety = setTimeout(() => {
      if (!settled) {
        setWorking(false)
        setErrorMsg('No se recibió respuesta de Meta. Revisa que el popup no esté bloqueado y que tu dominio esté autorizado en la app de Meta.')
      }
    }, 120000)

    // ⚠️ FB.login NO acepta un callback `async`: el SDK lo rechaza ("Expression
    // is of type asyncfunction, not function") y el popup nunca abre — el botón
    // se queda girando en "Conectando...". El callback debe ser una función
    // normal; adentro llamamos a una async aparte. (Mismo fix que ya existe en
    // las páginas de Facebook e Instagram.)
    window.FB.login(
      (response: any) => {
        settled = true
        clearTimeout(safety)
        void procesarRespuesta(response)
      },
      {
        config_id:                       configId,
        response_type:                   'code',
        override_default_response_type:  true,
        // ⚠️ Extras del Embedded Signup v4 (los que genera el panel de Meta).
        // El formato viejo (`feature: 'whatsapp_embedded_signup'`, `version: 3`)
        // hacía que el popup no devolviera el callback y el botón se quedaba
        // girando en "Conectando...".
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3'
        }
      }
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────
  const baseClasses = variant === 'primary'
    ? 'bg-lime-400 hover:bg-lime-300 text-slate-950'
    : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'

  return (
    <div className={className}>
      <button
        onClick={handleClick}
        disabled={!sdkReady || working}
        className={`w-full md:w-auto px-6 py-4 ${baseClasses} disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl font-black text-base transition-colors inline-flex items-center justify-center gap-3`}
      >
        {working ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Conectando...
          </>
        ) : !sdkReady ? (
          <>
            <Loader2 size={18} className="animate-spin opacity-50" />
            Cargando Facebook...
          </>
        ) : (
          <>
            <FacebookLogo size={20} />
            Conectar con Facebook
            <ExternalLink size={14} />
          </>
        )}
      </button>

      {errorMsg && (
        <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2 items-start">
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <p className="text-xs font-medium text-rose-900">{errorMsg}</p>
        </div>
      )}
    </div>
  )
}
