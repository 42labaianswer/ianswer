'use client'

// Configuración → Marca de tu negocio: logo y colores que usan las páginas
// públicas del negocio (menú en línea, seguimiento de pedidos, catálogo web).
// Sin colores propios esas páginas usan los de iAnswer (lib/publicBrand).

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import toast from 'react-hot-toast'
import { ImagePlus, Loader2, RotateCcw, Save } from 'lucide-react'
import {
  usePublicDirectoryConfig, useUpdatePublicDirectoryConfig, useUploadCompanyLogo,
} from '../hooks/usePublicDirectoryConfig'
import { publicBrandColors, tint } from '../lib/publicBrand'

const DEFAULT_PRIMARY = '#0f172a'
const DEFAULT_SECONDARY = '#64748b'

export default function BrandTab() {
  const { data: config, isLoading } = usePublicDirectoryConfig()
  const updateMut = useUpdatePublicDirectoryConfig()
  const uploadMut = useUploadCompanyLogo()
  const fileRef = useRef<HTMLInputElement>(null)

  const [primary, setPrimary] = useState(DEFAULT_PRIMARY)
  const [secondary, setSecondary] = useState(DEFAULT_SECONDARY)

  useEffect(() => {
    if (!config) return
    setPrimary(config.primary_color || DEFAULT_PRIMARY)
    setSecondary(config.secondary_color || DEFAULT_SECONDARY)
  }, [config])

  if (isLoading || !config) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    )
  }

  const usesOwnColors = primary.toLowerCase() !== DEFAULT_PRIMARY || secondary.toLowerCase() !== DEFAULT_SECONDARY
  const preview = publicBrandColors(primary, secondary)
  const dirty = primary !== (config.primary_color || DEFAULT_PRIMARY) || secondary !== (config.secondary_color || DEFAULT_SECONDARY)

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploadMut.mutate(file, {
      onSuccess: () => toast.success('Logo actualizado'),
      onError: (err: Error) => toast.error(err.message),
      onSettled: () => { if (fileRef.current) fileRef.current.value = '' },
    })
  }

  const save = async () => {
    try {
      await updateMut.mutateAsync({ primary_color: primary, secondary_color: secondary })
      toast.success('Colores guardados')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron guardar los colores')
    }
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-8">
      <div>
        <h2 className="text-xl font-black text-slate-900">Marca de tu negocio</h2>
        <p className="text-sm text-slate-500 font-medium mt-1">
          Tu logo y tus colores aparecen en las páginas que ven tus clientes: tu menú en línea, el seguimiento de pedidos y tu catálogo.
          Si no eliges colores, se usan los de iAnswer.
        </p>
      </div>

      {/* Logo */}
      <section className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-20 w-20 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
          {config.logo_url
            ? <img src={config.logo_url} alt="Logo de tu negocio" className="max-h-16 max-w-16 object-contain" />
            : <ImagePlus size={24} className="text-slate-300" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-900">Logo</p>
          <p className="text-xs text-slate-500">PNG, JPG, SVG o WebP, de hasta 2 MB. De preferencia con fondo transparente.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploadMut.isPending}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-bold text-slate-800 disabled:opacity-50"
        >
          {uploadMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
          {config.logo_url ? 'Cambiar logo' : 'Subir logo'}
        </button>
      </section>

      {/* Colores */}
      <section className="grid sm:grid-cols-2 gap-4">
        <ColorField
          label="Color principal"
          hint="Encabezado y textos destacados."
          value={primary}
          onChange={setPrimary}
        />
        <ColorField
          label="Color de acento"
          hint="Precios, estados y botones."
          value={secondary}
          onChange={setSecondary}
        />
      </section>

      {/* Vista previa */}
      <section>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Vista previa</p>
        <div className="rounded-2xl border border-slate-200 overflow-hidden max-w-sm">
          <div className="px-4 py-3 flex items-center gap-3 text-white" style={{ backgroundColor: preview.primary }}>
            {config.logo_url
              ? <img src={config.logo_url} alt="" className="h-7 max-w-[120px] object-contain" />
              : <span className="h-7 w-7 rounded-lg bg-white/20 flex items-center justify-center text-xs font-black">{(config.name || 'N').charAt(0)}</span>}
            <span className="text-sm font-black truncate">{config.name}</span>
          </div>
          <div className="p-4 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-slate-100">
              <span className="text-sm font-bold text-slate-800">Platillo de ejemplo</span>
              <span className="text-sm font-black" style={{ color: preview.accent }}>$150</span>
            </div>
            <span className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ backgroundColor: tint(preview.accent, 15), color: preview.accent }}>
              En preparación
            </span>
          </div>
        </div>
        {!usesOwnColors && (
          <p className="text-xs text-slate-500 mt-2">Así se ve con los colores de iAnswer.</p>
        )}
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {usesOwnColors && (
          <button
            type="button"
            onClick={() => { setPrimary(DEFAULT_PRIMARY); setSecondary(DEFAULT_SECONDARY) }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
          >
            <RotateCcw size={14} /> Usar los colores de iAnswer
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || updateMut.isPending}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold disabled:opacity-40"
        >
          {updateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Guardar colores
        </button>
      </div>
    </div>
  )
}

function ColorField({ label, hint, value, onChange }: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        onChange={e => onChange(e.target.value)}
        className="h-10 w-10 rounded-lg border border-slate-200 cursor-pointer bg-white"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <span className="text-xs font-mono text-slate-500 uppercase">{value}</span>
    </label>
  )
}
