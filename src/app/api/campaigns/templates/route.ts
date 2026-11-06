import { NextResponse } from 'next/server'
import { requireActiveCompany } from '../../../../lib/apiAuth'
import { errorMessage } from '../../../../lib/campaigns'
import { adminClient, getWhatsAppCredentials, listMarketingTemplates } from '../../../../lib/campaignsServer'

// Plantillas de marketing aprobadas en el WABA de la empresa, para elegir en
// la pantalla de Campañas.

export async function GET() {
  const auth = await requireActiveCompany()
  if (!auth.ok) return auth.response

  try {
    const creds = await getWhatsAppCredentials(adminClient(), auth.companyId)
    if (!creds) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp no está conectado. Revísalo en Conectividad.' },
        { status: 400 }
      )
    }
    const templates = await listMarketingTemplates(creds)
    return NextResponse.json({ success: true, templates })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: errorMessage(e, 'No se pudieron cargar las plantillas') },
      { status: 502 }
    )
  }
}
