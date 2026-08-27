 

import { Metadata } from 'next'
import LegalPage from '../../../../components/public/LegalPage'
import { loadLegalConfig, formatWhatsApp } from '../../../../lib/legalConfig'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await loadLegalConfig()
  return {
    title: `Política de Uso Aceptable · ${brandName}`,
    description: `Qué puedes y NO puedes hacer al usar ${brandName} y WhatsApp Business Platform.`
  }
}

export default async function UsoAceptablePage() {
  const { brandName, legalSettings } = await loadLegalConfig()

  const {
    abuse_email = 'abuse@midominio.com',
    legal_email = 'legal@midominio.com',
    website_url = 'https://tusitio.com',
    whatsapp_number = '',
  } = legalSettings

  return (
    <LegalPage
      title="Política de Uso Aceptable"
      description={`Las prácticas prohibidas en ${brandName}. Cumplir con esta política es obligatorio. Si la violas, podemos suspender tu cuenta sin previo aviso.`}
      effectiveDate="1 de enero de 2026"
      sections={[
        {
          id: 'introduccion',
          title: '1. Introducción',
          body: (
            <>
              <p>{brandName} es una plataforma de mensajería empresarial basada en WhatsApp Business Platform. Como tal, está sujeta a las políticas de Meta y de WhatsApp además de las nuestras.</p>
              <p>Esta política aplica a todos los usuarios del Servicio. Al usar {brandName} aceptas:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Esta Política de Uso Aceptable</li>
                <li>La <a href="https://business.whatsapp.com/policy" target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">WhatsApp Business Messaging Policy</a></li>
                <li>La <a href="https://www.whatsapp.com/legal/business-policy/" target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">WhatsApp Commerce Policy</a></li>
                <li>Los <a href="https://www.facebook.com/communitystandards/" target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">Community Standards de Meta</a></li>
              </ul>
            </>
          )
        },
        {
          id: 'opt-in',
          title: '2. Consentimiento (opt-in) obligatorio',
          body: (
            <>
              <p>Antes de enviar mensajes a un Usuario Final desde {brandName}, debes haber obtenido su <strong>consentimiento explícito</strong> para recibir mensajes de tu negocio por WhatsApp.</p>
              <p>El consentimiento debe ser:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li><strong>Explícito</strong>: el usuario tomó una acción afirmativa (checkbox, formulario, mensaje pidiéndolo)</li>
                <li><strong>Informado</strong>: el usuario sabe quién le va a escribir y para qué</li>
                <li><strong>Granular</strong>: marketing es distinto a transaccional. Cada uno requiere su propio opt-in si quieres mandar ambos tipos</li>
                <li><strong>Documentado</strong>: debes poder probarlo si Meta o {brandName} te lo solicitan</li>
              </ul>
              <p className="mt-3"><strong>Métodos válidos de opt-in:</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Formulario en sitio web/landing con checkbox no pre-marcado</li>
                <li>Mensaje del usuario al WhatsApp del negocio pidiendo info (eso es opt-in implícito)</li>
                <li>Cliente firma documento físico aceptando recibir comunicación por WhatsApp</li>
                <li>Cliente da su número durante visita presencial y acepta verbalmente (debes registrarlo)</li>
              </ul>
              <p className="mt-3"><strong>NO son opt-in válidos:</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Comprar listas de contactos</li>
                <li>Scrapear números de directorios públicos</li>
                <li>Asumir consentimiento porque el cliente compró antes</li>
                <li>Importar contactos del directorio del celular del operador</li>
              </ul>
            </>
          )
        },
        {
          id: 'opt-out',
          title: '3. Respeto al opt-out (baja)',
          body: (
            <>
              <p>{brandName} detecta automáticamente cuando un Usuario Final envía palabras como BAJA, STOP, ALTO, UNSUBSCRIBE, CANCEL, ELIMINAR, etc., y registra el opt-out automáticamente. Una vez registrado:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>{brandName} bloquea cualquier envío saliente a ese número (templates Y mensajes manuales del operador)</li>
                <li>El bloqueo es permanente hasta que el Usuario Final solicite explícitamente volver</li>
              </ul>
              <p className="mt-3"><strong>NO puedes:</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Re-activar a un usuario que pidió baja sin que él te lo haya pedido directamente</li>
                <li>Usar otra cuenta de WhatsApp para evadir la baja</li>
                <li>Importar listas que contengan números previamente opted-out</li>
              </ul>
            </>
          )
        },
        {
          id: 'industrias-prohibidas',
          title: '4. Industrias y actividades prohibidas',
          body: (
            <>
              <p>NO puedes usar {brandName} si tu negocio se dedica a (o si tus mensajes promueven):</p>

              <p className="mt-3 font-bold">Contenido adulto y sexual</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Pornografía, escorts, contenido sexual explícito</li>
                <li>Servicios de citas adultas</li>
                <li>Productos sexuales no aprobados por Meta</li>
              </ul>

              <p className="mt-3 font-bold">Sustancias controladas</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Drogas ilegales o sustancias controladas</li>
                <li>Tabaco y productos relacionados (sujeto a regulación por país)</li>
                <li>Alcohol sin licencia para venta</li>
                <li>Productos farmacéuticos prescritos sin receta válida</li>
                <li>Suplementos no aprobados por COFEPRIS u organismo regulatorio</li>
              </ul>

              <p className="mt-3 font-bold">Armas y materiales peligrosos</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Armas de fuego, municiones, explosivos</li>
                <li>Armas blancas para uso ofensivo</li>
                <li>Materiales químicos peligrosos</li>
              </ul>

              <p className="mt-3 font-bold">Apuestas y casinos</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Casinos online sin licencia mexicana válida</li>
                <li>Apuestas deportivas sin licencia</li>
                <li>Loterías ilegales</li>
              </ul>

              <p className="mt-3 font-bold">Servicios financieros sin licencia</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Préstamos sin autorización CNBV/SHCP</li>
                <li>Inversiones, criptomonedas, forex sin licencia</li>
                <li>Esquemas piramidales o multinivel engañoso</li>
              </ul>

              <p className="mt-3 font-bold">Servicios de salud sin licencia</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Diagnóstico o tratamiento médico por personal no licenciado</li>
                <li>Productos médicos sin aprobación COFEPRIS</li>
                <li>"Cura milagro", terapias alternativas con claims médicos falsos</li>
              </ul>

              <p className="mt-3 font-bold">Productos falsificados o piratería</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Réplicas de marcas registradas</li>
                <li>Software pirata, contenido con derechos de autor sin licencia</li>
              </ul>

              <p className="mt-3 font-bold">Política y temas sensibles</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Campañas políticas sin registro ante INE/IFE</li>
                <li>Recolección de votos o promoción partidista en periodo electoral sin permisos</li>
              </ul>
            </>
          )
        },
        {
          id: 'spam-abuso',
          title: '5. Prohibición de spam y abuso',
          body: (
            <>
              <p>NO puedes:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Enviar mensajes masivos no solicitados (cold outreach)</li>
                <li>Importar números obtenidos de fuentes no consentidas</li>
                <li>Enviar el mismo mensaje a múltiples usuarios cuando no es información transaccional legítima</li>
                <li>Hacer phishing, suplantación de identidad, fraude</li>
                <li>Engañar a usuarios sobre quién les escribe</li>
                <li>Promocionar esquemas Get Rich Quick, MLM engañoso</li>
                <li>Acosar, intimidar, o discriminar a usuarios</li>
              </ul>
            </>
          )
        },
        {
          id: 'contenido-prohibido',
          title: '6. Contenido prohibido',
          body: (
            <>
              <p>Los mensajes enviados a través de {brandName} NO pueden contener:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Contenido sexual explícito</li>
                <li>Violencia gráfica o amenazas</li>
                <li>Discurso de odio, racismo, discriminación</li>
                <li>Información falsa intencional (desinformación)</li>
                <li>Material que viole derechos de autor</li>
                <li>Datos personales de terceros sin su consentimiento</li>
                <li>Información confidencial obtenida ilegalmente</li>
              </ul>
            </>
          )
        },
        {
          id: 'tecnico',
          title: '7. Uso indebido técnico',
          body: (
            <>
              <p>NO puedes:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Hacer reverse-engineering, decompile, ni intentar extraer código fuente del Servicio</li>
                <li>Hacer scraping, crawling, o queries masivas a nuestras APIs sin autorización</li>
                <li>Compartir tus credenciales de {brandName} con terceros</li>
                <li>Intentar acceder a datos de otros clientes</li>
                <li>Sobrecargar el Servicio con tráfico no legítimo</li>
                <li>Usar el Servicio para entrenar modelos de IA competidores</li>
                <li>Rotar números, cuentas, o WABA IDs para evadir suspensiones</li>
              </ul>
            </>
          )
        },
        {
          id: 'calidad',
          title: '8. Mantenimiento de calidad del número',
          body: (
            <>
              <p>El Quality Rating de tu número de WhatsApp es responsabilidad tuya. Para mantenerlo en GREEN:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Responde rápido a tus Usuarios Finales (idealmente &lt;15 min)</li>
                <li>NO envíes mensajes que el usuario no pidió</li>
                <li>NO satures con muchos mensajes en poco tiempo</li>
                <li>Mantén tu nombre y foto de perfil profesionales</li>
                <li>Si tu calidad baja a YELLOW, baja el ritmo de envíos hasta recuperarte</li>
                <li>Si baja a RED, suspende envíos por 72hrs y revisa qué estás haciendo mal</li>
              </ul>
              <p className="mt-3">Si tu número es suspendido por Meta debido a baja calidad, no es responsabilidad de {brandName}. Podemos ayudarte a apelar pero la decisión final es de Meta.</p>
            </>
          )
        },
        {
          id: 'consecuencias',
          title: '9. Consecuencias del incumplimiento',
          body: (
            <>
              <p>Si {brandName} detecta violación a esta política, podemos:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li><strong>Advertencia escrita</strong>: para violaciones menores</li>
                <li><strong>Suspensión temporal</strong>: 24-72hrs sin acceso al Servicio</li>
                <li><strong>Terminación de cuenta</strong>: sin reembolso por periodos pagados</li>
                <li><strong>Reporte a Meta</strong>: en casos graves estamos obligados a notificar a Meta</li>
                <li><strong>Reporte a autoridades</strong>: si la actividad es ilegal</li>
              </ul>
              <p className="mt-3">Las decisiones de {brandName} son finales pero puedes apelar escribiendo a <a href={`mailto:${legal_email}`} className="text-lime-700 font-bold hover:underline">{legal_email}</a>.</p>
            </>
          )
        },
        {
          id: 'reportar',
          title: '10. Reportar abuso',
          body: (
            <>
              <p>Si detectas un cliente de {brandName} violando esta política, repórtalo a:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Email: <a href={`mailto:${abuse_email}`} className="text-lime-700 font-bold hover:underline">{abuse_email}</a></li>
                {whatsapp_number && (
                  <li>WhatsApp: <a href={`https://wa.me/${whatsapp_number}`} target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">{formatWhatsApp(whatsapp_number)}</a></li>
                )}
              </ul>
              <p className="mt-3">Investigamos cada reporte en menos de 48 horas hábiles. Tu identidad permanece confidencial.</p>
            </>
          )
        }
      ]}
    />
  )
}