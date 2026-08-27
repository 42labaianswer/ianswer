 

// src/hooks/useWhatsAppProfile.ts
// ----------------------------------------------------------------------------
// Sprint W · Hooks para leer/editar el perfil de WhatsApp Business.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface WhatsAppProfile {
  about?: string
  address?: string
  description?: string
  email?: string
  profile_picture_url?: string
  websites?: string[]
  vertical?: string
}

export function useWhatsAppProfile() {
  return useQuery({
    queryKey: ['whatsapp-profile'],
    queryFn: async (): Promise<WhatsAppProfile> => {
      const res = await fetch('/api/whatsapp-profile')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al leer el perfil')
      return data.profile || {}
    },
    staleTime: 60 * 1000,
    retry: false,
  })
}

export function useSaveWhatsAppProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (profile: Partial<WhatsAppProfile>) => {
      const res = await fetch('/api/whatsapp-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al guardar')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-profile'] })
    },
  })
}

export function useUploadWhatsAppPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      // Convertir a base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/whatsapp-profile/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, mime_type: file.type }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al subir la foto')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-profile'] })
    },
  })
}
