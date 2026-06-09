import { Card } from '@/components/ui/card'
import { StatCard } from '@/components/stat-card'
import { TxTypeBadge, isOutgoing } from '@/components/tx-type-badge'
import { useI18n } from '@/lib/i18n/context'
import { formatDate, formatInmu } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ArrowDownLeft, ArrowUpRight, Coins, PiggyBank, Target, TrendingUp, Wallet, Award, Sparkles, WalletCards } from 'lucide-react'
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
  const totalHoldings = data.balance + data.savingsBalance + data.jarTotal

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          {displayName ? `${displayName}さん、ようこそ` : 'Welcome'}
        </p>
      </div>

      {/* ── Main balance card ── */}
      <Card className="relative overflow-hidden border-border bg-card p-6">
        <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full opacity-20 blur-3xl" style={{ background: 'oklch(0.82 0.13 85)' }} aria-hidden="true" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            <p className="text-sm font-medium text-muted-foreground">{t('current_balance')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Award className="size-4 text-chart-5" />
            <span className="text-xs font-medium text-chart-5">{formatInmu(data.monthlyPoints)} pts</span>
          </div>
        </div>

        {/* Internal bank balance */}
        <p className="mt-3 font-mono text-4xl font-bold tracking-tight gold-text lg:text-5xl">
          {formatInmu(data.balance)}
          <span className="ml-2 text-lg font-medium text-muted-foreground">INMU</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{t('total_holding')}: {formatInmu(totalHoldings)} INMU</p>

        {/* Phantom wallet INMU balance (on-chain, SOLなし) */}
        {walletInmu !== null && walletInmu !== undefined && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <WalletCards className="size-4 shrink-0 text-primary" />
            <div className="flex flex-1 items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">{t('inmu_wallet_balance')}</span>
              <span className="font-mono text-sm font-bold gold-text tabular-nums">
                {walletInmu.toLocaleString()} INMU
              </span>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', data.monthlyChange >= 0 ? 'bg-chart-5/15 text-chart-5' : 'bg-destructive/15 text-destructive')}>
            <TrendingUp className="size-3.5" />
            {data.monthlyChange >= 0 ? '+' : ''}{formatInmu(data.monthlyChange)}
          </span>
          <span className="text-muted-foreground">{t('monthly_change')}</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard labelKey="total_received" value={data.totalReceived} icon={ArrowDownLeft} accent="up" />
        <StatCard labelKey="total_sent" value={data.totalSent} icon={ArrowUpRight} accent="down" />
        <StatCard labelKey="jar_total" value={data.jarTotal} icon={PiggyBank} accent="teal" />
        <StatCard labelKey="goal_rate" value={Math.round(data.goalRate)} icon={Target} accent="gold" isInmu={false} suffix="%" />
      </div>

      {data.savingsBalance > 0 && (
        <Card className="border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiggyBank className="size-4 text-accent" />
              <p className="text-sm font-medium text-muted-foreground">Savings Balance</p>
            </div>
            <Link href="/balance" className="text-xs font-medium text-primary hover:underline">{t('view_all')}</Link>
          </div>
          <p className="mt-2 font-mono text-xl font-bold tabular-nums">{formatInmu(data.savingsBalance)}</p>
        </Card>
      )}

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
