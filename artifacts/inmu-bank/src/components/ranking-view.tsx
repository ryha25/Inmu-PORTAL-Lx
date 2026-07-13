import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { Trophy, Star, Medal } from 'lucide-react'

type InmuRow   = { rank: number; userId: string; displayName: string; balance: number; showBalance: boolean; totalReceived: number; participations: number }
type PointsRow = { rank: number; userId: string; displayName: string; points: number; participations: number }
type CompositeRow = { rank: number; userId: string; displayName: string; balance: number; points: number; events?: number; clears: number; score: number }

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

export function RankingView({
  inmuRows,
  pointsRows,
  compositeRows,
  myCompositeRank,
  myInmuRank,
  myPointsRank,
  totalUsers,
  currentUserId,
}: {
  inmuRows?: InmuRow[]
  pointsRows?: PointsRow[]
  compositeRows?: CompositeRow[]
  myCompositeRank: number | null
  myInmuRank: number | null
  myPointsRank: number | null
  totalUsers: number
  currentUserId?: string
}) {
  const { t } = useI18n()

  return (
    <Tabs defaultValue="composite">
      <TabsList className="grid w-full grid-cols-3 mb-4">
        <TabsTrigger value="composite" className="gap-1 text-xs">
          <Medal className="size-3.5" />
          総合
        </TabsTrigger>
        <TabsTrigger value="inmu" className="gap-1 text-xs">
          <Trophy className="size-3.5" />
          {t('ranking_inmu')}
        </TabsTrigger>
        <TabsTrigger value="points" className="gap-1 text-xs">
          <Star className="size-3.5" />
          {t('ranking_points')}
        </TabsTrigger>
      </TabsList>

      {/* ── 総合評価ランキング ── */}
      <TabsContent value="composite" className="flex flex-col gap-3">
        {/* あなたの順位 */}
        {myCompositeRank != null && (
          <Card className="border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Medal className="size-4 text-primary" />
                <p className="text-sm font-semibold">{t('your_rank')}</p>
              </div>
              <p className="font-mono font-bold text-lg gold-text">
                {myCompositeRank}
                <span className="ml-1 text-sm font-normal text-muted-foreground">{t('rank_out_of')} / {totalUsers}{t('rank_out_of_users')}</span>
              </p>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{t('composite_rank_desc')}</p>
          </Card>
        )}

        {(compositeRows ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
        ) : (compositeRows ?? []).map(r => (
          <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''} ${r.userId === currentUserId ? 'border-primary/60 bg-primary/5' : ''}`}>
            <div className="flex items-center gap-3">
              <RankBadge rank={r.rank} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{r.displayName}{r.userId === currentUserId ? ` (${t('you_label')})` : ''}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('clears_count')}: {r.clears}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] text-muted-foreground">{t('score_label')}</p>
                <p className="font-mono font-bold text-sm tabular-nums text-primary">{r.score.toFixed(1)}</p>
              </div>
            </div>
          </Card>
        ))}
      </TabsContent>

      {/* ── INMU保有ランキング ── */}
      <TabsContent value="inmu" className="flex flex-col gap-3">
        {/* あなたの順位 */}
        {myInmuRank != null && (
          <Card className="border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-primary" />
                <p className="text-sm font-semibold">{t('ranking_inmu_rank')}</p>
              </div>
              <p className="font-mono font-bold text-lg gold-text">
                {myInmuRank}
                <span className="ml-1 text-sm font-normal text-muted-foreground">{t('rank_out_of')} / {totalUsers}{t('rank_out_of_users')}</span>
              </p>
            </div>
          </Card>
        )}

        {(inmuRows ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
        ) : (inmuRows ?? []).map(r => (
          <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''} ${r.userId === currentUserId ? 'border-primary/60 bg-primary/5' : ''}`}>
            <div className="flex items-center gap-3">
              <RankBadge rank={r.rank} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{r.displayName}{r.userId === currentUserId ? ` (${t('you_label')})` : ''}</p>
                <p className="text-xs text-muted-foreground">{t('participations')}: {r.participations}</p>
              </div>
              <div className="text-right">
                {r.showBalance ? (
                  <div>
                    <p className="text-[9px] text-muted-foreground mb-0.5">{t('balance')}</p>
                    <p className={`max-w-[42vw] whitespace-nowrap font-mono font-bold tabular-nums gold-text ${rankingValueSize(r.balance)}`}>{formatInmu(r.balance)}</p>
                    <p className="max-w-[42vw] whitespace-nowrap text-[9px] text-muted-foreground mt-0.5">{t('cumulative_received')}: {formatInmu(r.totalReceived)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('hide')}</p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </TabsContent>

      {/* ── ポイントランキング ── */}
      <TabsContent value="points" className="flex flex-col gap-3">
        {/* あなたの順位 */}
        {myPointsRank != null && (
          <Card className="border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="size-4 text-primary" />
                <p className="text-sm font-semibold">{t('ranking_points_rank')}</p>
              </div>
              <p className="font-mono font-bold text-lg text-primary">
                {myPointsRank}
                <span className="ml-1 text-sm font-normal text-muted-foreground">{t('rank_out_of')} / {totalUsers}{t('rank_out_of_users')}</span>
              </p>
            </div>
          </Card>
        )}

        {(pointsRows ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
        ) : (pointsRows ?? []).map(r => (
          <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''} ${r.userId === currentUserId ? 'border-primary/60 bg-primary/5' : ''}`}>
            <div className="flex items-center gap-3">
              <RankBadge rank={r.rank} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{r.displayName}{r.userId === currentUserId ? ` (${t('you_label')})` : ''}</p>
                <p className="text-xs text-muted-foreground">{t('participations')}: {r.participations}</p>
              </div>
              <div className="text-right">
                <p className={`max-w-[42vw] whitespace-nowrap font-mono font-bold tabular-nums text-primary ${rankingValueSize(r.points)}`}>
                  {r.points.toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </TabsContent>
    </Tabs>
  )
}
