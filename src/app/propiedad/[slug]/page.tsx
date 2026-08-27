/**
 * ============================================================================
 * /propiedad/[slug]/page.tsx · v2.17
 * ----------------------------------------------------------------------------
 * Página pública (sin auth) de una propiedad individual.
 *
 * URL:/propiedad/casa-polanco-vista-parque-a4b8
 *
 * El bot envía esta URL al cliente vía WhatsApp.
 *
 * Branding:
 *   - Si la company tiene branding_custom + brand_logo/colors → usa esos
 *   - Si no → usa los defaults del vertical
 *
 * Solo muestra propiedades con status='disponible' (RLS lo enforza).
 * ============================================================================
 */

import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { hasFullBranding, getPlatformName } from '../../../lib/branding'

// Cliente anon (para acceso público sin auth)
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const dynamic = 'force-dynamic'
export const revalidate = 60  // cache 60s para que cambios se reflejen rápido

type Params = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Params) {
  const { slug } = await params
  const { data } = await supabaseAnon
    .from('v_properties_enriched')
    .select('title, description, price, currency, photos, company_name')
    .eq('public_slug', slug)
    .eq('status', 'disponible')
    .maybeSingle()

  if (!data) return { title: 'Propiedad no encontrada' }

  return {
    title: `${data.title} · ${data.company_name || 'iAnswer'}`,
    description: data.description?.slice(0, 200) || data.title,
    openGraph: {
      title: data.title,
      description: data.description?.slice(0, 200) || data.title,
      images: (data.photos as string[])?.slice(0, 1).map(url => ({ url })) || []
    }
  }
}

export default async function PropertyPublicPage({ params }: Params) {
  const { slug } = await params
  const { data: prop } = await supabaseAnon
    .from('v_properties_enriched')
    .select('*')
    .eq('public_slug', slug)
    .eq('status', 'disponible')
    .maybeSingle()

  if (!prop) return notFound()

  // v3.0 Sprint 5: Gate full_branding
  const [fullBranding, platformName] = await Promise.all([
    hasFullBranding(prop.company_id),
    getPlatformName()
  ])

  // Branding efectivo
  const primaryColor = prop.company_primary_color || '#7c3aed'
  const accentColor = prop.company_accent_color || '#a855f7'
  const logoUrl = prop.company_logo

  const photos: string[] = Array.isArray(prop.photos) ? prop.photos : []
  const features: string[] = Array.isArray(prop.features) ? prop.features : []

  const fmtPrice = prop.price ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: prop.currency || 'MXN', maximumFractionDigits: 0 }).format(prop.price) : null

  return (
    <div className="min-h-screen bg-slate-50">

      {/* HEADER whitelabel */}
      <header className="text-white sticky top-0 z-30 shadow-md" style={{ backgroundColor: primaryColor }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-9 max-w-[160px] object-contain" />
          ) : (
            <div className="h-9 w-9 bg-white/15 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-xl">{(prop.company_name || '?').charAt(0)}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="font-black truncate">{prop.company_name || 'Inmobiliaria'}</p>
            <p className="text-[10px] opacity-80 uppercase tracking-widest">Catálogo</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* GALERÍA */}
        {photos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
            <div className="md:col-span-2 aspect-[4/3] rounded-2xl overflow-hidden bg-slate-200">
              <img src={photos[0]} alt={prop.title} className="w-full h-full object-cover" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
              {photos.slice(1, 5).map((p, i) => (
                <div key={i} className="aspect-square md:aspect-[4/3] rounded-2xl overflow-hidden bg-slate-200">
                  <img src={p} alt={`${prop.title} ${i + 2}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-4">

            {/* Title + tipo + operación */}
            <div className="bg-white rounded-3xl p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {prop.property_type && (
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest text-white" style={{ backgroundColor: accentColor }}>
                    {prop.property_type}
                  </span>
                )}
                {prop.operation_type && (
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest bg-slate-100 text-slate-700">
                    {prop.operation_type}
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-black text-slate-900 leading-tight">{prop.title}</h1>
              {(prop.zone || prop.city) && (
                <p className="text-sm text-slate-500 mt-2">
                  📍 {[prop.zone, prop.city, prop.state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>

            {/* Características clave */}
            <div className="bg-white rounded-3xl p-6 shadow-sm">
              <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">Características</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {prop.bedrooms != null && <KeyStat label="Recámaras" value={String(prop.bedrooms)} />}
                {prop.bathrooms != null && <KeyStat label="Baños" value={String(prop.bathrooms)} />}
                {prop.parking_spots != null && <KeyStat label="Estac." value={String(prop.parking_spots)} />}
                {prop.area_built_m2 && <KeyStat label="Construcción" value={`${prop.area_built_m2}m²`} />}
                {prop.area_total_m2 && <KeyStat label="Terreno" value={`${prop.area_total_m2}m²`} />}
                {prop.year_built && <KeyStat label="Año" value={String(prop.year_built)} />}
              </div>
            </div>

            {/* Descripción */}
            {prop.description && (
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-3">Descripción</h2>
                <p className="text-slate-700 leading-relaxed whitespace-pre-line">{prop.description}</p>
              </div>
            )}

            {/* Amenidades */}
            {features.length > 0 && (
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-3">Amenidades</h2>
                <div className="flex flex-wrap gap-2">
                  {features.map((f, i) => (
                    <span key={i} className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ backgroundColor: `${accentColor}20`, color: primaryColor }}>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mapa */}
            {prop.latitude && prop.longitude && (
              <div className="bg-white rounded-3xl p-6 shadow-sm">
                <h2 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-3">Ubicación</h2>
                <div className="aspect-video rounded-2xl overflow-hidden">
                  <iframe
                    title="Mapa"
                    src={`https://www.google.com/maps?q=${prop.latitude},${prop.longitude}&z=15&output=embed`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                  />
                </div>
                {prop.address && <p className="text-xs text-slate-600 mt-2">{prop.address}</p>}
              </div>
            )}
          </div>

          {/* Sidebar: precio + agente + CTA */}
          <div className="space-y-4">
            {fmtPrice && (
              <div className="bg-white rounded-3xl p-6 shadow-sm sticky top-20">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Precio</p>
                <p className="text-3xl font-black text-slate-900 leading-none">{fmtPrice}</p>
                {prop.maintenance_fee && (
                  <p className="text-xs text-slate-500 mt-2">+ ${prop.maintenance_fee.toLocaleString()} mantenimiento</p>
                )}

                {prop.agent_name && (
                  <div className="mt-5 pt-5 border-t border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Atendido por</p>
                    <p className="font-black text-slate-900">{prop.agent_title} {prop.agent_name}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer mínimo whitelabel */}
        <footer className="text-center text-xs text-slate-400 mt-12 pb-6">
          © {new Date().getFullYear()} {prop.company_name || 'Inmobiliaria'}
          {!fullBranding && (
            <span className="block mt-2 text-slate-300">
              Powered by{' '}
              <a href="/" target="_blank" rel="noopener noreferrer" className="font-bold text-slate-500 hover:text-slate-700">
                {platformName}
              </a>
            </span>
          )}
        </footer>
      </main>
    </div>
  )
}

function KeyStat({ label, value }: { label: string, value: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  )
}