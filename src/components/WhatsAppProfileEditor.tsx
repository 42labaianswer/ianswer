 

'use client'

// src/components/WhatsAppProfileEditor.tsx
// ----------------------------------------------------------------------------
// Sprint W · Panel para editar el perfil de WhatsApp Business desde la
// plataforma, sin entrar a Meta Business Manager.
//
// El cliente edita: foto, "acerca de", descripción, dirección, email, sitios
// web y categoría. Se guarda vía la Graph API con el meta_token.
// ----------------------------------------------------------------------------

import { useState, useEffect, useRef, type ChangeEvent } from 'react'
import {
  MessageCircle, Camera, Loader2, Save, Globe, MapPin, Mail, Info,
  AlertCircle, Check,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useWhatsAppProfile,
  useSaveWhatsAppProfile,
  useUploadWhatsAppPhoto,
  type WhatsAppProfile,
} from '../hooks/useWhatsAppProfile'
import { VERTICAL_OPTIONS, DEFAULT_VERTICAL, normalizeVertical } from '../lib/whatsappVerticals'
import IAnswerLoader from './IAnswerLoader'

// Categorías de negocio que Meta acepta (las más comunes)
// La lista de categorías vive en src/lib/whatsappVerticals.ts,
// compartida con la ruta de API que valida antes de llamar a Meta.
const ABOUT_MAX = 139

export default function WhatsAppProfileEditor({ accentColor = '#25D366' }: { accentColor?: string }) {
  const { data: profile, isLoading, error } = useWhatsAppProfile()
  const saveMut = useSaveWhatsAppProfile()
  const photoMut = useUploadWhatsAppPhoto()
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<WhatsAppProfile>({})

  useEffect(() => {
    if (profile) setForm(profile)
  }, [profile])

  function patch(updates: Partial<WhatsAppProfile>) {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen debe pesar menos de 5MB')
      return
    }
    try {
      await photoMut.mutateAsync(file)
      toast.success('Foto de perfil actualizada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir la foto')
    }
  }

  async function handleSave() {
    try {
      await saveMut.mutateAsync({
        about: form.about,
        description: form.description,
        address: form.address,
        email: form.email,
        // Si la categoría no es válida para Meta, se omite en vez de
        // mandar basura: Meta rechaza toda la petición por un solo campo.
        vertical: normalizeVertical(form.vertical) ?? undefined,
        websites: form.websites?.filter((w) => w.trim()),
      })
      toast.success('Perfil de WhatsApp actualizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  // WhatsApp no conectado
  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-4">
          <AlertCircle size={26} />
        </div>
        <h3 className="font-black text-slate-900 mb-1">WhatsApp no conectado</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto mb-4">
          Conecta tu número de WhatsApp Business en Conectividad para poder editar tu perfil desde aquí.
        </p>
        <a
          href="/dashboard/connectivity"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold"
          style={{ backgroundColor: accentColor }}
        >
          Ir a Conectividad
        </a>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 flex justify-center">
        <IAnswerLoader size={26} />
      </div>
    )
  }

  const aboutLen = (form.about || '').length

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: accentColor }}>
          <MessageCircle size={17} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900">Perfil de WhatsApp Business</h3>
          <p className="text-xs text-slate-500">Así te ven tus clientes en WhatsApp</p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Foto de perfil */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="h-20 w-20 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
              {form.profile_picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.profile_picture_url} alt="Perfil" className="h-full w-full object-cover" />
              ) : (
                <MessageCircle size={28} className="text-slate-300" />
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={photoMut.isPending}
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full text-white flex items-center justify-center shadow-md border-2 border-white"
              style={{ backgroundColor: accentColor }}
            >
              {photoMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handlePhoto} className="hidden" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Foto de perfil</p>
            <p className="text-xs text-slate-500">JPG o PNG, máx 5MB. Cuadrada se ve mejor.</p>
          </div>
        </div>

        {/* Acerca de (about) */}
        <div className="space-y-1.5">
          <label className="flex items-center justify-between text-xs font-black text-slate-500 uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Info size={12} /> Acerca de</span>
            <span className={aboutLen > ABOUT_MAX ? 'text-red-500' : 'text-slate-400'}>{aboutLen}/{ABOUT_MAX}</span>
          </label>
          <input
            value={form.about || ''}
            onChange={(e) => patch({ about: e.target.value.slice(0, ABOUT_MAX) })}
            placeholder="Ej. Disponibles de 9 a 6. ¡Escríbenos!"
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200"
          />
          <p className="text-[11px] text-slate-400">Es la frase corta que aparece debajo de tu nombre.</p>
        </div>

        {/* Descripción */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest">
            <MessageCircle size={12} /> Descripción
          </label>
          <textarea
            value={form.description || ''}
            onChange={(e) => patch({ description: e.target.value })}
            rows={3}
            placeholder="Describe tu negocio con más detalle..."
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200 resize-none"
          />
        </div>

        {/* Categoría */}
        <div className="space-y-1.5">
          <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Categoría del negocio</label>
          <select
            value={normalizeVertical(form.vertical) || DEFAULT_VERTICAL}
            onChange={(e) => patch({ vertical: e.target.value })}
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200"
          >
            {VERTICAL_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Dirección + Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest">
              <MapPin size={12} /> Dirección
            </label>
            <input
              value={form.address || ''}
              onChange={(e) => patch({ address: e.target.value })}
              placeholder="Calle, número, ciudad"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest">
              <Mail size={12} /> Email
            </label>
            <input
              value={form.email || ''}
              onChange={(e) => patch({ email: e.target.value })}
              placeholder="contacto@negocio.com"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>

        {/* Sitios web (hasta 2) */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-widest">
            <Globe size={12} /> Sitios web (hasta 2)
          </label>
          <input
            value={form.websites?.[0] || ''}
            onChange={(e) => {
              const w = [...(form.websites || [])]
              w[0] = e.target.value
              patch({ websites: w })
            }}
            placeholder="https://tunegocio.com"
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200 mb-2"
          />
          <input
            value={form.websites?.[1] || ''}
            onChange={(e) => {
              const w = [...(form.websites || [])]
              w[1] = e.target.value
              patch({ websites: w })
            }}
            placeholder="https://instagram.com/tunegocio"
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {/* Guardar */}
        <button
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: accentColor }}
        >
          {saveMut.isPending ? (
            <><Loader2 size={16} className="animate-spin" /> Guardando...</>
          ) : (
            <><Save size={16} /> Guardar perfil</>
          )}
        </button>
      </div>
    </div>
  )
}
