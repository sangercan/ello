import { lazy, Suspense, useState, useEffect, useRef, useCallback, type ComponentType } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Capacitor } from '@capacitor/core'
import { useAuthStore } from '@store/authStore'
import apiClient, { RESOLVED_API_BASE_URL } from '@services/api'
import api from '@services/api'
import { registerPushDevice } from '@services/pushNotifications'
import { playNotificationSound } from '@services/alertSounds'
import CallScreen from './components/CallScreen'
import { useCallStore } from '@store/callStore'

// Components
import ProtectedRoute from './components/ProtectedRoute'
import AdminProtectedRoute from './components/AdminProtectedRoute'
import Navbar from './components/Navbar'
import MusicDockPlayer from './components/MusicDockPlayer'
import RouteErrorBoundary from './components/RouteErrorBoundary'

type ImportFactory<T extends ComponentType<any>> = () => Promise<{ default: T }>
type LazyWithPreload<T extends ComponentType<any>> = ReturnType<typeof lazy<T>> & {
  preload: () => Promise<{ default: T }>
}

const CHUNK_RELOAD_KEY = '__ello_chunk_reload__'

const isChunkLoadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return /(chunk|loading css chunk|dynamic imported module|module script failed)/i.test(message)
}

const lazyWithPreload = <T extends ComponentType<any>>(factory: ImportFactory<T>): LazyWithPreload<T> => {
  const safeFactory = async () => {
    try {
      const module = await factory()
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      }
      return module
    } catch (error) {
      if (typeof window !== 'undefined' && isChunkLoadError(error)) {
        const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1'
        if (!alreadyReloaded) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
          window.location.reload()
          return new Promise<{ default: T }>(() => {})
        }
        sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      }
      throw error
    }
  }

  const Component = lazy(safeFactory) as LazyWithPreload<T>
  Component.preload = safeFactory
  return Component
}

const LandingPage = lazyWithPreload(() => import('./pages/LandingPage'))
const LoginPage = lazyWithPreload(() => import('./pages/LoginPage'))
const RegisterPage = lazyWithPreload(() => import('./pages/RegisterPage'))
const DashboardPage = lazyWithPreload(() => import('./pages/DashboardPage'))
const MomentsPage = lazyWithPreload(() => import('./pages/MomentsPage'))
const VibesPage = lazyWithPreload(() => import('./pages/VibesPage'))
const MusicPage = lazyWithPreload(() => import('./pages/MusicPage'))
const ProfilePage = lazyWithPreload(() => import('./pages/ProfilePage'))
const SettingsPage = lazyWithPreload(() => import('./pages/SettingsPage'))
const NearbyPage = lazyWithPreload(() => import('./pages/NearbyPage'))
const ChatPage = lazyWithPreload(() => import('./pages/ChatPage'))
const ConversationsPage = lazyWithPreload(() => import('./pages/ConversationsPage'))
const GroupChatPage = lazyWithPreload(() => import('./pages/GroupChatPage'))
const NotificationsPage = lazyWithPreload(() => import('./pages/NotificationsPage'))
const AdminLoginPage = lazyWithPreload(() => import('./pages/AdminLoginPage'))
const AdminPanelPage = lazyWithPreload(() => import('./pages/AdminPanelPage'))
const PublicInfoPage = lazyWithPreload(() => import('./pages/PublicInfoPage'))

const preloadablePages = [
  LandingPage,
  LoginPage,
  RegisterPage,
  DashboardPage,
  MomentsPage,
  VibesPage,
  MusicPage,
  ProfilePage,
  SettingsPage,
  NearbyPage,
  ChatPage,
  ConversationsPage,
  GroupChatPage,
  NotificationsPage,
  AdminLoginPage,
  AdminPanelPage,
  PublicInfoPage,
]

function App() {
  const resolvedApiBase = RESOLVED_API_BASE_URL
  const configuredWsUrl = (import.meta.env.VITE_WS_URL || '').trim()
  const isNative = Capacitor.getPlatform() !== 'web'
  const isValidNativeWsOrigin = (value: string) => {
    if (!value) return false
    if (!/^(https|wss):\/\//i.test(value)) return false
    try {
      const url = new URL(value)
      const isIpHost = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || isIpHost) return false
      return true
    } catch {
      return false
    }
  }
  const wsOriginCandidate = isNative
    ? (isValidNativeWsOrigin(configuredWsUrl) ? configuredWsUrl : resolvedApiBase)
    : (configuredWsUrl || resolvedApiBase)

  const { initialize, isAuthenticated, user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const appWsRef = useRef<WebSocket | null>(null)
  const chunksPreloadedRef = useRef(false)
  const receiveIncomingCall = useCallStore((state) => state.receiveIncomingCall)
  const activeCall = useCallStore((state) => state.activeCall)

  // Initialize auth state on mount
  useEffect(() => {
    const init = async () => {
      await initialize()
      setLoading(false)
    }
    init()
  }, [initialize])

  // Mark user as online when authenticated
  useEffect(() => {
    if (isAuthenticated && !loading) {
      apiClient.markOnline().catch(err => {
        console.error('[App] Erro ao marcar como online:', err)
      })
    }
  }, [isAuthenticated, loading])

  // Mark user as offline when leaving page or closing browser
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Presence/visibility are handled by websocket disconnect and explicit logout.
      if (isAuthenticated) {
        console.log('[App] 👋 Usuário saindo da página...')
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isAuthenticated])

  // Keep activity pings, but do not auto-hide/auto-logout on inactivity.
  useEffect(() => {
    if (!isAuthenticated || loading) return

    let lastActivityPing = 0

    const onActivity = () => {
      const now = Date.now()

      // Throttle activity ping to backend to at most 1 call/minute.
      if (now - lastActivityPing > 60_000) {
        lastActivityPing = now
        apiClient.markActivity().catch(err => {
          console.error('[App] Erro ao registrar atividade:', err)
        })
      }
    }

    const events = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart']
    events.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onActivity)
    window.addEventListener('focus', onActivity)

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, onActivity))
      document.removeEventListener('visibilitychange', onActivity)
      window.removeEventListener('focus', onActivity)
    }
  }, [isAuthenticated, loading])

  useEffect(() => {
    if (!isAuthenticated || loading) return

    registerPushDevice().catch((error) => {
      console.error('[App] Erro ao registrar push notifications:', error)
    })
  }, [isAuthenticated, loading])

  const handleIncomingCallPayload = useCallback(
    async (payload: any) => {
      if (!payload) return

      const callId = Number(payload.call_id)
      const fromUserId = Number(payload.from_user_id)
      const callType = payload.call_type === 'video' ? 'video' : 'voice'

      if (!Number.isFinite(callId) || !Number.isFinite(fromUserId)) {
        return
      }

      if (activeCall?.callId === callId) {
        return
      }

      try {
        const userPayload = await api.getUser(fromUserId)
        receiveIncomingCall({
          callId,
          callType,
          user: userPayload,
        })
      } catch (error) {
        console.error('Erro ao carregar dados da chamada recebida:', error)
      }
    },
    [activeCall?.callId, receiveIncomingCall]
  )

  // Global WebSocket for realtime events across pages (moments/stories/chat/presence).
  useEffect(() => {
    if (!isAuthenticated || loading || !user?.id) return

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let shouldReconnect = true

    const buildWsUrl = (userId: number) => {
      const shouldForceSecureWs = window.location.protocol === 'https:'
      const base = (wsOriginCandidate || '').trim().replace(/\/+$/, '')
      if (/^wss?:\/\//i.test(base)) {
        const parsed = new URL(base)
        const protocol = shouldForceSecureWs && parsed.protocol === 'ws:' ? 'wss:' : parsed.protocol
        return `${protocol}//${parsed.host}/ws/${userId}`
      }
      if (/^https?:\/\//i.test(base)) {
        const parsed = new URL(base)
        const wsProtocol = shouldForceSecureWs
          ? 'wss:'
          : parsed.protocol === 'https:'
            ? 'wss:'
            : 'ws:'
        return `${wsProtocol}//${parsed.host}/ws/${userId}`
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${protocol}//${window.location.host}/ws/${userId}`
    }

    const connect = () => {
      const ws = new WebSocket(buildWsUrl(user.id))
      appWsRef.current = ws

      ws.onopen = () => {
        ;(window as any).__elloAppWs = ws
        window.dispatchEvent(new CustomEvent('ello:ws:open'))
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 25000)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'moment_created') {
            window.dispatchEvent(new CustomEvent('ello:ws:moment-created', { detail: data }))
            window.dispatchEvent(new CustomEvent('ello:moment-created'))
          }

          if (data.type === 'incoming_call') {
            window.dispatchEvent(new CustomEvent('ello:ws:incoming-call', { detail: data }))
          }

          if (data.type === 'call_signal') {
            window.dispatchEvent(new CustomEvent('ello:ws:call-signal', { detail: data }))
          }

          if (data.type === 'call_status') {
            window.dispatchEvent(new CustomEvent('ello:call:status', { detail: data }))
          }

          if (data.type === 'story_created') {
            window.dispatchEvent(new CustomEvent('ello:ws:story-created', { detail: data }))
            window.dispatchEvent(new CustomEvent('ello:story-created'))
          }

          if (data.type === 'moment_deleted') {
            window.dispatchEvent(new CustomEvent('ello:ws:moment-deleted', { detail: data }))
          }

          if (data.type === 'moment_updated') {
            window.dispatchEvent(new CustomEvent('ello:ws:moment-updated', { detail: data }))
          }

          if (data.type === 'story_deleted') {
            window.dispatchEvent(new CustomEvent('ello:ws:story-deleted', { detail: data }))
          }

          if (data.type === 'story_updated') {
            window.dispatchEvent(new CustomEvent('ello:ws:story-updated', { detail: data }))
          }

          if (data.type === 'vibe_created') {
            window.dispatchEvent(new CustomEvent('ello:ws:vibe-created', { detail: data }))
            window.dispatchEvent(new CustomEvent('ello:vibe-created'))
          }

          if (data.type === 'vibe_updated') {
            window.dispatchEvent(new CustomEvent('ello:ws:vibe-updated', { detail: data }))
          }

          if (data.type === 'vibe_deleted') {
            window.dispatchEvent(new CustomEvent('ello:ws:vibe-deleted', { detail: data }))
          }

          if (data.type === 'comment_created') {
            window.dispatchEvent(new CustomEvent('ello:ws:comment-created', { detail: data }))
          }

          if (data.type === 'comment_updated') {
            window.dispatchEvent(new CustomEvent('ello:ws:comment-updated', { detail: data }))
          }

          if (data.type === 'comment_deleted') {
            window.dispatchEvent(new CustomEvent('ello:ws:comment-deleted', { detail: data }))
          }

          if (data.type === 'content_like_updated') {
            window.dispatchEvent(new CustomEvent('ello:ws:content-like-updated', { detail: data }))
          }

          if (data.type === 'new_message') {
            window.dispatchEvent(new CustomEvent('ello:ws:new-message', { detail: data }))
          }

          if (data.type === 'message_updated') {
            window.dispatchEvent(new CustomEvent('ello:ws:message-updated', { detail: data }))
          }

          if (data.type === 'message_deleted') {
            window.dispatchEvent(new CustomEvent('ello:ws:message-deleted', { detail: data }))
          }

          if (data.type === 'presence_update') {
            window.dispatchEvent(new CustomEvent('ello:ws:presence-update', { detail: data }))
          }

          if (data.type === 'typing') {
            window.dispatchEvent(new CustomEvent('ello:ws:typing', { detail: data }))
          }

          if (data.type === 'notification_created') {
            playNotificationSound()
            window.dispatchEvent(new CustomEvent('ello:ws:notification-created', { detail: data }))
          }

          if (data.type === 'notification_refresh') {
            window.dispatchEvent(new CustomEvent('ello:ws:notification-refresh', { detail: data }))
          }
        } catch (error) {
          console.error('[App] Erro ao processar evento websocket:', error)
        }
      }

      ws.onclose = () => {
        if ((window as any).__elloAppWs === ws) {
          ;(window as any).__elloAppWs = null
        }
        window.dispatchEvent(new CustomEvent('ello:ws:closed'))

        if (heartbeatTimer) {
          clearInterval(heartbeatTimer)
          heartbeatTimer = null
        }

        if (!shouldReconnect) return

        reconnectTimer = setTimeout(() => {
          connect()
        }, 2000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      shouldReconnect = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      if (appWsRef.current && appWsRef.current.readyState === WebSocket.OPEN) {
        appWsRef.current.close()
      }
      appWsRef.current = null
      ;(window as any).__elloAppWs = null
      window.dispatchEvent(new CustomEvent('ello:ws:closed'))
    }
  }, [isAuthenticated, loading, user?.id, wsOriginCandidate])

  useEffect(() => {
    if (!isAuthenticated) return

    const handleIncomingCall = (event: Event) => {
      const custom = event as CustomEvent<any>
      const data = custom.detail
      void handleIncomingCallPayload(data)
    }

    window.addEventListener('ello:ws:incoming-call', handleIncomingCall)
    return () => window.removeEventListener('ello:ws:incoming-call', handleIncomingCall)
  }, [isAuthenticated, handleIncomingCallPayload])

  useEffect(() => {
    if (!isAuthenticated) return

    const dispatchCallStatus = (payload: any) => {
      const rawType = String(payload?.type || '').toLowerCase()
      const rawStatus = String(payload?.status || payload?.call_status || '').toLowerCase()
      const status = rawStatus || (rawType.startsWith('call_') ? rawType.slice(5) : '')
      if (!status) return false
      window.dispatchEvent(
        new CustomEvent('ello:call:status', {
          detail: {
            ...payload,
            status,
          },
        })
      )
      return true
    }

    const handlePushReceived = (event: Event) => {
      const custom = event as CustomEvent<any>
      const detail = custom.detail || {}
      const payload = (detail?.data && typeof detail.data === 'object' ? detail.data : detail) || {}
      const pushType = String(payload?.type || '').toLowerCase()
      const appIsForeground = typeof document !== 'undefined' && document.visibilityState === 'visible'

      if (appIsForeground && pushType !== 'incoming_call' && !pushType.startsWith('call_')) {
        return
      }

      if (pushType === 'incoming_call') {
        void handleIncomingCallPayload(payload)
        return
      }

      if (pushType.startsWith('call_') && dispatchCallStatus(payload)) {
        return
      }

      playNotificationSound()
      window.dispatchEvent(new CustomEvent('ello:ws:notification-refresh'))
    }

    const handlePushAction = (event: Event) => {
      const custom = event as CustomEvent<any>
      const detail = custom.detail || {}
      const payload = (detail?.notification?.data && typeof detail.notification.data === 'object'
        ? detail.notification.data
        : detail?.data && typeof detail.data === 'object'
          ? detail.data
          : {}) || {}
      const pushType = String(payload?.type || '').toLowerCase()
      if (pushType === 'incoming_call') {
        void handleIncomingCallPayload(payload)
        return
      }
      if (pushType.startsWith('call_')) {
        dispatchCallStatus(payload)
      }
    }

    window.addEventListener('ello:push:received', handlePushReceived as EventListener)
    window.addEventListener('ello:push:action', handlePushAction as EventListener)
    return () => {
      window.removeEventListener('ello:push:received', handlePushReceived as EventListener)
      window.removeEventListener('ello:push:action', handlePushAction as EventListener)
    }
  }, [isAuthenticated, handleIncomingCallPayload])

  useEffect(() => {
    if (loading || chunksPreloadedRef.current) return
    chunksPreloadedRef.current = true

    const preload = () => {
      preloadablePages.forEach((page) => {
        page.preload().catch(() => {})
      })
    }

    if ('requestIdleCallback' in window) {
      ;(window as any).requestIdleCallback(preload, { timeout: 2500 })
    } else {
      setTimeout(preload, 400)
    }
  }, [loading])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary mb-4">ℯ𝓁𝓁ℴ</h1>
          <p className="text-xs text-slate-400 mb-3">Carregando...</p>
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      {isAuthenticated && <CallScreen />}
      
      {isAuthenticated && <Navbar />}

      <RouteErrorBoundary>
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-10">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          }
        >
          <Routes>
          {/* Landing Page - Multiple Routes */}
          <Route path="/" element={isAuthenticated ? <Navigate to="/moments" /> : <LandingPage />} />
          <Route path="/home" element={isAuthenticated ? <Navigate to="/moments" /> : <LandingPage />} />
          <Route path="/inicio" element={isAuthenticated ? <Navigate to="/moments" /> : <LandingPage />} />

          {/* Auth Routes */}
          <Route path="/login" element={isAuthenticated ? <Navigate to="/moments" /> : <LoginPage />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/moments" /> : <RegisterPage />} />

          {/* Public Info Routes */}
          <Route path="/legal" element={<PublicInfoPage pageKey="legal" />} />
          <Route path="/privacy" element={<PublicInfoPage pageKey="privacy" />} />
          <Route path="/terms" element={<PublicInfoPage pageKey="terms" />} />
          <Route path="/community-guidelines" element={<PublicInfoPage pageKey="community-guidelines" />} />
          <Route path="/report" element={<PublicInfoPage pageKey="report" />} />
          <Route path="/delete-account" element={<PublicInfoPage pageKey="delete-account" />} />

          {/* Admin Panel Routes */}
          <Route path="/painel/login" element={<AdminLoginPage />} />
          <Route path="/painel" element={<AdminProtectedRoute><AdminPanelPage /></AdminProtectedRoute>} />
          <Route path="/painel/usuarios" element={<AdminProtectedRoute><AdminPanelPage /></AdminProtectedRoute>} />

          {/* Protected Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/moments" element={<ProtectedRoute><MomentsPage /></ProtectedRoute>} />
          <Route path="/vibes" element={<ProtectedRoute><VibesPage /></ProtectedRoute>} />
          <Route path="/music" element={<ProtectedRoute><MusicPage /></ProtectedRoute>} />
          <Route path="/nearby" element={<ProtectedRoute><NearbyPage /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
          <Route path="/chat/:recipientId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
          <Route path="/chat-group/:groupId" element={<ProtectedRoute><GroupChatPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/profile/:userId" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

          {/* Redirect 404 */}
          <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      </RouteErrorBoundary>

      {isAuthenticated && <MusicDockPlayer />}
    </BrowserRouter>
  )
}

export default App
