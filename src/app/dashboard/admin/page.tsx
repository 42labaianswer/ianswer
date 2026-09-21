 

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import {
  ShieldAlert, Layers, PackageOpen, CreditCard,
  Palette, FileText, Webhook, Image as ImageIcon,
  Globe, HelpCircle, BarChart3
} from 'lucide-react'

import TemplatesAdminTab from './tabs/TemplatesAdminTab'
import AddonsAdminTab from './tabs/AddonsAdminTab'
import PlansAdminTab from './tabs/PlansAdminTab'
import PageHeader from '../../../components/PageHeader'
import BrandingAdminTab from './tabs/BrandingAdminTab'
import LandingAdminTab from './tabs/LandingAdminTab'
import LegalAdminTab from './tabs/LegalAdminTab'
import WebhooksAdminTab from './tabs/WebhooksAdminTab'
import SiteContentAdminTab from './tabs/SiteContentAdminTab'
import HelpCenterAdminTab from '../../../components/HelpCenterAdminTab'
import AuditAdminTab from './tabs/AuditAdminTab'
import InvoicingAdminTab from './tabs/InvoicingAdminTab'
import AdminUsageTab from '../../../components/AdminUsageTab'
import IAnswerLoader from '../../../components/IAnswerLoader'

// ============================================================================
// Admin Page v2.26
// ----------------------------------------------------------------------------
// Solo accesible para usuarios con profiles.is_admin = true (verificado por
// is_current_user_admin() y por RLS en cada tabla).
//
// Tabs:
//   - Plans      → edita los 3 planes Start/Growth/Scale
//   - Templates  → CRUD de plantillas verticales
//   - Addons     → CRUD de addons
//   - (Las tabs existentes del 1.5: Tenant, Branding, Landing, Legal,
//      Webhooks — se pueden añadir aquí cuando las tengas.)
// ============================================================================

type TabId = 'plans' | 'templates' | 'addons' | 'branding' | 'landing' | 'site' | 'helpdesk' | 'legal' | 'webhooks' | 'audit' | 'invoicing' | 'usage'

const TABS: Array<{ id: TabId, label: string, icon: any, available: boolean }> = [
  { id: 'plans',     label: 'Planes',     icon: CreditCard, available: true },
  { id: 'templates', label: 'Plantillas', icon: Layers,     available: true },
  { id: 'addons',    label: 'Addons',     icon: PackageOpen, available: true },
  { id: 'branding',  label: 'Marca',      icon: Palette,    available: true },
  { id: 'landing',   label: 'Landing v1', icon: ImageIcon,  available: true },
  { id: 'site',      label: 'Sitio público', icon: Globe,   available: true },
  { id: 'helpdesk',  label: 'Helpdesk',   icon: HelpCircle, available: true },
  { id: 'legal',     label: 'Legal',      icon: FileText,   available: true },
  { id: 'webhooks',  label: 'Webhooks',   icon: Webhook,    available: true },
  { id: 'audit',     label: 'Auditoría',  icon: ShieldAlert, available: true },
  { id: 'invoicing', label: 'Facturación',icon: CreditCard, available: true },
  { id: 'usage',     label: 'Uso',        icon: BarChart3,  available: true }
]

export default function AdminPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabId>('plans')
  const [authorized, setAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    async function checkAccess() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      setAuthorized(!!profile?.is_admin)
    }
    checkAccess()
  }, [router])

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <IAnswerLoader size={40} />
      </div>
    )
  }

  if (!authorized) {
    return (
      <div className="max-w-md mx-auto mt-20 p-8 bg-white border border-slate-200 rounded-3xl text-center">
        <ShieldAlert size={40} className="text-rose-500 mx-auto mb-4" />
        <h1 className="text-xl font-black text-slate-900 mb-2">Acceso restringido</h1>
        <p className="text-sm text-slate-500 font-medium">
          Este panel es solo para administradores de la plataforma.
        </p>
      </div>
    )
  }

  return (
    <div className="pb-20">
      <PageHeader
        eyebrow="MASTER CONTROL"
        title="Panel de Administración"
        description="Configuración global de la plataforma iAnswer."
      />

      {/* Tabs */}
      <nav className="flex gap-1 mb-8 border-b border-slate-200 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => tab.available && setActiveTab(tab.id)}
              disabled={!tab.available}
              className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
                isActive
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              } ${!tab.available ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Icon size={14} />
              {tab.label}
              {!tab.available && <span className="text-[9px] font-black bg-slate-100 px-1.5 py-0.5 rounded">próx.</span>}
            </button>
          )
        })}
      </nav>

      {/* Contenido */}
      <main>
        {activeTab === 'plans'     && <PlansAdminTab />}
        {activeTab === 'templates' && <TemplatesAdminTab />}
        {activeTab === 'addons'    && <AddonsAdminTab />}
        {activeTab === 'branding'  && <BrandingAdminTab />}
        {activeTab === 'landing'   && <LandingAdminTab />}
        {activeTab === 'site'      && <SiteContentAdminTab />}
        {activeTab === 'helpdesk'  && <HelpCenterAdminTab />}
        {activeTab === 'legal'     && <LegalAdminTab />}
        {activeTab === 'webhooks'  && <WebhooksAdminTab />}
        {activeTab === 'audit'     && <AuditAdminTab />}
        {activeTab === 'invoicing' && <InvoicingAdminTab />}
        {activeTab === 'usage'     && <AdminUsageTab />}
      </main>
    </div>
  )
}
