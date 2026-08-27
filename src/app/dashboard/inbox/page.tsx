 

'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import { useWorkspace } from '../../../components/WorkspaceContext'
import BusinessProfileBadge from '../../../components/BusinessProfileBadge'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Search, Send, MoreVertical, CheckCheck, Filter,
  Inbox, User, MessageSquarePlus,
  Sparkles, Flame, CreditCard, Heart, CheckCircle2,
  Clock, ChevronDown, Bot, UserCog, BellRing, Loader2, X,
  Mic, Image as ImageIcon, Play, Maximize2,
  Paperclip, Square, Trash2
} from 'lucide-react'
import {
  CHANNELS, normalizeChannel, channelIdentityLabel, ChannelBadge, ChannelGlyph,
  type ChannelKey,
} from '../../../components/ChannelBadge'

type LifecycleStage = 'new_lead' | 'hot_lead' | 'payment' | 'customer' | string

type Contact = {
  id: string
  name: string
  phone: string
  lifecycle_stage: LifecycleStage
  chat_status: 'open' | 'closed'
  unread_count: number
  ai_active: boolean
  stage_updated_by?: 'system' | 'ai' | 'human'
  // Multicanal: el destinatario real (teléfono WA / PSID de Messenger / IGSID)
  // y el canal + avatar. n8n crea/actualiza estos campos.
  external_id: string
  platform?: string | null
  avatar_url?: string | null
}

type Message = {
  id: string
  content: string
  sender: 'patient' | 'ai' | 'asistente' | 'admin'
  created_at: string
  patient_id: string
  message_type?: 'text' | 'audio' | 'image' | 'other'
  media_url?: string | null
  media_caption?: string | null
  channel?: string | null
}

// Identidad de los canales del negocio (para mostrar #página / @usuario / número)
type ChannelIdentity = {
  waba_display_phone?: string | null
  waba_verified_name?: string | null
  fb_page_name?: string | null
  ig_username?: string | null
}

export default function InboxPage() {
  const queryClient = useQueryClient()
  const { labels, primaryTemplate: vertical, isLoadingWorkspace } = useWorkspace()

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [activeFilter, setActiveFilter] = useState<LifecycleStage | 'all'>('all')
  const [channelFilter, setChannelFilter] = useState<'all' | ChannelKey>('all')
  const [newMessage, setNewMessage] = useState('')
  
  // Estados para el Modal de Nuevo Mensaje
  const [isNewChatOpen, setIsNewChatOpen] = useState(false)
  const [newChatSearch, setNewChatSearch] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const funnels: Record<string, { name: string, icon: any, color: string, bg: string }> = {
    new_lead: { name: vertical?.funnels?.new_lead || 'New Lead', icon: Sparkles, color: 'text-blue-500', bg: 'bg-blue-50' },
    hot_lead: { name: vertical?.funnels?.hot_lead || 'Hot Lead', icon: Flame, color: 'text-orange-500', bg: 'bg-orange-50' },
    payment: { name: vertical?.funnels?.payment || 'Payment', icon: CreditCard, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    customer: { name: vertical?.funnels?.customer || labels?.client || 'Cliente', icon: Heart, color: 'text-purple-500', bg: 'bg-purple-50' },
  }

  const defaultFunnel = { name: 'Sin Etapa', icon: User, color: 'text-slate-500', bg: 'bg-slate-100' }

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // 1. OBTENER COMPAÑÍA DEL USUARIO (Multi-Tenant)
  const { data: userProfile, isLoading: isLoadingProfile } = useQuery({
    queryKey: ['currentUserProfile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No autenticado")
      const { data } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
      return data
    }
  })

  const userCompanyId = userProfile?.company_id

  // 2. TANSTACK QUERY: Obtener Webhook
  const { data: webhookUrl } = useQuery({
    queryKey: ['webhookAdminWhatsApp', userCompanyId],
    enabled: !!userCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from('platform_settings').select('n8n_webhook_whatsapp_admin').single()
      return data?.n8n_webhook_whatsapp_admin || null
    }
  })

  // 3. TANSTACK QUERY: Obtener TODOS los Contactos (Para el modal de Nuevo Chat)
  const { data: allContacts = [], isLoading: isLoadingContacts } = useQuery({
    queryKey: ['contactsData', userCompanyId],
    enabled: !!userCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('*').eq('company_id', userCompanyId).order('created_at', { ascending: false })
      if (error) throw error
      return (data as Contact[]) || []
    }
  })

  // 4. TANSTACK QUERY: Chats activos + canal por conversación.
  // La conversación se identifica por external_id (teléfono WA / PSID / IGSID),
  // que es lo que n8n guarda en messages.patient_id. El canal se toma del
  // último mensaje (messages.channel), fuente de verdad que escribe n8n.
  const { data: activeChat = { ids: new Set<string>(), channels: {} as Record<string, ChannelKey> } } = useQuery({
    queryKey: ['activeChat', userCompanyId],
    enabled: !!userCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('patient_id, channel, created_at')
        .eq('company_id', userCompanyId)
        .order('created_at', { ascending: false })
      const ids = new Set<string>()
      const channels: Record<string, ChannelKey> = {}
      for (const m of data || []) {
        const pid: string = m.patient_id
        if (!pid) continue
        ids.add(pid)
        // primera ocurrencia = más reciente (orden desc) → canal actual
        if (!channels[pid]) channels[pid] = normalizeChannel(m.channel)
      }
      return { ids, channels }
    }
  })
  const activeChatIds = activeChat.ids

  // 4b. TANSTACK QUERY: identidad de los canales del negocio (para #/@ y número)
  const { data: channelIdentity } = useQuery<ChannelIdentity>({
    queryKey: ['channelIdentity', userCompanyId],
    enabled: !!userCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('companies')
        .select('waba_display_phone, waba_verified_name, fb_page_name, ig_username')
        .eq('id', userCompanyId)
        .maybeSingle()
      return (data as ChannelIdentity) || {}
    }
  })

  // Canal de una conversación: último mensaje > platform del contacto > whatsapp
  const channelOf = (c: Contact | null): ChannelKey => {
    if (!c) return 'whatsapp'
    return activeChat.channels[c.external_id] || normalizeChannel(c.platform)
  }

  // 4c. Canales conectados de la empresa (para el switch de canales del buzón)
  const { data: connectedChannels = [] as ChannelKey[] } = useQuery<ChannelKey[]>({
    queryKey: ['inbox-connected-channels', userCompanyId],
    enabled: !!userCompanyId,
    queryFn: async () => {
      const [{ data: integrations }, { data: company }] = await Promise.all([
        supabase.from('integrations').select('platform').eq('company_id', userCompanyId),
        supabase.from('companies').select('business_phone_id').eq('id', userCompanyId).maybeSingle(),
      ])
      const set = new Set<ChannelKey>()
      for (const i of integrations || []) {
        const p = normalizeChannel((i as any).platform)
        if (p === 'messenger' || p === 'instagram') set.add(p)
      }
      if (company?.business_phone_id) set.add('whatsapp')
      // Orden estable: WhatsApp, Messenger, Instagram
      return (['whatsapp', 'messenger', 'instagram'] as ChannelKey[]).filter(c => set.has(c))
    }
  })

  // 5. TANSTACK QUERY: Obtener Mensajes del chat seleccionado (por external_id)
  const { data: messages = [] } = useQuery({
    queryKey: ['messagesData', selectedContact?.external_id],
    enabled: !!selectedContact?.external_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('patient_id', selectedContact!.external_id)
        .order('created_at', { ascending: true })
      return (data as Message[]) || []
    }
  })

  // 6. SUSCRIPCIONES REALTIME (Optimizadas para Multi-tenant)
  useEffect(() => {
    if (!userCompanyId) return

    // Escuchar cambios en los contactos
    const contactsChannel = supabase
      .channel(`contacts_inbox_${userCompanyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `company_id=eq.${userCompanyId}` }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          const newC = payload.new as Contact;
          const oldC = payload.old as Contact;
          
          if (oldC && oldC.ai_active === true && newC.ai_active === false) {
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('¡Atención Requerida!', {
                body: `${newC.name} necesita hablar con un humano.`,
                icon: '/icon.png' 
              });
            }
          }
          queryClient.setQueryData(['contactsData', userCompanyId], (old: Contact[] = []) => old.map(p => p.id === newC.id ? newC : p));
          setSelectedContact(prev => prev?.id === newC.id ? newC : prev);
        } else if (payload.eventType === 'INSERT') {
          queryClient.setQueryData(['contactsData', userCompanyId], (old: Contact[] = []) => [payload.new as Contact, ...old]);
        }
      })
      .subscribe()

    // Escuchar TODOS los mensajes nuevos para actualizar la lista de "Chats Activos" y el chat abierto
    const messagesChannel = supabase
      .channel(`messages_inbox_${userCompanyId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `company_id=eq.${userCompanyId}` }, (payload) => {
        const newMsg = payload.new as Message;

        // 1. Agregar la conversación a los "Chats Activos" y registrar su canal
        queryClient.setQueryData(
          ['activeChat', userCompanyId],
          (old: { ids: Set<string>; channels: Record<string, ChannelKey> } = { ids: new Set(), channels: {} }) => {
            const ids = new Set(old.ids)
            ids.add(newMsg.patient_id)
            const channels = { ...old.channels, [newMsg.patient_id]: normalizeChannel(newMsg.channel) }
            return { ids, channels }
          }
        )

        // 2. Si el mensaje es del chat que tenemos abierto, actualizar la pantalla
        queryClient.setQueryData(['messagesData', newMsg.patient_id as any], (old: Message[] | undefined) => {
          if (!old) return undefined; // Si no lo estábamos viendo, no actualizamos su caché específica
          const tempIndex = old.findIndex((m) => m.id.startsWith('temp-') && m.content === newMsg.content);
          if (tempIndex >= 0) {
            const updatedMessages = [...old];
            updatedMessages[tempIndex] = newMsg;
            return updatedMessages;
          }
          return [...old, newMsg];
        });
      })
      .subscribe()

    return () => { 
      supabase.removeChannel(contactsChannel)
      supabase.removeChannel(messagesChannel)
    }
  }, [userCompanyId, queryClient])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // --- MUTACIONES DE TANSTACK ---

  const updateStageMutation = useMutation({
    mutationFn: async (newStatus: LifecycleStage) => {
      const { error } = await supabase.from('contacts')
        .update({ lifecycle_stage: newStatus, stage_updated_by: 'human', stage_updated_at: new Date().toISOString() })
        .eq('id', selectedContact!.id);
      if (error) throw error;
      return newStatus;
    },
    onMutate: async (newStatus) => {
      const prev = selectedContact;
      setSelectedContact({ ...prev!, lifecycle_stage: newStatus, stage_updated_by: 'human' });
      queryClient.setQueryData(['contactsData', userCompanyId], (old: Contact[] = []) => old.map(c => c.id === prev?.id ? { ...c, lifecycle_stage: newStatus, stage_updated_by: 'human' } : c));
      return { prev };
    },
    onError: (err, newStatus, context) => {
      toast.error('Error al actualizar la etapa');
      setSelectedContact(context?.prev!);
      queryClient.invalidateQueries({ queryKey: ['contactsData', userCompanyId] });
    }
  })

  const toggleAIMutation = useMutation({
    mutationFn: async (newAiStatus: boolean) => {
      const { error } = await supabase.from('contacts').update({ ai_active: newAiStatus }).eq('id', selectedContact!.id);
      if (error) throw error;
      return newAiStatus;
    },
    onMutate: async (newAiStatus) => {
      const prev = selectedContact;
      setSelectedContact({ ...prev!, ai_active: newAiStatus });
      queryClient.setQueryData(['contactsData', userCompanyId], (old: Contact[] = []) => old.map(c => c.id === prev?.id ? { ...c, ai_active: newAiStatus } : c));
      return { prev };
    },
    onError: (err, newAiStatus, context) => {
      toast.error('Error al cambiar el estado de la IA');
      setSelectedContact(context?.prev!);
      queryClient.invalidateQueries({ queryKey: ['contactsData', userCompanyId] });
    }
  })

  // v2.12: Estados para multimedia outbound
  const [pendingImage, setPendingImage] = useState<{ file: File, preview: string, caption: string } | null>(null)
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob, duration: number, preview: string } | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)

  // v2.12: Subir archivo a Supabase Storage (devuelve URL pública)
  const uploadToStorage = async (file: Blob, ext: string, folder: 'audio' | 'image'): Promise<string> => {
    const ts = Date.now()
    const path = `${folder}/admin/${selectedContact!.id}/${ts}.${ext}`
    const { error } = await supabase.storage
      .from('whatsapp-media')
      .upload(path, file, {
        contentType: file.type,
        upsert: true
      })
    if (error) throw new Error(`Storage upload error: ${error.message}`)
    const { data } = supabase.storage.from('whatsapp-media').getPublicUrl(path)
    return data.publicUrl
  }

  // v2.12: Manejo de adjuntar imagen
  const handleAttachImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Solo imágenes')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagen muy grande (máx 5MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setPendingImage({ file, preview: reader.result as string, caption: '' })
    }
    reader.readAsDataURL(file)
    // reset input para permitir re-seleccionar el mismo archivo
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const cancelPendingImage = () => setPendingImage(null)

  // v2.12: Grabación de audio con MediaRecorder
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream
      // Intentar mp4 para compatibilidad WhatsApp, fallback a webm
      const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
                      : MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
                      : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        const preview = URL.createObjectURL(blob)
        setPendingAudio({ blob, duration: recordingDuration, preview })
        // limpiar stream
        recordingStreamRef.current?.getTracks().forEach(t => t.stop())
        recordingStreamRef.current = null
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingDuration(0)
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(d => d + 1)
      }, 1000)
    } catch (err) {
      console.error(err)
      toast.error('No se pudo acceder al micrófono. Permite el acceso e intenta de nuevo.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }

  const cancelRecording = () => {
    stopRecording()
    // limpiar pendingAudio si se generó después del stop
    setTimeout(() => {
      setPendingAudio(null)
      audioChunksRef.current = []
    }, 100)
  }

  const cancelPendingAudio = () => {
    if (pendingAudio) URL.revokeObjectURL(pendingAudio.preview)
    setPendingAudio(null)
  }

  useEffect(() => {
    return () => {
      // cleanup al desmontar
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      recordingStreamRef.current?.getTracks().forEach(t => t.stop())
      if (pendingAudio) URL.revokeObjectURL(pendingAudio.preview)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // v2.12: Mutación de envío extendida — soporta text / audio / image
  type SendPayload = 
    | { type: 'text', content: string }
    | { type: 'audio', file: Blob, ext: string }
    | { type: 'image', file: Blob, ext: string, caption: string }

  const sendMessageMutation = useMutation({
    mutationFn: async (payload: SendPayload) => {
      if (!webhookUrl) throw new Error('URL de Webhook no configurada en la Base de Datos');

      // Multicanal: n8n identifica al destinatario por external_id y decide el
      // canal (WhatsApp/Messenger/Instagram). Le mandamos también company_id y
      // channel para que el ruteo sea determinista y no tenga que adivinar.
      const recipientId = selectedContact!.external_id
      const canal = channelOf(selectedContact)

      let body: any
      let optimisticContent: string
      let mediaUrl: string | null = null
      let messageType: 'text' | 'audio' | 'image' = 'text'

      if (payload.type === 'text') {
        body = { patient_id: recipientId, company_id: userCompanyId, channel: canal, content: payload.content, message_type: 'text' }
        optimisticContent = payload.content
        messageType = 'text'
      } else if (payload.type === 'audio') {
        // Sube primero a Storage
        mediaUrl = await uploadToStorage(payload.file, payload.ext, 'audio')
        body = {
          patient_id: recipientId,
          company_id: userCompanyId,
          channel: canal,
          content: '🎤 [Audio enviado]',
          message_type: 'audio',
          media_url: mediaUrl
        }
        optimisticContent = '🎤 [Audio enviado]'
        messageType = 'audio'
      } else if (payload.type === 'image') {
        mediaUrl = await uploadToStorage(payload.file, payload.ext, 'image')
        body = {
          patient_id: recipientId,
          company_id: userCompanyId,
          channel: canal,
          content: payload.caption || '📷 [Imagen enviada]',
          message_type: 'image',
          media_url: mediaUrl,
          media_caption: payload.caption || null
        }
        optimisticContent = payload.caption || '📷 [Imagen enviada]'
        messageType = 'image'
      } else {
        throw new Error('Tipo de mensaje no válido')
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // Surfacear el motivo REAL que devuelve n8n (ej. suscripción/trial) en
        // vez de un genérico "Error de red". El flujo de admin responde
        // { status:'error', message:'...', code:NNN } con el HTTP status real.
        let msg = ''
        try {
          const err = await response.json()
          msg = err?.message || err?.error || ''
        } catch { /* respuesta sin cuerpo JSON */ }
        if (!msg) {
          msg = response.status === 402
            ? 'Tu suscripción no está activa. Reactívala en Facturación para poder responder desde el buzón.'
            : response.status === 404
              ? 'No se encontró el contacto o la empresa para este chat.'
              : `No se pudo enviar (error ${response.status}).`
        }
        throw new Error(msg)
      }

      return { optimisticContent, mediaUrl, messageType }
    },
    onMutate: async (payload: SendPayload) => {
      const tempId = `temp-${Date.now()}`
      const previewContent = payload.type === 'text' ? payload.content
                            : payload.type === 'audio' ? '🎤 [Audio enviado]'
                            : (payload.caption || '📷 [Imagen enviada]')
      const optimisticMsg: Message = {
        id: tempId,
        content: previewContent,
        sender: 'admin',
        created_at: new Date().toISOString(),
        patient_id: selectedContact!.external_id,
        channel: channelOf(selectedContact),
        message_type: payload.type,
        media_url: null,  // se actualizará cuando el real llegue
        media_caption: payload.type === 'image' ? payload.caption : null
      }
      queryClient.setQueryData(['messagesData', selectedContact!.external_id], (old: Message[] = []) => [...old, optimisticMsg]);

      if (payload.type === 'text') setNewMessage('');
      if (payload.type === 'audio') setPendingAudio(null);
      if (payload.type === 'image') setPendingImage(null);

      if (selectedContact!.ai_active) {
        toggleAIMutation.mutate(false);
      }
      return { tempId, payload };
    },
    onError: (err, payload, context) => {
      toast.error(err.message || 'No se pudo enviar el mensaje');
      queryClient.setQueryData(['messagesData', selectedContact!.external_id], (old: Message[] = []) => old.filter(m => m.id !== context?.tempId));
      if (payload.type === 'text') setNewMessage(payload.content);
    }
  })

  const handleLeadStatusChange = (newStatus: LifecycleStage) => updateStageMutation.mutate(newStatus)
  const handleToggleAI = () => toggleAIMutation.mutate(!selectedContact!.ai_active)
  
  const handleSendMessage = () => {
    if (sendMessageMutation.isPending || !selectedContact) return;
    // Prioridad: pendingImage > pendingAudio > texto
    if (pendingImage) {
      const ext = pendingImage.file.name.split('.').pop() || 'jpg'
      sendMessageMutation.mutate({ type: 'image', file: pendingImage.file, ext, caption: pendingImage.caption })
      return
    }
    if (pendingAudio) {
      // determinar extensión por mime type del blob
      const mime = pendingAudio.blob.type
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
      sendMessageMutation.mutate({ type: 'audio', file: pendingAudio.blob, ext })
      return
    }
    if (newMessage.trim()) {
      sendMessageMutation.mutate({ type: 'text', content: newMessage })
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isPageLoading = isLoadingWorkspace || isLoadingContacts || isLoadingProfile

  if (isPageLoading) {
    return (
      <div className="h-[calc(100vh-120px)] flex items-center justify-center bg-white rounded-3xl border border-slate-200 mt-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando bandeja...</p>
        </div>
      </div>
    )
  }

  // LÓGICA DE FILTRADO PARA EL SIDEBAR
  // 1. Solo mostrar los contactos que tienen un chat activo (o el que está seleccionado actualmente para poder escribirle)
  const contactosConChat = allContacts.filter(p => activeChatIds.has(p.external_id) || selectedContact?.id === p.id)

  // ⚠️ Red de seguridad: si hay mensajes de una conversación pero el contacto
  // no existe en `contacts` (p. ej. n8n no lo creó para Facebook/Instagram),
  // la conversación quedaba INVISIBLE en el buzón aunque el mensaje sí llegó.
  // Aquí la mostramos igual, con un contacto sintético, para que nunca se
  // pierda un cliente por un hueco de datos.
  const idsConContacto = new Set(allContacts.map(c => c.external_id))
  const huerfanos: Contact[] = Array.from(activeChatIds)
    .filter(extId => !idsConContacto.has(extId))
    .map(extId => ({
      id: extId,
      name: extId,
      phone: extId,
      external_id: extId,
      lifecycle_stage: 'new_lead',
      chat_status: 'open' as const,
      unread_count: 0,
      ai_active: true,
      platform: activeChat.channels[extId] || null,
      avatar_url: null,
      _sinContacto: true,
    } as Contact & { _sinContacto: boolean }))

  const activeSidebarContacts = [...contactosConChat, ...huerfanos]

  // 2a. Filtro por canal (WhatsApp / Facebook / Instagram)
  const byChannelContacts = channelFilter === 'all'
    ? activeSidebarContacts
    : activeSidebarContacts.filter(p => channelOf(p) === channelFilter)

  // 2b. Aplicar el filtro de etapa (funnel) sobre lo ya filtrado por canal
  const filteredContacts = activeFilter === 'all'
    ? byChannelContacts
    : byChannelContacts.filter(p => p.lifecycle_stage === activeFilter);

  // Conteos por canal (sobre todos los chats activos, sin importar la etapa)
  const channelCounts = activeSidebarContacts.reduce((acc, p) => {
    const c = channelOf(p)
    acc[c] = (acc[c] || 0) + 1
    return acc
  }, {} as Record<ChannelKey, number>);

  // 3. Contar funnels de los chats activos del canal seleccionado
  const funnelCounts = byChannelContacts.reduce((acc, p) => {
    acc[p.lifecycle_stage] = (acc[p.lifecycle_stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const currentFunnel = selectedContact 
    ? (funnels[selectedContact.lifecycle_stage] || defaultFunnel) 
    : defaultFunnel;

  // Filtrado para el Modal de Nuevo Chat
  const modalSearchResults = allContacts.filter(c => 
    c.name?.toLowerCase().includes(newChatSearch.toLowerCase()) || 
    c.phone?.includes(newChatSearch)
  )

  return (
    <div className="h-[calc(100vh-120px)] flex bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden text-slate-900 mt-8 animate-in fade-in duration-500">
      
      {/* COLUMNA 1: Filtros y Funnels */}
      <div className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col py-4 hidden lg:flex">
        {/* Badge del perfil de negocio (simula WhatsApp) */}
        <div className="px-2 -mt-4 mb-2">
          <BusinessProfileBadge accentColor={vertical?.accent_color || '#25D366'} />
        </div>

        <div className="px-5 mb-4 flex items-center justify-between">
          <h2 className="font-bold text-lg">Buzón</h2>
          {/* BOTÓN NUEVO MENSAJE */}
          <button 
            onClick={() => setIsNewChatOpen(true)}
            className="text-white p-1.5 rounded-lg shadow-sm hover:scale-105 transition-transform"
            style={{ backgroundColor: vertical?.accent_color || '#4f46e5' }}
            title="Iniciar Nuevo Chat"
          >
            <MessageSquarePlus size={18} />
          </button>
        </div>

        <div className="space-y-1 px-3">
          <button 
            onClick={() => setActiveFilter('all')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${activeFilter === 'all' ? 'bg-white shadow-sm border border-slate-200 text-slate-700' : 'hover:bg-slate-200/50 text-slate-600'}`}
          >
            <Inbox size={16} className="text-slate-500" /> Activos
            <span className="ml-auto bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
              {activeSidebarContacts.length}
            </span>
          </button>
        </div>

        {/* CANALES: cambiar entre WhatsApp / Facebook / Instagram */}
        {connectedChannels.length > 1 && (
          <div className="mt-6">
            <div className="px-5 mb-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Canales</p>
            </div>
            <div className="space-y-0.5 px-3">
              <button
                onClick={() => setChannelFilter('all')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors group ${channelFilter === 'all' ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-slate-200/50'}`}
              >
                <span className={`flex items-center gap-3 text-sm font-medium ${channelFilter === 'all' ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900'}`}>
                  <Inbox size={16} className="text-slate-500" /> Todos
                </span>
                <span className={`${channelFilter === 'all' ? 'bg-slate-100 text-slate-700' : 'bg-white border border-slate-200 text-slate-500'} text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                  {activeSidebarContacts.length}
                </span>
              </button>
              {connectedChannels.map((ch) => {
                const meta = CHANNELS[ch]
                const Icon = meta.Icon
                const isActive = channelFilter === ch
                return (
                  <button
                    key={ch}
                    onClick={() => setChannelFilter(ch)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors group ${isActive ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-slate-200/50'}`}
                  >
                    <span className={`flex items-center gap-3 text-sm font-medium ${isActive ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900'}`}>
                      <span className={meta.color}><Icon size={16} /></span> {meta.label}
                    </span>
                    <span className={`${isActive ? 'bg-slate-100 text-slate-700' : 'bg-white border border-slate-200 text-slate-500'} text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                      {channelCounts[ch] || 0}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mt-8">
          <div className="px-5 mb-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ciclo de vida</p>
          </div>
          <div className="space-y-0.5 px-3">
            {['new_lead', 'hot_lead', 'payment', 'customer'].map((key) => {
              const funnel = funnels[key];
              const count = funnelCounts[key] || 0;
              const isActive = activeFilter === key;

              return (
                <button 
                  key={key} 
                  onClick={() => setActiveFilter(key)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors group ${isActive ? 'bg-white shadow-sm border border-slate-200' : 'hover:bg-slate-200/50'}`}
                >
                  <div className={`flex items-center gap-3 text-sm font-medium ${isActive ? 'text-slate-900' : 'text-slate-600 group-hover:text-slate-900'}`}>
                    <funnel.icon size={16} className={funnel.color} />
                    {funnel.name}
                  </div>
                  <span className={`${isActive ? 'bg-slate-100 text-slate-700' : 'bg-white border border-slate-200 text-slate-500'} text-[10px] font-bold px-2 py-0.5 rounded-full`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* COLUMNA 2: Lista de Chats */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-100">
          <div className="flex gap-4 border-b border-slate-100 pb-4 mb-4">
            <button 
              className="text-sm font-bold border-b-2 pb-2 -mb-[18px]"
              style={{ color: vertical?.accent_color, borderColor: vertical?.accent_color }}
            >
              Chats
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              {channelFilter !== 'all' && <ChannelBadge channel={channelFilter} />}
              Filtro: {activeFilter === 'all' ? 'Todos' : funnels[activeFilter]?.name}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm font-medium">
              No tienes chats activos en esta etapa.
            </div>
          ) : (
            filteredContacts.map((p) => {
              const isSelected = selectedContact?.id === p.id
              const contactFunnel = funnels[p.lifecycle_stage] || defaultFunnel

              return (
                <div 
                  key={p.id} 
                  onClick={() => setSelectedContact(p)}
                  className={`p-4 border-b border-slate-50 cursor-pointer transition-all flex gap-3 relative overflow-hidden hover:bg-slate-50`}
                  style={isSelected ? { backgroundColor: `${vertical?.accent_color}10` } : {}}
                >
                  {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: vertical?.accent_color }}></div>}
                  <div className="relative">
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar_url} alt={p.name} className="h-10 w-10 rounded-full object-cover shadow-sm border border-slate-100" />
                    ) : (
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm border border-slate-100 ${!isSelected ? 'bg-slate-100 text-slate-600' : 'text-white'}`}
                        style={isSelected ? { backgroundColor: vertical?.accent_color } : {}}
                      >
                        {p.name.charAt(0)}
                      </div>
                    )}
                    {/* Glyph del canal (WhatsApp/Facebook/Instagram) */}
                    <span className="absolute -bottom-1 -right-1">
                      <ChannelGlyph channel={channelOf(p)} size={16} />
                    </span>
                    {p.unread_count > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white ring-2 ring-white">
                        {p.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <p
                        className={`text-sm truncate font-semibold`}
                        style={isSelected ? { color: vertical?.accent_color, fontWeight: 'bold' } : { color: '#1e293b' }}
                      >
                        {p.name}
                      </p>
                      {!p.ai_active && (
                        <BellRing size={12} className="text-rose-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <contactFunnel.icon size={12} className={contactFunnel.color} strokeWidth={3} />
                      <p className="text-xs text-slate-500 truncate">
                        {contactFunnel.name} 
                      </p>                  
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* COLUMNA 3: Área de Chat */}
      <div className="flex-1 flex flex-col bg-[#F8FAFC]">
        {selectedContact ? (
          <>
            {/* Header del Chat */}
            <div className="h-[72px] bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
              <div className="flex items-center gap-4">
                <div className="relative">
                  {selectedContact.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedContact.avatar_url} alt={selectedContact.name} className="h-10 w-10 rounded-full object-cover shadow-md border border-slate-100" />
                  ) : (
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-md"
                      style={{ backgroundColor: vertical?.accent_color || '#4f46e5' }}
                    >
                      {selectedContact.name.charAt(0)}
                    </div>
                  )}
                  <span className="absolute -bottom-1 -right-1">
                    <ChannelGlyph channel={channelOf(selectedContact)} size={16} />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 leading-tight truncate">{selectedContact.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <ChannelBadge channel={channelOf(selectedContact)} />
                    <span className="text-xs font-medium text-slate-500 truncate">
                      {channelOf(selectedContact) === 'whatsapp'
                        ? (selectedContact.phone || channelIdentityLabel('whatsapp', channelIdentity))
                        : `Respondes desde ${channelIdentityLabel(channelOf(selectedContact), channelIdentity)}`}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                
                {/* TOGGLE DE INTELIGENCIA ARTIFICIAL */}
                <button 
                  onClick={handleToggleAI}
                  disabled={toggleAIMutation.isPending}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border disabled:opacity-50
                    ${selectedContact.ai_active 
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' 
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 shadow-inner'
                    }`}
                >
                  {selectedContact.ai_active ? (
                    <><Bot size={14} /> IA Respondiendo</>
                  ) : (
                    <><UserCog size={14} className="text-rose-600" /> Modo Humano</>
                  )}
                </button>

                <div className="h-6 w-px bg-slate-200"></div>

                {/* Selector Dinámico de Lead */}
                <div className="relative group">
                  <select 
                    value={selectedContact.lifecycle_stage}
                    onChange={(e) => handleLeadStatusChange(e.target.value as LifecycleStage)}
                    disabled={updateStageMutation.isPending}
                    className={`appearance-none pl-8 pr-8 py-1.5 rounded-full border text-xs font-bold cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50
                      ${currentFunnel.bg} ${currentFunnel.color} border-slate-200` 
                    }
                  >
                    {!funnels[selectedContact.lifecycle_stage] && (
                      <option value={selectedContact.lifecycle_stage}>Sin Etapa Definida</option>
                    )}
                    {Object.entries(funnels).map(([key, funnel]) => (
                      <option key={key} value={key}>{funnel.name}</option> 
                    ))}
                  </select>
                  
                  <div className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${currentFunnel.color}`}>
                    <currentFunnel.icon size={12} strokeWidth={3} />
                  </div>
                  <ChevronDown size={12} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${currentFunnel.color}`} />
                </div>

                {selectedContact.stage_updated_by === 'ai' && (
                  <span className="hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold border border-indigo-100">
                    <Bot size={11} /> Asignado por IA
                  </span>
                )}

              </div>
            </div>

            {/* Aviso Flotante si la IA está apagada */}
            {!selectedContact.ai_active && (
              <div className="bg-rose-500 text-white text-xs font-bold text-center py-1.5 shadow-md z-10 flex items-center justify-center gap-2">
                <BellRing size={14} /> El bot está pausado. El cliente espera tu respuesta.
              </div>
            )}

            {/* Mensajes */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <MessageSquarePlus size={48} className="text-slate-200 mb-4" />
                  <p className="font-medium">No hay mensajes aún.</p>
                  <p className="text-sm">Escribe abajo para iniciar la conversación.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isPatient = msg.sender === 'patient'
                  const isOptimistic = msg.id.startsWith('temp-')
                  const accentColor = vertical?.accent_color || '#0f172a'

                  // v2.11: Detectar tipo de mensaje para render
                  const msgType = msg.message_type || 'text'
                  const hasMedia = !!msg.media_url

                  return (
                    <div key={msg.id} className={`flex flex-col ${isPatient ? 'items-start' : 'items-end'}`}>
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {(msg.sender === 'asistente' || msg.sender === 'ai') ? 'Bot IA' : isPatient ? selectedContact.name : 'Admin'}
                        </span>
                        {msgType === 'audio' && (
                          <span className="text-[9px] font-black text-purple-500 uppercase tracking-wider flex items-center gap-0.5">
                            <Mic size={9} /> Nota de voz
                          </span>
                        )}
                        {msgType === 'image' && (
                          <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider flex items-center gap-0.5">
                            <ImageIcon size={9} /> Imagen
                          </span>
                        )}
                      </div>
                      <div 
                        className={`max-w-[75%] text-[14px] shadow-sm ${
                          isPatient 
                            ? 'bg-white text-slate-800 rounded-2xl rounded-tl-sm border border-slate-200' 
                            : 'text-white rounded-2xl rounded-tr-sm'
                        } ${isOptimistic ? 'opacity-70' : 'opacity-100'} transition-opacity duration-300 ${
                          msgType === 'image' && hasMedia ? 'p-1.5' : 'px-4 py-2.5'
                        }`}
                        style={!isPatient ? { backgroundColor: accentColor } : {}}
                      >
                        {/* === AUDIO === */}
                        {msgType === 'audio' && hasMedia ? (
                          <div>
                            <audio
                              src={msg.media_url || undefined}
                              controls
                              className="w-full max-w-[260px] h-10"
                              style={{ accentColor: isPatient ? accentColor : 'white' }}
                            />
                            {/* Transcripción debajo */}
                            {msg.content && (
                              <div className={`mt-2 pt-2 border-t ${isPatient ? 'border-slate-200' : 'border-white/20'}`}>
                                <p className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${isPatient ? 'text-slate-400' : 'text-white/60'}`}>
                                  Transcripción
                                </p>
                                <p className="leading-relaxed whitespace-pre-wrap text-[13px]">
                                  {msg.content.replace(/^🎤\s*\[Nota de voz\]\s*/, '')}
                                </p>
                              </div>
                            )}
                          </div>
                        ) :

                        /* === IMAGE === */
                        msgType === 'image' && hasMedia ? (
                          <div>
                            <a
                              href={msg.media_url || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block relative group"
                            >
                              <img
                                src={msg.media_url || undefined}
                                alt={msg.media_caption || 'Imagen del paciente'}
                                className="rounded-xl max-w-full max-h-[300px] object-cover cursor-pointer hover:opacity-95 transition-opacity"
                                loading="lazy"
                              />
                              <div className="absolute top-2 right-2 bg-slate-900/60 backdrop-blur-sm rounded-lg p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 size={14} className="text-white" />
                              </div>
                            </a>
                            {/* Caption del paciente (texto que mandó con la imagen) */}
                            {msg.media_caption && (
                              <p className={`px-2.5 py-1.5 text-[13px] leading-relaxed ${isPatient ? 'text-slate-700' : 'text-white/95'}`}>
                                {msg.media_caption}
                              </p>
                            )}
                            {/* Descripción auto-generada del bot (solo si NO hay caption) */}
                            {!msg.media_caption && msg.content && (
                              <p className={`px-2.5 py-1.5 text-[11px] italic ${isPatient ? 'text-slate-500' : 'text-white/70'}`}>
                                {msg.content.replace(/^📷\s*\[Imagen\]\s*/, '').split(' | Caption:')[0]}
                              </p>
                            )}
                          </div>
                        ) :

                        /* === TEXT (default) === */
                        (
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        )}

                        {/* Footer con hora — siempre visible */}
                        <div className={`flex items-center justify-end gap-1 mt-1.5 text-[10px] ${
                          msgType === 'image' && hasMedia ? 'px-2.5 pb-1' : ''
                        } ${isPatient ? 'text-slate-400' : 'text-slate-300'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {!isPatient && (
                            isOptimistic 
                              ? <Clock size={12} className="text-white/70" /> 
                              : <CheckCheck size={14} className="text-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input v2.12: multimedia */}
            <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 space-y-2">

              {/* file input oculto */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAttachImage}
                className="hidden"
              />

              {/* === PREVIEW DE IMAGEN PENDIENTE === */}
              {pendingImage && (
                <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <img
                    src={pendingImage.preview}
                    alt="Vista previa"
                    className="h-16 w-16 object-cover rounded-lg shadow-sm"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <ImageIcon size={14} className="text-blue-600" />
                      <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">Imagen lista para enviar</span>
                    </div>
                    <input
                      type="text"
                      value={pendingImage.caption}
                      onChange={(e) => setPendingImage(p => p ? { ...p, caption: e.target.value } : null)}
                      placeholder="Agregar un texto (opcional)..."
                      className="w-full text-[13px] px-2 py-1 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <button
                    onClick={cancelPendingImage}
                    className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Cancelar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}

              {/* === PREVIEW DE AUDIO PENDIENTE === */}
              {pendingAudio && (
                <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-xl">
                  <div className="h-10 w-10 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
                    <Mic size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-bold text-purple-700 uppercase tracking-wider">Audio listo para enviar</span>
                      <span className="text-[11px] text-purple-600">
                        {Math.floor(pendingAudio.duration / 60).toString().padStart(2, '0')}:
                        {(pendingAudio.duration % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                    <audio src={pendingAudio.preview} controls className="w-full h-8" />
                  </div>
                  <button
                    onClick={cancelPendingAudio}
                    className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    title="Descartar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}

              {/* === UI DE GRABACIÓN ACTIVA === */}
              {isRecording && (
                <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <div className="h-10 w-10 rounded-full bg-red-500 flex items-center justify-center animate-pulse shrink-0">
                    <Mic size={18} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[11px] font-bold text-red-700 uppercase tracking-wider mb-0.5">Grabando...</div>
                    <div className="text-sm font-mono text-red-600">
                      {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:
                      {(recordingDuration % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                  <button
                    onClick={cancelRecording}
                    className="h-9 px-3 flex items-center gap-1.5 text-sm text-red-700 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <X size={16} /> Cancelar
                  </button>
                  <button
                    onClick={stopRecording}
                    className="h-9 w-9 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center transition-colors shrink-0"
                    title="Detener"
                  >
                    <Square size={16} fill="white" />
                  </button>
                </div>
              )}

              {/* === BARRA PRINCIPAL DE INPUT === */}
              <div className="flex items-end gap-2 bg-[#F8FAFC] p-2 rounded-2xl border border-slate-200 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                {/* Botón adjuntar imagen */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendMessageMutation.isPending || isRecording || !!pendingImage || !!pendingAudio}
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Adjuntar imagen"
                >
                  <Paperclip size={18} />
                </button>

                {/* Botón micrófono */}
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={sendMessageMutation.isPending || !!pendingImage || !!pendingAudio}
                  className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                    isRecording 
                      ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                      : 'text-slate-500 hover:text-purple-600 hover:bg-purple-50'
                  }`}
                  title={isRecording ? 'Detener grabación' : 'Grabar audio'}
                >
                  {isRecording ? <Square size={16} fill="currentColor" /> : <Mic size={18} />}
                </button>

                <textarea 
                  rows={1}
                  placeholder={
                    pendingImage ? 'Imagen lista — pulsa enviar' :
                    pendingAudio ? 'Audio listo — pulsa enviar' :
                    isRecording ? 'Grabando audio...' :
                    'Escribe para responder como humano (apaga la IA automáticamente)...'
                  }
                  className="flex-1 max-h-32 bg-transparent border-none outline-none px-3 py-2 text-sm text-slate-900 resize-none disabled:opacity-50"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sendMessageMutation.isPending || isRecording || !!pendingImage || !!pendingAudio}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={
                    sendMessageMutation.isPending || 
                    isRecording ||
                    (!newMessage.trim() && !pendingImage && !pendingAudio)
                  }
                  className="h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-md transition-colors shrink-0 mb-0.5 disabled:opacity-50"
                  style={{ backgroundColor: vertical?.accent_color || '#0f172a' }}
                >
                  {sendMessageMutation.isPending ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Send size={18} className="ml-1" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="h-24 w-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100">
              <Inbox size={40} className="text-slate-300" strokeWidth={1} />
            </div>
            <p className="text-sm font-medium">Selecciona una conversación para comenzar</p>
          </div>
        )}
      </div>

      {/* MODAL DE NUEVO MENSAJE */}
      {isNewChatOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsNewChatOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 h-[600px] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2 text-lg">
                <MessageSquarePlus className="text-blue-600" /> Iniciar Nuevo Chat
              </h3>
              <button onClick={() => setIsNewChatOpen(false)} className="text-slate-400 hover:text-slate-700 bg-white p-1 rounded-full border border-slate-200 shadow-sm"><X size={16} /></button>
            </div>
            
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Busca un paciente por nombre o teléfono..." 
                  value={newChatSearch}
                  onChange={(e) => setNewChatSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {modalSearchResults.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm font-medium">
                  No se encontraron contactos.
                </div>
              ) : (
                modalSearchResults.map(contact => (
                  <button 
                    key={contact.id}
                    onClick={() => {
                      setSelectedContact(contact)
                      setIsNewChatOpen(false)
                      setNewChatSearch('')
                    }}
                    className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-colors border border-transparent hover:border-slate-100"
                  >
                    <div className="relative shrink-0">
                      {contact.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={contact.avatar_url} alt={contact.name} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm">
                          {contact.name.charAt(0)}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1">
                        <ChannelGlyph channel={channelOf(contact)} size={15} />
                      </span>
                    </div>
                    <div className="text-left min-w-0">
                      <p className="font-bold text-slate-900 truncate">{contact.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {channelOf(contact) === 'whatsapp' ? (contact.phone || 'WhatsApp') : CHANNELS[channelOf(contact)].label}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
