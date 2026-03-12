import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_MOOD, isMoodType, type MoodType } from '@/utils/mood'

interface MoodStore {
  mood: MoodType
  setMood: (mood: MoodType) => void
}

export const useMoodStore = create<MoodStore>()(
  persist(
    (set) => ({
      mood: DEFAULT_MOOD,
      setMood: (mood) => set({ mood }),
    }),
    {
      name: 'ello.dashboard.mood',
      partialize: (state) => ({ mood: state.mood }),
      merge: (persistedState, currentState) => {
        const persistedMood = (persistedState as Partial<MoodStore> | undefined)?.mood
        if (isMoodType(persistedMood)) {
          return { ...currentState, mood: persistedMood }
        }
        return currentState
      },
    },
  ),
)
