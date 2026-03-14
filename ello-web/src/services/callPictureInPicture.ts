import { Capacitor, registerPlugin } from '@capacitor/core'

type NativeCallPiPResult = {
  supported?: boolean
  entered?: boolean
}

type NativeCallPiPPlugin = {
  isSupported: () => Promise<NativeCallPiPResult>
  enter: (options?: { width?: number; height?: number; autoEnter?: boolean }) => Promise<NativeCallPiPResult>
}

const NativeCallPiP = registerPlugin<NativeCallPiPPlugin>('CallPiP')

const canUseBrowserPiP = (video: HTMLVideoElement | null) => {
  if (!video || typeof document === 'undefined') return false
  const pipEnabled = Boolean((document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled)
  return pipEnabled && !video.disablePictureInPicture
}

export const isCallPictureInPictureSupported = async () => {
  if (Capacitor.getPlatform() !== 'web') {
    try {
      const result = await NativeCallPiP.isSupported()
      return Boolean(result?.supported)
    } catch {
      return false
    }
  }
  return typeof document !== 'undefined' && Boolean((document as any).pictureInPictureEnabled)
}

export const enterCallPictureInPicture = async (video: HTMLVideoElement | null) => {
  if (Capacitor.getPlatform() !== 'web') {
    try {
      const result = await NativeCallPiP.enter({ width: 16, height: 9, autoEnter: true })
      if (result?.entered) return true
    } catch {
      // Continue with browser fallback below.
    }
  }

  if (!canUseBrowserPiP(video)) {
    return false
  }

  const targetVideo = video as HTMLVideoElement
  try {
    await targetVideo.play().catch(() => {})
    await targetVideo.requestPictureInPicture()
    return true
  } catch {
    return false
  }
}
