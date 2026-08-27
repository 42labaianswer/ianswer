 

'use client'

// ============================================================================
// ConnectMetaButton · Conecta Facebook (Messenger) e Instagram con un clic.
// ----------------------------------------------------------------------------
// Reemplaza el placeholder anterior que guardaba un token falso. Ahora hace
// FB.login real con los permisos de páginas + mensajería + Instagram, y manda
// el token al backend (/api/meta/connect/exchange) que detecta la página y su
// cuenta de Instagram vinculada y las guarda en integrations.
//
// Requiere que el SDK de Facebook esté cargado (FBSDKLoader, el mismo que usa
// WhatsApp). Si window.FB no existe, avisa que recargue.
// ============================================================================

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Link2 } from 'lucide-react'

// Permisos necesarios para Messenger + Instagram DM:
//  - pages_show_list: listar las páginas del usuario
//  - pages_messaging: enviar/recibir mensajes de Messenger
//  - pages_manage_metadata: suscribir la app a los webhooks de la página
//  - pages_read_engagement: leer info de la página
//  - instagram_basic: acceder a la cuenta de Instagram vinculada
//  - instagram_manage_messages: enviar/recibir DMs de Instagram
//  - business_management: gestión del negocio
const META_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_messages',
  'business_management'
].join(',')

export default function ConnectMetaButton({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient()
  const [working, setWorking] = useState(false)

  function handleConnect() {
    const FB = typeof window !== 'undefined' ? (window as any).FB : undefined
    if (!FB) {
      toast.error('El SDK de Facebook aún no carga. Recarga la página e intenta de nuevo.')
      return
    }

    setWorking(true)

    FB.login(
      async (response: any) => {
        try {
          if (response.status !== 'connected' || !response.authResponse) {
            setWorking(false)
            const reason = response.status === 'not_authorized'
              ? 'No autorizaste el acceso a tus páginas'
              : 'Conexión cancelada'
            toast.error(reason)
            return
          }

          const accessToken = response.authResponse.accessToken
          if (!accessToken) {
            setWorking(false)
            toast.error('No recibimos el token de acceso de Meta')
            return
          }

          const res = await fetch('/api/meta/connect/exchange', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ access_token: accessToken })
          })
          const result = await res.json()

          if (!res.ok || !result.success) {
            setWorking(false)
            toast.error(result?.error || 'Error al conectar con Meta')
            return
          }

          const igMsg = result.instagram
            ? ` e Instagram (@${result.instagram.username || 'cuenta'})`
            : ''
          toast.success(`Facebook conectado${igMsg}`)

          queryClient.invalidateQueries({ queryKey: ['facebookIntegration'] })
          queryClient.invalidateQueries({ queryKey: ['instagramIntegration'] })
          queryClient.invalidateQueries({ queryKey: ['connectivity', companyId] })
          setWorking(false)
        } catch (err: any) {
          setWorking(false)
          toast.error('Error inesperado: ' + (err?.message || 'desconocido'))
        }
      },
      {
        scope: META_SCOPES,
        return_scopes: true
      }
    )
  }

  return (
    <button
      onClick={handleConnect}
      disabled={working}
      className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
    >
      {working ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Conectando...
        </>
      ) : (
        <>
          <Link2 size={14} /> Conectar Facebook / Instagram
        </>
      )}
    </button>
  )
}
