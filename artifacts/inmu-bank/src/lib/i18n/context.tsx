import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { dict, type Locale, type TranslationKey } from './dict'

type I18nContextType = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ja')

  useEffect(() => {
    const stored = window.localStorage.getItem('inmu-locale') as Locale | null
    if (stored === 'ja' || stored === 'en') setLocaleState(stored)
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    window.localStorage.setItem('inmu-locale', l)
    document.documentElement.lang = l
  }, [])

  const t = useCallback(
    (key: TranslationKey) => dict[locale][key] ?? key,
    [locale],
  )

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
