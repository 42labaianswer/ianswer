 

'use client'

// ============================================================================
// src/app/dashboard/connectivity/diagnostico/page.tsx
// ----------------------------------------------------------------------------
// Vista GLOBAL: el semáforo de los tres canales juntos, más la prueba de punta
// a punta. Sigue existiendo como "ver todo de un vistazo", pero ahora cada
// canal también trae su propio diagnóstico dentro de su página
// (/dashboard/connectivity/whatsapp | facebook | instagram).
//
// Toda la lógica del semáforo y la prueba en vivo vive en un solo componente
// reutilizable: <ChannelDiagnostics />. Aquí hacemos UN fetch y repartimos el
// resultado a los tres (modo controlado), sin duplicar código.
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '../../../../components/PageHeader'
import ChannelDiagnostics, { type CanalDiagnostico, type CanalKey } from '../../../../components/ChannelDiagnostics'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2, RefreshCw, MessageSquare } from 'lucide-react'
import IAnswerLoader from '../../../../components/IAnswerLoader'

const CANALES: Array<{ canal: CanalKey; nombre: string }> = [
  { canal: 'whatsapp', nombre: 'WhatsApp Business' },
  { canal: 'messenger', nombre: 'Facebook Messenger' },
  { canal: 'instagram', nombre: 'Instagram Direct' },
]

export default function DiagnosticoCanalesPage() {
  const router = useRouter()
  const [canales, setCanales] = useState<CanalDiagnostico[]>([])
  const [cargando, setCargando] = useState(true)
  const [revisando, setRevisando] = useState(false)

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setRevisando(true)
    try {
      const res = await fetch('/api/channels/diagnostics', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data?.error || 'No se pudo revisar el estado de los canales')
        return
      }
      setCanales(data.canales || [])
    } catch (e: any) {
      toast.error('Error al revisar: ' + (e?.message || 'desconocido'))
    } finally {
      setCargando(false)
      setRevisando(false)
    }
  }, [])

  useEffect(() => { cargar(true) }, [cargar])

  const porCanal = (canal: CanalKey) => canales.find(c => c.canal === canal) || null

  if (cargando) {
    return <div className="flex h-[60vh] items-center justify-center"><IAnswerLoader size={32} /></div>
  }

  return (
    <div className="animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <button onClick={() => router.push('/dashboard/connectivity')} className="text-sm font-bold text-slate-500 hover:text-slate-900 mb-4 flex items-center gap-2">
        <ArrowLeft size={16} /> Conectividad
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Diagnóstico de canales"
          description="Revisa si tus canales están realmente funcionando, antes de que un cliente se quede sin respuesta."
        />
        <button
          onClick={() => cargar()}
          disabled={revisando}
          className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50 shrink-0"
        >
          {revisando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Revisar de nuevo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-2">
        {CANALES.map(({ canal, nombre }) => (
          <ChannelDiagnostics
            key={canal}
            canal={canal}
            nombre={nombre}
            data={porCanal(canal)}
            loading={revisando}
            onRefresh={() => cargar()}
            showRefresh={false}
          />
        ))}
      </div>

      {/* Ayuda */}
      <div className="mt-8 bg-slate-50 rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start gap-3">
          <MessageSquare size={20} className="text-slate-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600 space-y-2">
            <p className="font-bold text-slate-800">Qué significa cada comprobación</p>
            <p><strong>Credenciales guardadas:</strong> el canal está dado de alta en el sistema.</p>
            <p><strong>Token válido:</strong> le preguntamos a Meta si tu token sigue vivo. Los tokens caducan, y esta es la forma de enterarte antes de quedarte sin servicio.</p>
            <p><strong>Webhook suscrito:</strong> confirma que Meta va a enviarnos los mensajes que reciba tu cuenta. Si falla, tu asistente nunca se entera de que alguien escribió.</p>
            <p><strong>Prueba en vivo:</strong> la única que verifica la cadena completa, desde que el cliente escribe hasta que el asistente responde.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

