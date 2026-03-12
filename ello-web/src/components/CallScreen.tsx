import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, PhoneIncoming, PhoneOff, PhoneCall, Volume2, VolumeX, Minimize2, Maximize2 } from 'lucide-react'
import { useCallStore } from '@store/callStore'
import { useMoodStore } from '@store/moodStore'
import api from '@services/api'
import { getMoodAvatarRingStyle } from '@/utils/mood'

type SignalPayload = {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call_end'
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
  call_id?: number
}

type CallTone = 'incoming' | 'outgoing'

type RingtoneHandle = {
  ctx: AudioContext | null
  osc: OscillatorNode | { stop?: () => void }
  gain: GainNode | null
  intervalId: number
  dummy?: boolean
}

const unlockAudioContext = (ctx: AudioContext) => {
  if (ctx.state !== 'suspended') return
  const unlock = () => {
    ctx.resume().catch(() => {})
    document.removeEventListener('click', unlock)
    document.removeEventListener('touchstart', unlock)
    document.removeEventListener('keydown', unlock)
  }
  document.addEventListener('click', unlock, { once: true })
  document.addEventListener('touchstart', unlock, { once: true })
  document.addEventListener('keydown', unlock, { once: true })
}

const userGesture = {
  resolved: false,
  init() {
    const handler = () => {
      userGesture.resolved = true
      document.removeEventListener('click', handler)
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('keydown', handler)
    }
    document.addEventListener('click', handler, { once: true, passive: true })
    document.addEventListener('touchstart', handler, { once: true, passive: true })
    document.addEventListener('keydown', handler, { once: true, passive: true })
  },
}
userGesture.init()

const RING_CONFIG: Record<CallTone, { tones: number[]; cadenceMs: number }> = {
  incoming: { tones: [440, 480], cadenceMs: 3000 },
  outgoing: { tones: [480, 620], cadenceMs: 2500 },
}

const buildIceServers = (): RTCIceServer[] => {
  const stunEnv = (import.meta.env.VITE_STUN_URL || '').trim()
  const turnUrl = (import.meta.env.VITE_TURN_URL || '').trim()
  const turnUser = (import.meta.env.VITE_TURN_USER || '').trim()
  const turnPass = (import.meta.env.VITE_TURN_PASS || '').trim()

  // Permite múltiplos STUN separados por vírgula; aplica defaults robustos quando não configurado.
  const stunUrls = (stunEnv
    ? stunEnv.split(',')
    : ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478']
  )
    .map((u: string) => u.trim())
    .filter(Boolean)

  const servers: RTCIceServer[] = stunUrls.length ? [{ urls: stunUrls }] : []

  if (turnUrl && turnUser && turnPass) {
    const turnUrls = turnUrl.split(',').map((u: string) => u.trim()).filter(Boolean)
    if (turnUrls.length) {
      servers.push({ urls: turnUrls, username: turnUser, credential: turnPass })
    }
  }

  return servers
}

const getMediaConstraints = (callType: string) => ({
  audio: true,
  video: callType === 'video',
})

const describeMediaError = (error: unknown) => {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = String((error as { name?: unknown }).name || '')
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      return 'Permita camera e microfone para ligar no app.'
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'Nao foi encontrado camera/microfone neste aparelho.'
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'Camera/microfone esta em uso por outro app.'
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return 'Este aparelho nao suporta os requisitos de midia da chamada.'
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Falha ao acessar camera/microfone no app.'
}

const CallScreen = () => {
  const activeCall = useCallStore((state) => state.activeCall)
  const answerCall = useCallStore((state) => state.answerCall)
  const endCall = useCallStore((state) => state.endCall)
  const markCallActive = useCallStore((state) => state.markActive)
  const isMinimized = useCallStore((state) => state.isMinimized)
  const restoreCall = useCallStore((state) => state.restoreCall)
  const toggleMinimize = useCallStore((state) => state.toggleMinimize)
  const mood = useMoodStore((state) => state.mood)
  const moodAvatarRingStyle = useMemo(() => getMoodAvatarRingStyle(mood), [mood])
  const iceServers = useRef<RTCIceServer[]>(buildIceServers())

  const [statusLabel, setStatusLabel] = useState('Ligando...')

  const peerRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const pendingSignalsRef = useRef<Record<number, SignalPayload[]>>({})
  const pendingIceRef = useRef<Record<number, RTCIceCandidateInit[]>>({})
  const queuedSignalsRef = useRef<SignalPayload[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(false)
  const [miniPosition, setMiniPosition] = useState<{ x: number; y: number }>({
    x: Math.max(16, window.innerWidth - 280),
    y: Math.max(16, window.innerHeight - 180),
  })
  const dragStateRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const dragRafRef = useRef<number | null>(null)
  const pendingMiniPositionRef = useRef<{ x: number; y: number } | null>(null)
  const disconnectTimerRef = useRef<number | null>(null)
  const activeCallId = activeCall?.callId
  const activeCallType = activeCall?.callType
  const activeCallDirection = activeCall?.direction
  const activePeerId = activeCall?.user?.id

  const isIncoming = activeCallDirection === 'incoming'
  const isVideoCall = activeCallType === 'video'
  const callLabel = isVideoCall ? 'Chamada de vídeo' : 'Chamada de voz'
  const isRinging = activeCall?.status === 'ringing'

  const playRemoteAudio = useCallback(() => {
    const audio = remoteAudioRef.current
    if (audio) {
      audio.muted = false
      audio.autoplay = true
      audio.play().catch(() => {})
    }
  }, [])

  const playRemoteVideo = useCallback(() => {
    const video = remoteVideoRef.current
    if (video) {
      video.autoplay = true
      video.playsInline = true
      video.muted = true
      video.play().catch(() => {})
    }
  }, [])

  const clampMiniPosition = useCallback((x: number, y: number) => {
    const boxWidth = 256
    const boxHeight = 138
    const padding = 12
    const maxX = Math.max(padding, window.innerWidth - boxWidth - padding)
    const maxY = Math.max(padding, window.innerHeight - boxHeight - padding)
    return {
      x: Math.min(Math.max(x, padding), maxX),
      y: Math.min(Math.max(y, padding), maxY),
    }
  }, [])

  const ringtoneRef = useRef<RingtoneHandle | null>(null)
  const currentToneRef = useRef<CallTone | null>(null)

const createRingtoneHandle = (tones: number[], cadenceMs: number): RingtoneHandle => {
    // Sem gesto: retorna handle inerte (sem áudio) para evitar erros no console.
    if (!userGesture.resolved) {
      return { ctx: null, osc: {}, gain: null, intervalId: -1, dummy: true }
    }
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    const freq = tones.reduce((a, b) => a + b, 0) / Math.max(1, tones.length)
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, ctx.currentTime)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    unlockAudioContext(ctx)

    const pulse = () => {
      const now = ctx.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.22, now + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
    }

    pulse()
    const intervalId: number = window.setInterval(pulse, cadenceMs)

    return { ctx, osc, gain, intervalId }
  }

  const stopRingtone = useCallback(() => {
    const handle = ringtoneRef.current
    if (!handle) return
    if (handle.intervalId >= 0) clearInterval(handle.intervalId)
    if (!handle.dummy && typeof handle.osc.stop === 'function') {
      handle.osc.stop()
    }
    if (!handle.dummy && handle.ctx) {
      handle.ctx.close().catch(() => {})
    }
    ringtoneRef.current = null
    currentToneRef.current = null
  }, [])

  const startRingtone = useCallback((tone: CallTone) => {
    if (currentToneRef.current === tone) return
    stopRingtone()
    try {
      const { tones, cadenceMs } = RING_CONFIG[tone]
      ringtoneRef.current = createRingtoneHandle(tones, cadenceMs)
      currentToneRef.current = tone
    } catch (error) {
      console.error('Não foi possível iniciar o toque de chamada:', error)
    }
  }, [stopRingtone])

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    setIsMuted((prev) => {
      const next = !prev
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !next
      })
      return next
    })
  }, [])

  const toggleSpeaker = useCallback(() => {
    const audio = remoteAudioRef.current
    setIsSpeakerEnabled((prev) => {
      const next = !prev
      if (audio) {
        audio.volume = next ? 1 : 0.4
      }
      return next
    })
  }, [])

  const sendSignalOverOpenSocket = useCallback(
    (signal: SignalPayload) => {
      if (!activePeerId || !activeCallId) return false
      const ws = (window as any).__elloAppWs as WebSocket | null
      if (ws?.readyState !== WebSocket.OPEN) return false
      console.debug('[Call] enviando sinal', { to: activePeerId, signal })
      ws.send(
        JSON.stringify({
          type: 'call_signal',
          to_user_id: activePeerId,
          signal: { ...signal, call_id: activeCallId },
        }),
      )
      return true
    },
    [activePeerId, activeCallId],
  )

  const flushQueuedSignals = useCallback(() => {
    if (!queuedSignalsRef.current.length) return
    const pending = [...queuedSignalsRef.current]
    queuedSignalsRef.current = []
    for (const queued of pending) {
      const sent = sendSignalOverOpenSocket(queued)
      if (!sent) {
        queuedSignalsRef.current.push(queued)
      }
    }
  }, [sendSignalOverOpenSocket])

  const sendCallSignal = useCallback(
    (signal: SignalPayload) => {
      if (!activePeerId || !activeCallId) return
      const sent = sendSignalOverOpenSocket(signal)
      if (sent) return
      queuedSignalsRef.current.push(signal)
      if (queuedSignalsRef.current.length > 200) {
        queuedSignalsRef.current = queuedSignalsRef.current.slice(-200)
      }
      if (signal.type !== 'ice-candidate') {
        setStatusLabel((prev) => (prev === 'Conectado' ? prev : 'Reconectando chamada...'))
      }
      flushQueuedSignals()
    },
    [activePeerId, activeCallId, sendSignalOverOpenSocket, flushQueuedSignals],
  )

  const cleanupCall = useCallback(() => {
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
      pendingMiniPositionRef.current = null
    }
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current)
      disconnectTimerRef.current = null
    }
    peerRef.current?.close()
    peerRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    remoteStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    queuedSignalsRef.current = []
    stopRingtone()
  }, [stopRingtone])

  const finalizeCallLocally = useCallback(() => {
    cleanupCall()
    endCall()
  }, [cleanupCall, endCall])

  const createPeerConnection = useCallback(() => {
    if (peerRef.current) return peerRef.current
    const pc = new RTCPeerConnection({ iceServers: iceServers.current })
    const remoteStream = new MediaStream()
    remoteStreamRef.current = remoteStream
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream
      playRemoteVideo()
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream
      remoteAudioRef.current.volume = 1
    }

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track))
      playRemoteVideo()
      playRemoteAudio()
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        console.debug('[Call] ICE candidate local gerado')
        sendCallSignal({ type: 'ice-candidate', candidate })
      }
    }

    pc.onicecandidateerror = (evt) => {
      // Em redes móveis/corporativas alguns servidores ICE podem falhar (ex.: 701)
      // mesmo com a chamada funcionando por outro candidato válido.
      const benign =
        evt.errorCode === 701 ||
        pc.connectionState === 'connected' ||
        pc.iceConnectionState === 'connected' ||
        pc.iceConnectionState === 'completed'

      if (benign) {
        console.debug('[Call] ICE candidate error (não fatal)', {
          code: evt.errorCode,
          text: evt.errorText,
          url: evt.url,
        })
        return
      }

      console.warn('[Call] Erro ICE', {
        code: evt.errorCode,
        text: evt.errorText,
        url: evt.url,
      })
    }

    pc.onicegatheringstatechange = () => {
      console.debug('[Call] iceGatheringState', pc.iceGatheringState)
    }

    const markConnected = () => {
      setStatusLabel('Conectado')
      stopRingtone()
      markCallActive()
      playRemoteAudio()
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      if (state === 'connected') {
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current)
          disconnectTimerRef.current = null
        }
        markConnected()
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setStatusLabel('Conexão encerrada')
        if (disconnectTimerRef.current) {
          clearTimeout(disconnectTimerRef.current)
        }
        disconnectTimerRef.current = window.setTimeout(() => {
          finalizeCallLocally()
        }, 1200)
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'completed') {
        markConnected()
      } else if (pc.iceConnectionState === 'failed') {
        try {
          pc.restartIce()
        } catch (err) {
          console.error('Falha ao tentar restart ICE:', err)
        }
      }
    }

    peerRef.current = pc
    return pc
  }, [sendCallSignal, markCallActive, playRemoteAudio, playRemoteVideo, stopRingtone, finalizeCallLocally])

  const prepareLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    if (!activeCallType) throw new Error('Chamada inexistente')
    const isHttpPage =
      window.location.protocol === 'http:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    if (isHttpPage) {
      throw new Error('Chamada web requer HTTPS para liberar camera e microfone.')
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este app/webview nao suporta getUserMedia para chamadas.')
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia(getMediaConstraints(activeCallType))
    } catch (error) {
      throw new Error(describeMediaError(error))
    }

    localStreamRef.current = stream
    if (localVideoRef.current && activeCallType === 'video') {
      localVideoRef.current.srcObject = stream
      localVideoRef.current.muted = true
      localVideoRef.current.play().catch(() => {})
    }
    return stream
  }, [activeCallType])

  const ensureLocalTracks = useCallback(async (pc: RTCPeerConnection, stream: MediaStream) => {
    for (const track of stream.getTracks()) {
      const existingSender = pc.getSenders().find((sender) => sender.track?.kind === track.kind)
      if (existingSender) {
        if (existingSender.track?.id !== track.id) {
          await existingSender.replaceTrack(track)
        }
        continue
      }
      // Use addTrack when no sender with this kind exists. This allows the browser
      // to promote offer/answer direction to sendrecv instead of keeping recvonly.
      pc.addTrack(track, stream)
    }
  }, [])

  const forceSendRecvForLocalKinds = useCallback((pc: RTCPeerConnection, kinds: Array<'audio' | 'video'>) => {
    const targetKinds = new Set(kinds)
    for (const transceiver of pc.getTransceivers()) {
      const kind = transceiver.receiver?.track?.kind as 'audio' | 'video' | undefined
      if (!kind || !targetKinds.has(kind)) continue
      if (!transceiver.sender.track) continue
      if (transceiver.direction !== 'sendrecv') {
        transceiver.direction = 'sendrecv'
      }
    }
  }, [])

  const handleSignal = useCallback(
    async (signal: SignalPayload) => {
      if (!activeCallId) return
      const pc = createPeerConnection()
      try {
        if (signal.type === 'offer' && signal.offer) {
          pendingOfferRef.current = signal.offer
          setStatusLabel('Ligação chegando')
          console.debug('[Call] offer recebido')
        }

        if (signal.type === 'answer' && signal.answer) {
          console.debug('[Call] answer recebido')
          await pc.setRemoteDescription(signal.answer)
          const signalCallId = signal.call_id || activeCallId
          const queued = pendingIceRef.current[signalCallId] || []
          for (const cand of queued) {
            await pc.addIceCandidate(cand)
          }
          pendingIceRef.current[signalCallId] = []
        }

        if (signal.type === 'ice-candidate' && signal.candidate) {
          console.debug('[Call] ICE candidate remoto recebido')
          if (!pc.remoteDescription) {
            const key = signal.call_id || activeCallId
            const list = pendingIceRef.current[key] || []
            list.push(signal.candidate)
            pendingIceRef.current[key] = list
          } else {
            await pc.addIceCandidate(signal.candidate)
          }
        }

        if (signal.type === 'call_end') {
          finalizeCallLocally()
          return
        }
      } catch (error) {
        console.error('Erro na sinalizaÃ§Ã£o da chamada:', error)
      }
    },
    [activeCallId, createPeerConnection, finalizeCallLocally],
  )

  const flushPendingSignals = useCallback(
    (callId: number) => {
      const pending = pendingSignalsRef.current[callId] || []
      if (!pending.length) return
      pendingSignalsRef.current[callId] = []
      pending.forEach((queued) => {
        void handleSignal(queued)
      })
    },
    [handleSignal],
  )

  const handleCallSignalEvent = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent).detail
      const signal = detail?.signal
      console.debug('[Call] sinal recebido', signal)
      if (!signal?.call_id) return
      const queue = pendingSignalsRef.current[signal.call_id] || []
      queue.push(signal)
      pendingSignalsRef.current[signal.call_id] = queue
      if (!activeCallId || signal.call_id !== activeCallId) return
      flushPendingSignals(signal.call_id)
    },
    [activeCallId, flushPendingSignals],
  )

  useEffect(() => {
    window.addEventListener('ello:ws:call-signal', handleCallSignalEvent)
    return () => window.removeEventListener('ello:ws:call-signal', handleCallSignalEvent)
  }, [handleCallSignalEvent])

  useEffect(() => {
    if (!activeCallId) return
    flushPendingSignals(activeCallId)
  }, [activeCallId, flushPendingSignals])

  useEffect(() => {
    if (!activeCallId) return
    const retryFlush = () => {
      flushQueuedSignals()
    }
    window.addEventListener('ello:ws:open', retryFlush)
    const intervalId = window.setInterval(retryFlush, 600)
    retryFlush()
    return () => {
      window.removeEventListener('ello:ws:open', retryFlush)
      window.clearInterval(intervalId)
    }
  }, [activeCallId, flushQueuedSignals])

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = isSpeakerEnabled ? 1 : 0.4
    }
  }, [isSpeakerEnabled])

  useEffect(() => {
    if (!isVideoCall) return
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
      localVideoRef.current.muted = true
      localVideoRef.current.play().catch(() => {})
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current
      playRemoteVideo()
    }
  }, [isVideoCall, playRemoteVideo])

  useEffect(() => {
    if (!activeCallId || !activeCallDirection) return
    const startOutgoing = async () => {
      if (activeCallDirection !== 'outgoing') return
      try {
        setStatusLabel('Ligando...')
        const stream = await prepareLocalStream()
        const pc = createPeerConnection()
        await ensureLocalTracks(pc, stream)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        if (pc.localDescription) {
          sendCallSignal({ type: 'offer', offer: pc.localDescription })
        }
        console.debug('[Call] offer enviado', pc.localDescription?.type)
      } catch (error) {
        console.error('Erro ao iniciar oferta da chamada:', error)
        const message = describeMediaError(error)
        setStatusLabel(message)
      }
    }

    startOutgoing()
    return () => {
      cleanupCall()
    }
  }, [
    activeCallId,
    activeCallDirection,
    prepareLocalStream,
    ensureLocalTracks,
    createPeerConnection,
    sendCallSignal,
    cleanupCall,
  ])

  const performAccept = useCallback(async () => {
    if (!activeCallId) return
    // Processa sinais que possam ter chegado antes do clique.
    flushPendingSignals(activeCallId)
    const pendingOffer = pendingOfferRef.current
    if (!pendingOffer) {
      setStatusLabel('Aguardando sinal...')
      return
    }

    try {
      setStatusLabel('Conectando...')
      const pc = createPeerConnection()
      await pc.setRemoteDescription(pendingOffer)
      const stream = await prepareLocalStream()
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true
      })
      setIsMuted(false)
      await ensureLocalTracks(pc, stream)
      forceSendRecvForLocalKinds(pc, ['audio', ...(activeCallType === 'video' ? ['video'] as const : [])])
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      const queued = pendingIceRef.current[activeCallId] || []
      for (const cand of queued) {
        await pc.addIceCandidate(cand)
      }
      pendingIceRef.current[activeCallId] = []
      if (pc.localDescription) {
        sendCallSignal({ type: 'answer', answer: pc.localDescription })
      }
      pendingOfferRef.current = null
      await api.acceptCall(activeCallId)
      answerCall()
    } catch (error) {
      console.error('Erro ao responder a chamada:', error)
      const message = describeMediaError(error)
      setStatusLabel(message)
    }
  }, [activeCallId, activeCallType, answerCall, prepareLocalStream, ensureLocalTracks, forceSendRecvForLocalKinds, createPeerConnection, sendCallSignal, flushPendingSignals])

  const handleEndCall = useCallback(async () => {
    if (!activeCallId) return
    sendCallSignal({ type: 'call_end' })
    try {
      await api.endCall(activeCallId)
    } catch (error) {
      console.error('Erro ao encerrar chamada:', error)
    }
    finalizeCallLocally()
  }, [activeCallId, finalizeCallLocally, sendCallSignal])

  useEffect(() => {
    return () => cleanupCall()
  }, [cleanupCall])

  useEffect(() => {
    if (isRinging) {
      startRingtone(isIncoming ? 'incoming' : 'outgoing')
    } else {
      stopRingtone()
    }
  }, [isRinging, isIncoming, startRingtone, stopRingtone])

  useEffect(() => stopRingtone, [stopRingtone])

  useEffect(() => {
    if (!isMinimized) return
    const onResize = () => {
      setMiniPosition((prev) => clampMiniPosition(prev.x, prev.y))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isMinimized, clampMiniPosition])

  const isIncomingRinging = isIncoming && isRinging

  useEffect(() => {
    if (!isIncomingRinging || !isMinimized) return
    restoreCall()
  }, [isIncomingRinging, isMinimized, restoreCall])

  useEffect(() => {
    if (!isIncomingRinging || !('vibrate' in navigator)) return
    const pattern = [220, 120, 220, 120, 400]
    navigator.vibrate(pattern)
    const intervalId = window.setInterval(() => {
      navigator.vibrate(pattern)
    }, 2600)
    return () => {
      window.clearInterval(intervalId)
      navigator.vibrate(0)
    }
  }, [isIncomingRinging])

  if (!activeCall) return null

  const handleMiniPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('button')) return
    const rect = event.currentTarget.getBoundingClientRect()
    dragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleMiniPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    pendingMiniPositionRef.current = clampMiniPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY)
    if (dragRafRef.current) return
    dragRafRef.current = window.requestAnimationFrame(() => {
      dragRafRef.current = null
      const next = pendingMiniPositionRef.current
      if (!next) return
      setMiniPosition(next)
      pendingMiniPositionRef.current = null
    })
  }

  const handleMiniPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (dragRafRef.current) {
      cancelAnimationFrame(dragRafRef.current)
      dragRafRef.current = null
    }
    if (pendingMiniPositionRef.current) {
      setMiniPosition(pendingMiniPositionRef.current)
      pendingMiniPositionRef.current = null
    }
    dragStateRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const connected = activeCall.status === 'active'
  const canMinimize = !isIncomingRinging

  if (isMinimized) {
    return (
      <div
        className="fixed z-40 w-64 rounded-2xl border border-white/20 bg-slate-900/40 p-3 shadow-xl shadow-black/50 backdrop-blur-2xl cursor-grab active:cursor-grabbing select-none"
        style={{ left: 0, top: 0, transform: `translate3d(${miniPosition.x}px, ${miniPosition.y}px, 0)`, willChange: 'transform', touchAction: 'none' }}
        onPointerDown={handleMiniPointerDown}
        onPointerMove={handleMiniPointerMove}
        onPointerUp={handleMiniPointerUp}
        onPointerCancel={handleMiniPointerUp}
      >
        <div className="flex items-center gap-3">
          <img
            src={activeCall.user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed='}
            alt={activeCall.user.username}
            className="h-12 w-12 rounded-full border border-white/10 object-cover"
            style={moodAvatarRingStyle}
          />
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold truncate">{activeCall.user.full_name || activeCall.user.username}</p>
            <p className="text-xs text-white/60">{connected ? 'Conectado' : statusLabel}</p>
          </div>
          <button
            onClick={restoreCall}
            className="text-white/70 hover:text-white"
            title="Voltar para a chamada"
          >
            <Maximize2 size={18} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={toggleMute}
            className={`p-2 text-white/80 ${isMuted ? 'text-primary' : ''}`}
            title="Microfone"
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            onClick={toggleSpeaker}
            className={`p-2 text-white/80 ${isSpeakerEnabled ? 'text-primary' : ''}`}
            title="Viva-voz"
          >
            {isSpeakerEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            onClick={handleEndCall}
            className="p-2 text-red-300"
            title="Encerrar"
          >
            <PhoneOff size={18} />
          </button>
        </div>
      </div>
    )
  }

  const statusText = isIncoming ? statusLabel : statusLabel
  const actionButtons = connected ? (
    <>
      <button
        onClick={toggleMute}
        className={`h-12 w-12 rounded-full border border-white/20 bg-black/25 text-white transition ${
          isMuted ? 'border-primary/70 text-primary' : 'hover:bg-white/15'
        }`}
      >
        {isMuted ? <MicOff size={20} className="mx-auto" /> : <Mic size={20} className="mx-auto" />}
        <span className="sr-only">Alternar microfone</span>
      </button>
      <button
        onClick={toggleSpeaker}
        className={`h-12 w-12 rounded-full border border-white/20 bg-black/25 text-white transition ${
          isSpeakerEnabled ? 'border-primary/70 text-primary' : 'hover:bg-white/15'
        }`}
      >
        {isSpeakerEnabled ? <Volume2 size={20} className="mx-auto" /> : <VolumeX size={20} className="mx-auto" />}
        <span className="sr-only">Alternar viva-voz</span>
      </button>
      <button
        onClick={handleEndCall}
        className="h-14 w-14 rounded-full bg-red-500 text-white transition hover:bg-red-400"
      >
        <PhoneOff size={24} className="mx-auto" />
        <span className="sr-only">Encerrar</span>
      </button>
    </>
  ) : isIncoming ? (
    <>
      <button
        onClick={handleEndCall}
        className="h-14 w-14 rounded-full bg-red-500 text-white transition hover:bg-red-400"
      >
        <PhoneOff size={24} className="mx-auto" />
        <span className="sr-only">Recusar</span>
      </button>
      <button
        onClick={performAccept}
        className="h-14 w-14 rounded-full bg-emerald-500 text-white transition hover:bg-emerald-400"
      >
        <PhoneIncoming size={24} className="mx-auto" />
        <span className="sr-only">Aceitar</span>
      </button>
    </>
  ) : (
    <button
      onClick={handleEndCall}
      className="h-14 w-14 rounded-full bg-red-500 text-white transition hover:bg-red-400"
    >
      <PhoneOff size={24} className="mx-auto" />
      <span className="sr-only">Cancelar</span>
    </button>
  )

  if (isVideoCall) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 h-full w-full object-cover ${connected ? 'opacity-100' : 'opacity-0'}`}
        />
        <img
          src={activeCall.user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed='}
          alt={activeCall.user.username}
          className={`absolute inset-0 h-full w-full object-cover ${connected ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        />

        {connected && (
          <div className="absolute right-4 top-4 h-28 w-20 sm:h-36 sm:w-24 overflow-hidden rounded-xl border border-white/30 bg-black/40 shadow-lg backdrop-blur">
            <video ref={localVideoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          </div>
        )}

        <div className="absolute top-0 left-0 right-0 p-4">
          <div className="mx-auto max-w-lg rounded-2xl border border-white/20 bg-black/25 px-4 py-3 text-center text-white backdrop-blur-xl">
            {canMinimize && (
              <button
                onClick={toggleMinimize}
                className="absolute right-7 top-7 text-white/70 hover:text-white"
                title="Minimizar"
              >
                <Minimize2 size={18} />
              </button>
            )}
            <div className="text-lg font-semibold">{activeCall.user.full_name || activeCall.user.username}</div>
            <div className="text-xs text-white/75">{callLabel}</div>
            <div className="text-sm text-white/90 mt-1">{statusText}</div>
          </div>
        </div>

        {isIncomingRinging && !connected && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 backdrop-blur-md p-4">
            <div className="w-full max-w-sm rounded-3xl border border-white/25 bg-slate-950/80 p-5 text-center shadow-2xl shadow-black/80">
              <img
                src={activeCall.user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed='}
                alt={activeCall.user.username}
                className="h-20 w-20 rounded-full object-cover mx-auto"
                style={moodAvatarRingStyle}
              />
              <p className="mt-3 text-lg font-semibold text-white">{activeCall.user.full_name || activeCall.user.username}</p>
              <p className="text-sm text-white/70">{callLabel}</p>
              <p className="mt-1 text-xs text-emerald-300">Chamada recebida agora</p>
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  onClick={handleEndCall}
                  className="h-11 px-4 rounded-full bg-red-500 text-white text-sm font-medium hover:bg-red-400 transition inline-flex items-center gap-2"
                >
                  <PhoneOff size={17} />
                  Recusar
                </button>
                <button
                  onClick={performAccept}
                  className="h-11 px-4 rounded-full bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 transition inline-flex items-center gap-2"
                >
                  <PhoneIncoming size={17} />
                  Atender
                </button>
              </div>
            </div>
          </div>
        )}

        <audio ref={remoteAudioRef} autoPlay className="sr-only" />

        <div className="absolute bottom-0 left-0 right-0 p-5">
          <div className="mx-auto w-fit rounded-3xl border border-white/20 bg-black/25 px-5 py-4 backdrop-blur-xl">
            <div className="flex items-center justify-center gap-5">{actionButtons}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 backdrop-blur-xl">
      <div className="w-full max-w-sm rounded-[2.25rem] border border-white/20 bg-slate-900/45 p-6 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl">
        <div className="flex flex-col items-center gap-4">
          {canMinimize && (
            <button
              onClick={toggleMinimize}
              className="absolute right-4 top-4 text-white/60 hover:text-white"
              title="Minimizar"
            >
              <Minimize2 size={18} />
            </button>
          )}
          <div className="relative">
            {isRinging && (
              <>
                <span className="absolute inset-0 rounded-full bg-emerald-500/25 blur-3xl opacity-60 animate-ping" />
                <span className="absolute inset-1 rounded-full border border-emerald-400/60 opacity-80 animate-pulse" />
              </>
            )}
            <img
              src={activeCall.user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed='}
              alt={activeCall.user.username}
              className="h-28 w-28 rounded-full border-4 border-white/20 object-cover"
              style={moodAvatarRingStyle}
            />
            <span className="absolute -bottom-1 right-0 h-4 w-4 rounded-full border-2 border-slate-950 bg-emerald-500" />
          </div>
          <h2 className="text-2xl font-semibold text-white">
            {activeCall.user.full_name || activeCall.user.username}
          </h2>
          <p className="text-sm text-white/60">{callLabel}</p>
          <p className="text-base text-white/80">{statusText}</p>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <PhoneCall size={16} />
            <span>Áudio HD</span>
          </div>
        </div>

        <audio ref={remoteAudioRef} autoPlay className="sr-only" />

        <div className="mt-6 flex justify-center items-center gap-5">
          {actionButtons}
        </div>
      </div>
    </div>
  )
}

export default CallScreen
