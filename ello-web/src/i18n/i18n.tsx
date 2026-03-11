import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translations, type SupportedLanguage } from './translations'

type I18nContextValue = {
  language: SupportedLanguage
  setLanguage: (language: SupportedLanguage, persist?: boolean) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

const STORAGE_KEY = 'ello.language'

const SPANISH_COUNTRIES = new Set([
  'AR', 'BO', 'CL', 'CO', 'CR', 'CU', 'DO', 'EC', 'ES', 'GT', 'HN', 'MX', 'NI', 'PA', 'PE', 'PR', 'PY', 'SV', 'UY', 'VE',
])

const PORTUGUESE_COUNTRIES = new Set(['BR', 'PT', 'AO', 'MZ', 'GW', 'CV', 'ST', 'TL'])

const getNestedTranslation = (lang: SupportedLanguage, key: string): string | undefined => {
  const parts = key.split('.')
  let node: any = translations[lang]
  for (const part of parts) {
    node = node?.[part]
    if (node === undefined) return undefined
  }
  return typeof node === 'string' ? node : undefined
}

const resolveLanguageFromLocale = (locale?: string): SupportedLanguage => {
  if (!locale) return 'en'
  const normalized = locale.toLowerCase()
  if (normalized.startsWith('pt')) return 'pt'
  if (normalized.startsWith('es')) return 'es'
  return 'en'
}

const resolveLanguageFromCountry = (countryCode?: string): SupportedLanguage => {
  if (!countryCode) return 'en'
  const upper = countryCode.toUpperCase()
  if (PORTUGUESE_COUNTRIES.has(upper)) return 'pt'
  if (SPANISH_COUNTRIES.has(upper)) return 'es'
  return 'en'
}

const detectLanguage = async (): Promise<SupportedLanguage> => {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'pt' || stored === 'es') return stored

  const browserLanguage = resolveLanguageFromLocale(navigator.languages?.[0] || navigator.language)

  try {
    const response = await fetch('https://ipapi.co/json/', { method: 'GET' })
    if (response.ok) {
      const data = await response.json()
      const countryLanguage = resolveLanguageFromCountry(String(data?.country_code || ''))
      return countryLanguage || browserLanguage
    }
  } catch {
    // Silent fallback to browser language.
  }

  return browserLanguage
}

const applyParams = (template: string, params?: Record<string, string | number>) => {
  if (!params) return template
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => String(params[name] ?? ''))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en')

  useEffect(() => {
    let mounted = true
    void detectLanguage().then((detectedLanguage) => {
      if (!mounted) return
      setLanguageState(detectedLanguage)
      document.documentElement.lang = detectedLanguage
    })
    return () => {
      mounted = false
    }
  }, [])

  const setLanguage = useCallback((nextLanguage: SupportedLanguage, persist = true) => {
    setLanguageState(nextLanguage)
    document.documentElement.lang = nextLanguage
    if (persist) {
      localStorage.setItem(STORAGE_KEY, nextLanguage)
    }
  }, [])

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const localized = getNestedTranslation(language, key)
    const fallback = getNestedTranslation('en', key)
    return applyParams(localized || fallback || key, params)
  }, [language])

  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
