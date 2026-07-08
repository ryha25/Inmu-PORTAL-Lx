import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { TransactionTable, type TxRow } from '@/components/transaction-table'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
import { formatInmu } from '@/lib/format'
import { TrendingUp, TrendingDown, ArrowUpDown, ShoppingCart, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

type TradeRow = {
  id: number
  type: string
  tokenAmount: string
  txSignature: string
  dex: string | null
  tradedAt: string
}

type PurchaseRequest = {
  id: number
  amount: string
  txHash: string | null
  comment: string | null
  status: string
  rebateAmount: string | null
  rebateRate: string | null
  adminNote: string | null
  rebateTxSignature: string | null
  createdAt: string
}

type PurchaseRequestsData = {
  requests: PurchaseRequest[]
  totalBought: number        // 購入済み枚数（キャップ適用後）
  monthlyBought: number      // 当月の実購入合計
  monthlyCapacity: number    // 今月の反映上限 = 通常日上限 × 月日数
  totalApplied: number       // 今月の申請済み
  available: number
  remainingDays: number      // サイクル残り日数
  remainingMonthlyCapacity: number  // 今月の申請可能残り上限 = 残り日数 × 1日上限
  dailyLimit: number
  dailyUsed: number
  dailyRemaining: number
  isEventMode: boolean
  effectiveLimit: number
  baseRebateRate: number
  petRebateBonuses: { source: 'level_reward' | 'skill'; label: string; rate: number; eventOnly: boolean }[]
  petRebateBonusRate: number
  totalRebateRate: number
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:  { label: '審査中',   color: 'text-yellow-500' },
  approved: { label: '承認済み', color: 'text-green-500' },
  rejected: { label: '却下',     color: 'text-destructive' },
}

function TradeList({ rows, loading, emptyMsg }: { rows: TradeRow[]; loading: boolean; emptyMsg: string }) {
  const { t } = useI18n()
  if (loading) return <div className="py-20 text-center text-muted-foreground">{t('loading')}</div>
  if (rows.length === 0) return (
    <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-lg">
      {emptyMsg}
    </div>
  )
  return (
    <div className="flex flex-col gap-2">
      {rows.map(row => {
        const isBuy = row.type === 'buy'
        return (
          <div key={row.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                {isBuy
                  ? <TrendingUp className="size-3.5 text-green-500" />
                  : <TrendingDown className="size-3.5 text-red-500" />}
                <span className={`text-xs font-semibold ${isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {isBuy ? '購入' : '売却'}
                </span>
                {row.dex && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{row.dex}</span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {new Date(row.tradedAt).toLocaleString('ja-JP')}
              </span>
              <a
                href={`https://solscan.io/tx/${row.txSignature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary/70 hover:text-primary font-mono truncate max-w-[180px]"
              >
                {row.txSignature.slice(0, 16)}…
              </a>
            </div>
            <span className={`font-mono font-bold text-sm shrink-0 ${isBuy ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {isBuy ? '+' : '-'}{formatInmu(row.tokenAmount)} INMU
            </span>
          </div>
        )
      })}
    </div>
  )
}

function PurchaseRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([])
  const [totalBought,      setTotalBought]      = useState<number>(0)
  const [monthlyCapacity,  setMonthlyCapacity]  = useState<number>(0)
  const [totalApplied,     setTotalApplied]     = useState<number>(0)
  const [available,        setAvailable]        = useState<number>(0)
  const [remainingDays,              setRemainingDays]              = useState<number>(0)
  const [remainingMonthlyCapacity,   setRemainingMonthlyCapacity]   = useState<number>(0)
  const [dailyLimit,       setDailyLimit]       = useState<number>(300000)
  const [dailyUsed,        setDailyUsed]        = useState<number>(0)
  const [dailyRemaining,   setDailyRemaining]   = useState<number>(300000)
  const [isEventMode,      setIsEventMode]      = useState<boolean>(false)
  const [effectiveLimit,   setEffectiveLimit]   = useState<number>(300000)
  const [baseRebateRate,     setBaseRebateRate]     = useState<number>(0)
  const [petRebateBonuses,   setPetRebateBonuses]   = useState<{ source: 'level_reward' | 'skill'; label: string; rate: number; eventOnly: boolean }[]>([])
  const [petRebateBonusRate, setPetRebateBonusRate] = useState<number>(0)
  const [totalRebateRate,    setTotalRebateRate]    = useState<number>(0)
  const [prAmount,  setPrAmount]  = useState('')
  const [prTxHash,  setPrTxHash]  = useState('')
  const [prComment, setPrComment] = useState('')
  const [prBusy,    setPrBusy]    = useState(false)

  const loadPurchaseRequests = useCallback(() => {
    fetch('/api/purchase-requests', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: PurchaseRequestsData | null) => {
        if (d) {
          setPurchaseRequests(d.requests ?? [])
          setTotalBought(d.totalBought ?? 0)
          setMonthlyCapacity(d.monthlyCapacity ?? 0)
          setTotalApplied(d.totalApplied ?? 0)
          setAvailable(d.available ?? 0)
          setRemainingDays(d.remainingDays ?? 0)
          setRemainingMonthlyCapacity(d.remainingMonthlyCapacity ?? 0)
          setDailyLimit(d.dailyLimit ?? 300000)
          setDailyUsed(d.dailyUsed ?? 0)
          setDailyRemaining(d.dailyRemaining ?? 300000)
          setIsEventMode(d.isEventMode ?? false)
          setEffectiveLimit(d.effectiveLimit ?? 0)
          setBaseRebateRate(d.baseRebateRate ?? 0)
          setPetRebateBonuses(d.petRebateBonuses ?? [])
          setPetRebateBonusRate(d.petRebateBonusRate ?? 0)
          setTotalRebateRate(d.totalRebateRate ?? 0)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (open) loadPurchaseRequests()
  }, [open, loadPurchaseRequests])

  async function submitPurchaseRequest() {
    const num = Number(prAmount)
    if (!prAmount || isNaN(num) || num <= 0) {
      toast.error('有効な枚数を入力してください')
      return
    }
    setPrBusy(true)
    try {
      const res = await fetch('/api/purchase-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: num, txHash: prTxHash || null, comment: prComment || null }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error ?? 'エラーが発生しました')
      } else {
        toast.success('購入申請を送信しました')
        setPrAmount('')
        setPrTxHash('')
        setPrComment('')
        loadPurchaseRequests()
      }
    } catch { toast.error('通信エラーが発生しました') }
    finally { setPrBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-primary" />
            購入枚数申請
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">新規申請</p>
              {isEventMode && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 font-medium">
                  🎪 イベントモード
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1 rounded-lg bg-secondary/30 p-3">
              {/* 今月の購入枚数ブロック */}
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">今月の購入枚数</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">購入済み枚数（反映分）</p>
                  <p className="font-mono text-sm font-bold">{totalBought.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">今月の反映上限</p>
                  <p className="font-mono text-sm font-bold text-muted-foreground">{monthlyCapacity.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">今月の申請済み</p>
                  <p className="font-mono text-sm font-bold text-yellow-500">{totalApplied.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">今月の申請可能残り（残り{remainingDays}日分）</p>
                  <p className="font-mono text-sm font-bold text-green-500">{remainingMonthlyCapacity.toLocaleString()}</p>
                </div>
              </div>
              {/* 本日の申請状況ブロック */}
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">本日の申請状況</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">本日の1日上限</p>
                  <p className="font-mono text-sm font-bold">{dailyLimit.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">本日申請済み</p>
                  <p className="font-mono text-sm font-bold text-yellow-500">{dailyUsed.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">本日残り申請可能</p>
                  <p className="font-mono text-sm font-bold text-green-500">{dailyRemaining.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">今日申請可能な最大枚数</p>
              <p className="font-mono text-lg font-bold text-primary">{effectiveLimit.toLocaleString()} INMU</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                ＝ 本日残り（{dailyRemaining.toLocaleString()}）と今月の申請可能残り（{remainingMonthlyCapacity.toLocaleString()}）の少ない方
              </p>
            </div>

            <div className="rounded-lg bg-secondary/30 p-3 flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground">現在適用中の還元率</p>
              <p className="font-mono text-lg font-bold text-green-500">{totalRebateRate.toFixed(1)}%</p>
              <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>{isEventMode ? 'イベント基本還元率' : '通常基本還元率'}</span>
                  <span className="font-mono">{baseRebateRate.toFixed(1)}%</span>
                </div>
                {petRebateBonuses.map((bonus, idx) => (
                  <div key={`${bonus.label}-${idx}`} className="flex items-center justify-between">
                    <span>{bonus.label}</span>
                    <span className="font-mono text-primary">+{bonus.rate.toFixed(1)}%</span>
                  </div>
                ))}
                {petRebateBonusRate > 0 && (
                  <div className="flex items-center justify-between font-semibold">
                    <span>PET還元ボーナス合計</span>
                    <span className="font-mono text-primary">+{petRebateBonusRate.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">購入枚数（INMU）*</Label>
              <Input
                type="number"
                placeholder={`最大 ${effectiveLimit.toLocaleString()}`}
                value={prAmount}
                onChange={e => setPrAmount(e.target.value)}
                min="1"
                className="min-h-10"
              />
              {prAmount && Number(prAmount) > effectiveLimit && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <XCircle className="size-3" />
                  申請可能枚数（{effectiveLimit.toLocaleString()} INMU）を超えています
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">取引TxHash（任意）</Label>
              <Input
                placeholder="Solanaトランザクション署名"
                value={prTxHash}
                onChange={e => setPrTxHash(e.target.value)}
                className="min-h-10 font-mono text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">コメント（任意）</Label>
              <Input
                placeholder="申請に関するメモ"
                value={prComment}
                onChange={e => setPrComment(e.target.value)}
                className="min-h-10"
              />
            </div>

            <Button
              onClick={submitPurchaseRequest}
              disabled={prBusy || !prAmount || Number(prAmount) <= 0 || Number(prAmount) > effectiveLimit}
              className="min-h-10"
            >
              {prBusy ? '送信中…' : '申請を送信'}
            </Button>
          </div>

          {purchaseRequests.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">申請履歴</p>
              {purchaseRequests.map(pr => {
                const s = STATUS_LABEL[pr.status] ?? { label: pr.status, color: 'text-muted-foreground' }
                return (
                  <div key={pr.id} className="rounded-lg border border-border bg-secondary/20 p-3 flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold">
                        {Number(pr.amount).toLocaleString()} INMU
                      </span>
                      <span className={`text-xs font-medium flex items-center gap-1 ${s.color}`}>
                        {pr.status === 'pending'  && <Clock className="size-3" />}
                        {pr.status === 'approved' && <CheckCircle2 className="size-3" />}
                        {pr.status === 'rejected' && <XCircle className="size-3" />}
                        {s.label}
                      </span>
                    </div>
                    {pr.status === 'approved' && pr.rebateAmount && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        還元: {Number(pr.rebateAmount).toLocaleString()} INMU
                        {pr.rebateRate && ` (${Number(pr.rebateRate)}%)`}
                      </p>
                    )}
                    {pr.adminNote && (
                      <p className="text-xs text-muted-foreground">メモ: {pr.adminNote}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(pr.createdAt).toLocaleString('ja-JP')}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {purchaseRequests.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">申請履歴がありません</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function HistoryPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [rows, setRows] = useState<TxRow[]>([])
  const [txLoading, setTxLoading] = useState(true)
  const [buyTrades, setBuyTrades] = useState<TradeRow[]>([])
  const [sellTrades, setSellTrades] = useState<TradeRow[]>([])
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradesLoaded, setTradesLoaded] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)

  useEffect(() => {
    fetch('/api/transactions', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setRows(data); setTxLoading(false) })
      .catch(() => setTxLoading(false))
  }, [])

  const loadTrades = useCallback(() => {
    if (tradesLoaded) return
    setTradeLoading(true)
    Promise.all([
      fetch('/api/trade-history?type=buy&limit=100', { credentials: 'include' }).then(r => r.json()).catch(() => []),
      fetch('/api/trade-history?type=sell&limit=100', { credentials: 'include' }).then(r => r.json()).catch(() => []),
    ]).then(([buys, sells]) => {
      setBuyTrades(Array.isArray(buys) ? buys : [])
      setSellTrades(Array.isArray(sells) ? sells : [])
      setTradesLoaded(true)
    }).finally(() => setTradeLoading(false))
  }, [tradesLoaded])

  return (
    <AppShell isAdmin={profile?.role === 'admin'} displayName={profile?.displayName ?? ''} unread={unread}>
      <PageHeader titleKey="nav_history">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs shrink-0"
          onClick={() => setPurchaseOpen(true)}
        >
          <ShoppingCart className="size-3.5" />
          購入申請
        </Button>
      </PageHeader>
      <Tabs defaultValue="transactions">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="transactions" className="gap-1.5">
            <ArrowUpDown className="size-3" />
            入出金
          </TabsTrigger>
          <TabsTrigger value="buy" className="gap-1.5" onClick={loadTrades}>
            <TrendingUp className="size-3" />
            購入
          </TabsTrigger>
          <TabsTrigger value="sell" className="gap-1.5" onClick={loadTrades}>
            <TrendingDown className="size-3" />
            売却
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          {txLoading
            ? <div className="py-20 text-center text-muted-foreground">{t('loading')}</div>
            : <TransactionTable rows={rows} />}
        </TabsContent>

        <TabsContent value="buy">
          <TradeList
            rows={buyTrades}
            loading={tradeLoading}
            emptyMsg="購入履歴がありません。ダッシュボードからスキャンしてください。"
          />
        </TabsContent>

        <TabsContent value="sell">
          <TradeList
            rows={sellTrades}
            loading={tradeLoading}
            emptyMsg="売却履歴がありません。ダッシュボードからスキャンしてください。"
          />
        </TabsContent>
      </Tabs>

      <PurchaseRequestDialog open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
    </AppShell>
  )
}
