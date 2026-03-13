import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Eye, Heart, MessageCircle, Radio, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'react-hot-toast'
import apiClient from '@services/api'
import { resolveMediaUrl } from '@/utils/mediaUrl'

type NotificationItem = {
  id: number
  type: string
  content: string
  message?: string
  is_read: boolean
  created_at?: string
  reference_id?: number
  actor_id?: number
  actor?: {
    id: number
    username?: string
    full_name?: string
    avatar_url?: string
  } | null
}

const formatWhen = (iso?: string) => {
  if (!iso) return 'Agora'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return 'Agora'

  const diff = Date.now() - dt.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'Agora'
  if (mins < 60) return `${mins}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const iconByType = (type: string) => {
  if (type === 'like') return Heart
  if (type === 'comment') return MessageCircle
  if (type === 'follow') return UserPlus
  if (type === 'following_online') return Radio
  if (type === 'message') return MessageCircle
  return Bell
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<NotificationItem[]>([])

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items])

  const loadNotifications = async () => {
    try {
      const response = await apiClient.getNotifications(1, 100)
      const list = Array.isArray(response.data) ? response.data : []
      setItems(list)
    } catch (error) {
      console.error('[NotificationsPage] erro ao carregar notificacoes:', error)
      toast.error('Nao foi possivel carregar notificacoes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadNotifications()

    const onCreated = (event: Event) => {
      const custom = event as CustomEvent<{ notification?: NotificationItem }>
      const row = custom.detail?.notification
      if (!row) {
        void loadNotifications()
        return
      }

      setItems((prev) => {
        const deduped = prev.filter((item) => item.id !== row.id)
        return [row, ...deduped]
      })
    }

    const onRefresh = () => {
      void loadNotifications()
    }

    window.addEventListener('ello:ws:notification-created', onCreated as EventListener)
    window.addEventListener('ello:ws:notification-refresh', onRefresh)

    return () => {
      window.removeEventListener('ello:ws:notification-created', onCreated as EventListener)
      window.removeEventListener('ello:ws:notification-refresh', onRefresh)
    }
  }, [])

  const markAsRead = async (notificationId: number) => {
    try {
      await apiClient.markNotificationAsRead(notificationId)
      setItems((prev) => prev.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item)))
      window.dispatchEvent(new CustomEvent('ello:ws:notification-refresh'))
    } catch {
      toast.error('Erro ao marcar notificacao como lida')
    }
  }

  const markAllAsRead = async () => {
    try {
      await apiClient.markAllNotificationsAsRead()
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })))
      window.dispatchEvent(new CustomEvent('ello:ws:notification-refresh'))
    } catch {
      toast.error('Erro ao marcar todas como lidas')
    }
  }

  const clearAllNotifications = async () => {
    if (items.length === 0) return
    if (!window.confirm('Deseja limpar todas as notificacoes?')) return

    try {
      await apiClient.clearAllNotifications()
      setItems([])
      window.dispatchEvent(new CustomEvent('ello:ws:notification-refresh'))
      toast.success('Notificacoes limpas')
    } catch {
      toast.error('Erro ao limpar notificacoes')
    }
  }

  const openActor = (item: NotificationItem) => {
    const actorId = item.actor?.id || item.actor_id
    if (!actorId) return
    navigate(`/profile/${actorId}`)
  }

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.is_read) {
      await markAsRead(item.id)
    }

    if (item.type === 'message') {
      const actorId = item.actor?.id || item.actor_id
      if (actorId) {
        navigate(`/chat/${actorId}`)
      }
      return
    }

    const actorId = item.actor?.id || item.actor_id
    if (actorId) {
      navigate(`/profile/${actorId}`)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold text-white">Notificacoes</h1>
            <p className="text-xs text-slate-400 mt-1">{unreadCount} nao lida(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="h-9 w-9 rounded-full border border-slate-700 text-slate-200 disabled:text-slate-500 disabled:border-slate-800 hover:bg-slate-800 transition inline-flex items-center justify-center"
              title="Marcar todas como lidas"
              aria-label="Marcar todas como lidas"
            >
              <Eye size={16} />
            </button>
            <button
              onClick={clearAllNotifications}
              disabled={items.length === 0}
              className="h-9 w-9 rounded-full border border-slate-700 text-red-300 disabled:text-slate-500 disabled:border-slate-800 hover:bg-red-500/10 transition inline-flex items-center justify-center"
              title="Limpar notificacoes"
              aria-label="Limpar notificacoes"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-400">Carregando notificacoes...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-slate-300">
            Nenhuma notificacao no momento.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = iconByType(item.type)
              return (
                <article
                  key={item.id}
                  className={`rounded-2xl border p-3 sm:p-4 transition ${
                    item.is_read
                      ? 'border-slate-800 bg-slate-900/35'
                      : 'border-primary/30 bg-primary/10'
                  } cursor-pointer`}
                  onClick={() => handleNotificationClick(item)}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 shrink-0">
                      <Icon size={16} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => openActor(item)}
                        className="flex items-center gap-2 min-w-0 text-left"
                        onClickCapture={(event) => event.stopPropagation()}
                      >
                        <img
                          src={resolveMediaUrl(item.actor?.avatar_url) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.actor?.username || item.actor_id || item.id}`}
                          alt={item.actor?.username || 'ator'}
                          className="w-8 h-8 rounded-full border border-slate-700 object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-white font-semibold truncate">
                            {item.actor?.full_name || item.actor?.username || `Usuario ${item.actor_id || ''}`}
                          </p>
                          <p className="text-[11px] text-slate-400">{formatWhen(item.created_at)}</p>
                        </div>
                      </button>

                      <p className="mt-2 text-sm text-slate-200 break-words">{item.content || item.message || 'Nova notificacao'}</p>
                    </div>

                    {!item.is_read && (
                      <button
                        onClick={() => markAsRead(item.id)}
                        className="text-[11px] text-primary hover:text-primary/80"
                      >
                        Marcar lida
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

