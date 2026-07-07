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

function localizeDom(root: ParentNode, locale: Locale) {
  const from = locale === 'en' ? dict.ja : dict.en
  const to = dict[locale]
  const translations = new Map<string, string>()
  ;(Object.keys(to) as TranslationKey[]).forEach(key => {
    translations.set(from[key], to[key])
  })

  const translateValue = (value: string) => {
    const trimmed = value.trim()
    const translated = translations.get(trimmed)
    return translated ? value.replace(trimmed, translated) : value
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null = walker.nextNode()
  while (node) {
    if (node.nodeValue) {
      const translated = translateValue(node.nodeValue)
      if (translated !== node.nodeValue) node.nodeValue = translated
    }
    node = walker.nextNode()
  }
  root.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]').forEach(element => {
    ;['placeholder', 'title', 'aria-label'].forEach(attribute => {
      const value = element.getAttribute(attribute)
      if (value) element.setAttribute(attribute, translateValue(value))
    })
  })
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'ja'
    const stored = window.localStorage.getItem('inmu-locale')
    return stored === 'en' ? 'en' : 'ja'
  })

  useEffect(() => {
    document.documentElement.lang = locale
    localizeDom(document.body, locale)
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'characterData' && mutation.target.parentNode) {
          localizeDom(mutation.target.parentNode, locale)
        }
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) localizeDom(node as Element, locale)
          if (node.nodeType === Node.TEXT_NODE && node.parentNode) localizeDom(node.parentNode, locale)
        })
      })
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [locale])

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
