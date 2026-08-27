 

import { Metadata } from 'next'
import LegalPage from '../../../../components/public/LegalPage'
import { loadLegalConfig } from '../../../../lib/legalConfig'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { brandName, legalSettings } = await loadLegalConfig()
  const website = legalSettings.website_url || 'https://tusitio.com'
  return {
    title: `Política de cookies · ${brandName}`,
    description: `Cómo usamos cookies y tecnologías similares en ${website} y en el dashboard.`
  }
}

export default async function CookiesPage() {
  const { brandName, legalSettings } = await loadLegalConfig()
  const contactEmail = legalSettings.support_email || 'soporte@midominio.com'
  const website = legalSettings.website_url || 'https://tusitio.com'

  return (
    <LegalPage
      title="Política de cookies"
      description={`Cómo usamos cookies y tecnologías similares en ${website} y en el dashboard.`}
      effectiveDate="1 de enero de 2026"
      sections={[
        {
          id: 'que-son',
          title: '1. ¿Qué son las cookies?',
          body: (
            <>
              <p>
                Las cookies son pequeños archivos de texto que un sitio web almacena en tu dispositivo cuando lo visitas. Sirven para recordar información sobre ti entre visitas: tu sesión iniciada, preferencias de idioma, métricas de uso, entre otros.
              </p>
              <p>
                Existen también tecnologías similares como el <strong className="text-slate-900">localStorage</strong> del navegador, que funciona parecido pero queda almacenado solo en tu equipo (no se envía con cada petición).
              </p>
            </>
          )
        },
        {
          id: 'tipos',
          title: '2. Tipos de cookies que usamos',
          body: (
            <>
              <p><strong className="text-slate-900">Esenciales (no se pueden desactivar):</strong></p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li><strong className="text-slate-900">Sesión:</strong> mantienen tu login activo mientras usas el dashboard.</li>
                <li><strong className="text-slate-900">Seguridad:</strong> protección contra ataques CSRF y verificación de origen.</li>
                <li><strong className="text-slate-900">Preferencias críticas:</strong> idioma, tema visual elegido.</li>
              </ul>

              <p className="mt-4"><strong className="text-slate-900">Analíticas (anónimas y agregadas):</strong></p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li>Vercel Analytics para medir páginas más visitadas y tiempos de carga.</li>
                <li>No usamos Google Analytics ni rastreo publicitario invasivo.</li>
              </ul>

              <p className="mt-4"><strong className="text-slate-900">Funcionales:</strong></p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li>Recordar la última vista que usaste del CRM (tabla vs kanban).</li>
                <li>Estado abierto/cerrado del sidebar.</li>
              </ul>
            </>
          )
        },
        {
          id: 'terceros',
          title: '3. Cookies de terceros',
          body: (
            <>
              <p>Algunos servicios que usamos pueden colocar sus propias cookies:</p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li><strong className="text-slate-900">Stripe:</strong> para procesar pagos de forma segura (anti-fraude).</li>
                <li><strong className="text-slate-900">Supabase:</strong> para mantener la sesión de tu usuario autenticado.</li>
                <li><strong className="text-slate-900">Vercel:</strong> para servir el sitio desde la región más cercana a ti.</li>
              </ul>
              <p>
                Estos terceros tienen sus propias políticas de privacidad que rigen su uso de cookies.
              </p>
            </>
          )
        },
        {
          id: 'gestionarlas',
          title: '4. Cómo gestionar tus cookies',
          body: (
            <>
              <p>
                Puedes controlar las cookies desde la configuración de tu navegador:
              </p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li><strong className="text-slate-900">Chrome:</strong> Configuración → Privacidad y seguridad → Cookies.</li>
                <li><strong className="text-slate-900">Safari:</strong> Preferencias → Privacidad.</li>
                <li><strong className="text-slate-900">Firefox:</strong> Configuración → Privacidad y seguridad.</li>
                <li><strong className="text-slate-900">Edge:</strong> Configuración → Cookies y permisos del sitio.</li>
              </ul>
              <p>
                <strong className="text-slate-900">Importante:</strong> si bloqueas las cookies esenciales no podrás iniciar sesión en el dashboard. El sitio público sí funcionará, pero algunas preferencias no se recordarán.
              </p>
            </>
          )
        },
        {
          id: 'cambios',
          title: '5. Cambios a esta política',
          body: (
            <p>
              Si actualizamos qué cookies usamos, actualizaremos esta página y, si el cambio es sustancial, te avisaremos por email.
            </p>
          )
        },
        {
          id: 'contacto',
          title: '6. Contacto',
          body: (
            <p>
              Dudas sobre cookies: <strong className="text-slate-900">
                <a href={`mailto:${contactEmail}`} className="text-lime-700 font-bold hover:underline">{contactEmail}</a>
              </strong>
            </p>
          )
        }
      ]}
    />
  )
}