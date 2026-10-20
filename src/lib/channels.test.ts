import { describe, expect, it } from 'vitest'
import { channelIdentityLabel, normalizeChannel, resolveSenderId, toChannelPlatform } from './channels'

describe('normalizeChannel', () => {
  it.each([
    ['instagram', 'instagram'],
    ['IG', 'instagram'],
    ['messenger', 'messenger'],
    ['facebook', 'messenger'],
    [' fb ', 'messenger'],
    ['whatsapp', 'whatsapp'],
    ['telegram', 'whatsapp'],
    ['', 'whatsapp'],
    [null, 'whatsapp'],
    [undefined, 'whatsapp'],
  ])('%j → %s', (input, expected) => {
    expect(normalizeChannel(input)).toBe(expected)
  })
})

describe('toChannelPlatform', () => {
  it('messenger se guarda como facebook (el enum no tiene messenger)', () => {
    expect(toChannelPlatform('messenger')).toBe('facebook')
    expect(toChannelPlatform('fb')).toBe('facebook')
  })

  it('instagram y whatsapp no cambian', () => {
    expect(toChannelPlatform('instagram')).toBe('instagram')
    expect(toChannelPlatform('whatsapp')).toBe('whatsapp')
  })
})

describe('channelIdentityLabel', () => {
  it('instagram usa @usuario o el nombre del canal', () => {
    expect(channelIdentityLabel('instagram', { ig_username: 'mi_negocio' })).toBe('@mi_negocio')
    expect(channelIdentityLabel('instagram', null)).toBe('Instagram')
  })

  it('messenger usa #página o el nombre del canal', () => {
    expect(channelIdentityLabel('messenger', { fb_page_name: 'Mi Página' })).toBe('#Mi Página')
    expect(channelIdentityLabel('messenger')).toBe('Facebook')
  })

  it('whatsapp prefiere el teléfono, luego el nombre verificado', () => {
    expect(channelIdentityLabel('whatsapp', { waba_display_phone: '+52 999', waba_verified_name: 'iAnswer' })).toBe('+52 999')
    expect(channelIdentityLabel('whatsapp', { waba_verified_name: 'iAnswer' })).toBe('iAnswer')
    expect(channelIdentityLabel('whatsapp', {})).toBe('WhatsApp')
  })
})

describe('resolveSenderId', () => {
  const opts = { pageId: 'page_1', businessPhoneId: 'phone_1' }

  it('whatsapp envía por el phone id', () => {
    expect(resolveSenderId('whatsapp', opts)).toBe('phone_1')
  })

  it('messenger e instagram envían siempre por el page id', () => {
    expect(resolveSenderId('messenger', opts)).toBe('page_1')
    expect(resolveSenderId('instagram', opts)).toBe('page_1')
  })

  it('sin identificador devuelve null', () => {
    expect(resolveSenderId('whatsapp', {})).toBeNull()
    expect(resolveSenderId('instagram', { pageId: '' })).toBeNull()
  })
})
