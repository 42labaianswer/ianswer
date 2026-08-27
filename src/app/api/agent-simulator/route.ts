 

// ============================================================================
// /api/agent-simulator/route.ts · v3.0 Sprint 5
// ----------------------------------------------------------------------------
// Endpoint del simulador del agente. Gateado por addon ai_agent_simulator.
// Si la company no tiene el addon activo, devuelve 403.
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const { messages, system_prompt } = await req.json()

    // ── Gate Sprint 5: verificar feature ai_agent_simulator ──
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (n: string) => cookieStore.get(n)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'Sin company asociada' }, { status: 403 })
    }

    const { data: ent } = await supabase
      .rpc('get_company_entitlements', { p_company_id: profile.company_id })

    const hasSimulator = !!(ent as any)?.features?.ai_agent_simulator
    if (!hasSimulator) {
      return NextResponse.json(
        {
          error: 'addon_required',
          message: 'El simulador requiere el addon "Agent Simulator". Actívalo en /dashboard/addons',
          addon_id: 'agent_simulator'
        },
        { status: 403 }
      )
    }

    // ── DeepSeek call ──
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: system_prompt }, ...messages],
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error?.message || 'Error en DeepSeek API')
    }

    const aiData = await response.json()
    const reply = aiData.choices[0].message.content

    return NextResponse.json({ reply })

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json({ error: 'Error procesando la simulación' }, { status: 500 })
  }
}
