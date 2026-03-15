import { useState, useEffect, useRef } from 'react'
import { MapPin, Navigation, Eye, EyeOff, Users, Loader, AlertCircle, Info, MessageCircle, Star, Search, User, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import apiClient from '@services/api'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'

interface NearbyUser {
  id: number
  username: string
  full_name?: string
  avatar_url?: string
  distance_km?: number
  is_online: boolean
  is_favorite?: boolean
  is_visible_nearby?: boolean
}

interface NearbyPlacePost {
  kind: 'moment' | 'vibe'
  id: number
  media_url?: string
  content?: string
  created_at?: string
  user_id: number
}

interface NearbyPlace {
  location_label: string
  latitude: number
  longitude: number
  distance_km: number
  posts_count: number
  latest_created_at?: string
  posts: NearbyPlacePost[]
}

interface NearbyAuthorSummary {
  id: number
  username: string
  full_name?: string
  avatar_url?: string
}

const normalizeForSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const NEARBY_USERS_PAGE_SIZE = 24
const NEARBY_PLACES_PAGE_SIZE = 12

export default function NearbyPage() {
  const debugLog = (...args: any[]) => {
    if (import.meta.env.DEV) console.log(...args)
  }
  const debugWarn = (...args: any[]) => {
    if (import.meta.env.DEV) console.warn(...args)
  }
  const navigate = useNavigate()
  const realtimeRefreshRef = useRef<number | null>(null)
  const [nearbyTab, setNearbyTab] = useState<'users' | 'places'>('users')
  const [users, setUsers] = useState<NearbyUser[]>([])
  const [places, setPlaces] = useState<NearbyPlace[]>([])
  const [placesLoading, setPlacesLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(() => {
    const saved = localStorage.getItem('nearby_visibility')
    if (saved === 'true') return true
    if (saved === 'false') return false
    return false
  })
  const [radiusKm, setRadiusKm] = useState<number>(() => {
    const saved = localStorage.getItem('nearby_radius_km')
    const parsed = saved ? Number(saved) : 5
    return Number.isFinite(parsed) ? Math.max(1, Math.min(20000, parsed)) : 5
  })
  const [isAdjustingRadius, setIsAdjustingRadius] = useState(false)
  const [hasLocation, setHasLocation] = useState(false)
  const [requestingLocation, setRequestingLocation] = useState(false)
  const [showInfoPopover, setShowInfoPopover] = useState(false)
  const [favoriteUsers, setFavoriteUsers] = useState<NearbyUser[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NearbyUser[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [locationCountry, setLocationCountry] = useState('')
  const [locationState, setLocationState] = useState('')
  const [locationCity, setLocationCity] = useState('')
  const [expandedPlace, setExpandedPlace] = useState<NearbyPlace | null>(null)
  const [expandedPost, setExpandedPost] = useState<NearbyPlacePost | null>(null)
  const [authorCache, setAuthorCache] = useState<Record<number, NearbyAuthorSummary>>({})
  const [authorLoading, setAuthorLoading] = useState(false)
  const [visibleUsersCount, setVisibleUsersCount] = useState(NEARBY_USERS_PAGE_SIZE)
  const [visiblePlacesCount, setVisiblePlacesCount] = useState(NEARBY_PLACES_PAGE_SIZE)
  const usersFeedSentinelRef = useRef<HTMLDivElement | null>(null)
  const placesFeedSentinelRef = useRef<HTMLDivElement | null>(null)
  const normalizedSearch = normalizeForSearch(searchQuery.trim().replace(/^@+/, ''))
  const isSearchingUsers = nearbyTab === 'users' && normalizedSearch.length > 0
  const isSearchingPlaces = nearbyTab === 'places' && normalizedSearch.length > 0
  const regularNearbyUsers = users.filter((u) => !u.is_favorite)
  const filteredPlaces = places.filter((place) =>
    !isSearchingPlaces || normalizeForSearch(place.location_label || '').includes(normalizedSearch)
  )
  const visibleRegularNearbyUsers = regularNearbyUsers.slice(0, visibleUsersCount)
  const visiblePlaces = filteredPlaces.slice(0, visiblePlacesCount)
  const hasMoreUsers = visibleUsersCount < regularNearbyUsers.length
  const hasMorePlaces = visiblePlacesCount < filteredPlaces.length

  const expandedPostAuthor = expandedPost ? authorCache[expandedPost.user_id] : undefined

  useEffect(() => {
    const init = async () => {
      debugLog('[NearbyPage] 🚀 Inicializando página...')
      
      // 1. Verificar localização
      await checkLocationStatus()
      
      // 2. Carregar visibilidade do backend (ESSENCIAL!)
      debugLog('[NearbyPage] ⏳ Aguardando carregamento de visibilidade...')
      await loadUserVisibilityStatus()
      
      // 3. Se tem localização, carregar usuários próximos
      const lat = localStorage.getItem('user_latitude')
      const lng = localStorage.getItem('user_longitude')
      
      debugLog('[NearbyPage] 📍 Localização:', lat ? 'sim' : 'não')
      
      if (lat && lng) {
        debugLog('[NearbyPage] 🔍 Carregando usuários próximos...')
        await Promise.all([loadNearbyUsers(), loadNearbyFavorites(), loadNearbyPlaces()])
      } else {
        debugLog('[NearbyPage] ⚠️ Sem localização - não carregando usuários')
      }
      
      debugLog('[NearbyPage] ✅ Inicialização completa')
    }
    
    init().catch(err => console.error('[NearbyPage] Erro na inicialização:', err))
  }, [])

  useEffect(() => {
    if (!expandedPlace && !expandedPost) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [expandedPlace, expandedPost])

  useEffect(() => {
    setVisibleUsersCount(NEARBY_USERS_PAGE_SIZE)
  }, [radiusKm, normalizedSearch, regularNearbyUsers.length])

  useEffect(() => {
    setVisiblePlacesCount(NEARBY_PLACES_PAGE_SIZE)
  }, [radiusKm, normalizedSearch, filteredPlaces.length])

  useEffect(() => {
    if (nearbyTab !== 'users' || isSearchingUsers || !hasMoreUsers) return
    const sentinel = usersFeedSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setVisibleUsersCount((prev) => Math.min(prev + NEARBY_USERS_PAGE_SIZE, regularNearbyUsers.length))
      },
      {
        root: null,
        rootMargin: '220px 0px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [nearbyTab, isSearchingUsers, hasMoreUsers, regularNearbyUsers.length])

  useEffect(() => {
    if (nearbyTab !== 'places' || isSearchingPlaces || !hasMorePlaces) return
    const sentinel = placesFeedSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        setVisiblePlacesCount((prev) => Math.min(prev + NEARBY_PLACES_PAGE_SIZE, filteredPlaces.length))
      },
      {
        root: null,
        rootMargin: '260px 0px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [nearbyTab, isSearchingPlaces, hasMorePlaces, filteredPlaces.length])

  const loadUserVisibilityStatus = async () => {
    try {
      debugLog('[NearbyPage] 📡 Carregando status de visibilidade do backend...')
      const response = await apiClient.getCurrentUser()
      
      const payload = response?.data && response.data.is_visible_nearby !== undefined ? response.data : response
      
      const visibilityStatus = payload?.is_visible_nearby
      
      if (visibilityStatus === undefined || visibilityStatus === null) {
        debugWarn('[NearbyPage] ⚠️ Campo is_visible_nearby não foi retornado pelo backend!')
      }
      
      const finalStatus = visibilityStatus === true ? true : false
      debugLog('[NearbyPage] ✅ Status de visibilidade final:', finalStatus ? '🟢 VISÍVEL' : '🔴 OCULTO')

      setIsVisible(finalStatus)
      localStorage.setItem('nearby_visibility', finalStatus ? 'true' : 'false')
    } catch (error) {
      console.error('[NearbyPage] ❌ Erro ao carregar status de visibilidade:', error)
      setIsVisible(false)
      localStorage.setItem('nearby_visibility', 'false')
    }
  }

  useEffect(() => {
    localStorage.setItem('nearby_radius_km', String(radiusKm))
  }, [radiusKm])

  useEffect(() => {
    if (!isSearchingUsers) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true)
        const response = await apiClient.searchUsers(normalizedSearch)
        const list = Array.isArray(response.data) ? response.data : []
        setSearchResults(
          list.map((user: any) => ({
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            is_online: Boolean(user.is_online),
            is_visible_nearby: Boolean(user.is_visible_nearby),
            is_favorite: favoriteUsers.some((fav) => fav.id === user.id),
          }))
        )
      } catch (error) {
        console.error('[NearbyPage] Erro ao buscar usuários:', error)
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 260)

    return () => window.clearTimeout(timer)
  }, [normalizedSearch, isSearchingUsers, favoriteUsers])

  // Sincronizar visibilidade quando página ganha foco
  useEffect(() => {
    const handleFocus = () => {
      debugLog('[NearbyPage] Página ganhou foco - sincronizando visibilidade...')
      loadUserVisibilityStatus()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  // Realtime refresh por eventos websocket globais (sem polling continuo).
  useEffect(() => {
    if (!hasLocation) {
      return
    }

    const scheduleRefresh = () => {
      if (realtimeRefreshRef.current) {
        window.clearTimeout(realtimeRefreshRef.current)
      }

      realtimeRefreshRef.current = window.setTimeout(() => {
        if (!loading && !placesLoading) {
          debugLog('[NearbyPage] 🔄 Realtime refresh: recarregando usuários e locais...')
          loadNearbyUsers()
          loadNearbyFavorites()
          loadNearbyPlaces()
        }
      }, 350)
    }

    const onPresence = () => scheduleRefresh()
    const onMomentCreated = () => scheduleRefresh()
    const onMomentDeleted = () => scheduleRefresh()
    const onVibeCreated = () => scheduleRefresh()

    window.addEventListener('ello:ws:presence-update', onPresence)
    window.addEventListener('ello:ws:moment-created', onMomentCreated)
    window.addEventListener('ello:ws:moment-deleted', onMomentDeleted)
    window.addEventListener('ello:ws:vibe-created', onVibeCreated)

    return () => {
      window.removeEventListener('ello:ws:presence-update', onPresence)
      window.removeEventListener('ello:ws:moment-created', onMomentCreated)
      window.removeEventListener('ello:ws:moment-deleted', onMomentDeleted)
      window.removeEventListener('ello:ws:vibe-created', onVibeCreated)

      if (realtimeRefreshRef.current) {
        window.clearTimeout(realtimeRefreshRef.current)
        realtimeRefreshRef.current = null
      }
    }
  }, [hasLocation, loading, placesLoading, radiusKm])

  const resolveLocationName = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=pt-BR`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Reverse geocoding falhou: ${response.status}`)
      }

      const data = await response.json()
      const address = data?.address || {}
      const city = address.city || address.town || address.village || address.municipality || ''
      const state = address.state || address.region || ''
      const country = address.country || ''

      setLocationCity(city)
      setLocationState(state)
      setLocationCountry(country)

      localStorage.setItem('nearby_location_city', city)
      localStorage.setItem('nearby_location_state', state)
      localStorage.setItem('nearby_location_country', country)
    } catch (error) {
      debugWarn('[NearbyPage] Falha ao resolver pais/estado/cidade:', error)
      setLocationCity('')
      setLocationState('')
      setLocationCountry('')
    }
  }

  const checkLocationStatus = async () => {
    const lat = localStorage.getItem('user_latitude')
    const lng = localStorage.getItem('user_longitude')
    const hasLoc = !!(lat && lng)
    setHasLocation(hasLoc)

    if (hasLoc) {
      setLocationCity(localStorage.getItem('nearby_location_city') || '')
      setLocationState(localStorage.getItem('nearby_location_state') || '')
      setLocationCountry(localStorage.getItem('nearby_location_country') || '')

      if (!localStorage.getItem('nearby_location_country') && lat && lng) {
        const parsedLat = Number(lat)
        const parsedLng = Number(lng)
        if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
          await resolveLocationName(parsedLat, parsedLng)
        }
      }
    }
  }

  const loadNearbyUsers = async (radiusOverride?: number) => {
    try {
      setLoading(true)
      const sourceRadius = radiusOverride ?? radiusKm
      const safeRadius = Math.max(1, Math.min(20000, sourceRadius))
      debugLog('[NearbyPage] Loading nearby users with radius:', safeRadius)
      const response = await apiClient.getNearbyUsers(safeRadius)
      
      if (response && response.data) {
        const list = Array.isArray(response.data) ? response.data : []
        setUsers(list.sort((a: NearbyUser, b: NearbyUser) => (a.distance_km ?? 0) - (b.distance_km ?? 0)))
      } else {
        setUsers([])
      }
    } catch (error) {
      console.error('[NearbyPage] Erro ao carregar usuários próximos:', error)
      setUsers([])
      // Não mostrar toast se não tem localização
      if (hasLocation) {
        toast.error('Erro ao carregar usuários próximos')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadNearbyFavorites = async () => {
    try {
      const response = await apiClient.getNearbyFavorites()
      const list = Array.isArray(response.data) ? response.data : []
      setFavoriteUsers(list.sort((a: NearbyUser, b: NearbyUser) => (a.distance_km ?? 0) - (b.distance_km ?? 0)))
    } catch (error) {
      console.error('[NearbyPage] Erro ao carregar favoritos nearby:', error)
      setFavoriteUsers([])
    }
  }

  const loadNearbyPlaces = async (radiusOverride?: number) => {
    try {
      setPlacesLoading(true)
      const sourceRadius = radiusOverride ?? radiusKm
      const safeRadius = Math.max(1, Math.min(20000, sourceRadius))
      const response = await apiClient.getNearbyPlaces(safeRadius)
      const list = Array.isArray(response.data) ? response.data : []
      setPlaces(list)
    } catch (error) {
      console.error('[NearbyPage] Erro ao carregar locais próximos:', error)
      setPlaces([])
    } finally {
      setPlacesLoading(false)
    }
  }

  const handleToggleFavorite = async (userId: number, isFavorite: boolean) => {
    try {
      if (isFavorite) {
        await apiClient.removeNearbyFavorite(userId)
      } else {
        await apiClient.addNearbyFavorite(userId)
      }
      await Promise.all([loadNearbyUsers(), loadNearbyFavorites()])
    } catch (error) {
      console.error('[NearbyPage] Erro ao alterar favorito nearby:', error)
      toast.error('Erro ao atualizar favorito')
    }
  }

  const handleRequestLocation = async () => {
    setRequestingLocation(true)
    try {
      if (!navigator.geolocation) {
        toast.error('Geolocalização não suportada no seu navegador')
        return
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords
          
          // Salvar localmente
          localStorage.setItem('user_latitude', latitude.toString())
          localStorage.setItem('user_longitude', longitude.toString())
          debugLog('[NearbyPage] 💾 Localização salva no localStorage')

          try {
            // Atualizar no backend
            debugLog('[NearbyPage] 📡 Enviando localização ao backend...')
            await apiClient.updateUserLocation(latitude, longitude)
            
            setHasLocation(true)
            debugLog('[NearbyPage] ✓ hasLocation = true')
            
            toast.success('Localização atualizada!')
            await resolveLocationName(latitude, longitude)
            
            // Recarregar usuários próximos
            debugLog('[NearbyPage] 🔍 Recarregando usuários próximos...')
            loadNearbyUsers()
            loadNearbyPlaces()
          } catch (err) {
            console.error('[NearbyPage] ❌ Erro ao salvar localização:', err)
            
            toast.error('Erro ao salvar localização')
          }
        },
        (error) => {
          console.error('[NearbyPage] ❌ Geolocation error:', error.code, error.message)
          toast.error('Acesso à localização negado')
        }
      )
    } finally {
      setRequestingLocation(false)
    }
  }

  const handleToggleVisibility = async () => {
    try {
      const newState = !isVisible
      debugLog('[NearbyPage] 🔄 Toggling visibility from', isVisible ? '🟢 VISÍVEL' : '🔴 OCULTO', 'to', newState ? '🟢 VISÍVEL' : '🔴 OCULTO')
      
      // Fazer requisição ao backend
      await apiClient.toggleNearbyVisibility(newState)
      
      // Atualizar estado local
      setIsVisible(newState)
      localStorage.setItem('nearby_visibility', newState ? 'true' : 'false')
      
      // Recarregar usuários próximos (afinal mudou se está visível ou não)
      loadNearbyUsers()
    } catch (error) {
      console.error('[NearbyPage] ❌ Erro ao toglar visibilidade:', error)
      toast.error('Erro ao atualizar visibilidade')
      // Recarregar status do servidor em caso de erro
      await loadUserVisibilityStatus()
    }
  }

  const handleRadiusChange = (value: number) => {
    const safeValue = Math.max(1, Math.min(20000, value))
    setRadiusKm(safeValue)
  }

  const handleRadiusCommit = async () => {
    setIsAdjustingRadius(false)
    if (hasLocation) {
      await Promise.all([loadNearbyUsers(radiusKm), loadNearbyPlaces(radiusKm)])
    }
  }

  const loadPostAuthor = async (userId: number) => {
    if (authorCache[userId]) {
      return
    }

    try {
      setAuthorLoading(true)
      const userPayload = await apiClient.getUser(userId)
      const payload = userPayload || {}
      setAuthorCache((prev) => ({
        ...prev,
        [userId]: {
          id: Number(payload.id || userId),
          username: payload.username || `usuario_${userId}`,
          full_name: payload.full_name,
          avatar_url: payload.avatar_url,
        },
      }))
    } catch (error) {
      console.error('[NearbyPage] Erro ao carregar autor da publicação:', error)
    } finally {
      setAuthorLoading(false)
    }
  }

  const openPlaceGallery = (place: NearbyPlace) => {
    setExpandedPlace(place)
    setExpandedPost(null)
  }

  const openPostFullscreen = (place: NearbyPlace, post: NearbyPlacePost) => {
    setExpandedPlace(place)
    setExpandedPost(post)
    void loadPostAuthor(post.user_id)
  }

  const closeExpandedPost = () => {
    setExpandedPost(null)
  }

  const closeExpandedOverlays = () => {
    setExpandedPost(null)
    setExpandedPlace(null)
  }

  const handleGoToAuthorProfile = (userId: number) => {
    closeExpandedOverlays()
    navigate(`/profile/${userId}`)
  }

  const handleMessageAuthor = (userId: number) => {
    closeExpandedOverlays()
    navigate(`/chat/${userId}`)
  }

  const nearbyTabSwipeHandlers = useSwipeGesture({
    enabled: !expandedPlace && !expandedPost && !showInfoPopover,
    threshold: 55,
    axisLockRatio: 1.25,
    ignoreFrom: 'input, textarea, select, [contenteditable="true"], [data-gesture-ignore="true"]',
    directions: ['left', 'right'],
    onSwipe: ({ direction }) => {
      if (direction === 'left' && nearbyTab === 'users') {
        setNearbyTab('places')
        return
      }
      if (direction === 'right' && nearbyTab === 'places') {
        setNearbyTab('users')
      }
    },
  })

  const expandedPlaceSwipeHandlers = useSwipeGesture({
    enabled: Boolean(expandedPlace) && !expandedPost,
    threshold: 70,
    axisLockRatio: 1.35,
    directions: ['down'],
    onSwipe: closeExpandedOverlays,
  })

  const expandedPostSwipeHandlers = useSwipeGesture({
    enabled: Boolean(expandedPost),
    threshold: 65,
    axisLockRatio: 1.3,
    directions: ['down'],
    onSwipe: closeExpandedPost,
  })

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header Section */}
      <div className="sticky top-0 z-40 bg-gradient-to-b from-slate-900/98 to-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 shadow-lg">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="mb-3 sm:mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:flex-1 min-w-0">
                <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
                  <MapPin className="text-blue-400" size={22} />
                </div>
                <label htmlFor="nearby-user-search" className="sr-only">Buscar usuários</label>
                <div className="relative flex-1 min-w-0">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                  />
                  <input
                    id="nearby-user-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={nearbyTab === 'users' ? 'Buscar @ ou nome' : 'Buscar localidade'}
                    className="w-full h-9 pl-8 pr-3 rounded-full bg-slate-800/85 border border-slate-700 text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60"
                  />
                </div>
              </div>

              <button
                onClick={handleToggleVisibility}
                className={`h-9 w-full sm:w-auto px-2.5 inline-flex items-center justify-center gap-1.5 rounded-full text-xs sm:text-sm font-semibold transition focus:outline-none shrink-0 whitespace-nowrap ${
                  isVisible
                    ? 'text-emerald-400 hover:text-emerald-300'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                {isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
                {isVisible ? 'Visivel' : 'Oculto'}
              </button>
            </div>

            <div className="mt-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Próximo a Você</h1>
              <p className="text-gray-400 text-sm">Descubra pessoas próximas</p>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-3">
            <div className={`flex items-center gap-2 ${hasLocation ? 'justify-end' : 'justify-start'}`}>
              {!hasLocation && (
                <button
                  onClick={handleRequestLocation}
                  disabled={requestingLocation}
                  className="h-9 px-3 inline-flex items-center gap-2 rounded-full text-sm font-semibold transition focus:outline-none text-cyan-300 hover:text-cyan-200 disabled:text-gray-500"
                >
                  {requestingLocation ? (
                    <Loader className="animate-spin" size={15} />
                  ) : (
                    <Navigation size={15} />
                  )}
                  Compartilhar Localização
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-800/80 bg-slate-900/35 px-3 py-2.5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">
                  Raio de busca
                </label>
                <span className="text-xs font-semibold text-primary">
                  {radiusKm >= 20000 ? 'Global' : `${radiusKm} km`}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="20000"
                step="1"
                value={radiusKm}
                onMouseDown={() => setIsAdjustingRadius(true)}
                onTouchStart={() => setIsAdjustingRadius(true)}
                onChange={(e) => handleRadiusChange(Number(e.target.value))}
                onMouseUp={handleRadiusCommit}
                onTouchEnd={handleRadiusCommit}
                onBlur={handleRadiusCommit}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              {isAdjustingRadius && (
                <p className="text-xs text-gray-400 mt-1">Solte o controle para aplicar o novo raio.</p>
              )}
            </div>

            {hasLocation && (locationCity || locationState || locationCountry) && (
              <div className="rounded-xl bg-slate-900/30 px-3 py-2 text-xs text-gray-300">
                <span className="text-gray-400">Local atual: </span>
                <span className="text-white">{[locationCity, locationState, locationCountry].filter(Boolean).join(', ')}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setNearbyTab('users')}
                className={`h-9 px-2.5 inline-flex items-center gap-1.5 rounded-full text-xs sm:text-sm font-semibold transition focus:outline-none shrink-0 ${
                  nearbyTab === 'users'
                    ? 'text-emerald-400 hover:text-emerald-300'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                <User size={15} />
                Usuários
              </button>
              <button
                onClick={() => setNearbyTab('places')}
                className={`h-9 px-2.5 inline-flex items-center gap-1.5 rounded-full text-xs sm:text-sm font-semibold transition focus:outline-none shrink-0 ${
                  nearbyTab === 'places'
                    ? 'text-emerald-400 hover:text-emerald-300'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                <MapPin size={15} />
                Locais
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-6 sm:py-8" {...nearbyTabSwipeHandlers}>
        {nearbyTab === 'places' ? (
          <>
            {!hasLocation ? (
              <div className="mb-8 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 flex items-start gap-4">
                <AlertCircle className="text-blue-400 flex-shrink-0 mt-1" size={24} />
                <div>
                  <h3 className="font-semibold text-white mb-1">Ative sua localização</h3>
                  <p className="text-gray-300 text-sm">
                    Para ver locais próximos, você precisa compartilhar sua localização uma vez.
                  </p>
                </div>
              </div>
            ) : placesLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader className="animate-spin text-primary" size={28} />
              </div>
            ) : filteredPlaces.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <MapPin className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
                  <h3 className="text-xl font-semibold text-white mb-2">Nenhum local encontrado</h3>
                  <p className="text-gray-400 max-w-md">
                    {isSearchingPlaces
                      ? 'Nenhum local com esse nome no raio selecionado.'
                      : 'Locais aparecem quando alguém publica moment/vibe com localização marcada.'}
                  </p>
                </div>
              </div>
            ) : (
              <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visiblePlaces.map((place, index) => (
                  <article key={`${place.location_label}-${place.latitude}-${place.longitude}-${index}`} className="rounded-2xl border border-slate-800/80 bg-gradient-to-b from-slate-900/70 to-slate-950/80 p-4 shadow-lg shadow-black/20">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <h3 className="text-white font-semibold truncate">{place.location_label}</h3>
                        <p className="text-xs text-gray-400 mt-1">{place.distance_km} km</p>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2 py-1 text-[11px] font-semibold">
                        <MapPin size={12} /> {place.posts_count}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {place.posts.slice(0, 6).map((post) => (
                        <button
                          key={`${post.kind}-${post.id}`}
                          onClick={() => openPostFullscreen(place, post)}
                          className="group rounded-xl overflow-hidden bg-slate-800/70 hover:scale-[1.02] transition"
                          title={post.content || post.kind}
                        >
                          {post.media_url ? (
                            <img src={post.media_url} alt={post.content || post.kind} className="w-full h-24 object-cover group-hover:scale-105 transition" />
                          ) : (
                            <div className="w-full h-24 flex items-center justify-center text-xs text-gray-400">Sem mídia</div>
                          )}
                          <div className="px-2 py-1 text-[10px] text-gray-300 truncate">
                            {post.kind === 'vibe' ? 'Vibe' : 'Moment'}
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => openPlaceGallery(place)}
                      className="mt-3 text-xs text-primary hover:text-primary/80 transition"
                    >
                      Ver publicações desse local
                    </button>
                  </article>
                ))}
              </div>
              {hasMorePlaces && (
                <div className="py-6 flex items-center justify-center">
                  <Loader className="animate-spin text-primary" size={22} />
                </div>
              )}
              <div ref={placesFeedSentinelRef} className="h-1 w-full" aria-hidden="true" />
              </>
            )}
          </>
        ) : (
          <>
        {isSearchingUsers && (
          <div className="mb-8">
            <h2 className="text-white text-lg font-semibold mb-4">Resultados da busca</h2>

            {searchLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="animate-spin text-primary" size={26} />
              </div>
            ) : searchResults.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center">
                <p className="text-gray-300">Nenhum usuário encontrado para "{searchQuery}".</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {searchResults.map((user) => (
                  <button
                    key={`search-${user.id}`}
                    onClick={() => navigate(`/profile/${user.id}`)}
                    className="group flex flex-col items-center gap-2 hover:opacity-80 transition"
                    title={user.username}
                  >
                    <div className="relative">
                      <img
                        src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                        alt={user.username}
                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-primary/40 group-hover:border-primary transition object-cover"
                      />
                      {user.is_online && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border border-green-300 animate-pulse" />
                      )}
                    </div>
                    <p className="font-semibold text-white text-xs truncate max-w-24">@{user.username}</p>
                    <p className="text-gray-400 text-[11px] truncate max-w-24">{user.full_name || 'Usuário'}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/chat/${user.id}`)
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-full transition text-gray-400 hover:text-primary hover:bg-primary/20"
                      title="Enviar mensagem"
                    >
                      <MessageCircle size={15} />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!isSearchingUsers && (
          <>
        <div className="mb-8">
          <h2 className="text-white text-lg font-semibold mb-4">Meus ellos favoritos</h2>
          {favoriteUsers.length === 0 ? (
            <p className="text-gray-400 text-sm">
              Voce ainda nao adicionou favoritos.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {favoriteUsers.map((user) => (
                <button
                  key={`fav-${user.id}`}
                  onClick={() => navigate(`/profile/${user.id}`)}
                  className="group flex flex-col items-center gap-2 hover:opacity-80 transition"
                >
                  <div className="relative">
                    <img
                      src={user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}
                      alt={user.username}
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-yellow-500/50 group-hover:border-yellow-400 transition object-cover"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleFavorite(user.id, true)
                      }}
                      className="absolute -top-1 -right-1 text-yellow-300 hover:text-yellow-200 transition"
                      title="Remover favorito"
                    >
                      <Star size={14} className="fill-current" />
                    </button>
                  </div>
                  <p className="font-semibold text-white text-xs truncate max-w-20">@{user.username}</p>
                  <div className="text-center w-full">
                    <p className="text-yellow-300 text-xs font-bold mb-1">{user.distance_km ?? 0} km</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/chat/${user.id}`)
                      }}
                      className="w-8 h-8 mx-auto flex items-center justify-center rounded-full transition text-gray-400 hover:text-primary hover:bg-primary/20"
                      title="Enviar mensagem"
                    >
                      <MessageCircle size={15} />
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {!hasLocation && (
          <div className="mb-8 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 flex items-start gap-4">
            <AlertCircle className="text-blue-400 flex-shrink-0 mt-1" size={24} />
            <div>
              <h3 className="font-semibold text-white mb-1">Ative sua localização</h3>
              <p className="text-gray-300 text-sm">
                Para descobrir pessoas próximas, você precisa compartilhar sua localização uma vez.
              </p>
            </div>
          </div>
        )}

        {regularNearbyUsers.length === 0 && favoriteUsers.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Users className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-semibold text-white mb-2">Nenhum usuário próximo</h3>
              <p className="text-gray-400 max-w-md">
                {!hasLocation
                  ? 'Compartilhe sua localização para descobrir pessoas próximas'
                  : 'Nenhuma pessoa está online e visível próximo a você no momento'}
              </p>
            </div>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {visibleRegularNearbyUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => navigate(`/profile/${user.id}`)}
                className="group flex flex-col items-center gap-2 hover:opacity-80 transition"
                title={user.username}
              >
                {/* Avatar */}
                <div className="relative">
                  <img
                    src={
                      user.avatar_url ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`
                    }
                    alt={user.username}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-primary/40 group-hover:border-primary transition object-cover"
                  />
                  
                  {/* Online indicator */}
                  {user.is_online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border border-green-300 animate-pulse" />
                  )}
                </div>

                {/* Username below avatar */}
                <p className="font-semibold text-white text-xs truncate hover:text-primary transition max-w-20">
                  @{user.username}
                </p>

                {/* Distance and Chat */}
                <div className="text-center w-full">
                  <p className="text-primary text-xs font-bold mb-2">{user.distance_km ?? 0} km</p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleFavorite(user.id, !!user.is_favorite)
                      }}
                      className={`w-8 h-8 flex items-center justify-center transition ${user.is_favorite ? 'text-yellow-300' : 'text-gray-400 hover:text-yellow-200'}`}
                      title={user.is_favorite ? 'Remover favorito' : 'Favoritar'}
                    >
                      <Star size={15} className={user.is_favorite ? 'fill-current' : ''} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/chat/${user.id}`)
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-full transition text-gray-400 hover:text-primary hover:bg-primary/20"
                      title="Enviar mensagem"
                    >
                      <MessageCircle size={15} />
                    </button>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {hasMoreUsers && (
            <div className="py-6 flex items-center justify-center">
              <Loader className="animate-spin text-primary" size={22} />
            </div>
          )}
          <div ref={usersFeedSentinelRef} className="h-1 w-full" aria-hidden="true" />
          </>
        )}
          </>
        )}
          </>
        )}

        {expandedPlace && (
          <div className="fixed inset-0 z-[75] bg-slate-950/95 backdrop-blur-md" {...expandedPlaceSwipeHandlers}>
            <div className="h-full max-w-6xl mx-auto flex flex-col">
              <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400">Publicações no local</p>
                  <h3 className="text-white font-semibold truncate">{expandedPlace.location_label}</h3>
                </div>
                <button
                  onClick={closeExpandedOverlays}
                  className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition"
                  title="Fechar"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {expandedPlace.posts.map((post) => (
                    <button
                      key={`expanded-${post.kind}-${post.id}`}
                      onClick={() => openPostFullscreen(expandedPlace, post)}
                      className="group rounded-lg overflow-hidden bg-slate-800/70"
                      title={post.content || post.kind}
                    >
                      {post.media_url ? (
                        <img
                          src={post.media_url}
                          alt={post.content || post.kind}
                          className="w-full aspect-square object-cover group-hover:scale-105 transition"
                        />
                      ) : (
                        <div className="w-full aspect-square flex items-center justify-center text-[11px] text-gray-400">Sem mídia</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {expandedPost && expandedPlace && (
          <div className="fixed inset-0 z-[85] bg-slate-950/98 backdrop-blur-lg" {...expandedPostSwipeHandlers}>
            <div className="h-full max-w-4xl mx-auto flex flex-col">
              <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 truncate">{expandedPlace.location_label}</p>
                  <p className="text-white text-sm font-semibold">{expandedPost.kind === 'vibe' ? 'Vibe' : 'Moment'} #{expandedPost.id}</p>
                </div>
                <button
                  onClick={closeExpandedPost}
                  className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center transition"
                  title="Fechar publicação"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black/50">
                  {expandedPost.media_url ? (
                    <img
                      src={expandedPost.media_url}
                      alt={expandedPost.content || expandedPost.kind}
                      className="w-full max-h-[65vh] object-contain bg-black"
                    />
                  ) : (
                    <div className="h-72 flex items-center justify-center text-gray-400">Sem mídia</div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => handleGoToAuthorProfile(expandedPost.user_id)}
                      className="flex items-center gap-3 min-w-0 text-left"
                    >
                      <img
                        src={expandedPostAuthor?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${expandedPostAuthor?.username || expandedPost.user_id}`}
                        alt={expandedPostAuthor?.username || `usuario ${expandedPost.user_id}`}
                        className="w-10 h-10 rounded-full object-cover border border-slate-700"
                      />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-semibold truncate">
                          {expandedPostAuthor?.full_name || (authorLoading ? 'Carregando autor...' : `Usuário ${expandedPost.user_id}`)}
                        </p>
                        <p className="text-slate-400 text-xs truncate">@{expandedPostAuthor?.username || expandedPost.user_id}</p>
                      </div>
                    </button>

                    <button
                      onClick={() => handleMessageAuthor(expandedPost.user_id)}
                      className="h-9 px-3 inline-flex items-center gap-2 rounded-full bg-primary/20 hover:bg-primary/30 text-primary text-xs font-semibold transition"
                    >
                      <MessageCircle size={14} /> Mensagem
                    </button>
                  </div>

                  {expandedPost.content && (
                    <p className="text-sm text-slate-200 leading-relaxed">{expandedPost.content}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Icon - Fixed bottom */}
        <div className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] left-1/2 transform -translate-x-1/2 z-40">
          <div className="relative">
            <button
              onClick={() => setShowInfoPopover(!showInfoPopover)}
              className="w-10 h-10 rounded-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center transition border border-blue-500/30"
              title="Como funciona"
            >
              <Info size={20} />
            </button>

            {/* Popover */}
            {showInfoPopover && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-4 w-[min(92vw,20rem)] bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-xl p-4 shadow-lg z-50">
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-blue-500/10 border-r border-b border-blue-500/30 rotate-45"></div>
                
                <h4 className="text-sm font-bold text-white mb-3">Como funciona "Próximo a Você"</h4>
                <ul className="space-y-2 text-gray-300 text-xs">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 flex-shrink-0" />
                    <span>Compartilhe sua localização para descobrir pessoas próximas</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 flex-shrink-0" />
                    <span>Apenas usuários online e com visibilidade ativa aparecem na lista</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 flex-shrink-0" />
                    <span>Ajuste o raio (1-20000km) para refinar sua busca ou usar modo global</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1 flex-shrink-0" />
                    <span>Você pode ocultar-se a qualquer momento</span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fechar popover ao clicar fora */}
      {showInfoPopover && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowInfoPopover(false)}
        />
      )}
    </div>
  )
}
