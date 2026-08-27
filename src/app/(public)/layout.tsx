 

// ============================================================================
// src/app/(public)/layout.tsx
// ----------------------------------------------------------------------------
// Layout público con Navbar + Footer. Carga branding + industrias para el
// submenu del navbar.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import PublicNavbar from '../../components/public/PublicNavbar'
import PublicFooter from '../../components/public/PublicFooter'
import { loadSiteSettings, loadPlatformBranding, s } from '../../lib/siteSettings'

async function loadIndustries() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('site_industries')
    .select('slug, name, tagline, accent_color')
    .eq('visible', true)
    .order('display_order')
  return data || []
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [settings, branding, industries] = await Promise.all([
    loadSiteSettings(),
    loadPlatformBranding(),
    loadIndustries()
  ])

  const brandName = branding.name || s(settings, 'brand_name', 'Plataforma')

  return (
    <div className="min-h-screen bg-white text-slate-950 font-sans">
      <PublicNavbar
        brandName={brandName}
        logoUrl={branding.logo_url}
        industries={industries as any}
      />
      <main className="pt-16 md:pt-20">
        {children}
      </main>
      <PublicFooter
        brandName={brandName}
        logoUrl={branding.logo_url}
        tagline={s(settings, 'footer_tagline')}
        contactEmail={s(settings, 'contact_email')}
        contactWhatsapp={s(settings, 'contact_whatsapp')}
        contactAddress={s(settings, 'contact_address')}
      />
    </div>
  )
}
