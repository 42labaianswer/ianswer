import { NextResponse, after } from 'next/server'
import { requireActiveCompany } from '../../../lib/apiAuth'
import { APPOINTMENT_FIELDS, conflictMessage, findConflict, initialGoogleSync, parseCreateAppointment } from '../../../lib/appointments'
import { requestGoogleSync } from '../../../lib/appointmentSync'
import { formatWhatsAppPhone } from '../../../lib/phone'
import { buildContactRecord } from '../../../lib/tenancy'

// POST /api/appointments
// Guarda la cita del dashboard directo en Supabase y responde de inmediato.
// El evento de Google se crea después, en segundo plano (after + n8n).

export const dynamic = 'force-dynamic'

const CONTACT_FIELDS = 'id, name, phone, external_id'

type ContactRow = { id: string; name: string | null; phone: string | null; external_id: string }

function error(status: number, message: string) {
  return NextResponse.json({ success: false, error: message }, { status })
}

export async function POST(req: Request) {
  const auth = await requireActiveCompany()
  if (!auth.ok) return auth.response
  const { supabase, companyId } = auth

  const parsed = parseCreateAppointment(await req.json().catch(() => null))
  if (!parsed.ok) return error(400, parsed.error)
  const input = parsed.value

  const { data: agenda } = await supabase
    .from('agendas')
    .select('id, google_calendar_id')
    .eq('id', input.agendaId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!agenda) return error(404, 'La agenda no existe o no pertenece a tu empresa')

  const { data: sameDay, error: sameDayError } = await supabase
    .from('appointments')
    .select('id, appointment_time, duration_minutes')
    .eq('agenda_id', input.agendaId)
    .eq('appointment_date', input.date)
    .neq('status', 'cancelled')
  if (sameDayError) return error(500, 'No se pudo revisar la disponibilidad. Intenta de nuevo.')
  const conflict = findConflict(sameDay ?? [], input.time, input.duration)
  if (conflict) return error(409, conflictMessage(conflict))

  let contact: ContactRow
  if (input.contactId) {
    const { data } = await supabase
      .from('contacts')
      .select(CONTACT_FIELDS)
      .eq('id', input.contactId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (!data) return error(404, 'El cliente no existe en tu Gestor de clientes')
    contact = data as ContactRow
  } else {
    const found = await findOrCreateContact(supabase, companyId, input.newClient!.name, formatWhatsAppPhone(input.newClient!.phone))
    if (!found) return error(500, 'No se pudo registrar al cliente. Revisa el número e intenta de nuevo.')
    contact = found
  }

  const googleSync = initialGoogleSync(!!agenda.google_calendar_id)
  const { data: appointment, error: insertError } = await supabase
    .from('appointments')
    .insert({
      company_id: companyId,
      agenda_id: input.agendaId,
      patient_id: contact.id,
      patient_name: contact.name,
      patient_phone: contact.phone || contact.external_id,
      appointment_date: input.date,
      appointment_time: `${input.time}:00`,
      duration_minutes: input.duration,
      notes: input.notes || null,
      status: 'confirmed',
      source: 'manual_dashboard',
      google_sync: googleSync,
    })
    .select(APPOINTMENT_FIELDS)
    .single()
  if (insertError || !appointment) {
    console.error('[api/appointments] insert falló', insertError)
    return error(500, 'No se pudo guardar la cita. Intenta de nuevo.')
  }

  if (googleSync === 'pending') after(() => requestGoogleSync(appointment.id))

  return NextResponse.json({ success: true, appointment, contact }, { status: 201 })
}

type SessionSupabase = Extract<Awaited<ReturnType<typeof requireActiveCompany>>, { ok: true }>['supabase']

/** Busca al cliente por su WhatsApp dentro de la empresa y, si no existe, lo crea. */
async function findOrCreateContact(
  supabase: SessionSupabase,
  companyId: string,
  name: string,
  phone: string
): Promise<ContactRow | null> {
  const lookup = () =>
    supabase.from('contacts').select(CONTACT_FIELDS).eq('company_id', companyId).eq('external_id', phone).maybeSingle()

  const { data: existing } = await lookup()
  if (existing) return existing as ContactRow

  const record = buildContactRecord({ companyId, externalId: phone, name, phone, channel: 'whatsapp' })
  const { data: created, error } = await supabase.from('contacts').insert(record).select(CONTACT_FIELDS).single()
  if (created) return created as ContactRow

  // Otro request lo creó al mismo tiempo: unique (company_id, external_id)
  if (error?.code === '23505') {
    const { data: raced } = await lookup()
    return (raced as ContactRow) ?? null
  }
  console.error('[api/appointments] no se pudo crear el contacto', error)
  return null
}
