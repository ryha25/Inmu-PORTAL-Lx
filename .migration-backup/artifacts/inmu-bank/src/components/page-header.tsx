import { useI18n } from '@/lib/i18n/context'
import type { TranslationKey } from '@/lib/i18n/dict'

export function PageHeader({ titleKey, children }: { titleKey: TranslationKey; children?: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-xl font-bold tracking-tight lg:text-2xl text-balance">{t(titleKey)}</h1>
      {children}
    </div>
  )
}
