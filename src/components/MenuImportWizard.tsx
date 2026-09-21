 

'use client'

/**
 * ============================================================================
 * MenuImportWizard · v2.18
 * ----------------------------------------------------------------------------
 * Wizard para importar menú desde PDF. Mismo patrón que PropertyImportWizard
 * de v2.17 pero adaptado a menús.
 *
 * Diferencia clave: DeepSeek devuelve items + sus categorías. Antes de insertar
 * los items, creamos las categorías nuevas que no existen.
 * ============================================================================
 */

import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  X, Upload, FileText, Loader2, AlertCircle, Sparkles, Save, Edit2, Check,
  Star, Flame, Leaf
} from 'lucide-react'
import IAnswerLoader from './IAnswerLoader'

type ExtractedItem = {
  category: string
  name: string
  description?: string
  price?: number
  tags?: string[]
  allergens?: string[]
  is_recommended?: boolean
  _selected?: boolean
  _editing?: boolean
}

type Props = {
  isOpen: boolean
  onClose: () => void
  companyId: string
  accentColor: string
}

type Phase = 'upload' | 'processing' | 'review'

export default function MenuImportWizard({ isOpen, onClose, companyId, accentColor }: Props) {
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('upload')
  const [items, setItems] = useState<ExtractedItem[]>([])
  const [pdfFilename, setPdfFilename] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Upload + extract ---
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
      const path = `${companyId}/menu-import-${Date.now()}.pdf`
      const { error: uploadErr } = await supabase.storage.from('agent-pdfs').upload(path, file, { contentType: 'application/pdf' })
      if (uploadErr) throw uploadErr

      const { data: signed, error: signErr } = await supabase.storage.from('agent-pdfs').createSignedUrl(path, 600)
      if (signErr || !signed?.signedUrl) throw signErr || new Error('No se pudo generar URL')

      const res = await fetch('/api/menu-pdf-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_url: signed.signedUrl })
      })
      const rawText = await res.text()
      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        console.error('[Menu PDF Wizard] respuesta NO es JSON:', rawText.slice(0, 500))
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

      const extractedItems = (data.items || []).map((it: ExtractedItem) => ({ ...it, _selected: true }))
      setItems(extractedItems)
      setPhase('review')
      toast.success(`${extractedItems.length} items en ${data.counts.categories} categorías`)
    } catch (err: any) {
      setError(err.message || 'Error inesperado')
      setPhase('upload')
      toast.error(err.message)
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // --- Importar ---
  const importMutation = useMutation({
    mutationFn: async () => {
      const toImport = items.filter(it => it._selected && it.name?.trim())
      if (toImport.length === 0) throw new Error('No hay items seleccionados')

      // Validación crítica: sin companyId no podemos guardar nada
      if (!companyId || companyId.length < 30) {
        console.error('[MenuImportWizard] companyId inválido:', companyId)
        throw new Error(
          `No se identificó la empresa (companyId="${companyId}"). ` +
          `Cierra este diálogo, espera 2 segundos a que cargue la página y vuelve a intentar.`
        )
      }

      // Validar que el usuario actual está autenticado y su company coincide
      const { data: { user }, error: userErr } = await supabase.auth.getUser()
      if (userErr || !user) {
        throw new Error('Tu sesión expiró. Recarga la página e inicia sesión de nuevo.')
      }

      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('company_id, role, is_admin')
        .eq('id', user.id)
        .maybeSingle()

      if (profErr || !profile) {
        throw new Error('No se pudo verificar tu perfil: ' + (profErr?.message || 'sin perfil'))
      }

      if (profile.company_id !== companyId) {
        console.error('[MenuImportWizard] Mismatch:', { wizardCompanyId: companyId, profileCompanyId: profile.company_id })
        throw new Error(
          `El ID de empresa del wizard no coincide con tu perfil. ` +
          `Cierra el diálogo y recarga la página.`
        )
      }


      // 1) Cargar categorías existentes para esta company
      const { data: existingCats, error: catsErr } = await supabase
        .from('menu_categories')
        .select('id, name')
        .eq('company_id', companyId)

      if (catsErr) {
        console.error('[MenuImportWizard] Error cargando categorías:', catsErr)
        throw new Error('No se pudieron cargar las categorías existentes: ' + catsErr.message)
      }

      const existingByName = new Map((existingCats || []).map((c: any) => [c.name.toLowerCase(), c.id]))

      // 2) Crear las categorías nuevas necesarias
      const neededCats = Array.from(new Set(toImport.map(it => (it.category || '').trim()).filter(Boolean)))
      const catsToCreate = neededCats.filter(name => !existingByName.has(name.toLowerCase()))

      if (catsToCreate.length > 0) {
        const { data: newCats, error: createCatsErr } = await supabase
          .from('menu_categories')
          .insert(catsToCreate.map((name, idx) => ({
            company_id: companyId,
            name,
            display_order: (existingCats?.length || 0) + idx
          })) as never)
          .select('id, name')

        if (createCatsErr) {
          console.error('[MenuImportWizard] Error creando categorías:', createCatsErr)
          throw new Error(
            'No se pudieron crear las categorías: ' + createCatsErr.message +
            (createCatsErr.code === '42501' ? ' (sin permisos RLS — pide a tu admin revisar tu rol)' : '')
          )
        }
        if (!newCats || newCats.length === 0) {
          throw new Error(
            `Se intentaron crear ${catsToCreate.length} categorías pero ninguna se registró. ` +
            `Causa: las políticas RLS de menu_categories están rechazando tus inserts. ` +
            `Verifica que tu rol sea 'admin' o 'staff'.`
          )
        }
        ;(newCats || []).forEach((c: any) => existingByName.set(c.name.toLowerCase(), c.id))
      }

      // 3) Construir payload de items con category_id resuelto
      const itemsToInsert = toImport.map(it => {
        const { _selected, _editing, category, ...rest } = it
        const clean: any = {
          company_id: companyId,
          name: it.name.trim(),
          is_available: true
        }
        const categoryId = existingByName.get((category || '').trim().toLowerCase())
        if (categoryId && typeof categoryId === 'string' && categoryId.length === 36) {
          clean.category_id = categoryId
        }
        if (rest.description)                                    clean.description = rest.description
        if (rest.price !== undefined && rest.price !== null)     clean.price = rest.price
        if (rest.tags?.length)                                    clean.tags = rest.tags
        if (rest.allergens?.length)                               clean.allergens = rest.allergens
        if (rest.is_recommended)                                  clean.is_recommended = true
        return clean
      })


      // 4) Insertar items USANDO .select() para verificar cuántos realmente se insertaron
      //    (sin .select() no nos enteramos si RLS bloqueó silently)
      const { data: insertedItems, error: insertErr } = await supabase
        .from('menu_items')
        .insert(itemsToInsert as never)
        .select('id')

      if (insertErr) {
        console.error('[MenuImportWizard] Error insertando items:', insertErr)
        throw new Error(
          'No se pudieron guardar los platillos: ' + insertErr.message +
          (insertErr.code === '42501' ? ' (sin permisos RLS)' : '') +
          (insertErr.code === '23502' ? ' (falta un campo obligatorio)' : '')
        )
      }

      const insertedCount = insertedItems?.length || 0

      // 5) Si insert se ejecutó pero retornó 0 filas, hubo bloqueo de RLS u otro problema
      if (insertedCount === 0) {
        throw new Error(
          `Se intentaron guardar ${itemsToInsert.length} platillos pero ninguno quedó registrado. ` +
          `Causa probable: las políticas RLS de menu_items están bloqueando tus inserts. ` +
          `Verifica con tu admin que tu rol tenga permisos de escritura.`
        )
      }

      // 6) Si insert parcial, avisar
      if (insertedCount < itemsToInsert.length) {
        console.warn('[MenuImportWizard] Inserción parcial:', insertedCount, '/', itemsToInsert.length)
      }

      return {
        items: insertedCount,
        attempted: itemsToInsert.length,
        newCategories: catsToCreate.length
      }
    },
    onSuccess: (result) => {
      const partial = result.items < result.attempted
      if (partial) {
        toast.success(`Solo ${result.items} de ${result.attempted} platillos importados${result.newCategories > 0 ? ` y ${result.newCategories} categorías creadas` : ''}`, { duration: 5000 })
      } else {
        toast.success(`${result.items} platillos importados${result.newCategories > 0 ? ` y ${result.newCategories} categorías creadas` : ''}`)
      }
      // Invalidar con prefix para que TODOS los queryKey variants
      // (independiente de companyId) se refresquen
      queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      queryClient.invalidateQueries({ queryKey: ['menu-categories'] })
      // Forzar refetch inmediato por si la invalidación no dispara
      queryClient.refetchQueries({ queryKey: ['menu-items'] })
      queryClient.refetchQueries({ queryKey: ['menu-categories'] })
      handleClose()
    },
    onError: (err: any) => {
      console.error('[MenuImportWizard] Mutation error:', err)
      setError(err.message || 'Error desconocido al importar')
      toast.error(err.message || 'Error desconocido al importar', { duration: 8000 })
    }
  })

  const handleClose = () => {
    setPhase('upload')
    setItems([])
    setPdfFilename(null)
    setError(null)
    onClose()
  }

  const toggleSelected = (idx: number) => setItems(items.map((it, i) => i === idx ? { ...it, _selected: !it._selected } : it))

  const updateItem = (idx: number, field: keyof ExtractedItem, value: any) => {
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const selectedCount = items.filter(it => it._selected).length

  // Agrupar por categoría para vista
  const grouped: Record<string, { items: ExtractedItem[], indices: number[] }> = {}
  items.forEach((it, idx) => {
    if (!grouped[it.category]) grouped[it.category] = { items: [], indices: [] }
    grouped[it.category].items.push(it)
    grouped[it.category].indices.push(idx)
  })

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
              <h2 className="text-lg font-black text-slate-900">Importar menú desde PDF</h2>
              <p className="text-xs text-slate-500 font-medium">
                {phase === 'upload' && 'DeepSeek leerá tu carta y extraerá los platillos automáticamente'}
                {phase === 'processing' && 'DeepSeek está analizando tu menú...'}
                {phase === 'review' && `${items.length} platillos en ${Object.keys(grouped).length} categorías · ${selectedCount} seleccionados`}
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
              <div className="border-2 border-dashed border-slate-300 hover:border-orange-400 hover:bg-orange-50/30 rounded-3xl p-12 text-center transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
                  className="hidden"
                />
                <Upload size={48} className="text-slate-400 mx-auto mb-4" />
                <p className="text-base font-black text-slate-800 mb-2">Sube tu menú en PDF</p>
                <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto leading-relaxed">
                  Sube la carta de tu restaurante. DeepSeek identificará categorías y platillos con sus precios. Revisa y edita antes de importar.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl text-sm font-bold inline-flex items-center gap-2"
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
                <FileText size={56} className="text-orange-600" />
                <Sparkles size={20} className="text-amber-500 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <p className="text-lg font-black text-slate-800 mb-2">{pdfFilename}</p>
              <p className="text-sm text-slate-500 mb-6">DeepSeek está identificando categorías y platillos...</p>
              <IAnswerLoader size={32} />
              <p className="text-[10px] text-slate-400 mt-4">Esto puede tomar 20-60 segundos</p>
            </div>
          )}

          {/* FASE 3: REVIEW agrupado por categoría */}
          {phase === 'review' && (
            <div className="space-y-5">
              {items.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle size={32} className="text-amber-500 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-700">No se identificaron platillos</p>
                  <p className="text-xs text-slate-500 mt-1">Intenta con un PDF más estructurado o crea el menú manualmente.</p>
                </div>
              ) : (
                <>
                  {/* Bulk */}
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-xl sticky top-0 z-10 -mt-1">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setItems(items.map(it => ({ ...it, _selected: true })))} className="text-xs font-bold text-slate-600 hover:text-slate-900">
                        Seleccionar todo
                      </button>
                      <span className="text-slate-300">·</span>
                      <button onClick={() => setItems(items.map(it => ({ ...it, _selected: false })))} className="text-xs font-bold text-slate-600 hover:text-slate-900">
                        Nada
                      </button>
                    </div>
                    <p className="text-xs font-bold text-slate-700">{selectedCount} de {items.length}</p>
                  </div>

                  {/* Categorías */}
                  {Object.entries(grouped).map(([catName, group]) => (
                    <div key={catName}>
                      <h3 className="font-black text-slate-800 text-sm mb-2 px-1 flex items-center gap-2">
                        <span className="text-orange-600">📂</span> {catName}
                        <span className="text-xs text-slate-400 font-bold">({group.items.length})</span>
                      </h3>
                      <div className="space-y-2">
                        {group.items.map((it, localIdx) => {
                          const idx = group.indices[localIdx]
                          return (
                            <div key={idx} className={`border-2 rounded-2xl p-3 transition-colors flex gap-3 ${it._selected ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
                              <button
                                onClick={() => toggleSelected(idx)}
                                className={`h-6 w-6 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 ${it._selected ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300 bg-white'}`}
                              >
                                {it._selected && <Check size={14} className="text-white" />}
                              </button>

                              <div className="flex-1 min-w-0">
                                {!it._editing ? (
                                  <div className="flex items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-black text-slate-800 text-sm">{it.name}</p>
                                        {it.is_recommended && <Star size={12} className="text-amber-500 fill-current" />}
                                        {it.price != null && <span className="text-sm font-black text-emerald-700">${it.price}</span>}
                                      </div>
                                      {it.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{it.description}</p>}
                                      {(it.tags?.length || it.allergens?.length) && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                          {it.tags?.map((t, i) => (
                                            <span key={`t-${i}`} className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">{t}</span>
                                          ))}
                                          {it.allergens?.map((a, i) => (
                                            <span key={`a-${i}`} className="text-[9px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded-full">⚠ {a}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => updateItem(idx, '_editing', true)}
                                      className="text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-lg shrink-0"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <input
                                      type="text"
                                      value={it.name}
                                      onChange={e => updateItem(idx, 'name', e.target.value)}
                                      className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-orange-500"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                      <input
                                        type="number"
                                        value={it.price ?? ''}
                                        onChange={e => updateItem(idx, 'price', e.target.value === '' ? undefined : Number(e.target.value))}
                                        placeholder="Precio"
                                        className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-orange-500"
                                      />
                                      <input
                                        type="text"
                                        value={it.description || ''}
                                        onChange={e => updateItem(idx, 'description', e.target.value)}
                                        placeholder="Descripción"
                                        className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-orange-500"
                                      />
                                    </div>
                                    <button onClick={() => updateItem(idx, '_editing', false)} className="text-[10px] font-bold text-orange-700 hover:text-orange-900">
                                      ✓ Terminar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'review' && items.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 shrink-0">

            {/* Banner de error inline si la importación falló */}
            {error && (
              <div className="px-6 py-3 bg-rose-50 border-b border-rose-200 flex items-start gap-3">
                <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-rose-900 mb-1">No se pudo importar</p>
                  <p className="text-xs text-rose-800 font-medium leading-relaxed">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-rose-600 hover:text-rose-900 p-1"
                  aria-label="Cerrar"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="px-6 py-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Las categorías nuevas se crearán automáticamente. Los items se marcan como <strong>disponibles</strong>.
              </p>
              <button
                onClick={() => { setError(null); importMutation.mutate() }}
                disabled={importMutation.isPending || selectedCount === 0}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md"
              >
                {importMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Importar {selectedCount}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
