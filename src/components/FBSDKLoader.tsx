 

'use client'

// ============================================================================
// src/components/FBSDKLoader.tsx
// ----------------------------------------------------------------------------
// Carga el SDK de Facebook para JavaScript en el cliente. Necesario para
// Embedded Signup de WhatsApp Business Platform.
//
// Se monta en el RootLayout para que esté disponible en todas las páginas.
// Inicializa fbAsyncInit y carga sdk.js asincrónicamente.
//
// IMPORTANTE: solo se carga si NEXT_PUBLIC_META_APP_ID está definido.
// Esto evita errores cuando alguien clona el repo sin configurar Meta.
// ============================================================================

import { useEffect } from 'react'

declare global {
  interface Window {
    FB: any
    fbAsyncInit: () => void
  }
}

export default function FBSDKLoader() {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    if (!appId) {
      console.warn('[FBSDKLoader] NEXT_PUBLIC_META_APP_ID no definido. Embedded Signup deshabilitado.')
      return
    }

    // Evitar doble carga
    if (document.getElementById('facebook-jssdk')) return

    // Init callback
    window.fbAsyncInit = function () {
      window.FB.init({
        appId:    appId,
        cookie:   true,
        xfbml:    true,
        version:  'v22.0'
      })
    }

    // Inyectar el script
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    document.body.appendChild(script)
  }, [])

  return null
}
