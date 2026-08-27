 

'use client'

import { useEffect, useState, useRef, type FormEvent } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  MessageCircle, X, Sparkles, BrainCircuit, Smile, AlignLeft, Wand2, CheckCircle2,
  LifeBuoy, PlayCircle, Bot, Send, User, UserCog, BadgeCheck, Stethoscope, Zap, Lock,
  ChevronDown, Network, GraduationCap, Ban, MessageSquareText, Clock3, Languages,
} from 'lucide-react'
import { usePlanFeatures } from '../../../hooks/usePlanFeatures'
import { useFeature } from '../../../hooks/useAppCapability'
import PageHeader from '../../../components/PageHeader'
import AgentTrainingStudio from '../../../components/AgentTrainingStudio'
import { useHasAgentTrainingAddon } from '../../../hooks/useAgentTraining'

type TeamMember = {
  id: string
  full_name: string
  specialty: string
  title: string
  bio_for_ai: string
  ai_identity: 'doctor' | 'assistant' | 'bot'
  ai_name: string
  ai_tone: 'formal' | 'warm' | 'direct'
  ai_emojis: boolean
  ai_length: 'concise' | 'detailed'
  ai_proactivity: 'proactive' | 'reactive'
  ai_medical_disclaimer: boolean
  ai_fallback_message: string
  system_prompt: string
  ai_forbidden_phrases?: string
  ai_greeting?: string
  ai_farewell?: string
  ai_formality?: 'auto' | 'tu' | 'usted'
  ai_availability_note?: string
}

type ConfigTab = 'personality' | 'advanced' | 'training'

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export default function AIAgentBuilderPage() {
  const queryClient = useQueryClient()
  const { labels, primaryTemplate: vertical } = useWorkspace()

  const verticalId = vertical?.id || 'health'
  const accent = vertical?.accent_color || '#4f46e5'
  const clientPlural = (labels as { client_plural?: string })?.client_plural || 'clientes'
  const staffTerm = labels?.staff || 'Especialista'

  const [companyId, setCompanyId] = useState('')
  const [team, setTeam] = useState<TeamMember[]>([])
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [scheduleText, setScheduleText] = useState<string>('')
  const [clinicName, setClinicName] = useState('')
  const [doctorName, setDoctorName] = useState('')

  const { data: planFeatures } = usePlanFeatures()
  const isAdvancedPlan = !!planFeatures?.ai_advanced_personality
  const isEnterprisePlan = !!planFeatures?.ai_multi_agent_mode
  const hasSimulator = useFeature('ai_agent_simulator')
  const { data: hasTrainingAddon } = useHasAgentTrainingAddon()

  const [agentMode, setAgentMode] = useState<'general' | 'per_staff'>('per_staff')
  const [configTab, setConfigTab] = useState<ConfigTab>('personality')

  const [savedSuccess, setSavedSuccess] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  // Simulador
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [chatMessages, isTyping])

  const { data: agentData, isLoading } = useQuery({
    queryKey: ['aiAgentsData'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuario no autenticado')

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      if (!profile?.company_id) throw new Error('No se encontró la compañía')

      const [compRes, whRes, teamRes] = await Promise.all([
        supabase.from('companies').select('id, name, doctor_name, agent_mode').eq('id', profile.company_id).single(),
        supabase.from('working_hours').select('*').eq('company_id', profile.company_id).order('day_of_week'),
        supabase.from('team').select('*').eq('company_id', profile.company_id).order('created_at'),
      ])

      let formattedSchedule = ''
      if (whRes.data) {
        formattedSchedule = whRes.data.map((wh: { is_active: boolean; day_of_week: number; start_time: string; end_time: string }) =>
          wh.is_active ? `- ${DAYS[wh.day_of_week]}: ${wh.start_time.substring(0, 5)} a ${wh.end_time.substring(0, 5)}` : `- ${DAYS[wh.day_of_week]}: Cerrado`
        ).join('\n')
      }

      return {
        companyId: compRes.data?.id,
        clinicName: compRes.data?.name || '',
        doctorName: compRes.data?.doctor_name || '',
        agentMode: compRes.data?.agent_mode || 'per_staff',
        scheduleText: formattedSchedule,
        team: teamRes.data || [],
      }
    },
  })

  useEffect(() => {
    if (agentData) {
      setCompanyId(agentData.companyId)
      setClinicName(agentData.clinicName)
      setDoctorName(agentData.doctorName)
      setScheduleText(agentData.scheduleText)
      setAgentMode(agentData.agentMode)

      const normalize = (m: TeamMember): TeamMember => ({
        ...m,
        ai_identity: m.ai_identity || 'bot',
        ai_name: m.ai_name || 'Asistente Virtual',
        ai_proactivity: m.ai_proactivity || 'proactive',
        ai_medical_disclaimer: m.ai_medical_disclaimer ?? true,
        ai_formality: m.ai_formality || 'auto',
      })

      setTeam(agentData.team.map(normalize))

      if (!selectedMember && agentData.team.length > 0) {
        setSelectedMember(normalize(agentData.team[0]))
      }
    }
  }, [agentData])

  const generatePrompt = (member: TeamMember, forcedMode?: 'general' | 'per_staff') => {
    const isHealth = verticalId === 'health'
    const isRealtor = verticalId === 'real_estate'
    const isRestaurant = verticalId === 'restaurant'

    const activeMode = forcedMode || agentMode
    const effectiveIdentity = isAdvancedPlan ? member.ai_identity : 'bot'
    const effectiveProactivity = isAdvancedPlan ? member.ai_proactivity : 'reactive'
    const effectiveDisclaimer = isAdvancedPlan ? member.ai_medical_disclaimer : true

    const toneInstructions = {
      formal: `Tu trato es impecable, extremadamente profesional y de usted.`,
      warm: `Tu trato es cálido, empático, humano y muy amable. Tuteas con respeto.`,
      direct: `Tu trato es cordial pero muy directo, ejecutivo y al grano.`,
    }

    let identityInstruction = ''
    if (activeMode === 'general') {
      identityInstruction = `Eres ${member.ai_name}, el Asistente General de la clínica/negocio "${clinicName}". Atiendes a todos los ${clientPlural} y derivas agendas según el especialista.`
    } else {
      if (effectiveIdentity === 'doctor') {
        identityInstruction = `Eres ${member.title || ''} ${member.full_name}. Hablas en primera persona como el propio ${staffTerm}. Tu objetivo es atender a TUS ${clientPlural} personalmente.`
      } else if (effectiveIdentity === 'assistant') {
        identityInstruction = `Eres ${member.ai_name}, el asistente humano de ${member.title || ''} ${member.full_name}. Trabajas dando servicio premium a los ${clientPlural}.`
      } else {
        identityInstruction = `Eres ${member.ai_name}, el Asistente Virtual Inteligente de "${clinicName}" enfocado en la agenda de ${member.full_name}. No ocultas que eres una IA, pero eres muy eficiente.`
      }
    }

    let proactivityInstruction = ''
    if (isRealtor) {
      proactivityInstruction = effectiveProactivity === 'proactive'
        ? `VENDEDOR: Siempre invita al usuario a agendar una visita o perfilarse.`
        : `INFORMATIVO: Solo resuelve dudas. Diles que un humano los contactará pronto.`
    } else if (isRestaurant) {
      proactivityInstruction = effectiveProactivity === 'proactive'
        ? `VENDEDOR: Siempre intenta que el cliente confirme una reserva o haga un pedido.`
        : `INFORMATIVO: Solo resuelve dudas del menú. Diles que no puedes tomar órdenes.`
    } else {
      proactivityInstruction = effectiveProactivity === 'proactive'
        ? `PROACTIVO: Siempre que respondas, invita sutilmente a agendar una cita.`
        : `INFORMATIVO: Solo resuelve dudas puntuales. Diles que un asistente humano los atenderá pronto para darles su cita.`
    }

    const medicalDisclaimer = (isHealth && effectiveDisclaimer)
      ? `EMERGENCIAS: Si mencionan dolor intenso, sangrado o urgencias, DETÉN LA CONVERSACIÓN y mándalos a Urgencias (911). No diagnostiques.`
      : `NOTA: No emitas diagnósticos profesionales ni prometas resultados fuera de tu conocimiento.`

    // Sprint S: campos nuevos de personalidad
    let formalityLine = ''
    if (member.ai_formality === 'tu') formalityLine = 'TRATO: Habla de TÚ (informal).'
    else if (member.ai_formality === 'usted') formalityLine = 'TRATO: Habla de USTED (formal).'

    const forbiddenLine = (member.ai_forbidden_phrases || '').trim()
      ? `NUNCA DIGAS NI HAGAS ESTO:\n${member.ai_forbidden_phrases}`
      : ''

    const greetingLine = (member.ai_greeting || '').trim()
      ? `SALUDO (primer mensaje): "${member.ai_greeting}"`
      : ''

    const farewellLine = (member.ai_farewell || '').trim()
      ? `DESPEDIDA (al cerrar): "${member.ai_farewell}"`
      : ''

    const availabilityLine = (member.ai_availability_note || '').trim()
      ? `DISPONIBILIDAD: ${member.ai_availability_note}`
      : ''

    return `
CONTEXTO DE NEGOCIO Y TU IDENTIDAD:
${identityInstruction}
Hoy es {{ $now.setZone('America/Merida').toFormat("cccc d 'de' MMMM yyyy") }}.

${activeMode === 'per_staff' ? `PERFIL DEL ${staffTerm.toUpperCase()}:
- Nombre: ${member.title || ''} ${member.full_name}
- Especialidad: ${member.specialty || 'General'}
- Bio: ${member.bio_for_ai || 'Experto altamente capacitado.'}` : ''}

HORARIOS DISPONIBLES:
${scheduleText}

PERSONALIDAD Y ESTILO:
${toneInstructions[member.ai_tone]} ${member.ai_length === 'concise' ? 'Respuestas cortas y claras.' : 'Da explicaciones detalladas si lo piden.'}
${member.ai_emojis ? 'Usa emojis por mensaje.' : 'CERO EMOTICONES: No uses ni un solo emoji.'}
${formalityLine}
${proactivityInstruction}
${greetingLine}
${farewellLine}
${availabilityLine}
${forbiddenLine}

REGLAS DE FORMATO: NO USAR TABLAS. Usa guiones (-) o números (1.) para listas.

INSTRUCCIONES: Para usar "confirmar_cita" necesitas: Fecha, Hora y Motivo.
${medicalDisclaimer}

FALLOS: Si hay un error técnico di: "${member.ai_fallback_message}"
    `.trim()
  }

  const updateAgentModeMutation = useMutation({
    mutationFn: async (mode: 'general' | 'per_staff') => {
      const { error: compError } = await supabase.from('companies').update({ agent_mode: mode }).eq('id', companyId)
      if (compError) throw compError
      if (team.length > 0) {
        const mainMember = team[0]
        const newPrompt = generatePrompt(mainMember, mode)
        await supabase.from('team').update({ system_prompt: newPrompt }).eq('id', mainMember.id)
      }
      return mode
    },
    onSuccess: (mode) => {
      setAgentMode(mode)
      toast.success(mode === 'general' ? 'Modo Unificado Activado' : 'Modo por Especialista Activado')
      if (mode === 'general' && team.length > 0) setSelectedMember(team[0])
      queryClient.invalidateQueries({ queryKey: ['aiAgentsData'] })
    },
    onError: () => toast.error('Error al cambiar el modo'),
  })

  const updateAgentMutation = useMutation({
    mutationFn: async ({ member, prompt }: { member: TeamMember; prompt: string }) => {
      const { error } = await supabase.from('team').update({
        ai_identity: member.ai_identity,
        ai_name: member.ai_name,
        ai_tone: member.ai_tone,
        ai_emojis: member.ai_emojis,
        ai_length: member.ai_length,
        ai_proactivity: member.ai_proactivity,
        ai_medical_disclaimer: member.ai_medical_disclaimer,
        ai_fallback_message: member.ai_fallback_message,
        ai_forbidden_phrases: member.ai_forbidden_phrases || null,
        ai_greeting: member.ai_greeting || null,
        ai_farewell: member.ai_farewell || null,
        ai_formality: member.ai_formality || 'auto',
        ai_availability_note: member.ai_availability_note || null,
        system_prompt: prompt,
      }).eq('id', member.id)
      if (error) throw error
      return { member, prompt }
    },
    onSuccess: ({ member, prompt }) => {
      toast.success('Agente entrenado correctamente')
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 3000)
      setTeam(team.map(m => m.id === member.id ? { ...member, system_prompt: prompt } : m))
      queryClient.invalidateQueries({ queryKey: ['aiAgentsData'] })
      if (isSimulatorOpen) startSimulation(prompt)
    },
  })

  const handleSaveIA = () => {
    if (!selectedMember) return
    updateAgentMutation.mutate({ member: selectedMember, prompt: generatePrompt(selectedMember) })
  }

  const startSimulation = (currentPrompt?: string) => {
    if (!selectedMember) return
    const effectiveIdentity = isAdvancedPlan ? selectedMember.ai_identity : 'bot'
    let welcomeMsg = ''
    if (selectedMember.ai_greeting?.trim()) {
      welcomeMsg = selectedMember.ai_greeting
    } else if (agentMode === 'general') {
      welcomeMsg = `¡Hola! Soy ${selectedMember.ai_name}, asistente principal de ${clinicName}. ¿Qué necesitas?`
    } else if (effectiveIdentity === 'doctor') {
      welcomeMsg = `¡Hola! Soy ${selectedMember.title ? selectedMember.title + ' ' : ''}${selectedMember.full_name} de ${clinicName}. ¿En qué te ayudo?`
    } else if (effectiveIdentity === 'assistant') {
      welcomeMsg = `¡Hola! Soy ${selectedMember.ai_name}, asistente de ${selectedMember.title ? selectedMember.title + ' ' : ''}${selectedMember.full_name}. ¿Cómo puedo apoyarte?`
    } else {
      welcomeMsg = `¡Hola! Soy ${selectedMember.ai_name}, asistente virtual. ¿En qué te sirvo?`
    }
    setChatMessages([{ role: 'assistant', content: welcomeMsg }])
    setIsSimulatorOpen(true)
  }

  const handleSimulateMessage = async (e: FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || isTyping || !selectedMember) return
    if (!hasSimulator) {
      toast.error('El simulador requiere el addon Agent Simulator')
      window.location.href = '/dashboard/addons?highlight=agent_simulator'
      return
    }
    const newMsgs = [...chatMessages, { role: 'user', content: chatInput }]
    setChatMessages(newMsgs)
    setChatInput('')
    setIsTyping(true)
    try {
      const res = await fetch('/api/agent-simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
          system_prompt: generatePrompt(selectedMember),
        }),
      })
      const data = await res.json()
      if (data.reply) setChatMessages([...newMsgs, { role: 'assistant', content: data.reply }])
    } catch {
      setChatMessages([...newMsgs, { role: 'assistant', content: selectedMember.ai_fallback_message }])
    } finally {
      setIsTyping(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center animate-pulse">
        <BrainCircuit size={48} className="text-slate-300" />
      </div>
    )
  }

  const patch = (updates: Partial<TeamMember>) => {
    if (selectedMember) setSelectedMember({ ...selectedMember, ...updates })
  }

  return (
    <div className="pb-12 animate-in fade-in duration-500">
      <PageHeader
        title="Agente IA"
        description="Configura la personalidad y el entrenamiento de tu inteligencia artificial."
        actions={
          team.length > 1 && selectedMember && agentMode === 'per_staff' ? (
            <div className="relative z-20 w-full sm:w-auto">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center justify-between gap-4 w-full sm:w-[280px] bg-white border border-slate-200 p-2.5 rounded-xl shadow-sm hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ backgroundColor: accent }}>
                    <User size={16} />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">{selectedMember.full_name}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{selectedMember.specialty}</p>
                  </div>
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                  <div className="absolute right-0 top-[calc(100%+8px)] w-full sm:w-[280px] bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden flex flex-col max-h-[300px] overflow-y-auto">
                    {team.map(member => (
                      <button
                        key={member.id}
                        onClick={() => {
                          setSelectedMember({ ...member, ai_formality: member.ai_formality || 'auto' })
                          setIsSimulatorOpen(false)
                          setIsDropdownOpen(false)
                        }}
                        className={`flex items-center gap-3 p-2.5 w-full text-left transition-colors border-l-4 ${selectedMember.id === member.id ? 'bg-slate-50' : 'bg-white border-transparent hover:bg-slate-50'}`}
                        style={selectedMember.id === member.id ? { borderLeftColor: accent } : {}}
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-white shrink-0 ${selectedMember.id === member.id ? '' : 'opacity-40'}`} style={{ backgroundColor: accent }}>
                          <User size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-bold text-sm truncate ${selectedMember.id === member.id ? 'text-slate-900' : 'text-slate-500'}`}>{member.full_name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{member.specialty}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null
        }
      />

      {isEnterprisePlan && (
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Network size={18} /></div>
            <div>
              <p className="font-black text-indigo-900 text-sm">Arquitectura del Agente</p>
              <p className="text-xs text-indigo-700 font-medium">Un cerebro unificado o uno por especialista.</p>
            </div>
          </div>
          <div className="flex bg-white p-1 rounded-xl border border-indigo-200 shrink-0 w-full sm:w-auto">
            <button onClick={() => updateAgentModeMutation.mutate('general')} disabled={updateAgentModeMutation.isPending} className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${agentMode === 'general' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Unificado</button>
            <button onClick={() => updateAgentModeMutation.mutate('per_staff')} disabled={updateAgentModeMutation.isPending} className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${agentMode === 'per_staff' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Por Especialista</button>
          </div>
        </div>
      )}

      {!selectedMember ? (
        <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 min-h-[400px] flex flex-col items-center justify-center text-slate-400">
          <BrainCircuit size={48} className="mb-4 opacity-50" />
          <p className="font-medium">Selecciona un perfil para comenzar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* ═══ IZQUIERDA (3/5): configurador con sub-tabs ═══ */}
          <div className="lg:col-span-3 space-y-4">
            {/* Sub-tabs */}
            <div className="bg-white border border-slate-200 rounded-xl p-1 flex gap-1 shadow-sm">
              <button onClick={() => setConfigTab('personality')} className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${configTab === 'personality' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`} style={configTab === 'personality' ? { backgroundColor: accent } : {}}>
                <MessageCircle size={13} /> Personalidad
              </button>
              <button onClick={() => setConfigTab('advanced')} className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${configTab === 'advanced' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`} style={configTab === 'advanced' ? { backgroundColor: accent } : {}}>
                <Sparkles size={13} /> Avanzado
              </button>
              <button onClick={() => setConfigTab('training')} className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${configTab === 'training' ? 'text-white' : 'text-slate-600 hover:bg-slate-50'}`} style={configTab === 'training' ? { backgroundColor: accent } : {}}>
                <GraduationCap size={13} /> Entrenamiento
              </button>
            </div>

            {configTab === 'personality' && (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Personalidad Base</h2>
                  <p className="text-sm text-slate-500">{agentMode === 'general' ? `Agente principal de ${clinicName}` : `Configuración para ${selectedMember.full_name}`}</p>
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MessageCircle size={13} /> Tono de voz</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'formal', label: 'Formal', desc: 'De usted' },
                      { id: 'warm', label: 'Cálido', desc: 'Empático' },
                      { id: 'direct', label: 'Directo', desc: 'Al grano' },
                    ].map(t => (
                      <button key={t.id} onClick={() => patch({ ai_tone: t.id as TeamMember['ai_tone'] })} className={`p-3 rounded-xl border-2 transition-all text-left ${selectedMember.ai_tone === t.id ? 'bg-slate-50' : 'bg-white border-slate-100 hover:border-slate-200'}`} style={selectedMember.ai_tone === t.id ? { borderColor: accent } : {}}>
                        <p className="font-bold text-slate-900 text-sm">{t.label}</p>
                        <p className="text-[10px] text-slate-500">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Smile size={13} /> Emojis</label>
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                      <button onClick={() => patch({ ai_emojis: true })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${selectedMember.ai_emojis ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>Sí</button>
                      <button onClick={() => patch({ ai_emojis: false })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!selectedMember.ai_emojis ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>No</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><AlignLeft size={13} /> Extensión</label>
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                      <button onClick={() => patch({ ai_length: 'concise' })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${selectedMember.ai_length === 'concise' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>Corta</button>
                      <button onClick={() => patch({ ai_length: 'detailed' })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${selectedMember.ai_length === 'detailed' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>Larga</button>
                    </div>
                  </div>
                </div>

                {/* Sprint S: Formalidad tú/usted */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Languages size={13} /> Trato</label>
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                    {[{ id: 'auto', label: 'Automático' }, { id: 'tu', label: 'De tú' }, { id: 'usted', label: 'De usted' }].map(f => (
                      <button key={f.id} onClick={() => patch({ ai_formality: f.id as TeamMember['ai_formality'] })} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${(selectedMember.ai_formality || 'auto') === f.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400'}`}>{f.label}</button>
                    ))}
                  </div>
                </div>

                {/* Sprint S: Saludo y despedida */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MessageSquareText size={13} /> Saludo (primer mensaje)</label>
                    <input value={selectedMember.ai_greeting || ''} onChange={e => patch({ ai_greeting: e.target.value })} placeholder="¡Hola! Bienvenido a..." className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><MessageSquareText size={13} /> Despedida</label>
                    <input value={selectedMember.ai_farewell || ''} onChange={e => patch({ ai_farewell: e.target.value })} placeholder="¡Gracias por contactarnos!..." className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><LifeBuoy size={13} /> Mensaje de rescate (fallo técnico)</label>
                  <textarea value={selectedMember.ai_fallback_message} onChange={e => patch({ ai_fallback_message: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200 min-h-[70px]" />
                </div>
              </div>
            )}

            {/* ─── Tab Avanzado ─── */}
            {configTab === 'advanced' && (
              <div className={`relative bg-white p-6 rounded-2xl border ${isAdvancedPlan ? 'border-slate-200 shadow-sm' : 'border-slate-200 opacity-60'} space-y-6`}>
                {!isAdvancedPlan && (
                  <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] z-10 rounded-2xl flex flex-col items-center justify-center p-8 text-center">
                    <div className="h-14 w-14 bg-slate-100 rounded-full flex items-center justify-center mb-3 border border-slate-200"><Lock size={24} className="text-slate-400" /></div>
                    <h3 className="font-black text-slate-900 mb-1">Funciones bloqueadas</h3>
                    <p className="text-sm text-slate-600 max-w-sm">Mejora de plan para identidad del bot, estrategia de ventas y filtros avanzados.</p>
                  </div>
                )}

                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2"><Sparkles size={18} /> Comportamiento Inteligente</h2>

                <div className="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-100">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2"><BadgeCheck size={14} /> Identidad del Agente</label>
                  {agentMode === 'per_staff' && (
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { id: 'doctor', icon: User, label: `Soy el ${verticalId === 'restaurant' ? 'Gerente' : verticalId === 'real_estate' ? 'Agente' : 'Especialista'}`, desc: 'Habla en 1ra persona.' },
                        { id: 'assistant', icon: UserCog, label: 'Soy su Asistente', desc: 'Equipo administrativo.' },
                        { id: 'bot', icon: Bot, label: 'Soy un Bot', desc: 'Reconoce que es IA.' },
                      ].map(t => (
                        <button key={t.id} disabled={!isAdvancedPlan} onClick={() => patch({ ai_identity: t.id as TeamMember['ai_identity'] })} className={`p-3 rounded-xl border-2 transition-all text-left flex items-center gap-3 ${selectedMember.ai_identity === t.id ? 'bg-white shadow-sm' : 'bg-transparent border-transparent hover:bg-white/50'}`} style={selectedMember.ai_identity === t.id ? { borderColor: accent } : {}}>
                          <div className={`p-2 rounded-lg ${selectedMember.ai_identity === t.id ? 'text-white' : 'bg-slate-100 text-slate-400'}`} style={selectedMember.ai_identity === t.id ? { backgroundColor: accent } : {}}><t.icon size={16} /></div>
                          <div>
                            <p className={`font-bold text-sm ${selectedMember.ai_identity === t.id ? 'text-slate-900' : 'text-slate-600'}`}>{t.label}</p>
                            <p className="text-[10px] text-slate-500">{t.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {(selectedMember.ai_identity !== 'doctor' || agentMode === 'general') && (
                    <div className="pt-3 border-t border-slate-200">
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Nombre del Bot/Asistente</label>
                      <input type="text" disabled={!isAdvancedPlan} value={selectedMember.ai_name} onChange={e => patch({ ai_name: e.target.value })} placeholder="Ej. Sofía..." className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 text-sm font-bold text-slate-700" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2"><Zap size={14} /> Estrategia de Venta</label>
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200">
                    <button disabled={!isAdvancedPlan} onClick={() => patch({ ai_proactivity: 'proactive' })} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${selectedMember.ai_proactivity === 'proactive' ? 'bg-white shadow-sm' : 'text-slate-500'}`} style={selectedMember.ai_proactivity === 'proactive' ? { color: accent } : {}}>
                      {verticalId === 'real_estate' ? 'Vender Propiedades' : verticalId === 'restaurant' ? 'Tomar Órdenes' : 'Agendar Citas'}
                    </button>
                    <button disabled={!isAdvancedPlan} onClick={() => patch({ ai_proactivity: 'reactive' })} className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${selectedMember.ai_proactivity === 'reactive' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                      {verticalId === 'restaurant' ? 'Solo Menú' : 'Solo Informar'}
                    </button>
                  </div>
                </div>

                {/* Sprint S: Palabras prohibidas */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2"><Ban size={14} /> Frases prohibidas</label>
                  <textarea disabled={!isAdvancedPlan} value={selectedMember.ai_forbidden_phrases || ''} onChange={e => patch({ ai_forbidden_phrases: e.target.value })} placeholder="Cosas que el agente NUNCA debe decir (una por línea). Ej: prometer descuentos, decir 'no sé'..." rows={3} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200 resize-none" />
                </div>

                {/* Sprint S: Disponibilidad */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-2"><Clock3 size={14} /> Disponibilidad / horario del bot</label>
                  <input disabled={!isAdvancedPlan} value={selectedMember.ai_availability_note || ''} onChange={e => patch({ ai_availability_note: e.target.value })} placeholder="Ej: Respondo 24/7, pero pedidos solo de 9 a 6..." className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200" />
                </div>

                {verticalId === 'health' && (
                  <div className="space-y-3 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                    <label className="text-xs font-black text-rose-800 uppercase tracking-widest flex items-center justify-between">
                      <span className="flex items-center gap-2"><Stethoscope size={14} /> Filtro de Emergencias</span>
                      <input type="checkbox" disabled={!isAdvancedPlan} checked={selectedMember.ai_medical_disclaimer} onChange={e => patch({ ai_medical_disclaimer: e.target.checked })} className="h-5 w-5 rounded border-rose-300 text-rose-600 cursor-pointer" />
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* ─── Tab Entrenamiento ─── */}
            {configTab === 'training' && (
              hasTrainingAddon && companyId ? (
                <AgentTrainingStudio
                  companyId={companyId}
                  accentColor={accent}
                  mode={agentMode}
                  teamMemberId={agentMode === 'per_staff' ? selectedMember.id : null}
                  teamMemberName={selectedMember.full_name}
                />
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                  <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-4"><GraduationCap size={26} /></div>
                  <h3 className="font-black text-slate-900 mb-1">Entrenamiento PRO</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto mb-5">Entrena a tu agente como a un empleado nuevo: un asistente te entrevista sobre cómo trabaja tu empresa y genera un documento que el agente consulta en cada conversación.</p>
                  <a href="/dashboard/addons?highlight=agent_training_pro" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold" style={{ backgroundColor: accent }}>
                    <Lock size={15} /> Activar addon
                  </a>
                </div>
              )
            )}

            {/* Botón guardar (no en tab entrenamiento, que tiene su propio guardar) */}
            {configTab !== 'training' && (
              <button onClick={handleSaveIA} disabled={updateAgentMutation.isPending} className="w-full py-3.5 rounded-xl text-white font-black flex items-center justify-center gap-2 transition-all hover:brightness-110 shadow-lg" style={{ backgroundColor: accent }}>
                {updateAgentMutation.isPending ? <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : savedSuccess ? <><CheckCircle2 size={18} /> ¡Actualizado!</> : <><Wand2 size={18} /> Guardar y Entrenar</>}
              </button>
            )}
          </div>

          {/* ═══ DERECHA (2/5): resumen visual del agente + prueba ═══ */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-6 space-y-4">
              {/* Card resumen del agente */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                {/* Cabecera con avatar */}
                <div className="p-5 flex flex-col items-center text-center border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
                  <div
                    className="h-16 w-16 rounded-2xl flex items-center justify-center text-white mb-3 shadow-sm"
                    style={{ backgroundColor: accent }}
                  >
                    {agentMode === 'general' ? <Bot size={28} /> : <User size={28} />}
                  </div>
                  <h3 className="font-black text-slate-900 text-base">
                    {agentMode === 'general'
                      ? selectedMember.ai_name
                      : isAdvancedPlan && selectedMember.ai_identity === 'doctor'
                        ? `${selectedMember.title || ''} ${selectedMember.full_name}`.trim()
                        : isAdvancedPlan
                          ? selectedMember.ai_name
                          : 'Asistente Virtual'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {agentMode === 'general' ? `Agente principal · ${clinicName}` : selectedMember.specialty || 'Especialista'}
                  </p>
                </div>

                {/* Badges de configuración activa */}
                <div className="p-4 space-y-2.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configuración actual</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                      <MessageCircle size={11} />
                      {selectedMember.ai_tone === 'warm' ? 'Cálido' : selectedMember.ai_tone === 'formal' ? 'Formal' : 'Directo'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                      <AlignLeft size={11} />
                      {selectedMember.ai_length === 'concise' ? 'Cortas' : 'Detalladas'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                      <Smile size={11} />
                      {selectedMember.ai_emojis ? 'Con emojis' : 'Sin emojis'}
                    </span>
                    {(selectedMember.ai_formality && selectedMember.ai_formality !== 'auto') && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                        <Languages size={11} />
                        {selectedMember.ai_formality === 'tu' ? 'De tú' : 'De usted'}
                      </span>
                    )}
                    {isAdvancedPlan && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white" style={{ backgroundColor: accent }}>
                        <Zap size={11} />
                        {selectedMember.ai_proactivity === 'proactive' ? 'Proactivo' : 'Informativo'}
                      </span>
                    )}
                    {hasTrainingAddon && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                        <GraduationCap size={11} /> Entrenamiento PRO
                      </span>
                    )}
                  </div>
                </div>

                {/* Botón probar */}
                <div className="p-4 pt-0">
                  {hasSimulator ? (
                    <button
                      onClick={() => startSimulation()}
                      className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                    >
                      <PlayCircle size={17} /> Probar Agente IA
                    </button>
                  ) : (
                    <a
                      href="/dashboard/addons?highlight=agent_simulator"
                      className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors"
                    >
                      <Lock size={15} /> Probar
                      <span className="text-[10px] font-black uppercase bg-amber-500 px-2 py-0.5 rounded-full">addon</span>
                    </a>
                  )}
                  <p className="text-[11px] text-slate-400 text-center mt-2">
                    Chatea con tu agente para ver cómo responde
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Simulador como modal overlay ═══ */}
      {isSimulatorOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsSimulatorOpen(false)} />
          <div className="relative bg-[#1A1D24] text-white rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[600px] w-full max-w-md border border-slate-700 animate-in fade-in zoom-in duration-200">
            <div className="p-4 flex items-center justify-between border-b border-slate-700/50 bg-[#14161C] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center"><Bot size={18} /></div>
                <div>
                  <h3 className="font-bold text-sm">{agentMode === 'general' ? selectedMember.ai_name : isAdvancedPlan && selectedMember.ai_identity === 'doctor' ? `${selectedMember.title || ''} ${selectedMember.full_name}` : isAdvancedPlan ? selectedMember.ai_name : 'Asistente Virtual'}</h3>
                  <p className="text-xs text-slate-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> {clinicName}</p>
                </div>
              </div>
              <button onClick={() => setIsSimulatorOpen(false)} className="text-slate-400 hover:text-white p-2 bg-slate-800/50 rounded-full"><X size={16} /></button>
            </div>
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#1A1D24]">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-3.5 py-2.5 rounded-2xl text-sm max-w-[85%] font-medium whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-[#2A2E37] text-slate-200 border border-slate-700 rounded-bl-sm'}`}>{msg.content}</div>
                </div>
              ))}
              {isTyping && (
                <div className="flex items-start">
                  <div className="px-4 py-3 bg-[#2A2E37] border border-slate-700 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={handleSimulateMessage} className="p-3 bg-[#14161C] border-t border-slate-700/50 shrink-0">
              <div className="flex items-center gap-2 bg-[#0F1115] p-1.5 rounded-xl border border-slate-700">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Escribe un mensaje..." className="flex-1 bg-transparent outline-none px-3 py-2 text-sm text-white placeholder:text-slate-500" disabled={isTyping} />
                <button type="submit" disabled={isTyping || !chatInput.trim()} className="bg-blue-600 text-white h-9 w-9 rounded-lg flex items-center justify-center hover:bg-blue-500 disabled:opacity-50 shrink-0"><Send size={15} /></button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
