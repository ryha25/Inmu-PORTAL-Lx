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
                <span className="ml-1 text-sm font-normal text-muted-foreground">位 / {totalUsers}人</span>
              </p>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">INMU保有量・ポイント・ミッションクリア数を総合評価</p>
          </Card>
        )}

        {(compositeRows ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
        ) : (compositeRows ?? []).map(r => (
          <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''} ${r.userId === currentUserId ? 'border-primary/60 bg-primary/5' : ''}`}>
            <div className="flex items-center gap-3">
              <RankBadge rank={r.rank} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{r.displayName}{r.userId === currentUserId ? ' (あなた)' : ''}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  クリア数: {r.clears}件
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] text-muted-foreground">スコア</p>
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
                <p className="text-sm font-semibold">INMUランキング順位</p>
              </div>
              <p className="font-mono font-bold text-lg gold-text">
                {myInmuRank}
                <span className="ml-1 text-sm font-normal text-muted-foreground">位 / {totalUsers}人</span>
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
                <p className="truncate font-medium text-sm">{r.displayName}{r.userId === currentUserId ? ' (あなた)' : ''}</p>
                <p className="text-xs text-muted-foreground">{t('participations')}: {r.participations}</p>
              </div>
              <div className="text-right">
                {r.showBalance ? (
                  <div>
                    <p className="text-[9px] text-muted-foreground mb-0.5">現在残高</p>
                    <p className="font-mono font-bold tabular-nums gold-text">{formatInmu(r.balance)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">累計受取: {formatInmu(r.totalReceived)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">非公開</p>
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
                <p className="text-sm font-semibold">ポイントランキング順位</p>
              </div>
              <p className="font-mono font-bold text-lg text-primary">
                {myPointsRank}
                <span className="ml-1 text-sm font-normal text-muted-foreground">位 / {totalUsers}人</span>
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
                <p className="truncate font-medium text-sm">{r.displayName}{r.userId === currentUserId ? ' (あなた)' : ''}</p>
                <p className="text-xs text-muted-foreground">{t('participations')}: {r.participations}</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-bold tabular-nums text-primary">
                  {r.points.toLocaleString()}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">pts</span>
                </p>
              </div>
            </div>
          </Card>
        ))}
      </TabsContent>
    </Tabs>
  )
}
