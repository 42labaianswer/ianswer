 

// ============================================================================
// src/app/api/cron/cleanup-old-messages/route.ts
// ----------------------------------------------------------------------------
// Cron que corre diario para borrar mensajes >12 meses según la política
// declarada en el Aviso de Privacidad.
//
// Configuración en vercel.json:
//   {
//     "path": "/api/cron/cleanup-old-messages",
//     "schedule": "0 3 * * *"
//   }
//
// Seguridad: header Authorization: Bearer $CRON_SECRET
// ============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const SUPABASE_URL              = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Servidor mal configurado' }, { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Calcular cutoff: 12 meses atrás
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 12)
  const cutoffIso = cutoff.toISOString()

  try {
    // Borrar mensajes viejos (>12 meses)
    const { data: deleted, error } = await supabase
      .from('messages')
      .delete()
      .lt('created_at', cutoffIso)
      .select('id')

    if (error) {
      console.error('[CleanupOldMessagesError]', error)
      return NextResponse.json({
        success: false,
        error:   'Error borrando mensajes',
        details: error.message
      }, { status: 500 })
    }

    const count = deleted?.length || 0

    // Log de la acción en audit
    if (count > 0) {
      try {
        await (supabase.rpc as any)('log_operator_action', {
          p_company_id:   '00000000-0000-0000-0000-000000000000',  // null trigger
          p_operator_id:  null,
          p_action_type:  'settings_changed',  // mapeo a action_type válido
          p_target_type:  'messages_retention_cron',
          p_target_id:    cutoffIso,
          p_description:  `Cron cleanup: borró ${count} mensajes con created_at < ${cutoffIso}`,
          p_metadata:     { count, cutoff: cutoffIso, source: 'cron' }
        })
      } catch (logErr) {
        console.warn('[CleanupAuditWarn]', logErr)
      }
    }

    return NextResponse.json({
      success: true,
      deleted: count,
      cutoff:  cutoffIso,
      message: `Borrados ${count} mensajes anteriores al ${cutoffIso}`
    })

  } catch (err: any) {
    console.error('[CleanupOldMessagesUnexpectedError]', err)
    return NextResponse.json({
      success: false,
      error:   'Error inesperado',
      details: err?.message
    }, { status: 500 })
  }
}
