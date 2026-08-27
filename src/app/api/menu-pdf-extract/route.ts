 

import { NextResponse } from 'next/server'
import { extractText, getDocumentProxy } from 'unpdf'

/**
 * /api/menu-pdf-extract  ·  v2.19 (unpdf)
 */

export const runtime = 'nodejs'
export const maxDuration = 90

type ExtractedItem = {
  category: string                 // nombre de la categoría (texto, se mapea a categoria_id en el front)
  name: string
  description?: string
  price?: number
  tags?: string[]                  // vegano, spicy, sin gluten
  allergens?: string[]             // gluten, lacteos, frutos secos
  is_recommended?: boolean
}

export async function POST(req: Request) {
  try {
    const { pdf_url } = await req.json()
    if (!pdf_url) return NextResponse.json({ error: 'pdf_url es requerido' }, { status: 400 })

    // 1. Descargar PDF
    const pdfRes = await fetch(pdf_url)
    if (!pdfRes.ok) throw new Error(`No se pudo descargar el PDF (HTTP ${pdfRes.status})`)
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer())

    // 2. Extraer texto
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer))
    const totalPages = pdf.numPages
    const extracted = await extractText(pdf, { mergePages: true })
    const extractedText: any = extracted.text
    let text: string = Array.isArray(extractedText) ? extractedText.join('\n\n') : (extractedText || '')

    if (text.length > 25000) {
      text = text.slice(0, 25000) + '\n\n[...PDF truncado...]'
    }
    if (text.trim().length < 50) {
      return NextResponse.json({
        error: 'No se pudo extraer texto. ¿Es un PDF escaneado sin OCR?'
      }, { status: 422 })
    }

    // 3. Prompt a DeepSeek
    const systemPrompt = `Eres un asistente que extrae el menú completo de restaurantes desde un PDF para una agencia mexicana.

Te voy a pasar el texto del menú. Tu tarea: identificar TODOS los platillos/items con su categoría y devolver un JSON con esta estructura EXACTA:

{
  "items": [
    {
      "category": "Entradas",
      "name": "Guacamole con totopos",
      "description": "Aguacate, jitomate, cilantro, cebolla, limón",
      "price": 120,
      "tags": ["vegano", "sin gluten"],
      "allergens": [],
      "is_recommended": false
    }
  ]
}

Reglas estrictas:
- Cada item es un objeto en "items". Cada item tiene su "category" como texto (ej. "Entradas", "Tacos", "Bebidas").
- Si el PDF tiene 30 items, devuelve 30 objetos.
- "price" es número entero sin comas (e.g. "$120.00" → 120).
- "tags" son etiquetas dietéticas del item: vegano, vegetariano, spicy, sin gluten, sin lactosa, picante, dulce, frio, caliente. Solo en minúsculas.
- "allergens" son alérgenos detectables: gluten, lacteos, huevo, frutos secos, mariscos, soja, pescado.
- "is_recommended": true SOLO si el PDF lo marca explícitamente como "recomendado", "popular", "house special", "el favorito".
- "description" es la descripción corta del item (ingredientes, preparación).
- Si la categoría no está clara, usa "General".
- NO inventes items que no estén en el PDF.
- Responde SOLAMENTE el JSON, sin texto adicional, sin markdown fences.`

    const userPrompt = `TEXTO DEL MENÚ:\n\n${text}`

    // 4. DeepSeek call
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
        temperature: 0.1,
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

    // 5. Parse
    let parsed_result: { items: ExtractedItem[] }
    try {
      const clean = raw.replace(/^```(json)?\s*/i, '').replace(/```\s*$/i, '').trim()
      parsed_result = JSON.parse(clean)
    } catch {
      console.error('DeepSeek raw response:', raw)
      throw new Error('DeepSeek devolvió JSON inválido')
    }

    const itemsRaw = Array.isArray(parsed_result?.items) ? parsed_result.items : []

    // 6. Sanitizar
    const items = itemsRaw.map((it, idx) => {
      const safe: any = {
        category: typeof it.category === 'string' && it.category.trim() ? it.category.trim() : 'General',
        name: typeof it.name === 'string' ? it.name.slice(0, 200) : `Item ${idx + 1}`,
      }
      if (typeof it.description === 'string')   safe.description = it.description.slice(0, 1000)
      if (typeof it.price === 'number' && it.price >= 0) safe.price = it.price
      if (Array.isArray(it.tags))               safe.tags = it.tags.filter(t => typeof t === 'string').slice(0, 10).map(t => t.toLowerCase())
      if (Array.isArray(it.allergens))          safe.allergens = it.allergens.filter(a => typeof a === 'string').slice(0, 10).map(a => a.toLowerCase())
      if (it.is_recommended === true)           safe.is_recommended = true
      return safe
    })

    // 7. Derivar categorías únicas
    const categoryNames = Array.from(new Set(items.map(i => i.category)))
    const categories = categoryNames.map((name, idx) => ({
      name,
      display_order: idx
    }))

    return NextResponse.json({
      success: true,
      items,
      categories,
      counts: {
        items: items.length,
        categories: categories.length
      },
      pages: totalPages,
      text_length: text.length
    })

  } catch (error: any) {
    console.error('menu-pdf-extract error:', error)
    return NextResponse.json({
      error: error.message || 'Error procesando el PDF'
    }, { status: 500 })
  }
}
