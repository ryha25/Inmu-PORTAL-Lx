import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu, formatDate } from '@/lib/format'
import { Gift } from 'lucide-react'

type Tx = { id: number; type: string; amount: string; memo: string | null; createdAt: string }

export function AirdropView({ received }: { received: Tx[] }) {
  const { t, locale } = useI18n()
  const total = received.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Gift className="size-4 text-primary" />
          <p className="text-sm font-medium text-muted-foreground">{t('received_airdrops')}</p>
        </div>
        <p className="mt-2 font-mono text-3xl font-bold tabular-nums gold-text">{formatInmu(total)}</p>
      </Card>
      {received.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {received.map((r) => (
            <Card key={r.id} className="border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">{t('type_airdrop')}</span>
                  {r.memo && <p className="mt-1 text-xs text-muted-foreground">{r.memo}</p>}
                </div>
                <div className="text-right">
                  <p className="font-mono font-bold text-chart-5">+{formatInmu(r.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.createdAt, locale)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
