 

import { Metadata } from 'next'
import LegalPage from '../../../../components/public/LegalPage'
import { loadLegalConfig, formatWhatsApp } from '../../../../lib/legalConfig'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await loadLegalConfig()
  return {
    title: `Aviso de privacidad · ${brandName}`,
    description: `Cómo recopilamos, usamos y protegemos los datos personales tuyos y de los usuarios finales de tu WhatsApp Business.`
  }
}

export default async function PrivacidadPage() {
  const { brandName, legalSettings } = await loadLegalConfig()

  const {
    legal_name = 'Gustavo Monforte, persona física con actividad empresarial',
    website_url = 'https://tusitio.com',
    support_email = 'soporte@midominio.com',
    dpo_email = support_email,
    data_collected = 'Nombre, correo electrónico y foto de perfil vía Meta/Google.',
    data_purpose = 'Crear tu perfil de usuario y habilitar las automatizaciones.',
    third_party_services = 'Proveedores de infraestructura en la nube y servicios de IA.',
    payment_processor = 'proveedores de pago seguros',
    deletion_instructions = 'Envía un correo a nuestro equipo de soporte para solicitar la eliminación permanente de tus datos.',
    minimum_age = '18',
    contact_address = 'Mérida, Yucatán, México',
    whatsapp_number = '',
  } = legalSettings

  const currentDate = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <LegalPage
      title="Aviso de privacidad"
      description="Conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (México)."
      effectiveDate="1 de enero de 2026"
      sections={[
        {
          id: 'identidad',
          title: '1. Identidad del responsable',
          body: (
            <>
              <p>El responsable del tratamiento de tus datos personales es:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li><strong>Nombre/razón social</strong>: {legal_name}</li>
                <li><strong>Marca comercial</strong>: {brandName}</li>
                <li><strong>Domicilio</strong>: {contact_address}</li>
                <li><strong>Email</strong>: <a href={`mailto:${dpo_email}`} className="text-lime-700 font-bold hover:underline">{dpo_email}</a> (oficial de protección de datos)</li>
                <li><strong>Sitio web</strong>: <a href={website_url} className="text-lime-700 font-bold hover:underline">{website_url}</a></li>
              </ul>
              <p className="mt-3">Este Aviso de Privacidad aplica a todos los datos personales que recopilamos a través del sitio web {brandName}, el dashboard del producto, las APIs, y cualquier servicio relacionado.</p>
            </>
          )
        },
        {
          id: 'roles',
          title: '2. Distinción de roles',
          body: (
            <>
              <p>Distinguimos dos roles distintos en el tratamiento de datos:</p>

              <p className="mt-3"><strong>2.1 {brandName} como Responsable</strong></p>
              <p>Cuando se trata de datos de nuestros <strong>clientes directos</strong> (las empresas que contratan {brandName}), nosotros somos el <strong>responsable</strong>. Esos datos incluyen: nombre del titular de la cuenta, email, datos de facturación, configuración del producto.</p>

              <p className="mt-3"><strong>2.2 {brandName} como Encargado</strong></p>
              <p>Cuando se trata de datos de los <strong>Usuarios Finales</strong> de nuestros clientes (los pacientes, clientes, prospectos que escriben al WhatsApp del negocio), {brandName} actúa como <strong>encargado del tratamiento</strong>. El responsable de esos datos es nuestro cliente (la empresa que opera el WhatsApp), no {brandName}.</p>
              <p className="mt-3">Esto significa que nuestros clientes son quienes deben tener su propio Aviso de Privacidad mostrando a sus Usuarios Finales cómo usan sus datos. {brandName} solamente procesa esos datos siguiendo las instrucciones del cliente.</p>
            </>
          )
        },
        {
          id: 'datos-recopilados',
          title: '3. Datos personales que recopilamos',
          body: (
            <>
              <p><strong>3.1 Datos de cliente (responsabilidad {brandName})</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Nombre completo del titular de la cuenta</li>
                <li>Correo electrónico</li>
                <li>Contraseña (almacenada con hash bcrypt, nunca en texto plano)</li>
                <li>Nombre del negocio</li>
                <li>Información de contacto (teléfono, dirección si la proporcionas)</li>
                <li>Datos de facturación (RFC, dirección fiscal, método de pago último 4 dígitos vía Stripe)</li>
                <li>Logs de uso del producto (cuándo accedes, qué páginas visitas)</li>
                <li>Dirección IP, agente de usuario, datos técnicos del dispositivo</li>
              </ul>

              <p className="mt-3"><strong>3.2 Datos de Usuarios Finales (responsabilidad del cliente, {brandName} es encargado)</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Número de teléfono de WhatsApp del Usuario Final</li>
                <li>Nombre del Usuario Final (si lo proporciona o aparece en WhatsApp)</li>
                <li>Mensajes enviados y recibidos (texto, imágenes, audio, video, documentos, ubicaciones)</li>
                <li>Metadatos de los mensajes: timestamps, message_id de Meta, status de entrega</li>
                <li>Interacciones con el agente IA</li>
                <li>Datos contextuales que el cliente decida guardar (citas, órdenes, propiedades vistas, etc.)</li>
                <li>Estado de opt-in/opt-out</li>
              </ul>

              <p className="mt-3"><strong>3.3 Datos sensibles</strong></p>
              <p>{brandName} NO solicita ni procesa intencionalmente datos sensibles (origen racial, opinión política, estado de salud, vida sexual). Si nuestros clientes en industrias como salud (consultorios médicos) llegan a procesar este tipo de datos a través de {brandName}, son ellos los responsables de cumplir con la regulación aplicable (NOM-024 SSA3 para historia clínica, COFEPRIS, etc.).</p>
            </>
          )
        },
        {
          id: 'finalidades',
          title: '4. Finalidades del tratamiento',
          body: (
            <>
              <p><strong>4.1 Finalidades primarias (necesarias para prestar el servicio)</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Crear y gestionar tu cuenta</li>
                <li>Procesar pagos vía Stripe</li>
                <li>Enviar y recibir mensajes vía WhatsApp Business Platform</li>
                <li>Operar el agente IA conversacional</li>
                <li>Guardar configuración del producto (menú, propiedades, agenda, etc.)</li>
                <li>Brindar soporte técnico</li>
                <li>Detectar y prevenir fraude/abuso</li>
                <li>Cumplir con requerimientos legales</li>
              </ul>

              <p className="mt-3"><strong>4.2 Finalidades secundarias (puedes oponerte sin afectar el servicio)</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Enviarte comunicaciones de marketing sobre nuevas funciones</li>
                <li>Solicitarte feedback o testimonios</li>
                <li>Análisis estadísticos agregados (anónimos)</li>
                <li>Mejorar el producto con datos agregados</li>
              </ul>
              <p className="mt-3">Para oponerte a las finalidades secundarias, escríbenos a <a href={`mailto:${dpo_email}`} className="text-lime-700 font-bold hover:underline">{dpo_email}</a> con el asunto "OPT-OUT MARKETING".</p>
            </>
          )
        },
        {
          id: 'sub-encargados',
          title: '5. Transferencias y sub-encargados',
          body: (
            <>
              <p>Para prestar el servicio, compartimos tus datos con los siguientes proveedores:</p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm border border-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200">Proveedor</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200">Servicio</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200">Ubicación</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200">Datos compartidos</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 font-bold">Supabase</td>
                      <td className="px-3 py-2">Base de datos + auth + storage</td>
                      <td className="px-3 py-2">EU (Frankfurt)</td>
                      <td className="px-3 py-2 text-xs">Todos los datos</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 font-bold">Meta Platforms (WhatsApp)</td>
                      <td className="px-3 py-2">Mensajería WhatsApp Business Platform</td>
                      <td className="px-3 py-2">USA + Irlanda</td>
                      <td className="px-3 py-2 text-xs">Mensajes y metadatos</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 font-bold">Stripe</td>
                      <td className="px-3 py-2">Procesamiento de pagos</td>
                      <td className="px-3 py-2">USA</td>
                      <td className="px-3 py-2 text-xs">Email, nombre, datos de pago (PCI-DSS)</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 font-bold">DeepSeek (o Anthropic/OpenAI según config)</td>
                      <td className="px-3 py-2">Procesamiento de IA conversacional</td>
                      <td className="px-3 py-2">USA</td>
                      <td className="px-3 py-2 text-xs">Texto del mensaje del usuario (sin teléfono)</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 font-bold">Google Cloud (Gemini)</td>
                      <td className="px-3 py-2">Transcripción de audio + análisis de imagen</td>
                      <td className="px-3 py-2">USA</td>
                      <td className="px-3 py-2 text-xs">Audios e imágenes (no se reentrenan modelos)</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 font-bold">Google Calendar API</td>
                      <td className="px-3 py-2">Gestión de citas (opcional, sólo Salud)</td>
                      <td className="px-3 py-2">USA</td>
                      <td className="px-3 py-2 text-xs">Eventos, horarios</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 font-bold">n8n.io (self-hosted)</td>
                      <td className="px-3 py-2">Orquestación de workflows automation</td>
                      <td className="px-3 py-2">VPS Hostinger (USA o EU)</td>
                      <td className="px-3 py-2 text-xs">Procesa mensajes en tránsito (no persiste)</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 font-bold">Hostinger</td>
                      <td className="px-3 py-2">Hosting VPS</td>
                      <td className="px-3 py-2">USA/EU</td>
                      <td className="px-3 py-2 text-xs">Logs técnicos de servidor</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 font-bold">Vercel (o similar)</td>
                      <td className="px-3 py-2">Hosting de frontend</td>
                      <td className="px-3 py-2">USA + edge global</td>
                      <td className="px-3 py-2 text-xs">Logs de acceso al dashboard</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="mt-4">Todos nuestros proveedores cumplen con estándares internacionales de seguridad (SOC 2, ISO 27001, GDPR, PCI-DSS según aplique).</p>
              <p className="mt-3">Para transferencias internacionales fuera de México, nos basamos en las cláusulas estándar de los proveedores. Puedes solicitar copia de los acuerdos de procesamiento a <a href={`mailto:${dpo_email}`} className="text-lime-700 font-bold hover:underline">{dpo_email}</a>.</p>

              <p className="mt-3"><strong>NO compartimos tus datos con:</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Anunciantes (no hacemos publicidad con tus datos)</li>
                <li>Brokers de datos</li>
                <li>Redes sociales para perfilamiento</li>
                <li>Terceros con fines comerciales no relacionados con el servicio</li>
              </ul>
            </>
          )
        },
        {
          id: 'whatsapp-especifico',
          title: '6. Datos específicos de WhatsApp Business Platform',
          body: (
            <>
              <p>Cuando nuestros clientes conectan su WhatsApp Business a {brandName} via Embedded Signup:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Meta nos provee un <strong>System User Access Token</strong> que nos da permiso para enviar/recibir mensajes a nombre del cliente. Este token se guarda encriptado en nuestra base de datos</li>
                <li>Meta nos comparte el <strong>Phone Number ID</strong> y el <strong>WhatsApp Business Account ID (WABA ID)</strong> del cliente</li>
                <li>Meta nos envía webhooks con: mensajes entrantes, estado de entrega, cambios de calidad, status de templates</li>
              </ul>
              <p className="mt-3"><strong>{brandName} NO accede a:</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Tu lista de contactos de WhatsApp</li>
                <li>Tus chats personales o de otros números no conectados a {brandName}</li>
                <li>Tu información de perfil de Facebook que no sea estrictamente necesaria para Embedded Signup</li>
                <li>Mensajes enviados o recibidos antes de conectar {brandName}</li>
              </ul>
              <p className="mt-3">Puedes revocar el acceso de {brandName} a tu WhatsApp Business en cualquier momento desde:</p>
              <ol className="list-decimal ml-5 space-y-1 mt-1">
                <li>business.facebook.com → Configuración del negocio → Integraciones → {brandName} → Eliminar</li>
                <li>O desde el dashboard de {brandName}: /dashboard/whatsapp → Desconectar</li>
              </ol>
              <p className="mt-3">Al revocar el acceso, dejamos de procesar mensajes nuevos. Los mensajes históricos quedan en tu cuenta de {brandName} hasta que decidas eliminarlos o canceles la cuenta.</p>
            </>
          )
        },
        {
          id: 'derechos',
          title: '7. Tus derechos ARCO',
          body: (
            <>
              <p>Conforme a la LFPDPPP tienes derecho a:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li><strong>Acceso</strong>: solicitar copia de los datos personales que tenemos sobre ti</li>
                <li><strong>Rectificación</strong>: corregir datos incorrectos o desactualizados</li>
                <li><strong>Cancelación</strong>: solicitar la eliminación de tus datos (sujeto a obligaciones legales de conservación)</li>
                <li><strong>Oposición</strong>: oponerte al tratamiento para finalidades secundarias</li>
                <li><strong>Revocar consentimiento</strong>: retirar tu consentimiento en cualquier momento</li>
                <li><strong>Portabilidad</strong>: exportar tus datos en formato estructurado (JSON o CSV)</li>
                <li><strong>Limitar el uso</strong>: pedirnos que solo conservemos pero no procesemos ciertos datos</li>
              </ul>
              <p className="mt-3"><strong>Cómo ejercerlos:</strong></p>
              <p>Tienes dos opciones:</p>
              <ol className="list-decimal ml-5 space-y-1.5 mt-2">
                <li>
                  <strong>Formulario público</strong>: usa nuestro <a href="/legal/eliminar-datos" className="text-lime-700 font-bold hover:underline">formulario de eliminación de datos</a> para
                  solicitar el borrado completo de tu información de manera autoservicio.
                </li>
                <li>
                  <strong>Email directo</strong>: escríbenos a <a href={`mailto:${dpo_email}`} className="text-lime-700 font-bold hover:underline">{dpo_email}</a> con:
                  <ol className="list-decimal ml-5 space-y-1 mt-1">
                    <li>Tu nombre completo y email registrado</li>
                    <li>El derecho que quieres ejercer</li>
                    <li>Descripción específica del dato o solicitud</li>
                    <li>Identificación oficial (para verificar tu identidad)</li>
                  </ol>
                </li>
              </ol>
              <p className="mt-3">Responderemos en máximo <strong>20 días hábiles</strong>. Si tu solicitud es procedente, ejecutamos en máximo 15 días hábiles adicionales.</p>
              <p className="mt-3">Si no estás conforme con nuestra respuesta, puedes acudir al <a href="https://home.inai.org.mx/" target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">INAI (Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales)</a>.</p>
            </>
          )
        },
        {
          id: 'retencion',
          title: '8. Periodos de retención',
          body: (
            <>
              <p>Conservamos tus datos solo el tiempo necesario para los fines descritos:</p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm border border-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200">Tipo de dato</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-700 border-b border-slate-200">Periodo de retención</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2">Datos de la cuenta (mientras esté activa)</td>
                      <td className="px-3 py-2">Vida útil de la cuenta + 90 días post-cancelación</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2">Mensajes de WhatsApp</td>
                      <td className="px-3 py-2">12 meses por default (configurable)</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2">Datos de facturación</td>
                      <td className="px-3 py-2">5 años (obligación fiscal SAT)</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2">Logs de acceso técnico</td>
                      <td className="px-3 py-2">90 días</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2">Logs de auditoría</td>
                      <td className="px-3 py-2">2 años</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2">Backups encriptados</td>
                      <td className="px-3 py-2">30 días rotando</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">Contactos opted-out (lista de baja)</td>
                      <td className="px-3 py-2">Permanente (para no volver a contactarlos)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )
        },
        {
          id: 'seguridad',
          title: '9. Medidas de seguridad',
          body: (
            <>
              <p>Implementamos medidas técnicas y administrativas razonables para proteger tus datos:</p>

              <p className="mt-3"><strong>Técnicas:</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>HTTPS/TLS 1.3 en todas las comunicaciones</li>
                <li>Encriptación en reposo de la base de datos (Supabase AES-256)</li>
                <li>Hashing con bcrypt para contraseñas</li>
                <li>Encriptación específica para System User Access Tokens de WhatsApp</li>
                <li>Row-Level Security (RLS) en PostgreSQL — cada cliente solo accede a sus propios datos</li>
                <li>Backups encriptados automáticos cada 24hr</li>
                <li>Logs de auditoría con timestamp y user_id de quien accedió</li>
                <li>Monitoreo de intrusiones y alertas automáticas</li>
              </ul>

              <p className="mt-3"><strong>Administrativas:</strong></p>
              <ul className="list-disc ml-5 space-y-1.5 mt-1">
                <li>Acceso a datos limitado por principio de mínimo privilegio</li>
                <li>Autenticación de dos factores obligatoria para acceso administrativo</li>
                <li>Política de gestión de incidentes (notificación de brechas en 72hr)</li>
                <li>Capacitación del equipo en privacidad y seguridad</li>
              </ul>

              <p className="mt-3">Pese a todas las medidas, ningún sistema es 100% invulnerable. Si detectamos una brecha de seguridad que comprometa datos personales, te notificaremos a tu email registrado dentro de 72 horas conforme a buenas prácticas internacionales (GDPR Art. 33).</p>
            </>
          )
        },
        {
          id: 'cookies',
          title: '10. Cookies y tecnologías similares',
          body: (
            <>
              <p>Usamos cookies y tecnologías similares en el sitio web. El detalle completo está en nuestra <a href="/legal/cookies" className="text-lime-700 font-bold hover:underline">Política de Cookies</a>.</p>
              <p className="mt-3">En resumen:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li><strong>Cookies esenciales</strong>: para mantener tu sesión iniciada (no requieren consentimiento)</li>
                <li><strong>Cookies de analítica</strong>: para entender uso del sitio (Plausible Analytics — sin cookies de tracking ni datos personales identificables)</li>
              </ul>
              <p className="mt-3">NO usamos cookies de marketing/retargeting/publicidad.</p>
            </>
          )
        },
        {
          id: 'menores',
          title: '11. Menores de edad',
          body: (
            <>
              <p>{brandName} es un producto B2B. NO está dirigido a menores de 18 años.</p>
              <p>Si descubrimos que hemos recopilado datos de un menor sin autorización del titular de la patria potestad, los eliminaremos inmediatamente.</p>
              <p>Nuestros clientes son responsables de obtener consentimiento parental si sus Usuarios Finales son menores de edad (caso típico: consultorios pediátricos donde los padres son quienes interactúan vía WhatsApp).</p>
            </>
          )
        },
        {
          id: 'cambios',
          title: '12. Cambios al Aviso',
          body: (
            <>
              <p>Podemos actualizar este Aviso de Privacidad de tiempo en tiempo. Notificaremos cambios materiales por email a la dirección registrada de cada cliente al menos 30 días antes de que entren en vigor.</p>
              <p>Los cambios menores (correcciones, aclaraciones, nuevos sub-encargados) se publicarán directamente en esta página con la fecha de "Última actualización" cambiada.</p>
            </>
          )
        },
        {
          id: 'consentimiento',
          title: '13. Consentimiento',
          body: (
            <>
              <p>Al crear una cuenta en {brandName} o usar el servicio, otorgas tu consentimiento expreso al tratamiento de tus datos personales según lo descrito en este Aviso.</p>
              <p className="mt-3">Si no estás de acuerdo con alguna parte de este Aviso, NO uses {brandName}.</p>
              <p className="mt-3">Puedes revocar tu consentimiento en cualquier momento siguiendo el proceso descrito en la sección 7 (Tus derechos ARCO).</p>
            </>
          )
        },
        {
          id: 'contacto-dpo',
          title: '14. Contacto del oficial de protección de datos',
          body: (
            <>
              <p>Para cualquier consulta sobre privacidad o ejercicio de derechos:</p>
              <ul className="list-disc ml-5 space-y-1.5 mt-2">
                <li>Email: <a href={`mailto:${dpo_email}`} className="text-lime-700 font-bold hover:underline">{dpo_email}</a></li>
                {whatsapp_number && (
                  <li>WhatsApp: <a href={`https://wa.me/${whatsapp_number}`} target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline">{formatWhatsApp(whatsapp_number)}</a></li>
                )}
                <li>Domicilio: {contact_address}</li>
              </ul>
              <p className="mt-3">Tiempo de respuesta: máximo 5 días hábiles para consultas generales, 20 días hábiles para ejercicio de derechos ARCO.</p>
            </>
          )
        }
      ]}
    />
  )
}