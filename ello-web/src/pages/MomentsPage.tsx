import { useState, useEffect, useCallback, useRef } from 'react'
import apiClient from '@services/api'
import { toast } from 'react-hot-toast'
import type { Moment, Story } from '@/types'
import { Heart, MessageCircle, Share2, X, ChevronLeft, ChevronRight, Send, Search, Link2, PlusCircle, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '@store/authStore'
import { useNavigate } from 'react-router-dom'
import { resolveMediaUrl } from '@/utils/mediaUrl'
import { getMoodAvatarRingStyle } from '@/utils/mood'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'

const PAGE_SIZE = 10
const STORY_SEEN_STORAGE_KEY = 'ello:stories-seen-by-user'
const MOMENTS_CACHE_KEY = 'ello:cache:moments:v1'
const getMomentsCacheKey = (userId?: number | null) => `${MOMENTS_CACHE_KEY}:user:${userId ?? 'guest'}`

type SeenStoryMap = Record<number, string>
type LoadMomentsOptions = {
  background?: boolean
}

type ContentComment = {
  id: number
  text: string
  parent_comment_id?: number | null
  likes_count?: number
  is_liked?: boolean
  created_at?: string
  author?: {
    id: number
    username?: string
    full_name?: string
    avatar_url?: string
    mood?: string | null
  }
}

type MentionCandidate = {
  id: number
  username: string
}

type ShareDestination = 'story' | 'moment' | 'chat' | 'vibe'

type ShareDraft = {
  mediaUrl: string
  isVideo: boolean
  caption: string
  sourceAuthor?: {
    id?: number
    username?: string
    fullName?: string
    avatarUrl?: string
  }
}

type ConversationOption = {
  id: number
  userId: number
  username: string
  fullName: string
  avatarUrl?: string
}

export default function MomentsPage() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const [moments, setMoments] = useState<Moment[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [selectedStoryUserIndex, setSelectedStoryUserIndex] = useState<number | null>(null)
  const [selectedStoryItemIndex, setSelectedStoryItemIndex] = useState<number>(0)
  const [expandedMediaIndex, setExpandedMediaIndex] = useState<number | null>(null)
  const [seenStoriesByUser, setSeenStoriesByUser] = useState<SeenStoryMap>({})
  const [storyLikeStateById, setStoryLikeStateById] = useState<Record<number, { liked: boolean; count: number }>>({})
  const [processingStoryAction, setProcessingStoryAction] = useState(false)
  const [storyCommentDraft, setStoryCommentDraft] = useState('')
  const [showStoryCommentComposer, setShowStoryCommentComposer] = useState(false)
  const [selectedMomentForComments, setSelectedMomentForComments] = useState<Moment | null>(null)
  const [momentComments, setMomentComments] = useState<ContentComment[]>([])
  const [momentCommentsLoading, setMomentCommentsLoading] = useState(false)
  const [newMomentCommentText, setNewMomentCommentText] = useState('')
  const [replyToMomentCommentId, setReplyToMomentCommentId] = useState<number | null>(null)
  const [shareDraft, setShareDraft] = useState<ShareDraft | null>(null)
  const [shareCaptionDraft, setShareCaptionDraft] = useState('')
  const [shareDestination, setShareDestination] = useState<ShareDestination | null>(null)
  const [shareConversations, setShareConversations] = useState<ConversationOption[]>([])
  const [selectedShareRecipientId, setSelectedShareRecipientId] = useState<number | null>(null)
  const [shareRecipientQuery, setShareRecipientQuery] = useState('')
  const [failedShareAvatarIds, setFailedShareAvatarIds] = useState<Record<number, boolean>>({})
  const [shareBusy, setShareBusy] = useState(false)
  const [momentActionMenuId, setMomentActionMenuId] = useState<number | null>(null)
  const [editingMomentId, setEditingMomentId] = useState<number | null>(null)
  const [editingMomentText, setEditingMomentText] = useState('')
  const [storyActionMenuOpen, setStoryActionMenuOpen] = useState(false)
  const [editingStoryActive, setEditingStoryActive] = useState(false)
  const [editingStoryText, setEditingStoryText] = useState('')
  const [commentActionMenuId, setCommentActionMenuId] = useState<number | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const feedSentinelRef = useRef<HTMLDivElement | null>(null)
  const lastScrollNavigationAtRef = useRef(0)
  const lockedScrollYRef = useRef<number | null>(null)

  useEffect(() => {
    const cacheKey = getMomentsCacheKey(user?.id)
    let hasHydratedCache = false
    try {
      const rawCache = window.sessionStorage.getItem(cacheKey)
      if (rawCache) {
        const parsed = JSON.parse(rawCache)
        const cachedMoments = Array.isArray(parsed?.moments) ? parsed.moments : []
        const cachedStories = Array.isArray(parsed?.stories) ? parsed.stories : []
        if (cachedMoments.length > 0 || cachedStories.length > 0) {
          setMoments(cachedMoments)
          setStories(cachedStories)
          setLoading(false)
          hasHydratedCache = true
        }
      }
    } catch {
      // Ignore corrupted cache and continue with network fetch.
    }

    loadMoments(1, false, { background: hasHydratedCache })
    loadStories()

    try {
      const raw = window.localStorage.getItem(STORY_SEEN_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        setSeenStoriesByUser(parsed)
      }
    } catch {
      setSeenStoriesByUser({})
    }
  }, [user?.id])

  useEffect(() => {
    if (moments.length === 0 && stories.length === 0) return
    const cacheKey = getMomentsCacheKey(user?.id)
    try {
      window.sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ moments, stories, ts: Date.now() })
      )
    } catch {
      // Ignore storage quota errors.
    }
  }, [moments, stories, user?.id])

  useEffect(() => {
    const refreshAll = () => {
      setPage(1)
      setHasMore(true)
      loadMoments(1, false, { background: true })
      loadStories()
    }

    window.addEventListener('ello:moment-created', refreshAll)
    window.addEventListener('ello:story-created', refreshAll)

    return () => {
      window.removeEventListener('ello:moment-created', refreshAll)
      window.removeEventListener('ello:story-created', refreshAll)
    }
  }, [])

  const isVideoUrl = (url?: string) => {
    if (!url) return false
    const clean = url.toLowerCase().split('?')[0].split('#')[0]
    return ['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv', '.3gp', '.m3u8'].some((ext) => clean.endsWith(ext))
  }

  const abbreviateStateOrProvince = (value: string) => {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

    if (!normalized) return ''

    const words = normalized
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => !['de', 'da', 'do', 'dos', 'das', 'of', 'the', 'y', 'e'].includes(word))

    if (words.length >= 2) {
      return words.slice(0, 3).map((word) => word[0]).join('').toUpperCase()
    }

    return normalized.slice(0, 3).toUpperCase()
  }

  const abbreviateCountry = (value: string) => {
    const cleaned = value.trim()
    if (!cleaned) return ''
    if (cleaned.length <= 3) return cleaned.toUpperCase()
    return cleaned
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 3)
  }

  const formatShortLocation = (label?: string | null) => {
    if (!label) return ''
    const parts = label.split(',').map((part) => part.trim()).filter(Boolean)
    if (parts.length < 3) return label

    const city = parts[0]
    const state = abbreviateStateOrProvince(parts[1])
    const country = abbreviateCountry(parts[2])
    return [city, state, country].filter(Boolean).join(', ')
  }

  const normalizeMoments = (raw: any[]): Moment[] => {
    return raw.map((m) => ({
      ...m,
      likes_count: Number(m.likes_count || 0),
      comments_count: Number(m.comments_count || 0),
      is_liked: Boolean(m.is_liked),
      author: m.author || {
        id: m.user_id,
        full_name: 'Usuario',
        username: `user${m.user_id}`,
        email: '',
        is_online: false,
        is_visible_nearby: false,
        mood: m.mood || null,
        created_at: m.created_at,
      },
    }))
  }

  const normalizeStories = (raw: any[]): Story[] => {
    return raw.map((s) => ({
      id: s.id,
      user_id: s.user_id,
      media_url: s.media_url,
      text: s.text,
      likes_count: Number(s.likes_count || 0),
      is_liked: Boolean(s.is_liked),
      created_at: s.created_at,
      expires_at: s.expires_at,
      author: s.author || {
        id: s.user_id,
        full_name: 'Usuario',
        username: `user${s.user_id}`,
        email: '',
        is_online: false,
        is_visible_nearby: false,
        mood: s.mood || null,
        created_at: s.created_at,
      },
    }))
  }

  const groupedStories = stories.reduce<Array<{ userId: number; author?: Story['author']; items: Story[] }>>((acc, story) => {
    const index = acc.findIndex((g) => g.userId === story.user_id)
    if (index === -1) {
      acc.push({ userId: story.user_id, author: story.author, items: [story] })
    } else {
      acc[index].items.push(story)
    }
    return acc
  }, []).map((group) => ({
    ...group,
    items: [...group.items].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
  }))

  const selectedStoryGroup = selectedStoryUserIndex !== null ? groupedStories[selectedStoryUserIndex] : undefined
  const selectedStory = selectedStoryGroup?.items[selectedStoryItemIndex]
  const ownStoryGroupIndex = user?.id ? groupedStories.findIndex((group) => group.userId === user.id) : -1
  const otherStoryGroups = groupedStories
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.userId !== user?.id)

  const storyGroupHasNewContent = useCallback((group: { userId: number; items: Story[] }) => {
    const lastSeenAt = seenStoriesByUser[group.userId]
    if (!lastSeenAt) return true
    const lastSeen = new Date(lastSeenAt).getTime()
    const newestStory = group.items[group.items.length - 1]
    const newestAt = newestStory ? new Date(newestStory.created_at).getTime() : 0
    return newestAt > lastSeen
  }, [seenStoriesByUser])
  const momentMediaItems = moments
    .filter((moment) => Boolean(moment.media_url))
    .map((moment) => {
      const mediaUrl = resolveMediaUrl(moment.media_url)
      return {
        momentId: moment.id,
        url: mediaUrl,
        isVideo: isVideoUrl(mediaUrl),
        alt: `moment-${moment.id}`,
      }
    })
  const expandedMedia = expandedMediaIndex !== null ? momentMediaItems[expandedMediaIndex] : null
  const expandedMoment = expandedMedia ? moments.find((moment) => moment.id === expandedMedia.momentId) : null

  const loadStories = async () => {
    try {
      const response = await apiClient.getStories()
      const storiesList = Array.isArray(response.data) ? response.data : response.data?.data || []
      const normalizedStories = normalizeStories(storiesList)
      setStories(normalizedStories)
      setStoryLikeStateById((prev) => {
        const next = { ...prev }
        normalizedStories.forEach((story) => {
          next[story.id] = {
            liked: Boolean(story.is_liked),
            count: Number(story.likes_count || 0),
          }
        })
        return next
      })
    } catch (error) {
      console.error('Erro ao carregar stories:', error)
    }
  }

  const mergeUniqueMoments = (previous: Moment[], incoming: Moment[]) => {
    const seen = new Set(previous.map((m) => m.id))
    const dedupedIncoming = incoming.filter((m) => !seen.has(m.id))
    return [...previous, ...dedupedIncoming]
  }

  const sortMomentsByNewest = (list: Moment[]) => {
    return [...list].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime()
      const bTime = new Date(b.created_at).getTime()
      return bTime - aTime
    })
  }

  const loadMoments = async (pageToLoad: number, append: boolean, options?: LoadMomentsOptions) => {
    const isBackgroundRefresh = Boolean(options?.background)

    try {
      if (append) {
        setLoadingMore(true)
      } else if (!isBackgroundRefresh && moments.length === 0) {
        setLoading(true)
      }

      const response = await apiClient.getMoments(pageToLoad, PAGE_SIZE)
      const momentsList = Array.isArray(response.data) ? response.data : response.data?.data || []
      const normalized = sortMomentsByNewest(normalizeMoments(momentsList))
      const dedupedIncoming = normalized.filter((incoming) => !moments.some((existing) => existing.id === incoming.id))

      if (append) {
        setMoments((prev) => sortMomentsByNewest(mergeUniqueMoments(prev, normalized)))
      } else {
        setMoments(sortMomentsByNewest(normalized))
      }

      const hasNewItemsInAppend = !append || dedupedIncoming.length > 0
      setHasMore(normalized.length >= PAGE_SIZE && hasNewItemsInAppend)
    } catch (error) {
      toast.error('Erro ao carregar moments')
    } finally {
      if (append) {
        setLoadingMore(false)
      } else if (!isBackgroundRefresh) {
        setLoading(false)
      }
    }
  }

  const loadNextPage = useCallback(() => {
    if (loading || loadingMore || !hasMore) return
    const nextPage = page + 1
    setPage(nextPage)
    loadMoments(nextPage, true)
  }, [loading, loadingMore, hasMore, page])

  useEffect(() => {
    const sentinel = feedSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first?.isIntersecting) {
          loadNextPage()
        }
      },
      {
        root: null,
        rootMargin: '300px 0px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadNextPage])

  const handleLikeMoment = async (momentId: number) => {
    try {
      await apiClient.toggleContentLike('moment', momentId)
      setMoments(
        sortMomentsByNewest(moments.map((m) =>
          m.id === momentId
            ? {
                ...m,
                is_liked: !m.is_liked,
                likes_count: m.is_liked ? m.likes_count - 1 : m.likes_count + 1,
              }
            : m
        ))
      )
    } catch (error) {
      toast.error('Erro ao curtir moment')
    }
  }

  const handleOpenMomentActions = (momentId: number) => {
    setMomentActionMenuId((prev) => (prev === momentId ? null : momentId))
  }

  const handleStartEditMoment = (moment: Moment) => {
    setEditingMomentId(moment.id)
    setEditingMomentText(moment.content || '')
    setMomentActionMenuId(null)
  }

  const handleSaveMomentEdit = async (momentId: number) => {
    const nextContent = editingMomentText.trim()
    try {
      await apiClient.updateMoment(momentId, nextContent)
      setMoments((prev) => sortMomentsByNewest(prev.map((item) => (
        item.id === momentId ? { ...item, content: nextContent } : item
      ))))
      setEditingMomentId(null)
      setEditingMomentText('')
      toast.success('Publicação atualizada')
    } catch {
      toast.error('Erro ao editar publicação')
    }
  }

  const handleDeleteMoment = async (momentId: number) => {
    if (!window.confirm('Deseja excluir esta publicação?')) return
    try {
      await apiClient.deleteMoment(momentId)
      setMoments((prev) => prev.filter((item) => item.id !== momentId))
      setMomentActionMenuId(null)
      if (selectedMomentForComments?.id === momentId) {
        closeMomentCommentsModal()
      }
      toast.success('Publicação excluída')
    } catch {
      toast.error('Erro ao excluir publicação')
    }
  }

  const handleCommentMoment = async (momentId: number) => {
    const targetMoment = moments.find((moment) => moment.id === momentId)
    if (!targetMoment) return

    setSelectedMomentForComments(targetMoment)
    setNewMomentCommentText('')
    setMomentCommentsLoading(true)

    try {
      const response = await apiClient.getContentComments('moment', momentId)
      const list = Array.isArray(response.data) ? response.data : []
      setMomentComments(list)
    } catch (error) {
      setMomentComments([])
      toast.error('Erro ao carregar comentários')
    } finally {
      setMomentCommentsLoading(false)
    }
  }

  const refreshMomentComments = useCallback(async (momentId: number) => {
    try {
      const response = await apiClient.getContentComments('moment', momentId)
      const list = Array.isArray(response.data) ? response.data : []
      setMomentComments(list)
    } catch {
      // Silent refresh failure.
    }
  }, [])

  const closeMomentCommentsModal = () => {
    setSelectedMomentForComments(null)
    setMomentComments([])
    setNewMomentCommentText('')
    setMomentCommentsLoading(false)
    setReplyToMomentCommentId(null)
  }

  const momentCommentsSwipeHandlers = useSwipeGesture({
    enabled: Boolean(selectedMomentForComments),
    threshold: 45,
    axisLockRatio: 1.25,
    directions: ['down'],
    onSwipe: closeMomentCommentsModal,
  })

  const submitMomentComment = async () => {
    if (!selectedMomentForComments) return
    const text = newMomentCommentText.trim()
    if (!text) return

    try {
      await apiClient.addContentComment('moment', selectedMomentForComments.id, text)

      setMoments((prev) => sortMomentsByNewest(prev.map((moment) =>
        moment.id === selectedMomentForComments.id
          ? { ...moment, comments_count: (moment.comments_count || 0) + 1 }
          : moment
      )))

      await refreshMomentComments(selectedMomentForComments.id)
      setNewMomentCommentText('')
      setReplyToMomentCommentId(null)
    } catch (error) {
      toast.error('Erro ao comentar')
    }
  }

  const submitReplyToMomentComment = async () => {
    if (!selectedMomentForComments || !replyToMomentCommentId) return
    const text = newMomentCommentText.trim()
    if (!text) return

    try {
      await apiClient.addContentComment('moment', selectedMomentForComments.id, text, replyToMomentCommentId)
      setMoments((prev) => sortMomentsByNewest(prev.map((moment) =>
        moment.id === selectedMomentForComments.id
          ? { ...moment, comments_count: (moment.comments_count || 0) + 1 }
          : moment
      )))

      await refreshMomentComments(selectedMomentForComments.id)
      setNewMomentCommentText('')
      setReplyToMomentCommentId(null)
    } catch (error) {
      toast.error('Erro ao responder comentário')
    }
  }

  const toggleLikeMomentComment = async (commentId: number) => {
    const target = momentComments.find((comment) => comment.id === commentId)
    if (!target) return

    const optimisticLiked = !Boolean(target.is_liked)
    const optimisticCount = optimisticLiked
      ? Number(target.likes_count || 0) + 1
      : Math.max(0, Number(target.likes_count || 0) - 1)

    setMomentComments((prev) => prev.map((comment) =>
      comment.id === commentId
        ? { ...comment, is_liked: optimisticLiked, likes_count: optimisticCount }
        : comment
    ))

    try {
      await apiClient.toggleContentLike('comment', commentId)
    } catch (error) {
      setMomentComments((prev) => prev.map((comment) =>
        comment.id === commentId
          ? { ...comment, is_liked: target.is_liked, likes_count: target.likes_count }
          : comment
      ))
      toast.error('Erro ao curtir comentário')
    }
  }

  const handleOpenCommentActions = (commentId: number) => {
    setCommentActionMenuId((prev) => (prev === commentId ? null : commentId))
  }

  const handleStartEditComment = (comment: ContentComment) => {
    setEditingCommentId(comment.id)
    setEditingCommentText(comment.text || '')
    setCommentActionMenuId(null)
  }

  const handleSaveEditedComment = async (commentId: number) => {
    const nextText = editingCommentText.trim()
    if (!nextText) {
      toast.error('Comentário não pode ficar vazio')
      return
    }

    try {
      await apiClient.updateComment(commentId, nextText)
      setMomentComments((prev) => prev.map((comment) => (
        comment.id === commentId ? { ...comment, text: nextText } : comment
      )))
      setEditingCommentId(null)
      setEditingCommentText('')
      toast.success('Comentário atualizado')
    } catch {
      toast.error('Erro ao atualizar comentário')
    }
  }

  const handleDeleteComment = async (commentId: number) => {
    if (!window.confirm('Deseja excluir este comentário?')) return
    try {
      await apiClient.deleteComment(commentId)
      const idsToRemove = new Set<number>()
      const stack = [commentId]
      while (stack.length > 0) {
        const current = stack.pop() as number
        idsToRemove.add(current)
        momentComments.forEach((comment) => {
          if (comment.parent_comment_id === current && !idsToRemove.has(comment.id)) {
            stack.push(comment.id)
          }
        })
      }

      setMomentComments((prev) => prev.filter((comment) => !idsToRemove.has(comment.id)))
      if (selectedMomentForComments) {
        setMoments((prev) => sortMomentsByNewest(prev.map((moment) => (
          moment.id === selectedMomentForComments.id
            ? { ...moment, comments_count: Math.max(0, (moment.comments_count || 0) - idsToRemove.size) }
            : moment
        ))))
      }
      setCommentActionMenuId(null)
      if (editingCommentId && idsToRemove.has(editingCommentId)) {
        setEditingCommentId(null)
        setEditingCommentText('')
      }
      toast.success('Comentário excluído')
    } catch {
      toast.error('Erro ao excluir comentário')
    }
  }

  useEffect(() => {
    if (!selectedMomentForComments) return

    const onCommentCreated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail
      if (detail?.content_type === 'moment' && Number(detail?.content_id) === selectedMomentForComments.id) {
        refreshMomentComments(selectedMomentForComments.id)
      }
    }

    const onLikeUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail
      if (detail?.content_type === 'comment' && detail?.parent_content_type === 'moment' && Number(detail?.parent_content_id) === selectedMomentForComments.id) {
        refreshMomentComments(selectedMomentForComments.id)
      }
    }

    window.addEventListener('ello:ws:comment-created', onCommentCreated)
    window.addEventListener('ello:ws:content-like-updated', onLikeUpdated)

    return () => {
      window.removeEventListener('ello:ws:comment-created', onCommentCreated)
      window.removeEventListener('ello:ws:content-like-updated', onLikeUpdated)
    }
  }, [selectedMomentForComments, refreshMomentComments])

  const openShareDecision = (
    mediaUrl: string,
    caption = '',
    sourceAuthor?: { id?: number; username?: string; fullName?: string; avatarUrl?: string }
  ) => {
    if (!mediaUrl) return
    setShareDraft({ mediaUrl, isVideo: isVideoUrl(mediaUrl), caption, sourceAuthor })
    setShareCaptionDraft(caption)
    setShareDestination(null)
    setSelectedShareRecipientId(null)
    setShareRecipientQuery('')
    setFailedShareAvatarIds({})
    void loadShareConversations()
  }

  const handleShareMoment = async (momentId: number) => {
    const target = moments.find((item) => item.id === momentId)
    if (!target?.media_url) {
      toast.error('Esta publicação não possui mídia para compartilhar')
      return
    }
    openShareDecision(resolveMediaUrl(target.media_url), target.content || '', {
      id: target.author?.id,
      username: target.author?.username,
      fullName: target.author?.full_name,
      avatarUrl: resolveMediaUrl(target.author?.avatar_url),
    })
  }

  const loadShareConversations = async () => {
    try {
      const response = await apiClient.getConversations(1, 30)
      const list = Array.isArray(response.data?.data) ? response.data.data : []
      const mapped = list
        .map((item: any) => ({
          id: Number(item.id),
          userId: Number(item.other_user?.id),
          username: String(item.other_user?.username || ''),
          fullName: String(item.other_user?.full_name || 'Usuário'),
          avatarUrl: resolveMediaUrl(item.other_user?.avatar_url),
        }))
        .filter((item: ConversationOption) => Number.isFinite(item.userId) && item.userId > 0)

      setShareConversations(mapped)
      if (mapped.length > 0) {
        setSelectedShareRecipientId(mapped[0].userId)
      }
    } catch (error) {
      toast.error('Erro ao carregar conversas para compartilhamento')
      setShareConversations([])
      setSelectedShareRecipientId(null)
    }
  }

  const closeShareDecision = () => {
    setShareDraft(null)
    setShareCaptionDraft('')
    setShareDestination(null)
    setShareConversations([])
    setSelectedShareRecipientId(null)
    setShareRecipientQuery('')
    setFailedShareAvatarIds({})
    setShareBusy(false)
  }

  const shareDecisionSwipeHandlers = useSwipeGesture({
    enabled: Boolean(shareDraft),
    threshold: 35,
    axisLockRatio: 1.2,
    directions: ['down'],
    onSwipe: closeShareDecision,
  })

  const buildShareCreditText = (caption: string, sourceAuthor?: ShareDraft['sourceAuthor']) => {
    const creditSource = sourceAuthor?.username
      ? `Compartilhado de @${sourceAuthor.username}`
      : sourceAuthor?.fullName
        ? `Compartilhado de ${sourceAuthor.fullName}`
        : 'Compartilhado via '

    const trimmed = caption.trim()
    return trimmed ? `${trimmed}\n\n${creditSource}` : creditSource
  }

  const blobToDataUrl = async (blob: Blob) => {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Falha ao converter mídia para base64'))
      reader.readAsDataURL(blob)
    })
  }

  const prepareShareMedia = async (context?: 'moment' | 'vibe' | 'story') => {
    if (!shareDraft) {
      throw new Error('Compartilhamento inválido')
    }

    const sourceUrl = resolveMediaUrl(shareDraft.mediaUrl)
    const response = await fetch(sourceUrl)
    if (!response.ok) {
      throw new Error(`Falha ao obter mídia de origem (${response.status})`)
    }

    const blob = await response.blob()
    const mediaType = inferMediaType(blob.type, sourceUrl)
    const filename = inferMediaFilename(sourceUrl, mediaType)
    const mime = blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg')
    const uploadFileName = filename.includes('.')
      ? filename
      : `${filename}.${mediaType === 'video' ? 'mp4' : 'jpg'}`
    const file = new File([blob], uploadFileName, { type: mime })
    const uploadResponse = await apiClient.uploadFile(file, context)
    const uploadedUrl = resolveMediaUrl(uploadResponse?.data?.url)
    if (!uploadedUrl) {
      throw new Error('Falha ao salvar mídia para compartilhamento')
    }

    return { uploadedUrl, blob, mediaType, filename: uploadFileName }
  }

  const handleConfirmShareDecision = async () => {
    if (!shareDraft || !shareDestination) return

    const caption = shareCaptionDraft.trim()
    const captionWithCredit = buildShareCreditText(caption, shareDraft.sourceAuthor)

    try {
      setShareBusy(true)

      if (shareDestination === 'story') {
        const prepared = await prepareShareMedia('story')
        await apiClient.createStory({ media_url: prepared.uploadedUrl, text: captionWithCredit })
        window.dispatchEvent(new CustomEvent('ello:story-created'))
        toast.success('Compartilhado no story')
      }

      if (shareDestination === 'moment') {
        const prepared = await prepareShareMedia('moment')
        await apiClient.createMoment({
          content: captionWithCredit,
          media_url: prepared.uploadedUrl,
          latitude: null,
          longitude: null,
          location_label: null,
        })
        window.dispatchEvent(new CustomEvent('ello:moment-created'))
        toast.success('Compartilhado no moments')
      }

      if (shareDestination === 'vibe') {
        if (!shareDraft.isVideo) {
          toast.error('Apenas vídeos podem ser compartilhados no vibes')
          return
        }

        const prepared = await prepareShareMedia('vibe')
        await apiClient.createVibe({
          video_url: prepared.uploadedUrl,
          caption: captionWithCredit,
          latitude: null,
          longitude: null,
          location_label: null,
        })
        window.dispatchEvent(new CustomEvent('ello:vibe-created'))
        toast.success('Compartilhado no vibes')
      }

      if (shareDestination === 'chat') {
        if (!selectedShareRecipientId) {
          toast.error('Selecione uma conversa para compartilhar')
          return
        }

        const prepared = await prepareShareMedia()
        const dataUrl = await blobToDataUrl(prepared.blob)

        await apiClient.sendMedia({
          media_blob: dataUrl,
          receiver_id: selectedShareRecipientId,
          media_type: prepared.mediaType,
          filename: prepared.filename,
          caption: captionWithCredit,
        })

        toast.success('Compartilhado no chat')
      }

      closeShareDecision()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao compartilhar publicação')
    } finally {
      setShareBusy(false)
    }
  }

  const filteredShareConversations = shareConversations.filter((item) => {
    const query = shareRecipientQuery.trim().toLowerCase()
    if (!query) return true
    return item.fullName.toLowerCase().includes(query) || item.username.toLowerCase().includes(query)
  })

  const handleCopyShareLink = async () => {
    if (!shareDraft) return
    try {
      await navigator.clipboard.writeText(shareDraft.mediaUrl)
      toast.success('Link copiado')
    } catch {
      toast.error('Nao foi possivel copiar o link')
    }
  }

  const handleExternalShare = (status = false) => {
    if (!shareDraft) return
    const text = [shareCaptionDraft.trim(), shareDraft.mediaUrl].filter(Boolean).join(' ')
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, status ? '_blank' : '_blank', 'noopener,noreferrer')
  }

  const handleNativeShare = async () => {
    if (!shareDraft) return
    if (typeof navigator.share !== 'function') {
      await handleCopyShareLink()
      return
    }

    try {
      await navigator.share({
        title: '',
        text: shareCaptionDraft.trim() || 'Confira esta publicacao no ',
        url: shareDraft.mediaUrl,
      })
    } catch {
      // User canceled native share.
    }
  }

  const extractActiveMentionQuery = (text: string) => {
    const match = text.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/)
    return match ? match[1] : null
  }

  const mentionCandidates: MentionCandidate[] = (() => {
    const byUsername = new Map<string, MentionCandidate>()

    const owner = selectedMomentForComments?.author
    if (owner?.id && owner?.username) {
      byUsername.set(owner.username.toLowerCase(), { id: owner.id, username: owner.username })
    }

    momentComments.forEach((comment) => {
      if (comment.author?.id && comment.author?.username) {
        byUsername.set(comment.author.username.toLowerCase(), {
          id: comment.author.id,
          username: comment.author.username,
        })
      }
    })

    return Array.from(byUsername.values())
  })()

  const activeMentionQuery = extractActiveMentionQuery(newMomentCommentText)
  const filteredMentionCandidates =
    activeMentionQuery === null
      ? []
      : mentionCandidates
          .filter((candidate) => candidate.username.toLowerCase().startsWith(activeMentionQuery.toLowerCase()))
          .slice(0, 6)

  const applyMention = (username: string) => {
    setNewMomentCommentText((prev) =>
      prev.replace(/(?:^|\s)@[a-zA-Z0-9._-]*$/, (token) => {
        const hasLeadingSpace = token.startsWith(' ')
        return `${hasLeadingSpace ? ' ' : ''}@${username} `
      })
    )
  }

  const openMediaFullscreen = (momentId: number) => {
    const mediaIndex = momentMediaItems.findIndex((media) => media.momentId === momentId)
    if (mediaIndex === -1) return
    setExpandedMediaIndex(mediaIndex)
  }

  const closeExpandedMedia = useCallback(() => {
    setExpandedMediaIndex(null)
  }, [])

  const lockPageScroll = useCallback(() => {
    if (lockedScrollYRef.current !== null) return

    const scrollY = window.scrollY
    lockedScrollYRef.current = scrollY

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
  }, [])

  const unlockPageScroll = useCallback(() => {
    const lockedY = lockedScrollYRef.current

    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.left = ''
    document.body.style.right = ''
    document.body.style.width = ''

    if (lockedY !== null) {
      window.scrollTo({ top: lockedY, behavior: 'auto' })
      lockedScrollYRef.current = null
    }
  }, [])

  const navigateExpandedMedia = useCallback((direction: 'up' | 'down') => {
    if (momentMediaItems.length === 0) return
    setExpandedMediaIndex((currentIndex) => {
      if (currentIndex === null) return currentIndex
      if (direction === 'down') {
        return Math.min(momentMediaItems.length - 1, currentIndex + 1)
      }
      return Math.max(0, currentIndex - 1)
    })
  }, [momentMediaItems.length])

  const handleExpandedMediaWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (Math.abs(event.deltaY) < 20) return

    const now = Date.now()
    if (now - lastScrollNavigationAtRef.current < 250) return
    lastScrollNavigationAtRef.current = now

    if (event.deltaY > 0) {
      navigateExpandedMedia('down')
      return
    }

    navigateExpandedMedia('up')
  }, [navigateExpandedMedia])

  const expandedMediaSwipeHandlers = useSwipeGesture({
    enabled: Boolean(expandedMedia),
    threshold: 40,
    axisLockRatio: 1.2,
    directions: ['up', 'down'],
    onSwipe: ({ direction }) => {
      if (direction === 'up') {
        navigateExpandedMedia('down')
        return
      }

      if (direction === 'down') {
        navigateExpandedMedia('up')
      }
    },
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!expandedMedia) return

      if (event.key === 'Escape') {
        event.preventDefault()
        closeExpandedMedia()
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        navigateExpandedMedia('down')
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        navigateExpandedMedia('up')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expandedMedia, closeExpandedMedia, navigateExpandedMedia])

  useEffect(() => {
    const overlayActive = expandedMedia !== null || Boolean(selectedStory)

    if (overlayActive) {
      lockPageScroll()
      return
    }

    unlockPageScroll()
  }, [expandedMedia, selectedStory, lockPageScroll, unlockPageScroll])

  useEffect(() => {
    return () => {
      unlockPageScroll()
    }
  }, [unlockPageScroll])

  const closeStoryViewer = () => {
    setSelectedStoryUserIndex(null)
    setSelectedStoryItemIndex(0)
    setShowStoryCommentComposer(false)
    setStoryCommentDraft('')
    setStoryActionMenuOpen(false)
    setEditingStoryActive(false)
    setEditingStoryText('')
  }

  const markStoryGroupAsSeen = useCallback((groupIndex: number) => {
    const group = groupedStories[groupIndex]
    if (!group || group.items.length === 0) return
    const newest = group.items[group.items.length - 1]

    setSeenStoriesByUser((prev) => {
      const next = {
        ...prev,
        [group.userId]: newest.created_at,
      }
      try {
        window.localStorage.setItem(STORY_SEEN_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore localStorage persistence issues.
      }
      return next
    })
  }, [groupedStories])

  const goToPrevStory = () => {
    if (selectedStoryUserIndex === null || groupedStories.length === 0) return
    if (!selectedStoryGroup) return

    if (selectedStoryItemIndex > 0) {
      setSelectedStoryItemIndex((prev) => prev - 1)
      return
    }

    const prevUserIndex = (selectedStoryUserIndex - 1 + groupedStories.length) % groupedStories.length
    const prevGroup = groupedStories[prevUserIndex]
    setSelectedStoryUserIndex(prevUserIndex)
    setSelectedStoryItemIndex(Math.max(0, prevGroup.items.length - 1))
  }

  const goToNextStory = useCallback(() => {
    if (selectedStoryUserIndex === null || groupedStories.length === 0) return
    if (!selectedStoryGroup) return

    if (selectedStoryItemIndex < selectedStoryGroup.items.length - 1) {
      setSelectedStoryItemIndex((prev) => prev + 1)
      return
    }

    if (selectedStoryUserIndex < groupedStories.length - 1) {
      const nextUserIndex = selectedStoryUserIndex + 1
      setSelectedStoryUserIndex(nextUserIndex)
      setSelectedStoryItemIndex(0)
      markStoryGroupAsSeen(nextUserIndex)
      return
    }

    closeStoryViewer()
  }, [selectedStoryUserIndex, selectedStoryItemIndex, selectedStoryGroup, groupedStories, markStoryGroupAsSeen])

  const storyViewerSwipeHandlers = useSwipeGesture({
    enabled: Boolean(selectedStory),
    threshold: 45,
    axisLockRatio: 1.2,
    directions: ['left', 'right', 'down'],
    onSwipe: ({ direction }) => {
      if (direction === 'left') {
        goToNextStory()
        return
      }

      if (direction === 'right') {
        goToPrevStory()
        return
      }

      closeStoryViewer()
    },
  })

  useEffect(() => {
    if (!selectedStory) return
    const timeout = window.setTimeout(() => {
      goToNextStory()
    }, 4500)
    return () => window.clearTimeout(timeout)
  }, [selectedStory, goToNextStory])

  const openStoryGroup = (groupIndex: number) => {
    setSelectedStoryUserIndex(groupIndex)
    setSelectedStoryItemIndex(0)
    markStoryGroupAsSeen(groupIndex)
  }

  const openOwnStoryPublisher = () => {
    window.dispatchEvent(new CustomEvent('ello:open-publisher', { detail: { mode: 'story' } }))
  }

  const navigateToUserProfile = (userId?: number) => {
    if (!userId) return
    if (user?.id === userId) {
      navigate('/profile')
      return
    }
    navigate(`/profile/${userId}`)
  }

  const getStoryLikeState = (storyId: number) => {
    const fallback = stories.find((item) => item.id === storyId)
    const state = storyLikeStateById[storyId]
    if (state) return state
    return {
      liked: Boolean(fallback?.is_liked),
      count: Number(fallback?.likes_count || 0),
    }
  }

  const handleLikeStory = async (storyId: number) => {
    const current = getStoryLikeState(storyId)

    setStoryLikeStateById((prev) => ({
      ...prev,
      [storyId]: {
        liked: !current.liked,
        count: current.liked ? Math.max(0, current.count - 1) : current.count + 1,
      },
    }))

    try {
      await apiClient.toggleContentLike('story', storyId)
    } catch (error) {
      setStoryLikeStateById((prev) => ({
        ...prev,
        [storyId]: current,
      }))
      toast.error('Erro ao curtir story')
    }
  }

  const fetchMediaAsDataUrl = async (mediaUrl: string) => {
    const response = await fetch(mediaUrl)
    if (!response.ok) {
      throw new Error(`Falha ao obter mídia: ${response.status}`)
    }

    const blob = await response.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Falha ao converter mídia para base64'))
      reader.readAsDataURL(blob)
    })

    return {
      dataUrl,
      mime: blob.type,
    }
  }

  const inferMediaType = (mime: string, url: string) => {
    if (mime.startsWith('video/') || isVideoUrl(url)) return 'video'
    return 'image'
  }

  const inferMediaFilename = (url: string, mediaType: 'image' | 'video') => {
    try {
      const clean = url.split('?')[0].split('#')[0]
      const last = clean.split('/').pop() || ''
      if (last.trim().length > 0) return last
    } catch {
      // Ignore and fallback.
    }
    return mediaType === 'video' ? `story-reply-${Date.now()}.mp4` : `story-reply-${Date.now()}.jpg`
  }

  const handleSubmitStoryComment = async () => {
    if (!selectedStory || !selectedStoryGroup?.userId) return
    if (!user?.id) return

    const targetUserId = selectedStoryGroup.userId
    if (targetUserId === user.id) {
      toast('Esse story é seu')
      return
    }

    try {
      setProcessingStoryAction(true)
      const mediaUrl = resolveMediaUrl(selectedStory.media_url)
      const { dataUrl, mime } = await fetchMediaAsDataUrl(mediaUrl)
      const mediaType = inferMediaType(mime, mediaUrl)
      const filename = inferMediaFilename(mediaUrl, mediaType)

      await apiClient.sendMedia({
        media_blob: dataUrl,
        receiver_id: targetUserId,
        media_type: mediaType,
        filename,
        caption: storyCommentDraft.trim() || 'Comentei no seu story',
      })

      setStoryCommentDraft('')
      setShowStoryCommentComposer(false)
      toast.success('Comentário enviado no chat com o story espelhado')
    } catch (error) {
      toast.error('Erro ao enviar comentário do story')
    } finally {
      setProcessingStoryAction(false)
    }
  }

  const handleStartEditStory = () => {
    if (!selectedStory) return
    setEditingStoryText(selectedStory.text || '')
    setEditingStoryActive(true)
    setStoryActionMenuOpen(false)
  }

  const handleSaveStoryEdit = async () => {
    if (!selectedStory) return
    try {
      await apiClient.updateStory(selectedStory.id, editingStoryText.trim())
      setStories((prev) => prev.map((story) => (
        story.id === selectedStory.id
          ? { ...story, text: editingStoryText.trim() || undefined }
          : story
      )))
      setEditingStoryActive(false)
      toast.success('Story atualizado')
    } catch {
      toast.error('Erro ao atualizar story')
    }
  }

  const handleDeleteStory = async () => {
    if (!selectedStory) return
    if (!window.confirm('Deseja excluir este story?')) return
    try {
      await apiClient.deleteStory(selectedStory.id)
      setStories((prev) => prev.filter((story) => story.id !== selectedStory.id))
      toast.success('Story excluído')
      closeStoryViewer()
    } catch {
      toast.error('Erro ao excluir story')
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950">
      {/* Stories */}
      <div className="bg-gradient-to-r from-primary/10 to-transparent py-3 sm:py-4">
        <div className="max-w-3xl mx-auto px-3 sm:px-4">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
            <div className="shrink-0 flex flex-col items-center gap-1.5">
              <div className="relative w-14 h-14 sm:w-[60px] sm:h-[60px] rounded-full p-[2px] bg-gradient-to-br from-amber-400 via-orange-500 to-red-500">
                <button
                  onClick={() => {
                    if (ownStoryGroupIndex >= 0) {
                      openStoryGroup(ownStoryGroupIndex)
                      return
                    }
                    openOwnStoryPublisher()
                  }}
                  className="w-full h-full rounded-full bg-slate-900 p-[2px]"
                >
                  <img
                    src={resolveMediaUrl(user?.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username || 'me'}`}
                    alt={user?.username || 'me'}
                    className="w-full h-full rounded-full object-cover"
                  />
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    openOwnStoryPublisher()
                  }}
                  className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-primary border-2 border-slate-950 flex items-center justify-center text-white text-xs font-bold leading-none"
                  aria-label="Publicar story"
                >
                  +
                </button>
              </div>
              <span className="text-[11px] text-gray-300 max-w-14 truncate">Seu story</span>
            </div>

            {otherStoryGroups.map(({ group, index }) => (
              <button
                key={`story-user-${group.userId}`}
                onClick={() => openStoryGroup(index)}
                className="shrink-0 flex flex-col items-center gap-1.5"
              >
                <div
                  className={`w-14 h-14 sm:w-[60px] sm:h-[60px] rounded-full p-[2px] ${
                    storyGroupHasNewContent(group)
                      ? 'bg-gradient-to-br from-amber-400 via-orange-500 to-red-500'
                      : 'bg-gradient-to-br from-slate-500 via-slate-600 to-slate-700'
                  }`}
                >
                  <div className="w-full h-full rounded-full bg-slate-900 p-[2px]">
                    <img
                      src={resolveMediaUrl(group.author?.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${group.author?.username || `story-user-${group.userId}`}`}
                      alt={group.author?.username || 'story'}
                      className="w-full h-full rounded-full object-cover"
                    />
                  </div>
                </div>
                <span className="text-[11px] text-gray-300 max-w-14 truncate">{group.author?.username || `user${group.userId}`}</span>
              </button>
            ))}
          </div>

          {stories.length === 0 && (
            <p className="text-sm text-gray-500 mt-3">Sem stories ativos no momento. Seja o primeiro!</p>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : moments.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Nenhum moment encontrado</p>
          </div>
        ) : (
          <div className="space-y-6">
            {moments.map((moment) => (
              <div
                key={moment.id}
                className="py-5 sm:py-6"
              >
                {/* Author Info */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => navigateToUserProfile(moment.author?.id || moment.author_id)}
                      className="rounded-full"
                      title={`Ver perfil de @${moment.author?.username || 'user'}`}
                    >
                      <img
                        src={moment.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${moment.author?.username || 'author'}`}
                        alt={moment.author?.username || 'author'}
                        className="w-10 h-10 rounded-full object-cover"
                        style={getMoodAvatarRingStyle(moment.author?.mood)}
                      />
                    </button>
                    <div>
                      <button
                        onClick={() => navigateToUserProfile(moment.author?.id || moment.author_id)}
                        className="font-semibold text-white hover:text-primary transition"
                      >
                        {moment.author?.full_name || 'Usuario'}
                      </button>
                      <p className="text-xs text-gray-500">@{moment.author?.username || 'user'}</p>
                      {moment.location_label && (
                        <p className="text-xs text-gray-400 mt-0.5">{formatShortLocation(moment.location_label)}</p>
                      )}
                    </div>
                  </div>
                  {(moment.author?.id || moment.author_id) === user?.id && (
                    <div className="relative">
                      <button
                        onClick={() => handleOpenMomentActions(moment.id)}
                        className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-slate-800 transition"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {momentActionMenuId === moment.id && (
                        <div className="absolute right-0 mt-1 min-w-[130px] max-w-[72vw] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-30">
                          <button
                            onClick={() => handleStartEditMoment(moment)}
                            className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 transition inline-flex items-center gap-2"
                          >
                            <Pencil size={13} />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteMoment(moment.id)}
                            className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-500/10 transition inline-flex items-center gap-2"
                          >
                            <Trash2 size={13} />
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Content */}
                {editingMomentId === moment.id ? (
                  <div className="mb-4 space-y-2">
                    <textarea
                      value={editingMomentText}
                      onChange={(event) => setEditingMomentText(event.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm text-white resize-none focus:outline-none focus:border-primary"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingMomentId(null)
                          setEditingMomentText('')
                        }}
                        className="text-xs text-gray-400 hover:text-white transition"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleSaveMomentEdit(moment.id)}
                        className="text-xs px-3 py-1 rounded-lg bg-primary text-white hover:bg-primary/85 transition"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-200 mb-4 text-base sm:text-lg leading-relaxed break-words">{moment.content}</p>
                )}
                {moment.media_url && (
                  <div
                    className="relative mb-4 rounded-xl overflow-hidden border border-slate-800/80 bg-black cursor-zoom-in w-full max-w-2xl mx-auto"
                    onClick={() => openMediaFullscreen(moment.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openMediaFullscreen(moment.id)
                      }
                    }}
                    aria-label="Abrir mídia em tela cheia"
                  >
                    {isVideoUrl(moment.media_url) ? (
                      <div className="aspect-[4/5] sm:aspect-[1/1] w-full bg-black">
                        <video
                          src={resolveMediaUrl(moment.media_url)}
                          autoPlay
                          muted
                          loop
                          playsInline
                          className="w-full h-full object-contain bg-black"
                        />
                      </div>
                    ) : (
                      <div className="aspect-[4/5] sm:aspect-[1/1] w-full bg-black">
                        <img
                          src={resolveMediaUrl(moment.media_url)}
                          alt="moment"
                          className="w-full h-full object-contain bg-black"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-5 sm:gap-8 text-gray-500 pt-2">
                  <button
                    onClick={() => handleLikeMoment(moment.id)}
                    className={`flex items-center gap-2 hover:text-primary transition ${
                      moment.is_liked ? 'text-primary' : ''
                    }`}
                  >
                    <Heart size={18} fill={moment.is_liked ? 'currentColor' : 'none'} />
                    <span className="text-sm">{moment.likes_count}</span>
                  </button>
                  <button
                    onClick={() => handleCommentMoment(moment.id)}
                    className="flex items-center gap-2 hover:text-primary transition"
                  >
                    <MessageCircle size={18} />
                    <span className="text-sm">{moment.comments_count}</span>
                  </button>
                  <button
                    onClick={() => handleShareMoment(moment.id)}
                    className="flex items-center gap-2 hover:text-primary transition"
                  >
                    <Share2 size={18} />
                  </button>
                </div>
              </div>
            ))}

            {loadingMore && (
              <div className="flex justify-center items-center py-8">
                <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            <div ref={feedSentinelRef} className="h-1 w-full" aria-hidden="true" />
          </div>
        )}
      </div>

      {selectedStory && (
        <div
          className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-3 sm:p-6"
          style={{ touchAction: 'none' }}
          {...storyViewerSwipeHandlers}
        >
          <button
            onClick={closeStoryViewer}
            className="absolute top-4 right-4 z-40 text-white bg-black/50 p-2 rounded-full hover:bg-black/70 transition"
          >
            <X size={22} />
          </button>

          {selectedStory.user_id === user?.id && (
            <div className="absolute top-4 right-16 z-40">
              <button
                onClick={() => setStoryActionMenuOpen((prev) => !prev)}
                className="text-white bg-black/50 p-2 rounded-full hover:bg-black/70 transition"
              >
                <MoreVertical size={18} />
              </button>
              {storyActionMenuOpen && (
                <div className="absolute right-0 mt-2 min-w-[130px] max-w-[72vw] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
                  <button
                    onClick={handleStartEditStory}
                    className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 inline-flex items-center gap-2"
                  >
                    <Pencil size={13} />
                    Editar
                  </button>
                  <button
                    onClick={handleDeleteStory}
                    className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-500/10 inline-flex items-center gap-2"
                  >
                    <Trash2 size={13} />
                    Excluir
                  </button>
                </div>
              )}
            </div>
          )}

          {groupedStories.length > 1 && (
            <button
              onClick={goToPrevStory}
              className="hidden sm:flex absolute left-3 sm:left-6 z-40 text-white bg-black/50 p-2 rounded-full hover:bg-black/70 transition"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          <button
            onClick={() => navigateToUserProfile(selectedStoryGroup?.userId)}
            className="absolute top-4 left-4 z-40 text-white bg-black/40 px-3 py-2 rounded-xl hover:bg-black/60 transition flex items-center gap-2 max-w-[72vw]"
          >
            <img
              src={selectedStoryGroup?.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedStoryGroup?.author?.username || `story-user-${selectedStoryGroup?.userId}`}`}
              alt={selectedStoryGroup?.author?.username || 'story'}
              className="w-8 h-8 rounded-full object-cover"
              style={getMoodAvatarRingStyle(selectedStoryGroup?.author?.mood)}
            />
            <div className="text-left min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{selectedStoryGroup?.author?.full_name || 'Usuario'}</p>
              <p className="text-xs text-gray-200 leading-tight truncate">@{selectedStoryGroup?.author?.username || `user${selectedStoryGroup?.userId}`}</p>
            </div>
          </button>

          <div className="relative w-full h-full overflow-hidden z-10">
            {isVideoUrl(selectedStory.media_url) ? (
              <video
                src={resolveMediaUrl(selectedStory.media_url)}
                autoPlay
                muted
                loop
                playsInline
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-55"
              />
            ) : (
              <img
                src={resolveMediaUrl(selectedStory.media_url)}
                alt="story background"
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-55"
              />
            )}

            <div className="absolute inset-0 flex items-center justify-center px-2 sm:px-4">
              {isVideoUrl(selectedStory.media_url) ? (
                <video
                  src={resolveMediaUrl(selectedStory.media_url)}
                  controls
                  autoPlay
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <img
                  src={resolveMediaUrl(selectedStory.media_url)}
                  alt="story"
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>
          </div>

          {selectedStory.text && !editingStoryActive && (
            <div className="absolute bottom-28 left-4 right-4 text-center z-20">
              <p className="inline-block max-w-xl px-3 py-2 rounded-xl bg-black/55 text-white text-sm break-words">
                {selectedStory.text}
              </p>
            </div>
          )}

          {editingStoryActive && selectedStory.user_id === user?.id && (
            <div className="absolute bottom-28 left-4 right-4 z-20">
              <div className="max-w-xl mx-auto rounded-xl bg-black/65 border border-white/15 p-3 space-y-2">
                <textarea
                  value={editingStoryText}
                  onChange={(event) => setEditingStoryText(event.target.value)}
                  rows={3}
                  placeholder="Texto do story"
                  className="w-full rounded-lg border border-white/20 bg-slate-900/70 p-2 text-sm text-white resize-none focus:outline-none focus:border-primary"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setEditingStoryActive(false)
                      setEditingStoryText('')
                    }}
                    className="text-xs text-gray-300 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveStoryEdit}
                    className="text-xs px-3 py-1 rounded-lg bg-primary text-white hover:bg-primary/85"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="absolute left-1/2 -translate-x-1/2 bottom-5 z-20">
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/55 backdrop-blur-md px-3 py-2">
            <button
              onClick={() => handleLikeStory(selectedStory.id)}
              disabled={processingStoryAction}
              className={`inline-flex items-center gap-1.5 text-xs transition ${
                getStoryLikeState(selectedStory.id).liked ? 'text-primary' : 'text-white hover:text-primary'
              }`}
            >
              <Heart size={18} fill={getStoryLikeState(selectedStory.id).liked ? 'currentColor' : 'none'} />
              <span>{getStoryLikeState(selectedStory.id).count}</span>
            </button>

            <button
              onClick={() => setShowStoryCommentComposer((prev) => !prev)}
              disabled={processingStoryAction || selectedStory.user_id === user?.id}
              className="inline-flex items-center gap-1.5 text-xs text-white hover:text-primary transition disabled:opacity-40"
              title="Comentar story"
            >
              <MessageCircle size={18} />
              <span>Comentar</span>
            </button>

            <button
              onClick={() =>
                openShareDecision(resolveMediaUrl(selectedStory.media_url), selectedStory.text || '', {
                  id: selectedStory.author?.id,
                  username: selectedStory.author?.username,
                  fullName: selectedStory.author?.full_name,
                  avatarUrl: resolveMediaUrl(selectedStory.author?.avatar_url),
                })
              }
              disabled={processingStoryAction}
              className="inline-flex items-center gap-1.5 text-xs text-white hover:text-primary transition disabled:opacity-40"
              title="Compartilhar"
            >
              <Share2 size={18} />
              <span>Compartilhar</span>
            </button>
            </div>
          </div>

          {showStoryCommentComposer && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-20 w-[min(92vw,560px)] z-20">
              <div className="rounded-2xl border border-white/15 bg-black/70 backdrop-blur-md p-3">
                <label className="block text-xs text-gray-300 mb-2">Comentário do story (vai para o chat)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={storyCommentDraft}
                    onChange={(event) => setStoryCommentDraft(event.target.value)}
                    placeholder="Digite seu comentário ou emoji..."
                    className="flex-1 h-10 rounded-xl border border-white/10 bg-slate-900/80 px-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={handleSubmitStoryComment}
                    disabled={processingStoryAction || selectedStory.user_id === user?.id}
                    className="h-10 px-4 rounded-xl bg-primary text-white hover:bg-primary/85 transition disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          )}

          {groupedStories.length > 1 && (
            <button
              onClick={goToNextStory}
              className="hidden sm:flex absolute right-3 sm:right-6 z-40 text-white bg-black/50 p-2 rounded-full hover:bg-black/70 transition"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      )}

      {expandedMedia && (
        <div
          className="fixed inset-0 z-[95] bg-black/95 flex items-center justify-center p-0 sm:p-2"
          onWheel={handleExpandedMediaWheel}
          style={{ touchAction: 'none' }}
          {...expandedMediaSwipeHandlers}
        >
          <button
            onClick={closeExpandedMedia}
            className="absolute top-4 right-4 z-40 text-white bg-black/50 p-2 rounded-full hover:bg-black/70 transition"
          >
            <X size={22} />
          </button>

          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-300 bg-black/40 px-2 py-1 rounded-full hidden sm:block">
            role para cima/baixo
          </div>

          <div className="relative w-screen h-[100dvh] overflow-hidden z-10">
            {expandedMedia.isVideo ? (
              <video
                src={expandedMedia.url}
                autoPlay
                muted
                loop
                playsInline
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-55"
              />
            ) : (
              <img
                src={expandedMedia.url}
                alt={`${expandedMedia.alt} background`}
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-55"
              />
            )}

            <div className="absolute inset-0 flex items-center justify-center">
              {expandedMedia.isVideo ? (
                <video
                  src={expandedMedia.url}
                  controls
                  autoPlay
                  onClick={(event) => event.stopPropagation()}
                  className="w-full h-full object-contain"
                />
              ) : (
                <img
                  src={expandedMedia.url}
                  alt={expandedMedia.alt}
                  onClick={(event) => event.stopPropagation()}
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </div>

          {expandedMoment && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-20">
              <div className="flex items-center gap-3 rounded-full border border-white/15 bg-black/55 backdrop-blur-md px-4 py-2">
                <button
                  onClick={() => handleLikeMoment(expandedMoment.id)}
                  className={`inline-flex items-center gap-1.5 text-xs transition ${expandedMoment.is_liked ? 'text-primary' : 'text-white hover:text-primary'}`}
                >
                  <Heart size={16} fill={expandedMoment.is_liked ? 'currentColor' : 'none'} />
                  <span>{expandedMoment.likes_count}</span>
                </button>
                <button
                  onClick={() => handleCommentMoment(expandedMoment.id)}
                  className="inline-flex items-center gap-1.5 text-xs text-white hover:text-primary transition"
                >
                  <MessageCircle size={16} />
                  <span>{expandedMoment.comments_count}</span>
                </button>
                <button
                  onClick={() => handleShareMoment(expandedMoment.id)}
                  className="inline-flex items-center gap-1.5 text-xs text-white hover:text-primary transition"
                >
                  <Share2 size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {shareDraft && (
        <div
          className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-end justify-center"
          onClick={closeShareDecision}
          {...shareDecisionSwipeHandlers}
        >
          <div
            className="w-full max-w-xl max-h-[88dvh] overflow-y-auto rounded-t-3xl border border-slate-700/60 border-b-0 bg-slate-900/95 px-3 sm:px-5 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
            onClick={(event) => event.stopPropagation()}
            data-gesture-ignore="true"
          >
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-slate-600/80" />

            <div className="flex items-center gap-2 rounded-xl bg-slate-800/90 px-3 h-11">
              <Search size={16} className="text-gray-400" />
              <input
                value={shareRecipientQuery}
                onChange={(event) => setShareRecipientQuery(event.target.value)}
                placeholder="Pesquisar"
                className="w-full bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 min-h-[160px]">
              {filteredShareConversations.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-10">Nenhum contato encontrado.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4">
                  {filteredShareConversations.slice(0, 15).map((item) => {
                    const isSelected = shareDestination === 'chat' && selectedShareRecipientId === item.userId
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setShareDestination('chat')
                          setSelectedShareRecipientId(item.userId)
                        }}
                        className="flex flex-col items-center text-center"
                      >
                        <span className={`relative inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-slate-700 text-white text-sm font-semibold ${isSelected ? 'ring-2 ring-primary/80 ring-offset-2 ring-offset-slate-900' : ''}`}>
                          {item.avatarUrl && !failedShareAvatarIds[item.userId] ? (
                            <img
                              src={item.avatarUrl}
                              alt={item.fullName}
                              className="w-full h-full object-cover"
                              onError={() => setFailedShareAvatarIds((prev) => ({ ...prev, [item.userId]: true }))}
                            />
                          ) : (
                            <img
                              src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(item.username || item.fullName)}`}
                              alt={item.fullName}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </span>
                        <span className="mt-2 text-[11px] sm:text-xs text-gray-200 leading-tight line-clamp-2 max-w-[70px] sm:max-w-[76px]">{item.fullName}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 border-t border-slate-800 pt-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
              <button onClick={() => setShareDestination('story')} className="flex flex-col items-center gap-1 text-gray-200 hover:text-white transition-colors">
                <span className={`w-12 h-12 rounded-full inline-flex items-center justify-center ${shareDestination === 'story' ? 'bg-primary text-white' : 'bg-slate-800 text-gray-200'}`}><PlusCircle size={18} /></span>
                <span className="text-[11px] leading-tight text-center">Story</span>
              </button>
              <button onClick={() => handleExternalShare(false)} className="flex flex-col items-center gap-1 text-gray-200 hover:text-white transition-colors">
                <span className="w-12 h-12 rounded-full inline-flex items-center justify-center bg-slate-800"><MessageCircle size={18} /></span>
                <span className="text-[11px] leading-tight text-center">WhatsApp</span>
              </button>
              <button onClick={() => handleExternalShare(true)} className="flex flex-col items-center gap-1 text-gray-200 hover:text-white transition-colors">
                <span className="w-12 h-12 rounded-full inline-flex items-center justify-center bg-slate-800"><Send size={18} /></span>
                <span className="text-[11px] leading-tight text-center">Status</span>
              </button>
              <button onClick={handleCopyShareLink} className="flex flex-col items-center gap-1 text-gray-200 hover:text-white transition-colors">
                <span className="w-12 h-12 rounded-full inline-flex items-center justify-center bg-slate-800"><Link2 size={18} /></span>
                <span className="text-[11px] leading-tight text-center">Copiar link</span>
              </button>
              <button onClick={handleNativeShare} className="flex flex-col items-center gap-1 text-gray-200 hover:text-white transition-colors">
                <span className="w-12 h-12 rounded-full inline-flex items-center justify-center bg-slate-800"><Share2 size={18} /></span>
                <span className="text-[11px] leading-tight text-center">Compartilhar</span>
              </button>
            </div>

            <div className="mt-4 flex flex-wrap justify-between items-center gap-2">
              <button onClick={closeShareDecision} className="h-9 px-3 inline-flex items-center rounded-full text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors duration-200 whitespace-nowrap">
                <span className="inline-flex items-center gap-2"><X size={14} />Cancelar</span>
              </button>
              <button
                onClick={handleConfirmShareDecision}
                disabled={!shareDestination || shareBusy || (shareDestination === 'chat' && !selectedShareRecipientId)}
                className="h-9 px-3 inline-flex items-center rounded-full text-xs font-medium text-primary hover:text-primary/80 transition-colors duration-200 disabled:opacity-50 whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-2"><Send size={14} />{shareBusy ? 'Enviando...' : 'Enviar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedMomentForComments && (
        <div
          className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeMomentCommentsModal}
          {...momentCommentsSwipeHandlers}
        >
          <div
            className="w-full max-w-xl max-h-[88vh] rounded-2xl border border-slate-700/80 bg-slate-950/95 shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            data-gesture-ignore="true"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div>
                <h3 className="text-white font-semibold">Comentários</h3>
                <p className="text-xs text-gray-400">@{selectedMomentForComments.author?.username || 'user'}</p>
              </div>
              <button
                onClick={closeMomentCommentsModal}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/90 text-gray-300 hover:text-white hover:bg-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-3 max-h-[52vh] sm:max-h-80 overflow-y-auto space-y-2">
              {momentCommentsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : momentComments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum comentário ainda.</p>
              ) : (
                <>
                  {momentComments
                    .filter((comment) => !comment.parent_comment_id)
                    .map((comment) => {
                      const replies = momentComments.filter((reply) => reply.parent_comment_id === comment.id)
                      return (
                        <div key={comment.id} className="py-1.5 border-b border-slate-800/60 last:border-b-0">
                          <div className="flex items-start gap-2">
                            <img
                              src={comment.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.author?.username || comment.id}`}
                              alt={comment.author?.username || 'user'}
                              className="w-6 h-6 rounded-full object-cover mt-0.5"
                              style={getMoodAvatarRingStyle(comment.author?.mood)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-300">
                                <span className="text-white font-semibold mr-1">{comment.author?.full_name || 'Usuário'}</span>
                                <span>@{comment.author?.username || 'user'}</span>
                              </div>
                              <p className="text-sm text-gray-200 break-words">{comment.text}</p>
                              {editingCommentId === comment.id ? (
                                <div className="mt-2 space-y-2">
                                  <textarea
                                    value={editingCommentText}
                                    onChange={(event) => setEditingCommentText(event.target.value)}
                                    rows={2}
                                    className="w-full rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-xs text-white resize-none focus:outline-none focus:border-primary"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => { setEditingCommentId(null); setEditingCommentText('') }} className="text-[11px] text-gray-400 hover:text-white">Cancelar</button>
                                    <button onClick={() => handleSaveEditedComment(comment.id)} className="text-[11px] px-2 py-1 rounded bg-primary text-white">Salvar</button>
                                  </div>
                                </div>
                              ) : null}
                              <div className="flex items-center gap-3 mt-1">
                                <button
                                  onClick={() => toggleLikeMomentComment(comment.id)}
                                  className={`text-[11px] transition ${comment.is_liked ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
                                >
                                  Curtir {Number(comment.likes_count || 0) > 0 ? `(${comment.likes_count})` : ''}
                                </button>
                                <button
                                  onClick={() => {
                                    setReplyToMomentCommentId(comment.id)
                                    if (comment.author?.username) {
                                      setNewMomentCommentText(`@${comment.author.username} `)
                                    }
                                  }}
                                  className="text-[11px] text-gray-400 hover:text-primary transition"
                                >
                                  Responder
                                </button>
                                {comment.author?.id === user?.id && (
                                  <div className="relative ml-auto">
                                    <button
                                      onClick={() => handleOpenCommentActions(comment.id)}
                                      className="text-gray-400 hover:text-white transition"
                                    >
                                      <MoreVertical size={13} />
                                    </button>
                                    {commentActionMenuId === comment.id && (
                                      <div className="absolute right-0 mt-1 min-w-[120px] max-w-[70vw] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-30">
                                        <button onClick={() => handleStartEditComment(comment)} className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 inline-flex items-center gap-2"><Pencil size={12} />Editar</button>
                                        <button onClick={() => handleDeleteComment(comment.id)} className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-500/10 inline-flex items-center gap-2"><Trash2 size={12} />Excluir</button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {replies.length > 0 && (
                            <div className="ml-8 mt-2 space-y-2">
                              {replies.map((reply) => (
                                <div key={reply.id} className="flex items-start gap-2">
                                  <img
                                    src={reply.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${reply.author?.username || reply.id}`}
                                    alt={reply.author?.username || 'user'}
                                    className="w-5 h-5 rounded-full object-cover mt-0.5"
                                    style={getMoodAvatarRingStyle(reply.author?.mood)}
                                  />
                                  <div className="min-w-0">
                                    <div className="text-[11px] text-gray-400">
                                      <span className="text-gray-200 font-semibold mr-1">{reply.author?.full_name || 'Usuário'}</span>
                                      <span>@{reply.author?.username || 'user'}</span>
                                    </div>
                                    {editingCommentId === reply.id ? (
                                      <div className="mt-2 space-y-2">
                                        <textarea
                                          value={editingCommentText}
                                          onChange={(event) => setEditingCommentText(event.target.value)}
                                          rows={2}
                                          className="w-full rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-xs text-white resize-none focus:outline-none focus:border-primary"
                                        />
                                        <div className="flex items-center gap-2">
                                          <button onClick={() => { setEditingCommentId(null); setEditingCommentText('') }} className="text-[11px] text-gray-400 hover:text-white">Cancelar</button>
                                          <button onClick={() => handleSaveEditedComment(reply.id)} className="text-[11px] px-2 py-1 rounded bg-primary text-white">Salvar</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-gray-300 break-words">{reply.text}</p>
                                    )}
                                    <div className="flex items-center gap-3 mt-1">
                                      <button
                                        onClick={() => toggleLikeMomentComment(reply.id)}
                                        className={`text-[11px] transition ${reply.is_liked ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
                                      >
                                        Curtir {Number(reply.likes_count || 0) > 0 ? `(${reply.likes_count})` : ''}
                                      </button>
                                      <button
                                        onClick={() => {
                                          setReplyToMomentCommentId(reply.parent_comment_id || reply.id)
                                          if (reply.author?.username) {
                                            setNewMomentCommentText(`@${reply.author.username} `)
                                          }
                                        }}
                                        className="text-[11px] text-gray-400 hover:text-primary transition"
                                      >
                                        Responder
                                      </button>
                                      {reply.author?.id === user?.id && (
                                        <div className="relative ml-auto">
                                          <button
                                            onClick={() => handleOpenCommentActions(reply.id)}
                                            className="text-gray-400 hover:text-white transition"
                                          >
                                            <MoreVertical size={13} />
                                          </button>
                                          {commentActionMenuId === reply.id && (
                                            <div className="absolute right-0 mt-1 min-w-[120px] max-w-[70vw] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-30">
                                              <button onClick={() => handleStartEditComment(reply)} className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 inline-flex items-center gap-2"><Pencil size={12} />Editar</button>
                                              <button onClick={() => handleDeleteComment(reply.id)} className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-500/10 inline-flex items-center gap-2"><Trash2 size={12} />Excluir</button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                {filteredMentionCandidates.length > 0 && (
                  <div className="absolute bottom-full mb-2 left-0 right-0 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-xl z-10">
                    {filteredMentionCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        onClick={() => applyMention(candidate.username)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-slate-800 transition"
                      >
                        @{candidate.username}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  value={newMomentCommentText}
                  onChange={(event) => setNewMomentCommentText(event.target.value)}
                  placeholder={replyToMomentCommentId ? 'Responder comentário... use @usuario' : 'Escreva um comentário... use @usuario'}
                  className="w-full h-10 bg-transparent px-2 text-sm text-white placeholder-gray-500 focus:outline-none"
                />
              </div>
              {replyToMomentCommentId && (
                <button
                  onClick={() => setReplyToMomentCommentId(null)}
                  className="text-xs text-gray-400 hover:text-white transition"
                >
                  cancelar
                </button>
              )}
              <button
                onClick={replyToMomentCommentId ? submitReplyToMomentComment : submitMomentComment}
                className="text-cyan-400 hover:text-cyan-300 transition"
                title="Enviar comentário"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

