import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'

export function BalanceSummary({ balance, totalReceived, totalSent }: { balance: number; totalReceived: number; totalSent: number }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-3">
      <Card className="relative overflow-hidden border-border bg-card p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full opacity-20 blur-3xl" style={{ background: 'oklch(0.82 0.13 85)' }} aria-hidden="true" />
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-primary" />
          <p className="text-sm font-medium text-muted-foreground">{t('current_balance')}</p>
        </div>
        <p className="mt-3 font-mono text-4xl font-bold tracking-tight gold-text">
          {formatInmu(balance)}
          <span className="ml-2 text-lg font-medium text-muted-foreground">INMU</span>
        </p>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-chart-5">
            <ArrowDownLeft className="size-4" />
            <p className="text-xs font-medium text-muted-foreground">{t('total_received')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-chart-5">{formatInmu(totalReceived)}</p>
        </Card>
        <Card className="border-border bg-card p-4">
          <div className="flex items-center gap-2 text-destructive">
            <ArrowUpRight className="size-4" />
            <p className="text-xs font-medium text-muted-foreground">{t('total_sent')}</p>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums text-destructive">{formatInmu(totalSent)}</p>
        </Card>
      </div>
    </div>
  )
}
