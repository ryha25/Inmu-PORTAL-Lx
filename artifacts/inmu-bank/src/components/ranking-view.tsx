import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/lib/i18n/context'
import { formatInmu } from '@/lib/format'
import { Trophy, Star } from 'lucide-react'

type InmuRow   = { rank: number; userId: string; displayName: string; balance: number; totalReceived: number; participations: number }
type PointsRow = { rank: number; userId: string; displayName: string; points: number; participations: number }

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
}: {
  inmuRows: InmuRow[]
  pointsRows: PointsRow[]
}) {
  const { t } = useI18n()

  return (
    <Tabs defaultValue="inmu">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="inmu" className="gap-2">
          <Trophy className="size-3.5" />
          {t('ranking_inmu')}
        </TabsTrigger>
        <TabsTrigger value="points" className="gap-2">
          <Star className="size-3.5" />
          {t('ranking_points')}
        </TabsTrigger>
      </TabsList>

      {/* ── INMU保有ランキング ── */}
      <TabsContent value="inmu" className="flex flex-col gap-3">
        {inmuRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
        ) : inmuRows.map(r => (
          <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''}`}>
            <div className="flex items-center gap-3">
              <RankBadge rank={r.rank} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{r.displayName}</p>
                <p className="text-xs text-muted-foreground">{t('participations')}: {r.participations}</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-bold tabular-nums gold-text">{formatInmu(r.balance)}</p>
                <p className="text-xs text-muted-foreground">{t('total_received')}: {formatInmu(r.totalReceived)}</p>
              </div>
            </div>
          </Card>
        ))}
      </TabsContent>

      {/* ── ポイントランキング ── */}
      <TabsContent value="points" className="flex flex-col gap-3">
        {pointsRows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('no_data')}</p>
        ) : pointsRows.map(r => (
          <Card key={r.userId} className={`border-border bg-card p-3 ${r.rank <= 3 ? 'border-primary/40' : ''}`}>
            <div className="flex items-center gap-3">
              <RankBadge rank={r.rank} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{r.displayName}</p>
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
