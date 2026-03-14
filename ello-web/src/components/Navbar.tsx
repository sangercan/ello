import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@store/authStore'
import { LogOut, Menu, X, Grid3x3, LayoutDashboard, Sparkles, Music, MapPin, User, Bell, Plus, MessageCircle, Image, Camera, Settings as SettingsIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import apiClient from '@services/api'
import { toast } from 'react-hot-toast'
import { useI18n } from '@/i18n/i18n'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'

const PUBLISH_MODE_ORDER: Array<'moment' | 'vibe' | 'story'> = ['moment', 'vibe', 'story']
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export default function Navbar() {
  const { user, logout } = useAuthStore()
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [isNavVisible, setIsNavVisible] = useState(true)
  const [showPublisher, setShowPublisher] = useState(false)
  const [publishMode, setPublishMode] = useState<'moment' | 'vibe' | 'story'>('moment')
  const [publishText, setPublishText] = useState('')
  const [publishFile, setPublishFile] = useState<File | null>(null)
  const [publishPreview, setPublishPreview] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [attachLocationToPost, setAttachLocationToPost] = useState(false)
  const [publishLatitude, setPublishLatitude] = useState<number | null>(null)
  const [publishLongitude, setPublishLongitude] = useState<number | null>(null)
  const [publishLocationLabel, setPublishLocationLabel] = useState('')
  const [loadingPublishLocation, setLoadingPublishLocation] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const navRef = useRef<HTMLElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isActive = (path: string) => location.pathname === path

  useEffect(() => {
    let lastScrollY = window.scrollY

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const scrollingDown = currentScrollY > lastScrollY

      if (currentScrollY < 20) {
        setIsNavVisible(true)
      } else if (scrollingDown && !open) {
        setIsNavVisible(false)
      } else {
        setIsNavVisible(true)
      }

      lastScrollY = currentScrollY
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [open])

  useEffect(() => {
    const root = document.documentElement
    const navElement = navRef.current
    if (!navElement) return

    const updateNavHeight = () => {
      const measuredHeight = Math.max(0, Math.round(navElement.getBoundingClientRect().height))
      if (measuredHeight > 0) {
        root.style.setProperty('--ello-nav-height', `${measuredHeight}px`)
      }
    }

    updateNavHeight()

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateNavHeight())
      resizeObserver.observe(navElement)
    }

    window.addEventListener('resize', updateNavHeight, { passive: true })
    window.addEventListener('orientationchange', updateNavHeight)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateNavHeight)
      window.removeEventListener('orientationchange', updateNavHeight)
    }
  }, [])

  useEffect(() => {
    const handleOpenPublisherEvent = (event: Event) => {
      const custom = event as CustomEvent<{ mode?: 'moment' | 'vibe' | 'story' }>
      setPublishMode(custom.detail?.mode || 'moment')
      setShowPublisher(true)
      setOpen(false)
    }

    window.addEventListener('ello:open-publisher', handleOpenPublisherEvent as EventListener)
    return () => {
      window.removeEventListener('ello:open-publisher', handleOpenPublisherEvent as EventListener)
    }
  }, [])

  useEffect(() => {
    const loadUnread = async () => {
      try {
        const response = await apiClient.getNotifications(1, 50)
        const list = Array.isArray(response.data) ? response.data : []
        const count = list.filter((item: any) => !item?.is_read).length
        setUnreadNotifications(count)
      } catch {
        // Ignore transient notification fetch failures in navbar.
      }
    }

    void loadUnread()

    const onNotificationCreated = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail
      const content = String(detail?.notification?.content || detail?.notification?.message || t('nav.notifications'))
      setUnreadNotifications((prev) => prev + 1)
      toast(content)
    }

    const onNotificationRefresh = () => {
      void loadUnread()
    }

    window.addEventListener('ello:ws:notification-created', onNotificationCreated as EventListener)
    window.addEventListener('ello:ws:notification-refresh', onNotificationRefresh)

    return () => {
      window.removeEventListener('ello:ws:notification-created', onNotificationCreated as EventListener)
      window.removeEventListener('ello:ws:notification-refresh', onNotificationRefresh)
    }
  }, [t])

  const navItems = [
    { path: '/moments', icon: Grid3x3, label: t('nav.moments'), title: t('nav.moments') },
    { path: '/vibes', icon: Sparkles, label: t('nav.vibes'), title: t('nav.vibes') },
    { path: '/music', icon: Music, label: t('nav.music'), title: t('nav.music') },
    { path: '/nearby', icon: MapPin, label: t('nav.nearby'), title: t('nav.nearby') },
    { path: '/chat', icon: MessageCircle, label: t('nav.chat'), title: t('nav.chat') },
    { path: '/profile', icon: User, label: t('nav.profile'), title: t('nav.profile') },
  ]

  const rightActionItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard'), title: t('nav.dashboard') },
    { path: '/notifications', icon: Bell, label: t('nav.notifications'), title: t('nav.notifications') },
    { path: '/settings', icon: SettingsIcon, label: 'Config', title: 'Configuracoes' },
  ]

  const openPublisher = () => {
    setPublishMode('moment')
    setShowPublisher(true)
    setOpen(false)
  }

  const closePublisher = () => {
    setShowPublisher(false)
    setPublishMode('moment')
    setPublishText('')
    setPublishFile(null)
    setPublishPreview(null)
    setAttachLocationToPost(false)
    setPublishLatitude(null)
    setPublishLongitude(null)
    setPublishLocationLabel('')
  }

  const publisherSwipeHandlers = useSwipeGesture({
    enabled: showPublisher,
    threshold: 45,
    axisLockRatio: 1.25,
    directions: ['down'],
    onSwipe: closePublisher,
  })

  const publisherModeSwipeHandlers = useSwipeGesture({
    enabled: showPublisher,
    threshold: 45,
    axisLockRatio: 1.25,
    ignoreFrom: 'input, textarea, select, [contenteditable="true"], [data-gesture-ignore="true"]',
    directions: ['left', 'right'],
    onSwipe: ({ direction }) => {
      const currentIndex = PUBLISH_MODE_ORDER.indexOf(publishMode)
      if (currentIndex < 0) return

      if (direction === 'left' && currentIndex < PUBLISH_MODE_ORDER.length - 1) {
        setPublishMode(PUBLISH_MODE_ORDER[currentIndex + 1])
        return
      }

      if (direction === 'right' && currentIndex > 0) {
        setPublishMode(PUBLISH_MODE_ORDER[currentIndex - 1])
      }
    },
  })

  const abbreviateStateOrProvince = (value: string) => {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()

    if (!normalized) return ''

    const brazilMap: Record<string, string> = {
      acre: 'AC',
      alagoas: 'AL',
      amapa: 'AP',
      amazonas: 'AM',
      bahia: 'BA',
      ceara: 'CE',
      'distrito federal': 'DF',
      'espirito santo': 'ES',
      goias: 'GO',
      maranhao: 'MA',
      'mato grosso': 'MT',
      'mato grosso do sul': 'MS',
      'minas gerais': 'MG',
      para: 'PA',
      paraiba: 'PB',
      parana: 'PR',
      pernambuco: 'PE',
      piaui: 'PI',
      'rio de janeiro': 'RJ',
      'rio grande do norte': 'RN',
      'rio grande do sul': 'RS',
      rondonia: 'RO',
      roraima: 'RR',
      'santa catarina': 'SC',
      'sao paulo': 'SP',
      sergipe: 'SE',
      tocantins: 'TO',
    }

    const lower = normalized.toLowerCase()
    if (brazilMap[lower]) return brazilMap[lower]

    const words = lower
      .split(/\s+/)
      .filter((word) => !['de', 'da', 'do', 'dos', 'das', 'of', 'the', 'y', 'e'].includes(word))

    if (words.length >= 2) {
      return words.slice(0, 3).map((word) => word[0]).join('').toUpperCase()
    }

    return normalized.slice(0, 3).toUpperCase()
  }

  const buildLocationLabel = (city: string, stateOrProvince: string, countryCode: string) => {
    const parts = [city, stateOrProvince, countryCode].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : 'My location'
  }

  const resolvePublishLocationLabel = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=${language}`,
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
      const city = String(address.city || address.town || address.village || address.municipality || '')
      const stateRaw = String(address.state || address.province || address.region || '')
      const countryCode = String(address.country_code || '').toUpperCase()
      const stateAbbreviation = abbreviateStateOrProvince(stateRaw)

      setPublishLocationLabel(buildLocationLabel(city, stateAbbreviation, countryCode))
    } catch (error) {
      console.warn('[Navbar] Falha ao resolver rotulo de local para publicacao:', error)
      setPublishLocationLabel('My location')
    }
  }

  const handleUseCurrentLocationForPost = async () => {
    if (!navigator.geolocation) {
      toast.error(t('toast.locationNotSupported'))
      return
    }

    setLoadingPublishLocation(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        setPublishLatitude(latitude)
        setPublishLongitude(longitude)

        await resolvePublishLocationLabel(latitude, longitude)

        setLoadingPublishLocation(false)
        toast.success(t('toast.locationAddSuccess'))
      },
      () => {
        setLoadingPublishLocation(false)
        toast.error(t('toast.locationReadError'))
      },
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  const getVideoDurationSeconds = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.preload = 'metadata'

      video.onloadedmetadata = () => {
        const duration = Number(video.duration || 0)
        URL.revokeObjectURL(objectUrl)
        resolve(duration)
      }

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Falha ao ler duracao do video'))
      }

      video.src = objectUrl
    })
  }

  const validateStoryVideoDuration = async (file: File) => {
    if (!file.type.startsWith('video/')) return true

    try {
      const duration = await getVideoDurationSeconds(file)
      if (duration > 30) {
        toast.error(t('toast.storyVideoTooLong'))
        return false
      }
      return true
    } catch {
      toast.error(t('toast.genericError'))
      return false
    }
  }

  const handlePublish = async () => {
    const text = publishText.trim()
    const fileIsVideo = publishFile ? publishFile.type.startsWith('video/') : false

    if (publishMode === 'vibe' && !fileIsVideo) {
      toast.error(t('toast.vibeNeedsVideo'))
      return
    }

    if (publishMode === 'story' && !publishFile) {
      toast.error(t('toast.storyNeedsMedia'))
      return
    }

    if (publishMode === 'story' && publishFile && publishFile.type.startsWith('video/')) {
      const isValidStoryVideo = await validateStoryVideoDuration(publishFile)
      if (!isValidStoryVideo) return
    }

    if (publishMode !== 'story' && !text && !publishFile) {
      toast.error(t('toast.mediaRequired'))
      return
    }

    if (publishMode !== 'story' && attachLocationToPost && (publishLatitude === null || publishLongitude === null)) {
      toast.error(t('toast.postLocationRequired'))
      return
    }

    try {
      setPublishing(true)
      let uploadedUrl: string | undefined

      if (publishFile) {
        const uploadResponse = await apiClient.uploadFile(publishFile, publishMode)
        uploadedUrl = uploadResponse.data?.url
        if (!uploadedUrl) {
          throw new Error('Upload failed')
        }
      }

      if (publishMode === 'story') {
        await apiClient.createStory({ media_url: uploadedUrl })
        toast.success(t('nav.story') + ' ' + t('nav.publish'))
        window.dispatchEvent(new CustomEvent('ello:story-created'))
      } else if (publishMode === 'vibe') {
        await apiClient.createVibe({
          video_url: uploadedUrl,
          caption: text || t('nav.vibeVideo'),
          latitude: attachLocationToPost ? publishLatitude : null,
          longitude: attachLocationToPost ? publishLongitude : null,
          location_label: attachLocationToPost ? (publishLocationLabel.trim() || 'My location') : null,
        })
        toast.success(t('nav.vibes') + ' ' + t('nav.publish'))
        window.dispatchEvent(new CustomEvent('ello:vibe-created'))
      } else {
        await apiClient.createMoment({
          content: text || '',
          media_url: uploadedUrl,
          latitude: attachLocationToPost ? publishLatitude : null,
          longitude: attachLocationToPost ? publishLongitude : null,
          location_label: attachLocationToPost ? (publishLocationLabel.trim() || 'My location') : null,
        })
        toast.success(t('nav.moment') + ' ' + t('nav.publish'))
        window.dispatchEvent(new CustomEvent('ello:moment-created'))
      }

      closePublisher()
      navigate(publishMode === 'vibe' ? '/vibes' : '/moments')
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      if (detail && typeof detail === 'string') {
        toast.error(detail)
      } else if (error?.code === 'ECONNABORTED') {
        toast.error(t('toast.uploadTimeout'))
      } else {
        toast.error(t('toast.publishError'))
      }
    } finally {
      setPublishing(false)
    }
  }

  const onPickFile = async (file?: File) => {
    if (!file) return

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('Arquivo muito grande. Limite maximo de 50 MB.')
      return
    }

    if (publishMode === 'story' && file.type.startsWith('video/')) {
      const isValidStoryVideo = await validateStoryVideoDuration(file)
      if (!isValidStoryVideo) return
    }

    setPublishFile(file)
    setPublishPreview(URL.createObjectURL(file))
  }

  return (
    <nav ref={navRef} className={`sticky top-0 z-50 bg-gradient-to-b from-slate-900/98 to-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 shadow-2xl transition-transform duration-300 ${
      isNavVisible ? 'translate-y-0' : '-translate-y-full'
    }`}>
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 md:h-20">
          {/* Logo */}
          <Link to="/moments" className="text-2xl font-bold bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent hover:from-primary hover:via-purple-300 hover:to-pink-300 transition-all duration-300 transform hover:scale-105">
            ℯ𝓁𝓁ℴ
          </Link>

          {/* Desktop Menu - Modern Icon Based */}
          <div className="hidden md:flex gap-2 items-center px-6 py-2 bg-slate-800/30 rounded-full border border-slate-700/50 backdrop-blur-sm">
            <button
              onClick={openPublisher}
              title={t('nav.newPost')}
              className="p-2.5 rounded-full bg-gradient-to-r from-primary to-pink-500 hover:from-primary/80 hover:to-pink-400 text-white transition-all duration-300 flex items-center justify-center group relative shadow-lg shadow-primary/50 hover:shadow-primary/80"
            >
              <Plus size={26} strokeWidth={2} />
              <span className="absolute inset-0 rounded-full bg-white/0 group-hover:bg-white/10 transition-all duration-300"></span>
            </button>

            {navItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={item.title}
                  className={`relative group p-2.5 rounded-full transition-all duration-300 flex items-center justify-center ${
                    active
                      ? 'text-primary bg-primary/10 shadow-lg shadow-primary/50'
                      : 'text-gray-400 hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  <Icon size={26} strokeWidth={1.5} />
                  
                  {/* Glow effect for active */}
                  {active && (
                    <span className="absolute inset-0 rounded-full bg-primary/20 blur-lg -z-10 animate-pulse"></span>
                  )}
                  
                  {/* Tooltip */}
                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap border border-slate-700/50 shadow-xl pointer-events-none">
                    {item.title}
                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-950"></span>
                  </span>
                </Link>
              )
            })}

            {rightActionItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={item.title}
                  className={`relative group p-2.5 rounded-full transition-all duration-300 flex items-center justify-center ${
                    active
                      ? 'text-primary bg-primary/10 shadow-lg shadow-primary/50'
                      : 'text-gray-400 hover:text-primary hover:bg-primary/5'
                  }`}
                >
                  <Icon size={26} strokeWidth={1.5} />

                  {item.path === '/notifications' && unreadNotifications > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] text-center font-semibold">
                      {unreadNotifications > 99 ? '99+' : unreadNotifications}
                    </span>
                  )}

                  {active && (
                    <span className="absolute inset-0 rounded-full bg-primary/20 blur-lg -z-10 animate-pulse"></span>
                  )}

                  <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 px-3 py-1.5 bg-slate-950 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap border border-slate-700/50 shadow-xl pointer-events-none">
                    {item.title}
                    <span className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-slate-950"></span>
                  </span>
                </Link>
              )
            })}

          </div>

          {/* User Menu */}
          <div className="hidden md:flex items-center gap-4">
            <span className="text-sm font-medium text-gray-300 px-3 py-1 rounded-full bg-slate-800/50">{user?.username}</span>
            <button
              onClick={handleLogout}
              className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-all duration-200"
              title={t('nav.logout')}
            >
              <LogOut size={22} strokeWidth={1.5} />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-gray-300 p-2 hover:bg-slate-800/50 rounded-lg transition"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>

        {/* Mobile Menu - Modern Grid */}
        {open && (
          <div className="md:hidden pb-4 border-t border-slate-700/50 bg-gradient-to-b from-slate-800/20 to-transparent">
            <div className="grid grid-cols-4 gap-3 p-4">
              {[...navItems, ...rightActionItems].map((item) => {
                const Icon = item.icon
                const active = isActive(item.path)
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setOpen(false)}
                    title={item.title}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-300 relative group ${
                      active
                        ? 'bg-primary/20 text-primary shadow-lg shadow-primary/30'
                        : 'bg-slate-800/50 text-gray-400 hover:text-primary hover:bg-slate-800/80'
                    }`}
                  >
                    <Icon size={24} strokeWidth={1.5} />
                    {item.path === '/notifications' && unreadNotifications > 0 && (
                      <span className="absolute top-2 right-2 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[17px] text-center font-semibold">
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </span>
                    )}
                    <span className="text-xs mt-2 text-center font-medium">{item.label}</span>
                    {active && (
                      <span className="absolute inset-0 rounded-2xl bg-primary/10 blur-md -z-10 animate-pulse"></span>
                    )}
                  </Link>
                )
              })}
            </div>

            {/* Mobile New Post & Logout */}
            <div className="flex gap-3 px-4 pt-4 border-t border-slate-700/50">
              <button
                onClick={() => {
                  openPublisher()
                }}
                className="flex-1 p-3 bg-gradient-to-r from-primary to-pink-500 hover:from-primary/80 hover:to-pink-400 text-white rounded-xl flex items-center justify-center gap-2 transition-all font-semibold shadow-lg"
              >
                <Plus size={20} strokeWidth={2} />
                <span>{t('nav.newPost')}</span>
              </button>
              <button
                onClick={handleLogout}
                className="p-3 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded-xl transition font-semibold"
                title={t('nav.logout')}
              >
                <LogOut size={20} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showPublisher && createPortal(
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" {...publisherSwipeHandlers}>
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 rounded-2xl p-5 sm:p-6 shadow-2xl" {...publisherModeSwipeHandlers}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">{t('nav.createPost')}</h2>
              <button onClick={closePublisher} className="text-gray-400 hover:text-white transition">
                <X size={22} />
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setPublishMode('moment')}
                className={`h-9 px-3 inline-flex items-center rounded-full text-xs font-medium transition-colors duration-200 ${
                  publishMode === 'moment' ? 'text-primary' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t('nav.moment')}
              </button>
              <button
                onClick={() => setPublishMode('vibe')}
                className={`h-9 px-3 inline-flex items-center rounded-full text-xs font-medium transition-colors duration-200 ${
                  publishMode === 'vibe' ? 'text-primary' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t('nav.vibeVideo')}
              </button>
              <button
                onClick={() => setPublishMode('story')}
                className={`h-9 px-3 inline-flex items-center rounded-full text-xs font-medium transition-colors duration-200 ${
                  publishMode === 'story' ? 'text-primary' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t('nav.story')}
              </button>
            </div>

            <label className="block text-sm text-gray-300 mb-2">{t('nav.createCaption')}</label>
            <textarea
              value={publishText}
              onChange={(e) => setPublishText(e.target.value)}
              placeholder={publishMode === 'story' ? t('nav.captionOptional') : t('nav.captionDefault')}
              className="w-full h-28 bg-slate-800 border border-slate-700 rounded-xl p-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary resize-none"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-medium text-gray-300 hover:text-white transition-colors duration-200"
              >
                <Image size={16} /> {t('nav.gallery')}
              </button>
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-medium text-gray-300 hover:text-white transition-colors duration-200"
              >
                <Camera size={16} /> {t('nav.camera')}
              </button>
              {publishFile && (
                <span className="text-xs text-gray-400 self-center truncate max-w-[220px]">{publishFile.name}</span>
              )}
            </div>

            {publishMode !== 'story' && (
              <div className="mt-4 rounded-xl bg-slate-900/45 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-200">
                    <MapPin size={15} className={attachLocationToPost ? 'text-primary' : 'text-gray-400'} />
                    <span>{t('nav.addLocation')}</span>
                  </div>
                  <button
                    onClick={() => {
                      const next = !attachLocationToPost
                      setAttachLocationToPost(next)
                      if (!next) {
                        setPublishLatitude(null)
                        setPublishLongitude(null)
                        setPublishLocationLabel('')
                      }
                    }}
                    className={`h-8 px-2.5 inline-flex items-center rounded-full text-xs font-medium transition-colors duration-200 ${
                      attachLocationToPost ? 'text-primary' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {attachLocationToPost ? t('nav.active') : t('nav.enable')}
                  </button>
                </div>

                {attachLocationToPost && (
                  <>
                    <button
                      onClick={handleUseCurrentLocationForPost}
                      disabled={loadingPublishLocation}
                      className="h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-medium text-gray-300 hover:text-white transition-colors duration-200 disabled:opacity-60"
                    >
                      {loadingPublishLocation ? t('nav.gettingLocation') : t('nav.useCurrentLocation')}
                    </button>

                    <input
                      type="text"
                      value={publishLocationLabel}
                      onChange={(e) => setPublishLocationLabel(e.target.value)}
                      placeholder={t('nav.locationPlaceholder')}
                      className="w-full h-10 bg-slate-800 border border-slate-700 rounded-lg px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                    />

                    {publishLatitude !== null && publishLongitude !== null && (
                      <p className="text-xs text-emerald-300">
                        {t('nav.locationReady')} ({publishLatitude.toFixed(4)}, {publishLongitude.toFixed(4)})
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*,video/*"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              onChange={(e) => onPickFile(e.target.files?.[0])}
              className="hidden"
            />

            {publishPreview && (
              <div className="mt-3 rounded-xl overflow-hidden bg-slate-800">
                {publishFile?.type.startsWith('video/') ? (
                  <video src={publishPreview} controls className="w-full max-h-56 object-contain bg-black" />
                ) : (
                  <img src={publishPreview} alt="preview" className="w-full max-h-56 object-contain bg-black" />
                )}
              </div>
            )}

            <p className="text-xs text-gray-500 mt-2">
              {t('nav.tip')}
            </p>

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={closePublisher}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors duration-200"
              >
                <X size={16} />
                {t('nav.cancel')}
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-full text-xs font-medium text-primary hover:text-primary/80 transition-colors duration-200 disabled:opacity-60"
              >
                <Plus size={16} />
                {publishing ? t('nav.publishing') : t('nav.publish')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </nav>
  )
}
