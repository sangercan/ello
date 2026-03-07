import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '@store/authStore'
import apiClient from '@services/api'

// Pages
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import MomentsPage from './pages/MomentsPage'
import VibesPage from './pages/VibesPage'
import MusicPage from './pages/MusicPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import NearbyPage from './pages/NearbyPage'
import ChatPage from './pages/ChatPage'
import ConversationsPage from './pages/ConversationsPage'
import NotificationsPage from './pages/NotificationsPage'

// Components
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import MusicDockPlayer from './components/MusicDockPlayer'

function App() {
  const resolvedApiBase = (() => {
    const configured = (import.meta.env.VITE_API_URL || '').trim()
    if (!configured) return '/api'
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return '/api'
    return configured
  })()

  const { initialize, isAuthenticated, logout, user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const appWsRef = useRef<WebSocket | null>(null)

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

  // Auto-disconnect after 20 minutes without interaction.
  useEffect(() => {
    if (!isAuthenticated || loading) return

    const IDLE_LIMIT_MS = 20 * 60 * 1000
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let lastActivityPing = 0

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(async () => {
        try {
          await apiClient.markOffline()
        } catch (err) {
          console.error('[App] Erro ao marcar offline por inatividade:', err)
        } finally {
          logout()
        }
      }, IDLE_LIMIT_MS)
    }

    const onActivity = () => {
      const now = Date.now()
      resetIdleTimer()

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

    onActivity()

    return () => {
      if (idleTimer) clearTimeout(idleTimer)
      events.forEach((evt) => window.removeEventListener(evt, onActivity))
      document.removeEventListener('visibilitychange', onActivity)
      window.removeEventListener('focus', onActivity)
    }
  }, [isAuthenticated, loading, logout])

  // Global WebSocket for realtime events across pages (moments/stories/chat/presence).
  useEffect(() => {
    if (!isAuthenticated || loading || !user?.id) return

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let shouldReconnect = true

    const buildWsUrl = (userId: number) => {
      const base = resolvedApiBase
      if (base.startsWith('http://') || base.startsWith('https://')) {
        const parsed = new URL(base)
        const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
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
    }
  }, [isAuthenticated, loading, user?.id, resolvedApiBase])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary mb-4">ELLO</h1>
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      
      {isAuthenticated && <Navbar />}
      
      <Routes>
        {/* Landing Page - Multiple Routes */}
        <Route path="/" element={isAuthenticated ? <Navigate to="/moments" /> : <LandingPage />} />
        <Route path="/home" element={isAuthenticated ? <Navigate to="/moments" /> : <LandingPage />} />
        <Route path="/inicio" element={isAuthenticated ? <Navigate to="/moments" /> : <LandingPage />} />

        {/* Auth Routes */}
        <Route path="/login" element={isAuthenticated ? <Navigate to="/moments" /> : <LoginPage />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/moments" /> : <RegisterPage />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/moments" element={<ProtectedRoute><MomentsPage /></ProtectedRoute>} />
        <Route path="/vibes" element={<ProtectedRoute><VibesPage /></ProtectedRoute>} />
        <Route path="/music" element={<ProtectedRoute><MusicPage /></ProtectedRoute>} />
        <Route path="/nearby" element={<ProtectedRoute><NearbyPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ConversationsPage /></ProtectedRoute>} />
        <Route path="/chat/:recipientId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/profile/:userId" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

        {/* Redirect 404 */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      {isAuthenticated && <MusicDockPlayer />}
    </BrowserRouter>
  )
}

export default App
