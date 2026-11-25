'use client'

import { Coffee } from 'lucide-react'
import { DAYS_OF_WEEK } from '../lib/agendaSetup'

export type WorkingHour = {
  day_of_week: number
  start_time: string
  end_time: string
  has_break: boolean
  break_start_time: string
  break_end_time: string
  slot_duration: number
  is_active: boolean
  agenda_id?: string
}

/** Duración de cita y días/horas de atención de una agenda. No guarda: avisa con onChange. */
export default function WorkingHoursEditor({ hours, onChange }: { hours: WorkingHour[], onChange: (hours: WorkingHour[]) => void }) {
  const updateDay = <K extends keyof WorkingHour>(dayIndex: number, field: K, value: WorkingHour[K]) => {
    onChange(hours.map(h => h.day_of_week === dayIndex ? { ...h, [field]: value } : h))
  }

  const updateAllDurations = (duration: number) => {
    onChange(hours.map(h => ({ ...h, slot_duration: duration })))
  }

  return (
    <>
    <div className="mb-6 pb-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <p className="text-sm font-bold text-slate-700">Duración de cada cita (aplica para todos los días)</p>
      <select 
        value={hours[1]?.slot_duration || 30} 
        onChange={(e) => updateAllDurations(Number(e.target.value))}
        className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value={15}>15 Minutos</option>
        <option value={20}>20 Minutos</option>
        <option value={30}>30 Minutos</option>
        <option value={45}>45 Minutos</option>
        <option value={60}>1 Hora</option>
      </select>
    </div>

    <div className="space-y-3">
      {hours.map((day) => (
        <div key={day.day_of_week} className={`flex flex-col p-4 rounded-xl border transition-all ${day.is_active ? 'bg-white border-blue-100 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-48">
              <input 
                type="checkbox" 
                checked={day.is_active} 
                onChange={(e) => updateDay(day.day_of_week, 'is_active', e.target.checked)}
                className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="font-bold text-sm text-slate-700 uppercase tracking-wide">{DAYS_OF_WEEK[day.day_of_week]}</span>
            </div>
            
            <div className="flex items-center gap-3 opacity-100 transition-opacity flex-wrap" style={{ opacity: day.is_active ? 1 : 0.5 }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">DE</span>
                <input type="time" disabled={!day.is_active} value={day.start_time} onChange={(e) => updateDay(day.day_of_week, 'start_time', e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">A</span>
                <input type="time" disabled={!day.is_active} value={day.end_time} onChange={(e) => updateDay(day.day_of_week, 'end_time', e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold" />
              </div>
            </div>
          </div>

          {day.is_active && (
            <div className="mt-3 pt-3 border-t border-slate-50 flex flex-col md:flex-row md:items-center gap-4 md:pl-[3.25rem]">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={day.has_break} 
                  onChange={(e) => updateDay(day.day_of_week, 'has_break', e.target.checked)}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                <Coffee size={14} className={day.has_break ? "text-orange-500" : "text-slate-400"} />
                Añadir Descanso / Comida
              </label>
              
              {day.has_break && (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400">INICIA</span>
                    <input type="time" value={day.break_start_time} onChange={(e) => updateDay(day.day_of_week, 'break_start_time', e.target.value)} className="px-2 py-1 bg-orange-50 border border-orange-200 rounded text-xs outline-none focus:ring-1 focus:ring-orange-500 font-bold text-orange-800" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400">TERMINA</span>
                    <input type="time" value={day.break_end_time} onChange={(e) => updateDay(day.day_of_week, 'break_end_time', e.target.value)} className="px-2 py-1 bg-orange-50 border border-orange-200 rounded text-xs outline-none focus:ring-1 focus:ring-orange-500 font-bold text-orange-800" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
    </>
  )
}
