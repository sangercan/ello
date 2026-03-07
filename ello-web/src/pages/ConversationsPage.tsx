import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '@services/api'
import { toast } from 'react-hot-toast'
import { MessageSquare, Plus, Clock, MoreVertical, Trash2, Ban } from 'lucide-react'

interface Conversation {
  id: number
  user_id: number
  username: string
  full_name?: string
  avatar_url?: string
  last_message?: string
  last_message_time?: string
  is_online?: boolean
  last_seen_at?: string
  unread_count?: number
}

export default function ConversationsPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMenuConversationId, setActiveMenuConversationId] = useState<number | null>(null)

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    const handleRealtimeConversationUpdate = () => {
      loadConversations({ background: true })
    }

    window.addEventListener('ello:ws:new-message', handleRealtimeConversationUpdate)
    window.addEventListener('ello:ws:presence-update', handleRealtimeConversationUpdate)

    return () => {
      window.removeEventListener('ello:ws:new-message', handleRealtimeConversationUpdate)
      window.removeEventListener('ello:ws:presence-update', handleRealtimeConversationUpdate)
    }
  }, [])

  const loadConversations = async (options?: { background?: boolean }) => {
    const isBackgroundRefresh = Boolean(options?.background)

    try {
      if (!isBackgroundRefresh) {
        setLoading(true)
      }
      const response = await apiClient.getConversations(1, 50)
      
      // Transform data to match Conversation interface
      const transformed = (response.data?.data || []).map((conv: any) => ({
        id: conv.id,
        user_id: conv.other_user?.id,
        username: conv.other_user?.username || '',
        full_name: conv.other_user?.full_name,
        avatar_url: conv.other_user?.avatar_url,
        last_message: conv.last_message,
        last_message_time: conv.last_message_time,
        is_online: conv.other_user?.is_online,
        last_seen_at: conv.other_user?.last_seen_at,
        unread_count: conv.unread_count,
      }))

      // Order by last message date (desc)
      const sorted = transformed.sort((a: any, b: any) => {
        const dateA = new Date(a.last_message_time || 0).getTime()
        const dateB = new Date(b.last_message_time || 0).getTime()
        return dateB - dateA
      })

      setConversations(sorted)
    } catch (error) {
      console.error('Erro ao carregar conversas:', error)
      toast.error('Erro ao carregar conversas')
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false)
      }
      setHasLoadedOnce(true)
    }
  }

  const filteredConversations = conversations.filter((conv) =>
    (conv.username || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDeleteConversation = async (conversation: Conversation) => {
    if (!window.confirm(`Excluir conversa com ${conversation.full_name || conversation.username}?`)) return

    try {
      await apiClient.deleteConversation(conversation.id)
      setConversations((prev) => prev.filter((item) => item.id !== conversation.id))
      setActiveMenuConversationId(null)
      toast.success('Conversa excluida')
    } catch {
      toast.error('Erro ao excluir conversa')
    }
  }

  const handleBlockConversationUser = async (conversation: Conversation) => {
    if (!window.confirm(`Bloquear ${conversation.full_name || conversation.username}?`)) return

    try {
      await apiClient.blockUser(conversation.user_id)
      setConversations((prev) => prev.filter((item) => item.id !== conversation.id))
      setActiveMenuConversationId(null)
      toast.success('Usuario bloqueado')
    } catch {
      toast.error('Erro ao bloquear usuario')
    }
  }

  const formatTime = (dateString?: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Agora'
    if (diffMins < 60) return `${diffMins}m atrás`
    if (diffHours < 24) return `${diffHours}h atrás`
    if (diffDays < 7) return `${diffDays}d atrás`
    
    return date.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })
  }

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return 'Offline'
    const date = new Date(lastSeen)
    if (Number.isNaN(date.getTime())) return 'Offline'

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)

    if (diffMins < 1) return 'Visto por ultimo agora'
    if (diffMins < 60) return `Visto ha ${diffMins} min`
    if (diffHours < 24) return `Visto ha ${diffHours}h`
    return `Visto em ${date.toLocaleDateString('pt-BR')}`
  }

  const getConversationPreview = (message?: string) => {
    if (!message) return { text: 'Nenhuma mensagem...', isLocation: false }

    const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const isLocation = /Lat:\s*[\d.-]+,\s*Lng:\s*[\d.-]+/i.test(message) || /Compartilhar\s+Localizacao/i.test(normalized)

    const cleaned = message
      .replace(/[📍📌🗺️🧭]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (isLocation) {
      return { text: 'Compartilhar Localização', isLocation: true }
    }

    return { text: cleaned, isLocation: false }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-900/50 border-b border-slate-700/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquare size={24} className="text-primary" />
            Mensagens
          </h1>
          <button
            onClick={() => navigate('/nearby')}
            className="p-2 sm:p-3 bg-primary/20 hover:bg-primary/30 rounded-full transition text-primary"
            title="Iniciar nova conversa"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar conversas..."
          className="w-full bg-slate-800 text-white rounded-full py-2 px-4 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {hasLoadedOnce && filteredConversations.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-white font-semibold mb-2 text-sm sm:text-base">
                {searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </h3>
              <p className="text-gray-400 text-xs sm:text-sm mb-4">
                {searchQuery ? 'Tente outro termo de busca' : 'Comece uma nova conversa clicando no +'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => navigate('/nearby')}
                  className="px-4 py-2 bg-primary text-white rounded-full text-xs sm:text-sm font-medium hover:bg-primary/80 transition"
                >
                  Explorar Usuários
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredConversations.map((conversation) => {
              const preview = getConversationPreview(conversation.last_message)
              return (
              <div key={conversation.id} className="w-full p-3 sm:p-4 hover:bg-slate-900/30 transition text-left flex gap-2 sm:gap-3 items-start">
                <button
                  onClick={() => navigate(`/chat/${conversation.user_id}`)}
                  className="flex-1 min-w-0 flex gap-2 sm:gap-3 text-left"
                >
                  {/* Avatar */}
                  <img
                    src={
                      conversation.avatar_url ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${conversation.username}`
                    }
                    alt={conversation.username}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-primary/40 flex-shrink-0"
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-white text-sm sm:text-base truncate">
                            {conversation.full_name || conversation.username}
                          </h3>
                          <p className="text-xs text-gray-500 truncate">@{conversation.username}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            conversation.is_online ? 'bg-green-500' : 'bg-gray-500'
                          }`}></span>
                          <span className={`text-xs flex-shrink-0 ${
                            conversation.is_online ? 'text-green-400' : 'text-gray-500'
                          }`}>
                            {conversation.is_online ? 'Online' : formatLastSeen(conversation.last_seen_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-gray-500 text-xs flex-shrink-0">
                        <Clock size={14} />
                        {formatTime(conversation.last_message_time)}
                      </div>
                    </div>

                    {/* Last Message */}
                    <p className="text-gray-400 text-xs sm:text-sm truncate inline-flex items-center gap-1.5">
                      <span className="truncate">{preview.text}</span>
                    </p>
                  </div>

                  {/* Unread Badge */}
                  {conversation.unread_count && conversation.unread_count > 0 && (
                    <div className="bg-primary text-white text-xs rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center flex-shrink-0">
                      {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                    </div>
                  )}
                </button>

                <div className="relative flex-shrink-0">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setActiveMenuConversationId((prev) => prev === conversation.id ? null : conversation.id)
                    }}
                    className="p-2 text-gray-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                    title="Acoes"
                  >
                    <MoreVertical size={16} />
                  </button>

                  {activeMenuConversationId === conversation.id && (
                    <div className="absolute right-0 mt-1 min-w-[170px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-20">
                      <button
                        onClick={() => handleDeleteConversation(conversation)}
                        className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-500/10 transition inline-flex items-center gap-2"
                      >
                        <Trash2 size={13} />
                        Excluir conversa
                      </button>
                      <button
                        onClick={() => handleBlockConversationUser(conversation)}
                        className="w-full px-3 py-2 text-xs text-left text-amber-300 hover:bg-amber-500/10 transition inline-flex items-center gap-2"
                      >
                        <Ban size={13} />
                        Bloquear usuario
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
