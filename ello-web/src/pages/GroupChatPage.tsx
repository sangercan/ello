
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import apiClient from '@services/api'
import { useAuthStore } from '@store/authStore'
import {
  ArrowLeft,
  FileText,
  Image,
  MapPin,
  Mic,
  MoreVertical,
  Paperclip,
  PlayCircle,
  Send,
  Smile,
  X,
} from 'lucide-react'
import { resolveMediaUrl } from '@utils/mediaUrl'

interface Group {
  id: number
  name: string
  member_ids: number[]
  creator_id?: number
  image_url?: string
}

interface Message {
  id: number
  sender_id: number
  content: string
  created_at: string
  audio_url?: string
  media_url?: string
  reactions?: Array<{
    reaction: string
    count: number
    user_ids: number[]
  }>
  sender?: {
    id: number
    username: string
    full_name?: string
    avatar_url?: string
  } | null
}

type MediaPreviewItem = {
  type: 'image' | 'video' | 'file'
  src: string
  name?: string
  file: File
}

const EMOJIS = [
  '\u{1F600}', '\u{1F602}', '\u{1F60D}', '\u{1F970}', '\u{1F62A}', '\u{1F62D}',
  '\u{1F631}', '\u{1F914}', '\u{1F60E}', '\u{1F929}', '\u{1F618}', '\u2764\uFE0F',
  '\u{1F44D}', '\u{1F389}', '\u{1F525}', '\u2728', '\u{1F4AF}', '\u{1F384}',
  '\u{1F383}', '\u{1F44F}', '\u{1F64F}', '\u{1F605}', '\u{1F601}', '\u{1F609}',
]

const isImageFile = (name?: string) => !!name && /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
const isVideoFile = (name?: string) => !!name && /\.(mp4|webm|ogg|mov|m4v)$/i.test(name)

const parseLocation = (content?: string) => {
  if (!content) return null
  const match = /Lat:\s*([-\d.]+),\s*Lng:\s*([-\d.]+)/i.exec(content)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

const resolveAssetUrl = (path?: string) => {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('/')) return path
  return `/${path}`
}

const sortMessagesChronologically = (messagesList: Message[]) => {
  return [...messagesList].sort((a, b) => {
    const aTs = new Date(a.created_at || 0).getTime()
    const bTs = new Date(b.created_at || 0).getTime()
    return aTs - bTs
  })
}

const dedupeMessages = (messagesList: Message[]) => {
  const mapping = new Map<number, Message>()
  const nearDuplicateKeySeenAt = new Map<string, number>()
  messagesList.forEach((message) => {
    const normalizedId = Number(message?.id)
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return
    const normalizedCreatedAt = new Date(message.created_at || 0).getTime()
    const dedupeKey = [
      Number(message.sender_id) || 0,
      (message.content || '').trim(),
      message.audio_url || '',
      message.media_url || '',
    ].join('|')
    if (dedupeKey !== '0|||' && Number.isFinite(normalizedCreatedAt)) {
      const previousTs = nearDuplicateKeySeenAt.get(dedupeKey)
      if (typeof previousTs === 'number' && Math.abs(normalizedCreatedAt - previousTs) <= 2000) {
        return
      }
      nearDuplicateKeySeenAt.set(dedupeKey, normalizedCreatedAt)
    }
    const previous = mapping.get(normalizedId)
    if (!previous) {
      mapping.set(normalizedId, { ...message, id: normalizedId })
      return
    }

    mapping.set(normalizedId, {
      ...previous,
      ...message,
      id: normalizedId,
      sender: message.sender ?? previous.sender ?? null,
      reactions: message.reactions ?? previous.reactions,
    })
  })
  return sortMessagesChronologically(Array.from(mapping.values()))
}

const appendUniqueMessages = (existing: Message[], incoming: Message[]) => {
  if (incoming.length === 0) return dedupeMessages(existing)
  return dedupeMessages([...existing, ...incoming])
}

export default function GroupChatPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const [group, setGroup] = useState<Group | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [editName, setEditName] = useState('')
  const [editImage, setEditImage] = useState('')
  const [addUsername, setAddUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState<Array<any>>([])
  const [showMenu, setShowMenu] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewItem[]>([])
  const [isSending, setIsSending] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<number | null>(null)
  const [messageActionMenuId, setMessageActionMenuId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reactionFetchedRef = useRef<Set<number>>(new Set())
  const sendLockRef = useRef(false)

  const splitReplyContent = (text?: string) => {
    const content = text || ''
    if (!content.startsWith('>> ')) return { header: null as string | null, body: content }
    const idx = content.indexOf('\n')
    if (idx === -1) return { header: content.slice(3).trim(), body: '' }
    const header = content.slice(3, idx).trim()
    const body = content.slice(idx + 1)
    return { header, body }
  }

  const isAdmin = useMemo(() => {
    if (!currentUser || !group) return false
    return currentUser.id === group.creator_id || members.some((m) => m.id === currentUser.id && m.is_admin)
  }, [currentUser, group, members])

  useEffect(() => {
    if (!groupId) return
    const load = async () => {
      try {
        const [gRes, mRes, membersRes] = await Promise.all([
          apiClient.getGroup(groupId),
          apiClient.getGroupMessages(groupId, 1, 100),
          apiClient.listGroupMembers(groupId),
        ])
        setGroup(gRes.data)
        setEditName(gRes.data?.name || '')
        setEditImage(gRes.data?.image_url || '')
        setMembers(membersRes.data || [])
        setMessages(dedupeMessages(mRes.data?.data || []))
      } catch (error) {
        console.error('Erro ao carregar grupo:', error)
        toast.error('Grupo não encontrado')
        navigate('/chat')
      }
    }
    load()
  }, [groupId, navigate])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const data = (event as CustomEvent<any>).detail
      if (!data || data.type !== 'new_message' || Number(data.group_id) !== Number(groupId)) return
      if (!data.message) return
      const normalizedMessage: Message = {
        id: Number(data.message.id),
        sender_id: Number(data.message.sender_id),
        content: data.message.content || '',
        created_at: data.message.created_at || new Date().toISOString(),
        audio_url: data.message.audio_url,
        media_url: data.message.media_url,
        sender: data.message.sender || null,
      }
      setMessages((prev) => appendUniqueMessages(prev, [normalizedMessage]))
    }
    window.addEventListener('ello:ws:new-message', handler)
    return () => window.removeEventListener('ello:ws:new-message', handler)
  }, [groupId])

  useEffect(() => {
    const fetchReactions = async () => {
      const pending = messages.filter((msg) => !reactionFetchedRef.current.has(msg.id))
      if (pending.length === 0) return
      await Promise.all(pending.map(async (msg) => {
        reactionFetchedRef.current.add(msg.id)
        try {
          const response = await apiClient.getMessageReactions(msg.id)
          const reactions = response.data?.data || response.data || []
          setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, reactions } : m))
        } catch {
          // ignore missing reactions
        }
      }))
    }
    fetchReactions()
  }, [messages])

  const handleAddReaction = async (messageId: number, reaction: string) => {
    try {
      await apiClient.reactToMessage(messageId, reaction)
      const response = await apiClient.getMessageReactions(messageId)
      const reactions = response.data?.data || response.data || []
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, reactions } : m))
      setReactionPickerMessageId(null)
    } catch {
      toast.error('Erro ao reagir')
    }
  }

  const handleStartRecording = async () => {
    if (isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' })
          const res = await apiClient.uploadFile(file)
          const url = res.data?.url || res?.url
          await apiClient.sendGroupMessage(groupId || '', { audio_url: url })
        } catch (error) {
          console.error('Erro ao enviar áudio:', error)
          toast.error('Erro ao enviar áudio')
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    } catch (error) {
      console.error('Erro ao gravar áudio:', error)
      toast.error('Permita acesso ao microfone')
    }
  }

  const handleStopRecording = () => {
    if (!mediaRecorderRef.current) return
    mediaRecorderRef.current.stop()
    mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
    setIsRecording(false)
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }

  const handleMediaUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    const previews = files.map((file) => {
      const url = URL.createObjectURL(file)
      const type: 'image' | 'video' | 'file' = isImageFile(file.name)
        ? 'image'
        : isVideoFile(file.name)
          ? 'video'
          : 'file'
      return { type, src: url, name: file.name, file }
    })
    setMediaPreview(previews)
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return
    const previews = files.map((file) => ({
      type: 'file' as const,
      src: '',
      name: file.name,
      file,
    }))
    setMediaPreview(previews)
  }

  const handleSendMessage = async () => {
    if (!groupId) return
    if (sendLockRef.current) return
    const trimmed = input.trim()
    if (!trimmed && mediaPreview.length === 0) return
    sendLockRef.current = true
    setIsSending(true)
    try {
      if (trimmed) {
        const replyPrefix = replyTo
          ? `>> ${replyTo.sender?.full_name || replyTo.sender?.username || `Usuário ${replyTo.sender_id}`}: ${replyTo.content}\n`
          : ''
        await apiClient.sendGroupMessage(groupId, { content: `${replyPrefix}${trimmed}` })
      }

      if (mediaPreview.length > 0) {
        for (const preview of mediaPreview) {
          const res = await apiClient.uploadFile(preview.file)
          const url = res.data?.url || res?.url
          await apiClient.sendGroupMessage(groupId, { media_url: url, content: preview.name || '' })
        }
      }

      setInput('')
      setMediaPreview([])
      setReplyTo(null)
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error)
      toast.error('Erro ao enviar')
    } finally {
      sendLockRef.current = false
      setIsSending(false)
    }
  }

  const handleShareLocation = () => {
    if (!navigator.geolocation || !groupId) {
      toast.error('Localização indisponível')
      return
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        await apiClient.sendGroupMessage(groupId, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
        toast.success('Localização enviada')
      } catch (error) {
        console.error(error)
        toast.error('Erro ao enviar localização')
      }
    }, () => {
      toast.error('Permita acesso à localização')
    })
  }

  const handleLeaveGroup = async () => {
    if (!group) return
    if (!window.confirm('Sair do grupo?')) return
    try {
      await apiClient.leaveGroup(group.id)
      toast.success('Você saiu do grupo')
      navigate('/chat')
    } catch {
      toast.error('Erro ao sair do grupo')
    }
  }

  return (
    <div className="h-[100dvh] bg-slate-950 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center gap-3 flex-shrink-0">
        <button onClick={() => navigate('/chat')} className="text-white/70 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/30 overflow-hidden flex items-center justify-center text-white font-semibold">
            {group?.image_url ? (
              <img src={resolveMediaUrl(group.image_url)} alt={group?.name} className="w-full h-full object-cover" />
            ) : (
              (group?.name || 'GP').slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <p className="text-white font-semibold">{group?.name || 'Grupo'}</p>
            <p className="text-xs text-gray-400">{group?.member_ids.length || 0} membros</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowMenu((prev) => !prev)}
              className="p-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700"
            >
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-slate-900 border border-slate-800 rounded-lg shadow-lg z-50">
                {isAdmin && (
                  <button
                    onClick={() => {
                      setShowMenu(false)
                      setShowSettings(true)
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-white hover:bg-slate-800"
                  >
                    Gerenciar
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowMenu(false)
                    handleLeaveGroup()
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-slate-800"
                >
                  Sair do grupo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isMine = currentUser?.id === msg.sender_id
          const senderName = isMine
            ? 'Você'
            : (msg.sender?.full_name || msg.sender?.username || `Usuário ${msg.sender_id}`)
          const location = parseLocation(msg.content)
          const mediaCandidateRaw = msg.media_url || ''
          const mediaUrl = mediaCandidateRaw ? resolveAssetUrl(mediaCandidateRaw) : ''
          const audioUrl = resolveAssetUrl(msg.audio_url)
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`bg-slate-900/70 text-white p-3 rounded-2xl max-w-xl ${isMine ? 'rounded-br-sm' : 'rounded-bl-sm'} relative`}>
                {!isMine && (
                  <button
                    type="button"
                    onClick={() => navigate(`/profile/${msg.sender?.id || msg.sender_id}`)}
                    className="flex items-center gap-2 text-xs text-gray-400 mb-1 hover:text-primary transition"
                  >
                    <img
                      src={msg.sender?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.sender?.username || msg.sender_id}`}
                      alt={senderName}
                      className="w-5 h-5 rounded-full border border-slate-700 object-cover"
                    />
                    <span className="underline underline-offset-2">{senderName}</span>
                  </button>
                )}

                {location && (
                  <button
                    onClick={() => window.open(`https://maps.google.com/?q=${location.lat},${location.lng}`, '_blank')}
                    className="mb-2 px-3 py-2 rounded-lg bg-slate-800 text-xs text-white hover:bg-slate-700 flex items-center gap-2"
                  >
                    <MapPin size={14} />
                    Localização compartilhada
                  </button>
                )}

                {mediaUrl && (
                  <div className="mb-2">
                    {isImageFile(mediaUrl) ? (
                      <img src={resolveMediaUrl(mediaUrl)} className="max-w-xs rounded-lg border border-slate-700" />
                    ) : isVideoFile(mediaUrl) ? (
                      <video src={resolveMediaUrl(mediaUrl)} controls className="max-w-xs rounded-lg border border-slate-700" />
                    ) : (
                      <a href={resolveMediaUrl(mediaUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary">
                        <FileText size={16} />
                        {msg.content || 'Arquivo'}
                      </a>
                    )}
                  </div>
                )}

                {audioUrl && (
                  <audio controls className="w-56 mb-2">
                    <source src={audioUrl} />
                  </audio>
                )}

                {msg.content && !location && (() => {
                  const { header, body } = splitReplyContent(msg.content)
                  return (
                    <div className="text-sm">
                      {header && (
                        <div className="text-xs text-gray-400 font-semibold mb-1">{header}</div>
                      )}
                      <div className="whitespace-pre-wrap">{body || msg.content}</div>
                    </div>
                  )
                })()}

                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {msg.reactions.map((r) => (
                      <span key={r.reaction} className="text-xs bg-slate-800 px-2 py-1 rounded-full">
                        {r.reaction} {r.count}
                      </span>
                    ))}
                  </div>
                )}

                <div className="text-[10px] text-gray-500 mt-2 flex items-center justify-between gap-2">
                  <span>{new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <button
                    onClick={() => setMessageActionMenuId((prev) => prev === msg.id ? null : msg.id)}
                    className="text-gray-400 hover:text-white"
                  >
                    <MoreVertical size={12} />
                  </button>
                </div>

                {messageActionMenuId === msg.id && (
                  <div className={`absolute ${isMine ? 'right-2' : 'left-2'} -bottom-2 translate-y-full bg-slate-900 border border-slate-800 rounded-lg shadow-lg z-20`}>
                    <button
                      onClick={() => {
                        setReactionPickerMessageId(msg.id)
                        setMessageActionMenuId(null)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-white hover:bg-slate-800"
                    >
                      Reagir
                    </button>
                    <button
                      onClick={() => {
                        setReplyTo(msg)
                        setMessageActionMenuId(null)
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-white hover:bg-slate-800"
                    >
                      Responder
                    </button>
                    {isMine && (
                      <button
                        onClick={async () => {
                          setMessageActionMenuId(null)
                          if (!window.confirm('Excluir mensagem?')) return
                          try {
                            await apiClient.deleteMessage(msg.id)
                            setMessages((prev) => prev.filter((m) => m.id !== msg.id))
                          } catch {
                            toast.error('Erro ao excluir')
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-slate-800"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                )}

                {reactionPickerMessageId === msg.id && (
                  <div className={`absolute ${isMine ? 'right-2' : 'left-2'} -bottom-2 translate-y-full bg-slate-900 border border-slate-800 rounded-lg shadow-lg z-30 p-2 grid grid-cols-6 gap-1`}>
                    {['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F621}'].map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => handleAddReaction(msg.id, emoji)}
                        className="text-lg hover:bg-slate-800 rounded"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div className="p-3 sm:p-4 border-t border-slate-800 flex-shrink-0">
        {replyTo && (
          <div className="mb-2 p-2 bg-slate-800/70 rounded-lg text-xs text-gray-300 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(`/profile/${replyTo.sender?.id || replyTo.sender_id}`)}
              className="hover:text-primary transition"
            >
              Respondendo a{' '}
              <span className="underline underline-offset-2">
                {replyTo.sender?.full_name || replyTo.sender?.username || `Usuário ${replyTo.sender_id}`}
              </span>
            </button>
            <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}

        {mediaPreview.length > 0 && (
          <div className="mb-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700 flex gap-2 overflow-x-auto">
            {mediaPreview.map((preview, idx) => (
              <div key={idx} className="relative group flex-shrink-0">
                {preview.type === 'image' ? (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-700 border border-slate-600">
                    <img src={preview.src} className="w-full h-full object-cover" />
                  </div>
                ) : preview.type === 'video' ? (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-700 border border-slate-600">
                    <img src={preview.src} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <PlayCircle size={20} className="text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 border border-blue-500 flex flex-col items-center justify-center">
                    <FileText size={20} className="text-white" />
                  </div>
                )}
                <button
                  onClick={() => setMediaPreview((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute top-0 right-0 bg-red-600 hover:bg-red-700 p-0.5 rounded opacity-0 group-hover:opacity-100 transition"
                >
                  <X size={12} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 items-end">
          <div className="relative">
            <button
              onClick={() => setShowMediaMenu((prev) => !prev)}
              className="p-2 sm:p-3 hover:bg-slate-800 rounded-full transition text-gray-400 hover:text-primary flex-shrink-0"
            >
              <Paperclip size={20} />
            </button>

            {showMediaMenu && (
              <div className="absolute bottom-12 left-0 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden z-50 shadow-xl flex flex-col">
                <button
                  onClick={() => {
                    mediaInputRef.current?.click()
                    setShowMediaMenu(false)
                  }}
                  className="px-4 py-3 text-left text-gray-300 hover:bg-slate-700 flex items-center justify-center gap-3 text-sm"
                >
                  <Image size={20} />
                </button>
                <button
                  onClick={() => {
                    fileInputRef.current?.click()
                    setShowMediaMenu(false)
                  }}
                  className="px-4 py-3 text-left text-gray-300 hover:bg-slate-700 flex items-center justify-center gap-3 text-sm"
                >
                  <FileText size={20} />
                </button>
                <button
                  onClick={() => {
                    handleShareLocation()
                    setShowMediaMenu(false)
                  }}
                  className="px-4 py-3 text-left text-gray-300 hover:bg-slate-700 flex items-center justify-center gap-3 text-sm"
                >
                  <MapPin size={20} />
                </button>
              </div>
            )}

            <input ref={mediaInputRef} type="file" onChange={handleMediaUpload} className="hidden" accept="image/*,video/*" multiple />
            <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" multiple />
          </div>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-slate-800 text-white rounded-full py-2 sm:py-3 px-3 sm:px-4 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={isSending}
          />

          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              className="p-2 sm:p-3 hover:bg-slate-800 rounded-full transition text-gray-400 hover:text-primary flex-shrink-0"
            >
              <Smile size={20} />
            </button>
            {showEmojiPicker && (
              <div className="absolute bottom-12 right-0 bg-slate-800 border border-slate-700 rounded-lg p-2 grid grid-cols-6 gap-1 w-48 max-h-64 overflow-y-auto z-50">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      setInput((prev) => prev + emoji)
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

          {input.trim().length > 0 || mediaPreview.length > 0 ? (
            <button
              onClick={handleSendMessage}
              disabled={isSending}
              className="bg-primary text-white rounded-full px-4 py-3 hover:bg-primary/80 transition flex items-center justify-center"
            >
              <Send size={18} />
            </button>
          ) : (
            <button
              onClick={isRecording ? handleStopRecording : handleStartRecording}
              className={`p-2 sm:p-3 rounded-full transition flex items-center justify-center ${isRecording ? 'bg-red-500/20 text-red-400' : 'text-gray-400 hover:text-primary hover:bg-slate-800'}`}
              title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
            >
              <Mic size={20} />
            </button>
          )}

          {isRecording && (
            <span className="text-xs text-red-400 min-w-[40px] text-right">
              {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:{String(recordingTime % 60).padStart(2, '0')}
            </span>
          )}
        </div>
      </div>

      {showSettings && group && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="text-white font-semibold text-sm">Gerenciar grupo</div>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">×</button>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-400">Nome</label>
                <input
                  className="w-full bg-slate-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Foto do grupo</label>
                <div className="flex items-center gap-2 mt-1">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg bg-slate-800 text-white text-xs hover:bg-slate-700"
                  >
                    Escolher imagem
                  </button>
                  {editImage && (
                    <img src={editImage} alt="Grupo" className="w-10 h-10 rounded-full object-cover border border-slate-700" />
                  )}
                  <button
                    onClick={async () => {
                      const file = fileInputRef.current?.files?.[0]
                      if (!file) return toast.error('Selecione uma imagem')
                      setSaving(true)
                      try {
                        const res = await apiClient.uploadFile(file)
                        const url = res.data?.url || res?.url
                        setEditImage(url)
                        toast.success('Imagem enviada')
                      } catch {
                        toast.error('Erro ao enviar imagem')
                      } finally {
                        setSaving(false)
                      }
                    }}
                    className="px-3 py-2 rounded-lg bg-primary text-white text-xs hover:bg-primary/80 disabled:opacity-60"
                    disabled={saving}
                  >
                    Upload
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-slate-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="@usuario para convidar"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                />
                <button
                  onClick={async () => {
                    if (!addUsername.trim()) return
                    setSaving(true)
                    try {
                      const query = addUsername.trim().replace(/^@/, '')
                      const searchRes = await apiClient.searchUsers(query)
                      const list = searchRes.data?.data || searchRes.data || []
                      const user = list.find((u: any) => u.username === query)
                      if (!user?.id) throw new Error('Usuário não encontrado')
                      await apiClient.addGroupMembers(group.id, [user.id])
                      toast.success('Membro adicionado')
                      const membersRes = await apiClient.listGroupMembers(group.id)
                      setMembers(membersRes.data || [])
                    } catch (error) {
                      console.error(error)
                      toast.error('Erro ao adicionar membro')
                    } finally {
                      setSaving(false)
                      setAddUsername('')
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-primary text-white text-xs hover:bg-primary/80 disabled:opacity-60"
                  disabled={saving}
                >
                  Adicionar
                </button>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={async () => {
                  setSaving(true)
                  try {
                    await apiClient.updateGroup(group.id, { name: editName, image_url: editImage })
                    const g = await apiClient.getGroup(group.id)
                    setGroup(g.data)
                    toast.success('Grupo atualizado')
                  } catch {
                    toast.error('Erro ao atualizar')
                  } finally {
                    setSaving(false)
                    setShowSettings(false)
                  }
                }}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/80 disabled:opacity-60"
                disabled={saving}
              >
                Salvar
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm('Excluir este grupo?')) return
                  try {
                    await apiClient.deleteGroup(group.id)
                    toast.success('Grupo excluído')
                    navigate('/chat')
                  } catch {
                    toast.error('Erro ao excluir')
                  }
                }}
                className="px-4 py-2 rounded-lg bg-red-500/80 text-white text-sm hover:bg-red-500"
              >
                Excluir
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800">
              <div className="text-xs text-gray-400 mb-2">Administradores</div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-2 py-1 gap-2">
                    <div className="flex items-center gap-2">
                      <img src={m.avatar_url || ''} className="w-6 h-6 rounded-full" />
                      <span className="text-xs text-white">{m.full_name || m.username}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          setSaving(true)
                          try {
                            await apiClient.setGroupAdmin(group.id, m.id, !m.is_admin)
                            const membersRes = await apiClient.listGroupMembers(group.id)
                            setMembers(membersRes.data || [])
                          } finally {
                            setSaving(false)
                          }
                        }}
                        className="text-xs px-2 py-1 rounded bg-slate-700 text-white"
                      >
                        {m.is_admin ? 'Remover admin' : 'Tornar admin'}
                      </button>
                      {isAdmin && m.id !== group.creator_id && m.id !== currentUser?.id && (
                        <button
                          onClick={async () => {
                            if (!window.confirm('Remover este usuário do grupo?')) return
                            setSaving(true)
                            try {
                              await apiClient.removeGroupMember(group.id, m.id)
                              const membersRes = await apiClient.listGroupMembers(group.id)
                              setMembers(membersRes.data || [])
                            } catch {
                              toast.error('Erro ao remover usuário')
                            } finally {
                              setSaving(false)
                            }
                          }}
                          className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
