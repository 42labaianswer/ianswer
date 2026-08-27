 

'use client'

// src/components/BusinessProfileBadge.tsx
// ----------------------------------------------------------------------------
// Badge del perfil de negocio en el inbox (simula WhatsApp).
//
// Muestra la foto + nombre del negocio (tomados del perfil de WhatsApp
// Business), como cuando abres WhatsApp y ves tu propio perfil arriba.
//
// Al hacer click abre un MODAL con el editor de perfil de WhatsApp (foto,
// "acerca de", descripción, etc.) en lugar de mandarte a Conectividad. Así se
// edita el perfil sin salir de Mensajes.
// ----------------------------------------------------------------------------

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil, MessageCircle, X, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useWhatsAppProfile } from '../hooks/useWhatsAppProfile'
import WhatsAppProfileEditor from './WhatsAppProfileEditor'

export default function BusinessProfileBadge({
  businessName,
  accentColor = '#25D366',
}: {
  businessName?: string
  accentColor?: string
  /** @deprecated Ya no se navega; el editor abre en un modal. Se mantiene por compatibilidad. */
  editorHref?: string
}) {
  const [open, setOpen] = useState(false)
  const { data: profile } = useWhatsAppProfile()

  // Si no se pasa el nombre, lo buscamos (nombre del negocio en companies)
  const { data: fallbackName } = useQuery({
    queryKey: ['business-name-badge'],
    enabled: !businessName,
    queryFn: async (): Promise<string> => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return 'Mi negocio'
      const { data: prof } = await supabase
        .from('profiles').select('company_id').eq('id', user.id).maybeSingle()
      if (!prof?.company_id) return 'Mi negocio'
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', prof.company_id)
        .maybeSingle()
      return (company?.name as string) || 'Mi negocio'
    },
    staleTime: 5 * 60 * 1000,
  })

  const displayName = businessName || fallbackName || 'Mi negocio'
  const photoUrl = profile?.profile_picture_url
  const about = profile?.about

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full group flex items-center gap-3 px-4 py-3 hover:bg-slate-100/70 transition-colors text-left border-b border-slate-200"
        title="Editar perfil de WhatsApp"
      >
        {/* Círculo de foto */}
        <div className="relative shrink-0">
          <div
            className="h-11 w-11 rounded-full overflow-hidden flex items-center justify-center text-white font-bold shadow-sm ring-2 ring-white"
            style={{ backgroundColor: accentColor }}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <MessageCircle size={20} />
            )}
          </div>
          {/* Ícono de editar al hacer hover */}
          <div
            className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full flex items-center justify-center shadow border-2 border-white opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: accentColor }}
          >
            <Pencil size={10} className="text-white" />
          </div>
        </div>

        {/* Nombre + about */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-slate-900 truncate">{displayName}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {about || 'Editar perfil de WhatsApp'}
          </p>
        </div>

        <Pencil size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
      </button>

      {/* MODAL: editor de perfil de WhatsApp Business */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: accentColor }}>
                  <MessageCircle size={17} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 leading-tight">Perfil de WhatsApp Business</h3>
                  <p className="text-[11px] text-slate-500">Así te ven tus clientes cuando les escribes</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700 bg-white p-1 rounded-full border border-slate-200 shadow-sm shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto p-4">
              {/* Nota: el nombre visible (verified name) lo gestiona Meta */}
              <div className="mb-4 flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                <Info size={15} className="text-slate-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Aquí editas tu <strong>foto</strong> y la información del perfil. El <strong>nombre visible</strong> de tu WhatsApp Business lo aprueba Meta (nombre verificado) y se cambia desde tu cuenta de Meta Business.
                </p>
              </div>
              <WhatsAppProfileEditor accentColor={accentColor} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

