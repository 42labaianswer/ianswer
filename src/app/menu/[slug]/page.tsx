/**
 * ============================================================================
 * /menu/[companySlug]/page.tsx · v2.18
 * ----------------------------------------------------------------------------
 * Catálogo PÚBLICO whitelabel del menú completo de un restaurante.
 *
 * URL: /menu/<company_id>
 *
 * Branding del restaurante. Sin marca iAnswer.
 * El bot puede mandar este link por WhatsApp.
 * ============================================================================
 */

import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { hasFullBranding, getPlatformName } from '../../../lib/branding'

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = 'force-dynamic'
export const revalidate = 120

type Params = { params: Promise<{ companySlug: string }> }

export async function generateMetadata({ params }: Params) {
  const { companySlug } = await params
  const { data: company } = await supabaseAnon
    .from('companies')
    .select('name')
    .eq('id', companySlug)
    .maybeSingle()

  return {
    title: `${company?.name || 'Restaurante'} · Menú`,
    description: `Conoce nuestro menú completo y haz tu pedido por WhatsApp.`
  }
}

export default async function MenuPublicPage({ params }: Params) {
  const { companySlug } = await params

  // 1. Datos de company
  const { data: company } = await supabaseAnon
    .from('companies')
    .select('id, name, brand_logo_url, brand_primary_color, brand_accent_color')
    .eq('id', companySlug)
    .maybeSingle()

  if (!company) return notFound()

  // Verificar que tenga template 'restaurant' instalado (reemplaza chequeo vertical_id legacy)
  const { data: hasRestaurant } = await supabaseAnon
    .from('company_templates')
    .select('template_id')
    .eq('company_id', company.id)
    .eq('template_id', 'restaurant')
    .maybeSingle()

  if (!hasRestaurant) return notFound()

  // v3.0 Sprint 5: Gate full_branding (footer "Powered by")
  const [fullBranding, platformName] = await Promise.all([
    hasFullBranding(company.id),
    getPlatformName()
  ])

  // 2. Categorías y items
  const [catsRes, itemsRes] = await Promise.all([
    supabaseAnon.from('menu_categories').select('*').eq('company_id', company.id).eq('is_active', true).order('display_order'),
    supabaseAnon.from('menu_items').select('*').eq('company_id', company.id).eq('is_available', true).not('public_slug', 'is', null).order('display_order')
  ])

  const categories = catsRes.data || []
  const items: any[] = itemsRes.data || []

  const primaryColor = company.brand_primary_color || '#ea580c'
  const accentColor = company.brand_accent_color || '#f97316'
  const logo = company.brand_logo_url

  // Agrupar items por categoría
  const itemsByCategory: Record<string, any[]> = {}
  items.forEach(it => {
    const key = it.category_id || 'uncategorized'
    if (!itemsByCategory[key]) itemsByCategory[key] = []
    itemsByCategory[key].push(it)
  })

  const recommended = items.filter(it => it.is_recommended)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HEADER whitelabel */}
      <header className="text-white sticky top-0 z-30 shadow-md" style={{ backgroundColor: primaryColor }}>
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="" className="h-9 max-w-[160px] object-contain" />
          ) : (
            <div className="h-9 w-9 bg-white/15 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xl">{(company.name || '?').charAt(0)}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-black truncate">{company.name}</p>
            <p className="text-[10px] opacity-80 uppercase tracking-widest">Carta digital</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">

        {/* Recomendados (carrusel horizontal de cards) */}
        {recommended.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              ⭐ Recomendados
            </h2>
            <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2">
              {recommended.map(it => (
                <FeaturedItem key={it.id} item={it} accentColor={accentColor} primaryColor={primaryColor} />
              ))}
            </div>
          </section>
        )}

        {/* Pills de navegación rápida */}
        {categories.length > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto -mx-4 px-4 pb-2">
            {categories.map(cat => (
              <a
                key={cat.id}
                href={`#cat-${cat.id}`}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {cat.icon && <span className="mr-1">{cat.icon}</span>}
                {cat.name}
              </a>
            ))}
          </div>
        )}

        {/* Menú por categorías */}
        <div className="space-y-8">
          {categories.map(cat => {
            const catItems = itemsByCategory[cat.id] || []
            if (catItems.length === 0) return null
            return (
              <section key={cat.id} id={`cat-${cat.id}`}>
                <h2 className="text-xl font-black text-slate-900 mb-3 flex items-center gap-2 sticky top-16 bg-slate-50 py-2 -mx-4 px-4 z-10">
                  {cat.icon && <span>{cat.icon}</span>}
                  {cat.name}
                </h2>
                {cat.description && <p className="text-sm text-slate-500 mb-3">{cat.description}</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {catItems.map(it => (
                    <PublicItemCard key={it.id} item={it} accentColor={accentColor} />
                  ))}
                </div>
              </section>
            )
          })}

          {(itemsByCategory['uncategorized'] || []).length > 0 && (
            <section>
              <h2 className="text-xl font-black text-slate-900 mb-3">Más opciones</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {itemsByCategory['uncategorized'].map(it => (
                  <PublicItemCard key={it.id} item={it} accentColor={accentColor} />
                ))}
              </div>
            </section>
          )}
        </div>

        {items.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <p className="text-sm">El menú aún no está disponible. Vuelve más tarde.</p>
          </div>
        )}

        <footer className="text-center text-xs text-slate-400 mt-12 pb-6">
          © {new Date().getFullYear()} {company.name}
          {!fullBranding && (
            <span className="block mt-2 text-slate-300">
              Powered by{' '}
              <a href="" target="_blank" rel="noopener noreferrer" className="font-bold text-slate-500 hover:text-slate-700">
                {platformName}
              </a>
            </span>
          )}
        </footer>
      </main>
    </div>
  )
}

// ============================================================================
// CARD DESTACADO (carrusel)
// ============================================================================
function FeaturedItem({ item, accentColor, primaryColor }: { item: any, accentColor: string, primaryColor: string }) {
  return (
    <div className="shrink-0 w-56 bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-100">
      {item.photo_url ? (
        <img src={item.photo_url} alt={item.name} className="h-32 w-full object-cover" />
      ) : (
        <div className="h-32 w-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}20` }}>
          <span className="text-3xl">⭐</span>
        </div>
      )}
      <div className="p-3">
        <p className="font-black text-slate-900 text-sm line-clamp-1">{item.name}</p>
        {item.price != null && (
          <p className="text-lg font-black mt-1" style={{ color: primaryColor }}>${item.price}</p>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CARD DE ITEM PÚBLICO
// ============================================================================
function PublicItemCard({ item, accentColor }: { item: any, accentColor: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm flex gap-3 hover:shadow-md transition-shadow">
      {item.photo_url && (
        <img src={item.photo_url} alt={item.name} className="h-20 w-20 rounded-xl object-cover shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {item.is_recommended && <span className="text-amber-500">⭐</span>}
          <p className="font-black text-slate-900 truncate">{item.name}</p>
        </div>
        {item.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
        )}
        {(Array.isArray(item.tags) ? item.tags : []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {(item.tags || []).slice(0, 3).map((t: string, i: number) => (
              <span key={i} className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}
        {item.price != null && (
          <p className="text-base font-black mt-2" style={{ color: accentColor }}>${item.price}</p>
        )}
      </div>
    </div>
  )
}