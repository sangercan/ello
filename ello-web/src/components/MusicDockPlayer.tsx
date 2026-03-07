import { useEffect, useMemo, useRef, useState } from 'react'
import { MonitorUp, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { useMusicPlayerStore } from '@store/musicPlayerStore'
import { useLocation } from 'react-router-dom'

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function MusicDockPlayer() {
  const {
    queue,
    currentTrackId,
    isPlaying,
    volume,
    currentTime,
    duration,
    seekTo,
    setPlaying,
    setVolume,
    setProgress,
    consumeSeek,
    togglePlayPause,
    playNext,
    playPrevious,
  } = useMusicPlayerStore()

  const [hidden, setHidden] = useState(false)
  const [pipSupported, setPipSupported] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pipWindowRef = useRef<Window | null>(null)
  const location = useLocation()
  const isMusicRoute = location.pathname.startsWith('/music')

  const currentTrack = useMemo(() => queue.find((item) => item.id === currentTrackId) || null, [queue, currentTrackId])

  useEffect(() => {
    const supported = typeof window !== 'undefined' && Boolean((window as any).documentPictureInPicture?.requestWindow)
    setPipSupported(supported)
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentTrack) return

    if (isPlaying) {
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          setPlaying(false)
        })
      }
    } else {
      audio.pause()
    }
  }, [currentTrack, isPlaying, setPlaying])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (seekTo === null) return

    audio.currentTime = seekTo
    consumeSeek()
  }, [seekTo, consumeSeek])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    if (currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
      })
    }

    navigator.mediaSession.setActionHandler('play', () => setPlaying(true))
    navigator.mediaSession.setActionHandler('pause', () => setPlaying(false))
    navigator.mediaSession.setActionHandler('previoustrack', playPrevious)
    navigator.mediaSession.setActionHandler('nexttrack', playNext)
    navigator.mediaSession.setActionHandler('seekto', (details: MediaSessionActionDetails) => {
      if (typeof details.seekTime === 'number') {
        useMusicPlayerStore.getState().requestSeek(details.seekTime)
      }
    })

    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('seekto', null)
    }
  }, [currentTrack, setPlaying, playPrevious, playNext])

  useEffect(() => {
    const pipWindow = pipWindowRef.current
    if (!pipWindow || pipWindow.closed) return

    const titleEl = pipWindow.document.getElementById('ello-track-title')
    const artistEl = pipWindow.document.getElementById('ello-track-artist')
    const playBtn = pipWindow.document.getElementById('ello-pip-play') as HTMLButtonElement | null

    if (titleEl) titleEl.textContent = currentTrack?.title || 'Sem música'
    if (artistEl) artistEl.textContent = currentTrack?.artist || ''
    if (playBtn) playBtn.textContent = isPlaying ? 'Pausar' : 'Tocar'
  }, [currentTrack, isPlaying])

  const openPip = async () => {
    const dpi = (window as any).documentPictureInPicture
    if (!dpi?.requestWindow || pipWindowRef.current) return

    const pipWindow = await dpi.requestWindow({ width: 340, height: 180 })
    pipWindowRef.current = pipWindow

    pipWindow.document.documentElement.style.margin = '0'
    pipWindow.document.documentElement.style.padding = '0'
    pipWindow.document.documentElement.style.height = '100%'
    pipWindow.document.body.style.margin = '0'
    pipWindow.document.body.style.padding = '0'
    pipWindow.document.body.style.height = '100%'
    pipWindow.document.body.style.background = '#020617'

    pipWindow.document.body.innerHTML = `
      <div style="font-family:'Segoe UI',sans-serif; margin:0; padding:14px; height:100%; box-sizing:border-box; color:#e2e8f0; background: radial-gradient(120% 100% at 0% 0%, #0f172a 0%, #020617 58%, #000814 100%); display:flex; flex-direction:column; justify-content:space-between;">
        <div style="display:flex; gap:10px; align-items:center; min-width:0;">
          <div style="width:34px; height:34px; border-radius:10px; background:linear-gradient(145deg,#0369a1,#0ea5e9); display:flex; align-items:center; justify-content:center; font-size:16px;">♪</div>
          <div style="min-width:0;">
            <div id="ello-track-title" style="font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
            <div id="ello-track-artist" style="color:#94a3b8; font-size:11px; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
          </div>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button id="ello-pip-prev" style="flex:1; border:0; border-radius:10px; background:#0b1220; color:#e2e8f0; height:34px; font-size:12px;">◀◀</button>
          <button id="ello-pip-play" style="flex:1.2; border:0; border-radius:10px; background:linear-gradient(145deg,#0284c7,#0ea5e9); color:white; height:34px; font-size:12px; font-weight:700;">Tocar</button>
          <button id="ello-pip-next" style="flex:1; border:0; border-radius:10px; background:#0b1220; color:#e2e8f0; height:34px; font-size:12px;">▶▶</button>
        </div>
      </div>
    `

    const prevBtn = pipWindow.document.getElementById('ello-pip-prev')
    const playBtn = pipWindow.document.getElementById('ello-pip-play')
    const nextBtn = pipWindow.document.getElementById('ello-pip-next')

    prevBtn?.addEventListener('click', () => useMusicPlayerStore.getState().playPrevious())
    playBtn?.addEventListener('click', () => useMusicPlayerStore.getState().togglePlayPause())
    nextBtn?.addEventListener('click', () => useMusicPlayerStore.getState().playNext())

    pipWindow.addEventListener('pagehide', () => {
      pipWindowRef.current = null
    })

    const titleEl = pipWindow.document.getElementById('ello-track-title')
    const artistEl = pipWindow.document.getElementById('ello-track-artist')
    if (titleEl) titleEl.textContent = currentTrack?.title || 'Sem música'
    if (artistEl) artistEl.textContent = currentTrack?.artist || ''
    if (playBtn) playBtn.textContent = isPlaying ? 'Pausar' : 'Tocar'
  }

  const handleAudioPause = () => {
    const audio = audioRef.current
    // Ignore pause emitted at natural end; onEnded will move to next track.
    if (audio?.ended) return
    setPlaying(false)
  }

  const handleAudioEnded = () => {
    setProgress(0, duration)
    playNext()
  }

  if (!currentTrack) {
    return <audio ref={audioRef} onTimeUpdate={() => {
      const audio = audioRef.current
      if (!audio) return
      setProgress(audio.currentTime, audio.duration || 0)
    }} onLoadedMetadata={() => {
      const audio = audioRef.current
      if (!audio) return
      setProgress(audio.currentTime, audio.duration || 0)
    }} onPlay={() => setPlaying(true)} onPause={handleAudioPause} onEnded={handleAudioEnded} />
  }

  return (
    <>
      <audio
        ref={audioRef}
        src={currentTrack.audioUrl}
        onTimeUpdate={() => {
          const audio = audioRef.current
          if (!audio) return
          setProgress(audio.currentTime, audio.duration || 0)
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current
          if (!audio) return
          setProgress(audio.currentTime, audio.duration || 0)
        }}
        onPlay={() => setPlaying(true)}
        onPause={handleAudioPause}
        onEnded={handleAudioEnded}
      />

      {isMusicRoute && !hidden && (
        <div className="fixed bottom-3 left-3 right-3 sm:left-6 sm:right-6 z-[170] rounded-2xl border border-slate-700 bg-slate-900/95 backdrop-blur p-3 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{currentTrack.title}</p>
              <p className="text-xs text-slate-300 truncate">{currentTrack.artist}</p>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={playPrevious} className="h-9 w-9 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 inline-flex items-center justify-center" title="Anterior">
                <SkipBack size={15} />
              </button>
              <button onClick={togglePlayPause} className="h-10 w-10 rounded-full bg-primary text-white hover:bg-primary/85 inline-flex items-center justify-center" title={isPlaying ? 'Pausar' : 'Tocar'}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button onClick={playNext} className="h-9 w-9 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 inline-flex items-center justify-center" title="Próxima">
                <SkipForward size={15} />
              </button>
              {pipSupported && (
                <button onClick={openPip} className="h-9 w-9 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 inline-flex items-center justify-center" title="Abrir Picture in Picture">
                  <MonitorUp size={15} />
                </button>
              )}
              <button onClick={() => setHidden(true)} className="h-9 w-9 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 inline-flex items-center justify-center" title="Ocultar player">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-slate-400 w-10 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              value={Math.min(currentTime, Math.max(duration, 1))}
              onChange={(event) => useMusicPlayerStore.getState().requestSeek(Number(event.target.value))}
              className="flex-1 accent-sky-500"
            />
            <span className="text-[11px] text-slate-400 w-10">{formatTime(duration)}</span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              className="w-28 accent-sky-500"
            />
          </div>
        </div>
      )}

      {isMusicRoute && hidden && (
        <button
          onClick={() => setHidden(false)}
          className="fixed bottom-4 right-4 z-[170] h-11 px-4 rounded-full bg-slate-900 border border-slate-700 text-slate-100 text-xs shadow-xl"
        >
          Abrir player
        </button>
      )}
    </>
  )
}
