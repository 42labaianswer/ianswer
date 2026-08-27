 

'use client'

// ============================================================================
// src/components/ChannelDiagnostics.tsx
// ----------------------------------------------------------------------------
// Panel de diagnóstico de UN canal (WhatsApp, Messenger o Instagram). Reúne:
//   - Semáforo de comprobaciones (credenciales, token, webhook, ruteo)
//   - Último mensaje recibido
//   - Prueba en vivo de punta a punta (Meta → n8n → IA → Meta)
//
// Antes esta lógica vivía solo en /dashboard/connectivity/diagnostico (los tres
// canales juntos). Ahora es un componente reutilizable para mostrarlo DENTRO de
// cada canal ("ver diagnóstico de Facebook y te sale el de Facebook") y también
// para reconstruir la vista global sin duplicar código.
//
// Dos modos:
//   1. Autónomo  → no recibe `data`; hace su propio fetch a /api/channels/diagnostics
//                  y filtra al canal indicado. Trae su botón "Revisar".
//   2. Controlado → recibe `data`, `loading` y `onRefresh` del padre (la vista
//                   global hace UN solo fetch y reparte los tres canales).
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, Loader2,
  RefreshCw, PlayCircle, Clock, Radio, Wrench,
} from 'lucide-react'

export type EstadoCheck = 'ok' | 'error' | 'aviso' | 'desconocido'
export type CanalKey = 'whatsapp' | 'messenger' | 'instagram'

export interface Check {
  id: string
  titulo: string
  estado: EstadoCheck
  detalle: string
}

export interface CanalDiagnostico {
  canal: CanalKey
  nombre: string
  conectado: boolean
  estadoGeneral: EstadoCheck
  checks: Check[]
  ultimoMensaje: string | null
  /** true si el canal se puede re-suscribir al webhook desde la app (FB/IG) */
  reparable?: boolean
}

export const COLORES_CANAL: Record<CanalKey, string> = {
  whatsapp: '#25D366',
  messenger: '#1877F2',
  instagram: '#C13584',
}

const DURACION_PRUEBA = 120 // segundos

const ETIQUETA: Record<EstadoCheck, string> = {
  ok: 'Funcionando',
  error: 'Con problemas',
  aviso: 'Revisar',
  desconocido: 'Sin datos',
}

const CLASE_BADGE: Record<EstadoCheck, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
  aviso: 'bg-amber-50 text-amber-700 border-amber-200',
  desconocido: 'bg-slate-50 text-slate-600 border-slate-200',
}

function tiempoRelativo(iso: string | null): string {
  if (!iso) return 'Nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Hace menos de un minuto'
  if (min < 60) return `Hace ${min} ${min === 1 ? 'minuto' : 'minutos'}`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `Hace ${hrs} ${hrs === 1 ? 'hora' : 'horas'}`
  const dias = Math.floor(hrs / 24)
  return `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}

function IconoEstado({ estado, size = 18 }: { estado: EstadoCheck; size?: number }) {
  if (estado === 'ok')    return <CheckCircle2 size={size} className="text-emerald-600" />
  if (estado === 'error') return <XCircle size={size} className="text-rose-600" />
  if (estado === 'aviso') return <AlertTriangle size={size} className="text-amber-600" />
  return <HelpCircle size={size} className="text-slate-400" />
}

interface ChannelDiagnosticsProps {
  canal: CanalKey
  /** Nombre a mostrar. Si no viene, se usa el de la respuesta del diagnóstico. */
  nombre?: string
  /** Modo controlado: el padre pasa el diagnóstico ya resuelto de este canal. */
  data?: CanalDiagnostico | null
  /** Modo controlado: el padre indica si está recargando. */
  loading?: boolean
  /** Modo controlado: recarga delegada al padre. Si no viene, el botón recarga solo este canal. */
  onRefresh?: () => void
  /** Mostrar el botón "Revisar" del encabezado. Default: true en modo autónomo. */
  showRefresh?: boolean
  className?: string
}

export default function ChannelDiagnostics({
  canal,
  nombre,
  data: dataProp,
  loading: loadingProp,
  onRefresh,
  showRefresh,
  className = '',
}: ChannelDiagnosticsProps) {
  const controlado = dataProp !== undefined
  const color = COLORES_CANAL[canal]

  // ── Estado propio (solo en modo autónomo) ──
  const [dataLocal, setDataLocal] = useState<CanalDiagnostico | null>(null)
  const [cargandoLocal, setCargandoLocal] = useState(!controlado)
  const [revisandoLocal, setRevisandoLocal] = useState(false)

  const cargarLocal = useCallback(async (silencioso = false) => {
    if (!silencioso) setRevisandoLocal(true)
    try {
      const res = await fetch('/api/channels/diagnostics', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json?.error || 'No se pudo revisar el estado del canal')
        return
      }
      const encontrado = (json.canales || []).find((c: CanalDiagnostico) => c.canal === canal) || null
      setDataLocal(encontrado)
    } catch (e: any) {
      toast.error('Error al revisar: ' + (e?.message || 'desconocido'))
    } finally {
      setCargandoLocal(false)
      setRevisandoLocal(false)
    }
  }, [canal])

  useEffect(() => {
    if (!controlado) cargarLocal(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlado, canal])

  const diag = controlado ? (dataProp ?? null) : dataLocal
  const cargando = controlado ? !!loadingProp && !diag : cargandoLocal
  const revisando = controlado ? !!loadingProp : revisandoLocal
  const mostrarRefresh = showRefresh ?? !controlado

  const handleRefresh = () => {
    if (onRefresh) onRefresh()
    else cargarLocal(false)
  }

  // ── Reparar webhook (FB/IG): re-suscribe la página con el campo `messages` ──
  const [reparando, setReparando] = useState(false)

  const repararWebhook = async () => {
    setReparando(true)
    try {
      const res = await fetch('/api/channels/repair-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json?.error || 'No se pudo reparar el webhook')
        return
      }
      if (json.tiene_messages) toast.success(json.mensaje || 'Webhook reparado')
      else toast.error(json.mensaje || 'Suscripción enviada, pero falta el campo "messages"')
      handleRefresh()
    } catch (e: any) {
      toast.error('Error al reparar: ' + (e?.message || 'desconocido'))
    } finally {
      setReparando(false)
    }
  }

  // ── Prueba en vivo ──
  const [enPrueba, setEnPrueba] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [recibido, setRecibido] = useState(false)
  const [respondido, setRespondido] = useState(false)
  const [textoRecibido, setTextoRecibido] = useState<string | null>(null)
  const [textoRespuesta, setTextoRespuesta] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const detenerPrueba = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setEnPrueba(false)
    setSegundos(0)
  }

  const iniciarPrueba = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const desde = new Date().toISOString()
    setEnPrueba(true)
    setSegundos(0)
    setRecibido(false)
    setRespondido(false)
    setTextoRecibido(null)
    setTextoRespuesta(null)

    let transcurrido = 0
    intervalRef.current = setInterval(async () => {
      transcurrido += 3
      setSegundos(transcurrido)

      try {
        const res = await fetch(
          `/api/channels/test-listen?canal=${canal}&desde=${encodeURIComponent(desde)}`,
          { cache: 'no-store' }
        )
        const json = await res.json()
        if (json.success) {
          if (json.recibido) {
            setRecibido(true)
            setTextoRecibido(json.mensajeRecibido?.texto || null)
          }
          if (json.respondido) {
            setRespondido(true)
            setTextoRespuesta(json.mensajeRespuesta?.texto || null)
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
            toast.success('El canal funciona de punta a punta')
            handleRefresh()
            return
          }
        }
      } catch { /* reintenta en el siguiente ciclo */ }

      if (transcurrido >= DURACION_PRUEBA) {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      }
    }, 3000)
  }

  const pruebaTerminada = segundos >= DURACION_PRUEBA && !respondido

  const titulo = nombre || diag?.nombre || 'Canal'

  if (cargando) {
    return (
      <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-8 flex justify-center ${className}`}>
        <Loader2 className="animate-spin text-slate-400" size={26} />
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col ${className}`}>
      {/* Encabezado */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <h3 className="font-black text-slate-900 flex-1 truncate">{titulo}</h3>
        <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${CLASE_BADGE[diag?.estadoGeneral || 'desconocido']}`}>
          {diag?.conectado ? ETIQUETA[diag.estadoGeneral] : 'Sin conectar'}
        </span>
        {mostrarRefresh && (
          <button
            onClick={handleRefresh}
            disabled={revisando}
            title="Revisar de nuevo"
            className="ml-1 h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 flex items-center justify-center disabled:opacity-50 shrink-0"
          >
            {revisando ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        )}
      </div>

      {/* Comprobaciones */}
      <div className="p-5 space-y-3 flex-1">
        {(diag?.checks || []).map(ch => (
          <div key={ch.id} className="flex gap-2.5">
            <span className="mt-0.5 shrink-0"><IconoEstado estado={ch.estado} /></span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800">{ch.titulo}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{ch.detalle}</p>
            </div>
          </div>
        ))}

        {!diag?.checks?.length && (
          <p className="text-sm text-slate-500">Este canal todavía no está conectado.</p>
        )}

        <div className="flex gap-2.5 pt-3 border-t border-slate-100">
          <Clock size={18} className="text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-slate-800">Último mensaje recibido</p>
            <p className="text-xs text-slate-500">{tiempoRelativo(diag?.ultimoMensaje || null)}</p>
          </div>
        </div>
      </div>

      {/* Prueba en vivo */}
      <div className="px-5 pb-5 space-y-2">
        {/* Reparar webhook: solo FB/IG, y cuando el check de webhook no está OK */}
        {diag?.conectado && diag?.reparable && diag.checks.some(c => c.id === 'webhook' && c.estado !== 'ok') && (
          <button
            onClick={repararWebhook}
            disabled={reparando}
            className="w-full py-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-900 font-bold text-sm flex items-center justify-center gap-2 hover:bg-amber-100 disabled:opacity-50"
          >
            {reparando ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
            Reparar webhook
          </button>
        )}

        {!enPrueba ? (
          <button
            onClick={iniciarPrueba}
            disabled={!diag?.conectado}
            className="w-full py-2.5 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: color }}
          >
            <PlayCircle size={16} /> Probar en vivo
          </button>
        ) : (
          <div className="rounded-xl border-2 p-4" style={{ borderColor: color + '55' }}>
            <div className="flex items-center gap-2 mb-3">
              <Radio size={16} className="animate-pulse" style={{ color }} />
              <p className="text-sm font-black text-slate-900">
                {respondido ? 'Prueba superada' : pruebaTerminada ? 'Sin respuesta' : 'Escuchando...'}
              </p>
            </div>

            {!respondido && !pruebaTerminada && (
              <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                Manda ahora un mensaje a este canal desde tu teléfono, con otra cuenta. Aquí te aviso en cuanto llegue.
              </p>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {recibido ? <CheckCircle2 size={15} className="text-emerald-600" /> : <Loader2 size={15} className="animate-spin text-slate-400" />}
                <span className={`text-xs font-bold ${recibido ? 'text-emerald-700' : 'text-slate-500'}`}>
                  Mensaje recibido
                </span>
              </div>
              {textoRecibido && (
                <p className="text-xs text-slate-500 pl-6 truncate">&ldquo;{textoRecibido}&rdquo;</p>
              )}
              <div className="flex items-center gap-2">
                {respondido
                  ? <CheckCircle2 size={15} className="text-emerald-600" />
                  : recibido
                    ? <Loader2 size={15} className="animate-spin text-slate-400" />
                    : <span className="h-[15px] w-[15px] rounded-full border-2 border-slate-200 inline-block" />}
                <span className={`text-xs font-bold ${respondido ? 'text-emerald-700' : 'text-slate-500'}`}>
                  El asistente respondió
                </span>
              </div>
              {textoRespuesta && (
                <p className="text-xs text-slate-500 pl-6 line-clamp-2">&ldquo;{textoRespuesta}&rdquo;</p>
              )}
            </div>

            {pruebaTerminada && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {recibido
                    ? 'El mensaje llegó pero el asistente no contestó. Revisa las ejecuciones en n8n para ver dónde se detuvo.'
                    : 'No llegó ningún mensaje. Lo más probable es que el webhook no esté suscrito en Meta, o que el flujo de n8n esté desactivado.'}
                </p>
              </div>
            )}

            {!respondido && !pruebaTerminada && (
              <p className="text-[11px] text-slate-400 mt-3">
                {DURACION_PRUEBA - segundos}s restantes
              </p>
            )}

            <button onClick={detenerPrueba} className="mt-3 text-xs font-bold text-slate-500 hover:text-slate-800">
              {respondido || pruebaTerminada ? 'Cerrar' : 'Cancelar prueba'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

