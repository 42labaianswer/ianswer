import { NextResponse, after } from 'next/server'
import { requireActiveCompany } from '../../../../lib/apiAuth'
import {
  APPOINTMENT_FIELDS,
  buildRescheduleMessage,
  conflictMessage,
  findConflict,
  initialGoogleSync,
  parseRescheduleAppointment,
} from '../../../../lib/appointments'
import { notifyPatient, requestGoogleSync } from '../../../../lib/appointmentSync'

// PATCH /api/appointments/:id
// Reagenda la cita en Supabase y responde de inmediato. Mover el evento de
// Google y avisar al cliente por WhatsApp pasan en segundo plano.

export const dynamic = 'force-dynamic'

function error(status: number, message: string) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireActiveCompany()
  if (!auth.ok) return auth.response
  const { supabase, companyId } = auth
  const { id } = await params

  const parsed = parseRescheduleAppointment(await req.json().catch(() => null))
  if (!parsed.ok) return error(400, parsed.error)
  const input = parsed.value

  const { data: current } = await supabase
    .from('appointments')
    .select('id, agenda_id, status, appointment_date, appointment_time, patient_name, contacts(name, external_id), agendas(google_calendar_id)')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!current) return error(404, 'La cita no existe o no pertenece a tu empresa')
  if (current.status === 'cancelled') return error(409, 'La cita está cancelada; agenda una nueva en su lugar')

  const { data: sameDay, error: sameDayError } = await supabase
    .from('appointments')
    .select('id, appointment_time, duration_minutes')
    .eq('agenda_id', current.agenda_id)
    .eq('appointment_date', input.date)
    .neq('status', 'cancelled')
  if (sameDayError) return error(500, 'No se pudo revisar la disponibilidad. Intenta de nuevo.')
  const conflict = findConflict(sameDay ?? [], input.time, input.duration, id)
  if (conflict) return error(409, conflictMessage(conflict))

  const agenda = one(current.agendas) as { google_calendar_id: string | null } | null
  const googleSync = initialGoogleSync(!!agenda?.google_calendar_id)
  const { data: appointment, error: updateError } = await supabase
    .from('appointments')
    .update({
      appointment_date: input.date,
      appointment_time: `${input.time}:00`,
      duration_minutes: input.duration,
      rescheduled_at: new Date().toISOString(),
      google_sync: googleSync,
      google_sync_error: null,
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .select(APPOINTMENT_FIELDS)
    .single()
  if (updateError || !appointment) {
    console.error('[api/appointments/:id] update falló', updateError)
    return error(500, 'No se pudo reagendar la cita. Intenta de nuevo.')
  }

  if (googleSync === 'pending') after(() => requestGoogleSync(id))

  const contact = one(current.contacts) as { name: string | null; external_id: string } | null
  if (input.notifyPatient && contact?.external_id) {
    const { data: company } = await supabase.from('companies').select('name').eq('id', companyId).maybeSingle()
    const content = buildRescheduleMessage({
      patientName: contact.name || current.patient_name,
      brandName: company?.name ?? null,
      oldDate: current.appointment_date,
      oldTime: current.appointment_time,
      newDate: input.date,
      newTime: input.time,
    })
    after(() => notifyPatient({ companyId, externalId: contact.external_id, content }))
  }

  return NextResponse.json({ success: true, appointment })
}

/** PostgREST devuelve un objeto o un arreglo según cómo infiere la relación. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
