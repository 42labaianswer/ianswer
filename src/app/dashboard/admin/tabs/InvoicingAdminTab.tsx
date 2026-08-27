 

'use client'

// ============================================================================
// src/app/dashboard/admin/tabs/InvoicingAdminTab.tsx
// ----------------------------------------------------------------------------
// Tab admin para ver TODAS las invoices del sistema y operar:
//   - Listar con filtros por status, fecha, RFC
//   - Timbrar (cuando hay PAC configurado)
//   - Re-timbrar invoices en estado errored
//   - Cancelar (cuando aplica)
// ============================================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import { formatCurrency } from '../../../../lib/invoicing'
import toast from 'react-hot-toast'
import {
  Receipt, Loader2, AlertCircle, CheckCircle2, Clock,
  RefreshCw, FileText, Download, AlertTriangle, Zap, Eye, X
} from 'lucide-react'

interface AdminInvoice {
  id:                  string
  company_id:          string
  invoice_number:      string | null
  status:              string
  receptor_rfc:        string
  receptor_legal_name: string
  receptor_email:      string | null
  subtotal_cents:      number
  iva_cents:           number
  total_cents:         number
  currency:            string
  cfdi_uuid:           string | null
  cfdi_xml_url:        string | null
  cfdi_pdf_url:        string | null
  cfdi_stamped_at:     string | null
  pac_provider:        string | null
  stripe_invoice_id:   string | null
  error_message:       string | null
  created_at:          string
  paid_at:             string | null
  items:               any
}

export default function InvoicingAdminTab() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedInvoice, setSelectedInvoice] = useState<AdminInvoice | null>(null)

  const { data: invoices = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-invoices', statusFilter],
    queryFn: async () => {
      let q = supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (statusFilter !== 'all') q = q.eq('status', statusFilter)

      const { data, error } = await q
      if (error) throw error
      return ((data as unknown) as AdminInvoice[]) || []
    }
  })

  const stampMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch(`/api/invoices/${invoiceId}/stamp`, { method: 'POST' })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result.error || 'Error')
      return result
    },
    onSuccess: (result: any) => {
      toast.success(`Timbrada · UUID: ${result.uuid?.slice(0, 8) || 'OK'}...`)
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] })
    },
    onError: (err: any) => {
      toast.error(err.message || 'Error al timbrar')
    }
  })

  const statusCounts = invoices.reduce((acc, inv) => {
    acc[inv.status] = (acc[inv.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalIVA = invoices
    .filter(i => i.status === 'stamped')
    .reduce((sum, i) => sum + i.iva_cents, 0)

  const totalRevenue = invoices
    .filter(i => i.status === 'stamped' || i.status === 'paid')
    .reduce((sum, i) => sum + i.subtotal_cents, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-2xl">
          <Receipt size={20} className="text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-950">Facturación</h2>
          <p className="text-sm text-slate-600 font-medium">
            CFDIs emitidos por iAnswer. {process.env.NEXT_PUBLIC_PAC_PROVIDER || 'PAC no configurado'} ·
            IVA acumulado: {formatCurrency(totalIVA)} · Subtotal: {formatCurrency(totalRevenue)}
          </p>
        </div>
      </div>

      {!process.env.NEXT_PUBLIC_PAC_PROVIDER && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-900 font-medium leading-relaxed">
            <strong className="block mb-1">PAC no configurado</strong>
            Los pagos generan drafts pero NO se timbran. Contrata Facturama (~$1/CFDI) y configura
            <code className="px-1 mx-0.5 bg-amber-100 rounded font-mono">PAC_PROVIDER=facturama</code>
            + credenciales en Vercel para activar el timbrado automático.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={statusFilter === 'all'}       onClick={() => setStatusFilter('all')}
          label="Todas"    count={invoices.length}
        />
        <FilterChip
          active={statusFilter === 'draft'}     onClick={() => setStatusFilter('draft')}
          label="Drafts"   count={statusCounts.draft || 0} tone="slate"
        />
        <FilterChip
          active={statusFilter === 'pending_stamp'} onClick={() => setStatusFilter('pending_stamp')}
          label="Pendientes" count={statusCounts.pending_stamp || 0} tone="amber"
        />
        <FilterChip
          active={statusFilter === 'stamped'}   onClick={() => setStatusFilter('stamped')}
          label="Timbradas" count={statusCounts.stamped || 0} tone="emerald"
        />
        <FilterChip
          active={statusFilter === 'errored'}   onClick={() => setStatusFilter('errored')}
          label="Errores"  count={statusCounts.errored || 0} tone="rose"
        />

        <button
          onClick={() => refetch()}
          className="ml-auto px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1.5"
        >
          <RefreshCw size={12} />
          Refrescar
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Receipt size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Sin facturas</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-600">Folio</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-600">Cliente</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-600">Status</th>
                <th className="text-right px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-600">Total</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-600">Fecha</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="text-xs font-black text-slate-950 font-mono">{inv.invoice_number || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-bold text-slate-950">{inv.receptor_legal_name}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{inv.receptor_rfc}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-xs font-black text-slate-950">{formatCurrency(inv.total_cents, inv.currency)}</p>
                    <p className="text-[10px] text-slate-500">IVA: {formatCurrency(inv.iva_cents, inv.currency)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-700">{new Date(inv.created_at).toLocaleDateString('es-MX')}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="p-1.5 hover:bg-slate-200 rounded text-slate-600"
                        title="Ver detalle"
                      >
                        <Eye size={12} />
                      </button>
                      {(inv.status === 'draft' || inv.status === 'errored') && (
                        <button
                          onClick={() => stampMutation.mutate(inv.id)}
                          disabled={stampMutation.isPending && stampMutation.variables === inv.id}
                          className="px-2 py-1 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded text-[10px] font-black flex items-center gap-1"
                        >
                          {stampMutation.isPending && stampMutation.variables === inv.id ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <Zap size={10} />
                          )}
                          Timbrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedInvoice && (
        <InvoiceDetailModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const configs: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
    draft:         { label: 'Draft',     color: 'text-slate-600',   bg: 'bg-slate-100',   Icon: Clock },
    pending_stamp: { label: 'Pendiente', color: 'text-amber-700',   bg: 'bg-amber-100',   Icon: Loader2 },
    stamped:       { label: 'Timbrada', color: 'text-emerald-700', bg: 'bg-emerald-100', Icon: CheckCircle2 },
    paid:          { label: 'Pagada',    color: 'text-emerald-700', bg: 'bg-emerald-100', Icon: CheckCircle2 },
    cancelled:     { label: 'Cancelada', color: 'text-slate-600',   bg: 'bg-slate-100',   Icon: AlertCircle },
    errored:       { label: 'Error',     color: 'text-rose-700',    bg: 'bg-rose-100',    Icon: AlertCircle }
  }
  const c = configs[status] || configs.draft
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${c.bg} ${c.color}`}>
      <c.Icon size={10} />
      {c.label}
    </span>
  )
}

function FilterChip({ active, onClick, label, count, tone = 'slate' }: {
  active: boolean; onClick: () => void; label: string; count: number; tone?: 'slate' | 'amber' | 'emerald' | 'rose'
}) {
  const tones: Record<string, string> = {
    slate:   active ? 'bg-slate-950 text-white' : 'bg-white border border-slate-200 text-slate-700',
    amber:   active ? 'bg-amber-600 text-white' : 'bg-amber-50 border border-amber-200 text-amber-800',
    emerald: active ? 'bg-emerald-600 text-white' : 'bg-emerald-50 border border-emerald-200 text-emerald-800',
    rose:    active ? 'bg-rose-600 text-white' : 'bg-rose-50 border border-rose-200 text-rose-800'
  }
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${tones[tone]}`}
    >
      {label}
      <span className={`px-1.5 py-0.5 rounded text-[10px] ${active ? 'bg-white/20' : 'bg-white/60'}`}>
        {count}
      </span>
    </button>
  )
}

function InvoiceDetailModal({ invoice, onClose }: { invoice: AdminInvoice; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-600 mb-1">Factura</p>
            <h3 className="text-2xl font-black text-slate-950">{invoice.invoice_number || 'Sin folio'}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="space-y-2 mb-6">
          <DetailRow label="Status"           value={<StatusPill status={invoice.status} />} />
          <DetailRow label="Receptor RFC"     value={invoice.receptor_rfc} mono />
          <DetailRow label="Razón social"     value={invoice.receptor_legal_name} />
          <DetailRow label="Email"            value={invoice.receptor_email || '—'} />
          <DetailRow label="Subtotal"         value={formatCurrency(invoice.subtotal_cents, invoice.currency)} />
          <DetailRow label="IVA 16%"          value={formatCurrency(invoice.iva_cents, invoice.currency)} />
          <DetailRow label="Total"            value={formatCurrency(invoice.total_cents, invoice.currency)} bold />
          {invoice.cfdi_uuid && <DetailRow label="UUID SAT" value={invoice.cfdi_uuid} mono />}
          {invoice.pac_provider && <DetailRow label="PAC" value={invoice.pac_provider} />}
          {invoice.stripe_invoice_id && <DetailRow label="Stripe Invoice ID" value={invoice.stripe_invoice_id} mono />}
          {invoice.cfdi_stamped_at && <DetailRow label="Timbrada" value={new Date(invoice.cfdi_stamped_at).toLocaleString('es-MX')} />}
          {invoice.error_message && <DetailRow label="Error" value={invoice.error_message} tone="rose" />}
        </div>

        {invoice.status === 'stamped' && (
          <div className="flex gap-2 pt-4 border-t border-slate-100">
            {invoice.cfdi_xml_url && (
              <a
                href={invoice.cfdi_xml_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-2"
              >
                <FileText size={12} />
                Descargar XML
              </a>
            )}
            {invoice.cfdi_pdf_url && (
              <a
                href={invoice.cfdi_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-2"
              >
                <Download size={12} />
                Descargar PDF
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono, bold, tone = 'slate' }: {
  label: string; value: any; mono?: boolean; bold?: boolean; tone?: 'slate' | 'rose'
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-slate-100 last:border-0">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">{label}</p>
      <p className={`text-sm text-right break-all ${
        bold ? 'font-black text-slate-950' :
        tone === 'rose' ? 'font-medium text-rose-700' :
        'font-medium text-slate-900'
      } ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </p>
    </div>
  )
}
