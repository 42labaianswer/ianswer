 

'use client'

// ============================================================================
// src/app/dashboard/billing/facturas/page.tsx
// ----------------------------------------------------------------------------
// Lista de facturas (CFDIs) del cliente.
// ============================================================================

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabase'
import PageHeader from '../../../../components/PageHeader'
import { formatCurrency } from '../../../../lib/invoicing'
import toast from 'react-hot-toast'
import {
  Receipt, FileText, Download, Loader2, AlertCircle, CheckCircle2,
  Clock, ArrowLeft, ExternalLink, Settings
} from 'lucide-react'
import IAnswerLoader from '../../../../components/IAnswerLoader'

interface Invoice {
  id:                  string
  invoice_number:      string | null
  status:              string
  subtotal_cents:      number
  iva_cents:           number
  total_cents:         number
  currency:            string
  receptor_rfc:        string
  receptor_legal_name: string
  cfdi_uuid:           string | null
  cfdi_xml_url:        string | null
  cfdi_pdf_url:        string | null
  cfdi_stamped_at:     string | null
  created_at:          string
  paid_at:             string | null
  error_message:       string | null
  billing_period_start: string | null
  billing_period_end:   string | null
}

export default function FacturasPage() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [invoices, setInvoices]   = useState<Invoice[]>([])
  const [loading, setLoading]     = useState(true)
  const [hasTaxData, setHasTaxData] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle()

      if (!(profile as any)?.company_id) {
        setLoading(false)
        return
      }

      const companyIdValue = (profile as any).company_id as string
      setCompanyId(companyIdValue)

      // Verificar si ya tiene datos fiscales capturados
      const { data: company } = await supabase
        .from('companies')
        .select('tax_rfc, requires_invoice')
        .eq('id', companyIdValue)
        .maybeSingle()

      const c = (company as any) || {}
      setHasTaxData(!!(c.tax_rfc && c.requires_invoice))

      // Cargar invoices
      const { data: invoicesData } = await supabase
        .from('invoices')
        .select(`id, invoice_number, status, subtotal_cents, iva_cents, total_cents, currency,
                 receptor_rfc, receptor_legal_name, cfdi_uuid, cfdi_xml_url, cfdi_pdf_url,
                 cfdi_stamped_at, created_at, paid_at, error_message,
                 billing_period_start, billing_period_end`)
        .eq('company_id', companyIdValue)
        .order('created_at', { ascending: false })
        .limit(50)

      setInvoices(((invoicesData as unknown) as Invoice[]) || [])
      setLoading(false)
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <IAnswerLoader size={28} />
      </div>
    )
  }

  return (
    <div className="pb-20 max-w-4xl mx-auto">
      <Link
        href="/dashboard/billing"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 mb-4"
      >
        <ArrowLeft size={14} />
        Volver a Mi Plan
      </Link>

      <PageHeader
        eyebrow="FACTURACIÓN"
        title="Mis facturas"
        description="Historial de CFDIs emitidos por iAnswer. Puedes descargar el XML y PDF de cada factura timbrada."
      />

      {!hasTaxData && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-start gap-3 flex-1">
            <AlertCircle size={20} className="text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">Datos fiscales pendientes</p>
              <p className="text-xs text-amber-800 font-medium mt-1">
                Captura tus datos fiscales para que podamos emitir CFDIs personalizados de tus pagos.
                Sin ellos, los pagos se contabilizan al "Público en General".
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/billing/datos-fiscales"
            className="px-4 py-2.5 bg-amber-900 hover:bg-amber-950 text-white rounded-xl text-xs font-black whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <Settings size={12} />
            Capturar datos
          </Link>
        </div>
      )}

      {invoices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Receipt size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Aún no hay facturas</p>
          <p className="text-xs text-slate-500 font-medium mt-1 max-w-md mx-auto">
            Cuando hagas tu primer pago, aparecerá aquí la factura correspondiente.
            {hasTaxData ? '' : ' Captura tus datos fiscales arriba para que sea CFDI personalizado.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {invoices.map((inv, idx) => (
            <InvoiceRow key={inv.id} invoice={inv} isFirst={idx === 0} />
          ))}
        </div>
      )}

      <div className="mt-8 bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
          ¿Qué significa cada estado?
        </p>
        <ul className="text-xs text-slate-700 font-medium space-y-1 leading-relaxed">
          <li><strong>Borrador:</strong> el pago se procesó pero la factura todavía no se timbra ante el SAT</li>
          <li><strong>Pendiente de timbre:</strong> en proceso de timbrado con el PAC</li>
          <li><strong>Timbrada:</strong> ya tiene UUID del SAT y puedes descargar XML/PDF</li>
          <li><strong>Cancelada:</strong> factura cancelada ante el SAT (con o sin sustituto)</li>
          <li><strong>Error:</strong> el timbrado falló. Revisa el mensaje o contáctanos</li>
        </ul>
      </div>
    </div>
  )
}

function InvoiceRow({ invoice, isFirst }: { invoice: Invoice; isFirst: boolean }) {
  const statusConfig = getStatusConfig(invoice.status)
  const StatusIcon = statusConfig.icon

  function downloadXml() {
    if (invoice.cfdi_xml_url) {
      window.open(invoice.cfdi_xml_url, '_blank')
    } else {
      toast.error('XML aún no disponible')
    }
  }

  function downloadPdf() {
    if (invoice.cfdi_pdf_url) {
      window.open(invoice.cfdi_pdf_url, '_blank')
    } else {
      toast.error('PDF aún no disponible')
    }
  }

  return (
    <div className={`p-4 md:p-5 ${isFirst ? '' : 'border-t border-slate-100'}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-sm font-black text-slate-950">
              {invoice.invoice_number || 'Sin folio'}
            </p>
            <StatusBadge config={statusConfig} />
            {invoice.cfdi_uuid && (
              <code className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-bold">
                {invoice.cfdi_uuid.slice(0, 8)}...
              </code>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium">
            {new Date(invoice.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
            {' · '}
            {invoice.receptor_legal_name}
          </p>
          {invoice.error_message && invoice.status === 'errored' && (
            <p className="text-xs text-rose-600 font-medium mt-1">
              <AlertCircle size={11} className="inline mr-1" />
              {invoice.error_message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-sm font-black text-slate-950">
              {formatCurrency(invoice.total_cents, invoice.currency)}
            </p>
            <p className="text-[10px] text-slate-500 font-medium">
              IVA: {formatCurrency(invoice.iva_cents, invoice.currency)}
            </p>
          </div>

          {invoice.status === 'stamped' && (
            <div className="flex gap-2">
              <button
                onClick={downloadXml}
                disabled={!invoice.cfdi_xml_url}
                className="p-2 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-50 rounded-lg text-slate-700"
                title="Descargar XML"
              >
                <FileText size={14} />
              </button>
              <button
                onClick={downloadPdf}
                disabled={!invoice.cfdi_pdf_url}
                className="p-2 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-50 rounded-lg text-slate-700"
                title="Descargar PDF"
              >
                <Download size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface StatusConfig {
  icon:  React.ComponentType<any>
  label: string
  color: string
  bg:    string
}

function getStatusConfig(status: string): StatusConfig {
  const configs: Record<string, StatusConfig> = {
    draft:         { icon: Clock,          label: 'Borrador',          color: 'text-slate-600',   bg: 'bg-slate-100' },
    pending_stamp: { icon: Loader2,        label: 'Pendiente timbre',  color: 'text-amber-700',   bg: 'bg-amber-100' },
    stamped:       { icon: CheckCircle2,   label: 'Timbrada',          color: 'text-emerald-700', bg: 'bg-emerald-100' },
    paid:          { icon: CheckCircle2,   label: 'Pagada',            color: 'text-emerald-700', bg: 'bg-emerald-100' },
    cancelled:     { icon: AlertCircle,    label: 'Cancelada',         color: 'text-slate-600',   bg: 'bg-slate-100' },
    refunded:      { icon: AlertCircle,    label: 'Reembolsada',       color: 'text-amber-700',   bg: 'bg-amber-100' },
    errored:       { icon: AlertCircle,    label: 'Error',             color: 'text-rose-700',    bg: 'bg-rose-100' }
  }
  return configs[status] || configs.draft
}

function StatusBadge({ config }: { config: StatusConfig }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
      <config.icon size={10} />
      {config.label}
    </span>
  )
}
