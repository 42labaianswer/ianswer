'use client'

// ============================================================================
// src/app/dashboard/campaigns/page.tsx
// ----------------------------------------------------------------------------
// Campañas de publicidad por WhatsApp: elegir una plantilla de marketing
// aprobada, llenar sus variables, filtrar destinatarios y enviar. Muestra los
// mensajes que quedan en el mes; el límite real se valida en /api/campaigns.
// ============================================================================

import { useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  Megaphone, Send, Users, Loader2, AlertCircle, CheckCircle2,
  FileText, RefreshCw, Image as ImageIcon, XCircle, Plug,
} from 'lucide-react'
import PageHeader from '../../../components/PageHeader'
import IAnswerLoader from '../../../components/IAnswerLoader'
import { useWorkspace } from '../../../components/WorkspaceContext'
import {
  CAMPAIGN_STAGES, fillVars, templateParamsError,
  type CampaignTemplate, type TemplateParams,
} from '../../../lib/campaigns'

interface Usage { used: number; limit: number; remaining: number }
interface Tag { id: string; name: string; color: string }
interface CampaignRow {
  id: string
  name: string
  template_name: string
  status: 'sending' | 'completed' | 'failed'
  total_recipients: number
  sent_count: number
  failed_count: number
  created_at: string
}

const STATUS_LABEL: Record<CampaignRow['status'], string> = {
  sending: 'Enviando',
  completed: 'Enviada',
  failed: 'Falló',
}

const MEDIA_LABEL: Record<string, string> = { IMAGE: 'imagen', VIDEO: 'video', DOCUMENT: 'documento' }

interface Overview {
  usage: Usage
  campaigns: CampaignRow[]
  tags: Tag[]
  whatsapp_connected: boolean
}
interface SendResult { sent: number; failed: number; first_error: string | null; usage: Usage }

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...init })
  const json = await res.json().catch(() => null)
  if (!json?.success) throw new Error(json?.error || 'No se pudo completar la solicitud')
  return json as T
}

const templateKey = (t: { name: string; language: string }) => `${t.name}::${t.language}`

export default function CampaignsPage() {
  const funnels = useWorkspace(s => s.funnels)

  const qc = useQueryClient()

  const [name, setName] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [params, setParams] = useState<TemplateParams>({})
  const [tagIds, setTagIds] = useState<string[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)

  const overviewQuery = useQuery({
    queryKey: ['campaigns-overview'],
    queryFn: () => apiJson<Overview>('/api/campaigns'),
  })
  const whatsappConnected = overviewQuery.data?.whatsapp_connected ?? false

  const templatesQuery = useQuery({
    queryKey: ['campaign-templates'],
    queryFn: async () => (await apiJson<{ templates: CampaignTemplate[] }>('/api/campaigns/templates')).templates,
    enabled: whatsappConnected,
    retry: false,
  })
  const templates = templatesQuery.data ?? []

  const audienceQuery = useQuery({
    queryKey: ['campaign-audience', tagIds, stages],
    queryFn: () => apiJson<{ recipients: number; usage: Usage }>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ dry_run: true, audience: { tag_ids: tagIds, stages } }),
    }),
    enabled: overviewQuery.isSuccess,
    placeholderData: keepPreviousData,
  })
  const recipients = audienceQuery.data?.recipients ?? null
  const counting = audienceQuery.isFetching
  const usage = audienceQuery.data?.usage ?? overviewQuery.data?.usage ?? null

  const template = templates.find(t => templateKey(t) === selectedKey) ?? null

  const sendMutation = useMutation({
    mutationFn: () => apiJson<SendResult>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        template_name: template!.name,
        template_language: template!.language,
        params,
        audience: { tag_ids: tagIds, stages },
      }),
    }),
    onSuccess: result => {
      if (result.sent > 0 && result.failed === 0) {
        toast.success(`Campaña enviada a ${result.sent} ${result.sent === 1 ? 'contacto' : 'contactos'}`)
      } else if (result.sent > 0) {
        toast.success(`Enviada a ${result.sent}. ${result.failed} no se pudieron enviar y no cuentan en tu límite.`)
      } else {
        toast.error(`Meta no aceptó ningún envío${result.first_error ? `: ${result.first_error}` : ''}`)
      }
      setName('')
      setParams({})
      setSelectedKey('')
      setConfirming(false)
      void qc.invalidateQueries({ queryKey: ['campaigns-overview'] })
      void qc.invalidateQueries({ queryKey: ['campaign-audience'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const sending = sendMutation.isPending

  const selectTemplate = (key: string) => {
    setSelectedKey(key)
    setParams({})
    setConfirming(false)
  }

  const setVar = (part: 'header' | 'body', key: string, value: string) =>
    setParams(p => ({ ...p, [part]: { ...(p[part] ?? {}), [key]: value } }))

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value]

  const remaining = usage?.remaining ?? 0
  const overLimit = recipients !== null && recipients > remaining
  const paramsError = template ? templateParamsError(template, params) : 'Elige una plantilla'

  const blocker =
    !whatsappConnected ? 'Conecta WhatsApp para mandar campañas' :
    usage && usage.limit === 0 ? 'Tu plan no incluye mensajes de campaña' :
    !name.trim() ? 'Ponle un nombre a la campaña' :
    paramsError ? paramsError :
    recipients === 0 ? 'No hay contactos que cumplan el filtro' :
    overLimit ? `Esta campaña necesita ${recipients} mensajes y te quedan ${remaining} este mes` :
    null

  const preview = useMemo(() => {
    if (!template) return null
    return {
      header: template.headerText ? fillVars(template.headerText, params.header) : null,
      body: fillVars(template.bodyText, params.body),
    }
  }, [template, params])

  const send = () => { if (template) sendMutation.mutate() }

  if (overviewQuery.isLoading) return <IAnswerLoader />
  if (overviewQuery.isError) {
    return (
      <div className="pb-20">
        <PageHeader title="Campañas" />
        <p className="text-sm text-rose-600 flex items-center gap-1.5"><AlertCircle size={16} /> {overviewQuery.error.message}</p>
      </div>
    )
  }

  const campaigns = overviewQuery.data?.campaigns ?? []
  const tags = overviewQuery.data?.tags ?? []
  const templatesLoading = templatesQuery.isFetching
  const templatesError = templatesQuery.error?.message ?? null
  const loadTemplates = () => { void templatesQuery.refetch() }

  const pct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0

  return (
    <div className="pb-20">
      <PageHeader
        title="Campañas"
        description="Manda una plantilla de marketing aprobada por Meta a tus contactos de WhatsApp. Solo cuentan los mensajes que Meta acepta; los contactos que se dieron de baja nunca la reciben."
      />

      {/* ─── Uso del mes ─── */}
      <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Megaphone size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Mensajes de campaña este mes</p>
              <p className="text-xs text-slate-500">Se reinicia el día 1 de cada mes</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-slate-900">{usage?.remaining ?? 0}</p>
            <p className="text-xs text-slate-500">de {usage?.limit ?? 0} disponibles</p>
          </div>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 90 ? 'bg-rose-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
        </div>
        {usage && usage.limit === 0 && (
          <p className="mt-3 text-xs text-slate-600">
            Tu plan no incluye mensajes de campaña. <Link href="/dashboard/plans" className="font-bold text-indigo-600 hover:underline">Ver planes</Link>
          </p>
        )}
      </div>

      {!whatsappConnected && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <Plug size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            WhatsApp no está conectado. <Link href="/dashboard/connectivity" className="font-bold underline">Conéctalo en Conectividad</Link> para mandar campañas.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 mb-10">
        {/* ─── Formulario ─── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-6">
          <div>
            <label htmlFor="campaign-name" className="block text-xs font-bold text-slate-700 mb-1.5">Nombre de la campaña</label>
            <input
              id="campaign-name"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={120}
              placeholder="Promoción de noviembre"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="campaign-template" className="block text-xs font-bold text-slate-700">Plantilla de marketing</label>
              {whatsappConnected && (
                <button
                  type="button"
                  onClick={loadTemplates}
                  disabled={templatesLoading}
                  className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw size={12} className={templatesLoading ? 'animate-spin' : ''} /> Actualizar
                </button>
              )}
            </div>
            {templatesError ? (
              <p className="text-xs text-rose-600 flex items-center gap-1.5"><AlertCircle size={14} /> {templatesError}</p>
            ) : templatesLoading ? (
              <p className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> Cargando plantillas de Meta…</p>
            ) : whatsappConnected && templates.length === 0 ? (
              <p className="text-xs text-slate-500">
                No tienes plantillas de marketing aprobadas. Créalas en el administrador de WhatsApp de Meta y espera a que las aprueben.
              </p>
            ) : (
              <select
                id="campaign-template"
                value={selectedKey}
                onChange={e => selectTemplate(e.target.value)}
                disabled={!whatsappConnected}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Elige una plantilla</option>
                {templates.map(t => (
                  <option key={templateKey(t)} value={templateKey(t)} disabled={!!t.unsupported}>
                    {t.name} ({t.language}){t.unsupported ? ` · ${t.unsupported}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {template && (template.headerFormat && MEDIA_LABEL[template.headerFormat] || template.headerVars.length > 0 || template.bodyVars.length > 0) && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-700">Contenido</p>
              {template.headerFormat && MEDIA_LABEL[template.headerFormat] && (
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Enlace del {MEDIA_LABEL[template.headerFormat]} del encabezado (https)</label>
                  <input
                    value={params.header_media_url ?? ''}
                    onChange={e => setParams(p => ({ ...p, header_media_url: e.target.value }))}
                    placeholder="https://"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              {template.headerVars.map(v => (
                <VarInput key={`h-${v}`} label={`Encabezado {{${v}}}`} value={params.header?.[v] ?? ''} onChange={val => setVar('header', v, val)} />
              ))}
              {template.bodyVars.map(v => (
                <VarInput key={`b-${v}`} label={`Mensaje {{${v}}}`} value={params.body?.[v] ?? ''} onChange={val => setVar('body', v, val)} />
              ))}
              <p className="text-[11px] text-slate-500">Estos valores son los mismos para todos los destinatarios.</p>
            </div>
          )}

          <div>
            <p className="text-xs font-bold text-slate-700 mb-1">Destinatarios</p>
            <p className="text-[11px] text-slate-500 mb-3">Sin filtros se manda a todos tus contactos de WhatsApp que no se dieron de baja.</p>

            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Etapa</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {CAMPAIGN_STAGES.map(s => (
                <Chip key={s} active={stages.includes(s)} onClick={() => setStages(prev => toggle(prev, s))}>
                  {funnels?.[s] || s}
                </Chip>
              ))}
            </div>

            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Etiquetas</p>
            {tags.length === 0 ? (
              <p className="text-xs text-slate-500">No tienes etiquetas. <Link href="/dashboard/tags" className="font-bold text-indigo-600 hover:underline">Crear etiquetas</Link></p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map(t => (
                  <Chip key={t.id} active={tagIds.includes(t.id)} color={t.color} onClick={() => setTagIds(prev => toggle(prev, t.id))}>
                    {t.name}
                  </Chip>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-sm text-slate-700">
              <Users size={16} className="text-slate-400" />
              {counting || recipients === null
                ? <span className="flex items-center gap-1.5 text-slate-500"><Loader2 size={14} className="animate-spin" /> Contando…</span>
                : <span><strong>{recipients}</strong> {recipients === 1 ? 'contacto recibirá' : 'contactos recibirán'} la campaña</span>}
            </div>
            {overLimit && !counting && (
              <p className="mt-2 text-xs text-rose-600 flex items-start gap-1.5">
                <AlertCircle size={14} className="shrink-0 mt-px" />
                Te quedan {remaining} mensajes este mes. Usa filtros para llegar a menos contactos o cambia de plan.
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100">
            {confirming ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-700 flex-1 min-w-[200px]">
                  Se mandará <strong>{template?.name}</strong> a <strong>{recipients}</strong> contactos. No se puede deshacer.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={sending}
                  className="px-4 py-2 text-sm font-bold text-slate-600 rounded-xl hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !!blocker}
                  className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {sending ? 'Enviando…' : 'Confirmar envío'}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                {blocker && <p className="text-xs text-slate-500 flex-1 min-w-[200px]">{blocker}</p>}
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={!!blocker || counting}
                  className="ml-auto px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Send size={16} /> Enviar campaña
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── Vista previa ─── */}
        <div className="bg-[#efeae2] border border-slate-200 rounded-2xl p-5 h-fit">
          <p className="text-xs font-bold text-slate-600 mb-3 flex items-center gap-1.5"><FileText size={14} /> Vista previa</p>
          {template && preview ? (
            <div className="bg-white rounded-xl rounded-tl-none shadow-sm p-3 text-sm text-slate-800 space-y-2">
              {template.headerFormat && MEDIA_LABEL[template.headerFormat] && (
                <div className="h-28 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-xs gap-1.5">
                  <ImageIcon size={16} /> {MEDIA_LABEL[template.headerFormat]}
                </div>
              )}
              {preview.header && <p className="font-bold">{preview.header}</p>}
              <p className="whitespace-pre-wrap">{preview.body}</p>
              {template.footerText && <p className="text-xs text-slate-400">{template.footerText}</p>}
              {template.buttons.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-1">
                  {template.buttons.map((b, i) => (
                    <p key={i} className="text-center text-sm font-medium text-sky-600">{b}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Elige una plantilla para ver cómo llegará el mensaje.</p>
          )}
        </div>
      </div>

      {/* ─── Historial ─── */}
      <h2 className="text-sm font-bold text-slate-900 mb-3">Campañas enviadas</h2>
      {campaigns.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no has mandado campañas.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 text-left">
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 font-bold">Campaña</th>
                <th className="px-4 py-3 font-bold">Plantilla</th>
                <th className="px-4 py-3 font-bold">Fecha</th>
                <th className="px-4 py-3 font-bold text-right">Enviados</th>
                <th className="px-4 py-3 font-bold text-right">Fallidos</th>
                <th className="px-4 py-3 font-bold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600">{c.template_name}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {new Date(c.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-900">{c.sent_count} / {c.total_recipients}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{c.failed_count}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                      c.status === 'completed' ? 'text-emerald-700' : c.status === 'failed' ? 'text-rose-600' : 'text-slate-500'
                    }`}>
                      {c.status === 'completed' ? <CheckCircle2 size={14} /> : c.status === 'failed' ? <XCircle size={14} /> : <Loader2 size={14} className="animate-spin" />}
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function VarInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-slate-600 mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  )
}

function Chip({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center gap-1.5 ${
        active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
      }`}
    >
      {color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </button>
  )
}
