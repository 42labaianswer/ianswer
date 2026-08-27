 

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useState } from 'react'
import FBSDKLoader from './FBSDKLoader'

export default function Providers({ children }: { children: React.ReactNode }) {
  // Inicializamos el QueryClient dentro del estado para evitar que se 
  // comparta entre usuarios durante el SSR (Server-Side Rendering)
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutos de caché por defecto
        refetchOnWindowFocus: false,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <FBSDKLoader />
      {children}
      {/* Aquí configuramos globalmente el Toaster */}
      <Toaster 
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#334155', // slate-700
            color: '#fff',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '600',
          },
          success: {
            style: { background: '#10b981' }, // emerald-500
          },
          error: {
            style: { background: '#ef4444' }, // red-500
          },
        }} 
      />
    </QueryClientProvider>
  )
}
