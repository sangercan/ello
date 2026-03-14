import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@store/authStore'
import apiClient from '@services/api'
import { requestEssentialPermissions } from '@services/permissions'
import { registerPushDevice } from '@services/pushNotifications'
import { toast } from 'react-hot-toast'
import { resolveMediaUrl } from '@/utils/mediaUrl'
import { DEFAULT_MOOD, getMoodAvatarRingStyle, isMoodType, moodTheme, type MoodType } from '@/utils/mood'
import {
  Bell,
  CalendarDays,
  CheckSquare2,
  Coffee,
  Compass,
  Droplets,
  Dumbbell,
  ExternalLink,
  FileText,
  Heart,
  HeartPulse,
  MapPinned,
  MessageCircle,
  Moon,
  Music2,
  PartyPopper,
  Palette,
  Plus,
  PlusCircle,
  Square,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Users,
  UserPlus,
  Wallet,
  Waves,
  Zap,
} from 'lucide-react'
const DASHBOARD_CACHE_KEY = 'ello:cache:dashboard:v1'
const DASHBOARD_REQUEST_TIMEOUT_MS = 4500
const DASHBOARD_NOTIFICATIONS_TIMEOUT_MS = 7000
const DASHBOARD_CONVERSATIONS_TIMEOUT_MS = 6500
const DASHBOARD_PLAN_KEY = 'ello:dashboard:daily-plan:v1'
const DASHBOARD_GOALS_KEY = 'ello:dashboard:personal-goals:v1'
const DASHBOARD_EXPENSES_KEY = 'ello:dashboard:expenses:v1'
const DASHBOARD_SPENDING_LIMIT_KEY = 'ello:dashboard:spending-limit:v1'
const OVERPASS_REQUEST_TIMEOUT_MS = 7000
const OVERPASS_ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
]

type ConversationPreview = {
  id: number
  userId: number
  username: string
  fullName: string
  avatarUrl?: string
  mood?: string | null
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
  latitude?: number
  longitude?: number
}

type DailyPlanItem = {
  id: string
  title: string
  time: string
  done: boolean
}

type PersonalGoal = {
  id: string
  title: string
  current: number
  target: number
}

type ExpenseEntry = {
  id: string
  label: string
  amount: number
  kind: 'expense' | 'income'
  createdAt: string
}

type SuggestedPerson = {
  id: number
  fullName: string
  username: string
}

type NearbySpot = {
  id: string
  name: string
  latitude: number
  longitude: number
  distanceKm?: number
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

const withTimeout = <T,>(promise: Promise<T>, timeoutMs = DASHBOARD_REQUEST_TIMEOUT_MS): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error('dashboard-request-timeout'))
    }, timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
}

const fetchOverpassJson = async (queryBody: string) => {
  const errors: string[] = []

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, OVERPASS_REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
        },
        body: queryBody,
        signal: controller.signal,
      })

      if (!response.ok) {
        errors.push(`${endpoint}:${response.status}`)
        continue
      }

      return await response.json()
    } catch (error: any) {
      const reason = String(error?.name || error?.message || 'request-failed')
      errors.push(`${endpoint}:${reason}`)
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  throw new Error(`overpass-unavailable:${errors.join('|')}`)
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

const defaultDailyPlan: DailyPlanItem[] = [
  { id: 'plan-checkin', title: 'Checar mensagens importantes', time: '09:00', done: false },
  { id: 'plan-focus', title: 'Publicar um moment do dia', time: '12:30', done: false },
  { id: 'plan-network', title: 'Responder 3 novas conexoes', time: '18:00', done: false },
]

const defaultPersonalGoals: PersonalGoal[] = [
  { id: 'goal-saude', title: 'Treino da semana', current: 0, target: 5 },
  { id: 'goal-networking', title: 'Novas conexoes', current: 0, target: 4 },
  { id: 'goal-conteudo', title: 'Posts no mes', current: 0, target: 12 },
]

const parseStoredArray = <T,>(value: string | null, fallback: T[]): T[] => {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

const parseStoredNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadius = 6371
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadius * c
}

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const mood = isMoodType(user?.mood) ? user.mood : DEFAULT_MOOD
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

  const [weather, setWeather] = useState<WeatherWidget | null>(null)
  const [insights, setInsights] = useState<InsightWidget>({ onlineNow: 0, lastPostViews: 0 })
  const [events, setEvents] = useState<EventWidget[]>([])

  const [hydrationCount, setHydrationCount] = useState(0)
  const [breakReminderOn, setBreakReminderOn] = useState(false)
  const [minutesToBreak, setMinutesToBreak] = useState(20)
  const [breathingRunning, setBreathingRunning] = useState(false)
  const [breathingPhase, setBreathingPhase] = useState<'inspire' | 'expire'>('inspire')

  const [dailyPlan, setDailyPlan] = useState<DailyPlanItem[]>(() => {
    if (typeof window === 'undefined') return defaultDailyPlan
    return parseStoredArray(window.localStorage.getItem(DASHBOARD_PLAN_KEY), defaultDailyPlan)
  })
  const [planTitleInput, setPlanTitleInput] = useState('')
  const [planTimeInput, setPlanTimeInput] = useState('09:00')

  const [personalGoals, setPersonalGoals] = useState<PersonalGoal[]>(() => {
    if (typeof window === 'undefined') return defaultPersonalGoals
    return parseStoredArray(window.localStorage.getItem(DASHBOARD_GOALS_KEY), defaultPersonalGoals)
  })
  const [goalTitleInput, setGoalTitleInput] = useState('')
  const [goalTargetInput, setGoalTargetInput] = useState('3')

  const [expenses, setExpenses] = useState<ExpenseEntry[]>(() => {
    if (typeof window === 'undefined') return []
    return parseStoredArray(window.localStorage.getItem(DASHBOARD_EXPENSES_KEY), [])
  })
  const [expenseLabelInput, setExpenseLabelInput] = useState('')
  const [expenseAmountInput, setExpenseAmountInput] = useState('')
  const [expenseKindInput, setExpenseKindInput] = useState<'expense' | 'income'>('expense')
  const [dailySpendingLimit, setDailySpendingLimit] = useState(() => {
    if (typeof window === 'undefined') return 150
    return parseStoredNumber(window.localStorage.getItem(DASHBOARD_SPENDING_LIMIT_KEY), 150)
  })

  const [suggestedPeople, setSuggestedPeople] = useState<SuggestedPerson[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [followLoadingId, setFollowLoadingId] = useState<number | null>(null)

  const [nearbyCafes, setNearbyCafes] = useState<NearbySpot[]>([])
  const [nearbyGyms, setNearbyGyms] = useState<NearbySpot[]>([])
  const [todayEventsNearby, setTodayEventsNearby] = useState<NearbySpot[]>([])
  const [nearbyLoading, setNearbyLoading] = useState(false)

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
    try {
      window.localStorage.setItem(DASHBOARD_PLAN_KEY, JSON.stringify(dailyPlan))
    } catch {
      // Ignore quota/storage errors.
    }
  }, [dailyPlan])

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_GOALS_KEY, JSON.stringify(personalGoals))
    } catch {
      // Ignore quota/storage errors.
    }
  }, [personalGoals])

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_EXPENSES_KEY, JSON.stringify(expenses))
    } catch {
      // Ignore quota/storage errors.
    }
  }, [expenses])

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_SPENDING_LIMIT_KEY, String(dailySpendingLimit))
    } catch {
      // Ignore quota/storage errors.
    }
  }, [dailySpendingLimit])

  useEffect(() => {
    let hasHydratedCache = false
    try {
      const rawCache = window.sessionStorage.getItem(DASHBOARD_CACHE_KEY)
      if (rawCache) {
        const parsed = JSON.parse(rawCache)
        if (parsed?.stats) {
          setStats(parsed.stats)
          setConversations(Array.isArray(parsed.conversations) ? parsed.conversations : [])
          setNotifications(Array.isArray(parsed.notifications) ? parsed.notifications : [])
          setMusicItems(Array.isArray(parsed.musicItems) ? parsed.musicItems : [])
          if (parsed.weather) setWeather(parsed.weather)
          if (parsed.insights) setInsights(parsed.insights)
          if (Array.isArray(parsed.events)) setEvents(parsed.events)
          setLoading(false)
          hasHydratedCache = true
        }
      }
    } catch {
      // Ignore corrupted cache.
    }

    void loadDashboard(hasHydratedCache)
    void loadWeatherWidget()
    void loadEventsWidget()
    void loadSuggestedPeople()
    void loadNearbyMapWidgets()
    void loadRealtimeInsights()

    const realtimeTimer = window.setInterval(() => {
      void loadRealtimeInsights()
    }, 20000)

    return () => window.clearInterval(realtimeTimer)
  }, [])

  const loadDashboard = async (background = false) => {
    try {
      if (!background) setLoading(true)

      const [momentsRes, vibesRes, conversationsRes, notificationsRes, musicRes] = await Promise.allSettled([
        withTimeout(apiClient.getMoments(1, 8)),
        withTimeout(apiClient.getVibes(1, 8)),
        withTimeout(apiClient.getConversations(1, 12), DASHBOARD_CONVERSATIONS_TIMEOUT_MS),
        withTimeout(apiClient.getNotifications(1, 12), DASHBOARD_NOTIFICATIONS_TIMEOUT_MS),
        withTimeout(apiClient.getMusicFeed(1, 12)),
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
        avatarUrl: resolveMediaUrl(conv.other_user?.avatar_url),
        mood: conv.other_user?.mood || null,
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

      const nextConversations = conversationsRes.status === 'fulfilled' ? mappedConversations.slice(0, 6) : conversations
      const nextNotifications = notificationsRes.status === 'fulfilled' ? mappedNotifications.slice(0, 6) : notifications
      const nextMusic = musicRes.status === 'fulfilled' ? mappedMusic : musicItems

      setConversations(nextConversations)
      setNotifications(nextNotifications)
      setMusicItems(nextMusic)

      setStats({
        momentsCount: momentsRes.status === 'fulfilled' ? extractTotal(momentsPayload, momentsList.length) : stats.momentsCount,
        vibesCount: vibesRes.status === 'fulfilled' ? extractTotal(vibesPayload, vibesList.length) : stats.vibesCount,
        unreadMessages: nextConversations.reduce((acc, item) => acc + Number(item.unreadCount || 0), 0),
        unreadNotifications: nextNotifications.filter((item) => !item.isRead).length,
        musicCount: musicRes.status === 'fulfilled' ? extractTotal(musicPayload, musicList.length) : stats.musicCount,
      })

      const myId = Number(user?.id)
      let latestMoment: any | null = null
      for (const moment of momentsList) {
        const authorId = Number(moment?.author_id || moment?.user_id || moment?.author?.id)
        if (authorId !== myId) continue

        if (!latestMoment) {
          latestMoment = moment
          continue
        }

        const currentTs = new Date(moment?.created_at || 0).getTime()
        const latestTs = new Date(latestMoment?.created_at || 0).getTime()
        if (currentTs > latestTs) {
          latestMoment = moment
        }
      }
      const views = Number(
        latestMoment?.views_count ||
        (Number(latestMoment?.likes_count || 0) + Number(latestMoment?.comments_count || 0))
      )
      setInsights((prev) => ({ ...prev, lastPostViews: Number.isFinite(views) ? views : 0 }))

      try {
        window.sessionStorage.setItem(
          DASHBOARD_CACHE_KEY,
          JSON.stringify({
              stats: {
                momentsCount: momentsRes.status === 'fulfilled' ? extractTotal(momentsPayload, momentsList.length) : stats.momentsCount,
                vibesCount: vibesRes.status === 'fulfilled' ? extractTotal(vibesPayload, vibesList.length) : stats.vibesCount,
                unreadMessages: nextConversations.reduce((acc, item) => acc + Number(item.unreadCount || 0), 0),
                unreadNotifications: nextNotifications.filter((item) => !item.isRead).length,
                musicCount: musicRes.status === 'fulfilled' ? extractTotal(musicPayload, musicList.length) : stats.musicCount,
              },
              conversations: nextConversations,
              notifications: nextNotifications,
              musicItems: nextMusic,
              weather,
              insights,
              events,
            ts: Date.now(),
          })
        )
      } catch {
        // Ignore storage quota errors.
      }

      if (notificationsRes.status === 'rejected') {
        console.info('[Dashboard] notificacoes temporariamente indisponiveis', notificationsRes.reason)
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
        latitude: Number(item.latitude),
        longitude: Number(item.longitude),
      }))
      setEvents(mapped)
    } catch {
      setEvents([])
    }
  }

  const fetchMapSpots = async (
    latitude: number,
    longitude: number,
    queryBody: string,
    fallbackName: string
  ): Promise<NearbySpot[]> => {
    const payload = await fetchOverpassJson(queryBody)
    const elements = Array.isArray(payload?.elements) ? payload.elements : []

    const spots = elements
      .map((element: any, index: number) => {
        const lat = Number(element?.lat ?? element?.center?.lat)
        const lon = Number(element?.lon ?? element?.center?.lon)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

        const name = String(element?.tags?.name || `${fallbackName} ${index + 1}`)
        return {
          id: `${fallbackName}-${element?.id || index}`,
          name,
          latitude: lat,
          longitude: lon,
          distanceKm: distanceKm(latitude, longitude, lat, lon),
        } as NearbySpot
      })
      .filter(Boolean) as NearbySpot[]

    return spots.sort((a, b) => Number(a.distanceKm || 0) - Number(b.distanceKm || 0)).slice(0, 6)
  }

  const loadSuggestedPeople = async () => {
    try {
      setSuggestionsLoading(true)
      const response = await (apiClient as any).get('/users/suggestions')
      const payload = Array.isArray(response?.data) ? response.data : []

      setSuggestedPeople(
        payload.slice(0, 8).map((item: any) => ({
          id: Number(item.id),
          fullName: String(item.full_name || item.username || 'Pessoa sugerida'),
          username: String(item.username || ''),
        }))
      )
    } catch {
      setSuggestedPeople([])
    } finally {
      setSuggestionsLoading(false)
    }
  }

  const loadNearbyMapWidgets = async () => {
    try {
      setNearbyLoading(true)
      const storedLat = Number(window.localStorage.getItem('user_latitude'))
      const storedLon = Number(window.localStorage.getItem('user_longitude'))
      let latitude = Number.isFinite(storedLat) ? storedLat : NaN
      let longitude = Number.isFinite(storedLon) ? storedLon : NaN

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        try {
          const coords = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error('geolocation-not-supported'))
              return
            }

            navigator.geolocation.getCurrentPosition(resolve, reject, {
              maximumAge: 5 * 60 * 1000,
              timeout: 7000,
            })
          })

          latitude = Number(coords.coords.latitude)
          longitude = Number(coords.coords.longitude)
          window.localStorage.setItem('user_latitude', String(latitude))
          window.localStorage.setItem('user_longitude', String(longitude))

          try {
            await apiClient.updateUserLocation(latitude, longitude)
          } catch {
            // If backend update fails, still keep local map widgets.
          }
        } catch {
          setNearbyCafes([])
          setNearbyGyms([])
          setTodayEventsNearby([])
          return
        }
      }

      const cafeQuery = `
[out:json][timeout:12];
(
  node["amenity"="cafe"](around:5000,${latitude},${longitude});
  way["amenity"="cafe"](around:5000,${latitude},${longitude});
);
out center 8;
`
      const gymQuery = `
[out:json][timeout:12];
(
  node["amenity"="gym"](around:7000,${latitude},${longitude});
  node["leisure"="fitness_centre"](around:7000,${latitude},${longitude});
  way["amenity"="gym"](around:7000,${latitude},${longitude});
  way["leisure"="fitness_centre"](around:7000,${latitude},${longitude});
);
out center 8;
`

      const [cafesResult, gymsResult, placesResult] = await Promise.allSettled([
        fetchMapSpots(latitude, longitude, cafeQuery, 'Cafe'),
        fetchMapSpots(latitude, longitude, gymQuery, 'Academia'),
        apiClient.getNearbyPlaces(30),
      ])

      if (cafesResult.status === 'fulfilled') {
        setNearbyCafes(cafesResult.value)
      } else {
        setNearbyCafes([])
      }

      if (gymsResult.status === 'fulfilled') {
        setNearbyGyms(gymsResult.value)
      } else {
        setNearbyGyms([])
      }

      const placesPayload = placesResult.status === 'fulfilled' ? extractList(placesResult.value.data) : []
      const now = new Date()
      const todayPlaces = placesPayload.filter((place: any) => {
        const createdAt = place?.latest_created_at ? new Date(place.latest_created_at) : null
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false
        return (
          createdAt.getDate() === now.getDate() &&
          createdAt.getMonth() === now.getMonth() &&
          createdAt.getFullYear() === now.getFullYear()
        )
      })

      const sourceList = todayPlaces.length > 0 ? todayPlaces : placesPayload
      const mappedEvents = sourceList.slice(0, 6).map((place: any, index: number) => ({
        id: `event-map-${index}-${place.location_label || 'local'}`,
        name: String(place.location_label || 'Evento local'),
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
        distanceKm: Number(place.distance_km || 0),
      }))
      setTodayEventsNearby(mappedEvents.filter((item: NearbySpot) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)))
    } catch {
      setNearbyCafes([])
      setNearbyGyms([])
      setTodayEventsNearby([])
    } finally {
      setNearbyLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([
      loadDashboard(true),
      loadWeatherWidget(),
      loadEventsWidget(),
      loadSuggestedPeople(),
      loadNearbyMapWidgets(),
    ])
    toast.success('Dashboard atualizado')
  }

  const handleRequestAllPermissions = async () => {
    const labels: Record<string, string> = {
      camera: 'camera',
      microphone: 'microfone',
      location: 'localizacao',
      notifications: 'notificacoes',
    }

    try {
      const result = await requestEssentialPermissions()
      const blocked = Object.entries(result)
        .filter(([, status]) => status !== 'granted')
        .map(([permission]) => labels[permission] || permission)

      if (blocked.length === 0) {
        if (result.notifications === 'granted') {
          await registerPushDevice()
        }
        toast.success('Permissoes liberadas para camera, microfone, localizacao e notificacoes.')
        return
      }

      toast(`Permissoes pendentes: ${blocked.join(', ')}`)
    } catch {
      toast.error('Nao foi possivel validar permissoes agora.')
    }
  }

  const handleChangeMood = async (nextMood: MoodType) => {
    if (nextMood === mood) return

    try {
      const response = await apiClient.updateProfile({ mood: nextMood })
      const nextUser = response?.data || response
      if (nextUser && typeof nextUser === 'object') {
        useAuthStore.setState({ user: nextUser })
      }
      toast.success(`Humor atualizado para ${moodTheme[nextMood].label}.`)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      toast.error(detail || 'Nao foi possivel atualizar seu humor agora.')
    }
  }

  const togglePlanItem = (id: string) => {
    setDailyPlan((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)))
  }

  const addPlanItem = () => {
    const title = planTitleInput.trim()
    if (!title) {
      toast.error('Informe uma atividade para o planejamento.')
      return
    }

    setDailyPlan((prev) => ([
      ...prev,
      {
        id: `plan-${Date.now()}`,
        title,
        time: planTimeInput || '09:00',
        done: false,
      },
    ]))
    setPlanTitleInput('')
  }

  const removePlanItem = (id: string) => {
    setDailyPlan((prev) => prev.filter((item) => item.id !== id))
  }

  const updateGoalProgress = (id: string, delta: number) => {
    setPersonalGoals((prev) =>
      prev.map((goal) => {
        if (goal.id !== id) return goal
        const nextValue = Math.max(0, Math.min(goal.target, goal.current + delta))
        return { ...goal, current: nextValue }
      })
    )
  }

  const addPersonalGoal = () => {
    const title = goalTitleInput.trim()
    const target = Number(goalTargetInput)

    if (!title) {
      toast.error('Informe o nome da meta.')
      return
    }

    if (!Number.isFinite(target) || target <= 0) {
      toast.error('Defina um alvo valido para a meta.')
      return
    }

    setPersonalGoals((prev) => ([
      ...prev,
      {
        id: `goal-${Date.now()}`,
        title,
        current: 0,
        target: Math.round(target),
      },
    ]))
    setGoalTitleInput('')
    setGoalTargetInput('3')
  }

  const removeGoal = (id: string) => {
    setPersonalGoals((prev) => prev.filter((goal) => goal.id !== id))
  }

  const addExpenseEntry = () => {
    const label = expenseLabelInput.trim()
    const amount = Number(expenseAmountInput.replace(',', '.'))

    if (!label) {
      toast.error('Informe uma descricao para o gasto.')
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Informe um valor valido.')
      return
    }

    setExpenses((prev) => ([
      {
        id: `exp-${Date.now()}`,
        label,
        amount,
        kind: expenseKindInput,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]))
    setExpenseLabelInput('')
    setExpenseAmountInput('')
  }

  const removeExpenseEntry = (id: string) => {
    setExpenses((prev) => prev.filter((entry) => entry.id !== id))
  }

  const followSuggestedPerson = async (personId: number) => {
    try {
      setFollowLoadingId(personId)
      await apiClient.followUser(personId)
      setSuggestedPeople((prev) => prev.filter((person) => person.id !== personId))
      toast.success('Pessoa seguida com sucesso.')
    } catch {
      toast.error('Nao foi possivel seguir essa pessoa agora.')
    } finally {
      setFollowLoadingId(null)
    }
  }

  const openMapForSpot = (spot: NearbySpot) => {
    const query = encodeURIComponent(`${spot.latitude},${spot.longitude}`)
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank', 'noopener,noreferrer')
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
    {
      label: 'Liberar permissoes',
      icon: ShieldCheck,
      className: 'from-emerald-500/20 to-teal-500/10 border-emerald-400/30 text-emerald-200',
      action: () => void handleRequestAllPermissions(),
    },
  ]), [navigate, handleRequestAllPermissions])

  const moodItems: Array<{ id: MoodType; label: string; icon: any }> = [
    { id: 'feliz', label: 'Feliz', icon: Sun },
    { id: 'focado', label: 'Focado', icon: Target },
    { id: 'relaxando', label: 'Relaxando', icon: Moon },
    { id: 'animado', label: 'Animado', icon: Zap },
    { id: 'calmo', label: 'Calmo', icon: Waves },
    { id: 'pensativo', label: 'Pensativo', icon: Palette },
    { id: 'cansado', label: 'Cansado', icon: HeartPulse },
    { id: 'triste', label: 'Triste', icon: Heart },
  ]

  const planCompleted = useMemo(
    () => dailyPlan.filter((item) => item.done).length,
    [dailyPlan]
  )

  const goalsCompletion = useMemo(() => {
    if (personalGoals.length === 0) return 0
    const completed = personalGoals.filter((goal) => goal.current >= goal.target).length
    return Math.round((completed / personalGoals.length) * 100)
  }, [personalGoals])

  const todayExpenses = useMemo(
    () =>
      expenses.filter((entry) => {
        const date = new Date(entry.createdAt)
        const now = new Date()
        return (
          date.getDate() === now.getDate() &&
          date.getMonth() === now.getMonth() &&
          date.getFullYear() === now.getFullYear()
        )
      }),
    [expenses]
  )

  const spendingSummary = useMemo(() => {
    const outgoing = todayExpenses
      .filter((entry) => entry.kind === 'expense')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const incoming = todayExpenses
      .filter((entry) => entry.kind === 'income')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const balance = incoming - outgoing
    const usage = dailySpendingLimit > 0 ? Math.min(100, Math.round((outgoing / dailySpendingLimit) * 100)) : 0
    return { outgoing, incoming, balance, usage }
  }, [todayExpenses, dailySpendingLimit])

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
                {greetingByHour()}, {user?.full_name?.split(' ')[0] || ''}
              </h1>
              <p className="mt-2 text-sm text-slate-300 max-w-2xl">
                {weather ? `${weather.weatherLabel} em ${weather.city}, ${Math.round(weather.temperature)}Â°C. ` : ''}
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
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {moodItems.map((item) => {
                const Icon = item.icon
                const active = mood === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => void handleChangeMood(item.id)}
                    className={`h-10 rounded-lg text-xs inline-flex items-center justify-center gap-1 border transition ${active ? 'bg-white/20 border-white/40 text-white' : 'bg-slate-900/40 border-slate-700 text-slate-200'}`}
                  >
                    <Icon size={13} /> {item.label}
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-[11px] text-slate-300">
              A cor do humor aparece individualmente no seu perfil e no chat.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2"><Waves size={15} /> Clima local</h2>
            {weather ? (
              <div className="mt-3">
                <p className="text-lg font-semibold text-white">{weather.weatherLabel}</p>
                <p className="text-sm text-slate-300">{weather.city}  {Math.round(weather.temperature)}°C</p>
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

        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                <CalendarDays size={15} /> Planejamento do dia
              </h2>
              <span className="text-xs text-slate-400">{planCompleted}/{dailyPlan.length} concluidas</span>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="time"
                value={planTimeInput}
                onChange={(event) => setPlanTimeInput(event.target.value)}
                className="h-10 rounded-lg bg-slate-950/70 border border-slate-700 px-2 text-xs text-slate-100 w-24"
              />
              <input
                type="text"
                value={planTitleInput}
                onChange={(event) => setPlanTitleInput(event.target.value)}
                placeholder="Nova atividade"
                className="h-10 flex-1 rounded-lg bg-slate-950/70 border border-slate-700 px-3 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <button
                onClick={addPlanItem}
                className="h-10 px-3 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 inline-flex items-center gap-1 text-xs"
              >
                <Plus size={14} /> Adicionar
              </button>
            </div>

            {dailyPlan.length === 0 ? (
              <p className="text-xs text-slate-400 mt-3">Sem tarefas para hoje.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {dailyPlan.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center gap-2"
                  >
                    <button
                      onClick={() => togglePlanItem(item.id)}
                      className="text-primary hover:text-primary/80 transition"
                      title={item.done ? 'Desmarcar tarefa' : 'Marcar tarefa'}
                    >
                      {item.done ? <CheckSquare2 size={16} /> : <Square size={16} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs truncate ${item.done ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{item.title}</p>
                      <p className="text-[11px] text-slate-500">{item.time}</p>
                    </div>
                    <button
                      onClick={() => removePlanItem(item.id)}
                      className="text-[11px] text-slate-500 hover:text-rose-300 transition"
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                <Target size={15} /> Metas pessoais
              </h2>
              <span className="text-xs text-slate-400">{goalsCompletion}% concluidas</span>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={goalTitleInput}
                onChange={(event) => setGoalTitleInput(event.target.value)}
                placeholder="Nova meta"
                className="h-10 flex-1 rounded-lg bg-slate-950/70 border border-slate-700 px-3 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <input
                type="number"
                value={goalTargetInput}
                min={1}
                onChange={(event) => setGoalTargetInput(event.target.value)}
                className="h-10 w-20 rounded-lg bg-slate-950/70 border border-slate-700 px-2 text-xs text-slate-100"
              />
              <button
                onClick={addPersonalGoal}
                className="h-10 px-3 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 inline-flex items-center gap-1 text-xs"
              >
                <Plus size={14} /> Meta
              </button>
            </div>

            {personalGoals.length === 0 ? (
              <p className="text-xs text-slate-400 mt-3">Sem metas definidas.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {personalGoals.map((goal) => {
                  const progress = goal.target > 0 ? Math.min(100, Math.round((goal.current / goal.target) * 100)) : 0
                  return (
                    <div key={goal.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-100 truncate">{goal.title}</p>
                        <button
                          onClick={() => removeGoal(goal.id)}
                          className="text-[11px] text-slate-500 hover:text-rose-300 transition"
                        >
                          remover
                        </button>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-[11px] text-slate-400">{goal.current}/{goal.target}</p>
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => updateGoalProgress(goal.id, -1)}
                            className="h-7 w-7 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700"
                            title="Reduzir progresso"
                          >
                            -
                          </button>
                          <button
                            onClick={() => updateGoalProgress(goal.id, 1)}
                            className="h-7 w-7 rounded-md bg-primary/20 text-primary hover:bg-primary/30"
                            title="Aumentar progresso"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </article>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                <Wallet size={15} /> Controle rapido de gastos
              </h2>
              <span className="text-xs text-slate-400">
                Limite dia: R$ {dailySpendingLimit.toFixed(2)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr,120px,120px,auto] gap-2">
              <input
                type="text"
                value={expenseLabelInput}
                onChange={(event) => setExpenseLabelInput(event.target.value)}
                placeholder="Ex: cafe, uber, almoco"
                className="h-10 rounded-lg bg-slate-950/70 border border-slate-700 px-3 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <input
                type="number"
                value={expenseAmountInput}
                min={0}
                step="0.01"
                onChange={(event) => setExpenseAmountInput(event.target.value)}
                placeholder="Valor"
                className="h-10 rounded-lg bg-slate-950/70 border border-slate-700 px-3 text-xs text-slate-100"
              />
              <select
                value={expenseKindInput}
                onChange={(event) => setExpenseKindInput(event.target.value === 'income' ? 'income' : 'expense')}
                className="h-10 rounded-lg bg-slate-950/70 border border-slate-700 px-2 text-xs text-slate-100"
              >
                <option value="expense">Gasto</option>
                <option value="income">Entrada</option>
              </select>
              <button
                onClick={addExpenseEntry}
                className="h-10 px-3 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 inline-flex items-center justify-center gap-1 text-xs"
              >
                <Plus size={14} /> Lancar
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Saida hoje</p>
                <p className="text-sm text-rose-300 font-semibold">R$ {spendingSummary.outgoing.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Entrada hoje</p>
                <p className="text-sm text-emerald-300 font-semibold">R$ {spendingSummary.incoming.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Saldo hoje</p>
                <p className={`text-sm font-semibold ${spendingSummary.balance >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  R$ {spendingSummary.balance.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Uso limite</p>
                <p className="text-sm text-white font-semibold">{spendingSummary.usage}%</p>
              </div>
            </div>

            <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className={`h-full ${spendingSummary.usage >= 85 ? 'bg-rose-500' : 'bg-primary'}`} style={{ width: `${spendingSummary.usage}%` }} />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <label htmlFor="spending-limit-input" className="text-[11px] text-slate-400">Limite diario:</label>
              <input
                id="spending-limit-input"
                type="number"
                min={0}
                step="1"
                value={dailySpendingLimit}
                onChange={(event) => {
                  const parsed = Number(event.target.value)
                  setDailySpendingLimit(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
                }}
                className="h-8 w-24 rounded-md bg-slate-950/70 border border-slate-700 px-2 text-xs text-slate-100"
              />
            </div>

            {todayExpenses.length === 0 ? (
              <p className="text-xs text-slate-400 mt-3">Sem lancamentos hoje.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-52 overflow-y-auto pr-1">
                {todayExpenses.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 flex items-center gap-2">
                    <FileText size={13} className="text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-100 truncate">{entry.label}</p>
                      <p className="text-[11px] text-slate-500">{new Date(entry.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <p className={`text-xs font-semibold ${entry.kind === 'income' ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {entry.kind === 'income' ? '+' : '-'} R$ {entry.amount.toFixed(2)}
                    </p>
                    <button
                      onClick={() => removeExpenseEntry(entry.id)}
                      className="text-[11px] text-slate-500 hover:text-rose-300 transition"
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
                <MapPinned size={15} /> Lugares proximos com mapas
              </h2>
              <button
                onClick={() => void loadNearbyMapWidgets()}
                className="text-xs text-primary hover:text-primary/80"
              >
                Atualizar
              </button>
            </div>

            {nearbyLoading ? (
              <p className="text-xs text-slate-400 mt-3">Carregando locais proximos...</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-200 inline-flex items-center gap-1"><Coffee size={13} /> Cafes proximos</p>
                  {nearbyCafes.length === 0 ? (
                    <p className="text-[11px] text-slate-500 mt-2">Sem cafes detectados.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {nearbyCafes.slice(0, 3).map((spot) => (
                        <button
                          key={spot.id}
                          onClick={() => openMapForSpot(spot)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-left hover:border-slate-600 transition"
                        >
                          <p className="text-[11px] text-slate-100 truncate">{spot.name}</p>
                          <p className="text-[10px] text-primary inline-flex items-center gap-1">
                            {spot.distanceKm?.toFixed(1)} km <ExternalLink size={10} />
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-200 inline-flex items-center gap-1"><Dumbbell size={13} /> Academias perto</p>
                  {nearbyGyms.length === 0 ? (
                    <p className="text-[11px] text-slate-500 mt-2">Sem academias detectadas.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {nearbyGyms.slice(0, 3).map((spot) => (
                        <button
                          key={spot.id}
                          onClick={() => openMapForSpot(spot)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-left hover:border-slate-600 transition"
                        >
                          <p className="text-[11px] text-slate-100 truncate">{spot.name}</p>
                          <p className="text-[10px] text-primary inline-flex items-center gap-1">
                            {spot.distanceKm?.toFixed(1)} km <ExternalLink size={10} />
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs text-slate-200 inline-flex items-center gap-1"><PartyPopper size={13} /> Eventos hoje</p>
                  {todayEventsNearby.length === 0 ? (
                    <p className="text-[11px] text-slate-500 mt-2">Sem eventos para hoje.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {todayEventsNearby.slice(0, 3).map((spot) => (
                        <button
                          key={spot.id}
                          onClick={() => openMapForSpot(spot)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-left hover:border-slate-600 transition"
                        >
                          <p className="text-[11px] text-slate-100 truncate">{spot.name}</p>
                          <p className="text-[10px] text-primary inline-flex items-center gap-1">
                            {spot.distanceKm?.toFixed(1)} km <ExternalLink size={10} />
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </article>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white inline-flex items-center gap-2">
              <UserPlus size={15} /> Sugestao de pessoas
            </h2>
            <button
              onClick={() => void loadSuggestedPeople()}
              className="text-xs text-primary hover:text-primary/80"
            >
              Atualizar
            </button>
          </div>

          {suggestionsLoading ? (
            <p className="text-xs text-slate-400 mt-3">Carregando sugestoes...</p>
          ) : suggestedPeople.length === 0 ? (
            <p className="text-xs text-slate-400 mt-3">Sem sugestoes disponiveis agora.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {suggestedPeople.map((person) => (
                <div key={person.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs text-white font-medium truncate">{person.fullName}</p>
                  <p className="text-[11px] text-slate-400 truncate">@{person.username}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => navigate(`/profile/${person.id}`)}
                      className="h-8 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200"
                    >
                      Ver perfil
                    </button>
                    <button
                      onClick={() => void followSuggestedPerson(person.id)}
                      disabled={followLoadingId === person.id}
                      className="h-8 px-2 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 text-[11px] disabled:opacity-60"
                    >
                      {followLoadingId === person.id ? 'Seguindo...' : 'Seguir'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                          style={getMoodAvatarRingStyle(item.mood)}
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
                        <img src={resolveMediaUrl(track.albumCover)} alt={track.title} className="w-9 h-9 rounded-md object-cover" />
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

