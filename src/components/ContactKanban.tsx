 

'use client'

import { useState } from 'react'
import {
  Sparkles, Flame, CreditCard, Heart, User, Phone, Calendar as CalendarIcon,
  MessageSquare, PowerOff, GripVertical
} from 'lucide-react'

type LifecycleStage = 'new_lead' | 'hot_lead' | 'payment' | 'customer'

type KanbanContact = {
  id: string
  name: string
  phone: string
  lifecycle_stage: LifecycleStage
  ai_active: boolean
  staff_id?: string
  last_inbound_at?: string | null
  days_since_inbound?: number | null
  next_appointment?: { date: string, time: string, status: string } | null
  total_appointments: number
}

type StageInfo = {
  id: LifecycleStage
  label: string
  icon: any
  headerBg: string
  headerText: string
  columnBg: string
  borderColor: string
}

const stagesConfig = (funnels: any): StageInfo[] => ([
  { id: 'new_lead', label: funnels?.new_lead || 'Nuevo Lead', icon: Sparkles,    headerBg: 'bg-blue-500',    headerText: 'text-white', columnBg: 'bg-blue-50/30',    borderColor: 'border-blue-200' },
  { id: 'hot_lead', label: funnels?.hot_lead || 'Interesado', icon: Flame,       headerBg: 'bg-orange-500',  headerText: 'text-white', columnBg: 'bg-orange-50/30',  borderColor: 'border-orange-200' },
  { id: 'payment',  label: funnels?.payment  || 'En Proceso', icon: CreditCard,  headerBg: 'bg-emerald-500', headerText: 'text-white', columnBg: 'bg-emerald-50/30', borderColor: 'border-emerald-200' },
  { id: 'customer', label: funnels?.customer || 'Cliente',    icon: Heart,       headerBg: 'bg-purple-500',  headerText: 'text-white', columnBg: 'bg-purple-50/30',  borderColor: 'border-purple-200' }
])

const formatRelativeTime = (ts?: string | null): string => {
  if (!ts) return ''
  const diff = (Date.now() - new Date(ts).getTime()) / 1000
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return `${Math.floor(diff / 604800)}sem`
}

const formatNextDate = (next?: any): string => {
  if (!next) return ''
  const date = new Date(`${next.date}T${next.time}`)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  if (date.toDateString() === today.toDateString()) return `Hoy ${next.time.slice(0, 5)}`
  if (date.toDateString() === tomorrow.toDateString()) return `Mañana ${next.time.slice(0, 5)}`
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ` ${next.time.slice(0, 5)}`
}

export default function ContactKanban<T extends KanbanContact>({
  contacts, team, funnels, onContactClick, onMoveContact, onOpenChat
}: {
  contacts: T[]
  team: { id: string, name: string }[]
  funnels: any
  onContactClick: (c: T) => void
  onMoveContact: (id: string, newStage: LifecycleStage) => void
  onOpenChat: (id: string) => void
}) {
  const stages = stagesConfig(funnels)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<LifecycleStage | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverStage(null)
  }

  const handleDragOver = (e: React.DragEvent, stage: LifecycleStage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverStage !== stage) setDragOverStage(stage)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Solo limpiar si salimos del contenedor completo
    if (e.currentTarget === e.target) setDragOverStage(null)
  }

  const handleDrop = (e: React.DragEvent, stage: LifecycleStage) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    const contact = contacts.find(c => c.id === id)
    if (!contact || contact.lifecycle_stage === stage) {
      setDraggingId(null); setDragOverStage(null); return
    }
    onMoveContact(id, stage)
    setDraggingId(null)
    setDragOverStage(null)
  }

  // Agrupar por etapa
  const byStage: Record<LifecycleStage, T[]> = {
    new_lead: [], hot_lead: [], payment: [], customer: []
  }
  contacts.forEach(c => {
    if (byStage[c.lifecycle_stage]) byStage[c.lifecycle_stage].push(c)
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stages.map(stage => {
        const items = byStage[stage.id]
        const Icon = stage.icon
        const isDropTarget = dragOverStage === stage.id

        return (
          <div
            key={stage.id}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage.id)}
            className={`rounded-2xl border-2 transition-all ${isDropTarget ? `${stage.borderColor} ring-4 ring-offset-2 ring-blue-200 scale-[1.01]` : 'border-slate-200'} ${stage.columnBg}`}
          >
            {/* Header de columna */}
            <div className={`${stage.headerBg} ${stage.headerText} px-4 py-3 rounded-t-xl flex items-center justify-between sticky top-0 z-10`}>
              <div className="flex items-center gap-2 min-w-0">
                <Icon size={16} className="shrink-0" />
                <h3 className="font-black text-sm truncate">{stage.label}</h3>
              </div>
              <span className="text-xs font-black bg-white/25 px-2.5 py-0.5 rounded-full shrink-0">{items.length}</span>
            </div>

            {/* Tarjetas */}
            <div className="p-3 space-y-2 min-h-[300px] max-h-[calc(100vh-360px)] overflow-y-auto">
              {items.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400 font-medium italic">
                  Arrastra aquí o sin contactos
                </div>
              ) : (
                items.map(c => {
                  const assigned = team.find(t => t.id === c.staff_id)?.name
                  const isDragging = draggingId === c.id
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, c.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onContactClick(c)}
                      className={`group bg-white border border-slate-200 rounded-xl p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:border-slate-300 transition-all ${isDragging ? 'opacity-40 scale-95' : ''}`}
                    >
                      {/* Header de la card */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <GripVertical size={12} className="text-slate-300 shrink-0" />
                          <p className="font-black text-slate-900 text-sm truncate">{c.name || 'Sin Nombre'}</p>
                          {!c.ai_active && <PowerOff size={11} className="text-rose-400 shrink-0" />}
                        </div>
                      </div>

                      {/* Datos */}
                      <div className="space-y-1.5 ml-4">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                          <Phone size={10} className="text-slate-400" />
                          <span className="truncate">{c.phone}</span>
                        </div>

                        {c.next_appointment && (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold">
                            <CalendarIcon size={10} className="text-emerald-600" />
                            <span className="text-emerald-700">{formatNextDate(c.next_appointment)}</span>
                          </div>
                        )}

                        {assigned && (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                            <User size={10} className="text-slate-400" />
                            <span className="truncate">{assigned}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                          {c.last_inbound_at && (
                            <span>{formatRelativeTime(c.last_inbound_at)}</span>
                          )}
                          {c.total_appointments > 0 && (
                            <>
                              {c.last_inbound_at && <span>·</span>}
                              <span>{c.total_appointments} citas</span>
                            </>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenChat(c.id) }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                          title="Chat"
                        >
                          <MessageSquare size={11} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
