 

import { NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'

/**
 * ============================================================================
 * /api/properties-pdf-extract  ·  v2.18 (unpdf)
 * ----------------------------------------------------------------------------
 * Usa unpdf en lugar de pdf-parse: librería nativa de Node sin pdfjs-dist,
 * sin necesidad de polyfills de DOMMatrix/DOMPoint.
 * ============================================================================
 */

export const runtime = 'nodejs'
export const maxDuration = 90    // PDFs grandes pueden tomar más

type ExtractedProperty = {
  title: string
  description?: string
  property_type?: string
  operation_type?: string
  price?: number
  currency?: string
  bedrooms?: number
  bathrooms?: number
  parking_spots?: number
  area_total_m2?: number
  area_built_m2?: number
  zone?: string
  city?: string
  address?: string
  features?: string[]
}

const VALID_PROPERTY_TYPES = ['casa','depto','terreno','local','oficina','bodega','quinta','otro']
const VALID_OPERATIONS     = ['venta','renta','preventa','renta_temporal']

export async function POST(req: Request) {
  try {
    const { pdf_url } = await req.json()
    if (!pdf_url) return NextResponse.json({ error: 'pdf_url es requerido' }, { status: 400 })

    // 1. Descargar PDF
    const pdfRes = await fetch(pdf_url)
    if (!pdfRes.ok) throw new Error(`No se pudo descargar el PDF (HTTP ${pdfRes.status})`)
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())

    // 2. Extraer texto con unpdf (nativo Node)
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer))
    const totalPages = pdf.numPages
    const extracted = await extractText(pdf, { mergePages: true })
    // mergePages:true → text es string. Cast defensivo por si la API cambia.
    const extractedText: any = extracted.text
    let text: string = Array.isArray(extractedText) ? extractedText.join('\n\n') : (extractedText || '')

    // Para catálogos grandes podemos aumentar el límite. DeepSeek soporta ~64K context.
    if (text.length > 30000) {
      text = text.slice(0, 30000) + '\n\n[...PDF truncado...]'
    }
    if (text.trim().length < 100) {
      return NextResponse.json({
        error: 'No se pudo extraer texto suficiente del PDF. ¿Es un PDF escaneado sin OCR?'
      }, { status: 422 })
    }

    // 3. Prompt para DeepSeek
    const systemPrompt = `Eres un asistente que extrae propiedades inmobiliarias de catálogos PDF para una agencia mexicana.

Te voy a pasar el texto de un PDF. Tu tarea: identificar TODAS las propiedades y devolver un JSON con esta estructura EXACTA:

{
  "properties": [
    {
      "title": "Título descriptivo corto (max 80 chars)",
      "description": "Descripción más completa (max 500 chars)",
      "property_type": "casa | depto | terreno | local | oficina | bodega | quinta | otro",
      "operation_type": "venta | renta | preventa | renta_temporal",
      "price": 5000000,
      "currency": "MXN",
      "bedrooms": 3,
      "bathrooms": 2.5,
      "parking_spots": 2,
      "area_total_m2": 250,
      "area_built_m2": 180,
      "zone": "Polanco",
      "city": "Ciudad de México",
      "address": "Av. Presidente Masaryk 123",
      "features": ["alberca", "gym", "vista al mar"]
    }
  ]
}

Reglas estrictas:
- Cada propiedad es un objeto en "properties". Si el PDF tiene 12 propiedades, devuelve 12 objetos.
- "property_type" SOLO puede ser uno de: casa, depto, terreno, local, oficina, bodega, quinta, otro.
- "operation_type" SOLO puede ser uno de: venta, renta, preventa, renta_temporal. Si no está claro, usa "venta".
- "currency" default "MXN". Si dice USD o dólares, usa "USD".
- "price" siempre número entero sin comas. "5,000,000" → 5000000.
- "bathrooms" puede ser decimal: 2 baños y medio = 2.5.
- Campos opcionales: si no aparecen en el PDF, OMÍTELOS (no pongas null, no inventes).
- "title" debe ser descriptivo pero corto. Si no hay título explícito, generalo desde tipo+zona (ej. "Casa en Polanco").
- "features" es un array de strings cortos. Amenidades como alberca, jardín, vista, terraza, jacuzzi, gym, seguridad 24h.
- NO inventes propiedades que no estén en el PDF.
- Responde SOLAMENTE el JSON, sin texto adicional, sin markdown fences.`

    const userPrompt = `TEXTO DEL PDF (catálogo de propiedades):\n\n${text}`

    // 4. Llamada a DeepSeek
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,           // máxima fidelidad
        response_format: { type: 'json_object' }
      })
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error?.message || `DeepSeek HTTP ${response.status}`)
    }

    const aiData = await response.json()
    const raw = aiData.choices?.[0]?.message?.content
    if (!raw) throw new Error('DeepSeek devolvió respuesta vacía')

    // 5. Parsear
    let parsed_result: { properties: ExtractedProperty[] }
    try {
      const clean = raw.replace(/^```(json)?\s*/i, '').replace(/```\s*$/i, '').trim()
      parsed_result = JSON.parse(clean)
    } catch {
      console.error('DeepSeek raw response:', raw)
      throw new Error('DeepSeek devolvió JSON inválido')
    }

    const propertiesRaw = Array.isArray(parsed_result?.properties) ? parsed_result.properties : []

    // 6. Validar y sanitizar cada propiedad
    const properties = propertiesRaw.map((p, idx) => {
      const safe: any = {
        title: typeof p.title === 'string' ? p.title.slice(0, 200) : `Propiedad ${idx + 1}`,
      }
      if (typeof p.description === 'string')  safe.description = p.description.slice(0, 2000)
      if (VALID_PROPERTY_TYPES.includes(p.property_type as any)) safe.property_type = p.property_type
      if (VALID_OPERATIONS.includes(p.operation_type as any))    safe.operation_type = p.operation_type
      else if (p.operation_type)                                 safe.operation_type = 'venta'
      if (typeof p.price === 'number' && p.price > 0)            safe.price = p.price
      if (typeof p.currency === 'string')                        safe.currency = p.currency.toUpperCase().slice(0, 3)
      if (typeof p.bedrooms === 'number')                        safe.bedrooms = Math.round(p.bedrooms)
      if (typeof p.bathrooms === 'number')                       safe.bathrooms = p.bathrooms
      if (typeof p.parking_spots === 'number')                   safe.parking_spots = Math.round(p.parking_spots)
      if (typeof p.area_total_m2 === 'number')                   safe.area_total_m2 = p.area_total_m2
      if (typeof p.area_built_m2 === 'number')                   safe.area_built_m2 = p.area_built_m2
      if (typeof p.zone === 'string')                            safe.zone = p.zone.slice(0, 100)
      if (typeof p.city === 'string')                            safe.city = p.city.slice(0, 100)
      if (typeof p.address === 'string')                         safe.address = p.address.slice(0, 300)
      if (Array.isArray(p.features))                             safe.features = p.features.filter(f => typeof f === 'string').slice(0, 20)
      return safe
    })

    return NextResponse.json({
      success: true,
      properties,
      count: properties.length,
      pages: totalPages,
      text_length: text.length
    })

  } catch (error: any) {
    console.error('properties-pdf-extract error:', error)
    return NextResponse.json({
      error: error.message || 'Error procesando el PDF'
    }, { status: 500 })
  }
}
