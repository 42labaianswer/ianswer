 

'use client'

// src/components/ContactAutocomplete.tsx
// ----------------------------------------------------------------------------
// Sprint AQ · Campo de cliente con autocompletado.
//
// Mientras escribes el nombre, filtra los contactos existentes. Si eliges uno,
// llena nombre + teléfono. Si no existe, se crea al guardar la orden (eso lo
// hace el hook findOrCreateContact desde el drawer).
// ----------------------------------------------------------------------------

import { useState, useMemo, useRef, useEffect } from 'react'
import { User, Phone, Check, UserPlus } from 'lucide-react'
import { useContactsForOrder, type ContactLite } from '../hooks/useContactsForOrder'

export default function ContactAutocomplete({
  companyId,
  name,
  phone,
  onNameChange,
  onPhoneChange,
  onSelectContact,
}: {
  companyId: string
  name: string
  phone: string
  onNameChange: (v: string) => void
  onPhoneChange: (v: string) => void
  onSelectContact?: (c: ContactLite) => void
}) {
  const { data: contacts = [] } = useContactsForOrder(companyId)
  const [showList, setShowList] = useState(false)
  const [justPicked, setJustPicked] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Filtrar por lo que se escribe (nombre o teléfono)
  const matches = useMemo(() => {
    const q = name.trim().toLowerCase()
    if (!q || justPicked) return []
    return contacts
      .filter((c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      )
      .slice(0, 6)
  }, [name, contacts, justPicked])

  // Cerrar la lista al hacer click afuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowList(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function pick(c: ContactLite) {
    onNameChange(c.name || '')
    onPhoneChange(c.phone || '')
    onSelectContact?.(c)
    setShowList(false)
    setJustPicked(true)
  }

  const noMatchButTyped = name.trim().length > 1 && matches.length === 0 && !justPicked

  return (
    <div className="space-y-2.5" ref={wrapRef}>
      <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Cliente</h3>

      {/* Nombre con autocompletado */}
      <div className="relative">
        <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={name}
          onChange={(e) => { onNameChange(e.target.value); setShowList(true); setJustPicked(false) }}
          onFocus={() => setShowList(true)}
          placeholder="Nombre del cliente"
          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-200"
          autoComplete="off"
        />

        {/* Lista de coincidencias */}
        {showList && matches.length > 0 && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left transition-colors"
              >
                <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <User size={13} className="text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{c.name || 'Sin nombre'}</p>
                  {c.phone && <p className="text-[11px] text-slate-400">{c.phone}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Teléfono */}
      <div className="relative">
        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="Teléfono (WhatsApp)"
          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-200"
          autoComplete="off"
        />
      </div>

      {/* Aviso de contacto nuevo */}
      {noMatchButTyped && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 px-1">
          <UserPlus size={12} />
          <span>Cliente nuevo — se creará al guardar la orden</span>
        </div>
      )}
      {justPicked && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 px-1">
          <Check size={12} />
          <span>Contacto existente seleccionado</span>
        </div>
      )}
    </div>
  )
}
