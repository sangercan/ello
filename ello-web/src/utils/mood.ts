import type { CSSProperties } from 'react'

export type MoodType =
  | 'feliz'
  | 'focado'
  | 'relaxando'
  | 'animado'
  | 'calmo'
  | 'pensativo'
  | 'cansado'
  | 'triste'

export const DEFAULT_MOOD: MoodType = 'focado'

export const moodTheme: Record<
  MoodType,
  {
    label: string
    className: string
    suggestion: string
    ringColor: string
  }
> = {
  feliz: {
    label: 'Feliz',
    className: 'from-teal-500/20 to-cyan-500/10 border-teal-400/30',
    suggestion: 'Energia alta hoje. Que tal postar uma vibe alegre?',
    ringColor: '#14B8A6',
  },
  focado: {
    label: 'Focado',
    className: 'from-blue-500/20 to-sky-500/10 border-blue-400/30',
    suggestion: 'Modo foco ativo. Compartilhe algo produtivo.',
    ringColor: '#3B82F6',
  },
  relaxando: {
    label: 'Relaxando',
    className: 'from-violet-500/20 to-fuchsia-500/10 border-violet-400/30',
    suggestion: 'Momento de desacelerar e respirar.',
    ringColor: '#A78BFA',
  },
  animado: {
    label: 'Animado',
    className: 'from-lime-500/20 to-green-500/10 border-lime-400/30',
    suggestion: 'Ritmo alto. Hora de compartilhar algo com energia.',
    ringColor: '#84CC16',
  },
  calmo: {
    label: 'Calmo',
    className: 'from-cyan-500/20 to-sky-500/10 border-cyan-400/30',
    suggestion: 'Dia leve. Uma publicação tranquila combina com seu momento.',
    ringColor: '#06B6D4',
  },
  pensativo: {
    label: 'Pensativo',
    className: 'from-indigo-500/20 to-blue-500/10 border-indigo-400/30',
    suggestion: 'Reflexão em alta. Que insight você quer compartilhar?',
    ringColor: '#6366F1',
  },
  cansado: {
    label: 'Cansado',
    className: 'from-rose-500/25 to-fuchsia-500/15 border-rose-400/45',
    suggestion: 'Pega mais leve hoje. Conte algo real do seu dia.',
    ringColor: '#F43F5E',
  },
  triste: {
    label: 'Triste',
    className: 'from-blue-500/30 to-indigo-500/20 border-blue-400/50',
    suggestion: 'Se quiser, compartilhe como voce esta se sentindo.',
    ringColor: '#2563EB',
  },
}

export const moodList = Object.keys(moodTheme) as MoodType[]

const legacyMoodAliases: Record<string, MoodType> = {
  criativo: 'pensativo',
  grato: 'calmo',
}

export const isMoodType = (value: unknown): value is MoodType => {
  if (typeof value !== 'string') return false
  return moodList.includes(value as MoodType)
}

export const resolveMoodType = (value: unknown): MoodType => {
  if (isMoodType(value)) return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (isMoodType(normalized)) return normalized
    if (legacyMoodAliases[normalized]) return legacyMoodAliases[normalized]
  }
  return DEFAULT_MOOD
}

export const getMoodAvatarRingStyle = (mood: unknown): CSSProperties => {
  const normalizedMood = resolveMoodType(mood)
  return {
    boxShadow: `0 0 0 2px ${moodTheme[normalizedMood].ringColor}, 0 0 0 4px rgba(2, 6, 23, 0.85)`,
  }
}
