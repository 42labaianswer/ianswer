import { describe, expect, it } from 'vitest'
import { planLockFor } from './planLocks'

const lite = { plan_panel_full: false, team_management: false }
const start = { plan_panel_full: true, team_management: true }

describe('planLockFor', () => {
  it('en Lite bloquea las secciones del CRM salvo Recordatorios', () => {
    expect(planLockFor('/dashboard/crm/clientes', lite)?.name).toBe('Clientes')
    expect(planLockFor('/dashboard/contacts', lite)?.name).toBe('Clientes')
    expect(planLockFor('/dashboard/crm/tareas', lite)?.name).toBe('Tareas')
    expect(planLockFor('/dashboard/crm/etiquetas', lite)?.name).toBe('Etiquetas')
    expect(planLockFor('/dashboard/crm', lite)).toBeNull()
    expect(planLockFor('/dashboard/crm/recordatorios', lite)).toBeNull()
  })
  it('bloquea Menú digital y Órdenes en Lite', () => {
    expect(planLockFor('/dashboard/menu', lite)?.name).toBe('Menú digital y órdenes')
    expect(planLockFor('/dashboard/orders', lite)?.name).toBe('Menú digital y órdenes')
  })
  it('bloquea Métricas y Equipo en Lite', () => {
    expect(planLockFor('/dashboard/reports', lite)?.name).toBe('Métricas')
    expect(planLockFor('/dashboard/team', lite)?.name).toBe('Equipo')
  })
  it('no bloquea Mensajes, Calendario ni Mi Plan', () => {
    for (const p of ['/dashboard', '/dashboard/inbox', '/dashboard/calendar', '/dashboard/plans', '/dashboard/reminders']) {
      expect(planLockFor(p, lite)).toBeNull()
    }
  })
  it('no confunde rutas con el mismo inicio', () => {
    expect(planLockFor('/dashboard/teams-extra', lite)).toBeNull()
  })
  it('no bloquea nada en planes que incluyen la sección', () => {
    expect(planLockFor('/dashboard/crm/clientes', start)).toBeNull()
    expect(planLockFor('/dashboard/menu', start)).toBeNull()
    expect(planLockFor('/dashboard/team', start)).toBeNull()
  })
  it('sin el flag (base vieja) no bloquea', () => {
    expect(planLockFor('/dashboard/crm/clientes', {})).toBeNull()
    expect(planLockFor('/dashboard/crm/clientes', null)).toBeNull()
    expect(planLockFor(null, lite)).toBeNull()
  })
})
