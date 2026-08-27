 

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Loader2, ShieldCheck, Mail, Globe, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function PrivacyPolicyPage() {
  const [platform, setPlatform] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadLegalData() {
      try {
        const { data } = await supabase
          .from('platform_settings')
          .select('*')
          .eq('id', 1)
          .single()
        
        if (data) setPlatform(data)
      } catch (error) {
        console.error('Error cargando políticas:', error)
      } finally {
        setLoading(false)
      }
    }
    loadLegalData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    )
  }

  // Si no hay datos, usamos valores por defecto (fallback)
  const brandName = platform?.name || 'Nuestra Plataforma'
  const logo = platform?.logo_url || ''
  const legal = platform?.legal_settings || {}

  const legalName = legal.legal_name || brandName
  const websiteUrl = legal.website_url || 'https://tusitio.com'
  const supportEmail = legal.support_email || 'soporte@tusitio.com'
  const dataCollected = legal.data_collected || 'Nombre, correo electrónico y foto de perfil vía Meta/Google.'
  const dataPurpose = legal.data_purpose || 'Crear tu perfil de usuario y habilitar las automatizaciones.'
  const thirdParties = legal.third_party_services || 'Proveedores de infraestructura en la nube y servicios de IA.'
  const paymentProcessor = legal.payment_processor || 'proveedores de pago seguros'
  const deletionInstructions = legal.deletion_instructions || 'Envía un correo a nuestro equipo de soporte para solicitar la eliminación permanente de tus datos.'
  const minimumAge = legal.minimum_age || '18'

  const currentDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-blue-200">
      
      {/* HEADER PÚBLICO */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors font-bold text-sm">
            <ArrowLeft size={16} /> Volver al Inicio
          </Link>
          
          <div className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt={`Logo de ${brandName}`} className="h-8 w-auto object-contain" />
            ) : (
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                <ShieldCheck className="text-white" size={16} />
              </div>
            )}
            <span className="font-black text-xl tracking-tight text-slate-900">{brandName}</span>
          </div>
        </div>
      </header>

      {/* CONTENIDO LEGAL */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-20">
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-8 md:p-16">
          
          <div className="text-center mb-16 border-b border-slate-100 pb-12">
            <div className="inline-flex items-center justify-center h-16 w-16 bg-blue-50 text-blue-600 rounded-full mb-6">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-4">Política de Privacidad</h1>
            <p className="text-slate-500 font-medium">Última actualización: {currentDate}</p>
          </div>

          <div className="space-y-12 prose prose-slate max-w-none prose-headings:font-bold prose-h2:text-2xl prose-h2:text-slate-900 prose-p:text-slate-600 prose-p:leading-relaxed prose-li:text-slate-600">
            
            <section>
              <p>
                En <strong>{brandName}</strong> (operado legalmente por <strong>{legalName}</strong>), valoramos y respetamos tu privacidad. Esta Política de Privacidad describe cómo recopilamos, utilizamos, almacenamos y compartimos tu información cuando utilizas nuestros servicios o te integras a través de plataformas de terceros como Meta (Facebook/WhatsApp/Instagram) y Google.
              </p>
            </section>

            <section>
              <h2>1. Información que Recopilamos</h2>
              <p>
                Para poder ofrecerte nuestros servicios de automatización e inteligencia artificial, requerimos ciertos datos. Al registrarte o vincular tus cuentas (incluyendo el inicio de sesión con Facebook Login o Google), recopilamos estrictamente lo siguiente:
              </p>
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mt-4">
                <p className="font-semibold text-slate-800 m-0">{dataCollected}</p>
              </div>
              <p className="mt-4 text-sm text-slate-500 italic">
                * No solicitamos listas de amigos, publicaciones privadas ni datos que no sean esenciales para el funcionamiento de la plataforma.
              </p>
            </section>

            <section>
              <h2>2. Finalidad y Uso de los Datos</h2>
              <p>
                La información que nos proporcionas no se vende a terceros. El uso exclusivo de tus datos es para los siguientes propósitos:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-4">
                <li>{dataPurpose}</li>
                <li>Mantener la seguridad y autenticación de tu cuenta.</li>
                <li>Procesar las comunicaciones generadas a través de la API oficial de WhatsApp/Instagram.</li>
                <li>Notificarte sobre cambios en el servicio o políticas.</li>
              </ul>
            </section>

            <section>
              <h2>3. Terceros y Almacenamiento Seguros</h2>
              <p>
                Para garantizar la disponibilidad y seguridad de nuestro sistema, nos apoyamos en infraestructuras tecnológicas de primer nivel. Tus datos pueden ser procesados a través de:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-4">
                <li><strong>Infraestructura e IA:</strong> {thirdParties}.</li>
                <li><strong>Procesamiento de Pagos:</strong> Toda transacción financiera se maneja a través de <strong>{paymentProcessor}</strong>, garantizando cumplimiento PCI-DSS. No almacenamos datos de tarjetas de crédito en nuestros servidores.</li>
              </ul>
            </section>

            <section className="bg-blue-50/50 p-8 rounded-3xl border border-blue-100 mt-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
              <h2 className="text-blue-900 mt-0">4. Instrucciones de Eliminación de Datos (Data Deletion Policy)</h2>
              <p className="text-blue-800/80 mb-4">
                En cumplimiento con el RGPD y las políticas de desarrollo de Meta Platforms, Inc., tienes el derecho absoluto de solicitar la eliminación total de tus datos personales, así como revocar los accesos otorgados vía Facebook Login.
              </p>
              <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm">
                <p className="font-bold text-slate-900 m-0">Para eliminar tus datos de nuestra plataforma:</p>
                <p className="text-slate-700 mt-2">{deletionInstructions}</p>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-sm text-slate-500 m-0">Para revocar el acceso desde Facebook: Ve a <em>Configuración y Privacidad &gt; Configuración &gt; Apps y Sitios Web</em> en tu cuenta de Facebook, selecciona <strong>{brandName}</strong> y haz clic en "Eliminar".</p>
                </div>
              </div>
            </section>

            <section>
              <h2>5. Privacidad Infantil (Regulaciones COPPA y ASA)</h2>
              <p>
                Nuestros servicios están diseñados exclusivamente para usuarios que cumplan con la edad legal para formar contratos vinculantes. <strong>No permitimos el uso de la plataforma a personas menores de {minimumAge} años</strong>. Si detectamos que hemos recopilado inadvertidamente información de un menor, eliminaremos dichos registros de inmediato.
              </p>
            </section>

            <section>
              <h2>6. Contacto y DPO (Delegado de Protección de Datos)</h2>
              <p>
                Si tienes preguntas sobre esta política, requieres exportar tus datos en un formato legible, o deseas ejercer cualquier derecho de privacidad, por favor contáctanos directamente a través de nuestros canales oficiales:
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mt-6">
                <a href={`mailto:${supportEmail}`} className="flex items-center gap-3 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors text-slate-700 font-semibold no-underline">
                  <Mail className="text-blue-500" size={20} />
                  {supportEmail}
                </a>
                <a href={websiteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors text-slate-700 font-semibold no-underline">
                  <Globe className="text-blue-500" size={20} />
                  Sitio Web Oficial
                </a>
              </div>
            </section>

          </div>
        </div>
      </main>

      {/* FOOTER PÚBLICO */}
      <footer className="border-t border-slate-200 bg-white mt-12 py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-slate-500 font-medium">
          &copy; {new Date().getFullYear()} {legalName}. Todos los derechos reservados. <br className="md:hidden" />
          <span className="hidden md:inline"> • </span>
          Documento generado en cumplimiento legal.
        </div>
      </footer>

    </div>
  )
}
