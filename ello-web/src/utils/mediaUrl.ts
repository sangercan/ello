import { RESOLVED_API_BASE_URL } from '@services/api'

const FALLBACK_ORIGIN = 'https://ellosocial.com'

const safeParseUrl = (value: string) => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

const getMediaOrigin = () => {
  const configuredBase = (RESOLVED_API_BASE_URL || '').trim()

  if (/^https?:\/\//i.test(configuredBase)) {
    const parsed = safeParseUrl(configuredBase)
    if (parsed?.origin) return parsed.origin
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return FALLBACK_ORIGIN
}

const joinOriginAndPath = (origin: string, path: string) => {
  const normalizedOrigin = origin.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedOrigin}${normalizedPath}`
}

export const resolveMediaUrl = (value?: string | null) => {
  if (!value) return ''

  const raw = String(value).trim()
  if (!raw) return ''

  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw

  const origin = getMediaOrigin()

  if (/^https?:\/\//i.test(raw)) {
    // Keep absolute external URLs untouched unless they point to uploads.
    const uploadsIndex = raw.indexOf('/uploads/')
    if (uploadsIndex >= 0) {
      return joinOriginAndPath(origin, raw.slice(uploadsIndex))
    }
    return raw
  }

  if (raw.startsWith('//')) {
    return `https:${raw}`
  }

  if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) {
    return joinOriginAndPath(origin, raw)
  }

  if (raw.startsWith('/')) {
    return joinOriginAndPath(origin, raw)
  }

  // If value looks like a bare filename (e.g. "stor.jpeg"), assume it lives under /uploads/
  const bareFilenameMatch = /^([\w\-]+)\.([a-z0-9]{2,6})(\?.*)?$/i.exec(raw)
  if (bareFilenameMatch) {
    return joinOriginAndPath(origin, `/uploads/${raw}`)
  }

  return joinOriginAndPath(origin, raw)
}
