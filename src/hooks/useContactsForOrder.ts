 

// src/hooks/useContactsForOrder.ts
// ----------------------------------------------------------------------------
// Sprint AQ · Buscar contactos existentes (autocompletado) y crear uno nuevo.
// ----------------------------------------------------------------------------

import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ContactLite {
  id: string
  name: string | null
  phone: string | null
}

// Carga los contactos de la company (para filtrar en el cliente mientras escribe)
export function useContactsForOrder(companyId: string | undefined) {
  return useQuery({
    queryKey: ['contacts-for-order', companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<ContactLite[]> => {
      if (!companyId) return []
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('company_id', companyId)
        .order('name')
      if (error) throw error
      return (data || []) as ContactLite[]
    },
    staleTime: 30 * 1000,
  })
}

// Busca un contacto por teléfono, o lo crea si no existe. Devuelve el id.
export async function findOrCreateContact(
  companyId: string,
  name: string,
  phone: string
): Promise<string | null> {
  const cleanPhone = phone.replace(/\D/g, '')

  // 1. ¿Ya existe por teléfono?
  if (cleanPhone) {
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('company_id', companyId)
      .or(`phone.eq.${cleanPhone},external_id.eq.${cleanPhone}`)
      .maybeSingle()
    if (existing?.id) return existing.id
  }

  // 2. No existe → crear
  const newId = crypto.randomUUID()
  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      id: newId,
      company_id: companyId,
      name: name.trim() || 'Cliente',
      phone: cleanPhone || null,
      external_id: cleanPhone || newId,
      referral_source: 'orden_manual',
    })
    .select('id')
    .single()

  if (error) {
    // Si falla por duplicado (raro), intentamos buscarlo de nuevo
    if (cleanPhone) {
      const { data: retry } = await supabase
        .from('contacts')
        .select('id')
        .eq('company_id', companyId)
        .eq('external_id', cleanPhone)
        .maybeSingle()
      if (retry?.id) return retry.id
    }
    throw error
  }

  return created?.id || null
}
