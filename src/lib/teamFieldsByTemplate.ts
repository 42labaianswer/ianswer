 

// ============================================================================
// src/lib/teamFieldsByTemplate.ts
// ----------------------------------------------------------------------------
// Devuelve la configuración de campos profesionales según la plantilla activa.
// Cada miembro tiene siempre los campos universales; éstos se SUMAN encima.
// ============================================================================

export type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'tags' | 'multiselect'

export type FieldConfig = {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  helpText?: string
  options?: string[]          // para select / multiselect
  cols?: 1 | 2                // ancho en grid (default 2 = full width)
}

export type TemplateConfig = {
  noun_singular: string       // "Doctor", "Agente", "Mesero"
  noun_plural: string         // "Doctores", "Agentes", "Personal"
  professional_section_title: string
  fields: FieldConfig[]
}

// ── Configuraciones ─────────────────────────────────────────────────────────
const TEMPLATES: Record<string, TemplateConfig> = {
  health: {
    noun_singular: 'Especialista',
    noun_plural: 'Especialistas',
    professional_section_title: 'Información profesional',
    fields: [
      {
        key: 'specialty', label: 'Especialidad', type: 'select', cols: 1,
        placeholder: 'Selecciona...',
        options: [
          'Medicina general', 'Pediatría', 'Ginecología', 'Cardiología',
          'Dermatología', 'Psicología', 'Psiquiatría', 'Odontología',
          'Ortodoncia', 'Nutrición', 'Oftalmología', 'Traumatología',
          'Neurología', 'Endocrinología', 'Otra'
        ]
      },
      { key: 'subspecialty', label: 'Subespecialidad', type: 'text', cols: 1, placeholder: 'Ej. Cardiología pediátrica' },
      { key: 'medical_license', label: 'Cédula profesional', type: 'text', cols: 1, placeholder: 'Ej. 1234567' },
      { key: 'years_experience', label: 'Años de experiencia', type: 'number', cols: 1, placeholder: '10' },
      {
        key: 'studies', label: 'Estudios y trayectoria', type: 'textarea',
        placeholder: 'Universidad, posgrados, hospitales donde ha trabajado, publicaciones...',
        helpText: 'Esto le sirve al bot para presentar al especialista con credibilidad.'
      },
      {
        key: 'insurances_accepted', label: 'Aseguradoras que acepta', type: 'tags',
        placeholder: 'Escribe y presiona Enter (GNP, AXA, MetLife...)',
        helpText: 'El bot lo usa para responder "¿aceptan mi seguro?".'
      }
    ]
  },

  real_estate: {
    noun_singular: 'Agente',
    noun_plural: 'Agentes',
    professional_section_title: 'Información del agente',
    fields: [
      { key: 'realtor_license', label: 'Cédula AMPI / Bienes raíces', type: 'text', cols: 1, placeholder: 'Ej. AMPI-12345' },
      { key: 'years_experience', label: 'Años de experiencia', type: 'number', cols: 1, placeholder: '5' },
      {
        key: 'property_specialties', label: 'Tipos de propiedad que maneja', type: 'multiselect',
        options: ['Residencial', 'Comercial', 'Terrenos', 'Industrial', 'Renta', 'Pre-venta', 'Lujo', 'Inversión'],
        helpText: 'El bot lo usa cuando un prospecto pregunta por un tipo específico.'
      },
      {
        key: 'zones_covered', label: 'Zonas que cubre', type: 'tags',
        placeholder: 'Altabrisa, Cholul, Country Club...',
        helpText: 'El bot deriva prospectos al agente correcto según zona.'
      }
    ]
  },

  restaurant: {
    noun_singular: 'Miembro del equipo',
    noun_plural: 'Personal',
    professional_section_title: 'Puesto y horario',
    fields: [
      {
        key: 'position', label: 'Puesto', type: 'select', cols: 1,
        options: ['Mesero', 'Cocinero', 'Chef', 'Host/Hostess', 'Bartender', 'Gerente', 'Cajero', 'Repartidor', 'Otro']
      },
      {
        key: 'shift', label: 'Turno', type: 'select', cols: 1,
        options: ['Mañana', 'Tarde', 'Noche', 'Mixto', 'Fines de semana']
      }
    ]
  },



  marketing_agency: {
    noun_singular: 'Miembro del equipo',
    noun_plural: 'Equipo',
    professional_section_title: 'Rol y especialidades',
    fields: [
      {
        key: 'position', label: 'Rol', type: 'select', cols: 1,
        options: ['Account Manager', 'Creativo', 'Diseñador', 'Desarrollador', 'SEO', 'Paid Media', 'Estratega', 'Director', 'Otro']
      },
      { key: 'years_experience', label: 'Años de experiencia', type: 'number', cols: 1, placeholder: '5' },
      {
        key: 'property_specialties', label: 'Especialidades', type: 'multiselect',
        options: ['SEO', 'Google Ads', 'Meta Ads', 'TikTok Ads', 'Email marketing', 'Branding',
                  'Diseño web', 'Contenido', 'Video', 'Analytics', 'CRM']
      },
      { key: 'portfolio_url', label: 'Portfolio URL', type: 'text', placeholder: 'https://...' }
    ]
  },

  generic: {
    noun_singular: 'Miembro del equipo',
    noun_plural: 'Equipo',
    professional_section_title: 'Información profesional',
    fields: [
      { key: 'position', label: 'Puesto', type: 'text', cols: 1, placeholder: 'Ej. Ejecutivo de ventas' },
      { key: 'years_experience', label: 'Años de experiencia', type: 'number', cols: 1, placeholder: '5' },
      { key: 'studies', label: 'Trayectoria', type: 'textarea', placeholder: 'Formación, experiencia previa...' }
    ]
  }
}

export function getTemplateConfig(templateId: string | undefined | null): TemplateConfig {
  if (!templateId) return TEMPLATES.generic
  return TEMPLATES[templateId] || TEMPLATES.generic
}
