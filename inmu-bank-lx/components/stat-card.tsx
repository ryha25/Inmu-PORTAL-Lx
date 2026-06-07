'use client'

import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import type { TranslationKey } from '@/lib/i18n/dict'
import { formatInmu } from '@/lib/format'
import { cn } from '@/lib/utils'

export function StatCard({
  labelKey,
  value,
  icon: Icon,
  accent = 'default',
  isInmu = true,
  suffix,
  hint,
}: {
  labelKey: TranslationKey
  value: number
  icon: React.ElementType
  accent?: 'default' | 'gold' | 'teal' | 'up' | 'down'
  isInmu?: boolean
  suffix?: string
  hint?: string
}) {
  const { t } = useI18n()

  const accentClasses: Record<string, string> = {
    default: 'text-foreground',
    gold: 'text-primary',
    teal: 'text-accent',
    up: 'text-chart-5',
    down: 'text-destructive',
  }
  const iconBg: Record<string, string> = {
    default: 'bg-secondary text-muted-foreground',
    gold: 'bg-primary/15 text-primary',
    teal: 'bg-accent/15 text-accent',
    up: 'bg-chart-5/15 text-chart-5',
    down: 'bg-destructive/15 text-destructive',
  }

  const display =
    accent === 'up' && value > 0
      ? `+${formatInmu(value)}`
      : isInmu
        ? formatInmu(value)
        : value

  return (
    <Card className="border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground leading-relaxed">
          {t(labelKey)}
        </p>
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            iconBg[accent],
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <p
        className={cn(
          'mt-2 font-mono text-2xl font-bold tabular-nums tracking-tight',
          accentClasses[accent],
        )}
      >
        {display}
        {suffix && (
          <span className="ml-1 text-sm font-medium text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  )
}
