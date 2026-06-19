import { Card } from '@/components/ui/card'
import { StatCard } from '@/components/stat-card'
import { TxTypeBadge, isOutgoing } from '@/components/tx-type-badge'
import { useI18n } from '@/lib/i18n/context'
import { formatDate, formatInmu } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ArrowDownLeft, ArrowUpRight, Award, Coins, Flame, RefreshCw, Sparkles, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from 'wouter'
import { useState } from 'react'

type Tx = { id: number; type: string; amount: string; counterparty: string | null; memo: string | null; createdAt: string | Date }
type Currency = 'INMU' | 'USD' | 'JPY'

export function DashboardView({
  data,
  displayName,
  walletInmu,
  dailyClaim,
  hasSolWallet,
  onScan,
  scanning,
  inmuPrice,
}: {
  data: { balance: number; savingsBalance: number; monthlyChange: number; totalReceived: number; totalSent: number; jarTotal: number; goalRate: number; monthlyPoints: number; recent: Tx[] }
  displayName: string
  walletInmu?: number | null
  dailyClaim?: { alreadyClaimed: boolean; streak: number; onClaim: () => void }
  hasSolWallet?: boolean
  onScan?: () => void
  scanning?: boolean
  onSend?: () => void
  inmuPrice?: { usdPrice: number; jpyRate: number }
}) {
  const { t, locale } = useI18n()
  const [currency, setCurrency] = useState<Currency>('INMU')

  function formatBalanceDisplay(inmu: number): string {
    if (currency === 'USD' && inmuPrice?.usdPrice) {
      const val = inmu * inmuPrice.usdPrice
      return `$${val < 0.01 ? val.toFixed(6) : val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    if (currency === 'JPY' && inmuPrice?.usdPrice && inmuPrice?.jpyRate) {
      const val = inmu * inmuPrice.usdPrice * inmuPrice.jpyRate
      return `¥${Math.floor(val).toLocaleString('ja-JP')}`
    }
    return inmu.toLocaleString()
  }

  function currencyUnit(): string {
    if (currency === 'USD') return 'USD'
    if (currency === 'JPY') return 'JPY'
    return 'INMU'
  }

  const canConvert = !!(inmuPrice?.usdPrice && inmuPrice.usdPrice > 0)

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
          <>
            <p className="mt-3 font-mono text-4xl font-bold tracking-tight gold-text lg:text-5xl">
              {formatBalanceDisplay(walletInmu)}
              <span className="ml-2 text-lg font-medium text-muted-foreground">{currencyUnit()}</span>
            </p>
            {canConvert && (
              <div className="mt-3 flex gap-1">
                {(['INMU', 'USD', 'JPY'] as Currency[]).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors',
                      currency === c
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {c === 'JPY' ? '¥ JPY' : c === 'USD' ? '$ USD' : 'INMU'}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="mt-3">
            <p className="font-mono text-4xl font-bold tracking-tight text-muted-foreground/40 lg:text-5xl">---</p>
            <p className="mt-1 text-xs text-muted-foreground">SOLアドレスを登録するとINMU残高が表示されます</p>
          </div>
        )}
      </Card>

      {/* ── ログインボーナスバナー ── */}
      {dailyClaim && (
        <Card className="border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                <Award className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">今日のログインボーナス</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Flame className="size-3 text-destructive" />
                  <p className="text-xs text-muted-foreground">ストリーク: {dailyClaim.streak}日</p>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={dailyClaim.onClaim}
              disabled={dailyClaim.alreadyClaimed}
              className="min-h-9 shrink-0 gap-1.5 text-xs"
            >
              <Award className="size-3.5" />
              {dailyClaim.alreadyClaimed ? '受取済み' : '受け取る'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── 統計カード（累計受取・累計送金のみ）── */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard labelKey="total_received" value={data.totalReceived} icon={ArrowDownLeft} accent="up" />
        <StatCard labelKey="total_sent" value={data.totalSent} icon={ArrowUpRight} accent="down" />
      </div>

      {/* ── スキャンボタン（入出金履歴の上） ── */}
      {hasSolWallet && onScan && (
        <div className="flex justify-start">
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 h-8 text-xs"
            disabled={scanning}
            onClick={onScan}
          >
            <RefreshCw className={`size-3.5 ${scanning ? 'animate-spin' : ''}`} />
            スキャン
          </Button>
        </div>
      )}

      {/* ── 最近の履歴 ── */}
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
