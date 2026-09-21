 

'use client'

// ============================================================================
// src/app/dashboard/billing/datos-fiscales/page.tsx
// ----------------------------------------------------------------------------
// Captura/edición de datos fiscales del cliente para emisión de CFDIs.
// ============================================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabase'
import PageHeader from '../../../../components/PageHeader'
import { validateRFCFormat, validateZipCode } from '../../../../lib/invoicing'
import toast from 'react-hot-toast'
import {
  FileText, Save, Loader2, AlertCircle, CheckCircle2,
  ArrowLeft, Info, Receipt
} from 'lucide-react'
import IAnswerLoader from '../../../../components/IAnswerLoader'

interface TaxData {
  tax_rfc:           string
  tax_legal_name:    string
  tax_regime_code:   string
  tax_address_zip:   string
  tax_use_cfdi:      string
  invoice_email:     string
  requires_invoice:  boolean
}

interface RegimenOption {
  code:        string
  description: string
  for_persons: 'fisica' | 'moral' | 'both'
}

interface UsoCfdiOption {
  code:        string
  description: string
}

const DEFAULT_DATA: TaxData = {
  tax_rfc:          '',
  tax_legal_name:   '',
  tax_regime_code:  '',
  tax_address_zip:  '',
  tax_use_cfdi:     'G03',
  invoice_email:    '',
  requires_invoice: false
}

export default function DatosFiscalesPage() {
  const router = useRouter()
  const [companyId, setCompanyId]   = useState<string | null>(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [data, setData]             = useState<TaxData>(DEFAULT_DATA)
  const [regimenes, setRegimenes]   = useState<RegimenOption[]>([])
  const [usosCfdi, setUsosCfdi]     = useState<UsoCfdiOption[]>([])
  const [rfcValidation, setRfcValidation] = useState<{ valid: boolean; type?: string; error?: string } | null>(null)

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
        toast.error('No se encontró la compañía asociada')
        setLoading(false)
        return
      }

      const companyIdValue = (profile as any).company_id as string
      setCompanyId(companyIdValue)

      // Cargar datos fiscales actuales
      const { data: company } = await supabase
        .from('companies')
        .select('tax_rfc, tax_legal_name, tax_regime_code, tax_address_zip, tax_use_cfdi, invoice_email, requires_invoice')
        .eq('id', companyIdValue)
        .maybeSingle()

      const c = (company as any) || {}
      setData({
        tax_rfc:          c.tax_rfc || '',
        tax_legal_name:   c.tax_legal_name || '',
        tax_regime_code:  c.tax_regime_code || '',
        tax_address_zip:  c.tax_address_zip || '',
        tax_use_cfdi:     c.tax_use_cfdi || 'G03',
        invoice_email:    c.invoice_email || '',
        requires_invoice: !!c.requires_invoice
      })

      // Cargar catálogos SAT
      const [regimenesRes, usosCfdiRes] = await Promise.all([
        supabase.from('sat_regimen_fiscal').select('code, description, for_persons').order('code'),
        supabase.from('sat_uso_cfdi').select('code, description, applies_to').order('code')
      ])

      setRegimenes(((regimenesRes.data as unknown) as RegimenOption[]) || [])
      setUsosCfdi(((usosCfdiRes.data as unknown) as UsoCfdiOption[]) || [])

      setLoading(false)
    }
    load()
  }, [router])

  function validateAndSetRfc(rfc: string) {
    setData({ ...data, tax_rfc: rfc.toUpperCase() })
    if (!rfc) {
      setRfcValidation(null)
      return
    }
    const result = validateRFCFormat(rfc)
    setRfcValidation(result)
  }

  async function handleSave() {
    if (!companyId) return

    if (data.requires_invoice) {
      const rfcCheck = validateRFCFormat(data.tax_rfc)
      if (!rfcCheck.valid) {
        toast.error('RFC inválido: ' + (rfcCheck.error || 'formato incorrecto'))
        return
      }
      if (!data.tax_legal_name.trim()) {
        toast.error('La razón social es obligatoria')
        return
      }
      if (!data.tax_regime_code) {
        toast.error('Selecciona un régimen fiscal')
        return
      }
      if (!validateZipCode(data.tax_address_zip)) {
        toast.error('El código postal debe tener 5 dígitos')
        return
      }
      if (!data.invoice_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.invoice_email)) {
        toast.error('Email de facturación inválido')
        return
      }
    }

    setSaving(true)
    try {
      const payload: any = {
        tax_rfc:          data.requires_invoice ? data.tax_rfc.toUpperCase().trim() : null,
        tax_legal_name:   data.requires_invoice ? data.tax_legal_name.trim() : null,
        tax_regime_code:  data.requires_invoice ? data.tax_regime_code : null,
        tax_address_zip:  data.requires_invoice ? data.tax_address_zip.trim() : null,
        tax_use_cfdi:     data.tax_use_cfdi || 'G03',
        invoice_email:    data.requires_invoice ? data.invoice_email.trim() : null,
        requires_invoice: data.requires_invoice
      }
      const { error } = await supabase
        .from('companies')
        .update(payload)
        .eq('id', companyId)

      if (error) throw error
      toast.success('Datos fiscales guardados')
    } catch (err: any) {
      toast.error('Error al guardar: ' + (err.message || 'desconocido'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <IAnswerLoader size={28} />
      </div>
    )
  }

  // Filtrar regímenes según tipo de persona detectado por RFC
  const filteredRegimenes = rfcValidation?.type === 'fisica'
    ? regimenes.filter(r => r.for_persons === 'fisica' || r.for_persons === 'both')
    : rfcValidation?.type === 'moral'
      ? regimenes.filter(r => r.for_persons === 'moral' || r.for_persons === 'both')
      : regimenes

  return (
    <div className="pb-20 max-w-3xl mx-auto">
      <Link
        href="/dashboard/billing"
        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 mb-4"
      >
        <ArrowLeft size={14} />
        Volver a Mi Plan
      </Link>

      <PageHeader
        eyebrow="FACTURACIÓN"
        title="Datos fiscales"
        description="Captura tus datos fiscales para recibir CFDIs (facturas electrónicas) por tus pagos."
      />

      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <Info size={18} className="text-blue-700 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 font-medium leading-relaxed">
          <strong className="block mb-1">Sobre las facturas:</strong>
          Cobramos en MXN con IVA 16% incluido. Cada pago genera automáticamente una factura
          que recibirás en el email que indiques aquí dentro de 24-48 horas después del pago.
          Si necesitas factura del pago en curso, captura tus datos antes del día 5 del mes siguiente.
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 space-y-5">

        {/* Toggle: requiero factura */}
        <label className="flex items-start gap-3 cursor-pointer pb-5 border-b border-slate-100">
          <input
            type="checkbox"
            checked={data.requires_invoice}
            onChange={e => setData({ ...data, requires_invoice: e.target.checked })}
            className="mt-1 w-4 h-4 rounded border-slate-300"
          />
          <div className="flex-1">
            <p className="text-sm font-black text-slate-950">Necesito factura electrónica (CFDI)</p>
            <p className="text-xs text-slate-600 font-medium mt-1">
              Activa esto si quieres deducir los pagos. Si no, no se emiten CFDIs personalizados.
            </p>
          </div>
        </label>

        {data.requires_invoice && (
          <>
            {/* RFC */}
            <Field
              label="RFC"
              required
              hint="Persona física: 13 caracteres (ej: GUMG800101AB1). Persona moral: 12 caracteres."
              value={data.tax_rfc}
              onChange={validateAndSetRfc}
              mono
              uppercase
              placeholder="GUMG800101AB1"
            />
            {rfcValidation && (
              <div className={`-mt-2 text-xs font-medium ${rfcValidation.valid ? 'text-emerald-700' : 'text-rose-700'}`}>
                {rfcValidation.valid ? (
                  <>
                    <CheckCircle2 size={12} className="inline mr-1" />
                    RFC válido ({rfcValidation.type === 'fisica' ? 'persona física' : rfcValidation.type === 'moral' ? 'persona moral' : 'genérico'})
                  </>
                ) : (
                  <>
                    <AlertCircle size={12} className="inline mr-1" />
                    {rfcValidation.error}
                  </>
                )}
              </div>
            )}

            {/* Razón social */}
            <Field
              label="Razón social / Nombre completo"
              required
              hint="Tal como aparece en tu Constancia de Situación Fiscal (CSF). Sin régimen al final (ej: 'GUSTAVO MONFORTE', NO 'GUSTAVO MONFORTE SA DE CV')."
              value={data.tax_legal_name}
              onChange={v => setData({ ...data, tax_legal_name: v })}
              placeholder="GUSTAVO MONFORTE"
              uppercase
            />

            {/* Régimen fiscal */}
            <SelectField
              label="Régimen fiscal"
              required
              value={data.tax_regime_code}
              onChange={v => setData({ ...data, tax_regime_code: v })}
              options={filteredRegimenes.map(r => ({ value: r.code, label: `${r.code} - ${r.description}` }))}
              placeholder="Selecciona tu régimen..."
              hint="Si tu RFC es de persona física, la lista se filtra automáticamente."
            />

            {/* Código postal */}
            <Field
              label="Código postal del domicilio fiscal"
              required
              hint="Debe coincidir con el que tienes registrado ante el SAT."
              value={data.tax_address_zip}
              onChange={v => setData({ ...data, tax_address_zip: v.replace(/\D/g, '').slice(0, 5) })}
              mono
              placeholder="97000"
            />

            {/* Uso del CFDI */}
            <SelectField
              label="Uso del CFDI (default)"
              value={data.tax_use_cfdi}
              onChange={v => setData({ ...data, tax_use_cfdi: v })}
              options={usosCfdi.map(u => ({ value: u.code, label: `${u.code} - ${u.description}` }))}
              hint="Determina cómo registrarás la factura en tu contabilidad. 'G03 - Gastos en general' es el más común."
            />

            {/* Email */}
            <Field
              label="Email para envío de facturas"
              required
              type="email"
              hint="El XML y PDF se enviarán a este correo cada que se emita una factura."
              value={data.invoice_email}
              onChange={v => setData({ ...data, invoice_email: v.trim() })}
              placeholder="facturas@miempresa.com"
            />
          </>
        )}

        {/* Guardar */}
        <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-slate-950 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-2xl font-black text-sm transition-colors flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Guardando...' : 'Guardar datos fiscales'}
          </button>
          <Link
            href="/dashboard/billing/facturas"
            className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Receipt size={14} />
            Ver mis facturas
          </Link>
        </div>
      </div>

      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
          ¿No tienes los datos a la mano?
        </p>
        <p className="text-sm text-slate-700 font-medium leading-relaxed">
          Descarga tu <strong>Constancia de Situación Fiscal (CSF)</strong> directamente del SAT.{' '}
          <a
            href="https://www.sat.gob.mx/aplicacion/login/53027/genera-tu-constancia-de-situacion-fiscal"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lime-700 font-bold hover:underline"
          >
            sat.gob.mx
          </a>
          {' '}— tu RFC, régimen, código postal y nombre legal aparecen ahí.
        </p>
      </div>
    </div>
  )
}

interface FieldProps {
  label:        string
  value:        string
  onChange:     (v: string) => void
  required?:    boolean
  placeholder?: string
  hint?:        string
  mono?:        boolean
  uppercase?:   boolean
  type?:        string
}

function Field({ label, value, onChange, required, placeholder, hint, mono, uppercase, type = 'text' }: FieldProps) {
  return (
    <div>
      <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 block">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={placeholder}
        className={`w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 ${mono ? 'font-mono text-sm' : 'text-sm'} text-slate-700`}
      />
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

interface SelectFieldProps {
  label:        string
  value:        string
  onChange:     (v: string) => void
  options:      Array<{ value: string; label: string }>
  required?:    boolean
  placeholder?: string
  hint?:        string
}

function SelectField({ label, value, onChange, options, required, placeholder, hint }: SelectFieldProps) {
  return (
    <div>
      <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5 block">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 text-sm text-slate-700"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}
