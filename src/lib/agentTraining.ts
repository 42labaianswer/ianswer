// Documento de Entrenamiento PRO como sección del prompt del agente. Arma las
// mismas secciones que n8n en los 3 agentes de "Asistente Pro" (ENTRENAMIENTO
// DEL NEGOCIO), para que el simulador de Agente AI conteste como el bot real.

export type TrainingDoc = Partial<Record<TrainingSectionKey | 'updated_at', string>>

export type TrainingSectionKey =
  | 'company_overview' | 'sales_flow' | 'do_share' | 'dont_share'
  | 'faqs' | 'common_scenarios' | 'tone_examples' | 'escalation_rules'

const SECTION_TITLES: Record<TrainingSectionKey, string> = {
  company_overview: 'Sobre la empresa',
  sales_flow: 'Flujo de ventas / atención',
  do_share: 'Información que SÍ puedes dar',
  dont_share: 'Información que NUNCA debes dar',
  faqs: 'Preguntas frecuentes',
  common_scenarios: 'Casos comunes',
  tone_examples: 'Ejemplos de tono',
  escalation_rules: 'Cuándo pasar con un humano',
}

const asDoc = (v: unknown): TrainingDoc | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as TrainingDoc) : null

/**
 * En modo "por especialista" se usa el documento del miembro; si no tiene, o
 * el modo es general, el de la empresa.
 */
export function pickTrainingDoc(agentMode: string | null | undefined, companyDoc: unknown, memberDoc: unknown): TrainingDoc {
  const member = asDoc(memberDoc)
  if (agentMode === 'per_staff' && member) return member
  return asDoc(companyDoc) ?? member ?? {}
}

/** Sección para el final del prompt, o '' si el documento no tiene contenido. */
export function trainingPromptSection(doc: TrainingDoc): string {
  const parts = (Object.keys(SECTION_TITLES) as TrainingSectionKey[])
    .filter(k => typeof doc[k] === 'string' && doc[k]!.trim())
    .map(k => `${SECTION_TITLES[k]}:\n${doc[k]!.trim()}`)
  if (parts.length === 0) return ''
  return '\n\nENTRENAMIENTO DEL NEGOCIO (escrito por el dueño; úsalo como conocimiento del negocio y respétalo):\n'
    + parts.join('\n\n')
}
