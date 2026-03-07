import { create } from 'zustand'

export type PlayerTrack = {
  id: number
  title: string
  artist: string
  audioUrl: string
  coverUrl?: string | null
}

type MusicPlayerState = {
  queue: PlayerTrack[]
  currentTrackId: number | null
  isPlaying: boolean
  volume: number
  currentTime: number
  duration: number
  seekTo: number | null
  setQueue: (tracks: PlayerTrack[]) => void
  playTrack: (track: PlayerTrack, queueOverride?: PlayerTrack[]) => void
  togglePlayPause: () => void
  setPlaying: (playing: boolean) => void
  playNext: () => void
  playPrevious: () => void
  setVolume: (volume: number) => void
  setProgress: (currentTime: number, duration: number) => void
  requestSeek: (seconds: number) => void
  consumeSeek: () => void
}

export const useMusicPlayerStore = create<MusicPlayerState>((set, get) => ({
  queue: [],
  currentTrackId: null,
  isPlaying: false,
  volume: 1,
  currentTime: 0,
  duration: 0,
  seekTo: null,

  setQueue: (tracks) => {
    set((state) => {
      if (tracks.length === 0) {
        return {
          queue: [],
          currentTrackId: null,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        }
      }

      const hasCurrent = state.currentTrackId !== null && tracks.some((item) => item.id === state.currentTrackId)
      const nextTrackId = hasCurrent ? state.currentTrackId : tracks[0].id

      return {
        queue: tracks,
        currentTrackId: nextTrackId,
      }
    })
  },

  playTrack: (track, queueOverride) => {
    set((state) => {
      const queue = queueOverride && queueOverride.length > 0
        ? queueOverride
        : state.queue.some((item) => item.id === track.id)
          ? state.queue
          : [...state.queue, track]

      return {
        queue,
        currentTrackId: track.id,
        isPlaying: true,
      }
    })
  },

  togglePlayPause: () => {
    set((state) => ({ isPlaying: !state.isPlaying }))
  },

  setPlaying: (playing) => {
    set({ isPlaying: playing })
  },

  playNext: () => {
    const state = get()
    if (state.queue.length === 0 || state.currentTrackId === null) return

    const currentIndex = state.queue.findIndex((item) => item.id === state.currentTrackId)
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % state.queue.length

    set({
      currentTrackId: state.queue[nextIndex].id,
      isPlaying: true,
    })
  },

  playPrevious: () => {
    const state = get()
    if (state.queue.length === 0 || state.currentTrackId === null) return

    const currentIndex = state.queue.findIndex((item) => item.id === state.currentTrackId)
    const prevIndex = currentIndex <= 0 ? state.queue.length - 1 : currentIndex - 1

    set({
      currentTrackId: state.queue[prevIndex].id,
      isPlaying: true,
    })
  },

  setVolume: (volume) => {
    set({ volume: Math.max(0, Math.min(1, volume)) })
  },

  setProgress: (currentTime, duration) => {
    set({ currentTime, duration })
  },

  requestSeek: (seconds) => {
    set({ seekTo: Math.max(0, seconds) })
  },

  consumeSeek: () => {
    set({ seekTo: null })
  },
}))
