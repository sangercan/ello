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
const WEB_PUSH_ENDPOINT_KEY = 'ello.push.web.endpoint'

let nativeListenersBound = false
let webListenersBound = false

const isNativeApp = () => Capacitor.getPlatform() !== 'web'
const isBrowserPushCapable = () =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window

const isSecureWebPushContext = () => {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true

  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

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

const getWebVapidPublicKey = () => (import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY || '').trim()

const base64UrlToUint8Array = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const base64 = normalized + padding
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

const arrayBufferToBase64Url = (value: ArrayBuffer | null) => {
  if (!value) return ''
  const bytes = new Uint8Array(value)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const bindNativeListeners = () => {
  if (nativeListenersBound) return

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

  nativeListenersBound = true
}

const bindWebListeners = () => {
  if (webListenersBound || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const detail = event.data
    if (!detail || detail.type !== 'ello:web-push-received') return
    window.dispatchEvent(new CustomEvent('ello:push:received', { detail: detail.payload || detail }))
  })

  webListenersBound = true
}

const upsertWebPushSubscription = async (subscription: PushSubscription) => {
  const raw = subscription.toJSON()
  const endpoint = String(raw.endpoint || subscription.endpoint || '').trim()
  const p256dh = String(raw.keys?.p256dh || arrayBufferToBase64Url(subscription.getKey('p256dh'))).trim()
  const auth = String(raw.keys?.auth || arrayBufferToBase64Url(subscription.getKey('auth'))).trim()

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Web push subscription data is incomplete')
  }

  localStorage.setItem(WEB_PUSH_ENDPOINT_KEY, endpoint)
  localStorage.setItem(PUSH_TOKEN_KEY, endpoint)

  await api.registerPushDevice({
    token: endpoint,
    platform: 'web',
    device_id: getOrCreateDeviceId(),
    subscription_endpoint: endpoint,
    subscription_p256dh: p256dh,
    subscription_auth: auth,
  })
}

export const registerNativePushDevice = async () => {
  if (!isNativeApp()) return

  bindNativeListeners()

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

export const registerWebPushDevice = async () => {
  if (isNativeApp()) return
  if (!isBrowserPushCapable()) return
  if (!isSecureWebPushContext()) {
    console.warn('[Push][Web] Browser push requires HTTPS context')
    return
  }

  const vapidPublicKey = getWebVapidPublicKey()
  if (!vapidPublicKey) {
    console.info('[Push][Web] VITE_WEB_PUSH_VAPID_PUBLIC_KEY not configured; web push skipped')
    return
  }

  bindWebListeners()

  const registration = await navigator.serviceWorker.register('/ello-push-sw.js')

  let permission = Notification.permission
  if (permission === 'default') {
    permission = await Notification.requestPermission()
  }

  if (permission !== 'granted') {
    console.warn('[Push][Web] Permission not granted')
    return
  }

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
    })
  }

  await upsertWebPushSubscription(subscription)
}

export const unregisterWebPushDevice = async () => {
  if (isNativeApp()) return
  if (!isBrowserPushCapable()) return

  const registration =
    (await navigator.serviceWorker.getRegistration('/ello-push-sw.js')) ||
    (await navigator.serviceWorker.getRegistration())
  const subscription = registration ? await registration.pushManager.getSubscription() : null
  const endpoint = String(subscription?.endpoint || localStorage.getItem(WEB_PUSH_ENDPOINT_KEY) || '').trim()
  const deviceId = localStorage.getItem(PUSH_DEVICE_ID_KEY) || undefined

  if (subscription) {
    try {
      await subscription.unsubscribe()
    } catch (error) {
      console.warn('[Push][Web] Could not unsubscribe service worker push:', error)
    }
  }

  if (endpoint || deviceId) {
    try {
      await api.unregisterPushDevice({
        token: endpoint || undefined,
        device_id: deviceId,
        subscription_endpoint: endpoint || undefined,
      })
    } catch (error) {
      console.warn('[Push][Web] Could not unregister push device:', error)
    }
  }

  localStorage.removeItem(PUSH_TOKEN_KEY)
  localStorage.removeItem(WEB_PUSH_ENDPOINT_KEY)
}

export const registerPushDevice = async () => {
  if (isNativeApp()) {
    await registerNativePushDevice()
    return
  }
  await registerWebPushDevice()
}

export const unregisterPushDevice = async () => {
  if (isNativeApp()) {
    await unregisterNativePushDevice()
    return
  }
  await unregisterWebPushDevice()
}
