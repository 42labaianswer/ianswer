 

import { Metadata } from 'next'
import Link from 'next/link'
import PublicNavbar from '../../../../components/public/PublicNavbar'
import PublicFooter from '../../../../components/public/PublicFooter'
import { loadLegalConfig } from '../../../../lib/legalConfig'
import { Receipt, Clock, CheckCircle2, AlertTriangle, FileText, Info, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await loadLegalConfig()
  return {
    title: `Política de Facturación · ${brandName}`,
    description: `Cómo solicitar tu factura electrónica (CFDI) de ${brandName}. Plazos, requisitos y proceso.`
  }
}

export default async function FacturacionPage() {
  const { brandName, legalSettings } = await loadLegalConfig()
  const billingEmail = legalSettings.billing_email || legalSettings.support_email || 'facturacion@midominio.com'
  const website = legalSettings.website_url || 'https://tusitio.com'

  return (
    <div className="bg-[#FAFAF7] min-h-screen">
      <PublicNavbar />

      <article className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-16">

        <header className="mb-12">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl">
              <Receipt size={24} className="text-blue-700" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700 mb-1">
                CFDI 4.0 · SAT México
              </p>
              <h1 className="text-3xl md:text-4xl font-black text-slate-950 leading-tight tracking-tight">
                Política de facturación
              </h1>
            </div>
          </div>
          <p className="text-slate-600 font-medium leading-relaxed mt-4">
            {brandName} emite Comprobantes Fiscales Digitales por Internet (CFDIs) en cumplimiento con
            las disposiciones del Servicio de Administración Tributaria (SAT) de México.
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-xl font-black text-slate-950 mb-4">Cómo solicitar tu factura</h2>
          <div className="space-y-3">
            <Step number={1}>
              <strong>Inicia sesión</strong> en tu cuenta de {brandName} y ve a{' '}
              <Link href="/dashboard/billing/datos-fiscales" className="text-lime-700 font-bold hover:underline">
                Billing → Datos Fiscales
              </Link>.
            </Step>
            <Step number={2}>
              Captura tus datos fiscales:
              <ul className="list-disc ml-5 mt-2 space-y-1 text-sm text-slate-600">
                <li>RFC (12 caracteres persona moral, 13 caracteres persona física)</li>
                <li>Razón social o nombre completo (tal como aparece en tu CSF)</li>
                <li>Régimen fiscal (601, 612, 626, etc.)</li>
                <li>Código postal del domicilio fiscal</li>
                <li>Uso del CFDI (G03 por default — Gastos en general)</li>
                <li>Email donde recibir las facturas (XML + PDF)</li>
              </ul>
            </Step>
            <Step number={3}>
              <strong>Marca la casilla</strong> "Necesito factura electrónica" y guarda.
            </Step>
            <Step number={4}>
              Cada vez que se cobre tu suscripción, recibirás <strong>automáticamente</strong> tu
              CFDI por correo dentro de las primeras 48 horas hábiles.
            </Step>
          </div>
        </section>

        <section className="mb-10 bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-black text-amber-950 mb-2">Plazo importante</h3>
              <p className="text-sm text-amber-900 font-medium leading-relaxed">
                Conforme a la <strong>Regla 2.7.1.21 de la RMF</strong>, los CFDIs deben emitirse
                en el mismo mes del pago. Si requieres factura de un pago, captura tus datos fiscales{' '}
                <strong>antes del día 5 del mes siguiente</strong> al pago. Pagos sin datos fiscales
                capturados se contabilizan al "Público en General" y no podemos emitir CFDI personalizado
                después de cerrado el mes.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-black text-slate-950 mb-4">Datos del emisor</h2>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 font-mono text-sm">
            <p><span className="text-slate-500">Razón social:</span> <strong>[Configurado en .env EMISOR_LEGAL_NAME]</strong></p>
            <p><span className="text-slate-500">RFC:</span> <strong>[EMISOR_RFC]</strong></p>
            <p><span className="text-slate-500">Régimen fiscal:</span> <strong>[EMISOR_REGIME] - Personas Físicas con Actividades Empresariales</strong></p>
            <p><span className="text-slate-500">CP domicilio fiscal:</span> <strong>[EMISOR_ZIP]</strong></p>
            <p className="text-xs text-slate-500 font-sans mt-3">
              * Los datos se cargan dinámicamente desde tus variables de entorno de producción.
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-black text-slate-950 mb-4">Cobro de IVA</h2>
          <ul className="space-y-3">
            <ChecklistItem>
              Todos los precios mostrados en planes y addons son <strong>antes de IVA</strong>.
              Al checkout, se agrega <strong>16% de IVA</strong> obligatorio.
            </ChecklistItem>
            <ChecklistItem>
              Ejemplo: si el plan dice "$499/mes", cobramos <strong>$578.84</strong> (subtotal $499 + IVA $79.84).
            </ChecklistItem>
            <ChecklistItem>
              El CFDI desglosa correctamente subtotal, IVA trasladado, y total.
            </ChecklistItem>
            <ChecklistItem>
              <strong>Forma de pago</strong> en CFDI: 04 (Tarjeta de crédito) si pagas con Stripe.
            </ChecklistItem>
            <ChecklistItem>
              <strong>Método de pago</strong> en CFDI: PUE (Pago en una sola exhibición) para suscripciones.
            </ChecklistItem>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-black text-slate-950 mb-4">Cancelaciones de facturas</h2>
          <p className="text-slate-700 font-medium leading-relaxed mb-3">
            Si necesitas cancelar una factura ya timbrada (por ejemplo, datos fiscales incorrectos),
            escríbenos a <a href={`mailto:${billingEmail}`} className="text-lime-700 font-bold hover:underline">{billingEmail}</a> dentro
            de los <strong>72 horas siguientes a la emisión</strong>.
          </p>
          <p className="text-slate-700 font-medium leading-relaxed">
            Si la cancelación es solicitada después de 72 horas, el receptor (tú) debe aceptar la
            cancelación desde el portal del SAT — esto está fuera de nuestro control y depende del SAT.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-black text-slate-950 mb-4">Suscripción anual</h2>
          <p className="text-slate-700 font-medium leading-relaxed">
            Si contratas plan anual, recibes <strong>un solo CFDI al inicio del año</strong> por el
            monto total, con uso PUE. No emitimos un CFDI mensual en planes anuales (el SAT no lo
            requiere si el pago es de una sola exhibición).
          </p>
        </section>

        <section className="mb-10 bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <Info size={18} className="text-blue-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-blue-900 mb-2">Sobre RESICO (Régimen 626)</p>
              <p className="text-xs text-blue-800 font-medium leading-relaxed">
                Si tu régimen es RESICO, recibirás CFDI con todos los datos correctos. Recuerda que en
                RESICO el IVA NO se acredita — el régimen es una retención efectiva. Conserva tus CFDIs
                como soporte aunque no los uses para acreditar.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-black text-slate-950 mb-4">¿Tienes dudas?</h2>
          <div className="bg-slate-950 text-white rounded-3xl p-6 md:p-8">
            <p className="text-slate-300 font-medium mb-5">
              Para cualquier asunto relacionado a facturación, escribe a:
            </p>
            <a
              href={`mailto:${billingEmail}`}
              className="inline-flex items-center gap-2 px-5 py-3 bg-lime-400 hover:bg-lime-300 text-slate-950 rounded-2xl font-black text-sm transition-colors"
            >
              <FileText size={14} />
              {billingEmail}
              <ArrowRight size={14} />
            </a>
          </div>
        </section>

      </article>

      <PublicFooter />
    </div>
  )
}

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 w-8 h-8 rounded-full bg-slate-950 text-white flex items-center justify-center font-black text-sm">
        {number}
      </div>
      <div className="flex-1 text-slate-700 font-medium leading-relaxed pt-1">{children}</div>
    </div>
  )
}

function ChecklistItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <CheckCircle2 size={18} className="text-lime-600 shrink-0 mt-0.5" />
      <div className="flex-1 text-slate-700 font-medium leading-relaxed">{children}</div>
    </div>
  )
}