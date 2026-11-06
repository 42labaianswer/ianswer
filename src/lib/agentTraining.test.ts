import { describe, expect, it } from 'vitest'
import { pickTrainingDoc, trainingPromptSection } from './agentTraining'

describe('pickTrainingDoc', () => {
  const empresa = { faqs: 'De la empresa' }
  const miembro = { faqs: 'Del miembro' }

  it('por especialista usa el documento del miembro', () => {
    expect(pickTrainingDoc('per_staff', empresa, miembro)).toBe(miembro)
  })

  it('por especialista sin documento del miembro cae al de la empresa', () => {
    expect(pickTrainingDoc('per_staff', empresa, null)).toBe(empresa)
  })

  it('en modo general usa el de la empresa aunque el miembro tenga uno', () => {
    expect(pickTrainingDoc('general', empresa, miembro)).toBe(empresa)
  })

  it('en modo general sin documento de empresa usa el del miembro', () => {
    expect(pickTrainingDoc('general', null, miembro)).toBe(miembro)
  })

  it('ignora valores que no son objetos', () => {
    expect(pickTrainingDoc(undefined, 'texto', ['x'])).toEqual({})
  })
})

describe('trainingPromptSection', () => {
  it('arma las secciones con contenido, en orden y sin espacios de sobra', () => {
    const texto = trainingPromptSection({
      dont_share: ' Recetas ',
      company_overview: 'Taquería en Mérida',
      faqs: '   ',
      updated_at: '2026-11-05',
    })
    expect(texto).toBe(
      '\n\nENTRENAMIENTO DEL NEGOCIO (escrito por el dueño; úsalo como conocimiento del negocio y respétalo):\n'
      + 'Sobre la empresa:\nTaquería en Mérida\n\nInformación que NUNCA debes dar:\nRecetas',
    )
  })

  it('devuelve vacío si no hay nada escrito', () => {
    expect(trainingPromptSection({})).toBe('')
    expect(trainingPromptSection({ faqs: '' })).toBe('')
  })
})
