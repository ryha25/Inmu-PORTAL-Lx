import { Card } from '@/components/ui/card'
import { StatCard } from '@/components/stat-card'
import { TxTypeBadge, isOutgoing } from '@/components/tx-type-badge'
import { useI18n } from '@/lib/i18n/context'
import { formatDate, formatInmu } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ArrowDownLeft, ArrowUpRight, Coins, PiggyBank, Target, Wallet, Award, Sparkles } from 'lucide-react'
import { Link } from 'wouter'

type Tx = { id: number; type: string; amount: string; counterparty: string | null; memo: string | null; createdAt: string | Date }

export function DashboardView({
  data,
  displayName,
  walletInmu,
}: {
  data: { balance: number; savingsBalance: number; monthlyChange: number; totalReceived: number; totalSent: number; jarTotal: number; goalRate: number; monthlyPoints: number; recent: Tx[] }
  displayName: string
  walletInmu?: number | null
}) {
  const { t, locale } = useI18n()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          {displayName ? `${displayName}さん、ようこそ` : 'Welcome'}
        </p>
      </div>

      {/* ── 現在のINMU残高カード ── */}
      <Card className="relative overflow-hidden border-border bg-card p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full opacity-20 blur-3xl" style={{ background: 'oklch(0.82 0.13 85)' }} aria-hidden="true" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            <p className="text-sm font-medium text-muted-foreground">現在のINMU残高</p>
          </div>
          <div className="flex items-center gap-2">
            <Award className="size-4 text-chart-5" />
            <span className="text-xs font-medium text-chart-5">{formatInmu(data.monthlyPoints)} pts</span>
          </div>
        </div>

        {walletInmu !== null && walletInmu !== undefined ? (
          <p className="mt-3 font-mono text-4xl font-bold tracking-tight gold-text lg:text-5xl">
            {walletInmu.toLocaleString()}
            <span className="ml-2 text-lg font-medium text-muted-foreground">INMU</span>
          </p>
        ) : (
          <div className="mt-3">
            <p className="font-mono text-4xl font-bold tracking-tight text-muted-foreground/40 lg:text-5xl">---</p>
            <p className="mt-1 text-xs text-muted-foreground">Phantomを接続するとINMU残高が表示されます</p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard labelKey="total_received" value={data.totalReceived} icon={ArrowDownLeft} accent="up" />
        <StatCard labelKey="total_sent" value={data.totalSent} icon={ArrowUpRight} accent="down" />
        <StatCard labelKey="jar_total" value={data.jarTotal} icon={PiggyBank} accent="teal" />
        <StatCard labelKey="goal_rate" value={Math.round(data.goalRate)} icon={Target} accent="gold" isInmu={false} suffix="%" />
      </div>

      <Card className="border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Coins className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">{t('recent_history')}</h2>
          </div>
          <Link href="/history" className="text-xs font-medium text-primary hover:underline">{t('view_all')}</Link>
        </div>
        {data.recent.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.recent.map((tx) => {
              const out = isOutgoing(tx.type)
              return (
                <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <TxTypeBadge type={tx.type} />
                      {tx.counterparty && <span className="truncate text-xs text-muted-foreground">{tx.counterparty}</span>}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{tx.memo || formatDate(tx.createdAt, locale)}</p>
                  </div>
                  <p className={cn('shrink-0 font-mono text-sm font-bold tabular-nums', out ? 'text-destructive' : 'text-chart-5')}>
                    {out ? '-' : '+'}{formatInmu(tx.amount)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
