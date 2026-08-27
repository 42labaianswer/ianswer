 

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { X, Loader2, AlertTriangle, Trash2, MessageCircle, UserX, ListChecks } from 'lucide-react'

type Mode = 'cancel' | 'noshow'

type CancelDialogProps = {
  isOpen: boolean
  onClose: () => void
  appointmentId: string
  patientName?: string
  patientPhone?: string
  dateLabel?: string
  onSuccess: () => void
  // v2.7: nuevo prop para distinguir cancelación vs no-show
  mode?: Mode
  // v2.7: opcional - mostrar hint de waitlist
  hasWaitlist?: boolean
}

// v2.7: razones predefinidas de no-show
const NOSHOW_REASONS = [
  { value: 'olvido',     label: 'Olvidó la cita' },
  { value: 'trabajo',    label: 'Tuvo que trabajar' },
  { value: 'enfermedad', label: 'Estaba enfermo' },
  { value: 'transporte', label: 'Problema de transporte' },
  { value: 'no_quiso',   label: 'Cambió de opinión' },
  { value: 'otro',       label: 'Otra razón' }
]

export default function CancelDialog({
  isOpen, onClose, appointmentId, patientName, patientPhone, dateLabel, onSuccess,
  mode = 'cancel', hasWaitlist = false
}: CancelDialogProps) {

  const [reason, setReason] = useState('')
  const [noshowReason, setNoshowReason] = useState<string>('')
  const [customReason, setCustomReason] = useState('')
  const [notifyPatient, setNotifyPatient] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setReason('')
      setNoshowReason('')
      setCustomReason('')
      setNotifyPatient(false)
    }
  }, [isOpen])

  // ===== MUTACIÓN DE CANCELACIÓN (modo cancel) =====
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { data: psData, error: psErr } = await supabase
        .from('platform_settings')
        .select('n8n_webhook_cancel_appointment')
        .single()
      if (psErr) throw psErr
      const webhookUrl = psData?.n8n_webhook_cancel_appointment
      if (!webhookUrl) throw new Error('El webhook de cancelar cita no esta configurado en Admin > Desarrollador.')

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId,
          reason: reason.trim() || null,
          notify_patient: notifyPatient,
          patient_phone: patientPhone || null,
          patient_name: patientName || null,
          date_label: dateLabel || null
        })
      })

      if (!response.ok) {
        const txt = await response.text().catch(() => '')
        throw new Error(`Error del servidor (${response.status}). ${txt.slice(0, 120)}`)
      }
      return true
    },
    onSuccess: () => {
      toast.success(notifyPatient ? 'Cita cancelada y paciente notificado' : 'Cita cancelada')
      onSuccess()
      onClose()
    },
    onError: (err: any) => toast.error(err.message || 'Error al cancelar')
  })

  // ===== MUTACIÓN DE NO-SHOW (modo noshow) =====
  const noshowMutation = useMutation({
    mutationFn: async () => {
      const finalReason = noshowReason === 'otro'
        ? customReason.trim() || 'otro'
        : noshowReason || null

      const { error } = await supabase.from('appointments').update({
        status: 'no_show',
        no_show_reason: finalReason,
        no_show_reason_captured_at: finalReason ? new Date().toISOString() : null
      }).eq('id', appointmentId)

      if (error) throw error
      return true
    },
    onSuccess: () => {
      toast.success('Marcado como no asistió')
      onSuccess()
      onClose()
    },
    onError: (err: any) => toast.error(err.message || 'Error al marcar')
  })

  if (!isOpen) return null

  const isNoshow = mode === 'noshow'
  const isPending = isNoshow ? noshowMutation.isPending : cancelMutation.isPending

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onClose() }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">

        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isNoshow ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}`}>
              {isNoshow ? <UserX size={20} /> : <AlertTriangle size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                {isNoshow ? 'Marcar como no asistió' : 'Cancelar cita'}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5 font-medium">
                {patientName && <span className="font-bold">{patientName}</span>}
                {patientName && dateLabel && ' · '}
                {dateLabel}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={isPending} className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0 disabled:opacity-30">
            <X size={20} />
          </button>
        </div>

        {/* ===== MODO NO-SHOW ===== */}
        {isNoshow ? (
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              El paciente no se presentó. Captura la razón para entender patrones y mejorar tu tasa de asistencia.
            </p>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Razón del no-show</label>
              <div className="grid grid-cols-2 gap-2">
                {NOSHOW_REASONS.map(r => {
                  const isActive = noshowReason === r.value
                  return (
                    <button
                      key={r.value}
                      onClick={() => setNoshowReason(r.value)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-bold border-2 transition-all text-left ${isActive ? 'bg-amber-600 text-white border-amber-600 shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300'}`}
                    >
                      {r.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {noshowReason === 'otro' && (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Especifica la razón</label>
                <input
                  type="text"
                  value={customReason}
                  onChange={e => setCustomReason(e.target.value)}
                  placeholder="Ej. emergencia familiar"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-amber-500"
                />
              </div>
            )}

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2.5">
              <MessageCircle size={14} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 font-medium">
                <strong>Tip:</strong> activa la regla automática "Razón de no-show (24h después)" en <em>/dashboard/reminders</em> para que el bot le pregunte al paciente y reagende automáticamente.
              </p>
            </div>
          </div>
        ) : (
          // ===== MODO CANCEL =====
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              ¿Estás seguro? La cita se marcará como cancelada y, si tiene evento en Google Calendar, se borrará ahí también. El historial queda registrado.
            </p>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Razón (opcional)</label>
              <textarea
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ej. El paciente avisó que no podrá venir..."
                className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:border-rose-500 focus:ring-2 focus:ring-rose-100 resize-none"
              />
            </div>

            {/* v2.7: Hint de waitlist */}
            {hasWaitlist && (
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 flex gap-2.5">
                <ListChecks size={14} className="text-purple-600 shrink-0 mt-0.5" />
                <p className="text-xs text-purple-800 font-medium">
                  Tienes pacientes en lista de espera. Después de cancelar, ve a <em>/dashboard/waitlist</em> para ofrecer este slot.
                </p>
              </div>
            )}

            {/* Toggle de notificación */}
            <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${notifyPatient ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'} ${!patientPhone ? 'opacity-60' : ''}`}>
              <input
                type="checkbox"
                checked={notifyPatient}
                disabled={!patientPhone}
                onChange={e => setNotifyPatient(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <MessageCircle size={16} className={notifyPatient ? 'text-emerald-600' : 'text-slate-400'} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${notifyPatient ? 'text-emerald-900' : 'text-slate-700'}`}>
                  Avisar al paciente por WhatsApp
                </p>
                <p className="text-[11px] text-slate-500 font-medium">
                  {patientPhone
                    ? `Se enviará a ${patientPhone}`
                    : 'No hay teléfono registrado para este paciente.'}
                </p>
              </div>
            </label>
          </div>
        )}

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={isPending} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-40">
            {isNoshow ? 'Cerrar' : 'Mantener cita'}
          </button>
          {isNoshow ? (
            <button
              onClick={() => noshowMutation.mutate()}
              disabled={isPending}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-black rounded-xl shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              {isPending
                ? <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                : <><UserX size={16} /> Marcar como no asistió</>
              }
            </button>
          ) : (
            <button
              onClick={() => cancelMutation.mutate()}
              disabled={isPending}
              className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-black rounded-xl shadow-md disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
            >
              {isPending
                ? <><Loader2 size={16} className="animate-spin" /> Cancelando...</>
                : <><Trash2 size={16} /> Cancelar cita</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
