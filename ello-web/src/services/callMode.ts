import { Capacitor, registerPlugin } from '@capacitor/core'

type NativeCallModePlugin = {
  enable: (options?: CallModeOptions) => Promise<void>
  disable: () => Promise<void>
  update?: (options?: CallModeOptions) => Promise<void>
}

const NativeCallMode = registerPlugin<NativeCallModePlugin>('CallMode')

export type CallModeOptions = {
  callId?: number
  title?: string
  subtitle?: string
  isVideo?: boolean
  avatarUrl?: string
}

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

export const enableCallMode = async (options?: CallModeOptions) => {
  if (Capacitor.getPlatform() !== 'web') {
    try {
      await NativeCallMode.enable(options)
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

export const updateCallMode = async (options?: CallModeOptions) => {
  if (Capacitor.getPlatform() === 'web') return
  try {
    await NativeCallMode.update?.(options)
  } catch {
    // Best-effort metadata update only.
  }
}
