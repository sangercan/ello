import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@store/authStore'
import apiClient from '@services/api'
import { ensureCallPermissions, ensureCameraPermission, ensureLocationPermission } from '@services/permissions'
import { playAlertSound } from '@services/alertSounds'
import { resolveMediaUrl } from '@utils/mediaUrl'
import { useCallStore } from '@store/callStore'
import { toast } from 'react-hot-toast'
// 🔒 ICON PATTERN LOCKED - Do not change Icon imports (Mic, FileText, Image, Video, MapPin, Smile, Send, Camera)
import { Send, ArrowLeft, Phone, Video, MoreVertical, Paperclip, MapPin, Mic, Image, Smile, X, FileText, PlayCircle, Camera, Pencil, Trash2 } from 'lucide-react'
import type { CallType } from '@/types/call'
import type { User as AppUser } from '@/types'
import { getMoodAvatarRingStyle } from '@/utils/mood'

type ChatUser = AppUser & {
  last_seen_at?: string
}

interface Message {
  id: number
  sender_id: number
  receiver_id: number
  content: string
  created_at: string
  is_read: boolean
  is_delivered: boolean
  media_url?: string
  audio_url?: string
  reactions?: Array<{
    reaction: string
    count: number
    user_ids: number[]
  }>
  sender?: {
    id: number
    username: string
    avatar_url?: string
  }
}

interface ForwardTarget {
  id: number
  username: string
  full_name?: string
  avatar_url?: string
  mood?: string | null
}

export default function ChatPage() {
  const buildLocationPreviewUrl = (lat: number, lng: number) => {
    // Use embeddable map URL that does not require API keys.
    return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`
  }

  const getAppWebSocket = () => {
    return (window as any).__elloAppWs as WebSocket | null
  }

  const { recipientId } = useParams<{ recipientId: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.user)
  const startOutgoingCall = useCallStore((state) => state.startOutgoingCall)
  const [recipientUser, setRecipientUser] = useState<ChatUser | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevels, setAudioLevels] = useState<number[]>([0, 0, 0])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [mediaPreview, setMediaPreview] = useState<Array<{ type: string; src: string; name?: string }> | null>(null)
  const [pendingMedia, setPendingMedia] = useState<Array<{ file: File; type: string }> | null>(null)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [expandedImageIndex, setExpandedImageIndex] = useState<number>(-1)
  const [allImages, setAllImages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null)
  const [messageActionMenuId, setMessageActionMenuId] = useState<number | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null)
  const [editingMessageText, setEditingMessageText] = useState('')
  const [forwardMessageIds, setForwardMessageIds] = useState<number[]>([])
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(new Set())
  const [forwardTargets, setForwardTargets] = useState<ForwardTarget[]>([])
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false)
  const [callLoading, setCallLoading] = useState<CallType | null>(null)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [isHeaderActionLoading, setIsHeaderActionLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const headerMenuRef = useRef<HTMLDivElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneStreamRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const videoCameraRef = useRef<HTMLVideoElement | null>(null)
  const canvasCameraRef = useRef<HTMLCanvasElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!headerMenuOpen) return
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (headerMenuRef.current?.contains(target)) return
      setHeaderMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [headerMenuOpen])
  const getMessageTimestamp = (message: Message) => {
    if (!message?.created_at) return 0
    const parsed = Date.parse(message.created_at)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const sortMessagesChronologically = (messagesList: Message[]) => {
    return [...messagesList].sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b))
  }
  const dedupeMessages = (messagesList: Message[]) => {
    const mapping = new Map<number, Message>()
    for (const msg of messagesList) {
      if (!msg || msg.id == null) continue
      const key = Number(msg.id)
      if (!Number.isFinite(key)) continue
      mapping.set(key, msg)
    }
    return sortMessagesChronologically(Array.from(mapping.values()))
  }
  const appendUniqueMessages = (existing: Message[], incoming: Message[]) => {
    if (incoming.length === 0) return sortMessagesChronologically(existing)
    return dedupeMessages([...existing, ...incoming])
  }
  const prependUniqueMessages = (existing: Message[], incoming: Message[]) => {
    if (incoming.length === 0) return sortMessagesChronologically(existing)
    return dedupeMessages([...incoming, ...existing])
  }
  const appendMessageIfUnique = (message: Message) => {
    const normalizedMessage: Message = {
      ...message,
      id: Number.isFinite(Number(message.id)) ? Number(message.id) : Date.now(),
    }
    setMessages((prev) => appendUniqueMessages(prev, [normalizedMessage]))
  }

  const resolveApiMessage = (responseData: any): Message => {
    const payload = responseData?.message || responseData || {}
    const canonicalId = Number.isFinite(Number(payload.id)) ? Number(payload.id) : Date.now()

    return {
      id: canonicalId,
      sender_id: payload.sender_id ?? currentUser?.id ?? 0,
      receiver_id: payload.receiver_id ?? parseInt(recipientId || '0', 10),
      content: payload.content ?? messageInput,
      created_at: payload.created_at ?? new Date().toISOString(),
      is_read: Boolean(payload.is_read),
      is_delivered: Boolean(payload.is_delivered),
      media_url: payload.media_url,
      audio_url: payload.audio_url,
    }
  }

  void resolveApiMessage

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return 'Visto por ultimo recentemente'

    const date = new Date(lastSeen)
    if (Number.isNaN(date.getTime())) return 'Visto por ultimo recentemente'

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)

    if (diffMins < 1) return 'Visto por ultimo agora'
    if (diffMins < 60) return `Visto por ultimo ha ${diffMins} min`
    if (diffHours < 24) return `Visto por ultimo ha ${diffHours}h`

    return `Visto por ultimo em ${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
  }

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Check if user is near the bottom
  const checkIfNearBottom = () => {
    if (!messagesContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current
    const isNear = scrollHeight - (scrollTop + clientHeight) < 100
    setIsNearBottom(isNear)
  }

  // Auto-scroll only if near bottom, otherwise show indicator
  useEffect(() => {
    if (isNearBottom && newMessagesCount > 0) {
      scrollToBottom()
      setNewMessagesCount(0)
    }
  }, [messages, isNearBottom])

  // Scroll listener
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    container.addEventListener('scroll', checkIfNearBottom)
    return () => container.removeEventListener('scroll', checkIfNearBottom)
  }, [])

  // Mark messages as read
  const markMessagesAsRead = async (messageIds: number[]) => {
    if (messageIds.length === 0) return
    try {
      const uniqueIds = Array.from(new Set(messageIds)).filter((id) => Number.isFinite(Number(id)))
      await Promise.allSettled(uniqueIds.map((msgId) => apiClient.markMessageAsRead(msgId)))
    } catch (error) {
      console.error('Erro ao marcar mensagens como lidas:', error)
    }
  }

  const refreshMessageReactions = async (messageId: number) => {
    try {
      const response = await apiClient.getMessageReactions(messageId)
      const reactions = response.data?.data || []
      setMessages(prev => prev.map(msg => (
        msg.id === messageId ? { ...msg, reactions } : msg
      )))
    } catch (error) {
      console.error('Erro ao atualizar reacoes:', error)
    }
  }

  const handleAddReaction = async (messageId: number, reaction: string) => {
    try {
      await apiClient.reactToMessage(messageId, reaction)
      await refreshMessageReactions(messageId)
      setReactionPickerMessageId(null)
    } catch (error) {
      console.error('Erro ao reagir mensagem:', error)
      toast.error('Erro ao enviar reacao')
    }
  }

  const handleOpenForwardModal = async (messageIds: number[]) => {
    const normalizedIds = Array.from(new Set(messageIds.filter((id) => Number.isFinite(Number(id)))))
    if (normalizedIds.length === 0) return
    try {
      const response = await apiClient.getConversations(1, 100)
      const targets = (response.data?.data || [])
        .map((conv: any) => conv.other_user)
        .filter((user: any) => user && user.id !== currentUser?.id)

      setForwardTargets(targets)
      setForwardMessageIds(normalizedIds)
      setIsForwardModalOpen(true)
      setMessageActionMenuId(null)
    } catch (error) {
      console.error('Erro ao carregar conversas para encaminhar:', error)
      toast.error('Erro ao carregar usuarios')
    }
  }

  const toggleMessageSelection = (messageId: number) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  const getReplyLabel = () => {
    if (!replyTo) return ''
    if (replyTo.sender_id === currentUser?.id) return 'Você'
    return recipientUser?.full_name || recipientUser?.username || `Usuário ${replyTo.sender_id}`
  }

  const splitReplyContent = (text?: string) => {
    const content = text || ''
    if (!content.startsWith('>> ')) return { header: null as string | null, body: content }
    const idx = content.indexOf('\n')
    if (idx === -1) return { header: content.slice(3).trim(), body: '' }
    const header = content.slice(3, idx).trim()
    const body = content.slice(idx + 1)
    return { header, body }
  }

  const handleForwardToUser = async (targetUserId: number) => {
    if (forwardMessageIds.length === 0) return
    try {
      for (const messageId of forwardMessageIds) {
        await apiClient.forwardMessage(messageId, targetUserId)
      }
      toast.success(
        forwardMessageIds.length > 1
          ? `${forwardMessageIds.length} mensagens encaminhadas`
          : 'Mensagem encaminhada'
      )
      setIsForwardModalOpen(false)
      setForwardMessageIds([])
      setSelectedMessageIds(new Set())
    } catch (error) {
      console.error('Erro ao encaminhar mensagem:', error)
      toast.error('Erro ao encaminhar mensagem')
    }
  }

  const closeForwardModal = () => {
    setIsForwardModalOpen(false)
    setForwardMessageIds([])
  }

  const recipientNumericId = useMemo(() => Number(recipientId || 0), [recipientId])

  const resolveConversationId = async () => {
    const response = await apiClient.getConversations(1, 200)
    const list = response.data?.data || []
    const match = list.find((conv: any) => Number(conv.other_user?.id) === recipientNumericId)
    return Number(match?.id || 0)
  }

  const handleDeleteCurrentConversation = async () => {
    if (!recipientNumericId || isHeaderActionLoading) return
    if (!window.confirm('Excluir esta conversa?')) return
    setIsHeaderActionLoading(true)
    try {
      const conversationId = await resolveConversationId()
      if (!conversationId) {
        toast.error('Conversa não encontrada')
        return
      }
      await apiClient.deleteConversation(conversationId)
      toast.success('Conversa excluída')
      navigate('/chat')
    } catch (error) {
      console.error('Erro ao excluir conversa:', error)
      toast.error('Erro ao excluir conversa')
    } finally {
      setIsHeaderActionLoading(false)
      setHeaderMenuOpen(false)
    }
  }

  const handleBlockCurrentUser = async () => {
    if (!recipientNumericId || isHeaderActionLoading) return
    if (!window.confirm(`Bloquear ${recipientUser?.full_name || recipientUser?.username || 'este usuário'}?`)) return
    setIsHeaderActionLoading(true)
    try {
      await apiClient.blockUser(recipientNumericId)
      toast.success('Usuário bloqueado')
      navigate('/chat')
    } catch (error) {
      console.error('Erro ao bloquear usuário:', error)
      toast.error('Erro ao bloquear usuário')
    } finally {
      setIsHeaderActionLoading(false)
      setHeaderMenuOpen(false)
    }
  }

  const handleStartCall = async (callType: CallType) => {
    if (!recipientUser || callLoading) return
    setCallLoading(callType)
    try {
      const isHttpPage =
        window.location.protocol === 'http:' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1'
      if (isHttpPage) {
        toast.error('Para chamadas no web, use HTTPS.')
        return
      }

      const permission = await ensureCallPermissions(callType)
      if (!permission.granted) {
        if (permission.media.microphone !== 'granted') {
          toast.error('Permita o microfone para iniciar chamadas.')
          return
        }
        if (callType === 'video' && permission.media.camera !== 'granted') {
          toast.error('Permita a camera para iniciar chamadas de video.')
          return
        }
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('Este dispositivo nao suporta camera/microfone para chamadas.')
        return
      }

      const ws = getAppWebSocket()
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        toast.error('Conexao em tempo real indisponivel. Tente novamente em alguns segundos.')
        return
      }

      const response = await apiClient.startCall(recipientUser.id, callType)
      const callId = response.data?.id || Date.now()
      const label = callType === 'video' ? 'vídeo' : 'voz'
      toast.success(`Chamada de ${label} iniciada`)
      startOutgoingCall({
        callId,
        callType,
        user: recipientUser,
      })
    } catch (error: any) {
      console.error('Erro ao iniciar chamada:', error)
      const detailPayload = error?.response?.data?.detail
      const detailMessage =
        typeof detailPayload === 'string'
          ? detailPayload
          : typeof detailPayload?.message === 'string'
            ? detailPayload.message
            : error?.message || 'Erro ao iniciar chamada'
      const detailCode =
        typeof detailPayload === 'object' && detailPayload
          ? String(detailPayload.code || '')
          : ''
      const isBusy = Boolean(
        error?.response?.status === 409 &&
          (detailCode.toLowerCase().includes('busy') || /ocupad/i.test(detailMessage))
      )

      if (isBusy) {
        playAlertSound('busy')
        toast.error('Usuario ocupado em outra ligacao')
      } else {
        toast.error(detailMessage)
      }
    } finally {
      setCallLoading(null)
    }
  }

  const canEditMessage = (message: Message) => {
    if (!message) return false
    if (message.media_url || message.audio_url) return false
    const content = message.content || ''
    const isLocation = /Lat:\s*[\d.-]+,\s*Lng:\s*[\d.-]+/i.test(content) || /Compartilhar Localiza[cç][aã]o/i.test(content)
    return !isLocation
  }

  const handleOpenMessageActions = (message: Message) => {
    setMessageActionMenuId(prev => (prev === message.id ? null : message.id))
  }

  const handleStartEditMessage = (message: Message) => {
    if (!canEditMessage(message)) return
    setEditingMessageId(message.id)
    setEditingMessageText(message.content || '')
    setMessageActionMenuId(null)
  }

  const handleCancelEditMessage = () => {
    setEditingMessageId(null)
    setEditingMessageText('')
  }

  const handleSaveEditedMessage = async (messageId: number) => {
    const nextContent = editingMessageText.trim()
    if (!nextContent) {
      toast.error('Mensagem não pode ficar vazia')
      return
    }

    try {
      await apiClient.updateMessage(messageId, nextContent)
      setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, content: nextContent } : msg))
      setEditingMessageId(null)
      setEditingMessageText('')
      toast.success('Mensagem editada')
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      toast.error(detail || 'Erro ao editar mensagem')
    }
  }

  const handleDeleteMessage = async (messageId: number) => {
    const confirmed = window.confirm('Deseja excluir esta mensagem?')
    if (!confirmed) return

    try {
      await apiClient.deleteMessage(messageId)
      setMessages(prev => prev.filter(msg => msg.id !== messageId))
      setMessageActionMenuId(null)
      if (editingMessageId === messageId) {
        setEditingMessageId(null)
        setEditingMessageText('')
      }
      toast.success('Mensagem excluída')
    } catch {
      toast.error('Erro ao excluir mensagem')
    }
  }

  // Load chat data once when recipient changes.
  useEffect(() => {
    if (!recipientId || !currentUser) {
      toast.error('ID de usuário inválido')
      navigate('/chat')
      return
    }

    const initChat = async () => {
      try {
        // Validate recipientId
        if (!recipientId || recipientId === 'undefined') {
          toast.error('ID de usuário inválido')
          navigate('/chat')
          return
        }

        const [userData, messagesResponse] = await Promise.all([
          apiClient.getUser(recipientId),
          apiClient.getMessages(recipientId, 1, 50),
        ])
        setRecipientUser(userData)
        const loadedMessages = messagesResponse.data?.data || messagesResponse.data || []
        setMessages(dedupeMessages(loadedMessages))

        // Scroll to bottom after messages load
        setTimeout(() => scrollToBottom(), 100)

        // Mark unread messages as read
        const unreadMessageIds = loadedMessages
          .filter((msg: Message) => msg.receiver_id === currentUser.id && !msg.is_read)
          .map((msg: Message) => msg.id)
        
        if (unreadMessageIds.length > 0) {
          void markMessagesAsRead(unreadMessageIds)
        }
      } catch (error) {
        console.error('Erro ao carregar chat:', error)
        toast.error('Erro ao carregar chat')
      }
    }

    initChat()
  }, [recipientId, currentUser])

  // Realtime updates from global websocket (created in App.tsx).
  useEffect(() => {
    if (!recipientId || !currentUser) return

    const handleRealtimeMessage = (event: Event) => {
      const custom = event as CustomEvent<any>
      const data = custom.detail
      if (!data || data.type !== 'new_message') return

      const message = data.message
      if (!message) return

      const senderId = Number(message.sender_id)
      const receiverId = Number(message.receiver_id)

      const belongsToThisChat =
        (senderId === recipientNumericId && receiverId === currentUser.id) ||
        (senderId === currentUser.id && receiverId === recipientNumericId)

      if (!belongsToThisChat) return

      const normalizedMessage: Message = {
        id: Number(message.id) || Date.now(),
        sender_id: senderId,
        receiver_id: receiverId,
        content: message.content || '',
        created_at: message.created_at || new Date().toISOString(),
        is_read: Boolean(message.is_read),
        is_delivered: Boolean(message.is_delivered),
        media_url: message.media_url,
        audio_url: message.audio_url,
      }

      setMessages((prev) => appendUniqueMessages(prev, [normalizedMessage]))

      if (!isNearBottom) {
        setNewMessagesCount((prev) => prev + 1)
      }

      if (receiverId === currentUser.id && !normalizedMessage.is_read) {
        markMessagesAsRead([normalizedMessage.id])
      }
    }

    const handleTypingEvent = (event: Event) => {
      const custom = event as CustomEvent<any>
      const data = custom.detail
      if (!data || data.type !== 'typing') return

      if (Number(data.from_user_id) !== recipientNumericId) return

      setOtherIsTyping(true)

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current)
      }

      typingTimerRef.current = setTimeout(() => {
        setOtherIsTyping(false)
      }, 5000)
    }

    const handlePresenceUpdate = async (event: Event) => {
      const custom = event as CustomEvent<any>
      const data = custom.detail
      if (!data || data.type !== 'presence_update') return

      const onlineUsers = Array.isArray(data.online_users) ? data.online_users.map(Number) : []
      const isRecipientOnline = onlineUsers.includes(recipientNumericId)

      setRecipientUser((prev) => (prev ? { ...prev, is_online: isRecipientOnline } : prev))

      if (!isRecipientOnline) {
        try {
          const userData = await apiClient.getUser(recipientId)
          setRecipientUser(userData)
        } catch {
          // Ignore fallback fetch failure.
        }
      }
    }

    const handleMessageUpdated = (event: Event) => {
      const custom = event as CustomEvent<any>
      const data = custom.detail
      if (!data || data.type !== 'message_updated' || !data.message) return

      const updatedMessage = data.message
      setMessages((prev) => prev.map((msg) => {
        if (Number(msg.id) !== Number(updatedMessage.id)) return msg
        return {
          ...msg,
          content: updatedMessage.content || msg.content,
          media_url: updatedMessage.media_url,
          audio_url: updatedMessage.audio_url,
        }
      }))
    }

    const handleMessageDeleted = (event: Event) => {
      const custom = event as CustomEvent<any>
      const data = custom.detail
      if (!data || data.type !== 'message_deleted') return
      const deletedId = Number(data.message_id)
      if (!Number.isFinite(deletedId)) return
      setMessages((prev) => prev.filter((msg) => Number(msg.id) !== deletedId))
    }

    window.addEventListener('ello:ws:new-message', handleRealtimeMessage)
    window.addEventListener('ello:ws:typing', handleTypingEvent)
    window.addEventListener('ello:ws:presence-update', handlePresenceUpdate)
    window.addEventListener('ello:ws:message-updated', handleMessageUpdated)
    window.addEventListener('ello:ws:message-deleted', handleMessageDeleted)

    return () => {
      window.removeEventListener('ello:ws:new-message', handleRealtimeMessage)
      window.removeEventListener('ello:ws:typing', handleTypingEvent)
      window.removeEventListener('ello:ws:presence-update', handlePresenceUpdate)
      window.removeEventListener('ello:ws:message-updated', handleMessageUpdated)
      window.removeEventListener('ello:ws:message-deleted', handleMessageDeleted)
    }
  }, [recipientId, currentUser, isNearBottom])

  // Handle scroll to load more messages
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container || !recipientId) return

    const handleScroll = async () => {
      // If scrolled to top and not loading more yet
      if (container.scrollTop === 0 && !isLoadingMore && messages.length >= 50) {
        setIsLoadingMore(true)
        try {
          const nextPage = currentPage + 1
          const response = await apiClient.getMessages(recipientId as string, nextPage, 50)
          const olderMessages = response.data?.data || response.data || []
          
          if (olderMessages.length > 0) {
            // Add older messages to the beginning
            setMessages(prev => prependUniqueMessages(prev, olderMessages))
            setCurrentPage(nextPage)
          }
        } catch (error) {
          console.error('Erro ao carregar mais mensagens:', error)
        } finally {
          setIsLoadingMore(false)
        }
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [recipientId, currentPage, isLoadingMore, messages.length])

  // Handle ESC key to close expanded image
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedImage) {
        setExpandedImage(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedImage])

  const handleSendMessage = async () => {
    const replyPrefix = replyTo ? `>> ${getReplyLabel()}: ${replyTo.content}\n` : ''

    // Se há mídia pendente, enviar junto com a legenda
    if (pendingMedia && pendingMedia.length > 0) {
      if (!recipientId || isSending) return

      try {
        setIsSending(true)
        const captionBase = messageInput.trim()
        const caption = replyTo ? `${replyPrefix}${captionBase}`.trim() : captionBase
        
        // Enviar cada arquivo com a legenda
        for (const { file, type } of pendingMedia) {
          const reader = new FileReader()
          
          await new Promise((resolve) => {
            reader.onload = async () => {
              const base64 = reader.result as string

              try {
                const response = await apiClient.sendMedia({
                  media_blob: base64,
                  receiver_id: parseInt(recipientId),
                  media_type: type,
                  filename: file.name,
                  caption: caption || undefined
                })

                console.log('Resposta send media:', response)

                if (response?.data?.message) {
                  const mediaMessage: Message = {
                    id: response.data.message.id,
                    sender_id: currentUser!.id,
                    receiver_id: parseInt(recipientId),
                    content: response.data.message.content || caption,
                    created_at: new Date().toISOString(),
                    is_read: false,
                    is_delivered: true,
                    media_url: response.data.message.media_url,
                    audio_url: response.data.message.audio_url
                  }
                  
                  appendMessageIfUnique(mediaMessage)
                  
                } else {
                  toast.error('Resposta inválida do servidor')
                }
              } catch (error) {
                console.error('Erro ao enviar mídia:', error)
                toast.error(`Erro ao enviar ${file.name}`)
              }
              
              resolve(null)
            }
            reader.readAsDataURL(file)
          })
        }

        // Limpar estados após envio
        setMessageInput('')
        setReplyTo(null)
        setMediaPreview(null)
        setPendingMedia(null)
        toast.success('Arquivo(s) enviado(s)!')
        
      } catch (error) {
        console.error('Erro ao enviar mídia:', error)
        toast.error('Erro ao enviar arquivo(s)')
      } finally {
        setIsSending(false)
      }
      return
    }

    // Se não há mídia, enviar só a mensagem de texto
    if (!messageInput.trim() || !recipientId || isSending) return

    try {
      setIsSending(true)
      const outgoingText = replyTo ? `${replyPrefix}${messageInput}` : messageInput
      const response = await apiClient.sendMessage(recipientId, outgoingText)

      const serverMessage = response?.data
      // Só faz render otimista se o servidor devolveu ID válido (evita duplicação com o WS).
      if (serverMessage?.id) {
        appendMessageIfUnique({
          id: Number(serverMessage.id),
          sender_id: currentUser?.id || 0,
          receiver_id: parseInt(recipientId),
          content: serverMessage.content ?? outgoingText,
          created_at: serverMessage.created_at || new Date().toISOString(),
          is_read: Boolean(serverMessage.is_read),
          is_delivered: Boolean(serverMessage.is_delivered ?? true),
          media_url: serverMessage.media_url,
          audio_url: serverMessage.audio_url,
        })
      }

      setMessageInput('')
      setReplyTo(null)

      toast.success('Mensagem enviada!')
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      toast.error('Erro ao enviar mensagem')
    } finally {
      setIsSending(false)
    }
  }

  const handleCancelMedia = () => {
    setMediaPreview(null)
    setPendingMedia(null)
    toast.success('Upload cancelado')
  }

  const handleTyping = () => {
    const appWs = getAppWebSocket()
    if (appWs && appWs.readyState === WebSocket.OPEN && recipientId) {
      appWs.send(JSON.stringify({
        type: 'typing',
        to_user_id: parseInt(recipientId)
      }))
    }
    
    // Clear existing timeout
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current)
    }
  }

  const handleStartRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('Seu navegador não suporta gravação de áudio')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      
      // Initialize Web Audio API for frequency analysis
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      
      const audioContext = audioContextRef.current
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      
      const microphone = audioContext.createMediaStreamSource(stream)
      microphoneStreamRef.current = microphone
      microphone.connect(analyser)
      
      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        try {
          // Cleanup audio context
          if (analyserRef.current) {
            analyser.disconnect()
          }
          if (microphoneStreamRef.current) {
            microphoneStreamRef.current.disconnect()
          }
          
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          console.log('✅ Áudio gravado:', audioBlob.size, 'bytes')
          
          // Converter para base64
          const reader = new FileReader()
          reader.readAsDataURL(audioBlob)
          reader.onloadend = async () => {
            const base64Audio = reader.result as string
            
            try {
              // Enviar áudio para o backend
              const response = await apiClient.sendAudio({
                audio_blob: base64Audio,
                receiver_id: parseInt(recipientId!),
                duration: recordingTime
              })

              if (response.data?.message) {
                const audioMessage: Message = {
                  id: response.data.message.id,
                  sender_id: currentUser!.id,
                  receiver_id: parseInt(recipientId!),
                  content: '',
                  audio_url: response.data.message.audio_url || '',
                  created_at: new Date().toISOString(),
                  is_read: false,
                  is_delivered: true
                }
                
                appendMessageIfUnique(audioMessage)
                
                toast.success('Áudio enviado!')
              }
            } catch (error) {
              console.error('Erro ao enviar áudio:', error)
              toast.error('Erro ao enviar áudio')
            }
          }
        } catch (error) {
          console.error('Erro ao processar áudio:', error)
          toast.error('Erro ao processar áudio')
        }
      }

      mediaRecorder.onerror = (event) => {
        console.error('Erro ao gravar:', event.error)
        toast.error('Erro ao gravar áudio: ' + event.error)
      }

      mediaRecorder.start(100)
      setIsRecording(true)
      setRecordingTime(0)
      
      // Timer de gravação
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
      
      // Analyser loop for frequency visualization
      const analyzeAudio = () => {
        if (!isRecording || !analyserRef.current) return
        
        const freqData = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(freqData)
        
        // Get average levels from different frequency ranges
        const bass = (freqData[0] + freqData[1] + freqData[2]) / 3
        const mid = (freqData[5] + freqData[6] + freqData[7]) / 3
        const treble = (freqData[10] + freqData[11] + freqData[12]) / 3
        
        setAudioLevels([
          Math.min(100, (bass / 255) * 100),
          Math.min(100, (mid / 255) * 100),
          Math.min(100, (treble / 255) * 100)
        ])
        
        animationFrameRef.current = requestAnimationFrame(analyzeAudio)
      }
      
      analyzeAudio()
      toast.success('Gravando áudio...')
    } catch (error: any) {
      console.error('Erro ao acessar microfone:', error)
      if (error.name === 'NotAllowedError') {
        toast.error('Permissão de microfone negada')
      } else if (error.name === 'NotFoundError') {
        toast.error('Nenhum microfone encontrado')
      } else {
        toast.error('Erro ao acessar microfone')
      }
    }
  }

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      setIsRecording(false)
      setAudioLevels([0, 0, 0])
      const tracks = (mediaRecorderRef.current.stream as MediaStream).getTracks()
      tracks.forEach(track => track.stop())
    }
  }

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !recipientId) return

    const validFiles: { file: File; type: string }[] = []

    // Validar todos os arquivos primeiro
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith('image') && !file.type.startsWith('video')) {
        toast.error('❌ Apenas imagens e vídeos são permitidos')
        if (mediaInputRef.current) mediaInputRef.current.value = ''
        return
      }
      validFiles.push({
        file,
        type: file.type.startsWith('image') ? 'image' : 'video'
      })
    }

    try {
      // Criar previews para todos os arquivos
      const previews: Array<{ type: string; src: string; name: string }> = []
      
      for (const { file, type } of validFiles) {
        const reader = new FileReader()
        
        await new Promise((resolve) => {
          reader.onload = async () => {
            const base64 = reader.result as string
            previews.push({ type, src: base64, name: file.name })
            resolve(null)
          }
          reader.readAsDataURL(file)
        })
      }

      // Armazenar previews e arquivos pendentes (SEM ENVIAR)
      setMediaPreview(previews)
      setPendingMedia(validFiles)
      setShowMediaMenu(false)
      toast.success(`${validFiles.length} arquivo(s) selecionado(s). Digite uma legenda e clique em Enviar!`)
      
    } catch (error) {
      console.error('Erro ao ler arquivos:', error)
      toast.error('Erro ao ler arquivos')
    } finally {
      if (mediaInputRef.current) {
        mediaInputRef.current.value = ''
      }
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !recipientId) return

    // Validar tipos de arquivo permitidos
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/zip',
      'application/x-zip-compressed'
    ]

    const validFiles: File[] = []

    // Validar todos os arquivos primeiro
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      
      // Verificar se é imagem ou vídeo
      if (file.type.startsWith('image') || file.type.startsWith('video')) {
        toast.error('❌ Selecione documentos, não imagens/vídeos. Use o menu de Mídia para enviar fotos/vídeos')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }

      const isValidDoc = allowedTypes.includes(file.type) || file.name.match(/\.(pdf|txt|doc|docx|xls|xlsx|ppt|pptx|zip)$/i)

      if (!isValidDoc) {
        toast.error('❌ Tipo de arquivo inválido. Use: PDF, Word, Excel, PowerPoint, ZIP ou TXT')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      
      validFiles.push(file)
    }

    try {
      // Criar previews para todos os arquivos
      const previews: Array<{ type: string; src: string; name: string }> = validFiles.map(f => ({
        type: 'document',
        src: f.name,
        name: f.name
      }))

      // Armazenar previews e arquivos pendentes (SEM ENVIAR)
      setMediaPreview(previews)
      setPendingMedia(validFiles.map(f => ({ file: f, type: 'document' })))
      setShowMediaMenu(false)
      toast.success(`${validFiles.length} arquivo(s) selecionado(s). Digite uma legenda e clique em Enviar!`)
      
    } catch (error) {
      console.error('Erro ao ler arquivos:', error)
      toast.error('Erro ao ler arquivos')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleShareLocation = async () => {
    if (!navigator.geolocation || !recipientId) {
      toast.error('Geolocalização não disponível')
      return
    }

    const permission = await ensureLocationPermission()
    if (!permission.granted) {
      toast.error('Permita localizacao para compartilhar sua posicao.')
      return
    }

    try {
      setIsSending(true)
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords
        
        try {
          // Get location name (reverse geocoding - simulated)
          const locationName = 'Compartilhar Localização'
          
          const response = await apiClient.sendLocation({
            receiver_id: parseInt(recipientId),
            latitude,
            longitude,
            location_name: locationName
          })

          if (response.data?.message) {
            const locationMessage: Message = {
              id: response.data.message.id,
              sender_id: currentUser!.id,
              receiver_id: parseInt(recipientId),
              content: `${locationName}\nLat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`,
              created_at: new Date().toISOString(),
              is_read: false,
              is_delivered: true
            }
            
            appendMessageIfUnique(locationMessage)
            toast.success('Localização compartilhada!')
          }
        } catch (error) {
          console.error('Erro ao enviar localização:', error)
          toast.error('Erro ao enviar localização')
        }
      }, (error) => {
        console.error('Erro de geolocalização:', error)
        toast.error('Erro ao acessar localização')
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleOpenCamera = async () => {
    try {
      const permission = await ensureCameraPermission()
      if (!permission.granted) {
        toast.error('Permita camera para capturar foto.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      })
      cameraStreamRef.current = stream
      if (videoCameraRef.current) {
        videoCameraRef.current.srcObject = stream
      }
      setIsCameraOpen(true)
      setShowMediaMenu(false)
    } catch (error) {
      console.error('Erro ao acessar cmera:', error)
      toast.error(' No foi possvel acessar a cmera')
    }
  }

  const handleCloseCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop())
      cameraStreamRef.current = null
    }
    setIsCameraOpen(false)
  }

  const handleTakePhoto = async () => {
    if (!videoCameraRef.current || !canvasCameraRef.current) return

    try {
      const context = canvasCameraRef.current.getContext('2d')
      if (!context) return

      canvasCameraRef.current.width = videoCameraRef.current.videoWidth
      canvasCameraRef.current.height = videoCameraRef.current.videoHeight
      context.drawImage(videoCameraRef.current, 0, 0)

      canvasCameraRef.current.toBlob(async (blob) => {
        if (!blob || !recipientId) return

        try {
          // Converter blob para File
          const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })
          
          // Criar preview
          const reader = new FileReader()
          await new Promise((resolve) => {
            reader.onload = () => {
              const base64 = reader.result as string
              setMediaPreview([{ type: 'image', src: base64, name: file.name }])
              setPendingMedia([{ file, type: 'image' }])
              handleCloseCamera()
              toast.success('📸 Foto capturada! Digite uma legenda e clique em Enviar.')
              resolve(null)
            }
            reader.readAsDataURL(blob)
          })
        } catch (error) {
          console.error('Erro ao processar foto:', error)
          toast.error('Erro ao processar foto')
        }
      }, 'image/jpeg', 0.95)
    } catch (error) {
      console.error('Erro ao tirar foto:', error)
      toast.error('Erro ao tirar foto')
    }
  }

  if (!recipientId || recipientId === 'undefined' || !currentUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <p className="text-gray-400">ID de usuário inválido</p>
      </div>
    )
  }

  if (!recipientUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <p className="text-gray-400">Usuário não encontrado</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 bg-slate-900/50 border-b border-slate-700/50 sticky top-0 z-40 flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-800 rounded-lg transition flex-shrink-0 text-gray-400 hover:text-white hover:scale-110 duration-200"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>

          <button
            onClick={() => navigate(`/profile/${recipientUser.id}`)}
            className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition min-w-0"
          >
            <img
              src={recipientUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${recipientUser.username}`}
              alt={recipientUser.username}
              className="w-[30px] h-[30px] sm:w-10 sm:h-10 rounded-full border border-slate-700 object-cover flex-shrink-0"
              style={getMoodAvatarRingStyle(recipientUser.mood)}
            />

            <div className="min-w-0 text-left">
              <h2 className="font-semibold text-white text-sm sm:text-base truncate">{recipientUser.full_name || recipientUser.username}</h2>
              {otherIsTyping ? (
                <p className="text-xs text-yellow-400 animate-pulse">Esta digitando...</p>
              ) : recipientUser.is_online ? (
                <p className="text-xs text-green-400">Online</p>
              ) : (
                <p className="text-xs text-gray-400">{formatLastSeen(recipientUser.last_seen_at)}</p>
              )}
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <button
            onClick={() => handleStartCall('voice')}
            disabled={Boolean(callLoading)}
            aria-label="Iniciar chamada de voz"
            title="Chamada de voz"
            className={`p-2 hover:bg-slate-800 rounded-lg transition text-gray-400 hover:text-primary hover:scale-110 duration-200 disabled:text-gray-500 disabled:hover:bg-slate-900 ${callLoading === 'voice' ? 'text-primary' : ''}`}
          >
            {callLoading === 'voice' ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-flex" />
            ) : (
              <Phone size={20} strokeWidth={1.5} />
            )}
          </button>
          <button
            onClick={() => handleStartCall('video')}
            disabled={Boolean(callLoading)}
            aria-label="Iniciar chamada de vídeo"
            title="Chamada de vídeo"
            className={`p-2 hover:bg-slate-800 rounded-lg transition text-gray-400 hover:text-primary hover:scale-110 duration-200 disabled:text-gray-500 disabled:hover:bg-slate-900 ${callLoading === 'video' ? 'text-primary' : ''}`}
          >
            {callLoading === 'video' ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-flex" />
            ) : (
              <Video size={20} strokeWidth={1.5} />
            )}
          </button>
          <div ref={headerMenuRef} className="relative">
            <button
              onClick={() => setHeaderMenuOpen((prev) => !prev)}
              className="p-2 hover:bg-slate-800 rounded-lg transition text-gray-400 hover:text-primary hover:scale-110 duration-200"
            >
              <MoreVertical size={20} strokeWidth={1.5} />
            </button>
            {headerMenuOpen && (
              <div className="absolute right-0 mt-1 min-w-[180px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-30">
                <button
                  onClick={handleDeleteCurrentConversation}
                  disabled={isHeaderActionLoading}
                  className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-500/10 transition inline-flex items-center gap-2 disabled:opacity-60"
                >
                  <Trash2 size={13} />
                  Excluir conversa
                </button>
                <button
                  onClick={handleBlockCurrentUser}
                  disabled={isHeaderActionLoading}
                  className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 transition disabled:opacity-60"
                >
                  Bloquear usuário
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4" ref={messagesContainerRef}>
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <img
                src={recipientUser.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${recipientUser.username}`}
                alt={recipientUser.username}
                className="w-16 h-16 rounded-full mx-auto mb-4 border border-slate-700 object-cover"
                style={getMoodAvatarRingStyle(recipientUser.mood)}
              />
              <h3 className="text-white font-semibold mb-2 text-sm sm:text-base">Comece uma conversa com {recipientUser.full_name || recipientUser.username}</h3>
              <p className="text-gray-400 text-xs sm:text-sm">@{recipientUser.username}</p>
            </div>
          </div>
        )}

        {messages.map((message) => {
          // Detectar tipo de conteúdo
          const cleanContent = (message.content || '').trim()
          const contentLower = cleanContent.toLowerCase()
          const mediaUrlRaw = message.media_url || ''
          const mediaUrlLower = mediaUrlRaw.toLowerCase().split('?')[0].split('#')[0]
          const imageByExtension = /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|svg)$/.test(mediaUrlLower)
          const videoByExtension = /\.(mp4|mov|avi|mkv|webm|m4v|3gp|m3u8)$/.test(mediaUrlLower)
          const documentByExtension = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$/.test(mediaUrlLower)

          const contentImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|svg)$/.test(contentLower)
          const contentVideoExt = /\.(mp4|mov|avi|mkv|webm|m4v|3gp|m3u8)$/.test(contentLower)
          const contentDocExt = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip)$/.test(contentLower)

          const isImage = Boolean(imageByExtension || contentImageExt || contentLower.includes('image:') || message.content?.startsWith('🖼️'))
          const isVideo = Boolean(videoByExtension || contentVideoExt || contentLower.includes('video:') || message.content?.startsWith('🎥'))
          const isDocument = Boolean((documentByExtension || contentDocExt || contentLower.includes('document:') || message.content?.startsWith('📄')) && !isImage && !isVideo)
          const isAudio = message.audio_url && !isImage && !isVideo
          const isLocation = /Lat:\s*[\d.-]+,\s*Lng:\s*[\d.-]+/i.test(message.content || '') || /Compartilhar Localiza[cç][aã]o/i.test(message.content || '')
          const isVisualMessage = isImage || isVideo || isLocation || Boolean(isAudio)
          const looksLikeAutoMediaLabel = /^📎\s*(image|video|document):/i.test(cleanContent)
          const looksLikeAutoAudioLabel = /^🎤\s*Áudio/i.test(cleanContent)
          const shouldRenderCaption = Boolean(cleanContent) && !isLocation && !looksLikeAutoMediaLabel && !looksLikeAutoAudioLabel
          const isOwnMessage = message.sender_id === currentUser?.id
          const canEditThisMessage = isOwnMessage && canEditMessage(message)
          const isEditingThisMessage = editingMessageId === message.id

          return (
          <div
            key={message.id}
            className={`flex ${message.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs sm:max-w-sm md:max-w-md text-sm sm:text-base ${
                isVisualMessage
                  ? (message.sender_id === currentUser?.id ? 'text-white' : 'text-gray-100')
                  : (message.sender_id === currentUser?.id
                    ? 'px-3 sm:px-4 py-2 rounded-2xl bg-purple-700 text-white'
                    : 'px-3 sm:px-4 py-2 rounded-2xl bg-slate-800 text-gray-100')
              }`}
            >
              {/* Áudio */}
              {isAudio && (
                <div className="mb-2 flex items-center gap-2">
                  {/* 🔒 ICON LOCKED - Do not change */}
                  <Mic size={20} className="flex-shrink-0 text-purple-400" />
                  <audio
                    src={resolveMediaUrl(message.audio_url)}
                    controls
                    className="flex-1 h-8 accent-purple-600"
                  />
                </div>
              )}

              {/* Imagem */}
              {isImage && (
                <img
                  src={resolveMediaUrl(message.media_url || message.content)}
                  alt="imagem"
                  className="w-48 h-auto rounded-lg mb-2 cursor-pointer hover:opacity-80 transition"
                  onClick={() => {
                    const imageUrl = resolveMediaUrl(message.media_url || message.content)
                    setExpandedImage(imageUrl)
                    // Extrair todas as imagens das mensagens para navegação
                    const allImageUrls = messages
                      .filter(msg => {
                        const contentLower = msg.content?.toLowerCase() || ''
                        return (msg.media_url || contentLower.includes('.jpg') || contentLower.includes('.jpeg') || contentLower.includes('.png') || contentLower.includes('.gif'))
                      })
                      .map(msg => resolveMediaUrl(msg.media_url || msg.content))
                    setAllImages(allImageUrls)
                    setExpandedImageIndex(allImageUrls.indexOf(imageUrl))
                  }}
                />
              )}

              {/* Vídeo */}
              {isVideo && (
                <video
                  src={resolveMediaUrl(message.media_url || message.content)}
                  controls
                  className="w-48 h-auto rounded-lg mb-2"
                />
              )}

              {/* Documento */}
              {isDocument && (
                <div className="mb-2 flex items-center gap-2 bg-white/10 p-3 rounded-lg border border-white/20">
                  {/* 🔒 ICON LOCKED - Do not change */}
                  <FileText size={20} className="flex-shrink-0 text-blue-400" />
                    <a
                    href={resolveMediaUrl(message.media_url || message.content)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-80 truncate flex-1 text-sm"
                  >
                    {message.content?.replace(/^📄|Document:|📄/g, '').trim() || 'Abrir arquivo'}
                  </a>
                </div>
              )}

              {/* Localizacao com Mini Mapa */}
              {isLocation && (() => {
                const coordMatch = message.content?.match(/Lat:\s*([\d.-]+),\s*Lng:\s*([\d.-]+)/)
                if (coordMatch) {
                  const lat = parseFloat(coordMatch[1])
                  const lng = parseFloat(coordMatch[2])
                  const mapPreviewUrl = buildLocationPreviewUrl(lat, lng)
                  
                  return (
                    <div
                      className={`mb-2 w-[58%] max-w-full rounded-lg overflow-hidden border border-green-500/30 bg-gradient-to-br from-green-900/20 to-transparent ${
                        message.sender_id === currentUser?.id ? 'ml-auto mr-0' : 'ml-0 mr-auto'
                      }`}
                    >
                      <div className="relative w-full aspect-video bg-slate-800 overflow-hidden">
                        <iframe
                          src={mapPreviewUrl}
                          title={`Mapa da localizacao ${lat.toFixed(4)}, ${lng.toFixed(4)}`}
                          className="w-full h-full border-0 pointer-events-none"
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                        <button
                          onClick={() => setSelectedLocation({ lat, lng })}
                          className="absolute inset-0 bg-black/20 hover:bg-black/40 transition flex items-center justify-center group cursor-pointer"
                        >
                          <div className="text-center group-hover:scale-110 transition">
                            <MapPin size={36} className="text-white opacity-0 group-hover:opacity-100 transition mx-auto mb-2" />
                            <p className="text-white text-sm font-semibold opacity-0 group-hover:opacity-100 transition bg-black/50 px-3 py-1 rounded">Abrir em mapa</p>
                          </div>
                        </button>
                      </div>
                      {/* Informações de localização */}
                      <div className="p-2.5 flex items-center justify-center bg-green-900/10 border-t border-green-500/20">
                        <button
                          onClick={() => setSelectedLocation({ lat, lng })}
                          className="p-0 bg-transparent text-green-400 hover:text-green-300 text-[11px] transition flex items-center gap-1 font-semibold"
                        >
                          <MapPin size={14} />
                          Navegar
                        </button>
                      </div>
                    </div>
                  )
                }
                return null
              })()}
              {/* Fallback para localização sem coordenadas extraíveis */}
              {isLocation && (() => {
                const coordMatch = message.content?.match(/Lat:\s*([\d.-]+),\s*Lng:\s*([\d.-]+)/)
                return !coordMatch ? (
                  <div className="mb-2 flex items-center gap-2 bg-white/10 p-3 rounded-lg border border-white/20">
                    <MapPin size={20} className="flex-shrink-0 text-green-400" />
                    <p className="text-xs text-gray-400">{message.content}</p>
                  </div>
                ) : null
              })()}

              {/* Texto normal */}
              {!isAudio && !isImage && !isVideo && !isDocument && !isLocation && (
                isEditingThisMessage ? (
                  <div className="mb-2 space-y-2">
                    <textarea
                      value={editingMessageText}
                      onChange={(event) => setEditingMessageText(event.target.value)}
                      rows={2}
                      className="w-full bg-slate-900/60 border border-slate-600 rounded-lg p-2 text-sm text-white resize-none focus:outline-none focus:border-primary"
                    />
                    <div className={`flex items-center gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                      <button
                        onClick={handleCancelEditMessage}
                        className="text-xs text-gray-300 hover:text-white transition"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleSaveEditedMessage(message.id)}
                        className="text-xs px-2.5 py-1 rounded bg-primary hover:bg-primary/85 text-white transition"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const { header, body } = splitReplyContent(message.content)
                    return (
                      <>
                        {header && (
                          <div className={`mb-1 text-xs ${isOwnMessage ? 'text-blue-100' : 'text-gray-400'} font-semibold`}>
                            {header}
                          </div>
                        )}
                        <p className="break-words">{body || message.content}</p>
                      </>
                    )
                  })()
                )
              )}

              {/* Legenda para mídia compartilhada */}
              {(isAudio || isImage || isVideo || isDocument) && shouldRenderCaption && (
                <p className="break-words mt-1">{message.content}</p>
              )}

              {/* Reacoes */}
              {message.reactions && message.reactions.length > 0 && (
                <div className={`flex flex-wrap gap-1 mt-2 ${message.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'}`}>
                  {message.reactions.map((item, idx) => (
                    <button
                      key={`${message.id}-${item.reaction}-${idx}`}
                      onClick={() => handleAddReaction(message.id, item.reaction)}
                      className={`px-2 py-0.5 rounded-full text-xs border transition ${
                        item.user_ids?.includes(currentUser?.id || 0)
                          ? 'bg-purple-600/60 border-purple-400 text-white'
                          : 'bg-slate-700/60 border-slate-500 text-gray-200'
                      }`}
                    >
                      {item.reaction} {item.count}
                    </button>
                  ))}
                </div>
              )}

              {/* Acoes da mensagem */}
              <div className={`flex items-center gap-2 mt-2 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                {selectedMessageIds.has(message.id) && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/25 border border-primary/40 text-primary">
                    Selecionada
                  </span>
                )}
                <div className="relative">
                  <button
                    onClick={() => handleOpenMessageActions(message)}
                    className="text-xs text-gray-300 hover:text-white transition"
                  >
                    <MoreVertical size={14} />
                  </button>
                  {messageActionMenuId === message.id && (
                    <div className={`absolute ${isOwnMessage ? 'right-0' : 'left-0'} mt-1 min-w-[160px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-20`}>
                      <button
                        onClick={() => {
                          setReactionPickerMessageId(
                            reactionPickerMessageId === message.id ? null : message.id
                          )
                          setMessageActionMenuId(null)
                        }}
                        className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 transition"
                      >
                        Reagir
                      </button>
                      <button
                        onClick={() => {
                          setReplyTo(message)
                          setMessageActionMenuId(null)
                        }}
                        className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 transition"
                      >
                        Responder
                      </button>
                      <button
                        onClick={() => {
                          setMessageActionMenuId(null)
                          handleOpenForwardModal([message.id])
                        }}
                        className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 transition"
                      >
                        Compartilhar
                      </button>
                      <button
                        onClick={() => {
                          toggleMessageSelection(message.id)
                          setMessageActionMenuId(null)
                        }}
                        className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 transition"
                      >
                        {selectedMessageIds.has(message.id) ? 'Remover seleção' : 'Selecionar'}
                      </button>
                      {isOwnMessage && canEditThisMessage && (
                        <button
                          onClick={() => handleStartEditMessage(message)}
                          className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 transition inline-flex items-center gap-2"
                        >
                          <Pencil size={13} />
                          Editar
                        </button>
                      )}
                      {isOwnMessage && (
                        <button
                          onClick={() => handleDeleteMessage(message.id)}
                          className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-500/10 transition inline-flex items-center gap-2"
                        >
                          <Trash2 size={13} />
                          Excluir
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {reactionPickerMessageId === message.id && (
                <div className={`flex gap-1 mt-2 bg-slate-900/50 rounded-full px-2 py-1 w-fit ${message.sender_id === currentUser?.id ? 'ml-auto' : 'mr-auto'}`}>
                  {['👍', '❤️', '😂', '😮', '😢', '🔥'].map((emoji) => (
                    <button
                      key={`${message.id}-${emoji}`}
                      onClick={() => handleAddReaction(message.id, emoji)}
                      className="text-sm hover:scale-125 transition"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              
              <div className={`text-xs mt-1 flex items-center gap-1 ${
                message.sender_id === currentUser?.id
                  ? 'text-blue-100 justify-end'
                  : 'text-gray-500'
              }`}>
                {new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {message.sender_id === currentUser?.id && (
                  <>
                    {message.is_delivered && !message.is_read && <span>✓✓</span>}
                    {message.is_read && <span className="text-blue-300">✓✓</span>}
                  </>
                )}
              </div>
            </div>
          </div>
          )
        })}

        {otherIsTyping && (
          <div className="flex justify-start">
            <div className="bg-slate-800 text-gray-100 px-4 py-2 rounded-2xl">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />

        {/* New Messages Indicator Balloon */}
        {newMessagesCount > 0 && !isNearBottom && (
          <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 z-40">
            <button
              onClick={() => {
                scrollToBottom()
                setNewMessagesCount(0)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-full shadow-lg flex items-center gap-2 transition duration-200 hover:scale-105 active:scale-95 font-medium text-sm sm:text-base"
            >
              <span>↓ {newMessagesCount} mensagem{newMessagesCount > 1 ? 's' : ''} nova{newMessagesCount > 1 ? 's' : ''}</span>
            </button>
          </div>
        )}

        {selectedMessageIds.size > 0 && (
          <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 z-40">
            <div className="bg-slate-900/95 border border-slate-700 rounded-full shadow-xl px-3 py-2 flex items-center gap-2">
              <span className="text-xs text-gray-200">
                {selectedMessageIds.size} selecionada{selectedMessageIds.size > 1 ? 's' : ''}
              </span>
              <button
                onClick={() => handleOpenForwardModal(Array.from(selectedMessageIds))}
                className="text-xs px-3 py-1 rounded-full bg-primary text-white hover:bg-primary/85 transition"
              >
                Compartilhar
              </button>
              <button
                onClick={() => setSelectedMessageIds(new Set())}
                className="text-xs px-3 py-1 rounded-full bg-slate-700 text-gray-200 hover:bg-slate-600 transition"
              >
                Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Expanded Image Modal */}
      {expandedImage && (
        <div 
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center">
            {/* Close Button */}
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 p-3 rounded-full transition z-10"
              title="Fechar (ESC)"
            >
              <X size={24} className="text-white" />
            </button>

            {/* Previous Button */}
            {expandedImageIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const newIndex = expandedImageIndex - 1
                  setExpandedImageIndex(newIndex)
                  setExpandedImage(allImages[newIndex])
                }}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-purple-600 hover:bg-purple-700 p-3 rounded-full transition z-10"
                title="Imagem anterior"
              >
                <ArrowLeft size={24} className="text-white" />
              </button>
            )}

            {/* Next Button */}
            {expandedImageIndex < allImages.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const newIndex = expandedImageIndex + 1
                  setExpandedImageIndex(newIndex)
                  setExpandedImage(allImages[newIndex])
                }}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-purple-600 hover:bg-purple-700 p-3 rounded-full transition z-10"
                title="Próxima imagem"
              >
                <ArrowLeft size={24} className="text-white rotate-180" />
              </button>
            )}

            {/* Image Counter */}
            {allImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 px-4 py-2 rounded-full text-white text-sm z-10">
                {expandedImageIndex + 1} / {allImages.length}
              </div>
            )}

            {/* Image */}
            <img
              src={expandedImage}
              alt="expanded"
              className="w-full h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl overflow-hidden max-w-md w-full border border-slate-700/50 shadow-2xl">
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <h2 className="text-white font-semibold">Cmera</h2>
              <button
                onClick={handleCloseCamera}
                className="p-2 hover:bg-slate-800 rounded-lg transition text-gray-400 hover:text-red-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="relative bg-black">
              <video
                ref={videoCameraRef}
                autoPlay
                playsInline
                className="w-full h-auto bg-black"
              />
              <canvas ref={canvasCameraRef} className="hidden" />
            </div>

            <div className="p-4 bg-slate-800/50 flex gap-3 justify-center border-t border-slate-700/50">
              <button
                onClick={handleTakePhoto}
                disabled={isSending}
                className="flex items-center gap-2 px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded-lg transition duration-200"
              >
                <Camera size={18} />
                <span>Tirar Foto</span>
              </button>
              <button
                onClick={handleCloseCamera}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition duration-200"
              >
                <X size={18} />
                <span>Fechar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {isForwardModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-md max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
              <h3 className="text-white font-semibold">
                Compartilhar {forwardMessageIds.length > 1 ? `${forwardMessageIds.length} mensagens` : 'mensagem'}
              </h3>
              <button
                onClick={closeForwardModal}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {forwardTargets.length === 0 ? (
                <p className="text-gray-400 text-sm p-4">Nenhuma conversa disponivel para compartilhar.</p>
              ) : (
                forwardTargets.map((target) => (
                  <button
                    key={target.id}
                    onClick={() => handleForwardToUser(target.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-800 transition text-left"
                  >
                    <img
                      src={target.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${target.username}`}
                      alt={target.username}
                      className="w-10 h-10 rounded-full border border-slate-600 object-cover"
                      style={getMoodAvatarRingStyle(target.mood)}
                    />
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{target.full_name || target.username}</p>
                      <p className="text-gray-400 text-xs truncate">@{target.username}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="p-3 sm:p-4 bg-slate-900/50 border-t border-slate-700/50 flex-shrink-0">
        {replyTo && (
          <div className="mb-2 p-2 bg-slate-800/70 rounded-lg text-xs text-gray-300 flex items-center justify-between">
            <span>
              Respondendo a {getReplyLabel()}
            </span>
            <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}
        {/* Inline Media Preview - Below Input */}
        {mediaPreview && mediaPreview.length > 0 && (
          <div className="mb-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700 flex gap-2 overflow-x-auto">
            <div className="flex-shrink-0 text-xs text-gray-400 py-2 px-2 whitespace-nowrap">
              📎 {mediaPreview.length} arquivo(s):
            </div>
            {mediaPreview.map((preview, idx) => (
              <div key={idx} className="relative group flex-shrink-0">
                {preview.type === 'image' ? (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-700 border border-slate-600">
                    <img 
                      src={preview.src} 
                      alt={`preview ${idx}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : preview.type === 'video' ? (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-700 border border-slate-600">
                    <img 
                      src={preview.src} 
                      alt={`video ${idx}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <PlayCircle size={20} className="text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 border border-blue-500 flex flex-col items-center justify-center">
                    <FileText size={20} className="text-white" />
                  </div>
                )}
                
                {/* Remove button */}
                <button
                  onClick={() => {
                    const newPreviews = mediaPreview.filter((_, i) => i !== idx)
                    if (newPreviews.length === 0) {
                      handleCancelMedia()
                    } else {
                      setMediaPreview(newPreviews)
                      setPendingMedia(pendingMedia?.filter((_, i) => i !== idx) || null)
                    }
                  }}
                  className="absolute top-0 right-0 bg-red-600 hover:bg-red-700 p-0.5 rounded opacity-0 group-hover:opacity-100 transition"
                  title="Remover"
                >
                  <X size={12} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Map Selection Modal */}
        {selectedLocation && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-2xl overflow-hidden max-w-sm w-full border border-slate-700/50 shadow-2xl">
              {/* Header */}
              <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-white font-semibold">Abrir em Mapa</h2>
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition text-gray-400 hover:text-red-400"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-3">
                <p className="text-sm text-gray-300 mb-4">
                  Selecione um aplicativo de mapa para navegar até essa localização:
                </p>

                {/* Google Maps */}
                <button
                  onClick={() => {
                    window.open(
                      `https://maps.google.com/?q=${selectedLocation.lat},${selectedLocation.lng}`,
                      '_blank'
                    )
                    setSelectedLocation(null)
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-blue-600/20 to-blue-700/20 hover:from-blue-600/40 hover:to-blue-700/40 border border-blue-500/30 rounded-lg transition text-left"
                >
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Google Maps</p>
                    <p className="text-gray-400 text-xs">Abrir no Google Maps</p>
                  </div>
                </button>

                {/* Apple Maps */}
                <button
                  onClick={() => {
                    window.open(
                      `maps://maps.apple.com/?daddr=${selectedLocation.lat},${selectedLocation.lng}`,
                      '_blank'
                    )
                    setSelectedLocation(null)
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-purple-600/20 to-purple-700/20 hover:from-purple-600/40 hover:to-purple-700/40 border border-purple-500/30 rounded-lg transition text-left"
                >
                  <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Apple Maps</p>
                    <p className="text-gray-400 text-xs">Abrir no Apple Maps</p>
                  </div>
                </button>

                {/* Waze */}
                <button
                  onClick={() => {
                    window.open(
                      `https://waze.com/ul?ll=${selectedLocation.lat},${selectedLocation.lng}&navigate=yes`,
                      '_blank'
                    )
                    setSelectedLocation(null)
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-green-600/20 to-green-700/20 hover:from-green-600/40 hover:to-green-700/40 border border-green-500/30 rounded-lg transition text-left"
                >
                  <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Waze</p>
                    <p className="text-gray-400 text-xs">Abrir no Waze</p>
                  </div>
                </button>

                {/* Generic Maps */}
                <button
                  onClick={() => {
                    window.open(
                      `https://maps.google.com/?q=${selectedLocation.lat},${selectedLocation.lng}`,
                      '_blank'
                    )
                    setSelectedLocation(null)
                  }}
                  className="w-full flex items-center gap-3 p-4 bg-gradient-to-r from-cyan-600/20 to-cyan-700/20 hover:from-cyan-600/40 hover:to-cyan-700/40 border border-cyan-500/30 rounded-lg transition text-left"
                >
                  <div className="w-10 h-10 bg-cyan-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <MapPin size={20} className="text-white" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Mapa Padrão</p>
                    <p className="text-gray-400 text-xs">Abrir em seu mapa padrão</p>
                  </div>
                </button>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-800/50 border-t border-slate-700/50">
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 items-end">
          {/* Media Menu Button */}
          <div className="relative">
            <button
              onClick={() => setShowMediaMenu(!showMediaMenu)}
              title="Anexar mídia ou arquivo"
              className="p-2 sm:p-3 hover:bg-slate-800 rounded-full transition text-gray-400 hover:text-primary hover:scale-110 flex-shrink-0 duration-200"
              disabled={isSending}
            >
              <Paperclip size={20} strokeWidth={1.5} />
            </button>

            {/* Media Menu Dropdown */}
            {showMediaMenu && (
              <div className="absolute bottom-12 left-0 bg-gradient-to-b from-slate-800 to-slate-850 border border-slate-700/50 rounded-xl overflow-hidden z-50 shadow-xl backdrop-blur-sm flex flex-col">
                <button
                  onClick={() => {
                    mediaInputRef.current?.click()
                    setShowMediaMenu(false)
                  }}
                  className="px-4 py-3 text-left text-gray-300 hover:bg-slate-700 hover:text-white flex items-center justify-center gap-3 text-sm transition border-b border-slate-700/50 hover:scale-110 duration-200"
                  title="Imagens & Vídeos"
                >
                  <Image size={20} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click()
                    setShowMediaMenu(false)
                  }}
                  className="px-4 py-3 text-left text-gray-300 hover:bg-slate-700 hover:text-white flex items-center justify-center gap-3 text-sm transition border-b border-slate-700/50 hover:scale-110 duration-200"
                  title="Arquivos"
                >
                  <FileText size={20} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => {
                    handleOpenCamera()
                  }}
                  className="px-4 py-3 text-left text-gray-300 hover:bg-slate-700 hover:text-white flex items-center justify-center gap-3 text-sm transition border-b border-slate-700/50 hover:scale-110 duration-200"
                  title="Cmera"
                >
                  <Camera size={20} strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => {
                    handleShareLocation()
                    setShowMediaMenu(false)
                  }}
                  className="px-4 py-3 text-left text-gray-300 hover:bg-slate-700 hover:text-white flex items-center justify-center gap-3 text-sm transition hover:scale-110 duration-200"
                  disabled={isSending}
                  title="Localização"
                >
                  <MapPin size={20} strokeWidth={1.5} />
                </button>
              </div>
            )}

            {/* File Inputs */}
            <input
              ref={mediaInputRef}
              type="file"
              onChange={handleMediaUpload}
              className="hidden"
              accept="image/*,video/*"
              multiple
            />
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
              multiple
            />
          </div>

          {/* Input */}
          <input
            type="text"
            value={messageInput}
            onChange={(e) => {
              setMessageInput(e.target.value)
              handleTyping()
            }}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-slate-800 text-white rounded-full py-2 sm:py-3 px-3 sm:px-4 text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={isSending}
          />

          {/* Emoji Picker Button */}
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title="Emoji"
              className="p-2 sm:p-3 hover:bg-slate-800 rounded-full transition text-gray-400 hover:text-primary hover:scale-110 flex-shrink-0 duration-200"
            >
              <Smile size={20} strokeWidth={1.5} />
            </button>

            {/* Emoji Picker Simples */}
            {showEmojiPicker && (
              <div className="absolute bottom-12 right-0 bg-slate-800 border border-slate-700 rounded-lg p-2 grid grid-cols-6 gap-1 w-48 max-h-64 overflow-y-auto z-50">
                {['😀', '😂', '😍', '🥰', '😪', '😭', '😱', '🤔', '😎', '🤩', '😘', '❤️', '👍', '🎉', '🔥', '✨', '💯', '🎄', '🎃', '👏', '🙏', '👏', '😅', '😁'].map((emoji, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setMessageInput(messageInput + emoji)
                      setShowEmojiPicker(false)
                    }}
                    className="text-xl hover:bg-slate-700 p-1 rounded transition text-center"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Send / Mic Button - Dynamic based on input or pending media */}
          {messageInput.trim().length > 0 || pendingMedia ? (
            // Show Send Button when typing or have pending media
            <button
              onClick={handleSendMessage}
              disabled={isSending}
              className="bg-gradient-to-r from-purple-700 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white p-2 sm:p-3 rounded-full transition hover:scale-110 duration-200 flex items-center justify-center flex-shrink-0 shadow-lg hover:shadow-purple-600/30"
            >
              {isSending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Send size={20} strokeWidth={1.5} />
              )}
            </button>
          ) : (
            // Show Mic Button when not typing and no pending media
            !isRecording ? (
              <button
                onClick={handleStartRecording}
                title="Gravar áudio"
                className="p-2 sm:p-3 hover:bg-slate-800 rounded-full transition text-gray-400 hover:text-primary hover:scale-110 flex-shrink-0 duration-200"
              >
                <Mic size={20} strokeWidth={1.8} />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleStopRecording}
                  title="Parar gravação"
                  className="p-2 sm:p-3 bg-red-500/20 rounded-full transition text-red-400 flex-shrink-0 animate-pulse hover:scale-110 duration-200"
                >
                  <Mic size={20} strokeWidth={1.8} />
                </button>
                <div className="flex items-center gap-0.5 h-8">
                  <div 
                    className="w-1 bg-red-400 rounded-full transition-all"
                    style={{ 
                      height: `${Math.max(4, audioLevels[0] * 0.4)}px`,
                      animationDelay: '0s'
                    }}
                  ></div>
                  <div 
                    className="w-1 bg-red-400 rounded-full transition-all"
                    style={{ 
                      height: `${Math.max(6, audioLevels[1] * 0.4)}px`,
                      animationDelay: '0.1s'
                    }}
                  ></div>
                  <div 
                    className="w-1 bg-red-400 rounded-full transition-all"
                    style={{ 
                      height: `${Math.max(4, audioLevels[2] * 0.4)}px`,
                      animationDelay: '0.2s'
                    }}
                  ></div>
                </div>
                <span className="text-red-400 text-xs font-semibold min-w-[30px]">
                  {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:{String(recordingTime % 60).padStart(2, '0')}
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
