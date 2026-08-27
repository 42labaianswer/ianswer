 

// ============================================================================
// src/lib/ensureFacebookSdk.ts
// ----------------------------------------------------------------------------
// Garantiza que el SDK de Facebook (window.FB) esté cargado antes de usarlo.
// Si ya está, lo devuelve. Si no, lo carga él mismo y espera a que inicialice.
// Así los botones de conexión no dependen de que el FBSDKLoader global haya
// terminado de cargar, ni fallan por timing.
//
// Devuelve el objeto FB, o lanza un error con un mensaje claro si falta el
// NEXT_PUBLIC_META_APP_ID (la causa más común de que no cargue).
// ============================================================================

const GRAPH_VERSION = 'v22.0'

export async function ensureFacebookSdk(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('Solo disponible en el navegador')
  }

  // Ya está cargado
  if ((window as any).FB) return (window as any).FB

  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  if (!appId) {
    throw new Error(
      'Falta configurar el ID de la app de Meta (NEXT_PUBLIC_META_APP_ID). ' +
      'Agrégalo en las variables de entorno de producción y vuelve a desplegar.'
    )
  }

  // Cargar el script si no existe
  if (!document.getElementById('facebook-jssdk')) {
    (window as any).fbAsyncInit = function () {
      (window as any).FB.init({
        appId,
        cookie: true,
        xfbml: true,
        version: GRAPH_VERSION
      })
    }
    const script = document.createElement('script')
    script.id = 'facebook-jssdk'
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    document.body.appendChild(script)
  }

  // Esperar a que window.FB esté disponible (hasta ~10s)
  return await new Promise<any>((resolve, reject) => {
    let waited = 0
    const interval = setInterval(() => {
      if ((window as any).FB) {
        clearInterval(interval)
        resolve((window as any).FB)
      } else if (waited >= 10000) {
        clearInterval(interval)
        reject(new Error('El SDK de Facebook no cargó. Revisa tu conexión o desactiva bloqueadores y reintenta.'))
      }
      waited += 200
    }, 200)
  })
}
