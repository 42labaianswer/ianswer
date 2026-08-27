 

// src/app/api/agent-training/route.ts
// ----------------------------------------------------------------------------
// Sprint R · Endpoint del entrenador conversacional.
//
// Dos modos (via body.action):
//   - 'interview': el asistente entrevista al usuario. Recibe el historial de
//     chat y devuelve la siguiente pregunta del "entrenador" (como si estuviera
//     onboardeando a un empleado). Usa DeepSeek.
//   - 'compile': toma toda la conversación y genera el documento estructurado
//     por secciones (JSON). Usa DeepSeek con instrucción de responder solo JSON.
//
// Requiere el addon agent_training_pro activo (verifica gating).
// ----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const maxDuration = 60

const INTERVIEWER_SYSTEM = `Eres un consultor experto que ayuda a dueños de negocios a entrenar a su nuevo agente de IA de atención/ventas, como si estuvieras onboardeando a un empleado nuevo.

Tu trabajo es ENTREVISTAR al usuario para extraer todo el conocimiento importante sobre cómo trabaja su empresa. Haces UNA pregunta a la vez, en español mexicano, de forma cálida y profesional.

Cubre progresivamente estos temas (uno por uno, sin abrumar):
1. Qué hace la empresa y qué la hace especial
2. Cómo es su flujo de ventas/atención típico (paso a paso)
3. Qué información SÍ puede compartir el agente libremente
4. Qué información NO debe dar nunca (precios especiales, datos internos, etc.)
5. Preguntas frecuentes de sus clientes y cómo responderlas
6. Casos difíciles o comunes y cómo manejarlos
7. El tono y estilo con que hablan a sus clientes
8. Cuándo el agente debe pasar la conversación a un humano

Reglas:
- UNA pregunta por turno, específica y fácil de responder
- Si la respuesta es vaga, pide un ejemplo concreto
- Reconoce brevemente lo que dijeron antes de la siguiente pregunta
- Cuando sientas que cubriste lo esencial (después de ~8-12 intercambios), dilo: "Creo que ya tengo una buena imagen de cómo trabajan. ¿Quieres agregar algo más o generamos el documento de entrenamiento?"
- NO inventes información sobre su empresa; solo pregunta`

const COMPILER_SYSTEM = `Eres un asistente que convierte una conversación de entrenamiento en un documento de procesos estructurado para un agente de IA.

Analiza toda la conversación y extrae la información en estas secciones. Responde SOLO con un objeto JSON válido, sin markdown, sin backticks, sin texto adicional:

{
  "company_overview": "descripción de la empresa y qué la hace especial",
  "sales_flow": "el flujo de ventas/atención paso a paso",
  "do_share": "información que el agente SÍ puede dar",
  "dont_share": "información que el agente NO debe dar",
  "faqs": "preguntas frecuentes con sus respuestas, formato P: ... R: ...",
  "common_scenarios": "casos comunes y cómo manejarlos",
  "tone_examples": "ejemplos concretos de cómo debe responder el agente",
  "escalation_rules": "cuándo pasar a un humano"
}

Reglas:
- Usa la información REAL de la conversación, no inventes
- Si una sección no se cubrió, déjala como string vacío ""
- Escribe en segunda persona dirigido al agente ("Cuando un cliente pregunta X, responde Y")
- Sé conciso pero completo`

async function verifyAddon(req: NextRequest): Promise<
  { ok: true; companyId: string } | { ok: false; status: number; error: string }
> {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, status: 401, error: 'No autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.company_id) return { ok: false, status: 400, error: 'Sin company' }

  const { data: hasAddon } = await supabase.rpc('has_agent_training_active', {
    p_company_id: profile.company_id,
  })

  if (hasAddon !== true) {
    return { ok: false, status: 402, error: 'Addon Entrenamiento PRO no activo' }
  }

  return { ok: true, companyId: profile.company_id }
}

async function callDeepSeek(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  forceJson = false
): Promise<string> {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: forceJson ? 0.2 : 0.7,
      max_tokens: forceJson ? 2000 : 500,
    }),
  })

  if (!response.ok) {
    const err = await response.text().catch(() => '')
    throw new Error(`DeepSeek falló (${response.status}): ${err}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export async function POST(req: NextRequest) {
  try {
    const gate = await verifyAddon(req)
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }

    const body = await req.json()
    const action = body.action as 'interview' | 'compile'
    const messages = (body.messages || []) as Array<{ role: string; content: string }>

    if (action === 'interview') {
      const reply = await callDeepSeek(INTERVIEWER_SYSTEM, messages)
      return NextResponse.json({ ok: true, message: reply })
    }

    if (action === 'compile') {
      const raw = await callDeepSeek(COMPILER_SYSTEM, messages, true)
      // Limpiar posibles backticks
      const clean = raw.replace(/```json|```/g, '').trim()
      let sections
      try {
        sections = JSON.parse(clean)
      } catch {
        return NextResponse.json(
          { error: 'No se pudo generar el documento. Intenta de nuevo.' },
          { status: 500 }
        )
      }
      return NextResponse.json({ ok: true, sections })
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  } catch (err) {
    console.error('[agent-training] Exception:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error inesperado' },
      { status: 500 }
    )
  }
}
