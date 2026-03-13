type AlertSound = 'notification' | 'incomingCall' | 'outgoingCall'

type LoopingSoundHandle = {
  stop: () => void
}

const SOUND_URLS: Record<AlertSound, string> = {
  notification: '/sounds/notificacao.mp3',
  incomingCall: '/sounds/recebida.mp3',
  outgoingCall: '/sounds/chamando.mp3',
}

const canPlayAudio = () => typeof window !== 'undefined' && typeof Audio !== 'undefined'

const createAudio = (sound: AlertSound, { loop = false, volume = 1 }: { loop?: boolean; volume?: number } = {}) => {
  const audio = new Audio(SOUND_URLS[sound])
  audio.preload = 'auto'
  audio.loop = loop
  audio.volume = volume
  ;(audio as any).playsInline = true
  return audio
}

export const playAlertSound = (sound: AlertSound, volume = 1) => {
  if (!canPlayAudio()) return

  const audio = createAudio(sound, { volume })
  const cleanup = () => {
    audio.pause()
    audio.src = ''
  }

  audio.addEventListener('ended', cleanup, { once: true })
  audio.play().catch(() => {
    cleanup()
  })
}

export const playNotificationSound = () => {
  playAlertSound('notification', 1)
}

export const startLoopingAlertSound = (
  sound: Exclude<AlertSound, 'notification'>,
  volume = 1
): LoopingSoundHandle | null => {
  if (!canPlayAudio()) return null

  const audio = createAudio(sound, { loop: true, volume })
  audio.play().catch(() => {})

  return {
    stop: () => {
      audio.pause()
      audio.currentTime = 0
      audio.src = ''
    },
  }
}

