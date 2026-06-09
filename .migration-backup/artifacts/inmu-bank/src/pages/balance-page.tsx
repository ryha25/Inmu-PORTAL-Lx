import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
import { formatInmu } from '@/lib/format'
import { toast } from 'sonner'
import { Coins, PiggyBank, Lock, Unlock, ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react'

type BalanceData = {
  balance: number
  savingsBalance: number
  totalReceived: number
  totalSent: number
}

type JarRow = {
  id: number
  name: string
  balance: string
  isLocked: boolean
  lockDays: number | null
  unlockDate: string | null
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error((d as { error?: string }).error ?? 'Error')
  }
  return res.json()
}

const LOCK_PERIODS = [30, 90, 180, 365] as const

export function BalancePage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [data, setData] = useState<BalanceData | null>(null)
  const [jars, setJars] = useState<JarRow[]>([])
  const [loading, setLoading] = useState(false)

  // Savings controls
  const [toSavings, setToSavings] = useState('')
  const [fromSavings, setFromSavings] = useState('')

  // Lock controls
  const [lockAmount, setLockAmount] = useState('')
  const [lockDays, setLockDays] = useState<30 | 90 | 180 | 365>(30)

  const load = useCallback(async () => {
    const [balRes, jarsRes] = await Promise.all([
      fetch('/api/balance', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/jars', { credentials: 'include' }).then(r => r.json()),
    ])
    setData(balRes)
    setJars(Array.isArray(jarsRes) ? jarsRes : [])
  }, [])

  useEffect(() => { load() }, [load])

  const lockedJars = jars.filter(j => j.isLocked)
  const lockedTotal = lockedJars.reduce((s, j) => s + Number(j.balance), 0)

  function isExpired(jar: JarRow): boolean {
    if (!jar.isLocked || !jar.unlockDate) return false
    return new Date(jar.unlockDate) <= new Date()
  }

  async function withLoading(fn: () => Promise<void>) {
    setLoading(true)
    try {
      await fn()
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_balance" />

      {!data ? (
        <div className="py-20 text-center text-muted-foreground">{t('loading')}</div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* ── 3残高カード ── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="size-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground">通常残高</p>
              </div>
              <p className="font-mono text-2xl font-bold tabular-nums gold-text">{formatInmu(data.balance)}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <PiggyBank className="size-4 text-accent" />
                <p className="text-xs font-medium text-muted-foreground">{t('savings_title')}</p>
              </div>
              <p className="font-mono text-2xl font-bold tabular-nums">{formatInmu(data.savingsBalance)}</p>
            </Card>
            <Card className="border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="size-4 text-chart-4" />
                <p className="text-xs font-medium text-muted-foreground">ロック残高</p>
              </div>
              <p className="font-mono text-2xl font-bold tabular-nums text-chart-4">{formatInmu(lockedTotal)}</p>
              {lockedJars.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1">{lockedJars.length}件のロック中</p>
              )}
            </Card>
          </div>

          {/* ── 貯蓄操作 ── */}
          <Card className="border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <PiggyBank className="size-4 text-accent" />
              <h3 className="font-semibold text-sm">{t('savings_title')}</h3>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="数量 (INMU)"
                  value={toSavings}
                  onChange={e => setToSavings(e.target.value)}
                  className="min-h-11 flex-1"
                />
                <Button
                  onClick={() => withLoading(async () => {
                    await api('/balance/move-to-savings', 'POST', { amount: Number(toSavings) })
                    setToSavings('')
                  })}
                  disabled={loading || !toSavings}
                  className="min-h-11 gap-1.5 whitespace-nowrap"
                >
                  <ArrowDownLeft className="size-4" />
                  {t('move_to_savings')}
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="数量 (INMU)"
                  value={fromSavings}
                  onChange={e => setFromSavings(e.target.value)}
                  className="min-h-11 flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => withLoading(async () => {
                    await api('/balance/move-from-savings', 'POST', { amount: Number(fromSavings) })
                    setFromSavings('')
                  })}
                  disabled={loading || !fromSavings}
                  className="min-h-11 gap-1.5 whitespace-nowrap"
                >
                  <ArrowUpRight className="size-4" />
                  {t('move_from_savings')}
                </Button>
              </div>
            </div>
          </Card>

          {/* ── ロック機能 ── */}
          <Card className="border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="size-4 text-chart-4" />
              <h3 className="font-semibold text-sm">ロック機能</h3>
            </div>

            <div className="flex flex-col gap-3">
              <Input
                type="number"
                placeholder="ロック数量 (INMU)"
                value={lockAmount}
                onChange={e => setLockAmount(e.target.value)}
                className="min-h-11"
              />

              <div className="grid grid-cols-4 gap-2">
                {LOCK_PERIODS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setLockDays(d)}
                    className={`min-h-10 rounded-lg border text-xs font-medium transition-colors ${
                      lockDays === d
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {d}日
                  </button>
                ))}
              </div>

              <Button
                onClick={() => withLoading(async () => {
                  await api('/balance/lock', 'POST', { amount: Number(lockAmount), days: lockDays })
                  setLockAmount('')
                  toast.success(`${lockAmount} INMU を ${lockDays}日間ロックしました`)
                })}
                disabled={loading || !lockAmount}
                className="min-h-11 gap-2"
              >
                <Lock className="size-4" />
                {lockDays}日ロック
              </Button>
            </div>
          </Card>

          {/* ── ロック中リスト ── */}
          {lockedJars.length > 0 && (
            <Card className="border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ロック中のINMU</p>
              </div>
              <ul>
                {lockedJars.map((jar, i) => {
                  const expired = isExpired(jar)
                  const unlockDateStr = jar.unlockDate
                    ? new Date(jar.unlockDate).toLocaleDateString('ja-JP')
                    : '—'
                  return (
                    <li key={jar.id} className={i > 0 ? 'border-t border-border' : ''}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{jar.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {expired
                              ? <span className="text-chart-5">✓ 解除可能</span>
                              : `解除予定日: ${unlockDateStr}`}
                          </p>
                        </div>
                        <p className="font-mono text-sm font-bold tabular-nums shrink-0">
                          {formatInmu(Number(jar.balance))}
                        </p>
                        <Button
                          size="sm"
                          variant={expired ? 'default' : 'ghost'}
                          disabled={loading || (!expired && jar.isLocked)}
                          onClick={() => withLoading(async () => {
                            await api(`/jars/${jar.id}/unlock`, 'POST')
                            toast.success('ロック解除・残高に戻しました')
                          })}
                          className="min-h-9 shrink-0 gap-1.5"
                        >
                          {expired
                            ? <><CheckCircle2 className="size-3" />解除</>
                            : <><Unlock className="size-3" />ロック中</>}
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

        </div>
      )}
    </AppShell>
  )
}
