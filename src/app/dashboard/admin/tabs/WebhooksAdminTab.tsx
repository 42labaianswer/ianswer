 

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useWorkspace } from '../../../../components/WorkspaceContext' 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Webhook, Save, Loader2, Upload, Download, FileJson } from 'lucide-react'
import IAnswerLoader from '../../../../components/IAnswerLoader'

// ---------------------------------------------------------------------------
// Subcomponente: fila de respaldo (.json) al fondo de cada tarjeta.
// Sube al bucket "branding" en /workflows/<key>.json (sobrescribe).
// Para descargar genera un signed URL fresco de 60s.
// ---------------------------------------------------------------------------
function BackupRow({
  path,
  storageKey,
  dbField,
  isUploading,
  onUpload
}: {
  path: string
  storageKey: string
  dbField: string
  isUploading: boolean
  onUpload: (file: File, storageKey: string, dbField: string) => void
}) {
  const handleDownload = async () => {
    if (!path) return
    const { data, error } = await supabase.storage.from('branding').createSignedUrl(path, 60)
    if (error || !data?.signedUrl) {
      toast.error('No se pudo generar el enlace de descarga')
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-200/70 flex items-center justify-between gap-3">
      <div className="text-[11px] font-medium text-slate-500 min-w-0 flex-1 flex items-center gap-1.5">
        <FileJson size={13} className={path ? 'text-emerald-500' : 'text-slate-300'} />
        {path ? (
          <button onClick={handleDownload} type="button" className="text-blue-600 hover:underline font-bold inline-flex items-center gap-1 truncate">
            <Download size={11}/> Descargar respaldo
          </button>
        ) : (
          <span className="text-slate-400">Sin respaldo subido</span>
        )}
      </div>
      <label className={`cursor-pointer text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all inline-flex items-center gap-1.5 ${isUploading ? 'bg-purple-100 text-purple-400 border-purple-200 cursor-wait' : 'bg-white text-purple-600 border-purple-200 hover:border-purple-400 hover:text-purple-700'}`}>
        {isUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11}/>}
        {isUploading ? 'Subiendo...' : 'Subir .json'}
        <input
          type="file"
          accept=".json,application/json"
          disabled={isUploading}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file, storageKey, dbField)
            e.currentTarget.value = ''
          }}
        />
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function WebhooksAdminTab() {
  const queryClient = useQueryClient()
  const { refreshWorkspace } = useWorkspace()
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)

  const [platform, setPlatform] = useState({
    // URLs de webhooks (7 con URL + 1 sin URL = 8 tarjetas total)
    n8n_webhook_calendar: '',
    n8n_webhook_calendar_verify: '',
    n8n_webhook_whatsapp: '',
    n8n_webhook_whatsapp_admin: '',
    n8n_webhook_widget: '',
    n8n_webhook_cancel_appointment: '',
    n8n_webhook_reschedule_appointment: '',
    // Rutas de respaldo .json en bucket "branding"
    n8n_workflow_calendar_json: '',
    n8n_workflow_calendar_verify_json: '',
    n8n_workflow_whatsapp_json: '',
    n8n_workflow_whatsapp_admin_json: '',
    n8n_workflow_widget_json: '',
    n8n_workflow_cancel_json: '',
    n8n_workflow_reschedule_json: '',
    n8n_workflow_reminder_json: ''    // v2.0: solo respaldo, sin URL externa
  })

  const { data, isLoading } = useQuery({
    queryKey: ['platformSettings'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_settings').select('*').single()
      return data || {}
    }
  })

  useEffect(() => {
    if (data) {
      setPlatform(prev => ({
        ...prev,
        ...data,
        n8n_webhook_calendar:               data.n8n_webhook_calendar               || '',
        n8n_webhook_calendar_verify:        data.n8n_webhook_calendar_verify        || '',
        n8n_webhook_whatsapp:               data.n8n_webhook_whatsapp               || '',
        n8n_webhook_whatsapp_admin:         data.n8n_webhook_whatsapp_admin         || '',
        n8n_webhook_widget:                 data.n8n_webhook_widget                 || '',
        n8n_webhook_cancel_appointment:     data.n8n_webhook_cancel_appointment     || '',
        n8n_webhook_reschedule_appointment: data.n8n_webhook_reschedule_appointment || '',
        n8n_workflow_calendar_json:         data.n8n_workflow_calendar_json         || '',
        n8n_workflow_calendar_verify_json:  data.n8n_workflow_calendar_verify_json  || '',
        n8n_workflow_whatsapp_json:         data.n8n_workflow_whatsapp_json         || '',
        n8n_workflow_whatsapp_admin_json:   data.n8n_workflow_whatsapp_admin_json   || '',
        n8n_workflow_widget_json:           data.n8n_workflow_widget_json           || '',
        n8n_workflow_cancel_json:           data.n8n_workflow_cancel_json           || '',
        n8n_workflow_reschedule_json:       data.n8n_workflow_reschedule_json       || '',
        n8n_workflow_reminder_json:         data.n8n_workflow_reminder_json         || ''
      }))
    }
  }, [data])

  // ------------------------------------------------------------------
  // Mutation: guardar URLs ("Guardar Configuración")
  // ------------------------------------------------------------------
  const updatePlatformMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('platform_settings').upsert({ id: 1, ...payload })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Webhooks guardados correctamente')
      refreshWorkspace()
      queryClient.invalidateQueries({ queryKey: ['platformSettings'] })
    },
    onError: (err: any) => toast.error(`Error al guardar: ${err.message}`)
  })

  // ------------------------------------------------------------------
  // Mutation: subir .json al bucket branding y guardar la ruta en DB.
  // Estructura: branding/workflows/<storageKey>.json  (sobrescribe).
  // ------------------------------------------------------------------
  const uploadJsonMutation = useMutation({
    mutationFn: async ({ file, storageKey, dbField }: { file: File, storageKey: string, dbField: string }) => {
      if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('Solo se aceptan archivos .json')
      }
      const text = await file.text()
      try { JSON.parse(text) } catch { throw new Error('El archivo no es un JSON valido') }

      const path = `workflows/${storageKey}.json`
      const { error: upErr } = await supabase.storage
        .from('branding')
        .upload(path, file, {
          contentType: 'application/json',
          upsert: true,
          cacheControl: '3600'
        })
      if (upErr) throw upErr

      const { error: updErr } = await supabase
        .from('platform_settings')
        .update({ [dbField]: path })
        .eq('id', 1)
      if (updErr) throw updErr

      return { path, dbField }
    },
    onMutate: ({ storageKey }) => { setUploadingKey(storageKey) },
    onSuccess: ({ path, dbField }) => {
      setPlatform(prev => ({ ...prev, [dbField]: path }))
      toast.success('Respaldo subido correctamente')
      queryClient.invalidateQueries({ queryKey: ['platformSettings'] })
    },
    onError: (err: any) => toast.error(`Error subiendo: ${err.message}`),
    onSettled: () => setUploadingKey(null)
  })

  const handleUpload = (file: File, storageKey: string, dbField: string) => {
    uploadJsonMutation.mutate({ file, storageKey, dbField })
  }

  if (isLoading) return <div className="p-10 flex justify-center"><IAnswerLoader size={40} /></div>

  return (
    <section className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Webhook className="text-purple-600" /> Desarrollador (n8n Webhooks)
        </h2>
        <p className="text-sm text-slate-500 mt-1">Configura las URLs de los 8 workflows. Sube el <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">.json</code> exportado de n8n como respaldo (se guarda en el bucket <strong>branding</strong>).</p>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 1. Obtener Calendario */}
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
              Obtener Calendario
            </h3>
            <p className="text-xs text-slate-500 mb-4">URL para descargar los eventos de Google Calendar a la agenda.</p>
            <input value={platform.n8n_webhook_calendar} onChange={e => setPlatform({...platform, n8n_webhook_calendar: e.target.value})} placeholder="https://.../obtener-calendario" className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs text-slate-700" />
            <BackupRow
              path={platform.n8n_workflow_calendar_json}
              storageKey="calendar"
              dbField="n8n_workflow_calendar_json"
              isUploading={uploadingKey === 'calendar'}
              onUpload={handleUpload}
            />
          </div>

          {/* 2. Verificar Calendario */}
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
              Verificar Calendario
            </h3>
            <p className="text-xs text-slate-500 mb-4">URL para comprobar los permisos de la cuenta de servicio.</p>
            <input value={platform.n8n_webhook_calendar_verify} onChange={e => setPlatform({...platform, n8n_webhook_calendar_verify: e.target.value})} placeholder="https://.../verificar-calendario" className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs text-slate-700" />
            <BackupRow
              path={platform.n8n_workflow_calendar_verify_json}
              storageKey="calendar_verify"
              dbField="n8n_workflow_calendar_verify_json"
              isUploading={uploadingKey === 'calendar_verify'}
              onUpload={handleUpload}
            />
          </div>

          {/* 3. Notificaciones Sistema */}
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
              Notificaciones Sistema
            </h3>
            <p className="text-xs text-slate-500 mb-4">URL general de WhatsApp para alertas automáticas del sistema.</p>
            <input value={platform.n8n_webhook_whatsapp} onChange={e => setPlatform({...platform, n8n_webhook_whatsapp: e.target.value})} placeholder="https://.../notificaciones-bot" className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs text-slate-700" />
            <BackupRow
              path={platform.n8n_workflow_whatsapp_json}
              storageKey="whatsapp"
              dbField="n8n_workflow_whatsapp_json"
              isUploading={uploadingKey === 'whatsapp'}
              onUpload={handleUpload}
            />
          </div>

          {/* 4. Inbox (Admin a Usuario) */}
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
              Inbox (Admin a Usuario)
            </h3>
            <p className="text-xs text-slate-500 mb-4">URL para enviar respuestas manuales desde el panel de Inbox.</p>
            <input value={platform.n8n_webhook_whatsapp_admin} onChange={e => setPlatform({...platform, n8n_webhook_whatsapp_admin: e.target.value})} placeholder="https://.../enviar-whatsapp-admin" className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs text-slate-700" />
            <BackupRow
              path={platform.n8n_workflow_whatsapp_admin_json}
              storageKey="whatsapp_admin"
              dbField="n8n_workflow_whatsapp_admin_json"
              isUploading={uploadingKey === 'whatsapp_admin'}
              onUpload={handleUpload}
            />
          </div>

          {/* 5. Widget de Citas */}
          <div className="p-6 bg-purple-50/50 rounded-2xl border border-purple-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
              Widget de Citas (Web → Booking)
            </h3>
            <p className="text-xs text-slate-500 mb-4">URL del formulario público de reservas. La página /widget la usa para registrar la cita en Google Calendar y Supabase.</p>
            <input value={platform.n8n_webhook_widget} onChange={e => setPlatform({...platform, n8n_webhook_widget: e.target.value})} placeholder="https://.../agendar-widget" className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs text-slate-700" />
            <BackupRow
              path={platform.n8n_workflow_widget_json}
              storageKey="widget"
              dbField="n8n_workflow_widget_json"
              isUploading={uploadingKey === 'widget'}
              onUpload={handleUpload}
            />
          </div>

          {/* 6. Procesador de Recordatorios (v2.0) — solo respaldo, sin URL */}
          <div className="p-6 bg-purple-50/50 rounded-2xl border border-purple-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
              Procesador de Recordatorios
            </h3>
            <p className="text-xs text-slate-500 mb-4">Cron interno que procesa la cola de recordatorios cada N minutos (configurable desde Recordatorios → Métricas). No requiere URL porque no recibe webhooks externos. Sube su .json como respaldo.</p>
            <div className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-400 font-mono flex items-center gap-2">
              <Webhook size={12} className="text-slate-300 shrink-0" />
              <span className="italic">Workflow interno · sin URL externa</span>
            </div>
            <BackupRow
              path={platform.n8n_workflow_reminder_json}
              storageKey="reminder_processor"
              dbField="n8n_workflow_reminder_json"
              isUploading={uploadingKey === 'reminder_processor'}
              onUpload={handleUpload}
            />
          </div>

          {/* 7. NUEVO v1.6 — Cancelar Cita */}
          <div className="p-6 bg-rose-50/50 rounded-2xl border border-rose-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
              Cancelar Cita
            </h3>
            <p className="text-xs text-slate-500 mb-4">URL del workflow que borra el evento de Google (si existe) y marca la cita como cancelada en Supabase.</p>
            <input value={platform.n8n_webhook_cancel_appointment} onChange={e => setPlatform({...platform, n8n_webhook_cancel_appointment: e.target.value})} placeholder="https://.../cancelar-cita" className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs text-slate-700" />
            <BackupRow
              path={platform.n8n_workflow_cancel_json}
              storageKey="cancel_appointment"
              dbField="n8n_workflow_cancel_json"
              isUploading={uploadingKey === 'cancel_appointment'}
              onUpload={handleUpload}
            />
          </div>

          {/* 8. NUEVO v1.6 — Reagendar Cita */}
          <div className="p-6 bg-rose-50/50 rounded-2xl border border-rose-200">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-2">
              Reagendar Cita
            </h3>
            <p className="text-xs text-slate-500 mb-4">URL del workflow que mueve el evento en Google (si existe) y actualiza la fecha/hora/duración de la cita.</p>
            <input value={platform.n8n_webhook_reschedule_appointment} onChange={e => setPlatform({...platform, n8n_webhook_reschedule_appointment: e.target.value})} placeholder="https://.../reagendar-cita" className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs text-slate-700" />
            <BackupRow
              path={platform.n8n_workflow_reschedule_json}
              storageKey="reschedule_appointment"
              dbField="n8n_workflow_reschedule_json"
              isUploading={uploadingKey === 'reschedule_appointment'}
              onUpload={handleUpload}
            />
          </div>

        </div>

        <div className="mt-8 pt-6 border-t border-slate-100">
          <button onClick={() => updatePlatformMutation.mutate(platform)} disabled={updatePlatformMutation.isPending} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg">
            {updatePlatformMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar Configuración
          </button>
        </div>
      </div>
    </section>
  )
}
