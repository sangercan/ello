import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'

export type AppPermissionName = 'camera' | 'microphone' | 'location' | 'notifications'
export type AppPermissionState = 'granted' | 'denied' | 'unavailable'

export type AppPermissionSnapshot = Record<AppPermissionName, AppPermissionState>

type MediaPermissionOptions = {
  audio: boolean
  video: boolean
}

const isNativeApp = () => Capacitor.getPlatform() !== 'web'

const createSnapshot = (): AppPermissionSnapshot => ({
  camera: 'unavailable',
  microphone: 'unavailable',
  location: 'unavailable',
  notifications: 'unavailable',
})

const requestMediaPermissions = async (options: MediaPermissionOptions) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      camera: options.video ? 'unavailable' : 'granted',
      microphone: options.audio ? 'unavailable' : 'granted',
    } as const
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: options.audio,
      video: options.video,
    })
    stream.getTracks().forEach((track) => track.stop())
    return {
      camera: options.video ? 'granted' : 'unavailable',
      microphone: options.audio ? 'granted' : 'unavailable',
    } as const
  } catch {
    return {
      camera: options.video ? 'denied' : 'unavailable',
      microphone: options.audio ? 'denied' : 'unavailable',
    } as const
  }
}

const requestLocationPermission = async (): Promise<AppPermissionState> => {
  if (!navigator.geolocation) return 'unavailable'

  return new Promise<AppPermissionState>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      () => resolve('denied'),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    )
  })
}

const requestNotificationsPermission = async (): Promise<AppPermissionState> => {
  if (isNativeApp()) {
    try {
      let result = await PushNotifications.checkPermissions()
      if (result.receive === 'prompt') {
        result = await PushNotifications.requestPermissions()
      }
      return result.receive === 'granted' ? 'granted' : 'denied'
    } catch {
      return 'denied'
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unavailable'
  }

  let status = Notification.permission
  if (status === 'default') {
    status = await Notification.requestPermission()
  }

  return status === 'granted' ? 'granted' : 'denied'
}

export const requestEssentialPermissions = async () => {
  const snapshot = createSnapshot()

  const media = await requestMediaPermissions({ audio: true, video: true })
  snapshot.camera = media.camera
  snapshot.microphone = media.microphone

  snapshot.location = await requestLocationPermission()
  snapshot.notifications = await requestNotificationsPermission()

  return snapshot
}

export const ensureCallPermissions = async (callType: 'voice' | 'video') => {
  const media = await requestMediaPermissions({ audio: true, video: callType === 'video' })
  const cameraAllowed = callType === 'voice' || media.camera === 'granted'
  const microphoneAllowed = media.microphone === 'granted'
  return {
    granted: cameraAllowed && microphoneAllowed,
    media,
  }
}

export const ensureCameraPermission = async () => {
  const media = await requestMediaPermissions({ audio: false, video: true })
  return {
    granted: media.camera === 'granted',
    media,
  }
}

export const ensureLocationPermission = async () => {
  const state = await requestLocationPermission()
  return {
    granted: state === 'granted',
    state,
  }
}
