 

'use client'

/**
 * ============================================================================
 * PropertyImportWizard · v2.17
 * ----------------------------------------------------------------------------
 * Wizard de 3 fases para importar propiedades:
 *
 *   FASE 1 — Subir PDF
 *     Upload a Storage bucket agent-pdfs (reusamos el de v2.15).
 *
 *   FASE 2 — DeepSeek extrae todas las propiedades
 *     Llama a /api/properties-pdf-extract que devuelve un array.
 *
 *   FASE 3 — Tabla editable de revisión
 *     El usuario revisa cada propiedad, edita campos, marca cuáles importar.
 *     Click "Importar 12 propiedades" → INSERT batch.
 *
 * Gateado por feature `properties_pdf_import` (Pro Inmobiliaria).
 * ============================================================================
 */

import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  X, Upload, FileText, Loader2, CheckCircle2, AlertCircle, Sparkles,
  Trash2, Save, Edit2, Check
} from 'lucide-react'
import IAnswerLoader from './IAnswerLoader'

type ExtractedProperty = {
  title: string
  description?: string
  property_type?: string
  operation_type?: string
  price?: number
  currency?: string
  bedrooms?: number
  bathrooms?: number
  parking_spots?: number
  area_total_m2?: number
  area_built_m2?: number
  zone?: string
  city?: string
  address?: string
  features?: string[]
  _selected?: boolean   // estado UI: ¿importar esta?
  _editing?: boolean    // estado UI: editando inline
}

type Props = {
  isOpen: boolean
  onClose: () => void
  companyId: string
  accentColor: string
}

type Phase = 'upload' | 'processing' | 'review'

export default function PropertyImportWizard({ isOpen, onClose, companyId, accentColor }: Props) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('upload')
  const [properties, setProperties] = useState<ExtractedProperty[]>([])
  const [pdfFilename, setPdfFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ----- FASE 1+2: Upload + Extract -----
  const handleUpload = async (file: File) => {
    setError(null)
    if (file.type !== 'application/pdf') {
      setError('Solo PDFs (.pdf)')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Máximo 10 MB')
      return
    }

    setPhase('processing')
    setPdfFilename(file.name)

    try {
      // Upload a agent-pdfs
      const path = `${companyId}/properties-import-${Date.now()}.pdf`
      const { error: uploadErr } = await supabase.storage
        .from('agent-pdfs')
        .upload(path, file, { contentType: 'application/pdf' })
      if (uploadErr) throw new Error(`Error subiendo PDF: ${uploadErr.message}`)

      const { data: signed, error: signErr } = await supabase.storage
        .from('agent-pdfs')
        .createSignedUrl(path, 600)
      if (signErr || !signed?.signedUrl) {
        throw new Error(`No se pudo generar URL firmada: ${signErr?.message || 'unknown'}`)
      }

      // Extraer con DeepSeek (con manejo robusto de respuesta)
      const res = await fetch('/api/properties-pdf-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_url: signed.signedUrl })
      })

      // Capturar text PRIMERO, parsear después (evita SyntaxError de json())
      const rawText = await res.text()
      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        console.error('[PDF Wizard] respuesta NO es JSON:', rawText.slice(0, 500))
        throw new Error(
          res.ok
            ? `Respuesta inesperada del servidor: ${rawText.slice(0, 200)}`
            : `Error ${res.status}: ${rawText.slice(0, 200)}`
        )
      }

      if (!res.ok) {
        const detail = data?.detail ? ` (${data.detail})` : ''
        throw new Error((data?.error || `HTTP ${res.status}`) + detail)
      }

      if (!data?.properties || !Array.isArray(data.properties)) {
        throw new Error('El servidor devolvió un formato inesperado (sin array de properties)')
      }

      const props = data.properties.map((p: ExtractedProperty) => ({ ...p, _selected: true }))
      setProperties(props)
      setPhase('review')
      toast.success(`${props.length} propiedades extraídas de ${data.pages || '?'} páginas`)
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : 'Error inesperado')
      console.error('[PDF Wizard] error:', err)
      setError(msg)
      setPhase('upload')
      try { toast.error(msg) } catch { /* toast may fail in dev */ }
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ----- FASE 3: Importar las seleccionadas -----
  const importMutation = useMutation({
    mutationFn: async () => {
      const toImport = properties
        .filter(p => p._selected && p.title?.trim())
        .map(p => {
          const { _selected, _editing, ...rest } = p
          // Sanitizar: quitar undefined
          const clean: any = { company_id: companyId, status: 'borrador' }
          for (const [k, v] of Object.entries(rest)) {
            if (v !== undefined && v !== null && v !== '') clean[k] = v
          }
          return clean
        })

      if (toImport.length === 0) throw new Error('No hay propiedades seleccionadas')

      const { error } = await supabase.from('properties').insert(toImport)
      if (error) throw error
      return toImport.length
    },
    onSuccess: (n) => {
      toast.success(`${n} propiedades importadas como borrador`)
      queryClient.invalidateQueries({ queryKey: ['properties'] })
      handleClose()
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`)
  })

  const handleClose = () => {
    setPhase('upload')
    setProperties([])
    setPdfFilename(null)
    setError(null)
    onClose()
  }

  // Toggle selección
  const toggleSelected = (idx: number) => {
    setProperties(properties.map((p, i) => i === idx ? { ...p, _selected: !p._selected } : p))
  }

  const updateProperty = (idx: number, field: keyof ExtractedProperty, value: any) => {
    setProperties(properties.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  const selectedCount = properties.filter(p => p._selected).length

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40" onClick={handleClose} />

      <div className="fixed inset-4 md:inset-10 bg-white rounded-3xl shadow-2xl z-50 flex flex-col animate-in zoom-in-95 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0" style={{ backgroundColor: `${accentColor}08` }}>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: accentColor }}>
              <FileText size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Importar propiedades desde PDF</h2>
              <p className="text-xs text-slate-500 font-medium">
                {phase === 'upload' && 'Sube un PDF con tu catálogo, DeepSeek extraerá las propiedades automáticamente'}
                {phase === 'processing' && 'DeepSeek está analizando tu PDF...'}
                {phase === 'review' && `${properties.length} propiedades extraídas · ${selectedCount} seleccionadas para importar`}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* FASE 1: UPLOAD */}
          {phase === 'upload' && (
            <div className="max-w-2xl mx-auto py-10">
              <div
                className="border-2 border-dashed border-slate-300 hover:border-purple-400 hover:bg-purple-50/30 rounded-3xl p-12 text-center transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
                  className="hidden"
                />
                <Upload size={48} className="text-slate-400 mx-auto mb-4" />
                <p className="text-base font-black text-slate-800 mb-2">Sube tu catálogo en PDF</p>
                <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto leading-relaxed">
                  DeepSeek leerá el PDF y extraerá cada propiedad como un registro editable.
                  Tú revisas, ajustas y confirmas cuáles importar.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2"
                >
                  <Upload size={14} /> Elegir PDF (máx 10 MB)
                </button>
                {error && (
                  <div className="mt-4 inline-flex items-center gap-2 text-rose-600 text-xs font-bold bg-rose-50 px-4 py-2 rounded-lg">
                    <AlertCircle size={14} /> {error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FASE 2: PROCESSING */}
          {phase === 'processing' && (
            <div className="max-w-md mx-auto py-20 text-center">
              <div className="relative inline-block mb-6">
                <FileText size={56} className="text-purple-600" />
                <Sparkles size={20} className="text-amber-500 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <p className="text-lg font-black text-slate-800 mb-2">{pdfFilename}</p>
              <p className="text-sm text-slate-500 mb-6">DeepSeek está analizando tu PDF y extrayendo propiedades...</p>
              <IAnswerLoader size={32} />
              <p className="text-[10px] text-slate-400 mt-4">Esto puede tomar 20-60 segundos según el tamaño del PDF</p>
            </div>
          )}

          {/* FASE 3: REVIEW */}
          {phase === 'review' && (
            <div className="space-y-4">
              {properties.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle size={32} className="text-amber-500 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-700">No se encontraron propiedades en el PDF</p>
                  <p className="text-xs text-slate-500 mt-1">Intenta con un PDF más estructurado o crea las propiedades manualmente.</p>
                </div>
              ) : (
                <>
                  {/* Bulk actions */}
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-xl">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setProperties(properties.map(p => ({ ...p, _selected: true })))}
                        className="text-xs font-bold text-slate-600 hover:text-slate-900"
                      >
                        Seleccionar todas
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        onClick={() => setProperties(properties.map(p => ({ ...p, _selected: false })))}
                        className="text-xs font-bold text-slate-600 hover:text-slate-900"
                      >
                        Ninguna
                      </button>
                    </div>
                    <p className="text-xs font-bold text-slate-700">
                      {selectedCount} de {properties.length}
                    </p>
                  </div>

                  {/* Lista de propiedades */}
                  {properties.map((p, idx) => (
                    <div key={idx} className={`border-2 rounded-2xl transition-colors ${p._selected ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
                      <div className="p-4 flex items-start gap-3">
                        <button
                          onClick={() => toggleSelected(idx)}
                          className={`h-6 w-6 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${p._selected ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 bg-white'}`}
                        >
                          {p._selected && <Check size={14} className="text-white" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          {!p._editing ? (
                            <>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-black text-slate-800 text-sm">{p.title}</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600 mt-1">
                                    {p.property_type && <span className="font-bold text-purple-700 uppercase text-[10px]">{p.property_type}</span>}
                                    {p.operation_type && <span className="text-[10px] uppercase text-amber-700 font-bold">{p.operation_type}</span>}
                                    {p.price && <span>${p.price.toLocaleString()} {p.currency || 'MXN'}</span>}
                                    {p.bedrooms != null && <span>{p.bedrooms} rec</span>}
                                    {p.bathrooms != null && <span>{p.bathrooms} baños</span>}
                                    {p.area_built_m2 && <span>{p.area_built_m2}m² const.</span>}
                                    {p.zone && <span>📍 {p.zone}</span>}
                                  </div>
                                  {p.description && <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{p.description}</p>}
                                  {p.features && p.features.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {p.features.slice(0, 5).map((f, i) => (
                                        <span key={`${f}-${i}`} className="text-[9px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">{f}</span>
                                      ))}
                                      {p.features.length > 5 && (
                                        <span className="text-[9px] text-slate-500">+{p.features.length - 5}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => updateProperty(idx, '_editing', true)}
                                  className="text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-lg shrink-0"
                                >
                                  <Edit2 size={12} />
                                </button>
                              </div>
                            </>
                          ) : (
                            // Inline edit
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={p.title}
                                onChange={e => updateProperty(idx, 'title', e.target.value)}
                                placeholder="Título"
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-purple-500"
                              />
                              <div className="grid grid-cols-3 gap-2">
                                <input
                                  type="number"
                                  value={p.price ?? ''}
                                  onChange={e => updateProperty(idx, 'price', e.target.value === '' ? undefined : Number(e.target.value))}
                                  placeholder="Precio"
                                  className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-purple-500"
                                />
                                <input
                                  type="number"
                                  value={p.bedrooms ?? ''}
                                  onChange={e => updateProperty(idx, 'bedrooms', e.target.value === '' ? undefined : Number(e.target.value))}
                                  placeholder="Rec"
                                  className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-purple-500"
                                />
                                <input
                                  type="text"
                                  value={p.zone || ''}
                                  onChange={e => updateProperty(idx, 'zone', e.target.value)}
                                  placeholder="Zona"
                                  className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-purple-500"
                                />
                              </div>
                              <button
                                onClick={() => updateProperty(idx, '_editing', false)}
                                className="text-[10px] font-bold text-purple-700 hover:text-purple-900"
                              >
                                ✓ Terminar edición
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'review' && properties.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
            <p className="text-xs text-slate-500">
              Las propiedades se importarán con estado <strong>"borrador"</strong>. Después las publicas desde el listado.
            </p>
            <button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || selectedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md"
            >
              {importMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Importar {selectedCount} propiedades
            </button>
          </div>
        )}
      </div>
    </>
  )
}
