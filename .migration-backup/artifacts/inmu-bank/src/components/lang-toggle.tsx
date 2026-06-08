import { useI18n } from '@/lib/i18n/context'
import { cn } from '@/lib/utils'

export function LangToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useI18n()
  return (
    <div className={cn('inline-flex items-center rounded-full border border-border bg-card/60 p-0.5 text-xs', className)}>
      <button
        type="button"
        onClick={() => setLocale('ja')}
        className={cn('min-h-8 rounded-full px-3 font-medium transition-colors', locale === 'ja' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
      >
        日本語
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        className={cn('min-h-8 rounded-full px-3 font-medium transition-colors', locale === 'en' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
      >
        EN
      </button>
    </div>
  )
}
