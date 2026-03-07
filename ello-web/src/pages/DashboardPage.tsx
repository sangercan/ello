import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@store/authStore'
import apiClient from '@services/api'
import { toast } from 'react-hot-toast'
import {
  Bell,
  Compass,
  Droplets,
  HeartPulse,
  MessageCircle,
  Moon,
  Music2,
  PlusCircle,
  Sparkles,
  Sun,
  Target,
  Users,
  Waves,
} from 'lucide-react'

type ConversationPreview = {
  id: number
  userId: number
  username: string
  fullName: string
  avatarUrl?: string
  lastMessage?: string
  lastMessageTime?: string
  unreadCount: number
  isOnline: boolean
}

type NotificationPreview = {
  id: number
  type: string
  content: string
  isRead: boolean
  createdAt?: string
}

type MusicPreview = {
  id: number
  title: string
  artist: string
  albumCover?: string | null
  createdAt?: string
}

type DashboardStats = {
  momentsCount: number
  vibesCount: number
  unreadMessages: number
  unreadNotifications: number
  musicCount: number
}

type MoodType = 'feliz' | 'focado' | 'relaxando'

type WeatherWidget = {
  city: string
  temperature: number
  weatherLabel: string
}

type InsightWidget = {
  onlineNow: number
  lastPostViews: number
}

type EventWidget = {
  id: string
  title: string
  subtitle: string
  distanceKm?: number
}

const toMediaUrl = (url?: string | null) => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url
  if (url.startsWith('/')) return url
  return `/${url}`
}

const extractList = (payload: any) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const extractTotal = (payload: any, fallbackLength: number) => {
  const total = Number(payload?.total)
  return Number.isFinite(total) && total >= 0 ? total : fallbackLength
}

const formatRelative = (dateString?: string) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMs / 3600000)
  const days = Math.floor(diffMs / 86400000)

  if (mins < 1) return 'Agora'
  if (mins < 60) return `${mins}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const greetingByHour = () => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

const weatherCodeToLabel = (code: number) => {
  if (code === 0) return 'Ensolarado'
  if ([1, 2].includes(code)) return 'Parcialmente nublado'
  if (code === 3) return 'Nublado'
  if ([45, 48].includes(code)) return 'Neblina'
  if ([51, 53, 55].includes(code)) return 'Garoa'
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 'Chuvoso'
  if ([71, 73, 75].includes(code)) return 'Neve'
  return 'Clima variavel'
}

const moodTheme = {
  feliz: {
    className: 'from-amber-500/20 to-orange-500/10 border-amber-400/30',
    suggestion: 'Energia alta hoje. Que tal postar uma vibe alegre?'
  },
  focado: {
    className: 'from-sky-500/20 to-cyan-500/10 border-sky-400/30',
    suggestion: 'Modo foco ativo. Compartilhe algo produtivo no feed.'
  },
  relaxando: {
    className: 'from-violet-500/20 to-fuchsia-500/10 border-violet-400/30',
    suggestion: 'Hora de desacelerar. Poste um momento tranquilo.'
  },
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [stats, setStats] = useState<DashboardStats>({
    momentsCount: 0,
    vibesCount: 0,
    unreadMessages: 0,
    unreadNotifications: 0,
    musicCount: 0,
  })

  const [conversations, setConversations] = useState<ConversationPreview[]>([])
  const [notifications, setNotifications] = useState<NotificationPreview[]>([])
  const [musicItems, setMusicItems] = useState<MusicPreview[]>([])

  const [mood, setMood] = useState<MoodType>(() => {
    if (typeof window === 'undefined') return 'feliz'
    const stored = window.localStorage.getItem('ello.dashboard.mood') as MoodType | null
    return stored && ['feliz', 'focado', 'relaxando'].includes(stored) ? stored : 'feliz'
  })

  const [weather, setWeather] = useState<WeatherWidget | null>(null)
  const [insights, setInsights] = useState<InsightWidget>({ onlineNow: 0, lastPostViews: 0 })
  const [events, setEvents] = useState<EventWidget[]>([])

  const [hydrationCount, setHydrationCount] = useState(0)
  const [breakReminderOn, setBreakReminderOn] = useState(false)
  const [minutesToBreak, setMinutesToBreak] = useState(20)
  const [breathingRunning, setBreathingRunning] = useState(false)
  const [breathingPhase, setBreathingPhase] = useState<'inspire' | 'expire'>('inspire')

  useEffect(() => {
    window.localStorage.setItem('ello.dashboard.mood', mood)
  }, [mood])

  useEffect(() => {
    if (!breakReminderOn) return

    const timer = window.setInterval(() => {
      setMinutesToBreak((prev) => {
        if (prev <= 1) {
          toast('Hora de uma pausa rapida de 2 minutos')
          return 20
        }
        return prev - 1
      })
    }, 60000)

    return () => window.clearInterval(timer)
  }, [breakReminderOn])

  useEffect(() => {
    if (!breathingRunning) return

    const timer = window.setInterval(() => {
      setBreathingPhase((prev) => (prev === 'inspire' ? 'expire' : 'inspire'))
    }, 4000)

    return () => window.clearInterval(timer)
  }, [breathingRunning])

  useEffect(() => {
    void loadDashboard()
    void loadWeatherWidget()
    void loadEventsWidget()
    const realtimeTimer = window.setInterval(() => {
      void loadRealtimeInsights()
    }, 20000)

    return () => window.clearInterval(realtimeTimer)
  }, [])

  const loadDashboard = async (background = false) => {
    try {
      if (!background) setLoading(true)

      const [momentsRes, vibesRes, conversationsRes, notificationsRes, musicRes] = await Promise.allSettled([
        apiClient.getMoments(1, 50),
        apiClient.getVibes(1, 50),
        apiClient.getConversations(1, 20),
        apiClient.getNotifications(1, 20),
        apiClient.getMusicFeed(1, 20),
      ])

      const momentsPayload = momentsRes.status === 'fulfilled' ? momentsRes.value.data : {}
      const vibesPayload = vibesRes.status === 'fulfilled' ? vibesRes.value.data : {}
      const conversationsPayload = conversationsRes.status === 'fulfilled' ? conversationsRes.value.data : {}
      const notificationsPayload = notificationsRes.status === 'fulfilled' ? notificationsRes.value.data : {}
      const musicPayload = musicRes.status === 'fulfilled' ? musicRes.value.data : {}

      const momentsList = extractList(momentsPayload)
      const vibesList = extractList(vibesPayload)
      const conversationsList = extractList(conversationsPayload)
      const notificationsList = extractList(notificationsPayload)
      const musicList = extractList(musicPayload)

      const mappedConversations: ConversationPreview[] = conversationsList.map((conv: any) => ({
        id: Number(conv.id),
        userId: Number(conv.other_user?.id),
        username: String(conv.other_user?.username || ''),
        fullName: String(conv.other_user?.full_name || conv.other_user?.username || 'Usuário'),
        avatarUrl: toMediaUrl(conv.other_user?.avatar_url),
        lastMessage: String(conv.last_message || ''),
        lastMessageTime: conv.last_message_time,
        unreadCount: Number(conv.unread_count || 0),
        isOnline: Boolean(conv.other_user?.is_online),
      }))

      const mappedNotifications: NotificationPreview[] = notificationsList.map((item: any) => ({
        id: Number(item.id),
        type: String(item.type || 'info'),
        content: String(item.content || 'Notificação'),
        isRead: Boolean(item.is_read),
        createdAt: item.created_at,
      }))

      const mappedMusic: MusicPreview[] = musicList.slice(0, 6).map((item: any) => ({
        id: Number(item.id),
        title: String(item.title || 'Sem título'),
        artist: String(item.artist || 'Artista Independente'),
        albumCover: item.album_cover || null,
        createdAt: item.created_at,
      }))

      setConversations(mappedConversations.slice(0, 6))
      setNotifications(mappedNotifications.slice(0, 6))
      setMusicItems(mappedMusic)

      setStats({
        momentsCount: extractTotal(momentsPayload, momentsList.length),
        vibesCount: extractTotal(vibesPayload, vibesList.length),
        unreadMessages: mappedConversations.reduce((acc, item) => acc + Number(item.unreadCount || 0), 0),
        unreadNotifications: mappedNotifications.filter((item) => !item.isRead).length,
        musicCount: extractTotal(musicPayload, musicList.length),
      })

      const myId = Number(user?.id)
      const myMoments = momentsList.filter((m: any) => Number(m.author_id || m.user_id || m.author?.id) === myId)
      const latest = myMoments.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0]
      const views = Number(latest?.views_count || (Number(latest?.likes_count || 0) + Number(latest?.comments_count || 0)))
      setInsights((prev) => ({ ...prev, lastPostViews: Number.isFinite(views) ? views : 0 }))

      await loadRealtimeInsights()

      if (notificationsRes.status === 'rejected') {
        console.warn('[Dashboard] notificacoes indisponiveis neste momento')
      }
    } catch (error) {
      console.error('[Dashboard] erro ao carregar dados:', error)
      toast.error('Erro ao carregar dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const loadRealtimeInsights = async () => {
    try {
      const response = await (apiClient as any).get('/online/')
      const list = Array.isArray(response?.data?.online_users) ? response.data.online_users : []
      setInsights((prev) => ({ ...prev, onlineNow: list.length }))
    } catch {
      // Keep previous value when endpoint is temporarily unavailable.
    }
  }

  const loadWeatherWidget = async () => {
    if (!navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords
      try {
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`
        )
        const weatherJson = await weatherRes.json()

        const reverseRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=pt-BR`
        )
        const reverseJson = await reverseRes.json()
        const city = String(reverseJson?.address?.city || reverseJson?.address?.town || reverseJson?.address?.village || reverseJson?.address?.municipality || 'Sua cidade')

        const temp = Number(weatherJson?.current?.temperature_2m || 0)
        const weatherCode = Number(weatherJson?.current?.weather_code || 0)

        setWeather({ city, temperature: temp, weatherLabel: weatherCodeToLabel(weatherCode) })
      } catch {
        // Weather widget is optional.
      }
    })
  }

  const loadEventsWidget = async () => {
    try {
      const res = await apiClient.getNearbyPlaces(30)
      const places = extractList(res.data)
      const mapped = places.slice(0, 4).map((item: any, index: number) => ({
        id: `place-${index}-${item.location_label || 'local'}`,
        title: String(item.location_label || 'Evento local'),
        subtitle: `${Number(item.posts_count || 0)} publicacao(oes) no local`,
        distanceKm: Number(item.distance_km || 0),
      }))
      setEvents(mapped)
    } catch {
      setEvents([])
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadDashboard(true), loadWeatherWidget(), loadEventsWidget()])
    toast.success('Dashboard atualizado')
  }

  const quickActions = useMemo(() => ([
    {
      label: 'Novo Moment',
      icon: PlusCircle,
      className: 'from-sky-500/20 to-cyan-500/10 border-sky-400/30 text-sky-200',
      action: () => window.dispatchEvent(new CustomEvent('ello:open-publisher', { detail: { mode: 'moment' } })),
    },
    {
      label: 'Novo Vibe',
      icon: Sparkles,
      className: 'from-violet-500/20 to-fuchsia-500/10 border-violet-400/30 text-violet-200',
      action: () => window.dispatchEvent(new CustomEvent('ello:open-publisher', { detail: { mode: 'vibe' } })),
    },
    {
      label: 'Explorar Nearby',
      icon: Compass,
      className: 'from-emerald-500/20 to-green-500/10 border-emerald-400/30 text-emerald-200',
      action: () => navigate('/nearby'),
    },
    {
      label: 'Abrir Music',
      icon: Music2,
      className: 'from-amber-500/20 to-orange-500/10 border-amber-400/30 text-amber-200',
      action: () => navigate('/music'),
    },
  ]), [navigate])

  const moodItems: Array<{ id: MoodType; label: string; icon: any }> = [
    { id: 'feliz', label: 'Feliz', icon: Sun },
    { id: 'focado', label: 'Focado', icon: Target },
    { id: 'relaxando', label: 'Relaxando', icon: Moon },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-8">
      <section className="relative overflow-hidden border-b border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900">
        <div className="absolute -top-20 -right-16 w-64 h-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-cyan-500/15 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-9">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white">
                {greetingByHour()}, {user?.full_name?.split(' ')[0] || 'ℯ𝓁𝓁ℴ'}
              </h1>
              <p className="mt-2 text-sm text-slate-300 max-w-2xl">
                {weather ? `${weather.weatherLabel} em ${weather.city}, ${Math.round(weather.temperature)}°C. ` : ''}
                {weather ? `Aproveite o dia em ${weather.city} e compartilhe sua vibe.` : 'Seu centro de controle: acompanhe atividade, mensagens e atalhos em um unico lugar.'}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="h-10 px-4 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-slate-100 hover:bg-slate-700 transition"
              disabled={refreshing}
            >
              {refreshing ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-400">Moments</p>
            <p className="mt-2 text-2xl font-bold text-white">{stats.momentsCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-400">Vibes</p>
            <p className="mt-2 text-2xl font-bold text-white">{stats.vibesCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-400">Nao lidas</p>
            <p className="mt-2 text-2xl font-bold text-white">{stats.unreadMessages}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs text-slate-400">Notificacoes</p>
            <p className="mt-2 text-2xl font-bold text-white">{stats.unreadNotifications}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 col-span-2 lg:col-span-1">
            <p className="text-xs text-slate-400">Music Feed</p>
            <p className="mt-2 text-2xl font-bold text-white">{stats.musicCount}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <article className={`rounded-2xl border bg-gradient-to-br p-4 ${moodTheme[mood].className}`}>
            <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2"><Sparkles size={15} /> Moodboard pessoal</h2>
            <p className="text-xs text-slate-200 mt-2">{moodTheme[mood].suggestion}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {moodItems.map((item) => {
                const Icon = item.icon
                const active = mood === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setMood(item.id)}
                    className={`h-10 rounded-lg text-xs inline-flex items-center justify-center gap-1 border transition ${active ? 'bg-white/20 border-white/40 text-white' : 'bg-slate-900/40 border-slate-700 text-slate-200'}`}
                  >
                    <Icon size={13} /> {item.label}
                  </button>
                )
              })}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2"><Waves size={15} /> Clima local</h2>
            {weather ? (
              <div className="mt-3">
                <p className="text-lg font-semibold text-white">{weather.weatherLabel}</p>
                <p className="text-sm text-slate-300">{weather.city} • {Math.round(weather.temperature)}°C</p>
                <p className="mt-2 text-xs text-slate-400">Sugestao: dia ideal para registrar um moment com sua vibe atual.</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-3">Permita geolocalizacao para ver a previsao local.</p>
            )}
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2"><Users size={15} /> Insights em tempo real</h2>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <p className="text-[11px] text-slate-400">Usuarios online agora</p>
                <p className="text-lg text-white font-semibold">{insights.onlineNow}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <p className="text-[11px] text-slate-400">Visualizacoes (estimado) do ultimo post</p>
                <p className="text-lg text-white font-semibold">{insights.lastPostViews}</p>
              </div>
            </div>
          </article>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={action.action}
                className={`h-20 rounded-2xl border bg-gradient-to-br p-4 text-left transition hover:scale-[1.01] hover:brightness-110 ${action.className}`}
              >
                <Icon size={18} />
                <p className="mt-2 text-sm font-medium">{action.label}</p>
              </button>
            )
          })}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <article className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2"><MessageCircle size={16} /> Conversas recentes</h2>
              <button onClick={() => navigate('/chat')} className="text-xs text-primary hover:text-primary/80">Ver todas</button>
            </div>

            {conversations.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma conversa recente.</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/chat/${item.userId}`)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left hover:border-slate-700 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={item.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.username}`}
                          alt={item.username}
                          className="w-8 h-8 rounded-full"
                        />
                        <div className="min-w-0">
                          <p className="text-xs text-white font-medium truncate">{item.fullName}</p>
                          <p className="text-[11px] text-slate-400 truncate">{item.lastMessage || 'Sem mensagens'}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[11px] text-slate-500">{formatRelative(item.lastMessageTime)}</p>
                        {item.unreadCount > 0 && <p className="text-[11px] text-primary">{item.unreadCount} nova(s)</p>}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] inline-flex items-center gap-1 text-slate-400">
                      <span className={`w-1.5 h-1.5 rounded-full ${item.isOnline ? 'bg-green-500' : 'bg-slate-600'}`} />
                      {item.isOnline ? 'Online' : 'Offline'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </article>

          <article className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2"><Bell size={16} /> Notificacoes</h2>
              <button onClick={() => navigate('/notifications')} className="text-xs text-primary hover:text-primary/80">Abrir</button>
            </div>

            {notifications.length === 0 ? (
              <p className="text-xs text-slate-400">Sem notificacoes no momento.</p>
            ) : (
              <div className="space-y-2">
                {notifications.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-xl border px-3 py-2 ${item.isRead ? 'border-slate-800 bg-slate-950/50' : 'border-primary/30 bg-primary/10'}`}
                  >
                    <p className="text-xs text-white">{item.content}</p>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="inline-flex items-center gap-1"><Sparkles size={12} /> {item.type}</span>
                      <span>{formatRelative(item.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="xl:col-span-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2"><Waves size={16} /> Music em alta</h2>
              <button onClick={() => navigate('/music')} className="text-xs text-primary hover:text-primary/80">Ir para music</button>
            </div>

            {musicItems.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma musica carregada.</p>
            ) : (
              <div className="space-y-2">
                {musicItems.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => navigate('/music')}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left hover:border-slate-700 transition"
                  >
                    <div className="flex items-center gap-2">
                      {track.albumCover ? (
                        <img src={toMediaUrl(track.albumCover)} alt={track.title} className="w-9 h-9 rounded-md object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-md bg-slate-800 inline-flex items-center justify-center"><Music2 size={14} className="text-slate-500" /></div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-white font-medium truncate">{track.title}</p>
                        <p className="text-[11px] text-slate-400 truncate">{track.artist}</p>
                      </div>
                      <span className="ml-auto text-[11px] text-slate-500">{formatRelative(track.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2"><Compass size={15} /> Eventos locais e culturais</h2>
            {events.length === 0 ? (
              <p className="text-xs text-slate-400 mt-3">Sem eventos detectados perto agora. Ative nearby para ver mais.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {events.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => navigate('/nearby')}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-left hover:border-slate-700 transition"
                  >
                    <p className="text-sm text-white font-medium truncate">{event.title}</p>
                    <p className="text-[11px] text-slate-400 truncate">{event.subtitle}</p>
                    {Number.isFinite(event.distanceKm) && <p className="text-[11px] text-primary mt-1">{event.distanceKm?.toFixed(1)} km</p>}
                  </button>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2"><HeartPulse size={15} /> Mini widgets de bem-estar</h2>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400 inline-flex items-center gap-1"><Droplets size={12} /> Hidratacao</p>
                <p className="text-lg text-white font-semibold mt-1">{hydrationCount} copo(s)</p>
                <button onClick={() => setHydrationCount((prev) => prev + 1)} className="mt-2 h-8 px-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs text-white">+ Agua</button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Pausa ativa</p>
                <p className="text-lg text-white font-semibold mt-1">{breakReminderOn ? `${minutesToBreak} min` : 'Off'}</p>
                <button
                  onClick={() => {
                    setBreakReminderOn((prev) => !prev)
                    setMinutesToBreak(20)
                  }}
                  className={`mt-2 h-8 px-2 rounded-lg text-xs text-white ${breakReminderOn ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-700 hover:bg-slate-600'}`}
                >
                  {breakReminderOn ? 'Desativar' : 'Ativar'}
                </button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Respiracao guiada</p>
                <p className="text-sm text-white font-semibold mt-1">{breathingRunning ? (breathingPhase === 'inspire' ? 'Inspire...' : 'Expire...') : 'Pronto'}</p>
                <button
                  onClick={() => setBreathingRunning((prev) => !prev)}
                  className={`mt-2 h-8 px-2 rounded-lg text-xs text-white ${breathingRunning ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                >
                  {breathingRunning ? 'Parar' : 'Iniciar'}
                </button>
              </div>
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
