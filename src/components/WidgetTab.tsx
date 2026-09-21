 

'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CodeXml, Copy, CheckCircle2, Globe, ExternalLink, AlertCircle } from 'lucide-react'
import IAnswerLoader from './IAnswerLoader'

export default function WidgetTab({ companyId }: { companyId: string }) {
  const [selectedAgendaId, setSelectedAgendaId] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    // Obtenemos la URL base (http://localhost:3000 o https://tudominio.com)
    setBaseUrl(window.location.origin)
  }, [])

  // 1. Obtener Agendas de la empresa
  const { data: agendas = [], isLoading } = useQuery({
    queryKey: ['agendasDataWidget', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('agendas').select('id, name, google_calendar_id').eq('company_id', companyId)
      if (error) throw error
      return data || []
    }
  })

  // Seleccionar la primera agenda por defecto
  useEffect(() => {
    if (agendas.length > 0 && !selectedAgendaId) {
      setSelectedAgendaId(agendas[0].id)
    }
  }, [agendas, selectedAgendaId])

  if (isLoading) {
    return <div className="flex justify-center py-10"><IAnswerLoader size={32} /></div>
  }

  if (agendas.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm text-center animate-in fade-in duration-300">
        <div className="mx-auto w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4">
          <CodeXml size={32} />
        </div>
        <h2 className="text-xl font-black text-slate-800 mb-2">No tienes agendas configuradas</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-6">Para generar un Widget de reservas, primero necesitas crear una agenda y conectarla a Google Calendar en la pestaña correspondiente.</p>
      </div>
    )
  }

  const widgetUrl = `${baseUrl}/widget/${selectedAgendaId}`

  const iframeCode = `<iframe 
  src="${widgetUrl}" 
  width="100%" 
  height="700" 
  style="border: none; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);" 
  title="Agenda de Citas"
></iframe>`

  const handleCopy = () => {
    navigator.clipboard.writeText(iframeCode)
    setCopied(true)
    toast.success('¡Código copiado al portapapeles!')
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <section className="space-y-6 animate-in fade-in duration-300">
      
      <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <Globe size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800">Widget de Reservas</h2>
            <p className="text-sm text-slate-500">Incrusta el agendador directamente en tu sitio web.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              1. Selecciona la Agenda a mostrar
            </label>
            <select 
              value={selectedAgendaId} 
              onChange={(e) => setSelectedAgendaId(e.target.value)}
              className="w-full max-w-md px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-slate-700"
            >
              {agendas.map(agenda => (
                <option key={agenda.id} value={agenda.id}>
                  {agenda.name} {agenda.google_calendar_id ? '(Conectada)' : '(Sin conexión)'}
                </option>
              ))}
            </select>
            
            {agendas.find(a => a.id === selectedAgendaId)?.google_calendar_id === null && (
              <p className="flex items-center gap-1.5 text-xs font-bold text-rose-500 mt-2">
                <AlertCircle size={14} /> Esta agenda no está conectada a Google Calendar aún.
              </p>
            )}
          </div>

          <div className="pt-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              2. Copia este código HTML
            </label>
            <div className="relative group">
              <pre className="bg-slate-900 text-slate-300 p-5 rounded-2xl text-sm font-mono overflow-x-auto border border-slate-800 whitespace-pre-wrap">
                <code>{iframeCode}</code>
              </pre>
              <button 
                onClick={handleCopy}
                className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-bold transition-all backdrop-blur-md border border-white/10"
              >
                {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />} 
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Pega este código dentro del HTML de tu página web (WordPress, Wix, Shopify, etc.) donde quieras que aparezca el calendario.
            </p>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <p className="text-sm font-bold text-slate-700">¿Prefieres compartir un enlace directo?</p>
            <a 
              href={widgetUrl} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            >
              Abrir Widget <ExternalLink size={16} />
            </a>
          </div>

        </div>
      </div>
    </section>
  )
}
