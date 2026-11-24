import { describe, expect, it } from 'vitest'
import { breadcrumbs } from './breadcrumbs'

describe('breadcrumbs', () => {
  it('el inicio es solo "Inicio"', () => {
    expect(breadcrumbs('/dashboard', '')).toEqual([{ label: 'Inicio', href: '/dashboard' }])
  })

  it('una sección enlaza a su página', () => {
    expect(breadcrumbs('/dashboard/inbox', '')).toEqual([
      { label: 'Inicio', href: '/dashboard' },
      { label: 'Mensajes', href: '/dashboard/inbox' },
    ])
  })

  it('subpáginas anidadas', () => {
    expect(breadcrumbs('/dashboard/connectivity/whatsapp/', '').map(c => c.label))
      .toEqual(['Inicio', 'Conectividad', 'WhatsApp'])
    expect(breadcrumbs('/dashboard/properties/catalogo-web', '').at(-1))
      .toEqual({ label: 'Catálogo web', href: '/dashboard/properties/catalogo-web' })
  })

  it('usa la palabra de la industria para Clientes', () => {
    expect(breadcrumbs('/dashboard/crm/clientes', '', { clients: 'Pacientes' }).map(c => c.label))
      .toEqual(['Inicio', 'Gestor de Clientes', 'Pacientes'])
  })

  it('la pestaña en ?tab= es un nivel más', () => {
    expect(breadcrumbs('/dashboard/orders', '?tab=list').map(c => c.label)).toEqual(['Inicio', 'Órdenes', 'Pedidos'])
    expect(breadcrumbs('/dashboard/settings', 'tab=brand').at(-1))
      .toEqual({ label: 'Marca de tu negocio', href: '/dashboard/settings?tab=brand' })
    expect(breadcrumbs('/dashboard/orders', '?tab=otra').map(c => c.label)).toEqual(['Inicio', 'Órdenes', 'Pedidos'])
    expect(breadcrumbs('/dashboard/orders', '').map(c => c.label)).toEqual(['Inicio', 'Órdenes', 'Pedidos'])
    expect(breadcrumbs('/dashboard/settings', '').at(-1)?.label).toBe('Perfil y contacto')
  })

  it('las rutas sin página propia no enlazan y las desconocidas se saltan', () => {
    expect(breadcrumbs('/dashboard/billing/facturas', '')).toEqual([
      { label: 'Inicio', href: '/dashboard' },
      { label: 'Facturación', href: null },
      { label: 'Facturas', href: '/dashboard/billing/facturas' },
    ])
    expect(breadcrumbs('/dashboard/algo/1234', '').map(c => c.label)).toEqual(['Inicio'])
    expect(breadcrumbs('/otra', '').map(c => c.label)).toEqual(['Inicio'])
  })
})
