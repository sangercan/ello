import { Capacitor, registerPlugin } from '@capacitor/core'

type NativeCallModePlugin = {
  enable: () => Promise<void>
  disable: () => Promise<void>
}

const NativeCallMode = registerPlugin<NativeCallModePlugin>('CallMode')

let wakeLock: WakeLockSentinel | null = null

const releaseWakeLock = async () => {
  if (!wakeLock) return
  try {
    await wakeLock.release()
  } catch {
    // Ignore already-released lock.
  } finally {
    wakeLock = null
  }
}

const requestWakeLock = async () => {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
  } catch {
    // Wake lock can be denied by browser/power settings.
  }
}

export const enableCallMode = async () => {
  if (Capacitor.getPlatform() !== 'web') {
    try {
      await NativeCallMode.enable()
    } catch {
      // Keep web fallback behavior when plugin is unavailable.
    }
  }

  await requestWakeLock()
}

export const disableCallMode = async () => {
  await releaseWakeLock()

  if (Capacitor.getPlatform() !== 'web') {
    try {
      await NativeCallMode.disable()
    } catch {
      // No-op when plugin is unavailable.
    }
  }
}

