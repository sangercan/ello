import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type NativeCallActionPayload = {
  event_id?: string
  action?: string
  received_at?: number
  data?: Record<string, unknown>
}

type NativeCallNotificationsPlugin = {
  drainPendingActions: () => Promise<{ actions?: NativeCallActionPayload[] }>
  addListener: (
    eventName: 'callAction',
    listenerFunc: (payload: NativeCallActionPayload) => void,
  ) => Promise<PluginListenerHandle> & PluginListenerHandle
}

const NativeCallNotifications = registerPlugin<NativeCallNotificationsPlugin>('CallNotifications')

export const bindNativeCallNotificationActions = async (
  onAction: (payload: NativeCallActionPayload) => void,
) => {
  if (Capacitor.getPlatform() === 'web') {
    return () => {}
  }

  let listenerHandle: PluginListenerHandle | null = null
  try {
    listenerHandle = await NativeCallNotifications.addListener('callAction', onAction)
  } catch (error) {
    console.warn('[CallNotifications] Could not add native listener:', error)
  }

  try {
    const result = await NativeCallNotifications.drainPendingActions()
    const actions = Array.isArray(result?.actions) ? result.actions : []
    actions.forEach((payload) => onAction(payload))
  } catch (error) {
    console.warn('[CallNotifications] Could not drain pending native actions:', error)
  }

  return () => {
    try {
      listenerHandle?.remove()
    } catch {
      // Ignore listener cleanup errors.
    }
  }
}
