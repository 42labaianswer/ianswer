 

// ============================================================================
// src/app/(public)/recursos/ayuda/conectar-whatsapp/page.tsx
// Guía pública paso a paso de cómo conectar WhatsApp Business a la plataforma.
// ============================================================================

import Link from 'next/link'
import { Metadata } from 'next'
import { CheckCircle2, AlertTriangle, Clock, ArrowRight, ExternalLink, Info, FileText } from 'lucide-react'
import PublicNavbar from '../../../../../components/public/PublicNavbar'
import PublicFooter from '../../../../../components/public/PublicFooter'
import { loadPlatformBranding } from '../../../../../lib/siteSettings' 
 const branding = await loadPlatformBranding()
  const brandName = branding.name || 'Plataforma' 

export const metadata: Metadata = {
  title: 'Conectar WhatsApp Business · Guía paso a paso',
  description: 'Aprende cómo conectar tu número de WhatsApp Business en 20 minutos. Requisitos, verificación de Meta, embedded signup y solución de problemas.'
}

export default function ConectarWhatsAppPage() {
  return (
    <div className="bg-[#FAFAF7] min-h-screen">
      <PublicNavbar />

      <article className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-20">

        <header className="mb-12">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-600 mb-3">
            Guía · 8 min de lectura
          </p>
          <h1 className="text-3xl md:text-5xl font-black text-slate-950 leading-[1.05] tracking-tight mb-4">
            Cómo conectar WhatsApp Business a  {brandName}
          </h1>
          <p className="text-lg text-slate-600 font-medium leading-relaxed">
            En menos de 20 minutos activos + 2-7 días hábiles de verificación de Meta, tendrás
            tu bot de WhatsApp respondiendo a tus clientes 24/7.
          </p>
        </header>

        <nav className="bg-white border border-slate-200 rounded-2xl p-5 mb-12">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Contenido</p>
          <ol className="space-y-1.5 text-sm font-medium text-slate-700">
            <li><a href="#requisitos" className="hover:text-slate-950">1. Requisitos previos</a></li>
            <li><a href="#paso-1" className="hover:text-slate-950">2. Crear cuenta de Facebook Business Manager</a></li>
            <li><a href="#paso-2" className="hover:text-slate-950">3. Conectar tu WhatsApp Business desde  {brandName}</a></li>
            <li><a href="#paso-3" className="hover:text-slate-950">4. Verificar tu negocio en Meta</a></li>
            <li><a href="#paso-4" className="hover:text-slate-950">5. Mientras esperas la aprobación</a></li>
            <li><a href="#paso-5" className="hover:text-slate-950">6. Activar tu número en producción</a></li>
            <li><a href="#problemas" className="hover:text-slate-950">7. Solución de problemas comunes</a></li>
          </ol>
        </nav>

        <Section id="requisitos" title="1. Requisitos previos">
          <p className="mb-5">Antes de conectar WhatsApp Business a  {brandName}, necesitas tener listo:</p>
          <ChecklistItem>Una <strong>cuenta de Facebook</strong> personal (puedes usar la que ya tengas)</ChecklistItem>
          <ChecklistItem>
            Un <strong>número de teléfono dedicado al bot</strong>: debe ser un número que NO tenga WhatsApp
            normal ni WhatsApp Business app instalada. Si lo tienes en otro celular, debes desinstalar
            WhatsApp de ese teléfono antes de continuar.
            <CalloutTip>
              Recomendamos contratar una línea M2M de Telcel/AT&T/Movistar (~$100 MXN/mes) dedicada
              exclusivamente al bot.
            </CalloutTip>
          </ChecklistItem>
          <ChecklistItem>
            <strong>Documentos legales</strong> para la verificación de negocio en Meta:
            <ul className="ml-5 mt-2 list-disc text-sm text-slate-600 space-y-1">
              <li>Si eres persona moral: acta constitutiva + RFC + INE del representante legal</li>
              <li>Si eres persona física con actividad empresarial: cédula RFC + INE + comprobante de domicilio</li>
            </ul>
          </ChecklistItem>
          <ChecklistItem>
            <strong>Comprobante de domicilio</strong> a nombre del negocio o representante legal (no mayor a 3 meses)
          </ChecklistItem>
        </Section>

        <Section id="paso-1" title="2. Crear cuenta de Facebook Business Manager">
          <p className="mb-5">
            Business Manager es la herramienta gratuita de Meta donde se administran cuentas de negocio.
          </p>
          <Step number={1}>
            Ve a <ExternalLinkText href="https://business.facebook.com/">business.facebook.com</ExternalLinkText> y
            haz click en <strong>"Crear cuenta"</strong>.
          </Step>
          <Step number={2}>
            Llena los datos del negocio:
            <ul className="ml-5 mt-2 list-disc text-sm text-slate-600 space-y-1">
              <li><strong>Nombre del negocio</strong>: el nombre legal exacto (debe coincidir con tu RFC)</li>
              <li><strong>Tu nombre</strong>: como aparece en tu INE</li>
              <li><strong>Email del negocio</strong>: idealmente uno de tu dominio</li>
            </ul>
          </Step>
          <Step number={3}>Confirma el email que te llega y entra a tu nuevo Business Manager.</Step>
        </Section>

        <Section id="paso-2" title="3. Conectar tu WhatsApp Business desde  {brandName}">
          <p className="mb-5">Esta es la parte más rápida: te tomará 10 minutos.</p>
          <Step number={1}>
            Entra a tu dashboard de  {brandName} y ve a <Link href="/dashboard/whatsapp" className="text-lime-700 font-bold hover:underline">WhatsApp Business</Link>.
          </Step>
          <Step number={2}>
            Haz click en el botón verde <strong>"Conectar con Facebook"</strong>. Se abrirá un popup oficial de Meta.
          </Step>
          <Step number={3}>Inicia sesión con tu cuenta de Facebook conectada a tu Business Manager.</Step>
          <Step number={4}>Selecciona el <strong>Business Manager</strong> que creaste.</Step>
          <Step number={5}>
            Selecciona o crea tu <strong>WhatsApp Business Account (WABA)</strong>. Si nunca has tenido uno, Meta
            te guía para crearlo en el mismo flujo.
          </Step>
          <Step number={6}>
            Agrega tu <strong>número de teléfono</strong>. Meta te enviará un código por SMS o llamada.
          </Step>
          <Step number={7}>
            Acepta los <strong>términos de WhatsApp Business Platform</strong> y cierra el popup.
          </Step>

          <CalloutInfo>
            En este punto, tu bot ya puede enviar mensajes a hasta 5 números registrados en tu Business
            Manager (familia, equipo) para que pruebes. Para atender a clientes reales, sigue al paso 4.
          </CalloutInfo>
        </Section>

        <Section id="paso-3" title="4. Verificar tu negocio en Meta">
          <p className="mb-5">
            Para que tu bot atienda a clientes reales, Meta exige verificar que tu negocio es real.
            El proceso de revisión documental tarda <strong>entre 2 y 7 días hábiles</strong>.
          </p>
          <Step number={1}>
            En business.facebook.com, ve a <strong>Configuración del negocio → Centro de seguridad</strong>.
          </Step>
          <Step number={2}>Haz click en <strong>"Iniciar verificación del negocio"</strong>.</Step>
          <Step number={3}>
            Llena la información legal:
            <ul className="ml-5 mt-2 list-disc text-sm text-slate-600 space-y-1">
              <li><strong>Nombre legal del negocio</strong>: exactamente como aparece en tu RFC</li>
              <li><strong>Dirección registrada</strong>: la del comprobante de domicilio</li>
              <li><strong>Sitio web</strong>: el dominio público de tu negocio</li>
              <li><strong>Teléfono de contacto</strong>: alternativo, no el del bot</li>
            </ul>
          </Step>
          <Step number={4}>
            Sube los documentos (JPG, PNG o PDF):
            <ul className="ml-5 mt-2 list-disc text-sm text-slate-600 space-y-1">
              <li>RFC (cédula del SAT)</li>
              <li>Acta constitutiva o INE</li>
              <li>Comprobante de domicilio reciente</li>
            </ul>
          </Step>
          <Step number={5}>
            Envía la solicitud. Recibirás un email cuando aprueben (2-7 días hábiles, a veces más).
          </Step>
          <CalloutWarning>
            <strong>Si Meta te rechaza la primera vez</strong>, no te preocupes. Es muy común. En el mismo email
            te dicen qué corregir. La segunda revisión suele ser más rápida.
          </CalloutWarning>
        </Section>

        <Section id="paso-4" title="5. Mientras esperas la aprobación">
          <p className="mb-5">No pierdas el tiempo de espera. Mientras Meta verifica, configura tu bot:</p>
          <ChecklistItem><strong>Carga tu menú/propiedades/agenda</strong> según tu negocio</ChecklistItem>
          <ChecklistItem>
            <strong>Configura el system prompt del agente IA</strong>: dale personalidad, tono, instrucciones específicas
          </ChecklistItem>
          <ChecklistItem>
            <strong>Invita a tu equipo</strong> al Inbox para que vean los mensajes en tiempo real
          </ChecklistItem>
          <ChecklistItem>
            <strong>Prueba el bot</strong> mandándole mensajes desde los 5 números de prueba registrados
          </ChecklistItem>
          <ChecklistItem>
            <strong>Prepara plantillas</strong>: recordatorios de cita, confirmaciones. Cada plantilla
            debe ser aprobada por Meta (24-48hrs)
          </ChecklistItem>
        </Section>

        <Section id="paso-5" title="6. Activar tu número en producción">
          <p className="mb-5">Cuando recibas el email de aprobación de Meta:</p>
          <Step number={1}>
            Ve a tu dashboard de  {brandName} → WhatsApp Business. El estado cambiará de <strong>"Esperando verificación"</strong> a <strong>"Activo · 24/7"</strong>.
          </Step>
          <Step number={2}>
            <strong>Empieza con un volumen bajo</strong> (50-100 conversaciones el primer día). Meta evalúa la calidad.
          </Step>
          <Step number={3}>
            <strong>Monitorea la "Calidad" en el dashboard</strong>. Si baja a YELLOW o RED, corrige antes de que Meta suspenda.
          </Step>
          <Step number={4}>
            Tras días con buena calidad, Meta sube tu tier: 250 → 1,000 → 10,000 → ilimitado.
          </Step>
        </Section>

        <Section id="problemas" title="7. Solución de problemas comunes">
          <Problem
            title="Meta rechazó la verificación de mi negocio"
            solution="Lee el motivo en el email. Lo más común: nombre del negocio no coincide con RFC, comprobante muy viejo, o documentos borrosos. Corrige y vuelve a enviar."
          />
          <Problem
            title="El número que quiero usar ya tiene WhatsApp"
            solution="Tienes que desinstalar WhatsApp de ese número antes de conectarlo a la API. Vas a perder los chats — respaldarlos primero. O usa un número nuevo dedicado."
          />
          <Problem
            title="No me llega el SMS de verificación de Meta"
            solution="Pide la verificación por llamada en vez de SMS. Si tampoco llega, verifica que el número pueda recibir llamadas internacionales."
          />
          <Problem
            title="Mi bot dejó de responder de la nada"
            solution="Revisa la calidad del número en el dashboard. Si está en RED, Meta lo restringió. Espera 24-48hrs sin enviar mensajes y mejora calidad."
          />
          <Problem
            title="No puedo enviar mensajes después de 24hr"
            solution="Política de Meta: solo puedes responder a usuarios que escribieron en últimas 24hr. Para iniciar conversación después, usa una plantilla aprobada por Meta."
          />
        </Section>

        <div className="bg-slate-950 text-white rounded-3xl p-8 md:p-12 mt-16">
          <h3 className="text-2xl md:text-3xl font-black mb-3 tracking-tight">
            ¿Quieres que lo hagamos contigo?
          </h3>
          <p className="text-slate-300 font-medium mb-6">
            Si es tu primera vez, agenda una llamada gratuita de 30 minutos y conectamos
            tu WhatsApp juntos paso a paso.
          </p>
          <a
            href="https://wa.me/529997012393?text=Hola,%20quiero%20agendar%20llamada%20para%20conectar%20WhatsApp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3.5 bg-lime-400 hover:bg-lime-300 text-slate-950 rounded-2xl font-black text-sm transition-colors"
          >
            Agendar llamada gratuita
            <ArrowRight size={16} />
          </a>
        </div>

      </article>

      <PublicFooter />
    </div>
  )
}

function Section({ id, title, children }: any) {
  return (
    <section id={id} className="mb-14 scroll-mt-20">
      <h2 className="text-2xl md:text-3xl font-black text-slate-950 mb-5 tracking-tight">
        {title}
      </h2>
      <div className="prose-slate text-slate-700 font-medium leading-relaxed">
        {children}
      </div>
    </section>
  )
}

function Step({ number, children }: any) {
  return (
    <div className="flex gap-4 mb-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-slate-950 text-white flex items-center justify-center font-black text-sm">
        {number}
      </div>
      <div className="flex-1 text-slate-700 font-medium leading-relaxed pt-1">{children}</div>
    </div>
  )
}

function ChecklistItem({ children }: any) {
  return (
    <div className="flex gap-3 mb-3">
      <CheckCircle2 size={18} className="text-lime-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-slate-700 font-medium leading-relaxed">{children}</div>
    </div>
  )
}

function ExternalLinkText({ href, children }: any) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-lime-700 font-bold hover:underline inline-flex items-center gap-0.5">
      {children}
      <ExternalLink size={12} />
    </a>
  )
}

function CalloutTip({ children }: any) {
  return (
    <div className="mt-3 bg-lime-50 border border-lime-200 rounded-xl p-3 flex gap-2.5">
      <Info size={16} className="text-lime-700 shrink-0 mt-0.5" />
      <p className="text-sm text-slate-700 font-medium m-0">{children}</p>
    </div>
  )
}

function CalloutInfo({ children }: any) {
  return (
    <div className="mt-5 bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3">
      <Info size={18} className="text-blue-700 shrink-0 mt-0.5" />
      <p className="text-sm text-slate-700 font-medium m-0">{children}</p>
    </div>
  )
}

function CalloutWarning({ children }: any) {
  return (
    <div className="mt-5 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
      <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
      <p className="text-sm text-slate-700 font-medium m-0">{children}</p>
    </div>
  )
}

function Problem({ title, solution }: any) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-3">
      <h4 className="font-black text-slate-950 mb-1.5 text-sm">{title}</h4>
      <p className="text-sm text-slate-600 font-medium m-0">{solution}</p>
    </div>
  )
}
