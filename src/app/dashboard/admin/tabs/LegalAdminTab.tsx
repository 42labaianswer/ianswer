// src/app/dashboard/admin/tabs/LegalAdminTab.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useWorkspace } from '../../../../components/WorkspaceContext' 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Scale, FileText, Loader2, Phone, Mail, MapPin, Globe } from 'lucide-react'

const defaultLegal = {
  // Grupo 1: Identidad
  legal_name: '',
  website_url: '',
  support_email: '',
  // Grupo 2: Uso de datos
  data_collected: '',
  data_purpose: '',
  // Grupo 3: Terceros
  third_party_services: '',
  payment_processor: 'Stripe',
  // Grupo 4: Requisitos Meta
  deletion_instructions: '',
  minimum_age: '18',
  // Grupo 5: Contacto adicional
  dpo_email: '',
  billing_email: '',
  legal_email: '',
  abuse_email: '',
  contact_address: '',
  whatsapp_number: '',
  // Nuevos: para la página de contacto
  contact_title: 'Hablemos.',
  contact_subtitle: 'Déjanos un mensaje y te responderemos en breve.',
}

export default function LegalAdminTab() {
  const queryClient = useQueryClient()
  const { refreshWorkspace } = useWorkspace()
  
  const [platform, setPlatform] = useState({ legal_settings: defaultLegal })

  const { data, isLoading } = useQuery({
    queryKey: ['platformSettings'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_settings').select('*').single()
      return data || {}
    }
  })

  useEffect(() => { 
    if (data) {
      const mergedLegal = { ...defaultLegal, ...(data.legal_settings || {}) }
      setPlatform(prev => ({ 
        ...prev, 
        ...data,
        legal_settings: mergedLegal
      }))
    }
  }, [data])

  const updatePlatformMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('platform_settings').upsert({ id: 1, ...payload })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Ajustes legales guardados correctamente')
      refreshWorkspace()
      queryClient.invalidateQueries({ queryKey: ['platformSettings'] })
    },
    onError: (err) => toast.error(`Error al guardar: ${err.message}`)
  })

  const handleLegalChange = (field: string, value: string) => {
    setPlatform(prev => ({
      ...prev,
      legal_settings: {
        ...prev.legal_settings,
        [field]: value
      }
    }))
  }

  if (isLoading) return <div className="p-10 flex justify-center"><Loader2 className="w-10 h-10 text-slate-800 animate-spin" /></div>

  return (
    <section className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Scale className="text-slate-800" /> Información Legal y Cumplimiento (Meta)
        </h2>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">Esta información se utilizará para generar automáticamente tu Política de Privacidad y Términos de Servicio requeridos por Facebook Login y normativas internacionales.</p>
      </div>
      
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          
          {/* Grupo 1: Identidad */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">1. Identidad de la Empresa</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre Legal (Empresa o Persona)</label>
              <input value={platform.legal_settings.legal_name} onChange={e => handleLegalChange('legal_name', e.target.value)} placeholder="Ej. 42 Labs S.A.P.I. de C.V." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Sitio Web Oficial</label>
              <input value={platform.legal_settings.website_url} onChange={e => handleLegalChange('website_url', e.target.value)} placeholder="https://tu-sitio.com" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Correo Electrónico de Soporte/Privacidad</label>
              <input value={platform.legal_settings.support_email} onChange={e => handleLegalChange('support_email', e.target.value)} placeholder="soporte@tu-sitio.com" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
            </div>
          </div>

          {/* Grupo 2: Uso de Datos */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">2. Uso de Datos</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Datos recopilados (Facebook Login, Cookies, etc.)</label>
              <textarea value={platform.legal_settings.data_collected} onChange={e => handleLegalChange('data_collected', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl h-20 outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm resize-none"></textarea>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Finalidad (¿Para qué se usan?)</label>
              <textarea value={platform.legal_settings.data_purpose} onChange={e => handleLegalChange('data_purpose', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl h-20 outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm resize-none"></textarea>
            </div>
          </div>

          {/* Grupo 3: Terceros */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">3. Terceros y Almacenamiento</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Servicios Externos (BD, IA, Hosting)</label>
              <input value={platform.legal_settings.third_party_services} onChange={e => handleLegalChange('third_party_services', e.target.value)} placeholder="Ej. Supabase, OpenAI, AWS" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Procesador de Pagos</label>
              <input value={platform.legal_settings.payment_processor} onChange={e => handleLegalChange('payment_processor', e.target.value)} placeholder="Ej. Stripe, MercadoPago" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
            </div>
          </div>

          {/* Grupo 4: Requisitos Meta */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">4. Requisitos Específicos Meta</h3>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Instrucciones de Eliminación de Datos</label>
              <textarea value={platform.legal_settings.deletion_instructions} onChange={e => handleLegalChange('deletion_instructions', e.target.value)} placeholder="Instrucciones para borrar la cuenta..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl h-20 outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm resize-none"></textarea>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Edad Mínima Requerida</label>
              <input type="number" value={platform.legal_settings.minimum_age} onChange={e => handleLegalChange('minimum_age', e.target.value)} className="w-24 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm text-center" />
            </div>
          </div>

          {/* Grupo 5: Contacto Adicional (nuevo) */}
          <div className="space-y-4 md:col-span-2">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">5. Contacto y Correos Adicionales</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">DPO / Oficial de Protección de Datos</label>
                <input value={platform.legal_settings.dpo_email || ''} onChange={e => handleLegalChange('dpo_email', e.target.value)} placeholder="dpo@tu-sitio.com" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Facturación</label>
                <input value={platform.legal_settings.billing_email || ''} onChange={e => handleLegalChange('billing_email', e.target.value)} placeholder="facturacion@tu-sitio.com" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Legal / Asuntos Legales</label>
                <input value={platform.legal_settings.legal_email || ''} onChange={e => handleLegalChange('legal_email', e.target.value)} placeholder="legal@tu-sitio.com" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Abuso / Reportes</label>
                <input value={platform.legal_settings.abuse_email || ''} onChange={e => handleLegalChange('abuse_email', e.target.value)} placeholder="abuse@tu-sitio.com" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">WhatsApp (solo dígitos, sin + ni espacios)</label>
                <input value={platform.legal_settings.whatsapp_number || ''} onChange={e => handleLegalChange('whatsapp_number', e.target.value)} placeholder="5219997012393" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm font-mono" />
                <p className="text-xs text-slate-400 mt-1">Ejemplo: para +52 999 701 2393, escribe <strong>5219997012393</strong>.</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Dirección Física</label>
                <input value={platform.legal_settings.contact_address || ''} onChange={e => handleLegalChange('contact_address', e.target.value)} placeholder="Calle, número, ciudad, país" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
              </div>
            </div>
          </div>

          {/* Grupo 6: Página de Contacto (nuevo) */}
          <div className="space-y-4 md:col-span-2">
            <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">6. Página de Contacto</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Título de la página de contacto</label>
                <input value={platform.legal_settings.contact_title || ''} onChange={e => handleLegalChange('contact_title', e.target.value)} placeholder="Hablemos." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Subtítulo de la página de contacto</label>
                <input value={platform.legal_settings.contact_subtitle || ''} onChange={e => handleLegalChange('contact_subtitle', e.target.value)} placeholder="Déjanos un mensaje..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-900 font-medium text-sm" />
              </div>
            </div>
          </div>

        </div>
        
        <div className="mt-8 pt-6 border-t border-slate-100">
          <button onClick={() => updatePlatformMutation.mutate(platform)} disabled={updatePlatformMutation.isPending} className="w-full md:w-auto px-8 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors shadow-lg">
            {updatePlatformMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />} 
            Guardar Ajustes Legales
          </button>
        </div>
      </div>
    </section>
  )
}