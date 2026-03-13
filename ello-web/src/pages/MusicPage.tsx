import { useEffect, useMemo, useState } from 'react'
import { Music2, Upload, Heart, RefreshCw, Search, MoreVertical, Pencil, Trash2, X, Play, Pause, Send, Link2, PlusCircle, MessageCircle, Share2 } from 'lucide-react'
import { useAuthStore } from '@store/authStore'
import apiClient from '@services/api'
import { toast } from 'react-hot-toast'
import { PlayerTrack, useMusicPlayerStore } from '@store/musicPlayerStore'
import { resolveMediaUrl } from '@/utils/mediaUrl'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
const MUSIC_CACHE_KEY = 'ello:cache:music:v1'

type MusicTrack = {
  id: number
  title: string
  artist: string
  audio_url: string
  album_cover?: string | null
  uploaded_by: number
  created_at: string
}

type FeedFilter = 'all' | 'mine' | 'favorites'
type ShareDestination = 'chat' | 'story' | 'moment' | 'vibe'
const FEED_FILTER_ORDER: FeedFilter[] = ['all', 'mine', 'favorites']

const isAudioFile = (file: File) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name)

export default function MusicPage() {
  const user = useAuthStore((state) => state.user)

  const [tracks, setTracks] = useState<MusicTrack[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [filter, setFilter] = useState<FeedFilter>('all')
  const [search, setSearch] = useState('')
  const [showPublisher, setShowPublisher] = useState(false)

  const [actionMenuTrackId, setActionMenuTrackId] = useState<number | null>(null)
  const [editingTrack, setEditingTrack] = useState<MusicTrack | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [editingArtist, setEditingArtist] = useState('')

  const [shareTrack, setShareTrack] = useState<MusicTrack | null>(null)
  const [shareDestination, setShareDestination] = useState<ShareDestination | null>(null)
  const [shareConversations, setShareConversations] = useState<Array<{ id: number; userId: number; username: string; fullName: string; avatarUrl: string }>>([])
  const [selectedRecipientId, setSelectedRecipientId] = useState<number | null>(null)
  const [shareRecipientQuery, setShareRecipientQuery] = useState('')
  const [failedShareAvatarIds, setFailedShareAvatarIds] = useState<Record<number, boolean>>({})
  const [shareBusy, setShareBusy] = useState(false)

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState(user?.full_name || user?.username || '')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [audioPreviewName, setAudioPreviewName] = useState('')
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null)

  const setQueue = useMusicPlayerStore((state) => state.setQueue)
  const playTrack = useMusicPlayerStore((state) => state.playTrack)
  const currentTrackId = useMusicPlayerStore((state) => state.currentTrackId)
  const isPlaying = useMusicPlayerStore((state) => state.isPlaying)
  const togglePlayPause = useMusicPlayerStore((state) => state.togglePlayPause)

  useEffect(() => {
    let hasHydratedCache = false
    try {
      const rawCache = window.sessionStorage.getItem(MUSIC_CACHE_KEY)
      if (rawCache) {
        const parsed = JSON.parse(rawCache)
        const cachedTracks = Array.isArray(parsed?.tracks) ? parsed.tracks : []
        const cachedFavorites = Array.isArray(parsed?.favoriteIds) ? parsed.favoriteIds : []
        if (cachedTracks.length > 0) {
          setTracks(cachedTracks)
          setFavoriteIds(new Set(cachedFavorites.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))))
          setLoading(false)
          hasHydratedCache = true
        }
      }
    } catch {
      // Ignore invalid cache.
    }
    void loadMusicPage(hasHydratedCache)
  }, [user?.id])

  useEffect(() => {
    if (tracks.length === 0) return
    try {
      window.sessionStorage.setItem(
        MUSIC_CACHE_KEY,
        JSON.stringify({ tracks, favoriteIds: Array.from(favoriteIds), ts: Date.now() })
      )
    } catch {
      // Ignore storage quota errors.
    }
  }, [tracks, favoriteIds])

  useEffect(() => {
    setArtist(user?.full_name || user?.username || '')
  }, [user?.full_name, user?.username])

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl)
      }
    }
  }, [coverPreviewUrl])

  const normalizeTrack = (raw: any): MusicTrack => ({
    id: Number(raw.id),
    title: String(raw.title || ''),
    artist: String(raw.artist || 'Artista Independente'),
    audio_url: String(raw.audio_url || ''),
    album_cover: raw.album_cover || null,
    uploaded_by: Number(raw.uploaded_by || raw.user_id || raw.owner_id || raw.user?.id || 0),
    created_at: String(raw.created_at || new Date().toISOString()),
  })

  const loadMusicPage = async (background = false) => {
    try {
      if (!background && tracks.length === 0) setLoading(true)
      const [feedRes, favRes] = await Promise.all([
        apiClient.getMusicFeed(1, 50),
        user?.id ? apiClient.getMusicFavorites(user.id) : Promise.resolve({ data: [] }),
      ])

      const feedList = Array.isArray(feedRes.data) ? feedRes.data : feedRes.data?.data || []
      const favoritesList = Array.isArray(favRes.data) ? favRes.data : favRes.data?.data || []

      const normalizedTracks = feedList.map(normalizeTrack)
      const normalizedFavoriteIds = new Set<number>(
        favoritesList.map((item: any) => Number(item.id)).filter((id: number) => Number.isFinite(id) && id > 0)
      )

      setTracks(normalizedTracks)
      setFavoriteIds(normalizedFavoriteIds)
    } catch {
      toast.error('Erro ao carregar músicas')
    } finally {
      if (!background || tracks.length === 0) setLoading(false)
    }
  }

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await loadMusicPage()
      toast.success('Feed de música atualizado')
    } finally {
      setRefreshing(false)
    }
  }

  const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!isAudioFile(file)) {
      toast.error('Selecione um arquivo de áudio válido')
      return
    }
    setAudioFile(file)
    setAudioPreviewName(file.name)
  }

  const handleCoverFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('A capa precisa ser uma imagem')
      return
    }

    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl)
    }

    setCoverFile(file)
    setCoverPreviewUrl(URL.createObjectURL(file))
  }

  const resetPublisher = () => {
    setTitle('')
    setAudioFile(null)
    setCoverFile(null)
    setAudioPreviewName('')
    if (coverPreviewUrl) {
      URL.revokeObjectURL(coverPreviewUrl)
      setCoverPreviewUrl(null)
    }
  }

  const handlePublish = async () => {
    const cleanTitle = title.trim()
    const cleanArtist = artist.trim() || (user?.full_name || user?.username || 'Artista Independente')

    if (!cleanTitle) {
      toast.error('Informe o título da música')
      return
    }

    if (!audioFile) {
      toast.error('Selecione um áudio para publicar')
      return
    }

    try {
      setPublishing(true)

      const audioUploadRes = await apiClient.uploadFile(audioFile)
      const audioUrl = resolveMediaUrl(audioUploadRes?.data?.url)
      if (!audioUrl) {
        throw new Error('Falha ao enviar o áudio')
      }

      let coverUrl: string | null = null
      if (coverFile) {
        const coverUploadRes = await apiClient.uploadFile(coverFile)
        coverUrl = resolveMediaUrl(coverUploadRes?.data?.url) || null
      }

      await apiClient.uploadMusic({
        title: cleanTitle,
        artist: cleanArtist,
        audio_url: audioUrl,
        album_cover: coverUrl,
      })

      await loadMusicPage()
      resetPublisher()
      toast.success('Música publicada com sucesso')
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao publicar música')
    } finally {
      setPublishing(false)
    }
  }

  const toggleFavorite = async (trackId: number) => {
    const wasFavorite = favoriteIds.has(trackId)
    const optimistic = new Set(favoriteIds)

    if (wasFavorite) optimistic.delete(trackId)
    else optimistic.add(trackId)

    setFavoriteIds(optimistic)

    try {
      if (wasFavorite) {
        await apiClient.removeMusicFavorite(trackId)
      } else {
        await apiClient.addMusicFavorite(trackId)
      }
    } catch {
      setFavoriteIds(new Set(favoriteIds))
      toast.error('Não foi possível atualizar favorito')
    }
  }

  const handleOpenActions = (trackId: number) => {
    setActionMenuTrackId((prev) => (prev === trackId ? null : trackId))
  }

  const toPlayerTrack = (track: MusicTrack): PlayerTrack => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    audioUrl: resolveMediaUrl(track.audio_url),
    coverUrl: track.album_cover ? resolveMediaUrl(track.album_cover) : null,
  })

  const handleStartEdit = (track: MusicTrack) => {
    setEditingTrack(track)
    setEditingTitle(track.title)
    setEditingArtist(track.artist)
    setActionMenuTrackId(null)
  }

  const handleSaveEdit = async () => {
    if (!editingTrack) return
    const titleValue = editingTitle.trim()
    const artistValue = editingArtist.trim()
    if (!titleValue || !artistValue) {
      toast.error('Título e artista são obrigatórios')
      return
    }

    try {
      await apiClient.updateMusic(editingTrack.id, { title: titleValue, artist: artistValue })
      setTracks((prev) => prev.map((item) => (
        item.id === editingTrack.id
          ? { ...item, title: titleValue, artist: artistValue }
          : item
      )))
      setEditingTrack(null)
      setEditingTitle('')
      setEditingArtist('')
      toast.success('Música atualizada')
    } catch {
      toast.error('Erro ao atualizar música')
    }
  }

  const handleDeleteTrack = async (trackId: number) => {
    if (!window.confirm('Deseja excluir esta música?')) return
    try {
      await apiClient.deleteMusic(trackId)
      setTracks((prev) => prev.filter((item) => item.id !== trackId))
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        next.delete(trackId)
        return next
      })
      setActionMenuTrackId(null)
      toast.success('Música excluída')
    } catch {
      toast.error('Erro ao excluir música')
    }
  }

  const getAudioDurationSeconds = async (audioUrl: string): Promise<number> => {
    return await new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl)
      audio.preload = 'metadata'
      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoaded)
        audio.removeEventListener('error', onError)
      }
      const onLoaded = () => {
        cleanup()
        resolve(Number(audio.duration || 0))
      }
      const onError = () => {
        cleanup()
        reject(new Error('Nao foi possivel ler duracao do audio'))
      }
      audio.addEventListener('loadedmetadata', onLoaded)
      audio.addEventListener('error', onError)
      audio.src = audioUrl
    })
  }

  const openShareMenu = async (track: MusicTrack) => {
    setShareTrack(track)
    setShareDestination(null)
    setActionMenuTrackId(null)
    setShareRecipientQuery('')
    setFailedShareAvatarIds({})
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
        .filter((item: any) => Number.isFinite(item.userId) && item.userId > 0)
      setShareConversations(mapped)
      setSelectedRecipientId(mapped[0]?.userId || null)
    } catch {
      setShareConversations([])
      setSelectedRecipientId(null)
    }
  }

  const closeShareMenu = () => {
    setShareTrack(null)
    setShareDestination(null)
    setShareConversations([])
    setSelectedRecipientId(null)
    setShareRecipientQuery('')
    setFailedShareAvatarIds({})
    setShareBusy(false)
  }

  const editTrackSwipeHandlers = useSwipeGesture({
    enabled: Boolean(editingTrack),
    threshold: 45,
    axisLockRatio: 1.25,
    directions: ['down'],
    onSwipe: () => setEditingTrack(null),
  })

  const shareMenuSwipeHandlers = useSwipeGesture({
    enabled: Boolean(shareTrack),
    threshold: 35,
    axisLockRatio: 1.2,
    directions: ['down'],
    onSwipe: closeShareMenu,
  })

  const handleConfirmShare = async () => {
    if (!shareTrack || !shareDestination) return
    setShareBusy(true)

    if (shareDestination === 'moment' || shareDestination === 'vibe') {
      toast.error('Arquivos MP3 nao podem ser compartilhados em Moments ou Vibes')
      setShareBusy(false)
      return
    }

    if (shareDestination === 'story') {
      try {
        const duration = await getAudioDurationSeconds(resolveMediaUrl(shareTrack.audio_url))
        if (duration > 30) {
          toast.error('Para stories, o áudio deve ter no máximo 30 segundos')
          setShareBusy(false)
          return
        }

        if (!shareTrack.album_cover) {
          toast.error('Para compartilhar no story, adicione capa na música')
          setShareBusy(false)
          return
        }

        await apiClient.createStory({
          media_url: resolveMediaUrl(shareTrack.album_cover),
          text: `${shareTrack.title} - ${shareTrack.artist}`,
        })
        window.dispatchEvent(new CustomEvent('ello:story-created'))
        toast.success('Compartilhado no story')
        closeShareMenu()
      } catch {
        toast.error('Erro ao compartilhar no story')
      } finally {
        setShareBusy(false)
      }
      return
    }

    if (shareDestination === 'chat') {
      if (!selectedRecipientId) {
        toast.error('Selecione um contato')
        setShareBusy(false)
        return
      }

      try {
        await apiClient.shareMusicToChat(selectedRecipientId, shareTrack.id)
        toast.success('Música compartilhada no chat')
        closeShareMenu()
      } catch {
        toast.error('Erro ao compartilhar no chat')
      } finally {
        setShareBusy(false)
      }
      return
    }

    setShareBusy(false)
  }

  const filteredShareConversations = useMemo(() => {
    const query = shareRecipientQuery.trim().toLowerCase()
    if (!query) return shareConversations
    return shareConversations.filter((item) => item.fullName.toLowerCase().includes(query) || item.username.toLowerCase().includes(query))
  }, [shareConversations, shareRecipientQuery])

  const getShareLink = () => {
    if (!shareTrack) return ''
    const trackUrl = `${window.location.origin}/music?track=${shareTrack.id}`
    return trackUrl
  }

  const handleCopyShareLink = async () => {
    const link = getShareLink()
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copiado')
    } catch {
      toast.error('Nao foi possivel copiar o link')
    }
  }

  const handleExternalShare = async (_status = false) => {
    if (!shareTrack) return
    const text = `${shareTrack.title} - ${shareTrack.artist} ${getShareLink()}`.trim()
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  const handleNativeShare = async () => {
    if (!shareTrack) return
    if (typeof navigator.share !== 'function') {
      await handleCopyShareLink()
      return
    }

    try {
      await navigator.share({
        title: ' Music',
        text: `${shareTrack.title} - ${shareTrack.artist}`,
        url: getShareLink(),
      })
    } catch {
      // User canceled native share.
    }
  }

  const visibleTracks = useMemo(() => {
    const lower = search.trim().toLowerCase()

    return tracks
      .filter((track) => {
        if (filter === 'mine' && track.uploaded_by !== user?.id) return false
        if (filter === 'favorites' && !favoriteIds.has(track.id)) return false
        if (!lower) return true
        return track.title.toLowerCase().includes(lower) || track.artist.toLowerCase().includes(lower)
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [tracks, filter, favoriteIds, search, user?.id])

  const filterSwipeHandlers = useSwipeGesture({
    enabled: !editingTrack && !shareTrack,
    threshold: 50,
    axisLockRatio: 1.25,
    ignoreFrom: 'input, textarea, select, [contenteditable="true"], [data-gesture-ignore="true"]',
    directions: ['left', 'right'],
    onSwipe: ({ direction }) => {
      const currentIndex = FEED_FILTER_ORDER.indexOf(filter)
      if (currentIndex < 0) return

      if (direction === 'left' && currentIndex < FEED_FILTER_ORDER.length - 1) {
        setFilter(FEED_FILTER_ORDER[currentIndex + 1])
        return
      }

      if (direction === 'right' && currentIndex > 0) {
        setFilter(FEED_FILTER_ORDER[currentIndex - 1])
      }
    },
  })

  const queueTracks = useMemo(() => visibleTracks.map(toPlayerTrack), [visibleTracks])

  useEffect(() => {
    // Do not clear global queue when the page is still loading or filtered to empty,
    // so playback keeps running while navigating and interacting.
    if (queueTracks.length === 0) return
    setQueue(queueTracks)
  }, [queueTracks, setQueue])

  const handlePlayFromCard = (track: MusicTrack) => {
    if (currentTrackId === track.id) {
      togglePlayPause()
      return
    }
    playTrack(toPlayerTrack(track), queueTracks)
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6 sm:p-8">
          <div className="pointer-events-none absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-cyan-500/15 blur-3xl" />

          <div className="relative flex flex-col gap-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary mb-3">
                <Music2 size={14} />
                Music para artistas independentes
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Publique sua música e ganhe visibilidade</h1>
              <p className="text-sm text-gray-300 mt-2 max-w-2xl">
                Espaço oficial da comunidade Ello Social, onde cantores independentes divulgam faixas autorais e alcançam novos ouvintes.
              </p>
              <div className="mt-4">
                <button
                  onClick={() => setShowPublisher((prev) => !prev)}
                  className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/85 transition inline-flex items-center gap-2"
                >
                  <Upload size={15} />
                  {showPublisher ? 'Ocultar formulário' : 'Adicionar música'}
                </button>
              </div>
            </div>

            {showPublisher && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <label className="block text-xs text-gray-400">Título da música</label>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ex.: Noites em São Paulo"
                    className="w-full h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                  />

                  <label className="block text-xs text-gray-400">Nome artístico</label>
                  <input
                    value={artist}
                    onChange={(event) => setArtist(event.target.value)}
                    placeholder="Seu nome artístico"
                    className="w-full h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-gray-200 cursor-pointer hover:border-primary/70 transition">
                      <span className="inline-flex items-center gap-2"><Upload size={14} /> Áudio</span>
                      <input type="file" accept="audio/*" className="hidden" onChange={handleAudioFileChange} />
                      <p className="mt-1 text-xs text-gray-500 truncate">{audioPreviewName || 'Selecionar arquivo de áudio'}</p>
                    </label>

                    <label className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-gray-200 cursor-pointer hover:border-primary/70 transition">
                      <span className="inline-flex items-center gap-2"><Upload size={14} /> Capa (opcional)</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleCoverFileChange} />
                      <p className="mt-1 text-xs text-gray-500 truncate">{coverFile?.name || 'Selecionar imagem da capa'}</p>
                    </label>
                  </div>

                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="h-11 px-5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/85 disabled:opacity-60 transition inline-flex items-center gap-2"
                  >
                    <Upload size={16} />
                    {publishing ? 'Publicando...' : 'Publicar Música'}
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                  <p className="text-xs text-gray-400 mb-3">Prévia da capa</p>
                  <div className="aspect-square rounded-xl overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center">
                    {coverPreviewUrl ? (
                      <img src={coverPreviewUrl} alt="preview capa" className="w-full h-full object-cover" />
                    ) : (
                      <Music2 size={28} className="text-slate-600" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4" {...filterSwipeHandlers}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              {([
                { id: 'all', label: 'Descobrir' },
                { id: 'mine', label: 'Minhas Publicações' },
                { id: 'favorites', label: 'Favoritas' },
              ] as Array<{ id: FeedFilter; label: string }>).map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFilter(item.id)}
                  className={`h-9 px-3 rounded-full text-xs font-medium transition ${filter === item.id ? 'bg-primary text-white' : 'bg-slate-800 text-gray-300 hover:bg-slate-700'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="h-9 px-3 rounded-full border border-slate-700 bg-slate-950 inline-flex items-center gap-2">
                <Search size={14} className="text-gray-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar música ou artista"
                  className="bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none"
                />
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="h-9 px-3 rounded-full bg-slate-800 text-gray-200 hover:bg-slate-700 text-xs inline-flex items-center gap-2 transition"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
          ) : visibleTracks.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">Nenhuma música encontrada para este filtro.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleTracks.map((track) => {
                const isFavorite = favoriteIds.has(track.id)
                const isOwner = Number(track.uploaded_by) === Number(user?.id)
                const isCurrent = currentTrackId === track.id
                const isCurrentPlaying = isCurrent && isPlaying

                return (
                  <article key={track.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 overflow-hidden">
                    <div className="aspect-[16/9] bg-slate-900 relative">
                      {track.album_cover ? (
                        <img src={resolveMediaUrl(track.album_cover)} alt={track.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
                          <Music2 size={30} className="text-slate-600" />
                        </div>
                      )}
                      <button
                        onClick={() => toggleFavorite(track.id)}
                        className={`absolute top-3 right-3 h-8 w-8 rounded-full border backdrop-blur-sm inline-flex items-center justify-center transition ${isFavorite ? 'bg-primary/90 border-primary text-white' : 'bg-black/40 border-white/20 text-gray-200 hover:text-white'}`}
                        title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      >
                        <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
                      </button>
                      <div className="absolute top-3 left-3">
                        <button
                          onClick={() => handleOpenActions(track.id)}
                          className="h-8 w-8 rounded-full border border-white/20 bg-black/40 text-gray-200 hover:text-white inline-flex items-center justify-center transition"
                          title="Ações"
                        >
                          <MoreVertical size={14} />
                        </button>
                        {actionMenuTrackId === track.id && (
                          <div className="absolute left-0 mt-1 min-w-[160px] rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden z-20">
                            <button onClick={() => openShareMenu(track)} className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 inline-flex items-center gap-2">Compartilhar</button>
                            {isOwner && <button onClick={() => handleStartEdit(track)} className="w-full px-3 py-2 text-xs text-left text-gray-200 hover:bg-slate-800 inline-flex items-center gap-2"><Pencil size={12} />Editar</button>}
                            {isOwner && <button onClick={() => handleDeleteTrack(track.id)} className="w-full px-3 py-2 text-xs text-left text-red-300 hover:bg-red-500/10 inline-flex items-center gap-2"><Trash2 size={12} />Excluir</button>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div>
                        <h3 className="text-white font-semibold line-clamp-1">{track.title}</h3>
                        <p className="text-xs text-gray-400 line-clamp-1">{track.artist}</p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Publicado em {new Date(track.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>

                      <button
                        onClick={() => handlePlayFromCard(track)}
                        className="h-10 px-3 rounded-lg bg-slate-800 text-gray-100 hover:bg-slate-700 text-xs inline-flex items-center gap-2 transition"
                      >
                        {isCurrentPlaying ? <Pause size={14} /> : <Play size={14} />}
                        {isCurrentPlaying ? 'Pausar' : isCurrent ? 'Retomar' : 'Tocar'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {editingTrack && (
          <div
            className="fixed inset-0 z-[160] bg-black/70 flex items-center justify-center p-4"
            onClick={() => setEditingTrack(null)}
            {...editTrackSwipeHandlers}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3"
              onClick={(event) => event.stopPropagation()}
              data-gesture-ignore="true"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">Editar música</h3>
                <button onClick={() => setEditingTrack(null)} className="text-gray-400 hover:text-white"><X size={16} /></button>
              </div>
              <input value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} placeholder="Título" className="w-full h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:outline-none focus:border-primary" />
              <input value={editingArtist} onChange={(event) => setEditingArtist(event.target.value)} placeholder="Artista" className="w-full h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white focus:outline-none focus:border-primary" />
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setEditingTrack(null)} className="text-xs text-gray-400 hover:text-white">Cancelar</button>
                <button onClick={handleSaveEdit} className="text-xs px-3 py-1 rounded bg-primary text-white hover:bg-primary/85">Salvar</button>
              </div>
            </div>
          </div>
        )}

        {shareTrack && (
          <div
            className="fixed inset-0 z-[260] bg-black/70 backdrop-blur-sm flex items-end justify-center"
            onClick={closeShareMenu}
            {...shareMenuSwipeHandlers}
          >
            <div
              className="w-full max-w-xl rounded-t-3xl border border-slate-700/60 border-b-0 bg-slate-900/95 px-4 pt-2 pb-4 sm:px-5"
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
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                    {filteredShareConversations.slice(0, 15).map((item) => {
                      const isSelected = shareDestination === 'chat' && selectedRecipientId === item.userId
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setShareDestination('chat')
                            setSelectedRecipientId(item.userId)
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

              <div className="mt-4 flex justify-between items-center">
                <button onClick={closeShareMenu} className="h-9 px-3 inline-flex items-center rounded-full text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors duration-200">
                  <span className="inline-flex items-center gap-2"><X size={14} />Cancelar</span>
                </button>
                <button
                  onClick={handleConfirmShare}
                  disabled={!shareDestination || shareBusy || (shareDestination === 'chat' && !selectedRecipientId)}
                  className="h-9 px-3 inline-flex items-center rounded-full text-xs font-medium text-primary hover:text-primary/80 transition-colors duration-200 disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2"><Send size={14} />{shareBusy ? 'Enviando...' : 'Enviar'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

