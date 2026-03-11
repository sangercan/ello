import { Capacitor } from '@capacitor/core'
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type Token,
} from '@capacitor/push-notifications'
import api from '@services/api'

const PUSH_DEVICE_ID_KEY = 'ello.push.device_id'
const PUSH_TOKEN_KEY = 'ello.push.token'

let listenersBound = false

const isNativeApp = () => Capacitor.getPlatform() !== 'web'

const getOrCreateDeviceId = () => {
  const stored = localStorage.getItem(PUSH_DEVICE_ID_KEY)
  if (stored) return stored

  const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `ello-${Date.now()}-${Math.random().toString(16).slice(2)}`

  localStorage.setItem(PUSH_DEVICE_ID_KEY, generated)
  return generated
}

const getPlatform = () => {
  const platform = Capacitor.getPlatform()
  if (platform === 'ios' || platform === 'android') return platform
  return 'native'
}

const bindListeners = () => {
  if (listenersBound) return

  PushNotifications.addListener('registration', async ({ value }: Token) => {
    const token = String(value || '').trim()
    if (!token) return

    localStorage.setItem(PUSH_TOKEN_KEY, token)

    try {
      await api.registerPushDevice({
        token,
        platform: getPlatform(),
        device_id: getOrCreateDeviceId(),
      })
    } catch (error) {
      console.error('[Push] Failed to register device token:', error)
    }
  })

  ;(PushNotifications as any).addListener('registrationError', (error: unknown) => {
    console.error('[Push] Registration error:', error)
  })

  PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
    window.dispatchEvent(new CustomEvent('ello:push:received', { detail: notification }))
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    window.dispatchEvent(new CustomEvent('ello:push:action', { detail: action }))
  })

  listenersBound = true
}

export const registerNativePushDevice = async () => {
  if (!isNativeApp()) return

  bindListeners()

  let permissions = await PushNotifications.checkPermissions()
  if (permissions.receive === 'prompt') {
    permissions = await PushNotifications.requestPermissions()
  }

  if (permissions.receive !== 'granted') {
    console.warn('[Push] Permission not granted')
    return
  }

  getOrCreateDeviceId()
  await PushNotifications.register()
}

export const unregisterNativePushDevice = async () => {
  if (!isNativeApp()) return

  const token = localStorage.getItem(PUSH_TOKEN_KEY) || undefined
  const deviceId = localStorage.getItem(PUSH_DEVICE_ID_KEY) || undefined

  if (!token && !deviceId) return

  try {
    await api.unregisterPushDevice({
      token,
      device_id: deviceId,
    })
  } catch (error) {
    console.warn('[Push] Could not unregister push device:', error)
  }

  localStorage.removeItem(PUSH_TOKEN_KEY)
}
