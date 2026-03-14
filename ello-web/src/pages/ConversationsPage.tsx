import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '@services/api'
import { toast } from 'react-hot-toast'
import { MessageSquare, Plus, Clock, MoreVertical, Trash2, Ban, Users } from 'lucide-react'
import { useAuthStore } from '@store/authStore'
import { resolveMediaUrl } from '@utils/mediaUrl'
import { useI18n } from '@/i18n/i18n'
import { getMoodAvatarRingStyle } from '@/utils/mood'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'

interface Conversation {
  id: number
  user_id: number
  username: string
  full_name?: string
  avatar_url?: string
  mood?: string | null
  last_message?: string
  last_message_time?: string
  is_online?: boolean
  last_seen_at?: string
  unread_count?: number
}

interface Group {
  id: number
  name: string
  member_ids: number[]
  creator_id?: number
  image_url?: string
}

const toSafeString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback
  return String(value)
}

const toSafeNumber = (value: unknown): number | null => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const toSafeDateString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return undefined
}

const toPreviewMessage = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return undefined

  if (typeof value === 'object') {
    const maybeContent = (value as { content?: unknown }).content
    if (typeof maybeContent === 'string') return maybeContent
    return undefined
  }

  return String(value)
}

export default function ConversationsPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const { t, language } = useI18n()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMenuConversationId, setActiveMenuConversationId] = useState<number | null>(null)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [mutualUsers, setMutualUsers] = useState<Array<any>>([])
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set())
  const [loadingMutuals, setLoadingMutuals] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)
  const refreshConversationsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshGroupsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const groupModalSwipeHandlers = useSwipeGesture({
    enabled: showGroupModal,
    threshold: 45,
    axisLockRatio: 1.25,
    directions: ['down'],
    onSwipe: () => setShowGroupModal(false),
  })

  useEffect(() => {
    void Promise.all([loadConversations(), loadGroups()])
  }, [])

  useEffect(() => {
    const scheduleConversationsRefresh = () => {
      if (refreshConversationsTimerRef.current) {
        clearTimeout(refreshConversationsTimerRef.current)
      }
      refreshConversationsTimerRef.current = setTimeout(() => {
        void loadConversations({ background: true })
      }, 350)
    }

    const scheduleGroupsRefresh = () => {
      if (refreshGroupsTimerRef.current) {
        clearTimeout(refreshGroupsTimerRef.current)
      }
      refreshGroupsTimerRef.current = setTimeout(() => {
        void loadGroups({ background: true })
      }, 500)
    }

    const handleRealtimeConversationUpdate = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail
      scheduleConversationsRefresh()
      if (detail?.type === 'new_message' && detail?.group_id) {
        scheduleGroupsRefresh()
      }
    }

    window.addEventListener('ello:ws:new-message', handleRealtimeConversationUpdate)
    window.addEventListener('ello:ws:presence-update', handleRealtimeConversationUpdate)

    return () => {
      if (refreshConversationsTimerRef.current) {
        clearTimeout(refreshConversationsTimerRef.current)
        refreshConversationsTimerRef.current = null
      }
      if (refreshGroupsTimerRef.current) {
        clearTimeout(refreshGroupsTimerRef.current)
        refreshGroupsTimerRef.current = null
      }
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
      const payload = response.data
      const data = Array.isArray(payload?.data) ? payload.data : []

      // Transform data to match Conversation interface and ignore malformed rows.
      const transformed: Conversation[] = data
        .map((conv: any): Conversation | null => {
          const conversationId = toSafeNumber(conv?.id)
          const otherUserId = toSafeNumber(conv?.other_user?.id)
          if (conversationId === null || otherUserId === null) {
            return null
          }

          return {
            id: conversationId,
            user_id: otherUserId,
            username: toSafeString(conv?.other_user?.username, ''),
            full_name: toSafeString(conv?.other_user?.full_name, '') || undefined,
            avatar_url: toSafeString(conv?.other_user?.avatar_url, '') || undefined,
            mood: typeof conv?.other_user?.mood === 'string' ? conv.other_user.mood : null,
            last_message: toPreviewMessage(conv?.last_message),
            last_message_time: toSafeDateString(conv?.last_message_time),
            is_online: Boolean(conv?.other_user?.is_online),
            last_seen_at: toSafeDateString(conv?.other_user?.last_seen_at),
            unread_count: toSafeNumber(conv?.unread_count) ?? 0,
          }
        })
        .filter((item: Conversation | null): item is Conversation => item !== null)

      // Order by last message date (desc)
      const sorted = transformed.sort((a: Conversation, b: Conversation) => {
        const dateA = new Date(a.last_message_time || 0).getTime()
        const dateB = new Date(b.last_message_time || 0).getTime()
        return dateB - dateA
      })

      setConversations(sorted)
    } catch (error) {
      console.error('Erro ao carregar conversas:', error)
      toast.error(t('toast.loadConversationsError'))
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false)
      }
      setHasLoadedOnce(true)
    }
  }

  const loadGroups = async (options?: { background?: boolean }) => {
    const isBackgroundRefresh = Boolean(options?.background)
    try {
      if (!isBackgroundRefresh) setLoading(true)
      const response = await apiClient.getGroups()
      const payload = response.data
      const data = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : []
      setGroups(
        data
          .map((g: any): Group | null => {
            const id = toSafeNumber(g?.id)
            if (id === null) return null

            const memberIds = Array.isArray(g?.member_ids)
              ? g.member_ids
                  .map((memberId: unknown) => toSafeNumber(memberId))
                  .filter((memberId: number | null): memberId is number => memberId !== null)
              : []

            return {
              id,
              name: toSafeString(g?.name, `Grupo ${id}`),
              member_ids: memberIds,
              image_url: toSafeString(g?.image_url, '') || undefined,
            }
          })
          .filter((item: Group | null): item is Group => item !== null)
      )
    } catch (error) {
      console.error('Erro ao carregar grupos:', error)
    } finally {
      if (!isBackgroundRefresh) setLoading(false)
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredConversations = conversations.filter((conv) => {
    const searchable = `${conv.username || ''} ${conv.full_name || ''}`.toLowerCase()
    return searchable.includes(normalizedQuery)
  })

  const filteredGroups = groups.filter((g) => (g.name || '').toLowerCase().includes(normalizedQuery))

  const handleDeleteConversation = async (conversation: Conversation) => {
    if (!window.confirm(`${t('conversations.deleteConversation')}: ${conversation.full_name || conversation.username}?`)) return

    try {
      await apiClient.deleteConversation(conversation.id)
      setConversations((prev) => prev.filter((item) => item.id !== conversation.id))
      setActiveMenuConversationId(null)
      toast.success(t('toast.deleteConversationSuccess'))
    } catch {
      toast.error(t('toast.deleteConversationError'))
    }
  }

  const handleBlockConversationUser = async (conversation: Conversation) => {
    if (!window.confirm(`${t('conversations.blockUser')}: ${conversation.full_name || conversation.username}?`)) return

    try {
      await apiClient.blockUser(conversation.user_id)
      setConversations((prev) => prev.filter((item) => item.id !== conversation.id))
      setActiveMenuConversationId(null)
      toast.success(t('toast.blockUserSuccess'))
    } catch {
      toast.error(t('toast.blockUserError'))
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

    if (diffMins < 1) return t('conversations.now')
    if (diffMins < 60) return `${diffMins}${t('conversations.agoMinutes')}`
    if (diffHours < 24) return `${diffHours}${t('conversations.agoHours')}`
    if (diffDays < 7) return `${diffDays}${t('conversations.agoDays')}`
    
    return date.toLocaleDateString(language, { month: 'short', day: 'numeric' })
  }

  const formatLastSeen = (lastSeen?: string) => {
    if (!lastSeen) return t('conversations.offline')
    const date = new Date(lastSeen)
    if (Number.isNaN(date.getTime())) return t('conversations.offline')

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)

    if (diffMins < 1) return t('conversations.seenNow')
    if (diffMins < 60) return t('conversations.seenMinutes', { value: diffMins })
    if (diffHours < 24) return t('conversations.seenHours', { value: diffHours })
    return t('conversations.seenOn', { date: date.toLocaleDateString(language) })
  }

  const getConversationPreview = (message?: string) => {
    if (typeof message !== 'string' || !message.trim()) {
      return { text: t('conversations.noMessage'), isLocation: false }
    }

    const normalized = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const isLocation = /Lat:\s*[\d.-]+,\s*Lng:\s*[\d.-]+/i.test(message) || /Compartilhar\s+Localizacao/i.test(normalized)

    const cleaned = message
      .replace(/[📍📌🗺️🧭]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (isLocation) {
      return { text: t('conversations.shareLocation'), isLocation: true }
    }

    return { text: cleaned, isLocation: false }
  }

  const openGroupModal = async () => {
    if (!currentUser?.id) {
      toast.error(t('toast.loginToCreateGroup'))
      return
    }
    setShowGroupModal(true)
    setLoadingMutuals(true)
    setSelectedMembers(new Set())
    try {
      const [followersRes, followingRes] = await Promise.all([
        apiClient.getFollowers(currentUser.id),
        apiClient.getFollowing(currentUser.id),
      ])
      const followers = followersRes.data || []
      const followingIds = new Set((followingRes.data || []).map((u: any) => u.id))
      const mutual = followers.filter((u: any) => followingIds.has(u.id) && u.id !== currentUser.id)
      setMutualUsers(mutual)
    } catch (error) {
      console.error('Erro ao carregar seguidores:', error)
      toast.error(t('toast.loadMutualsError'))
    } finally {
      setLoadingMutuals(false)
    }
  }

  const toggleMember = (id: number) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      toast.error(t('toast.groupNameRequired'))
      return
    }
    if (selectedMembers.size === 0) {
      toast.error(t('toast.selectMemberRequired'))
      return
    }
    setSavingGroup(true)
    try {
      await apiClient.createGroup(groupName.trim(), Array.from(selectedMembers))
      toast.success(t('toast.groupCreated'))
      setShowGroupModal(false)
      setGroupName('')
      setSelectedMembers(new Set())
    } catch (error: any) {
      console.error('Erro ao criar grupo:', error)
      const detail = error?.response?.data?.detail
      toast.error(detail || t('toast.groupCreateError'))
    } finally {
      setSavingGroup(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-900/50 border-b border-slate-700/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquare size={24} className="text-primary" />
            {t('conversations.title')}
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={openGroupModal}
              className="p-2 sm:p-3 bg-slate-800 hover:bg-slate-700 rounded-full transition text-white"
              title={t('conversations.createGroup')}
            >
              <Users size={18} />
            </button>
            <button
              onClick={() => navigate('/nearby')}
              className="p-2 sm:p-3 bg-primary/20 hover:bg-primary/30 rounded-full transition text-primary"
              title={t('conversations.startConversation')}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('conversations.search')}
          className="w-full bg-slate-800 text-white rounded-full py-2 px-4 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto">
        {/* Groups section */}
        {filteredGroups.length > 0 && (
          <div className="border-b border-slate-800">
            <div className="px-4 py-2 text-xs uppercase tracking-wide text-gray-400">{t('conversations.groups')}</div>
            <div className="divide-y divide-slate-800">
              {filteredGroups.map((group) => (
                <div key={group.id} className="w-full p-3 sm:p-4 hover:bg-slate-900/30 transition text-left flex gap-2 items-center">
                  <div
                    onClick={() => navigate(`/chat-group/${group.id}`)}
                    className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/30 text-white flex items-center justify-center font-semibold overflow-hidden">
                      {group.image_url ? (
                        <img src={resolveMediaUrl(group.image_url)} alt={group.name} className="w-full h-full object-cover" />
                      ) : (
                        group.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-white font-semibold text-sm sm:text-base truncate">{group.name}</p>
                          <p className="text-xs text-gray-500">{group.member_ids.length} {t('conversations.members')}</p>
                        </div>
                        <span className="px-2 py-1 rounded-full border border-slate-700 text-xs text-gray-300">{t('conversations.group')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasLoadedOnce && filteredConversations.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-4 text-gray-600" />
              <h3 className="text-white font-semibold mb-2 text-sm sm:text-base">
                {searchQuery ? t('conversations.noConversationsFound') : t('conversations.noConversationsYet')}
              </h3>
              <p className="text-gray-400 text-xs sm:text-sm mb-4">
                {searchQuery ? t('conversations.searchHint') : t('conversations.startHint')}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => navigate('/nearby')}
                  className="px-4 py-2 bg-primary text-white rounded-full text-xs sm:text-sm font-medium hover:bg-primary/80 transition"
                >
                  {t('conversations.exploreUsers')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredConversations.map((conversation) => {
              const preview = getConversationPreview(conversation.last_message)
              const unreadCount = Number(conversation.unread_count ?? 0)
              const hasLastMessage = typeof conversation.last_message === 'string' && conversation.last_message.trim().length > 0
              const shouldShowUnreadBadge = Number.isFinite(unreadCount) && unreadCount > 0 && hasLastMessage
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
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-slate-700 object-cover flex-shrink-0"
                    style={getMoodAvatarRingStyle(conversation.mood)}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-white text-sm sm:text-base truncate">
                          {conversation.full_name || conversation.username}
                        </h3>
                        <p className="text-xs text-gray-500 truncate">@{conversation.username}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 text-right flex-shrink-0 min-w-0 sm:min-w-[110px]">
                        <div className="flex items-center gap-1 text-gray-500 text-xs">
                          <Clock size={13} />
                          <span>{formatTime(conversation.last_message_time)}</span>
                        </div>
                        <div className="flex items-center gap-1 max-w-[120px] sm:max-w-[150px]">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            conversation.is_online ? 'bg-green-500' : 'bg-gray-500'
                          }`}></span>
                          <span className={`text-xs truncate ${
                            conversation.is_online ? 'text-green-400' : 'text-gray-500'
                          }`}>
                            {conversation.is_online ? t('conversations.online') : formatLastSeen(conversation.last_seen_at)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Last Message */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex-1 min-w-0 text-gray-400 text-xs sm:text-sm truncate inline-flex items-center gap-1.5">
                        <span className="truncate">{preview.text}</span>
                      </p>

                      {shouldShowUnreadBadge && (
                        <div className="bg-primary text-white text-xs rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center flex-shrink-0">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                <div className="relative flex-shrink-0">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setActiveMenuConversationId((prev) => prev === conversation.id ? null : conversation.id)
                    }}
                    className="p-2 text-gray-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                    title={t('conversations.actions')}
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
                        {t('conversations.deleteConversation')}
                      </button>
                      <button
                        onClick={() => handleBlockConversationUser(conversation)}
                        className="w-full px-3 py-2 text-xs text-left text-amber-300 hover:bg-amber-500/10 transition inline-flex items-center gap-2"
                      >
                        <Ban size={13} />
                        {t('conversations.blockUser')}
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

      {showGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" {...groupModalSwipeHandlers}>
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl" data-gesture-ignore="true">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-primary" />
                <span className="text-white font-semibold text-sm">{t('conversations.createGroupAction')}</span>
              </div>
              <button
                onClick={() => setShowGroupModal(false)}
                className="text-gray-400 hover:text-white"
              >
                x
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="text-xs text-gray-400">{t('conversations.groupName')}</label>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="mt-1 w-full bg-slate-800 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder={t('conversations.groupNamePlaceholder')}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">{t('conversations.groupMembers')}</span>
                  <span className="text-xs text-gray-500">{t('conversations.selectedMembers', { value: selectedMembers.size })}</span>
                </div>
                {loadingMutuals ? (
                  <p className="text-gray-400 text-sm">{t('conversations.loading')}</p>
                ) : mutualUsers.length === 0 ? (
                  <p className="text-gray-400 text-sm">{t('conversations.noMutuals')}</p>
                ) : (
                  <div className="space-y-2">
                    {mutualUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={selectedMembers.has(u.id)}
                          onChange={() => toggleMember(u.id)}
                        />
                        <img
                          src={u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`}
                          alt={u.username}
                          className="w-8 h-8 rounded-full border border-slate-700 object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate">{u.full_name || u.username}</p>
                          <p className="text-xs text-gray-500 truncate">@{u.username}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end gap-2">
              <button
                onClick={() => setShowGroupModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700"
              >
                x
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={savingGroup}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary/80 disabled:opacity-60"
              >
                {savingGroup ? t('conversations.creating') : t('conversations.createGroupAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
