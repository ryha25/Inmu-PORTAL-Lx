import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { TransactionTable, type TxRow } from '@/components/transaction-table'
import { PageHeader } from '@/components/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/lib/i18n/context'
import { useAuth } from '@/hooks/use-auth'
import { formatInmu } from '@/lib/format'
import { TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react'

type TradeRow = {
  id: number
  type: string
  tokenAmount: string
  txSignature: string
  dex: string | null
  tradedAt: string
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

export function HistoryPage() {
  const { t } = useI18n()
  const { profile, unread } = useAuth()
  const [rows, setRows] = useState<TxRow[]>([])
  const [txLoading, setTxLoading] = useState(true)
  const [buyTrades, setBuyTrades] = useState<TradeRow[]>([])
  const [sellTrades, setSellTrades] = useState<TradeRow[]>([])
  const [tradeLoading, setTradeLoading] = useState(false)
  const [tradesLoaded, setTradesLoaded] = useState(false)

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
      <PageHeader titleKey="nav_history" />
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
    </AppShell>
  )
}
