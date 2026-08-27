import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Usamos la llave Service Role (Maestra) para saltar el RLS de forma segura en el backend
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// SOLUCIÓN: Cambiamos el tipado de params a Promise<{ agendaId: string }>
export async function GET(req: Request, { params }: { params: Promise<{ agendaId: string }> }) {
  try {
    // NEXT.JS 15 FIX: Ahora debemos hacer "await" a params antes de usarlo
    const resolvedParams = await params;
    const agendaId = resolvedParams.agendaId;

    // 1. Buscamos la agenda
    const { data: agenda, error: agendaError } = await supabaseAdmin
      .from('agendas')
      .select('*')
      .eq('id', agendaId)
      .single()

    if (agendaError || !agenda) {
      return NextResponse.json({ error: 'Agenda no encontrada' }, { status: 404 })
    }

    // 2. Buscamos el resto de datos de forma paralela
    const [compRes, whRes, dsRes, platRes] = await Promise.all([
      supabaseAdmin.from('companies').select('id, name').eq('id', agenda.company_id).single(),
      supabaseAdmin.from('working_hours').select('*').eq('company_id', agenda.company_id),
      supabaseAdmin.from('disabled_slots').select('*').eq('company_id', agenda.company_id),
      supabaseAdmin
        .from('platform_settings')
        .select('n8n_webhook_calendar, n8n_webhook_widget, n8n_webhook_follow_up_24h')
        .single()
    ])

    // 3. Devolvemos los datos empaquetados
    return NextResponse.json({
      agenda,
      company: compRes.data,
      workingHours: whRes.data || [],
      disabledSlots: dsRes.data || [],
      // Compatibilidad: webhookUrl sigue siendo el del calendario (sincronizador)
      webhookUrl: platRes.data?.n8n_webhook_calendar || '',
      // NUEVO v1.3: URL del workflow "Widget - Agendar Cita"
      bookingWebhookUrl: platRes.data?.n8n_webhook_widget || '',
      // NUEVO v1.3: URL opcional del workflow "Seguimiento 24h" (manual trigger)
      followUpWebhookUrl: platRes.data?.n8n_webhook_follow_up_24h || ''
    })

  } catch (error: any) {
    console.error('API Widget Error:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}