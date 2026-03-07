import { useState, useEffect, useRef } from 'react'
import apiClient from '@services/api'
import { toast } from 'react-hot-toast'
import type { Moment } from '@/types'
import { Heart, MessageCircle, Share2, X, Send, Search, Link2, PlusCircle, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@store/authStore'

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
  }
}

type MentionCandidate = {
  id: number
  username: string
}

type ShareDestination = 'story' | 'moment' | 'chat' | 'vibe'

type ShareDraft = {
  mediaUrl: string
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

export default function VibesPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const [vibes, setVibes] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVibeForComments, setSelectedVibeForComments] = useState<Moment | null>(null)
  const [vibeComments, setVibeComments] = useState<ContentComment[]>([])
  const [vibeCommentsLoading, setVibeCommentsLoading] = useState(false)
  const [newVibeCommentText, setNewVibeCommentText] = useState('')
  const [replyToVibeCommentId, setReplyToVibeCommentId] = useState<number | null>(null)
  const [shareDraft, setShareDraft] = useState<ShareDraft | null>(null)
  const [shareCaptionDraft, setShareCaptionDraft] = useState('')
  const [shareDestination, setShareDestination] = useState<ShareDestination | null>(null)
  const [shareConversations, setShareConversations] = useState<ConversationOption[]>([])
  const [selectedShareRecipientId, setSelectedShareRecipientId] = useState<number | null>(null)
  const [shareRecipientQuery, setShareRecipientQuery] = useState('')
  const [failedShareAvatarIds, setFailedShareAvatarIds] = useState<Record<number, boolean>>({})
  const [shareBusy, setShareBusy] = useState(false)
  const [vibeActionMenuId, setVibeActionMenuId] = useState<number | null>(null)
  const [editingVibeId, setEditingVibeId] = useState<number | null>(null)
  const [editingVibeCaption, setEditingVibeCaption] = useState('')
  const [commentActionMenuId, setCommentActionMenuId] = useState<number | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null)
  const [editingCommentText, setEditingCommentText] = useState('')
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({})
  const visibilityRatiosRef = useRef<Map<number, number>>(new Map())

  const isVideoUrl = (url?: string) => {
    if (!url) return false
    const clean = url.toLowerCase().split('?')[0].split('#')[0]
    return ['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv', '.3gp', '.m3u8'].some((ext) =>
      clean.endsWith(ext)
    )
  }

  const toMediaUrl = (url?: string) => {
    if (!url) return ''
    if (url.startsWith('data:')) return url

    if (typeof window !== 'undefined') {
      const uploadsIndex = url.indexOf('/uploads/')
      if (uploadsIndex >= 0) {
        return url.slice(uploadsIndex)
      }
    }

    if (url.startsWith('http://') || url.startsWith('https://')) return url
    if (url.startsWith('uploads/')) return `/${url}`
    return url
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

  const normalizeVibes = (raw: any[]): Moment[] => {
    return raw
      .map((v) => {
        const inferredUserId = Number(v.user_id || v.author_id || v.author?.id || 0) || 0
        const hasAuthorFromBackend = Boolean(v.author && (v.author.username || v.author.full_name || v.author.id))
        const author = hasAuthorFromBackend
          ? {
              id: Number(v.author.id || inferredUserId),
              full_name: String(v.author.full_name || v.author.name || 'Usuario'),
              username: String(v.author.username || `user${inferredUserId || ''}`),
              email: String(v.author.email || ''),
              avatar_url: v.author.avatar_url,
              is_online: Boolean(v.author.is_online),
              is_visible_nearby: Boolean(v.author.is_visible_nearby),
              created_at: v.author.created_at || v.created_at,
            }
          : {
              id: inferredUserId,
              full_name: String(v.full_name || v.name || 'Usuario'),
              username: String(v.username || `user${inferredUserId || ''}`),
              email: '',
              avatar_url: v.avatar_url,
              is_online: false,
              is_visible_nearby: false,
              created_at: v.created_at,
            }

        return {
          id: v.id,
          author_id: inferredUserId,
          author,
          content: v.content || v.description || v.caption || 'Vibe',
          media_url: v.media_url || v.video_url,
          likes_count: Number(v.likes_count || 0),
          comments_count: Number(v.comments_count || 0),
          is_liked: Boolean(v.is_liked),
          created_at: v.created_at,
        }
      })
      .filter((v) => isVideoUrl(v.media_url))
  }

  useEffect(() => {
    loadVibes()
  }, [])

  useEffect(() => {
    if (vibes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const element = entry.target as HTMLVideoElement
          const id = Number(element.dataset.vibeId)
          if (!Number.isNaN(id)) {
            visibilityRatiosRef.current.set(id, entry.intersectionRatio)
          }
        })

        let activeId: number | null = null
        let bestRatio = 0

        visibilityRatiosRef.current.forEach((ratio, id) => {
          if (ratio > bestRatio) {
            bestRatio = ratio
            activeId = id
          }
        })

        vibes.forEach((vibe) => {
          const video = videoRefs.current[vibe.id]
          if (!video) return

          const shouldPlay = activeId === vibe.id && bestRatio >= 0.65
          if (shouldPlay) {
            const playPromise = video.play()
            if (playPromise && typeof playPromise.catch === 'function') {
              playPromise.catch(() => undefined)
            }
          } else {
            video.pause()
          }
        })
      },
      {
        threshold: [0.25, 0.5, 0.65, 0.85],
      }
    )

    vibes.forEach((vibe) => {
      const video = videoRefs.current[vibe.id]
      if (video) {
        observer.observe(video)
      }
    })

    return () => observer.disconnect()
  }, [vibes])

  const loadVibes = async () => {
    try {
      setLoading(true)
      const response = await apiClient.getVibes(1, 50)
      const list = Array.isArray(response.data) ? response.data : response.data?.data || []
      setVibes(normalizeVibes(list))
    } catch (error) {
      toast.error('Erro ao carregar vibes')
    } finally {
      setLoading(false)
    }
  }

  const handleLikeVibe = async (vibeId: number) => {
    try {
      await apiClient.toggleContentLike('vibe', vibeId)
      setVibes(
        vibes.map((v) =>
          v.id === vibeId
            ? {
                ...v,
                is_liked: !v.is_liked,
                likes_count: v.is_liked ? v.likes_count - 1 : v.likes_count + 1,
              }
            : v
        )
      )
    } catch (error) {
      toast.error('Erro ao curtir vibe')
    }
  }

  const handleOpenVibeActions = (vibeId: number) => {
    setVibeActionMenuId((prev) => (prev === vibeId ? null : vibeId))
  }

  const handleStartEditVibe = (vibe: Moment) => {
    setEditingVibeId(vibe.id)
    setEditingVibeCaption(vibe.content || '')
    setVibeActionMenuId(null)
  }

  const handleSaveVibeEdit = async (vibeId: number) => {
    try {
      await apiClient.updateVibe(vibeId, editingVibeCaption.trim())
      setVibes((prev) => prev.map((item) => (
        item.id === vibeId ? { ...item, content: editingVibeCaption.trim() } : item
      )))
      setEditingVibeId(null)
      setEditingVibeCaption('')
      toast.success('Vibe atualizado')
    } catch {
      toast.error('Erro ao editar vibe')
    }
  }

  const handleDeleteVibe = async (vibeId: number) => {
    if (!window.confirm('Deseja excluir este vibe?')) return
    try {
      await apiClient.deleteVibe(vibeId)
      setVibes((prev) => prev.filter((item) => item.id !== vibeId))
      setVibeActionMenuId(null)
      if (selectedVibeForComments?.id === vibeId) {
        closeVibeCommentsModal()
      }
      toast.success('Vibe excluído')
    } catch {
      toast.error('Erro ao excluir vibe')
    }
  }

  const handleCommentVibe = async (vibeId: number) => {
    const targetVibe = vibes.find((vibe) => vibe.id === vibeId)
    if (!targetVibe) return

    setSelectedVibeForComments(targetVibe)
    setNewVibeCommentText('')
    setVibeCommentsLoading(true)

    try {
      const response = await apiClient.getContentComments('vibe', vibeId)
      const list = Array.isArray(response.data) ? response.data : []
      setVibeComments(list)
    } catch (error) {
      setVibeComments([])
      toast.error('Erro ao carregar comentários')
    } finally {
      setVibeCommentsLoading(false)
    }
  }

  const refreshVibeComments = async (vibeId: number) => {
    try {
      const response = await apiClient.getContentComments('vibe', vibeId)
      const list = Array.isArray(response.data) ? response.data : []
      setVibeComments(list)
    } catch {
      // Silent refresh failure.
    }
  }

  const closeVibeCommentsModal = () => {
    setSelectedVibeForComments(null)
    setVibeComments([])
    setNewVibeCommentText('')
    setVibeCommentsLoading(false)
    setReplyToVibeCommentId(null)
  }

  const submitVibeComment = async () => {
    if (!selectedVibeForComments) return
    const text = newVibeCommentText.trim()
    if (!text) return

    try {
      await apiClient.addContentComment('vibe', selectedVibeForComments.id, text)
      setVibes((prev) => prev.map((vibe) =>
        vibe.id === selectedVibeForComments.id
          ? { ...vibe, comments_count: (vibe.comments_count || 0) + 1 }
          : vibe
      ))

      await refreshVibeComments(selectedVibeForComments.id)
      setNewVibeCommentText('')
      setReplyToVibeCommentId(null)
    } catch (error) {
      toast.error('Erro ao comentar')
    }
  }

  const submitReplyToVibeComment = async () => {
    if (!selectedVibeForComments || !replyToVibeCommentId) return
    const text = newVibeCommentText.trim()
    if (!text) return

    try {
      await apiClient.addContentComment('vibe', selectedVibeForComments.id, text, replyToVibeCommentId)
      setVibes((prev) => prev.map((vibe) =>
        vibe.id === selectedVibeForComments.id
          ? { ...vibe, comments_count: (vibe.comments_count || 0) + 1 }
          : vibe
      ))

      await refreshVibeComments(selectedVibeForComments.id)
      setNewVibeCommentText('')
      setReplyToVibeCommentId(null)
    } catch (error) {
      toast.error('Erro ao responder comentário')
    }
  }

  const toggleLikeVibeComment = async (commentId: number) => {
    const target = vibeComments.find((comment) => comment.id === commentId)
    if (!target) return

    const optimisticLiked = !Boolean(target.is_liked)
    const optimisticCount = optimisticLiked
      ? Number(target.likes_count || 0) + 1
      : Math.max(0, Number(target.likes_count || 0) - 1)

    setVibeComments((prev) => prev.map((comment) =>
      comment.id === commentId
        ? { ...comment, is_liked: optimisticLiked, likes_count: optimisticCount }
        : comment
    ))

    try {
      await apiClient.toggleContentLike('comment', commentId)
    } catch (error) {
      setVibeComments((prev) => prev.map((comment) =>
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
      setVibeComments((prev) => prev.map((comment) => (
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
        vibeComments.forEach((comment) => {
          if (comment.parent_comment_id === current && !idsToRemove.has(comment.id)) {
            stack.push(comment.id)
          }
        })
      }

      setVibeComments((prev) => prev.filter((comment) => !idsToRemove.has(comment.id)))
      if (selectedVibeForComments) {
        setVibes((prev) => prev.map((vibe) => (
          vibe.id === selectedVibeForComments.id
            ? { ...vibe, comments_count: Math.max(0, (vibe.comments_count || 0) - idsToRemove.size) }
            : vibe
        )))
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
    if (!selectedVibeForComments) return

    const onCommentCreated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail
      if (detail?.content_type === 'vibe' && Number(detail?.content_id) === selectedVibeForComments.id) {
        refreshVibeComments(selectedVibeForComments.id)
      }
    }

    const onLikeUpdated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail
      if (detail?.content_type === 'comment' && detail?.parent_content_type === 'vibe' && Number(detail?.parent_content_id) === selectedVibeForComments.id) {
        refreshVibeComments(selectedVibeForComments.id)
      }
    }

    window.addEventListener('ello:ws:comment-created', onCommentCreated)
    window.addEventListener('ello:ws:content-like-updated', onLikeUpdated)

    return () => {
      window.removeEventListener('ello:ws:comment-created', onCommentCreated)
      window.removeEventListener('ello:ws:content-like-updated', onLikeUpdated)
    }
  }, [selectedVibeForComments])

  const extractActiveMentionQuery = (text: string) => {
    const match = text.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/)
    return match ? match[1] : null
  }

  const mentionCandidates: MentionCandidate[] = (() => {
    const byUsername = new Map<string, MentionCandidate>()

    const owner = selectedVibeForComments?.author
    if (owner?.id && owner?.username) {
      byUsername.set(owner.username.toLowerCase(), { id: owner.id, username: owner.username })
    }

    vibeComments.forEach((comment) => {
      if (comment.author?.id && comment.author?.username) {
        byUsername.set(comment.author.username.toLowerCase(), {
          id: comment.author.id,
          username: comment.author.username,
        })
      }
    })

    return Array.from(byUsername.values())
  })()

  const activeMentionQuery = extractActiveMentionQuery(newVibeCommentText)
  const filteredMentionCandidates =
    activeMentionQuery === null
      ? []
      : mentionCandidates
          .filter((candidate) => candidate.username.toLowerCase().startsWith(activeMentionQuery.toLowerCase()))
          .slice(0, 6)

  const applyMention = (username: string) => {
    setNewVibeCommentText((prev) =>
      prev.replace(/(?:^|\s)@[a-zA-Z0-9._-]*$/, (token) => {
        const hasLeadingSpace = token.startsWith(' ')
        return `${hasLeadingSpace ? ' ' : ''}@${username} `
      })
    )
  }

  const inferMediaType = (mime: string, url: string) => {
    if (mime.startsWith('video/') || isVideoUrl(url)) return 'video'
    return 'image'
  }

  const inferMediaFilename = (url: string, mediaType: 'image' | 'video') => {
    const clean = url.split('?')[0].split('#')[0]
    const last = clean.split('/').pop() || ''
    if (last.trim().length > 0) return last
    return mediaType === 'video' ? `vibe-share-${Date.now()}.mp4` : `vibe-share-${Date.now()}.jpg`
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
          avatarUrl: toMediaUrl(item.other_user?.avatar_url),
        }))
        .filter((item: ConversationOption) => Number.isFinite(item.userId) && item.userId > 0)

      setShareConversations(mapped)
      if (mapped.length > 0) setSelectedShareRecipientId(mapped[0].userId)
    } catch {
      toast.error('Erro ao carregar conversas')
      setShareConversations([])
      setSelectedShareRecipientId(null)
    }
  }

  const openShareDecision = (vibeId: number) => {
    const target = vibes.find((item) => item.id === vibeId)
    if (!target?.media_url) return
    setShareDraft({
      mediaUrl: toMediaUrl(target.media_url),
      caption: target.content || '',
      sourceAuthor: {
        id: target.author?.id,
        username: target.author?.username,
        fullName: target.author?.full_name,
        avatarUrl: toMediaUrl(target.author?.avatar_url),
      },
    })
    setShareCaptionDraft(target.content || '')
    setShareDestination(null)
    setSelectedShareRecipientId(null)
    setShareRecipientQuery('')
    setFailedShareAvatarIds({})
    void loadShareConversations()
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

  const buildShareCreditText = (caption: string, sourceAuthor?: ShareDraft['sourceAuthor']) => {
    const creditSource = sourceAuthor?.username
      ? `Compartilhado de @${sourceAuthor.username}`
      : sourceAuthor?.fullName
        ? `Compartilhado de ${sourceAuthor.fullName}`
        : 'Compartilhado via ℯ𝓁𝓁ℴ'

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

    const sourceUrl = toMediaUrl(shareDraft.mediaUrl)
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
    const uploadedUrl = toMediaUrl(uploadResponse?.data?.url)
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
          toast.error('Selecione uma conversa')
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
      toast.error(error instanceof Error ? error.message : 'Erro ao compartilhar vibe')
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

  const handleExternalShare = () => {
    if (!shareDraft) return
    const text = [shareCaptionDraft.trim(), shareDraft.mediaUrl].filter(Boolean).join(' ')
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  const handleNativeShare = async () => {
    if (!shareDraft) return
    if (typeof navigator.share !== 'function') {
      await handleCopyShareLink()
      return
    }

    try {
      await navigator.share({
        title: 'ℯ𝓁𝓁ℴ',
        text: shareCaptionDraft.trim() || 'Confira esta publicacao no ℯ𝓁𝓁ℴ',
        url: shareDraft.mediaUrl,
      })
    } catch {
      // User canceled native share.
    }
  }

  const navigateToUserProfile = (userId?: number) => {
    if (!userId) return
    navigate(`/profile/${userId}`)
  }

  return (
    <div className="h-screen bg-slate-950 overflow-hidden">
      <div className="h-screen overflow-y-auto snap-y snap-mandatory">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : vibes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Nenhum vibe encontrado. Seja o primeiro a criar!</p>
          </div>
        ) : (
          <div>
            {vibes.map((vibe) => (
              <section key={vibe.id} className="snap-start h-screen">
                <div className="relative w-full h-full bg-black overflow-hidden">
                  <video
                    ref={(el) => {
                      videoRefs.current[vibe.id] = el
                    }}
                    data-vibe-id={vibe.id}
                    src={toMediaUrl(vibe.media_url)}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain bg-black"
                  />

                  {(vibe.author?.id || vibe.author_id) === user?.id && (
                    <div className="absolute top-3 right-3 z-20">
                      <button
                        onClick={() => handleOpenVibeActions(vibe.id)}
                        className="p-2 rounded-full bg-black/55 text-gray-200 hover:text-white hover:bg-black/75 transition"
                      >
                        <MoreVertical size={16} />
                      </button>
                      {vibeActionMenuId === vibe.id && (
                        <div className="absolute right-0 mt-2 min-w-[140px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
                          <button onClick={() => handleStartEditVibe(vibe)} className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 inline-flex items-center gap-2"><Pencil size={13} />Editar</button>
                          <button onClick={() => handleDeleteVibe(vibe.id)} className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-500/10 inline-flex items-center gap-2"><Trash2 size={13} />Excluir</button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-4">
                    <button
                      onClick={() => handleLikeVibe(vibe.id)}
                      className={`flex flex-col items-center gap-1 text-xs hover:text-primary transition ${
                        vibe.is_liked ? 'text-primary' : 'text-white'
                      }`}
                    >
                      <Heart size={20} fill={vibe.is_liked ? 'currentColor' : 'none'} />
                      <span>{vibe.likes_count}</span>
                    </button>
                    <button
                      onClick={() => handleCommentVibe(vibe.id)}
                      className="flex flex-col items-center gap-1 text-xs text-white hover:text-primary transition"
                    >
                      <MessageCircle size={20} />
                      <span>{vibe.comments_count}</span>
                    </button>
                    <button
                      onClick={() => openShareDecision(vibe.id)}
                      className="flex flex-col items-center gap-1 text-xs text-white hover:text-primary transition"
                    >
                      <Share2 size={20} />
                    </button>
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-4 pr-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
                    <div className="flex items-center gap-3 mb-2">
                      <button
                        onClick={() => navigateToUserProfile(vibe.author?.id || vibe.author_id)}
                        className="rounded-full"
                        title={`Ver perfil de @${vibe.author?.username || 'user'}`}
                      >
                        <img
                          src={vibe.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${vibe.author?.username || 'author'}`}
                          alt={vibe.author?.username || 'author'}
                          className="w-9 h-9 rounded-full object-cover"
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => navigateToUserProfile(vibe.author?.id || vibe.author_id)}
                          className="font-semibold text-white text-sm truncate hover:text-primary transition"
                        >
                          {vibe.author?.full_name || 'Usuario'}
                        </button>
                        <p className="text-xs text-gray-300 truncate">@{vibe.author?.username || 'user'}</p>
                        {vibe.location_label && (
                          <p className="text-xs text-gray-400 truncate">{formatShortLocation(vibe.location_label)}</p>
                        )}
                      </div>
                    </div>

                    {editingVibeId === vibe.id ? (
                      <div className="mb-3 space-y-2">
                        <textarea
                          value={editingVibeCaption}
                          onChange={(event) => setEditingVibeCaption(event.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-white/20 bg-black/60 p-2 text-sm text-white resize-none focus:outline-none focus:border-primary"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => { setEditingVibeId(null); setEditingVibeCaption('') }} className="text-xs text-gray-300 hover:text-white">Cancelar</button>
                          <button onClick={() => handleSaveVibeEdit(vibe.id)} className="text-xs px-3 py-1 rounded-lg bg-primary text-white hover:bg-primary/85">Salvar</button>
                        </div>
                      </div>
                    ) : (
                      vibe.content ? <p className="text-sm text-gray-100 mb-3 line-clamp-3 break-words">{vibe.content}</p> : null
                    )}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {shareDraft && (
        <div className="fixed inset-0 z-[130] bg-black/70 backdrop-blur-sm flex items-end justify-center" onClick={closeShareDecision}>
          <div className="w-full max-w-xl rounded-t-3xl border border-slate-700/60 border-b-0 bg-slate-900/95 px-4 pt-2 pb-4 sm:px-5" onClick={(event) => event.stopPropagation()}>
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
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
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
                        <span className={`relative inline-flex items-center justify-center w-16 h-16 rounded-full overflow-hidden bg-slate-700 text-white text-sm font-semibold ${isSelected ? 'ring-2 ring-primary/80 ring-offset-2 ring-offset-slate-900' : ''}`}>
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
                        <span className="mt-2 text-xs text-gray-200 leading-tight line-clamp-2 max-w-[76px]">{item.fullName}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 border-t border-slate-800 pt-3 grid grid-cols-5 gap-1.5">
              <button onClick={() => setShareDestination('story')} className="flex flex-col items-center gap-1 text-gray-200 hover:text-white transition-colors">
                <span className={`w-12 h-12 rounded-full inline-flex items-center justify-center ${shareDestination === 'story' ? 'bg-primary text-white' : 'bg-slate-800 text-gray-200'}`}><PlusCircle size={18} /></span>
                <span className="text-[11px] leading-tight text-center">Story</span>
              </button>
              <button onClick={handleExternalShare} className="flex flex-col items-center gap-1 text-gray-200 hover:text-white transition-colors">
                <span className="w-12 h-12 rounded-full inline-flex items-center justify-center bg-slate-800"><MessageCircle size={18} /></span>
                <span className="text-[11px] leading-tight text-center">WhatsApp</span>
              </button>
              <button onClick={handleExternalShare} className="flex flex-col items-center gap-1 text-gray-200 hover:text-white transition-colors">
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

            <div className="mt-4 flex justify-between items-center">
              <button onClick={closeShareDecision} className="h-9 px-3 inline-flex items-center rounded-full text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors duration-200">
                <span className="inline-flex items-center gap-2"><X size={14} />Cancelar</span>
              </button>
              <button onClick={handleConfirmShareDecision} disabled={!shareDestination || shareBusy || (shareDestination === 'chat' && !selectedShareRecipientId)} className="h-9 px-3 inline-flex items-center rounded-full text-xs font-medium text-primary hover:text-primary/80 transition-colors duration-200 disabled:opacity-50">
                <span className="inline-flex items-center gap-2"><Send size={14} />{shareBusy ? 'Enviando...' : 'Enviar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedVibeForComments && (
        <div
          className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeVibeCommentsModal}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-700/80 bg-slate-950/95 shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div>
                <h3 className="text-white font-semibold">Comentários</h3>
                <p className="text-xs text-gray-400">@{selectedVibeForComments.author?.username || 'user'}</p>
              </div>
              <button
                onClick={closeVibeCommentsModal}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800/90 text-gray-300 hover:text-white hover:bg-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 py-3 max-h-80 overflow-y-auto space-y-2">
              {vibeCommentsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : vibeComments.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum comentário ainda.</p>
              ) : (
                <>
                  {vibeComments
                    .filter((comment) => !comment.parent_comment_id)
                    .map((comment) => {
                      const replies = vibeComments.filter((reply) => reply.parent_comment_id === comment.id)
                      return (
                        <div key={comment.id} className="py-1.5 border-b border-slate-800/60 last:border-b-0">
                          <div className="flex items-start gap-2">
                            <img
                              src={comment.author?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.author?.username || comment.id}`}
                              alt={comment.author?.username || 'user'}
                              className="w-6 h-6 rounded-full object-cover mt-0.5"
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
                                  onClick={() => toggleLikeVibeComment(comment.id)}
                                  className={`text-[11px] transition ${comment.is_liked ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
                                >
                                  Curtir {Number(comment.likes_count || 0) > 0 ? `(${comment.likes_count})` : ''}
                                </button>
                                <button
                                  onClick={() => {
                                    setReplyToVibeCommentId(comment.id)
                                    if (comment.author?.username) {
                                      setNewVibeCommentText(`@${comment.author.username} `)
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
                                      <div className="absolute right-0 mt-1 min-w-[130px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-30">
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
                                        onClick={() => toggleLikeVibeComment(reply.id)}
                                        className={`text-[11px] transition ${reply.is_liked ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
                                      >
                                        Curtir {Number(reply.likes_count || 0) > 0 ? `(${reply.likes_count})` : ''}
                                      </button>
                                      <button
                                        onClick={() => {
                                          setReplyToVibeCommentId(reply.parent_comment_id || reply.id)
                                          if (reply.author?.username) {
                                            setNewVibeCommentText(`@${reply.author.username} `)
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
                                            <div className="absolute right-0 mt-1 min-w-[130px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-30">
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

            <div className="px-4 py-3 border-t border-slate-800 flex items-center gap-2">
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
                  value={newVibeCommentText}
                  onChange={(event) => setNewVibeCommentText(event.target.value)}
                  placeholder={replyToVibeCommentId ? 'Responder comentário... use @usuario' : 'Escreva um comentário... use @usuario'}
                  className="w-full h-10 bg-transparent px-2 text-sm text-white placeholder-gray-500 focus:outline-none"
                />
              </div>
              {replyToVibeCommentId && (
                <button
                  onClick={() => setReplyToVibeCommentId(null)}
                  className="text-xs text-gray-400 hover:text-white transition"
                >
                  cancelar
                </button>
              )}
              <button
                onClick={replyToVibeCommentId ? submitReplyToVibeComment : submitVibeComment}
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
