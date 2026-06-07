'use client'

import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { Trophy } from 'lucide-react'

export function RankingView({
  rows,
}: {
  rows: {
    rank: number
    userId: string
    displayName: string
    balance: number
    totalReceived: number
    participations: number
  }[]
}) {
  const { t } = useI18n()

  function maskName(name: string) {
    if (name.length <= 2) return name
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <Card
          key={r.userId}
          className={`border-border bg-card p-3 ${
            r.rank <= 3 ? 'border-primary/50' : ''
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">
              {r.rank <= 3 ? (
                <Trophy className="size-4" />
              ) : (
                <span className="text-xs">{r.rank}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{maskName(r.displayName)}</p>
              <p className="text-xs text-muted-foreground">
                {t('participations')}: {r.participations}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono font-bold tabular-nums gold-text">
                {formatInmu(r.balance)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('total_received')}: {formatInmu(r.totalReceived)}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
