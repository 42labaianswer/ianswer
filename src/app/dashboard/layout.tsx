 

import Sidebar from '../../components/Sidebar'
import MainContainer from '../../components/MainContainer'
import DashboardHeader from '../../components/DashboardHeader'
import { MobileSidebarProvider } from '../../components/MobileSidebarContext'
import OnboardingWizard from '../../components/OnboardingWizard'
import TrialBanner from '../../components/TrialBanner'
import SignupBootstrap from '../../components/SignupBootstrap'
import SubscriptionGuard from '../../components/SubscriptionGuard'
import { WorkspaceProvider } from '../../components/WorkspaceContext'
import ThemeSync from '../../components/ThemeSync'
import ServerThemeStyle from '../../components/ServerThemeStyle'
import ServerThemeHydrator from '../../components/ServerThemeHydrator'
import { getServerTheme } from '../../lib/getServerTheme'
import { headers } from 'next/headers'
import { GATE_HEADER } from '../../lib/dashboardGate'

// ============================================================================
// DashboardLayout - Server-resolved theme
// ----------------------------------------------------------------------------
// Layout ASYNC Server Component. Antes de renderizar resuelve la industria del
// usuario desde la BD (getServerTheme) y:
//   1. Inyecta las CSS vars del theme en el HTML inicial (ServerThemeStyle),
//      asi el primer byte ya trae los colores correctos - sin flash aunque
//      hagas Cmd+Shift+R.
//   2. Hidrata el store de Zustand con nombre/icono/tenant de la industria
//      (ServerThemeHydrator), para que el Sidebar muestre el branding correcto
//      desde el primer frame, sin el "PLATAFORMA" generico.
//
// El fetch cliente (refreshWorkspace) corre en background para datos frescos,
// pero no es responsable del primer pintado.
// ============================================================================

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const serverTheme = await getServerTheme()

  // Acceso decidido en el servidor por proxy.ts (lib/dashboardGate.ts). Si la
  // cuenta tiene que pasar por el wizard, no se manda NADA del dashboard al
  // navegador: solo el wizard. Así borrar el overlay no deja nada debajo.
  const gate = (await headers()).get(GATE_HEADER)

  if (gate === 'wizard') {
    return (
      <>
        <ServerThemeStyle theme={serverTheme} />
        <WorkspaceProvider>
          <ServerThemeHydrator theme={serverTheme} />
          <ThemeSync />
          <div className="h-screen bg-slate-50 font-sans text-slate-900">
            <SignupBootstrap />
            <OnboardingWizard />
          </div>
        </WorkspaceProvider>
      </>
    )
  }

  return (
    <>
      <ServerThemeStyle theme={serverTheme} />

      <WorkspaceProvider>
        <ServerThemeHydrator theme={serverTheme} />
        <ThemeSync />

        <MobileSidebarProvider>
          <div className="flex h-screen bg-slate-50 font-sans text-slate-900">

            <SignupBootstrap />
            <SubscriptionGuard />
            <OnboardingWizard />
            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
              <TrialBanner />
              <DashboardHeader />
              <MainContainer>
                {children}
              </MainContainer>
            </div>
          </div>
        </MobileSidebarProvider>
      </WorkspaceProvider>
    </>
  )
}
