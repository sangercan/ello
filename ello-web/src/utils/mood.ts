import type { CSSProperties } from 'react'

export type MoodType =
  | 'feliz'
  | 'focado'
  | 'relaxando'
  | 'animado'
  | 'criativo'
  | 'grato'

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
    className: 'from-lime-500/20 to-emerald-500/10 border-lime-400/30',
    suggestion: 'Energia leve hoje. Poste algo positivo no feed.',
    ringColor: '#84cc16',
  },
  focado: {
    label: 'Focado',
    className: 'from-sky-500/20 to-cyan-500/10 border-sky-400/30',
    suggestion: 'Modo foco ativo. Compartilhe algo produtivo.',
    ringColor: '#38bdf8',
  },
  relaxando: {
    label: 'Relaxando',
    className: 'from-violet-500/20 to-fuchsia-500/10 border-violet-400/30',
    suggestion: 'Hora de desacelerar. Poste um momento tranquilo.',
    ringColor: '#a78bfa',
  },
  animado: {
    label: 'Animado',
    className: 'from-rose-500/20 to-pink-500/10 border-rose-400/30',
    suggestion: 'Ritmo alto. Vale uma vibe com mais movimento.',
    ringColor: '#fb7185',
  },
  criativo: {
    label: 'Criativo',
    className: 'from-teal-500/20 to-cyan-500/10 border-teal-400/30',
    suggestion: 'Ideias novas no ar. Mostre um projeto ou insight.',
    ringColor: '#2dd4bf',
  },
  grato: {
    label: 'Grato',
    className: 'from-pink-500/20 to-rose-500/10 border-pink-400/30',
    suggestion: 'Compartilhe algo bom que aconteceu hoje.',
    ringColor: '#f472b6',
  },
}

export const moodList = Object.keys(moodTheme) as MoodType[]

export const isMoodType = (value: unknown): value is MoodType => {
  if (typeof value !== 'string') return false
  return moodList.includes(value as MoodType)
}

export const getMoodAvatarRingStyle = (mood: MoodType): CSSProperties => ({
  boxShadow: `0 0 0 2px ${moodTheme[mood].ringColor}, 0 0 0 4px rgba(2, 6, 23, 0.85)`,
})
