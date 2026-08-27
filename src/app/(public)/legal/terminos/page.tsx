 

import { Metadata } from 'next'
import LegalPage from '../../../../components/public/LegalPage'
import { loadLegalConfig, formatWhatsApp } from '../../../../lib/legalConfig'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await loadLegalConfig()
  return {
    title: `Términos y condiciones · ${brandName}`,
    description: `Condiciones bajo las cuales prestamos el servicio de ${brandName} y de WhatsApp Business Platform.`
  }
}

export default async function TerminosPage() {
  const { brandName, legalSettings } = await loadLegalConfig()

  const {
    legal_name = 'Gustavo Monforte, persona física con actividad empresarial',
    website_url = 'https://tusitio.com',
    support_email = 'soporte@midominio.com',
    legal_email = support_email,
    contact_address = 'Mérida, Yucatán, México',
    whatsapp_number = '',
  } = legalSettings

  return (
    <LegalPage
      title="Términos y condiciones"
      description={`Las reglas del juego entre tú y nosotros. Léelos antes de empezar a usar ${brandName}.`}
      effectiveDate="1 de enero de 2026"
      sections={[
        {
          id: 'definiciones',
          title: '1. Definiciones',
          body: (
            <>
              <p><strong>"{brandName}", "nosotros"</strong>: {legal_name}, con domicilio en {contact_address}.</p>
              <p><strong>"Cliente", "tú"</strong>: la persona física o moral que crea una cuenta en {brandName} y contrata el servicio.</p>
              <p><strong>"Servicio"</strong>: la plataforma {brandName} accesible en {website_url}, incluyendo el dashboard, el agente IA, la integración con WhatsApp Business y todos los módulos.</p>
              <p><strong>"Usuario Final"</strong>: la persona que envía o recibe mensajes a través del WhatsApp Business del Cliente (pacientes, clientes, prospectos).</p>
              <p><strong>"WhatsApp Business Platform"</strong>: la plataforma de mensajería empresarial de WhatsApp LLC y Meta Platforms, Inc.</p>
            </>
          )
        },
        {
          id: 'aceptacion',
          title: '2. Aceptación',
          body: (
            <>
              <p>Al crear una cuenta en {brandName}, aceptas estos términos en su totalidad. Si no estás de acuerdo, no uses el Servicio.</p>
              <p>Adicionalmente, al conectar tu WhatsApp Business al Servicio aceptas también:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Los <a href="https://www.whatsapp.com/legal/business-terms" target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">WhatsApp Business Terms of Service</a></li>
                <li>La <a href="https://business.whatsapp.com/policy" target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">WhatsApp Business Messaging Policy</a></li>
                <li>La <a href="https://www.whatsapp.com/legal/business-policy/" target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">WhatsApp Commerce Policy</a></li>
              </ul>
              <p className="mt-3">El incumplimiento de estas políticas puede resultar en suspensión del Servicio sin previo aviso.</p>
            </>
          )
        },
        {
          id: 'whatsapp-platform',
          title: '3. Uso de WhatsApp Business Platform',
          body: (
            <>
              <p>{brandName} actúa como <strong>Tech Provider</strong> para tu cuenta de WhatsApp Business. Esto significa:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Tú eres el dueño de tu WhatsApp Business Account (WABA) y de tu Phone Number ID</li>
                <li>{brandName} accede a tu WABA mediante un System User Access Token que tú nos otorgas vía Embedded Signup oficial de Meta</li>
                <li>Puedes revocar ese acceso en cualquier momento desde tu Facebook Business Manager</li>
                <li>{brandName} NO usa tu WABA para enviar mensajes a usuarios distintos de los que tú o tu agente IA seleccionen</li>
              </ul>
              <p className="mt-3"><strong>3.1 Tu responsabilidad como dueño del WABA</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Obtener consentimiento explícito (opt-in) de cada Usuario Final ANTES de enviarle mensajes desde tu negocio</li>
                <li>Respetar las solicitudes de opt-out (baja). Una vez que un usuario pide baja, {brandName} bloquea automáticamente nuevos envíos a ese número</li>
                <li>Mantener actualizado el Aviso de Privacidad que se aplica a tus Usuarios Finales</li>
                <li>NO enviar contenido prohibido por la WhatsApp Business Messaging Policy</li>
                <li>Mantener la calidad de tu número. Si tu calidad baja a RED y Meta suspende tu número, no es responsabilidad de {brandName}</li>
              </ul>
              <p className="mt-3"><strong>3.2 Mensajes iniciados por el negocio (templates)</strong></p>
              <p>Para enviar mensajes fuera de la ventana de 24 horas, debes usar plantillas previamente aprobadas por Meta. {brandName} facilita la creación y submission, pero la aprobación depende exclusivamente de Meta.</p>
              <p className="mt-3"><strong>3.3 Costos de WhatsApp</strong></p>
              <p>Meta cobra a tu cuenta de WhatsApp Business directamente por las conversaciones iniciadas por el negocio. Estos costos NO están incluidos en tu plan de {brandName}.</p>
            </>
          )
        },
        {
          id: 'planes-pagos',
          title: '4. Planes y pagos',
          body: (
            <>
              <p>Los planes y precios están publicados en <a href="/precios" className="text-lime-700 font-bold hover:underline">/precios</a> y pueden cambiar con 30 días de aviso previo.</p>
              <p>El cobro es mensual o anual según el plan elegido. Los pagos se procesan vía Stripe.</p>
              <p><strong>Periodo de prueba</strong>: 14 días gratis sin tarjeta. Al terminar el trial debes ingresar método de pago para continuar.</p>
              <p><strong>Cancelación</strong>: puedes cancelar en cualquier momento desde el dashboard o escribiéndonos a <a href={`mailto:${support_email}`} className="text-lime-700 font-bold hover:underline">{support_email}</a>. Efectiva al final del periodo en curso. No hacemos reembolsos parciales.</p>
              <p><strong>Suspensión por falta de pago</strong>: tras 3 días sin pago, el Servicio se suspende. Tras 30 días, los datos se archivan. Tras 90 días, los datos pueden ser eliminados.</p>
            </>
          )
        },
        {
          id: 'uso-aceptable',
          title: '5. Uso aceptable',
          body: (
            <>
              <p>El detalle completo está en nuestra <a href="/legal/uso-aceptable" className="text-lime-700 font-bold hover:underline">Política de Uso Aceptable</a>. En resumen, NO puedes usar {brandName} para:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Enviar spam o mensajes masivos a usuarios sin opt-in</li>
                <li>Operar negocios en industrias prohibidas por Meta (sexo, tabaco, alcohol sin licencia, armas, drogas, casinos sin licencia, multinivel engañoso, finanzas sin licencia)</li>
                <li>Suplantar identidades, hacer phishing, vender productos falsificados</li>
                <li>Compartir contenido ilegal, violento, discriminatorio</li>
                <li>Eludir restricciones de Meta o de {brandName}</li>
                <li>Hacer reverse-engineering o intentar acceder a datos de otros clientes</li>
              </ul>
            </>
          )
        },
        {
          id: 'datos',
          title: '6. Datos y privacidad',
          body: (
            <>
              <p>El detalle está en nuestro <a href="/legal/privacidad" className="text-lime-700 font-bold hover:underline">Aviso de Privacidad</a>. Conceptos clave:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>{brandName} actúa como <strong>encargado del tratamiento</strong> de los datos de tus Usuarios Finales</li>
                <li>Tú eres el <strong>responsable</strong>. Tú decides qué datos pides, para qué, y cuánto tiempo los guardas</li>
                <li>{brandName} guarda mensajes durante 12 meses por default</li>
                <li>Sub-encargados: Supabase (almacenamiento), Meta (WhatsApp), proveedores de IA</li>
              </ul>
            </>
          )
        },
        {
          id: 'propiedad-intelectual',
          title: '7. Propiedad intelectual',
          body: (
            <>
              <p>{brandName} (código, diseño, marca) es propiedad exclusiva nuestra.</p>
              <p>Los datos que tú cargas (menú, propiedades, agenda, conversaciones, configuración del agente) son tuyos. Nos otorgas una licencia limitada para procesarlos exclusivamente para prestarte el Servicio.</p>
              <p>Los mensajes generados por el agente IA son tuyos. Tú eres responsable de su contenido frente a los Usuarios Finales.</p>
            </>
          )
        },
        {
          id: 'limitaciones',
          title: '8. Limitaciones de responsabilidad',
          body: (
            <>
              <p>{brandName} se proporciona "tal cual". No garantizamos:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Disponibilidad 24/7 sin interrupciones. Buscamos &gt;99% uptime pero no es SLA contractual</li>
                <li>Que el agente IA siempre responda correctamente. Es una IA y puede equivocarse. Tú debes supervisar</li>
                <li>Que Meta apruebe tu cuenta, tu negocio, tus templates, o mantenga tu número activo</li>
                <li>Que los costos de WhatsApp se mantengan estables</li>
              </ul>
              <p className="mt-3">No somos responsables por daños indirectos o lucro cesante. Nuestra responsabilidad máxima está limitada al monto pagado en los últimos 3 meses.</p>
            </>
          )
        },
        {
          id: 'terminacion',
          title: '9. Terminación',
          body: (
            <>
              <p>Puedes terminar el contrato cancelando tu cuenta en cualquier momento.</p>
              <p>{brandName} puede terminar y suspender tu cuenta inmediatamente si:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Incumples estos términos o la Política de Uso Aceptable</li>
                <li>Meta suspende tu cuenta de WhatsApp por violación de sus políticas</li>
                <li>Hay fraude, chargebacks repetidos, o uso indebido</li>
                <li>No pagas durante más de 30 días</li>
                <li>Por orden de autoridad competente</li>
              </ul>
              <p className="mt-3">Al terminar, tienes 30 días para exportar tus datos. Después podemos eliminarlos permanentemente.</p>
            </>
          )
        },
        {
          id: 'modificaciones',
          title: '10. Modificaciones',
          body: (
            <>
              <p>{brandName} puede modificar estos términos. Te avisaremos por email al menos 30 días antes de que surtan efecto.</p>
              <p>Si no estás de acuerdo, debes cancelar antes de la fecha de vigencia. Continuar usando el Servicio después implica aceptación.</p>
            </>
          )
        },
        {
          id: 'ley-jurisdiccion',
          title: '11. Ley aplicable y jurisdicción',
          body: (
            <>
              <p>Este contrato se rige por las leyes de los Estados Unidos Mexicanos.</p>
              <p>Cualquier disputa se resolverá en los tribunales competentes de {contact_address}.</p>
            </>
          )
        },
        {
          id: 'contacto',
          title: '12. Contacto',
          body: (
            <>
              <p>Para cualquier asunto:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Email: <a href={`mailto:${legal_email}`} className="text-lime-700 font-bold hover:underline">{legal_email}</a></li>
                {whatsapp_number && (
                  <li>WhatsApp: <a href={`https://wa.me/${whatsapp_number}`} target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">{formatWhatsApp(whatsapp_number)}</a></li>
                )}
                <li>Domicilio: {contact_address}</li>
              </ul>
            </>
          )
        }
      ]}
    />
  )
}