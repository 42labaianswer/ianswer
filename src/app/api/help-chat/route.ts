 

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, clientKey, rateLimitHeaders, RATE_LIMITS } from '../../../lib/rateLimit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
  // Límite de tasa: esta ruta es pública y cada llamada consume una inferencia de IA.
  const rl = await checkRateLimit('help-chat', clientKey(req))
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas consultas seguidas. Espera un momento e inténtalo de nuevo.' },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS['help-chat']) }
    )
  }

    const { messages } = await req.json()

    // 1. Obtenemos TODA la información del negocio en paralelo para máxima velocidad
    const [platRes, featRes, secRes, plansRes, artRes] = await Promise.all([
      supabaseAdmin.from('platform_settings').select('name, description').single(),
      supabaseAdmin.from('landing_features').select('title, description'),
      supabaseAdmin.from('landing_scroll_sections').select('title, description'),
      supabaseAdmin.from('plans').select('name, price_monthly, max_agendas, features'),
      supabaseAdmin.from('help_articles').select('title, content')
    ])

    const platformName = platRes.data?.name || 'nuestra plataforma'
    const platformDesc = platRes.data?.description || 'Software de gestión y automatización.'

    // 2. Construimos los bloques de memoria para el Bot
    const featuresText = featRes.data?.map(f => `${f.title}: ${f.description}`).join(' | ') || ''
    const sectionsText = secRes.data?.map(s => `${s.title}: ${s.description}`).join(' | ') || ''
    
    const plansText = plansRes.data?.map(p => 
      `Plan ${p.name}: Cuesta $${p.price_monthly} al mes. Incluye hasta ${p.max_agendas} agendas y las siguientes funciones: ${p.features}.`
    ).join(' ') || 'Consulta con soporte para precios.'

    const articlesText = artRes.data && artRes.data.length > 0 
      ? artRes.data.map(a => `TUTORIAL - ${a.title}: ${a.content}`).join('\n') 
      : 'Aún no hay tutoriales específicos.'

    // 3. Creamos el Prompt Maestro con la nueva personalidad
    const systemPrompt = {
      role: 'system',
      content: `Eres un ejecutivo de ventas y especialista de soporte técnico altamente capacitado que trabaja en la empresa ${platformName}.
Agente AI Automatización
TU ESTILO DE COMUNICACIÓN:
- Hablas como un humano real: de forma natural, amable, fluida, segura y muy persuasiva.
- ESTÁ TOTALMENTE PROHIBIDO usar formato Markdown. NUNCA uses asteriscos para negritas, ni guiones para listas, ni símbolos extraños. Escribe en prosa normal, usando párrafos cortos, comas y puntos. Pareces una persona escribiendo en un chat de WhatsApp o chat web normal.
- Tu objetivo es enamorar al cliente de la plataforma, explicarle por qué es su mejor opción y ayudarle a resolver cualquier duda técnica que tenga de forma clara.

TUS LÍMITES (SÚPER IMPORTANTE):
- Si el usuario te hace una pregunta que NO tiene nada que ver con ${platformName}, gestión de agendas, ventas o soporte técnico (por ejemplo, si te preguntan sobre el clima, chistes, historia, recetas, o programación), DEBES negarte educadamente diciendo que tu rol es exclusivamente asesorar sobre ${platformName} y pregúntale cómo puedes ayudarle con el software.
- No inventes funciones ni precios que no estén en tu conocimiento.

TU CONOCIMIENTO DEL NEGOCIO (Basa tus respuestas estrictamente en esto):
¿Qué es ${platformName}?: ${platformDesc}

Nuestras Ventajas y Características: ${featuresText}. ${sectionsText}

Nuestros Precios y Planes: ${plansText}

Nuestra Base de Conocimientos (Usa esto para enseñarles cómo hacer cosas en el sistema):
${articlesText}`
    }

    // 4. Llamada a la API de DeepSeek
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [systemPrompt, ...messages],
        temperature: 0.6 // Subimos a 0.6 para que hable más fluido y humano, pero siga las reglas.
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
    return NextResponse.json({ error: 'Error procesando la respuesta' }, { status: 500 })
  }
}
