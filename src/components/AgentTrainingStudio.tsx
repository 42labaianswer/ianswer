 

'use client'

// src/components/AgentTrainingStudio.tsx
// ----------------------------------------------------------------------------
// Sprint R · Estudio de entrenamiento del agente.
//
// Dos modos de trabajo (tabs internos):
//   1. "Entrevista": un chat donde el asistente te entrevista como si
//      onboardearas a un empleado. Al terminar, genera el documento.
//   2. "Documento": las 8 secciones editables directamente. Se llena solo
//      tras la entrevista, o lo editas a mano.
//
// El documento vive en companies.agent_training (general) o
// team.custom_data.training (per_staff).
// ----------------------------------------------------------------------------

import { useState, useRef, useEffect } from 'react'
import {
  GraduationCap, Send, Loader2, Sparkles, FileText, MessageSquare,
  Check, Wand2, Save,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useAgentTraining,
  useSaveAgentTraining,
  callInterviewer,
  compileTraining,
  SECTION_LABELS,
  type TrainingSections,
} from '../hooks/useAgentTraining'

type Mode = 'general' | 'per_staff'
type InnerTab = 'interview' | 'document'

const SECTION_ORDER: Array<keyof typeof SECTION_LABELS> = [
  'company_overview',
  'sales_flow',
  'do_share',
  'dont_share',
  'faqs',
  'common_scenarios',
  'tone_examples',
  'escalation_rules',
]

export default function AgentTrainingStudio({
  companyId,
  accentColor,
  mode,
  teamMemberId,
  teamMemberName,
}: {
  companyId: string
  accentColor: string
  mode: Mode
  teamMemberId: string | null
  teamMemberName?: string
}) {
  const { data: saved } = useAgentTraining(companyId, mode, teamMemberId)
  const saveMut = useSaveAgentTraining()

  const [innerTab, setInnerTab] = useState<InnerTab>('interview')
  const [sections, setSections] = useState<TrainingSections>({})
  const [chat, setChat] = useState<Array<{ role: string; content: string }>>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [compiling, setCompiling] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)

  // Hidratar secciones guardadas
  useEffect(() => {
    if (saved) setSections(saved)
  }, [saved])

  // Autoscroll del chat
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat, thinking])

  // Iniciar la entrevista con un saludo del entrenador
  function startInterview() {
    const target = mode === 'per_staff' && teamMemberName ? teamMemberName : 'tu agente'
    setChat([
      {
        role: 'assistant',
        content: `Hola. Voy a ayudarte a entrenar a ${target} como si fuera un nuevo integrante de tu equipo. Te haré algunas preguntas sobre cómo trabajan, para que el agente suene como alguien que de verdad conoce tu negocio.\n\nEmpecemos por lo básico: ¿a qué se dedica tu empresa y qué la hace diferente de la competencia?`,
      },
    ])
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || thinking) return

    const newChat = [...chat, { role: 'user', content: text }]
    setChat(newChat)
    setInput('')
    setThinking(true)

    try {
      const reply = await callInterviewer(newChat)
      setChat([...newChat, { role: 'assistant', content: reply }])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
      setChat(newChat)
    } finally {
      setThinking(false)
    }
  }

  async function handleCompile() {
    if (chat.length < 3) {
      toast.error('Conversa un poco más antes de generar el documento')
      return
    }
    setCompiling(true)
    try {
      const generated = await compileTraining(chat)
      setSections((prev) => ({ ...prev, ...generated }))
      setInnerTab('document')
      toast.success('Documento generado. Revísalo y guárdalo.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar')
    } finally {
      setCompiling(false)
    }
  }

  async function handleSave() {
    try {
      await saveMut.mutateAsync({ companyId, mode, teamMemberId, sections })
      toast.success('Entrenamiento guardado. Tu agente ya lo consultará.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  const filledSections = SECTION_ORDER.filter((k) => (sections[k] || '').trim()).length

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: accentColor }}
          >
            <GraduationCap size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Entrenamiento PRO
              {mode === 'per_staff' && teamMemberName && (
                <span className="text-slate-400 font-normal"> · {teamMemberName}</span>
              )}
            </h3>
            <p className="text-xs text-slate-500">
              {filledSections}/8 secciones · el agente consulta esto en cada conversación
            </p>
          </div>
        </div>
      </div>

      {/* Inner tabs */}
      <div className="px-5 pt-4 flex gap-1">
        <button
          onClick={() => setInnerTab('interview')}
          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
            innerTab === 'interview' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
          style={innerTab === 'interview' ? { backgroundColor: accentColor } : {}}
        >
          <MessageSquare size={13} /> Entrevista
        </button>
        <button
          onClick={() => setInnerTab('document')}
          className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
            innerTab === 'document' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
          style={innerTab === 'document' ? { backgroundColor: accentColor } : {}}
        >
          <FileText size={13} /> Documento ({filledSections}/8)
        </button>
      </div>

      {/* ─── Tab Entrevista ─── */}
      {innerTab === 'interview' && (
        <div className="p-5">
          {chat.length === 0 ? (
            <div className="text-center py-10">
              <div
                className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-white mb-4"
                style={{ backgroundColor: accentColor }}
              >
                <Sparkles size={26} />
              </div>
              <h4 className="text-base font-bold text-slate-900 mb-1">
                Entrena a tu agente como a un empleado nuevo
              </h4>
              <p className="text-sm text-slate-500 max-w-md mx-auto mb-5">
                Te haré preguntas sobre cómo trabaja tu empresa. Con tus respuestas
                genero un documento de procesos que tu agente consultará para sonar
                como alguien que de verdad trabaja ahí.
              </p>
              <button
                onClick={startInterview}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-bold hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                <MessageSquare size={16} /> Empezar entrevista
              </button>
            </div>
          ) : (
            <>
              <div
                ref={chatRef}
                className="h-96 overflow-y-auto space-y-3 mb-3 pr-1"
              >
                {chat.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'text-white rounded-br-sm'
                          : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                      }`}
                      style={msg.role === 'user' ? { backgroundColor: accentColor } : {}}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {thinking && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 px-4 py-3 rounded-2xl rounded-bl-sm">
                      <Loader2 size={16} className="animate-spin text-slate-400" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                  placeholder="Escribe tu respuesta..."
                  disabled={thinking}
                  className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-200"
                />
                <button
                  onClick={sendMessage}
                  disabled={thinking || !input.trim()}
                  className="px-4 rounded-lg text-white disabled:opacity-40"
                  style={{ backgroundColor: accentColor }}
                >
                  <Send size={16} />
                </button>
              </div>

              <button
                onClick={handleCompile}
                disabled={compiling || chat.length < 3}
                className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 border-dashed border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {compiling ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Generando documento...
                  </>
                ) : (
                  <>
                    <Wand2 size={15} /> Generar documento de entrenamiento
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}

      {/* ─── Tab Documento ─── */}
      {innerTab === 'document' && (
        <div className="p-5 space-y-4">
          {SECTION_ORDER.map((key) => (
            <div key={key}>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1.5">
                {(sections[key] || '').trim() && (
                  <Check size={13} className="text-emerald-500" />
                )}
                {SECTION_LABELS[key]}
              </label>
              <textarea
                value={sections[key] || ''}
                onChange={(e) => setSections((prev) => ({ ...prev, [key]: e.target.value }))}
                rows={3}
                placeholder={`Describe: ${SECTION_LABELS[key].toLowerCase()}...`}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-200 resize-none"
              />
            </div>
          ))}

          <button
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: accentColor }}
          >
            {saveMut.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Guardando...
              </>
            ) : (
              <>
                <Save size={16} /> Guardar entrenamiento
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
