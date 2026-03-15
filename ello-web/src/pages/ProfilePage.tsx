import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@store/authStore'
import apiClient from '@services/api'
import { toast } from 'react-hot-toast'
import type { User, Moment } from '@/types'
import { UserPlus, UserCheck, MessageCircle, Share2, MapPin, Link as LinkIcon, Calendar, Settings, Grid3x3, Sparkles, Music, Bookmark, X, Briefcase, Play, Heart } from 'lucide-react'
import { resolveMediaUrl } from '@/utils/mediaUrl'
import { getMoodAvatarRingStyle } from '@/utils/mood'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
const PROFILE_CACHE_PREFIX = 'ello:cache:profile:v1:'
const PROFILE_TAB_ORDER: Array<'moments' | 'vibes' | 'musica' | 'salvos'> = ['moments', 'vibes', 'musica', 'salvos']

interface EditFormData {
  full_name: string
  bio?: string
  location?: string
  link?: string
  category?: string
}

export default function ProfilePage() {
  const { userId } = useParams<{ userId?: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.user)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [moments, setMoments] = useState<Moment[]>([])
  const [vibes, setVibes] = useState<Moment[]>([])
  const [activeTab, setActiveTab] = useState<'moments' | 'vibes' | 'musica' | 'salvos'>('moments')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editFormData, setEditFormData] = useState<EditFormData>({
    full_name: '',
    bio: '',
    location: '',
    link: '',
    category: '',
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [isFollowLoading, setIsFollowLoading] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Moment | null>(null)
  const profileCacheKey = `${PROFILE_CACHE_PREFIX}${userId || 'me'}`

  useEffect(() => {
    let hasHydratedCache = false
    try {
      const rawCache = window.sessionStorage.getItem(profileCacheKey)
      if (rawCache) {
        const parsed = JSON.parse(rawCache)
        if (parsed?.user) {
          setUser(parsed.user)
          setFollowers(Number(parsed.followers || 0))
          setFollowing(Number(parsed.following || 0))
          setMoments(Array.isArray(parsed.moments) ? parsed.moments : [])
          setVibes(Array.isArray(parsed.vibes) ? parsed.vibes : [])
          setIsFollowing(Boolean(parsed.isFollowing))
          setLoading(false)
          hasHydratedCache = true
        }
      }
    } catch {
      // Ignore corrupted cache and keep network as source of truth.
    }

    void loadProfile({ background: hasHydratedCache })
  }, [userId, currentUser?.id])

  useEffect(() => {
    const refreshProfileContent = () => {
      loadProfile({ background: true })
    }

    window.addEventListener('ello:moment-created', refreshProfileContent)
    window.addEventListener('ello:ws:moment-created', refreshProfileContent as EventListener)

    return () => {
      window.removeEventListener('ello:moment-created', refreshProfileContent)
      window.removeEventListener('ello:ws:moment-created', refreshProfileContent as EventListener)
    }
  }, [userId, currentUser?.id])

  const isVideoUrl = (url?: string) => {
    if (!url) return false
    const clean = url.toLowerCase().split('?')[0].split('#')[0]
    return ['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv', '.3gp', '.m3u8'].some((ext) => clean.endsWith(ext))
  }

  const normalizeMoments = (raw: any[]): Moment[] => {
    return raw.map((m) => ({
      id: m.id,
      author_id: m.author_id || m.user_id,
      author: m.author || {
        id: m.user_id,
        full_name: 'Usuario',
        username: `user${m.user_id}`,
        email: '',
        is_online: false,
        is_visible_nearby: false,
        created_at: m.created_at,
      },
      content: m.content || '',
      media_url: m.media_url,
      likes_count: Number(m.likes_count || 0),
      comments_count: Number(m.comments_count || 0),
      is_liked: Boolean(m.is_liked),
      created_at: m.created_at,
    }))
  }

  const loadProfile = async (options?: { background?: boolean }) => {
    const isBackgroundRefresh = Boolean(options?.background)

    try {
      if (!isBackgroundRefresh && !user) {
        setLoading(true)
      }
      let profileUser
      
      // Se há um userId na URL, buscar esse usuário específico
      // Senão, buscar o usuário logado
      if (userId && userId !== 'me') {
        profileUser = await apiClient.getUser(userId)
      } else {
        profileUser = await apiClient.getCurrentUser()
      }
      
      if (!profileUser) {
        console.error('Perfil não encontrado para o ID solicitado:', userId ?? 'me')
        toast.error('Usuário não encontrado')
        return
      }

      setUser(profileUser)

      // Load follower counts + user publications
      const [followersResponse, followingResponse, momentsResponse] = await Promise.all([
        apiClient.getFollowers(profileUser.id),
        apiClient.getFollowing(profileUser.id),
        apiClient.getMoments(1, 80),
      ])

      setFollowers(followersResponse.data?.length || 0)
      setFollowing(followingResponse.data?.length || 0)

      const rawMoments = Array.isArray(momentsResponse.data) ? momentsResponse.data : momentsResponse.data?.data || []
      const normalized = normalizeMoments(rawMoments)
      const userMoments = normalized.filter((m) => (m.author?.id || m.author_id) === profileUser.id)
      const userMediaMoments = userMoments.filter((m) => Boolean(m.media_url))
      const userVibes = userMediaMoments.filter((m) => isVideoUrl(m.media_url))
      const userPhotoMoments = userMediaMoments.filter((m) => !isVideoUrl(m.media_url))

      // Profile mirrors only media publications:
      // - Moments tab: photos only
      // - Vibes tab: videos only
      setMoments(userPhotoMoments)
      setVibes(userVibes)

      // Check if current user is following this profile user
      if (userId && userId !== 'me' && currentUser && currentUser.id !== profileUser.id) {
        void (async () => {
          try {
            const currentUserFollowingResponse = await apiClient.getFollowing(currentUser.id)
            const isFollowingThisUser = currentUserFollowingResponse.data?.some(
              (user: any) => user.id === profileUser.id
            )
            setIsFollowing(isFollowingThisUser || false)
          } catch (err) {
            console.error('Erro ao verificar status de follow:', err)
            setIsFollowing(false)
          }
        })()
      }

      try {
        window.sessionStorage.setItem(
          profileCacheKey,
          JSON.stringify({
            user: profileUser,
            followers: followersResponse.data?.length || 0,
            following: followingResponse.data?.length || 0,
            moments: userPhotoMoments,
            vibes: userVibes,
            isFollowing,
            ts: Date.now(),
          })
        )
      } catch {
        // Ignore storage quota errors.
      }

    } catch (error) {
      console.error('Erro ao carregar perfil:', error)
      toast.error('Erro ao carregar perfil')
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false)
      }
    }
  }

  const handleFollowClick = async () => {
    if (!user) return

    try {
      setIsFollowLoading(true)
      if (isFollowing) {
        await apiClient.unfollowUser(user.id)
        setIsFollowing(false)
        toast.success('Deixou de seguir')
      } else {
        await apiClient.followUser(user.id)
        setIsFollowing(true)
        toast.success('Agora você segue')
      }
      
      // Recarregar os dados de followers/following após a ação
      const followersResponse = await apiClient.getFollowers(user.id)
      setFollowers(followersResponse.data?.length || 0)
      
      if (currentUser) {
        const followingResponse = await apiClient.getFollowing(currentUser.id)
        setFollowing(followingResponse.data?.length || 0)
      }
    } catch (error) {
      console.error('Erro ao seguir:', error)
      toast.error('Erro ao seguir usuário')
      // Recarregar status em caso de erro também
      loadProfile()
    } finally {
      setIsFollowLoading(false)
    }
  }

  const handleOpenEditModal = () => {
    if (user) {
      setEditFormData({
        full_name: user.full_name,
        bio: user.bio || '',
        location: user.location || '',
        link: user.link || '',
        category: user.category || '',
      })
      setAvatarFile(null)
      setAvatarPreview(user.avatar_url || '')
      setShowEditModal(true)
    }
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      // Criar preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSaveProfile = async () => {
    if (!user) return

    try {
      setIsSaving(true)
      
      // Preparar dados para envio
      const updateData: any = {
        full_name: editFormData.full_name,
        bio: editFormData.bio,
        location: editFormData.location,
        link: editFormData.link,
        category: editFormData.category,
      }

      // Se há novo avatar (usando data URL por enquanto)
      if (avatarFile && avatarPreview) {
        updateData.avatar_url = avatarPreview
      }

      const response = await apiClient.updateProfile(updateData)

      // Atualizar user local
      setUser({
        ...user,
        full_name: editFormData.full_name,
        bio: editFormData.bio,
        location: editFormData.location,
        link: editFormData.link,
        category: editFormData.category,
        avatar_url: updateData.avatar_url || user.avatar_url,
      })

      // Atualizar Zustand store
      useAuthStore.setState({ 
        user: {
          ...response.data,
          avatar_url: updateData.avatar_url || response.data.avatar_url,
        } as User
      })
      
      setShowEditModal(false)
      setAvatarFile(null)
      toast.success('Perfil atualizado com sucesso!')
    } catch (error) {
      console.error('Erro ao salvar perfil:', error)
      toast.error('Erro ao salvar perfil')
    } finally {
      setIsSaving(false)
    }
  }

  const closePostModal = () => setSelectedPost(null)

  const profileContentSwipeHandlers = useSwipeGesture({
    enabled: !selectedPost && !showEditModal,
    threshold: 50,
    axisLockRatio: 1.25,
    ignoreFrom: 'input, textarea, select, [contenteditable="true"], [data-gesture-ignore="true"]',
    directions: ['left', 'right'],
    onSwipe: ({ direction }) => {
      const currentIndex = PROFILE_TAB_ORDER.indexOf(activeTab)
      if (currentIndex < 0) return

      if (direction === 'left' && currentIndex < PROFILE_TAB_ORDER.length - 1) {
        setActiveTab(PROFILE_TAB_ORDER[currentIndex + 1])
        return
      }

      if (direction === 'right' && currentIndex > 0) {
        setActiveTab(PROFILE_TAB_ORDER[currentIndex - 1])
      }
    },
  })

  const selectedPostSwipeHandlers = useSwipeGesture({
    enabled: Boolean(selectedPost),
    threshold: 45,
    axisLockRatio: 1.25,
    directions: ['down'],
    onSwipe: closePostModal,
  })

  const editProfileSwipeHandlers = useSwipeGesture({
    enabled: showEditModal,
    threshold: 45,
    axisLockRatio: 1.25,
    directions: ['down'],
    onSwipe: () => setShowEditModal(false),
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Carregando perfil...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center">
        <p className="text-gray-400">Perfil não encontrado</p>
      </div>
    )
  }

  const isOwnProfile = Boolean(user && currentUser?.id === user.id)
  const activeItems = activeTab === 'moments' ? moments : activeTab === 'vibes' ? vibes : []

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Cover Banner */}
      <div className="relative h-44 sm:h-56 bg-gradient-to-r from-purple-600/20 via-blue-600/20 to-pink-600/20 border-b border-slate-800/50">
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"></div>
      </div>

      {/* Profile Container */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 pb-10 sm:pb-12">
        {/* Avatar Section */}
        <div className="relative -mt-20 sm:-mt-28 mb-6 sm:mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            {/* Avatar */}
            <div className="relative">
              <img
                src={user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username}
                alt={user.username}
                className="w-28 h-28 sm:w-40 sm:h-40 rounded-full border-4 border-slate-950 object-cover shadow-2xl"
                style={getMoodAvatarRingStyle(user.mood)}
              />
              {user.is_online && (
                <div className="absolute bottom-1 right-1 sm:bottom-4 sm:right-4 w-4 h-4 sm:w-5 sm:h-5 bg-green-500 rounded-full border-2 sm:border-4 border-slate-950 animate-pulse"></div>
              )}
            </div>

            {/* User Actions */}
            <div className="flex w-full flex-wrap sm:w-auto sm:flex-nowrap gap-2 sm:gap-3 sm:mt-0 sm:mb-4">
              {isOwnProfile ? (
                <button
                  onClick={handleOpenEditModal}
                  className="h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-slate-700 bg-slate-900/70 text-gray-200 hover:text-white hover:bg-slate-800 transition inline-flex items-center justify-center"
                  title="Configurar perfil"
                  aria-label="Configurar perfil"
                >
                  <Settings size={18} />
                </button>
              ) : (
                <>
                  <button
                    onClick={handleFollowClick}
                    disabled={isFollowLoading}
                    className={`flex-1 sm:flex-none min-w-[150px] sm:min-w-0 px-4 sm:px-6 py-2.5 rounded-full font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      isFollowing
                        ? 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'
                        : 'bg-primary text-white hover:bg-primary/80'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck size={18} />
                        Seguindo
                      </>
                    ) : (
                      <>
                        <UserPlus size={18} />
                        Seguir
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => navigate(`/chat/${user.id}`)}
                    className="h-10 w-10 sm:h-auto sm:w-auto sm:px-4 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-full transition inline-flex items-center justify-center"
                  >
                    <MessageCircle size={18} />
                  </button>
                  <button className="h-10 w-10 sm:h-auto sm:w-auto sm:px-4 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-full transition inline-flex items-center justify-center">
                    <Share2 size={18} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* User Info Section */}
        <div className="mb-7 sm:mb-8">
          <div className="mb-4">
            <h1 className="text-2xl sm:text-4xl font-bold text-white mb-1 break-words">{user.full_name}</h1>
            <p className="text-base sm:text-xl text-primary/80 mb-3 sm:mb-4 break-all">@{user.username}</p>

            {user.bio && (
              <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-4 max-w-2xl break-words">
                {user.bio}
              </p>
            )}

            {/* Meta Info */}
            <div className="flex flex-wrap gap-x-4 gap-y-3 sm:gap-6 text-gray-400 text-sm">
              {user.location && (
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin size={16} className="text-primary/60" />
                  <span className="break-words">{user.location}</span>
                </div>
              )}
              {user.category && (
                <div className="flex min-w-0 items-center gap-2">
                  <Briefcase size={16} className="text-primary/60" />
                  <span className="break-words">{user.category}</span>
                </div>
              )}
              {user.link && (
                <a
                  href={user.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 max-w-full items-center gap-2 hover:text-primary transition"
                >
                  <LinkIcon size={16} className="text-primary/60" />
                  <span className="break-all">{user.link}</span>
                </a>
              )}
              <div className="flex min-w-0 items-center gap-2">
                <Calendar size={16} className="text-primary/60" />
                Acesso em Mar 2026
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 sm:mt-8 flex items-start justify-between gap-3 sm:gap-6 overflow-x-auto pb-1">
            <div className="text-center min-w-[78px] flex-1">
              <p className="text-2xl sm:text-3xl font-bold text-primary leading-tight">{moments.length}</p>
              <p className="text-gray-400 text-xs sm:text-sm">Moments</p>
            </div>
            <div className="text-center min-w-[78px] flex-1">
              <p className="text-2xl sm:text-3xl font-bold text-primary leading-tight">{vibes.length}</p>
              <p className="text-gray-400 text-xs sm:text-sm">Vibes</p>
            </div>
            <div className="text-center min-w-[78px] flex-1">
              <p className="text-2xl sm:text-3xl font-bold text-primary leading-tight">{followers}</p>
              <p className="text-gray-400 text-xs sm:text-sm">Seguidores</p>
            </div>
            <div className="text-center min-w-[78px] flex-1">
              <p className="text-2xl sm:text-3xl font-bold text-primary leading-tight">{following}</p>
              <p className="text-gray-400 text-xs sm:text-sm">Seguindo</p>
            </div>
          </div>
        </div>

        {/* Tabs Section */}
        <div className="border-b border-slate-800/50">
          <div className="flex gap-4 sm:gap-8 mb-0 overflow-x-auto whitespace-nowrap pr-2">
            <button
              onClick={() => setActiveTab('moments')}
              className={`px-1.5 sm:px-2 py-3 sm:py-4 text-sm sm:text-base font-semibold transition border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                activeTab === 'moments'
                  ? 'text-primary border-primary'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Grid3x3 size={18} />
              Moments
            </button>
            <button
              onClick={() => setActiveTab('vibes')}
              className={`px-1.5 sm:px-2 py-3 sm:py-4 text-sm sm:text-base font-semibold transition border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                activeTab === 'vibes'
                  ? 'text-primary border-primary'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Sparkles size={18} />
              Vibes
            </button>
            <button
              onClick={() => setActiveTab('musica')}
              className={`px-1.5 sm:px-2 py-3 sm:py-4 text-sm sm:text-base font-semibold transition border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                activeTab === 'musica'
                  ? 'text-primary border-primary'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Music size={18} />
               Música
            </button>
            <button
              onClick={() => setActiveTab('salvos')}
              className={`px-1.5 sm:px-2 py-3 sm:py-4 text-sm sm:text-base font-semibold transition border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap ${
                activeTab === 'salvos'
                  ? 'text-primary border-primary'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Bookmark size={18} />
              Salvos
            </button>
          </div>
        </div>

        {/* Content Grid */}
        <div className="mt-6 sm:mt-8" {...profileContentSwipeHandlers}>
          {activeItems.length === 0 ? (
            <div className="text-center py-12 sm:py-16">
              <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
                {activeTab === 'moments' ? (
                  <Grid3x3 size={32} className="text-gray-600" />
                ) : activeTab === 'vibes' ? (
                  <Sparkles size={32} className="text-gray-600" />
                ) : activeTab === 'musica' ? (
                  <Music size={32} className="text-gray-600" />
                ) : (
                  <Bookmark size={32} className="text-gray-600" />
                )}
              </div>
              <p className="text-gray-400 text-base sm:text-lg mb-2">
                {activeTab === 'moments'
                  ? 'Nenhum moment ainda'
                  : activeTab === 'vibes'
                  ? 'Nenhum vibe ainda'
                  : activeTab === 'musica'
                   ? 'Nenhuma música ainda'
                   : 'Nenhum conteúdo salvo ainda'}
              </p>
              <p className="text-gray-500 text-sm">
                {isOwnProfile
                  ? 'Comece a compartilhar seus momentos!'
                   : 'Este usuário ainda não compartilhou nada'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {activeItems.map((moment) => (
                <button
                  key={moment.id}
                  type="button"
                  onClick={() => setSelectedPost(moment)}
                  className="group relative aspect-square w-full overflow-hidden rounded-lg sm:rounded-xl border border-slate-800/80 bg-slate-900/70 hover:border-slate-600 transition"
                >
                  {moment.media_url ? (
                    isVideoUrl(moment.media_url) ? (
                      <>
                        <video
                          src={resolveMediaUrl(moment.media_url)}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <span className="absolute right-2.5 bottom-2.5 w-7 h-7 rounded-full bg-black/55 backdrop-blur-sm inline-flex items-center justify-center text-white">
                          <Play size={14} className="ml-0.5" />
                        </span>
                      </>
                    ) : (
                      <img
                        src={resolveMediaUrl(moment.media_url)}
                        alt="moment"
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                    )
                  ) : (
                    <div className="h-full w-full inline-flex items-center justify-center text-gray-500">
                      <Grid3x3 size={18} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedPost && (
          <div
            className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
            {...selectedPostSwipeHandlers}
          >
            <button
              onClick={closePostModal}
              className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full hover:bg-black/70 transition"
            >
              <X size={22} />
            </button>

            <div
              className="w-full max-w-4xl max-h-[96vh] sm:max-h-[92vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl sm:rounded-2xl"
              data-gesture-ignore="true"
            >
              <div className="p-4 sm:p-5 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <img
                    src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                    alt={user.username}
                    className="w-10 h-10 rounded-full object-cover"
                    style={getMoodAvatarRingStyle(user.mood)}
                  />
                  <div>
                    <p className="text-white font-semibold">{user.full_name}</p>
                    <p className="text-xs text-gray-400">@{user.username}</p>
                  </div>
                </div>
              </div>

              {selectedPost.media_url && (
                <div className="bg-black">
                  {isVideoUrl(selectedPost.media_url) ? (
                    <video
                      src={resolveMediaUrl(selectedPost.media_url)}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full max-h-[62vh] sm:max-h-[68vh] object-contain"
                    />
                  ) : (
                    <img
                      src={resolveMediaUrl(selectedPost.media_url)}
                      alt="post"
                      loading="lazy"
                      className="w-full max-h-[62vh] sm:max-h-[68vh] object-contain"
                    />
                  )}
                </div>
              )}

              <div className="p-4 sm:p-5">
                <p className="text-gray-200 break-words whitespace-pre-wrap mb-4">
                  {selectedPost.content || 'Sem legenda'}
                </p>
                <div className="flex items-center gap-6 text-sm text-gray-300">
                  <span className="inline-flex items-center gap-2">
                    <Heart size={16} />
                    {selectedPost.likes_count} curtidas
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <MessageCircle size={16} />
                    {selectedPost.comments_count} comentarios
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Profile Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" {...editProfileSwipeHandlers}>
            <div className="bg-slate-800 rounded-2xl max-w-md w-full max-h-[88vh] overflow-y-auto border border-slate-700 p-4 sm:p-6" data-gesture-ignore="true">
              {/* Header */}
              <div className="flex items-center justify-between mb-5 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-white">Editar Perfil</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-1 hover:bg-slate-700 rounded-lg transition"
                >
                  <X size={24} className="text-gray-400" />
                </button>
              </div>

              {/* Form */}
              <div className="space-y-4">
                {/* Avatar */}
                <div className="flex flex-col items-center gap-4">
                  <img
                    src={avatarPreview || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}
                    alt="avatar preview"
                    className="w-24 h-24 rounded-full object-cover border-2 border-primary"
                    style={getMoodAvatarRingStyle(user.mood)}
                  />
                  <label className="flex items-center justify-center w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg cursor-pointer transition">
                    <span className="text-sm font-semibold">Alterar Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={editFormData.full_name}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, full_name: e.target.value })
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Bio
                  </label>
                  <textarea
                    value={editFormData.bio}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, bio: e.target.value })
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary resize-none"
                    rows={3}
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Localização
                  </label>
                  <input
                    type="text"
                    value={editFormData.location}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, location: e.target.value })
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Link */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Website
                  </label>
                  <input
                    type="url"
                    value={editFormData.link}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, link: e.target.value })
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Categoria/Profissão
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Artista, Criador, Influencer..."
                    value={editFormData.category}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, category: e.target.value })
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary/80 disabled:bg-primary/50 text-white font-semibold rounded-lg transition"
                >
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

