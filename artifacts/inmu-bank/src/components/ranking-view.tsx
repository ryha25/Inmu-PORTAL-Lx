import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { BarChart3, CalendarDays, Layers, Medal, Send, Sparkles, Star, Trophy } from 'lucide-react'

type InmuRow = { rank: number; userId: string; displayName: string; balance: number; showBalance: boolean; totalReceived: number; participations: number }
type PointsRow = { rank: number; userId: string; displayName: string; points: number; participations: number }
type CompositeRow = { rank: number; userId: string; displayName: string; balance: number; points: number; events?: number; clears: number; score: number }
export type MonthlyVolumeRow = {
  rank: number
  userId: string
  displayName: string
  solWallet?: string | null
  buyUsd: number
  sellUsd: number
  totalVolumeUsd: number
  estimatedDevFeeUsd: number
  airdropUsd: number
  estimatedInmuAmount: number
}
export type MonthlyVolumeSeason = { label: string; start: string; end: string; resetRule: string }

function RankBadge({ rank }: { rank: number }) {
  return (
    <div className={`flex size-8 shrink-0 items-center justify-center rounded-full font-bold ${
      rank === 1 ? 'bg-yellow-500/20 text-yellow-500' :
      rank === 2 ? 'bg-slate-400/20 text-slate-400' :
      rank === 3 ? 'bg-amber-600/20 text-amber-600' :
      'bg-primary/10 text-primary'
    }`}>
      {rank <= 3 ? <Trophy className="size-4" /> : <span className="text-xs">{rank}</span>}
    </div>
  )
}

function rankingValueSize(value: number) {
  const length = Math.abs(Math.trunc(value)).toLocaleString().length
  if (length >= 16) return 'text-[9px]'
  if (length >= 13) return 'text-[10px]'
  if (length >= 10) return 'text-xs'
  return 'text-sm'
}

function formatUsd(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: value >= 100 ? 0 : 2 })
}

function EmptyRanking({ label }: { label: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{label}</p>
}

export function RankingView({
  inmuRows,
  pointsRows,
  compositeRows,
  monthlyVolumeRows,
  monthlyVolumeSeason,
  monthlyVolumeFormula,
  myCompositeRank,
  myInmuRank,
  myPointsRank,
  totalUsers,
  currentUserId,
  isAdmin = false,
  onMonthlyVolumeBulkSend,
  monthlyVolumeBulkSending = false,
}: {
  inmuRows?: InmuRow[]
  pointsRows?: PointsRow[]
  compositeRows?: CompositeRow[]
  monthlyVolumeRows?: MonthlyVolumeRow[]
  monthlyVolumeSeason?: MonthlyVolumeSeason | null
  monthlyVolumeFormula?: string
  myCompositeRank: number | null
  myInmuRank: number | null
  myPointsRank: number | null
  totalUsers: number
  currentUserId?: string
  isAdmin?: boolean
  onMonthlyVolumeBulkSend?: (rows: MonthlyVolumeRow[]) => Promise<void>
  monthlyVolumeBulkSending?: boolean
}) {
  const { t } = useI18n()

  return (
    <Tabs defaultValue="cumulative" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 gap-1 bg-muted/40 p-1">
        <TabsTrigger value="cumulative" className="gap-1 text-xs"><Layers className="size-3.5" />累計</TabsTrigger>
        <TabsTrigger value="monthly" className="gap-1 text-xs"><CalendarDays className="size-3.5" />月間</TabsTrigger>
        <TabsTrigger value="event" className="gap-1 text-xs"><Sparkles className="size-3.5" />イベント</TabsTrigger>
        <TabsTrigger value="other" className="gap-1 text-xs"><BarChart3 className="size-3.5" />その他</TabsTrigger>
      </TabsList>

      <TabsContent value="cumulative">
        <Tabs defaultValue="composite" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="composite" className="gap-1 text-xs"><Medal className="size-3.5" />総合</TabsTrigger>
            <TabsTrigger value="inmu" className="gap-1 text-xs"><Trophy className="size-3.5" />{t('ranking_inmu')}</TabsTrigger>
            <TabsTrigger value="points" className="gap-1 text-xs"><Star className="size-3.5" />{t('ranking_points')}</TabsTrigger>
          </TabsList>

          <TabsContent value="composite" className="flex flex-col gap-3">
            {myCompositeRank != null && (
              <Card className="border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Medal className="size-4 text-primary" /><p className="text-sm font-semibold">{t('your_rank')}</p></div>
                  <p className="font-mono text-lg font-bold gold-text">{myCompositeRank}<span className="ml-1 text-sm font-normal text-muted-foreground">{t('rank_out_of')} / {totalUsers}{t('rank_out_of_users')}</span></p>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">{t('composite_rank_desc')}</p>
              </Card>
            )}
            {(compositeRows ?? []).length === 0 ? <EmptyRanking label={t('no_data')} /> : (compositeRows ?? []).map(r => (
              <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''} ${r.userId === currentUserId ? 'border-primary/60 bg-primary/5' : ''}`}>
                <div className="flex items-center gap-3">
                  <RankBadge rank={r.rank} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.displayName}{r.userId === currentUserId ? ` (${t('you_label')})` : ''}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{t('clears_count')}: {r.clears}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[9px] text-muted-foreground">{t('score_label')}</p>
                    <p className="font-mono text-sm font-bold tabular-nums text-primary">{r.score.toFixed(1)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="inmu" className="flex flex-col gap-3">
            {myInmuRank != null && (
              <Card className="border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Trophy className="size-4 text-primary" /><p className="text-sm font-semibold">{t('ranking_inmu_rank')}</p></div>
                  <p className="font-mono text-lg font-bold gold-text">{myInmuRank}<span className="ml-1 text-sm font-normal text-muted-foreground">{t('rank_out_of')} / {totalUsers}{t('rank_out_of_users')}</span></p>
                </div>
              </Card>
            )}
            {(inmuRows ?? []).length === 0 ? <EmptyRanking label={t('no_data')} /> : (inmuRows ?? []).map(r => (
              <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''} ${r.userId === currentUserId ? 'border-primary/60 bg-primary/5' : ''}`}>
                <div className="flex items-center gap-3">
                  <RankBadge rank={r.rank} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.displayName}{r.userId === currentUserId ? ` (${t('you_label')})` : ''}</p>
                    <p className="text-xs text-muted-foreground">{t('participations')}: {r.participations}</p>
                  </div>
                  <div className="text-right">
                    {r.showBalance ? (
                      <div>
                        <p className="mb-0.5 text-[9px] text-muted-foreground">{t('balance')}</p>
                        <p className={`max-w-[42vw] whitespace-nowrap font-mono font-bold tabular-nums gold-text ${rankingValueSize(r.balance)}`}>{formatInmu(r.balance)}</p>
                        <p className="mt-0.5 max-w-[42vw] whitespace-nowrap text-[9px] text-muted-foreground">{t('cumulative_received')}: {formatInmu(r.totalReceived)}</p>
                      </div>
                    ) : <p className="text-xs text-muted-foreground">{t('hide')}</p>}
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="points" className="flex flex-col gap-3">
            {myPointsRank != null && (
              <Card className="border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Star className="size-4 text-primary" /><p className="text-sm font-semibold">{t('ranking_points_rank')}</p></div>
                  <p className="font-mono text-lg font-bold text-primary">{myPointsRank}<span className="ml-1 text-sm font-normal text-muted-foreground">{t('rank_out_of')} / {totalUsers}{t('rank_out_of_users')}</span></p>
                </div>
              </Card>
            )}
            {(pointsRows ?? []).length === 0 ? <EmptyRanking label={t('no_data')} /> : (pointsRows ?? []).map(r => (
              <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''} ${r.userId === currentUserId ? 'border-primary/60 bg-primary/5' : ''}`}>
                <div className="flex items-center gap-3">
                  <RankBadge rank={r.rank} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.displayName}{r.userId === currentUserId ? ` (${t('you_label')})` : ''}</p>
                    <p className="text-xs text-muted-foreground">{t('participations')}: {r.participations}</p>
                  </div>
                  <div className="text-right">
                    <p className={`max-w-[42vw] whitespace-nowrap font-mono font-bold tabular-nums text-primary ${rankingValueSize(r.points)}`}>
                      {r.points.toLocaleString()}<span className="ml-1 text-xs font-normal text-muted-foreground">pts</span>
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="monthly">
        <Tabs defaultValue="volume" className="space-y-4">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="volume" className="gap-1 text-xs"><BarChart3 className="size-3.5" />月間取引高ランキング</TabsTrigger>
          </TabsList>
          <TabsContent value="volume" className="flex flex-col gap-3">
            <Card className="border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">月間取引高ランキング</p>
                  <p className="mt-1">{monthlyVolumeFormula ?? '報酬計算式：取引高（USD）÷150×10%'}</p>
                  {monthlyVolumeSeason && <p className="mt-1">集計リセット：{monthlyVolumeSeason.resetRule}</p>}
                </div>
                {isAdmin && onMonthlyVolumeBulkSend && (
                  <Button
                    size="sm"
                    className="h-8 shrink-0 gap-1 text-xs"
                    disabled={monthlyVolumeBulkSending || (monthlyVolumeRows ?? []).length === 0}
                    onClick={() => onMonthlyVolumeBulkSend(monthlyVolumeRows ?? [])}
                  >
                    <Send className="size-3.5" />
                    {monthlyVolumeBulkSending ? '送金中...' : 'まとめて送金'}
                  </Button>
                )}
              </div>
            </Card>
            {(monthlyVolumeRows ?? []).length === 0 ? <EmptyRanking label={t('no_data')} /> : (monthlyVolumeRows ?? []).map(r => (
              <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''} ${r.userId === currentUserId ? 'border-primary/60 bg-primary/5' : ''}`}>
                <div className="flex items-start gap-3">
                  <RankBadge rank={r.rank} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.displayName}{r.userId === currentUserId ? ` (${t('you_label')})` : ''}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">購入 {formatUsd(r.buyUsd)} / 売却 {formatUsd(r.sellUsd)}</p>
                    {isAdmin && (
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                        <span>推定Dev Fee {formatUsd(r.estimatedDevFeeUsd)}</span>
                        <span>還元予定 {formatUsd(r.airdropUsd)}</span>
                        <span className="col-span-2">配布予定 {formatInmu(r.estimatedInmuAmount)} INMU</span>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[9px] text-muted-foreground">月間取引高</p>
                    <p className="font-mono text-sm font-bold tabular-nums text-primary">{formatUsd(r.totalVolumeUsd)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="event"><EmptyRanking label="イベントランキングは今後追加予定です" /></TabsContent>
      <TabsContent value="other"><EmptyRanking label="その他のランキングは今後追加予定です" /></TabsContent>
    </Tabs>
  )
}
